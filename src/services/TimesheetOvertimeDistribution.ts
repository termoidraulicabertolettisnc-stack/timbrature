import { supabase } from "@/integrations/supabase/client";

/**
 * Service per distribuire proporzionalmente le conversioni straordinari sui singoli timesheets
 * Questo servizio aggiorna effettivamente i dati nella tabella timesheets del database
 */
export class TimesheetOvertimeDistributionService {
  
  /**
   * Applica la distribuzione proporzionale delle conversioni straordinari sui timesheets
   * Riduce gli overtime_hours nei singoli giorni proporzionalmente alle conversioni
   */
  static async applyOvertimeConversionToTimesheets(
    userId: string,
    month: string,
    totalConvertedHours: number
  ): Promise<boolean> {
    console.log(`🔄 [TimesheetOvertimeDistribution] Applicazione conversioni straordinari ai timesheets:`, {
      userId,
      month,
      totalConvertedHours
    });

    try {
      // Normalizza il mese
      const monthStart = month.length === 7 ? `${month}-01` : month;
      const [year, monthStr] = monthStart.split('-');
      const startDate = `${year}-${monthStr}-01`;
      const endDate = `${year}-${monthStr}-${new Date(parseInt(year), parseInt(monthStr), 0).getDate()}`;

      // Ottieni tutti i timesheets del mese con straordinari
      const { data: timesheets, error: timesheetsError } = await supabase
        .from('timesheets')
        .select('id, date, overtime_hours, total_hours')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate)
        .eq('is_absence', false)
        .gt('overtime_hours', 0);

      if (timesheetsError) {
        console.error('❌ [TimesheetOvertimeDistribution] Errore recupero timesheets:', timesheetsError);
        return false;
      }

      if (!timesheets || timesheets.length === 0) {
        console.log('ℹ️ [TimesheetOvertimeDistribution] Nessun timesheet con straordinari trovato');
        return true;
      }

      // Calcola il totale straordinari originali
      const totalOriginalOvertime = timesheets.reduce((sum, ts) => sum + (ts.overtime_hours || 0), 0);
      
      if (totalOriginalOvertime === 0) {
        console.log('ℹ️ [TimesheetOvertimeDistribution] Nessun straordinario da distribuire');
        return true;
      }

      // Se le ore convertite superano il totale, limita al totale disponibile
      const actualConvertedHours = Math.min(totalConvertedHours, totalOriginalOvertime);
      
      console.log(`📊 [TimesheetOvertimeDistribution] Distribuzione:`, {
        totalOriginalOvertime,
        actualConvertedHours,
        timesheetsWithOvertime: timesheets.length
      });

      // Calcola la distribuzione proporzionale per ogni timesheet
      const updates = timesheets.map(ts => {
        const originalOvertime = ts.overtime_hours || 0;
        const proportionalReduction = (originalOvertime / totalOriginalOvertime) * actualConvertedHours;
        const newOvertimeHours = Math.max(0, originalOvertime - proportionalReduction);
        
        return {
          id: ts.id,
          newOvertimeHours,
          reduction: proportionalReduction
        };
      });

      // Applica gli aggiornamenti ai timesheets
      const updatePromises = updates.map(async (update) => {
        const { error } = await supabase
          .from('timesheets')
          .update({ 
            overtime_hours: update.newOvertimeHours,
            updated_at: new Date().toISOString()
          })
          .eq('id', update.id);

        if (error) {
          console.error(`❌ [TimesheetOvertimeDistribution] Errore aggiornamento timesheet ${update.id}:`, error);
          return false;
        }

        return true;
      });

      const results = await Promise.all(updatePromises);
      const successCount = results.filter(r => r).length;

      console.log(`✅ [TimesheetOvertimeDistribution] Aggiornati ${successCount}/${timesheets.length} timesheets`);
      
      return successCount === timesheets.length;

    } catch (error) {
      console.error('❌ [TimesheetOvertimeDistribution] Errore durante distribuzione:', error);
      return false;
    }
  }

  /**
   * Ripristina gli straordinari originali nei timesheets (per de-conversioni)
   * Recupera le ore straordinarie originali dalle conversioni e le ridistribuisce
   */
  static async restoreOvertimeFromConversions(
    userId: string,
    month: string,
    hoursToRestore: number
  ): Promise<boolean> {
    console.log(`🔄 [TimesheetOvertimeDistribution] Ripristino straordinari:`, {
      userId,
      month,
      hoursToRestore
    });

    try {
      // Normalizza il mese
      const monthStart = month.length === 7 ? `${month}-01` : month;
      const [year, monthStr] = monthStart.split('-');
      const startDate = `${year}-${monthStr}-01`;
      const endDate = `${year}-${monthStr}-${new Date(parseInt(year), parseInt(monthStr), 0).getDate()}`;

      // Ottieni tutti i timesheets del mese
      const { data: timesheets, error: timesheetsError } = await supabase
        .from('timesheets')
        .select('id, date, overtime_hours, total_hours')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate)
        .eq('is_absence', false);

      if (timesheetsError) {
        console.error('❌ [TimesheetOvertimeDistribution] Errore recupero timesheets:', timesheetsError);
        return false;
      }

      if (!timesheets || timesheets.length === 0) {
        console.log('ℹ️ [TimesheetOvertimeDistribution] Nessun timesheet trovato per ripristino');
        return true;
      }

      // Calcola le ore straordinarie totali attuali
      const currentTotalOvertime = timesheets.reduce((sum, ts) => sum + (ts.overtime_hours || 0), 0);
      
      // Ottieni il rapporto originale degli straordinari per timesheet
      // Per semplicità, distribuzione proporzionale basata sulle ore totali lavorate
      const totalWorkedHours = timesheets.reduce((sum, ts) => sum + (ts.total_hours || 0), 0);
      
      if (totalWorkedHours === 0) {
        console.log('ℹ️ [TimesheetOvertimeDistribution] Nessuna ora lavorata per calcolare proporzioni');
        return true;
      }

      console.log(`📊 [TimesheetOvertimeDistribution] Ripristino:`, {
        currentTotalOvertime,
        hoursToRestore,
        totalWorkedHours,
        timesheets: timesheets.length
      });

      // Calcola la distribuzione proporzionale per il ripristino
      const updates = timesheets.map(ts => {
        const workedHoursWeight = (ts.total_hours || 0) / totalWorkedHours;
        const hoursToAdd = workedHoursWeight * hoursToRestore;
        const newOvertimeHours = (ts.overtime_hours || 0) + hoursToAdd;
        
        return {
          id: ts.id,
          newOvertimeHours,
          addition: hoursToAdd
        };
      });

      // Applica gli aggiornamenti ai timesheets
      const updatePromises = updates.map(async (update) => {
        const { error } = await supabase
          .from('timesheets')
          .update({ 
            overtime_hours: update.newOvertimeHours,
            updated_at: new Date().toISOString()
          })
          .eq('id', update.id);

        if (error) {
          console.error(`❌ [TimesheetOvertimeDistribution] Errore aggiornamento timesheet ${update.id}:`, error);
          return false;
        }

        return true;
      });

      const results = await Promise.all(updatePromises);
      const successCount = results.filter(r => r).length;

      console.log(`✅ [TimesheetOvertimeDistribution] Ripristinati ${successCount}/${timesheets.length} timesheets`);
      
      return successCount === timesheets.length;

    } catch (error) {
      console.error('❌ [TimesheetOvertimeDistribution] Errore durante ripristino:', error);
      return false;
    }
  }

  /**
   * Ricalcola e sincronizza tutti gli straordinari di un mese basandosi sulle conversioni
   * Questa funzione ricostruisce gli straordinari partendo dalle conversioni attuali
   */
  static async synchronizeOvertimeWithConversions(
    userId: string,
    month: string
  ): Promise<boolean> {
    console.log(`🔄 [TimesheetOvertimeDistribution] Sincronizzazione straordinari con conversioni:`, {
      userId,
      month
    });

    try {
      // Ottieni le conversioni attuali
      const { OvertimeConversionService } = await import('./OvertimeConversionService');
      const conversion = await OvertimeConversionService.getOrCreateConversion(userId, month);
      
      if (!conversion) {
        console.log('ℹ️ [TimesheetOvertimeDistribution] Nessuna conversione trovata');
        return true;
      }

      const totalConvertedHours = conversion.total_conversion_hours || 0;

      // Applica la distribuzione basata sulle conversioni attuali
      return await this.applyOvertimeConversionToTimesheets(userId, month, totalConvertedHours);

    } catch (error) {
      console.error('❌ [TimesheetOvertimeDistribution] Errore sincronizzazione:', error);
      return false;
    }
  }
}