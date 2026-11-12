import type { Page } from "playwright-core";
import * as cheerio from "cheerio";
import type { AnalyzeResponse, DownloadOption } from "./types";
import {
  detectContentType,
  extractTrackId,
  validateSoundUrl,
  type SoundProvider,
} from "./url";
import { materializePreviewAsMp3 } from "./preview-cache";
import { launchAnalyzerBrowser } from "./browser";

const NAVIGATION_TIMEOUT_MS = 45000;
const SELECTOR_WAIT_MS = 12000;

function cleanText(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length ? cleaned : null;
}

function isReasonableField(value: string | null, maxLen = 80): string | null {
  if (!value) return null;
  if (value.length > maxLen) return null;
  if (/log in|create free account|skip to main|cookie/i.test(value)) return null;
  return value;
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const cleaned = cleanText(value);
    if (cleaned) return cleaned;
  }
  return null;
}

function isPublicHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function looksLikeAudioUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes(".mp3") ||
    lower.includes(".wav") ||
    lower.includes(".m4a") ||
    lower.includes(".ogg") ||
    lower.includes("audio") ||
    lower.includes("preview")
  );
}

function isPublicPreviewAudioUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    const epidemicHost =
      host === "audiocdn.epidemicsound.com" || host.endsWith(".epidemicsound.com");
    const envatoHost =
      host.endsWith(".envatousercontent.com") ||
      host.endsWith(".envato.com") ||
      host.includes("envato");

    if (!epidemicHost && !envatoHost) return false;

    return (
      path.includes("/lqmp3/") ||
      path.includes("/preview") ||
      path.endsWith(".mp3") ||
      path.endsWith(".m4a") ||
      path.endsWith(".ogg") ||
      path.endsWith(".aac")
    );
  } catch {
    return false;
  }
}

function collectPreviewFromSeen(seen: Set<string>): string | null {
  return [...seen].find((candidate) => isPublicPreviewAudioUrl(candidate)) || null;
}

async function readAudioElementPreview(page: Page): Promise<string | null> {
  const srcs = await page.evaluate(() =>
    [...document.querySelectorAll("audio")].map(
      (audio) => audio.currentSrc || audio.getAttribute("src") || "",
    ),
  );
  return srcs.find((src) => src && isPublicPreviewAudioUrl(src)) || null;
}

async function clickEpidemicStylePlay(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")];
    const playButtons = buttons.filter((btn) => {
      const label = (btn.getAttribute("aria-label") || "").toLowerCase();
      const className = btn.className || "";
      const rect = btn.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      return (
        label === "play" ||
        label.includes("play") ||
        /TrackPagePlayer_playButton/i.test(className) ||
        /soundEffectTrackPlayButton/i.test(className)
      );
    });

    const preferred =
      playButtons.find((btn) => /TrackPagePlayer_playButton/i.test(btn.className || "")) ||
      playButtons.find((btn) => {
        const h1 = document.querySelector("h1");
        if (!h1) return true;
        const rect = btn.getBoundingClientRect();
        const h1Rect = h1.getBoundingClientRect();
        return Math.abs(rect.top - h1Rect.top) < 220;
      }) ||
      playButtons[0];

    if (!preferred) return false;
    preferred.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    preferred.click();
    return true;
  });
}

async function capturePublicPreviewUrl(
  page: Page,
  seen: Set<string>,
): Promise<string | null> {
  const existing = await readAudioElementPreview(page);
  if (existing) return existing;

  const fromSeenEarly = collectPreviewFromSeen(seen);
  if (fromSeenEarly) return fromSeenEarly;

  // Try play click up to 3 times; Epidemic often loads lqmp3 only after Play.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await clickEpidemicStylePlay(page);

    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const fromDom = await readAudioElementPreview(page);
      if (fromDom) return fromDom;

      const fromNetwork = collectPreviewFromSeen(seen);
      if (fromNetwork) return fromNetwork;

      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  return collectPreviewFromSeen(seen);
}

function stripProviderTitle(raw: string | null, provider: SoundProvider): string | null {
  if (!raw) return null;
  let value = raw;
  if (provider === "envato") {
    value = value
      .replace(/\s*-\s*Sound Effects\s*-\s*Envato\s*$/i, "")
      .replace(/\s*-\s*Music\s*-\s*Envato\s*$/i, "")
      .replace(/\s*\|\s*Envato\s*$/i, "");
  }
  return stripSiteTitle(value);
}

function parseEnvatoArtist(bodyText: string | null | undefined): string | null {
  if (!bodyText) return null;
  const match = bodyText.match(/\nby\s+([A-Za-z0-9._-]+)\n/i);
  return isReasonableField(cleanText(match?.[1] || null), 60);
}

function looksLikeAuthorizedDownload(url: string, text: string): boolean {
  const haystack = `${url} ${text}`.toLowerCase();
  if (haystack.includes("login") || haystack.includes("sign-in") || haystack.includes("signup")) {
    return false;
  }
  return (
    haystack.includes("download") &&
    (haystack.includes(".mp3") ||
      haystack.includes(".wav") ||
      haystack.includes("format=mp3") ||
      haystack.includes("format=wav") ||
      haystack.includes("/download"))
  );
}

function stripSiteTitle(raw: string | null): string | null {
  if (!raw) return null;
  let value = raw
    .replace(/\s*\|\s*Epidemic Sound\s*$/i, "")
    .replace(/^SFX\s*-\s*/i, "")
    .replace(/^Music\s*-\s*/i, "")
    .trim();
  return cleanText(value);
}

function formatDuration(raw: string | null): string | null {
  if (!raw) return null;
  const iso = raw.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (iso) {
    const hours = Number(iso[1] || 0);
    const minutes = Number(iso[2] || 0);
    const seconds = Math.floor(Number(iso[3] || 0));
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }
  const clock = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (clock) return raw;
  return isReasonableField(cleanText(raw), 16);
}

function extractCategoryFromText(text: string | null): string | null {
  if (!text) return null;
  const match = text.match(/Sound Effect Category:\s*([^|,]+)/i);
  if (match?.[1]) return cleanText(match[1]);
  return null;
}

async function dismissCookieBanner(page: Page) {
  const candidates = [
    'button:has-text("Accept")',
    'button:has-text("Accept all")',
    '[aria-label*="Accept"]',
  ];
  for (const selector of candidates) {
    const button = page.locator(selector).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click({ timeout: 2000 }).catch(() => undefined);
      break;
    }
  }
}

async function extractPagePayload(page: Page) {
  return page.evaluate(() => {
    const meta = (name: string) =>
      document
        .querySelector(`meta[property="${name}"], meta[name="${name}"]`)
        ?.getAttribute("content") ?? null;

    const jsonLd: unknown[] = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach((node) => {
      try {
        jsonLd.push(JSON.parse(node.textContent || "null"));
      } catch {
        // ignore invalid JSON-LD blocks
      }
    });

    const audioUrls = Array.from(
      document.querySelectorAll("audio[src], audio source[src], video source[src]"),
    )
      .map((el) => el.getAttribute("src"))
      .filter((src): src is string => Boolean(src));

    const downloadCandidates = Array.from(
      document.querySelectorAll("a[href], button[data-href], [download]"),
    ).map((el) => {
      const href =
        el.getAttribute("href") ||
        el.getAttribute("data-href") ||
        el.getAttribute("download") ||
        "";
      const text = (el.textContent || "").trim();
      return { href, text };
    });

    const heading = document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() || null;

    const main = document.querySelector("main") || document.body;
    const mainText = main?.innerText?.slice(0, 4000) || "";

    // Player UI often shows current time then total duration (e.g. 0:00 / 0:02).
    const timeMatches = [...mainText.matchAll(/\b(\d{1,2}:\d{2})\b/g)].map((m) => m[1]);
    const durationHint =
      timeMatches.find((time, index) => time !== "0:00" && index < 4) ||
      timeMatches[1] ||
      null;
    const artistAnchor = document.querySelector(
      "main a[href*='/artists/'], main a[href*='/artist/'], a[href*='/user/'], a[href*='@']",
    );
    let artist = artistAnchor?.textContent?.replace(/\s+/g, " ").trim() || null;
    if (!artist) {
      const byMatch = mainText.match(/\nby\s+([A-Za-z0-9._-]+)\n/i);
      artist = byMatch?.[1] || null;
    }

    const bodyText = document.body?.innerText?.slice(0, 5000) || "";
    const loginSignals = /log in|create free account|sign in/i.test(bodyText);

    return {
      title: document.title || null,
      ogTitle: meta("og:title"),
      ogDescription: meta("og:description"),
      ogImage: meta("og:image"),
      twitterTitle: meta("twitter:title"),
      twitterDescription: meta("twitter:description"),
      twitterImage: meta("twitter:image"),
      description: meta("description"),
      jsonLd,
      audioUrls,
      downloadCandidates,
      heading,
      artist,
      durationHint,
      bodyText,
      loginSignals,
      html: document.documentElement.outerHTML,
    };
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseJsonLd(jsonLd: unknown[]): {
  title: string | null;
  artist: string | null;
  description: string | null;
  thumbnail: string | null;
  duration: string | null;
  genre: string | null;
  category: string | null;
} {
  const flat: Record<string, unknown>[] = [];

  const walk = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const obj = asRecord(node);
    if (!obj) return;
    flat.push(obj);
    if (obj["@graph"]) walk(obj["@graph"]);
    if (obj.mainEntity) walk(obj.mainEntity);
  };

  walk(jsonLd);

  const musicLike =
    flat.find((item) => {
      const type = item["@type"];
      const typeText = Array.isArray(type) ? type.join(" ") : String(type || "");
      return /MusicRecording|AudioObject|MusicComposition/i.test(typeText);
    }) ||
    flat.find((item) => {
      const type = item["@type"];
      const typeText = Array.isArray(type) ? type.join(" ") : String(type || "");
      return /Product|WebPage/i.test(typeText);
    });

  const pickString = (item: Record<string, unknown> | undefined, key: string): string | null => {
    if (!item) return null;
    const value = item[key];
    if (typeof value === "string") return value;
    const nested = asRecord(value);
    if (nested && typeof nested.name === "string") return nested.name;
    return null;
  };

  const byArtist = musicLike?.byArtist;
  let artist: string | null = null;
  if (typeof byArtist === "string") artist = byArtist;
  else {
    const nested = asRecord(byArtist);
    if (nested && typeof nested.name === "string") artist = nested.name;
  }

  const image = musicLike?.image;
  let thumbnail: string | null = null;
  if (typeof image === "string") thumbnail = image;
  else if (Array.isArray(image) && typeof image[0] === "string") thumbnail = image[0];
  else {
    const nested = asRecord(image);
    if (nested && typeof nested.url === "string") thumbnail = nested.url;
  }

  const description = pickString(musicLike, "description");

  return {
    title: pickString(musicLike, "name"),
    artist,
    description,
    thumbnail,
    duration: pickString(musicLike, "duration"),
    genre: pickString(musicLike, "genre"),
    category: extractCategoryFromText(description),
  };
}

function parseWithCheerio(html: string) {
  const $ = cheerio.load(html);
  const meta = (name: string) =>
    $(`meta[property="${name}"], meta[name="${name}"]`).attr("content") || null;

  return {
    ogTitle: meta("og:title"),
    ogDescription: meta("og:description"),
    ogImage: meta("og:image"),
    description: meta("description"),
    h1: cleanText($("h1").first().text()),
  };
}

export async function analyzeEpidemicUrl(rawUrl: string): Promise<AnalyzeResponse> {
  const validated = validateSoundUrl(rawUrl);
  if (!validated.ok) {
    return { ok: false, code: validated.code, error: validated.error };
  }

  const { url, provider } = validated;
  const trackId = extractTrackId(url);
  const contentType = detectContentType(url);
  const extractedFrom: string[] = ["url"];
  const providerLabel = provider === "envato" ? "Envato" : "Epidemic Sound";

  let browser;
  try {
    browser = await launchAnalyzerBrowser();

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      locale: "en-US",
      viewport: { width: 1440, height: 900 },
    });

    const page = await context.newPage();
    page.setDefaultTimeout(NAVIGATION_TIMEOUT_MS);

    const previewHits = new Set<string>();
    const onPreviewResponse = (response: {
      url: () => string;
      headers: () => Record<string, string>;
    }) => {
      const responseUrl = response.url();
      const type = response.headers()["content-type"] || "";
      if (
        isPublicPreviewAudioUrl(responseUrl) ||
        (type.includes("audio") && /epidemicsound|envato/i.test(responseUrl))
      ) {
        if (isPublicPreviewAudioUrl(responseUrl) || /lqmp3|\.mp3(\?|$)/i.test(responseUrl)) {
          previewHits.add(responseUrl);
        }
      }
    };
    page.on("response", onPreviewResponse);

    const response = await page.goto(url.toString(), {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });

    if (!response) {
      page.off("response", onPreviewResponse);
      return {
        ok: false,
        code: "page_unavailable",
        error: "The page did not respond. Please try again later.",
      };
    }

    const status = response.status();
    if (status >= 400) {
      page.off("response", onPreviewResponse);
      return {
        ok: false,
        code: "page_unavailable",
        error: `The page returned HTTP ${status} and could not be analyzed.`,
      };
    }

    await dismissCookieBanner(page);

    await Promise.race([
      page.waitForSelector("h1, meta[property='og:title'], audio, title", {
        timeout: SELECTOR_WAIT_MS,
      }),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]).catch(() => undefined);

    // Give Epidemic SPA player time to hydrate before clicking Play.
    await new Promise((resolve) => setTimeout(resolve, provider === "envato" ? 3500 : 3000));

    const capturedPreviewUrl = await capturePublicPreviewUrl(page, previewHits);
    page.off("response", onPreviewResponse);

    const payload = await extractPagePayload(page);
    const cheerioData = parseWithCheerio(payload.html);
    const jsonLd = parseJsonLd(payload.jsonLd);

    if (payload.jsonLd.length) extractedFrom.push("json-ld");
    if (payload.ogTitle || cheerioData.ogTitle) extractedFrom.push("open-graph");
    if (payload.heading || cheerioData.h1) extractedFrom.push("dom");
    if (payload.audioUrls.length || capturedPreviewUrl) {
      extractedFrom.push("public-audio-element");
    }

    const title = firstNonEmpty(
      payload.heading,
      stripProviderTitle(jsonLd.title, provider),
      stripProviderTitle(payload.ogTitle, provider),
      stripProviderTitle(cheerioData.ogTitle, provider),
      cheerioData.h1,
      stripProviderTitle(payload.twitterTitle, provider),
      stripProviderTitle(payload.title, provider),
    );

    const description = firstNonEmpty(
      jsonLd.description,
      payload.ogDescription,
      cheerioData.ogDescription,
      payload.description,
      cheerioData.description,
      payload.twitterDescription,
    );

    const artist = isReasonableField(
      firstNonEmpty(
        jsonLd.artist,
        payload.artist,
        parseEnvatoArtist(payload.bodyText),
      ),
    );
    const thumbnail = firstNonEmpty(
      jsonLd.thumbnail,
      payload.ogImage,
      cheerioData.ogImage,
      payload.twitterImage,
    );
    const duration = formatDuration(
      firstNonEmpty(payload.durationHint, jsonLd.duration),
    );
    const category = firstNonEmpty(
      jsonLd.category,
      extractCategoryFromText(description),
      contentType === "sound-effect"
        ? "Sound Effects"
        : contentType === "music"
          ? "Music"
          : provider === "envato"
            ? "Sound Effects"
            : null,
    );
    const genre = isReasonableField(jsonLd.genre);
    const mood = null;

    const rawPreviewUrl =
      (capturedPreviewUrl && isPublicPreviewAudioUrl(capturedPreviewUrl)
        ? capturedPreviewUrl
        : null) ||
      payload.audioUrls.find(
        (candidate) => isPublicHttpUrl(candidate) && isPublicPreviewAudioUrl(candidate),
      ) ||
      payload.audioUrls.find(
        (candidate) => isPublicHttpUrl(candidate) && looksLikeAudioUrl(candidate),
      ) ||
      null;

    // Materialize preview as MP3 on this server (Envato m4a → mp3, Epidemic already mp3).
    let previewUrl: string | null = null;
    let previewFormat: "mp3" | null = null;
    let previewSourceUrl: string | null = rawPreviewUrl;

    if (rawPreviewUrl) {
      const cached = await materializePreviewAsMp3(rawPreviewUrl);
      if (cached) {
        previewUrl = cached.localUrl;
        previewFormat = "mp3";
        if (cached.converted) extractedFrom.push("ffmpeg-mp3");
      } else if (/\.mp3(\?|$)/i.test(rawPreviewUrl) || rawPreviewUrl.includes("/lqmp3/")) {
        previewUrl = rawPreviewUrl;
        previewFormat = "mp3";
      } else {
        previewUrl = rawPreviewUrl;
      }
    }

    const downloads: DownloadOption[] = [];
    for (const candidate of payload.downloadCandidates) {
      if (!isPublicHttpUrl(candidate.href)) continue;
      if (!looksLikeAuthorizedDownload(candidate.href, candidate.text)) continue;

      const lower = `${candidate.href} ${candidate.text}`.toLowerCase();
      const format: DownloadOption["format"] = lower.includes("wav")
        ? "wav"
        : lower.includes("mp3")
          ? "mp3"
          : "other";

      downloads.push({
        format,
        quality: lower.includes("320")
          ? "320 kbps"
          : lower.includes("128")
            ? "128 kbps"
            : undefined,
        url: candidate.href,
        label: cleanText(candidate.text) || `${format.toUpperCase()} download`,
      });
    }

    const uniqueDownloads = downloads.filter(
      (item, index, arr) => arr.findIndex((other) => other.url === item.url) === index,
    );

    const loginRequired = Boolean(payload.loginSignals) && uniqueDownloads.length === 0;
    const downloadAvailable = uniqueDownloads.length > 0;

    if (!title && !thumbnail && !description && !previewUrl) {
      if (loginRequired) {
        return {
          ok: false,
          code: "login_required",
          error:
            "This page appears to require login before track details are available.",
        };
      }
      return {
        ok: false,
        code: "missing_info",
        error: "Could not extract sound information from the publicly accessible page.",
      };
    }

    return {
      ok: true,
      sourceUrl: url.toString(),
      provider,
      contentType,
      trackId,
      title,
      artist,
      duration,
      category,
      genre,
      mood,
      description,
      thumbnail,
      previewUrl,
      previewFormat,
      previewSourceUrl,
      previewAvailable: Boolean(previewUrl),
      downloads: uniqueDownloads,
      downloadAvailable,
      accessMessage: downloadAvailable
        ? null
        : `Please log in to your ${providerLabel} account and obtain the required download access.`,
      loginRequired,
      extractedFrom: [...new Set(extractedFrom)],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown automation error";
    return {
      ok: false,
      code: "automation_failure",
      error: `Browser automation failed: ${message}`,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}
