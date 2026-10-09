"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChapterEditor, type SaveStatus } from "@/components/author/chapter-editor";
import { useTextHistory } from "@/components/author/use-text-history";
import { clearChapterDraft, readChapterDraft, writeChapterDraft, type ChapterDraft } from "@/lib/authoring/chapter-draft";
import { TermManagerModal, type QuickAddKind } from "@/components/author/quick-insert";
import { useWritingGoal } from "@/components/author/writing-goal-card";
import { Button, Modal } from "@/components/ui";
import type { FlagMatch } from "@/lib/authoring/flag-terms";
import { buildQuickItems, bumpQuickUsage, readQuickUsage, type QuickUsage, type StoryTerm } from "@/lib/story-terms";
import { PublishPanel } from "@/components/author/publish-panel";
import { RequiredAgreementsModal } from "@/components/author/required-agreements-modal";
import { ChapterCharactersPanel } from "@/components/author/chapter-characters-panel";
import { ChapterBackgroundPanel } from "@/components/author/chapter-background-panel";
import { ChapterNotesPanel } from "@/components/author/chapter-notes-panel";
import type { ManagedCharacter } from "@/components/author/character-manager";
import { isExclusivityLocked } from "@/lib/authoring/exclusivity-lock";
import type { BookGenre } from "@/lib/supabase/types";
import type { AgeRating } from "@/lib/age-rating";
import type { AudioTrack } from "@/lib/audio/get-audio-catalog";

export type WorkspaceChapter = {
  id: string;
  title: string;
  content: string;
  published: boolean;
  price: number;
  // Link audio đơn giản do tác giả tự dán + giá riêng — tách biệt cơ chế
  // chapter_audio_links/audio_narrations (ChapterAudioPanel/linkedAudio bên
  // dưới). Xem migrations/archive/20260909_add_chapter_audio_url_and_price.sql.
  audio_url: string | null;
  audio_price: number;
  is_last_chapter: boolean;
  /** Public URL (đã resolve từ background_image_path ở page.tsx). */
  background_url: string | null;
  /** chapters.content_version — gửi kèm mỗi lần lưu để phát hiện xung đột. */
  content_version: number;
};

/** Nháp (chưa xuất bản) tự lưu lên máy chủ sau khoảng lặng này. */
const AUTOSAVE_MS = 3000;
const AUTOSAVE_RETRY_MS = 15000;
const LOCAL_DRAFT_MS = 800;
type ServerCopy = { title: string; content: string; version: number };
const timeLabel = (d: Date | number) => new Date(d).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

type AuthorWorkspaceProps = {
  bookId: string;
  bookTitle: string;
  bookSynopsis: string | null;
  bookGenre: BookGenre | null;
  bookTags: string[];
  bookAgeRating: AgeRating;
  bookContentWarnings: string[];
  /** Admin đã khoá nhãn độ tuổi — tác giả chỉ xem, không sửa. */
  bookAgeRatingLocked: boolean;
  bookSlug: string;
  bookPublished: boolean;
  // Độc quyền giờ ở cấp TRUYỆN (books.is_exclusive), không phải chương —
  // xem migrations/archive/20260826_add_book_exclusivity.sql.
  bookIsExclusive: boolean;
  bookPublishedAt: string | null;
  chapter: WorkspaceChapter;
  linkedAudio: AudioTrack[];
  bookCharacters: ManagedCharacter[];
  /** Địa danh / vật phẩm / … cho "Nhập nhanh" (story_terms). */
  storyTerms: StoryTerm[];
  initialTaggedCharacterIds: string[];
  /** Truyện đang dự thi: khoá giá chương (D8) / tắt độc quyền (D11). */
  contestLock?: { prices: string | null; exclusive: string | null };
};

/**
 * ChapterEditor (tiêu đề/nội dung chương) và PublishPanel (độc quyền/giá/
 * thể loại/nút lưu) cùng sửa 1 chương, nhưng là 2 Client Component tách
 * biệt (author/[bookId]/[chapterId]/page.tsx là Server Component, không
 * giữ được useState) — wrapper mỏng này giữ state chung, 2 component con
 * chỉ còn là UI thuần nhận props, không tự useState nội dung chương nữa.
 *
 * Lưu nội dung (title + content):
 *   - Luôn giữ bản nháp trên máy (localStorage, chapter-draft.ts) khi có thay
 *     đổi chưa lưu; mở lại trang thì hỏi khôi phục.
 *   - Chương NHÁP tự lưu lên máy chủ sau AUTOSAVE_MS không gõ. Chương ĐANG
 *     ĐĂNG không tự lưu — sửa xong bấm "Cập nhật" (tránh độc giả thấy bản
 *     viết dở); bản sửa vẫn được giữ trên máy.
 *   - Mỗi lần lưu gửi expected_version; máy chủ trả 409 kèm bản của nó nếu
 *     tab/thiết bị khác đã lưu trước → tác giả chọn giữ bản nào.
 */
export function AuthorWorkspace({
  bookId,
  bookTitle: initialBookTitle,
  bookSynopsis,
  bookGenre,
  bookTags,
  bookAgeRating,
  bookContentWarnings,
  bookAgeRatingLocked,
  bookSlug,
  bookPublished,
  bookIsExclusive,
  bookPublishedAt,
  chapter,
  linkedAudio,
  bookCharacters,
  storyTerms,
  initialTaggedCharacterIds,
  contestLock,
}: AuthorWorkspaceProps) {
  const router = useRouter();
  const savedBookTitle = useRef(initialBookTitle);
  const [taggedCount, setTaggedCount] = useState(initialTaggedCharacterIds.length);
  const [bookTitle, setBookTitle] = useState(initialBookTitle);
  const [synopsis, setSynopsis] = useState(bookSynopsis ?? "");
  // Server truyền trạng thái published của SÁCH lúc trang tải — chương
  // đầu tiên xuất bản thành công (nhánh dưới) khiến sách chuyển public
  // (xem src/app/api/authoring/chapters/[chapterId]/route.ts), nhưng
  // client không tự biết trừ khi cập nhật state này ngay lúc đó.
  const [isBookPublished, setIsBookPublished] = useState(bookPublished);
  const [title, setTitle] = useState(chapter.title);
  const history = useTextHistory(chapter.content);
  const content = history.value;
  // Bản đã nằm trên máy chủ — dirty = khác bản này.
  const [saved, setSaved] = useState<ServerCopy>({ title: chapter.title, content: chapter.content, version: chapter.content_version });
  const [conflict, setConflict] = useState<ServerCopy | null>(null);
  const [draftOffer, setDraftOffer] = useState<ChapterDraft | null>(null);
  const [draftChecked, setDraftChecked] = useState(false);
  const [autosaveError, setAutosaveError] = useState(false);
  const saveLock = useRef(false);
  // "Nhập nhanh" — tên mới thêm từ trình soạn thảo cập nhật ngay danh sách chip.
  const [quickCharacters, setQuickCharacters] = useState(bookCharacters);
  const [terms, setTerms] = useState(storyTerms);
  const [usage, setUsage] = useState<QuickUsage>({});
  const [termManagerOpen, setTermManagerOpen] = useState(false);
  const writingGoal = useWritingGoal();
  const notebookProps = useMemo(
    () => ({ characters: quickCharacters, terms, onManageTerms: () => setTermManagerOpen(true) }),
    [quickCharacters, terms]
  );
  const quickItems = useMemo(() => buildQuickItems(quickCharacters, terms, usage), [quickCharacters, terms, usage]);
  const [hasBackground, setHasBackground] = useState(chapter.background_url !== null);
  const [hasNotes, setHasNotes] = useState(false);
  const [published, setPublished] = useState(chapter.published);
  const [price, setPrice] = useState(chapter.price);
  const [audioUrl, setAudioUrl] = useState(chapter.audio_url ?? "");
  const [audioPrice, setAudioPrice] = useState(chapter.audio_price);
  const [isExclusive, setIsExclusive] = useState(bookIsExclusive);
  const [exclusiveError, setExclusiveError] = useState<string | null>(null);
  const [genre, setGenre] = useState<BookGenre | null>(bookGenre);
  const [tags, setTags] = useState<string[]>(bookTags);
  const [ageRating, setAgeRating] = useState(() => ({ rating: bookAgeRating, warnings: bookContentWarnings }));
  const [ageRatingLocked, setAgeRatingLocked] = useState(bookAgeRatingLocked);
  const [ageRatingError, setAgeRatingError] = useState<string | null>(null);
  const [isLastChapter, setIsLastChapter] = useState(chapter.is_last_chapter);
  // Đã lưu true rồi thì khoá vĩnh viễn — khớp trigger DB
  // prevent_unset_last_chapter (không cho đổi lại false).
  const [isLastChapterLocked, setIsLastChapterLocked] = useState(chapter.is_last_chapter);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const dirty = title !== saved.title || content !== saved.content;
  const [error, setError] = useState<string | null>(null);
  // Server chặn "Xuất bản" (403 kèm missingAgreementIds — xem
  // src/lib/authoring/exclusivity-agreement.ts) khi sách đang độc quyền
  // mà tác giả chưa xác nhận (hoặc xác nhận đã lỗi thời) hợp đồng liên
  // quan. Popup RequiredAgreementsModal đọc + xác nhận NGAY TẠI ĐÂY, xong
  // tự bấm lại "Xuất bản" giúp — không hiện lẫn vào `error` inline như
  // các lỗi lưu khác vì cần UI có link "Đi tới Cam kết & Thỏa thuận".
  const [missingAgreementIds, setMissingAgreementIds] = useState<string[] | null>(null);

  // Lõi lưu chung cho tự lưu và nút "Lưu nháp"/"Xuất bản". `versionOverride`
  // dùng khi tác giả chọn ghi đè sau xung đột.
  const persist = async (mode: { publish: boolean } | "autosave", versionOverride?: number) => {
    if (saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    if (mode !== "autosave") setError(null);
    // Route bỏ qua tiêu đề rỗng — giữ tiêu đề cũ trong ảnh chụp đã gửi.
    const sent = { title: title.trim() ? title : saved.title, content };
    const expected = versionOverride ?? saved.version;
    const body =
      mode === "autosave"
        ? { title: sent.title, content: sent.content, expected_version: expected }
        : {
            title: sent.title,
            content: sent.content,
            published: mode.publish,
            price,
            audio_url: audioUrl.trim(),
            audio_price: audioPrice,
            is_last_chapter: isLastChapter,
            expected_version: expected,
          };

    try {
      let res: Response;
      try {
        res = await fetch(`/api/authoring/chapters/${chapter.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch {
        if (mode === "autosave") setAutosaveError(true);
        else setError("Không thể kết nối máy chủ. Bản viết vẫn được giữ trên máy này — vui lòng thử lại.");
        return;
      }

      const data = await res.json().catch(() => null);
      if (res.status === 409 && data?.conflict) {
        setConflict(data.conflict);
        return;
      }
      if (!res.ok) {
        if (mode === "autosave") {
          setAutosaveError(true);
        } else if (Array.isArray(data?.missingAgreementIds) && data.missingAgreementIds.length > 0) {
          setMissingAgreementIds(data.missingAgreementIds);
        } else {
          setError((data && typeof data.error === "string" && data.error) || "Lưu thất bại. Vui lòng thử lại.");
        }
        return;
      }

      setSaved({ ...sent, version: typeof data?.content_version === "number" ? data.content_version : expected });
      // Số chữ hôm nay do trigger DB cộng lúc lưu — tải lại để dòng mục tiêu cập nhật.
      if (sent.content !== saved.content) void writingGoal.refresh();
      setAutosaveError(false);
      setConflict(null);
      setSavedAt(new Date());
      if (mode !== "autosave") {
        setPublished(mode.publish);
        if (mode.publish) setIsBookPublished(true);
        if (isLastChapter) setIsLastChapterLocked(true);
      }
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  // Trước khi xuất bản/cập nhật: cảnh báo (KHÔNG chặn) nếu chương có từ trong
  // danh sách content_flag_terms admin quản lý. Lỗi mạng → bỏ qua, vẫn lưu.
  const [flagWarning, setFlagWarning] = useState<FlagMatch[] | null>(null);
  const save = async (nextPublished: boolean) => {
    if (nextPublished && !saveLock.current) {
      try {
        const res = await fetch("/api/authoring/flag-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && Array.isArray(data?.matches) && data.matches.length) {
          setFlagWarning(data.matches);
          return;
        }
      } catch {
        // Chỉ là cảnh báo — không để lỗi kiểm tra chặn việc xuất bản.
      }
    }
    return persist({ publish: nextPublished });
  };

  useEffect(() => {
    const timer = setTimeout(() => setUsage(readQuickUsage(bookId)), 0);
    return () => clearTimeout(timer);
  }, [bookId]);

  // Thêm nhanh từ trình soạn thảo: nhân vật → bảng characters (riêng tư, sửa
  // đầy đủ ở trang truyện); loại khác → story_terms. Trả về lỗi để hiện tại chỗ.
  const addQuickName = async (rawName: string, kind: QuickAddKind): Promise<string | null> => {
    const name = rawName.normalize("NFC").trim().replace(/\s+/g, " ");
    if (!name) return "Vui lòng nhập tên.";
    if (quickItems.some((i) => i.text === name)) return "Tên này đã có trong nhập nhanh.";
    const url = kind === "character" ? `/api/authoring/books/${bookId}/characters` : `/api/authoring/books/${bookId}/terms`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "character" ? { name } : { name, kind }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return (data && typeof data.error === "string" && data.error) || "Không thêm được.";
      if (kind === "character") setQuickCharacters((prev) => [...prev, data.character]);
      else setTerms((prev) => [...prev, data.term]);
      return null;
    } catch {
      return "Không kết nối được máy chủ.";
    }
  };

  // Hỏi khôi phục nháp trên máy (1 lần lúc mở). setTimeout(0): đọc
  // localStorage chỉ có ở client, tránh setState đồng bộ trong effect.
  useEffect(() => {
    const timer = setTimeout(() => {
      const draft = readChapterDraft(chapter.id);
      if (draft && (draft.content !== chapter.content || draft.title !== chapter.title)) setDraftOffer(draft);
      else if (draft) clearChapterDraft(chapter.id);
      setDraftChecked(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [chapter.id, chapter.content, chapter.title]);

  // Ghi/xoá nháp trên máy theo thay đổi — chờ xong bước hỏi khôi phục để
  // không xoá mất bản nháp tác giả chưa kịp chọn.
  useEffect(() => {
    if (!draftChecked || draftOffer) return;
    const timer = setTimeout(() => {
      if (dirty) writeChapterDraft(chapter.id, { title, content, savedAt: Date.now(), baseVersion: saved.version });
      else clearChapterDraft(chapter.id);
    }, LOCAL_DRAFT_MS);
    return () => clearTimeout(timer);
  }, [draftChecked, draftOffer, dirty, title, content, saved.version, chapter.id]);

  // Tự lưu lên máy chủ — chỉ chương nháp.
  useEffect(() => {
    if (published || !dirty || conflict || draftOffer || saving) return;
    const timer = setTimeout(() => void persist("autosave"), autosaveError ? AUTOSAVE_RETRY_MS : AUTOSAVE_MS);
    return () => clearTimeout(timer);
    // persist đọc state mới nhất qua closure của lần render này.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [published, dirty, conflict, draftOffer, saving, autosaveError, title, content]);

  // Cảnh báo khi đóng/tải lại tab lúc còn thay đổi chưa lên máy chủ.
  useEffect(() => {
    if (!dirty && !saving) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, saving]);

  const restoreDraft = () => {
    if (!draftOffer) return;
    setTitle(draftOffer.title);
    history.set(draftOffer.content, { start: draftOffer.content.length, end: draftOffer.content.length }, "edit");
    setDraftOffer(null);
  };
  const discardDraft = () => {
    clearChapterDraft(chapter.id);
    setDraftOffer(null);
  };
  const keepMineAfterConflict = () => {
    if (!conflict) return;
    const version = conflict.version;
    // Ghi đè: lưu lại đúng chế độ hiện tại (nháp tự lưu / chương đang đăng bấm Cập nhật).
    void persist(published ? { publish: true } : "autosave", version);
  };
  const useServerAfterConflict = () => {
    if (!conflict) return;
    setTitle(conflict.title);
    // Đi qua lịch sử: tác giả bấm Hoàn tác là lấy lại bản của mình.
    history.set(conflict.content, { start: 0, end: 0 }, "edit");
    setSaved(conflict);
    setConflict(null);
  };

  const saveStatus: SaveStatus | null = conflict
    ? { tone: "error", label: "Xung đột phiên bản" }
    : saving
      ? { tone: "busy", label: "Đang lưu…" }
      : autosaveError && dirty
        ? { tone: "error", label: "Chưa lưu được · đã giữ trên máy" }
        : dirty && published
          ? { tone: "warn", label: "Có thay đổi chưa cập nhật" }
          : dirty
            ? { tone: "busy", label: "Chưa lưu…" }
            : savedAt
              ? { tone: "ok", label: `Đã lưu · ${timeLabel(savedAt)}` }
              : null;

  const notice = conflict ? (
    <div role="alert" className="border-b border-error-border bg-error-bg px-4 py-3 text-[13px] leading-[1.6] text-error lg:px-7">
      <p className="font-semibold">Chương đã được sửa ở tab hoặc thiết bị khác sau khi bạn mở.</p>
      <p className="text-brand-ink">Chọn bản muốn giữ. Bản của bạn vẫn được lưu trên máy này cho tới khi lưu xong.</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={keepMineAfterConflict} disabled={saving}
          className="min-h-10 rounded-lg bg-brand-navy px-3 font-semibold text-white disabled:opacity-60">
          Giữ bản của tôi (ghi đè)
        </button>
        <button type="button" onClick={useServerAfterConflict} disabled={saving}
          className="min-h-10 rounded-lg border border-border-light bg-surface px-3 font-semibold text-brand-ink disabled:opacity-60">
          Dùng bản trên máy chủ (có thể Hoàn tác)
        </button>
      </div>
    </div>
  ) : draftOffer ? (
    <div role="status" className="border-b border-cream-border bg-info-bg px-4 py-3 text-[13px] leading-[1.6] text-brand-ink lg:px-7">
      <p>
        <span className="font-semibold">Có bản viết chưa lưu trên máy này</span> (lúc {timeLabel(draftOffer.savedAt)}).
        {draftOffer.baseVersion !== chapter.content_version &&
          " Bản trên máy chủ đã thay đổi sau thời điểm đó — khôi phục sẽ thay bản hiện tại."}
      </p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={restoreDraft}
          className="min-h-10 rounded-lg bg-brand-navy px-3 font-semibold text-white">
          Khôi phục bản trên máy
        </button>
        <button type="button" onClick={discardDraft}
          className="min-h-10 rounded-lg border border-border-light bg-surface px-3 font-semibold text-brand-ink">
          Bỏ bản này
        </button>
      </div>
    </div>
  ) : null;

  // Không optimistic-rollback-lặng-lẽ như handleGenreChange/handleTagsChange
  // — đổi độc quyền có thể bị SERVER chặn (khoá 3 ngày, xem
  // migrations/archive/20260826_add_book_exclusivity.sql), nên phải chờ phản hồi
  // trước khi coi là thành công, và trả lỗi rõ nếu bị chặn.
  const handleExclusiveChange = async (nextExclusive: boolean) => {
    setExclusiveError(null);
    try {
      const res = await fetch(`/api/authoring/books/${bookId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_exclusive: nextExclusive }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setExclusiveError(
          (data && typeof data.error === "string" && data.error) || "Không đổi được. Vui lòng thử lại."
        );
        return;
      }
      setIsExclusive(nextExclusive);
    } catch {
      setExclusiveError("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
    }
  };

  // Chỉ chiều true -> false bị khoá — server (route PATCH books) là nơi
  // enforce thật; đây chỉ để disable nút + giải thích trước khi bấm,
  // tránh gửi request chắc chắn bị 403. Có thể lệch nếu vừa xuất bản
  // trong cùng phiên này (published_at server mới set chưa refetch về
  // client) — chấp nhận được, server vẫn là chốt chặn thật.
  const exclusiveLocked = isExclusivityLocked({
    isExclusive,
    published: isBookPublished,
    publishedAt: bookPublishedAt,
  });

  // PATCH 1 trường của truyện; lỗi (mạng hoặc 4xx/5xx) thì báo và trả về false
  // để nơi gọi hoàn lại giá trị cũ — trước đây lỗi bị nuốt lặng lẽ, giao
  // diện hiện giá trị chưa hề được lưu.
  const patchBook = async (body: Record<string, unknown>, failure: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/authoring/books/${bookId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return true;
      const data = await res.json().catch(() => null);
      setError((data && typeof data.error === "string" && data.error) || failure);
    } catch {
      setError(`${failure} Không kết nối được máy chủ.`);
    }
    return false;
  };

  const handleGenreChange = async (nextGenre: BookGenre) => {
    const previous = genre;
    setGenre(nextGenre);
    if (!(await patchBook({ genre: nextGenre }, "Chưa lưu được thể loại."))) setGenre(previous);
  };

  const handleBookTitleCommit = async () => {
    const trimmed = bookTitle.trim();
    if (!trimmed) {
      // Không cho lưu tên rỗng — quay lại giá trị trước đó thay vì để
      // sách không tên (title not null ở DB, PATCH rỗng cũng bị API bỏ qua).
      setBookTitle(savedBookTitle.current);
      setError("Tên truyện không được để trống.");
      return;
    }
    if (trimmed === savedBookTitle.current) return;
    setBookTitle(trimmed);
    try {
      const response = await fetch(`/api/authoring/books/${bookId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Không thể đổi tên truyện.");
      savedBookTitle.current = data.title;
      setBookTitle(data.title);
      setError(null);
      router.refresh();
    } catch (error) {
      setBookTitle(savedBookTitle.current);
      setError(error instanceof Error ? error.message : "Không thể đổi tên truyện.");
    }
  };

  const handleSynopsisCommit = async () => {
    // Khác handleBookTitleCommit — synopsis nullable ở DB (books.synopsis),
    // rỗng vẫn hợp lệ (bỏ tóm tắt), không cần rollback về giá trị cũ.
    const trimmed = synopsis.trim();
    setSynopsis(trimmed);
    // Giữ nguyên chữ trong ô khi lỗi để tác giả thử lại, không mất nội dung.
    await patchBook({ synopsis: trimmed }, "Chưa lưu được tóm tắt.");
  };

  // Khác genre/tags (lỗi mạng bỏ qua lặng lẽ): nhãn độ tuổi quyết định ai
  // được đọc, nên lỗi phải hiện ra và trả giá trị cũ — không để tác giả tưởng
  // đã lưu. Server tự nâng độ tuổi theo cảnh báo; dùng giá trị server trả về.
  const handleAgeRatingChange = async (rating: AgeRating, warnings: string[]) => {
    const previous = ageRating;
    setAgeRating({ rating, warnings });
    setAgeRatingError(null);
    try {
      const res = await fetch(`/api/authoring/books/${bookId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ age_rating: rating, content_warnings: warnings }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setAgeRating(previous);
        setAgeRatingError(data?.error ?? "Không lưu được nhãn độ tuổi. Vui lòng thử lại.");
        if (res.status === 403) setAgeRatingLocked(true);
        return;
      }
      setAgeRating({ rating: data.age_rating, warnings: data.content_warnings });
    } catch {
      setAgeRating(previous);
      setAgeRatingError("Không kết nối được máy chủ. Nhãn độ tuổi chưa được lưu.");
    }
  };

  const handleTagsChange = async (nextTags: string[]) => {
    const previous = tags;
    setTags(nextTags);
    if (!(await patchBook({ tags: nextTags }, "Chưa lưu được thẻ."))) setTags(previous);
  };

  return (
    <>
      <ChapterEditor
        bookTitle={bookTitle}
        title={title}
        onTitleChange={setTitle}
        content={content}
        onContentChange={history.set}
        onUndo={history.undo}
        onRedo={history.redo}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onSaveShortcut={() => void save(published)}
        saveStatus={saveStatus}
        notice={notice}
        quickItems={quickItems}
        dailyGoal={{ summary: writingGoal.summary, setGoal: writingGoal.setGoal }}
        chapterId={chapter.id}
        bookId={bookId}
        notebook={notebookProps}
        quickInsert={{
          onAdd: addQuickName,
          onManage: () => setTermManagerOpen(true),
          onUsed: (item) => setUsage(bumpQuickUsage(bookId, item.key)),
        }}
        isLastChapter={isLastChapter}
        onIsLastChapterToggle={() => setIsLastChapter((v) => !v)}
        isLastChapterLocked={isLastChapterLocked}
        bookSlug={bookSlug}
        bookPublished={isBookPublished}
      />
      <PublishPanel
        chapterId={chapter.id}
        linkedAudio={linkedAudio}
        published={published}
        saving={saving || conflict !== null}
        error={error}
        onSaveDraft={() => save(false)}
        onPublish={() => save(true)}
        isExclusive={isExclusive}
        onExclusiveChange={handleExclusiveChange}
        exclusiveLocked={exclusiveLocked}
        exclusiveError={exclusiveError}
        contestLock={contestLock}
        price={price}
        onPriceChange={setPrice}
        audioUrl={audioUrl}
        onAudioUrlChange={setAudioUrl}
        audioPrice={audioPrice}
        onAudioPriceChange={setAudioPrice}
        bookTitle={bookTitle}
        onBookTitleChange={setBookTitle}
        onBookTitleCommit={handleBookTitleCommit}
        synopsis={synopsis}
        onSynopsisChange={setSynopsis}
        onSynopsisCommit={handleSynopsisCommit}
        genre={genre}
        onGenreChange={handleGenreChange}
        tags={tags}
        onTagsChange={handleTagsChange}
        ageRating={ageRating.rating}
        contentWarnings={ageRating.warnings}
        onAgeRatingChange={handleAgeRatingChange}
        ageRatingLocked={ageRatingLocked}
        ageRatingError={ageRatingError}
        chapterNotes={{
          done: hasNotes,
          node: <ChapterNotesPanel chapterId={chapter.id} onHasNotes={setHasNotes} />,
        }}
        chapterBackground={{
          done: hasBackground,
          node: (
            <ChapterBackgroundPanel
              chapterId={chapter.id}
              bookSlug={bookSlug}
              chapterPublished={published}
              initialUrl={chapter.background_url}
              onChange={(url) => setHasBackground(url !== null)}
            />
          ),
        }}
        chapterCharacters={{
          done: taggedCount > 0,
          node: (
            <ChapterCharactersPanel
              bookId={bookId}
              chapterId={chapter.id}
              bookCharacters={bookCharacters}
              initialTaggedCharacterIds={initialTaggedCharacterIds}
              onTaggedChange={setTaggedCount}
            />
          ),
        }}
      />
      <Modal open={flagWarning !== null} onClose={() => setFlagWarning(null)} panelClassName="max-w-[480px] p-6">
        <h2 className="text-lg font-bold text-brand-ink">Có từ cần xem lại</h2>
        <p className="mt-1 text-[13.5px] leading-[1.6] text-stone-dark">
          Chương có các từ trong danh sách cần cân nhắc của Vịnh. Đây chỉ là nhắc nhở — bạn vẫn có thể {published ? "cập nhật" : "xuất bản"}.
          Dùng Ctrl+F trong trình soạn thảo để tìm từng chỗ.
        </p>
        <ul className="mt-3 flex max-h-[40vh] flex-col gap-1.5 overflow-y-auto text-[13.5px]">
          {flagWarning?.map((m) => (
            <li key={m.term} className="rounded-md bg-cream-card px-3 py-2">
              <span className="font-semibold text-brand-ink">{m.term}</span>
              <span className="text-stone-alt"> · {m.count} chỗ</span>
              {m.note && <p className="text-[12.5px] text-stone-dark">{m.note}</p>}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
          <Button size="sm" fullWidth={false} className="min-h-10" onClick={() => { setFlagWarning(null); void persist({ publish: true }); }}>
            Vẫn {published ? "cập nhật" : "xuất bản"}
          </Button>
          <Button size="sm" variant="ghost" fullWidth={false} className="min-h-10" onClick={() => setFlagWarning(null)}>Xem lại</Button>
        </div>
      </Modal>
      <TermManagerModal
        open={termManagerOpen}
        onClose={() => setTermManagerOpen(false)}
        bookId={bookId}
        terms={terms}
        onChange={setTerms}
      />
      {missingAgreementIds && (
        <RequiredAgreementsModal
          missingAgreementIds={missingAgreementIds}
          onClose={() => setMissingAgreementIds(null)}
          onAllAccepted={() => {
            setMissingAgreementIds(null);
            save(true);
          }}
        />
      )}
    </>
  );
}
