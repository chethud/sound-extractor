export type SoundProvider = "epidemic-sound" | "envato";

const PROVIDER_HOSTS: Record<SoundProvider, Set<string>> = {
  "epidemic-sound": new Set(["epidemicsound.com", "www.epidemicsound.com"]),
  envato: new Set([
    "envato.com",
    "www.envato.com",
    "app.envato.com",
    "elements.envato.com",
  ]),
};

export function detectProvider(url: URL): SoundProvider | null {
  const host = url.hostname.toLowerCase();
  for (const [provider, hosts] of Object.entries(PROVIDER_HOSTS) as Array<
    [SoundProvider, Set<string>]
  >) {
    if (hosts.has(host) || [...hosts].some((allowed) => host.endsWith(`.${allowed}`))) {
      return provider;
    }
  }
  return null;
}

export function validateSoundUrl(raw: string): {
  ok: true;
  url: URL;
  provider: SoundProvider;
} | {
  ok: false;
  code: "invalid_url" | "unsupported_domain";
  error: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      ok: false,
      code: "invalid_url",
      error: "Please paste an Epidemic Sound or Envato URL.",
    };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, code: "invalid_url", error: "That does not look like a valid URL." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, code: "invalid_url", error: "Only http and https URLs are supported." };
  }

  const provider = detectProvider(url);
  if (!provider) {
    return {
      ok: false,
      code: "unsupported_domain",
      error: "Only Epidemic Sound and Envato URLs are supported.",
    };
  }

  return { ok: true, url, provider };
}

/** @deprecated use validateSoundUrl */
export const validateEpidemicUrl = validateSoundUrl;

export function extractTrackId(url: URL): string | null {
  const path = url.pathname;
  const uuidMatch = path.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
  if (uuidMatch) return uuidMatch[0].toLowerCase();

  const trackMatch = path.match(/\/(?:track|tracks|sound-effects|music)\/([^/?#]+)/i);
  if (trackMatch?.[1]) return decodeURIComponent(trackMatch[1]);

  return null;
}

export function detectContentType(url: URL): "music" | "sound-effect" | "unknown" {
  const path = url.pathname.toLowerCase();
  if (path.includes("sound-effect")) return "sound-effect";
  if (path.includes("/music") || path.includes("/track/")) return "music";
  return "unknown";
}
