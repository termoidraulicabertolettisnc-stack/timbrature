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
      .select('enable_overtime_conversion, overtime_conversion_rate')
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
      .select('enable_overtime_conversion, default_overtime_conversion_rate')
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
      overtime_conversion_rate: employeeSettings?.overtime_conversion_rate ?? companySettings.default_overtime_conversion_rate ?? 12.00
    };
  }

  /**
   * Get or create overtime conversion record for a user/month
   */
  /**
   * Get or create overtime conversion record for a user/month
   * FIXED: Usa upsert invece di select + insert per evitare 409 Conflict
   */
  static async getOrCreateConversion(
    userId: string, 
    month: string
  ): Promise<OvertimeConversion | null> {
    const monthStart = this.normalizeMonth(month);
    
    // Get company_id for the user
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('user_id', userId)
      .single();

  if (profileError || !profile) {
    console.error('❌ [OvertimeConversion] Error fetching user profile:', profileError);
    return null;
  }

  // Prima prova a leggere il record esistente
  let { data: record, error } = await supabase
    .from('employee_overtime_conversions')
    .select('id, user_id, company_id, month, manual_conversion_hours, total_conversion_hours, conversion_amount, notes, created_at, updated_at, created_by, updated_by')
    .eq('user_id', userId)
    .eq('month', monthStart)
    .maybeSingle();

  if (error) {
    console.error('❌ [OvertimeConversion] Error reading conversion:', error);
    return null;
  }

  // Se esiste, ritornalo
  if (record) {
    return record;
  }

  // Se non esiste, crealo con upsert (gestisce race conditions)
  const { data: newRecord, error: upsertError } = await supabase
    .from('employee_overtime_conversions')
    .upsert(
      {
        user_id: userId,
        company_id: profile.company_id,
        month: monthStart,
        manual_conversion_hours: 0,
        conversion_amount: 0,
        created_by: (await supabase.auth.getUser()).data.user?.id || userId
      },
      {
        onConflict: 'user_id,month'
      }
    )
    .select('id, user_id, company_id, month, manual_conversion_hours, total_conversion_hours, conversion_amount, notes, created_at, updated_at, created_by, updated_by')
    .single();

  if (upsertError) {
    console.error('❌ [OvertimeConversion] Error creating conversion:', upsertError);
    return null;
  }

  return newRecord;
  }

  /**
   * Apply manual conversion adjustment (positive for conversion, negative for de-conversion)
   * CORREZIONE: Migliorata gestione errori e logging + distribuzione su timesheets
   */
  static async applyManualConversion(
    userId: string, 
    month: string, 
    deltaHours: number, 
    notes?: string
  ): Promise<boolean> {
    console.log(`🔄 [OvertimeConversion] Applicazione conversione manuale:`, {
      userId,
      month,
      deltaHours,
      notes
    });

    try {
      const normalizedMonth = this.normalizeMonth(month);
      
      // Get or create conversion record
      const conversion = await this.getOrCreateConversion(userId, normalizedMonth);
      if (!conversion) {
        console.error(`❌ [OvertimeConversion] Impossibile creare/trovare record conversione per ${userId}`);
        return false;
      }

      // Get conversion settings
      const settings = await this.getEffectiveConversionSettings(userId, normalizedMonth);
      if (!settings?.enable_overtime_conversion) {
        console.error(`❌ [OvertimeConversion] Conversione disabilitata per utente ${userId}`);
        return false;
      }

      console.log(`📋 [OvertimeConversion] Stato corrente conversione:`, {
        currentManualHours: conversion.manual_conversion_hours,
        currentTotalHours: conversion.total_conversion_hours
      });

      // Store old total for timesheet distribution calculation
      const oldTotalConversionHours = conversion.total_conversion_hours || 0;

      // Calculate new manual conversion hours
      const newManualHours = conversion.manual_conversion_hours + deltaHours;
      const totalHours = newManualHours; // Only manual conversions now
      const newAmount = Math.max(0, totalHours) * settings.overtime_conversion_rate;

      console.log(`💾 [OvertimeConversion] Aggiornamento con:`, {
        newManualHours,
        newAmount,
        totalHours,
        calculatedFrom: `${newManualHours} * ${settings.overtime_conversion_rate}`
      });

      // 🔍 LOGGING PRE-UPDATE per diagnosi
      console.log(`🔍 [OvertimeConversion] PRE-UPDATE - Conversion object:`, {
        conversionId: conversion.id,
        conversionIdType: typeof conversion.id,
        currentManualHours: conversion.manual_conversion_hours,
        newManualHours,
        deltaHours,
        userId,
        normalizedMonth
      });

      // Update the conversion record (exclude total_conversion_hours as it's now a generated column)
      const { data, error, count } = await supabase
        .from('employee_overtime_conversions')
        .update({
          manual_conversion_hours: newManualHours,
          conversion_amount: newAmount,
          notes,
          updated_by: (await supabase.auth.getUser()).data.user?.id ?? userId,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversion.id)
        .select();

      // 📊 LOGGING POST-UPDATE
      console.log('🔍 [OvertimeConversion] POST-UPDATE result:', { 
        error,
        count,
        dataLength: data?.length || 0,
        data,
        conversionId: conversion.id
      });

      if (error) {
        console.error('❌ [OvertimeConversion] UPDATE failed:', error);
        return false;
      }

      // ⚠️ VERIFICA: Nessuna riga aggiornata?
      if (!data || data.length === 0) {
        console.error(`❌ [OvertimeConversion] UPDATE non ha modificato nessuna riga!`, {
          conversionId: conversion.id,
          conversionIdType: typeof conversion.id,
          userId,
          month: normalizedMonth,
          message: 'Possibile problema: ID non trovato o RLS blocca UPDATE'
        });
        return false;
      }

      console.log(`✅ [OvertimeConversion] UPDATE riuscito - ${data.length} riga/e aggiornata/e`);

      // Aggiorna gli straordinari nei timesheets proporzionalmente
      const { TimesheetOvertimeDistributionService } = await import('./TimesheetOvertimeDistribution');
      const newTotalConversionHours = Math.max(0, totalHours);
      
      // Se c'è un cambiamento nelle conversioni totali, aggiorna i timesheets
      if (Math.abs(newTotalConversionHours - oldTotalConversionHours) > 0.01) {
        console.log(`🔄 [OvertimeConversion] Aggiornamento timesheets per conversioni:`, {
          oldTotal: oldTotalConversionHours,
          newTotal: newTotalConversionHours
        });
        
        await TimesheetOvertimeDistributionService.synchronizeOvertimeWithConversions(userId, normalizedMonth);
      }

      console.log(`✅ [OvertimeConversion] Conversione applicata con successo per ${userId}`);
      return true;
    } catch (error) {
      console.error('❌ [OvertimeConversion] Errore applicazione conversione manuale:', error);
      return false;
    }
  }

  /**
   * Calculate conversion details for display
   * CORREZIONE: Ora calcola correttamente i valori originali e attuali
   */
  static async calculateConversionDetails(
    userId: string,
    month: string,
    currentOvertimeHours: number // Straordinari attuali dopo le conversioni (valore ridotto)
  ): Promise<OvertimeConversionCalculation> {
    console.log(`🔍 [OvertimeConversion] Calcolo dettagli per utente ${userId}, mese ${month}`, {
      currentOvertimeHours
    });

    const normalizedMonth = this.normalizeMonth(month);
    const settings = await this.getEffectiveConversionSettings(userId, normalizedMonth);
    const conversion = await this.getOrCreateConversion(userId, normalizedMonth);

    if (!settings?.enable_overtime_conversion || !conversion) {
      console.log(`❌ [OvertimeConversion] Conversione disabilitata per utente ${userId}`);
      return {
        original_overtime_hours: currentOvertimeHours,
        converted_hours: 0,
        remaining_overtime_hours: currentOvertimeHours,
        conversion_amount: 0,
        conversion_rate: settings?.overtime_conversion_rate || 0,
        explanation: "Conversione disabilitata"
      };
    }

    // CORREZIONE: La colonna total_conversion_hours è ora calcolata automaticamente dal database
    const totalConvertedHours = conversion.total_conversion_hours || 0;
    
    // CORREZIONE: Il valore originale è la somma degli straordinari attuali + ore già convertite
    const originalOvertimeHours = currentOvertimeHours + totalConvertedHours;
    const remainingOvertimeHours = currentOvertimeHours; // Quello che rimane ora
    const conversionAmount = totalConvertedHours * settings.overtime_conversion_rate;

    console.log(`📊 [OvertimeConversion] Calcoli per utente ${userId}:`, {
      currentOvertimeHours,
      totalConvertedHours,
      originalOvertimeHours,
      remainingOvertimeHours,
      conversionAmount,
      manualHours: conversion.manual_conversion_hours
    });

    let explanation = `${totalConvertedHours.toFixed(2)}h × ${settings.overtime_conversion_rate}€/h = ${conversionAmount.toFixed(2)}€`;
    
    if (conversion.manual_conversion_hours > 0) {
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
   * Processa conversioni manuali - la conversione automatica è stata rimossa
   * Questo metodo ora serve solo per validazione o operazioni batch
   */
  static async processManualConversions(
    month: string,
    companyId?: string
  ): Promise<{ processed: number; errors: string[]; validationResult?: any }> {
    const startTime = Date.now();
    console.log(`🔄 [OvertimeConversion] Inizio processamento conversioni manuali per ${month}`, {
      companyId,
      startTime: new Date(startTime)
    });

    const result: { processed: number; errors: string[]; validationResult?: any } = {
      processed: 0,
      errors: []
    };
    
    // La conversione automatica è stata rimossa - non c'è nulla da processare automaticamente
    console.log(`✅ [OvertimeConversion] Processamento completato per ${month} - solo conversioni manuali supportate:`, {
      processed: result.processed,
      errors: result.errors.length,
      totalTime: Date.now() - startTime
    });

    return result;
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