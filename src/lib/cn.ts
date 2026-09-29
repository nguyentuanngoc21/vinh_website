import { twMerge } from "tailwind-merge";

/**
 * Ghép class cho component dùng chung (src/components/ui/): class truyền
 * qua `className` LUÔN thắng class mặc định cùng thuộc tính.
 *
 * Vì sao cần: Tailwind v4 quyết định class nào thắng theo thứ tự trong
 * stylesheet nó sinh ra, KHÔNG theo thứ tự trong chuỗi className — nên
 * `<Button className="py-2 text-xs">` từng bị `py-[14px] text-[15px]` mặc
 * định đè mất ở hàng chục chỗ. twMerge bỏ class mặc định bị trùng.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return twMerge(classes.filter(Boolean).join(" "));
}
