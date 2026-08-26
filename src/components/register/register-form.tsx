"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  EyeIcon,
  EyeSlashIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  InfoIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useRole } from "@/lib/role";
import { Field, Button, Alert, Checkbox } from "@/components/ui";
import { passwordScore, PASSWORD_SCORE_COLORS, PASSWORD_SCORE_LABELS } from "@/lib/password-strength";
import { LegalLink } from "@/components/legal/legal-link";
import { CccdUploadTiles, type CccdSlotKey } from "@/components/register/cccd-upload-tiles";

type SlotKey = CccdSlotKey;

export function RegisterForm() {
  const searchParams = useSearchParams();
  // Set by /api/auth/confirm khi link xác nhận đăng ký (trong mail) đã
  // thiếu/hết hạn/dùng rồi — mirror đúng cách forgot-password-form.tsx xử
  // lý error=link-het-han.
  const linkExpired = searchParams.get("error") === "link-het-han";

  const { register } = useRole();
  // Đăng ký xong KHÔNG có session ngay (xem RegisterResult ở lib/auth.ts) —
  // giữ lại email vừa đăng ký để hiện trong màn "cần xác thực" bên dưới.
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [realname, setRealname] = useState("");
  const [phone, setPhone] = useState("");
  const [cccd, setCccd] = useState("");
  const [files, setFiles] = useState<Record<SlotKey, File | null>>({ front: null, back: null });
  const [agree, setAgree] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uname = username.trim();
  const score = passwordScore(pw);
  const match = pw2.length > 0 && pw === pw2;
  const cccdDigits = cccd.replace(/\D/g, "");
  const cccdOk = cccdDigits.length === 12;

  const filled = [email, uname, nickname, pw, pw2, realname, phone].every(
    (v) => v.trim().length > 0
  );
  // CCCD giờ tùy chọn (có thể bổ sung sau trong Thông tin cá nhân) — chỉ
  // bắt buộc hoàn thiện nếu người dùng đã bắt đầu điền dở (nhập số hoặc
  // chọn 1 trong 2 ảnh), tránh vừa cho qua vừa gửi dữ liệu nửa vời.
  const cccdStarted = cccd.length > 0 || !!files.front || !!files.back;
  const cccdComplete = cccdOk && !!files.front && !!files.back;
  const cccdReady = !cccdStarted || cccdComplete;
  const ready = filled && match && cccdReady && agree && !pending;

  const missing = useMemo(() => {
    const list: string[] = [];
    if (!filled) list.push("điền hết các trường");
    if (pw2.length > 0 && !match) list.push("mật khẩu khớp nhau");
    if (cccdStarted && !cccdOk) list.push("CCCD đủ 12 số");
    if (cccdStarted && (!files.front || !files.back)) list.push("tải cả hai mặt căn cước");
    if (!agree) list.push("đồng ý điều khoản");
    return list;
  }, [filled, pw2, match, cccdStarted, cccdOk, files, agree]);

  const onFile = (slot: SlotKey) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setFiles((prev) => ({ ...prev, [slot]: file }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setPending(true);
    setError(null);
    const result = await register({
      email: email.trim(),
      username: uname,
      nickname: nickname.trim(),
      password: pw,
      realname: realname.trim(),
      phone: phone.trim(),
      // Chỉ đính CCCD khi người dùng đã điền đủ cả 3 — bỏ trống hoàn toàn
      // thì không gửi gì, register() ở lib/auth.ts sẽ không set các field
      // này vào FormData.
      ...(cccdComplete && files.front && files.back
        ? { cccd: cccdDigits, cccdFront: files.front, cccdBack: files.back }
        : {}),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSubmittedEmail(email.trim());
  };

  // pw2 / cccd validation status, computed once and handed to <Field status=…>
  // instead of each field hand-rolling its own inline `style={{ color: … }}`.
  const pw2Status =
    pw2.length === 0
      ? undefined
      : match
        ? ({ tone: "success", message: "Mật khẩu khớp" } as const)
        : ({ tone: "error", message: "Hai mật khẩu chưa khớp" } as const);

  const cccdStatus =
    cccd.length === 0
      ? undefined
      : cccdOk
        ? ({ tone: "success", message: "Số hợp lệ" } as const)
        : ({ tone: "error", message: `Đã nhập ${cccdDigits.length}/12 chữ số` } as const);

  // Tài khoản đã tạo xong (auth.users + profiles + identity_verifications)
  // nhưng chưa đăng nhập được — chặn ở đây đúng như forgot-password-form.tsx
  // chặn sau khi gửi mail, thay vì router.push("/") như trước.
  if (submittedEmail) {
    return (
      <div className="mx-auto w-full max-w-[400px]">
        <CheckCircleIcon weight="fill" size={40} color="#2F7A4F" />
        <div className="mt-4 text-[24px] font-bold tracking-[-0.4px] text-brand-ink">
          Cần bạn xác thực tài khoản
        </div>
        <div className="mt-2 text-[14.5px] leading-[1.6] text-stone">
          Chúng tôi đã gửi một email xác nhận tới{" "}
          <span className="font-medium text-slate">{submittedEmail}</span>. Bấm vào liên kết
          trong email đó để hoàn tất đăng ký — tài khoản chỉ dùng được sau khi xác nhận.
        </div>
        <div className="mt-3 text-[13px] leading-[1.6] text-stone-light">
          Không thấy email? Kiểm tra thêm thư mục Spam, hoặc đợi vài phút rồi thử lại.
        </div>
        <Link
          href="/dang-nhap"
          className="mt-6 flex items-center justify-center gap-[9px] rounded-[10px] border border-brand-ink py-[13px] text-[14.5px] font-semibold text-brand-ink no-underline transition-transform active:scale-[.99]"
        >
          <ArrowLeftIcon size={16} /> Quay lại đăng nhập
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-[520px]">
      <div className="text-[30px] font-bold tracking-[-0.6px] text-brand-ink">
        Đăng ký tài khoản
      </div>
      <div className="mt-2 text-[14.5px] text-stone">
        Đã có tài khoản?{" "}
        <Link href="/dang-nhap" className="font-medium text-brand-gold-dark hover:text-brand-gold">
          Đăng nhập
        </Link>
      </div>

      {linkExpired && !error && (
        <div className="mt-4">
          <Alert tone="error">
            Liên kết xác nhận đăng ký đã hết hạn hoặc không hợp lệ. Vui lòng điền lại thông tin bên
            dưới — hệ thống sẽ gửi lại email xác nhận.
          </Alert>
        </div>
      )}

      <div className="mb-3.5 mt-[30px] text-[11.5px] font-semibold tracking-[1.3px] text-brand-gold-dark">
        1 · THÔNG TIN TÀI KHOẢN
      </div>
      <div className="flex flex-col gap-3.5">
        <Field
          label="Email"
          type="text"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ban@email.com"
        />

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Field
            label="Tên tài khoản"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="minhkhoi"
            hint={
              uname
                ? `vinh.vn/@${uname.toLowerCase().replace(/\s+/g, "")}`
                : "Dùng để đăng nhập, không đổi được"
            }
          />
          <Field
            label="Nickname"
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Minh Khôi"
            hint="Tên hiển thị cho người đọc"
          />
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div>
            <Field
              label="Mật khẩu"
              type={showPw ? "text" : "password"}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="••••••••"
              suffix={
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  className="cursor-pointer text-stone-light"
                >
                  {showPw ? <EyeSlashIcon size={19} /> : <EyeIcon size={19} />}
                </button>
              }
            />
            <div className="mt-2 flex gap-1">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{ background: i < score ? PASSWORD_SCORE_COLORS[score] : "#efedea" }}
                  className="h-1 flex-1 rounded-full transition-colors"
                />
              ))}
            </div>
            <div
              style={{ color: score >= 3 ? "#2F7A4F" : "var(--color-stone-light)" }}
              className="mt-1.5 text-xs"
            >
              {PASSWORD_SCORE_LABELS[score] || "Ít nhất 8 ký tự"}
            </div>
          </div>
          <Field
            label="Xác thực mật khẩu"
            type={showPw ? "text" : "password"}
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            placeholder="••••••••"
            status={pw2Status}
            hint="Nhập lại để chắc chắn"
          />
        </div>
      </div>

      <div className="mb-3.5 mt-[30px] text-[11.5px] font-semibold tracking-[1.3px] text-brand-gold-dark">
        2 · XÁC MINH DANH TÍNH{" "}
        <span className="font-normal normal-case tracking-normal text-stone-light">
          (tùy chọn — có thể bổ sung sau trong Thông tin cá nhân)
        </span>
      </div>
      <div className="flex flex-col gap-3.5">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Field
            label="Tên thật"
            type="text"
            value={realname}
            onChange={(e) => setRealname(e.target.value)}
            placeholder="Nguyễn Minh Khôi"
          />
          <Field
            label="Số điện thoại"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="09xx xxx xxx"
          />
        </div>

        <Field
          label="Số căn cước công dân"
          type="text"
          inputMode="numeric"
          value={cccd}
          onChange={(e) => setCccd(e.target.value)}
          placeholder="12 chữ số"
          className="tracking-[1px]"
          status={cccdStatus}
          hint="Nhập đúng 12 chữ số trên thẻ CCCD gắn chip"
        />

        <div>
          <div className="mb-[7px] text-[13px] font-semibold text-slate">
            Ảnh căn cước công dân
          </div>
          <CccdUploadTiles files={files} onFile={onFile} />
          <div className="mt-3 flex items-start gap-2 rounded-[10px] border border-[#F0E3C4] bg-cream-card p-[11px_13px]">
            <InfoIcon size={16} color="var(--color-brand-gold-dark)" className="mt-0.5 shrink-0" />
            <div className="text-[12.5px] leading-[1.55] text-stone-dark">
              Ảnh JPG hoặc PNG, dưới 5 MB, chụp rõ bốn góc và không che số. Vịnh chỉ dùng để đối
              chiếu khi có tranh chấp bản quyền.
            </div>
          </div>
        </div>
      </div>

      <div className="mt-[26px]">
        <Checkbox checked={agree} onChange={() => setAgree((v) => !v)}>
          Tôi xác nhận thông tin trên là chính xác và đồng ý với{" "}
          <LegalLink doc="terms" className="text-brand-gold-dark">Điều khoản sử dụng</LegalLink> cùng{" "}
          <LegalLink doc="privacy" className="text-brand-gold-dark">Chính sách bảo mật</LegalLink> của Vịnh.
        </Checkbox>
      </div>

      {error && (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="mt-[22px]">
        <Button type="submit" disabled={!ready}>
          {pending ? (
            "Đang tạo tài khoản…"
          ) : ready ? (
            <>
              Tạo tài khoản <ArrowRightIcon size={16} />
            </>
          ) : (
            "Hoàn tất thông tin để tiếp tục"
          )}
        </Button>
      </div>
      <div className="mt-3 text-center text-[12.5px] text-stone-light">
        {ready
          ? "Bạn sẽ nhận 100 token chào mừng sau khi xác thực."
          : `Còn thiếu: ${missing.join(" · ")}`}
      </div>
    </form>
  );
}
