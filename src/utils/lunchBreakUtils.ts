import { supabase } from '@/integrations/supabase/client';

const LUNCH_BREAK_OPTIONS = [
  { value: '0_minuti', label: 'Nessuna Pausa (0 min)' },
  { value: '15_minuti', label: '15 Minuti Fissi' },
  { value: '30_minuti', label: '30 Minuti Fissi' },
  { value: '45_minuti', label: '45 Minuti Fissi' },
  { value: '60_minuti', label: '60 Minuti Fissi (1 ora)' },
  { value: '90_minuti', label: '90 Minuti Fissi (1.5 ore)' },
  { value: '120_minuti', label: '120 Minuti Fissi (2 ore)' },
  { value: 'libera', label: 'Pausa Libera (Timbrata Manualmente)' }
];

/**
 * Utilità per visualizzare la configurazione attiva della pausa pranzo
 */
export const getLunchBreakDisplay = (
  employeeSettings: any, 
  companySettings: any
): string => {
  const lunchType = employeeSettings?.lunch_break_type || companySettings?.lunch_break_type;
  const minHours = employeeSettings?.lunch_break_min_hours || companySettings?.lunch_break_min_hours || 6;
  
  const option = LUNCH_BREAK_OPTIONS.find(opt => opt.value === lunchType);
  if (!option) return 'Non configurata';
  
  if (lunchType === '0_minuti') return 'Nessuna pausa';
  if (lunchType === 'libera') return 'Pausa libera (timbrata)';
  
  return `${option.label} (dopo ${minHours}h di lavoro)`;
};

/**
 * Funzione per debugging - Mostra la configurazione attiva della pausa pranzo
 */
export const debugLunchBreakConfig = async (userId: string) => {
  try {
    // Prima ottieni l'employee settings
    const { data: employee } = await supabase
      .from('employee_settings')
      .select('*')
      .eq('user_id', userId)
      .is('valid_to', null) // Solo configurazioni attive
      .maybeSingle();
      
    if (!employee) {
      console.log('🍽️ No employee settings found for user:', userId);
      return;
    }

    // Poi ottieni le company settings
    const { data: company } = await supabase
      .from('company_settings')
      .select('*')
      .eq('company_id', employee.company_id)
      .maybeSingle();
      
    console.log('🍽️ LUNCH BREAK DEBUG:', {
      userId,
      employee: {
        type: employee.lunch_break_type,
        minHours: employee.lunch_break_min_hours
      },
      company: {
        type: company?.lunch_break_type,
        minHours: company?.lunch_break_min_hours
      },
      effective: {
        type: employee.lunch_break_type || company?.lunch_break_type,
        minHours: employee.lunch_break_min_hours || company?.lunch_break_min_hours,
        display: getLunchBreakDisplay(employee, company)
      }
    });

    return {
      employee,
      company,
      effective: {
        type: employee.lunch_break_type || company?.lunch_break_type,
        minHours: employee.lunch_break_min_hours || company?.lunch_break_min_hours,
        display: getLunchBreakDisplay(employee, company)
      }
    };
  } catch (error) {
    console.error('Error in debugLunchBreakConfig:', error);
  }
};

/**
 * Estrae i minuti dalla stringa lunch_break_type (es. "60_minuti" -> 60)
 */
export const getLunchBreakMinutesFromType = (lunchType: string | null | undefined): number => {
  if (!lunchType) return 0;
  if (lunchType === '0_minuti' || lunchType === 'libera') return 0;
  
  const match = lunchType.match(/^(\d+)_minuti$/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 0;
};

/**
 * Calcola i minuti di pausa pranzo da sottrarre per un timesheet
 * Segue la gerarchia: timesheet.lunch_duration_minutes > employee_settings > company_settings
 */
export const calculateLunchDeduction = (
  grossHours: number,
  timesheet: { lunch_duration_minutes?: number | null; lunch_manually_set?: boolean | null } | null,
  employeeSettings: any | null,
  companySettings: any | null
): number => {
  // 1. Se il timesheet ha lunch_duration_minutes esplicito, usa quello
  if (timesheet?.lunch_duration_minutes !== null && timesheet?.lunch_duration_minutes !== undefined) {
    return timesheet.lunch_duration_minutes;
  }
  
  // 2. Determina la soglia minima di ore per applicare la pausa
  const minHoursForLunch = 
    employeeSettings?.lunch_break_min_hours ?? 
    companySettings?.lunch_break_min_hours ?? 
    6;
  
  // 3. Se le ore lorde non superano la soglia, nessuna deduzione
  if (grossHours < minHoursForLunch) {
    return 0;
  }
  
  // 4. Determina i minuti di pausa dalle impostazioni
  const lunchType = employeeSettings?.lunch_break_type ?? companySettings?.lunch_break_type;
  
  // Se è "libera" o "0_minuti", niente deduzione automatica
  if (lunchType === 'libera' || lunchType === '0_minuti') {
    return 0;
  }
  
  return getLunchBreakMinutesFromType(lunchType);
};

/**
 * Calcola le ore nette da ore lorde sottraendo la pausa pranzo
 */
export const calculateNetHours = (
  grossHours: number,
  timesheet: { lunch_duration_minutes?: number | null; lunch_manually_set?: boolean | null } | null,
  employeeSettings: any | null,
  companySettings: any | null
): { netHours: number; lunchMinutesDeducted: number } => {
  const lunchMinutes = calculateLunchDeduction(grossHours, timesheet, employeeSettings, companySettings);
  const netHours = Math.max(0, grossHours - (lunchMinutes / 60));
  
  return { netHours, lunchMinutesDeducted: lunchMinutes };
};

export { LUNCH_BREAK_OPTIONS };