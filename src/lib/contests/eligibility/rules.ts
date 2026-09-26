/**
 * Bộ rule eligibility Phase 1 (mục IV.2 + XIX.2 của
 * docs/CONTEST_ENGINE_AUDIT_AND_PLAN.md). Thêm rule = thêm 1 mục vào
 * ELIGIBILITY_RULES (+ khoá cấu hình ở config.ts nếu rule cần cấu hình).
 *
 * Các rule có tranh chấp (cổng mở, sở hữu, chương có giá, độc quyền, đa
 * cuộc thi, giới hạn số bài, trùng/nộp lại, phiên bản thể lệ) được
 * submit_contest_entry() kiểm lại dưới khoá — ở đây chỉ để UI báo sớm.
 */
import { isSubmissionOpen } from "@/lib/contests/capabilities";
import type { EligibilityCheck, EligibilityRule } from "@/lib/contests/eligibility/types";

const num = (n: number) => n.toLocaleString("vi-VN");
const date = (iso: string) =>
  new Date(iso).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" });

function check(code: string, passed: boolean, message: string, details?: Record<string, unknown>): EligibilityCheck {
  return { code, passed, blocking: true, message, details };
}

/** Tuổi tròn tại `now` theo ngày sinh (YYYY-MM-DD), giờ Việt Nam. */
export function ageOn(dateOfBirth: string, now: Date): number {
  const [y, m, d] = dateOfBirth.slice(0, 10).split("-").map(Number);
  const today = now.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

export const ELIGIBILITY_RULES: EligibilityRule[] = [
  {
    code: "contest_open",
    phases: ["preview", "submit"],
    evaluate: (ctx) => {
      const open = isSubmissionOpen(ctx.contest, ctx.now);
      const notYet = ctx.now.getTime() < Date.parse(ctx.contest.submission_start) || ctx.contest.status === "announced";
      return check(
        "contest_open",
        open,
        open
          ? `Đang nhận bài đến ${date(ctx.contest.submission_end)}`
          : notYet
            ? `Cuộc thi mở nhận bài từ ${date(ctx.contest.submission_start)}`
            : "Cuộc thi đã đóng nhận bài",
        { submission_start: ctx.contest.submission_start, submission_end: ctx.contest.submission_end }
      );
    },
  },
  {
    code: "ownership",
    phases: ["preview", "submit"],
    evaluate: (ctx) =>
      check("ownership", ctx.book.author_id === ctx.viewer.userId, ctx.book.author_id === ctx.viewer.userId
        ? "Bạn là tác giả của truyện này"
        : "Bạn không phải tác giả của truyện này"),
  },
  {
    code: "email_verified",
    phases: ["preview", "submit"],
    evaluate: (ctx) =>
      ctx.rules.email_verified
        ? check("email_verified", ctx.viewer.emailVerified, ctx.viewer.emailVerified
            ? "Email đã xác minh"
            : "Cần xác minh email tài khoản trước khi dự thi")
        : null,
  },
  {
    code: "min_author_age",
    phases: ["preview", "submit"],
    evaluate: (ctx) => {
      const min = ctx.rules.min_author_age;
      if (min === null) return null;
      if (!ctx.viewer.dateOfBirth) {
        return check("min_author_age", false, `Cuộc thi dành cho tác giả từ ${min} tuổi — cập nhật ngày sinh trong Trang cá nhân để kiểm tra`, { required: min, actual: null });
      }
      const age = ageOn(ctx.viewer.dateOfBirth, ctx.now);
      return check("min_author_age", age >= min, age >= min
        ? `Đủ ${min} tuổi`
        : `Cuộc thi dành cho tác giả từ ${min} tuổi`, { required: min, actual: age });
    },
  },
  {
    code: "book_visible",
    phases: ["preview", "submit"],
    evaluate: (ctx) => {
      const visible = ctx.book.published && ctx.book.deleted_at === null;
      return check("book_visible", visible, visible
        ? "Truyện đang được xuất bản"
        : ctx.book.deleted_at !== null ? "Truyện đã bị xoá hoặc gỡ" : "Truyện chưa được xuất bản");
    },
  },
  {
    code: "min_published_chapters",
    phases: ["preview", "submit", "close"],
    evaluate: (ctx) => {
      const min = ctx.rules.min_published_chapters;
      if (min === null) return null;
      const actual = ctx.stats.published_chapter_count;
      return check("min_published_chapters", actual >= min, actual >= min
        ? `Có ${num(actual)} chương đã xuất bản`
        : `Cần ít nhất ${num(min)} chương đã xuất bản — hiện có ${num(actual)}`, { required: min, actual });
    },
  },
  {
    code: "min_words",
    phases: ["preview", "submit", "close"],
    evaluate: (ctx) => {
      const min = ctx.rules.min_words;
      if (min === null) return null;
      const actual = ctx.stats.total_words;
      return check("min_words", actual >= min, actual >= min
        ? `Hiện có ${num(actual)} chữ`
        : `Cần ít nhất ${num(min)} chữ — hiện có ${num(actual)}, thiếu ${num(min - actual)} chữ`, { required: min, actual });
    },
  },
  {
    code: "max_words",
    phases: ["preview", "submit", "close"],
    evaluate: (ctx) => {
      const max = ctx.rules.max_words;
      if (max === null) return null;
      const actual = ctx.stats.total_words;
      return check("max_words", actual <= max, actual <= max
        ? `Hiện có ${num(actual)} chữ`
        : `Tối đa ${num(max)} chữ — hiện có ${num(actual)}, vượt ${num(actual - max)} chữ`, { required: max, actual });
    },
  },
  {
    code: "allowed_genres",
    phases: ["preview", "submit"],
    evaluate: (ctx) => {
      const allowed = ctx.rules.allowed_genres;
      if (allowed === null) return null;
      const ok = ctx.book.genre !== null && allowed.includes(ctx.book.genre);
      return check("allowed_genres", ok, ok
        ? `Thể loại ${ctx.book.genre}`
        : `Cuộc thi chỉ nhận thể loại: ${allowed.join(", ")}`, { allowed, actual: ctx.book.genre });
    },
  },
  {
    code: "required_tags",
    phases: ["preview", "submit"],
    evaluate: (ctx) => {
      const required = ctx.rules.required_tags;
      if (required.length === 0) return null;
      const have = new Set(ctx.book.tags.map((x) => x.toLocaleLowerCase("vi")));
      const missing = required.filter((x) => !have.has(x.toLocaleLowerCase("vi")));
      return check("required_tags", missing.length === 0, missing.length === 0
        ? `Có đủ tag: ${required.join(", ")}`
        : `Thiếu tag: ${missing.join(", ")}`, { required, missing });
    },
  },
  {
    code: "first_published_after",
    phases: ["preview", "submit"],
    evaluate: (ctx) => {
      const after = ctx.rules.first_published_after;
      if (after === null) return null;
      const at = ctx.book.published_at;
      const ok = at !== null && Date.parse(at) >= Date.parse(after);
      return check("first_published_after", ok, at === null
        ? `Truyện phải đăng lần đầu từ ${date(after)}`
        : ok
          ? `Đăng lần đầu ${date(at)}`
          : `Truyện phải đăng lần đầu từ ${date(after)} — truyện đăng ${date(at)}`, { required: after, actual: at });
    },
  },
  {
    code: "require_exclusive",
    phases: ["preview", "submit"],
    evaluate: (ctx) => {
      if (!ctx.rules.require_exclusive) return null;
      if (!ctx.book.is_exclusive) {
        return check("require_exclusive", false, "Cuộc thi chỉ nhận truyện Độc quyền trên Vịnh — bật độc quyền cho truyện trước khi gửi");
      }
      if (!ctx.exclusivityAgreementAccepted) {
        return check("require_exclusive", false, "Cần xác nhận Chính sách độc quyền xuất bản bản mới nhất (Trang cá nhân › Cam kết & Thỏa thuận)");
      }
      return check("require_exclusive", true, "Độc quyền trên Vịnh — không tắt được cho đến khi công bố kết quả");
    },
  },
  {
    code: "not_already_entered",
    phases: ["preview", "submit"],
    evaluate: (ctx) => {
      const s = ctx.thisSubmission;
      if (s === null) return check("not_already_entered", true, "Chưa gửi vào cuộc thi này");
      if (s.status === "withdrawn") {
        return ctx.rules.allow_resubmit_after_withdraw
          ? check("not_already_entered", true, "Đã rút bài — cuộc thi cho phép gửi lại")
          : check("not_already_entered", false, "Đã rút bài — cuộc thi không cho phép gửi lại");
      }
      return check("not_already_entered", false, "Tác phẩm đã dự thi cuộc thi này", { status: s.status });
    },
  },
  {
    code: "max_entries_per_author",
    phases: ["preview", "submit"],
    evaluate: (ctx) => {
      const max = ctx.rules.max_entries_per_author;
      if (max === null) return null;
      const used = ctx.authorOtherActiveEntries;
      return check("max_entries_per_author", used < max, used < max
        ? `Mỗi tác giả gửi tối đa ${num(max)} tác phẩm — bạn đã gửi ${num(used)}`
        : `Mỗi tác giả gửi tối đa ${num(max)} tác phẩm — bạn đã gửi đủ`, { required: max, actual: used });
    },
  },
  {
    code: "multi_contest",
    phases: ["preview", "submit"],
    evaluate: (ctx) => {
      if (ctx.otherActiveEntries.length === 0) return null;
      if (!ctx.rules.allow_multi_contest) {
        return check("multi_contest", false, `Cuộc thi này chỉ nhận tác phẩm không dự cuộc thi khác — truyện đang dự ${ctx.otherActiveEntries.map((e) => e.contest_title).join(", ")}`);
      }
      const blocker = ctx.otherActiveEntries.find((e) => !e.allow_multi_contest);
      return blocker
        ? check("multi_contest", false, `Truyện đang dự "${blocker.contest_title}" — cuộc thi đó yêu cầu chỉ dự một cuộc thi`, { contest_id: blocker.contest_id })
        : check("multi_contest", true, "Được dự cùng lúc với cuộc thi khác");
    },
  },
  {
    code: "no_prior_entries",
    phases: ["preview", "submit"],
    evaluate: (ctx) =>
      ctx.rules.no_prior_entries
        ? check("no_prior_entries", ctx.priorFinishedEntries === 0, ctx.priorFinishedEntries === 0
            ? "Chưa từng dự cuộc thi khác"
            : "Cuộc thi chỉ nhận tác phẩm chưa từng dự cuộc thi nào")
        : null,
  },
  {
    code: "no_prior_awards",
    phases: ["preview", "submit"],
    evaluate: (ctx) =>
      ctx.rules.no_prior_awards
        ? check("no_prior_awards", ctx.priorAwards === 0, ctx.priorAwards === 0
            ? "Không tìm thấy giải thưởng liên kết"
            : "Cuộc thi chỉ nhận tác phẩm chưa từng đạt giải")
        : null,
  },
  {
    code: "no_paid_chapters",
    phases: ["preview", "submit"],
    evaluate: (ctx) => {
      const paid = ctx.stats.priced_chapter_count;
      return check("no_paid_chapters", paid === 0, paid === 0
        ? "Mọi chương đều miễn phí"
        : `Có ${num(paid)} chương đang thu phí (đọc hoặc audio) — chuyển miễn phí trước khi gửi. Truyện dự thi miễn phí cho mọi người đọc đến khi công bố kết quả`, { actual: paid });
    },
  },
  {
    code: "rules_accepted",
    phases: ["submit"],
    evaluate: (ctx) => {
      const ok = ctx.acceptedRulesVersion === ctx.contest.rules_version;
      return check("rules_accepted", ok, ok ? "Đã đồng ý thể lệ" : "Cần đọc và đồng ý thể lệ cuộc thi", {
        required: ctx.contest.rules_version,
        actual: ctx.acceptedRulesVersion,
      });
    },
  },
];
