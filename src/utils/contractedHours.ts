import { format } from 'date-fns';
import { it } from 'date-fns/locale';

/**
 * Mappa dei giorni della settimana per standard_weekly_hours
 */
const DAY_KEYS: { [key: number]: string } = {
  0: 'dom', // Domenica
  1: 'lun', // Lunedì
  2: 'mar', // Martedì
  3: 'mer', // Mercoledì
  4: 'gio', // Giovedì
  5: 'ven', // Venerdì
  6: 'sab', // Sabato
};

/**
 * Calcola le ore contrattualizzate per un dato giorno
 * @param date - Data in formato ISO (yyyy-MM-dd) o Date object
 * @param employeeSettings - Impostazioni del dipendente (se disponibili)
 * @param companySettings - Impostazioni aziendali (fallback)
 * @returns Ore contrattualizzate per il giorno (0 se domenica/sabato tipicamente)
 */
export function getContractedHoursForDay(
  date: string | Date,
  employeeSettings: any,
  companySettings: any
): number {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const dayOfWeek = dateObj.getDay();
  const dayKey = DAY_KEYS[dayOfWeek];
  
  // Priorità: employee_settings > company_settings
  const weeklyHours = employeeSettings?.standard_weekly_hours || companySettings?.standard_weekly_hours;
  
  if (!weeklyHours || typeof weeklyHours !== 'object') {
    // Default: 8h per giorni lavorativi (lun-ven), 0 per sabato/domenica
    return dayOfWeek >= 1 && dayOfWeek <= 5 ? 8 : 0;
  }
  
  return weeklyHours[dayKey] || 0;
}

/**
 * Calcola le ore mancanti rispetto al contratto
 * @param workedHours - Ore effettivamente lavorate
 * @param contractedHours - Ore contrattualizzate per il giorno
 * @returns Ore mancanti (positivo se ci sono ore da recuperare)
 */
export function getMissingHours(workedHours: number, contractedHours: number): number {
  if (contractedHours === 0) return 0; // Giorno non lavorativo
  const missing = contractedHours - workedHours;
  return Math.max(0, missing); // Restituisce solo se mancano ore (non se sono in più)
}

/**
 * Verifica se un giorno ha ore insufficienti (considerando tolleranza di 15 minuti)
 * @param workedHours - Ore lavorate
 * @param contractedHours - Ore contrattualizzate
 * @param tolerance - Tolleranza in ore (default: 0.25 = 15 minuti)
 * @returns true se mancano ore significative
 */
export function hasMissingHours(
  workedHours: number,
  contractedHours: number,
  tolerance: number = 0.25
): boolean {
  if (contractedHours === 0) return false; // Giorno non lavorativo
  const missing = getMissingHours(workedHours, contractedHours);
  return missing > tolerance;
}

/**
 * Formatta le ore mancanti per la visualizzazione
 * @param missingHours - Ore mancanti
 * @returns Stringa formattata (es. "-2.5h")
 */
export function formatMissingHours(missingHours: number): string {
  if (missingHours === 0) return '';
  return `-${missingHours.toFixed(1)}h`;
}

/**
 * Ottiene il nome del giorno della settimana in italiano
 */
export function getDayName(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return format(dateObj, 'EEEE', { locale: it });
}
