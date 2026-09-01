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
export type CreatorTag =
  | "author"
  | "illustrator"
  | "narrator"
  // Added by migrations/20260901_add_blogger_creator_tag.sql — chỉ là nhãn
  // lọc ở Kết nối, KHÔNG kéo theo mục "Blog" trong danh sách tác phẩm (repo
  // chưa có bảng blog_posts thật, xem ghi chú đầu docs/supabase/schema.sql).
  | "blogger";

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
  | "streak_rescue"
  // Hệ thống giao dịch commission (schema.sql phần 12) — xem
  // migrations/20260901_add_order_payment_transaction_type.sql,
  // 20260901_add_order_earning_transaction_type.sql. 'order_payment' = vế
  // trừ ngay-lập-tức của buyer (status luôn 'completed', KHÔNG 'pending').
  // 'order_earning' = vế cộng (pending, hold period) của seller, ghi tại
  // buyer_confirmed/auto_confirmed — KHÔNG ghi lúc đặt cọc.
  | "order_payment"
  | "order_earning"
  // Hoàn tiền khi hủy Order (Mục 5.1) — cộng ngay, không hold period. Thêm
  // bởi migrations/20260901_add_order_refund_transaction_type.sql.
  | "order_refund";

// schema.sql phần 12. Giữ đủ 8 giá trị đúng sơ đồ đặc tả dù
// 'brief_confirmed'/'deposit_paid' chỉ dừng lại rất ngắn trong thực tế —
// xem record_order_payment() trong migrations/20260901_add_order_system_core.sql.
export type OrderStatus =
  | "draft"
  | "brief_confirmed"
  | "deposit_paid"
  | "in_progress"
  | "delivered"
  | "completed"
  | "cancelled"
  | "disputed";

export type ServiceType = "illustration" | "voice" | "ghostwriting";

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
          // migrations/20260829_add_author_contract_fields.sql — điền
          // "BÊN A" trong Hợp đồng khai thác tác phẩm độc quyền.
          date_of_birth: string | null;
          address: string | null;
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
          // Độ uy tín (Module 7 đặc tả) — CHỈ đổi qua recalculate_trust_score()
          // (security definer, tính lại từ nguồn dữ liệu gốc mỗi lần gọi,
          // không phải increment rải rác) — xem
          // migrations/20260901_add_trust_and_disputes.sql. Không có trong
          // Insert/Update, client không tự set được.
          trust_orders_completed: number;
          trust_orders_cancelled_at_fault: number;
          trust_off_platform_flags: number;
          trust_violations_resolved: number;
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
          date_of_birth?: string | null;
          address?: string | null;
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
          // migrations/20260829_add_author_contract_fields.sql — "cấp
          // ngày" trong Hợp đồng khai thác tác phẩm độc quyền.
          cccd_issued_at: string | null;
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
          cccd_issued_at?: string | null;
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
      agreement_acceptances: {
        Row: {
          user_id: string;
          agreement_id: string;
          accepted_at: string;
          accepted_version: string;
        };
        Insert: {
          user_id: string;
          agreement_id: string;
          accepted_at?: string;
          accepted_version: string;
        };
        Update: Partial<Database["public"]["Tables"]["agreement_acceptances"]["Insert"]>;
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
          // "Hoàn thiện" — Share bản thảo kiểu Drive (một chiều, trigger DB
          // chặn unset — giống is_last_chapter ở chapters). Khi chuyển
          // null -> not null, TỰ ĐỘNG khóa mọi manuscript_access_grants
          // đang hoạt động của book này (trigger
          // lock_manuscript_grants_on_finalize). Xem
          // migrations/20260901_add_manuscript_share.sql.
          finalized_at: string | null;
          // Module 5+6 đặc tả — luôn true nếu sách sinh ra từ 1 Order
          // ghostwriting (set bởi attach_order_book(), KHÔNG phụ thuộc
          // author_display). Xem migrations/20260901_add_ghostwriting_authorship.sql.
          is_ghostwritten: boolean;
          // 'pen_name' (mặc định) | 'anonymous' | 'customer_name' |
          // 'co_authorship' — 2 giá trị sau CHỈ được set qua
          // confirm_author_name_agreement() khi đủ 2 xác nhận.
          author_display: "pen_name" | "anonymous" | "customer_name" | "co_authorship";
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
          finalized_at?: string | null;
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
          // Mục 8 đặc tả — nghi ngờ trao đổi giao dịch ngoài nền tảng (regex
          // ở route, xem migrations/20260901_add_trust_and_disputes.sql).
          // KHÔNG chặn gửi, chỉ gắn nhãn cho chính người gửi thấy.
          flagged_off_platform: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          sender_id: string;
          recipient_id: string;
          body: string;
          flagged_off_platform?: boolean;
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
      // Hệ thống giao dịch commission (schema.sql phần 12) — xem
      // migrations/20260901_add_order_system_core.sql. service_listings/
      // service_samples viết trực tiếp qua .insert()/.update() (không RPC,
      // giống direct_messages — không phải ledger, không cần atomic đa
      // bảng); orders/order_events CHỈ ghi qua các RPC ở Functions bên
      // dưới, y hệt nguyên tắc của transactions.
      service_listings: {
        Row: {
          id: string;
          seller_id: string;
          service_type: ServiceType;
          name: string;
          scope_description: string;
          price_tiers: Record<string, unknown>[];
          deposit_pct: number | null;
          delivery_days: number | null;
          revisions_max: number | null;
          tags: Record<string, unknown>;
          default_usage_scope: string | null;
          // null = seller chưa tự khai. Từ migrations/20260901_add_order_cancel_system.sql
          // PHẢI là object 4 key cố định: { before_draft, draft_pending,
          // draft_approved, delivered } (mỗi giá trị 0-100) — calculate_refund()
          // tra thẳng key này, không so khớp text tự do nữa (xem ghi chú
          // đầu migration đó).
          refund_policy: { before_draft: number; draft_pending: number; draft_approved: number; delivered: number } | null;
          lost_contact_days: number;
          accepted_content: string | null;
          rejected_content: string | null;
          is_private: boolean;
          // Chỉ được set true bởi src/lib/orders/service-listing-service.ts
          // sau khi validate đủ 11/11 trường — không phải validate ở đây.
          is_accepting_orders: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          seller_id: string;
          service_type: ServiceType;
          name?: string;
          scope_description?: string;
          price_tiers?: Record<string, unknown>[];
          deposit_pct?: number | null;
          delivery_days?: number | null;
          revisions_max?: number | null;
          tags?: Record<string, unknown>;
          default_usage_scope?: string | null;
          refund_policy?: { before_draft: number; draft_pending: number; draft_approved: number; delivered: number } | null;
          lost_contact_days?: number;
          accepted_content?: string | null;
          rejected_content?: string | null;
          is_private?: boolean;
        };
        // is_accepting_orders CỐ Ý không có ở Update — chỉ set qua
        // service-layer sau khi validate 11 trường, xem ghi chú Row ở trên.
        Update: Partial<
          Omit<Database["public"]["Tables"]["service_listings"]["Insert"], "seller_id">
        > & { is_accepting_orders?: boolean; updated_at?: string };
        Relationships: [];
      };
      service_samples: {
        Row: {
          id: string;
          listing_id: string;
          source: "upload" | "auto" | "external";
          file_url: string;
          unverified_external: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          source?: "upload" | "auto" | "external";
          file_url: string;
          unverified_external?: boolean;
        };
        Update: never; // gỡ/thêm lại = delete/insert, không update.
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          code: string;
          buyer_id: string;
          seller_id: string;
          listing_id: string;
          status: OrderStatus;
          usage_scope: "personal" | "commercial_limited" | "commercial_full" | null;
          scope_note: string | null;
          brief: string;
          brief_locked_at: string | null;
          price: number;
          paid: number;
          deposit_pct: number;
          revisions_max: number;
          revisions_used: number;
          draft_number: number;
          drafts_approved: number;
          delivered_at: string | null;
          auto_confirm_at: string | null;
          completed_at: string | null;
          cancelled_at: string | null;
          tos_snapshot: Record<string, unknown>;
          // migrations/20260901_add_service_tag_catalog.sql — 1 đơn
          // completed có được dùng làm sample tự động (Mục 2.2) hay đưa
          // vào bảng xếp hạng/gợi ý hay không. Toggle route chưa làm ở
          // Phase 2 (thuộc Module 4/6) — cột có sẵn để truy vấn "auto"
          // sample ngay, KHÔNG route nào set giá trị khác false hiện tại.
          is_private: boolean;
          // Chỉ đơn ghostwriting mới gắn — biết đang viết cho đúng truyện
          // nào (route attach-book). Xem
          // migrations/20260901_add_manuscript_share.sql.
          book_id: string | null;
          created_at: string;
        };
        // Rows chỉ được tạo/sửa qua các RPC ở Functions (create_order,
        // record_order_payment, deliver_order, confirm_order_received...) —
        // xem ghi chú ở transactions.Insert bên dưới, lý do y hệt.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      order_events: {
        Row: {
          id: string;
          order_id: string;
          event_type: string;
          actor_id: string | null; // null = hệ thống/cron
          payload: Record<string, unknown>;
          created_at: string;
        };
        // Bất biến — chỉ các RPC ở orders mới insert (INSERT bên trong
        // cùng transaction với UPDATE orders), không route nào insert
        // thẳng bảng này.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      // Danh mục tag cố định cho service_listings (Mục 2.2 đặc tả) — xem
      // migrations/20260901_add_service_tag_catalog.sql.
      service_tag_options: {
        Row: {
          id: string;
          service_type: ServiceType;
          group_key: string;
          group_label: string;
          label: string;
          sort_order: number;
          created_at: string;
        };
        // Không route nào insert/update trực tiếp — chỉ ghi qua duyệt
        // service_tag_suggestions (service-role, phase admin review) hoặc
        // thao tác tay trong SQL Editor.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      service_tag_suggestions: {
        Row: {
          id: string;
          submitted_by: string;
          service_type: ServiceType;
          group_key: string;
          label: string;
          status: "pending" | "approved" | "rejected";
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          submitted_by: string;
          service_type: ServiceType;
          group_key: string;
          label: string;
        };
        Update: { status?: "pending" | "approved" | "rejected"; resolved_by?: string | null; resolved_at?: string | null };
        Relationships: [];
      };
      // Share bản thảo kiểu Drive (yêu cầu bổ sung #1) — xem
      // migrations/20260901_add_manuscript_share.sql. Tối đa 1 dòng ĐANG
      // HOẠT ĐỘNG (revoked_at is null and locked_at is null) mỗi book_id,
      // ép bằng partial unique index — không phải check ở app.
      manuscript_access_grants: {
        Row: {
          id: string;
          book_id: string;
          order_id: string | null;
          granted_to_user_id: string;
          granted_by_user_id: string;
          granted_at: string;
          revoked_at: string | null;
          locked_at: string | null;
        };
        // Insert qua RLS-scoped client (chủ sách tự grant) HOẶC qua RPC
        // attach_order_book (ghostwriting) — cả 2 đều là insert thật, giữ
        // Insert có shape thay vì never.
        Insert: {
          id?: string;
          book_id: string;
          order_id?: string | null;
          granted_to_user_id: string;
          granted_by_user_id: string;
        };
        // Chỉ revoked_at nằm trong GRANT cho authenticated — locked_at chỉ
        // trigger lock_manuscript_grants_on_finalize set được.
        Update: { revoked_at?: string | null };
        Relationships: [];
      };
      // Bàn giao illustration/voice (Mục 4.1-4.2) — xem
      // migrations/20260901_add_order_delivery_assets.sql. ghostwriting
      // dùng manuscript_access_grants (không cần asset ở đây).
      order_delivered_assets: {
        Row: {
          id: string;
          order_id: string;
          kind: "illustration_preview" | "illustration_original" | "voice_stream" | "voice_original";
          storage_path: string;
          created_at: string;
        };
        // KHÔNG qua RPC (khác orders/order_events) — watermark xử lý bằng
        // sharp ở tầng Next.js route (src/app/api/orders/[orderId]/deliver),
        // Postgres không xử lý ảnh được. Chỉ route đó (service-role) insert.
        Insert: { id?: string; order_id: string; kind: string; storage_path: string };
        Update: never;
        Relationships: [];
      };
      order_file_requests: {
        Row: {
          id: string;
          order_id: string;
          requested_by: string;
          status: "pending" | "agreed" | "declined";
          created_at: string;
          resolved_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      // Tính hoàn tiền + hủy đơn (Mục 5.1) — xem
      // migrations/20260901_add_order_cancel_system.sql.
      order_cancel_requests: {
        Row: {
          id: string;
          order_id: string;
          requested_by: string;
          cancelled_by: "buyer" | "seller";
          refund_amount: number;
          status: "pending" | "agreed" | "declined";
          created_at: string;
          resolved_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      // Đứng tên tác giả thay (Module 5 đặc tả) — xem
      // migrations/20260901_add_ghostwriting_authorship.sql.
      author_name_agreements: {
        Row: {
          id: string;
          order_id: string;
          book_id: string;
          ghostwriter_id: string;
          ghostwriter_confirmed_at: string | null;
          ghostwriter_statement_text: string | null;
          customer_id: string;
          customer_confirmed_at: string | null;
          customer_statement_text: string | null;
          author_display_choice: "customer_name" | "co_authorship";
          ghostwriter_sample_visible: boolean;
          customer_profile_visible: boolean;
          created_at: string;
        };
        // Chỉ ghi qua initiate_author_name_agreement()/
        // confirm_author_name_agreement() (RPC) — bất biến sau khi đủ 2
        // xác nhận, không route nào update/insert trực tiếp.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      // Báo cáo vi phạm/Tranh chấp (Module 9 đặc tả) — xem
      // migrations/20260901_add_trust_and_disputes.sql.
      disputes: {
        Row: {
          id: string;
          order_id: string;
          reporter_id: string;
          reason_category: string;
          description: string;
          status: "open" | "resolved";
          evidence_snapshot: Record<string, unknown>;
          resolution_note: string | null;
          at_fault_user_id: string | null;
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
        };
        // Chỉ ghi qua open_dispute()/resolve_dispute() (RPC).
        Insert: never;
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
        // Written only by reset_quest_pool_slot() (enforces the shared
        // 3/day budget + cooldown) — not a direct insert. See
        // migrations/20260828_add_user_quest_pool.sql.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      user_quest_pool: {
        Row: {
          id: string;
          user_id: string;
          pool_date: string;
          task_template_id: string;
          slot_index: number;
          created_at: string;
        };
        // Rows are only created/updated via create_quest_pool_for_today()
        // and reset_quest_pool_slot() — not a direct insert/update. See
        // migrations/20260828_add_user_quest_pool.sql.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      quest_generation_jobs: {
        Row: {
          id: string;
          chapter_id: string;
          status: "queued" | "processing" | "done" | "failed";
          attempts: number;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        // Written by the Python worker (its own service-role key) and,
        // eventually, the chapter-publish route — not the TS wallet/quest
        // services. Kept typed here anyway so Next.js can read/debug via
        // the Supabase client if needed. See
        // migrations/20260828_add_quest_generation_jobs.sql.
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
      // Xem migrations/20260831_add_book_read_counts_daily.sql. Ẩn danh
      // (không có user_id) — số lượt đọc mỗi sách theo từng ngày, dùng để
      // tính bảng xếp hạng tuần/tháng/quý thật ở /rankings
      // (src/lib/rankings/get-book-rankings.ts).
      book_read_counts_daily: {
        Row: {
          book_id: string;
          read_date: string;
          read_count: number;
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
      create_quest_pool_for_today: {
        Args: { p_user_id: string; p_pool_date: string; p_task_template_ids: string[] };
        Returns: Database["public"]["Tables"]["user_quest_pool"]["Row"][];
      };
      reset_quest_pool_slot: {
        Args: {
          p_user_id: string;
          p_pool_date: string;
          p_task_template_id: string;
          p_replacement_template_id: string;
          p_max_resets_per_day: number;
        };
        Returns: Database["public"]["Tables"]["user_quest_pool"]["Row"];
      };
      // Hệ thống giao dịch commission — xem
      // migrations/20260901_add_order_system_core.sql (nguồn sự thật cho
      // thân hàm, không lặp lại logic ở đây).
      create_order: {
        Args: {
          p_buyer_id: string;
          p_seller_id: string;
          p_listing_id: string;
          p_price: number;
          p_deposit_pct: number;
          p_revisions_max: number;
          p_tos_snapshot: Record<string, unknown>;
        };
        Returns: Database["public"]["Tables"]["orders"]["Row"];
      };
      set_order_scope: {
        Args: {
          p_order_id: string;
          p_actor_id: string;
          p_usage_scope: string;
          p_scope_note?: string | null;
        };
        Returns: Database["public"]["Tables"]["orders"]["Row"];
      };
      set_order_brief: {
        Args: { p_order_id: string; p_actor_id: string; p_brief: string };
        Returns: Database["public"]["Tables"]["orders"]["Row"];
      };
      confirm_order_brief: {
        Args: { p_order_id: string; p_actor_id: string };
        Returns: Database["public"]["Tables"]["orders"]["Row"];
      };
      record_order_payment: {
        Args: { p_order_id: string; p_actor_id: string; p_amount: number };
        Returns: Database["public"]["Tables"]["orders"]["Row"];
      };
      submit_order_draft: {
        Args: { p_order_id: string; p_actor_id: string; p_asset: Record<string, unknown> };
        Returns: Database["public"]["Tables"]["orders"]["Row"];
      };
      approve_order_draft: {
        Args: { p_order_id: string; p_actor_id: string };
        Returns: Database["public"]["Tables"]["orders"]["Row"];
      };
      request_order_revision: {
        Args: { p_order_id: string; p_actor_id: string; p_note?: string | null };
        Returns: Database["public"]["Tables"]["orders"]["Row"];
      };
      deliver_order: {
        Args: { p_order_id: string; p_actor_id: string; p_asset?: Record<string, unknown> | null };
        Returns: Database["public"]["Tables"]["orders"]["Row"];
      };
      confirm_order_received: {
        Args: {
          p_order_id: string;
          p_actor_id?: string | null;
          p_is_system?: boolean | null;
          p_hold_days?: number | null;
        };
        Returns: Database["public"]["Tables"]["orders"]["Row"];
      };
      attach_order_book: {
        Args: { p_order_id: string; p_actor_id: string; p_book_id: string };
        Returns: Database["public"]["Tables"]["orders"]["Row"];
      };
      request_order_file: {
        Args: { p_order_id: string; p_actor_id: string };
        Returns: Database["public"]["Tables"]["order_file_requests"]["Row"];
      };
      resolve_order_file_request: {
        Args: { p_request_id: string; p_actor_id: string; p_agree: boolean };
        Returns: Database["public"]["Tables"]["order_file_requests"]["Row"];
      };
      calculate_refund: {
        Args: { p_order_id: string; p_cancelled_by: "buyer" | "seller" };
        Returns: {
          stage: string | null;
          pct: number;
          refund_amount: number;
          seller_amount: number;
          cancelled_by: string;
          // true = số này lấy từ bảng % sàn của Nền tảng (seller chưa tự
          // khai đủ cho mốc/vai trò này) — xem
          // migrations/20260901_add_order_refund_minimum_table.sql.
          used_platform_minimum: boolean;
        };
      };
      request_order_cancel: {
        Args: { p_order_id: string; p_actor_id: string };
        Returns: Database["public"]["Tables"]["order_cancel_requests"]["Row"];
      };
      resolve_order_cancel_request: {
        Args: { p_request_id: string; p_actor_id: string; p_agree: boolean };
        Returns: Database["public"]["Tables"]["orders"]["Row"];
      };
      record_order_reminder: {
        Args: { p_order_id: string; p_actor_id: string; p_target_user_id: string };
        Returns: Database["public"]["Tables"]["order_events"]["Row"];
      };
      record_lost_contact_report: {
        Args: { p_order_id: string; p_actor_id: string };
        Returns: Database["public"]["Tables"]["order_events"]["Row"];
      };
      initiate_author_name_agreement: {
        Args: {
          p_order_id: string;
          p_actor_id: string;
          p_choice: "customer_name" | "co_authorship";
          p_ghostwriter_sample_visible?: boolean | null;
          p_customer_profile_visible?: boolean | null;
        };
        Returns: Database["public"]["Tables"]["author_name_agreements"]["Row"];
      };
      confirm_author_name_agreement: {
        Args: { p_agreement_id: string; p_actor_id: string };
        Returns: Database["public"]["Tables"]["author_name_agreements"]["Row"];
      };
      recalculate_trust_score: {
        Args: { p_user_id: string };
        Returns: Database["public"]["Tables"]["profiles"]["Row"];
      };
      open_dispute: {
        Args: { p_order_id: string; p_reporter_id: string; p_reason_category: string; p_description: string };
        Returns: Database["public"]["Tables"]["disputes"]["Row"];
      };
      resolve_dispute: {
        Args: {
          p_dispute_id: string;
          p_admin_id: string;
          p_resolution_note: string;
          p_at_fault_user_id?: string | null;
          p_resume_status?: OrderStatus | null;
          p_refund_amount?: number | null;
        };
        Returns: Database["public"]["Tables"]["disputes"]["Row"];
      };
    };
  };
};