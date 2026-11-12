# sound-extractor

Sound Link Analyzer — paste an Epidemic Sound or Envato URL to extract public metadata and play authorized public preview audio.

## Features

- URL analysis via Playwright browser automation
- Metadata extraction (title, artist, category, track ID)
- Public preview playback (MP3 via FFmpeg when needed)
- Copyable preview audio links
- Owned-audio upload → MP3 export with FFmpeg

## Setup

```bash
npm install
npx playwright install chromium
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (or the next free port).

## Notes

- Preview uses publicly available streams only.
- Licensed full downloads require the provider’s official account/license flow.
- Do not commit `preview-cache/` or `.env` secrets.
