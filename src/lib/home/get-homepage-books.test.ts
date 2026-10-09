import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getHomepageData } from "./get-homepage-books";

vi.mock("@/lib/covers/resolve-book-cover", () => ({
  resolveBookCoverUrls: vi.fn(async (_client: unknown, rows: unknown[]) => rows.map(() => null)),
}));

it("lists books by latest chapter publication and preserves order when book rows arrive shuffled", async () => {
  const books = ["older-update", "latest-update"].map((id) => ({
    id, slug: `${id}-slug`, title: id, author_id: "author", genre: null,
    view_count: 0, synopsis: null, cover_design_item_id: null,
    created_at: "2026-01-01T00:00:00Z", is_exclusive: false, age_rating: "all",
  }));
  const stats = ["latest-update", "older-update"].map((book_id, index) => ({
    book_id, latest_published_chapter_at: `2026-10-0${9 - index}T00:00:00Z`,
    published_chapter_count: 1, has_published_last_chapter: false,
  }));
  const orders: unknown[][] = [];
  const client = {
    from(table: string) {
      const data = table === "books" ? books : table === "book_chapter_stats" ? stats : [{ id: "author", nickname: "Author" }];
      const query = {
        select: () => query, eq: () => query, is: () => query, in: () => query,
        order: (...args: unknown[]) => { orders.push([table, ...args]); return query; },
        limit: () => query,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data }).then(resolve),
      };
      return query;
    },
  } as unknown as SupabaseClient<Database>;
  const result = await getHomepageData(client);
  expect(orders).toContainEqual(["book_chapter_stats", "latest_published_chapter_at", { ascending: false }]);
  expect(result.newest.map((book) => book.id)).toEqual(["latest-update", "older-update"]);
  expect(result.featured.map((book) => book.id)).toEqual(["older-update", "latest-update"]);
});
