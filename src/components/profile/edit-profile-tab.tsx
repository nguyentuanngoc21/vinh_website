"use client";

import { CoinsIcon } from "@phosphor-icons/react/dist/ssr";
import { TOKEN_LOGS, DEFAULT_TOKEN_BALANCE } from "@/lib/profile";
import { Field, Button } from "@/components/ui";

type EditProfileTabProps = {
  nickname: string;
  bio: string;
  onNicknameChange: (value: string) => void;
  onBioChange: (value: string) => void;
};

export function EditProfileTab({
  nickname,
  bio,
  onNicknameChange,
  onBioChange,
}: EditProfileTabProps) {
  return (
    <div className="grid grid-cols-1 gap-[26px] px-11 pb-[60px] pt-[26px] lg:grid-cols-[1.4fr_.9fr]">
      <div className="rounded-[18px] border border-cream p-[26px]">
        <div className="text-[19px] font-bold text-brand-ink">Chỉnh sửa thông tin cá nhân</div>
        <div className="mt-1.5 text-[13.5px] leading-[1.6] text-stone-dark">
          Tên hiển thị và mô tả sẽ xuất hiện trên trang tác giả cùng mọi bình luận của bạn.
        </div>
        <div className="mt-[22px] flex flex-col gap-[18px]">
          <Field
            label="Nickname"
            value={nickname}
            onChange={(e) => onNicknameChange(e.target.value)}
            className="px-3.5 py-3 text-sm"
            hint="Có thể đổi 1 lần mỗi 30 ngày."
          />
          <label className="block">
            <div className="mb-2 text-[13px] font-semibold text-ink">Mô tả về bản thân</div>
            <textarea
              value={bio}
              onChange={(e) => onBioChange(e.target.value.slice(0, 280))}
              rows={5}
              className="w-full resize-y rounded-xl border border-cream px-3.5 py-3 text-sm leading-[1.65] outline-none focus:border-brand-gold"
            />
            <div className="mt-1.5 text-xs text-stone">{bio.length}/280 ký tự</div>
          </label>
          <div className="flex gap-2.5">
            <Button type="button" className="w-auto px-6 py-[11px] text-sm font-semibold">
              Lưu thay đổi
            </Button>
            <Button type="button" variant="ghost" className="w-auto px-[22px] py-[11px] text-sm font-medium">
              Hủy
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-[18px] bg-brand-ink-dark p-6 text-white">
          <div className="text-[11.5px] font-semibold tracking-[1.3px] text-brand-gold-light">
            SỐ DƯ TOKEN
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <div className="text-[40px] font-extrabold tracking-[-1px] text-brand-gold-light">
              {DEFAULT_TOKEN_BALANCE}
            </div>
            <div className="text-sm font-medium text-sidebar-text-dim-2">token</div>
          </div>
          <div className="mt-2.5 text-[13px] leading-[1.6] text-sidebar-text-dim-2">
            Dùng để mở chương sớm, tặng tác giả và mua ảnh bìa trong thư viện thiết kế.
          </div>
          <Button type="button" className="mt-4 w-auto items-center gap-2 px-5 py-2.5 text-[13.5px] font-semibold">
            <CoinsIcon weight="fill" size={16} /> Nạp thêm token
          </Button>
        </div>
        <div className="rounded-[18px] border border-cream p-5">
          <div className="mb-3 text-[13px] font-semibold text-ink">
            Hoạt động token gần đây
          </div>
          {TOKEN_LOGS.map((log) => (
            <div
              key={log.label}
              className="flex justify-between gap-3 border-t border-[#f5f4f2] py-2.5"
            >
              <div className="text-[13px] text-stone-dark">{log.label}</div>
              <div
                style={{ color: log.amount[0] === "+" ? "#2F7A4F" : "#B02A37" }}
                className="text-[13px] font-bold"
              >
                {log.amount}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
