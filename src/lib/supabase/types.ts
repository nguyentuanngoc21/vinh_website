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
// books.cover_design_item_id còn null. 10 giá trị = taxonomy CHÍNH THỨC
// của nền tảng (migrations/20260825_update_book_genres.sql, thay cho 8
// giá trị tạm ban đầu ở migrations/20260819_add_book_genre.sql). Cột
// thật là `text` + CHECK, không phải Postgres enum, nên type ở đây là
// union thường, không map từ 1 Postgres enum type.
export type BookGenre =
  | "Linh dị"
  | "Cổ tích & Thần thoại"
  | "Dã sử"
  | "Trinh thám"
  | "Tâm lý - tội phạm"
  | "Tình cảm"
  | "Đời sống - Xã hội"
  | "Khoa học viễn tưởng"
  | "Tiên hiệp/ kiếm hiệp"
  | "Kỳ ảo";

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
  | "platform_bonus"
  // Added by migrations/20260827_add_quest_reward_transaction_type.sql —
  // reference_type = 'quest', reference_id = task_templates.id or
  // hidden_quests.id. No separate quest ledger; reuses apply_transaction().
  | "quest_reward"
  // Added by migrations/20260827_add_streak_bonus_transaction_type.sql —
  // reference_type = 'streak_milestone', reference_id = streak_milestones.id.
  // Deliberately separate from 'quest_reward' — not tied to any quest,
  // never a multiplier on task_templates/hidden_quests rewards.
  | "streak_bonus"
  // Added by migrations/20260827_add_streak_rescue_transaction_type.sql —
  // a DEBIT (negative amount), reference_type = 'streak_rescue'. Paid by
  // the user to save a streak after missing exactly 1 day with an empty
  // rest-day bank. Separate from 'streak_bonus' (a credit) for the same
  // reason purchase_chapter/purchase_credit are separate.
  | "streak_rescue";

// Quest System taxonomy — see migrations/20260827_extend_task_templates_for_quests.sql.
// Same 6 values used by task_templates.quest_type and quest_examples_pool.quest_type.
export type QuestType = "discovery" | "engagement" | "lore_hunt" | "cross_compare" | "prediction" | "topup";

// Polymorphic discriminator for quest_id columns (quest_reset_events,
// anchored_comments) — disambiguates task_templates.id vs hidden_quests.id.
// No FK, same pattern as purchase_transactions.chapter_id.
export type QuestSource = "task_template" | "hidden_quest";

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
          // Ảnh bìa trang cá nhân/tác giả — xem
          // migrations/20260828_add_profile_cover_image.sql.
          cover_image_url: string | null;
          role: Role;
          // Nhãn mô tả, không phải quyền hạn — ai cũng tự gắn được, xem
          // comment trong schema.sql phần 1.
          creator_tags: CreatorTag[];
          real_name: string | null;
          phone: string | null;
          cccd_last4: string | null; // last 4 digits only — see schema.sql note
          cccd_verified: boolean;
          // Ngân hàng thụ hưởng để rút token — xem
          // migrations/20260826_add_profile_bank_info.sql. Rút token chỉ
          // dùng được khi cccd_verified = true và cả 3 cột này khác null
          // (WithdrawalService.requestWithdrawal).
          bank_code: string | null;
          bank_name: string | null;
          bank_account_number: string | null;
          // Người dùng tự nhập — KHÔNG ép = real_name (xem
          // migrations/20260827_add_bank_account_name.sql).
          bank_account_name: string | null;
          // Xem migrations/20260827_add_profile_bio.sql. nickname_updated_at
          // chỉ dùng để enforce cooldown 30 ngày ở api/profile/me/route.ts —
          // không hiển thị trực tiếp.
          bio: string | null;
          nickname_updated_at: string | null;
          token_balance: number;
          // Author revenue-share still inside its hold period — see
          // migrations/20260807_wallet_ledger_extension.sql part 1.
          // Visible to the user, not spendable/withdrawable yet.
          token_balance_pending: number;
          screenshot_penalty_count: number;
          screenshot_penalty_expires_at: string | null;
          screenshot_penalty_banned: boolean;
          screenshot_penalty_last_offense_at: string | null;
          // Quest System — lưu sẵn, không tính lại mỗi lần đọc. Chặn write
          // trực tiếp bởi trigger enforce_quest_streak_authority (giống
          // role/cccd_verified) — xem
          // migrations/20260827_add_quest_streak_to_profiles.sql. KHÔNG có
          // trong Insert/Update, client không tự set được. Cả 4 cột chỉ
          // đổi qua sync_reading_streak()/rescue_streak_with_tokens() —
          // xem migrations/20260827_add_streak_sync_functions.sql.
          current_quest_streak: number;
          streak_updated_at: string | null;
          // Kho "thẻ nghỉ" tích lũy (+1/7 ngày streak liên tục, trần tăng
          // theo mốc streak, tối đa 31) — dùng để bù 1 ngày lỡ mà không
          // mất streak, không tốn token.
          streak_rest_days_banked: number;
          // NULL = streak khoẻ mạnh. Có giá trị = vừa lỡ 1 ngày, hết thẻ
          // nghỉ, đang trong 48h ân hạn để trả token cứu.
          streak_at_risk_since: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          username: string;
          nickname: string;
          avatar_url?: string | null;
          cover_image_url?: string | null;
          role?: Role;
          creator_tags?: CreatorTag[];
          real_name?: string | null;
          phone?: string | null;
          cccd_last4?: string | null;
          cccd_verified?: boolean;
          bank_code?: string | null;
          bank_name?: string | null;
          bank_account_number?: string | null;
          bank_account_name?: string | null;
          bio?: string | null;
          nickname_updated_at?: string | null;
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
          // Mặc định DB là 'pending', nhưng route server chủ động insert
          // 'approved' ngay khi OCR khớp ảnh (xác minh tự động, không có
          // màn hình admin duyệt tay ở bản này) — xem register/route.ts và
          // api/profile/identity/route.ts.
          status?: "pending" | "approved" | "rejected";
        };
        // reviewed_by/reviewed_at chỉ đổi được qua luồng admin duyệt tay
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
          // Free text, tác giả tự định nghĩa — KHÁC genre (1 giá trị, danh
          // sách cố định). Xem migrations/20260824_add_book_tags_and_view_count.sql.
          tags: string[];
          // Tăng mỗi lần tải trang chương, không khử trùng lặp. Chỉ đổi
          // được qua RPC increment_book_view_count() — không có trong
          // Insert/Update vì client không tự set số này.
          view_count: number;
          published: boolean;
          // true = chỉ phân phối trên Vịnh (mặc định) — độc quyền giờ ở
          // cấp TRUYỆN (chapters.is_exclusive vẫn còn cột nhưng app không
          // đọc/viết nữa). Xem migrations/20260826_add_book_exclusivity.sql.
          is_exclusive: boolean;
          // Mốc lúc published chuyển false -> true, set 1 lần bởi trigger
          // set_book_published_at — KHÔNG có trong Insert/Update, client
          // không tự set/backdate được (đây là mốc tính khoá exclusivity
          // 3 ngày). null = chưa từng published, hoặc published từ trước
          // migration này (không backfill).
          published_at: string | null;
          // null = còn sống. Soft-delete — không có DELETE thật. Xem
          // migrations/20260826_add_book_soft_delete.sql.
          deleted_at: string | null;
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
          tags?: string[];
          published?: boolean;
          is_exclusive?: boolean;
          deleted_at?: string | null;
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
          // DEPRECATED — độc quyền giờ đọc/viết ở books.is_exclusive (cấp
          // truyện, không phải từng chương). Cột này vẫn còn trong DB
          // (không drop) nhưng app không đọc/viết nữa. Xem
          // migrations/20260826_add_book_exclusivity.sql.
          is_exclusive: boolean;
          // Checkbox 1 chiều — tối đa 1 chương/sách, không đổi lại được
          // false sau khi lưu true (trigger DB chặn). Dùng để tính trạng
          // thái "Đã hoàn thành" ở trang giới thiệu truyện. Xem
          // migrations/20260824_add_chapter_is_last.sql.
          is_last_chapter: boolean;
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
          is_last_chapter?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["chapters"]["Insert"]>;
        Relationships: [];
      };
      chapter_votes: {
        Row: {
          id: string;
          chapter_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          chapter_id: string;
          user_id: string;
        };
        // Toggle = insert (vote) hoặc delete (bỏ vote) — không có update.
        Update: never;
        Relationships: [];
      };
      book_progress: {
        Row: {
          user_id: string;
          book_id: string;
          chapter_id: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          book_id: string;
          chapter_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["book_progress"]["Insert"]>;
        Relationships: [];
      };
      author_follows: {
        Row: {
          follower_id: string;
          author_id: string;
          created_at: string;
        };
        Insert: {
          follower_id: string;
          author_id: string;
        };
        // Toggle = insert (theo dõi) hoặc delete (bỏ theo dõi) — không có update.
        Update: never;
        Relationships: [];
      };
      direct_messages: {
        Row: {
          id: string;
          sender_id: string;
          recipient_id: string;
          body: string;
          // null = người nhận chưa đọc. Xem
          // migrations/20260828_add_direct_messages.sql.
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          sender_id: string;
          recipient_id: string;
          body: string;
        };
        // Update chỉ dùng để set read_at (đánh dấu đã đọc) — route server
        // tự giới hạn field, type ở đây rộng hơn 1 chút cho đơn giản.
        Update: { read_at?: string | null };
        Relationships: [];
      };
      reading_lists: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
        };
        Update: { name: string };
        Relationships: [];
      };
      reading_list_items: {
        Row: {
          list_id: string;
          book_id: string;
          added_at: string;
        };
        Insert: {
          list_id: string;
          book_id: string;
        };
        // Thêm/xoá sách khỏi danh sách = insert/delete — không có update.
        Update: never;
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
          // Quest System columns — NULL/'manual' for pre-existing daily
          // task rows, which are not part of the quest taxonomy. See
          // migrations/20260827_extend_task_templates_for_quests.sql.
          quest_type: QuestType | null;
          // {chapter_id, paragraph_index, char_start, char_end} — no FK,
          // paragraph_index is a client-computed split index, not a
          // paragraph table (none exists).
          chapter_ref: Record<string, unknown> | null;
          genre: string | null;
          author_id: string | null;
          generated_by: string;
          quality_flag: string | null;
          similarity_to_pool_score: number | null;
          auto_flag_reason: string | null;
        };
        Insert: {
          id?: string;
          code: string;
          title: string;
          description?: string | null;
          target_count?: number;
          reward_tokens?: number;
          active?: boolean;
          quest_type?: QuestType | null;
          chapter_ref?: Record<string, unknown> | null;
          genre?: string | null;
          author_id?: string | null;
          generated_by?: string;
          quality_flag?: string | null;
          similarity_to_pool_score?: number | null;
          auto_flag_reason?: string | null;
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
          // Fast counter for UI (disable reset button once exhausted) —
          // detailed history lives in quest_reset_events. See
          // migrations/20260827_extend_task_templates_for_quests.sql.
          reset_count: number;
        };
        // Rows are created/updated via increment_task_progress() and
        // claim_daily_task() RPCs, not direct insert/update — see
        // schema.sql section 7. `never` (not omitted) — see the comment
        // on `transactions.Insert` above for why omitting breaks everything.
        // reset_count needs the same treatment (a new security-definer
        // reset function, not a direct update) once the reset flow ships.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      quest_examples_pool: {
        Row: {
          id: string;
          quest_type: QuestType;
          content: string;
          genre: string | null;
          example_quality: "good" | "bad_counterexample";
          spoiler_risk: "low" | "medium" | "high";
          version: number;
          added_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          quest_type: QuestType;
          content: string;
          genre?: string | null;
          example_quality: "good" | "bad_counterexample";
          spoiler_risk?: "low" | "medium" | "high";
          version?: number;
          added_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["quest_examples_pool"]["Insert"]>;
        Relationships: [];
      };
      // No reward_rules table — task_templates.reward_tokens and
      // hidden_quests.reward_tokens each hold their own fixed amount
      // directly, no shared lookup table. Streak bonus is entirely
      // separate (streak_milestones below), never a multiplier on either.
      hidden_quests: {
        Row: {
          id: string;
          title: string;
          unlock_condition: Record<string, unknown>;
          // Fixed amount the admin sets per campaign — not affected by
          // streak bonus, no shared rule table. See
          // migrations/20260827_add_hidden_quests.sql.
          reward_tokens: number;
          campaign_name: string;
          active_from: string;
          active_to: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          unlock_condition: Record<string, unknown>;
          reward_tokens: number;
          campaign_name: string;
          active_from: string;
          active_to: string;
          created_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["hidden_quests"]["Insert"]>;
        Relationships: [];
      };
      user_hidden_quest_progress: {
        Row: {
          id: string;
          user_id: string;
          hidden_quest_id: string;
          status: "in_progress" | "completed";
          completed_at: string | null;
          created_at: string;
        };
        // Rows are created/completed via a server route that checks
        // unlock_condition + calls apply_transaction() — not a direct
        // insert/update. See schema.sql section 10d.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      quest_reset_events: {
        Row: {
          id: string;
          user_id: string;
          quest_id: string;
          quest_source: QuestSource;
          replaced_by_quest_id: string | null;
          created_at: string;
        };
        // Written only by the server-side reset route (enforces the
        // 1-2/day limit + cooldown) — not a direct insert.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      highlights: {
        Row: {
          id: string;
          user_id: string;
          chapter_id: string;
          paragraph_index: number | null;
          char_start: number;
          char_end: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          chapter_id: string;
          paragraph_index?: number | null;
          char_start: number;
          char_end: number;
        };
        Update: Partial<Database["public"]["Tables"]["highlights"]["Insert"]>;
        Relationships: [];
      };
      reading_sessions: {
        Row: {
          id: string;
          user_id: string;
          chapter_id: string;
          start_time: string;
          end_time: string | null;
          drop_off_offset: number | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          chapter_id: string;
          start_time?: string;
          end_time?: string | null;
          drop_off_offset?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["reading_sessions"]["Insert"]>;
        Relationships: [];
      };
      anchored_comments: {
        Row: {
          id: string;
          user_id: string;
          chapter_id: string;
          paragraph_index: number | null;
          char_start: number;
          char_end: number;
          content: string;
          quest_id: string | null;
          quest_source: QuestSource | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          chapter_id: string;
          paragraph_index?: number | null;
          char_start: number;
          char_end: number;
          content: string;
          quest_id?: string | null;
          quest_source?: QuestSource | null;
        };
        Update: Partial<Database["public"]["Tables"]["anchored_comments"]["Insert"]>;
        Relationships: [];
      };
      streak_milestones: {
        Row: {
          id: string;
          streak_days: number;
          reward_token: number;
          // No badges table yet — column exists but unenforced (no FK)
          // until it does. See migrations/20260827_add_streak_milestones.sql.
          badge_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          streak_days: number;
          reward_token: number;
          badge_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["streak_milestones"]["Insert"]>;
        Relationships: [];
      };
      user_streak_milestone_claims: {
        Row: {
          id: string;
          user_id: string;
          streak_milestone_id: string;
          transaction_id: string;
          claimed_at: string;
        };
        // Rows are only created via claim_streak_milestone() — not a
        // direct insert/update.
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
          cover_image_url: string | null;
          // Xem migrations/20260828_extend_author_public_profiles.sql.
          bio: string | null;
          created_at: string;
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
      chapter_vote_counts: {
        Row: {
          chapter_id: string;
          vote_count: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      increment_book_view_count: {
        Args: { p_book_id: string };
        Returns: void;
      };
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
      complete_hidden_quest: {
        Args: { p_user_id: string; p_hidden_quest_id: string };
        Returns: Database["public"]["Tables"]["transactions"]["Row"];
      };
      claim_streak_milestone: {
        Args: { p_user_id: string; p_streak_milestone_id: string };
        Returns: Database["public"]["Tables"]["transactions"]["Row"];
      };
      sync_reading_streak: {
        Args: { p_user_id: string; p_activity_date?: string };
        Returns: Database["public"]["Tables"]["profiles"]["Row"];
      };
      rescue_streak_with_tokens: {
        Args: { p_user_id: string; p_token_cost: number };
        Returns: Database["public"]["Tables"]["profiles"]["Row"];
      };
    };
  };
};