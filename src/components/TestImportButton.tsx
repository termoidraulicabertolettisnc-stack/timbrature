import React from 'react';
import { Button } from './ui/button';
import { TimesheetImportService } from '@/services/TimesheetImportService';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const TestImportButton = () => {
  const { toast } = useToast();
  
  const testExcelImport = async () => {
    try {
      // Create test data matching Lorenzo's Excel format
      const testData = {
        employee_name: "Lorenzo Cibolini Test",
        codice_fiscale: "TESTLNZ92B18D150O", // Modified to avoid conflicts
        date: "2025-08-08",
        start_time: "2025-08-08T05:16:53.000Z", // UTC conversion of 07:16:53 Europe/Rome
        end_time: "2025-08-08T15:32:22.000Z",   // UTC conversion of 17:32:22 Europe/Rome
        clockInTimes: [
          "2025-08-08T05:16:53.000Z",  // 07:16:53 Europe/Rome
          "2025-08-08T10:48:52.000Z"   // 12:48:52 Europe/Rome
        ],
        clockOutTimes: [
          "2025-08-08T10:30:57.000Z",  // 12:30:57 Europe/Rome  
          "2025-08-08T15:32:22.000Z"   // 17:32:22 Europe/Rome
        ],
        total_hours: 9.95, // Expected from Excel
        start_location_lat: 45.1676899,
        start_location_lng: 10.0279673,
        end_location_lat: 45.1676439,
        end_location_lng: 10.0278867
      };

      console.log('🧪 TESTING EXCEL IMPORT SIMULATION');
      console.log('📋 Test data:', testData);

      // Find Lorenzo employee (same logic as TimesheetImportDialog)
      const currentUser = await supabase.auth.getUser();
      if (!currentUser.data.user) {
        throw new Error('User not authenticated');
      }

      const { data: company } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', currentUser.data.user.id)
        .single();
      
      const { data: lorenzo } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name')
        .eq('company_id', company?.company_id)
        .ilike('first_name', 'Lorenzo%')
        .single();

      if (!lorenzo) {
        throw new Error('Lorenzo not found in company');
      }

      const testEmployee = { user_id: lorenzo.user_id };
      
      console.log('🧪 Calling TimesheetImportService.importTimesheet...');
      
      // Call the import service
      const result = await TimesheetImportService.importTimesheet(testData, testEmployee);
      
      console.log('✅ Import completed successfully:', result);
      
      // Query the result to verify (handle different return formats)
      const createdId = (result as any).id ?? (result as any).timesheetId ?? result.id;
      const { data: resultTimesheet } = await supabase
        .from('timesheets')
        .select(`
          *,
          timesheet_sessions (*)
        `)
        .eq('id', createdId)
        .single();
        
      console.log('🔍 Final result in database:', resultTimesheet);
      
      toast({
        title: "Test Import Successful!",
        description: `Created ${resultTimesheet?.timesheet_sessions?.length || 0} sessions with ${resultTimesheet?.total_hours || 0}h total`,
      });
      
    } catch (error) {
      console.error('❌ Test import failed:', error);
      toast({
        title: "Test Import Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    }
  };

  const cleanupLorenzo = async () => {
    try {
      const currentUser = await supabase.auth.getUser();
      if (!currentUser.data.user) {
        throw new Error('User not authenticated');
      }

      const { data: company } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', currentUser.data.user.id)
        .single();
      
      const { data: lorenzo } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name')
        .eq('company_id', company?.company_id)
        .ilike('first_name', 'Lorenzo%')
        .single();

      if (!lorenzo) {
        throw new Error('Lorenzo not found in company');
      }

      // Delete timesheets for August 2025
      const { data: deletedTimesheets } = await supabase
        .from('timesheets')
        .delete()
        .eq('user_id', lorenzo.user_id)
        .gte('date', '2025-08-01')
        .lte('date', '2025-08-31')
        .select('id');

      console.log('🗑️ Deleted timesheets:', deletedTimesheets);

      toast({
        title: "Cleanup completato",
        description: `Eliminati ${deletedTimesheets?.length || 0} timesheets di Lorenzo per agosto 2025`,
      });

    } catch (error) {
      console.error('❌ Cleanup failed:', error);
      toast({
        title: "Cleanup fallito",
        description: error instanceof Error ? error.message : "Errore sconosciuto",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="flex gap-2">
      <Button onClick={cleanupLorenzo} variant="destructive" size="sm">
        🗑️ Pulisci dati Lorenzo
      </Button>
      <Button onClick={testExcelImport} variant="outline">
        🧪 Test Import Lorenzo's Data
      </Button>
    </div>
  );
};