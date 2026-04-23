import { execFile } from "child_process";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import type { TranscriptResult, TranscriptSegment } from "./api";

export interface LocalWhisperConfig {
  binaryPath: string;
  modelPath: string;
  language: string;
  threads: number;
  extraArgs: string;
}

export const DEFAULT_BINARY_CANDIDATES = [
  "/opt/homebrew/bin/whisper-cli",
  "/opt/homebrew/bin/whisper-cpp",
  "/usr/local/bin/whisper-cli",
  "/usr/local/bin/whisper-cpp",
];

export async function detectWhisperBinary(): Promise<string | null> {
  for (const p of DEFAULT_BINARY_CANDIDATES) {
    try {
      await fs.access(p, fs.constants.X_OK);
      return p;
    } catch {}
  }
  return null;
}

export class LocalWhisperError extends Error {
  constructor(message: string, public stderr?: string) {
    super(message);
  }
}

export class LocalWhisperRunner {
  constructor(private config: LocalWhisperConfig) {}

  async transcribe(
    audioBuf: ArrayBuffer,
    onProgress?: (stage: string) => void
  ): Promise<TranscriptResult> {
    if (!this.config.binaryPath) {
      throw new LocalWhisperError(
        "whisper.cpp binary path not set — install via `brew install whisper-cpp` or set the path in settings."
      );
    }
    if (!this.config.modelPath) {
      throw new LocalWhisperError(
        "whisper.cpp model path not set — download a ggml-*.bin model and point the setting at it."
      );
    }
    try {
      await fs.access(this.config.binaryPath, fs.constants.X_OK);
    } catch {
      throw new LocalWhisperError(
        `whisper binary not executable at ${this.config.binaryPath}`
      );
    }
    try {
      await fs.access(this.config.modelPath, fs.constants.R_OK);
    } catch {
      throw new LocalWhisperError(
        `whisper model not readable at ${this.config.modelPath}`
      );
    }

    onProgress?.("decoding");
    const wavBytes = await decodeToWav16kMono(audioBuf);

    const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), "whipscribe-"));
    const wavPath = path.join(tmpBase, "input.wav");
    const outPrefix = path.join(tmpBase, "output");
    const jsonPath = `${outPrefix}.json`;

    try {
      await fs.writeFile(wavPath, wavBytes);

      const args = [
        "-m", this.config.modelPath,
        "-f", wavPath,
        "-of", outPrefix,
        "-oj",
        "-np",
      ];
      if (this.config.threads > 0) {
        args.push("-t", String(this.config.threads));
      }
      if (this.config.language && this.config.language !== "auto") {
        args.push("-l", this.config.language);
      }
      const extras = this.config.extraArgs.trim();
      if (extras) args.push(...tokenize(extras));

      onProgress?.("running whisper.cpp");
      await runProcess(this.config.binaryPath, args);

      onProgress?.("parsing");
      const raw = await fs.readFile(jsonPath, "utf8");
      return parseWhisperJson(raw);
    } finally {
      fs.rm(tmpBase, { recursive: true, force: true }).catch(() => {});
    }
  }
}

function runProcess(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      { maxBuffer: 64 * 1024 * 1024, timeout: 2 * 60 * 60 * 1000 },
      (err, _stdout, stderr) => {
        if (err) {
          const tail = (stderr || "").split("\n").slice(-10).join("\n");
          reject(
            new LocalWhisperError(
              `whisper.cpp exited with error: ${err.message}`,
              tail
            )
          );
          return;
        }
        resolve();
      }
    );
  });
}

function parseWhisperJson(raw: string): TranscriptResult {
  const obj = JSON.parse(raw);
  const entries: any[] = Array.isArray(obj.transcription) ? obj.transcription : [];
  const segments: TranscriptSegment[] = entries.map((e) => ({
    start: msFromOffset(e?.offsets?.from),
    end: msFromOffset(e?.offsets?.to),
    text: ((e?.text ?? "") as string).trim(),
    speaker: e?.speaker_turn_next ? "Speaker ?" : undefined,
  }));
  const text = segments.map((s) => s.text).join(" ").trim();
  const duration =
    segments.length > 0 ? segments[segments.length - 1].end : undefined;
  return {
    text,
    wordCount: text ? text.split(/\s+/).length : 0,
    duration,
    segments: segments.length ? segments : undefined,
  };
}

function msFromOffset(ms: unknown): number {
  return typeof ms === "number" ? ms / 1000 : 0;
}

function tokenize(s: string): string[] {
  return s.match(/"[^"]*"|\S+/g)?.map((t) => t.replace(/^"|"$/g, "")) ?? [];
}

async function decodeToWav16kMono(buf: ArrayBuffer): Promise<Uint8Array> {
  const decodeCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(buf.slice(0));
  } finally {
    decodeCtx.close().catch(() => {});
  }
  const targetRate = 16000;
  const frames = Math.max(1, Math.ceil(decoded.duration * targetRate));
  const offline = new OfflineAudioContext(1, frames, targetRate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  const pcm = rendered.getChannelData(0);
  return encodeWav16(pcm, targetRate);
}

function encodeWav16(pcm: Float32Array, sampleRate: number): Uint8Array {
  const byteLength = 44 + pcm.length * 2;
  const buf = new ArrayBuffer(byteLength);
  const view = new DataView(buf);
  writeString(view, 0, "RIFF");
  view.setUint32(4, byteLength - 8, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

function writeString(view: DataView, offset: number, s: string): void {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}
