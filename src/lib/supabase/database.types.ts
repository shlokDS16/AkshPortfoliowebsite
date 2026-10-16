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
            foreignKeyName: "captures_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_video_transcripts"
            referencedColumns: ["item_id"]
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
      concept_edges: {
        Row: {
          concept_a: string
          concept_b: string
          created_at: string
          id: string
        }
        Insert: {
          concept_a: string
          concept_b: string
          created_at?: string
          id?: string
        }
        Update: {
          concept_a?: string
          concept_b?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "concept_edges_concept_a_fkey"
            columns: ["concept_a"]
            isOneToOne: false
            referencedRelation: "public_themes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concept_edges_concept_a_fkey"
            columns: ["concept_a"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concept_edges_concept_b_fkey"
            columns: ["concept_b"]
            isOneToOne: false
            referencedRelation: "public_themes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concept_edges_concept_b_fkey"
            columns: ["concept_b"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      corporate_actions: {
        Row: {
          company_id: string
          created_at: string
          ex_date: string
          factor: number
          id: string
          kind: string
          note: string | null
          supersedes: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          ex_date: string
          factor: number
          id?: string
          kind: string
          note?: string | null
          supersedes?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          ex_date?: string
          factor?: number
          id?: string
          kind?: string
          note?: string | null
          supersedes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "corporate_actions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corporate_actions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corporate_actions_supersedes_fkey"
            columns: ["supersedes"]
            isOneToOne: false
            referencedRelation: "corporate_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      document_digests: {
        Row: {
          claim: string
          created_at: string
          document_id: string
          extraction_id: string
          id: string
          line: string
          on_page: boolean
          ord: number
          page_no: number
          section: string
        }
        Insert: {
          claim: string
          created_at?: string
          document_id: string
          extraction_id: string
          id?: string
          line: string
          on_page: boolean
          ord: number
          page_no: number
          section: string
        }
        Update: {
          claim?: string
          created_at?: string
          document_id?: string
          extraction_id?: string
          id?: string
          line?: string
          on_page?: boolean
          ord?: number
          page_no?: number
          section?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_digests_document_id_page_no_fkey"
            columns: ["document_id", "page_no"]
            isOneToOne: false
            referencedRelation: "document_pages"
            referencedColumns: ["document_id", "page_no"]
          },
          {
            foreignKeyName: "document_digests_extraction_id_fkey"
            columns: ["extraction_id"]
            isOneToOne: false
            referencedRelation: "extractions"
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
          ocr: boolean
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
          ocr?: boolean
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
          ocr?: boolean
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
          fetched_from: string | null
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
          transcript_status: string | null
          updated_at: string
        }
        Insert: {
          basis?: string
          bytes: number
          company_id?: string | null
          created_at?: string
          fetched_from?: string | null
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
          transcript_status?: string | null
          updated_at?: string
        }
        Update: {
          basis?: string
          bytes?: number
          company_id?: string | null
          created_at?: string
          fetched_from?: string | null
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
          transcript_status?: string | null
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
      extractions: {
        Row: {
          created_at: string
          document_id: string
          id: string
          input_hash: string
          model: string
          output: NonNullable<Json>
          page_no: number
          prompt_version: string
          tokens_used: number
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          input_hash: string
          model: string
          output: NonNullable<Json>
          page_no: number
          prompt_version: string
          tokens_used?: number
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          input_hash?: string
          model?: string
          output?: NonNullable<Json>
          page_no?: number
          prompt_version?: string
          tokens_used?: number
        }
        Relationships: [
          {
            foreignKeyName: "extractions_document_id_page_no_fkey"
            columns: ["document_id", "page_no"]
            isOneToOne: false
            referencedRelation: "document_pages"
            referencedColumns: ["document_id", "page_no"]
          },
        ]
      }
      fact_provenance: {
        Row: {
          created_at: string
          edited: boolean
          fact_id: string
          id: string
          proposal_id: string
          revision_id: string
        }
        Insert: {
          created_at?: string
          edited: boolean
          fact_id: string
          id?: string
          proposal_id: string
          revision_id: string
        }
        Update: {
          created_at?: string
          edited?: boolean
          fact_id?: string
          id?: string
          proposal_id?: string
          revision_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fact_provenance_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fact_provenance_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "concept_links"
            referencedColumns: ["revision_id"]
          },
          {
            foreignKeyName: "fact_provenance_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "item_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fact_provenance_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "public_concept_links"
            referencedColumns: ["revision_id"]
          },
          {
            foreignKeyName: "fact_provenance_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "public_item_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fact_provenance_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["revision_id"]
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
            foreignKeyName: "gate_decisions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_video_transcripts"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "gate_decisions_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "concept_links"
            referencedColumns: ["revision_id"]
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
            referencedRelation: "public_concept_links"
            referencedColumns: ["revision_id"]
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
      idea_events: {
        Row: {
          body_md: string
          canonical: string
          hash: string
          id: string
          idea_id: string
          kind: string
          nonce: string
          prev_hash: string
          recorded_at: string
          seq: number
          stance: NonNullable<Json>
        }
        Insert: {
          body_md: string
          canonical: string
          hash: string
          id?: string
          idea_id: string
          kind: string
          nonce: string
          prev_hash: string
          recorded_at: string
          seq: number
          stance?: NonNullable<Json>
        }
        Update: {
          body_md?: string
          canonical?: string
          hash?: string
          id?: string
          idea_id?: string
          kind?: string
          nonce?: string
          prev_hash?: string
          recorded_at?: string
          seq?: number
          stance?: NonNullable<Json>
        }
        Relationships: [
          {
            foreignKeyName: "idea_events_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
        ]
      }
      idea_score_changes: {
        Row: {
          became: NonNullable<Json>
          changed: string[]
          changed_at: string
          id: number
          idea_id: string
          was: NonNullable<Json>
        }
        Insert: {
          became: NonNullable<Json>
          changed: string[]
          changed_at?: string
          id?: never
          idea_id: string
          was: NonNullable<Json>
        }
        Update: {
          became?: NonNullable<Json>
          changed?: string[]
          changed_at?: string
          id?: never
          idea_id?: string
          was?: NonNullable<Json>
        }
        Relationships: [
          {
            foreignKeyName: "idea_score_changes_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
        ]
      }
      idea_scores: {
        Row: {
          computed_at: string
          entry_close: number | null
          entry_date: string | null
          entry_index: number | null
          entry_skipped_days: number | null
          entry_source: string | null
          excess: number | null
          exit_skipped_days: number | null
          factor: number | null
          flags: string[]
          holding_days: number | null
          idea_id: string
          idea_return: number | null
          index_return: number | null
          is_final: boolean
          mark_close: number | null
          mark_date: string | null
          mark_index: number | null
          mark_source: string | null
        }
        Insert: {
          computed_at?: string
          entry_close?: number | null
          entry_date?: string | null
          entry_index?: number | null
          entry_skipped_days?: number | null
          entry_source?: string | null
          excess?: number | null
          exit_skipped_days?: number | null
          factor?: number | null
          flags?: string[]
          holding_days?: number | null
          idea_id: string
          idea_return?: number | null
          index_return?: number | null
          is_final?: boolean
          mark_close?: number | null
          mark_date?: string | null
          mark_index?: number | null
          mark_source?: string | null
        }
        Update: {
          computed_at?: string
          entry_close?: number | null
          entry_date?: string | null
          entry_index?: number | null
          entry_skipped_days?: number | null
          entry_source?: string | null
          excess?: number | null
          exit_skipped_days?: number | null
          factor?: number | null
          flags?: string[]
          holding_days?: number | null
          idea_id?: string
          idea_return?: number | null
          index_return?: number | null
          is_final?: boolean
          mark_close?: number | null
          mark_date?: string | null
          mark_index?: number | null
          mark_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "idea_scores_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: true
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
        ]
      }
      ideas: {
        Row: {
          close_reason: string | null
          closed_at: string | null
          company_id: string
          created_at: string
          expects: string
          held: boolean
          horizon_days: number
          id: string
          item_id: string | null
          opened_at: string
          process_call: string | null
          status: string
        }
        Insert: {
          close_reason?: string | null
          closed_at?: string | null
          company_id: string
          created_at?: string
          expects: string
          held: boolean
          horizon_days: number
          id?: string
          item_id?: string | null
          opened_at?: string
          process_call?: string | null
          status?: string
        }
        Update: {
          close_reason?: string | null
          closed_at?: string | null
          company_id?: string
          created_at?: string
          expects?: string
          held?: boolean
          horizon_days?: number
          id?: string
          item_id?: string | null
          opened_at?: string
          process_call?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ideas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_video_transcripts"
            referencedColumns: ["item_id"]
          },
        ]
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
          concept_ids: string[] | null
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
          concept_ids?: string[] | null
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
          concept_ids?: string[] | null
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
          {
            foreignKeyName: "item_revisions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_video_transcripts"
            referencedColumns: ["item_id"]
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
            referencedRelation: "concept_links"
            referencedColumns: ["revision_id"]
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
            referencedRelation: "public_concept_links"
            referencedColumns: ["revision_id"]
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
          pass: number
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
          pass?: number
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
          pass?: number
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
      ledger_anchors: {
        Row: {
          anchor_date: string
          anchor_version: string | null
          created_at: string
          event_count: number
          first_seq: number | null
          head_hash: string
          last_seq: number | null
          line: string
          published_at: string | null
        }
        Insert: {
          anchor_date: string
          anchor_version?: string | null
          created_at?: string
          event_count: number
          first_seq?: number | null
          head_hash: string
          last_seq?: number | null
          line: string
          published_at?: string | null
        }
        Update: {
          anchor_date?: string
          anchor_version?: string | null
          created_at?: string
          event_count?: number
          first_seq?: number | null
          head_hash?: string
          last_seq?: number | null
          line?: string
          published_at?: string | null
        }
        Relationships: []
      }
      ledger_uploads: {
        Row: {
          admin_id: string
          id: number
          index_bytes: number | null
          index_given: boolean
          index_sha256: string | null
          kept: number
          stored: number
          trade_date: string
          uploaded_at: string
          zip_bytes: number
          zip_sha256: string
        }
        Insert: {
          admin_id: string
          id?: never
          index_bytes?: number | null
          index_given: boolean
          index_sha256?: string | null
          kept: number
          stored: number
          trade_date: string
          uploaded_at?: string
          zip_bytes: number
          zip_sha256: string
        }
        Update: {
          admin_id?: string
          id?: never
          index_bytes?: number | null
          index_given?: boolean
          index_sha256?: string | null
          kept?: number
          stored?: number
          trade_date?: string
          uploaded_at?: string
          zip_bytes?: number
          zip_sha256?: string
        }
        Relationships: []
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
          {
            foreignKeyName: "lint_allowances_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_video_transcripts"
            referencedColumns: ["item_id"]
          },
        ]
      }
      market_days: {
        Row: {
          decided_at: string
          source: string
          status: string
          trade_date: string
        }
        Insert: {
          decided_at?: string
          source: string
          status: string
          trade_date: string
        }
        Update: {
          decided_at?: string
          source?: string
          status?: string
          trade_date?: string
        }
        Relationships: []
      }
      prices_daily: {
        Row: {
          benchmark: string | null
          close: number
          company_id: string | null
          created_at: string
          id: number
          isin: string | null
          series: string | null
          source: string
          symbol: string | null
          trade_date: string
        }
        Insert: {
          benchmark?: string | null
          close: number
          company_id?: string | null
          created_at?: string
          id?: never
          isin?: string | null
          series?: string | null
          source: string
          symbol?: string | null
          trade_date: string
        }
        Update: {
          benchmark?: string | null
          close?: number
          company_id?: string | null
          created_at?: string
          id?: never
          isin?: string | null
          series?: string | null
          source?: string
          symbol?: string | null
          trade_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "prices_daily_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prices_daily_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_companies"
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
      proposals: {
        Row: {
          accepted_value: Json | null
          created_at: string
          decided_at: string | null
          dedupe_key: string
          document_id: string
          extraction_id: string
          flags: string[]
          id: string
          item_id: string | null
          machine_value: NonNullable<Json>
          page_no: number
          reason: string
          revision_id: string | null
          status: string
          superseded: boolean
          updated_at: string
        }
        Insert: {
          accepted_value?: Json | null
          created_at?: string
          decided_at?: string | null
          dedupe_key: string
          document_id: string
          extraction_id: string
          flags?: string[]
          id?: string
          item_id?: string | null
          machine_value: NonNullable<Json>
          page_no: number
          reason: string
          revision_id?: string | null
          status?: string
          superseded?: boolean
          updated_at?: string
        }
        Update: {
          accepted_value?: Json | null
          created_at?: string
          decided_at?: string | null
          dedupe_key?: string
          document_id?: string
          extraction_id?: string
          flags?: string[]
          id?: string
          item_id?: string | null
          machine_value?: NonNullable<Json>
          page_no?: number
          reason?: string
          revision_id?: string | null
          status?: string
          superseded?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposals_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_extraction_id_fkey"
            columns: ["extraction_id"]
            isOneToOne: false
            referencedRelation: "extractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_video_transcripts"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "proposals_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "concept_links"
            referencedColumns: ["revision_id"]
          },
          {
            foreignKeyName: "proposals_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "item_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "public_concept_links"
            referencedColumns: ["revision_id"]
          },
          {
            foreignKeyName: "proposals_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "public_item_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["revision_id"]
          },
        ]
      }
      provider_usage: {
        Row: {
          at: string
          block_reason: string | null
          blocked_until: string | null
          bucket: string
          id: string
          kind: string
          remaining_requests: number | null
          remaining_tokens: number | null
          retry_after_s: number | null
          status: string | null
          tokens_est: number | null
          tokens_used: number | null
        }
        Insert: {
          at?: string
          block_reason?: string | null
          blocked_until?: string | null
          bucket: string
          id?: string
          kind: string
          remaining_requests?: number | null
          remaining_tokens?: number | null
          retry_after_s?: number | null
          status?: string | null
          tokens_est?: number | null
          tokens_used?: number | null
        }
        Update: {
          at?: string
          block_reason?: string | null
          blocked_until?: string | null
          bucket?: string
          id?: string
          kind?: string
          remaining_requests?: number | null
          remaining_tokens?: number | null
          retry_after_s?: number | null
          status?: string | null
          tokens_est?: number | null
          tokens_used?: number | null
        }
        Relationships: []
      }
      reading_proposals: {
        Row: {
          created_at: string
          decided_at: string | null
          document_id: string
          extraction_id: string
          id: string
          item_id: string | null
          item_id_hint: string | null
          machine_value: NonNullable<Json>
          page_no: number
          pass: number
          revision_id: string | null
          status: string
          superseded: boolean
          test_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          document_id: string
          extraction_id: string
          id?: string
          item_id?: string | null
          item_id_hint?: string | null
          machine_value: NonNullable<Json>
          page_no: number
          pass?: number
          revision_id?: string | null
          status?: string
          superseded?: boolean
          test_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          document_id?: string
          extraction_id?: string
          id?: string
          item_id?: string | null
          item_id_hint?: string | null
          machine_value?: NonNullable<Json>
          page_no?: number
          pass?: number
          revision_id?: string | null
          status?: string
          superseded?: boolean
          test_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_proposals_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_proposals_extraction_id_fkey"
            columns: ["extraction_id"]
            isOneToOne: false
            referencedRelation: "extractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_proposals_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_proposals_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_proposals_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_video_transcripts"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "reading_proposals_item_id_hint_fkey"
            columns: ["item_id_hint"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_proposals_item_id_hint_fkey"
            columns: ["item_id_hint"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_proposals_item_id_hint_fkey"
            columns: ["item_id_hint"]
            isOneToOne: false
            referencedRelation: "public_video_transcripts"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "reading_proposals_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "concept_links"
            referencedColumns: ["revision_id"]
          },
          {
            foreignKeyName: "reading_proposals_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "item_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_proposals_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "public_concept_links"
            referencedColumns: ["revision_id"]
          },
          {
            foreignKeyName: "reading_proposals_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "public_item_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_proposals_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["revision_id"]
          },
        ]
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
      valuation_cells: {
        Row: {
          addr: string
          id: string
          label: string | null
          role: string
          sheet: string
          version_id: string
        }
        Insert: {
          addr: string
          id?: string
          label?: string | null
          role: string
          sheet: string
          version_id: string
        }
        Update: {
          addr?: string
          id?: string
          label?: string | null
          role?: string
          sheet?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "valuation_cells_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "valuation_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      valuation_scenario_values: {
        Row: {
          cell_id: string
          scenario_id: string
          value: number
        }
        Insert: {
          cell_id: string
          scenario_id: string
          value: number
        }
        Update: {
          cell_id?: string
          scenario_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "valuation_scenario_values_cell_id_fkey"
            columns: ["cell_id"]
            isOneToOne: false
            referencedRelation: "valuation_cells"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valuation_scenario_values_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "valuation_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      valuation_scenarios: {
        Row: {
          created_at: string
          id: string
          name: string
          note: string
          version_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          note?: string
          version_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          note?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "valuation_scenarios_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "valuation_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      valuation_versions: {
        Row: {
          cell_count: number | null
          company_id: string
          confirmed_at: string | null
          created_at: string
          document_id: string
          engine: Json | null
          formula_count: number | null
          id: string
          model_path: string | null
          read_at: string | null
          refusal: string | null
          report: Json | null
          sheet_count: number | null
          status: string
          version_no: number
        }
        Insert: {
          cell_count?: number | null
          company_id: string
          confirmed_at?: string | null
          created_at?: string
          document_id: string
          engine?: Json | null
          formula_count?: number | null
          id?: string
          model_path?: string | null
          read_at?: string | null
          refusal?: string | null
          report?: Json | null
          sheet_count?: number | null
          status?: string
          version_no: number
        }
        Update: {
          cell_count?: number | null
          company_id?: string
          confirmed_at?: string | null
          created_at?: string
          document_id?: string
          engine?: Json | null
          formula_count?: number | null
          id?: string
          model_path?: string | null
          read_at?: string | null
          refusal?: string | null
          report?: Json | null
          sheet_count?: number | null
          status?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "valuation_versions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valuation_versions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "public_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valuation_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      video_sources: {
        Row: {
          channel_id: string | null
          created_at: string
          duration_seconds: number | null
          fetch_problem: string | null
          fetched_at: string | null
          id: string
          item_id: string
          own_channel: boolean | null
          privacy: string | null
          youtube_id: string
          yt_description: string | null
          yt_published_at: string | null
          yt_title: string | null
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          fetch_problem?: string | null
          fetched_at?: string | null
          id?: string
          item_id: string
          own_channel?: boolean | null
          privacy?: string | null
          youtube_id: string
          yt_description?: string | null
          yt_published_at?: string | null
          yt_title?: string | null
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          fetch_problem?: string | null
          fetched_at?: string | null
          id?: string
          item_id?: string
          own_channel?: boolean | null
          privacy?: string | null
          youtube_id?: string
          yt_description?: string | null
          yt_published_at?: string | null
          yt_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_sources_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_sources_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "public_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_sources_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "public_video_transcripts"
            referencedColumns: ["item_id"]
          },
        ]
      }
      video_transcripts: {
        Row: {
          created_at: string
          file_sha256: string | null
          id: string
          segments: NonNullable<Json>
          source: string
          text_sha256: string
          video_source_id: string
          words: number
        }
        Insert: {
          created_at?: string
          file_sha256?: string | null
          id?: string
          segments: NonNullable<Json>
          source?: string
          text_sha256: string
          video_source_id: string
          words: number
        }
        Update: {
          created_at?: string
          file_sha256?: string | null
          id?: string
          segments?: NonNullable<Json>
          source?: string
          text_sha256?: string
          video_source_id?: string
          words?: number
        }
        Relationships: [
          {
            foreignKeyName: "video_transcripts_video_source_id_fkey"
            columns: ["video_source_id"]
            isOneToOne: false
            referencedRelation: "video_sources"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      concept_links: {
        Row: {
          concept_id: string | null
          item_id: string | null
          position: number | null
          revision_id: string | null
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
          {
            foreignKeyName: "item_revisions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_video_transcripts"
            referencedColumns: ["item_id"]
          },
        ]
      }
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
      public_concept_links: {
        Row: {
          concept_id: string | null
          item_id: string | null
          position: number | null
          revision_id: string | null
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
          {
            foreignKeyName: "item_revisions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_video_transcripts"
            referencedColumns: ["item_id"]
          },
        ]
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
          {
            foreignKeyName: "item_revisions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_video_transcripts"
            referencedColumns: ["item_id"]
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
      public_video_transcripts: {
        Row: {
          item_id: string | null
          segments: Json | null
        }
        Relationships: []
      }
      public_videos: {
        Row: {
          duration_seconds: number | null
          item_id: string | null
          youtube_id: string | null
          yt_published_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_sources_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_sources_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "public_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_sources_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "public_video_transcripts"
            referencedColumns: ["item_id"]
          },
        ]
      }
    }
    Functions: {
      add_idea_event: {
        Args: {
          p_body_md: string
          p_idea_id: string
          p_kind: string
          p_stance?: Json
        }
        Returns: string
      }
      add_lint_allowance: {
        Args: {
          p_actor: string
          p_item_id: string
          p_reason: string
          p_sentence_hash: string
        }
        Returns: boolean
      }
      alert_sent: { Args: { p_id: number; p_kind: string }; Returns: undefined }
      alert_step: {
        Args: { p_red: string[] }
        Returns: {
          incident_id: number
          keys: string[]
          kind: string
          opened_at: string
        }[]
      }
      capture_days: {
        Args: { p_days?: number }
        Returns: {
          day: string
        }[]
      }
      case_study_record: { Args: { p_idea_id: string }; Returns: Json }
      case_study_switches: {
        Args: Record<PropertyKey, never>
        Returns: {
          chart: boolean
          reveal: boolean
        }[]
      }
      check_ledger_anchors: {
        Args: Record<PropertyKey, never>
        Returns: {
          days: number
          first_bad_date: string
          ok: boolean
          reason: string
        }[]
      }
      check_ledger_chain: {
        Args: Record<PropertyKey, never>
        Returns: {
          bad_idea: string
          events: number
          first_bad_seq: number
          ok: boolean
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
          pass: number
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
      confirm_valuation_version: {
        Args: { p_cells: Json; p_version_id: string }
        Returns: undefined
      }
      enter_closes: {
        Args: { p_index_close: number; p_rows: Json; p_trade_date: string }
        Returns: Record<string, unknown>
      }
      heartbeat_ages: {
        Args: Record<PropertyKey, never>
        Returns: {
          age_seconds: number
          job: string
          ok: boolean
        }[]
      }
      ledger_gate_facts: {
        Args: { p_company_id: string }
        Returns: {
          clear_from: string
          holds_position: boolean
          ledger_ok: boolean
        }[]
      }
      mark_market_day_shut: {
        Args: { p_trade_date: string }
        Returns: undefined
      }
      open_idea: {
        Args: {
          p_body_md: string
          p_company_id: string
          p_expects: string
          p_held: boolean
          p_horizon_days: number
          p_item_id?: string
        }
        Returns: string
      }
      prune_provider_usage: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      public_fact_checks: {
        Args: Record<PropertyKey, never>
        Returns: {
          fact_id: string
          item_id: string
          page_no: number
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
      purge_stale_video_data: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      queue_age: { Args: Record<PropertyKey, never>; Returns: number }
      record_video_fetch: {
        Args: {
          p_channel_id: string
          p_description: string
          p_duration: number
          p_found: boolean
          p_own_channel: boolean
          p_privacy: string
          p_problem: string
          p_published_at: string
          p_source_id: string
          p_title: string
        }
        Returns: {
          channel_id: string | null
          created_at: string
          duration_seconds: number | null
          fetch_problem: string | null
          fetched_at: string | null
          id: string
          item_id: string
          own_channel: boolean | null
          privacy: string | null
          youtube_id: string
          yt_description: string | null
          yt_published_at: string | null
          yt_title: string | null
        }
        SetofOptions: {
          from: "*"
          to: "video_sources"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      redeem_pump_ticket: { Args: { p_token: string }; Returns: boolean }
      register_clock_target: { Args: { p_url: string }; Returns: boolean }
      remove_lint_allowance: {
        Args: { p_actor: string; p_item_id: string; p_sentence_hash: string }
        Returns: boolean
      }
      rescore_ideas: { Args: Record<PropertyKey, never>; Returns: number }
      reserve_units: {
        Args: {
          p_bucket: string
          p_day_cap: number
          p_hour_cap: number
          p_minute_cap: number
          p_rpd: number
          p_rpm: number
          p_units: number
        }
        Returns: {
          not_before: string
          ok: boolean
          reason: string
          reservation_id: string
        }[]
      }
      reserve_usage: {
        Args: {
          p_bucket: string
          p_rpd: number
          p_rpm: number
          p_tokens: number
          p_tpd: number
          p_tpm: number
        }
        Returns: {
          not_before: string
          ok: boolean
          reason: string
          reservation_id: string
        }[]
      }
      save_valuation_scenario: {
        Args: {
          p_name: string
          p_note: string
          p_values: Json
          p_version_id: string
        }
        Returns: string
      }
      score_ideas: { Args: Record<PropertyKey, never>; Returns: number }
      seal_ledger_days: { Args: Record<PropertyKey, never>; Returns: number }
      start_valuation_version: {
        Args: { p_document_id: string }
        Returns: string
      }
      storage_usage: {
        Args: Record<PropertyKey, never>
        Returns: {
          database_bytes: number
          storage_bytes: number
        }[]
      }
      store_fetched_closes: {
        Args: { p_index_close: number; p_rows: Json; p_trade_date: string }
        Returns: number
      }
      store_uploaded_closes: {
        Args: {
          p_admin: string
          p_index_bytes: number
          p_index_close: number
          p_index_sha256: string
          p_rows: Json
          p_trade_date: string
          p_zip_bytes: number
          p_zip_sha256: string
        }
        Returns: Record<string, unknown>
      }
      tracked_symbols: { Args: Record<PropertyKey, never>; Returns: string[] }
      unpublish_item: {
        Args: { p_actor: string; p_item_id: string }
        Returns: string
      }
      verify_ledger_anchors: {
        Args: Record<PropertyKey, never>
        Returns: {
          days: number
          first_bad_date: string
          ok: boolean
          reason: string
        }[]
      }
      verify_ledger_chain: {
        Args: Record<PropertyKey, never>
        Returns: {
          bad_idea: string
          events: number
          first_bad_seq: number
          ok: boolean
        }[]
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
