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
      companies: {
        Row: {
          address: string | null
          city: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string
          created_at?: string
          id?: string
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
          id: string
          lunch_break_type: Database["public"]["Enums"]["lunch_break_type"]
          meal_voucher_amount: number | null
          meal_voucher_policy: Database["public"]["Enums"]["meal_voucher_type"]
          night_shift_end: string
          night_shift_start: string
          overtime_calculation: Database["public"]["Enums"]["overtime_type"]
          saturday_handling: Database["public"]["Enums"]["saturday_type"]
          saturday_hourly_rate: number | null
          standard_daily_hours: number
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
          id?: string
          lunch_break_type?: Database["public"]["Enums"]["lunch_break_type"]
          meal_voucher_amount?: number | null
          meal_voucher_policy?: Database["public"]["Enums"]["meal_voucher_type"]
          night_shift_end?: string
          night_shift_start?: string
          overtime_calculation?: Database["public"]["Enums"]["overtime_type"]
          saturday_handling?: Database["public"]["Enums"]["saturday_type"]
          saturday_hourly_rate?: number | null
          standard_daily_hours?: number
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
          id?: string
          lunch_break_type?: Database["public"]["Enums"]["lunch_break_type"]
          meal_voucher_amount?: number | null
          meal_voucher_policy?: Database["public"]["Enums"]["meal_voucher_type"]
          night_shift_end?: string
          night_shift_start?: string
          overtime_calculation?: Database["public"]["Enums"]["overtime_type"]
          saturday_handling?: Database["public"]["Enums"]["saturday_type"]
          saturday_hourly_rate?: number | null
          standard_daily_hours?: number
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
      employee_settings: {
        Row: {
          business_trip_rate_with_meal: number | null
          business_trip_rate_without_meal: number | null
          company_id: string
          created_at: string
          created_by: string
          daily_allowance_amount: number | null
          daily_allowance_min_hours: number | null
          daily_allowance_policy: string | null
          id: string
          lunch_break_type:
            | Database["public"]["Enums"]["lunch_break_type"]
            | null
          meal_voucher_amount: number | null
          meal_voucher_policy:
            | Database["public"]["Enums"]["meal_voucher_type"]
            | null
          night_shift_end: string | null
          night_shift_start: string | null
          overtime_calculation:
            | Database["public"]["Enums"]["overtime_type"]
            | null
          overtime_monthly_compensation: boolean | null
          saturday_handling: Database["public"]["Enums"]["saturday_type"] | null
          saturday_hourly_rate: number | null
          standard_daily_hours: number | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          business_trip_rate_with_meal?: number | null
          business_trip_rate_without_meal?: number | null
          company_id: string
          created_at?: string
          created_by: string
          daily_allowance_amount?: number | null
          daily_allowance_min_hours?: number | null
          daily_allowance_policy?: string | null
          id?: string
          lunch_break_type?:
            | Database["public"]["Enums"]["lunch_break_type"]
            | null
          meal_voucher_amount?: number | null
          meal_voucher_policy?:
            | Database["public"]["Enums"]["meal_voucher_type"]
            | null
          night_shift_end?: string | null
          night_shift_start?: string | null
          overtime_calculation?:
            | Database["public"]["Enums"]["overtime_type"]
            | null
          overtime_monthly_compensation?: boolean | null
          saturday_handling?:
            | Database["public"]["Enums"]["saturday_type"]
            | null
          saturday_hourly_rate?: number | null
          standard_daily_hours?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          business_trip_rate_with_meal?: number | null
          business_trip_rate_without_meal?: number | null
          company_id?: string
          created_at?: string
          created_by?: string
          daily_allowance_amount?: number | null
          daily_allowance_min_hours?: number | null
          daily_allowance_policy?: string | null
          id?: string
          lunch_break_type?:
            | Database["public"]["Enums"]["lunch_break_type"]
            | null
          meal_voucher_amount?: number | null
          meal_voucher_policy?:
            | Database["public"]["Enums"]["meal_voucher_type"]
            | null
          night_shift_end?: string | null
          night_shift_start?: string | null
          overtime_calculation?:
            | Database["public"]["Enums"]["overtime_type"]
            | null
          overtime_monthly_compensation?: boolean | null
          saturday_handling?:
            | Database["public"]["Enums"]["saturday_type"]
            | null
          saturday_hourly_rate?: number | null
          standard_daily_hours?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
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
        ]
      }
      profiles: {
        Row: {
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
      timesheets: {
        Row: {
          created_at: string
          created_by: string
          date: string
          end_location_lat: number | null
          end_location_lng: number | null
          end_time: string | null
          id: string
          is_holiday: boolean
          is_saturday: boolean
          lunch_duration_minutes: number | null
          lunch_end_time: string | null
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
          created_at?: string
          created_by: string
          date: string
          end_location_lat?: number | null
          end_location_lng?: number | null
          end_time?: string | null
          id?: string
          is_holiday?: boolean
          is_saturday?: boolean
          lunch_duration_minutes?: number | null
          lunch_end_time?: string | null
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
          created_at?: string
          created_by?: string
          date?: string
          end_location_lat?: number | null
          end_location_lng?: number | null
          end_time?: string | null
          id?: string
          is_holiday?: boolean
          is_saturday?: boolean
          lunch_duration_minutes?: number | null
          lunch_end_time?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_user_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
    }
    Enums: {
      lunch_break_type:
        | "30_minuti"
        | "60_minuti"
        | "libera"
        | "0_minuti"
        | "15_minuti"
        | "45_minuti"
        | "90_minuti"
        | "120_minuti"
      meal_voucher_type:
        | "oltre_6_ore"
        | "sempre_parttime"
        | "conteggio_giorni"
        | "disabilitato"
      overtime_type: "dopo_8_ore" | "sempre"
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
      meal_voucher_type: [
        "oltre_6_ore",
        "sempre_parttime",
        "conteggio_giorni",
        "disabilitato",
      ],
      overtime_type: ["dopo_8_ore", "sempre"],
      saturday_type: ["trasferta", "straordinario"],
      user_role: ["dipendente", "amministratore"],
    },
  },
} as const
