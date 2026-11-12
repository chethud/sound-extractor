import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";

if (!ffmpegPath) {
  throw new Error("ffmpeg-static binary was not found.");
}

ffmpeg.setFfmpegPath(ffmpegPath);

export async function convertBufferToMp3(
  input: Buffer,
  inputExtension = "bin",
): Promise<Buffer> {
  const id = randomUUID();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sound-mp3-"));
  const inputPath = path.join(tmpDir, `${id}.${inputExtension.replace(/^\./, "")}`);
  const outputPath = path.join(tmpDir, `${id}.mp3`);

  try {
    await fs.writeFile(inputPath, input);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec("libmp3lame")
        .audioBitrate("320k")
        .audioChannels(2)
        .audioFrequency(44100)
        .format("mp3")
        .on("end", () => resolve())
        .on("error", (error: Error) => reject(error))
        .save(outputPath);
    });

    return await fs.readFile(outputPath);
  } finally {
    await Promise.allSettled([
      fs.unlink(inputPath),
      fs.unlink(outputPath),
      fs.rmdir(tmpDir),
    ]);
  }
}

export function extensionFromNameOrType(name: string, type: string): string {
  const fromName = name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;

  if (type.includes("wav")) return "wav";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("webm")) return "webm";
  if (type.includes("mp4") || type.includes("m4a")) return "m4a";
  if (type.includes("aac")) return "aac";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  return "bin";
}

export function isAlreadyMp3(name: string, type: string, bytes: Buffer): boolean {
  const lowerName = name.toLowerCase();
  const lowerType = type.toLowerCase();
  if (lowerType.includes("mpeg") || lowerType.includes("mp3") || lowerName.endsWith(".mp3")) {
    return true;
  }
  if (bytes.length > 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return true;
  if (bytes.length > 2 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return true;
  }
  return false;
}
