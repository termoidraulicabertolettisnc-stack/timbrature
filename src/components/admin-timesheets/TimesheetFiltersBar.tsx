import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiEmployeeSelect } from "@/components/MultiEmployeeSelect";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Filter } from "lucide-react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface TimesheetFiltersBarProps {
  employees: any[];
  selectedEmployees: string[];
  setSelectedEmployees: (ids: string[]) => void;
  projects: any[];
  selectedProject: string;
  setSelectedProject: (id: string) => void;
  dateFilter: string;
  setDateFilter: (date: string) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  isCalendarOpen: boolean;
  setIsCalendarOpen: (open: boolean) => void;
}

export function TimesheetFiltersBar({
  employees,
  selectedEmployees,
  setSelectedEmployees,
  projects,
  selectedProject,
  setSelectedProject,
  dateFilter,
  setDateFilter,
  searchTerm,
  setSearchTerm,
  isCalendarOpen,
  setIsCalendarOpen,
}: TimesheetFiltersBarProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="h-5 w-5" />
          Filtri
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Dipendente</label>
            <MultiEmployeeSelect
              employees={employees}
              selectedIds={selectedEmployees}
              onSelectionChange={setSelectedEmployees}
              placeholder="Seleziona dipendenti"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Progetto</label>
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger>
                <SelectValue placeholder="Tutti i progetti" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i progetti</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Data</label>
            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen} modal={false}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !dateFilter && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFilter
                    ? format(parseISO(dateFilter), "dd/MM/yyyy", { locale: it })
                    : "Seleziona data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                <CalendarComponent
                  mode="single"
                  selected={dateFilter ? parseISO(dateFilter) : undefined}
                  defaultMonth={dateFilter ? parseISO(dateFilter) : undefined}
                  onSelect={(date) => {
                    if (date) {
                      setDateFilter(format(date, "yyyy-MM-dd"));
                      setIsCalendarOpen(false);
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Ricerca</label>
            <Input
              placeholder="Cerca dipendente o progetto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
