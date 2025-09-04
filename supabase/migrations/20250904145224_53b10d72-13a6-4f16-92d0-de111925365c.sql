-- Add foreign key constraint between timesheets and profiles
ALTER TABLE public.timesheets 
ADD CONSTRAINT timesheets_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(user_id);