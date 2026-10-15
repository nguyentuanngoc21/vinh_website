import { Skeleton } from "@/components/ui";
export default function EventsLoading() {
  return <main aria-label="Đang tải sự kiện" className="mx-auto w-full max-w-[1280px] flex-1 space-y-8 px-5 py-10"><Skeleton className="h-10 w-44" /><Skeleton className="h-[330px] w-full rounded-3xl" /><div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-80 rounded-2xl" />)}</div></main>;
}
