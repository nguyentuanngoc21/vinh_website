import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { findBankByCode } from "@/lib/banks";

// Số tài khoản ngân hàng VN thực tế thường dài 6–19 chữ số tuỳ ngân hàng
// (không có chuẩn cố định) — chỉ chặn định dạng rõ ràng sai, không đoán
// đúng-sai theo từng ngân hàng cụ thể.
const ACCOUNT_NUMBER_REGEX = /^\d{6,19}$/;

export async function GET() {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("bank_code, bank_name, bank_account_number")
    .eq("id", userId)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Không tìm thấy hồ sơ." }, { status: 404 });
  }

  return NextResponse.json({
    bankCode: data.bank_code,
    bankName: data.bank_name,
    bankAccountNumber: data.bank_account_number,
  });
}

export async function POST(request: Request) {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const bankCode = typeof body?.bankCode === "string" ? body.bankCode.trim() : "";
  const bankAccountNumber = typeof body?.bankAccountNumber === "string" ? body.bankAccountNumber.trim() : "";

  const bank = findBankByCode(bankCode);
  if (!bank) {
    return NextResponse.json({ error: "Ngân hàng không hợp lệ — vui lòng chọn từ danh sách." }, { status: 400 });
  }
  if (!ACCOUNT_NUMBER_REGEX.test(bankAccountNumber)) {
    return NextResponse.json({ error: "Số tài khoản chỉ gồm chữ số, từ 6 đến 19 ký tự." }, { status: 400 });
  }

  // Không có API ngân hàng thật để xác thực số tài khoản có tồn tại hay
  // không (chưa chọn nhà cung cấp — xem PayoutGatewayAdapter trong
  // withdrawal-service.ts). Điều kiện "khả dụng" ở đây dừng ở: ngân hàng
  // nằm trong danh sách chính thức + đúng định dạng số tài khoản. Việc
  // tên chủ tài khoản khớp real_name đã xác minh được enforce ở
  // WithdrawalService.requestWithdrawal (tên tài khoản luôn lấy từ
  // profiles.real_name, không có cột riêng để lệch khỏi đó).
  const { error } = await supabase
    .from("profiles")
    .update({ bank_code: bank.code, bank_name: bank.shortName, bank_account_number: bankAccountNumber })
    .eq("id", userId);
  if (error) {
    console.error("[profile/bank] update failed:", error);
    return NextResponse.json({ error: "Lưu thông tin ngân hàng thất bại." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
