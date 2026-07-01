import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, Authorization, x-client-info, apikey, content-type',
};

interface ImportRow {
  employee_code: string;
  date: string;
  start_time: string;
  end_time: string;
  pause_minutes?: number;
  notes?: string;
  site_code?: string;
  project_code?: string;
  source_row_index?: number;
}

interface ImportRequest {
  action: 'validate' | 'execute';
  rows: ImportRow[];
  mode?: 'all_or_nothing' | 'partial';
}

const parseDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return { year: Number(year), month: Number(month), day: Number(day) };
};

const parseTime = (value: string) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, hour, minute] = match;
  const parsed = { hour: Number(hour), minute: Number(minute) };
  if (parsed.hour > 23 || parsed.minute > 59) return null;
  return parsed;
};

const addDays = (date: string, days: number) => {
  const parsed = parseDate(date);
  if (!parsed) return date;
  const utc = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return utc.toISOString().slice(0, 10);
};

const getTimeZoneOffsetMs = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );

  return asUtc - date.getTime();
};

const romeLocalToUtcIso = (date: string, time: string) => {
  const parsedDate = parseDate(date);
  const parsedTime = parseTime(time);
  if (!parsedDate || !parsedTime) return null;

  let utcMs = Date.UTC(
    parsedDate.year,
    parsedDate.month - 1,
    parsedDate.day,
    parsedTime.hour,
    parsedTime.minute,
    0,
  );

  for (let i = 0; i < 3; i += 1) {
    utcMs = Date.UTC(
      parsedDate.year,
      parsedDate.month - 1,
      parsedDate.day,
      parsedTime.hour,
      parsedTime.minute,
      0,
    ) - getTimeZoneOffsetMs(new Date(utcMs), 'Europe/Rome');
  }

  return new Date(utcMs).toISOString();
};

const calculateHours = (date: string, startTime: string, endTime: string) => {
  const start = romeLocalToUtcIso(date, startTime);
  const endDate = endTime < startTime ? addDays(date, 1) : date;
  const end = romeLocalToUtcIso(endDate, endTime);
  if (!start || !end) return null;
  return (new Date(end).getTime() - new Date(start).getTime()) / 36e5;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: currentProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (profileError || currentProfile?.role !== 'amministratore') {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action, rows, mode = 'all_or_nothing' }: ImportRequest = await req.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Nessuna riga da importare' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fiscalCodes = [...new Set(rows.map(row => row.employee_code?.trim()).filter(Boolean))];
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('user_id, first_name, last_name, codice_fiscale')
      .in('codice_fiscale', fiscalCodes);

    if (profilesError) throw profilesError;

    const profileByCode = new Map((profiles ?? []).map(profile => [profile.codice_fiscale, profile]));

    const results = rows.map((row, index) => {
      const messages: Array<{ type: 'error' | 'warning' | 'info'; field: string; message: string }> = [];
      const employeeCode = row.employee_code?.trim();
      const profile = employeeCode ? profileByCode.get(employeeCode) : null;
      const hours = calculateHours(row.date, row.start_time, row.end_time);

      if (!employeeCode) messages.push({ type: 'error', field: 'employee_code', message: 'Codice fiscale mancante' });
      if (employeeCode && !profile) messages.push({ type: 'error', field: 'employee_code', message: 'Dipendente non trovato' });
      if (!parseDate(row.date)) messages.push({ type: 'error', field: 'date', message: 'Data non valida' });
      if (!parseTime(row.start_time)) messages.push({ type: 'error', field: 'start_time', message: 'Ora ingresso non valida' });
      if (!parseTime(row.end_time)) messages.push({ type: 'error', field: 'end_time', message: 'Ora uscita non valida' });
      if (hours !== null && hours <= 0) messages.push({ type: 'error', field: 'hours', message: 'Durata non valida' });

      return {
        row_number: index + 1,
        status: messages.some(message => message.type === 'error') ? 'error' : 'valid',
        messages,
        data: row,
        employee_name: profile ? `${profile.first_name} ${profile.last_name}` : undefined,
        calculated_hours: hours,
        user_id: profile?.user_id,
      };
    });

    const stats = {
      total: results.length,
      valid: results.filter(result => result.status === 'valid').length,
      warnings: results.filter(result => result.status === 'warning').length,
      errors: results.filter(result => result.status === 'error').length,
    };

    if (action === 'validate') {
      return new Response(JSON.stringify({ results, stats }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (mode === 'all_or_nothing' && stats.errors > 0) {
      return new Response(JSON.stringify({ success_count: 0, error_count: stats.errors, warning_count: stats.warnings, results }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let successCount = 0;
    let errorCount = 0;

    for (const result of results) {
      if (result.status === 'error') continue;

      try {
        const row = result.data;
        const endDate = row.end_time < row.start_time ? addDays(row.date, 1) : row.date;
        const startTimestamp = romeLocalToUtcIso(row.date, row.start_time);
        const endTimestamp = romeLocalToUtcIso(endDate, row.end_time);

        if (!result.user_id || !startTimestamp || !endTimestamp) {
          errorCount += 1;
          continue;
        }

        const { data: existingTimesheet, error: existingError } = await supabaseAdmin
          .from('timesheets')
          .select('id, notes')
          .eq('user_id', result.user_id)
          .eq('date', row.date)
          .maybeSingle();

        if (existingError) throw existingError;

        let timesheetId = existingTimesheet?.id;
        if (timesheetId) {
          const nextNotes = existingTimesheet.notes?.includes('Import')
            ? existingTimesheet.notes
            : `${existingTimesheet.notes ? `${existingTimesheet.notes} | ` : ''}Import aggiuntivo`;

          const { error: updateError } = await supabaseAdmin
            .from('timesheets')
            .update({ updated_at: new Date().toISOString(), notes: nextNotes })
            .eq('id', timesheetId);

          if (updateError) throw updateError;
        } else {
          const { data: insertedTimesheet, error: insertError } = await supabaseAdmin
            .from('timesheets')
            .insert({
              user_id: result.user_id,
              date: row.date,
              created_by: user.id,
              notes: `Import Excel - ${new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Rome' }).format(new Date())}`,
            })
            .select('id')
            .single();

          if (insertError) throw insertError;
          timesheetId = insertedTimesheet.id;
        }

        const { data: existingSessions, error: orderError } = await supabaseAdmin
          .from('timesheet_sessions')
          .select('session_order')
          .eq('timesheet_id', timesheetId)
          .order('session_order', { ascending: false })
          .limit(1);

        if (orderError) throw orderError;

        const nextOrder = ((existingSessions?.[0]?.session_order as number | null) ?? -1) + 1;

        const { error: sessionError } = await supabaseAdmin
          .from('timesheet_sessions')
          .insert({
            timesheet_id: timesheetId,
            start_time: startTimestamp,
            end_time: endTimestamp,
            pause_minutes: row.pause_minutes ?? null,
            notes: row.notes ?? null,
            session_order: nextOrder,
          });

        if (sessionError) throw sessionError;
        successCount += 1;
      } catch (error) {
        console.error('Import row error:', error);
        errorCount += 1;
        if (mode === 'all_or_nothing') throw error;
      }
    }

    return new Response(JSON.stringify({
      success_count: successCount,
      error_count: errorCount,
      warning_count: stats.warnings,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in import-timesheets function:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});