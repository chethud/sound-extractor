import { NextResponse } from "next/server";
import {
  formatBytes,
  isUnauthorizedPreviewUrl,
  sanitizeFilename,
  toResponseBody,
} from "@/lib/download";
import {
  convertBufferToMp3,
  extensionFromNameOrType,
  isAlreadyMp3,
} from "@/lib/ffmpeg";

export const maxDuration = 60;

function isAllowedAuthorizedUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (isUnauthorizedPreviewUrl(url.toString())) return null;
    return url;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const url = typeof body?.url === "string" ? body.url : "";
    const title = typeof body?.title === "string" ? body.title : "audio";

    const target = isAllowedAuthorizedUrl(url);
    if (!target) {
      return NextResponse.json(
        {
          error:
            "No authorized downloadable audio URL was provided. Preview-only streams cannot be downloaded here.",
        },
        { status: 403 },
      );
    }

    const upstream = await fetch(target.toString(), {
      redirect: "follow",
      headers: {
        Accept: "audio/*,application/octet-stream,*/*",
      },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Authorized download failed with status ${upstream.status}.` },
        { status: 502 },
      );
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    if (contentType.includes("text/html")) {
      return NextResponse.json(
        { error: "The authorized download URL did not return an audio file." },
        { status: 422 },
      );
    }

    const input = Buffer.from(await upstream.arrayBuffer());
    const filename = sanitizeFilename(title);
    const alreadyMp3 = isAlreadyMp3(target.pathname, contentType, input);
    const output = alreadyMp3
      ? input
      : await convertBufferToMp3(
          input,
          extensionFromNameOrType(target.pathname, contentType),
        );

    return new NextResponse(toResponseBody(output, "audio/mpeg"), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(output.length),
        "Cache-Control": "no-store",
        "X-Download-Source": "authorized",
        "X-File-Size": formatBytes(output.length),
        "X-Converted": alreadyMp3 ? "false" : "true",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Download failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
