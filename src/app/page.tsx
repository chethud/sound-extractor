import { Header } from "@/components/Header";
import { AnalyzerApp } from "@/components/AnalyzerApp";

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <AnalyzerApp />
      </main>
      <footer className="border-t border-white/10 py-6 text-center text-xs text-zinc-500">
        Sound Link Analyzer · Public webpage metadata only · No official API · No access bypass
      </footer>
    </>
  );
}
