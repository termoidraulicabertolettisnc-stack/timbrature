-- Add missing values to lunch_break_type enum
ALTER TYPE lunch_break_type ADD VALUE '15_minuti';
ALTER TYPE lunch_break_type ADD VALUE '45_minuti'; 
ALTER TYPE lunch_break_type ADD VALUE '90_minuti';
ALTER TYPE lunch_break_type ADD VALUE '120_minuti';