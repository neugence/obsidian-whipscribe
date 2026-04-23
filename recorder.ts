export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;

  isRecording(): boolean {
    return this.mediaRecorder?.state === "recording";
  }

  async start(): Promise<void> {
    if (this.isRecording()) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = preferredMime();
    const rec = mime
      ? new MediaRecorder(this.stream, { mimeType: mime })
      : new MediaRecorder(this.stream);
    this.chunks = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    rec.start();
    this.mediaRecorder = rec;
  }

  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const rec = this.mediaRecorder;
      if (!rec) return reject(new Error("not recording"));
      rec.onstop = () => {
        const type = rec.mimeType || "audio/webm";
        const blob = new Blob(this.chunks, { type });
        this.chunks = [];
        this.mediaRecorder = null;
        this.stream?.getTracks().forEach((t) => t.stop());
        this.stream = null;
        resolve(blob);
      };
      rec.onerror = (e: Event) => {
        const msg = (e as ErrorEvent)?.message || "recorder error";
        reject(new Error(msg));
      };
      rec.stop();
    });
  }
}

function preferredMime(): string | undefined {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];
  for (const c of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(c)
    ) {
      return c;
    }
  }
  return undefined;
}
