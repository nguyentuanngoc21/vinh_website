import localFont from "next/font/local";

// Vendor Lora so builds do not depend on Google Fonts response URL formats.
export const lora = localFont({
  variable: "--font-lora",
  display: "swap",
  fallback: ["Georgia", "serif"],
  adjustFontFallback: "Times New Roman",
  src: [{ path: "../../public/fonts/lora/Lora-Variable.woff", weight: "400 700", style: "normal" }],
});

export const loraWithItalic = localFont({
  variable: "--font-lora",
  display: "swap",
  fallback: ["Georgia", "serif"],
  adjustFontFallback: "Times New Roman",
  src: [
    { path: "../../public/fonts/lora/Lora-Variable.woff", weight: "400 700", style: "normal" },
    { path: "../../public/fonts/lora/Lora-Italic-Variable.woff", weight: "400 700", style: "italic" },
  ],
});
