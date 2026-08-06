import type { Metadata } from "next";
import { ChapterEditor } from "@/components/author/chapter-editor";
import { PublishPanel } from "@/components/author/publish-panel";

export const metadata: Metadata = {
  title: "Chương 14 · Vịnh Tác giả",
};

export default function AuthorEditorPage() {
  return (
    <>
      <ChapterEditor />
      <PublishPanel />
    </>
  );
}
