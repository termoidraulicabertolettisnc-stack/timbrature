import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, Authorization, x-client-info, apikey, content-type',
};

interface DeleteEmployeeRequest {
  email: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Validate environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      console.error('❌ Missing required environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client with service role
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Create regular client to verify current user
    const supabase = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Verify current user is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.warn('⚠️ Authentication failed:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get current user's profile and verify admin role
    const { data: currentProfile, error: profileError } = await supabase
      .from('profiles')
      .select('company_id, role')
      .eq('user_id', user.id)
      .single();

    if (profileError) {
      console.error('❌ Profile fetch error:', profileError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch user profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!currentProfile || currentProfile.role !== 'amministratore') {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse and validate request body
    let requestBody: DeleteEmployeeRequest;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { email } = requestBody;
    if (!email || typeof email !== 'string' || !email.trim()) {
      return new Response(
        JSON.stringify({ error: 'Valid email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🗑️ Deleting employee with email:', email);

    // Find user by email using admin client
    const { data: existingUsers, error: listUsersError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listUsersError) {
      console.error('❌ Failed to list users:', listUsersError);
      return new Response(
        JSON.stringify({ error: 'Failed to find user' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userToDelete = existingUsers.users?.find(u => u.email === email);

    if (!userToDelete) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('👤 Found user to delete:', userToDelete.id);

    // Get employee profile to verify company access
    const { data: employeeProfile, error: employeeProfileError } = await supabaseAdmin
      .from('profiles')
      .select('company_id')
      .eq('user_id', userToDelete.id)
      .single();

    if (employeeProfileError) {
      console.error('❌ Employee profile fetch error:', employeeProfileError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch employee profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify admin can delete this employee (same company)
    if (!employeeProfile || employeeProfile.company_id !== currentProfile.company_id) {
      return new Response(
        JSON.stringify({ error: 'Cannot delete employee from different company' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prevent self-deletion
    if (userToDelete.id === user.id) {
      return new Response(
        JSON.stringify({ error: 'Cannot delete your own account' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CASCADE DELETE ALL RELATED DATA
    console.log('🧹 Starting cascade deletion for user:', userToDelete.id);

    const deletionResults: Array<{ table: string; success: boolean; error?: string }> = [];

    // Helper function for deletion with error handling
    const safeDelete = async (tableName: string, deleteOperation: Promise<any>) => {
      try {
        const { error } = await deleteOperation;
        if (error) {
          console.warn(`⚠️ ${tableName} delete error:`, error.message);
          deletionResults.push({ table: tableName, success: false, error: error.message });
        } else {
          console.log(`✅ ${tableName} deleted successfully`);
          deletionResults.push({ table: tableName, success: true });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.warn(`⚠️ ${tableName} delete exception:`, errorMessage);
        deletionResults.push({ table: tableName, success: false, error: errorMessage });
      }
    };

    // 1. Delete location pings
    await safeDelete('location_pings', 
      supabaseAdmin.from('location_pings').delete().eq('user_id', userToDelete.id)
    );

    // 2. Delete employee absences
    await safeDelete('employee_absences', 
      supabaseAdmin.from('employee_absences').delete().eq('user_id', userToDelete.id)
    );

    // 3. Delete employee overtime conversions
    await safeDelete('employee_overtime_conversions', 
      supabaseAdmin.from('employee_overtime_conversions').delete().eq('user_id', userToDelete.id)
    );

    // 4. Delete meal voucher conversions
    await safeDelete('employee_meal_voucher_conversions', 
      supabaseAdmin.from('employee_meal_voucher_conversions').delete().eq('user_id', userToDelete.id)
    );

    // 5. Delete employee settings
    await safeDelete('employee_settings', 
      supabaseAdmin.from('employee_settings').delete().eq('user_id', userToDelete.id)
    );

    // 6. Delete timesheet sessions first (child records) - using JOIN since timesheet_sessions doesn't have user_id
    await safeDelete('timesheet_sessions', 
      supabaseAdmin.rpc('delete_user_timesheet_sessions', { target_user_id: userToDelete.id })
    );

    // 7. Delete timesheets (parent records)
    await safeDelete('timesheets', 
      supabaseAdmin.from('timesheets').delete().eq('user_id', userToDelete.id)
    );

    // 8. Delete audit logs (where user was the one making changes)
    await safeDelete('audit_logs', 
      supabaseAdmin.from('audit_logs').delete().eq('changed_by', userToDelete.id)
    );

    // 9. Delete the profile
    const { error: profileDeleteError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('user_id', userToDelete.id);

    if (profileDeleteError) {
      console.error('❌ Critical: Profile delete error:', profileDeleteError);
      return new Response(
        JSON.stringify({ 
          error: `Failed to delete profile: ${profileDeleteError.message}`,
          deletionResults
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Profile deleted successfully');
    deletionResults.push({ table: 'profiles', success: true });

    // 10. Delete the auth user (final step)
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userToDelete.id);

    if (authDeleteError) {
      console.error('❌ Critical: Auth user delete error:', authDeleteError);
      return new Response(
        JSON.stringify({ 
          error: `Failed to delete auth user: ${authDeleteError.message}`,
          deletionResults
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Auth user deleted successfully');
    console.log('🎉 Employee deletion completed successfully');

    // Check if all deletions were successful
    const failedDeletions = deletionResults.filter(r => !r.success);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Dipendente e tutti i dati correlati eliminati con successo',
        deleted_user_id: userToDelete.id,
        deletion_summary: {
          total_operations: deletionResults.length + 2, // +2 for profile and auth
          successful: deletionResults.filter(r => r.success).length + 2,
          failed: failedDeletions.length,
          failed_operations: failedDeletions
        }
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('💥 Unexpected error in delete-employee function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};

serve(handler);