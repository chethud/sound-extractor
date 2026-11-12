import { NextResponse } from "next/server";
import { analyzeEpidemicUrl } from "@/lib/analyze";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const url = typeof body?.url === "string" ? body.url : "";

    if (!url.trim()) {
      return NextResponse.json(
        {
          ok: false,
          code: "invalid_url",
          error: "Please paste an Epidemic Sound URL.",
        },
        { status: 400 },
      );
    }

    const result = await analyzeEpidemicUrl(url);

    if (!result.ok) {
      const status =
        result.code === "invalid_url" || result.code === "unsupported_domain"
          ? 400
          : result.code === "page_unavailable"
            ? 502
            : result.code === "automation_failure"
              ? 500
              : 422;

      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json(
      {
        ok: false,
        code: "unknown",
        error: message,
      },
      { status: 500 },
    );
  }
}
