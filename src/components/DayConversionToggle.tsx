import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Receipt, DollarSign } from 'lucide-react';
import { MealVoucherConversionDialog } from './MealVoucherConversionDialog';

interface DayConversionToggleProps {
  userId: string;
  userName: string;
  date: string;
  companyId: string;
  isConverted?: boolean;
  onConversionUpdated?: () => void;
  size?: 'sm' | 'default';
}

export function DayConversionToggle({
  userId,
  userName,
  date,
  companyId,
  isConverted = false,
  onConversionUpdated,
  size = 'default'
}: DayConversionToggleProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Button
        variant={isConverted ? "default" : "outline"}
        size={size}
        onClick={() => setDialogOpen(true)}
        className={`
          flex items-center gap-1.5 transition-all duration-200 font-medium
          ${isConverted 
            ? 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white shadow-md hover:shadow-lg border-0' 
            : 'bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border-blue-200 hover:border-blue-300 text-blue-700 hover:text-blue-800 shadow-sm hover:shadow-md'
          }
          ${size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'}
          rounded-lg hover:scale-105 active:scale-95
        `}
      >
        {isConverted ? (
          <>
            <DollarSign className={`${size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} drop-shadow-sm`} />
            {size === 'sm' ? 'IND' : 'Indennità'}
          </>
        ) : (
          <>
            <Receipt className={`${size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'}`} />
            {size === 'sm' ? 'BP' : 'Buono Pasto'}
          </>
        )}
      </Button>

      <MealVoucherConversionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        userId={userId}
        userName={userName}
        date={date}
        companyId={companyId}
        onConversionUpdated={onConversionUpdated}
      />
    </>
  );
}