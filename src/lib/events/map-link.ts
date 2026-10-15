/** Accept copied Google Maps links, including their official short-link hosts. */
export function isGoogleMapsUrl(value: string): boolean {
  if (/[\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || value.length > 2000 || url.toString().length > 2000) return false;
    if (url.hostname === "maps.app.goo.gl") return url.pathname.length > 1;
    if (url.hostname === "goo.gl") return url.pathname.startsWith("/maps/") && url.pathname.length > 6;
    if (["maps.google.com", "maps.google.com.vn"].includes(url.hostname)) return true;
    return ["google.com", "www.google.com", "google.com.vn", "www.google.com.vn"].includes(url.hostname)
      && (url.pathname === "/maps" || url.pathname.startsWith("/maps/"));
  } catch { return false; }
}
