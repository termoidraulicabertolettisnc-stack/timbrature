import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExportRequest {
  format: 'csv' | 'excel' | 'pdf';
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
    console.log('Export request:', exportRequest);

    // Build date filter
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

    // Build query
    let query = supabase
      .from('timesheets')
      .select(`
        *,
        profiles!inner(first_name, last_name, email),
        projects(name),
        clients(name)
      `)
      .gte('date', startDate)
      .lte('date', endDate);

    if (exportRequest.selectedEmployees.length > 0) {
      query = query.in('user_id', exportRequest.selectedEmployees);
    }

    if (exportRequest.selectedProjects.length > 0) {
      query = query.in('project_id', exportRequest.selectedProjects);
    }

    const { data: timesheets, error } = await query.order('date', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      throw error;
    }

    console.log(`Found ${timesheets?.length || 0} timesheets`);

    // Process data for export
    const processedData = timesheets?.map(timesheet => {
      const row: any = {};
      
      if (exportRequest.includedFields.date) {
        row['Data'] = timesheet.date;
      }
      
      if (exportRequest.includedFields.employee) {
        row['Dipendente'] = `${timesheet.profiles.first_name} ${timesheet.profiles.last_name}`;
      }
      
      if (exportRequest.includedFields.project && timesheet.projects) {
        row['Progetto'] = timesheet.projects.name;
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
    }) || [];

    let fileContent: string;
    let contentType: string;
    let filename: string;

    // Generate file based on format
    if (exportRequest.format === 'csv') {
      fileContent = generateCSV(processedData);
      contentType = 'text/csv';
      filename = `timesheets_${startDate}_${endDate}.csv`;
    } else if (exportRequest.format === 'excel') {
      fileContent = generateExcel(processedData);
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      filename = `timesheets_${startDate}_${endDate}.xlsx`;
    } else {
      fileContent = generatePDF(processedData, startDate, endDate);
      contentType = 'application/pdf';
      filename = `timesheets_${startDate}_${endDate}.pdf`;
    }

    console.log(`Generated ${exportRequest.format} file: ${filename}`);

    return new Response(fileContent, {
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error('Error in generate-export function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function generateCSV(data: any[]): string {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header] || '';
        // Escape commas and quotes
        return typeof value === 'string' && (value.includes(',') || value.includes('"')) 
          ? `"${value.replace(/"/g, '""')}"` 
          : value;
      }).join(',')
    )
  ];
  
  return csvRows.join('\n');
}

function generateExcel(data: any[]): string {
  // For simplicity, we'll generate CSV format for Excel
  // In a real implementation, you'd use a library like exceljs
  const csv = generateCSV(data);
  
  // Return as base64 encoded string - the frontend will handle the blob conversion
  return btoa(unescape(encodeURIComponent(csv)));
}

function generatePDF(data: any[], startDate: string, endDate: string): string {
  // Simple PDF generation - in a real implementation, use jsPDF or similar
  const pdfContent = `
TIMESHEET EXPORT REPORT
Period: ${startDate} to ${endDate}
Generated: ${new Date().toLocaleString('it-IT')}

${data.map((row, index) => {
  const rowText = Object.entries(row)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  return `Record ${index + 1}:\n${rowText}\n`;
}).join('\n')}

Total Records: ${data.length}
  `;
  
  return btoa(unescape(encodeURIComponent(pdfContent)));
}