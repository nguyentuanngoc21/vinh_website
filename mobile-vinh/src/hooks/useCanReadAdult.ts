import { useEffect, useState } from 'react';
import { useAuth } from '../providers/AuthProvider';
import { getAdultAccess } from '../services/books';

// 1 lần hỏi cho mỗi tài khoản trong phiên app — nhiều bìa 18+ trên cùng màn hình dùng chung kết quả.
let cached: { userId: string; promise: Promise<boolean> } | null = null;

/** true khi người dùng đã xác thực đủ 18 tuổi — để bỏ làm mờ bìa truyện 18+ ở danh sách. Khách: false. */
export function useCanReadAdult(enabled = true): boolean {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [canRead, setCanRead] = useState<{ userId: string; value: boolean } | null>(null);
  useEffect(() => {
    if (!enabled || !userId) return;
    if (cached?.userId !== userId) {
      cached = { userId, promise: getAdultAccess(userId).then(v => v === 'ok').catch(() => false) };
    }
    let active = true;
    cached.promise.then(value => { if (active) setCanRead({ userId, value }); });
    return () => { active = false; };
  }, [enabled, userId]);
  return enabled && !!userId && canRead?.userId === userId && canRead.value;
}
