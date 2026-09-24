import { mobileApi } from './api';
import { requireSupabase } from './supabase';
import type { PreparedImage } from './images';

export type MyProfile = {
  username: string; nickname: string; bio: string; nicknameUpdatedAt: string | null;
  avatarUrl: string | null; coverImageUrl: string | null;
  realName: string; phone: string; dateOfBirth: string | null; address: string;
  currentQuestStreak: number;
};
export const NICKNAME_MAX = 40;
export const BIO_MAX = 280;

export function getMyProfile(userId: string) {
  return mobileApi<MyProfile>('profile', userId);
}
/** Only the fields present are sent; the server applies the 30-day nickname cooldown. */
export function updateMyProfile(userId: string, fields: Partial<Pick<MyProfile, 'nickname' | 'bio' | 'realName' | 'phone' | 'address'>> & { dateOfBirth?: string }) {
  return mobileApi<{ ok: true; nickname: string }>('profile', userId, fields);
}

type ImageKind = 'avatar' | 'cover';
// Same three steps as the web profile header: signed upload URL → upload straight to
// Storage (bypassing the backend body limit) → confirm so the server saves the public URL.
export async function uploadProfileImage(userId: string, kind: ImageKind, image: PreparedImage) {
  const target = await mobileApi<{ path: string; token: string }>(`profile/${kind}`, userId, { action: 'upload-url', contentType: image.type });
  const bytes = await (await fetch(image.uri)).arrayBuffer();
  const { error } = await requireSupabase().storage.from('avatars')
    .uploadToSignedUrl(target.path, target.token, bytes, { contentType: image.type });
  if (error) throw new Error(kind === 'avatar' ? 'Tải ảnh đại diện thất bại. Vui lòng thử lại.' : 'Tải ảnh bìa thất bại. Vui lòng thử lại.');
  const result = await mobileApi<{ avatarUrl?: string; coverImageUrl?: string }>(`profile/${kind}`, userId, { action: 'confirm', path: target.path });
  return (kind === 'avatar' ? result.avatarUrl : result.coverImageUrl) ?? null;
}
export async function removeProfileImage(userId: string, kind: ImageKind) {
  await mobileApi(`profile/${kind}`, userId, { action: 'remove' });
}

export type IdentityStatus = { cccdVerified: boolean; cccdNumberMasked: string | null; cccdIssuedAt: string | null };
export function getIdentity(userId: string) {
  return mobileApi<IdentityStatus>('profile/identity', userId);
}
/** Multipart like the web identity form; the server OCR-checks the number against both images. */
export function submitIdentity(userId: string, form: FormData) {
  return mobileApi<IdentityStatus & { ok: true }>('profile/identity', userId, form);
}

export type Bank = { code: string; name: string; shortName: string };
export type BankDetails = { bankCode: string | null; bankName: string | null; bankAccountNumber: string | null; bankAccountName: string | null; banks: Bank[] };
export function getBank(userId: string) {
  return mobileApi<BankDetails>('profile/bank', userId);
}
export function saveBank(userId: string, details: { bankCode: string; bankAccountNumber: string; bankAccountName: string }) {
  return mobileApi<{ ok: true }>('profile/bank', userId, details);
}

/** "dd/mm/yyyy" typed by the user → "yyyy-mm-dd" for the API; "" stays "" (clears), null when invalid. */
export function toIsoDate(value: string) {
  const text = value.trim();
  if (!text) return '';
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (!match) return null;
  const [, d, m, y] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (y < 1900 || date.getTime() > Date.now()) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
export function fromIsoDate(value: string | null) {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}
// Picker dates use local calendar fields (not UTC) so a chosen day never shifts across time zones.
export function isoFromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function dateFromIso(value: string | null) {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}
