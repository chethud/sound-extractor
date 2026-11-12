"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import type { AnalyzeSuccess } from "@/lib/types";

type AudioLinkPanelProps = {
  result: AnalyzeSuccess;
};

function absoluteUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }
  if (typeof window === "undefined") return pathOrUrl;
  return new URL(pathOrUrl, window.location.origin).toString();
}

function buildProxyPreviewUrl(sourceUrl: string): string {
  return absoluteUrl(
    `/api/proxy-preview?url=${encodeURIComponent(sourceUrl)}&format=mp3`,
  );
}

function LinkRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-200 transition hover:bg-white/10"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className="block break-all text-sm text-violet-200 underline-offset-2 hover:underline"
      >
        {value}
      </a>
    </div>
  );
}

export function AudioLinkPanel({ result }: AudioLinkPanelProps) {
  const links = useMemo(() => {
    const items: Array<{ label: string; value: string }> = [];

    if (result.previewUrl) {
      items.push({
        label: "Site audio link (MP3 preview)",
        value: absoluteUrl(result.previewUrl),
      });
    }

    if (result.previewSourceUrl) {
      items.push({
        label: "Detected source preview URL",
        value: result.previewSourceUrl,
      });
      items.push({
        label: "Proxy preview URL",
        value: buildProxyPreviewUrl(result.previewSourceUrl),
      });
    }

    return items;
  }, [result.previewUrl, result.previewSourceUrl]);

  if (!result.previewAvailable || links.length === 0) return null;

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="mb-3 flex items-center gap-2">
        <Link2 className="h-4 w-4 text-violet-300" />
        <h3 className="text-lg font-semibold text-white">Audio links</h3>
      </div>
      <p className="mb-4 text-sm text-zinc-400">
        Public preview links detected during scrape. These are for preview playback, not licensed full downloads.
      </p>
      <div className="space-y-3">
        {links.map((item) => (
          <LinkRow key={item.label} label={item.label} value={item.value} />
        ))}
      </div>
    </div>
  );
}
