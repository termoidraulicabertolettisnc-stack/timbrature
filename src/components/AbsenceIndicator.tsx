import React from 'react';
import { Badge } from '@/components/ui/badge';
import { TreePalm, Stethoscope, AlertTriangle, CircleSlash } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface AbsenceIndicatorProps {
  absences: any[];
  className?: string;
}

export function AbsenceIndicator({ absences, className = "" }: AbsenceIndicatorProps) {
  if (!absences || absences.length === 0) return null;

  const getAbsenceIcon = (type: string) => {
    switch (type) {
      case 'F': return <TreePalm className="h-4 w-4" />;
      case 'M': return <Stethoscope className="h-4 w-4" />;
      case 'I': return <AlertTriangle className="h-4 w-4" />;
      case 'PNR': return <CircleSlash className="h-4 w-4" />;
      default: return <TreePalm className="h-4 w-4" />;
    }
  };

  const getAbsenceColor = (type: string) => {
    switch (type) {
      case 'F': return 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200';
      case 'M': return 'bg-red-100 text-red-800 hover:bg-red-200';
      case 'I': return 'bg-orange-100 text-orange-800 hover:bg-orange-200';
      case 'PNR': return 'bg-gray-100 text-gray-800 hover:bg-gray-200';
      default: return 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200';
    }
  };

  const getAbsenceLabel = (type: string) => {
    switch (type) {
      case 'F': return 'Ferie/Permesso';
      case 'M': return 'Malattia';
      case 'I': return 'Infortunio';
      case 'PNR': return 'Permesso non retribuito';
      default: return type;
    }
  };

  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {absences.map((absence, index) => (
        <Tooltip key={index}>
          <TooltipTrigger asChild>
            <Badge 
              className={`${getAbsenceColor(absence.absence_type)} cursor-pointer flex items-center gap-1 text-xs px-2 py-1`}
            >
              {getAbsenceIcon(absence.absence_type)}
              <span className="hidden sm:inline">{getAbsenceLabel(absence.absence_type)}</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-sm">
              <p className="font-medium">{getAbsenceLabel(absence.absence_type)}</p>
              <p>{absence.hours}h</p>
              {absence.notes && <p className="text-muted-foreground">{absence.notes}</p>}
            </div>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}