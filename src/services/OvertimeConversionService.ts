import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth } from "date-fns";
import type { OvertimeConversion, OvertimeConversionSettings, OvertimeConversionCalculation } from "@/types/overtime-conversion";

export class OvertimeConversionService {
  /**
   * Helper method to normalize month string to YYYY-MM-DD format
   */
  private static normalizeMonth(month: string): string {
    // Handle both "YYYY-MM" and "YYYY-MM-DD" formats
    if (month.length === 7) { // YYYY-MM format
      return format(startOfMonth(new Date(month + '-01')), 'yyyy-MM-dd');
    }
    return format(startOfMonth(new Date(month)), 'yyyy-MM-dd');
  }

  /**
   * Get effective overtime conversion settings for a user at a specific date
   */
  static async getEffectiveConversionSettings(
    userId: string, 
    date: string
  ): Promise<OvertimeConversionSettings | null> {
    const normalizedDate = this.normalizeMonth(date);
    
    // Get employee-specific settings first
    const { data: employeeSettings, error: employeeError } = await supabase
      .from('employee_settings')
      .select('enable_overtime_conversion, overtime_conversion_rate, overtime_conversion_limit')
      .eq('user_id', userId)
      .lte('valid_from', normalizedDate)
      .or(`valid_to.is.null,valid_to.gt.${encodeURIComponent(normalizedDate)}`)
      .order('valid_from', { ascending: false })
      .maybeSingle();

    if (employeeError) {
      console.error('Error fetching employee settings:', employeeError);
    }

    // Get user's company_id first
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('user_id', userId)
      .single();

    if (profileError) {
      console.error('Error fetching user profile:', profileError);
    }

    if (!profile?.company_id) return null;

    // Get company settings as fallback
    const { data: companySettings, error: companyError } = await supabase
      .from('company_settings')
      .select('enable_overtime_conversion, default_overtime_conversion_rate, default_overtime_conversion_limit')
      .eq('company_id', profile.company_id)
      .maybeSingle();

    if (companyError) {
      console.error('Error fetching company settings:', companyError);
    }

    if (!companySettings?.enable_overtime_conversion) {
      return null; // Conversion disabled at company level
    }

    return {
      enable_overtime_conversion: employeeSettings?.enable_overtime_conversion ?? companySettings?.enable_overtime_conversion ?? false,
      overtime_conversion_rate: employeeSettings?.overtime_conversion_rate ?? companySettings.default_overtime_conversion_rate ?? 12.00,
      overtime_conversion_limit: employeeSettings?.overtime_conversion_limit ?? companySettings.default_overtime_conversion_limit
    };
  }

  /**
   * Calculate automatic conversion for a user in a specific month
   */
  static async calculateAutomaticConversion(
    userId: string, 
    month: string, 
    totalOvertimeHours: number
  ): Promise<{ hours: number; amount: number }> {
    const normalizedMonth = this.normalizeMonth(month);
    const settings = await this.getEffectiveConversionSettings(userId, normalizedMonth);
    
    if (!settings?.enable_overtime_conversion) {
      return { hours: 0, amount: 0 };
    }

    // If user has a custom limit set, respect it absolutely
    // Only convert hours that EXCEED the limit (not up to the limit)
    if (settings.overtime_conversion_limit) {
      const conversionHours = Math.max(0, totalOvertimeHours - settings.overtime_conversion_limit);
      const conversionAmount = conversionHours * settings.overtime_conversion_rate;
      return { hours: conversionHours, amount: conversionAmount };
    }

    // Fallback: if no limit is set, don't convert anything automatically
    return { hours: 0, amount: 0 };
  }

  /**
   * Get or create overtime conversion record for a user/month
   */
  static async getOrCreateConversion(
    userId: string, 
    month: string
  ): Promise<OvertimeConversion | null> {
    const monthStart = this.normalizeMonth(month);
    
    // Try to get existing record with explicit field selection
    const { data: existing } = await supabase
      .from('employee_overtime_conversions')
      .select('id, user_id, company_id, month, automatic_conversion_hours, manual_conversion_hours, total_conversion_hours, conversion_amount, notes, created_at, updated_at, created_by, updated_by')
      .eq('user_id', userId)
      .eq('month', monthStart)
      .maybeSingle();

    if (existing) {
      return existing;
    }

    // Get company_id for the user
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('user_id', userId)
      .single();

    if (profileError) {
      console.error('Error fetching user profile for conversion creation:', profileError);
    }

    if (!profile) return null;

    // Create new record
    const { data: newRecord } = await supabase
      .from('employee_overtime_conversions')
      .insert({
        user_id: userId,
        company_id: profile.company_id,
        month: monthStart,
        automatic_conversion_hours: 0,
        manual_conversion_hours: 0,
        conversion_amount: 0,
        created_by: userId
      })
      .select()
      .single();

    return newRecord;
  }

  /**
   * Apply manual conversion adjustment (positive for conversion, negative for de-conversion)
   */
  static async applyManualConversion(
    userId: string, 
    month: string, 
    deltaHours: number, 
    notes?: string
  ): Promise<boolean> {
    try {
      const normalizedMonth = this.normalizeMonth(month);
      
      // Get or create conversion record
      const conversion = await this.getOrCreateConversion(userId, normalizedMonth);
      if (!conversion) return false;

      // Get conversion settings
      const settings = await this.getEffectiveConversionSettings(userId, normalizedMonth);
      if (!settings?.enable_overtime_conversion) return false;

      // Calculate new manual conversion hours (current + delta)
      const newManualHours = Math.max(0, conversion.manual_conversion_hours + deltaHours);
      const newAmount = (conversion.automatic_conversion_hours + newManualHours) * settings.overtime_conversion_rate;

      // Update the conversion record (exclude total_conversion_hours as it's a generated column)
      const { error } = await supabase
        .from('employee_overtime_conversions')
        .update({
          manual_conversion_hours: newManualHours,
          conversion_amount: newAmount,
          notes,
          updated_by: (await supabase.auth.getUser()).data.user?.id ?? userId,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversion.id);

      return !error;
    } catch (error) {
      console.error('Error applying manual conversion:', error);
      return false;
    }
  }

  /**
   * Calculate conversion details for display
   */
  static async calculateConversionDetails(
    userId: string,
    month: string,
    currentOvertimeHours: number // Rinominato per chiarezza - sono gli straordinari attuali già ridotti
  ): Promise<OvertimeConversionCalculation> {
    const normalizedMonth = this.normalizeMonth(month);
    const settings = await this.getEffectiveConversionSettings(userId, normalizedMonth);
    const conversion = await this.getOrCreateConversion(userId, normalizedMonth);

    if (!settings?.enable_overtime_conversion || !conversion) {
      return {
        original_overtime_hours: currentOvertimeHours,
        converted_hours: 0,
        remaining_overtime_hours: currentOvertimeHours,
        conversion_amount: 0,
        conversion_rate: settings?.overtime_conversion_rate || 0,
        explanation: "Conversione disabilitata"
      };
    }

    const totalConvertedHours = conversion.total_conversion_hours || 0;
    
    // CORREZIONE: ricostruire il valore originale pre-conversioni
    const originalOvertimeHours = currentOvertimeHours + totalConvertedHours;
    const remainingOvertimeHours = currentOvertimeHours; // Quello che rimane ora
    const conversionAmount = totalConvertedHours * settings.overtime_conversion_rate;

    let explanation = `${totalConvertedHours}h × ${settings.overtime_conversion_rate}€/h = ${conversionAmount.toFixed(2)}€`;
    
    if (conversion.automatic_conversion_hours > 0 && conversion.manual_conversion_hours > 0) {
      explanation += ` (Auto: ${conversion.automatic_conversion_hours}h + Manuale: ${conversion.manual_conversion_hours}h)`;
    } else if (conversion.automatic_conversion_hours > 0) {
      explanation += ` (Conversione automatica)`;
    } else if (conversion.manual_conversion_hours > 0) {
      explanation += ` (Conversione manuale)`;
    }

    return {
      original_overtime_hours: originalOvertimeHours, // Valore corretto ricostruito
      converted_hours: totalConvertedHours,
      remaining_overtime_hours: remainingOvertimeHours,
      conversion_amount: conversionAmount,
      conversion_rate: settings.overtime_conversion_rate,
      explanation
    };
  }

  /**
   * Processa automaticamente le conversioni straordinari per tutti gli utenti attivi di un'azienda
   * per un determinato mese, includendo la validazione dei giorni lavorati
   */
  static async processAutomaticConversions(
    month: string,
    companyId?: string
  ): Promise<{ processed: number; errors: string[]; validationResult?: any }> {
    const startTime = Date.now();
    console.log(`🔄 [OvertimeConversion] Inizio processamento conversioni automatiche per ${month}`, {
      companyId,
      startTime: new Date(startTime)
    });

    const monthStart = this.normalizeMonth(month);
    const monthDate = new Date(monthStart);
    const startDate = monthStart;
    const endDate = format(endOfMonth(monthDate), 'yyyy-MM-dd');

    const result: { processed: number; errors: string[]; validationResult?: any } = {
      processed: 0,
      errors: []
    };
    
    try {
      // Determine which users to process
      let usersQuery = supabase
        .from('profiles')
        .select('user_id, company_id, first_name, last_name')
        .eq('is_active', true);
      
          if (companyId) {
            usersQuery = usersQuery.eq('company_id', companyId);
          }
          
          const { data: users, error: usersError } = await usersQuery;
          if (usersError) throw usersError;
          
          if (!users || users.length === 0) return result;
      
      // Get all timesheets for the month
      const { data: timesheets, error: timesheetsError } = await supabase
        .from('timesheets')
        .select('user_id, overtime_hours')
        .in('user_id', users.map(u => u.user_id))
        .gte('date', startDate)
        .lte('date', endDate)
        .eq('is_absence', false);
      
      if (timesheetsError) throw timesheetsError;
      
      // Process each user
      for (const user of users) {
        try {
          // Calculate total overtime for this user in this month
          const userTimesheets = (timesheets || []).filter(t => t.user_id === user.user_id);
          const totalOvertimeHours = userTimesheets.reduce((sum, t) => sum + (t.overtime_hours || 0), 0);
          
          if (totalOvertimeHours === 0) continue; // Skip users with no overtime
          
          // Get conversion settings
          const settings = await this.getEffectiveConversionSettings(user.user_id, startDate);
          if (!settings?.enable_overtime_conversion) {
            continue; // Skip if conversion is disabled
          }
          
          // Calculate automatic conversion
          const automaticConversion = await this.calculateAutomaticConversion(
            user.user_id, 
            monthStart, 
            totalOvertimeHours
          );
          
          if (automaticConversion.hours <= 0) continue; // Skip if no conversion needed
          
          // Get or create conversion record - use consistent monthStart
          const existingConversion = await this.getOrCreateConversion(user.user_id, monthStart);
            if (!existingConversion) {
              result.errors.push(`Could not create conversion record for ${user.first_name} ${user.last_name}`);
              continue;
            }
          
          // Update automatic conversion hours (preserve manual hours)
          const totalAmount = (automaticConversion.hours + existingConversion.manual_conversion_hours) * settings.overtime_conversion_rate;
          
          const { error: updateError } = await supabase
            .from('employee_overtime_conversions')
            .update({
              automatic_conversion_hours: automaticConversion.hours,
              conversion_amount: totalAmount,
              updated_at: new Date().toISOString(),
              updated_by: (await supabase.auth.getUser()).data.user?.id ?? user.user_id
            })
            .eq('id', existingConversion.id);
          
            if (updateError) {
              result.errors.push(`Error updating conversion for ${user.first_name} ${user.last_name}: ${updateError.message}`);
              continue;
            }
          
          result.processed++;
          console.log(`✅ Processed automatic conversion for ${user.first_name} ${user.last_name}: ${automaticConversion.hours}h = €${automaticConversion.amount.toFixed(2)}`);
          
        } catch (userError) {
          result.errors.push(`Error processing ${user.first_name} ${user.last_name}: ${userError}`);
        }
      }
      
    } catch (error) {
      result.errors.push(`System error: ${error}`);
    }
    
    console.log(`✅ [OvertimeConversion] Processamento completato per ${month}:`, {
      processed: result.processed,
      errors: result.errors.length,
      totalTime: Date.now() - startTime
    });

    // Applica validazione e correzioni automatiche se c'è un companyId specifico
    if (companyId && result.processed > 0) {
      try {
        console.log(`🔍 [OvertimeConversion] Inizio validazione automatica per company ${companyId}`);
        const { BusinessTripValidationService } = await import('./BusinessTripValidationService');
        const validationResult = await BusinessTripValidationService.validateAndCorrectConversions(companyId, month);
        
        if (validationResult.correctionsMade) {
          console.log(`⚠️ [OvertimeConversion] Correzioni automatiche applicate:`, validationResult.corrections);
        }
        
        result.validationResult = validationResult;
      } catch (validationError) {
        console.error('❌ [OvertimeConversion] Errore durante la validazione:', validationError);
        result.errors.push(`Validation error: ${validationError}`);
      }
    }

    return result;
  }

  /**
   * Process automatic conversions for a specific user and month
   */
  static async processUserAutomaticConversion(
    userId: string, 
    month: string
  ): Promise<boolean> {
    try {
      // Get user's company ID
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id, first_name, last_name')
        .eq('user_id', userId)
        .single();

      if (!profile) return false;

      // Process automatic conversions for this user's company
      const result = await this.processAutomaticConversions(month, profile.company_id);
      return result.processed > 0 && result.errors.length === 0;
    } catch (error) {
      console.error('Error processing user automatic conversion:', error);
      return false;
    }
  }

  /**
   * Get all conversions for a company in a specific month
   */
  static async getCompanyConversions(
    companyId: string, 
    month: string
  ): Promise<OvertimeConversion[]> {
    const monthStart = this.normalizeMonth(month);
    
    const { data } = await supabase
      .from('employee_overtime_conversions')
      .select(`
        *,
        profiles:user_id (
          first_name,
          last_name
        )
      `)
      .eq('company_id', companyId)
      .eq('month', monthStart)
      .order('created_at', { ascending: false });

    return data || [];
  }
}