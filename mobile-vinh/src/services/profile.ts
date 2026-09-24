import { mobileApi } from './api';
import { requireSupabase } from './supabase';
import type { PreparedImage } from './images';

export type MyProfile = {
  username: string; nickname: string; bio: string; nicknameUpdatedAt: string | null;
  avatarUrl: string | null; coverImageUrl: string | null;
  realName: string; phone: string; dateOfBirth: string | null; address: string;
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
