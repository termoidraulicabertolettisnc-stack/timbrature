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
        className="flex items-center gap-1"
      >
        {isConverted ? (
          <>
            <DollarSign className="h-3 w-3" />
            {size === 'sm' ? 'IND' : 'Indennità'}
          </>
        ) : (
          <>
            <Receipt className="h-3 w-3" />
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