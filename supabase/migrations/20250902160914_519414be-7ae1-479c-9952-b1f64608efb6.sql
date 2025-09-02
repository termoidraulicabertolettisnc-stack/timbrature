-- Fix the audit trigger function to handle tables without created_by/user_id fields
CREATE OR REPLACE FUNCTION public.audit_trigger_function()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  changed_by_id uuid;
BEGIN
  -- Determine the user who made the change
  IF auth.uid() IS NOT NULL THEN
    changed_by_id := auth.uid();
  ELSE
    -- Fallback logic based on what fields exist in the record
    IF TG_OP = 'INSERT' THEN
      IF to_jsonb(NEW) ? 'user_id' THEN
        changed_by_id := (to_jsonb(NEW)->>'user_id')::uuid;
      ELSIF to_jsonb(NEW) ? 'created_by' THEN
        changed_by_id := (to_jsonb(NEW)->>'created_by')::uuid;
      ELSE
        -- For tables without user fields (like companies), use a system default
        changed_by_id := '00000000-0000-0000-0000-000000000000'::uuid;
      END IF;
    ELSIF TG_OP = 'UPDATE' THEN
      IF to_jsonb(NEW) ? 'user_id' THEN
        changed_by_id := (to_jsonb(NEW)->>'user_id')::uuid;
      ELSIF to_jsonb(NEW) ? 'updated_by' THEN
        changed_by_id := (to_jsonb(NEW)->>'updated_by')::uuid;
      ELSE
        changed_by_id := '00000000-0000-0000-0000-000000000000'::uuid;
      END IF;
    ELSE -- DELETE
      IF to_jsonb(OLD) ? 'user_id' THEN
        changed_by_id := (to_jsonb(OLD)->>'user_id')::uuid;
      ELSE
        changed_by_id := '00000000-0000-0000-0000-000000000000'::uuid;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, new_values, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), changed_by_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, old_values, new_values, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), changed_by_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, old_values, changed_by)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), changed_by_id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;