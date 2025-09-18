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
          flex items-center gap-1 transition-all duration-150 font-normal
          ${isConverted 
            ? 'bg-green-500 hover:bg-green-600 text-white shadow-sm hover:shadow-md border-0' 
            : 'bg-blue-50 hover:bg-blue-100 border border-blue-200 hover:border-blue-300 text-blue-600 hover:text-blue-700'
          }
          ${size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-xs'}
          rounded-md hover:scale-[1.02]
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