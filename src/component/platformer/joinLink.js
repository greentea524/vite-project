export function buildJoinLink(
  code,
  href = typeof window !== "undefined" ? window.location.href : "",
) {
  console.log("buildJoinLink called with:", { code, href });
  if (!code || !href) {
    console.log("buildJoinLink returning empty - code or href missing");
    return "";
  }

  const url = new URL(href);
  const currentPath = url.pathname.replace(/\/+$/, "") || "/";
  const targetPath = currentPath.endsWith("/platformer")
    ? currentPath
    : `${currentPath}/platformer`;

  url.pathname = targetPath.endsWith("/") ? targetPath : `${targetPath}/`;
  url.searchParams.set("join", code);
  url.hash = "";
  const result = url.toString();
  console.log("buildJoinLink result:", result);
  return result;
}
