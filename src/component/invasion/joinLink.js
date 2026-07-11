export function buildJoinLink(
  code,
  href = typeof window !== "undefined" ? window.location.href : "",
) {
  if (!code || !href) return "";

  const url = new URL(href);
  const currentPath = url.pathname.replace(/\/+$/, "") || "/";
  const targetPath = currentPath.endsWith("/space")
    ? currentPath
    : `${currentPath}/space`;

  url.pathname = targetPath.endsWith("/") ? targetPath : `${targetPath}/`;
  url.searchParams.set("join", code);
  url.hash = "";
  return url.toString();
}
