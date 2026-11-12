"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX, Gauge } from "lucide-react";

type AudioPlayerProps = {
  src: string;
  title?: string | null;
  format?: "mp3" | null;
};

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function toPlayableSrc(src: string, format?: "mp3" | null) {
  // Already materialized on our server as MP3 during scrape.
  if (src.startsWith("/api/cached-preview/")) return src;

  if (src.startsWith("/api/proxy-preview")) {
    if (src.includes("format=")) return src;
    return `${src}${src.includes("?") ? "&" : "?"}format=mp3`;
  }

  // Remote Epidemic-style MP3 can play via proxy without conversion.
  if (format === "mp3" || /\.mp3(\?|$)/i.test(src) || src.includes("/lqmp3/")) {
    return `/api/proxy-preview?url=${encodeURIComponent(src)}&format=mp3`;
  }

  return `/api/proxy-preview?url=${encodeURIComponent(src)}&format=mp3`;
}

export function AudioPlayer({ src, title, format }: AudioPlayerProps) {
  const playableSrc = toPlayableSrc(src, format);
  const alreadyMp3 =
    format === "mp3" ||
    src.startsWith("/api/cached-preview/") ||
    /\.mp3(\?|$)/i.test(src) ||
    src.includes("/lqmp3/");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [readyFormat, setReadyFormat] = useState(alreadyMp3 ? "MP3" : "Preparing MP3…");

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    setError(null);
    setReadyFormat(alreadyMp3 ? "MP3" : "Preparing MP3…");
  }, [playableSrc, alreadyMp3]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurrent(audio.currentTime || 0);
    const onMeta = () => {
      setDuration(audio.duration || 0);
      setReadyFormat("MP3");
    };
    const onEnded = () => setPlaying(false);
    const onError = () => {
      setError("Preview audio could not be loaded as MP3.");
      setPlaying(false);
      setReadyFormat("MP3 unavailable");
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [playableSrc]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = muted ? 0 : volume;
  }, [volume, muted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      contextRef.current?.close().catch(() => undefined);
    };
  }, []);

  const ensureGraph = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!contextRef.current) {
      const ctx = new AudioContext();
      contextRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyserRef.current = analyser;

      if (!sourceRef.current) {
        sourceRef.current = ctx.createMediaElementSource(audio);
        sourceRef.current.connect(analyser);
        analyser.connect(ctx.destination);
      }
    }

    if (contextRef.current.state === "suspended") {
      await contextRef.current.resume();
    }
  };

  const drawWaveform = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const data = new Uint8Array(bufferLength);

    const render = () => {
      analyser.getByteFrequencyData(data);
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, "#7c3aed");
      gradient.addColorStop(1, "#2563eb");
      ctx.fillStyle = gradient;

      const barWidth = width / bufferLength;
      for (let i = 0; i < bufferLength; i += 1) {
        const barHeight = (data[i] / 255) * height;
        const x = i * barWidth;
        const y = (height - barHeight) / 2;
        ctx.fillRect(x, y, Math.max(barWidth - 1, 1), barHeight);
      }

      rafRef.current = requestAnimationFrame(render);
    };

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    render();
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      if (playing) {
        audio.pause();
        setPlaying(false);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        return;
      }

      await ensureGraph();
      await audio.play();
      setPlaying(true);
      drawWaveform();
    } catch {
      setError("Unable to play this MP3 preview.");
      setPlaying(false);
    }
  };

  const onSeek = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrent(value);
  };

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-violet-300/80">Preview</p>
          <h3 className="mt-1 text-lg font-semibold text-white">
            {title || "Public audio preview"}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-violet-500/20 px-2.5 py-1 text-[11px] font-medium text-violet-200">
              Format: {readyFormat}
            </span>
            <span className="rounded-full bg-blue-500/15 px-2.5 py-1 text-[11px] font-medium text-blue-200">
              {src.startsWith("/api/cached-preview/")
                ? "Scraped MP3 on this site"
                : "FFmpeg MP3 preview"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Gauge className="h-4 w-4" />
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-zinc-200 outline-none"
            aria-label="Playback speed"
          >
            {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
              <option key={rate} value={rate}>
                {rate}x
              </option>
            ))}
          </select>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={640}
        height={72}
        className="mb-4 h-16 w-full rounded-xl bg-black/40"
      />

      <audio ref={audioRef} src={playableSrc} preload="metadata" />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-600 text-white shadow-lg shadow-violet-500/30 transition hover:scale-105"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
        </button>

        <div className="min-w-0 flex-1">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(current, duration || 0)}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="seek-range w-full"
            aria-label="Seek"
          />
          <div className="mt-1 flex justify-between text-xs text-zinc-400">
            <span>{formatTime(current)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          className="rounded-lg border border-white/10 p-2 text-zinc-300 transition hover:bg-white/5"
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={(e) => {
            setMuted(false);
            setVolume(Number(e.target.value));
          }}
          className="hidden w-24 sm:block"
          aria-label="Volume"
        />
      </div>

      {error ? <p className="mt-3 text-sm text-amber-300">{error}</p> : null}
    </div>
  );
}
