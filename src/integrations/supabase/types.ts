export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          changed_at: string
          changed_by: string
          id: string
          new_values: Json | null
          old_values: Json | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_audit_logs_changed_by"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      backup_functions: {
        Row: {
          arguments: string | null
          function_code: string | null
          function_name: unknown | null
          return_type: string | null
        }
        Insert: {
          arguments?: string | null
          function_code?: string | null
          function_name?: unknown | null
          return_type?: string | null
        }
        Update: {
          arguments?: string | null
          function_code?: string | null
          function_name?: unknown | null
          return_type?: string | null
        }
        Relationships: []
      }
      backup_timesheet_sessions_cleanup: {
        Row: {
          created_at: string | null
          end_location_lat: number | null
          end_location_lng: number | null
          end_time: string | null
          id: string | null
          notes: string | null
          session_order: number | null
          session_type: string | null
          start_location_lat: number | null
          start_location_lng: number | null
          start_time: string | null
          timesheet_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          end_location_lat?: number | null
          end_location_lng?: number | null
          end_time?: string | null
          id?: string | null
          notes?: string | null
          session_order?: number | null
          session_type?: string | null
          start_location_lat?: number | null
          start_location_lng?: number | null
          start_time?: string | null
          timesheet_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          end_location_lat?: number | null
          end_location_lng?: number | null
          end_time?: string | null
          id?: string | null
          notes?: string | null
          session_order?: number | null
          session_type?: string | null
          start_location_lat?: number | null
          start_location_lng?: number | null
          start_time?: string | null
          timesheet_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      backup_timesheets_cleanup: {
        Row: {
          absence_type: Database["public"]["Enums"]["absence_type"] | null
          client_id: string | null
          created_at: string | null
          created_by: string | null
          date: string | null
          end_date: string | null
          end_location_lat: number | null
          end_location_lng: number | null
          end_time: string | null
          id: string | null
          is_absence: boolean | null
          is_holiday: boolean | null
          is_saturday: boolean | null
          lunch_duration_minutes: number | null
          lunch_end_time: string | null
          lunch_start_time: string | null
          meal_voucher_earned: boolean | null
          night_hours: number | null
          notes: string | null
          overtime_hours: number | null
          project_id: string | null
          start_location_lat: number | null
          start_location_lng: number | null
          start_time: string | null
          total_hours: number | null
          updated_at: string | null
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          absence_type?: Database["public"]["Enums"]["absence_type"] | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          end_date?: string | null
          end_location_lat?: number | null
          end_location_lng?: number | null
          end_time?: string | null
          id?: string | null
          is_absence?: boolean | null
          is_holiday?: boolean | null
          is_saturday?: boolean | null
          lunch_duration_minutes?: number | null
          lunch_end_time?: string | null
          lunch_start_time?: string | null
          meal_voucher_earned?: boolean | null
          night_hours?: number | null
          notes?: string | null
          overtime_hours?: number | null
          project_id?: string | null
          start_location_lat?: number | null
          start_location_lng?: number | null
          start_time?: string | null
          total_hours?: number | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          absence_type?: Database["public"]["Enums"]["absence_type"] | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          end_date?: string | null
          end_location_lat?: number | null
          end_location_lng?: number | null
          end_time?: string | null
          id?: string | null
          is_absence?: boolean | null
          is_holiday?: boolean | null
          is_saturday?: boolean | null
          lunch_duration_minutes?: number | null
          lunch_end_time?: string | null
          lunch_start_time?: string | null
          meal_voucher_earned?: boolean | null
          night_hours?: number | null
          notes?: string | null
          overtime_hours?: number | null
          project_id?: string | null
          start_location_lat?: number | null
          start_location_lng?: number | null
          start_time?: string | null
          total_hours?: number | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      cleanup_log: {
        Row: {
          action: string | null
          details: string | null
          id: number
          timestamp: string | null
        }
        Insert: {
          action?: string | null
          details?: string | null
          id?: number
          timestamp?: string | null
        }
        Update: {
          action?: string | null
          details?: string | null
          id?: number
          timestamp?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string
          company_id: string
          created_at: string
          description: string | null
          formatted_address: string | null
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          name: string
          updated_at: string
        }
        Insert: {
          address: string
          company_id: string
          created_at?: string
          description?: string | null
          formatted_address?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          updated_at?: string
        }
        Update: {
          address?: string
          company_id?: string
          created_at?: string
          description?: string | null
          formatted_address?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          address: string | null
          city: string
          created_at: string
          formatted_address: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string
          created_at?: string
          formatted_address?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string
          created_at?: string
          formatted_address?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_holidays: {
        Row: {
          company_id: string
          created_at: string
          date: string
          id: string
          is_recurring: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          date: string
          id?: string
          is_recurring?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          date?: string
          id?: string
          is_recurring?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          business_trip_rate_with_meal: number | null
          business_trip_rate_without_meal: number | null
          company_id: string
          created_at: string
          daily_allowance_amount: number | null
          daily_allowance_min_hours: number | null
          daily_allowance_policy: string | null
          default_daily_allowance_amount: number | null
          default_daily_allowance_min_hours: number | null
          default_overtime_conversion_rate: number | null
          enable_entry_tolerance: boolean | null
          enable_overtime_conversion: boolean | null
          entry_tolerance_minutes: number | null
          id: string
          lunch_break_min_hours: number | null
          lunch_break_minutes: number | null
          lunch_break_type: Database["public"]["Enums"]["lunch_break_type"]
          meal_allowance_policy:
            | Database["public"]["Enums"]["meal_allowance_policy"]
            | null
          meal_voucher_amount: number | null
          meal_voucher_denominations: Json | null
          meal_voucher_enabled: boolean | null
          meal_voucher_min_hours: number | null
          meal_voucher_min_hours_threshold: number | null
          meal_voucher_policy: Database["public"]["Enums"]["meal_voucher_type"]
          night_shift_end: string
          night_shift_start: string
          overtime_after_hours: number | null
          overtime_monthly_compensation: boolean | null
          saturday_handling: Database["public"]["Enums"]["saturday_type"]
          saturday_hourly_rate: number | null
          saturday_is_business_trip: boolean | null
          standard_start_time: string | null
          standard_weekly_hours: Json | null
          updated_at: string
        }
        Insert: {
          business_trip_rate_with_meal?: number | null
          business_trip_rate_without_meal?: number | null
          company_id: string
          created_at?: string
          daily_allowance_amount?: number | null
          daily_allowance_min_hours?: number | null
          daily_allowance_policy?: string | null
          default_daily_allowance_amount?: number | null
          default_daily_allowance_min_hours?: number | null
          default_overtime_conversion_rate?: number | null
          enable_entry_tolerance?: boolean | null
          enable_overtime_conversion?: boolean | null
          entry_tolerance_minutes?: number | null
          id?: string
          lunch_break_min_hours?: number | null
          lunch_break_minutes?: number | null
          lunch_break_type?: Database["public"]["Enums"]["lunch_break_type"]
          meal_allowance_policy?:
            | Database["public"]["Enums"]["meal_allowance_policy"]
            | null
          meal_voucher_amount?: number | null
          meal_voucher_denominations?: Json | null
          meal_voucher_enabled?: boolean | null
          meal_voucher_min_hours?: number | null
          meal_voucher_min_hours_threshold?: number | null
          meal_voucher_policy?: Database["public"]["Enums"]["meal_voucher_type"]
          night_shift_end?: string
          night_shift_start?: string
          overtime_after_hours?: number | null
          overtime_monthly_compensation?: boolean | null
          saturday_handling?: Database["public"]["Enums"]["saturday_type"]
          saturday_hourly_rate?: number | null
          saturday_is_business_trip?: boolean | null
          standard_start_time?: string | null
          standard_weekly_hours?: Json | null
          updated_at?: string
        }
        Update: {
          business_trip_rate_with_meal?: number | null
          business_trip_rate_without_meal?: number | null
          company_id?: string
          created_at?: string
          daily_allowance_amount?: number | null
          daily_allowance_min_hours?: number | null
          daily_allowance_policy?: string | null
          default_daily_allowance_amount?: number | null
          default_daily_allowance_min_hours?: number | null
          default_overtime_conversion_rate?: number | null
          enable_entry_tolerance?: boolean | null
          enable_overtime_conversion?: boolean | null
          entry_tolerance_minutes?: number | null
          id?: string
          lunch_break_min_hours?: number | null
          lunch_break_minutes?: number | null
          lunch_break_type?: Database["public"]["Enums"]["lunch_break_type"]
          meal_allowance_policy?:
            | Database["public"]["Enums"]["meal_allowance_policy"]
            | null
          meal_voucher_amount?: number | null
          meal_voucher_denominations?: Json | null
          meal_voucher_enabled?: boolean | null
          meal_voucher_min_hours?: number | null
          meal_voucher_min_hours_threshold?: number | null
          meal_voucher_policy?: Database["public"]["Enums"]["meal_voucher_type"]
          night_shift_end?: string
          night_shift_start?: string
          overtime_after_hours?: number | null
          overtime_monthly_compensation?: boolean | null
          saturday_handling?: Database["public"]["Enums"]["saturday_type"]
          saturday_hourly_rate?: number | null
          saturday_is_business_trip?: boolean | null
          standard_start_time?: string | null
          standard_weekly_hours?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_absences: {
        Row: {
          absence_type: Database["public"]["Enums"]["absence_type"]
          company_id: string
          created_at: string
          created_by: string
          date: string
          hours: number | null
          id: string
          notes: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          absence_type: Database["public"]["Enums"]["absence_type"]
          company_id: string
          created_at?: string
          created_by: string
          date: string
          hours?: number | null
          id?: string
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          absence_type?: Database["public"]["Enums"]["absence_type"]
          company_id?: string
          created_at?: string
          created_by?: string
          date?: string
          hours?: number | null
          id?: string
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      employee_meal_voucher_conversions: {
        Row: {
          company_id: string
          converted_to_allowance: boolean
          created_at: string
          created_by: string
          date: string
          id: string
          notes: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          converted_to_allowance?: boolean
          created_at?: string
          created_by: string
          date: string
          id?: string
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          converted_to_allowance?: boolean
          created_at?: string
          created_by?: string
          date?: string
          id?: string
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      employee_overtime_conversions: {
        Row: {
          company_id: string
          conversion_amount: number | null
          created_at: string
          created_by: string
          id: string
          manual_conversion_hours: number | null
          month: string
          notes: string | null
          total_conversion_hours: number | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          conversion_amount?: number | null
          created_at?: string
          created_by: string
          id?: string
          manual_conversion_hours?: number | null
          month: string
          notes?: string | null
          total_conversion_hours?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          conversion_amount?: number | null
          created_at?: string
          created_by?: string
          id?: string
          manual_conversion_hours?: number | null
          month?: string
          notes?: string | null
          total_conversion_hours?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      employee_settings: {
        Row: {
          business_trip_rate_with_meal: number | null
          business_trip_rate_without_meal: number | null
          company_id: string
          contract_working_days: string | null
          created_at: string
          created_by: string
          daily_allowance_amount: number | null
          daily_allowance_min_hours: number | null
          daily_allowance_policy: string | null
          enable_entry_tolerance: boolean | null
          enable_overtime_conversion: boolean | null
          entry_tolerance_minutes: number | null
          id: string
          lunch_break_min_hours: number | null
          lunch_break_minutes: number | null
          lunch_break_type:
            | Database["public"]["Enums"]["lunch_break_type"]
            | null
          meal_allowance_policy:
            | Database["public"]["Enums"]["meal_allowance_policy"]
            | null
          meal_voucher_amount: number | null
          meal_voucher_enabled: boolean | null
          meal_voucher_min_hours: number | null
          meal_voucher_min_hours_threshold: number | null
          meal_voucher_policy:
            | Database["public"]["Enums"]["meal_voucher_type"]
            | null
          night_shift_end: string | null
          night_shift_start: string | null
          overtime_after_hours: number | null
          overtime_conversion_rate: number | null
          overtime_monthly_compensation: boolean | null
          saturday_handling: Database["public"]["Enums"]["saturday_type"] | null
          saturday_hourly_rate: number | null
          saturday_is_business_trip: boolean | null
          standard_start_time: string | null
          standard_weekly_hours: Json | null
          updated_at: string
          updated_by: string | null
          user_id: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          business_trip_rate_with_meal?: number | null
          business_trip_rate_without_meal?: number | null
          company_id: string
          contract_working_days?: string | null
          created_at?: string
          created_by: string
          daily_allowance_amount?: number | null
          daily_allowance_min_hours?: number | null
          daily_allowance_policy?: string | null
          enable_entry_tolerance?: boolean | null
          enable_overtime_conversion?: boolean | null
          entry_tolerance_minutes?: number | null
          id?: string
          lunch_break_min_hours?: number | null
          lunch_break_minutes?: number | null
          lunch_break_type?:
            | Database["public"]["Enums"]["lunch_break_type"]
            | null
          meal_allowance_policy?:
            | Database["public"]["Enums"]["meal_allowance_policy"]
            | null
          meal_voucher_amount?: number | null
          meal_voucher_enabled?: boolean | null
          meal_voucher_min_hours?: number | null
          meal_voucher_min_hours_threshold?: number | null
          meal_voucher_policy?:
            | Database["public"]["Enums"]["meal_voucher_type"]
            | null
          night_shift_end?: string | null
          night_shift_start?: string | null
          overtime_after_hours?: number | null
          overtime_conversion_rate?: number | null
          overtime_monthly_compensation?: boolean | null
          saturday_handling?:
            | Database["public"]["Enums"]["saturday_type"]
            | null
          saturday_hourly_rate?: number | null
          saturday_is_business_trip?: boolean | null
          standard_start_time?: string | null
          standard_weekly_hours?: Json | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          business_trip_rate_with_meal?: number | null
          business_trip_rate_without_meal?: number | null
          company_id?: string
          contract_working_days?: string | null
          created_at?: string
          created_by?: string
          daily_allowance_amount?: number | null
          daily_allowance_min_hours?: number | null
          daily_allowance_policy?: string | null
          enable_entry_tolerance?: boolean | null
          enable_overtime_conversion?: boolean | null
          entry_tolerance_minutes?: number | null
          id?: string
          lunch_break_min_hours?: number | null
          lunch_break_minutes?: number | null
          lunch_break_type?:
            | Database["public"]["Enums"]["lunch_break_type"]
            | null
          meal_allowance_policy?:
            | Database["public"]["Enums"]["meal_allowance_policy"]
            | null
          meal_voucher_amount?: number | null
          meal_voucher_enabled?: boolean | null
          meal_voucher_min_hours?: number | null
          meal_voucher_min_hours_threshold?: number | null
          meal_voucher_policy?:
            | Database["public"]["Enums"]["meal_voucher_type"]
            | null
          night_shift_end?: string | null
          night_shift_start?: string | null
          overtime_after_hours?: number | null
          overtime_conversion_rate?: number | null
          overtime_monthly_compensation?: boolean | null
          saturday_handling?:
            | Database["public"]["Enums"]["saturday_type"]
            | null
          saturday_hourly_rate?: number | null
          saturday_is_business_trip?: boolean | null
          standard_start_time?: string | null
          standard_weekly_hours?: Json | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: []
      }
      function_backups: {
        Row: {
          backup_date: string | null
          function_definition: string | null
          function_name: string | null
          id: number
        }
        Insert: {
          backup_date?: string | null
          function_definition?: string | null
          function_name?: string | null
          id?: number
        }
        Update: {
          backup_date?: string | null
          function_definition?: string | null
          function_name?: string | null
          id?: number
        }
        Relationships: []
      }
      location_pings: {
        Row: {
          accuracy: number | null
          created_at: string
          id: string
          latitude: number
          longitude: number
          movement_detected: boolean
          ping_interval_used: number
          timesheet_id: string
          timestamp: string
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          created_at?: string
          id?: string
          latitude: number
          longitude: number
          movement_detected?: boolean
          ping_interval_used?: number
          timesheet_id: string
          timestamp?: string
          user_id: string
        }
        Update: {
          accuracy?: number | null
          created_at?: string
          id?: string
          latitude?: number
          longitude?: number
          movement_detected?: boolean
          ping_interval_used?: number
          timesheet_id?: string
          timestamp?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_location_pings_timesheet"
            columns: ["timesheet_id"]
            isOneToOne: false
            referencedRelation: "timesheets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_location_pings_timesheet"
            columns: ["timesheet_id"]
            isOneToOne: false
            referencedRelation: "v_timesheet_day_edit"
            referencedColumns: ["timesheet_id"]
          },
          {
            foreignKeyName: "fk_location_pings_timesheet"
            columns: ["timesheet_id"]
            isOneToOne: false
            referencedRelation: "v_timesheet_discrepancies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          codice_fiscale: string | null
          company_id: string | null
          created_at: string
          email: string
          first_name: string
          id: string
          is_active: boolean
          last_name: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          codice_fiscale?: string | null
          company_id?: string | null
          created_at?: string
          email: string
          first_name: string
          id?: string
          is_active?: boolean
          last_name: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          codice_fiscale?: string | null
          company_id?: string | null
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          is_active?: boolean
          last_name?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_profiles_company"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      resolved_configurations: {
        Row: {
          config_hash: string | null
          date: string
          id: string
          resolution_timestamp: string | null
          resolved_config: Json
          user_id: string
        }
        Insert: {
          config_hash?: string | null
          date: string
          id?: string
          resolution_timestamp?: string | null
          resolved_config: Json
          user_id: string
        }
        Update: {
          config_hash?: string | null
          date?: string
          id?: string
          resolution_timestamp?: string | null
          resolved_config?: Json
          user_id?: string
        }
        Relationships: []
      }
      schema_migration_backup: {
        Row: {
          backup_timestamp: string | null
          id: string | null
          lunch_break_min_hours: number | null
          old_lunch_break_type: string | null
          old_meal_voucher_policy: string | null
          old_saturday_handling: string | null
          source_table: string | null
          standard_weekly_hours: Json | null
          user_id: string | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          backup_timestamp?: string | null
          id?: string | null
          lunch_break_min_hours?: number | null
          old_lunch_break_type?: string | null
          old_meal_voucher_policy?: string | null
          old_saturday_handling?: string | null
          source_table?: string | null
          standard_weekly_hours?: Json | null
          user_id?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          backup_timestamp?: string | null
          id?: string | null
          lunch_break_min_hours?: number | null
          old_lunch_break_type?: string | null
          old_meal_voucher_policy?: string | null
          old_saturday_handling?: string | null
          source_table?: string | null
          standard_weekly_hours?: Json | null
          user_id?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
      settings_backup_pre_refactoring: {
        Row: {
          backup_date: string | null
          created_at: string | null
          id: string | null
          lunch_break_min_hours: number | null
          lunch_break_type_old: string | null
          night_shift_end: string | null
          night_shift_start: string | null
          saturday_handling_old: string | null
          standard_weekly_hours: Json | null
          table_name: string | null
          user_id: string | null
        }
        Insert: {
          backup_date?: string | null
          created_at?: string | null
          id?: string | null
          lunch_break_min_hours?: number | null
          lunch_break_type_old?: string | null
          night_shift_end?: string | null
          night_shift_start?: string | null
          saturday_handling_old?: string | null
          standard_weekly_hours?: Json | null
          table_name?: string | null
          user_id?: string | null
        }
        Update: {
          backup_date?: string | null
          created_at?: string | null
          id?: string | null
          lunch_break_min_hours?: number | null
          lunch_break_type_old?: string | null
          night_shift_end?: string | null
          night_shift_start?: string | null
          saturday_handling_old?: string | null
          standard_weekly_hours?: Json | null
          table_name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      system_defaults: {
        Row: {
          category: string | null
          description: string | null
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json
          value_type: string
        }
        Insert: {
          category?: string | null
          description?: string | null
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: Json
          value_type: string
        }
        Update: {
          category?: string | null
          description?: string | null
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
          value_type?: string
        }
        Relationships: []
      }
      timesheet_calculation_audit: {
        Row: {
          calculation_log: string | null
          config_source: Json | null
          date: string | null
          error_message: string | null
          error_occurred: boolean | null
          id: number
          lunch_minutes_calculated: number | null
          new_overtime_hours: number | null
          new_total_hours: number | null
          old_overtime_hours: number | null
          old_total_hours: number | null
          timesheet_id: string | null
          timestamp: string | null
          trigger_operation: string | null
          trigger_source: string | null
          user_id: string | null
        }
        Insert: {
          calculation_log?: string | null
          config_source?: Json | null
          date?: string | null
          error_message?: string | null
          error_occurred?: boolean | null
          id?: number
          lunch_minutes_calculated?: number | null
          new_overtime_hours?: number | null
          new_total_hours?: number | null
          old_overtime_hours?: number | null
          old_total_hours?: number | null
          timesheet_id?: string | null
          timestamp?: string | null
          trigger_operation?: string | null
          trigger_source?: string | null
          user_id?: string | null
        }
        Update: {
          calculation_log?: string | null
          config_source?: Json | null
          date?: string | null
          error_message?: string | null
          error_occurred?: boolean | null
          id?: number
          lunch_minutes_calculated?: number | null
          new_overtime_hours?: number | null
          new_total_hours?: number | null
          old_overtime_hours?: number | null
          old_total_hours?: number | null
          timesheet_id?: string | null
          timestamp?: string | null
          trigger_operation?: string | null
          trigger_source?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      timesheet_calculation_log: {
        Row: {
          calculation_date: string | null
          calculation_timestamp: string | null
          config_source: string | null
          debug_info: string | null
          id: number
          overtime_hours_calculated: number | null
          timesheet_id: string | null
          total_hours_calculated: number | null
          user_id: string | null
        }
        Insert: {
          calculation_date?: string | null
          calculation_timestamp?: string | null
          config_source?: string | null
          debug_info?: string | null
          id?: number
          overtime_hours_calculated?: number | null
          timesheet_id?: string | null
          total_hours_calculated?: number | null
          user_id?: string | null
        }
        Update: {
          calculation_date?: string | null
          calculation_timestamp?: string | null
          config_source?: string | null
          debug_info?: string | null
          id?: number
          overtime_hours_calculated?: number | null
          timesheet_id?: string | null
          total_hours_calculated?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      timesheet_sessions: {
        Row: {
          created_at: string
          end_location_lat: number | null
          end_location_lng: number | null
          end_time: string | null
          id: string
          notes: string | null
          session_order: number
          session_type: string
          start_location_lat: number | null
          start_location_lng: number | null
          start_time: string
          timesheet_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_location_lat?: number | null
          end_location_lng?: number | null
          end_time?: string | null
          id?: string
          notes?: string | null
          session_order?: number
          session_type?: string
          start_location_lat?: number | null
          start_location_lng?: number | null
          start_time: string
          timesheet_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_location_lat?: number | null
          end_location_lng?: number | null
          end_time?: string | null
          id?: string
          notes?: string | null
          session_order?: number
          session_type?: string
          start_location_lat?: number | null
          start_location_lng?: number | null
          start_time?: string
          timesheet_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timesheet_sessions_timesheet_id_fkey"
            columns: ["timesheet_id"]
            isOneToOne: false
            referencedRelation: "timesheets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheet_sessions_timesheet_id_fkey"
            columns: ["timesheet_id"]
            isOneToOne: false
            referencedRelation: "v_timesheet_day_edit"
            referencedColumns: ["timesheet_id"]
          },
          {
            foreignKeyName: "timesheet_sessions_timesheet_id_fkey"
            columns: ["timesheet_id"]
            isOneToOne: false
            referencedRelation: "v_timesheet_discrepancies"
            referencedColumns: ["id"]
          },
        ]
      }
      timesheets: {
        Row: {
          absence_type: Database["public"]["Enums"]["absence_type"] | null
          client_id: string | null
          created_at: string
          created_by: string
          date: string
          end_date: string | null
          end_location_lat: number | null
          end_location_lng: number | null
          end_time: string | null
          id: string
          is_absence: boolean | null
          is_holiday: boolean
          is_saturday: boolean
          lunch_duration_minutes: number | null
          lunch_end_time: string | null
          lunch_override_minutes: number | null
          lunch_start_time: string | null
          meal_voucher_earned: boolean
          night_hours: number | null
          notes: string | null
          overtime_hours: number | null
          project_id: string | null
          start_location_lat: number | null
          start_location_lng: number | null
          start_time: string | null
          total_hours: number | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          absence_type?: Database["public"]["Enums"]["absence_type"] | null
          client_id?: string | null
          created_at?: string
          created_by: string
          date: string
          end_date?: string | null
          end_location_lat?: number | null
          end_location_lng?: number | null
          end_time?: string | null
          id?: string
          is_absence?: boolean | null
          is_holiday?: boolean
          is_saturday?: boolean
          lunch_duration_minutes?: number | null
          lunch_end_time?: string | null
          lunch_override_minutes?: number | null
          lunch_start_time?: string | null
          meal_voucher_earned?: boolean
          night_hours?: number | null
          notes?: string | null
          overtime_hours?: number | null
          project_id?: string | null
          start_location_lat?: number | null
          start_location_lng?: number | null
          start_time?: string | null
          total_hours?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          absence_type?: Database["public"]["Enums"]["absence_type"] | null
          client_id?: string | null
          created_at?: string
          created_by?: string
          date?: string
          end_date?: string | null
          end_location_lat?: number | null
          end_location_lng?: number | null
          end_time?: string | null
          id?: string
          is_absence?: boolean | null
          is_holiday?: boolean
          is_saturday?: boolean
          lunch_duration_minutes?: number | null
          lunch_end_time?: string | null
          lunch_override_minutes?: number | null
          lunch_start_time?: string | null
          meal_voucher_earned?: boolean
          night_hours?: number | null
          notes?: string | null
          overtime_hours?: number | null
          project_id?: string | null
          start_location_lat?: number | null
          start_location_lng?: number | null
          start_time?: string | null
          total_hours?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_timesheets_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_timesheets_updated_by"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_timesheets_user"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "timesheets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      timesheets_fix_backup: {
        Row: {
          absence_type: Database["public"]["Enums"]["absence_type"] | null
          backup_timestamp: string | null
          client_id: string | null
          created_at: string | null
          created_by: string | null
          date: string | null
          end_date: string | null
          end_location_lat: number | null
          end_location_lng: number | null
          end_time: string | null
          fix_reason: string | null
          id: string | null
          is_absence: boolean | null
          is_holiday: boolean | null
          is_saturday: boolean | null
          lunch_duration_minutes: number | null
          lunch_end_time: string | null
          lunch_start_time: string | null
          meal_voucher_earned: boolean | null
          night_hours: number | null
          notes: string | null
          overtime_hours: number | null
          project_id: string | null
          start_location_lat: number | null
          start_location_lng: number | null
          start_time: string | null
          total_hours: number | null
          updated_at: string | null
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          absence_type?: Database["public"]["Enums"]["absence_type"] | null
          backup_timestamp?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          end_date?: string | null
          end_location_lat?: number | null
          end_location_lng?: number | null
          end_time?: string | null
          fix_reason?: string | null
          id?: string | null
          is_absence?: boolean | null
          is_holiday?: boolean | null
          is_saturday?: boolean | null
          lunch_duration_minutes?: number | null
          lunch_end_time?: string | null
          lunch_start_time?: string | null
          meal_voucher_earned?: boolean | null
          night_hours?: number | null
          notes?: string | null
          overtime_hours?: number | null
          project_id?: string | null
          start_location_lat?: number | null
          start_location_lng?: number | null
          start_time?: string | null
          total_hours?: number | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          absence_type?: Database["public"]["Enums"]["absence_type"] | null
          backup_timestamp?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          end_date?: string | null
          end_location_lat?: number | null
          end_location_lng?: number | null
          end_time?: string | null
          fix_reason?: string | null
          id?: string | null
          is_absence?: boolean | null
          is_holiday?: boolean | null
          is_saturday?: boolean | null
          lunch_duration_minutes?: number | null
          lunch_end_time?: string | null
          lunch_start_time?: string | null
          meal_voucher_earned?: boolean | null
          night_hours?: number | null
          notes?: string | null
          overtime_hours?: number | null
          project_id?: string | null
          start_location_lat?: number | null
          start_location_lng?: number | null
          start_time?: string | null
          total_hours?: number | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_timesheet_day_edit: {
        Row: {
          date: string | null
          is_absence: boolean | null
          lunch_config_type: string | null
          lunch_minutes_calculated: number | null
          lunch_minutes_effective: number | null
          lunch_minutes_override: number | null
          overtime_hours: number | null
          sessions: Json | null
          timesheet_id: string | null
          total_hours: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_timesheets_user"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "timesheets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      v_timesheet_discrepancies: {
        Row: {
          calculated_hours: number | null
          calculated_overtime: number | null
          date: string | null
          hours_diff: number | null
          id: string | null
          overtime_diff: number | null
          stored_hours: number | null
          stored_overtime: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_timesheets_user"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "timesheets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Functions: {
      add_timesheet_session: {
        Args: {
          p_end_time: string
          p_start_time: string
          p_timesheet_id: string
        }
        Returns: string
      }
      apply_settings_changes_with_date_logic: {
        Args: {
          p_application_mode: string
          p_specific_date?: string
          p_user_id: string
        }
        Returns: {
          application_mode: string
          end_date: string
          start_date: string
          timesheets_affected: number
        }[]
      }
      calculate_lunch_duration: {
        Args: {
          p_end_time: string
          p_lunch_break_min_hours: number
          p_lunch_break_type: string
          p_lunch_duration_minutes: number
          p_lunch_end_time: string
          p_lunch_start_time: string
          p_start_time: string
        }
        Returns: number
      }
      calculate_overtime_hours: {
        Args: {
          p_is_saturday: boolean
          p_saturday_handling: string
          p_standard_hours: number
          p_total_hours: number
        }
        Returns: number
      }
      calculate_timesheet_with_config: {
        Args: {
          p_date: string
          p_end_time: string
          p_is_absence: boolean
          p_lunch_duration_minutes: number
          p_lunch_end_time: string
          p_lunch_start_time: string
          p_start_time: string
          p_user_id: string
        }
        Returns: {
          calculation_log: string
          config_used: Json
          is_saturday: boolean
          lunch_minutes_used: number
          overtime_hours: number
          standard_hours_for_day: number
          total_hours: number
        }[]
      }
      calculate_work_hours: {
        Args: {
          p_end_time: string
          p_lunch_minutes: number
          p_start_time: string
        }
        Returns: number
      }
      cleanup_lorenzo_test_data: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      explain_timesheet_calculation: {
        Args: {
          p_date: string
          p_end_time: string
          p_lunch_duration_minutes: number
          p_lunch_end_time: string
          p_lunch_start_time: string
          p_start_time: string
          p_user_id: string
        }
        Returns: string
      }
      get_current_user_context: {
        Args: Record<PropertyKey, never>
        Returns: {
          company_id: string
          user_role: Database["public"]["Enums"]["user_role"]
        }[]
      }
      get_current_user_role_and_company: {
        Args: Record<PropertyKey, never>
        Returns: {
          user_company_id: string
          user_role: Database["public"]["Enums"]["user_role"]
        }[]
      }
      get_effective_config: {
        Args: { p_date?: string; p_user_id: string }
        Returns: Json
      }
      get_lunch_break_minutes: {
        Args: { p_lunch_type: string }
        Returns: number
      }
      get_standard_hours_for_day: {
        Args: { p_date: string; p_weekly_hours: Json }
        Returns: number
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_user_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_user_admin_in_company: {
        Args: { target_company_id?: string }
        Returns: boolean
      }
      log_timesheet_calculation: {
        Args: {
          p_config: Json
          p_date: string
          p_error?: boolean
          p_error_msg?: string
          p_log: string
          p_lunch_minutes: number
          p_new_overtime: number
          p_new_total: number
          p_old_overtime: number
          p_old_total: number
          p_operation: string
          p_source: string
          p_timesheet_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      recalculate_affected_timesheets: {
        Args: { p_user_id: string; p_valid_from: string; p_valid_to?: string }
        Returns: number
      }
      set_lunch_override: {
        Args: { p_minutes: number; p_timesheet_id: string }
        Returns: undefined
      }
      test_config_resolution: {
        Args: { p_date?: string; p_user_id: string }
        Returns: {
          field_name: string
          resolved_value: string
          source: string
        }[]
      }
      test_employee_settings_lookup: {
        Args: { p_date: string; p_user_id: string }
        Returns: {
          found_count: number
          lunch_type: string
          query_used: string
          valid_from: string
          valid_to: string
        }[]
      }
    }
    Enums: {
      absence_type: "A" | "F" | "FS" | "I" | "M" | "PR" | "PNR"
      lunch_break_type:
        | "30_minuti"
        | "60_minuti"
        | "libera"
        | "0_minuti"
        | "15_minuti"
        | "45_minuti"
        | "90_minuti"
        | "120_minuti"
      meal_allowance_policy:
        | "disabled"
        | "meal_vouchers_only"
        | "meal_vouchers_always"
        | "daily_allowance"
        | "both"
      meal_voucher_type:
        | "oltre_6_ore"
        | "sempre_parttime"
        | "conteggio_giorni"
        | "disabilitato"
      overtime_type: "dopo_8_ore" | "sempre"
      saturday_handling: "straordinario" | "trasferta" | "normale"
      saturday_type: "trasferta" | "straordinario"
      user_role: "dipendente" | "amministratore"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      absence_type: ["A", "F", "FS", "I", "M", "PR", "PNR"],
      lunch_break_type: [
        "30_minuti",
        "60_minuti",
        "libera",
        "0_minuti",
        "15_minuti",
        "45_minuti",
        "90_minuti",
        "120_minuti",
      ],
      meal_allowance_policy: [
        "disabled",
        "meal_vouchers_only",
        "meal_vouchers_always",
        "daily_allowance",
        "both",
      ],
      meal_voucher_type: [
        "oltre_6_ore",
        "sempre_parttime",
        "conteggio_giorni",
        "disabilitato",
      ],
      overtime_type: ["dopo_8_ore", "sempre"],
      saturday_handling: ["straordinario", "trasferta", "normale"],
      saturday_type: ["trasferta", "straordinario"],
      user_role: ["dipendente", "amministratore"],
    },
  },
} as const
