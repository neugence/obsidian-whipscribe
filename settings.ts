import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type WhipScribePlugin from "./main";
import { detectWhisperBinary } from "./local_whisper";

export type OutputFormat = "plain" | "bullets" | "action_items" | "chapters";
export type Backend = "cloud" | "local";

export interface WhipScribeSettings {
  backend: Backend;
  apiKey: string;
  defaultFormat: OutputFormat;
  speakerDiarization: boolean;
  autoInsert: boolean;
  audioFolder: string;
  localBinaryPath: string;
  localModelPath: string;
  localLanguage: string;
  localThreads: number;
  localExtraArgs: string;
}

export const DEFAULT_SETTINGS: WhipScribeSettings = {
  backend: "cloud",
  apiKey: "",
  defaultFormat: "plain",
  speakerDiarization: false,
  autoInsert: true,
  audioFolder: "Audio",
  localBinaryPath: "",
  localModelPath: "",
  localLanguage: "auto",
  localThreads: 0,
  localExtraArgs: "",
};

export class WhipScribeSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: WhipScribePlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Transcription backend")
      .setDesc("Cloud sends audio to whipscribe.com. Local runs whisper.cpp on this machine.")
      .addDropdown((d) =>
        d
          .addOptions({ cloud: "Cloud", local: "Local (whisper.cpp)" })
          .setValue(this.plugin.settings.backend)
          .onChange(async (v) => {
            this.plugin.settings.backend = v as Backend;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.backend === "cloud") {
      this.renderCloud(containerEl);
    } else {
      this.renderLocal(containerEl);
    }

    this.renderOutput(containerEl);
  }

  private renderCloud(root: HTMLElement): void {
    new Setting(root).setName("Cloud").setHeading();
    new Setting(root)
      .setName("API key")
      .setDesc("Optional. Anonymous use is supported; a key raises rate limits.")
      .addText((t) =>
        t
          .setPlaceholder("ws_...") // eslint-disable-line obsidianmd/ui/sentence-case
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (v) => {
            this.plugin.settings.apiKey = v.trim();
            await this.plugin.saveSettings();
          })
      );
  }

  private renderLocal(root: HTMLElement): void {
    new Setting(root).setName("Local (whisper.cpp)").setHeading();
    const hint = root.createEl("p", {
      text:
        "Install whisper.cpp (macOS: `brew install whisper-cpp`) and download a ggml-*.bin model from huggingface.co/ggerganov/whisper.cpp.",
    });
    hint.addClass("whipscribe-hint");

    new Setting(root)
      .setName("Binary path")
      .setDesc("Path to the whisper.cpp executable.")
      .addText((t) =>
        t
          .setPlaceholder("/opt/homebrew/bin/whisper-cli") // eslint-disable-line obsidianmd/ui/sentence-case
          .setValue(this.plugin.settings.localBinaryPath)
          .onChange(async (v) => {
            this.plugin.settings.localBinaryPath = v.trim();
            await this.plugin.saveSettings();
          })
      )
      .addButton((b) =>
        b.setButtonText("Auto-detect").onClick(async () => {
          const found = await detectWhisperBinary();
          if (!found) {
            new Notice("No whisper.cpp binary found in common locations.");
            return;
          }
          this.plugin.settings.localBinaryPath = found;
          await this.plugin.saveSettings();
          new Notice(`Found: ${found}`);
          this.display();
        })
      );

    new Setting(root)
      .setName("Model path")
      .setDesc("Absolute path to a ggml-*.bin model file.")
      .addText((t) =>
        t
          .setPlaceholder("~/models/ggml-base.en.bin")
          .setValue(this.plugin.settings.localModelPath)
          .onChange(async (v) => {
            this.plugin.settings.localModelPath = v.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(root)
      .setName("Language")
      .setDesc("ISO code (en, es, fr, ...) or `auto` to detect.")
      .addText((t) =>
        t
          .setPlaceholder("auto") // eslint-disable-line obsidianmd/ui/sentence-case
          .setValue(this.plugin.settings.localLanguage)
          .onChange(async (v) => {
            this.plugin.settings.localLanguage = v.trim() || "auto";
            await this.plugin.saveSettings();
          })
      );

    new Setting(root)
      .setName("Threads")
      .setDesc("0 = whisper.cpp default (typically 4).")
      .addText((t) =>
        t
          .setPlaceholder("0")
          .setValue(String(this.plugin.settings.localThreads))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            this.plugin.settings.localThreads = Number.isFinite(n) && n >= 0 ? n : 0;
            await this.plugin.saveSettings();
          })
      );

    new Setting(root)
      .setName("Extra args")
      .setDesc("Passed through to whisper-cli verbatim (advanced). Example: `-tdrz --beam-size 5`.")
      .addText((t) =>
        t
          .setPlaceholder("")
          .setValue(this.plugin.settings.localExtraArgs)
          .onChange(async (v) => {
            this.plugin.settings.localExtraArgs = v;
            await this.plugin.saveSettings();
          })
      );
  }

  private renderOutput(root: HTMLElement): void {
    new Setting(root).setName("Output").setHeading();

    new Setting(root)
      .setName("Default output format")
      .addDropdown((d) =>
        d
          .addOptions({
            plain: "Plain text",
            bullets: "Bullet list",
            action_items: "Action items",
            chapters: "Timestamped chapters",
          })
          .setValue(this.plugin.settings.defaultFormat)
          .onChange(async (v) => {
            this.plugin.settings.defaultFormat = v as OutputFormat;
            await this.plugin.saveSettings();
          })
      );

    new Setting(root)
      .setName("Speaker diarization")
      .setDesc(
        "Label speakers when the transcript contains speaker segments. Cloud only; local whisper.cpp diarization needs stereo input or a tinydiarize model."
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.speakerDiarization).onChange(async (v) => {
          this.plugin.settings.speakerDiarization = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(root)
      .setName("Insert at cursor")
      .setDesc("Off = create a new note under the transcripts folder for each transcript.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.autoInsert).onChange(async (v) => {
          this.plugin.settings.autoInsert = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(root)
      .setName("Recording folder")
      .setDesc("Where hotkey-recorded audio is saved in the vault.")
      .addText((t) =>
        t
          .setPlaceholder("Audio")
          .setValue(this.plugin.settings.audioFolder)
          .onChange(async (v) => {
            this.plugin.settings.audioFolder = v.trim() || "Audio";
            await this.plugin.saveSettings();
          })
      );
  }
}
