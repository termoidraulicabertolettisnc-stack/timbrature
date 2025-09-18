import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Receipt, DollarSign } from 'lucide-react';
import { MealVoucherConversionDialog } from './MealVoucherConversionDialog';
import { MealVoucherConversionService } from '@/services/MealVoucherConversionService';

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
  const [conversionValue, setConversionValue] = useState<number>(0);

  useEffect(() => {
    const loadConversionValue = async () => {
      try {
        const conversion = await MealVoucherConversionService.getConversionForDate(userId, date);
        if (conversion && conversion.converted_to_allowance) {
          // Assuming 1 meal voucher conversion = 1 unit, but this could be configurable
          setConversionValue(1);
        } else {
          setConversionValue(0);
        }
      } catch (error) {
        console.error('Error loading conversion value:', error);
        setConversionValue(0);
      }
    };

    loadConversionValue();
  }, [userId, date, isConverted]);

  const handleCellClick = () => {
    setDialogOpen(true);
  };

  const handleConversionUpdated = () => {
    if (onConversionUpdated) {
      onConversionUpdated();
    }
    // Reload the conversion value
    const loadConversionValue = async () => {
      try {
        const conversion = await MealVoucherConversionService.getConversionForDate(userId, date);
        if (conversion && conversion.converted_to_allowance) {
          setConversionValue(1);
        } else {
          setConversionValue(0);
        }
      } catch (error) {
        console.error('Error loading conversion value:', error);
        setConversionValue(0);
      }
    };
    loadConversionValue();
  };

  return (
    <>
      <div
        onClick={handleCellClick}
        className={`
          w-full h-full min-h-[24px] flex items-center justify-center cursor-pointer
          transition-colors duration-150 text-xs font-medium
          ${conversionValue > 0 
            ? 'text-green-700 hover:bg-green-50' 
            : 'text-gray-400 hover:bg-gray-50'
          }
        `}
      >
        {conversionValue > 0 ? conversionValue : ''}
      </div>

      <MealVoucherConversionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        userId={userId}
        userName={userName}
        date={date}
        companyId={companyId}
        onConversionUpdated={handleConversionUpdated}
      />
    </>
  );
}