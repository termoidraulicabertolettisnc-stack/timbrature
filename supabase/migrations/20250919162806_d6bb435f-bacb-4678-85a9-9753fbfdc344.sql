-- Performance optimization indexes for BusinessTripsDashboard
CREATE INDEX IF NOT EXISTS idx_timesheets_user_date ON public.timesheets(user_id, date);
CREATE INDEX IF NOT EXISTS idx_timesheets_company_date ON public.timesheets(company_id, date) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_timesheets_absence ON public.timesheets(is_absence);

CREATE INDEX IF NOT EXISTS idx_absences_user_date ON public.employee_absences(user_id, date);

CREATE INDEX IF NOT EXISTS idx_holidays_company_date ON public.company_holidays(company_id, date);

CREATE INDEX IF NOT EXISTS idx_profiles_company_active ON public.profiles(company_id, is_active);

CREATE INDEX IF NOT EXISTS idx_meal_conv_user_date ON public.employee_meal_voucher_conversions(user_id, date);

CREATE INDEX IF NOT EXISTS idx_overtime_conv_user_month ON public.employee_overtime_conversions(user_id, month);

CREATE INDEX IF NOT EXISTS idx_employee_settings_user_date ON public.employee_settings(user_id, valid_from, valid_to);