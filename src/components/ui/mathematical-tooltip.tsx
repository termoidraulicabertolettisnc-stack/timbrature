import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Calculator } from "lucide-react";

interface MathematicalTooltipProps {
  children: React.ReactNode;
  calculation: {
    formula: string;
    variables: { [key: string]: number | string };
    result: number;
    explanation?: string;
  };
  title?: string;
}

export const MathematicalTooltip: React.FC<MathematicalTooltipProps> = ({
  children,
  calculation,
  title = "Calcolo Dettagliato"
}) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center gap-1 cursor-help">
            {children}
            <Calculator className="h-3 w-3 text-muted-foreground" />
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs p-4">
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">{title}</h4>
            
            <div className="space-y-1">
              <p className="text-xs font-mono bg-muted p-1 rounded">
                Formula: {calculation.formula}
              </p>
              
              <div className="text-xs space-y-1">
                <p className="font-medium">Dove:</p>
                {Object.entries(calculation.variables).map(([key, value]) => (
                  <p key={key} className="ml-2">
                    {key} = {typeof value === 'number' ? value.toFixed(2) : value}
                  </p>
                ))}
              </div>
              
              <div className="border-t pt-1">
                <p className="text-xs font-medium">
                  Risultato: <span className="font-mono">{calculation.result.toFixed(2)}</span>
                </p>
              </div>
              
              {calculation.explanation && (
                <p className="text-xs text-muted-foreground mt-2">
                  {calculation.explanation}
                </p>
              )}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default MathematicalTooltip;