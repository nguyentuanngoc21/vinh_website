import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { findBankByCode } from "@/lib/banks";

// Số tài khoản ngân hàng VN thực tế thường dài 6–19 chữ số tuỳ ngân hàng
// (không có chuẩn cố định) — chỉ chặn định dạng rõ ràng sai, không đoán
// đúng-sai theo từng ngân hàng cụ thể.
const ACCOUNT_NUMBER_REGEX = /^\d{6,19}$/;
const ACCOUNT_NAME_MAX = 100;

export async function GET() {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("bank_code, bank_name, bank_account_number, bank_account_name")
    .eq("id", userId)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Không tìm thấy hồ sơ." }, { status: 404 });
  }

  return NextResponse.json({
    bankCode: data.bank_code,
    bankName: data.bank_name,
    bankAccountNumber: data.bank_account_number,
    bankAccountName: data.bank_account_name,
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
  const bankAccountName = typeof body?.bankAccountName === "string" ? body.bankAccountName.trim() : "";

  const bank = findBankByCode(bankCode);
  if (!bank) {
    return NextResponse.json({ error: "Ngân hàng không hợp lệ — vui lòng chọn từ danh sách." }, { status: 400 });
  }
  if (!ACCOUNT_NUMBER_REGEX.test(bankAccountNumber)) {
    return NextResponse.json({ error: "Số tài khoản chỉ gồm chữ số, từ 6 đến 19 ký tự." }, { status: 400 });
  }
  if (!bankAccountName || bankAccountName.length > ACCOUNT_NAME_MAX) {
    return NextResponse.json(
      { error: `Vui lòng nhập tên chủ tài khoản (tối đa ${ACCOUNT_NAME_MAX} ký tự).` },
      { status: 400 }
    );
  }

  // Không có API ngân hàng thật để xác thực số tài khoản + tên chủ tài
  // khoản có khớp thật ngoài đời hay không (chưa chọn nhà cung cấp — xem
  // PayoutGatewayAdapter trong withdrawal-service.ts). Điều kiện "khả
  // dụng" ở đây dừng ở: ngân hàng nằm trong danh sách chính thức + đúng
  // định dạng số tài khoản + có tên chủ tài khoản. Tên chủ tài khoản do
  // người dùng tự khai, KHÔNG ép khớp real_name (xem
  // migrations/20260827_add_bank_account_name.sql) — chủ tài khoản có
  // thể không phải chính người lập hồ sơ (mượn tài khoản người thân), và
  // nhiều ngân hàng in tên không dấu nên khó so khớp cứng với real_name
  // có dấu dù đúng người. Đúng/sai thông tin này là trách nhiệm của
  // người dùng khai báo.
  const { error } = await supabase
    .from("profiles")
    .update({
      bank_code: bank.code,
      bank_name: bank.shortName,
      bank_account_number: bankAccountNumber,
      bank_account_name: bankAccountName,
    })
    .eq("id", userId);
  if (error) {
    console.error("[profile/bank] update failed:", error);
    return NextResponse.json({ error: "Lưu thông tin ngân hàng thất bại." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
