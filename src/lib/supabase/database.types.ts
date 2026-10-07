export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      captures: {
        Row: {
          client_id: string | null
          company_id: string | null
          created_at: string
          id: string
          item_id: string | null
          parsed: Json | null
          raw_text: string
          source: string
          theme_id: string | null
        }
        Insert: {
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          parsed?: Json | null
          raw_text: string
          source?: string
          theme_id?: string | null
        }
        Update: {
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          parsed?: Json | null
          raw_text?: string
          source?: string
          theme_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "captures_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captures_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captures_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captures_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captures_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "public_themes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captures_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          archived_at: string | null
          bse_code: string | null
          created_at: string
          id: string
          isin: string | null
          name: string
          needs_review: boolean
          nse_symbol: string | null
          one_liner: string | null
          sector: string | null
          slug: string
          visibility: string
        }
        Insert: {
          archived_at?: string | null
          bse_code?: string | null
          created_at?: string
          id?: string
          isin?: string | null
          name: string
          needs_review?: boolean
          nse_symbol?: string | null
          one_liner?: string | null
          sector?: string | null
          slug: string
          visibility?: string
        }
        Update: {
          archived_at?: string | null
          bse_code?: string | null
          created_at?: string
          id?: string
          isin?: string | null
          name?: string
          needs_review?: boolean
          nse_symbol?: string | null
          one_liner?: string | null
          sector?: string | null
          slug?: string
          visibility?: string
        }
        Relationships: []
      }
      company_aliases: {
        Row: {
          company_id: string
          created_at: string
          symbol: string
        }
        Insert: {
          company_id: string
          created_at?: string
          symbol: string
        }
        Update: {
          company_id?: string
          created_at?: string
          symbol?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_aliases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_aliases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      document_pages: {
        Row: {
          basis: string | null
          char_count: number | null
          created_at: string
          document_id: string
          first_line: string | null
          is_scan: boolean | null
          kind: string | null
          page_no: number
          score: number
          search: unknown
          selected: boolean
          selected_by: string | null
          text: string
        }
        Insert: {
          basis?: string | null
          char_count?: never
          created_at?: string
          document_id: string
          first_line?: never
          is_scan?: never
          kind?: string | null
          page_no: number
          score?: number
          search?: never
          selected?: boolean
          selected_by?: string | null
          text: string
        }
        Update: {
          basis?: string | null
          char_count?: never
          created_at?: string
          document_id?: string
          first_line?: never
          is_scan?: never
          kind?: string | null
          page_no?: number
          score?: number
          search?: never
          selected?: boolean
          selected_by?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_pages_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          basis: string
          bytes: number
          company_id: string | null
          created_at: string
          filed_on: string | null
          id: string
          kind: string
          llm_page_budget: number
          original_deleted_at: string | null
          page_count: number | null
          sha256: string
          source_type: string
          source_url: string | null
          status: string
          storage_path: string | null
          title: string
          updated_at: string
        }
        Insert: {
          basis?: string
          bytes: number
          company_id?: string | null
          created_at?: string
          filed_on?: string | null
          id?: string
          kind?: string
          llm_page_budget?: number
          original_deleted_at?: string | null
          page_count?: number | null
          sha256: string
          source_type?: string
          source_url?: string | null
          status?: string
          storage_path?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          basis?: string
          bytes?: number
          company_id?: string | null
          created_at?: string
          filed_on?: string | null
          id?: string
          kind?: string
          llm_page_budget?: number
          original_deleted_at?: string | null
          page_count?: number | null
          sha256?: string
          source_type?: string
          source_url?: string | null
          status?: string
          storage_path?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      gate_decisions: {
        Row: {
          created_at: string
          decided_at: string
          id: string
          item_id: string
          policy_version: string
          reasons: NonNullable<Json>
          revision_id: string
          verdict: string
        }
        Insert: {
          created_at?: string
          decided_at?: string
          id?: string
          item_id: string
          policy_version: string
          reasons?: NonNullable<Json>
          revision_id: string
          verdict: string
        }
        Update: {
          created_at?: string
          decided_at?: string
          id?: string
          item_id?: string
          policy_version?: string
          reasons?: NonNullable<Json>
          revision_id?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "gate_decisions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_decisions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_decisions_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "item_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_decisions_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "public_item_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_decisions_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["revision_id"]
          },
        ]
      }
      heartbeats: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          job: string
          ok: boolean
          ran_at: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          job: string
          ok: boolean
          ran_at?: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          job?: string
          ok?: boolean
          ran_at?: string
        }
        Relationships: []
      }
      ignored_tokens: {
        Row: {
          created_at: string
          kind: string
          token: string
        }
        Insert: {
          created_at?: string
          kind: string
          token: string
        }
        Update: {
          created_at?: string
          kind?: string
          token?: string
        }
        Relationships: []
      }
      item_revisions: {
        Row: {
          author: string
          body_md: string
          change_reason: string | null
          created_at: string
          id: string
          item_id: string
          rev_no: number
          schema_version: number
          structured: NonNullable<Json>
        }
        Insert: {
          author?: string
          body_md?: string
          change_reason?: string | null
          created_at?: string
          id?: string
          item_id: string
          rev_no?: number
          schema_version?: number
          structured?: NonNullable<Json>
        }
        Update: {
          author?: string
          body_md?: string
          change_reason?: string | null
          created_at?: string
          id?: string
          item_id?: string
          rev_no?: number
          schema_version?: number
          structured?: NonNullable<Json>
        }
        Relationships: [
          {
            foreignKeyName: "item_revisions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_revisions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          company_id: string | null
          created_at: string
          current_revision_id: string | null
          data_as_of: string | null
          file_no: number | null
          holds_position: string | null
          id: string
          kind: string
          learning_objective: string | null
          published_at: string | null
          search: unknown
          slug: string | null
          status: string
          theme_id: string | null
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          current_revision_id?: string | null
          data_as_of?: string | null
          file_no?: number | null
          holds_position?: string | null
          id?: string
          kind: string
          learning_objective?: string | null
          published_at?: string | null
          search?: never
          slug?: string | null
          status?: string
          theme_id?: string | null
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          current_revision_id?: string | null
          data_as_of?: string | null
          file_no?: number | null
          holds_position?: string | null
          id?: string
          kind?: string
          learning_objective?: string | null
          published_at?: string | null
          search?: never
          slug?: string | null
          status?: string
          theme_id?: string | null
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_current_revision_fk"
            columns: ["current_revision_id"]
            isOneToOne: false
            referencedRelation: "item_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_current_revision_fk"
            columns: ["current_revision_id"]
            isOneToOne: false
            referencedRelation: "public_item_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_current_revision_fk"
            columns: ["current_revision_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["revision_id"]
          },
          {
            foreignKeyName: "items_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "public_themes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      job_steps: {
        Row: {
          args: NonNullable<Json>
          created_at: string
          id: string
          job_id: string
          kind: string
          last_error: string | null
          lease_expiries: number
          lease_owner: string | null
          locked_until: string | null
          not_before: string
          page_no: number | null
          provider_failures: number
          result: Json | null
          schema_failures: number
          status: string
          updated_at: string
          wait_reason: string | null
        }
        Insert: {
          args?: NonNullable<Json>
          created_at?: string
          id?: string
          job_id: string
          kind: string
          last_error?: string | null
          lease_expiries?: number
          lease_owner?: string | null
          locked_until?: string | null
          not_before?: string
          page_no?: number | null
          provider_failures?: number
          result?: Json | null
          schema_failures?: number
          status?: string
          updated_at?: string
          wait_reason?: string | null
        }
        Update: {
          args?: NonNullable<Json>
          created_at?: string
          id?: string
          job_id?: string
          kind?: string
          last_error?: string | null
          lease_expiries?: number
          lease_owner?: string | null
          locked_until?: string | null
          not_before?: string
          page_no?: number | null
          provider_failures?: number
          result?: Json | null
          schema_failures?: number
          status?: string
          updated_at?: string
          wait_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_steps_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          cancelled_at: string | null
          created_at: string
          document_id: string
          id: string
          kind: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          document_id: string
          id?: string
          kind: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          document_id?: string
          id?: string
          kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      lint_allowances: {
        Row: {
          created_at: string
          id: string
          item_id: string
          reason: string
          sentence_hash: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          reason: string
          sentence_hash: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          reason?: string
          sentence_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "lint_allowances_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lint_allowances_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          role: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          role?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          role?: string
        }
        Relationships: []
      }
      themes: {
        Row: {
          archived_at: string | null
          created_at: string
          description_md: string | null
          id: string
          name: string
          needs_review: boolean
          slug: string
          visibility: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          description_md?: string | null
          id?: string
          name: string
          needs_review?: boolean
          slug: string
          visibility?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          description_md?: string | null
          id?: string
          name?: string
          needs_review?: boolean
          slug?: string
          visibility?: string
        }
        Relationships: []
      }
    }
    Views: {
      public_companies: {
        Row: {
          bse_code: string | null
          id: string | null
          isin: string | null
          name: string | null
          nse_symbol: string | null
          sector: string | null
          slug: string | null
        }
        Insert: {
          bse_code?: string | null
          id?: string | null
          isin?: string | null
          name?: string | null
          nse_symbol?: string | null
          sector?: string | null
          slug?: string | null
        }
        Update: {
          bse_code?: string | null
          id?: string | null
          isin?: string | null
          name?: string | null
          nse_symbol?: string | null
          sector?: string | null
          slug?: string | null
        }
        Relationships: []
      }
      public_item_revisions: {
        Row: {
          body_md: string | null
          change_reason: string | null
          created_at: string | null
          id: string | null
          item_id: string | null
          rev_no: number | null
          structured: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "item_revisions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_revisions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["id"]
          },
        ]
      }
      public_items: {
        Row: {
          body_md: string | null
          company_id: string | null
          data_as_of: string | null
          file_no: number | null
          holds_position: string | null
          id: string | null
          kind: string | null
          learning_objective: string | null
          published_at: string | null
          rev_no: number | null
          revised_at: string | null
          revision_id: string | null
          schema_version: number | null
          slug: string | null
          structured: Json | null
          theme_id: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "public_themes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      public_themes: {
        Row: {
          id: string | null
          name: string | null
          slug: string | null
        }
        Insert: {
          id?: string | null
          name?: string | null
          slug?: string | null
        }
        Update: {
          id?: string | null
          name?: string | null
          slug?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_lint_allowance: {
        Args: {
          p_actor: string
          p_item_id: string
          p_reason: string
          p_sentence_hash: string
        }
        Returns: boolean
      }
      capture_days: {
        Args: { p_days?: number }
        Returns: {
          day: string
        }[]
      }
      claim_job_step: {
        Args: { p_lease_seconds?: number; p_owner: string }
        Returns: {
          args: NonNullable<Json>
          created_at: string
          id: string
          job_id: string
          kind: string
          last_error: string | null
          lease_expiries: number
          lease_owner: string | null
          locked_until: string | null
          not_before: string
          page_no: number | null
          provider_failures: number
          result: Json | null
          schema_failures: number
          status: string
          updated_at: string
          wait_reason: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "job_steps"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      heartbeat_ages: {
        Args: Record<PropertyKey, never>
        Returns: {
          age_seconds: number
          job: string
          ok: boolean
        }[]
      }
      publish_revision: {
        Args: {
          p_actor: string
          p_item_id: string
          p_lint_result: Json
          p_policy_version: string
          p_revision_id: string
        }
        Returns: {
          created_at: string
          decided_at: string
          id: string
          item_id: string
          policy_version: string
          reasons: NonNullable<Json>
          revision_id: string
          verdict: string
        }
        SetofOptions: {
          from: "*"
          to: "gate_decisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      queue_age: { Args: Record<PropertyKey, never>; Returns: number }
      remove_lint_allowance: {
        Args: { p_actor: string; p_item_id: string; p_sentence_hash: string }
        Returns: boolean
      }
      storage_usage: {
        Args: Record<PropertyKey, never>
        Returns: {
          database_bytes: number
          storage_bytes: number
        }[]
      }
      unpublish_item: {
        Args: { p_actor: string; p_item_id: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
