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

    // Build base query for timesheets
    let timesheetQuery = supabase
      .from('timesheets')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate);

    // Apply filters
    if (exportRequest.selectedEmployees.length > 0) {
      timesheetQuery = timesheetQuery.in('user_id', exportRequest.selectedEmployees);
    }

    if (exportRequest.selectedProjects.length > 0) {
      timesheetQuery = timesheetQuery.in('project_id', exportRequest.selectedProjects);
    }

    // Execute timesheet query
    const { data: timesheets, error: timesheetError } = await timesheetQuery.order('date', { ascending: false });

    if (timesheetError) {
      console.error('Timesheet query error:', timesheetError);
      throw timesheetError;
    }

    console.log(`Found ${timesheets?.length || 0} timesheets`);

    if (!timesheets || timesheets.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Nessun dato trovato per i criteri selezionati',
          data: []
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get unique user IDs and project IDs from timesheets
    const userIds = [...new Set(timesheets.map(t => t.user_id).filter(Boolean))];
    const projectIds = [...new Set(timesheets.map(t => t.project_id).filter(Boolean))];

    // Fetch user profiles
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

    // Fetch projects
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

    console.log(`Found ${profiles.length} profiles and ${projects.length} projects`);

    // Create lookup maps for better performance
    const profileMap = new Map(profiles.map(p => [p.user_id, p]));
    const projectMap = new Map(projects.map(p => [p.id, p]));

    // Process data for export
    const processedData = timesheets.map((timesheet) => {
      const row: any = {};
      
      if (exportRequest.includedFields.date) {
        row['Data'] = timesheet.date;
      }
      
      if (exportRequest.includedFields.employee) {
        const profile = profileMap.get(timesheet.user_id);
        if (profile) {
          row['Dipendente'] = `${profile.first_name} ${profile.last_name}`;
          row['Email'] = profile.email;
        } else {
          row['Dipendente'] = 'N/A';
          row['Email'] = 'N/A';
        }
      }
      
      if (exportRequest.includedFields.project) {
        const project = projectMap.get(timesheet.project_id);
        row['Progetto'] = project ? project.name : 'N/A';
      }
      
      if (exportRequest.includedFields.startTime && timesheet.start_time) {
        row['Ora Inizio'] = new Date(timesheet.start_time).toLocaleTimeString('it-IT', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
      }
      
      if (exportRequest.includedFields.endTime && timesheet.end_time) {
        row['Ora Fine'] = new Date(timesheet.end_time).toLocaleTimeString('it-IT', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
      }
      
      if (exportRequest.includedFields.totalHours) {
        row['Ore Totali'] = timesheet.total_hours || 0;
      }
      
      if (exportRequest.includedFields.overtimeHours) {
        row['Ore Straordinario'] = timesheet.overtime_hours || 0;
      }
      
      if (exportRequest.includedFields.nightHours) {
        row['Ore Notturne'] = timesheet.night_hours || 0;
      }
      
      if (exportRequest.includedFields.notes && timesheet.notes) {
        row['Note'] = timesheet.notes;
      }
      
      if (exportRequest.includedFields.location) {
        if (timesheet.start_location_lat && timesheet.start_location_lng) {
          row['Posizione Inizio'] = `${timesheet.start_location_lat}, ${timesheet.start_location_lng}`;
        }
        if (timesheet.end_location_lat && timesheet.end_location_lng) {
          row['Posizione Fine'] = `${timesheet.end_location_lat}, ${timesheet.end_location_lng}`;
        }
      }
      
      return row;
    });

    console.log(`Successfully processed ${processedData.length} records for export`);

    // Return structured data for frontend processing
    return new Response(
      JSON.stringify({
        success: true,
        data: processedData,
        metadata: {
          startDate,
          endDate,
          totalRecords: processedData.length,
          generatedAt: new Date().toISOString()
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in generate-export function:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
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