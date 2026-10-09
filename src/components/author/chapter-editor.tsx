"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowSquareOutIcon,
  ArrowsInIcon,
  ArrowsOutIcon,
  BookOpenTextIcon,
  ClockCounterClockwiseIcon,
  SlidersHorizontalIcon,
  TextAaIcon,
  KeyboardIcon,
  MagicWandIcon,
  MagnifyingGlassIcon,
  ArrowUUpLeftIcon,
  ArrowUUpRightIcon,
  CaretRightIcon,
  CloudCheckIcon,
  CloudArrowUpIcon,
  WarningCircleIcon,
  QuotesIcon,
  MinusIcon,
  TextHTwoIcon,
  ImageSquareIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button, Checkbox, Field } from "@/components/ui";
import { isDesignShareLinkShape } from "@/lib/design/share-link";
import type { ChangeKind, HistoryEntry, Selection } from "@/lib/authoring/text-history";
import { suggestAt, type QuickItem, type Suggestion } from "@/lib/story-terms";
import { QuickInsertBar, type QuickAddKind } from "@/components/author/quick-insert";
import {
  FindReplacePanel, INITIAL_FIND, ShortcutHelp, TidyPanel, ToolbarCustomizer, WordGoal, type FindState,
} from "@/components/author/editor-tools";
import { findMatches, replaceMatches } from "@/lib/authoring/find-replace";
import { tidyChapterText } from "@/lib/authoring/tidy-text";
import {
  DEFAULT_TOOLBAR, readToolbarPrefs, TOOLBAR_ITEMS, TOOLBAR_LABEL, visibleItems, writeToolbarPrefs,
  type ToolbarItemId, type ToolbarPrefs,
} from "@/lib/authoring/toolbar-prefs";
import type { WritingGoalSummary } from "@/lib/authoring/writing-goal";
import { namesFrom, type NameIssue } from "@/lib/authoring/name-check";
import type { StoryTerm } from "@/lib/story-terms";
import type { ManagedCharacter } from "@/components/author/character-manager";
import { NameCheckPanel, StoryNotebook, VersionHistoryModal } from "@/components/author/story-notebook";

const countWords = (text: string) => (text.trim().match(/\S+/g) ?? []).length;

/** Khoảng cách từ mép trên textarea tới dòng chứa vị trí `index` (đo bằng 1 bản sao ẩn). */
function caretOffsetTop(el: HTMLTextAreaElement, index: number) {
  const cs = getComputedStyle(el);
  const mirror = document.createElement("div");
  const copy = ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "wordSpacing", "paddingTop",
    "paddingLeft", "paddingRight", "borderTopWidth", "borderLeftWidth", "borderRightWidth", "boxSizing"] as const;
  for (const prop of copy) mirror.style[prop] = cs[prop];
  Object.assign(mirror.style, { position: "absolute", visibility: "hidden", top: "0", left: "-9999px",
    whiteSpace: "pre-wrap", overflowWrap: "break-word", width: `${el.offsetWidth}px` });
  mirror.textContent = el.value.slice(0, index);
  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const top = marker.offsetTop;
  mirror.remove();
  return top;
}

export type SaveStatus = { tone: "ok" | "busy" | "warn" | "error"; label: string };
const HEADING_PREFIX = /^#{1,3}\s+/;
const QUOTE_PREFIX = /^>\s?/;

/**
 * Tìm [start, end) của đúng 1 "block/đoạn" (đơn vị `\n\n`-split, khớp
 * reader.tsx) chứa vị trí `pos` trong `content` — dùng ở handleContentPaste
 * bên dưới để biết có đang dán vào 1 đoạn TRỐNG không. indexOf/lastIndexOf("\n\n", ...)
 * trực tiếp trên chuỗi thô KHÔNG dùng được ở đây: 1 đoạn trống nằm GIỮA 2
 * đoạn khác tạo ra 4 dấu \n liên tiếp ("A" + "\n\n" + "" + "\n\n" + "B"),
 * mà "\n\n" khớp CHỒNG LẤP ở nhiều vị trí trong 1 dãy \n dài (cả vị trí La
 * và La+1 đều khớp "\n\n" trong dãy 4 dấu \n đó), khiến lastIndexOf/indexOf
 * lệch mất 1 ký tự. split("\n\n") không có nhập nhằng này — chỉ khớp
 * không-chồng-lấp, trái sang phải — nên dùng nó làm nguồn sự thật duy nhất,
 * đứng module-scope vì hàm thuần, không đụng gì tới state/props.
 */
function findParagraphRange(content: string, pos: number): { start: number; end: number } {
  const paragraphs = content.split("\n\n");
  let offset = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const start = offset;
    const end = start + paragraphs[i].length;
    if (pos <= end || i === paragraphs.length - 1) return { start, end };
    offset = end + 2;
  }
  return { start: 0, end: 0 };
}

type ChapterEditorProps = {
  bookTitle: string;
  title: string;
  onTitleChange: (title: string) => void;
  content: string;
  /** selection = vị trí con trỏ SAU thay đổi (để undo/redo đặt lại);
   * kind "type" = gõ phím (gộp thành 1 bước undo), "edit" = thao tác khác. */
  onContentChange: (content: string, selection?: Selection, kind?: ChangeKind) => void;
  onUndo: () => HistoryEntry | null;
  onRedo: () => HistoryEntry | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Ctrl/Cmd+S. */
  onSaveShortcut?: () => void;
  saveStatus: SaveStatus | null;
  /** Thông báo phục hồi nháp / xung đột phiên bản, hiện ngay dưới thanh trên cùng. */
  notice?: ReactNode;
  /** Có ở trang sửa chương (không có ở màn tạo truyện mới): lịch sử phiên bản, kiểm tra cả truyện. */
  chapterId?: string;
  bookId?: string;
  /** Sổ tay truyện + nguồn tên cho "Kiểm tra tên riêng". */
  notebook?: { characters: ManagedCharacter[]; terms: StoryTerm[]; onManageTerms: () => void };
  /** Mục tiêu viết mỗi ngày (không truyền ở màn tạo truyện mới). */
  dailyGoal?: { summary: WritingGoalSummary | null; setGoal: (n: number | null) => Promise<boolean> };
  /** "Nhập nhanh": tên nhân vật + địa danh/thuật ngữ (src/lib/story-terms.ts). */
  quickItems?: QuickItem[];
  /** Không truyền ở màn tạo truyện mới — chưa có truyện để lưu tên. */
  quickInsert?: {
    onAdd: (name: string, kind: QuickAddKind) => Promise<string | null>;
    onManage: () => void;
    onUsed: (item: QuickItem) => void;
  };
  isLastChapter: boolean;
  onIsLastChapterToggle: () => void;
  /** true nếu chương này đã từng lưu is_last_chapter=true — checkbox
   * khoá lại vĩnh viễn từ đây (không unlock được, khớp trigger DB
   * prevent_unset_last_chapter). */
  isLastChapterLocked: boolean;
  bookSlug: string;
  /** true = sách đã có ít nhất 1 chương từng xuất bản — /truyen/[slug]
   * chỉ tồn tại từ lúc đó, nên link "Xem trang truyện" chỉ hiện khi true. */
  bookPublished: boolean;
};

/**
 * Toolbar B/I/H2/quote/ngắt cảnh ghi ký hiệu vào content (text thuần);
 * trang đọc hiển thị đúng định dạng qua src/lib/reading/chapter-format.ts —
 * thêm ký hiệu mới thì sửa CẢ hai nơi. Tiêu đề/trích dẫn áp cho cả ĐOẠN
 * (khối tách bằng dòng trống) vì trang đọc xét định dạng theo đoạn.
 *
 * Undo/redo do trình soạn thảo tự giữ (use-text-history.ts): textarea bị
 * React điều khiển và toolbar ghi đè value nên undo gốc của trình duyệt
 * không dùng được — Ctrl/Cmd+Z, Ctrl+Shift+Z/Ctrl+Y và lệnh undo của hệ
 * điều hành (beforeinput historyUndo) đều đi qua lịch sử riêng.
 */
export function ChapterEditor({
  bookTitle,
  title,
  onTitleChange,
  content,
  onContentChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onSaveShortcut,
  saveStatus,
  notice,
  quickItems = [],
  quickInsert,
  dailyGoal,
  chapterId,
  bookId,
  notebook,
  isLastChapter,
  onIsLastChapterToggle,
  isLastChapterLocked,
  bookSlug,
  bookPublished,
}: ChapterEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [imagePromptOpen, setImagePromptOpen] = useState(false);
  const [imageLinkInput, setImageLinkInput] = useState("");
  const [imageLinkPending, setImageLinkPending] = useState(false);
  const [imageLinkError, setImageLinkError] = useState<string | null>(null);

  // Ô nội dung giãn theo độ dài chương (không cuộn bên trong 1 khung cố
  // định) — tối thiểu bằng phần còn trống của cột (textarea flex-1, cột
  // editor cao bằng sidebar PublishPanel nhờ grid stretch), dài hơn thì
  // đẩy cả cột/trang dài ra. minHeight (không phải height) vì height bị
  // flex-1 bỏ qua. Reset về "" (min-h-[460px] gốc) trước khi đo để co lại
  // được khi xoá bớt chữ; giữ nguyên vị trí cuộn vì lúc reset trang co tạm
  // thời, trình duyệt có thể kéo scroll lên.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const fit = () => {
      const scroller = el.closest<HTMLElement>("[data-editor-scroll]");
      const scrollerTop = scroller?.scrollTop ?? 0;
      const windowY = window.scrollY;
      el.style.minHeight = "";
      el.style.minHeight = `${el.scrollHeight}px`;
      if (scroller) scroller.scrollTop = scrollerTop;
      window.scrollTo({ top: windowY });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [content]);

  const words = countWords(content);
  const readMin = Math.max(1, Math.round(words / 200));
  const [startWords] = useState(() => countWords(content));

  // Công cụ phụ dưới thanh toolbar: tìm/thay thế, chỉnh định dạng, phím tắt.
  const [tool, setTool] = useState<null | "find" | "tidy" | "keys" | "names" | "toolbar">(null);
  const [toolbarPrefs, setToolbarPrefs] = useState<ToolbarPrefs>(DEFAULT_TOOLBAR);
  useEffect(() => {
    const timer = setTimeout(() => setToolbarPrefs(readToolbarPrefs()), 0);
    return () => clearTimeout(timer);
  }, []);
  const [toolNotice, setToolNotice] = useState<string | null>(null);
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const names = useMemo(() => (notebook ? namesFrom(notebook.characters, notebook.terms) : []), [notebook]);
  const [find, setFind] = useState<FindState>(INITIAL_FIND);
  const [findMessage, setFindMessage] = useState<string | null>(null);
  const matches = useMemo(
    () => (tool === "find" && find.query ? findMatches(content, find.query, find.options) : []),
    [tool, find.query, find.options, content]
  );
  const current = matches.length ? Math.min(find.current, matches.length - 1) : 0;
  const currentMarkRef = useRef<HTMLElement | null>(null);
  // Cuộn tới kết quả khi đổi kết quả/từ khoá — không theo từng phím gõ trong bài.
  const hasMatches = matches.length > 0;
  useEffect(() => {
    if (tool === "find" && hasMatches) currentMarkRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [tool, current, hasMatches, find.query, find.options]);

  // Chế độ tập trung: phủ toàn màn hình, ẩn panel bên, dòng đang gõ ở giữa.
  const [focusMode, setFocusMode] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusMode) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [focusMode]);
  useEffect(() => {
    const el = textareaRef.current, scroller = scrollerRef.current;
    if (!focusMode || !el || !scroller || document.activeElement !== el) return;
    const frame = requestAnimationFrame(() => {
      const caretY = el.getBoundingClientRect().top + caretOffsetTop(el, el.selectionStart);
      const target = scroller.getBoundingClientRect().top + scroller.clientHeight * 0.45;
      scroller.scrollTop += caretY - target;
    });
    return () => cancelAnimationFrame(frame);
  }, [content, focusMode]);

  const wrapSelection = (marker: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd } = el;
    const selected = content.slice(selectionStart, selectionEnd);
    const next =
      content.slice(0, selectionStart) + marker + selected + marker + content.slice(selectionEnd);
    const selection = { start: selectionStart + marker.length, end: selectionStart + marker.length + selected.length };
    onContentChange(next, selection, "edit");
    placeCursor(selection);
  };

  const placeCursor = (selection: Selection) => {
    const el = textareaRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selection.start, selection.end);
    });
  };

  // Bật/tắt tiêu đề hoặc trích dẫn cho cả đoạn chứa con trỏ.
  const toggleBlock = (kind: "heading" | "quote") => {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd } = el;
    const { start, end } = findParagraphRange(content, selectionStart);
    const block = content.slice(start, end);
    let nextBlock: string;
    if (kind === "heading") {
      nextBlock = HEADING_PREFIX.test(block) ? block.replace(HEADING_PREFIX, "") : `## ${block.replace(/\n+/g, " ")}`;
    } else {
      const lines = block.split("\n");
      const quoted = block.trim() !== "" && lines.filter((l) => l.trim()).every((l) => QUOTE_PREFIX.test(l));
      nextBlock = lines.map((l) => (quoted ? l.replace(QUOTE_PREFIX, "") : `> ${l}`)).join("\n");
    }
    const delta = nextBlock.length - block.length;
    const shift = (pos: number) => Math.max(start, Math.min(start + nextBlock.length, pos + delta));
    const selection = { start: shift(selectionStart), end: shift(selectionEnd) };
    onContentChange(content.slice(0, start) + nextBlock + content.slice(end), selection, "edit");
    placeCursor(selection);
  };

  const insertDivider = () => {
    const el = textareaRef.current;
    const pos = el?.selectionStart ?? content.length;
    const selection = { start: pos + 7, end: pos + 7 };
    onContentChange(`${content.slice(0, pos)}\n\n***\n\n${content.slice(pos)}`, selection, "edit");
    placeCursor(selection);
  };

  const applyHistory = (entry: HistoryEntry | null) => {
    if (entry) placeCursor(entry.selection);
  };

  // Chèn tại con trỏ (thay vùng đang chọn); có `close` thì bọc vùng chọn.
  const insertAtCursor = (open: string, close = "") => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? content.length;
    const end = el?.selectionEnd ?? start;
    const selected = close ? content.slice(start, end) : "";
    const caretAt = start + open.length + selected.length;
    const selection = close && selected ? { start: start + open.length, end: caretAt } : { start: caretAt, end: caretAt };
    onContentChange(content.slice(0, start) + open + selected + close + content.slice(end), selection, "edit");
    placeCursor(selection);
  };
  const insertQuickItem = (item: QuickItem) => {
    insertAtCursor(item.text);
    quickInsert?.onUsed(item);
  };

  // Gợi ý tên theo chữ ngay trước con trỏ; Esc ẩn cho tới lần sửa tiếp theo.
  const [caret, setCaret] = useState<number | null>(null);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const suggestions = useMemo(
    () => (caret === null || dismissedFor === content ? [] : suggestAt(content, caret, quickItems)),
    [caret, content, quickItems, dismissedFor]
  );
  const trackCaret = (el: HTMLTextAreaElement) => setCaret(el.selectionStart === el.selectionEnd ? el.selectionStart : null);
  const acceptSuggestion = (s: Suggestion) => {
    if (caret === null) return;
    const after = s.replaceFrom + s.item.text.length;
    onContentChange(content.slice(0, s.replaceFrom) + s.item.text + content.slice(caret), { start: after, end: after }, "edit");
    setCaret(after);
    placeCursor({ start: after, end: after });
    quickInsert?.onUsed(s.item);
  };

  const openFind = (withReplace: boolean) => {
    const el = textareaRef.current;
    const selected = el ? content.slice(el.selectionStart, el.selectionEnd) : "";
    setFind((f) => ({
      ...f,
      query: selected && selected.length <= 100 && !selected.includes("\n") ? selected : f.query,
      showReplace: withReplace || f.showReplace,
      current: 0,
    }));
    setFindMessage(null);
    setTool("find");
  };
  const closeTool = () => {
    const m = tool === "find" ? matches[current] : undefined;
    setTool(null);
    if (m) placeCursor({ start: m.start, end: m.end });
    else textareaRef.current?.focus();
  };
  const replaceCurrent = () => {
    const m = matches[current];
    if (!m) return;
    const end = m.start + find.replacement.length;
    onContentChange(content.slice(0, m.start) + find.replacement + content.slice(m.end), { start: m.start, end }, "edit");
    setFindMessage(null);
  };
  const replaceAll = () => {
    if (!matches.length) return;
    onContentChange(replaceMatches(content, matches, find.replacement), { start: 0, end: 0 }, "edit");
    setFindMessage(`Đã thay ${matches.length.toLocaleString("vi-VN")} chỗ. Bấm Hoàn tác nếu muốn trả lại.`);
  };
  // "Xem" ở kiểm tra tên: mở Tìm với đúng cách viết sai, khớp chính xác.
  const showNameIssue = (issue: NameIssue) => {
    setFind((f) => ({
      ...f, query: issue.found, current: 0, showReplace: true, replacement: issue.expected,
      options: { matchCase: true, matchDiacritics: true, wholeWord: true },
    }));
    setFindMessage(null);
    setTool("find");
  };
  const applyTidy = (linesAsParagraphs: boolean) => {
    const result = tidyChapterText(content, { linesAsParagraphs });
    if (!result.changed) return "Văn bản đã gọn, không có gì cần chỉnh.";
    onContentChange(result.text, { start: 0, end: 0 }, "edit");
    return "Đã chỉnh. Bấm Hoàn tác nếu muốn trả lại.";
  };
  // Phím tắt cấp trình soạn thảo — chỉ khi con trỏ đang trong khung soạn
  // thảo, nên Ctrl+F ở chỗ khác trên trang vẫn là tìm của trình duyệt.
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
    const key = e.key.toLowerCase();
    if (mod && key === "f" && e.shiftKey) {
      e.preventDefault();
      setFocusMode((v) => !v);
    } else if (mod && (key === "f" || key === "h") && !e.shiftKey) {
      e.preventDefault();
      openFind(key === "h");
    } else if (e.key === "Escape" && !e.defaultPrevented && focusMode && tool === null) {
      setFocusMode(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        acceptSuggestion(suggestions[0]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDismissedFor(content);
        return;
      }
    }
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === "z" && !e.shiftKey) {
      e.preventDefault();
      applyHistory(onUndo());
    } else if ((key === "z" && e.shiftKey) || key === "y") {
      e.preventDefault();
      applyHistory(onRedo());
    } else if (key === "b") {
      e.preventDefault();
      wrapSelection("**");
    } else if (key === "i") {
      e.preventDefault();
      wrapSelection("*");
    } else if (key === "s") {
      e.preventDefault();
      onSaveShortcut?.();
    }
  };

  // Lệnh "Hoàn tác" của menu trình duyệt / bàn phím ảo không đi qua keydown.
  const historyHandlers = useRef({ onUndo, onRedo });
  useEffect(() => {
    historyHandlers.current = { onUndo, onRedo };
  });
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const onBeforeInput = (e: InputEvent) => {
      if (e.inputType !== "historyUndo" && e.inputType !== "historyRedo") return;
      e.preventDefault();
      const entry = e.inputType === "historyUndo" ? historyHandlers.current.onUndo() : historyHandlers.current.onRedo();
      if (entry) requestAnimationFrame(() => el.setSelectionRange(entry.selection.start, entry.selection.end));
    };
    el.addEventListener("beforeinput", onBeforeInput);
    return () => el.removeEventListener("beforeinput", onBeforeInput);
  }, []);

  // "Chèn ảnh thiết kế" — validate link chia sẻ (POST /api/design/resolve-link)
  // TRƯỚC khi chèn, rồi chèn marker `[[thiet-ke:<id>]]`, KHÔNG PHẢI url gốc.
  // Lý do bắt buộc: url gốc mang share_token (bí mật) trong query string —
  // chapters.content là text thô, hiện thẳng ra page source cho mọi độc giả
  // (xem reader.tsx) nên không bao giờ được lưu token vào đó. reader.tsx tự
  // resolve lại id → ảnh qua public_design_items (view công khai, không cần
  // token) lúc hiển thị.
  const insertDesignImage = async () => {
    const shareUrl = imageLinkInput.trim();
    if (!shareUrl) {
      setImageLinkError("Vui lòng dán link chia sẻ.");
      return;
    }
    setImageLinkPending(true);
    setImageLinkError(null);
    const res = await fetch("/api/design/resolve-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareUrl }),
    });
    const data = await res.json().catch(() => null);
    setImageLinkPending(false);
    if (!res.ok) {
      setImageLinkError((data && data.error) || "Link không hợp lệ.");
      return;
    }
    const el = textareaRef.current;
    const pos = el?.selectionStart ?? content.length;
    const inserted = `\n\n[[thiet-ke:${data.designItemId}]]\n\n`;
    const after = pos + inserted.length;
    onContentChange(`${content.slice(0, pos)}${inserted}${content.slice(pos)}`, { start: after, end: after }, "edit");
    setImageLinkInput("");
    setImagePromptOpen(false);
  };

  // Tự "chữa" link chia sẻ thiết kế còn nằm thô trong content ĐÃ LƯU từ
  // trước (ví dụ dán bằng cách không bắn event `paste` — kéo-thả, hoặc
  // trước khi handleContentPaste dưới đây tồn tại) — quét theo BLOCK
  // (`\n\n`, khớp đúng đơn vị "đoạn/paragraph" mà reader.tsx dùng để nhận
  // ảnh, xem src/lib/design/share-link.ts), KHÔNG theo dòng đơn: link nằm
  // giữa các dòng thơ ngăn bằng 1 lần Enter (cùng block với chữ khác)
  // KHÔNG được tự chuyển — đúng quy tắc "URL nằm riêng trong 1 block,
  // không lẫn text khác". Đường paste chính giờ là handleContentPaste
  // (chạy NGAY lúc dán, không đợi debounce) — effect này chỉ còn là lưới
  // an toàn.
  useEffect(() => {
    const paragraphs = content.split("\n\n");
    const candidateIndexes = paragraphs.reduce<number[]>((acc, paragraph, index) => {
      if (isDesignShareLinkShape(paragraph.trim())) acc.push(index);
      return acc;
    }, []);
    if (candidateIndexes.length === 0) return;

    const timer = setTimeout(async () => {
      const nextParagraphs = content.split("\n\n");
      let changed = false;
      for (const index of candidateIndexes) {
        const shareUrl = nextParagraphs[index]?.trim();
        // Nội dung có thể đã đổi giữa lúc debounce và lúc fetch xong (người
        // dùng tự sửa/xoá block đó) — bỏ qua nếu không còn khớp.
        if (!shareUrl || !isDesignShareLinkShape(shareUrl)) continue;
        try {
          const res = await fetch("/api/design/resolve-link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shareUrl }),
          });
          const data = await res.json().catch(() => null);
          if (res.ok && data?.designItemId) {
            nextParagraphs[index] = `[[thiet-ke:${data.designItemId}]]`;
            changed = true;
          }
        } catch {
          // Im lặng — block vẫn còn nguyên link, effect tự thử lại lần kế
          // tiếp content đổi (ví dụ người dùng gõ thêm 1 ký tự rồi xoá).
        }
      }
      if (changed) onContentChange(nextParagraphs.join("\n\n"), undefined, "edit");
    }, 600);
    return () => clearTimeout(timer);
  }, [content, onContentChange]);

  // Đường paste CHÍNH — pipeline: lấy plain text đã dán → trim → có phải
  // NGUYÊN VẸN 1 link thiết kế (id+token) không → cursor đang ở 1
  // block/đoạn TRỐNG không (không lẫn chữ khác, không có vùng đang chọn)
  // → validate qua resolve-link (không tự fetch URL ngoài — tránh SSRF,
  // chỉ tra DB nội bộ) → thành công: preventDefault(), thay block đó bằng
  // marker + chèn 1 đoạn trống ngay sau để viết tiếp; thất bại: vẫn chèn
  // NGUYÊN VĂN đã dán (đúng hành vi paste bình thường mà preventDefault
  // vừa chặn), không mất nội dung. Không thoả bất kỳ điều kiện nào ở trên
  // (dán kèm chữ khác, hoặc block không trống) → return sớm, KHÔNG
  // preventDefault, để trình duyệt tự dán chữ như mọi lần paste khác.
  const handleContentPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const pasted = e.clipboardData.getData("text/plain");
    const trimmed = pasted.trim();
    if (!trimmed || !isDesignShareLinkShape(trimmed)) return;

    const { selectionStart, selectionEnd } = el;
    if (selectionStart !== selectionEnd) return; // đang có vùng chọn — không tính là block trống

    const { start: paragraphStart, end: paragraphEnd } = findParagraphRange(content, selectionStart);
    if (content.slice(paragraphStart, paragraphEnd).trim() !== "") return; // block đang dán vào không trống

    e.preventDefault();
    fetch("/api/design/resolve-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareUrl: trimmed }),
    })
      .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => null) }))
      .catch(() => ({ ok: false, data: null }))
      .then(({ ok, data }) => {
        if (ok && data?.designItemId) {
          const marker = `[[thiet-ke:${data.designItemId}]]`;
          const next = content.slice(0, paragraphStart) + marker + "\n\n" + content.slice(paragraphEnd);
          const newPos = paragraphStart + marker.length + 2;
          onContentChange(next, { start: newPos, end: newPos }, "edit");
          requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(newPos, newPos);
          });
        } else {
          const next = content.slice(0, selectionStart) + pasted + content.slice(selectionEnd);
          const newPos = selectionStart + pasted.length;
          onContentChange(next, { start: newPos, end: newPos }, "edit");
          requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(newPos, newPos);
          });
        }
      });
  };

  // Các nút của thanh công cụ — thứ tự/ẩn hiện theo tuỳ chỉnh của tác giả (toolbar-prefs.ts).
  type ToolItem = { title: string; icon: ReactNode; onClick: () => void; disabled?: boolean; pressed?: boolean; className?: string };
  const toolbarItems: Partial<Record<ToolbarItemId, ToolItem>> = {
    undo: { title: "Hoàn tác (Ctrl+Z)", icon: <ArrowUUpLeftIcon size={17} />, onClick: () => applyHistory(onUndo()), disabled: !canUndo },
    redo: { title: "Làm lại (Ctrl+Shift+Z)", icon: <ArrowUUpRightIcon size={17} />, onClick: () => applyHistory(onRedo()), disabled: !canRedo },
    bold: { title: "Đậm (Ctrl+B)", icon: "B", onClick: () => wrapSelection("**"), className: "font-[family-name:var(--font-lora)] text-[15px] font-bold" },
    italic: { title: "Nghiêng (Ctrl+I)", icon: "I", onClick: () => wrapSelection("*"), className: "font-[family-name:var(--font-lora)] text-[15px] font-medium italic" },
    heading: { title: "Tiêu đề nhỏ (cả đoạn)", icon: <TextHTwoIcon size={17} />, onClick: () => toggleBlock("heading") },
    quote: { title: "Trích dẫn (cả đoạn)", icon: <QuotesIcon size={17} />, onClick: () => toggleBlock("quote") },
    divider: { title: "Chèn ngắt cảnh (***)", icon: <MinusIcon size={17} />, onClick: insertDivider },
    image: {
      title: "Chèn ảnh thiết kế", icon: <ImageSquareIcon size={17} />, pressed: imagePromptOpen,
      onClick: () => { setImagePromptOpen((cur) => !cur); setImageLinkError(null); },
    },
    find: { title: "Tìm và thay thế (Ctrl+F / Ctrl+H)", icon: <MagnifyingGlassIcon size={17} />, pressed: tool === "find", onClick: () => (tool === "find" ? closeTool() : openFind(false)) },
    tidy: { title: "Chỉnh định dạng", icon: <MagicWandIcon size={17} />, pressed: tool === "tidy", onClick: () => setTool((t) => (t === "tidy" ? null : "tidy")) },
    ...(notebook ? {
      notebook: { title: "Sổ tay truyện: nhân vật, địa danh, thuật ngữ", icon: <BookOpenTextIcon size={17} />, onClick: () => setNotebookOpen(true) },
      names: {
        title: "Kiểm tra tên riêng viết lệch", icon: <TextAaIcon size={17} />, pressed: tool === "names",
        onClick: () => { setToolNotice(null); setTool((t) => (t === "names" ? null : "names")); },
      },
    } : {}),
    ...(chapterId ? { history: { title: "Lịch sử phiên bản", icon: <ClockCounterClockwiseIcon size={17} />, onClick: () => setHistoryOpen(true) } } : {}),
    keys: { title: "Phím tắt", icon: <KeyboardIcon size={17} />, pressed: tool === "keys", onClick: () => setTool((t) => (t === "keys" ? null : "keys")) },
  };
  const availableToolbar = TOOLBAR_ITEMS.filter((id) => toolbarItems[id]);
  const visibleToolbar = visibleItems(toolbarPrefs, availableToolbar);

  return (
    <div
      onKeyDown={handleEditorKeyDown}
      className={
        focusMode
          ? "fixed inset-0 z-[80] flex flex-col overflow-hidden bg-surface-warm"
          : "flex flex-col bg-surface-warm lg:overflow-hidden"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cream-border bg-surface-warm px-4 py-3.5 lg:px-7">
        <div className="flex min-w-0 items-center gap-2.5 text-[13px] font-medium text-stone-alt">
          <span className="truncate">{bookTitle}</span>
          <CaretRightIcon size={12} className="shrink-0" />
          <span className="truncate font-semibold text-brand-ink">{title || "Chương mới"}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3.5 text-[13px] font-medium text-stone-alt">
          <button
            type="button"
            onClick={() => setFocusMode((v) => !v)}
            title={focusMode ? "Thoát chế độ tập trung (Esc)" : "Chế độ tập trung (Ctrl+Shift+F)"}
            className="flex min-h-9 items-center gap-1 text-brand-ink transition-colors hover:text-brand-gold-dark"
          >
            {focusMode ? <ArrowsInIcon size={14} /> : <ArrowsOutIcon size={14} />}
            {focusMode ? "Thoát tập trung" : "Tập trung"}
          </button>
          {bookPublished && !focusMode && (
            <Link
              href={`/truyen/${bookSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-brand-gold-dark no-underline transition-colors hover:text-brand-ink"
            >
              Xem trang truyện <ArrowSquareOutIcon size={13} />
            </Link>
          )}
          {saveStatus && (
            <span
              role="status"
              className={`flex items-center gap-1 ${saveStatus.tone === "error" ? "text-error" : saveStatus.tone === "warn" ? "text-brand-gold-dark" : ""}`}
            >
              {saveStatus.tone === "ok" ? (
                <CloudCheckIcon className="text-success-text" />
              ) : saveStatus.tone === "busy" ? (
                <CloudArrowUpIcon />
              ) : (
                <WarningCircleIcon />
              )}
              {saveStatus.label}
            </span>
          )}
        </div>
      </div>
      {notice}

      <div
        ref={scrollerRef}
        data-editor-scroll
        className={focusMode ? "flex min-h-0 flex-1 flex-col overflow-y-auto py-8 lg:py-12" : "flex flex-1 flex-col py-6 lg:overflow-y-auto lg:py-9"}
      >
        <div className="mx-auto flex w-full max-w-[660px] flex-1 flex-col px-4 lg:px-7">
          <Field
            label={null}
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Tên chương"
            lang="vi"
            spellCheck
            // className ghép qua cn() (tailwind-merge) nên p-0/text-[32px] đè được padding/cỡ chữ gốc của Field
            className="mb-1.5 border-none bg-transparent p-0 font-[family-name:var(--font-lora)] text-[32px] font-semibold text-brand-ink outline-none"
          />
          <div className="mb-[22px] flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-stone-alt">
            <WordGoal words={words} sessionWords={words - startWords} daily={dailyGoal} />
            <span>·</span>
            <span>~{readMin} phút đọc</span>
          </div>

          <div className={`mb-[22px] ${isLastChapterLocked ? "opacity-60" : ""} ${focusMode ? "hidden" : ""}`}>
            <Checkbox checked={isLastChapter} onChange={isLastChapterLocked ? () => {} : onIsLastChapterToggle}>
              Đây là chương cuối cùng của truyện
              {isLastChapterLocked && <span className="ml-1 text-stone-alt">(không thể bỏ chọn sau khi lưu)</span>}
            </Checkbox>
          </div>

          <div className="sticky top-0 z-[5] mb-5 bg-surface-warm">
          <div className="flex items-center gap-1 overflow-x-auto border-b border-cream-border py-2">
            {visibleToolbar.map((id) => {
              const item = toolbarItems[id]!;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={item.onClick}
                  disabled={item.disabled}
                  aria-pressed={item.pressed}
                  title={item.title}
                  aria-label={TOOLBAR_LABEL[id]}
                  className={`min-h-10 shrink-0 cursor-pointer rounded-md px-2.5 py-1.5 transition-colors hover:bg-info-bg aria-pressed:bg-info-bg disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent ${item.className ?? ""}`}
                >
                  {item.icon}
                </button>
              );
            })}
            <div className="mx-1.5 h-5 w-px shrink-0 bg-cream-border" />
            <button
              type="button"
              onClick={() => setTool((t) => (t === "toolbar" ? null : "toolbar"))}
              aria-pressed={tool === "toolbar"}
              title="Tuỳ chỉnh thanh công cụ"
              aria-label="Tuỳ chỉnh thanh công cụ"
              className="min-h-10 shrink-0 cursor-pointer rounded-md px-2.5 py-1.5 transition-colors hover:bg-info-bg aria-pressed:bg-info-bg"
            >
              <SlidersHorizontalIcon size={17} />
            </button>
          </div>
          {tool === "toolbar" && (
            <ToolbarCustomizer
              prefs={toolbarPrefs}
              available={availableToolbar}
              onChange={(next) => {
                setToolbarPrefs(next);
                writeToolbarPrefs(next);
              }}
              onClose={closeTool}
            />
          )}
          {tool === "find" && (
            <FindReplacePanel
              state={{ ...find, current }}
              onChange={(next) => {
                setFind(next);
                setFindMessage(null);
              }}
              matches={matches}
              onGo={(index) => setFind((f) => ({ ...f, current: index }))}
              onReplace={replaceCurrent}
              onReplaceAll={replaceAll}
              onClose={closeTool}
              message={findMessage}
            />
          )}
          {tool === "tidy" && <TidyPanel onApply={applyTidy} onClose={closeTool} />}
          {tool === "keys" && <ShortcutHelp onClose={closeTool} />}
          {tool === "names" && (
            <NameCheckPanel
              content={content}
              names={names}
              bookId={bookId}
              chapterId={chapterId}
              onApply={(next, message) => {
                onContentChange(next, { start: 0, end: 0 }, "edit");
                setToolNotice(message);
              }}
              onShow={showNameIssue}
              onClose={closeTool}
            />
          )}
          {tool === "names" && toolNotice && <p role="status" className="mb-2 text-[13px] text-stone-alt">{toolNotice}</p>}
          <QuickInsertBar
            items={quickItems}
            suggestions={suggestions}
            onInsert={insertQuickItem}
            onPunctuation={insertAtCursor}
            onAcceptSuggestion={acceptSuggestion}
            canAdd={!!quickInsert}
            onAdd={quickInsert?.onAdd ?? (async () => null)}
            onManage={quickInsert?.onManage ?? (() => {})}
            getSelectedText={() => {
              const el = textareaRef.current;
              return el ? content.slice(el.selectionStart, el.selectionEnd) : "";
            }}
          />
          </div>

          {imagePromptOpen && (
            <div className="mb-5 rounded-lg border border-cream-border bg-surface p-3">
              <div className="flex gap-2">
                {/* Ô nhập gọn — size="sm" của kit */}
                <Field
                  label={null}
                  wrapperClassName="min-w-0 flex-1"
                  value={imageLinkInput}
                  onChange={(e) => setImageLinkInput(e.target.value)}
                  placeholder="Dán link chia sẻ thiết kế (…?id=…&token=…)"
                  size="sm"
                />
                <Button
                  type="button"
                  onClick={insertDesignImage}
                  disabled={imageLinkPending}
                  fullWidth={false}
                  className="shrink-0 px-4 py-0 text-[13px]"
                >
                  {imageLinkPending ? "Đang kiểm tra…" : "Chèn"}
                </Button>
              </div>
              {imageLinkError && <div className="mt-2 text-[12px] font-medium text-error">{imageLinkError}</div>}
              <p className="mt-2 text-[11.5px] text-stone-alt">
                Link do hoạ sĩ gửi cho bạn (nút &quot;Tạo link liên kết&quot; ở trang đăng thiết kế) — ảnh sẽ hiện
                đúng tại vị trí con trỏ đang đặt.
              </p>
            </div>
          )}

          <div className="relative flex flex-1 flex-col">
          {/* Lớp tô kết quả tìm: cùng font/độ rộng/xuống dòng với textarea
              (nền trong suốt) nên các <mark> nằm đúng dưới chữ. */}
          {tool === "find" && matches.length > 0 && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words font-[family-name:var(--font-lora)] text-lg leading-[1.95] text-transparent"
            >
              {matches.map((m, i) => (
                <span key={m.start}>
                  {content.slice(i === 0 ? 0 : matches[i - 1].end, m.start)}
                  <mark
                    ref={i === current ? (el) => { currentMarkRef.current = el; } : undefined}
                    className={`rounded-[2px] text-transparent ${i === current ? "bg-brand-gold" : "bg-brand-gold/35"}`}
                  >
                    {content.slice(m.start, m.end)}
                  </mark>
                </span>
              ))}
              {content.slice(matches[matches.length - 1].end)}
              {"\u200b"}
            </div>
          )}
          <textarea
            ref={textareaRef}
            className="relative min-h-[460px] w-full flex-1 resize-none overflow-hidden border-none bg-transparent font-[family-name:var(--font-lora)] text-lg leading-[1.95] text-[#2b2925] dark:text-ink outline-none"
            value={content}
            onChange={(e) => {
              // Dán / cắt / kéo-thả là 1 bước undo riêng, không gộp với chữ đang gõ.
              const inputType = (e.nativeEvent as InputEvent).inputType ?? "";
              const kind = /^(insertFromPaste|insertFromDrop|deleteByCut|deleteByDrag)/.test(inputType) ? "edit" : "type";
              onContentChange(e.target.value, { start: e.target.selectionStart, end: e.target.selectionEnd }, kind);
              trackCaret(e.target);
            }}
            onKeyDown={handleKeyDown}
            onSelect={(e) => trackCaret(e.currentTarget)}
            onBlur={() => setCaret(null)}
            onPaste={handleContentPaste}
            // Chính tả: dùng kiểm tra có sẵn của trình duyệt / bàn phím điện thoại (tiếng Việt).
            spellCheck
            lang="vi"
            placeholder="Bắt đầu viết…"
          />
          </div>
        </div>
      </div>
      {notebook && bookId && (
        <StoryNotebook
          open={notebookOpen}
          onClose={() => setNotebookOpen(false)}
          bookId={bookId}
          characters={notebook.characters}
          terms={notebook.terms}
          onInsert={(text) => insertAtCursor(text)}
          onManageTerms={() => { setNotebookOpen(false); notebook.onManageTerms(); }}
        />
      )}
      {chapterId && (
        <VersionHistoryModal
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          chapterId={chapterId}
          currentTitle={title}
          currentContent={content}
          onRestore={(restoredTitle, restoredContent) => {
            onTitleChange(restoredTitle);
            onContentChange(restoredContent, { start: 0, end: 0 }, "edit");
          }}
        />
      )}
    </div>
  );
}
