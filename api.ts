import { requestUrl } from "obsidian";

const BASE = "https://whipscribe.com/api/v1";

export interface SubmitResult {
  jobId: string;
  claimToken?: string;
}

export interface JobStatus {
  status: "queued" | "processing" | "done" | "failed";
  progress?: number;
  error?: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface TranscriptResult {
  text: string;
  wordCount: number;
  duration?: number;
  segments?: TranscriptSegment[];
}

interface SubmitResponse {
  job_id?: string;
  id?: string;
  claim_token?: string;
}

interface StatusResponse {
  status: JobStatus["status"];
  progress?: number;
  error?: string;
}

interface ResultSegmentPayload {
  start?: number;
  end?: number;
  text?: string;
  speaker?: string;
}

interface ResultResponse {
  text?: string;
  duration?: number;
  segments?: ResultSegmentPayload[];
}

interface ErrorResponse {
  error?: string;
  message?: string;
}

export class WhipScribeApi {
  private claimToken: string | null = null;

  constructor(private apiKey: string) {}

  async upload(filename: string, blob: Blob): Promise<SubmitResult> {
    const boundary =
      "----WhipScribeBoundary" + Math.random().toString(16).slice(2);
    const body = await buildMultipart(boundary, filename, blob);
    const headers: Record<string, string> = {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Idempotency-Key": cryptoRandom(),
    };
    if (this.apiKey) headers["X-API-Key"] = this.apiKey;

    const res = await httpJson<SubmitResponse>({
      url: `${BASE}/transcribe`,
      method: "POST",
      headers,
      body,
    });
    const jobId = res.job_id ?? res.id;
    if (!jobId) throw new Error("server did not return a job id");
    this.claimToken = res.claim_token ?? null;
    return { jobId, claimToken: this.claimToken ?? undefined };
  }

  async status(jobId: string): Promise<JobStatus> {
    const res = await httpJson<StatusResponse>({
      url: `${BASE}/jobs/${encodeURIComponent(jobId)}`,
      method: "GET",
      headers: this.authHeaders(),
    });
    return {
      status: res.status,
      progress: typeof res.progress === "number" ? res.progress : undefined,
      error: res.error,
    };
  }

  async waitForDone(
    jobId: string,
    onProgress?: (status: string, pct?: number) => void,
    opts: { intervalMs?: number; timeoutMs?: number } = {}
  ): Promise<JobStatus> {
    const interval = opts.intervalMs ?? 2000;
    const timeout = opts.timeoutMs ?? 30 * 60 * 1000;
    const start = Date.now();
    let last = "";
    while (true) {
      const s = await this.status(jobId);
      const key = `${s.status}:${s.progress ?? ""}`;
      if (key !== last) {
        onProgress?.(s.status, s.progress);
        last = key;
      }
      if (s.status === "done" || s.status === "failed") return s;
      if (Date.now() - start > timeout) {
        throw new Error("timed out waiting for transcription");
      }
      await sleep(interval);
    }
  }

  async getResult(jobId: string): Promise<TranscriptResult> {
    const res = await httpJson<ResultResponse>({
      url: `${BASE}/jobs/${encodeURIComponent(jobId)}/result?format=json`,
      method: "GET",
      headers: this.authHeaders(),
    });
    const text = (res.text ?? "").toString();
    const segments: TranscriptSegment[] | undefined = Array.isArray(res.segments)
      ? res.segments.map((s: ResultSegmentPayload) => ({
          start: Number(s.start) || 0,
          end: Number(s.end) || 0,
          text: (s.text ?? "").toString().trim(),
          speaker: s.speaker ? String(s.speaker) : undefined,
        }))
      : undefined;
    return {
      text,
      wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
      duration: typeof res.duration === "number" ? res.duration : undefined,
      segments,
    };
  }

  private authHeaders(): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.apiKey) h["X-API-Key"] = this.apiKey;
    if (this.claimToken) h["X-Claim-Token"] = this.claimToken;
    return h;
  }
}

async function httpJson<T>(params: {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: ArrayBuffer | string;
}): Promise<T> {
  const res = await requestUrl({
    url: params.url,
    method: params.method,
    headers: params.headers,
    body: params.body,
    throw: false,
  });
  if (res.status >= 200 && res.status < 300) {
    try {
      return res.json as T;
    } catch {
      return {} as T;
    }
  }
  let message = `HTTP ${res.status}`;
  try {
    const body = res.json as ErrorResponse;
    if (body?.error) message = body.error;
    else if (body?.message) message = body.message;
  } catch {
    if (res.text) message = `HTTP ${res.status}: ${res.text.slice(0, 200)}`;
  }
  throw new Error(message);
}

async function buildMultipart(
  boundary: string,
  filename: string,
  blob: Blob
): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const header = encoder.encode(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${escapeFilename(
        filename
      )}"\r\n` +
      `Content-Type: ${blob.type || "application/octet-stream"}\r\n\r\n`
  );
  const footer = encoder.encode(`\r\n--${boundary}--\r\n`);
  const payload = new Uint8Array(await blob.arrayBuffer());
  const out = new Uint8Array(header.length + payload.length + footer.length);
  out.set(header, 0);
  out.set(payload, header.length);
  out.set(footer, header.length + payload.length);
  return out.buffer;
}

function escapeFilename(name: string): string {
  return name.replace(/["\\\r\n]/g, "_");
}

function cryptoRandom(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => activeWindow.setTimeout(r, ms));
}
