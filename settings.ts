import { App, PluginSettingTab, Setting } from "obsidian";
import type WhipScribePlugin from "./main";

export type OutputFormat = "plain" | "bullets" | "action_items" | "chapters";

export interface WhipScribeSettings {
  apiKey: string;
  defaultFormat: OutputFormat;
  speakerDiarization: boolean;
  autoInsert: boolean;
  audioFolder: string;
}

export const DEFAULT_SETTINGS: WhipScribeSettings = {
  apiKey: "",
  defaultFormat: "plain",
  speakerDiarization: false,
  autoInsert: true,
  audioFolder: "Audio",
};

export class WhipScribeSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: WhipScribePlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "WhipScribe" });

    new Setting(containerEl)
      .setName("API key")
      .setDesc(
        "Optional. WhipScribe allows anonymous use; an API key raises your rate limits."
      )
      .addText((t) =>
        t
          .setPlaceholder("ws_...")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (v) => {
            this.plugin.settings.apiKey = v.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
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

    new Setting(containerEl)
      .setName("Speaker diarization")
      .setDesc(
        "Label speakers in the transcript when WhipScribe returns speaker segments."
      )
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.speakerDiarization)
          .onChange(async (v) => {
            this.plugin.settings.speakerDiarization = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Insert at cursor")
      .setDesc("Off = create a new note under Transcripts/ for each transcript.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.autoInsert).onChange(async (v) => {
          this.plugin.settings.autoInsert = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
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
