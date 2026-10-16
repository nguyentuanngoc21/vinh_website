"use client";

import { ContinueListening } from "./continue-listening";
import { ResumeRow } from "./resume-row";
import { usePrivateItems } from "@/lib/hooks/use-private-items";
import type { ListeningProgressItem } from "@/lib/audio/get-listening-progress";

export function PersonalListeningProgress() {
  const [hero, ...rest] = usePrivateItems<ListeningProgressItem>("/api/audio/listening-progress");
  return <>
    {hero && <ContinueListening track={hero.track} positionSeconds={hero.positionSeconds} />}
    <ResumeRow items={rest} />
  </>;
}
