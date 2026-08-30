# Fork — `dave-atx/anarlog`

Personal long-lived fork of [`fastrepl/anarlog`](https://github.com/fastrepl/anarlog) (Tauri 2 desktop app, formerly hyprnote). Its **only** intentional deviation from upstream is to unlock *local, on-device* Pro features so they work without a subscription. Everything else tracks upstream verbatim.

> **Agent note:** this file is the complete handoff. If you are rebasing, building, or debugging the fork, you should not need any other fork-specific doc. The former `fork/PLAN.md` has been folded here and removed.

## 1. What this fork does and does not do

**Unlocked (local, no network required):**

- Custom dictionary terms (`settings/dictionary`)
- Automation workflows (`settings/automations`)
- Custom summary-format templates (`templates/auto-form.tsx`)
- Variable audio playback speed (`audio-player`)
- Custom app icon (`settings/appearance/app-icon`)
- Plan label / paywall UI (`settings/general/account`)

**Remains inert-but-not-crashing** (network calls fail without hosted services — accepted as "clickable but broken"):

- Team / workspaces, CloudSync, note sharing, attachment sync
- Calendar + todo OAuth via Nango, Cloud API settings
- Hosted LLM/STT provider entries (`anarlog` cloud), Stripe billing/checkout

**Not gated at all** (work in every build): on-device STT (`soniqo`, `apple_speech`, `local_file`) and on-device LLM (`apple_foundation`, `lmstudio`, `ollama`, `unsloth`) — all declare `requirements: []`.

## 2. Patch

One-file override in `apps/desktop/src/auth/billing-context.ts`. `useBillingAccess()` returns the real context in `test` mode and a forced-Pro object otherwise:

```ts
// Local fork: unlock local Pro-gated features without a subscription.
// `isReady` is forced because the claims query is disabled when
// unauthenticated (`enabled: false`), so it would stay pending forever.
// Guard by `MODE !== "test"` so vitest still sees real billing values.
if (import.meta.env.MODE !== "test") {
  return {
    ...context,
    isPro: true,
    isPaid: true,
    isLite: true,
    isReady: true,
    plan: "pro" as const,
  };
}
```

Why this seam:

- `~48` files call `useBillingAccess()` — there are no direct JWT / entitlement-string checks elsewhere in the desktop frontend (grepped `entitlements.includes`, `hyprnote_pro`, `subscription_status ===` — zero hits outside `billing.tsx` / `auth-analytics.ts`).
- `billing-context.ts` is plumbing (`createContext` + hook, ~22 lines, 3 commits ever) — minimal rebase conflicts vs `billing.tsx` (21 commits, active trial UX) or `packages/supabase/src/billing.ts` (shared with `apps/web`, breaks analytics + 7 unit tests).
- No `apps/desktop/src/env.ts` change — a second file to conflict on, t3-env validation buys nothing here.
- No env-var indirection — an env flag would have to be wired into CI or releases silently ship paywalled. The unlock is committed directly.
- `auth-analytics.ts` calls `deriveBillingInfo` independently for telemetry; it is intentionally not overridden.
- Rust entitlement checks (`crates/api-auth`, `crates/api-subscription`) belong to the hosted `api` binary and are not linked into the desktop app. `plugins/` has zero entitlement hits.

`apps/desktop/src/auth/billing.tsx`'s internal effects read a local `billing` variable, not the hook, so the hook-level override is sufficient.

## 3. Known limitation — `AM_API_KEY`

`plugins/local-stt/src/lib.rs:76` reads `option_env!("AM_API_KEY")`; `plugins/local-stt/src/ext.rs:843` raises `AmApiKeyNotSet`. The Argmax-engine on-device STT models — `ParakeetV2`, `ParakeetV3`, `WhisperLargeV3` (`SttModelType::Argmax` in `crates/local-stt-core`) — require that key baked into the binary. It is a third-party vendor key unrelated to `BillingContext` and is not available to the fork.

**Those three models will not start in self-built binaries.** Soniqo and Apple Speech are unaffected and cover on-device transcription. Do not attempt to extract the key from official builds.

## 4. Branch and update model

```
fork = long-lived patch stack, rebased onto each upstream `desktop_v*` tag, force-pushed.
       The repo's DEFAULT branch — `schedule` triggers only fire from the default branch.
       Force-pushing a default branch is allowed; GitHub only blocks deletion.

main = fast-forward-only mirror of upstream/main. Never commit here.
```

Remotes:

```
origin    https://github.com/dave-atx/anarlog.git   (this fork)
upstream  https://github.com/fastrepl/anarlog.git
```

- `fork` is based on a **release tag** (`desktop_v*`), not `main` HEAD, so builds come from the exact commit upstream released. Every `desktop_v*` tag is an ancestor of `upstream/main`, so the base is recoverable without stored state:

  ```sh
  git fetch upstream --tags --force
  NEW_TAG=$(git tag --list 'desktop_v*' --sort=-v:refname | head -1)
  OLD_BASE=$(git merge-base fork upstream/main)
  git rebase --onto "$NEW_TAG" "$OLD_BASE" fork
  ```

  `fork/update.sh` does this with `--abort` on conflict and a clear message.
- Enable `git config rerere.enabled true` locally — replays a resolved conflict automatically. Note `rerere`'s cache is **local-only**; CI aborts on conflict and opens an issue.
- **Single-writer rule:** CI is the authoritative rebaser/force-pusher of `fork`. Both `fork/update.sh` (local) and the CI job rewrite the same branch. Before touching `fork` locally:

  ```sh
  git fetch origin && git reset --hard origin/fork
  ```

  Only force-push manually when resolving a conflict CI reported. The workflow's `concurrency: { group: fork-release, cancel-in-progress: false }` guards the reverse race. Alternative considered and not chosen: quilt-style `fork/patches/*.patch` — revisit if rebase conflicts become chronic.

No git submodules. `.gitattributes` only declares `apps/desktop/src-tauri/resources/llm.gguf` as LFS, which is not currently tracked (`git lfs ls-files` → 0).

## 5. Bundle identity

| Config | `identifier` | `productName` | macOS data dir |
|---|---|---|---|
| `tauri.conf.json` (dev) | `com.hyprnote.dev` | `Anarlog Dev` | `~/Library/Application Support/com.hyprnote.dev/` |
| `tauri.conf.stable.json` | `com.hyprnote.stable` | `Anarlog` | `~/Library/Application Support/com.hyprnote.stable/` |

The fork keeps `com.hyprnote.stable` / `Anarlog` — the build is a drop-in replacement that inherits the existing database. Delete the official `/Applications/Anarlog.app` so the two do not fight. Signing a чужой bundle ID with your own Apple Team ID is fine for Developer ID distribution (upstream's team is `6SLY7V277V`).

**What does not carry over** when the Team ID changes (accepted tradeoff): macOS Keychain items and (partly) TCC grants are keyed to the signing Team ID, not the bundle ID. Expect mic / system-audio re-prompts on first launch and permanently unreadable Keychain items from the official app (irrelevant — cloud auth is abandoned).

## 6. Updater

There is no Sparkle — every `sparkle` hit in the repo is a Lucide icon. The app uses the **Tauri v2 updater plugin** wrapped by `plugins/updater2`:

- `plugins/updater2/src/lib.rs:52` — 30-minute check loop, skipped in debug (`cfg!(debug_assertions)`).
- `plugins/updater2/src/ext.rs:126` — downloads to `<app_cache_dir>/updates/<version>.bin`, emits Specta events.
- `apps/desktop/src/main/update-banner.tsx` — toast state machine.

Config is **compile-time** (merged by `tauri build --config <file>`; no runtime override):

- `apps/desktop/src-tauri/tauri.conf.json:97` — base: `updater.active: false`, upstream minisign pubkey, `createUpdaterArtifacts: true`.
- `tauri.conf.stable.json` — `active: true`, endpoint `https://desktop.anarlog.so/update/...` → 302 via `apps/web/netlify.toml:56` to `https://cdn.crabnebula.app/update/fastrepl/hyprnote2/:splat`. Artifacts mirrored to GitHub Releases at `desktop_v$VERSION`.
- `tauri.conf.stable-macos.json` — currently unreferenced (only `tauri.conf.macos-intel.json` is conditionally added at `desktop_cd.yaml:185`); treat as dead.

Fork overlay `apps/desktop/src-tauri/tauri.conf.fork.json` (applied **after** `tauri.conf.stable.json`):

```json
{
  "plugins": {
    "updater": {
      "active": true,
      "pubkey": "<fork minisign pubkey>",
      "endpoints": ["https://github.com/dave-atx/anarlog/releases/latest/download/latest.json"]
    }
  }
}
```

Verify the merged build carries the **fork** pubkey — otherwise the updater rejects the fork's own signatures. `latest.json` is a plain static JSON endpoint (no CrabNebula equivalent needed).

**Critical:** `latest.json`'s `platforms.darwin-aarch64.url` must point at the **`.app.tar.gz` updater artifact** (and its `.sig`), not the DMG. On macOS, `createUpdaterArtifacts: true` emits `Anarlog.app.tar.gz` + `.sig` alongside the DMG; the tarball is what the updater downloads and verifies.

## 7. Build

### Local

macOS arm64 only (no x86_64 / Linux / Windows). Xcode + `xcrun`.

```sh
export PATH="$HOME/.cargo/bin:$PATH"
export SDKROOT="$(xcrun --sdk macosx --show-sdk-path)"

# App build (skips DMG bundling, which needs Finder Automation permission)
pnpm -F desktop tauri build --target aarch64-apple-darwin \
  --config ./src-tauri/tauri.conf.stable.json \
  --config ./src-tauri/tauri.conf.fork.json \
  --bundles app

# Ad-hoc local signing may need:
codesign --force --deep --sign - "Anarlog.app"
```

Pre-commit gates (from `AGENTS.md` — run before every commit):

```sh
pnpm exec dprint fmt && pnpm fmt:check
pnpm -F desktop typecheck
pnpm -F desktop test        # billing.test.tsx must be 19/19 (vitest runs MODE=test, override is inert)
pnpm exec oxlint --quiet --format=github apps/desktop/src/
```

### Required compile-time env vars

Release (`tauri build`, non-debug) will not compile without these:

| Var | Where | Notes |
|---|---|---|
| `POSTHOG_API_KEY` | `plugins/analytics/src/lib.rs:62` | `env!()` + `assert!(starts_with("phc_"))` in release; `option_env!` in debug |
| `APP_VERSION` | `plugins/analytics/src/ext.rs:83` | `env!()` unconditional — needed in debug too |
| `VITE_API_URL` | `plugins/calendar`, `plugins/todo` | `env!()` in release; debug falls back to `http://localhost:3001` |

`apps/desktop/src/env.ts:5` is all optional/defaulted (`emptyStringAsUndefined: true` so an unset secret resolves to `undefined`, not `""`). `VERGEN_GIT_SHA` is generated by `plugins/misc`'s own `build.rs`.

**Fork CI values** (see §8): `POSTHOG_API_KEY` is a placeholder (e.g. `phc_local_fork_no_telemetry_0000000000` — must start `phc_` and must not be upstream's real key), `VITE_API_URL=https://api.anarlog.so` (so cloud features fail with 401 instead of hammering `localhost:3001`), `SENTRY_DSN` / `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` left **unset** so Sentry init is skipped (`error-reporting.ts:187`) and cloud auth is cleanly absent.

### Generated files that churn after rebases

Tracked-but-generated; expect spurious diffs after any rebase that touches API routes — usually `git checkout -- <file>`:

`crates/api-client/openapi.gen.json` (via `crates/api-client/build.rs` from `apps/api/openapi.gen.json`), `apps/desktop/src/routeTree.gen.ts`, `apps/web/src/routeTree.gen.ts`, `apps/desktop/src/types/tauri.gen.ts`, ~50 `plugins/*/js/bindings.gen.ts` (tauri-specta), `packages/api-client/src/generated/**`, `crates/pyannote-cloud/openapi*.gen.json`, `plugins/webhook/openapi.gen.json`, ~110 files under `apps/desktop/src/i18n/locales/**` (lingui), plus `Cargo.lock` / `pnpm-lock.yaml`.

Because the fork adds no dependencies and no translated strings, none of these should conflict. If you ever add a user-visible string, run `pnpm -F desktop exec lingui extract --clean --workers 1 && pnpm -F desktop exec lingui compile --strict --workers 1` and include the catalog changes.

## 8. Release CI — `fork-release.yml`

Lives on `fork` (the default branch). Triggers: `schedule: "0 9 * * *"` + `workflow_dispatch`. Permissions `contents: write` + `issues: write`; concurrency group `fork-release`.

1. Checkout `fetch-depth: 0` + `fetch-tags`. Add `upstream` remote, `git fetch upstream --tags`, set `user.name`/`user.email`.
2. Resolve newest `desktop_v*` tag via `git tag --list 'desktop_v*' --sort=-v:refname | head -1`. Derive `VERSION=${TAG#desktop_v}`. Version is passed **explicitly** to `scripts/version.sh` — `fork` HEAD sits past the tag so doxxer/tag-describe would not yield the bare version.
3. Early-exit if `gh release view fork_v$VERSION` already exists.
4. Rebase `fork` onto `$TAG` (`git rebase --onto "$TAG" "$(git merge-base fork upstream/main)" fork`), force-push. On conflict: `git rebase --abort`, open an issue, fail.
5. `scripts/version.sh ./apps/desktop/src-tauri/tauri.conf.json $VERSION`, `pnpm -F ui build`, `cargo xtask prepare-binaries`, three `scripts/sidecar.sh` calls (`char-chrome-native-host`, `check-permissions`, `resources/cli/anarlog-cli`), codesign `crates/cloudsync/vendor/cloudsync/macos/<arch>/cloudsync.dylib`, set `SDKROOT`.
6. Build: `pnpm -F desktop tauri build --target aarch64-apple-darwin --config ./src-tauri/tauri.conf.stable.json --config ./src-tauri/tauri.conf.fork.json` on **`macos-26`** (arm64, free for public repos; replaces upstream's `depot-macos-26` and matches its macOS 26 SDK/Xcode generation). Reuses composite actions `install_desktop_deps` / `rust_install` / `pnpm_install` / `apple_cert` / `macos_notarize_dmg` / `macos_tcc`.
7. Env on build: `APP_VERSION`, `POSTHOG_API_KEY` (placeholder), `VITE_API_URL`, `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
8. Notarize + staple DMG, emit `latest.json` via `fork/latest-json.mjs`:

   ```sh
   node fork/latest-json.mjs --version "$VERSION" \
     --sig-file "$TARBALL.sig" \
     --url "https://github.com/dave-atx/anarlog/releases/download/fork_v$VERSION/Anarlog.app.tar.gz"
   ```

   ```json
   { "version": "1.4.16", "pub_date": "<ISO8601>", "platforms": {
     "darwin-aarch64": { "signature": "<contents of .app.tar.gz.sig>", "url": "<tarball URL>" } } }
   ```

9. Publish GitHub Release tagged `fork_v<version>` with **four assets**: DMG (manual installs), `.app.tar.gz`, `.app.tar.gz.sig`, `latest.json`. Also available at `releases/latest/download/latest.json` for the updater. Version is upstream's verbatim (e.g. `1.4.16`); semver build metadata (`1.4.16+fork.2`) is ignored in precedence, so fork-only rebuilds of the same upstream version must be installed by hand.

### GitHub repo setup (one-time)

```sh
# Make `fork` the default branch (required for `schedule` to fire)
gh repo edit dave-atx/anarlog --default-branch fork
# Enable Actions on the fork + enable the workflow
# (scheduled workflows are disabled by default in forks of public repos)
gh workflow enable fork-release.yml
```

Disable inherited workflows server-side (no git changes — deleting files produces a conflict on every rebase):

```sh
gh api /repos/dave-atx/anarlog/actions/workflows --paginate \
  --jq '.workflows[] | select(.path != ".github/workflows/fork-release.yml") | .id' \
  | xargs -I{} gh api -X PUT /repos/dave-atx/anarlog/actions/workflows/{}/disable
```

Re-run after any rebase that adds new upstream workflow files. Notable inherited triggers: `workflow_dispatch`-only (`desktop_cd`, `desktop_publish`, ... — harmless), `push`/`pull_request` (`desktop_ci`, `fmt`, `lint`, `zizmor`, ... — will fire on fork activity), daily `schedule` (`desktop_ci:260`, `mobile_ci:505`, `pro_api_e2e:572` — the last fails without `INFISICAL_*_TOKEN`), `issue_comment` (`command_dispatcher`, `opencode`), plus org-only deploy workflows (`bot_cd`, `slack_internal_cd`, `openstatus`). **Do not delete these files in git.**

Repository secrets / variables:

| Name | Kind | Value |
|---|---|---|
| `APPLE_CERTIFICATE` | secret | base64 `.p12` Developer ID cert |
| `APPLE_CERTIFICATE_PASSWORD` | secret | `.p12` password |
| `KEYCHAIN_PASSWORD` | secret | temporary keychain password |
| `APPLE_ID`, `APPLE_PASSWORD` (app-specific), `APPLE_TEAM_ID` | secrets | notarization |
| `TAURI_SIGNING_PRIVATE_KEY` | secret | contents of `fork/updater.key` (not a path) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | secret | key password (must be **non-empty** — GitHub rejects empty secret values; generate with `pnpm exec tauri signer generate -w fork/updater.key`) |
| `POSTHOG_API_KEY` | secret | placeholder starting `phc_` e.g. `phc_local_fork_no_telemetry_0000000000` |
| `VITE_API_URL` | variable | `https://api.anarlog.so` |

First run via `workflow_dispatch` before trusting the cron. Public-repo crons auto-disable after 60 days without repo activity — the daily force-push should keep it alive.

## 9. Updater keypair

```sh
pnpm exec tauri signer generate -w fork/updater.key
```

- Put the private key **contents** into `TAURI_SIGNING_PRIVATE_KEY` and the password into `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. The `TAURI_SIGNING_PRIVATE_KEY_PATH` variant silently did not work in this Tauri CLI version — use the contents form.
- Copy the printed pubkey into `apps/desktop/src-tauri/tauri.conf.fork.json`.
- Never commit `fork/updater.key`; it is gitignored via `fork/.gitignore`.

## 10. Helper scripts

| Script | Purpose |
|---|---|
| `fork/update.sh` | Local rebase helper — fetches `upstream --tags`, resolves newest `desktop_v*`, rebases `fork` onto it, aborts with a clear message on conflict |
| `fork/latest-json.mjs` | Emits the Tauri updater manifest from the `.app.tar.gz.sig` contents — see §8 for invocation |

## 11. Telemetry and upstream hosts baked into the app

- Sentry: skipped if `VITE_SENTRY_DSN` unset (`error-reporting.ts:187`); Rust side `option_env!("SENTRY_DSN")`, runtime-disablable via `ANARLOG_DISABLE_SENTRY`.
- PostHog: see `phc_` assert above; upstream CI uses literal placeholders `phc_windows_ci` / `phc_linux_ci` — precedent for the fork's placeholder.
- Model downloads (unauthenticated, no billing token, not env-configurable): `crates/whisper-local-model`, `crates/local-model`, `crates/am` → `https://hyprnote.s3.us-east-1.amazonaws.com/v0/...`. Soft dependency: if fastrepl pulls the bucket, local model downloads break for the fork too.
- Hardcoded and not env-configurable: changelog fetch `https://raw.githubusercontent.com/fastrepl/anarlog/main/packages/changelog/content/${version}.md` (`changelog/data.ts:14` — points at upstream, which is correct since the fork ships upstream code), template/resource suggestions `https://anarlog.so/api/...`, docs links to `docs.anarlog.so`, `https://anarlog.so/discord`, the `.anarlog.so` host check in `session-sharing/urls.ts:160`.
- Nango (`crates/nango/`) is backend-only; desktop reaches it through `VITE_API_URL`.

## 12. Troubleshooting

- `cargo: command not found` in non-interactive shells → `export PATH="$HOME/.cargo/bin:$PATH"`.
- `SDKROOT` missing for Tauri builds → `export SDKROOT="$(xcrun --sdk macosx --show-sdk-path)"`.
- DMG bundling via Finder AppleScript needs Automation permission — use `--bundles app` locally to skip.
- Ad-hoc local builds may need a final `codesign --force --deep --sign - "Anarlog.app"`.
- Generated churn after rebases — `git checkout -- <file>` (see §7).
- Argmax STT models not starting — expected without `AM_API_KEY` (§3); use Soniqo / Apple Speech.
- First launch re-prompts mic/system-audio TCC and orphans Keychain items — expected after Team ID change (§5).
- `pnpm fmt:check` reports ~67 Swift failures on Linux ("Cannot start formatter") — macOS-only `swift format` via `dprint`; not real diffs.
- If no new `desktop_v*` release appears, verify cron is still enabled (forks disable `schedule` by default; public crons auto-disable after 60 days of inactivity) and that `fork` is still the default branch. Manual fallback: `gh workflow run fork-release.yml` or a `repository_dispatch` from another repo. Only one workflow run has occurred so far / no new upstream tags since `desktop_v1.4.15` — cron has not yet been end-to-end verified.

## 13. Risks and maintenance notes

- Cron prerequisites — `schedule` only fires from the default branch, is disabled by default in forks of public repos, and auto-disables after 60 days inactivity. Verify it fires after enabling.
- Fork-only rebuilds of the same upstream version cannot ship through the updater (version is upstream's verbatim; semver build metadata is ignored in precedence) — install by hand.
- `billing-context.ts` conflicts are the main recurring cost; `rerere` absorbs most. If upstream restructures the hook, re-derive the seam from §2 rather than force-fitting the old diff.
- The ungating patch is publicly readable — MIT permits this (owner's accepted tradeoff for free macOS runners and auth-free assets).
- Upstream ships near-daily (`desktop_v1.4.0` 2026-08-01 → `v1.4.15` 2026-08-29), so expect a build and update toast most days — switch the cron to weekly if noisy.

## 14. Licensing

Repo root `LICENSE` is MIT, `Copyright (c) 2023-present Fastrepl, Inc.` `LICENSING.md` splits: `enterprise/**` is under `LICENSE.enterprise` (separate commercial license), everything else is MIT. `enterprise/` is its own Cargo workspace and the desktop app does not depend on it (no `enterprise` reference in `Cargo.toml` or `apps/desktop/src-tauri/Cargo.toml`), so the entire fork surface is MIT. No `TRADEMARK`/`NOTICE` file and no "you may not remove branding" clause. The CLA in `CONTRIBUTING.md:121` governs contributions back to upstream only. MIT obligation is retaining the `LICENSE` text.

## 15. First-build verification checklist

- [ ] `pnpm -F desktop test` passes 19/19 in `billing.test.tsx`
- [ ] Merged tauri config carries the **fork** updater pubkey, not upstream's
- [ ] DMG is notarized and stapled (`xcrun stapler validate`), `spctl -a -t open --context context:primary-signature` accepts it
- [ ] `latest.json` resolves at `releases/latest/download/latest.json` without auth
- [ ] Release carries all **four** assets (DMG, `.app.tar.gz`, `.app.tar.gz.sig`, `latest.json`) and `latest.json`'s `url` points at the `.app.tar.gz`, not the DMG
- [ ] CI-built DMG (not just a local build) shows Dictionary, Automations, Templates, custom app icon, and variable playback speed with no paywall while signed out
- [ ] First launch: mic/system-audio re-prompts (expected) and existing notes database loads intact
- [ ] Sync shows "Sign in to use cloud sync" (inert, not crashed)
- [ ] On-device STT works via Soniqo or Apple Speech (Argmax models expected to fail — §3)
- [ ] Second run against a newer upstream tag delivers an in-app update

