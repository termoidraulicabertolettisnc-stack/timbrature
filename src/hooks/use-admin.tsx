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
        const { data, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('user_id', user.id)
          .single();

        if (error) {
          console.error('❌ Error checking admin role:', error);
          setIsAdmin(false);
        } else {
          const isAdminResult = data?.role === 'amministratore';
          console.log('✅ Admin check result:', { role: data?.role, isAdmin: isAdminResult });
          setIsAdmin(isAdminResult);
        }
      } catch (error) {
        console.error('Error checking admin role:', error);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkAdminRole();
  }, [user, authLoading]);

  return { isAdmin, loading: loading || authLoading };
};