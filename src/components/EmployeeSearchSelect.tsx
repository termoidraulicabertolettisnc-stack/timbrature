import React, { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export interface Employee {
  user_id: string;
  first_name: string;
  last_name: string;
  email?: string;
}

interface EmployeeSearchSelectProps {
  employees: Employee[];
  selectedId: string;
  onSelect: (employeeId: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function EmployeeSearchSelect({
  employees,
  selectedId,
  onSelect,
  placeholder = 'Cerca dipendente...',
  className,
  disabled = false,
}: EmployeeSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Filtra i dipendenti basato sulla ricerca
  const filteredEmployees = useMemo(() => {
    if (!searchTerm) return employees;
    const term = searchTerm.toLowerCase();
    return employees.filter(
      emp => 
        `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(term) || 
        emp.email?.toLowerCase().includes(term)
    );
  }, [employees, searchTerm]);

  // Trova il dipendente selezionato
  const selectedEmployee = useMemo(() => {
    return employees.find(emp => emp.user_id === selectedId);
  }, [employees, selectedId]);

  const handleSelect = (employeeId: string) => {
    onSelect(employeeId);
    setOpen(false);
    setSearchTerm('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
          disabled={disabled}
        >
          <span className="truncate">
            {selectedEmployee 
              ? `${selectedEmployee.first_name} ${selectedEmployee.last_name}`
              : 'Seleziona dipendente'}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        {/* Search Input */}
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={placeholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
              autoFocus
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

        {/* Employee List */}
        <ScrollArea className="h-[250px]">
          <div className="p-2">
            {filteredEmployees.length === 0 ? (
              <div className="text-center text-muted-foreground py-6">
                Nessun dipendente trovato
              </div>
            ) : (
              filteredEmployees.map((employee) => {
                const isSelected = employee.user_id === selectedId;
                return (
                  <div
                    key={employee.user_id}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-sm cursor-pointer hover:bg-accent",
                      isSelected && "bg-accent"
                    )}
                    onClick={() => handleSelect(employee.user_id)}
                  >
                    <div className={cn(
                      "h-4 w-4 border rounded-sm flex items-center justify-center shrink-0",
                      isSelected ? "bg-primary border-primary" : "border-input"
                    )}>
                      {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{employee.first_name} {employee.last_name}</span>
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
      </PopoverContent>
    </Popover>
  );
}
