import { supabase } from '@/integrations/supabase/client';
import { calculateWorkingDays } from '@/utils/workingDaysCalculator';
import { OvertimeConversionService } from './OvertimeConversionService';

export interface BusinessTripValidationResult {
  originalOvertimeConversions: number;
  correctedOvertimeConversions: number;
  businessTripDays: number;
  workingDays: number;
  correctionsMade: boolean;
  corrections: {
    userId: string;
    userName: string;
    originalConversion: number;
    correctedConversion: number;
    deconvertedHours: number;
  }[];
}

export class BusinessTripValidationService {
  /**
   * Helper method to normalize month string to YYYY-MM-DD format
   */
  private static normalizeMonth(month: string): string {
    // Handle both "YYYY-MM" and "YYYY-MM-DD" formats
    if (month.length === 7) { // YYYY-MM format
      return `${month}-01`;
    }
    // If already YYYY-MM-DD, return first day of month
    const date = new Date(month);
    date.setDate(1);
    return date.toISOString().slice(0, 10);
  }

  /**
   * SISTEMA DI VALIDAZIONE E CORREZIONE AUTOMATICA CONVERSIONI STRAORDINARI
   * 
   * Questo servizio risolve il problema delle conversioni straordinari che generano
   * più giorni trasferta dei giorni effettivamente lavorati da un dipendente.
   * 
   * LOGICA DI FUNZIONAMENTO:
   * 1. Calcola i giorni lavorati effettivi (solo giorni effettivi, non trasferte esistenti)
   * 2. Stima i giorni trasferta basandosi sulle conversioni straordinari
   * 3. Se giorni trasferta > giorni lavorati, applica correzioni automatiche
   * 4. De-converte le ore straordinarie necessarie per rispettare il limite
   * 
   * Valida e corregge automaticamente le conversioni straordinari per un mese specifico
   * Assicura che i giorni trasferta non superino i giorni lavorati effettivi
   */
  static async validateAndCorrectConversions(
    companyId: string, 
    month: string
  ): Promise<BusinessTripValidationResult> {
    console.log(`🔍 [BusinessTripValidation] Inizio validazione per company ${companyId}, mese ${month}`);
    
    const result: BusinessTripValidationResult = {
      originalOvertimeConversions: 0,
      correctedOvertimeConversions: 0,
      businessTripDays: 0,
      workingDays: 0,
      correctionsMade: false,
      corrections: []
    };

    try {
      // Ottieni tutti gli utenti attivi dell'azienda
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name')
        .eq('company_id', companyId)
        .eq('is_active', true);

      if (profilesError) {
        console.error('❌ [BusinessTripValidation] Errore nel recuperare i profili:', profilesError);
        throw profilesError;
      }

      console.log(`📋 [BusinessTripValidation] Trovati ${profiles?.length || 0} dipendenti attivi`);

      // Processa ogni dipendente
      for (const profile of profiles || []) {
        const userResult = await this.validateUserConversions(profile.user_id, month);
        
        if (userResult.correctionsMade) {
          result.correctionsMade = true;
          result.corrections.push({
            userId: profile.user_id,
            userName: `${profile.first_name} ${profile.last_name}`,
            originalConversion: userResult.originalConversion,
            correctedConversion: userResult.correctedConversion,
            deconvertedHours: userResult.deconvertedHours
          });
        }

        result.originalOvertimeConversions += userResult.originalConversion;
        result.correctedOvertimeConversions += userResult.correctedConversion;
        result.businessTripDays += userResult.businessTripDays;
        result.workingDays += userResult.workingDays;
      }

      console.log(`✅ [BusinessTripValidation] Validazione completata:`, {
        correctionsMade: result.correctionsMade,
        totalCorrections: result.corrections.length,
        totalBusinessTripDays: result.businessTripDays,
        totalWorkingDays: result.workingDays
      });

      return result;

    } catch (error) {
      console.error('❌ [BusinessTripValidation] Errore durante la validazione:', error);
      throw error;
    }
  }

  /**
   * ALGORITMO DI VALIDAZIONE PER SINGOLO DIPENDENTE
   * 
   * Per ogni dipendente:
   * 1. Calcola giorni lavorati effettivi usando workingDaysCalculator
   * 2. Ottiene le conversioni straordinari attuali
   * 3. Stima i giorni trasferta teorici dalle conversioni
   * 4. Se giorni trasferta > giorni lavorati: applica correzione automatica
   * 5. Calcola le ore da de-convertire e aggiorna il database
   * 
   * Valida e corregge le conversioni per un singolo utente
   */
  private static async validateUserConversions(userId: string, month: string): Promise<{
    originalConversion: number;
    correctedConversion: number;
    businessTripDays: number;
    workingDays: number;
    correctionsMade: boolean;
    deconvertedHours: number;
  }> {
    console.log(`👤 [BusinessTripValidation] Validazione utente ${userId} per ${month}`);
    
    // Calcola i giorni lavorati effettivi (solo giorni realmente lavorati, escludendo trasferte esistenti)
    const workingDaysResult = await calculateWorkingDays(userId, month);
    const effectiveWorkingDays = workingDaysResult.actualWorkingDays;
    
    console.log(`📊 [BusinessTripValidation] Giorni lavorati per utente ${userId}:`, {
      actualWorkingDays: workingDaysResult.actualWorkingDays,
      businessTripDays: workingDaysResult.businessTripDays,
      effectiveWorkingDays
    });

    // Ottieni la conversione straordinari attuale
    const conversion = await OvertimeConversionService.getOrCreateConversion(userId, month);
    if (!conversion) {
      return {
        originalConversion: 0,
        correctedConversion: 0,
        businessTripDays: 0,
        workingDays: effectiveWorkingDays,
        correctionsMade: false,
        deconvertedHours: 0
      };
    }

    const originalTotalConversion = conversion.total_conversion_hours ?? 0;
    
    // Ottieni le impostazioni di conversione
    const settings = await OvertimeConversionService.getEffectiveConversionSettings(userId, month);
    if (!settings || !settings.enable_overtime_conversion) {
      return {
        originalConversion: originalTotalConversion,
        correctedConversion: originalTotalConversion,
        businessTripDays: 0,
        workingDays: effectiveWorkingDays,
        correctionsMade: false,
        deconvertedHours: 0
      };
    }

    // Calcola i giorni trasferta teorici basati sulle conversioni
    const estimatedBusinessTripDays = await this.calculateEstimatedBusinessTripDays(userId, month, originalTotalConversion);
    
    console.log(`🚗 [BusinessTripValidation] Giorni trasferta stimati per utente ${userId}: ${estimatedBusinessTripDays}`);

    // Se i giorni trasferta superano i giorni lavorati, applica correzione
    if (estimatedBusinessTripDays > effectiveWorkingDays) {
      const excessDays = estimatedBusinessTripDays - effectiveWorkingDays;
      const deconversionHours = await this.calculateDeconversionHours(userId, month, excessDays);
      
      console.log(`⚠️ [BusinessTripValidation] Correzione necessaria per utente ${userId}:`, {
        excessDays,
        deconversionHours,
        originalConversion: originalTotalConversion
      });

      // Applica la de-conversione
      const correctedConversion = Math.max(0, originalTotalConversion - deconversionHours);
      await this.applyCorrection(userId, month, correctedConversion, deconversionHours);

      return {
        originalConversion: originalTotalConversion,
        correctedConversion: correctedConversion,
        businessTripDays: effectiveWorkingDays, // Dopo la correzione
        workingDays: effectiveWorkingDays,
        correctionsMade: true,
        deconvertedHours: deconversionHours
      };
    }

    return {
      originalConversion: originalTotalConversion,
      correctedConversion: originalTotalConversion,
      businessTripDays: estimatedBusinessTripDays,
      workingDays: effectiveWorkingDays,
      correctionsMade: false,
      deconvertedHours: 0
    };
  }

  /**
   * CALCOLO GIORNI TRASFERTA STIMATI
   * 
   * Basandosi sulle ore straordinarie convertite, stima quanti giorni 
   * di trasferta verrebbero generati:
   * - Converte le ore in importo monetario (ore × tariffa conversione)
   * - Divide l'importo per la tariffa trasferta giornaliera più alta
   * - Arrotonda per eccesso per avere il numero di giorni
   * 
   * Calcola i giorni trasferta stimati basati sulle ore convertite
   */
  private static async calculateEstimatedBusinessTripDays(
    userId: string, 
    month: string, 
    convertedHours: number
  ): Promise<number> {
    // Ottieni le tariffe dalle impostazioni aziendali/dipendente
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('user_id', userId)
      .single();

    if (!profile) return 0;

    // Ottieni le impostazioni dipendente valide per la data specificata
    const normalizedMonth = this.normalizeMonth(month);
    const { data: empSettings } = await supabase
      .from('employee_settings')
      .select('business_trip_rate_with_meal, business_trip_rate_without_meal')
      .eq('user_id', userId)
      .lte('valid_from', normalizedMonth)
      .or(`valid_to.is.null,valid_to.gt.${normalizedMonth}`)
      .order('valid_from', { ascending: false })
      .limit(1)
      .maybeSingle();

    let rateWithMeal = 30.98;
    let rateWithoutMeal = 46.48;

    if (empSettings?.business_trip_rate_with_meal) {
      rateWithMeal = empSettings.business_trip_rate_with_meal;
    } else {
      const { data: compSettings } = await supabase
        .from('company_settings')
        .select('business_trip_rate_with_meal, business_trip_rate_without_meal')
        .eq('company_id', profile.company_id)
        .single();
      
      if (compSettings) {
        rateWithMeal = compSettings.business_trip_rate_with_meal || 30.98;
        rateWithoutMeal = compSettings.business_trip_rate_without_meal || 46.48;
      }
    }

    // Stima i giorni basandosi sulla tariffa più alta (caso pessimo)
    const estimatedAmount = convertedHours * (await this.getOvertimeConversionRate(userId, month));
    const estimatedDays = Math.ceil(estimatedAmount / Math.max(rateWithMeal, rateWithoutMeal));
    
    console.log(`💰 [BusinessTripValidation] Stima giorni trasferta:`, {
      convertedHours,
      estimatedAmount,
      rateWithMeal,
      rateWithoutMeal,
      estimatedDays
    });

    return estimatedDays;
  }

  /**
   * ALGORITMO DI DE-CONVERSIONE
   * 
   * Quando i giorni trasferta superano i giorni lavorati:
   * 1. Calcola l'eccedenza in giorni
   * 2. Converte l'eccedenza in importo monetario (giorni × tariffa trasferta)
   * 3. Calcola le ore da de-convertire (importo ÷ tariffa conversione)
   * 4. Arrotonda per avere un valore preciso
   * 
   * Calcola le ore da de-convertire per rispettare il limite dei giorni lavorati
   */
  private static async calculateDeconversionHours(
    userId: string, 
    month: string, 
    excessDays: number
  ): Promise<number> {
    const conversionRate = await this.getOvertimeConversionRate(userId, month);
    
    // Ottieni le tariffe trasferta per calcolare quanto de-convertire
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('user_id', userId)
      .single();

    if (!profile) return 0;

    const { data: compSettings } = await supabase
      .from('company_settings')
      .select('business_trip_rate_with_meal')
      .eq('company_id', profile.company_id)
      .single();

    const dailyTripRate = compSettings?.business_trip_rate_with_meal || 30.98;
    const excessAmount = excessDays * dailyTripRate;
    const deconversionHours = excessAmount / conversionRate;

    console.log(`🔄 [BusinessTripValidation] Calcolo de-conversione:`, {
      excessDays,
      dailyTripRate,
      excessAmount,
      conversionRate,
      deconversionHours
    });

    return Math.round(deconversionHours * 100) / 100; // Arrotonda a 2 decimali (più neutro)
  }

  /**
   * Ottieni la tariffa di conversione straordinari per l'utente
   */
  private static async getOvertimeConversionRate(userId: string, month: string): Promise<number> {
    const settings = await OvertimeConversionService.getEffectiveConversionSettings(userId, month);
    return settings?.overtime_conversion_rate || 12.00;
  }

  /**
   * Applica la correzione alla conversione straordinari con logica migliorata
   * Garantisce che il target di correzione venga raggiunto agendo prima sulle manuali poi sulle automatiche
   */
  private static async applyCorrection(
    userId: string, 
    month: string, 
    correctedConversion: number,
    deconvertedHours: number
  ): Promise<void> {
    const normalizedMonth = this.normalizeMonth(month);
    const notes = `Auto-correzione: de-convertite ${deconvertedHours.toFixed(2)}h per limite giorni lavorati`;
    
    console.log(`💾 [BusinessTripValidation] Applicazione correzione:`, {
      userId,
      month: normalizedMonth,
      correctedConversion,
      deconvertedHours,
      notes
    });

    // Ottieni la conversione corrente per calcolare il delta preciso
    const conversion = await OvertimeConversionService.getOrCreateConversion(userId, normalizedMonth);
    if (!conversion) {
      console.error('❌ [BusinessTripValidation] Impossibile trovare conversione per applicare correzione');
      return;
    }

    const currentTotal = conversion.total_conversion_hours ?? 0;
    const currentManual = conversion.manual_conversion_hours ?? 0;
    // automatic_conversion_hours rimosso - ora solo conversioni manuali

    // Calcola il delta necessario per raggiungere il target
    const targetDelta = correctedConversion - currentTotal;
    
    console.log(`🔧 [BusinessTripValidation] Delta correzione:`, {
      currentTotal,
      currentManual,
      correctedConversion,
      targetDelta
    });

    // Se il delta è negativo (dobbiamo de-convertire), agiamo prima sulle manuali
    if (targetDelta < 0) {
      const maxManualReduction = -currentManual; // Massimo che possiamo togliere dalle manuali
      const manualDelta = Math.max(targetDelta, maxManualReduction);
      
      // Applica la correzione manuale
      if (Math.abs(manualDelta) >= 0.01) {
        await OvertimeConversionService.applyManualConversion(userId, normalizedMonth, manualDelta, notes);
      }
      
      // Se non bastano le manuali, registra il problema (per ora non agiamo sulle automatiche)
      if (Math.abs(manualDelta) < Math.abs(targetDelta)) {
        console.warn(`⚠️ [BusinessTripValidation] Correzione parziale: ridotte solo ${Math.abs(manualDelta).toFixed(2)}h di ${Math.abs(targetDelta).toFixed(2)}h richieste`);
      }
    } else if (targetDelta > 0) {
      // Se il delta è positivo, aggiungiamo alle manuali
      await OvertimeConversionService.applyManualConversion(userId, normalizedMonth, targetDelta, notes);
    }
  }
}