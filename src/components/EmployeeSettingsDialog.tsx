import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, RotateCcw, Save } from 'lucide-react';
import { useEmployeeSettings } from '@/hooks/useEmployeeSettings';
import { EmployeeBasic } from '@/components/employee-settings/types';
import { CompanyAndHoursSection } from '@/components/employee-settings/sections/CompanyAndHoursSection';
import { LunchBreakSection } from '@/components/employee-settings/sections/LunchBreakSection';
import { HoursPolicySection } from '@/components/employee-settings/sections/HoursPolicySection';
import { MealAndAllowanceSection } from '@/components/employee-settings/sections/MealAndAllowanceSection';
import { TripAndAgencySection } from '@/components/employee-settings/sections/TripAndAgencySection';
import { EntryToleranceSection } from '@/components/employee-settings/sections/EntryToleranceSection';
import { OvertimeConversionSection } from '@/components/employee-settings/sections/OvertimeConversionSection';
import { ApplicationDateSection } from '@/components/employee-settings/sections/ApplicationDateSection';

interface EmployeeSettingsDialogProps {
  employee: EmployeeBasic;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEmployeeUpdate?: () => void;
}

export const EmployeeSettingsDialog = ({
  employee,
  open,
  onOpenChange,
  onEmployeeUpdate,
}: EmployeeSettingsDialogProps) => {
  const {
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
  } = useEmployeeSettings({
    employee,
    open,
    onSaved: onEmployeeUpdate,
    onClose: () => onOpenChange(false),
  });

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="mt-2 text-sm text-muted-foreground">Caricamento impostazioni...</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Impostazioni per {employee.first_name} {employee.last_name}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Configura impostazioni specifiche per questo dipendente. I valori non impostati useranno le
            impostazioni aziendali.
          </p>
        </DialogHeader>

        <div className="space-y-6">
          {hasChanges && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Ci sono modifiche non salvate. Ricordati di salvare prima di chiudere.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end">
            <Button variant="outline" onClick={resetToDefaults} className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              Ripristina Valori Azienda
            </Button>
          </div>

          <CompanyAndHoursSection
            settings={settings}
            companySettings={companySettings}
            companies={companies}
            selectedCompanyId={selectedCompanyId}
            onCompanyChange={handleCompanyChange}
            updateSetting={updateSetting}
          />

          <LunchBreakSection
            settings={settings}
            companySettings={companySettings}
            updateSetting={updateSetting}
          />

          <HoursPolicySection
            settings={settings}
            companySettings={companySettings}
            updateSetting={updateSetting}
          />

          <MealAndAllowanceSection
            settings={settings}
            companySettings={companySettings}
            updateSetting={updateSetting}
          />

          <TripAndAgencySection
            settings={settings}
            companySettings={companySettings}
            updateSetting={updateSetting}
          />

          <EntryToleranceSection
            settings={settings}
            companySettings={companySettings}
            updateSetting={updateSetting}
          />

          <OvertimeConversionSection
            settings={settings}
            companySettings={companySettings}
            updateSetting={updateSetting}
          />

          <ApplicationDateSection
            applicationType={applicationType}
            setApplicationType={setApplicationType}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={handleSave} disabled={saving || !hasChanges} className="flex items-center gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Salvataggio...' : 'Salva Impostazioni'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
