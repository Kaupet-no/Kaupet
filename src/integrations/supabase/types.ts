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
      categories: {
        Row: {
          created_at: string
          id: string
          name_nb: string
          parent_id: string | null
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name_nb: string
          parent_id?: string | null
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name_nb?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
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
      conversations: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          last_message_at: string
          listing_id: string
          seller_id: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          id?: string
          last_message_at?: string
          listing_id: string
          seller_id: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          last_message_at?: string
          listing_id?: string
          seller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_listing_id_fkey"
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
      listing_images: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          sort_order: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          sort_order?: number
          storage_path: string
        }
        Update: {
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
      listing_views: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          user_id: string | null
          visitor_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          user_id?: string | null
          visitor_key: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          user_id?: string | null
          visitor_key?: string
        }
        Relationships: []
      }
      listings: {
        Row: {
          category_id: string | null
          city: string | null
          condition: Database["public"]["Enums"]["listing_condition"]
          created_at: string
          description: string
          expires_at: string | null
          id: string
          is_free: boolean
          lat: number | null
          lng: number | null
          postal_code: string | null
          price_nok: number | null
          published_at: string | null
          search_vector: unknown
          seller_id: string
          status: Database["public"]["Enums"]["listing_status"]
          title: string
          updated_at: string
          view_count: number
        }
        Insert: {
          category_id?: string | null
          city?: string | null
          condition?: Database["public"]["Enums"]["listing_condition"]
          created_at?: string
          description?: string
          expires_at?: string | null
          id?: string
          is_free?: boolean
          lat?: number | null
          lng?: number | null
          postal_code?: string | null
          price_nok?: number | null
          published_at?: string | null
          search_vector?: unknown
          seller_id: string
          status?: Database["public"]["Enums"]["listing_status"]
          title: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          category_id?: string | null
          city?: string | null
          condition?: Database["public"]["Enums"]["listing_condition"]
          created_at?: string
          description?: string
          expires_at?: string | null
          id?: string
          is_free?: boolean
          lat?: number | null
          lng?: number | null
          postal_code?: string | null
          price_nok?: number | null
          published_at?: string | null
          search_vector?: unknown
          seller_id?: string
          status?: Database["public"]["Enums"]["listing_status"]
          title?: string
          updated_at?: string
          view_count?: number
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
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
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
          updated_at: string
          user_id: string
          web_push_messages: boolean
          web_push_saved_searches: boolean
        }
        Insert: {
          created_at?: string
          updated_at?: string
          user_id: string
          web_push_messages?: boolean
          web_push_saved_searches?: boolean
        }
        Update: {
          created_at?: string
          updated_at?: string
          user_id?: string
          web_push_messages?: boolean
          web_push_saved_searches?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          deleted_at: string | null
          display_name: string
          id: string
          location: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name: string
          id: string
          location?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          id?: string
          location?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          reason: string
          reporter_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          reason: string
          reporter_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          reason?: string
          reporter_id?: string
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
          last_checked_at: string
          name: string
          notify: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          criteria?: Json
          id?: string
          last_checked_at?: string
          name: string
          notify?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          criteria?: Json
          id?: string
          last_checked_at?: string
          name?: string
          notify?: boolean
          updated_at?: string
          user_id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_ban_ip: {
        Args: { _expires_at?: string; _ip: unknown; _reason: string }
        Returns: string
      }
      admin_ban_user: {
        Args: { _reason: string; _user_id: string }
        Returns: undefined
      }
      admin_disable_listing: {
        Args: { _id: string; _reason: string }
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
          user_id: string
        }[]
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
      admin_revoke_role: { Args: { _user_id: string }; Returns: undefined }
      admin_search_listings: {
        Args: { _limit?: number; _query?: string; _status?: string }
        Returns: {
          created_at: string
          id: string
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
      admin_views_timeseries: {
        Args: { _days?: number }
        Returns: {
          day: string
          views: number
        }[]
      }
      cancel_account_deletion: { Args: never; Returns: boolean }
      expire_old_listings: { Args: never; Returns: number }
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
          unique_visitors: number
        }[]
      }
      listings_within_radius: {
        Args: { center_lat: number; center_lng: number; radius_km: number }
        Returns: {
          distance_km: number
          id: string
        }[]
      }
      match_listing_to_saved_searches: {
        Args: { _listing_id: string }
        Returns: undefined
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
      purge_expired_accounts: { Args: never; Returns: number }
      request_account_deletion: { Args: { _email: string }; Returns: undefined }
      user_review_summary: {
        Args: { _user_id: string }
        Returns: {
          avg_rating: number
          review_count: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
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
    },
  },
} as const
