
-- Enable RLS on backup/log/audit tables with no policies (only service_role can access)
ALTER TABLE public.settings_backup_pre_refactoring ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_sessions_backup_temp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_calculation_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_migration_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_timesheets_cleanup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_timesheet_sessions_cleanup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleanup_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.function_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_calculation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheets_fix_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_staging ENABLE ROW LEVEL SECURITY;

-- Enable RLS on application tables and add admin-only policies
ALTER TABLE public.system_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage system_defaults" ON public.system_defaults FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Authenticated read system_defaults" ON public.system_defaults FOR SELECT TO authenticated USING (true);

ALTER TABLE public.global_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage global_defaults" ON public.global_defaults FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Authenticated read global_defaults" ON public.global_defaults FOR SELECT TO authenticated USING (true);

ALTER TABLE public.settings_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage settings_defaults" ON public.settings_defaults FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Authenticated read settings_defaults" ON public.settings_defaults FOR SELECT TO authenticated USING (true);

ALTER TABLE public.resolved_configurations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage resolved_configurations" ON public.resolved_configurations FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Authenticated read resolved_configurations" ON public.resolved_configurations FOR SELECT TO authenticated USING (true);

ALTER TABLE public.import_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage import_templates" ON public.import_templates FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Authenticated read import_templates" ON public.import_templates FOR SELECT TO authenticated USING (true);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage companies" ON public.companies FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Authenticated read companies" ON public.companies FOR SELECT TO authenticated USING (true);

ALTER TABLE public.company_sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage company_sites" ON public.company_sites FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Authenticated read company_sites" ON public.company_sites FOR SELECT TO authenticated USING (true);
