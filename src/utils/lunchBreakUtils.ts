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

export { LUNCH_BREAK_OPTIONS };