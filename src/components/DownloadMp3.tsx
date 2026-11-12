"use client";

import { useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  Upload,
} from "lucide-react";
import type { AnalyzeSuccess } from "@/lib/types";
import {
  formatBytes,
  pickAuthorizedMp3Url,
  sanitizeFilename,
} from "@/lib/download";

type DownloadMp3Props = {
  result: AnalyzeSuccess;
};

async function saveBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export function DownloadMp3({ result }: DownloadMp3Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [bytesReceived, setBytesReceived] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authorizedUrl = useMemo(
    () => pickAuthorizedMp3Url(result.downloads, result.previewUrl),
    [result.downloads, result.previewUrl],
  );

  const hasAuthorizedDownload = Boolean(authorizedUrl);
  const previewOnly = Boolean(result.previewAvailable && !hasAuthorizedDownload);
  const filename = sanitizeFilename(result.title);

  const streamDownload = async (response: Response) => {
    const total = Number(response.headers.get("content-length") || 0);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Download stream unavailable.");

    const chunks: BlobPart[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        setBytesReceived(received);
        if (total > 0) {
          setProgress(Math.min(99, Math.round((received / total) * 100)));
        } else {
          setProgress((prev) => Math.min(95, prev + 6));
        }
      }
    }

    return {
      blob: new Blob(chunks, {
        type: response.headers.get("content-type") || "audio/mpeg",
      }),
      sizeLabel:
        response.headers.get("x-file-size") ||
        formatBytes(received || total),
      converted: response.headers.get("x-converted") === "true",
    };
  };

  const runAuthorizedDownload = async () => {
    if (!authorizedUrl) {
      setError("No authorized downloadable audio file is available for this link.");
      return;
    }

    setDownloading(true);
    setProgress(6);
    setBytesReceived(0);
    setSuccess(null);
    setError(null);

    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: authorizedUrl,
          title: result.title || "audio",
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Authorized download failed.");
      }

      const { blob, sizeLabel, converted } = await streamDownload(response);
      await saveBlob(blob, filename);
      setProgress(100);
      setSuccess(
        `Downloaded ${filename} (${sizeLabel})${converted ? " · converted to MP3" : ""}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
      setProgress(0);
      setBytesReceived(0);
    } finally {
      setDownloading(false);
    }
  };

  const runOwnedUploadDownload = async (file: File) => {
    setDownloading(true);
    setProgress(10);
    setBytesReceived(0);
    setSuccess(null);
    setError(null);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append(
        "title",
        result.title || file.name.replace(/\.[^.]+$/, "") || "audio",
      );

      const response = await fetch("/api/download-owned", {
        method: "POST",
        body: form,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Owned file download failed.");
      }

      const { blob, sizeLabel, converted } = await streamDownload(response);
      await saveBlob(blob, filename);
      setProgress(100);
      setSuccess(
        `Saved owned audio as ${filename} (${sizeLabel})${
          converted ? " · converted with FFmpeg" : ""
        }`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Owned download failed.");
      setProgress(0);
      setBytesReceived(0);
    } finally {
      setDownloading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-white">Download MP3</h3>
            {hasAuthorizedDownload ? (
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
                Authorized source available
              </span>
            ) : previewOnly ? (
              <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-200">
                Preview only
              </span>
            ) : (
              <span className="rounded-full bg-zinc-500/20 px-2.5 py-1 text-[11px] font-medium text-zinc-300">
                No remote download source
              </span>
            )}
          </div>

          <p className="mt-2 text-sm text-zinc-400">
            {hasAuthorizedDownload
              ? `Ready to download ${filename}`
              : previewOnly
                ? `This page exposed a preview stream only. Get the original file through ${
                    result.provider === "envato" ? "Envato" : "Epidemic Sound"
                  }’s official download after logging in with a valid license, or upload audio you own.`
                : "No authorized remote file was found. Upload audio you own to export an MP3."}
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          {hasAuthorizedDownload ? (
            <button
              type="button"
              onClick={runAuthorizedDownload}
              disabled={downloading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:brightness-110 disabled:opacity-60"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Download MP3
            </button>
          ) : (
            <a
              href={result.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:brightness-110"
            >
              <ExternalLink className="h-4 w-4" />
              Open official download
            </a>
          )}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={downloading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-zinc-100 transition hover:bg-white/10 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            Upload owned audio
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.webm"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) runOwnedUploadDownload(file);
            }}
          />
        </div>
      </div>

      {downloading ? (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
            <span>Downloading / converting…</span>
            <span>
              {progress}%
              {bytesReceived > 0 ? ` · ${formatBytes(bytesReceived)}` : ""}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-black/40">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : null}

      {success ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {success}
        </p>
      ) : null}

      {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}
