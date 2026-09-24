# LectureAI

LectureAI is a full-stack web application that converts lecture recordings into transcripts and AI-generated study notes. Upload a recording or record a lecture in your browser, follow provisional live text while recording, finalize the complete transcript, then generate notes grounded in what was said.

## Features

- Browser microphone lecture recording with pause/resume, an elapsed timer, and audio playback before final transcription.
- Timestamped Important, Confusing, Review Later and Note markers, with playback seeking, per-tab recovery and optional personal review priorities in AI notes.
- Provisional live transcription over WebRTC, with incremental text, connection status, bounded reconnection, and reader-friendly scrolling.
- Drag-and-drop audio upload, file selection, replacement, and removal; both flows share the existing transcription API.
- Real OpenAI file transcription, with a readable, scrollable transcript viewer.
- Structured lecture notes: summaries, concepts, definitions, examples, equations, explicit professor emphasis, assessment topics, and study questions when relevant.
- Copy transcript and copy Markdown notes using the browser clipboard.
- Download the final transcript as a UTF-8 `.txt` file using **Download Transcript** beside Copy Transcript. The browser saves it to its configured download location or asks where to save it. This happens locally without an additional API request; download before refreshing or closing the page.
- Loading states, retryable errors, keyboard access, responsive layout, and system light/dark themes.
- Backend-only permanent credentials, short-lived browser credentials for live audio, upload validation, temporary upload cleanup, bounded request streams, and restricted CORS.

## Tech stack

- **Frontend:** Next.js 16, React 19, TypeScript, App Router, Tailwind CSS 4, native `fetch`, `react-markdown`, and Lucide icons.
- **Backend:** Python 3.10+, FastAPI, Uvicorn, Pydantic, python-dotenv, python-multipart, and the official asynchronous OpenAI Python SDK.
- **AI:** configurable `gpt-live-transcribe` for live text, `gpt-transcribe` for complete-file transcription, and `gpt-5.6` for notes through the Responses API. No permanent API key or OpenAI SDK is included in the frontend. Temporary live-session credentials stay in memory.

## Architecture

```text
Browser
   |
   v
Next.js Frontend (localhost:3000)
   | native fetch / multipart upload / JSON
   v
FastAPI Backend (localhost:8000)
   |
   +----> OpenAI Transcription
   |
   +----> OpenAI Note Generation (Responses API)
```

```text
LectureAI/
├── frontend/
│   ├── app/                 # Page, global styles, layout, icon
│   ├── components/          # Upload, recorder, transcript, notes, copy, loading
│   ├── hooks/               # MediaRecorder lifecycle and resource cleanup
│   ├── lib/                 # Typed API requests and recording format/timer helpers
│   ├── .env.local.example
│   └── package.json
├── backend/
│   ├── main.py              # App, CORS, health/config, safe errors
│   ├── config.py            # Root .env loading and public limits
│   ├── middleware.py        # Request-body limits before parsing
│   ├── routes/              # Upload and notes validation/HTTP endpoints
│   ├── services/            # OpenAI client, transcription, notes prompt
│   ├── schemas/             # Pydantic request/response models
│   ├── tests/               # API and SDK contract/error tests
│   └── requirements.txt
├── .env.example
└── README.md
```

## Installation

Prerequisites: **Node.js 22.13+ on Node 22 LTS, or Node.js 24+** (including the frontend lint tooling), npm, and **Python 3.10+** (Python 3.12 recommended). macOS's built-in Python 3.9 is too old; use an installed current Python. An OpenAI API key with billing and access to the configured models is required for real transcription/notes, but not for startup or local tests.

If this project is hosted in a repository, clone its actual URL and enter the checkout:

```bash
git clone <your-repository-url> LectureAI
cd LectureAI
```

For this generated local project, simply start from the existing `LectureAI` directory.

### 1. Backend

From the project root:

```bash
cp .env.example .env
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

On Windows PowerShell, the equivalent setup is:

```powershell
Copy-Item .env.example .env
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

For Windows Command Prompt, activate with `.venv\Scripts\activate.bat` instead.

Edit the **root `.env`** and replace `your_openai_api_key_here` with your key locally. Never put it in a `NEXT_PUBLIC_*` variable. The backend loads this file relative to its source directory, independent of the shell's working directory. Existing process environment variables take precedence.

From `backend/`, run:

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Alternatively, `python main.py` uses `BACKEND_HOST` and `BACKEND_PORT` from `.env` (without auto-reload). Explicit Uvicorn CLI flags take precedence over the documented runner configuration.

Check [backend health](http://localhost:8000/health) or [interactive API docs](http://localhost:8000/docs).

### 2. Frontend

Open a second terminal, starting at the project root:

```bash
cd frontend
npm ci
cp .env.local.example .env.local
npm run dev
```

On PowerShell, use `Copy-Item .env.local.example .env.local` for the copy step.

Visit **[LectureAI](http://localhost:3000)**. Choose a supported recording, click **Transcribe Lecture**, then **Generate Notes**. Copy results before leaving or refreshing the page.

For a local production build:

```bash
cd frontend
npm run build
npm run start
```

Restart the backend after changing its `.env`. Restart the frontend dev server after changing `.env.local`; for production, rebuild because `NEXT_PUBLIC_*` variables are embedded at build time.

## Audio Language

Choose **Audio language** above the upload and recording controls. **English** is selected by default. Other choices are Chinese, Spanish, French, German, Japanese, Korean, Portuguese, Hindi, Arabic, and **Auto-detect / mixed languages**.

The choice guides both live recognition and final-file transcription. It does not translate speech or remove other languages from the recording. Auto-detect sends no language hint. The selector is locked during recording (including pause), microphone setup, and processing; after stopping, you can correct the language before finalizing. Live reconnects retain the language selected when recording started. Refreshing the page restores English.

## Recording Lectures

1. Choose **Record Lecture** in the **Add Lecture** card.
2. Click **Start Recording**. Microphone access is requested only after this action; no camera access is requested.
3. Allow microphone permission in your browser. If you previously allowed it, the browser may not ask again. If you leave the permission prompt unanswered, **Cancel** returns to idle; any late microphone stream is immediately released.
4. Use **Pause** and **Resume** as needed. The elapsed timer excludes paused time. While paused, local recording and live audio input stop and the transcript remains visible. The microphone stays connected for resuming; **Stop** releases it.
5. Click **Stop**. Wait for **Recording Complete**, then listen with the audio player's native controls.
6. Click **Finalize Transcript** to submit the recorded file through the same `/api/transcribe` endpoint used for uploads. The result appears as **Final Transcript** and is the only text used by **Generate Notes**. Provisional live text is kept separately for comparison.
7. **Discard** clears the local audio and timer. **Record Again** does the same and returns to idle; click **Start Recording** when ready. If markers exist, both actions ask for confirmation before removing them and their recovery data. Neither action clears a previously generated transcript or notes. Successfully starting a new recording clears the previous final transcript and notes to prevent generating notes from the wrong lecture. Starting a new transcription also replaces the shared results, as it does for uploaded files.

Live transcription sends microphone audio to OpenAI while recording. MediaRecorder independently keeps the full recording in browser memory. The complete file is uploaded only when you click **Finalize Transcript**. Switching modes is disabled while permission is pending, while recording/paused, and while finishing or processing. After stopping, you can switch modes and return to the same local preview.

Use a current Chrome, Edge, or Safari browser on **localhost or HTTPS**. Plain HTTP on a LAN address cannot normally access the microphone. The app feature-detects recording APIs and negotiates WebM/Opus or MP4/AAC rather than assuming WebM; recorded filenames reflect the actual container (`.webm` or `.m4a`). When neither a requested format nor a supported browser default is usable, a clear error leaves audio upload available. OS-level microphone permission may also be needed. These behaviors follow the [MediaRecorder MIME support API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static) and [getUserMedia secure-context requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

Keep the device awake and the tab open. The app requests a browser leave-page warning while recording or paused, but browsers do not guarantee this on every shutdown, mobile lifecycle event, or process crash. No warning is installed for a stopped recording. Recordings have no persistent backup.

Recordings target 64 kbps, but browsers may choose a different bitrate. The recorder stops when delivered chunks reach the configured upload limit. Final chunks and delayed browser events can put the result over that limit; an oversized recording remains previewable but cannot be transcribed. Shorter sessions are safest until long-lecture chunking is implemented. Permission to record is your responsibility.

## Live transcription architecture (Phase 3)

```text
One getUserMedia stream
  ├── MediaRecorder ──> full local audio ──> Finalize Transcript ──> /api/transcribe
  │                                                              └── final text ──> /api/notes
  └── cloned audio track ──> WebRTC ──> OpenAI ──> provisional Live Transcript
                               ↑
                 temporary credential from /api/realtime/session
                               ↑
                 FastAPI uses its permanent OPENAI_API_KEY
```

The implementation follows the official [Realtime transcription guide](https://developers.openai.com/api/docs/guides/realtime-transcription), [WebRTC guide](https://developers.openai.com/api/docs/guides/realtime-webrtc), and [client-secrets API](https://developers.openai.com/api/reference/python/resources/realtime/subresources/client_secrets/methods/create). WebRTC was chosen because it supports short-lived browser credentials and handles audio encoding, channel negotiation and sample rates without a backend audio proxy or hand-written PCM transcoding.

FastAPI creates a **transcription** client secret with `client.realtime.client_secrets.create`, `session.type="transcription"`, `audio.input.transcription.model`, and `audio.input.turn_detection=null`. New credentials expire after 60 seconds; this controls when a connection may start, not its active duration. The backend returns only `value` and `expires_at`, sends `Cache-Control: no-store`, and rejects browser origins different from `FRONTEND_URL`. The browser posts an SDP offer to OpenAI's `/v1/realtime/calls` using only the temporary credential, then exchanges transcription events over the `oai-events` data channel. Neither credentials nor transcripts are logged. Permanent credentials never enter client configuration, responses, browser storage, or bundles. The unauthenticated local backend still requires authentication/rate limiting before public deployment; the origin check is not user authentication.

`gpt-live-transcribe` requires client-managed commits; it does not support server or semantic VAD. An isolated Web Audio analyser detects roughly 700 ms speech pauses (RMS threshold 0.015). The client sends `input_audio_buffer.commit` after speech, with a 15-second cap for continuous speech, and clears long silence-only buffers. These are simple heuristics, not semantic turn detection. Web Audio is used only for detecting boundaries: **audio itself travels over WebRTC**, never as MediaRecorder WebM/MP4 chunks or custom PCM arrays. No AudioWorklet/ScriptProcessor is necessary. A compatible model can be selected through the environment variable; LectureAI does not silently fall back to another model.

`conversation.item.input_audio_transcription.delta` appends to the partial text for its item. `conversation.item.input_audio_transcription.completed` replaces that item's text with the authoritative completed string, never appending a duplicate. Item IDs and `previous_item_id` links from `input_audio_buffer.committed` / `conversation.item.added` order asynchronous results. Connection-specific namespaces prevent collisions across reconnects; late deltas after completion and duplicate event IDs are ignored. Completed live segments are still **provisional for the lecture** until the entire recording is finalized.

Audio data stays outside React state. Transcript snapshots are batched to at most ten per second in `useLiveTranscription`; only the recorder subtree updates, not the page's final transcript/notes state. Storage is bounded to 10,000 segments, 600,000 characters and a 2,048-ID deduplication window. The scroll viewport follows new text only while near its bottom; scrolling upward reveals **Jump to live**. Status changes are polite announcements; the text itself is not a continuously announced live region.

### Failures, pause, stop and cleanup

- The live client owns only cloned microphone tracks and its own peer connection/AudioContext. A live failure never stops or disables the original recording track. Upload and full-file transcription are unchanged.
- Connection failure, malformed events and upstream errors retain existing text, mark unfinished segments as unconfirmed, and attempt at most three reconnects after 2, 4 and 8 seconds. A connection attempt times out after 20 seconds. Reconnects use new credentials and reuse the existing microphone; no second permission request is made. Audio lost before connection or during a gap is not replayed, and the UI directs the user to full-file finalization.
- Pause synchronously disables the cloned track and detaches it from the WebRTC sender; it also pauses MediaRecorder and the visible timer. A pending pre-pause tail may still finish transcribing. Resume reattaches the clone; rapid pause/resume operations are serialized. Paused audio is not sent for transcription.
- Stop immediately stops sending live audio and stops all microphone tracks. The data channel may remain open for up to three seconds to commit and receive the last pre-stop events, then closes. Partial text that never completes stays marked unconfirmed. The audio preview and Finalize Transcript do not wait for that grace period.
- Stop during connection/retry and component unmount abort pending requests, cancel timers, remove handlers, close peers/AudioContexts, and release owned tracks. Discard/Record Again also clear the provisional text. Late credential responses cannot restart a disposed session.

### Manual live test

1. Configure a valid backend key and model access, restart the backend, open the app on localhost/HTTPS, choose **Record Lecture**, and click **Start Recording**. Grant microphone permission once.
2. Speak several sentences with pauses. Confirm partial text becomes completed text without duplication, the timer advances, and **Live** appears. Scroll up as more text arrives, then use **Jump to live**.
3. Press **Pause** and speak a distinct phrase. The timer must stay frozen and that phrase must not appear. Previously sent words may still complete. Resume and speak again.
4. Disconnect the network briefly. Confirm the local timer/recording continue and the reconnect message appears. Restore networking and confirm the warning about possible gaps remains. Repeat and press Stop during a retry: no new connection should start.
5. Stop. Confirm the microphone indicator turns off and the preview plays. Live text remains provisional and Generate Notes is absent for this new lecture.
6. Click **Finalize Transcript**. Confirm the complete-file result appears under **Final Transcript**, then **Generate Notes** uses that text. Exercise Copy Transcript / Copy Notes.
7. Repeat with the backend unavailable, denied microphone permission, and disabled WebRTC support. Live-only failure must preserve recording/preview/finalization; microphone denial must leave upload available. Navigate away during a recording and accept the leave warning; check that the microphone turns off.
8. Upload a recording and exercise Transcribe Lecture → Final Transcript → Generate Notes. Test on current Chrome, Edge and macOS Safari, including pause/resume, browser permission indicators, and playback of the browser's chosen container.

### Live limitations

- Automated browser checks use Chromium with synthetic microphone audio and a mocked live transport. They validate application behavior, **not real OpenAI recognition quality**, physical microphone permission UI, or native Safari/Edge behavior. On 2026-09-24, after updating the backend key, a real OpenAI WebRTC smoke test successfully transcribed a short synthetic speech sample and preserved the stopped recording preview. Physical microphone capture and extended lectures still require manual testing.
- Foreground, awake desktop use is expected. Background throttling, sleep, browser memory pressure, Bluetooth changes and network restrictions can interrupt live audio or delay the simple local pause detector. Loud ambient noise may create extra commits; quiet speech can delay them. WebRTC and AudioContext failure degrade to local recording plus finalization.
- Some audio before the live connection opens or during reconnects may be missing. Stop-time draining is bounded and may miss late results; the full local recording is the recovery source.
- The 25 MB final-upload cap still applies. At the requested 64 kbps this is approximately 52 minutes before container overhead; browsers may choose a different bitrate. This phase does not add long-lecture chunking or guarantee 75–90 minute capture.
- Live transcript data is held in application state, not only DOM nodes. No sessionStorage recovery is added: refreshing or closing the page loses both live text and audio. Copy finalized results before leaving.

### Phase 3 change map and verification

Created:

- `backend/routes/realtime.py`, `backend/services/realtime_service.py`: temporary-session endpoint and SDK service.
- `frontend/lib/liveTranscriptionClient.ts`, `frontend/lib/liveTranscript.ts`: WebRTC lifecycle, local turn boundaries, and ordered transcript reconciliation.
- `frontend/hooks/useLiveTranscription.ts`, `frontend/components/LiveTranscript.tsx`: isolated React state, status and scrolling UI.
- `frontend/tests/liveTranscript.test.mjs`, `frontend/tests/liveTranscriptionClient.test.mjs`, `frontend/tests/liveTranscription.browser.js`: transcript, lifecycle and browser verification.

Modified:

- `.env.example`, `README.md`: live model configuration, architecture and usage.
- `backend/config.py`, `backend/main.py`, `backend/tests/test_api.py`: settings, route registration and SDK/API checks.
- `frontend/app/page.tsx`, `frontend/app/globals.css`: final-only result state and matching live-panel styles.
- `frontend/components/AudioRecorder.tsx`, `frontend/components/TranscriptViewer.tsx`, `frontend/hooks/useAudioRecorder.ts`: live integration, recording lifecycle notifications and finalization labels.
- `frontend/lib/api.ts`, `frontend/tests/recording.browser.js`: abortable temporary-credential request and existing-workflow regression coverage.

Verification on 2026-09-24: production build and TypeScript check passed; 13 frontend unit tests and 38 backend tests passed; backend modules compiled. Both Chromium browser suites passed with synthetic audio and fixture AI responses. Phase 3 had no configured lint script; Phase 4 adds ESLint with TypeScript rules. The whole-repository credential audit included ignored files, build output and dependencies: the configured key appeared only in the ignored root `.env`, with no key in frontend code, bundles, examples, logs or tracked files. After the backend key was updated and the backend restarted, real temporary-credential creation and end-to-end WebRTC transcription of synthetic speech both passed; the recording preview remained available after Stop. No new runtime dependencies were added.

## Lecture Markers (Phase 4)

While recording, use **Important**, **Confusing**, **Review Later**, or **Add Note** to mark a moment without pausing recording or live transcription. The first three save immediately; Add Note captures the timestamp as soon as the editor opens, so typing time does not move it. Notes allow up to 1,000 characters. You can also edit a marker to add an explanation, or delete it. The list is chronological and scrolls within a compact panel. At most 500 markers are kept per lecture; accidental repeats of the same type within one second are ignored.

**Keyboard:** Alt/Option + 1 marks Important, + 2 Confusing, + 3 Review Later, + 4 opens Add Note. Shortcuts ignore auto-repeat, composition, extra modifiers and typing in inputs, textareas or editable content. Marker creation is disabled during Pause; existing entries and an open editor remain available. Resume restores marker controls.

### Timestamps and playback

Markers read the same pause-aware, monotonic clock used by the recorder, directly at the click rather than relying on the last rendered timer. Paused wall-clock time is excluded. For example, 10 minutes of recording, 5 paused minutes, then 2 recording minutes produces a marker near **12:00**. The shared formatter displays `mm:ss`, or `hh:mm:ss` for lectures over an hour.

After Stop, a compact type/count summary and CSS timeline appear. Click a list timestamp or timeline point to seek and start playback. **Playback begins five seconds before the marker**, clamped to zero and the available audio duration. Change `MARKER_PLAYBACK_LEAD_IN_SECONDS` in `frontend/lib/lectureMarkers.ts` to adjust this. Timeline points have keyboard focus and accessible type/time/note labels, plus visible hover/focus details; the list is an alternative when nearby points overlap.

Finite positive audio metadata is preferred for duration, timeline placement and seek limits. If the browser reports an unknown/infinite duration (common with MediaRecorder WebM), the recording clock is used until better metadata becomes available. Seeks are clamped slightly inside the duration. A click before metadata loads is queued; an autoplay rejection leaves the audio seek in place so you can press Play yourself. Browser encoding and timing can differ slightly, so markers are approximate audio positions, not sample-accurate edits.

### State and recovery

`useLectureMarkers` owns one versioned recording session in application state. A unique lecture ID ties its markers to that recording's final transcript; marker updates do not change the recording or transcription state. Marker timestamps are never heuristically attached to live/final transcript words. Copying results, finalizing and generating notes retain the marker session. Uploading another file never attaches the prior recording's markers to that upload.

Each successful marker save/edit/delete immediately mirrors only `{version, lectureId, markers}` to **`sessionStorage["lectureai:current-markers:v1"]`**. Entries contain ID, type, recorded seconds, creation time and optional written note. No audio, transcript, credentials or generated notes are stored there. Recovery validates types, finite timestamps, lengths, IDs and counts, strips unrelated fields, and rejects malformed data. Storage failures produce a message and leave in-memory markers usable.

A refresh restores saved markers for review/editing, clearly labeled as recovered with **audio unavailable**. Audio was only held in memory and cannot be restored; recovered markers cannot seek or become metadata for a newly uploaded transcript. Starting another recording asks before replacing recovered markers, then begins a new lecture ID with a fresh timeline after microphone initialization succeeds. Discard and Record Again ask for confirmation only when saved markers exist. Cancel retains everything; confirm removes markers and their recovery entry. Empty sessions do not leave a recovery entry.

Recovery is limited to the current browser tab. It does not guarantee recovery after closing the tab/browser, a crash, private-mode restrictions or cleared storage. Unsaved text in an open marker editor is not mirrored. No permanent database, lecture history or cross-device syncing is provided.

### Personal review priorities in AI notes

Markers and typed notes remain local during recording, playback and final transcription. Once the **matching recording** has a Final Transcript, an **Include N lecture markers in study notes** checkbox is shown. It is selected by default; uncheck it to send only the final transcript. Metadata is sent only when you explicitly click Generate Notes/Regenerate Notes. The UI explains that selected markers and their text will be sent to OpenAI.

The backwards-compatible `/api/notes` body optionally accepts:

```json
{
  "transcript": "The completed lecture transcript...",
  "markers": [
    {"type": "important", "timestampSeconds": 1938},
    {"type": "confusing", "timestampSeconds": 2322, "note": "Compare paging and segmentation"}
  ]
}
```

Requests containing only `transcript` remain supported. Frontend metadata omits internal IDs and creation dates. Pydantic accepts known marker types, finite numeric timestamps from 0 through 604800 seconds (one week), up to 1,000 note characters and 500 markers. Unknown fields/malformed metadata produce a safe 422 response; the existing total JSON request-size limit still applies.

The notes prompt treats markers as untrusted **student study priorities**, not instructions or proof of professor emphasis. When supplied, it adds **Personal Review Priorities** with timestamp/type and any student explanation. Timestamp-only entries instruct the student to review the recording without inventing a topic. A student's Important marker or exam claim does not establish exam relevance; that requires explicit evidence in the transcript. A real API smoke test with a student exam claim and no matching transcript evidence produced personal priorities without a Professor Emphasis or Possible Exam Topics heading. This checks one example, not a guarantee of model accuracy.

### Marker verification

In addition to the existing recording and live suites, run this with both servers running from the repository root:

```bash
mkdir -p output/playwright/phase4
npx --yes --package @playwright/cli playwright-cli -s=marker-test open http://localhost:3000
npx --yes --package @playwright/cli playwright-cli -s=marker-test run-code --filename=frontend/tests/lectureMarkers.browser.js
npx --yes --package @playwright/cli playwright-cli -s=marker-test close
```

Create `output/playwright/lecture-test.wav` using the fixture command in Verification below first. The marker browser suite uses synthetic microphone audio and native MediaRecorder/playback, with isolated live/notes API fixtures. It tests one-click markers, pause-aware time, note-entry timing, duplicate prevention, keyboard/editing behavior, local-only data before notes, lead-in/clamping/autoplay refusal, metadata duration changes, copy/upload regression, notes association and opt-out, cancel/confirm/new-session lifecycle, refresh/corruption/storage failure and resource cleanup. Native confirmation wording was also checked in the browser; the repeatable suite stubs the confirmation decision to cover both branches. No physical microphone is used.

Manual check: start recording, add each marker type, type a note while speech continues, pause for several seconds, resume and add another marker. Stop, listen via marker timestamps/timeline, edit/delete entries, finalize and generate notes with/without markers. Refresh to check the audio-unavailable recovery notice. Cancel and confirm Record Again/Discard, and verify a new lecture starts with no old markers. Check Chrome/Edge and macOS Safari on target hardware. Uploaded prerecorded lectures still support Upload → Transcribe → Generate Notes, but do not support manually placing waveform markers in this phase.

### Phase 4 file map

Verified on 2026-09-24: **18 frontend unit tests, 54 backend tests, and all three Chromium browser suites passed**. ESLint, TypeScript, the production build, backend Python compilation and `/health` passed. A real OpenAI notes request produced timestamped Personal Review Priorities while keeping an unverified student exam claim out of professor/exam sections. The final 24,851-file security scan included ignored files, dependency code, logs and built bundles; the configured credential appeared only in the ignored root `.env`. Browser assertions verified no marker note text was sent before Generate Notes and recovery stored only the expected marker session data. Browser/API fixtures do not replace manual testing of real microphone hardware, extended lectures or Safari/Edge.

Created:

- `frontend/lib/lectureMarkers.ts`: shared marker types, bounds, timestamp/seek helpers, recovery parsing and metadata projection.
- `frontend/hooks/useLectureMarkers.ts`: marker session state, mutations, deduplication and sessionStorage recovery.
- `frontend/components/LectureMarkers.tsx`, `LectureMarkerToolbar.tsx`, `LectureMarkerList.tsx`, `LectureTimeline.tsx`: editor, quick actions, review list, summary and playback timeline.
- `frontend/tests/lectureMarkers.test.mjs`, `frontend/tests/lectureMarkers.browser.js`: focused unit and browser coverage.
- `frontend/eslint.config.mjs`: ESLint/TypeScript recommended checks; raw caught API exceptions remain intentionally discarded at the privacy boundary.

Modified:

- `frontend/hooks/useAudioRecorder.ts`: expose the exact pause-aware elapsed seconds without changing capture.
- `frontend/components/AudioRecorder.tsx`: marker integration, metadata duration, preview seeking and discard confirmation.
- `frontend/app/page.tsx`, `frontend/components/TranscriptViewer.tsx`: lecture association, recovered marker notice and optional marker inclusion in notes.
- `frontend/lib/api.ts`, `frontend/app/globals.css`: optional notes metadata and matching responsive/accessibility styling.
- `frontend/package.json`, `frontend/package-lock.json`: development-only lint dependencies and script; no new runtime dependencies.
- `backend/schemas/notes.py`, `backend/routes/notes.py`, `backend/services/notes_service.py`, `backend/main.py`, `backend/tests/test_api.py`: optional validated metadata, grounded personal priorities, safe errors and compatibility tests.
- `README.md`: usage, privacy, recovery, validation, testing and limitations.

## Environment variables

| Variable | Location | Default / purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | Root `.env`, backend only | Required for AI endpoints. Empty/example values yield a clear HTTP 503 configuration error. |
| `OPENAI_TRANSCRIPTION_MODEL` | Root `.env` | `gpt-transcribe` |
| `OPENAI_LIVE_TRANSCRIPTION_MODEL` | Root `.env` | `gpt-live-transcribe`; must support transcription sessions and client-managed audio commits |
| `OPENAI_NOTES_MODEL` | Root `.env` | `gpt-5.6` |
| `BACKEND_HOST` | Root `.env` | `127.0.0.1`; used by `python main.py` |
| `BACKEND_PORT` | Root `.env` | `8000`; used by `python main.py` |
| `FRONTEND_URL` | Root `.env` | `http://localhost:3000`; the one allowed CORS origin |
| `MAX_UPLOAD_MB` | Root `.env` | `25` decimal MB; may be reduced, capped at 25 while no chunking exists |
| `OPENAI_TIMEOUT_SECONDS` | Root `.env` | `180` per upstream request; browser request timeout is 10 minutes, so keep this lower |
| `NEXT_PUBLIC_API_URL` | `frontend/.env.local` | `http://localhost:8000`; public backend URL only, never a secret |

Use matching origins: `localhost` and `127.0.0.1` are distinct browser origins. When changing ports or using another device, update both the frontend backend URL and backend CORS origin. This is an unauthenticated local MVP; do not expose its cost-incurring API to the public internet as-is.

### Model names and current API patterns

The defaults preserve the model names requested for this project. Model access must be verified in your OpenAI project. The current official `gpt-5.6` documentation redirects to the [GPT-5.6 Sol model page](https://developers.openai.com/api/docs/models/gpt-5.6-sol); if your project rejects `gpt-5.6`, configure an available compatible text model explicitly, for example `gpt-5.6-sol`. LectureAI never silently substitutes models.

The implementation follows [OpenAI file transcription](https://developers.openai.com/api/docs/guides/speech-to-text), the [GPT-Transcribe model reference](https://developers.openai.com/api/docs/models/gpt-transcribe), and [Responses text generation](https://developers.openai.com/api/docs/guides/text): `AsyncOpenAI.audio.transcriptions.create(...)` and `AsyncOpenAI.responses.create(...)` with `output_text`. Notes requests set `store=False`.

## API endpoints

| Method | Endpoint | Input | Result |
| --- | --- | --- | --- |
| GET | `/health` | None | `{"status":"ok"}` |
| GET | `/api/config` | None | Public upload limit, supported extensions, transcript character limit |
| POST | `/api/transcribe` | Multipart field `file`, optional `language` | `{"transcript":"..."}` |
| POST | `/api/realtime/session` | Optional JSON `{"language":"en"}` | Short-lived `{value, expires_at}`; never the permanent key |
| POST | `/api/notes` | `{"transcript":"...", "markers":[...]}`; markers optional | `{"notes":"# Lecture Summary\n..."}` |

Both transcription endpoints accept `language` values `en`, `zh`, `es`, `fr`, `de`, `ja`, `ko`, `pt`, `hi`, `ar`, or `auto`. Omitting it preserves automatic detection for existing API clients; the web app explicitly sends its selection (English by default).

Examples, with both services running:

```bash
curl http://localhost:8000/health
curl -F 'file=@/path/to/lecture.mp3' http://localhost:8000/api/transcribe
curl -X POST http://localhost:8000/api/notes \
  -H 'Content-Type: application/json' \
  -d '{"transcript":"The lecture explains that energy is conserved."}'
```

Errors use `{"detail":"Plain-English message"}`. Common statuses: 400 invalid/empty upload, 413 oversized input, 415 unsupported type, 422 invalid transcript, 429 upstream usage limit, 502 upstream failure/empty result, 503 missing key or model access, and 504 upstream timeout. API response validation and connection failures are handled by the frontend.

The file extension and declared MIME category are validated locally; OpenAI validates actual audio decodability. Filenames are reduced to a sanitized basename, never executed or used as a filesystem path. FastAPI spools uploads temporarily and closes/removes them when processing completes or fails. Streaming body limits protect multipart parsing even without `Content-Length`. Multipart overhead has a separate 64 KiB allowance; the file itself must still meet the configured limit. Notes accept at most 120,000 characters and requests at most 1 MB.

## Verification

Frontend:

```bash
cd frontend
npm ci
npm run build
npm run typecheck
npm run lint
npm test
```

Backend (activate the virtual environment first):

```bash
cd backend
python -m pip install -r requirements-dev.txt
python -m pytest -q
python -m compileall -q main.py config.py middleware.py routes services schemas
```

The automated backend tests use the actual OpenAI SDK with an isolated HTTP transport stub. They test the temporary-credential request/response allowlist, expiry, origin rejection and safe errors, plus upload validation/limits, partial-upload cleanup, CORS, credential errors, sanitized filenames, SDK request shapes, successful transcript → notes contracts, incomplete/empty results, and safe upstream failures. They make no paid requests and are **not evidence of live model access or transcription accuracy**. The running application has no mock/demo mode.

Node tests cover timer boundaries, format negotiation, transcript deduplication/order, interrupted segments, long transcript limits, and live-client disposal/abort/retry races. To run the browser regression against both running servers, from the repository root:

```bash
mkdir -p output/playwright
python3 -c "import wave; f=wave.open('output/playwright/lecture-test.wav','wb'); f.setnchannels(1); f.setsampwidth(2); f.setframerate(16000); f.writeframes(bytes(32000)); f.close()"
npx --yes --package @playwright/cli playwright-cli -s=recording-test open http://localhost:3000
npx --yes --package @playwright/cli playwright-cli -s=recording-test run-code --filename=frontend/tests/recording.browser.js
npx --yes --package @playwright/cli playwright-cli -s=recording-test close
npx --yes --package @playwright/cli playwright-cli -s=live-test open http://localhost:3000
npx --yes --package @playwright/cli playwright-cli -s=live-test run-code --filename=frontend/tests/liveTranscription.browser.js
npx --yes --package @playwright/cli playwright-cli -s=live-test close
```

The browser regression replaces `getUserMedia` in its isolated test browser with a synthetic Web Audio stream and exercises the native MediaRecorder and audio player. AI success responses are test fixtures; no physical microphone audio or paid API requests are used. It covers timer/pause/resume/stop, recording with live unavailable, stream/object-URL cleanup, microphone errors, canceling permission, preview errors, shared transcription/notes, upload regression, mobile width, and unsupported browsers. The separate live browser test stubs only session minting and WebRTC signaling/events while using native MediaRecorder. It covers delta/completion ordering, duplicate events, silence commits, pause/resume track isolation, connection drops, finite retries, malformed events, stop-time draining, resource cleanup, scrolling, mobile width, unsupported live APIs, and final-only notes. Lifecycle unit tests exercise the disposal method used on component unmount, including late credential responses. Close the test browser afterward to remove test-only overrides. Safari/Edge and real microphone permission UI should also be checked manually on the target device. No new runtime or test-framework dependencies are required; Playwright CLI is obtained by `npx` for the browser check.

Manual smoke test:

1. Start both servers; confirm `/health` returns `ok`.
2. With no key configured, submit a supported non-empty recording and confirm the browser shows the configuration error.
3. Configure a real key, restart the backend, and upload a short spoken recording. Confirm the full transcript, notes, and both copy buttons.
4. Try an empty file, unsupported extension, and oversized recording. Check that errors are visible and that you can select a valid file afterward.
5. Select a new upload and confirm old results disappear. Check mobile width and keyboard access.
6. Follow **Recording Lectures** above. Check that Pause freezes the timer, Resume advances it, Stop turns off the microphone indicator, and the preview plays. Check Discard/Record Again, blocked mode switching while active, and the shared transcription/notes flow.
7. Block microphone permission and confirm a helpful error. Re-enable permission in site/OS settings. Try Safari as well as Chrome or Edge, since encoding support differs.

## Current MVP limitations

- No accounts/authentication, payments, cloud storage, persistent lectures, or database. Audio, transcripts and generated notes exist in current page memory. Saved marker data has same-tab sessionStorage recovery, but no permanent history. Selecting a new upload or submitting a new transcription clears previous shared transcript/notes results.
- Live text is provisional and can contain gaps or recognition errors. Full-file finalization is required for notes; no live notes or exam-hint analysis is performed.
- Recordings are stored in browser memory until submitted, and their local preview remains in memory until discarded or the page closes. Closing/refreshing the tab loses unsaved recordings. Very long recordings depend on device/browser memory, device wake state, and backend upload limits; no chunked or background upload exists.
- Single-file uploads only: MP3, M4A, WAV, MP4, MPEG, MPGA, and WebM. The [current OpenAI file limit is 25 MB](https://developers.openai.com/api/docs/guides/speech-to-text). Raising `MAX_UPLOAD_MB` above 25 cannot bypass it. Compress or externally split long recordings; automatic splitting/FFmpeg is intentionally absent. The service layer is the extension point for future chunking/reassembly.
- Notes input is capped at 120,000 characters; no transcript summarization/chunking pipeline yet. The transcript remains copyable if it is too long for notes.
- Notes depend on transcription accuracy. The prompt disallows invented facts and assessment hints, but students should verify important content against the original recording.
- Requests run synchronously from the user's perspective; no background jobs or audio/transcript recovery after refresh. Only the live connection has bounded retries; file/notes requests are retried explicitly by the user. The SDK uses async I/O and a configured timeout. Larger lectures can take several minutes.
- Clipboard access requires localhost or HTTPS and browser permission. On failure, the app offers manual text selection.
- Recordings and transcripts are sent to OpenAI to perform the requested processing. LectureAI does not persist them; OpenAI data handling is governed by your API account's policies, and `store=False` does not imply zero retention for all upstream processing.

## Future improvements

The next three logical features are:

1. **Long-lecture support:** audio chunking with context-preserving boundaries, transcript assembly, and resumable processing.
2. **Saved lectures and courses:** persistent storage with authentication, course organization, and a searchable library.
3. **Study exports:** PDF/DOCX notes, then flashcards and practice quizzes grounded in the transcript.

Other future possibilities include timestamps, speaker identification, and more precise professor-emphasis detection.

## Recording permission

You are responsible for obtaining permission and complying with applicable school policies and laws before recording lectures or other people.
