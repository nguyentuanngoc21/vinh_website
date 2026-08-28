"use client";

import Link from "next/link";
import {
  MagnifyingGlassIcon,
  CaretLeftIcon,
  PlusCircleIcon,
  PaperPlaneRightIcon,
  BellIcon,
  BellSlashIcon,
  UserCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { CONVERSATIONS, THREADS, AVATAR_TONES } from "@/lib/profile";
import { Field, Button } from "@/components/ui";

type ChatTabProps = {
  activeConv: number;
  onSelectConv: (index: number) => void;
  mobileView: "list" | "thread";
  onBack: () => void;
  mute: boolean;
  onToggleMute: () => void;
};

export function ChatTab({
  activeConv,
  onSelectConv,
  mobileView,
  onBack,
  mute,
  onToggleMute,
}: ChatTabProps) {
  const active = CONVERSATIONS[activeConv];
  const tone = AVATAR_TONES[activeConv % AVATAR_TONES.length];
  const messages = THREADS[activeConv];

  return (
    <div className="px-0 pb-6 pt-[22px] sm:px-8 sm:pb-[60px] lg:px-11">
      <div className="grid h-[604px] grid-cols-[320px_1fr_272px] overflow-hidden border border-cream bg-white max-[1080px]:grid-cols-[288px_1fr] max-[759px]:h-[calc(100vh-260px)] max-[759px]:min-h-[420px] max-[759px]:grid-cols-1 sm:rounded-[18px]">
        {/* Conversation list */}
        <div
          className={`flex min-w-0 flex-col border-r border-[#f0f0ef] ${
            mobileView === "thread" ? "max-[759px]:hidden" : ""
          }`}
        >
          <div className="border-b border-[#f5f4f2] p-4 pb-3">
            <div className="mb-3 text-[17px] font-bold text-brand-ink">Hội thoại</div>
            <div className="rounded-full bg-neutral-bg px-3.5 py-2.5">
              <Field
                label={null}
                placeholder="Tìm cuộc trò chuyện"
                className="border-none bg-transparent px-0 py-0 text-[13.5px] text-ink placeholder:text-[#9a9a9a] focus:border-transparent"
                suffix={<MagnifyingGlassIcon size={16} className="text-[#9a9a9a]" />}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {CONVERSATIONS.map((c, i) => {
              const on = i === activeConv;
              return (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => onSelectConv(i)}
                  style={{
                    background: on ? "var(--color-cream-card)" : "transparent",
                    borderLeftColor: on ? "var(--color-brand-gold)" : "transparent",
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 border-l-[3px] px-4 py-3 text-left transition-colors hover:bg-cream-card"
                >
                  <div
                    style={{ background: AVATAR_TONES[i % AVATAR_TONES.length] }}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                  >
                    {c.name[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div
                        style={{ fontWeight: c.unread ? 700 : 600 }}
                        className="truncate text-sm text-ink"
                      >
                        {c.name}
                      </div>
                      <div className="shrink-0 text-[11.5px] text-[#a8a29e]">{c.time}</div>
                    </div>
                    <div
                      style={{
                        color: c.unread ? "var(--color-ink)" : "var(--color-stone)",
                        fontWeight: c.unread ? 600 : 400,
                      }}
                      className="mt-0.5 truncate text-[12.5px]"
                    >
                      {c.snippet}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Thread */}
        <div
          className={`flex min-w-0 flex-col bg-[#fdfdfc] ${
            mobileView === "list" ? "max-[759px]:hidden" : ""
          }`}
        >
          <div className="flex items-center gap-3 border-b border-[#f0f0ef] bg-white px-[18px] py-3.5">
            <button
              type="button"
              onClick={onBack}
              className="hidden h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-full text-brand-ink max-[759px]:flex"
            >
              <CaretLeftIcon size={19} />
            </button>
            <div
              style={{ background: tone }}
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            >
              {active.name[0]}
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-ink">{active.name}</div>
              <div className="mt-0.5 text-xs text-stone">{active.status}</div>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-[18px] py-5">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                <div
                  style={{
                    background: m.mine ? "var(--color-brand-ink)" : "#f2f1ee",
                    color: m.mine ? "#fff" : "var(--color-ink)",
                    borderRadius: m.mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                  }}
                  className="max-w-[74%] px-[15px] py-2.5 text-sm leading-[1.55]"
                >
                  {m.text}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2.5 border-t border-[#f0f0ef] bg-white px-4 py-3">
            <PlusCircleIcon size={22} className="shrink-0 text-stone" />
            <Field
              label={null}
              placeholder="Nhắn tin…"
              className="min-w-0 flex-1 rounded-full border-none bg-neutral-bg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-brand-gold"
            />
            <Button type="button" className="h-[38px] w-[38px] rounded-full p-0 text-brand-ink">
              <PaperPlaneRightIcon weight="fill" size={17} />
            </Button>
          </div>
        </div>

        {/* Side panel */}
        <div className="hidden flex-col gap-4 overflow-y-auto border-l border-[#f0f0ef] px-[18px] py-5 min-[1081px]:flex">
          <div className="flex flex-col items-center gap-2.5 text-center">
            <div
              style={{ background: tone }}
              className="flex h-[68px] w-[68px] items-center justify-center rounded-full text-2xl font-bold text-white"
            >
              {active.name[0]}
            </div>
            <div className="text-[15.5px] font-semibold text-ink">{active.name}</div>
            <Link
              href="/ket-noi"
              className="flex items-center gap-2 rounded-full bg-brand-ink px-[18px] py-2 text-[13px] font-semibold text-white no-underline"
            >
              <UserCircleIcon size={16} color="var(--color-brand-gold-light)" /> Xem Profile
            </Link>
          </div>
          <div className="h-px bg-[#f0f0ef]" />
          <div>
            <div className="mb-2 text-xs font-semibold tracking-[1.1px] text-brand-gold-dark">
              TÌM TIN NHẮN
            </div>
            <Field
              label={null}
              placeholder="Từ khóa trong hội thoại…"
              className="w-full rounded-[10px] border border-cream px-3 py-2.5 text-sm outline-none focus:border-brand-gold"
            />
            <div className="mt-1.5 text-xs text-stone">Tìm trong 1.284 tin nhắn</div>
          </div>
          <div className="h-px bg-[#f0f0ef]" />
          <button
            type="button"
            onClick={onToggleMute}
            className="flex cursor-pointer items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5">
              {mute ? (
                <BellSlashIcon weight="fill" size={18} color="var(--color-brand-ink)" />
              ) : (
                <BellIcon size={18} color="var(--color-brand-ink)" />
              )}
              <div className="text-[13.5px] font-medium text-ink">Chế độ im lặng</div>
            </div>
            <div
              style={{
                background: mute ? "var(--color-brand-gold)" : "#e2e0dc",
                justifyContent: mute ? "flex-end" : "flex-start",
              }}
              className="flex h-6 w-[42px] shrink-0 items-center rounded-full p-[3px] transition-colors"
            >
              <div className="h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.2)]" />
            </div>
          </button>
          <div className="-mt-2 text-xs leading-[1.6] text-stone">
            {mute
              ? "Bạn sẽ không nhận thông báo từ hội thoại này."
              : "Đang nhận thông báo cho mọi tin nhắn mới."}
          </div>
        </div>
      </div>
    </div>
  );
}
