import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import {
  convertBufferToMp3,
  extensionFromNameOrType,
  isAlreadyMp3,
} from "@/lib/ffmpeg";

const CACHE_DIR = path.join(process.cwd(), "preview-cache");

function hashUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 32);
}

export function isCachedPreviewId(id: string): boolean {
  return /^[a-f0-9]{32}$/i.test(id);
}

export function cachedPreviewPath(id: string): string {
  return path.join(CACHE_DIR, `${id}.mp3`);
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
 */
export async function materializePreviewAsMp3(sourceUrl: string): Promise<{
  id: string;
  localUrl: string;
  converted: boolean;
  bytes: number;
} | null> {
  try {
    const id = hashUrl(sourceUrl);
    const outputPath = cachedPreviewPath(id);

    await fs.mkdir(CACHE_DIR, { recursive: true });

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
    const mp3 = alreadyMp3
      ? input
      : await convertBufferToMp3(
          input,
          extensionFromNameOrType(sourceUrl, contentType),
        );

    await fs.writeFile(outputPath, mp3);

    return {
      id,
      localUrl: `/api/cached-preview/${id}`,
      converted: !alreadyMp3,
      bytes: mp3.length,
    };
  } catch {
    return null;
  }
}
