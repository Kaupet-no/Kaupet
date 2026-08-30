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
      account_deletions: {
        Row: {
          confirmation_email: string
          requested_at: string
          scheduled_purge_at: string
          user_id: string
        }
        Insert: {
          confirmation_email: string
          requested_at?: string
          scheduled_purge_at?: string
          user_id: string
        }
        Update: {
          confirmation_email?: string
          requested_at?: string
          scheduled_purge_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_moderation_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          id: string
          reason: string | null
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          id?: string
          reason?: string | null
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          id?: string
          reason?: string | null
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          created_at: string
          id: string
          message: string
          page_url: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          page_url?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          page_url?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          heading_font: string | null
          icon: string | null
          id: string
          is_hidden: boolean
          name_nb: string
          parent_id: string | null
          search_examples: string[]
          slug: string
          sort_order: number
          title_example: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          heading_font?: string | null
          icon?: string | null
          id?: string
          is_hidden?: boolean
          name_nb: string
          parent_id?: string | null
          search_examples?: string[]
          slug: string
          sort_order?: number
          title_example?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          heading_font?: string | null
          icon?: string | null
          id?: string
          is_hidden?: boolean
          name_nb?: string
          parent_id?: string | null
          search_examples?: string[]
          slug?: string
          sort_order?: number
          title_example?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_filters: {
        Row: {
          category_id: string
          created_at: string
          depends_on_key: string | null
          depends_on_not_value: string | null
          depends_on_value: string | null
          is_optional: boolean
          id: string
          is_primary: boolean
          key: string
          label_nb: string
          options: Json | null
          sort_order: number
          type: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          depends_on_key?: string | null
          depends_on_not_value?: string | null
          depends_on_value?: string | null
          is_optional?: boolean
          id?: string
          is_primary?: boolean
          key: string
          label_nb: string
          options?: Json | null
          sort_order?: number
          type: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          depends_on_key?: string | null
          depends_on_not_value?: string | null
          depends_on_value?: string | null
          is_optional?: boolean
          id?: string
          is_primary?: boolean
          key?: string
          label_nb?: string
          options?: Json | null
          sort_order?: number
          type?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_filters_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_flows: {
        Row: {
          category_id: string
          created_at: string
          field_groups: string[]
          id: string
          modules: string[]
          sort_order: number
          steps: string[]
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          field_groups?: string[]
          id?: string
          modules?: string[]
          sort_order?: number
          steps?: string[]
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          field_groups?: string[]
          id?: string
          modules?: string[]
          sort_order?: number
          steps?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_flows_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: true
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_sync_status: {
        Row: {
          id: boolean
          last_synced_at: string | null
          last_synced_by: string | null
        }
        Insert: {
          id?: boolean
          last_synced_at?: string | null
          last_synced_by?: string | null
        }
        Update: {
          id?: boolean
          last_synced_at?: string | null
          last_synced_by?: string | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          buyer_id: string
          buyer_last_read_at: string | null
          created_at: string
          id: string
          last_message_at: string
          listing_id: string | null
          seller_id: string
          seller_last_read_at: string | null
          wtb_listing_id: string | null
        }
        Insert: {
          buyer_id: string
          buyer_last_read_at?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          listing_id?: string | null
          seller_id: string
          seller_last_read_at?: string | null
          wtb_listing_id?: string | null
        }
        Update: {
          buyer_id?: string
          buyer_last_read_at?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          listing_id?: string | null
          seller_id?: string
          seller_last_read_at?: string | null
          wtb_listing_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_wtb_listing_id_fkey"
            columns: ["wtb_listing_id"]
            isOneToOne: false
            referencedRelation: "wtb_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      error_log: {
        Row: {
          context: Json | null
          created_at: string
          error_code: string | null
          error_message: string
          function_name: string
          id: string
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          error_code?: string | null
          error_message: string
          function_name: string
          id?: string
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          error_code?: string | null
          error_message?: string
          function_name?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      favorite_price_drops: {
        Row: {
          created_at: string
          drop_pct: number
          id: string
          listing_id: string
          new_price_nok: number
          old_price_nok: number
          read_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          drop_pct: number
          id?: string
          listing_id: string
          new_price_nok: number
          old_price_nok: number
          read_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          drop_pct?: number
          id?: string
          listing_id?: string
          new_price_nok?: number
          old_price_nok?: number
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorite_price_drops_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      favorite_sold_notifications: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorite_sold_notifications_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      filter_synonyms: {
        Row: {
          category_filter_id: string
          created_at: string
          id: string
          is_ambiguous: boolean
          is_generated: boolean
          option_value: string | null
          phrase: string
          updated_at: string
        }
        Insert: {
          category_filter_id: string
          created_at?: string
          id?: string
          is_ambiguous?: boolean
          is_generated?: boolean
          option_value?: string | null
          phrase: string
          updated_at?: string
        }
        Update: {
          category_filter_id?: string
          created_at?: string
          id?: string
          is_ambiguous?: boolean
          is_generated?: boolean
          option_value?: string | null
          phrase?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "filter_synonyms_category_filter_id_fkey"
            columns: ["category_filter_id"]
            isOneToOne: false
            referencedRelation: "category_filters"
            referencedColumns: ["id"]
          },
        ]
      }
      ip_bans: {
        Row: {
          banned_by: string
          created_at: string
          expires_at: string | null
          id: string
          ip_address: unknown
          reason: string
        }
        Insert: {
          banned_by: string
          created_at?: string
          expires_at?: string | null
          id?: string
          ip_address: unknown
          reason: string
        }
        Update: {
          banned_by?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          ip_address?: unknown
          reason?: string
        }
        Relationships: []
      }
      listing_360_capture_sessions: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          listing_id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          listing_id: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          listing_id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_360_capture_sessions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_360_frames: {
        Row: {
          created_at: string
          frame_order: number
          id: string
          listing_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          frame_order: number
          id?: string
          listing_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          frame_order?: number
          id?: string
          listing_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_360_frames_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_category_word_stats: {
        Row: {
          category_id: string
          lexeme: string
          listing_count: number
          updated_at: string
        }
        Insert: {
          category_id: string
          lexeme: string
          listing_count?: number
          updated_at?: string
        }
        Update: {
          category_id?: string
          lexeme?: string
          listing_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_category_word_stats_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_images: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          listing_id: string
          sort_order: number
          storage_path: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          listing_id: string
          sort_order?: number
          storage_path: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          listing_id?: string
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_images_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_keyword_stats: {
        Row: {
          category_id: string
          listing_count: number
          word: string
        }
        Insert: {
          category_id: string
          listing_count?: number
          word: string
        }
        Update: {
          category_id?: string
          listing_count?: number
          word?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_keyword_stats_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_promotions: {
        Row: {
          created_at: string
          duration_days: number
          expires_at: string | null
          gift_reason: string | null
          granted_by: string | null
          id: string
          is_gift: boolean
          listing_id: string
          price_nok: number
          refunded_at: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["promotion_status"]
          updated_at: string
          user_id: string
          vipps_psp_reference: string | null
          vipps_reference: string | null
        }
        Insert: {
          created_at?: string
          duration_days: number
          expires_at?: string | null
          gift_reason?: string | null
          granted_by?: string | null
          id?: string
          is_gift?: boolean
          listing_id: string
          price_nok: number
          refunded_at?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["promotion_status"]
          updated_at?: string
          user_id: string
          vipps_psp_reference?: string | null
          vipps_reference?: string | null
        }
        Update: {
          created_at?: string
          duration_days?: number
          expires_at?: string | null
          gift_reason?: string | null
          granted_by?: string | null
          id?: string
          is_gift?: boolean
          listing_id?: string
          price_nok?: number
          refunded_at?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["promotion_status"]
          updated_at?: string
          user_id?: string
          vipps_psp_reference?: string | null
          vipps_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_promotions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_sales: {
        Row: {
          buyer_id: string
          confirmed_at: string
          conversation_id: string
          listing_id: string
          seller_id: string
        }
        Insert: {
          buyer_id: string
          confirmed_at?: string
          conversation_id: string
          listing_id: string
          seller_id: string
        }
        Update: {
          buyer_id?: string
          confirmed_at?: string
          conversation_id?: string
          listing_id?: string
          seller_id?: string
        }
        Relationships: []
      }
      listing_view_events: {
        Row: {
          created_at: string
          id: string
          listing_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_view_events_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_view_rate_limits: {
        Row: {
          key_hash: string
          listing_id: string
          window_started_at: string
        }
        Insert: {
          key_hash: string
          listing_id: string
          window_started_at?: string
        }
        Update: {
          key_hash?: string
          listing_id?: string
          window_started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_view_rate_limits_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_view_totals: {
        Row: {
          listing_id: string
          total_views: number
        }
        Insert: {
          listing_id: string
          total_views?: number
        }
        Update: {
          listing_id?: string
          total_views?: number
        }
        Relationships: [
          {
            foreignKeyName: "listing_view_totals_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          attributes: Json
          can_ship: boolean | null
          category_id: string | null
          city: string | null
          condition: Database["public"]["Enums"]["listing_condition"] | null
          counted_category_id: string | null
          counted_keyword_category_id: string | null
          counted_keywords: string[] | null
          counted_lexemes: string[] | null
          created_at: string
          description: string
          display_lat: number | null
          display_lng: number | null
          draft_expiry_notified_at: string | null
          expires_at: string | null
          id: string
          is_free: boolean
          kaupet_code: string
          known_issues: string | null
          lat: number | null
          lng: number | null
          maintenance_history: string | null
          no_known_issues: boolean
          postal_code: string | null
          price_nok: number | null
          published_at: string | null
          search_vector: unknown
          seller_id: string
          status: Database["public"]["Enums"]["listing_status"]
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          attributes?: Json
          can_ship?: boolean | null
          category_id?: string | null
          city?: string | null
          condition?: Database["public"]["Enums"]["listing_condition"] | null
          counted_category_id?: string | null
          counted_keyword_category_id?: string | null
          counted_keywords?: string[] | null
          counted_lexemes?: string[] | null
          created_at?: string
          description?: string
          display_lat?: number | null
          display_lng?: number | null
          draft_expiry_notified_at?: string | null
          expires_at?: string | null
          id?: string
          is_free?: boolean
          kaupet_code?: string
          known_issues?: string | null
          lat?: number | null
          lng?: number | null
          maintenance_history?: string | null
          no_known_issues?: boolean
          postal_code?: string | null
          price_nok?: number | null
          published_at?: string | null
          search_vector?: unknown
          seller_id: string
          status?: Database["public"]["Enums"]["listing_status"]
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          attributes?: Json
          can_ship?: boolean | null
          category_id?: string | null
          city?: string | null
          condition?: Database["public"]["Enums"]["listing_condition"] | null
          counted_category_id?: string | null
          counted_keyword_category_id?: string | null
          counted_keywords?: string[] | null
          counted_lexemes?: string[] | null
          created_at?: string
          description?: string
          display_lat?: number | null
          display_lng?: number | null
          draft_expiry_notified_at?: string | null
          expires_at?: string | null
          id?: string
          is_free?: boolean
          kaupet_code?: string
          known_issues?: string | null
          lat?: number | null
          lng?: number | null
          maintenance_history?: string | null
          no_known_issues?: boolean
          postal_code?: string | null
          price_nok?: number | null
          published_at?: string | null
          search_vector?: unknown
          seller_id?: string
          status?: Database["public"]["Enums"]["listing_status"]
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_path: string | null
          body: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          id: string
          sender_id: string
        }
        Insert: {
          attachment_path?: string | null
          body: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          sender_id: string
        }
        Update: {
          attachment_path?: string | null
          body?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          email_messages: boolean
          email_price_drops: boolean
          email_saved_searches: boolean
          email_sold: boolean
          email_wtb_matches: boolean
          updated_at: string
          user_id: string
          web_push_messages: boolean
          web_push_price_drops: boolean
          web_push_saved_searches: boolean
          web_push_sold: boolean
          web_push_wtb_matches: boolean
        }
        Insert: {
          created_at?: string
          email_messages?: boolean
          email_price_drops?: boolean
          email_saved_searches?: boolean
          email_sold?: boolean
          email_wtb_matches?: boolean
          updated_at?: string
          user_id: string
          web_push_messages?: boolean
          web_push_price_drops?: boolean
          web_push_saved_searches?: boolean
          web_push_sold?: boolean
          web_push_wtb_matches?: boolean
        }
        Update: {
          created_at?: string
          email_messages?: boolean
          email_price_drops?: boolean
          email_saved_searches?: boolean
          email_sold?: boolean
          email_wtb_matches?: boolean
          updated_at?: string
          user_id?: string
          web_push_messages?: boolean
          web_push_price_drops?: boolean
          web_push_saved_searches?: boolean
          web_push_sold?: boolean
          web_push_wtb_matches?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      promotion_pricing: {
        Row: {
          active: boolean
          created_at: string
          duration_days: number
          id: string
          price_nok: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          duration_days: number
          id?: string
          price_nok: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          duration_days?: number
          id?: string
          price_nok?: number
          updated_at?: string
        }
        Relationships: []
      }
      push_dispatch_failures: {
        Row: {
          created_at: string
          error: string | null
          id: string
          kind: string
          payload: Json
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          kind: string
          payload: Json
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          payload?: Json
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string | null
          created_at: string
          endpoint: string | null
          fcm_token: string | null
          id: string
          last_used_at: string
          p256dh: string | null
          platform: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth?: string | null
          created_at?: string
          endpoint?: string | null
          fcm_token?: string | null
          id?: string
          last_used_at?: string
          p256dh?: string | null
          platform?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string | null
          created_at?: string
          endpoint?: string | null
          fcm_token?: string | null
          id?: string
          last_used_at?: string
          p256dh?: string | null
          platform?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          listing_id: string | null
          reason: string
          reported_user_id: string | null
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          listing_id?: string | null
          reason: string
          reported_user_id?: string | null
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          listing_id?: string | null
          reason?: string
          reported_user_id?: string | null
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_search_notifications: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          read_at: string | null
          saved_search_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          read_at?: string | null
          saved_search_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          read_at?: string | null
          saved_search_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_search_notifications_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_search_notifications_saved_search_id_fkey"
            columns: ["saved_search_id"]
            isOneToOne: false
            referencedRelation: "saved_searches"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_searches: {
        Row: {
          created_at: string
          criteria: Json
          id: string
          name: string
          notify: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          criteria?: Json
          id?: string
          name: string
          notify?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          criteria?: Json
          id?: string
          name?: string
          notify?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          default_search_examples: string[]
          id: boolean
          updated_at: string
        }
        Insert: {
          default_search_examples?: string[]
          id?: boolean
          updated_at?: string
        }
        Update: {
          default_search_examples?: string[]
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      system_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          read_at: string | null
          recipient_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id?: string
        }
        Relationships: []
      }
      user_bans: {
        Row: {
          banned_by: string
          created_at: string
          reason: string
          user_id: string
        }
        Insert: {
          banned_by: string
          created_at?: string
          reason: string
          user_id: string
        }
        Update: {
          banned_by?: string
          created_at?: string
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          conversation_id: string | null
          created_at: string
          id: string
          listing_id: string | null
          reason: string | null
          scope: Database["public"]["Enums"]["block_scope"]
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          listing_id?: string | null
          reason?: string | null
          scope: Database["public"]["Enums"]["block_scope"]
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          listing_id?: string | null
          reason?: string | null
          scope?: Database["public"]["Enums"]["block_scope"]
        }
        Relationships: []
      }
      user_reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          listing_id: string
          rating: number
          reviewee_id: string
          reviewer_id: string
          role: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          listing_id: string
          rating: number
          reviewee_id: string
          reviewer_id: string
          role: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          listing_id?: string
          rating?: number
          reviewee_id?: string
          reviewer_id?: string
          role?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_suspensions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          reason: string
          suspended_by: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          reason: string
          suspended_by: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          reason?: string
          suspended_by?: string
          user_id?: string
        }
        Relationships: []
      }
      vehicle_brands: {
        Row: {
          category_group: string
          created_at: string
          id: string
          name: string
          status: string
          submitted_by: string | null
        }
        Insert: {
          category_group: string
          created_at?: string
          id?: string
          name: string
          status?: string
          submitted_by?: string | null
        }
        Update: {
          category_group?: string
          created_at?: string
          id?: string
          name?: string
          status?: string
          submitted_by?: string | null
        }
        Relationships: []
      }
      vehicle_lookup_log: {
        Row: {
          classification_result: Json | null
          created_at: string
          id: string
          registration_number: string
          user_id: string
        }
        Insert: {
          classification_result?: Json | null
          created_at?: string
          id?: string
          registration_number: string
          user_id: string
        }
        Update: {
          classification_result?: Json | null
          created_at?: string
          id?: string
          registration_number?: string
          user_id?: string
        }
        Relationships: []
      }
      vehicle_model_classes: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          name: string
          status: string
          submitted_by: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          name: string
          status?: string
          submitted_by?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          name?: string
          status?: string
          submitted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_model_classes_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "vehicle_brands"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_models: {
        Row: {
          brand_id: string
          class_id: string | null
          created_at: string
          id: string
          name: string
          status: string
          submitted_by: string | null
        }
        Insert: {
          brand_id: string
          class_id?: string | null
          created_at?: string
          id?: string
          name: string
          status?: string
          submitted_by?: string | null
        }
        Update: {
          brand_id?: string
          class_id?: string | null
          created_at?: string
          id?: string
          name?: string
          status?: string
          submitted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_models_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "vehicle_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_models_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "vehicle_model_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      vipps_webhook_events: {
        Row: {
          event_id: string
          event_name: string | null
          id: string
          payload: Json
          processed_at: string | null
          received_at: string
          reference: string | null
        }
        Insert: {
          event_id: string
          event_name?: string | null
          id?: string
          payload: Json
          processed_at?: string | null
          received_at?: string
          reference?: string | null
        }
        Update: {
          event_id?: string
          event_name?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          received_at?: string
          reference?: string | null
        }
        Relationships: []
      }
      vipps_webhook_secrets: {
        Row: {
          created_at: string
          id: string
          mode: string
          secret: string
          updated_at: string
          url: string
          webhook_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mode: string
          secret: string
          updated_at?: string
          url: string
          webhook_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mode?: string
          secret?: string
          updated_at?: string
          url?: string
          webhook_id?: string
        }
        Relationships: []
      }
      wtb_match_notifications: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          read_at: string | null
          user_id: string
          wtb_listing_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          read_at?: string | null
          user_id: string
          wtb_listing_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          read_at?: string | null
          user_id?: string
          wtb_listing_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wtb_match_notifications_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wtb_match_notifications_wtb_listing_id_fkey"
            columns: ["wtb_listing_id"]
            isOneToOne: false
            referencedRelation: "wtb_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      wtb_listings: {
        Row: {
          attributes: Json
          category_id: string | null
          created_at: string
          description: string | null
          draft_expiry_notified_at: string | null
          expires_at: string
          id: string
          max_price_nok: number | null
          notify_matches: boolean
          search_vector: unknown
          status: string
          subtitle: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attributes?: Json
          category_id?: string | null
          created_at?: string
          description?: string | null
          draft_expiry_notified_at?: string | null
          expires_at?: string
          id?: string
          max_price_nok?: number | null
          notify_matches?: boolean
          search_vector?: unknown
          status?: string
          subtitle?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attributes?: Json
          category_id?: string | null
          created_at?: string
          description?: string | null
          draft_expiry_notified_at?: string | null
          expires_at?: string
          id?: string
          max_price_nok?: number | null
          notify_matches?: boolean
          search_vector?: unknown
          status?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wtb_listings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wtb_listings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consume_vehicle_360_upload_slot: {
        Args: { _ip_hash: string; _token: string }
        Returns: string | null
      }
      log_product_event_rate_limited: {
        Args: {
          _event_name: string
          _key_hash: string
          _path: string
          _platform: string
          _properties?: Json
        }
        Returns: undefined
      }
      listing_matches_attribute_filters: {
        Args: { _attributes: Json; _filters: Json }
        Returns: boolean
      }
      search_listings_page: {
        Args: {
          _attribute_filters?: Json
          _category_ids?: string[] | null
          _center_lat?: number | null
          _center_lng?: number | null
          _conditions?: Database["public"]["Enums"]["listing_condition"][] | null
          _exclude_all_groups?: Json
          _exclude_any_terms?: string[] | null
          _include_free?: boolean
          _include_groups?: Json
          _limit?: number
          _max_price?: number | null
          _min_price?: number | null
          _offset?: number
          _radius_km?: number
          _sort?: string
        }
        Returns: {
          attributes: Json
          category_slug: string | null
          city: string | null
          cover_path: string | null
          created_at: string
          display_lat: number | null
          display_lng: number | null
          id: string
          is_free: boolean
          kaupet_code: string
          price_nok: number | null
          relevance: number
          subtitle: string | null
          title: string
          total_count: number
        }[]
      }
      admin_approve_vehicle_brand: { Args: { _id: string }; Returns: undefined }
      admin_approve_vehicle_model: { Args: { _id: string }; Returns: undefined }
      admin_approve_vehicle_model_class: {
        Args: { _id: string }
        Returns: undefined
      }
      admin_ban_ip: {
        Args: { _expires_at?: string; _ip: unknown; _reason: string }
        Returns: string
      }
      admin_ban_user: {
        Args: { _reason: string; _user_id: string }
        Returns: undefined
      }
      admin_create_vehicle_brand: {
        Args: { _category_group: string; _name: string }
        Returns: {
          category_group: string
          created_at: string
          id: string
          name: string
          status: string
          submitted_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "vehicle_brands"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_create_vehicle_model:
        | {
            Args: { _brand_id: string; _name: string }
            Returns: {
              brand_id: string
              class_id: string | null
              created_at: string
              id: string
              name: string
              status: string
              submitted_by: string | null
            }
            SetofOptions: {
              from: "*"
              to: "vehicle_models"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { _brand_id: string; _class_id?: string; _name: string }
            Returns: {
              brand_id: string
              class_id: string | null
              created_at: string
              id: string
              name: string
              status: string
              submitted_by: string | null
            }
            SetofOptions: {
              from: "*"
              to: "vehicle_models"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      admin_create_vehicle_model_class: {
        Args: { _brand_id: string; _name: string }
        Returns: {
          brand_id: string
          created_at: string
          id: string
          name: string
          status: string
          submitted_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "vehicle_model_classes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_delete_listing: {
        Args: { _id: string; _message: string }
        Returns: undefined
      }
      admin_delete_vehicle_brand: { Args: { _id: string }; Returns: undefined }
      admin_delete_vehicle_model: { Args: { _id: string }; Returns: undefined }
      admin_delete_vehicle_model_class: {
        Args: { _id: string }
        Returns: undefined
      }
      admin_disable_listing: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      admin_disable_listing_with_message: {
        Args: { _id: string; _message: string; _reason: string }
        Returns: undefined
      }
      admin_enable_listing: { Args: { _id: string }; Returns: undefined }
      admin_export_user_data: { Args: { _user_id: string }; Returns: Json }
      admin_find_users_by_email: {
        Args: { _query: string }
        Returns: {
          created_at: string
          display_name: string
          email: string
          is_admin: boolean
          is_demo: boolean
          is_moderator: boolean
          user_id: string
        }[]
      }
      admin_grant_demo_role: { Args: { _user_id: string }; Returns: undefined }
      admin_grant_moderator_role: {
        Args: { _user_id: string }
        Returns: undefined
      }
      admin_grant_role: { Args: { _user_id: string }; Returns: undefined }
      admin_list_bans: {
        Args: never
        Returns: {
          banned_by: string
          created_at: string
          display_name: string
          reason: string
          user_id: string
        }[]
      }
      admin_list_error_log: {
        Args: { _limit?: number }
        Returns: {
          context: Json
          created_at: string
          error_code: string
          error_message: string
          function_name: string
          id: string
          user_id: string
        }[]
      }
      admin_list_ip_bans: {
        Args: never
        Returns: {
          banned_by: string
          created_at: string
          expires_at: string
          id: string
          ip_address: unknown
          reason: string
        }[]
      }
      admin_list_moderation_log: {
        Args: { _limit?: number }
        Returns: {
          action: string
          admin_id: string
          admin_name: string
          created_at: string
          id: string
          reason: string
          target_id: string
          target_type: string
        }[]
      }
      admin_list_pending_vehicle_entries: {
        Args: never
        Returns: {
          brand_name: string
          category_group: string
          created_at: string
          id: string
          kind: string
          name: string
          submitted_by: string
          submitted_by_name: string
        }[]
      }
      admin_list_reports: {
        Args: { _limit?: number }
        Returns: {
          comment: string
          created_at: string
          id: string
          kaupet_code: string
          listing_id: string
          listing_title: string
          owner_id: string
          owner_name: string
          reason: string
          reported_user_id: string
          reported_user_name: string
          reporter_id: string
          reporter_name: string
          resolved_at: string
          status: string
        }[]
      }
      admin_list_suspensions: {
        Args: never
        Returns: {
          created_at: string
          display_name: string
          expires_at: string
          id: string
          reason: string
          suspended_by: string
          user_id: string
        }[]
      }
      attribute_value_suggestions: {
        Args: { cat_id: string; attr_key: string; q: string }
        Returns: {
          value: string
          cnt: number
        }[]
      }
      attribute_range_bounds: {
        Args: { cat_id: string }
        Returns: {
          key: string
          min_val: number
          max_val: number
        }[]
      }
      listing_filter_facet_counts: {
        Args: {
          p_category_ids?: string[]
          p_conditions?: string[]
          p_price_min?: number
          p_price_max?: number
          p_include_free?: boolean
          p_listing_ids?: string[]
          p_active_attrs?: Json
          p_facet_keys?: string[]
        }
        Returns: {
          attr_key: string
          attr_value: string
          cnt: number
        }[]
      }
      admin_list_vehicle_brands_with_models: {
        Args: never
        Returns: {
          brand_id: string
          brand_name: string
          category_group: string
          class_id: string
          class_name: string
          model_id: string
          model_name: string
        }[]
      }
      admin_overview_stats: {
        Args: never
        Returns: {
          active_listings: number
          conversations_total: number
          new_users_30d: number
          total_listings: number
          views_30d: number
          views_7d: number
        }[]
      }
      admin_popular_categories: {
        Args: never
        Returns: {
          id: string
          listing_count: number
          name_nb: string
          slug: string
          view_count: number
        }[]
      }
      admin_popular_listings: {
        Args: { _limit?: number }
        Returns: {
          created_at: string
          favorite_count: number
          id: string
          status: Database["public"]["Enums"]["listing_status"]
          title: string
          view_count: number
        }[]
      }
      admin_reject_vehicle_brand: { Args: { _id: string }; Returns: undefined }
      admin_reject_vehicle_model: { Args: { _id: string }; Returns: undefined }
      admin_reject_vehicle_model_class: {
        Args: { _id: string }
        Returns: undefined
      }
      admin_resolve_report: { Args: { _id: string }; Returns: undefined }
      admin_revoke_demo_role: { Args: { _user_id: string }; Returns: undefined }
      admin_revoke_moderator_role: {
        Args: { _user_id: string }
        Returns: undefined
      }
      admin_revoke_role: { Args: { _user_id: string }; Returns: undefined }
      admin_search_listings: {
        Args: { _limit?: number; _query?: string; _status?: string }
        Returns: {
          created_at: string
          id: string
          kaupet_code: string
          seller_id: string
          seller_name: string
          status: Database["public"]["Enums"]["listing_status"]
          title: string
        }[]
      }
      admin_suspend_user: {
        Args: { _days?: number; _reason: string; _user_id: string }
        Returns: undefined
      }
      admin_unban_ip: { Args: { _id: string }; Returns: undefined }
      admin_unban_user: { Args: { _user_id: string }; Returns: undefined }
      admin_unsuspend_user: { Args: { _user_id: string }; Returns: undefined }
      admin_update_vehicle_brand: {
        Args: { _id: string; _name: string }
        Returns: {
          category_group: string
          created_at: string
          id: string
          name: string
          status: string
          submitted_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "vehicle_brands"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_update_vehicle_model:
        | {
            Args: { _id: string; _name: string }
            Returns: {
              brand_id: string
              class_id: string | null
              created_at: string
              id: string
              name: string
              status: string
              submitted_by: string | null
            }
            SetofOptions: {
              from: "*"
              to: "vehicle_models"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { _class_id?: string; _id: string; _name: string }
            Returns: {
              brand_id: string
              class_id: string | null
              created_at: string
              id: string
              name: string
              status: string
              submitted_by: string | null
            }
            SetofOptions: {
              from: "*"
              to: "vehicle_models"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      admin_update_vehicle_model_class: {
        Args: { _id: string; _name: string }
        Returns: {
          brand_id: string
          created_at: string
          id: string
          name: string
          status: string
          submitted_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "vehicle_model_classes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_views_timeseries: {
        Args: { _days?: number }
        Returns: {
          day: string
          views: number
        }[]
      }
      cancel_account_deletion: { Args: never; Returns: boolean }
      demo_activate_promotion: {
        Args: { _duration_days: number; _listing_id: string }
        Returns: string
      }
      expire_listing_promotions: { Args: never; Returns: number }
      expire_old_listings: { Args: never; Returns: number }
      generate_kaupet_code: { Args: never; Returns: string }
      get_featured_listing_ids: {
        Args: { _category_slug?: string; _limit?: number }
        Returns: {
          listing_id: string
        }[]
      }
      get_listing_owner_location: {
        Args: { _listing_id: string }
        Returns: {
          lat: number
          lng: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_blocked_between: {
        Args: { _a: string; _b: string; _conversation_id: string }
        Returns: boolean
      }
      is_ip_banned: { Args: { _ip: unknown }; Returns: boolean }
      is_user_banned: { Args: { _uid: string }; Returns: boolean }
      is_user_deletion_pending: { Args: { _user_id: string }; Returns: boolean }
      is_user_suspended: { Args: { _uid: string }; Returns: boolean }
      listing_stats: {
        Args: { _listing_id: string }
        Returns: {
          favorite_count: number
          total_views: number
        }[]
      }
      listings_search_term_match: {
        Args: { search_vector: unknown; term: string; title: string }
        Returns: boolean
      }
      listings_within_radius: {
        Args: { center_lat: number; center_lng: number; radius_km: number }
        Returns: {
          distance_km: number
          id: string
        }[]
      }
      log_listing_view_rate_limited: {
        Args: { _key_hash: string; _listing_id: string }
        Returns: boolean
      }
      match_listing_to_saved_searches: {
        Args: { _listing_id: string }
        Returns: undefined
      }
      match_listing_to_wtb_listings: {
        Args: { _listing_id: string }
        Returns: undefined
      }
      compute_wtb_matches: {
        Args: {
          _category_id: string | null
          _price_nok: number | null
          _is_free: boolean
          _title: string | null
          _description: string | null
          _attributes: Json
        }
        Returns: {
          id: string
          user_id: string
          title: string
          subtitle: string | null
          description: string | null
          category_id: string | null
          max_price_nok: number | null
          status: string
          attributes: Json
          search_vector: unknown
          created_at: string
          updated_at: string
          expires_at: string
        }[]
      }
      wtb_match_count: {
        Args: {
          _category_id: string | null
          _price_nok: number | null
          _is_free: boolean
          _title: string | null
          _description: string | null
          _attributes: Json
        }
        Returns: {
          match_count: number
          max_price: number | null
        }[]
      }
      match_search_synonyms: {
        Args: { p_category_id: string | null; phrases: string[] }
        Returns: {
          category_id: string
          filter_key: string
          filter_label: string
          is_ambiguous: boolean
          option_label: string
          option_value: string
          phrase: string
        }[]
      }
      my_listing_counts: {
        Args: never
        Returns: {
          favorite_count: number
          listing_id: string
          view_count: number
        }[]
      }
      my_moderation_status: {
        Args: never
        Returns: {
          ban_reason: string
          is_banned: boolean
          is_suspended: boolean
          suspension_expires_at: string
          suspension_reason: string
        }[]
      }
      popular_listings_by_category: {
        Args: { _category_ids: string[]; _limit?: number; _offset?: number }
        Returns: {
          attributes: Json
          category_slug: string
          city: string
          cover_path: string
          created_at: string
          is_free: boolean
          kaupet_code: string
          listing_id: string
          mileage_km: number
          price_nok: number
          subtitle: string
          title: string
          total_views: number
          views_last_week: number
        }[]
      }
      popular_listings_last_week: {
        Args: { _limit?: number }
        Returns: {
          attributes: Json
          category_slug: string
          city: string
          cover_path: string
          created_at: string
          is_free: boolean
          kaupet_code: string
          listing_id: string
          mileage_km: number
          price_nok: number
          subtitle: string
          title: string
          total_views: number
          views_last_week: number
        }[]
      }
      purge_expired_accounts: { Args: never; Returns: number }
      purge_expired_personal_data: { Args: never; Returns: Json }
      request_account_deletion: { Args: { _email: string }; Returns: undefined }
      saved_search_unread_counts: {
        Args: never
        Returns: {
          saved_search_id: string
          unread_count: number
        }[]
      }
      search_listing_ids: {
        Args: {
          exclude_all_groups?: Json
          exclude_any_terms?: string[]
          include_groups?: Json
        }
        Returns: {
          id: string
          rank: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      submit_listing_report: {
        Args: { _comment?: string; _listing_id: string; _reason: string }
        Returns: undefined
      }
      submit_user_report: {
        Args: { _comment?: string; _reason: string; _reported_user_id: string }
        Returns: undefined
      }
      suggest_attribute_values: {
        Args: { p_category_id: string; p_key: string; p_limit?: number }
        Returns: {
          listing_count: number
          value: string
        }[]
      }
      suggest_category_for_title: {
        Args: { _title: string }
        Returns: {
          category_id: string
          name_nb: string
          parent_id: string
          parent_name_nb: string
          slug: string
          votes: number
        }[]
      }
      suggest_keywords_for_listing: {
        Args: { _category_id: string; _title: string }
        Returns: {
          listing_count: number
          word: string
        }[]
      }
      sync_categories_from_payload: {
        Args: {
          p_categories: Json
          p_category_filters: Json
          p_category_flows: Json
          p_default_search_examples: string[]
          p_filter_synonyms: Json
          p_synced_by: string
        }
        Returns: undefined
      }
      user_review_summary: {
        Args: { _user_id: string }
        Returns: {
          avg_rating: number
          review_count: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user" | "demo" | "moderator"
      block_scope: "all" | "conversation"
      listing_condition:
        | "new"
        | "like_new"
        | "good"
        | "acceptable"
        | "for_parts"
      listing_status:
        | "draft"
        | "active"
        | "sold"
        | "archived"
        | "expired"
        | "disabled"
      promotion_status:
        | "pending"
        | "active"
        | "expired"
        | "failed"
        | "refunded"
        | "gifted"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "user", "demo", "moderator"],
      block_scope: ["all", "conversation"],
      listing_condition: ["new", "like_new", "good", "acceptable", "for_parts"],
      listing_status: [
        "draft",
        "active",
        "sold",
        "archived",
        "expired",
        "disabled",
      ],
      promotion_status: [
        "pending",
        "active",
        "expired",
        "failed",
        "refunded",
        "gifted",
      ],
    },
  },
} as const
