import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth } from "date-fns";
import type { OvertimeConversion, OvertimeConversionSettings, OvertimeConversionCalculation, MonthlyOvertimeData } from "@/types/overtime-conversion";

export class OvertimeConversionService {
  /**
   * Get effective overtime conversion settings for a user at a specific date
   */
  static async getEffectiveConversionSettings(
    userId: string, 
    date: string
  ): Promise<OvertimeConversionSettings | null> {
    // Get employee-specific settings first
    const { data: employeeSettings } = await supabase
      .from('employee_settings')
      .select('enable_overtime_conversion, overtime_conversion_rate, overtime_conversion_limit')
      .eq('user_id', userId)
      .lte('valid_from', date)
      .or(`valid_to.is.null,valid_to.gte.${date}`)
      .order('valid_from', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get company settings as fallback
    const { data: companySettings } = await supabase
      .from('company_settings')
      .select('enable_overtime_conversion, default_overtime_conversion_rate, default_overtime_conversion_limit')
      .eq('company_id', (await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', userId)
        .single()).data?.company_id || '')
      .maybeSingle();

    if (!companySettings?.enable_overtime_conversion) {
      return null; // Conversion disabled at company level
    }

    return {
      enable_overtime_conversion: employeeSettings?.enable_overtime_conversion ?? true,
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
    const settings = await this.getEffectiveConversionSettings(userId, month);
    
    if (!settings?.enable_overtime_conversion || !settings.overtime_conversion_limit) {
      return { hours: 0, amount: 0 };
    }

    const conversionHours = Math.max(0, totalOvertimeHours - settings.overtime_conversion_limit);
    const conversionAmount = conversionHours * settings.overtime_conversion_rate;

    return { hours: conversionHours, amount: conversionAmount };
  }

  /**
   * Get or create overtime conversion record for a user/month
   */
  static async getOrCreateConversion(
    userId: string, 
    month: string
  ): Promise<OvertimeConversion | null> {
    const monthStart = format(startOfMonth(new Date(month + '-01')), 'yyyy-MM-dd');
    
    // Try to get existing record
    const { data: existing } = await supabase
      .from('employee_overtime_conversions')
      .select('*')
      .eq('user_id', userId)
      .eq('month', monthStart)
      .maybeSingle();

    if (existing) {
      return existing;
    }

    // Get company_id for the user
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('user_id', userId)
      .single();

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
   * Apply manual conversion adjustment
   */
  static async applyManualConversion(
    userId: string, 
    month: string, 
    manualHours: number,
    notes?: string
  ): Promise<boolean> {
    const monthStart = format(startOfMonth(new Date(month + '-01')), 'yyyy-MM-dd');
    const settings = await this.getEffectiveConversionSettings(userId, month);
    
    if (!settings) return false;

    const conversionAmount = manualHours * settings.overtime_conversion_rate;

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('user_id', userId)
      .single();

    if (!profile) return false;

    const { error } = await supabase
      .from('employee_overtime_conversions')
      .upsert({
        user_id: userId,
        month: monthStart,
        manual_conversion_hours: manualHours,
        conversion_amount: conversionAmount,
        notes,
        updated_by: userId,
        created_by: userId,
        company_id: profile.company_id
      }, {
        onConflict: 'user_id,month'
      });

    return !error;
  }

  /**
   * Calculate conversion details for display
   */
  static async calculateConversionDetails(
    userId: string,
    month: string,
    originalOvertimeHours: number
  ): Promise<OvertimeConversionCalculation> {
    const settings = await this.getEffectiveConversionSettings(userId, month);
    const conversion = await this.getOrCreateConversion(userId, month);

    if (!settings?.enable_overtime_conversion || !conversion) {
      return {
        original_overtime_hours: originalOvertimeHours,
        converted_hours: 0,
        remaining_overtime_hours: originalOvertimeHours,
        conversion_amount: 0,
        conversion_rate: settings?.overtime_conversion_rate || 0,
        explanation: "Conversione disabilitata"
      };
    }

    const totalConvertedHours = conversion.total_conversion_hours || 0;
    const remainingOvertimeHours = Math.max(0, originalOvertimeHours - totalConvertedHours);
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
      original_overtime_hours: originalOvertimeHours,
      converted_hours: totalConvertedHours,
      remaining_overtime_hours: remainingOvertimeHours,
      conversion_amount: conversionAmount,
      conversion_rate: settings.overtime_conversion_rate,
      explanation
    };
  }

  /**
   * Get all conversions for a company in a specific month
   */
  static async getCompanyConversions(
    companyId: string, 
    month: string
  ): Promise<OvertimeConversion[]> {
    const monthStart = format(startOfMonth(new Date(month + '-01')), 'yyyy-MM-dd');
    
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