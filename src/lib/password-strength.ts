/**
 * Shared with register-form and reset-password-form — pulled out so the
 * "how strong is this password" bar/label logic isn't hand-copied into
 * every screen that collects a new password (same reasoning as Field in
 * components/ui: change the rule once here).
 */
export const PASSWORD_SCORE_COLORS = ["#e2e0dc", "#B02A37", "#D98B41", "#C9A83A", "#2F7A4F"];
export const PASSWORD_SCORE_LABELS = [
  "",
  "Yếu — nên thêm chữ số và ký tự đặc biệt",
  "Trung bình",
  "Khá tốt",
  "Mạnh",
];

export function passwordScore(pw: string): number {
  if (pw.length === 0) return 0;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  const base = pw.length >= 12 ? 2 : pw.length >= 8 ? 1 : 0;
  return Math.min(4, Math.max(1, base + classes - 1));
}
