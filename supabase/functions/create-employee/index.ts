import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, Authorization, x-client-info, apikey, content-type',
};

interface CreateEmployeeRequest {
  email: string;
  first_name: string;
  last_name: string;
  role: 'dipendente' | 'amministratore';
  is_active: boolean;
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

    // Get current user's profile and company
    const { data: currentProfile, error: profileError } = await supabase
      .from('profiles')
      .select('company_id, role')
      .eq('user_id', user.id)
      .single();

    if (profileError || !currentProfile) {
      return new Response(
        JSON.stringify({ error: 'Profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (currentProfile.role !== 'amministratore') {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { email, first_name, last_name, role, is_active }: CreateEmployeeRequest = await req.json();

    console.log('Creating employee:', { email, first_name, last_name, role, is_active });

    // Create user with admin client
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: false, // User will receive invite email
      user_metadata: {
        first_name,
        last_name
      }
    });

    if (authError) {
      console.error('Auth error:', authError);
      const status = authError.status || (authError.message?.includes('already registered') ? 409 : 500);
      return new Response(
        JSON.stringify({ error: `Failed to create user: ${authError.message}` }),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!authData.user) {
      throw new Error('User creation failed');
    }

    console.log('User created successfully:', authData.user.id);

    // Verify company exists before creating profile
    const { data: companyCheck, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('id')
      .eq('id', currentProfile.company_id)
      .single();

    if (companyError || !companyCheck) {
      console.error('Company not found:', currentProfile.company_id, companyError);
      // Try to clean up the created user
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return new Response(
        JSON.stringify({ error: `Company not found: ${currentProfile.company_id}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Company verified:', companyCheck.id);

    // Create profile with admin client
    const { error: profileInsertError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        user_id: authData.user.id,
        email,
        first_name,
        last_name,
        role,
        is_active,
        company_id: currentProfile.company_id
      });

    if (profileInsertError) {
      console.error('Profile insert error:', profileInsertError);
      // Try to clean up the created user
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return new Response(
        JSON.stringify({ error: `Failed to create profile: ${profileInsertError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Profile created successfully');

    // Try to send invite email (optional - won't block the operation)
    let emailSent = false;
    try {
      const origin = req.headers.get('origin') || Deno.env.get('PUBLIC_SITE_URL') || '';
      const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${origin}/auth`
      });

      if (inviteError) {
        console.warn('Invite email failed:', inviteError);
        emailSent = false;
      } else {
        console.log('Invite email sent successfully');
        emailSent = true;
      }
    } catch (error) {
      console.warn('Error sending invite email:', error);
      emailSent = false;
    }

    const message = emailSent 
      ? 'Dipendente creato con successo. È stata inviata un\'email di invito.'
      : 'Dipendente creato con successo. L\'email di invito non è stata inviata - l\'utente dovrà reimpostare la password manualmente.';

    return new Response(
      JSON.stringify({ 
        success: true, 
        message,
        user_id: authData.user.id,
        email_sent: emailSent
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in create-employee function:', error);
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