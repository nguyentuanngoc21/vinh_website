"use client";

import { useRouter } from "next/navigation";

export function DesignBackLink({ className = "" }: { className?: string }) {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      router.push("/thiet-ke");
    }
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      className={`inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-brand-gold-dark hover:underline ${className}`}
    >
      ← Thư viện thiết kế
    </button>
  );
}
