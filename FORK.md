# anarlog fork (dave-atx)

This is [dave-atx/anarlog](https://github.com/dave-atx/anarlog), a personal long-lived fork of [fastrepl/anarlog](https://github.com/fastrepl/anarlog) (Tauri 2 desktop meeting-notes app, formerly hyprnote).

**The only intentional deviation from upstream:** local, on-device Pro-gated features (custom dictionary, automation workflows, custom summary templates, variable playback speed, custom app icon, plan/paywall UI) are unlocked without a subscription. Everything else — including all cloud/hosted features, which are inert without hosted services — tracks upstream verbatim. Full detail, including the exact patch and rationale, is in [fork/README.md](fork/README.md); this file does not repeat it.

## Install the desktop app

| Step | Detail |
|---|---|
| Platform | macOS, Apple Silicon (arm64) only. No Intel, no Linux, no Windows desktop build. |
| Before installing | Delete `/Applications/Anarlog.app` if the official app is installed. The fork keeps upstream's bundle identifier and app name, so the two collide and must not coexist. |
| Download | Latest DMG from [github.com/dave-atx/anarlog/releases/latest](https://github.com/dave-atx/anarlog/releases/latest) — grab `Anarlog_<version>_aarch64.dmg`. Ignore `Anarlog.app.tar.gz`, its `.sig`, and `latest.json` on that page; those are updater machinery, not for humans. |
| Gatekeeper | The DMG is signed with a Developer ID and notarized, so it opens without warnings. |
| First launch | macOS re-prompts for microphone and system-audio permission, and any Keychain items from the official app are unreadable. Both are expected — the fork signs with a different Team ID than upstream, and macOS keys Keychain/TCC to the Team ID, not the bundle ID. Your existing notes database is unaffected. |
| Updates | Automatic after install, from the fork's own updater endpoint. No manual re-download needed. |

## Install the CLI

The `anarlog` CLI is unmodified upstream MIT code, built for platforms upstream doesn't publish binaries for (Linux arm64/x86_64, macOS arm64/x86_64), via the tap [dave-atx/homebrew-anarlog](https://github.com/dave-atx/homebrew-anarlog):

```sh
brew install dave-atx/anarlog/anarlog-cli
brew upgrade   # later
```

The CLI ships `anarlog meetings`, `anarlog mcp` (an MCP server for agents), `anarlog proposals`, `anarlog auth`, and `anarlog doctor`. It's also bundled inside the macOS app already — the tap exists for Linux boxes and anyone who wants the CLI standalone.

There is no Homebrew cask for the desktop app. Upstream's official cask (`brew install --cask anarlog`) installs upstream's build, not this fork.

## Known limitation

The Argmax on-device STT models — ParakeetV2, ParakeetV3, WhisperLargeV3 — will not start in fork builds. They require a third-party `AM_API_KEY` baked in at compile time that the fork doesn't have. Soniqo and Apple Speech on-device transcription are unaffected and work normally. See [fork/README.md §3](fork/README.md#3-known-limitation--am_api_key).

## More

- Maintaining, rebasing, or building this fork: [fork/README.md](fork/README.md) — the complete handoff for maintainers and coding agents.
- The real, official project: [fastrepl/anarlog](https://github.com/fastrepl/anarlog).
