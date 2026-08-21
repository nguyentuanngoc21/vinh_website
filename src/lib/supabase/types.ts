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

// Dùng bởi hệ thống sinh bìa tự động (src/lib/covers/genre-styles.ts) khi
// books.cover_design_item_id còn null. 8 giá trị y hệt field `tag` ở mock
// data (src/lib/books.ts) — không phát sinh taxonomy mới. Cột thật là
// `text` + CHECK, không phải Postgres enum (migrations/20260819_add_book_genre.sql),
// nên type ở đây là union thường, không map từ 1 Postgres enum type.
export type BookGenre =
  | "Ngôn tình"
  | "Trinh thám"
  | "Tản văn"
  | "Văn học"
  | "Lịch sử"
  | "Kỳ ảo"
  | "Kinh dị"
  | "Phiêu lưu";

export type TransactionType =
  | "signup_bonus"
  | "daily_task_reward"
  | "purchase_chapter"
  | "topup"
  | "refund"
  | "admin_adjustment"
  | "screenshot_penalty"
  // Added by migrations/20260807_wallet_ledger_extension.sql.
  | "purchase_credit" // author's revenue-share leg of a purchase_chapter debit — starts 'pending'
  | "withdrawal"
  | "platform_bonus";

// See migrations/20260807_wallet_ledger_extension.sql part 2. Every row
// created before that migration is 'completed' by default (backfilled).
export type TransactionStatus = "pending" | "processing" | "available" | "completed" | "failed" | "reversed";

export type DepositStatus = "pending" | "success" | "failed";
export type WithdrawalStatus = "pending" | "processing" | "success" | "failed";

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
          // Author revenue-share still inside its hold period — see
          // migrations/20260807_wallet_ledger_extension.sql part 1.
          // Visible to the user, not spendable/withdrawable yet.
          token_balance_pending: number;
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
          token_balance_pending?: number;
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
          // null = chưa gán thể loại — src/lib/covers dùng style fallback
          // riêng cho trường hợp này, không coi null là lỗi.
          genre: BookGenre | null;
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
          genre?: BookGenre | null;
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
          // Số token đọc chương, 0 = miễn phí. Giá niêm yết — chưa tự
          // động nối vào create_purchase()/purchase_transactions.
          price: number;
          // true = chỉ phân phối trên Vịnh (mặc định).
          is_exclusive: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          book_id: string;
          title: string;
          content: string;
          order_index: number;
          published?: boolean;
          price?: number;
          is_exclusive?: boolean;
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
          // Snapshot of token_balance_pending after this op; null unless
          // status = 'pending'. See wallet_ledger_extension.sql part 2.
          pending_balance_after: number | null;
          status: TransactionStatus;
          available_at: string | null;
          related_transaction_id: string | null;
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
      deposit_transactions: {
        Row: {
          id: string;
          user_id: string;
          payment_gateway: string;
          gateway_order_id: string;
          amount_vnd: number;
          token_amount: number;
          status: DepositStatus;
          raw_payload: Record<string, unknown> | null;
          transaction_id: string | null;
          created_at: string;
          processed_at: string | null;
        };
        // Written only by the service-role client (deposit-service.ts) —
        // never through the RLS-checked client (no insert/update policy
        // exists on this table, see schema.sql part 6c), but it IS a
        // direct table insert/update rather than an RPC, unlike the other
        // wallet tables below, so (unlike those) this needs real shapes.
        Insert: {
          id?: string;
          user_id: string;
          payment_gateway: string;
          gateway_order_id: string;
          amount_vnd: number;
          token_amount: number;
          status?: DepositStatus;
          raw_payload?: Record<string, unknown> | null;
        };
        Update: {
          status?: DepositStatus;
          transaction_id?: string | null;
          processed_at?: string | null;
        };
        Relationships: [];
      };
      withdrawal_requests: {
        Row: {
          id: string;
          user_id: string;
          amount_tokens: number;
          amount_vnd: number;
          bank_account_number: string;
          bank_account_name: string;
          bank_code: string;
          status: WithdrawalStatus;
          payout_gateway_ref: string | null;
          failure_reason: string | null;
          transaction_id: string;
          refund_transaction_id: string | null;
          created_at: string;
          processed_at: string | null;
        };
        // Rows are only created via create_withdrawal_request() and
        // updated via mark_withdrawal_result() — see withdrawal-service.ts.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      purchase_transactions: {
        Row: {
          id: string;
          buyer_id: string;
          author_id: string;
          chapter_id: string;
          amount: number;
          author_share: number;
          platform_share: number;
          debit_transaction_id: string;
          credit_transaction_id: string;
          created_at: string;
        };
        // Rows are only created via create_purchase() — see LedgerService.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      platform_revenue_entries: {
        Row: {
          id: string;
          purchase_transaction_id: string;
          amount: number;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      platform_bonus_grants: {
        Row: {
          id: string;
          transaction_id: string;
          recipient_id: string;
          granted_by: string;
          reason: string;
          created_at: string;
        };
        // Rows are only created via grant_platform_bonus() — see LedgerService.
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
          // Added by wallet_ledger_extension.sql — all optional/defaulted,
          // existing call sites (register, penalty route, claim_daily_task)
          // omit them and keep working unchanged.
          p_status?: TransactionStatus | null;
          p_available_at?: string | null;
          p_related_transaction_id?: string | null;
        };
        Returns: Database["public"]["Tables"]["transactions"]["Row"];
      };
      settle_pending_transaction: {
        Args: { p_transaction_id: string };
        Returns: Database["public"]["Tables"]["transactions"]["Row"] | null;
      };
      settle_due_pending_transactions: {
        Args: { p_limit?: number | null };
        Returns: Database["public"]["Tables"]["transactions"]["Row"][];
      };
      create_withdrawal_request: {
        Args: {
          p_user_id: string;
          p_amount_tokens: number;
          p_amount_vnd: number;
          p_bank_account_number: string;
          p_bank_account_name: string;
          p_bank_code: string;
        };
        Returns: Database["public"]["Tables"]["withdrawal_requests"]["Row"];
      };
      mark_withdrawal_result: {
        Args: {
          p_request_id: string;
          p_success: boolean;
          p_gateway_ref?: string | null;
          p_failure_reason?: string | null;
        };
        Returns: Database["public"]["Tables"]["withdrawal_requests"]["Row"];
      };
      create_purchase: {
        Args: {
          p_buyer_id: string;
          p_author_id: string;
          p_chapter_id: string;
          p_amount: number;
          p_author_share: number;
          p_platform_share: number;
          p_hold_days: number;
        };
        Returns: Database["public"]["Tables"]["purchase_transactions"]["Row"];
      };
      grant_platform_bonus: {
        Args: {
          p_admin_id: string;
          p_recipient_id: string;
          p_amount: number;
          p_reason: string;
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