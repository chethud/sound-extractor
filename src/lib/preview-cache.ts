import { createHash } from "crypto";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import {
  convertBufferToMp3,
  extensionFromNameOrType,
  isAlreadyMp3,
} from "@/lib/ffmpeg";

function isServerlessRuntime() {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.FUNCTION_NAME,
  );
}

function cacheDir() {
  if (isServerlessRuntime()) {
    return path.join(/*turbopackIgnore: true*/ os.tmpdir(), "sound-preview-cache");
  }
  return path.join(/*turbopackIgnore: true*/ process.cwd(), "preview-cache");
}

function hashUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 32);
}

export function isCachedPreviewId(id: string): boolean {
  return /^[a-f0-9]{32}$/i.test(id);
}

export function cachedPreviewPath(id: string): string {
  return path.join(/*turbopackIgnore: true*/ cacheDir(), `${id}.mp3`);
}

export async function readCachedPreview(id: string): Promise<Buffer | null> {
  if (!isCachedPreviewId(id)) return null;
  try {
    return await fs.readFile(cachedPreviewPath(id));
  } catch {
    return null;
  }
}

/**
 * Fetch a public preview URL and materialize it as an MP3 on this server,
 * similar to Epidemic Sound pages that already expose an .mp3 preview.
 * On Vercel, returns a proxy MP3 URL instead of writing to the read-only filesystem.
 */
export async function materializePreviewAsMp3(sourceUrl: string): Promise<{
  id: string;
  localUrl: string;
  converted: boolean;
  bytes: number;
} | null> {
  try {
    const id = hashUrl(sourceUrl);
    const looksMp3 = /\.mp3(\?|$)/i.test(sourceUrl) || sourceUrl.includes("/lqmp3/");

    // Serverless: avoid durable disk cache; stream through proxy instead.
    if (isServerlessRuntime()) {
      return {
        id,
        localUrl: `/api/proxy-preview?url=${encodeURIComponent(sourceUrl)}&format=mp3`,
        converted: !looksMp3,
        bytes: 0,
      };
    }

    const outputPath = cachedPreviewPath(id);
    await fs.mkdir(cacheDir(), { recursive: true });

    try {
      const existing = await fs.readFile(outputPath);
      if (existing.length > 0) {
        return {
          id,
          localUrl: `/api/cached-preview/${id}`,
          converted: false,
          bytes: existing.length,
        };
      }
    } catch {
      // continue and create cache
    }

    const upstream = await fetch(sourceUrl, { redirect: "follow" });
    if (!upstream.ok) return null;

    const input = Buffer.from(await upstream.arrayBuffer());
    if (!input.length) return null;

    const contentType = upstream.headers.get("content-type") || "";
    const alreadyMp3 = isAlreadyMp3(sourceUrl, contentType, input);

    let mp3: Buffer = Buffer.from(input);
    let converted = false;
    if (!alreadyMp3) {
      try {
        mp3 = Buffer.from(
          await convertBufferToMp3(
            input,
            extensionFromNameOrType(sourceUrl, contentType),
          ),
        );
        converted = true;
      } catch {
        // Fall back to proxy conversion for playback.
        return {
          id,
          localUrl: `/api/proxy-preview?url=${encodeURIComponent(sourceUrl)}&format=mp3`,
          converted: true,
          bytes: input.length,
        };
      }
    }

    await fs.writeFile(outputPath, mp3);

    return {
      id,
      localUrl: `/api/cached-preview/${id}`,
      converted,
      bytes: mp3.length,
    };
  } catch {
    return null;
  }
}
