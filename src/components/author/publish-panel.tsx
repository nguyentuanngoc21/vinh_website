"use client";

import { useState, type ReactNode } from "react";
import { CaretDownIcon, CheckCircleIcon, CoinsIcon } from "@phosphor-icons/react/dist/ssr";
import { CopyrightSettings } from "@/components/author/copyright-settings";
import { TagInput } from "@/components/author/tag-input";
import { ChapterAudioPanel } from "@/components/author/chapter-audio-panel";
import { AgeRatingPicker } from "@/components/author/age-rating-picker";
import { Field, Textarea, Alert, GenreSelect } from "@/components/ui";
import type { BookGenre } from "@/lib/supabase/types";
import type { AudioTrack } from "@/lib/audio/get-audio-catalog";
import type { AgeRating } from "@/lib/age-rating";

type PublishPanelProps = {
  /** Rỗng ở /author/new: chương chưa tồn tại trong DB nên chưa thể gắn audio nội bộ. */
  chapterId?: string;
  linkedAudio?: AudioTrack[];
  published: boolean;
  saving: boolean;
  error: string | null;
  onSaveDraft: () => void;
  onPublish: () => void;
  isExclusive: boolean;
  onExclusiveChange: (value: boolean) => void;
  exclusiveLocked: boolean;
  exclusiveError: string | null;
  /** Truyện đang dự thi (lý do hiển thị, null = không khoá): giá chương (D8), tắt độc quyền (D11). */
  contestLock?: { prices: string | null; exclusive: string | null };
  price: number;
  onPriceChange: (value: number) => void;
  audioUrl: string;
  onAudioUrlChange: (value: string) => void;
  audioPrice: number;
  onAudioPriceChange: (value: number) => void;
  bookTitle: string;
  onBookTitleChange: (title: string) => void;
  onBookTitleCommit: () => void;
  synopsis: string;
  onSynopsisChange: (synopsis: string) => void;
  onSynopsisCommit: () => void;
  genre: BookGenre | null;
  onGenreChange: (genre: BookGenre) => void;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  ageRating: AgeRating;
  contentWarnings: string[];
  onAgeRatingChange: (rating: AgeRating, warnings: string[]) => void;
  ageRatingLocked?: boolean;
  ageRatingError?: string | null;
  /** Mục "Nhân vật trong chương" — chỉ có khi chương đã tồn tại (author-workspace.tsx). */
  chapterCharacters?: { node: ReactNode; done: boolean };
  /** Ảnh nền chương — tuỳ chọn, panel tự lưu ngay khi tải lên/gỡ. */
  chapterBackground?: { node: ReactNode; done: boolean };
  /** Ghi chú & dàn ý riêng — tự lưu, không đi qua nút lưu chương. */
  chapterNotes?: { node: ReactNode; done: boolean };
};

type SectionId = "info" | "classify" | "characters" | "notes" | "background" | "monetize" | "copyright";

function ChecklistSection({
  id,
  title,
  done,
  open,
  onToggle,
  children,
}: {
  id: SectionId;
  title: string;
  done: boolean;
  open: boolean;
  onToggle: (id: SectionId) => void;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-surface-sunken last:border-b-0">
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-3 py-4 text-left"
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
            done ? "bg-success-form-border text-success-text" : "bg-cream-card-alt text-stone-alt"
          }`}
        >
          {done ? <CheckCircleIcon weight="fill" size={16} /> : <span className="h-2 w-2 rounded-full bg-current" />}
        </span>
        <span className="min-w-0 flex-1 text-[13px] font-bold uppercase tracking-wide text-brand-ink">
          {title}
        </span>
        <CaretDownIcon
          size={15}
          className={`shrink-0 text-stone-alt transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {/* hidden thay vì gỡ khỏi cây: mục con tự lưu (nhân vật trong chương) giữ nguyên state khi thu gọn. */}
      <div hidden={!open} className="pb-5">
        {children}
      </div>
    </section>
  );
}

export function PublishPanel({
  chapterId = "",
  linkedAudio = [],
  published,
  saving,
  error,
  onSaveDraft,
  onPublish,
  isExclusive,
  onExclusiveChange,
  exclusiveLocked,
  exclusiveError,
  contestLock,
  price,
  onPriceChange,
  audioUrl,
  onAudioUrlChange,
  audioPrice,
  onAudioPriceChange,
  bookTitle,
  onBookTitleChange,
  onBookTitleCommit,
  synopsis,
  onSynopsisChange,
  onSynopsisCommit,
  genre,
  onGenreChange,
  tags,
  onTagsChange,
  ageRating,
  contentWarnings,
  onAgeRatingChange,
  ageRatingLocked = false,
  ageRatingError = null,
  chapterCharacters,
  chapterBackground,
  chapterNotes,
}: PublishPanelProps) {
  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>({
    info: true,
    classify: true,
    characters: true,
    notes: false,
    background: false,
    monetize: false,
    copyright: false,
  });

  const toggleSection = (id: SectionId) => {
    setOpenSections((sections) => ({ ...sections, [id]: !sections[id] }));
  };

  const hasTitle = bookTitle.trim().length > 0;
  const hasSynopsis = synopsis.trim().length > 0;
  const hasAudio = audioUrl.trim().length > 0;

  return (
    <div className="flex flex-col border-t border-cream-border bg-surface lg:overflow-y-auto lg:border-l lg:border-t-0">
      <div className="sticky top-0 z-10 flex gap-2.5 border-b border-cream-border bg-surface px-[22px] py-5">
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={saving}
          className="flex-1 cursor-pointer rounded-[9px] border border-brand-ink py-[11px] text-center text-sm font-semibold text-brand-ink transition-opacity disabled:cursor-default disabled:opacity-60"
        >
          {saving ? "Đang lưu..." : "Lưu nháp"}
        </button>
        <button
          type="button"
          onClick={onPublish}
          disabled={saving}
          className="flex-1 cursor-pointer rounded-[9px] bg-brand-gold py-[11px] text-center text-sm font-bold text-brand-navy transition-opacity disabled:cursor-default disabled:opacity-60"
        >
          {saving ? "Đang lưu..." : published ? "Cập nhật" : "Xuất bản"}
        </button>
      </div>

      <div className="px-[22px]">
        {error && <Alert tone="error" className="mt-4">{error}</Alert>}

        <ChecklistSection
          id="info"
          title="Thông tin truyện"
          done={hasTitle && hasSynopsis}
          open={openSections.info}
          onToggle={toggleSection}
        >
          <div className="flex flex-col gap-3.5">
            <div>
              <div className="mb-1.5 text-[13px] font-medium text-ink-muted">Tên truyện</div>
              <Field
                label={null}
                value={bookTitle}
                onChange={(e) => onBookTitleChange(e.target.value)}
                onBlur={onBookTitleCommit}
                placeholder="Vũng Vịnh Cuối Trời"
              />
            </div>

            <div>
              <div className="mb-1.5 text-[13px] font-medium text-ink-muted">Tóm tắt truyện</div>
              <Textarea
                label={null}
                value={synopsis}
                onChange={(e) => onSynopsisChange(e.target.value)}
                onBlur={onSynopsisCommit}
                placeholder="Vài dòng giới thiệu nội dung truyện cho độc giả..."
                rows={4}
              />
            </div>
          </div>
        </ChecklistSection>

        <ChecklistSection
          id="classify"
          title="Phân loại"
          done={Boolean(genre)}
          open={openSections.classify}
          onToggle={toggleSection}
        >
          <div className="flex flex-col gap-3.5">
            <div>
              <div className="mb-1.5 text-[13px] font-medium text-ink-muted">Thể loại</div>
              <GenreSelect value={genre} onChange={onGenreChange} />
            </div>

            <div>
              <div className="mb-1.5 text-[13px] font-medium text-ink-muted">Tag</div>
              <TagInput tags={tags} onChange={onTagsChange} />
            </div>

            <div>
              <div className="mb-1.5 text-[13px] font-medium text-ink-muted">Độ tuổi</div>
              <AgeRatingPicker
                rating={ageRating}
                warnings={contentWarnings}
                onChange={onAgeRatingChange}
                locked={ageRatingLocked}
                error={ageRatingError}
              />
            </div>
          </div>
        </ChecklistSection>

        {chapterCharacters && (
          <ChecklistSection
            id="characters"
            title="Nhân vật trong chương"
            done={chapterCharacters.done}
            open={openSections.characters}
            onToggle={toggleSection}
          >
            {chapterCharacters.node}
          </ChecklistSection>
        )}

        {chapterNotes && (
          <ChecklistSection
            id="notes"
            title="Ghi chú & dàn ý (riêng tư)"
            done={chapterNotes.done}
            open={openSections.notes}
            onToggle={toggleSection}
          >
            {chapterNotes.node}
          </ChecklistSection>
        )}

        {chapterBackground && (
          <ChecklistSection
            id="background"
            title="Ảnh nền chương"
            done={chapterBackground.done}
            open={openSections.background}
            onToggle={toggleSection}
          >
            {chapterBackground.node}
          </ChecklistSection>
        )}

        <ChecklistSection
          id="monetize"
          title="Giá & audio"
          done={price >= 0}
          open={openSections.monetize}
          onToggle={toggleSection}
        >
          <div className="flex flex-col gap-3.5">
            <div>
              <div className="mb-1.5 text-[13px] font-medium text-ink-muted">
                Link audio <span className="font-normal text-stone-alt">(không bắt buộc)</span>
              </div>
              <Field
                label={null}
                value={audioUrl}
                onChange={(e) => onAudioUrlChange(e.target.value)}
                placeholder="Dán link file audio (mp3, wav...) hoặc link chia sẻ"
              />
            </div>

            <div>
              <div className="mb-1.5 text-[13px] font-medium text-ink-muted">Giá</div>
              <div className="flex flex-col gap-2">
                {/* start/end nằm trong khung viền của Field — cả hàng là <label> nên bấm nhãn cũng focus ô giá */}
                <Field
                  label={null}
                  size="sm"
                  type="number"
                  min="0"
                  step="1000"
                  value={price}
                  disabled={Boolean(contestLock?.prices)}
                  onChange={(event) => onPriceChange(Math.max(0, Number(event.target.value) || 0))}
                  start={
                    <>
                      <span className="w-[92px] shrink-0 text-[13px] font-medium text-ink-muted">Truyện chữ:</span>
                      <CoinsIcon color="var(--color-brand-gold)" className="shrink-0" />
                    </>
                  }
                  end={<span className="shrink-0 text-sm text-stone-alt">token</span>}
                  className="text-sm font-semibold"
                />
                {hasAudio && (
                  <Field
                    label={null}
                    size="sm"
                    type="number"
                    min="0"
                    step="1000"
                    value={audioPrice}
                    disabled={Boolean(contestLock?.prices)}
                    onChange={(event) => onAudioPriceChange(Math.max(0, Number(event.target.value) || 0))}
                    start={
                      <>
                        <span className="w-[92px] shrink-0 text-[13px] font-medium text-ink-muted">Truyện audio</span>
                        <CoinsIcon color="var(--color-brand-gold)" className="shrink-0" />
                      </>
                    }
                    end={<span className="shrink-0 text-sm text-stone-alt">token</span>}
                    className="text-sm font-semibold"
                  />
                )}
                {contestLock?.prices && (
                  <div className="rounded-lg bg-cream-card px-3 py-2 text-[12px] leading-normal text-cream-gold-text">{contestLock.prices}</div>
                )}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-[13px] font-medium text-ink-muted">Quyền độc quyền</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onExclusiveChange(true)}
                  className={`flex-1 cursor-pointer rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                    isExclusive ? "bg-brand-navy text-white" : "border border-cream-border bg-surface text-stone-alt"
                  }`}
                >
                  Độc quyền
                </button>
                <button
                  type="button"
                  onClick={() => onExclusiveChange(false)}
                  disabled={exclusiveLocked || Boolean(contestLock?.exclusive)}
                  title={
                    contestLock?.exclusive
                      ? contestLock.exclusive
                      : exclusiveLocked
                        ? "Đã độc quyền quá 3 ngày kể từ lúc xuất bản - không đổi lại được."
                        : undefined
                  }
                  className={`flex-1 cursor-pointer rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
                    !isExclusive ? "bg-brand-navy text-white" : "border border-cream-border bg-surface text-stone-alt"
                  }`}
                >
                  Tự do
                </button>
              </div>
              <div className="mt-2 text-[12px] text-stone-alt">
                {contestLock?.exclusive
                  ? contestLock.exclusive
                  : exclusiveLocked
                  ? "Đã xuất bản độc quyền quá 3 ngày - không thể chuyển về tự do nữa."
                  : isExclusive
                    ? "Truyện này chỉ được phân phối trên Vịnh. Tác giả giữ quyền tái bản."
                    : "Tác giả có thể xuất bản truyện này ở các nền tảng khác."}
              </div>
              {exclusiveError && (
                <div className="mt-2 text-[12px] font-medium text-error">{exclusiveError}</div>
              )}
            </div>
          </div>
        </ChecklistSection>

        <ChecklistSection
          id="copyright"
          title="Bảo vệ bản quyền"
          done
          open={openSections.copyright}
          onToggle={toggleSection}
        >
          <CopyrightSettings />
        </ChecklistSection>
      </div>

      {chapterId && <ChapterAudioPanel chapterId={chapterId} initialLinkedAudio={linkedAudio} />}
    </div>
  );
}
