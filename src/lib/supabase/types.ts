/**
 * Hand-written to match docs/supabase/schema.sql for now. Once the
 * Supabase project exists, replace this file with the generated version:
 *
 *   npx supabase gen types typescript --project-id <ref> > src/lib/supabase/types.ts
 *
 * Keeping it hand-written until then means `createClient<Database>()`
 * gives real autocomplete/type-checking on `.from("profiles")` etc. instead
 * of `any`, without requiring a live project during early development.
 */

export type Role = "user" | "admin" | "super_admin";
export type CreatorTag = "author" | "illustrator" | "narrator";

export type ContentSource = "independent" | "story_upload";

export type TransactionType =
  | "signup_bonus"
  | "daily_task_reward"
  | "purchase_chapter"
  | "topup"
  | "refund"
  | "admin_adjustment"
  | "screenshot_penalty";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string; // uuid, references auth.users.id
          username: string;
          nickname: string;
          avatar_url: string | null;
          role: Role;
          // Nhãn mô tả, không phải quyền hạn — ai cũng tự gắn được, xem
          // comment trong schema.sql phần 1.
          creator_tags: CreatorTag[];
          real_name: string | null;
          phone: string | null;
          cccd_last4: string | null; // last 4 digits only — see schema.sql note
          cccd_verified: boolean;
          token_balance: number;
          screenshot_penalty_count: number;
          screenshot_penalty_expires_at: string | null;
          screenshot_penalty_banned: boolean;
          screenshot_penalty_last_offense_at: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          username: string;
          nickname: string;
          avatar_url?: string | null;
          role?: Role;
          creator_tags?: CreatorTag[];
          real_name?: string | null;
          phone?: string | null;
          cccd_last4?: string | null;
          cccd_verified?: boolean;
          token_balance?: number;
          screenshot_penalty_count?: number;
          screenshot_penalty_expires_at?: string | null;
          screenshot_penalty_banned?: boolean;
          screenshot_penalty_last_offense_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      identity_verifications: {
        Row: {
          id: string;
          user_id: string;
          cccd_number: string;
          cccd_front_path: string;
          cccd_back_path: string;
          status: "pending" | "approved" | "rejected";
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          cccd_number: string;
          cccd_front_path: string;
          cccd_back_path: string;
        };
        // status/reviewed_by/reviewed_at chỉ đổi được qua luồng admin duyệt
        // (xây riêng sau) — chưa có RPC cho việc này ở bản schema hiện tại,
        // nên tạm không cho update qua client.
        Update: never;
        Relationships: [];
      };
      books: {
        Row: {
          id: string;
          author_id: string;
          title: string;
          slug: string;
          synopsis: string | null;
          // null = tác giả chưa dán link thiết kế nào — chưa hiện bìa.
          cover_design_item_id: string | null;
          published: boolean;
          // pgvector column — the JS client returns/accepts this as a
          // plain number[] (or null), Postgres handles the vector type.
          embedding: number[] | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          title: string;
          slug: string;
          synopsis?: string | null;
          cover_design_item_id?: string | null;
          published?: boolean;
          embedding?: number[] | null;
        };
        Update: Partial<Database["public"]["Tables"]["books"]["Insert"]>;
        Relationships: [];
      };
      chapters: {
        Row: {
          id: string;
          book_id: string;
          title: string;
          content: string;
          order_index: number;
          published: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          book_id: string;
          title: string;
          content: string;
          order_index: number;
          published?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["chapters"]["Insert"]>;
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          type: TransactionType;
          amount: number;
          penalty_percent: number;
          balance_after: number;
          reference_type: string | null;
          reference_id: string | null;
          created_at: string;
        };
        // No Insert type on purpose — rows are only ever created via the
        // apply_transaction() RPC (security definer), never a direct
        // table insert. See schema.sql section 6. `never` (not omitting
        // the field) because @supabase/postgrest-js's GenericTable type
        // requires Insert to be present — omitting it entirely breaks
        // type inference for EVERY table in the schema, not just this one.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      task_templates: {
        Row: {
          id: string;
          code: string;
          title: string;
          description: string | null;
          target_count: number;
          reward_tokens: number;
          active: boolean;
        };
        Insert: {
          id?: string;
          code: string;
          title: string;
          description?: string | null;
          target_count?: number;
          reward_tokens?: number;
          active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["task_templates"]["Insert"]>;
        Relationships: [];
      };
      user_daily_tasks: {
        Row: {
          id: string;
          user_id: string;
          template_id: string;
          task_date: string;
          progress: number;
          completed: boolean;
          claimed: boolean;
          created_at: string;
        };
        // Rows are created/updated via increment_task_progress() and
        // claim_daily_task() RPCs, not direct insert/update — see
        // schema.sql section 7. `never` (not omitted) — see the comment
        // on `transactions.Insert` above for why omitting breaks everything.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      reading_history: {
        Row: {
          id: string;
          user_id: string;
          book_id: string;
          chapter_id: string | null;
          read_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          book_id: string;
          chapter_id?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      design_items: {
        Row: {
          id: string;
          illustrator_id: string;
          title: string;
          image_url: string;
          source: ContentSource;
          // Chỉ chủ sở hữu select được cột này (RLS chặn người khác) —
          // không bao giờ hiện ở view public_design_items.
          share_token: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          illustrator_id: string;
          title: string;
          image_url: string;
          source?: ContentSource;
        };
        Update: Partial<Database["public"]["Tables"]["design_items"]["Insert"]>;
        Relationships: [];
      };
      audio_narrations: {
        Row: {
          id: string;
          narrator_id: string;
          title: string;
          audio_url: string;
          duration_seconds: number | null;
          source: ContentSource;
          share_token: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          narrator_id: string;
          title: string;
          audio_url: string;
          duration_seconds?: number | null;
          source?: ContentSource;
        };
        Update: Partial<Database["public"]["Tables"]["audio_narrations"]["Insert"]>;
        Relationships: [];
      };
      chapter_audio_links: {
        Row: {
          id: string;
          chapter_id: string;
          audio_narration_id: string;
          linked_by: string;
          linked_at: string;
        };
        Insert: {
          id?: string;
          chapter_id: string;
          audio_narration_id: string;
          linked_by: string;
        };
        // Không update — chỉ insert (gắn link) hoặc delete (gỡ link).
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      author_public_profiles: {
        Row: {
          id: string;
          username: string;
          nickname: string;
          avatar_url: string | null;
          creator_tags: CreatorTag[];
        };
        Relationships: [];
      };
      public_design_items: {
        Row: {
          id: string;
          illustrator_id: string;
          title: string;
          image_url: string;
          source: ContentSource;
          created_at: string;
        };
        Relationships: [];
      };
      public_audio_narrations: {
        Row: {
          id: string;
          narrator_id: string;
          title: string;
          audio_url: string;
          duration_seconds: number | null;
          source: ContentSource;
          created_at: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      apply_transaction: {
        Args: {
          p_user_id: string;
          p_type: TransactionType;
          p_amount: number;
          p_reference_type?: string | null;
          p_reference_id?: string | null;
          p_penalty_percent?: number | null;
        };
        Returns: Database["public"]["Tables"]["transactions"]["Row"];
      };
      increment_task_progress: {
        Args: { p_user_id: string; p_task_code: string; p_amount?: number };
        Returns: Database["public"]["Tables"]["user_daily_tasks"]["Row"];
      };
      claim_daily_task: {
        Args: { p_user_id: string; p_task_id: string };
        Returns: Database["public"]["Tables"]["transactions"]["Row"];
      };
      recommend_books: {
        Args: { p_user_id: string; p_limit?: number };
        Returns: Database["public"]["Tables"]["books"]["Row"][];
      };
      link_audio_to_chapter: {
        Args: { p_chapter_id: string; p_audio_narration_id: string; p_share_token: string };
        Returns: Database["public"]["Tables"]["chapter_audio_links"]["Row"];
      };
      link_cover_to_book: {
        Args: { p_book_id: string; p_design_item_id: string; p_share_token: string };
        Returns: Database["public"]["Tables"]["books"]["Row"];
      };
      regenerate_audio_share_token: {
        Args: { p_audio_narration_id: string };
        Returns: string;
      };
      regenerate_design_share_token: {
        Args: { p_design_item_id: string };
        Returns: string;
      };
    };
  };
};