import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AdminStatus {
  isAdmin: boolean | null;
  loading: boolean;
  error: string | null;
}

export const useAdmin = (): AdminStatus => {
  const { user, loading: authLoading } = useAuth();
  const [adminStatus, setAdminStatus] = useState<AdminStatus>({
    isAdmin: null,
    loading: true,
    error: null
  });

  const checkAdminRole = useCallback(async () => {
    if (authLoading) {
      return;
    }
    
    if (!user) {
      setAdminStatus({
        isAdmin: false,
        loading: false,
        error: null
      });
      return;
    }

    try {
      setAdminStatus(prev => ({ ...prev, loading: true, error: null }));
      
      const { data, error } = await supabase.rpc('is_user_admin');

      if (error) {
        console.error('❌ Error checking admin role:', error);
        setAdminStatus({
          isAdmin: false,
          loading: false,
          error: error.message
        });
      } else {
        setAdminStatus({
          isAdmin: data === true,
          loading: false,
          error: null
        });
      }
    } catch (error) {
      console.error('❌ Exception checking admin role:', error);
      setAdminStatus({
        isAdmin: false,
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }, [user, authLoading]);

  useEffect(() => {
    checkAdminRole();
  }, [checkAdminRole]);

  return adminStatus;
};