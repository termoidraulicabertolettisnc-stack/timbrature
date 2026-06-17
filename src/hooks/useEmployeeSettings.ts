import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import {
  saveTemporalEmployeeSettings,
  recalculateTimesheetsFromDate,
} from '@/utils/temporalEmployeeSettings';
import {
  ApplicationType,
  CompanySettings,
  EmployeeBasic,
  EmployeeSettings,
  buildEmptyEmployeeSettings,
} from '@/components/employee-settings/types';

interface UseEmployeeSettingsArgs {
  employee: EmployeeBasic;
  open: boolean;
  onSaved?: () => void;
  onClose: () => void;
}

export function useEmployeeSettings({ employee, open, onSaved, onClose }: UseEmployeeSettingsArgs) {
  const [settings, setSettings] = useState<EmployeeSettings>(() =>
    buildEmptyEmployeeSettings(employee.id, employee.company_id),
  );
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(employee.company_id);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const [applicationType, setApplicationType] = useState<ApplicationType>('from_today');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  useEffect(() => {
    setSelectedCompanyId(employee.company_id);
  }, [employee.id, employee.company_id]);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);

      const { data: companiesData, error: companiesError } = await supabase
        .from('companies')
        .select('id, name')
        .order('name');
      if (companiesError) throw companiesError;
      setCompanies(companiesData || []);

      const { data: companyData, error: companyError } = await supabase
        .from('company_settings')
        .select('*')
        .eq('company_id', selectedCompanyId)
        .maybeSingle();
      if (companyError) throw companyError;

      if (!companyData) {
        const defaultSettings = {
          company_id: selectedCompanyId,
          standard_weekly_hours: { lun: 8, mar: 8, mer: 8, gio: 8, ven: 8, sab: 0, dom: 0 },
          lunch_break_type: '60_minuti' as const,
          lunch_break_min_hours: 6.0,
          saturday_handling: 'trasferta' as const,
          meal_voucher_policy: 'oltre_6_ore' as const,
          night_shift_start: '20:00:00',
          night_shift_end: '05:00:00',
          overtime_monthly_compensation: false,
          business_trip_rate_with_meal: 30.98,
          business_trip_rate_without_meal: 46.48,
          saturday_hourly_rate: 10.0,
          meal_voucher_amount: 8.0,
          daily_allowance_amount: 10.0,
          daily_allowance_policy: 'disabled' as const,
          daily_allowance_min_hours: 6,
          meal_voucher_min_hours: 6,
          enable_entry_tolerance: false,
          standard_start_time: '08:00:00',
          entry_tolerance_minutes: 10,
          enable_overtime_conversion: false,
          default_overtime_conversion_rate: 12.0,
        };
        const { data: newCompanySettings, error: createError } = await supabase
          .from('company_settings')
          .insert([defaultSettings])
          .select()
          .single();
        if (createError) {
          console.error('Error creating company settings:', createError);
          toast.error('Impossibile creare le configurazioni per questa azienda');
        } else {
          setCompanySettings(newCompanySettings as any);
          toast.success('Configurazioni di default create per questa azienda');
        }
      } else {
        setCompanySettings(companyData as any);
      }

      const { data: employeeData, error: employeeError } = await supabase
        .from('employee_settings')
        .select('*')
        .eq('user_id', employee.id)
        .eq('company_id', selectedCompanyId)
        .is('valid_to', null)
        .maybeSingle();
      if (employeeError) throw employeeError;

      if (employeeData) {
        setSettings(employeeData as any);
      } else {
        setSettings(buildEmptyEmployeeSettings(employee.id, selectedCompanyId));
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      toast.error('Errore nel caricamento delle impostazioni');
    } finally {
      setLoading(false);
    }
  }, [employee.id, selectedCompanyId]);

  useEffect(() => {
    if (open && selectedCompanyId) {
      loadSettings();
    }
  }, [open, loadSettings, selectedCompanyId]);

  const updateSetting = useCallback((key: string, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  }, []);

  const resetToDefaults = useCallback(() => {
    setSettings(buildEmptyEmployeeSettings(employee.id, selectedCompanyId));
    setHasChanges(true);
  }, [employee.id, selectedCompanyId]);

  const handleCompanyChange = useCallback((companyId: string) => {
    setSelectedCompanyId(companyId);
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      const { data: sessionCheck } = await supabase.auth.getSession();
      if (!sessionCheck.session) {
        toast.error('Sessione scaduta. Ricarica la pagina e riprova.');
        return;
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ company_id: selectedCompanyId })
        .eq('user_id', employee.id);
      if (profileError) throw profileError;

      const { id, user_id, company_id, ...settingsData } = settings;

      let fromDate: string | undefined;
      if (applicationType === 'from_date' && selectedDate) {
        fromDate = selectedDate.toISOString().split('T')[0];
      }

      const result = await saveTemporalEmployeeSettings(
        employee.id,
        selectedCompanyId,
        settingsData,
        applicationType,
        fromDate,
      );
      if (!result.success) throw new Error(result.error || 'Errore nel salvataggio');

      if (applicationType === 'retroactive') {
        const recalcResult = await recalculateTimesheetsFromDate(employee.id, '1900-01-01');
        if (!recalcResult.success) {
          toast.error('Impostazioni salvate ma ricalcolo fallito: ' + (recalcResult.errors?.[0] || 'Errore sconosciuto'));
        } else {
          toast.success(`Impostazioni salvate! Ricalcolati: ${recalcResult.recalculatedCount} giorni. Modifiche manuali preservate: ${recalcResult.skippedCount}.`);
        }
      } else if (applicationType === 'from_date' && fromDate) {
        const recalcResult = await recalculateTimesheetsFromDate(employee.id, fromDate);
        if (!recalcResult.success) {
          toast.error('Ricalcolo fallito: ' + (recalcResult.errors?.[0] || 'Errore sconosciuto'));
        } else if (recalcResult.recalculatedCount > 0 || recalcResult.skippedCount > 0) {
          toast.success(`Modifiche applicate dal ${format(selectedDate!, 'dd/MM/yyyy', { locale: it })}. Ricalcolati: ${recalcResult.recalculatedCount}, Protetti: ${recalcResult.skippedCount}.`);
        } else {
          toast.success('Impostazioni salvate con successo. Le modifiche si applicano dal ' + format(selectedDate!, 'dd/MM/yyyy', { locale: it }));
        }
      } else {
        toast.success('Impostazioni salvate con successo. Le modifiche si applicano da oggi.');
      }

      setHasChanges(false);
      onSaved?.();
      onClose();
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Errore nel salvataggio delle impostazioni: ' + (error instanceof Error ? error.message : 'Errore sconosciuto'));
    } finally {
      setSaving(false);
    }
  }, [applicationType, employee.id, onClose, onSaved, selectedCompanyId, selectedDate, settings]);

  return {
    settings,
    companySettings,
    companies,
    selectedCompanyId,
    loading,
    saving,
    hasChanges,
    applicationType,
    selectedDate,
    setApplicationType,
    setSelectedDate,
    updateSetting,
    resetToDefaults,
    handleCompanyChange,
    handleSave,
  };
}
