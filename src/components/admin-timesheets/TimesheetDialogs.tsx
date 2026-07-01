import { TimesheetEditDialog } from "@/components/TimesheetEditDialog";
import { TimesheetInsertDialog } from "@/components/TimesheetInsertDialog";
import { AbsenceInsertDialog } from "@/components/AbsenceInsertDialog";
import { MassAbsenceInsertDialog } from "@/components/MassAbsenceInsertDialog";
import { MassTimesheetInsertDialog } from "@/components/MassTimesheetInsertDialog";
import { MassDeleteDialog } from "@/components/MassDeleteDialog";
import { TimesheetImportDialog } from "@/components/TimesheetImportDialog";
import { DayEditDialog } from "@/components/DayEditDialog";
import type { TimesheetWithProfile } from "@/types/timesheet";

export interface DayEditData {
  date: string;
  employee: any;
  timesheet: TimesheetWithProfile | null;
  sessions: any[];
}

interface TimesheetDialogsProps {
  // Edit
  editDialogOpen: boolean;
  setEditDialogOpen: (open: boolean) => void;
  editingTimesheet: TimesheetWithProfile | null;
  setEditingTimesheet: (t: TimesheetWithProfile | null) => void;
  // Insert
  insertDialogOpen: boolean;
  setInsertDialogOpen: (open: boolean) => void;
  selectedDialogDate: Date;
  preSelectedEmployeeId: string;
  setPreSelectedEmployeeId: (id: string) => void;
  setSelectedTimesheetDate: (date: string) => void;
  // Absence
  absenceDialogOpen: boolean;
  setAbsenceDialogOpen: (open: boolean) => void;
  // Mass
  massAbsenceDialogOpen: boolean;
  setMassAbsenceDialogOpen: (open: boolean) => void;
  massTimesheetDialogOpen: boolean;
  setMassTimesheetDialogOpen: (open: boolean) => void;
  massDeleteDialogOpen: boolean;
  setMassDeleteDialogOpen: (open: boolean) => void;
  // Import
  importDialogOpen: boolean;
  setImportDialogOpen: (open: boolean) => void;
  // Day edit
  dayEditDialogOpen: boolean;
  setDayEditDialogOpen: (open: boolean) => void;
  dayEditData: DayEditData | null;
  setDayEditData: (d: DayEditData | null) => void;
  employeeSettings: { [key: string]: any };
  companySettings: any;
  // Callbacks
  invalidateTimesheets: () => void;
  refreshAbsences: () => Promise<void>;
}

export function TimesheetDialogs(props: TimesheetDialogsProps) {
  const {
    editDialogOpen,
    setEditDialogOpen,
    editingTimesheet,
    setEditingTimesheet,
    insertDialogOpen,
    setInsertDialogOpen,
    selectedDialogDate,
    preSelectedEmployeeId,
    setPreSelectedEmployeeId,
    setSelectedTimesheetDate,
    absenceDialogOpen,
    setAbsenceDialogOpen,
    massAbsenceDialogOpen,
    setMassAbsenceDialogOpen,
    massTimesheetDialogOpen,
    setMassTimesheetDialogOpen,
    massDeleteDialogOpen,
    setMassDeleteDialogOpen,
    importDialogOpen,
    setImportDialogOpen,
    dayEditDialogOpen,
    setDayEditDialogOpen,
    dayEditData,
    setDayEditData,
    employeeSettings,
    companySettings,
    invalidateTimesheets,
    refreshAbsences,
  } = props;

  return (
    <>
      <TimesheetEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        timesheet={editingTimesheet}
        onSuccess={() => {
          invalidateTimesheets();
          setEditDialogOpen(false);
          setEditingTimesheet(null);
        }}
      />

      <TimesheetInsertDialog
        open={insertDialogOpen}
        onOpenChange={(open) => {
          setInsertDialogOpen(open);
          if (!open) {
            setPreSelectedEmployeeId("");
            setSelectedTimesheetDate("");
          }
        }}
        selectedDate={selectedDialogDate}
        preSelectedEmployeeId={preSelectedEmployeeId}
        onSuccess={() => {
          invalidateTimesheets();
          setInsertDialogOpen(false);
          setPreSelectedEmployeeId("");
          setSelectedTimesheetDate("");
        }}
      />

      <AbsenceInsertDialog
        open={absenceDialogOpen}
        onOpenChange={(open) => {
          setAbsenceDialogOpen(open);
          if (!open) {
            setPreSelectedEmployeeId("");
            setSelectedTimesheetDate("");
          }
        }}
        selectedDate={selectedDialogDate}
        preSelectedEmployeeId={preSelectedEmployeeId}
        onSuccess={async () => {
          await Promise.all([invalidateTimesheets(), refreshAbsences()]);
          setAbsenceDialogOpen(false);
          setPreSelectedEmployeeId("");
          setSelectedTimesheetDate("");
        }}
      />

      <MassAbsenceInsertDialog
        open={massAbsenceDialogOpen}
        onOpenChange={setMassAbsenceDialogOpen}
        onSuccess={async () => {
          await Promise.all([invalidateTimesheets(), refreshAbsences()]);
          setMassAbsenceDialogOpen(false);
        }}
      />

      <MassTimesheetInsertDialog
        open={massTimesheetDialogOpen}
        onOpenChange={setMassTimesheetDialogOpen}
        onSuccess={() => {
          invalidateTimesheets();
          refreshAbsences();
          setMassTimesheetDialogOpen(false);
        }}
      />

      <TimesheetImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImportComplete={() => {
          invalidateTimesheets();
        }}
      />

      {dayEditData && (
        <DayEditDialog
          open={dayEditDialogOpen}
          onOpenChange={setDayEditDialogOpen}
          date={dayEditData.date}
          employee={dayEditData.employee}
          timesheet={dayEditData.timesheet}
          sessions={dayEditData.sessions}
          employeeSettings={employeeSettings[dayEditData.employee.user_id]}
          companySettings={companySettings}
          onSuccess={async () => {
            await Promise.all([invalidateTimesheets(), refreshAbsences()]);
            setDayEditDialogOpen(false);
            setDayEditData(null);
          }}
        />
      )}
    </>
  );
}
