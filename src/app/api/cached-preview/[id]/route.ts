import { NextResponse } from "next/server";
import { toResponseBody } from "@/lib/download";
import { isCachedPreviewId, readCachedPreview } from "@/lib/preview-cache";

export const maxDuration = 30;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!isCachedPreviewId(id)) {
    return NextResponse.json({ error: "Invalid preview id." }, { status: 400 });
  }

  const bytes = await readCachedPreview(id);
  if (!bytes) {
    return NextResponse.json({ error: "Cached MP3 preview not found." }, { status: 404 });
  }

  return new NextResponse(toResponseBody(bytes, "audio/mpeg"), {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=3600",
      "X-Preview-Format": "mp3",
    },
  });
}
