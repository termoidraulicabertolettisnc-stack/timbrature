import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExportRequest {
  dateRange: 'today' | 'thisWeek' | 'thisMonth' | 'custom';
  startDate?: string;
  endDate?: string;
  selectedEmployees: string[];
  selectedProjects: string[];
  format: 'csv' | 'excel' | 'pdf' | 'payroll';
  includedFields: {
    date: boolean;
    employee: boolean;
    project: boolean;
    startTime: boolean;
    endTime: boolean;
    totalHours: boolean;
    overtimeHours: boolean;
    nightHours: boolean;
    notes: boolean;
    location: boolean;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const exportRequest: ExportRequest = await req.json();
    console.log('Export request received:', exportRequest);

    // Calculate date range
    let startDate: string, endDate: string;
    const today = new Date();
    
    if (exportRequest.dateRange === 'custom' && exportRequest.startDate && exportRequest.endDate) {
      startDate = exportRequest.startDate;
      endDate = exportRequest.endDate;
    } else if (exportRequest.dateRange === 'today') {
      startDate = endDate = today.toISOString().split('T')[0];
    } else if (exportRequest.dateRange === 'thisWeek') {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay() + 1);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      startDate = startOfWeek.toISOString().split('T')[0];
      endDate = endOfWeek.toISOString().split('T')[0];
    } else { // thisMonth
      startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
    }

    console.log(`Exporting data from ${startDate} to ${endDate}`);

    // Get employee filter
    const employeeFilter = exportRequest.selectedEmployees.length > 0 
      ? exportRequest.selectedEmployees 
      : [];

    // Get project filter (not used for payroll format)
    const projectFilter = exportRequest.format !== 'payroll' && exportRequest.selectedProjects.length > 0 
      ? exportRequest.selectedProjects 
      : [];

    // Build base query for timesheets (without joins to avoid ambiguity)
    let timesheetQuery = supabase
      .from('timesheets')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate);

    if (employeeFilter.length > 0) {
      timesheetQuery = timesheetQuery.in('user_id', employeeFilter);
    }

    if (exportRequest.format !== 'payroll' && projectFilter.length > 0) {
      timesheetQuery = timesheetQuery.in('project_id', projectFilter);
    }

    // Execute timesheet query
    const { data: timesheets, error: timesheetError } = await timesheetQuery.order('date', { ascending: false });

    if (timesheetError) {
      console.error('Timesheet query error:', timesheetError);
      throw timesheetError;
    }

    console.log(`Found ${timesheets?.length || 0} timesheets`);

    if (!timesheets || timesheets.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get unique user IDs and project IDs from timesheets
    const userIds = [...new Set(timesheets.map(t => t.user_id).filter(Boolean))];
    const projectIds = [...new Set(timesheets.map(t => t.project_id).filter(Boolean))];

    // Fetch user profiles separately
    let profiles: any[] = [];
    if (userIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, email')
        .in('user_id', userIds);

      if (profilesError) {
        console.error('Profiles query error:', profilesError);
      } else {
        profiles = profilesData || [];
      }
    }

    // Fetch projects separately
    let projects: any[] = [];
    if (projectIds.length > 0) {
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('id, name')
        .in('id', projectIds);

      if (projectsError) {
        console.error('Projects query error:', projectsError);
      } else {
        projects = projectsData || [];
      }
    }

    // Get employee absences for payroll format
    let absences: any[] = [];
    if (exportRequest.format === 'payroll' && employeeFilter.length > 0) {
      const { data: absencesData, error: absenceError } = await supabase
        .from('employee_absences')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .in('user_id', employeeFilter);

      if (absenceError) {
        console.error('Error fetching absences:', absenceError);
      } else {
        absences = absencesData || [];
      }
    }

    // Get employee settings for payroll format
    let employeeSettings: any[] = [];
    if (exportRequest.format === 'payroll' && employeeFilter.length > 0) {
      const { data: settingsData, error: settingsError } = await supabase
        .from('employee_settings')
        .select('*')
        .in('user_id', employeeFilter);

      if (settingsError) {
        console.error('Error fetching employee settings:', settingsError);
      } else {
        employeeSettings = settingsData || [];
      }
    }

    console.log(`Found ${profiles.length} profiles and ${projects.length} projects`);

    // Create lookup maps for better performance
    const profileMap = new Map(profiles.map(p => [p.user_id, p]));
    const projectMap = new Map(projects.map(p => [p.id, p]));

    // Process data for export
    const combinedData: any[] = [];
    const { includedFields } = exportRequest;
    
    // Add timesheets
    timesheets.forEach((timesheet: any) => {
      const profile = profileMap.get(timesheet.user_id);
      const project = projectMap.get(timesheet.project_id);
      const employeeName = profile ? `${profile.first_name} ${profile.last_name}` : 'Unknown';
      const settings = employeeSettings?.find(s => s.user_id === timesheet.user_id);
      
      const record: any = {
        employee_id: timesheet.user_id,
        employee: employeeName,
        date: timesheet.date,
        is_absence: false,
        total_hours: timesheet.total_hours || 0,
        overtime_hours: timesheet.overtime_hours || 0,
        meal_voucher_earned: timesheet.meal_voucher_earned || false,
        employee_settings: settings
      };
      
      // Add fields based on format and includedFields
      if (exportRequest.format !== 'payroll') {
        // Regular export formats
        if (includedFields.date) record['Data'] = timesheet.date;
        if (includedFields.employee) {
          record['Dipendente'] = employeeName;
          record['Email'] = profile?.email || 'N/A';
        }
        if (includedFields.project) {
          record['Progetto'] = project?.name || 'N/A';
        }
        if (includedFields.startTime && timesheet.start_time) {
          record['Ora Inizio'] = new Date(timesheet.start_time).toLocaleTimeString('it-IT', { 
            hour: '2-digit', 
            minute: '2-digit' 
          });
        }
        if (includedFields.endTime && timesheet.end_time) {
          record['Ora Fine'] = new Date(timesheet.end_time).toLocaleTimeString('it-IT', { 
            hour: '2-digit', 
            minute: '2-digit' 
          });
        }
        if (includedFields.totalHours) record['Ore Totali'] = timesheet.total_hours || 0;
        if (includedFields.overtimeHours) record['Ore Straordinario'] = timesheet.overtime_hours || 0;
        if (includedFields.nightHours) record['Ore Notturne'] = timesheet.night_hours || 0;
        if (includedFields.notes && timesheet.notes) record['Note'] = timesheet.notes;
        if (includedFields.location) {
          if (timesheet.start_location_lat && timesheet.start_location_lng) {
            record['Posizione Inizio'] = `${timesheet.start_location_lat}, ${timesheet.start_location_lng}`;
          }
          if (timesheet.end_location_lat && timesheet.end_location_lng) {
            record['Posizione Fine'] = `${timesheet.end_location_lat}, ${timesheet.end_location_lng}`;
          }
        }
      }
      
      combinedData.push(record);
    });
    
    // Add absences (only for payroll format)
    if (exportRequest.format === 'payroll' && absences.length > 0) {
      absences.forEach((absence: any) => {
        const profile = profileMap.get(absence.user_id);
        const employeeName = profile ? `${profile.first_name} ${profile.last_name}` : 'Unknown';
        const settings = employeeSettings?.find(s => s.user_id === absence.user_id);
        
        const record: any = {
          employee_id: absence.user_id,
          employee: employeeName,
          date: absence.date,
          is_absence: true,
          absence_type: absence.absence_type,
          absence_hours: absence.hours || 8,
          total_hours: 0,
          overtime_hours: 0,
          meal_voucher_earned: false,
          employee_settings: settings
        };
        
        combinedData.push(record);
      });
    }

    console.log(`Successfully processed ${combinedData.length} records for export`);

    return new Response(JSON.stringify(combinedData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-export function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        data: []
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});