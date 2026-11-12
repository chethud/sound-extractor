"use client";

import { useState } from "react";
import { Loader2, Search, Trash2, AlertTriangle, Info } from "lucide-react";
import type { AnalyzeResponse, AnalyzeSuccess } from "@/lib/types";
import { ResultCard } from "./ResultCard";
import { AudioPlayer } from "./AudioPlayer";
import { AudioLinkPanel } from "./AudioLinkPanel";
import { DownloadMp3 } from "./DownloadMp3";

const EXAMPLE_URL =
  "https://app.envato.com/sound-effects/0f849e1e-55a0-4319-8531-d46306768007";

export function AnalyzerApp() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeSuccess | null>(null);

  const clearAll = () => {
    setUrl("");
    setError(null);
    setResult(null);
  };

  const analyze = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = (await response.json()) as AnalyzeResponse;

      if (!data.ok) {
        setError(data.error);
        return;
      }

      setResult(data);
    } catch {
      setError("Could not reach the analyzer service. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <section id="analyzer" className="relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-6 sm:p-10">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-blue-600/20 blur-3xl" />

        <div className="relative">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-violet-300">
            Browser automation
          </p>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Sound Link Analyzer
          </h1>
          <p className="mt-3 max-w-2xl text-base text-zinc-400 sm:text-lg">
            Paste an Epidemic Sound or Envato URL and instantly analyze your audio preview.
          </p>

          <div className="mt-8 space-y-3">
            <label htmlFor="sound-url" className="sr-only">
              Sound URL
            </label>
            <input
              id="sound-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !loading) analyze();
              }}
              placeholder="Paste an Epidemic Sound or Envato sound-effect URL"
              className="w-full rounded-2xl border border-white/10 bg-black/50 px-5 py-4 text-base text-white outline-none ring-violet-500/40 transition placeholder:text-zinc-500 focus:border-violet-400/40 focus:ring-2"
            />

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={analyze}
                disabled={loading || !url.trim()}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-blue-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing page…
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" />
                    Analyze Sound
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={clearAll}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3.5 text-sm font-medium text-zinc-200 transition hover:bg-white/10 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Clear
              </button>
            </div>

            <button
              type="button"
              onClick={() => setUrl(EXAMPLE_URL)}
              className="text-left text-xs text-zinc-500 transition hover:text-violet-300"
            >
              Use example Envato sound-effect URL
            </button>
          </div>

          {loading ? (
            <div className="mt-8 flex items-center gap-3 rounded-2xl border border-violet-400/20 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">
              <Loader2 className="h-4 w-4 animate-spin" />
              Launching browser automation, loading the page, and inspecting public metadata…
            </div>
          ) : null}

          {error ? (
            <div className="mt-8 flex items-start gap-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </div>
      </section>

      {result ? (
        <div id="results" className="mt-8 space-y-6 animate-fade-up">
          <ResultCard result={result} />

          {result.previewAvailable && result.previewUrl ? (
            <AudioPlayer
              src={result.previewUrl}
              title={result.title}
              format={result.previewFormat}
            />
          ) : (
            <div className="glass-card flex items-start gap-3 rounded-2xl p-5 text-sm text-zinc-300">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
              <p>
                Preview unavailable. No publicly accessible audio element was found on the page.
              </p>
            </div>
          )}

          <AudioLinkPanel result={result} />

          <DownloadMp3 result={result} />
        </div>
      ) : null}
    </div>
  );
}
