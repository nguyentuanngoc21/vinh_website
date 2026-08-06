type ProfileHeaderProps = { nickname: string; tokenBalance: string };

export function ProfileHeader({ nickname, tokenBalance }: ProfileHeaderProps) {
  return (
    <section className="flex items-center gap-[22px] px-11 pt-[30px]">
      <div className="flex h-[82px] w-[82px] shrink-0 items-center justify-center rounded-full bg-brand-ink text-[30px] font-bold text-brand-gold-light">
        {nickname[0]}
      </div>
      <div className="min-w-0">
        <div className="font-[family-name:var(--font-lora)] text-[28px] font-bold leading-[1.2] text-brand-ink">
          {nickname}
        </div>
        <div className="mt-1 text-sm text-stone">@minhkhoi · Tham gia từ 2023</div>
        <div className="mt-3 flex flex-wrap gap-5 text-[13.5px] text-stone-dark">
          <div>
            <b className="font-bold text-ink">128</b> đang theo dõi
          </div>
          <div>
            <b className="font-bold text-ink">4.216</b> người theo dõi
          </div>
          <div>
            <b className="font-bold text-brand-gold-dark">{tokenBalance}</b> token
          </div>
        </div>
      </div>
    </section>
  );
}
