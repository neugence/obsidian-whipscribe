# WhipScribe for Obsidian

Transcribe audio and video notes without leaving your vault — either via the [WhipScribe](https://whipscribe.com) cloud API or a fully local [whisper.cpp](https://github.com/ggml-org/whisper.cpp) binary on your machine.

## Features

- **Two backends, one plugin.** Switch between WhipScribe cloud and local whisper.cpp from settings.
- **Hotkey recording** (`Cmd/Ctrl+Shift+W`) — records from your mic, transcribes, and pastes at the cursor.
- **Right-click to transcribe** any `.mp3`, `.m4a`, `.wav`, `.mp4`, `.webm`, `.m4v`, `.ogg`, or `.flac` file in the vault.
- **Output formats:** plain text, bullet list, action-item checklist, timestamped chapters.
- **Speaker diarization** when the backend returns speaker segments.
- **Insert at cursor** in the active note, or auto-create a dated note under `Transcripts/`.
- Status-bar recording indicator, progress notices, retry-on-transient-failure.

## Install

1. Clone this folder into `<your-vault>/.obsidian/plugins/whipscribe/`.
2. Build it:
   ```bash
   npm install
   npm run build
   ```
3. In Obsidian: **Settings → Community plugins → Reload**, then enable **WhipScribe**.

## Backends

### Cloud (WhipScribe)

Default. No install required. Anonymous requests work; a WhipScribe API key raises rate limits.

Set: **Settings → WhipScribe → Transcription backend → WhipScribe (cloud)**.

### Local (whisper.cpp)

Runs the Whisper model on your machine. No network egress, no usage limits, works offline.

**Install whisper.cpp** (macOS):
```bash
brew install whisper-cpp
```
That gives you `/opt/homebrew/bin/whisper-cli`.

**Download a model**. Pick one based on your Mac's memory and the accuracy you need:
- `ggml-tiny.en.bin` (~75 MB, fastest, English-only)
- `ggml-base.en.bin` (~140 MB, good balance)
- `ggml-small.en.bin` (~465 MB)
- `ggml-medium.en.bin` (~1.5 GB, best quality per speed)
- `ggml-large-v3.bin` (~3 GB, multilingual)

Download from huggingface.co/ggerganov/whisper.cpp:
```bash
mkdir -p ~/Models/whisper
cd ~/Models/whisper
curl -LO https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
```

**Configure the plugin**:

- **Settings → WhipScribe → Transcription backend → whisper.cpp (local)**
- **Binary path** → click *Auto-detect* (or paste `/opt/homebrew/bin/whisper-cli`)
- **Model path** → `/Users/you/Models/whisper/ggml-base.en.bin`
- **Language** → `auto` or an ISO code (`en`, `es`, `fr`, …)
- **Threads** → `0` for whisper.cpp default (typically 4). Raise to match your core count.

## Usage

### Record and transcribe

1. Put the cursor where you want the transcript.
2. Press `Cmd+Shift+W` (macOS) or `Ctrl+Shift+W` (Windows/Linux). Status bar shows `🔴 Recording`.
3. Press the same hotkey to stop. The recording is saved under `Audio/` and transcribed by the selected backend.

### Transcribe an existing file

- Right-click any supported audio/video file in the file explorer → **Transcribe with WhipScribe**.
- Or open the file and run the command **Transcribe the active audio/video file** from the command palette.

## How the local pipeline works

1. The plugin reads the vault file as bytes.
2. Web Audio API decodes it (any format Electron supports: mp3, m4a, mp4, webm, wav, flac, ogg, …).
3. Decoded audio is resampled to 16 kHz mono and written as a 16-bit PCM WAV into the OS temp directory.
4. `whisper-cli -m <model> -f <wav> -of <prefix> -oj` is spawned as a subprocess.
5. The resulting JSON is parsed into segments with offsets; text is inserted into the note.
6. Temp files are cleaned up.

Audio never leaves your machine in local mode.

## Output formats

**Plain**
```markdown
## Transcription
*Transcribed from meeting.m4a on 2026-04-23 14:30*

[Transcript text here...]
```

**Speaker diarization** (auto-applied when segments include speakers — cloud only today)
```markdown
**Speaker 1:** Hello everyone, let's start the meeting...

**Speaker 2:** Thanks for having me...
```

**Action items** (regex extraction — review before acting)
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

## Caveats

- **Local diarization** requires either stereo input with `-di` or a tinydiarize model with `-tdrz`. Pass the flag via the *Extra args* setting if your setup supports it.
- **Cloud 500 MB cap** is enforced client-side. Local mode inherits the same cap to stop runaway jobs; raise it only if you know what you're doing.
- **First local run is slow** because of Metal backend init; subsequent runs in the same Obsidian session should be faster.
- The plugin is **desktop-only** — neither MediaRecorder-recording nor subprocess-spawning work on iOS/Android.

## Build

```bash
npm install
npm run dev    # watch mode — rebuilds main.js on every save
npm run build  # type-check + production bundle
```

## License

MIT
