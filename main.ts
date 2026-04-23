import { Notice, Plugin, TFile } from "obsidian";
import {
  DEFAULT_SETTINGS,
  WhipScribeSettings,
  WhipScribeSettingTab,
} from "./settings";
import { AudioRecorder } from "./recorder";
import { WhipScribeApi } from "./api";
import { formatTranscript, insertTranscript } from "./inserter";
import { StatusBar, progressNotice } from "./ui";

const SUPPORTED_EXT = ["mp3", "m4a", "wav", "mp4", "webm", "m4v"];
const MAX_FILE_BYTES = 500 * 1024 * 1024;

const EXT_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  mp4: "video/mp4",
  webm: "video/webm",
  m4v: "video/mp4",
};

export default class WhipScribePlugin extends Plugin {
  settings!: WhipScribeSettings;
  private recorder = new AudioRecorder();
  private statusBar!: StatusBar;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.statusBar = new StatusBar(this.addStatusBarItem());

    this.addSettingTab(new WhipScribeSettingTab(this.app, this));

    this.addCommand({
      id: "toggle-recording",
      name: "Start/Stop recording",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "w" }],
      callback: () => void this.toggleRecording(),
    });

    this.addCommand({
      id: "transcribe-active-file",
      name: "Transcribe the active audio/video file",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const ok = !!file && SUPPORTED_EXT.includes(file.extension);
        if (ok && !checking) void this.transcribeVaultFile(file!);
        return ok;
      },
    });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFile)) return;
        if (!SUPPORTED_EXT.includes(file.extension)) return;
        menu.addItem((item) => {
          item
            .setTitle("Transcribe with WhipScribe")
            .setIcon("mic")
            .onClick(() => void this.transcribeVaultFile(file));
        });
      })
    );
  }

  onunload(): void {
    if (this.recorder.isRecording()) {
      this.recorder.stop().catch(() => {});
    }
    this.statusBar?.clear();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async toggleRecording(): Promise<void> {
    if (this.recorder.isRecording()) {
      this.statusBar.set("Saving recording...");
      try {
        const blob = await this.recorder.stop();
        this.statusBar.clear();
        const file = await this.saveRecordingBlob(blob);
        await this.transcribeVaultFile(file);
      } catch (err) {
        this.statusBar.clear();
        new Notice(`WhipScribe: recording failed — ${humanErr(err)}`);
      }
      return;
    }
    try {
      await this.recorder.start();
      this.statusBar.set(
        "🔴 Recording — press Cmd/Ctrl+Shift+W to stop",
        true
      );
    } catch (err) {
      new Notice(`WhipScribe: cannot record — ${humanErr(err)}`);
    }
  }

  private async saveRecordingBlob(blob: Blob): Promise<TFile> {
    const folder = (this.settings.audioFolder || "Audio").replace(
      /^\/+|\/+$/g,
      ""
    );
    if (!(await this.app.vault.adapter.exists(folder))) {
      await this.app.vault.createFolder(folder);
    }
    const ts = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const ext = blob.type.includes("mp4") ? "mp4" : "webm";
    const path = `${folder}/whipscribe-${ts}.${ext}`;
    const buf = await blob.arrayBuffer();
    return await this.app.vault.createBinary(path, buf);
  }

  private async transcribeVaultFile(file: TFile): Promise<void> {
    if (file.stat.size > MAX_FILE_BYTES) {
      new Notice(`WhipScribe: ${file.name} is larger than 500 MB.`);
      return;
    }

    const api = new WhipScribeApi(this.settings.apiKey);
    const progress = progressNotice(`WhipScribe: uploading ${file.name}...`);

    try {
      const buf = await this.app.vault.readBinary(file);
      const mime =
        EXT_MIME[file.extension.toLowerCase()] || "application/octet-stream";
      const blob = new Blob([buf], { type: mime });

      const submit = await this.withRetry(() => api.upload(file.name, blob));
      progress.update("WhipScribe: queued — transcribing...");

      const terminal = await api.waitForDone(
        submit.jobId,
        (status, pct) => {
          progress.update(
            `WhipScribe: ${status}${pct != null ? ` ${pct}%` : ""}`
          );
        }
      );
      if (terminal.status !== "done") {
        progress.done();
        new Notice(
          `WhipScribe: job ${terminal.status}${
            terminal.error ? ` — ${terminal.error}` : ""
          }`
        );
        return;
      }
      const result = await this.withRetry(() => api.getResult(submit.jobId));
      progress.done();

      const body = formatTranscript(result, {
        sourceName: file.name,
        format: this.settings.defaultFormat,
        speakerDiarization: this.settings.speakerDiarization,
      });
      await insertTranscript(this.app, body, {
        createNewNote: !this.settings.autoInsert,
        sourceName: file.name,
      });
      new Notice(`WhipScribe: done — ${result.wordCount} words`);
    } catch (err) {
      progress.done();
      new Notice(`WhipScribe: ${humanErr(err)}`);
    }
  }

  private async withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    let last: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        last = err;
        if (!isTransient(err) || i === attempts - 1) throw err;
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, i)));
      }
    }
    throw last;
  }
}

function isTransient(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /HTTP 5\d\d|timed out|network|ECONN|ETIMEDOUT/i.test(msg);
}

function humanErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
