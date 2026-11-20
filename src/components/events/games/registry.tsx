"use client";
import dynamic from "next/dynamic";
import type { ComponentType } from "react";
export type EventGameProps = { eventId: string; onClose: () => void };
// Lazy-load large games with next/dynamic when adding them here.
export const EVENT_GAME_COMPONENTS: Record<string, ComponentType<EventGameProps>> = {
  "ky-nhan-hoi": dynamic(() => import("./ky-nhan-hoi"), { ssr: false }),
  "dino-run": dynamic(() => import("./dino-run"), { ssr: false }),
};
