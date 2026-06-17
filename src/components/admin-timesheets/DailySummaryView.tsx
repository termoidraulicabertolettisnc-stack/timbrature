import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Edit,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import {
  getContractedHoursForDay,
  hasMissingHours,
  formatMissingHours,
} from "@/utils/contractedHours";
import { AbsenceIndicator } from "@/components/AbsenceIndicator";
import type { TimesheetWithProfile } from "@/types/timesheet";
import type { EmployeeSummary } from "./HoursDisplays";

interface DailySummaryViewProps {
  timesheets: TimesheetWithProfile[];
  absences: any[];
  dateFilter: string;
  aggregateTimesheetsByEmployee: () => EmployeeSummary[];
  employeeSettings: any;
  companySettings: any;
  onEditDay?: (
    date: string,
    employee: any,
    timesheet: TimesheetWithProfile,
    sessions: any[],
  ) => void;
  onDeleteTimesheet: (id: string) => void;
  onNavigatePrevious: () => void;
  onNavigateNext: () => void;
  onNavigateToday: () => void;
}

export function DailySummaryView({
  absences,
  dateFilter,
  aggregateTimesheetsByEmployee,
  employeeSettings,
  companySettings,
  onEditDay,
  onDeleteTimesheet,
  onNavigatePrevious,
  onNavigateNext,
  onNavigateToday,
}: DailySummaryViewProps) {
  const relevantEmployees = aggregateTimesheetsByEmployee().filter((employee) => {
    if (employee.timesheets.length > 0) return true;
    const employeeSetting = employeeSettings?.[employee.user_id];
    const contractedHours = getContractedHoursForDay(
      dateFilter,
      employeeSetting,
      companySettings,
    );
    return contractedHours > 0;
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Riepilogo Giornaliero - Tutte le Sessioni
            </CardTitle>
            <CardDescription>
              Visualizzazione aggregata per dipendente con tutte le sessioni multiple
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={onNavigatePrevious}
              title="Giorno precedente"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={onNavigateToday} className="min-w-[80px]">
              Oggi
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={onNavigateNext}
              title="Giorno successivo"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="mt-2 text-sm text-muted-foreground">
          {format(parseISO(dateFilter), "dd MMMM yyyy", { locale: it })}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {relevantEmployees.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nessun timesheet trovato per i criteri selezionati
            </div>
          ) : (
            <div className="space-y-4">
              {relevantEmployees.map((employee) => {
                const employeeSetting = employeeSettings?.[employee.user_id];
                const contractedHours = getContractedHoursForDay(
                  dateFilter,
                  employeeSetting,
                  companySettings,
                );
                const hasNoTimesheets = employee.timesheets.length === 0;
                const workedHours = employee.total_hours;
                const showMissingHoursWarning = hasMissingHours(workedHours, contractedHours);
                const missingHours = contractedHours - workedHours;

                return (
                  <Card
                    key={employee.user_id}
                    className={`border-l-4 ${
                      hasNoTimesheets ? "border-l-red-500 bg-red-50" : "border-l-primary"
                    }`}
                  >
                    <CardContent className="pt-6">
                      {hasNoTimesheets && contractedHours > 0 && (
                        <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg">
                          <div className="flex items-center gap-2 text-red-800">
                            <AlertCircle className="h-5 w-5" />
                            <span className="font-medium">
                              Nessuna timbratura per questo giorno (
                              {contractedHours.toFixed(1)}h previste) - Inserire assenza
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="font-semibold text-lg">
                            {employee.first_name} {employee.last_name}
                          </h3>
                          <p className="text-sm text-muted-foreground">{employee.email}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">
                            {employee.total_hours.toFixed(1)}h totali
                          </Badge>
                          {contractedHours > 0 && (
                            <Badge variant="outline" className="text-muted-foreground">
                              su {contractedHours.toFixed(1)}h contratt.
                            </Badge>
                          )}
                          {showMissingHoursWarning && (
                            <Badge
                              variant="outline"
                              className="bg-orange-50 text-orange-700 border-orange-300"
                            >
                              <AlertCircle className="h-3 w-3 mr-1 inline" />
                              {formatMissingHours(missingHours)}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-purple-600 border-purple-200">
                            {employee.total_sessions || employee.timesheets.length} sessioni
                          </Badge>
                          {employee.overtime_hours > 0 && (
                            <Badge
                              variant="outline"
                              className="text-orange-600 border-orange-200"
                            >
                              {employee.overtime_hours.toFixed(1)}h straord.
                            </Badge>
                          )}
                          {employee.night_hours > 0 && (
                            <Badge variant="outline" className="text-blue-600 border-blue-200">
                              {employee.night_hours.toFixed(1)}h notturne
                            </Badge>
                          )}
                          {employee.meal_vouchers > 0 && (
                            <Badge
                              variant="outline"
                              className="text-green-600 border-green-200"
                            >
                              {employee.meal_vouchers} buoni pasto
                            </Badge>
                          )}
                        </div>
                      </div>

                      <Collapsible>
                        <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                          <ChevronDown className="h-4 w-4" />
                          Dettagli sessioni (
                          {employee.total_sessions || employee.timesheets.length} voci)
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-4 overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Data</TableHead>
                                  <TableHead>Progetto</TableHead>
                                  <TableHead>Orario</TableHead>
                                  <TableHead>Ore</TableHead>
                                  <TableHead>Tipo</TableHead>
                                  <TableHead>Buoni Pasto</TableHead>
                                  <TableHead>Posizione</TableHead>
                                  <TableHead>Azioni</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {employee.timesheets.map((session: any) => (
                                  <TableRow key={session.id}>
                                    <TableCell>
                                      {format(parseISO(session.date), "dd/MM/yyyy")}
                                    </TableCell>
                                    <TableCell>{session.projects?.name || "N/A"}</TableCell>
                                    <TableCell>
                                      <span className="font-mono text-sm">
                                        {session.start_time
                                          ? session.start_time.substring(11, 16)
                                          : "--:--"}{" "}
                                        →{" "}
                                        {session.end_time
                                          ? session.end_time.substring(11, 16)
                                          : "In corso"}
                                      </span>
                                    </TableCell>
                                    <TableCell>
                                      {(() => {
                                        if (session.start_time && session.end_time) {
                                          const start = new Date(session.start_time);
                                          const end = new Date(session.end_time);
                                          const hours =
                                            (end.getTime() - start.getTime()) /
                                            (1000 * 60 * 60);
                                          return hours.toFixed(2) + "h";
                                        }
                                        return (
                                          session.total_hours?.toFixed(2) + "h" || "0.00h"
                                        );
                                      })()}
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="secondary" className="text-xs">
                                        {session.session_type ||
                                          (session.is_absence
                                            ? session.absence_type
                                            : "work")}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>
                                      {session.meal_voucher_earned && (
                                        <Badge className="bg-green-100 text-green-800">
                                          Sì
                                        </Badge>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      {session.start_location_lat &&
                                      session.start_location_lng ? (
                                        <span className="text-xs">
                                          {session.start_location_lat.toFixed(4)},{" "}
                                          {session.start_location_lng.toFixed(4)}
                                        </span>
                                      ) : (
                                        "-"
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex gap-2">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => {
                                            if (onEditDay) {
                                              const employeeData = {
                                                user_id: employee.user_id,
                                                first_name: employee.first_name,
                                                last_name: employee.last_name,
                                                email: employee.email,
                                              };
                                              onEditDay(
                                                session.date,
                                                employeeData,
                                                session,
                                                session.timesheet_sessions || [],
                                              );
                                            }
                                          }}
                                          title="Modifica giornata"
                                        >
                                          <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => onDeleteTimesheet(session.id)}
                                          title="Elimina timesheet"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>

                      {absences.filter((a) => a.user_id === employee.user_id).length > 0 && (
                        <div className="mt-4 pt-4 border-t">
                          <h4 className="font-medium text-sm mb-2">Assenze</h4>
                          <div className="space-y-1">
                            {absences
                              .filter((a) => a.user_id === employee.user_id)
                              .map((absence) => (
                                <div
                                  key={absence.id}
                                  className="flex items-center gap-2 text-sm"
                                >
                                  <AbsenceIndicator absences={[absence]} />
                                  <span className="text-muted-foreground">
                                    {format(parseISO(absence.date), "dd/MM/yyyy", {
                                      locale: it,
                                    })}
                                  </span>
                                  {absence.notes && (
                                    <span className="text-muted-foreground">
                                      - {absence.notes}
                                    </span>
                                  )}
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
