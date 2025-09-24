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

  try {
    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client with service role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Create regular client to verify current user
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Verify current user is admin
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
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

    if (profileError || !currentProfile || currentProfile.role !== 'amministratore') {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { email }: DeleteEmployeeRequest = await req.json();
    console.log('🗑️ Deleting employee with email:', email);

    // Find user by email
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const userToDelete = existingUsers.users?.find(u => u.email === email);

    if (!userToDelete) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('👤 Found user to delete:', userToDelete.id);

    // Get employee profile to verify company access
    const { data: employeeProfile } = await supabaseAdmin
      .from('profiles')
      .select('company_id')
      .eq('user_id', userToDelete.id)
      .single();

    // Verify admin can delete this employee (same company)
    if (!employeeProfile || employeeProfile.company_id !== currentProfile.company_id) {
      return new Response(
        JSON.stringify({ error: 'Cannot delete employee from different company' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CASCADE DELETE ALL RELATED DATA
    console.log('🧹 Starting cascade deletion for user:', userToDelete.id);

    // 1. Delete location pings
    const { error: pingsError } = await supabaseAdmin
      .from('location_pings')
      .delete()
      .eq('user_id', userToDelete.id);
    
    if (pingsError) console.warn('⚠️ Location pings delete:', pingsError.message);
    else console.log('✅ Location pings deleted');

    // 2. Delete timesheet sessions (via timesheets cascade)
    console.log('🔄 Deleting timesheet sessions...');
    
    // 3. Delete timesheets (this will cascade to timesheet_sessions)
    const { error: timesheetsError } = await supabaseAdmin
      .from('timesheets')
      .delete()
      .eq('user_id', userToDelete.id);
    
    if (timesheetsError) console.warn('⚠️ Timesheets delete:', timesheetsError.message);
    else console.log('✅ Timesheets deleted');

    // 4. Delete employee absences
    const { error: absencesError } = await supabaseAdmin
      .from('employee_absences')
      .delete()
      .eq('user_id', userToDelete.id);
    
    if (absencesError) console.warn('⚠️ Employee absences delete:', absencesError.message);
    else console.log('✅ Employee absences deleted');

    // 5. Delete employee overtime conversions
    const { error: overtimeError } = await supabaseAdmin
      .from('employee_overtime_conversions')
      .delete()
      .eq('user_id', userToDelete.id);
    
    if (overtimeError) console.warn('⚠️ Overtime conversions delete:', overtimeError.message);
    else console.log('✅ Overtime conversions deleted');

    // 6. Delete meal voucher conversions
    const { error: vouchersError } = await supabaseAdmin
      .from('employee_meal_voucher_conversions')
      .delete()
      .eq('user_id', userToDelete.id);
    
    if (vouchersError) console.warn('⚠️ Meal voucher conversions delete:', vouchersError.message);
    else console.log('✅ Meal voucher conversions deleted');

    // 7. Delete employee settings
    const { error: settingsError } = await supabaseAdmin
      .from('employee_settings')
      .delete()
      .eq('user_id', userToDelete.id);
    
    if (settingsError) console.warn('⚠️ Employee settings delete:', settingsError.message);
    else console.log('✅ Employee settings deleted');

    // 8. Delete audit logs (where user was the one making changes)
    const { error: auditError } = await supabaseAdmin
      .from('audit_logs')
      .delete()
      .eq('changed_by', userToDelete.id);
    
    if (auditError) console.warn('⚠️ Audit logs delete:', auditError.message);
    else console.log('✅ Audit logs deleted');

    // 9. Finally, delete the profile
    const { error: profileDeleteError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('user_id', userToDelete.id);

    if (profileDeleteError) {
      console.error('❌ Profile delete error:', profileDeleteError);
      return new Response(
        JSON.stringify({ error: `Failed to delete profile: ${profileDeleteError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Profile deleted successfully');

    // 10. Delete the auth user (final step)
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userToDelete.id);

    if (authDeleteError) {
      console.error('❌ Auth user delete error:', authDeleteError);
      return new Response(
        JSON.stringify({ error: `Failed to delete auth user: ${authDeleteError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Auth user deleted successfully');
    console.log('🎉 Employee deletion completed successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Dipendente e tutti i dati correlati eliminati con successo',
        deleted_user_id: userToDelete.id
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('💥 Error in delete-employee function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};

serve(handler);