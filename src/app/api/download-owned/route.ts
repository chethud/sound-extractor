import { NextResponse } from "next/server";
import { formatBytes, sanitizeFilename, toResponseBody } from "@/lib/download";
import {
  convertBufferToMp3,
  extensionFromNameOrType,
  isAlreadyMp3,
} from "@/lib/ffmpeg";

export const maxDuration = 60;

const ALLOWED_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/ogg",
  "audio/webm",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
]);

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const title = typeof form.get("title") === "string" ? String(form.get("title")) : "audio";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Please upload an audio file you own." }, { status: 400 });
    }

    if (file.size <= 0) {
      return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
    }

    if (file.size > 80 * 1024 * 1024) {
      return NextResponse.json({ error: "Owned audio files are limited to 80MB." }, { status: 400 });
    }

    const type = (file.type || "").toLowerCase();
    const name = file.name.toLowerCase();
    const looksAudio =
      ALLOWED_TYPES.has(type) ||
      /\.(mp3|wav|ogg|webm|m4a|aac)$/i.test(name);

    if (!looksAudio) {
      return NextResponse.json(
        { error: "Unsupported file type. Upload an audio file you own." },
        { status: 415 },
      );
    }

    const input = Buffer.from(await file.arrayBuffer());
    const filename = sanitizeFilename(title);
    const alreadyMp3 = isAlreadyMp3(name, type, input);
    const output = alreadyMp3
      ? input
      : await convertBufferToMp3(input, extensionFromNameOrType(name, type));

    return new NextResponse(toResponseBody(output, "audio/mpeg"), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(output.length),
        "Cache-Control": "no-store",
        "X-Download-Source": "owned",
        "X-File-Size": formatBytes(output.length),
        "X-Converted": alreadyMp3 ? "false" : "true",
        "X-Original-Format": type || name.split(".").pop() || "unknown",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Owned download failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
