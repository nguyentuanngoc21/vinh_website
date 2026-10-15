"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { EVENT_GAME_DEFINITIONS } from "@/lib/events/game-definitions";
export function AdminEventControls({ id, hidden, gameIds }: { id: string; hidden: boolean; gameIds: string[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(gameIds);
  async function save(body: { hidden?: boolean; gameIds?: string[] }) {
    setPending(true); setError(null);
    try {
      const response = await fetch(`/api/admin/events/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không lưu được thay đổi.");
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Kết nối bị gián đoạn."); }
    finally { setPending(false); }
  }
  return <div className="mt-5 space-y-4 border-t border-line pt-5"><button disabled={pending} onClick={() => void save({ hidden: !hidden })} className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold text-brand-ink disabled:opacity-50">{hidden ? "Hiện lại sự kiện" : "Ẩn sự kiện"}</button>{EVENT_GAME_DEFINITIONS.length > 0 && <fieldset disabled={pending} className="space-y-3"><legend className="mb-3 text-sm font-bold">Trò chơi của sự kiện</legend>{EVENT_GAME_DEFINITIONS.map((game) => <label key={game.id} className="flex gap-2 text-sm"><input type="checkbox" checked={selected.includes(game.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, game.id] : selected.filter((id) => id !== game.id))} />{game.title}</label>)}<button type="button" onClick={() => void save({ gameIds: selected })} className="rounded-full bg-brand-gold px-4 py-2 text-sm font-bold text-brand-navy">Lưu trò chơi</button></fieldset>}{error && <p role="alert" className="text-sm text-error">{error}</p>}</div>;
}
