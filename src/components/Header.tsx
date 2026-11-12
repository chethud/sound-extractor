import { AudioLines } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black/60 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 shadow-lg shadow-violet-500/30">
            <AudioLines className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-display text-sm font-semibold tracking-wide text-white">
              Sound Link Analyzer
            </p>
            <p className="text-[11px] text-zinc-500">Webpage metadata analysis</p>
          </div>
        </div>
        <nav className="hidden items-center gap-6 text-sm text-zinc-400 sm:flex">
          <a href="#analyzer" className="transition hover:text-white">
            Analyzer
          </a>
          <a href="#results" className="transition hover:text-white">
            Results
          </a>
        </nav>
      </div>
    </header>
  );
}
