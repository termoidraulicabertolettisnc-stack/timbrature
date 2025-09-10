import { supabase } from '@/integrations/supabase/client';

export interface TemporalEmployeeSettings {
  id: string;
  user_id: string;
  company_id: string;
  standard_weekly_hours?: any;
  lunch_break_type?: any;
  overtime_calculation?: any;
  saturday_handling?: any;
  meal_voucher_policy?: any;
  meal_allowance_policy?: any;
  night_shift_start?: string;
  night_shift_end?: string;
  meal_voucher_amount?: number;
  meal_voucher_min_hours?: number;
  daily_allowance_amount?: number;
  daily_allowance_min_hours?: number;
  daily_allowance_policy?: string;
  overtime_monthly_compensation?: boolean;
  business_trip_rate_with_meal?: number;
  business_trip_rate_without_meal?: number;
  contract_working_days?: string;
  saturday_hourly_rate?: number;
  valid_from: string;
  valid_to?: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by?: string;
}

/**
 * Recupera le impostazioni dipendente valide per una data specifica
 */
export async function getEmployeeSettingsForDate(
  userId: string, 
  targetDate: string
): Promise<TemporalEmployeeSettings | null> {
  try {
    const { data, error } = await supabase
      .from('employee_settings')
      .select('*')
      .eq('user_id', userId)
      .lte('valid_from', targetDate)
      .or(`valid_to.is.null,valid_to.gt.${targetDate}`)
      .order('valid_from', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching temporal employee settings:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getEmployeeSettingsForDate:', error);
    return null;
  }
}

/**
 * Recupera le impostazioni dipendente attuali (più recenti)
 */
export async function getCurrentEmployeeSettings(
  userId: string
): Promise<TemporalEmployeeSettings | null> {
  const today = new Date().toISOString().split('T')[0];
  return getEmployeeSettingsForDate(userId, today);
}

/**
 * Salva nuove impostazioni dipendente con logica temporale
 */
export async function saveTemporalEmployeeSettings(
  userId: string,
  companyId: string,
  settings: Partial<TemporalEmployeeSettings>,
  applicationType: 'from_today' | 'from_date' | 'retroactive',
  fromDate?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('💾 saveTemporalEmployeeSettings called with:', { 
      userId, 
      companyId, 
      applicationType, 
      fromDate,
      settingsKeys: Object.keys(settings)
    });
    
    const currentUser = await supabase.auth.getUser();
    console.log('👤 Current auth user:', currentUser.data.user?.id || 'NO USER');
    
    if (!currentUser.data.user) {
      console.log('❌ User not authenticated');
      return { success: false, error: 'User not authenticated' };
    }

    const createdBy = currentUser.data.user.id;
    const today = new Date().toISOString().split('T')[0];
    
    let validFrom: string;
    
    switch (applicationType) {
      case 'from_today':
        validFrom = today;
        break;
      case 'from_date':
        if (!fromDate) {
          return { success: false, error: 'From date is required' };
        }
        validFrom = fromDate;
        break;
      case 'retroactive':
        validFrom = '1900-01-01';
        break;
      default:
        return { success: false, error: 'Invalid application type' };
    }

    if (applicationType === 'retroactive') {
      // Elimina tutti i record precedenti per questo utente
      const { error: deleteError } = await supabase
        .from('employee_settings')
        .delete()
        .eq('user_id', userId);

      if (deleteError) {
        return { success: false, error: deleteError.message };
      }
    } else {
      // Chiudi le impostazioni precedenti che si sovrappongono
      const dayBefore = new Date(validFrom);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const validToDate = dayBefore.toISOString().split('T')[0];

      const { error: updateError } = await supabase
        .from('employee_settings')
        .update({ valid_to: validToDate })
        .eq('user_id', userId)
        .is('valid_to', null)
        .lte('valid_from', validToDate);

      if (updateError) {
        return { success: false, error: updateError.message };
      }
    }

    // Inserisci le nuove impostazioni
    const insertData = {
      user_id: userId,
      company_id: companyId,
      valid_from: validFrom,
      valid_to: null,
      created_by: createdBy,
      ...settings
    };
    
    console.log('📝 Inserting employee settings:', insertData);
    
    const { error: insertError } = await supabase
      .from('employee_settings')
      .insert(insertData);

    if (insertError) {
      console.log('❌ Insert error:', insertError);
      return { success: false, error: insertError.message };
    }

    console.log('✅ Employee settings saved successfully');
    return { success: true };
    
  } catch (error) {
    console.error('Error saving temporal employee settings:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Ricalcola tutti i timesheet per un dipendente da una data specifica
 */
export async function recalculateTimesheetsFromDate(
  userId: string,
  fromDate: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Qui implementeremo la logica di ricalcolo dei timesheet
    // Per ora ritorniamo successo, implementeremo dopo aver aggiornato calculateMealBenefits
    console.log(`Recalculating timesheets for user ${userId} from ${fromDate}`);
    return { success: true };
  } catch (error) {
    console.error('Error recalculating timesheets:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}