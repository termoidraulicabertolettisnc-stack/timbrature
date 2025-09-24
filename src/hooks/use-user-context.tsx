import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface UserContext {
  userRole: 'amministratore' | 'dipendente' | null;
  companyId: string | null;
  loading: boolean;
  error: string | null;
}

export const useUserContext = (): UserContext => {
  const { user, loading: authLoading } = useAuth();
  const [context, setContext] = useState<UserContext>({
    userRole: null,
    companyId: null,
    loading: true,
    error: null
  });

  const fetchUserContext = useCallback(async () => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setContext({
        userRole: null,
        companyId: null,
        loading: false,
        error: null
      });
      return;
    }

    try {
      setContext(prev => ({ ...prev, loading: true, error: null }));

      const { data, error } = await supabase.rpc('get_current_user_context');

      if (error) {
        console.error('❌ Error fetching user context:', error);
        setContext({
          userRole: null,
          companyId: null,
          loading: false,
          error: error.message
        });
      } else if (data && data.length > 0) {
        const userContext = data[0];
        setContext({
          userRole: userContext.user_role,
          companyId: userContext.company_id,
          loading: false,
          error: null
        });
      } else {
        setContext({
          userRole: null,
          companyId: null,
          loading: false,
          error: 'User profile not found'
        });
      }
    } catch (error) {
      console.error('❌ Exception fetching user context:', error);
      setContext({
        userRole: null,
        companyId: null,
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }, [user, authLoading]);

  useEffect(() => {
    fetchUserContext();
  }, [fetchUserContext]);

  return context;
};

// Utility hook to check if user is admin
export const useIsAdmin = () => {
  const { userRole, loading, error } = useUserContext();
  return {
    isAdmin: userRole === 'amministratore',
    loading,
    error
  };
};