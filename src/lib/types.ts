export type ContentType = "music" | "sound-effect" | "unknown";
export type SoundProvider = "epidemic-sound" | "envato";

export type DownloadOption = {
  format: "mp3" | "wav" | "other";
  quality?: string;
  fileSize?: string;
  url: string;
  label: string;
};

export type AnalyzeSuccess = {
  ok: true;
  sourceUrl: string;
  provider: SoundProvider;
  contentType: ContentType;
  trackId: string | null;
  title: string | null;
  artist: string | null;
  duration: string | null;
  category: string | null;
  genre: string | null;
  mood: string | null;
  description: string | null;
  thumbnail: string | null;
  previewUrl: string | null;
  previewFormat: "mp3" | null;
  previewSourceUrl: string | null;
  previewAvailable: boolean;
  downloads: DownloadOption[];
  downloadAvailable: boolean;
  accessMessage: string | null;
  loginRequired: boolean;
  extractedFrom: string[];
};

export type AnalyzeFailure = {
  ok: false;
  error: string;
  code:
    | "invalid_url"
    | "unsupported_domain"
    | "page_unavailable"
    | "automation_failure"
    | "login_required"
    | "missing_info"
    | "unknown";
};

export type AnalyzeResponse = AnalyzeSuccess | AnalyzeFailure;
