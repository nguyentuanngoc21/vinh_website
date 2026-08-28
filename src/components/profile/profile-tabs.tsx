"use client";

import {
  UsersThreeIcon,
  ChatTeardropDotsIcon,
  PencilSimpleLineIcon,
  TargetIcon,
} from "@phosphor-icons/react/dist/ssr";
import { PROFILE_TABS, type ProfileTab } from "@/lib/profile";

const TAB_ICONS = {
  users: UsersThreeIcon,
  chat: ChatTeardropDotsIcon,
  pencil: PencilSimpleLineIcon,
  target: TargetIcon,
};

type ProfileTabsProps = { active: ProfileTab; onChange: (tab: ProfileTab) => void };

export function ProfileTabs({ active, onChange }: ProfileTabsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto border-b border-[#f0f0ef] px-4 pt-[22px] [scrollbar-width:none] sm:px-8 lg:px-11 [&::-webkit-scrollbar]:hidden">
      {PROFILE_TABS.map((tab) => {
        const Icon = TAB_ICONS[tab.icon as keyof typeof TAB_ICONS];
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            style={{
              color: isActive ? "var(--color-brand-ink)" : "var(--color-stone-dark)",
              background: isActive ? "var(--color-cream-card)" : "transparent",
              borderBottomColor: isActive ? "var(--color-brand-gold)" : "transparent",
            }}
            className={`-mb-px flex shrink-0 cursor-pointer items-center gap-2 rounded-t-xl border-b-2 px-[18px] py-2.5 text-sm transition-colors ${
              isActive ? "font-bold" : "font-medium"
            }`}
          >
            <Icon size={17} /> {tab.label}
          </button>
        );
      })}
    </div>
  );
}
