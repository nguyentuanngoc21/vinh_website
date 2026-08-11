"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  EyeIcon,
  EyeSlashIcon,
  ArrowRightIcon,
  IdentificationCardIcon,
  CheckCircleIcon,
  InfoIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useRole } from "@/lib/role";
import { Field, Button, Alert, Checkbox } from "@/components/ui";
import { passwordScore, PASSWORD_SCORE_COLORS, PASSWORD_SCORE_LABELS } from "@/lib/password-strength";

type SlotKey = "front" | "back";

export function RegisterForm() {
  const router = useRouter();
  const { register } = useRole();

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

  const filled = [email, uname, nickname, pw, pw2, realname, phone, cccd].every(
    (v) => v.trim().length > 0
  );
  const ready = filled && match && cccdOk && agree && !!files.front && !!files.back && !pending;

  const missing = useMemo(() => {
    const list: string[] = [];
    if (!filled) list.push("điền hết các trường");
    if (pw2.length > 0 && !match) list.push("mật khẩu khớp nhau");
    if (cccd.length > 0 && !cccdOk) list.push("CCCD đủ 12 số");
    if (!files.front || !files.back) list.push("tải cả hai mặt căn cước");
    if (!agree) list.push("đồng ý điều khoản");
    return list;
  }, [filled, pw2, match, cccd, cccdOk, files, agree]);

  const onFile = (slot: SlotKey) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setFiles((prev) => ({ ...prev, [slot]: file }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || !files.front || !files.back) return;
    setPending(true);
    setError(null);
    const result = await register({
      email: email.trim(),
      username: uname,
      nickname: nickname.trim(),
      password: pw,
      realname: realname.trim(),
      phone: phone.trim(),
      cccd: cccdDigits,
      cccdFront: files.front,
      cccdBack: files.back,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/");
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
        2 · XÁC MINH DANH TÍNH
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                { key: "front" as const, title: "Mặt trước" },
                { key: "back" as const, title: "Mặt sau" },
              ]
            ).map((slot) => {
              const file = files[slot.key];
              return (
                <label
                  key={slot.key}
                  style={{
                    borderColor: file ? "#2F7A4F" : "var(--color-border-light)",
                    background: file ? "#F4FAF6" : "#fdfdfc",
                  }}
                  className="flex min-h-[132px] cursor-pointer flex-col items-center justify-center rounded-xl border-[1.5px] border-dashed p-[22px_16px] transition-colors hover:border-brand-gold hover:bg-[#FCFAF4]"
                >
                  <input type="file" accept="image/*" onChange={onFile(slot.key)} className="hidden" />
                  {file ? (
                    <CheckCircleIcon weight="fill" size={26} color="#2F7A4F" />
                  ) : (
                    <IdentificationCardIcon size={26} color="var(--color-stone-light)" />
                  )}
                  <div className="mt-2.5 text-[13.5px] font-semibold text-slate">
                    {file ? `${slot.title} · đã chọn` : slot.title}
                  </div>
                  <div className="mt-1 text-center text-xs text-stone-light">
                    {file ? file.name : "Nhấn để chọn ảnh hoặc kéo vào đây"}
                  </div>
                </label>
              );
            })}
          </div>
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
          <span className="text-brand-gold-dark">Điều khoản sử dụng</span> cùng{" "}
          <span className="text-brand-gold-dark">Chính sách bảo mật</span> của Vịnh.
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
