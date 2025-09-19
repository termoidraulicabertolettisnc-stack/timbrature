import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useAdmin = () => {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdminRole = async () => {
      console.log('🔍 CheckAdminRole - authLoading:', authLoading, 'user:', user?.email || 'NO USER');
      
      if (authLoading) {
        console.log('🕐 Still loading auth...');
        return;
      }
      
      if (!user) {
        console.log('❌ No user authenticated - setting isAdmin to false');
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        console.log('🔍 Calling is_admin function');
        const { data, error } = await supabase.rpc('is_admin');

        console.log('🔍 Admin function result:', { data, error });

        if (error) {
          console.error('❌ Error checking admin role:', error);
          setIsAdmin(false);
        } else {
          console.log('✅ Admin check result:', { isAdmin: data });
          setIsAdmin(data === true);
        }
      } catch (error) {
        console.error('❌ Exception checking admin role:', error);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkAdminRole();
  }, [user, authLoading]);

  return { isAdmin, loading: loading || authLoading };
};