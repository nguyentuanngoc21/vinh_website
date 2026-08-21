/**
 * Deterministic variant selection for the auto-generated cover system
 * (src/lib/covers/build-cover-spec.ts). Cùng 1 book id phải luôn chọn ra
 * cùng 1 palette/layout/rotation mỗi lần render — không dùng Math.random()
 * ở đâu trong toàn bộ hệ thống bìa.
 */

// FNV-1a 32-bit — vài dòng, không cần dependency, đủ tốt cho việc chọn
// biến thể (không phải mật mã học). Trả về unsigned 32-bit int.
export function hashString(input: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // hash *= 16777619 (FNV prime), viết bằng shift/add để tránh mất độ
    // chính xác của phép nhân 32-bit thường trong JS.
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Chọn 1 phần tử ổn định từ `arr`, dựa trên `seed` + `namespace`.
 *
 * Namespace riêng cho mỗi lựa chọn (không bit-slice 1 hash chung cho
 * nhiều mod khác nhau) — đơn giản, đúng chắc chắn, không dính lỗi tương
 * quan giữa các lựa chọn dùng chung 1 giá trị hash gốc với modulus khác
 * nhau. Chi phí thêm vài lần hash mỗi sách là không đáng kể.
 */
export function pick<T>(seed: string, namespace: string, arr: readonly T[]): T {
  if (arr.length === 0) {
    throw new Error(`pick(): mảng rỗng cho namespace "${namespace}"`);
  }
  const index = hashString(`${seed}:${namespace}`) % arr.length;
  return arr[index];
}
