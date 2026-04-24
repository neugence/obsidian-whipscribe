import { App, MarkdownView, Notice } from "obsidian";
import type { TranscriptResult, TranscriptSegment } from "./api";
import type { OutputFormat } from "./settings";

export interface FormatOptions {
  sourceName: string;
  format: OutputFormat;
  speakerDiarization: boolean;
}

export function formatTranscript(
  result: TranscriptResult,
  opts: FormatOptions
): string {
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
  const header = `## Transcription\n*Transcribed from ${opts.sourceName} on ${stamp}*\n\n`;

  if (opts.speakerDiarization && hasSpeakers(result.segments)) {
    return header + renderSpeakers(result.segments!);
  }

  switch (opts.format) {
    case "bullets":
      return header + renderBullets(result.text);
    case "action_items":
      return (
        `## Action Items\n*Extracted from ${opts.sourceName}*\n\n` +
        renderActionItems(result.text)
      );
    case "chapters":
      return (
        header +
        (result.segments && result.segments.length
          ? renderChapters(result.segments)
          : result.text.trim() + "\n")
      );
    case "plain":
    default:
      return header + result.text.trim() + "\n";
  }
}

function hasSpeakers(segs?: TranscriptSegment[]): boolean {
  return !!segs && segs.some((s) => !!s.speaker);
}

function renderSpeakers(segs: TranscriptSegment[]): string {
  const lines: string[] = [];
  let current = "";
  let buffer: string[] = [];
  for (const s of segs) {
    const label = s.speaker || "Speaker ?";
    if (label !== current) {
      if (buffer.length) lines.push(`**${current}:** ${buffer.join(" ")}`);
      buffer = [s.text.trim()];
      current = label;
    } else {
      buffer.push(s.text.trim());
    }
  }
  if (buffer.length) lines.push(`**${current}:** ${buffer.join(" ")}`);
  return lines.join("\n\n") + "\n";
}

function renderBullets(text: string): string {
  const sentences = splitSentences(text);
  if (!sentences.length) return "- (empty transcript)\n";
  return sentences.map((s) => `- ${s}`).join("\n") + "\n";
}

function renderActionItems(text: string): string {
  const sentences = splitSentences(text);
  const cues =
    /\b(follow up|schedule|review|send|email|call|set up|prepare|draft|finish|ship|fix|update|remind|look into|investigate|assign|share|sync|decide|book|order|need to|should|must|action item|todo)\b/i;
  const items = sentences.filter((s) => cues.test(s));
  if (!items.length) {
    return "- [ ] (No action items detected — review transcript manually.)\n";
  }
  return items.map((s) => `- [ ] ${s}`).join("\n") + "\n";
}

function renderChapters(segs: TranscriptSegment[]): string {
  const chunkSec = 120;
  let cursor = 0;
  const out: string[] = [];
  let buf: string[] = [];
  for (const s of segs) {
    if (s.start - cursor >= chunkSec && buf.length) {
      out.push(chapter(cursor, buf.join(" ")));
      cursor = s.start;
      buf = [];
    }
    buf.push(s.text.trim());
  }
  if (buf.length) out.push(chapter(cursor, buf.join(" ")));
  return out.join("\n\n") + "\n";
}

function chapter(start: number, text: string): string {
  return `### ${formatClock(start)}\n${text}`;
}

function formatClock(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface InsertOptions {
  createNewNote: boolean;
  sourceName: string;
}

export async function insertTranscript(
  app: App,
  body: string,
  opts: InsertOptions
): Promise<void> {
  if (!opts.createNewNote) {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (view) {
      const editor = view.editor;
      editor.replaceRange(body, editor.getCursor());
      return;
    }
    new Notice("No active note — creating a new one.");
  }
  const safeName = opts.sourceName
    .replace(/\.[^.]+$/, "")
    .replace(/[\\/:*?"<>|]/g, "_");
  const stamp = new Date().toISOString().slice(0, 10);
  const path = await uniquePath(app, `Transcripts/${safeName}-${stamp}.md`);
  const file = await app.vault.create(path, body);
  await app.workspace.getLeaf(true).openFile(file);
}

async function uniquePath(app: App, desired: string): Promise<string> {
  const parent = desired.split("/").slice(0, -1).join("/");
  if (parent && !(await app.vault.adapter.exists(parent))) {
    await app.vault.createFolder(parent);
  }
  let p = desired;
  let i = 1;
  while (await app.vault.adapter.exists(p)) {
    p = desired.replace(/\.md$/, ` (${i}).md`);
    i++;
  }
  return p;
}
