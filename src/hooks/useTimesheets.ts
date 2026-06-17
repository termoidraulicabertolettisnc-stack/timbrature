import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { TimesheetWithProfile } from '@/types/timesheet';

interface UseTimesheetsParams {
  dateFilter: string;
  activeView: 'daily' | 'weekly' | 'monthly';
  selectedEmployee?: string;
  selectedProject?: string;
}

/**
 * Converte date da formato SQL a ISO 8601
 * SQL:  "2025-10-20 13:29:55.803+00"
 * ISO:  "2025-10-20T13:29:55.803+00:00"
 */
const convertToISO8601 = (dateStr: string | null): string | null => {
  if (!dateStr) return null;
  
  // Se ha già la T, è già ISO
  if (dateStr.includes('T')) return dateStr;
  
  // Converti spazio in T e aggiungi :00 al timezone se manca
  return dateStr
    .replace(' ', 'T')                    // Spazio → T
    .replace(/\+(\d{2})$/, '+$1:00')      // +00 → +00:00
    .replace(/\-(\d{2})$/, '-$1:00');     // -00 → -00:00
};

/**
 * Normalizza tutte le date nelle sessioni per il frontend
 */
const normalizeTimesheetDates = (timesheets: TimesheetWithProfile[]): TimesheetWithProfile[] => {
  return timesheets.map(timesheet => ({
    ...timesheet,
    timesheet_sessions: timesheet.timesheet_sessions?.map(session => ({
      ...session,
      start_time: convertToISO8601(session.start_time),
      end_time: convertToISO8601(session.end_time),
    })) || []
  }));
};

export function useTimesheets({
  dateFilter,
  activeView,
  selectedEmployee = 'all',
  selectedProject = 'all',
}: UseTimesheetsParams) {
  const queryClient = useQueryClient();

  // Calcola periodo date
  const baseDate = parseISO(dateFilter);
  let startDate: Date;
  let endDate: Date;

  switch (activeView) {
    case 'weekly':
      startDate = startOfWeek(baseDate, { weekStartsOn: 1 });
      endDate = endOfWeek(baseDate, { weekStartsOn: 1 });
      break;
    case 'monthly':
      startDate = startOfMonth(baseDate);
      endDate = endOfMonth(baseDate);
      break;
    default:
      startDate = baseDate;
      endDate = baseDate;
  }

  const startDateStr = format(startDate, 'yyyy-MM-dd');
  const endDateStr = format(endDate, 'yyyy-MM-dd');

  // Query key unica per questa combinazione di filtri
  const queryKey = ['timesheets', startDateStr, endDateStr, selectedEmployee, selectedProject];

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      console.log('🔍 Fetching timesheets from database:', { startDateStr, endDateStr });
      
      let query = supabase
        .from('timesheets')
        .select(`
          *,
          profiles!timesheets_user_id_fkey (
            first_name,
            last_name,
            email
          ),
          projects (
            name
          ),
          timesheet_sessions (
            id,
            session_order,
            start_time,
            end_time,
            session_type,
            notes
          )
        `);

      if (selectedEmployee !== 'all') {
        query = query.eq('user_id', selectedEmployee);
      }

      if (selectedProject !== 'all') {
        query = query.eq('project_id', selectedProject);
      }

      query = query
        .gte('date', startDateStr)
        .lte('date', endDateStr)
        .order('date', { ascending: false })
        .order('start_time', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;
      
      // ✅ Normalizza le date SQL → ISO 8601
      const normalizedData = normalizeTimesheetDates(data as unknown as TimesheetWithProfile[]);
      return normalizedData || [];
    },
  });

  // Funzione per invalidare cache (chiamala dopo mutation)
  const invalidate = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: ['timesheets'] });
  }, [queryClient]);

  return {
    timesheets: data || [],
    isLoading,
    error,
    refetch,
    invalidate,
  };
}
