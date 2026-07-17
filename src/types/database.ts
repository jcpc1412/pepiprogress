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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      community_aggregate: {
        Row: {
          cohort_key: string | null
          compound_id: string | null
          confidence: number | null
          goal: Database["public"]["Enums"]["goal"] | null
          id: string
          metric: string | null
          n: number | null
          refreshed_at: string
          summary: Json | null
        }
        Insert: {
          cohort_key?: string | null
          compound_id?: string | null
          confidence?: number | null
          goal?: Database["public"]["Enums"]["goal"] | null
          id?: string
          metric?: string | null
          n?: number | null
          refreshed_at?: string
          summary?: Json | null
        }
        Update: {
          cohort_key?: string | null
          compound_id?: string | null
          confidence?: number | null
          goal?: Database["public"]["Enums"]["goal"] | null
          id?: string
          metric?: string | null
          n?: number | null
          refreshed_at?: string
          summary?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "community_aggregate_compound_id_fkey"
            columns: ["compound_id"]
            isOneToOne: false
            referencedRelation: "compound"
            referencedColumns: ["id"]
          },
        ]
      }
      compound: {
        Row: {
          aliases: string[]
          canonical_name: string
          cautions: string[]
          common_uses: string[]
          controlled: boolean
          created_at: string
          effect_tags: string[]
          id: string
          market_category: Database["public"]["Enums"]["market_category"]
          monitoring_tags: string[]
          slug: string
          type: Database["public"]["Enums"]["compound_type"]
        }
        Insert: {
          aliases?: string[]
          canonical_name: string
          cautions?: string[]
          common_uses?: string[]
          controlled?: boolean
          created_at?: string
          effect_tags?: string[]
          id?: string
          market_category?: Database["public"]["Enums"]["market_category"]
          monitoring_tags?: string[]
          slug: string
          type: Database["public"]["Enums"]["compound_type"]
        }
        Update: {
          aliases?: string[]
          canonical_name?: string
          cautions?: string[]
          common_uses?: string[]
          controlled?: boolean
          created_at?: string
          effect_tags?: string[]
          id?: string
          market_category?: Database["public"]["Enums"]["market_category"]
          monitoring_tags?: string[]
          slug?: string
          type?: Database["public"]["Enums"]["compound_type"]
        }
        Relationships: []
      }
      compound_fact: {
        Row: {
          citation: string | null
          compound_id: string
          confidence: number | null
          id: string
          n: number | null
          source: Database["public"]["Enums"]["fact_source"]
          type: Database["public"]["Enums"]["compound_fact_type"]
          updated_at: string
          value: Json
        }
        Insert: {
          citation?: string | null
          compound_id: string
          confidence?: number | null
          id?: string
          n?: number | null
          source: Database["public"]["Enums"]["fact_source"]
          type: Database["public"]["Enums"]["compound_fact_type"]
          updated_at?: string
          value: Json
        }
        Update: {
          citation?: string | null
          compound_id?: string
          confidence?: number | null
          id?: string
          n?: number | null
          source?: Database["public"]["Enums"]["fact_source"]
          type?: Database["public"]["Enums"]["compound_fact_type"]
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "compound_fact_compound_id_fkey"
            columns: ["compound_id"]
            isOneToOne: false
            referencedRelation: "compound"
            referencedColumns: ["id"]
          },
        ]
      }
      dose_event: {
        Row: {
          compound_id: string | null
          created_at: string
          dose: number | null
          dose_unit: string | null
          id: string
          protocol_item_id: string | null
          site: string | null
          taken_at: string
          user_id: string
        }
        Insert: {
          compound_id?: string | null
          created_at?: string
          dose?: number | null
          dose_unit?: string | null
          id?: string
          protocol_item_id?: string | null
          site?: string | null
          taken_at?: string
          user_id: string
        }
        Update: {
          compound_id?: string | null
          created_at?: string
          dose?: number | null
          dose_unit?: string | null
          id?: string
          protocol_item_id?: string | null
          site?: string | null
          taken_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dose_event_compound_id_fkey"
            columns: ["compound_id"]
            isOneToOne: false
            referencedRelation: "compound"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dose_event_protocol_item_id_fkey"
            columns: ["protocol_item_id"]
            isOneToOne: false
            referencedRelation: "protocol_item"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_connection: {
        Row: {
          created_at: string
          credentials_ref: string | null
          id: string
          last_sync_at: string | null
          provider: string
          scopes: string[]
          status: Database["public"]["Enums"]["integration_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          credentials_ref?: string | null
          id?: string
          last_sync_at?: string | null
          provider: string
          scopes?: string[]
          status?: Database["public"]["Enums"]["integration_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          credentials_ref?: string | null
          id?: string
          last_sync_at?: string | null
          provider?: string
          scopes?: string[]
          status?: Database["public"]["Enums"]["integration_status"]
          user_id?: string
        }
        Relationships: []
      }
      inventory_item: {
        Row: {
          amount_remaining: number | null
          compound_id: string | null
          concentration: number | null
          created_at: string
          expiry: string | null
          id: string
          kind: Database["public"]["Enums"]["inventory_kind"]
          label: string | null
          low_threshold: number | null
          unit: string | null
          user_id: string
          vendor: string | null
        }
        Insert: {
          amount_remaining?: number | null
          compound_id?: string | null
          concentration?: number | null
          created_at?: string
          expiry?: string | null
          id?: string
          kind: Database["public"]["Enums"]["inventory_kind"]
          label?: string | null
          low_threshold?: number | null
          unit?: string | null
          user_id: string
          vendor?: string | null
        }
        Update: {
          amount_remaining?: number | null
          compound_id?: string | null
          concentration?: number | null
          created_at?: string
          expiry?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["inventory_kind"]
          label?: string | null
          low_threshold?: number | null
          unit?: string | null
          user_id?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_item_compound_id_fkey"
            columns: ["compound_id"]
            isOneToOne: false
            referencedRelation: "compound"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_biomarker: {
        Row: {
          id: string
          lab_result_id: string
          marker: string
          ref_range: string | null
          unit: string | null
          value: number | null
        }
        Insert: {
          id?: string
          lab_result_id: string
          marker: string
          ref_range?: string | null
          unit?: string | null
          value?: number | null
        }
        Update: {
          id?: string
          lab_result_id?: string
          marker?: string
          ref_range?: string | null
          unit?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_biomarker_lab_result_id_fkey"
            columns: ["lab_result_id"]
            isOneToOne: false
            referencedRelation: "lab_result"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_result: {
        Row: {
          created_at: string
          drawn_at: string
          id: string
          source: Database["public"]["Enums"]["lab_source"]
          source_ref: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          drawn_at: string
          id?: string
          source: Database["public"]["Enums"]["lab_source"]
          source_ref?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          drawn_at?: string
          id?: string
          source?: Database["public"]["Enums"]["lab_source"]
          source_ref?: string | null
          user_id?: string
        }
        Relationships: []
      }
      log_entry: {
        Row: {
          appetite: number | null
          created_at: string
          date: string
          energy: number | null
          id: string
          libido: number | null
          measurements: string | null
          note: string | null
          skin_notes: string | null
          sleep_quality: number | null
          soreness: number | null
          updated_at: string
          user_id: string
          weight: number | null
          wellness: number | null
          workout_effort: number | null
        }
        Insert: {
          appetite?: number | null
          created_at?: string
          date: string
          energy?: number | null
          id?: string
          libido?: number | null
          measurements?: string | null
          note?: string | null
          skin_notes?: string | null
          sleep_quality?: number | null
          soreness?: number | null
          updated_at?: string
          user_id: string
          weight?: number | null
          wellness?: number | null
          workout_effort?: number | null
        }
        Update: {
          appetite?: number | null
          created_at?: string
          date?: string
          energy?: number | null
          id?: string
          libido?: number | null
          measurements?: string | null
          note?: string | null
          skin_notes?: string | null
          sleep_quality?: number | null
          soreness?: number | null
          updated_at?: string
          user_id?: string
          weight?: number | null
          wellness?: number | null
          workout_effort?: number | null
        }
        Relationships: []
      }
      metric_reading: {
        Row: {
          confidence: number | null
          id: string
          metric: string
          raw_ref: Json | null
          source_provider: string | null
          ts: string
          unit: string | null
          user_id: string
          value: number | null
        }
        Insert: {
          confidence?: number | null
          id?: string
          metric: string
          raw_ref?: Json | null
          source_provider?: string | null
          ts: string
          unit?: string | null
          user_id: string
          value?: number | null
        }
        Update: {
          confidence?: number | null
          id?: string
          metric?: string
          raw_ref?: Json | null
          source_provider?: string | null
          ts?: string
          unit?: string | null
          user_id?: string
          value?: number | null
        }
        Relationships: []
      }
      photo: {
        Row: {
          ai_consent: boolean
          ai_meta: Json | null
          capture_meta: Json | null
          captured_at: string
          created_at: string
          id: string
          session_type: Database["public"]["Enums"]["photo_session"]
          storage_consent: boolean
          storage_path: string
          user_id: string
        }
        Insert: {
          ai_consent?: boolean
          ai_meta?: Json | null
          capture_meta?: Json | null
          captured_at: string
          created_at?: string
          id?: string
          session_type: Database["public"]["Enums"]["photo_session"]
          storage_consent?: boolean
          storage_path: string
          user_id: string
        }
        Update: {
          ai_consent?: boolean
          ai_meta?: Json | null
          capture_meta?: Json | null
          captured_at?: string
          created_at?: string
          id?: string
          session_type?: Database["public"]["Enums"]["photo_session"]
          storage_consent?: boolean
          storage_path?: string
          user_id?: string
        }
        Relationships: []
      }
      protocol: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          notes: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["protocol_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          notes?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["protocol_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          notes?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["protocol_status"]
          user_id?: string
        }
        Relationships: []
      }
      protocol_item: {
        Row: {
          compound_id: string
          created_at: string
          dose: number | null
          dose_unit: string | null
          ester: string | null
          frequency: Json | null
          id: string
          protocol_id: string
          route: Database["public"]["Enums"]["dose_route"] | null
        }
        Insert: {
          compound_id: string
          created_at?: string
          dose?: number | null
          dose_unit?: string | null
          ester?: string | null
          frequency?: Json | null
          id?: string
          protocol_id: string
          route?: Database["public"]["Enums"]["dose_route"] | null
        }
        Update: {
          compound_id?: string
          created_at?: string
          dose?: number | null
          dose_unit?: string | null
          ester?: string | null
          frequency?: Json | null
          id?: string
          protocol_id?: string
          route?: Database["public"]["Enums"]["dose_route"] | null
        }
        Relationships: [
          {
            foreignKeyName: "protocol_item_compound_id_fkey"
            columns: ["compound_id"]
            isOneToOne: false
            referencedRelation: "compound"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protocol_item_protocol_id_fkey"
            columns: ["protocol_id"]
            isOneToOne: false
            referencedRelation: "protocol"
            referencedColumns: ["id"]
          },
        ]
      }
      symptom_event: {
        Row: {
          created_at: string
          duration: string | null
          id: string
          note: string | null
          onset_at: string
          severity: number | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration?: string | null
          id?: string
          note?: string | null
          onset_at: string
          severity?: number | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration?: string | null
          id?: string
          note?: string | null
          onset_at?: string
          severity?: number | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profile: {
        Row: {
          community_opt_in: boolean
          created_at: string
          date_of_birth: string | null
          goals: Database["public"]["Enums"]["goal"][]
          id: string
          locale: string
          photo_ai_opt_in: boolean
          photo_storage_consent: boolean
          units: Database["public"]["Enums"]["units_system"]
        }
        Insert: {
          community_opt_in?: boolean
          created_at?: string
          date_of_birth?: string | null
          goals?: Database["public"]["Enums"]["goal"][]
          id: string
          locale?: string
          photo_ai_opt_in?: boolean
          photo_storage_consent?: boolean
          units?: Database["public"]["Enums"]["units_system"]
        }
        Update: {
          community_opt_in?: boolean
          created_at?: string
          date_of_birth?: string | null
          goals?: Database["public"]["Enums"]["goal"][]
          id?: string
          locale?: string
          photo_ai_opt_in?: boolean
          photo_storage_consent?: boolean
          units?: Database["public"]["Enums"]["units_system"]
        }
        Relationships: []
      }
      user_state: {
        Row: {
          state: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          state: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          state?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      compound_fact_type: "dose_range" | "length" | "synergy" | "side_effect"
      compound_type:
        | "peptide"
        | "glp1"
        | "hormone"
        | "ancillary"
        | "supplement"
        | "other"
      dose_route: "subq" | "im" | "oral" | "nasal" | "topical" | "other"
      fact_source: "internet" | "community"
      goal:
        | "weight_loss"
        | "skin"
        | "body_comp"
        | "sleep"
        | "recovery"
        | "wellness"
      integration_status: "pending" | "connected" | "disconnected" | "error"
      inventory_kind: "vial" | "consumable"
      lab_source: "manual" | "ai_parsed"
      market_category: "inoffensive" | "otc" | "grey" | "controlled"
      photo_session: "face" | "body"
      protocol_status: "active" | "paused" | "ended"
      units_system: "metric" | "imperial"
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
      compound_fact_type: ["dose_range", "length", "synergy", "side_effect"],
      compound_type: [
        "peptide",
        "glp1",
        "hormone",
        "ancillary",
        "supplement",
        "other",
      ],
      dose_route: ["subq", "im", "oral", "nasal", "topical", "other"],
      fact_source: ["internet", "community"],
      goal: [
        "weight_loss",
        "skin",
        "body_comp",
        "sleep",
        "recovery",
        "wellness",
      ],
      integration_status: ["pending", "connected", "disconnected", "error"],
      inventory_kind: ["vial", "consumable"],
      lab_source: ["manual", "ai_parsed"],
      market_category: ["inoffensive", "otc", "grey", "controlled"],
      photo_session: ["face", "body"],
      protocol_status: ["active", "paused", "ended"],
      units_system: ["metric", "imperial"],
    },
  },
} as const
