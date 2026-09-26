/**
 * Khung chung cho API công khai /api/contests/* — danh tính qua
 * getRequestContext() (cookie web hoặc Bearer token của app mobile), lỗi
 * nghiệp vụ đổi thành status + thông báo tiếng Việt.
 */
import { getRequestContext, requestError } from "@/lib/mobile/request-context";
import { contestErrorResponse } from "@/lib/contests/route-helpers";

type Ctx = Awaited<ReturnType<typeof getRequestContext>>;

export async function withContestContext(
  request: Request,
  context: string,
  handler: (ctx: Ctx) => Promise<Response>
): Promise<Response> {
  let ctx: Ctx;
  try {
    ctx = await getRequestContext(request);
  } catch (error) {
    return requestError(error);
  }
  try {
    return await handler(ctx);
  } catch (error) {
    return contestErrorResponse(error, context);
  }
}

/** Dữ liệu phụ thuộc người xem — không cho CDN/trình duyệt cache chung. */
export const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;

export function unauthorized() {
  return Response.json({ error: "Vui lòng đăng nhập.", code: "not_logged_in" }, { status: 401, headers: PRIVATE_NO_STORE });
}
