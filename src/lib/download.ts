export function sanitizeFilename(title: string | null | undefined, fallback = "audio"): string {
  const base = (title || fallback)
    .normalize("NFKD")
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);

  return `${base || fallback}.mp3`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "Unknown size";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function isUnauthorizedPreviewUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if (!host.includes("epidemicsound.com") && !host.includes("epidemic")) {
      return false;
    }

    return (
      path.includes("/lqmp3/") ||
      path.includes("/preview") ||
      path.includes("/stream") ||
      /preview/i.test(parsed.search)
    );
  } catch {
    return true;
  }
}

export function pickAuthorizedMp3Url(
  downloads: Array<{ url: string; format: string }>,
  previewUrl?: string | null,
): string | null {
  const preferred = downloads.find((item) => {
    if (isUnauthorizedPreviewUrl(item.url)) return false;
    if (previewUrl && item.url === previewUrl) return false;
    return item.format === "mp3" || /\.mp3(\?|$)/i.test(item.url);
  });

  if (preferred) return preferred.url;

  const anyAuthorized = downloads.find((item) => {
    if (isUnauthorizedPreviewUrl(item.url)) return false;
    if (previewUrl && item.url === previewUrl) return false;
    return true;
  });

  return anyAuthorized?.url || null;
}
