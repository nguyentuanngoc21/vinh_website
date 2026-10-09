/**
 * Paragraph-level diff for "Lịch sử phiên bản" (paragraphs = "\n\n" blocks,
 * like the reader). LCS on paragraphs; very long chapters fall back to a
 * prefix/suffix comparison so the browser never does a huge table. Pure.
 */
export type DiffPart = { kind: "same" | "added" | "removed"; text: string };

const MAX_CELLS = 400_000;

export function diffParagraphs(before: string, after: string): DiffPart[] {
  const a = before.split("\n\n"), b = after.split("\n\n");
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const midA = a.slice(start, endA), midB = b.slice(start, endB);
  const head = a.slice(0, start).map(text => ({ kind: "same" as const, text }));
  const tail = a.slice(endA).map(text => ({ kind: "same" as const, text }));

  let mid: DiffPart[];
  if (midA.length * midB.length > MAX_CELLS) {
    mid = [...midA.map(text => ({ kind: "removed" as const, text })), ...midB.map(text => ({ kind: "added" as const, text }))];
  } else {
    const n = midA.length, m = midB.length;
    const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      lcs[i][j] = midA[i] === midB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    mid = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) { mid.push({ kind: "same", text: midA[i] }); i++; j++; }
      else if (lcs[i + 1][j] >= lcs[i][j + 1]) mid.push({ kind: "removed", text: midA[i++] });
      else mid.push({ kind: "added", text: midB[j++] });
    }
    while (i < n) mid.push({ kind: "removed", text: midA[i++] });
    while (j < m) mid.push({ kind: "added", text: midB[j++] });
  }
  return [...head, ...mid, ...tail];
}

export function diffStats(parts: DiffPart[]) {
  return { added: parts.filter(p => p.kind === "added").length, removed: parts.filter(p => p.kind === "removed").length };
}
