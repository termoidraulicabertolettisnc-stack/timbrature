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
      
      return (data as unknown as TimesheetWithProfile[]) || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minuti
  });

  // Funzione per invalidare cache (chiamala dopo mutation)
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['timesheets'] });
  };

  return {
    timesheets: data || [],
    isLoading,
    error,
    refetch,
    invalidate,
  };
}
