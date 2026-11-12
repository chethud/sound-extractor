import { NextResponse } from "next/server";
import { toResponseBody } from "@/lib/download";
import {
  convertBufferToMp3,
  extensionFromNameOrType,
  isAlreadyMp3,
} from "@/lib/ffmpeg";

export const maxDuration = 60;

function isAllowedPreviewUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();

    const epidemicHost =
      host === "audiocdn.epidemicsound.com" || host.endsWith(".epidemicsound.com");
    const envatoHost =
      host.endsWith(".envatousercontent.com") ||
      host.endsWith(".envatoassets.com") ||
      host.includes("envatousercontent");

    if (!epidemicHost && !envatoHost) return null;

    const allowedPath =
      path.includes("/lqmp3/") ||
      path.includes("/preview") ||
      path.endsWith(".mp3") ||
      path.endsWith(".m4a") ||
      path.endsWith(".ogg") ||
      path.endsWith(".aac");

    return allowedPath ? url : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("url");
  const wantMp3 = (searchParams.get("format") || "mp3").toLowerCase() === "mp3";

  if (!raw) {
    return NextResponse.json({ error: "Missing preview url." }, { status: 400 });
  }

  const target = isAllowedPreviewUrl(raw);
  if (!target) {
    return NextResponse.json(
      { error: "Preview URL is not an allowed public Epidemic Sound or Envato audio URL." },
      { status: 400 },
    );
  }

  try {
    const upstream = await fetch(target.toString(), {
      redirect: "follow",
    });

    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json(
        { error: `Preview fetch failed with status ${upstream.status}.` },
        { status: 502 },
      );
    }

    const input = Buffer.from(await upstream.arrayBuffer());
    const upstreamType = upstream.headers.get("content-type") || "";
    const alreadyMp3 = isAlreadyMp3(target.pathname, upstreamType, input);

    if (!wantMp3 || alreadyMp3) {
      const type = alreadyMp3 ? "audio/mpeg" : upstreamType || "application/octet-stream";
      return new NextResponse(toResponseBody(input, type), {
        status: 200,
        headers: {
          "Content-Type": type,
          "Cache-Control": "private, max-age=300",
          "Content-Length": String(input.length),
          "X-Preview-Format": alreadyMp3 ? "mp3" : "original",
        },
      });
    }

    const mp3 = await convertBufferToMp3(
      input,
      extensionFromNameOrType(target.pathname, upstreamType),
    );

    return new NextResponse(toResponseBody(mp3, "audio/mpeg"), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=300",
        "Content-Length": String(mp3.length),
        "X-Preview-Format": "mp3",
        "X-Converted": "true",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Preview proxy failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
