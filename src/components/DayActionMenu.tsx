import React from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, Clock, UserPlus } from 'lucide-react';

interface DayActionMenuProps {
  onAddTimesheet: () => void;
  onAddAbsence: () => void;
  trigger?: React.ReactNode;
  className?: string;
}

export function DayActionMenu({ onAddTimesheet, onAddAbsence, trigger, className }: DayActionMenuProps) {
  const defaultTrigger = (
    <Button
      variant="ghost"
      size="sm"
      className={`opacity-0 group-hover:opacity-100 transition-opacity ${className}`}
    >
      <Plus className="h-3 w-3" />
    </Button>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger || defaultTrigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" side="bottom">
        <DropdownMenuItem onClick={onAddTimesheet} className="cursor-pointer">
          <Clock className="h-4 w-4 mr-2" />
          Aggiungi Timbratura
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onAddAbsence} className="cursor-pointer">
          <UserPlus className="h-4 w-4 mr-2" />
          Aggiungi Assenza
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}