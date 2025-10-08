import { supabase } from '@/integrations/supabase/client';

export interface TemporalEmployeeSettings {
  id: string;
  user_id: string;
  company_id: string;
  standard_weekly_hours?: any;
  lunch_break_type?: any;
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
  // Entry tolerance fields
  enable_entry_tolerance?: boolean;
  standard_start_time?: string;
  entry_tolerance_minutes?: number;
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
    
    // STEP 1: Force session refresh to ensure JWT token is valid
    console.log('🔄 Forcing session refresh...');
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      console.error('❌ Session refresh failed:', refreshError);
      return { success: false, error: 'Session refresh failed: ' + refreshError.message };
    }
    
    console.log('✅ Session refreshed successfully');
    
    // STEP 2: Get current session (not just user)
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    console.log('👤 Current session check:', { 
      hasSession: !!sessionData.session,
      hasUser: !!sessionData.session?.user,
      userId: sessionData.session?.user?.id || 'NO USER',
      accessToken: sessionData.session?.access_token ? 'Present' : 'Missing'
    });
    
    if (sessionError || !sessionData.session || !sessionData.session.user) {
      console.log('❌ No valid session found');
      return { success: false, error: 'User session not found' };
    }
    
    // STEP 3: Verify auth.uid() works by testing with a simple query
    console.log('🔍 Testing auth.uid() with simple query...');
    const { data: testData, error: testError } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('user_id', sessionData.session.user.id)
      .limit(1);
    
    if (testError) {
      console.error('❌ Test query failed:', testError);
      return { success: false, error: 'Authentication test failed: ' + testError.message };
    }
    
    console.log('✅ Auth test passed, auth.uid() should work now');

    const createdBy = sessionData.session.user.id;
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
      console.log('🗑️ Deleting previous retroactive settings...');
      const { error: deleteError } = await supabase
        .from('employee_settings')
        .delete()
        .eq('user_id', userId);

      if (deleteError) {
        console.error('❌ Delete error:', deleteError);
        return { success: false, error: deleteError.message };
      }
      console.log('✅ Previous settings deleted');
    } else {
      // Per modifiche da data specifica: mantieni la storia precedente e applica le nuove impostazioni dalla data selezionata
      console.log('📅 Splitting timeline for date-specific changes...');
      const dayBefore = new Date(validFrom);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const validToDate = dayBefore.toISOString().split('T')[0];

      // Chiudi solo i record attivi che si sovrappongono con il nuovo periodo
      // Questo significa: record che iniziano PRIMA della nuova validFrom
      const { error: updateError } = await supabase
        .from('employee_settings')
        .update({ valid_to: validToDate })
        .eq('user_id', userId)
        .is('valid_to', null)
        .lt('valid_from', validFrom); // Solo record che iniziano prima della nuova data

      if (updateError) {
        console.error('❌ Update error:', updateError);
        return { success: false, error: updateError.message };
      }
      
      // Se esistono record che iniziano dalla stessa data o dopo, eliminali
      const { error: deleteError } = await supabase
        .from('employee_settings')
        .delete()
        .eq('user_id', userId)
        .gte('valid_from', validFrom);
        
      if (deleteError) {
        console.error('❌ Delete future records error:', deleteError);
        return { success: false, error: deleteError.message };
      }
      
      console.log('✅ Timeline split completed');
    }

    // STEP 4: Inserisci le nuove impostazioni con retry logic
    const insertData = {
      ...settings,
      user_id: userId,
      company_id: companyId,
      valid_from: validFrom,
      valid_to: null,
      created_by: createdBy
    };
    
    console.log('📝 Inserting employee settings with retry logic:', insertData);
    
    // Try insert with retry logic for temporary auth issues
    let insertError: any = null;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      const { error } = await supabase
        .from('employee_settings')
        .insert(insertData);

      if (!error) {
        console.log('✅ Employee settings saved successfully on attempt', retryCount + 1);
        return { success: true };
      }
      
      insertError = error;
      console.log(`❌ Insert attempt ${retryCount + 1} failed:`, error);
      
      // If it's an auth-related error, try refreshing session again
      if (error.message.includes('policy') || error.message.includes('RLS') || error.message.includes('permission')) {
        console.log('🔄 Auth error detected, refreshing session and retrying...');
        await supabase.auth.refreshSession();
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      }
      
      retryCount++;
    }
    
    // If all retries failed, return the last error
    console.log('❌ All retry attempts failed');
    return { success: false, error: insertError.message };
    
  } catch (error) {
    console.error('Error saving temporal employee settings:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * 📊 Statistiche protezioni per un dipendente o tutti
 */
export interface ProtectionStats {
  userId?: string;
  userName?: string;
  totalTimesheets: number;
  protectedTimesheets: number;
  unprotectedTimesheets: number;
  protectionPercentage: number;
}

/**
 * 📋 Risultato operazione ricalcolo
 */
export interface RecalculateResult {
  success: boolean;
  recalculatedCount: number;
  skippedCount: number;
  errorCount: number;
  errors?: string[];
}

/**
 * Ricalcola tutti i timesheet per un dipendente da una data specifica,
 * RISPETTANDO le modifiche manuali protette (lunch_manually_set = TRUE)
 */
export async function recalculateTimesheetsFromDate(
  userId: string,
  fromDate: string
): Promise<RecalculateResult> {
  try {
    console.log('🔄 RECALCULATE START:', { userId, fromDate });

    // STEP 1: Ottieni tutti i timesheets da ricalcolare
    const { data: timesheets, error: fetchError } = await supabase
      .from('timesheets')
      .select('id, date, lunch_manually_set, lunch_duration_minutes')
      .eq('user_id', userId)
      .gte('date', fromDate)
      .order('date', { ascending: true }) as any;

    if (fetchError) {
      console.error('❌ FETCH ERROR:', fetchError);
      return {
        success: false,
        recalculatedCount: 0,
        skippedCount: 0,
        errorCount: 1,
        errors: [fetchError.message]
      };
    }

    if (!timesheets || timesheets.length === 0) {
      console.log('⚠️ NO TIMESHEETS FOUND for recalculation');
      return {
        success: true,
        recalculatedCount: 0,
        skippedCount: 0,
        errorCount: 0
      };
    }

    console.log(`📊 Found ${timesheets.length} timesheets to process`);

    // STEP 2: Separa timesheets protetti da quelli ricalcolabili
    const protectedTimesheets = timesheets.filter(t => t.lunch_manually_set === true);
    const recalculableTimesheets = timesheets.filter(t => t.lunch_manually_set !== true);

    console.log('🔒 PROTECTED:', protectedTimesheets.length);
    console.log('✅ RECALCULABLE:', recalculableTimesheets.length);

    if (protectedTimesheets.length > 0) {
      console.log('🔒 SKIPPING PROTECTED TIMESHEETS:', 
        protectedTimesheets.map(t => ({
          date: t.date,
          lunch_minutes: t.lunch_duration_minutes
        }))
      );
    }

    // STEP 3: Ricalcola solo i NON protetti
    let recalculatedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const timesheet of recalculableTimesheets) {
      try {
        const { error: updateError } = await supabase
          .from('timesheets')
          .update({ 
            updated_at: new Date().toISOString()
          })
          .eq('id', timesheet.id);

        if (updateError) {
          console.error(`❌ ERROR updating timesheet ${timesheet.id}:`, updateError);
          errorCount++;
          errors.push(`${timesheet.date}: ${updateError.message}`);
        } else {
          recalculatedCount++;
          console.log(`✅ Recalculated: ${timesheet.date}`);
        }
      } catch (err) {
        console.error(`❌ EXCEPTION updating timesheet ${timesheet.id}:`, err);
        errorCount++;
        errors.push(`${timesheet.date}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    console.log('🔄 RECALCULATE COMPLETE:', {
      recalculated: recalculatedCount,
      skipped: protectedTimesheets.length,
      errors: errorCount
    });

    return {
      success: errorCount === 0,
      recalculatedCount,
      skippedCount: protectedTimesheets.length,
      errorCount,
      errors: errors.length > 0 ? errors : undefined
    };

  } catch (error) {
    console.error('❌ RECALCULATE FATAL ERROR:', error);
    return {
      success: false,
      recalculatedCount: 0,
      skippedCount: 0,
      errorCount: 1,
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
}

/**
 * Protegge una modifica manuale della pausa pranzo impostando lunch_manually_set = TRUE
 */
export async function protectTimesheetManualEdit(
  timesheetId: string,
  lunchMinutes: number
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('🔒 PROTECT MANUAL EDIT:', { timesheetId, lunchMinutes });

    const { error } = await supabase
      .from('timesheets')
      .update({
        lunch_manually_set: true,
        lunch_duration_minutes: lunchMinutes,
        updated_at: new Date().toISOString()
      })
      .eq('id', timesheetId);

    if (error) {
      console.error('❌ PROTECT ERROR:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ PROTECTION SET: Timesheet', timesheetId, 'is now protected with', lunchMinutes, 'minutes lunch');
    
    return { success: true };

  } catch (error) {
    console.error('❌ PROTECT EXCEPTION:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Rimuove la protezione da un timesheet, permettendo ricalcoli automatici
 */
export async function unlockTimesheetManualEdit(
  timesheetId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('🔓 UNLOCK MANUAL EDIT:', timesheetId);

    const { error } = await supabase
      .from('timesheets')
      .update({
        lunch_manually_set: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', timesheetId);

    if (error) {
      console.error('❌ UNLOCK ERROR:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ PROTECTION REMOVED: Timesheet', timesheetId, 'can now be recalculated');
    
    return { success: true };

  } catch (error) {
    console.error('❌ UNLOCK EXCEPTION:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Ottiene statistiche sulle protezioni manuali per dipendente o globali
 */
export async function getProtectionStats(
  userId?: string
): Promise<{ success: boolean; stats?: ProtectionStats[]; error?: string }> {
  try {
    console.log('📊 GET PROTECTION STATS:', userId ? `for user ${userId}` : 'global');

    let query = supabase
      .from('timesheets')
      .select(`
        user_id,
        lunch_manually_set,
        profiles!inner(first_name, last_name)
      `);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query as any;

    if (error) {
      console.error('❌ STATS ERROR:', error);
      return { success: false, error: error.message };
    }

    if (!data || data.length === 0) {
      return {
        success: true,
        stats: []
      };
    }

    // Raggruppa per utente e calcola stats
    const statsByUser = new Map<string, {
      userId: string;
      userName: string;
      total: number;
      protected: number;
    }>();

    for (const row of data) {
      const key = row.user_id;
      const profile = row.profiles as any;
      const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'Unknown';
      
      if (!statsByUser.has(key)) {
        statsByUser.set(key, {
          userId: key,
          userName,
          total: 0,
          protected: 0
        });
      }

      const stats = statsByUser.get(key)!;
      stats.total++;
      if (row.lunch_manually_set === true) {
        stats.protected++;
      }
    }

    // Converti in array di ProtectionStats
    const result: ProtectionStats[] = Array.from(statsByUser.values()).map(s => ({
      userId: s.userId,
      userName: s.userName,
      totalTimesheets: s.total,
      protectedTimesheets: s.protected,
      unprotectedTimesheets: s.total - s.protected,
      protectionPercentage: s.total > 0 ? Math.round((s.protected / s.total) * 100) : 0
    }));

    console.log('✅ STATS CALCULATED:', result);

    return {
      success: true,
      stats: result
    };

  } catch (error) {
    console.error('❌ STATS EXCEPTION:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}