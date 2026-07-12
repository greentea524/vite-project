// Shareable Big 2 invite link (#110): the current /big2/ page with
// ?join=CODE, so a friend (or a QR scan) lands straight in the online
// auto-join flow. Mirrors the invasion/platformer joinLink helpers.
export function buildJoinLink(
  code,
  href = typeof window !== "undefined" ? window.location.href : ""
) {
  if (!code || !href) return "";
  const url = new URL(href);
  url.searchParams.set("join", code);
  url.hash = "";
  return url.toString();
}
