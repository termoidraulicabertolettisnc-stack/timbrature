import React from 'react';
import { Button } from './ui/button';
import { ExcelImportService } from '@/services/ExcelImportService';
import { TimesheetImportService } from '@/services/TimesheetImportService';
import { supabase } from '@/integrations/supabase/client';
import { toast } from './ui/use-toast';

export const TestImportButton = () => {
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

      // First, create or find the test user
      const currentUser = await supabase.auth.getUser();
      if (!currentUser.data.user) {
        throw new Error('User not authenticated');
      }

      const testEmployee = { user_id: currentUser.data.user.id };
      
      console.log('🧪 Calling TimesheetImportService.importTimesheet...');
      
      // Call the import service
      const result = await TimesheetImportService.importTimesheet(testData, testEmployee);
      
      console.log('✅ Import completed successfully:', result);
      
      // Query the result to verify
      const { data: resultTimesheet } = await supabase
        .from('timesheets')
        .select(`
          *,
          timesheet_sessions (*)
        `)
        .eq('id', result.id)
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

  return (
    <Button onClick={testExcelImport} variant="outline">
      🧪 Test Import Lorenzo's Data
    </Button>
  );
};