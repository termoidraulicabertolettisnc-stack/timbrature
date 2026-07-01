import { Button } from "@/components/ui/button";
import { Plus, UserPlus, Users, FileSpreadsheet, Trash2 } from "lucide-react";

interface TimesheetActionsBarProps {
  onNewTimesheet: () => void;
  onNewAbsence: () => void;
  onMassTimesheet: () => void;
  onMassAbsence: () => void;
  onMassDelete: () => void;
  onImport: () => void;
}

export function TimesheetActionsBar({
  onNewTimesheet,
  onNewAbsence,
  onMassTimesheet,
  onMassAbsence,
  onMassDelete,
  onImport,
}: TimesheetActionsBarProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 className="text-3xl font-bold text-foreground">Gestione Timesheet</h2>
        <p className="text-muted-foreground">
          Visualizza e gestisci i timesheet di tutti i dipendenti
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={onNewTimesheet} className="gap-2">
          <Plus className="h-4 w-4" />
          Nuovo Timesheet
        </Button>
        <Button variant="outline" onClick={onNewAbsence} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Aggiungi Assenza
        </Button>
        <Button variant="secondary" onClick={onMassTimesheet} className="gap-2">
          <Users className="h-4 w-4" />
          Presenze Multiple
        </Button>
        <Button variant="secondary" onClick={onMassAbsence} className="gap-2">
          <Users className="h-4 w-4" />
          Assenze Multiple
        </Button>
        <Button variant="destructive" onClick={onMassDelete} className="gap-2">
          <Trash2 className="h-4 w-4" />
          Cancellazione Multipla
        </Button>
        <Button variant="outline" onClick={onImport} className="gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Importa Excel
        </Button>
      </div>
    </div>
  );
}
