"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { Disc3, Hash, Music2, Sparkles, Tag } from "lucide-react";
import type { AnalyzeSuccess } from "@/lib/types";

function Field({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
      <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500">
        {icon}
        {label}
      </div>
      <p className="truncate text-sm font-medium text-zinc-100">
        {value || "Not available"}
      </p>
    </div>
  );
}

export function ResultCard({ result }: { result: AnalyzeSuccess }) {
  return (
    <div className="glass-card overflow-hidden rounded-2xl">
      <div className="grid gap-0 md:grid-cols-[220px_1fr]">
        <div className="relative min-h-52 bg-gradient-to-br from-violet-600/30 to-blue-700/20">
          {result.thumbnail ? (
            <Image
              src={result.thumbnail}
              alt={result.title || "Track artwork"}
              fill
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full min-h-52 items-center justify-center">
              <Music2 className="h-12 w-12 text-violet-200/70" />
            </div>
          )}
        </div>

        <div className="p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-violet-500/20 px-3 py-1 text-xs font-medium text-violet-200">
              {result.contentType === "sound-effect"
                ? "Sound Effect"
                : result.contentType === "music"
                  ? "Music Track"
                  : "Unknown type"}
            </span>
            {result.loginRequired ? (
              <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-200">
                Login may be required for downloads
              </span>
            ) : null}
          </div>

          <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">
            {result.title || "Not available"}
          </h2>
          <p className="mt-2 line-clamp-3 text-zinc-400">
            {result.description || "Not available"}
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Field icon={<Disc3 className="h-3.5 w-3.5" />} label="Category" value={result.category} />
            <Field icon={<Tag className="h-3.5 w-3.5" />} label="Genre" value={result.genre} />
            <Field icon={<Sparkles className="h-3.5 w-3.5" />} label="Mood" value={result.mood} />
            <Field icon={<Hash className="h-3.5 w-3.5" />} label="Track ID" value={result.trackId} />
          </div>

          <p className="mt-4 text-xs text-zinc-500">
            Extracted from: {result.extractedFrom.join(", ")}
          </p>
        </div>
      </div>
    </div>
  );
}
