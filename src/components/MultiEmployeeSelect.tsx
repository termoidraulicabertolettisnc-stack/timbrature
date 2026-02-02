import React, { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, Search, X, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface Employee {
  user_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  employee_id?: string;
  employee_name?: string;
}

interface MultiEmployeeSelectProps {
  employees: Employee[];
  selectedIds: string[];
  onSelectionChange: (selectedIds: string[]) => void;
  placeholder?: string;
  className?: string;
  showAllOption?: boolean;
  allOptionLabel?: string;
  disabled?: boolean;
}

export function MultiEmployeeSelect({
  employees,
  selectedIds,
  onSelectionChange,
  placeholder = 'Seleziona dipendenti',
  className,
  showAllOption = true,
  allOptionLabel = 'Tutti i dipendenti',
  disabled = false,
}: MultiEmployeeSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Normalizza i dipendenti per supportare diversi formati e ordina alfabeticamente
  const normalizedEmployees = useMemo(() => {
    return employees.map(emp => ({
      id: emp.user_id || emp.employee_id || '',
      name: emp.employee_name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim(),
      email: emp.email || '',
      sortKey: emp.last_name && emp.first_name 
        ? `${emp.last_name} ${emp.first_name}`.toLowerCase()
        : (emp.employee_name || `${emp.first_name || ''} ${emp.last_name || ''}`).toLowerCase(),
    })).sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'it'));
  }, [employees]);

  // Filtra i dipendenti basato sulla ricerca
  const filteredEmployees = useMemo(() => {
    if (!searchTerm) return normalizedEmployees;
    const term = searchTerm.toLowerCase();
    return normalizedEmployees.filter(
      emp => emp.name.toLowerCase().includes(term) || emp.email.toLowerCase().includes(term)
    );
  }, [normalizedEmployees, searchTerm]);

  // Gestione selezione "Tutti"
  const isAllSelected = selectedIds.length === 0 || selectedIds.includes('all');

  const handleSelectAll = () => {
    onSelectionChange(['all']);
  };

  const handleEmployeeToggle = (employeeId: string) => {
    let newSelection: string[];
    
    if (isAllSelected) {
      // Se "Tutti" è selezionato, deseleziona e seleziona solo questo dipendente
      newSelection = [employeeId];
    } else if (selectedIds.includes(employeeId)) {
      // Rimuovi dalla selezione
      newSelection = selectedIds.filter(id => id !== employeeId);
      // Se non rimane nessuno, torna a "Tutti"
      if (newSelection.length === 0) {
        newSelection = ['all'];
      }
    } else {
      // Aggiungi alla selezione
      newSelection = [...selectedIds.filter(id => id !== 'all'), employeeId];
    }
    
    onSelectionChange(newSelection);
  };

  const handleSelectAllEmployees = () => {
    const allIds = normalizedEmployees.map(emp => emp.id);
    onSelectionChange(allIds);
  };

  const handleDeselectAll = () => {
    onSelectionChange(['all']);
  };

  // Testo visualizzato nel trigger
  const displayText = useMemo(() => {
    if (isAllSelected) return allOptionLabel;
    if (selectedIds.length === 1) {
      const emp = normalizedEmployees.find(e => e.id === selectedIds[0]);
      return emp?.name || 'Selezionato';
    }
    return `${selectedIds.length} dipendenti selezionati`;
  }, [isAllSelected, selectedIds, normalizedEmployees, allOptionLabel]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
          disabled={disabled}
        >
          <div className="flex items-center gap-2 truncate">
            <Users className="h-4 w-4 shrink-0 opacity-50" />
            <span className="truncate">{displayText}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        {/* Search Input */}
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca dipendente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
            {searchTerm && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1 h-7 w-7 p-0"
                onClick={() => setSearchTerm('')}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2 p-2 border-b">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            onClick={handleSelectAllEmployees}
          >
            Seleziona tutti
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            onClick={handleDeselectAll}
          >
            Deseleziona
          </Button>
        </div>

        {/* Employee List */}
        <ScrollArea className="h-[250px]">
          <div className="p-2">
            {/* All Option */}
            {showAllOption && !searchTerm && (
              <div
                className={cn(
                  "flex items-center gap-2 p-2 rounded-sm cursor-pointer hover:bg-accent",
                  isAllSelected && "bg-accent"
                )}
                onClick={handleSelectAll}
              >
                <div className={cn(
                  "h-4 w-4 border rounded-sm flex items-center justify-center",
                  isAllSelected ? "bg-primary border-primary" : "border-input"
                )}>
                  {isAllSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                <span className="font-medium">{allOptionLabel}</span>
              </div>
            )}

            {/* Employee Items */}
            {filteredEmployees.length === 0 ? (
              <div className="text-center text-muted-foreground py-6">
                Nessun dipendente trovato
              </div>
            ) : (
              filteredEmployees.map((employee) => {
                const isSelected = !isAllSelected && selectedIds.includes(employee.id);
                return (
                  <div
                    key={employee.id}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-sm cursor-pointer hover:bg-accent",
                      isSelected && "bg-accent"
                    )}
                    onClick={() => handleEmployeeToggle(employee.id)}
                  >
                    <div className={cn(
                      "h-4 w-4 border rounded-sm flex items-center justify-center shrink-0",
                      isSelected ? "bg-primary border-primary" : "border-input"
                    )}>
                      {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{employee.name}</span>
                      {employee.email && (
                        <span className="text-xs text-muted-foreground truncate">{employee.email}</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        {/* Selected Count */}
        {!isAllSelected && selectedIds.length > 0 && (
          <div className="p-2 border-t">
            <Badge variant="secondary" className="w-full justify-center">
              {selectedIds.length} dipendente/i selezionato/i
            </Badge>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
