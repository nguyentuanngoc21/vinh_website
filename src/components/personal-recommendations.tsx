"use client";

import { RecommendedForYou } from "@/components/recommended-for-you";
import { usePrivateItems } from "@/lib/hooks/use-private-items";
import type { HomepageBook } from "@/lib/home/get-homepage-books";

export function PersonalRecommendations() {
  const books = usePrivateItems<HomepageBook>("/api/recommendations");
  return <RecommendedForYou books={books} />;
}
