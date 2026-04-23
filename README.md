# WhipScribe for Obsidian

Transcribe audio and video notes with [WhipScribe](https://whipscribe.com) without leaving your vault.

## Features

- **Hotkey recording** (`Cmd/Ctrl+Shift+W`) — records from your mic, uploads, and pastes the transcript at the cursor.
- **Right-click to transcribe** any `.mp3`, `.m4a`, `.wav`, `.mp4`, `.webm`, or `.m4v` file in the vault.
- **Output formats**: plain text, bullet list, action-item checklist, timestamped chapters.
- **Speaker diarization** when the transcript contains speaker segments.
- **Insert at cursor** in the active note, or auto-create a dated note under `Transcripts/`.
- Status-bar recording indicator, progress notices, retry-on-transient-failure.

## Install (manual)

1. Clone this folder into `<your-vault>/.obsidian/plugins/whipscribe/`.
2. Build it:
   ```bash
   npm install
   npm run build
   ```
   This produces `main.js` next to `manifest.json`.
3. In Obsidian: **Settings → Community plugins → Reload**, then enable **WhipScribe**.

## Usage

### Record and transcribe

1. Put the cursor where you want the transcript.
2. Press `Cmd+Shift+W` (macOS) or `Ctrl+Shift+W` (Windows/Linux). Status bar shows `🔴 Recording`.
3. Press the same hotkey to stop. The recording is saved under `Audio/` and uploaded automatically.
4. A progress notice reports `queued → processing → done`. The transcript is inserted at the cursor.

### Transcribe an existing file

- Right-click any supported audio/video file in the file explorer → **Transcribe with WhipScribe**.
- Or open the file and run the command **Transcribe the active audio/video file** from the command palette.

### Settings

| Setting | Purpose |
|---|---|
| API key | Optional. Anonymous requests work; a key raises rate limits. |
| Default output format | Plain / bullets / action items / chapters. |
| Speaker diarization | Labels speakers when the transcript contains speaker segments. |
| Insert at cursor | Off = create a new note under `Transcripts/` instead. |
| Recording folder | Where hotkey recordings are saved. Defaults to `Audio/`. |

## Output formats

**Plain**
```markdown
## Transcription
*Transcribed from meeting.m4a on 2026-04-23 14:30*

[Transcript text here...]
```

**Speaker diarization** (auto-applied when segments include speakers)
```markdown
**Speaker 1:** Hello everyone, let's start the meeting...

**Speaker 2:** Thanks for having me...
```

**Action items** (heuristic extraction — review before acting)
```markdown
## Action Items
*Extracted from meeting.m4a*

- [ ] Follow up with the engineering team by Friday.
- [ ] Review the Q3 budget proposal.
```

**Chapters** (2-minute buckets driven by segment timestamps)
```markdown
### 00:00
[first chunk of transcript]

### 02:00
[second chunk]
```

## Build

```bash
npm install
npm run dev    # watch mode — rebuilds main.js on every save
npm run build  # type-check + production bundle
```

## Notes

- HTTP calls go through Obsidian's `requestUrl`, which bypasses browser CORS restrictions when talking to `whipscribe.com`.
- Anonymous uploads return a `claim_token`; the client propagates it as `X-Claim-Token` on follow-up requests so polling works without an account.
- The 500 MB file cap is enforced client-side before upload.
- Action-item extraction is a regex over sentence cues (`follow up`, `schedule`, `review`, `need to`, …). Always review extracted items — it is not an LLM step.
- Speaker diarization is driven by whatever `segments[].speaker` the API returns. If the API does not return speakers for a given job, the plugin falls back to the selected output format.

## License

MIT
