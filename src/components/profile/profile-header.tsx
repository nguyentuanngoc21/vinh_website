type ProfileHeaderProps = {
  nickname: string;
  username: string;
  joinedYear: string;
  tokenBalance: string;
};

export function ProfileHeader({ nickname, username, joinedYear, tokenBalance }: ProfileHeaderProps) {
  return (
    <section className="flex items-center gap-[22px] px-11 pt-[30px]">
      <div className="flex h-[82px] w-[82px] shrink-0 items-center justify-center rounded-full bg-brand-ink text-[30px] font-bold text-brand-gold-light">
        {nickname[0]}
      </div>
      <div className="min-w-0">
        <div className="font-[family-name:var(--font-lora)] text-[28px] font-bold leading-[1.2] text-brand-ink">
          {nickname}
        </div>
        <div className="mt-1 text-sm text-stone">
          {username && `@${username}`}
          {username && joinedYear && " · "}
          {joinedYear && `Tham gia từ ${joinedYear}`}
        </div>
        <div className="mt-3 flex flex-wrap gap-5 text-[13.5px] text-stone-dark">
          {/* Đang theo dõi/người theo dõi vẫn là số mock — chưa join
              author_follows theo cả 2 chiều (khác phạm vi "nối nickname/bio/
              token vào DB" lần này), không hiển thị nhầm là số thật. */}
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
