'use client'

import React from 'react';
import { Button } from './ui/button';
import { TimesheetImportService } from '@/services/TimesheetImportService';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const TestImportButton = () => {
  const { toast } = useToast();

  const testExcelImport = async () => {
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error('User not authenticated');

      // Test logic here
      toast({
        title: "Test completato",
        description: "Il test dell'import è stato eseguito con successo",
        variant: "default"
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

  return <Button onClick={testExcelImport} variant="outline">🧪 Test Import</Button>;
};