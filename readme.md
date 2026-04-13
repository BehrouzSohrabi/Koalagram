# Koalagram

Koalagram is a small Scaledrone chat client that runs in two modes from the same codebase:

- a standalone web app served from the repo root
- a Chrome side panel extension powered by the same `index.html`

There is no build step. The app is plain HTML, CSS, and ES modules.

## Current state

What is implemented right now:

- realtime chat over Scaledrone using a fixed observable room: `observable-main`
- one chat per Scaledrone channel ID
- shared shell for web and extension runtime
- saved identity, saved channels, and automatic reopen of the last opened channel
- presence list with join and leave notes
- per-channel local message archive
- peer-to-peer history sync between connected clients when local or Scaledrone history is missing
- synced chat metadata via messages: chat name and accent color
- unread attention handling
  - Chrome extension badge updates while the side panel is closed
  - web app title/app badge updates
  - web notifications backed by `webapp-service-worker.js`
- import/export of local settings
- clear current channel history or clear all local data
- web app update detection with a reload prompt when a newer deployed version is available

What is not in the project:

- no backend server
- no account system or auth layer
- no channel creation UI inside the app
- no moderation or access control beyond knowing the Scaledrone channel ID
- no bundler, packaging pipeline, or automated test suite
- no full offline-first mode or asset caching layer

## Runtime model

Koalagram expects an existing Scaledrone channel ID. Inside the app:

- the user-facing "channel ID" is the Scaledrone channel
- the room name is always `observable-main`
- profile data is sent as Scaledrone `client_data`
- extension storage uses `chrome.storage.local`
- web storage falls back to `window.localStorage`

## Run locally

Serve the repo root over HTTP. Opening `index.html` directly from disk is not enough because the app uses ES modules and a service worker.

Simple option:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

Live reload option:

```bash
pip install livereload
python3 serve.py
```

## Load the Chrome extension

Requirements:

- Chrome 114 or newer

Steps:

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Click `Load unpacked`.
4. Select this repository root.
5. Click the extension action to open the Koalagram side panel.

The extension manifest points the side panel at repo-root `index.html`, so the extension and web app stay on the same UI shell.

## Using the app

1. Enter a display name.
2. Optionally add an avatar image URL and color.
3. Paste a Scaledrone channel ID.
4. Open the channel.
5. Optionally set a chat name, accent color, and requested Scaledrone history count in the channel details drawer.

Useful built-in actions:

- `Copy invite` copies a shareable text snippet with the channel ID.
- `Sync Now` asks connected peers to resend their local archive.
- `Export` and `Import` move local settings between devices.
- `Clear This Channel` removes only the local archive for the active channel.
- `Clear All Local Data` wipes saved channels, local history, and the last-opened state on the current device.

## Storage and sync behavior

- saved channels are capped at `8`
- local archive is capped at `400` stored records per channel
- the in-memory message view is capped at `300` rendered chat messages
- Scaledrone history requests are clamped to `0-100` messages per join
- peer sync shares stored history in chunks of `50`

History recovery currently happens in this order:

1. local archive is hydrated first
2. Scaledrone history is requested on connect
3. connected peers are asked for history sync after the first history pass

This means a newly opened device can recover recent history even when Scaledrone history is disabled or incomplete, as long as another client with local history is online.

## Project layout

```text
.
|- index.html
|- manifest.json
|- site.webmanifest
|- webapp-service-worker.js
|- serve.py
`- src/
   |- background/
   |- panel/
   |- shared/
   |- lib/
   `- assets/
```

Key files:

- `index.html`: shared app shell for web and extension
- `manifest.json`: Chrome extension manifest
- `src/panel/`: UI, connection flow, chat rendering, storage actions
- `src/background/index.js`: extension background monitor for unread badge behavior
- `src/shared/`: runtime detection, storage, chat normalization, attention helpers
- `src/lib/scaledrone-client.js`: local Scaledrone observable-room client wrapper

## Notes

- The web app registers a service worker for notification handling, but it does not implement a full offline cache.
- The web app checks `index.html` for a newer `koalagram-web-version` tag every minute and when the tab becomes visible again.
- When deploying a new web app version, bump the `koalagram-web-version` meta tag in `index.html` so already-open tabs can detect the update and prompt for reload.
- The extension content security policy only allows Scaledrone socket connections to `wss://api.scaledrone.com`.
- If a Scaledrone channel becomes unavailable, Koalagram removes stale saved state for that channel during reconnect/open handling.
