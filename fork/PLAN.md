# Fork maintenance plan — handoff for a future agent

Status: plan approved and revised after review (2026-08-29), nothing implemented yet. 
As of 2026-08-29 the working tree still
holds the previous session's exploratory patch (see "Current working tree" below). Phase 1
of this plan reshapes that patch; nothing here has been committed or pushed.

This document is the complete context. You should not need to re-explore the repo to execute it.
Once Phase 1 lands, fold the still-relevant parts of `../LOCAL_FORK.md` into `fork/README.md`
and delete this file (or reduce it to a changelog of what was done).

---

## 1. What this fork is for

`dave-atx/anarlog` is a personal long-lived fork of `fastrepl/anarlog` (a Tauri 2 desktop
note-taking app, formerly branded hyprnote). Its **only** deviation from upstream is ungating
*local, on-device* Pro features so they work without a subscription. Cloud-backed features
(CloudSync, note sharing, hosted STT/LLM, calendar/todo OAuth via Nango, Stripe billing) are
deliberately left **inert but not crashing** — "clickable but broken" is the accepted behavior.
No attempt is made to replace fastrepl's hosted services.

Licensing: the repo root `LICENSE` is **MIT**, `Copyright (c) 2023-present Fastrepl, Inc.`
`LICENSING.md` splits the tree: `enterprise/**` is under a separate commercial license
(`LICENSE.enterprise`), everything else is MIT. `enterprise/` is its own Cargo workspace and
the desktop app does **not** depend on it (verified: no `enterprise` reference in
`Cargo.toml` or `apps/desktop/src-tauri/Cargo.toml`), so the entire fork surface is MIT.
There is no TRADEMARK/NOTICE file and no "you may not remove branding" clause. The CLA in
`CONTRIBUTING.md:121` governs contributions *back to upstream* only; it places no restriction
on maintaining or building a fork. MIT's only obligation is retaining the LICENSE text.

---

## 2. Decisions already made (do not re-litigate)

These were answered explicitly by the repo owner on 2026-08-29:

| Decision | Choice |
|---|---|
| Build targets | **macOS arm64 only** (no x86_64, no Linux, no Windows) |
| Repo hosting | **Public fork** on GitHub (`dave-atx/anarlog`) — free macOS runners, auth-free release assets |
| Update delivery | **In-app auto-update** via the Tauri updater, pointed at the fork's own GitHub Releases. No Homebrew tap (explicitly skipped; can be added later) |
| Code signing | **Developer ID + notarization** — the owner has an Apple Developer account |
| Bundle identifier | **Keep `com.hyprnote.stable`** — the fork build is a drop-in replacement that inherits the existing app-data dir and database. Owner deletes the official Anarlog.app. `productName` stays `Anarlog`. |
| CI cadence | **Daily cron, build on every new upstream `desktop_v*` tag** |
| Patch shape | **Reshape into a one-file patch** in `billing-context.ts`, drop the `env.ts` change, discard the stray `openapi.gen.json` diff |
| Unlock delivery | **Committed directly in the patch** — hardcoded on, guarded only by `import.meta.env.MODE !== "test"`. No env-var indirection (the branch is public either way, and an env flag would have had to be wired into CI or releases would silently ship paywalled) |
| Default branch | **`fork` is the repo's default branch** — GitHub `schedule` triggers only fire from the default branch's workflow file, and `main` never receives commits. Force-pushing a default branch is allowed |
| CI runner | **`macos-26`** (arm64, free for public repos) — matches upstream's `depot-macos-26` SDK/Xcode generation |
| Keychain/TCC loss | **Accepted** — signing with a different Team ID re-prompts mic/system-audio TCC grants and orphans official-app Keychain items (see step 16) |


---

## 3. Current working tree (pre-Phase-1)

```
M apps/desktop/src/auth/billing.tsx      # +10 lines: spread override into BillingContext value
M apps/desktop/src/env.ts                # +1 line: VITE_LOCAL_UNLOCKED_PRO: z.stringbool().default(false)
M crates/api-client/openapi.gen.json     # +12 lines: UNRELATED build artifact, discard
?? LOCAL_FORK.md                          # notes from the exploratory session
```

The `billing.tsx` change appends to the `value = useMemo(...)` at roughly `billing.tsx:394`:

```tsx
...(env.VITE_LOCAL_UNLOCKED_PRO && {
  isPro: true, isPaid: true, isLite: true, isReady: true, plan: "pro" as const,
}),
```

`isReady` must be forced too: when fully unauthenticated the claims query is `enabled: false`,
so `isPending` never resolves and `isReady` would stay `false` forever, leaving Automations
stuck disabled.

The flag is currently set via **mode-scoped** gitignored env files
(`apps/desktop/.env.development.local` / `.env.production.local`, each containing
`VITE_LOCAL_UNLOCKED_PRO=true`). **This mechanism is dropped in Phase 1** — the reshaped patch
commits the unlock directly (step 2) and the env files are deleted (step 3). The history is
still instructive: a plain `.env.local` was tried and rejected because Vite loads it in *every*
mode including the implicit `test` mode vitest uses, which broke assertions in
`src/auth/billing.test.tsx`. The reshaped patch preserves that test-safety property with an
explicit `import.meta.env.MODE !== "test"` guard instead of relying on env-file loading rules.

`crates/api-client/openapi.gen.json` is regenerated by `crates/api-client/build.rs:39-55` on
any `cargo check`/`cargo build` that touches `api-client`. It derives from
`apps/api/openapi.gen.json` (itself written by `apps/api/src/main.rs:664`). Expect this file to
reappear as a spurious local diff after rebases that touch API routes — `git checkout` it.

---

## 4. Discovered context

### 4.1 The gating surface (why a one-file patch is sufficient)

`~48` files under `apps/desktop/src/` call `useBillingAccess()`. Every one of them reads
`isPro`/`isPaid`/`isLite`/`isReady`/`plan` through that hook — **there are no direct JWT or
entitlement-string checks anywhere else in the desktop frontend** (grepped for
`entitlements.includes`, `hyprnote_pro`, `hyprnote_lite`, `subscription_status ===`: zero hits
outside `billing.tsx` and `auth-analytics.ts`).

Local features gated purely for business reasons (these are what the fork unlocks):
- `settings/dictionary/index.tsx:23` — custom dictionary terms
- `settings/automations/index.tsx:310-592` — automation workflows
- `templates/auto-form.tsx:115-307` — custom summary-format templates
- `audio-player/provider.tsx:358-380`, `audio-player/timeline.tsx:19,127` — variable playback speed
- `settings/appearance/app-icon.tsx:92` — custom app icon
- `settings/general/account.tsx` — plan label (cosmetic)

Cloud-gated (override does not make these work — they still fail at the network call):
team/workspaces, CloudSync (`settings/sync`, `attachment-sync/lifecycle.tsx`), note sharing,
calendar + todo OAuth, `settings/developers/cloud-api.tsx`, and the `anarlog` cloud LLM/STT
provider entries.

Not gated at all: on-device STT (`soniqo`, `apple_speech`, `local_file`) and on-device LLM
(`apple_foundation`, `lmstudio`, `ollama`, `unsloth`) all declare `requirements: []`.

`apps/desktop/src/auth/auth-analytics.ts:24-45` calls `deriveBillingInfo` independently for
telemetry. It is **not** a gate, and the override deliberately does not affect it.

Rust: `crates/api-auth` (`MissingEntitlement("pro")`) and `crates/api-subscription` contain the
real server-side enforcement, but **neither is referenced by any `Cargo.toml` under
`apps/desktop`** — they belong to the hosted `api` binary. `plugins/` has zero entitlement hits.
Nothing in the shipped desktop binary enforces billing.

### 4.2 THE ONE THING THE OVERRIDE CANNOT FIX — `AM_API_KEY`

`plugins/local-stt/src/lib.rs:76` reads `option_env!("AM_API_KEY")`; `plugins/local-stt/src/ext.rs:843-852`
raises `Error::AmApiKeyNotSet`. The "Argmax"-engine on-device STT models — `ParakeetV2`,
`ParakeetV3`, `WhisperLargeV3` (tagged `SttModelType::Argmax` in `crates/local-stt-core/src/lib.rs`)
— require that key compiled into the binary. It is a third-party vendor key, unrelated to
`BillingContext`, and is **not** available to the fork.

Consequence: **those three models will not start in self-built binaries.** Soniqo and Apple
Speech are unaffected and cover on-device transcription. Do not attempt to extract the key from
official builds — that is misappropriating a third-party credential and is out of scope for
this fork. If the owner wants those models, they need their own Argmax key.

### 4.3 Why `billing-context.ts` is the chosen seam

Churn over the repo's history:

| File | Commits | Last touched |
|---|---|---|
| `apps/desktop/src/auth/billing.tsx` | 21 | 2026-08-07 |
| `apps/desktop/src/env.ts` | 11 | 2026-07-29 |
| `packages/supabase/src/billing.ts` | 10 | 2026-08-25 |
| **`apps/desktop/src/auth/billing-context.ts`** | **3** | ~PR #6351 era |

`billing-context.ts` is pure plumbing — a type, `createContext`, and the hook — and is
essentially frozen. `billing.tsx` is where all new trial/payment-reminder UX ships. Same blast
radius either way (the internal effects in `billing.tsx` read the local `billing` variable, not
the hook), so moving the override to the hook costs nothing and minimizes rebase conflicts.

Rejected: patching `deriveBillingInfo` in `packages/supabase/src/billing.ts` — it is shared with
`apps/web` (real hosted account/checkout UI), corrupts analytics, breaks 7 unit tests in
`packages/supabase/src/billing.test.ts`, and is the most actively-edited candidate.
Also rejected: a runtime/DB setting (needless indirection for a patch that is public anyway),
and the original `VITE_LOCAL_UNLOCKED_PRO` env-var indirection via gitignored `.env.*.local`
files — that variable existed only on the owner's machine, so CI-built releases would have
silently shipped **with the paywall intact** unless the workflow also set it. Committing the
unlock directly removes that failure mode; it survives rebases as an ordinary commit on `fork`.

### 4.4 Release and update pipeline (upstream)

**There is no Sparkle.** Every `sparkle` hit in the repo is a Lucide icon import. There is no
appcast and no `latest.json` upstream. It is the **Tauri v2 updater plugin**, wrapped by a
custom `plugins/updater2`:
- `plugins/updater2/src/lib.rs:52-59` — 30-minute check loop, skipped under `cfg!(debug_assertions)` (`:74-76`)
- `plugins/updater2/src/ext.rs:126` — `check()` → real Tauri updater API; caches to `<app_cache_dir>/updates/<version>.bin`; emits Specta events
- `apps/desktop/src/main/update-banner.tsx` — the frontend toast state machine

Config, all **compile-time** (merged into the binary by `tauri build --config <file>`; there is
no runtime override path):
- `apps/desktop/src-tauri/tauri.conf.json:97-101` — base: `updater.active: false`, `dialog: true`,
  upstream's minisign `pubkey`; `createUpdaterArtifacts: true`
- `tauri.conf.stable.json` — `identifier: com.hyprnote.stable`, `productName: Anarlog`,
  `updater.active: true`, endpoint
  `https://desktop.anarlog.so/update/{{target}}-{{arch}}-{{bundle_type}}/{{current_version}}?channel=stable`
- `tauri.conf.stable-macos.json` — a same-shaped endpoint without `{{bundle_type}}`, but
  **currently unreferenced by any workflow or script** (grepped; only `tauri.conf.macos-intel.json`
  is conditionally added, at `desktop_cd.yaml:185`). Treat it as dead config.
- `tauri.conf.staging.json`, `tauri.conf.flatpak.json`, `tauri.conf.app-store.json` — `active: false`

`desktop.anarlog.so` is **not a server** — `apps/web/netlify.toml:56-79` 302-redirects
`/update/*` and `/download/*` to `https://cdn.crabnebula.app/{update,download}/fastrepl/hyprnote2/:splat`.
Artifacts live on CrabNebula Cloud, mirrored to GitHub Releases at tag `desktop_v$VERSION`.

Workflows (all `workflow_dispatch`, nothing fires on tag push):
- `.github/workflows/desktop_cd.yaml` (951 lines) — builds candidates. macOS job at `:136`
  runs on **`depot-macos-26`** (a Depot runner the fork does not have). Matrix
  aarch64 + x86_64. Uses composite actions `./.github/actions/{macos_tcc,install_desktop_deps,rust_install,apple_cert,macos_notarize_dmg}`
  — these are generic and reusable. Also runs `cargo xtask prepare-binaries` and three
  `./scripts/sidecar.sh` calls for `char-chrome-native-host`, `check-permissions`, and
  `resources/cli/anarlog-cli`, plus codesigns `crates/cloudsync/vendor/cloudsync/macos/<arch>/cloudsync.dylib`
  before the Tauri build.
- `.github/workflows/desktop_publish.yaml` (695 lines) — promotes a candidate: tags
  `desktop_v$VERSION`, publishes on CrabNebula, mirrors to GitHub Releases via
  `ncipollo/release-action@v1`, submits to Microsoft Store, bumps AUR + APT.
- `handle_release.yaml` / `handle_staging.yaml` / `command_dispatcher.yaml` — chat-ops wrappers
  driven by PR comments.

Version computation: git tags matching `desktop_v*` via the external `doxxer` CLI
(`doxxer.desktop.toml`: `filter.tag = "^desktop_v"`). Stable requires an **explicit** semver
input that has a matching `packages/changelog/content/$VERSION.md`. The version is written into
`tauri.conf.json` by `scripts/version.sh` (a `jq '.version = $ver'`) before every build.
`apps/desktop/package.json` version is a static `0.1.0` placeholder — ignore it.

Cadence: `desktop_v1.4.0` (2026-08-01) through `desktop_v1.4.15` (2026-08-29) — roughly every
1–5 days.

Repo mechanics: **no git submodules**, and `.gitattributes` declares only
`apps/desktop/src-tauri/resources/llm.gguf` as LFS, which is **not currently tracked**
(`git lfs ls-files` → 0). A fork clone is fully self-contained.

### 4.5 Required compile-time env vars

Release (`tauri build`, non-debug) will not compile / will panic without these:

| Var | Location | Notes |
|---|---|---|
| `POSTHOG_API_KEY` | `plugins/analytics/src/lib.rs:62-72` | `env!()` under `cfg(not(debug_assertions))`, plus `assert!(v.starts_with("phc_"))`. Debug uses `option_env!`. |
| `APP_VERSION` | `plugins/analytics/src/ext.rs:83` | `env!()`, **unconditional** — needed for debug builds too |
| `VITE_API_URL` | `plugins/calendar/src/lib.rs:50-61`, `plugins/todo/src/lib.rs:64-73` | `env!()` under `cfg(not(debug_assertions))`; debug falls back to `http://localhost:3001` |

Everything in `apps/desktop/src/env.ts:5-18` is optional or defaulted; `emptyStringAsUndefined: true`
means an unset CI secret resolves to undefined rather than `""`.
`VERGEN_GIT_SHA` (`plugins/misc/src/ext.rs:23`) is generated by that plugin's own `build.rs` — nothing to supply.

### 4.6 Telemetry and upstream hosts baked into the app

- Sentry: `apps/desktop/src/error-reporting.ts:187-188` skips init entirely if `VITE_SENTRY_DSN`
  is unset; Rust side uses `option_env!("SENTRY_DSN")` (`apps/desktop/src-tauri/src/lib.rs:80,217`),
  runtime-disablable via `ANARLOG_DISABLE_SENTRY`.
- PostHog: see the `phc_` assert above. Upstream's own CI (`desktop_ci.yaml:241-243,452-454`)
  uses literal placeholders `phc_windows_ci` / `phc_linux_ci` — precedent for the fork using a
  placeholder rather than a real key.
- Model downloads all come from **upstream's S3 bucket**, unauthenticated, no billing token:
  `crates/whisper-local-model/src/lib.rs:59-77`, `crates/local-model/src/lib.rs:31-39`,
  `crates/am/src/model.rs:100-106` → `https://hyprnote.s3.us-east-1.amazonaws.com/v0/...`.
  Not env-configurable. A soft external dependency: if fastrepl ever pulls that bucket, local
  model downloads break for the fork too.
- Hardcoded, not env-configurable: changelog fetch
  `https://raw.githubusercontent.com/fastrepl/anarlog/main/packages/changelog/content/${version}.md`
  (`apps/desktop/src/changelog/data.ts:14`) — points at upstream even in a fork, which is
  actually correct since the fork ships upstream's code; template/resource suggestions
  `https://anarlog.so/api/${endpoint}` (`apps/desktop/src/shared/ui/resource-list/hooks.ts:7`);
  docs links to `docs.anarlog.so`; `https://anarlog.so/discord`; the `.anarlog.so` host check in
  `apps/desktop/src/session-sharing/urls.ts:160-162`.
- Nango (`crates/nango/`) is backend-only; the desktop app reaches it through `VITE_API_URL`.

Recommendation carried into the plan: set `VITE_API_URL=https://api.anarlog.so` so cloud
features fail with a clean 401 instead of hammering `localhost:3001`, and leave
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` **unset** so cloud auth is cleanly absent rather
than half-working.

### 4.7 Bundle identity and app-data

No app-data-dir override exists in `apps/desktop/src-tauri/src` or `plugins/db`; Tauri's default
`app_data_dir()` is keyed by `identifier`.

| Config | identifier | productName | macOS data dir |
|---|---|---|---|
| `tauri.conf.json` (dev) | `com.hyprnote.dev` | `Anarlog Dev` | `~/Library/Application Support/com.hyprnote.dev/` |
| `tauri.conf.stable.json` | `com.hyprnote.stable` | `Anarlog` | `~/Library/Application Support/com.hyprnote.stable/` |
| `tauri.conf.staging.json` | `com.hyprnote.staging` | `Anarlog Staging` | — |
| `tauri.conf.app-store.json` | `com.hyprnote.desktop` | — | — |
| `tauri.conf.flatpak.json` | `so.anarlog.Anarlog` | `Anarlog` | — |

Decision: keep `com.hyprnote.stable`. The fork build inherits the owner's existing database.
The official Anarlog.app must be deleted so the two do not fight over `/Applications/Anarlog.app`.
Signing someone else's bundle identifier with your own Developer ID Team is fine for a personal
build (upstream's team is `6SLY7V277V`, per `sign_passthrough.yaml:29`; the fork will use its own).

### 4.8 Inherited workflows

Every upstream workflow lands in the fork. Notable triggers:
- `workflow_dispatch`-only (harmless): `desktop_cd`, `desktop_publish`, `api_cd`, `chrome_cd`,
  `db_cd`, `web_cd`, `stripe_cd`, `extensions_cd`, `eval_run`, `submit_flathub`,
  `download_staging`, `sign_passthrough`, `desktop_e2e`, `desktop_linux_audio_qa`
- `push`/`pull_request` (will fire on fork activity): `desktop_ci`, `api_ci`, `chrome_ci`,
  `cli_ci`, `db_ci`, `enterprise_ci`, `mobile_ci`, `web_ci`, `pro_api_e2e`, `fmt`, `lint`,
  `zizmor`, `ci.yaml`
- `schedule` daily `0 9 * * *`: `desktop_ci.yaml:260-261`, `mobile_ci.yaml:505-506`,
  `pro_api_e2e.yaml:572-573` — the last needs `INFISICAL_STT_TOKEN`/`INFISICAL_LLM_TOKEN` and
  would fail daily
- `issue_comment` / `pull_request_review_comment`: `command_dispatcher.yaml`, `opencode.yml`
- Deploy workflows needing org-only tokens: `bot_cd.yaml`, `slack_internal_cd.yaml`
  (`FLY_API_TOKEN`), `openstatus.yaml` (`OPENSTATUS_API_KEY`)

**Do not delete these files.** Deleting paths upstream keeps editing produces a conflict on
every single rebase. Disable them server-side instead (Section 6, step 13) — that is pure
GitHub state and touches no git history.

### 4.9 Generated files that churn

Tracked-but-generated, all normal to see move after a rebase: `crates/api-client/openapi.gen.json`,
`apps/api/openapi.gen.json`, `apps/desktop/src/routeTree.gen.ts`, `apps/web/src/routeTree.gen.ts`,
`apps/desktop/src/types/tauri.gen.ts`, ~50 `plugins/*/js/bindings.gen.ts` (tauri-specta),
`packages/api-client/src/generated/**`, `crates/pyannote-cloud/openapi*.gen.json`,
`plugins/webhook/openapi.gen.json`, 110 files under `apps/desktop/src/i18n/locales/**` (55
locales, lingui), plus `Cargo.lock` and `pnpm-lock.yaml`.

Because the fork adds **no dependencies and no translated UI strings**, none of these should
conflict. If you ever add a user-visible string you must run the lingui extract/compile cycle
from `AGENTS.md` and you will inherit catalog churn on every rebase — avoid it.

---

## 5. Remote/branch state

```
origin    https://github.com/dave-atx/anarlog.git      (fork, nothing pushed yet as of 2026-08-29)
upstream  https://github.com/fastrepl/anarlog.git
```

Current local branch `main` sits at `b5da54967` (upstream `main`), tag `desktop_v1.4.15`.

Target model:

```
fork   = the long-lived patch stack, rebased onto each desktop_v* tag, force-pushed.
         THE REPO'S DEFAULT BRANCH — schedule triggers only fire from the default
         branch's workflow file, and main never receives commits, so fork must be it.
         (Force-pushing a default branch is allowed; GitHub only blocks deletion.)
main   = fast-forward-only mirror of upstream/main. Never commit here.
```

`fork` is based on a **release tag**, not on `main` HEAD, so builds come from the exact commit
upstream released. Because every `desktop_v*` tag is an ancestor of `upstream/main`, the current
base is recoverable without storing state anywhere:

```sh
git rebase --onto "$NEW_TAG" "$(git merge-base fork upstream/main)" fork
```

Enable `git config rerere.enabled true` so a conflict resolved once is replayed automatically.

Note `rerere`'s cache is **local-only** — it does not help the CI rebase job. CI aborts on any
conflict and opens an issue; conflicts are always resolved locally.

**Single-writer rule for `fork`**: CI is the authoritative rebaser and force-pusher. Both
`fork/update.sh` (local) and the CI job rewrite the same branch, so they will clobber each other
unless local work always starts from CI's state — run
`git fetch origin && git reset --hard origin/fork` before touching `fork` locally, and only
force-push manually when resolving a conflict CI reported (the workflow's `concurrency` group
guards the reverse race; see step 11).

Alternative considered and not chosen: a quilt-style `fork/patches/*.patch` series applied to a
detached checkout in CI. More robust for CI (stateless, no force-push) but worse for local
iteration. If rebase conflicts ever become chronic, revisit this.

---

## 6. Implementation plan

### Phase 1 — reshape the patch (local only, no push)

1. `git checkout -- apps/desktop/src/auth/billing.tsx apps/desktop/src/env.ts crates/api-client/openapi.gen.json`
2. Edit **`apps/desktop/src/auth/billing-context.ts`** only. In `useBillingAccess()`, after the
   existing null-context guard, return the override **unconditionally in non-test modes** — the
   unlock is committed as the default with no env-var indirection. Do not touch `env.ts` (a
   second file to conflict on; t3-env validation buys nothing here). The explicit `MODE` guard
   preserves the property that `billing.test.tsx` sees unmodified context values:

   ```ts
   return import.meta.env.MODE !== &quot;test&quot;
     ? { ...context, isPro: true, isPaid: true, isLite: true, isReady: true, plan: &quot;pro&quot; as const }
     : context;
```

   Keep a short `// Local fork:` comment explaining *why* `isReady` is forced (the
   `enabled: false` claims query never resolves when unauthenticated) and why the `test`-mode
   guard exists.


   Keep a short `// Local fork:` comment explaining *why* `isReady` is forced (the
   `enabled: false` claims query never resolves when unauthenticated).

   For reference, the **verified pre-patch contents** of `billing-context.ts` (22 lines, as of
   `desktop_v1.4.15`) are:

   ```ts
   import { createContext, useContext } from "react";

   import type { BillingInfo } from "@anlg/supabase";

   export type BillingAccess = BillingInfo & {
     isReady: boolean;
     canStartTrial: { data: boolean; isPending: boolean };
     upgradeToPro: () => void;
     isUpgradingToPro: boolean;
   };

   export const BillingContext = createContext<BillingAccess | null>(null);

   export function useBillingAccess() {
     const context = useContext(BillingContext);

     if (!context) {
       throw new Error("useBillingAccess must be used within BillingProvider");
     }

     return context;
   }
   ```

   `isPro`/`isPaid`/`isLite`/`plan` come from `BillingInfo` in `packages/supabase/src/billing.ts`;
   `isReady` is added by `BillingAccess`. The override object is therefore type-compatible as a
   plain spread with no cast beyond `plan: "pro" as const`.
3. Delete `apps/desktop/.env.development.local` and `.env.production.local` (both present, 29
      bytes each, as of 2026-08-29 — each only sets `VITE_LOCAL_UNLOCKED_PRO=true`, which no longer
      does anything). Both are gitignored via `apps/desktop/.gitignore`'s `*.local`, so this is
      local-only cleanup; leaving them behind is harmless but misleading.
4. `git mv`/move `LOCAL_FORK.md` → `fork/README.md`, rewritten around the new layout. Keep its
   build-environment findings (they are still true and non-obvious): `cargo` needs
   `export PATH="$HOME/.cargo/bin:$PATH"` in non-interactive shells; `SDKROOT` from
   `xcrun --sdk macosx --show-sdk-path`; DMG bundling via Finder AppleScript needs Automation
   permission (use `--bundles app` locally to skip it); ad-hoc builds may need a final
   `codesign --force --deep --sign - "Anarlog.app"` pass.
5. Run the full `AGENTS.md` gate:
   ```sh
   pnpm exec dprint fmt && pnpm fmt:check
   pnpm -F desktop typecheck
   pnpm -F desktop test
   pnpm exec oxlint --quiet --format=github apps/desktop/src/
   ```
   `billing.test.tsx` must still pass 19/19 — it does because vitest runs in `test` mode and the
   override sits behind an explicit `import.meta.env.MODE !== "test"` guard. This no longer
   depends on Vite env-file loading rules; it only breaks if vitest stops reporting
   `MODE === "test"`, which would be loud and obvious.
6. `git branch fork desktop_v1.4.15 && git switch fork`, commit. Leave `main` untouched as the
   mirror.

### Phase 2 — fork build configuration (all new files, zero conflict surface)

7. Generate the fork's own updater keypair **with a real, non-empty password** — GitHub rejects
   empty-valued secrets, so an empty key password could not be stored as
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`:
   ```sh
   pnpm exec tauri signer generate -w fork/updater.key
```
   Store the **private key file contents** as the `TAURI_SIGNING_PRIVATE_KEY` secret and the
   password as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Note from

   the prior session: the `TAURI_SIGNING_PRIVATE_KEY_PATH` variant silently did not work in this
   Tauri CLI version — use the contents form. Never commit `fork/updater.key`; add it to
   `fork/.gitignore`.
8. New `apps/desktop/src-tauri/tauri.conf.fork.json`, applied as an extra `--config` after
   `tauri.conf.stable.json`:
   ```json
   {
     "plugins": {
       "updater": {
         "active": true,
         "pubkey": "<fork pubkey>",
         "endpoints": ["https://github.com/dave-atx/anarlog/releases/latest/download/latest.json"]
       }
     }
   }
   ```
   Keeps `identifier: com.hyprnote.stable` and `productName: Anarlog` inherited from
   `tauri.conf.stable.json`. The base `tauri.conf.json` pubkey is overridden by this merge —
   verify the merged config actually carries the fork pubkey before shipping, or the updater
   will reject the fork's own signatures.
9. `fork/update.sh` — the rebase helper:
   ```sh
   git fetch upstream --tags --force
   NEW_TAG=$(git tag --list 'desktop_v*' --sort=-v:refname | head -1)
   OLD_BASE=$(git merge-base fork upstream/main)
   git rebase --onto "$NEW_TAG" "$OLD_BASE" fork
   ```
   with `--abort` + a clear failure message on conflict.
10. `fork/latest-json.mjs` — emits the Tauri updater manifest from the build output:
       ```json
       { &quot;version&quot;: &quot;1.4.16&quot;, &quot;pub_date&quot;: &quot;&lt;ISO8601&gt;&quot;, &quot;platforms&quot;: {
           &quot;darwin-aarch64&quot;: { &quot;signature&quot;: &quot;&lt;contents of the .app.tar.gz.sig&gt;&quot;, &quot;url&quot;: &quot;&lt;release asset URL of the .app.tar.gz&gt;&quot; } } }
   ```
       **The `url` must point at the `.app.tar.gz` updater artifact, NOT the DMG.** On macOS,
       `createUpdaterArtifacts: true` emits `Anarlog.app.tar.gz` + `Anarlog.app.tar.gz.sig`
       alongside the DMG; the tarball is what the Tauri updater downloads and signature-verifies —
       pointing at the DMG makes every in-app update fail. The DMG exists only for manual installs.
       Tauri accepts a plain static JSON endpoint; no server or CrabNebula equivalent is needed.


### Phase 3 — CI and GitHub setup

11. New `.github/workflows/fork-release.yml` — lives on `fork`, which is the **default branch**
    (`schedule` triggers only fire from the default branch's workflow file). Shape:
    - triggers: `schedule: "0 9 * * *"` + `workflow_dispatch`
    - `permissions: contents: write` (force-push + release creation; add `issues: write` for the
      conflict-report issue) and a `concurrency` group (`fork-release`,
      `cancel-in-progress: false`) so a slow build and the next cron tick cannot race the
      force-push
    - checkout with `fetch-depth: 0`; add the `upstream` remote; `git fetch upstream --tags`;
      set a git identity (`git config user.name` / `user.email`) before rebasing
    - resolve the newest upstream `desktop_v*` tag; exit early if a release already exists for it
    - run the rebase; on conflict `git rebase --abort` and open an issue, then stop. `rerere`
      does not help here — its cache is local-only; conflicts get resolved locally (Section 5)
    - force-push `fork` (CI is the authoritative writer of this branch — Section 5)
    - build on **`macos-26`** (arm64, free for public repos — replaces `depot-macos-26` and
      matches upstream's macOS 26 SDK/Xcode generation, which `apple_speech` plausibly requires)
    - reuse upstream's composite actions: `./.github/actions/install_desktop_deps` (target macos),
      `./.github/actions/rust_install`, `./.github/actions/apple_cert`,
      `./.github/actions/macos_notarize_dmg`, and `./.github/actions/macos_tcc`
    - replicate the pre-build steps from `desktop_cd.yaml:151-181`: `scripts/version.sh`,
      `pnpm -F ui build`, `cargo xtask prepare-binaries`, the three `scripts/sidecar.sh` calls,
      the `cloudsync.dylib` codesign, and `SDKROOT`
    - **version wiring must be explicit**: `fork` HEAD sits 1–2 patch commits *past* the
      `desktop_v*` tag, so doxxer/tag-describe derivation will not yield `1.4.16` verbatim.
      Strip the version from the resolved tag (`${TAG#desktop_v}`) and pass it explicitly to
      `scripts/version.sh`
    - env on the build step: `APP_VERSION=<version>` (required unconditionally — Section 4.5),
      `POSTHOG_API_KEY` (placeholder secret), `VITE_API_URL` (repo variable),
      `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
    - `pnpm -F desktop tauri build --target aarch64-apple-darwin --config ./src-tauri/tauri.conf.stable.json --config ./src-tauri/tauri.conf.fork.json`
    - notarize + staple the DMG, generate `latest.json`, publish a GitHub Release tagged
      `fork_v<upstream version>` with **four assets**: the DMG (manual installs), the
      `.app.tar.gz` updater artifact, its `.app.tar.gz.sig`, and `latest.json`
    - version = the upstream version verbatim (e.g. `1.4.16`). See the caveat in Section 7.
12. Push `main` and `fork` to `origin`; set **`fork` as the default branch**
        (`gh repo edit dave-atx/anarlog --default-branch fork`); enable Actions on the fork. Two
        fork-specific gotchas: scheduled workflows are **disabled by default in forks of public
        repos** — enable `fork-release.yml` once via the Actions UI or
        `gh workflow enable fork-release.yml` — and public-repo crons are auto-disabled after 60
        days without repo activity (the daily force-push should keep it alive; investigate if
        releases ever stop appearing).
13. Disable every inherited workflow (no git changes):
    ```sh
    gh api /repos/dave-atx/anarlog/actions/workflows --paginate \
      --jq '.workflows[] | select(.path != ".github/workflows/fork-release.yml") | .id' \
      | xargs -I{} gh api -X PUT /repos/dave-atx/anarlog/actions/workflows/{}/disable
    ```
    Re-run this after any rebase that adds new upstream workflow files.
14. Owner adds repository secrets: `APPLE_CERTIFICATE` (base64 .p12), `APPLE_CERTIFICATE_PASSWORD`,
    `KEYCHAIN_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD` (app-specific password), `APPLE_TEAM_ID`,
    `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Plus a placeholder
    `POSTHOG_API_KEY` such as `phc_local_fork_no_telemetry_0000000000` — it must start with
    `phc_` or the app panics at startup, and it must **not** be upstream's real key or fork usage
    lands in their PostHog project. `VITE_API_URL=https://api.anarlog.so` as a repo *variable*.
    Leave `SENTRY_DSN`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` unset.
15. First run via `workflow_dispatch` before trusting the cron.
16. Owner deletes `/Applications/Anarlog.app` (the official build) and installs the fork DMG.
    Same identifier ⇒ the existing database at `~/Library/Application Support/com.hyprnote.stable/`
    carries over untouched.
    **What does not carry over** (accepted tradeoff): macOS keys Keychain access and (partially)
    TCC grants to the signing **Team ID**, not the bundle ID — expect microphone / system-audio
    permission re-prompts on first launch, and any Keychain items the official app created (auth
    sessions, tokens) become permanently unreadable. Irrelevant given cloud auth is abandoned,
    but do not be surprised by first-launch prompts.


---

## 7. Known risks and open questions

- **Cron prerequisites**: `schedule` only fires from the default branch — addressed by making
  `fork` the default branch (step 12). Scheduled workflows are additionally **disabled by
  default in forks of public repos** (enable once, step 12), and public-repo crons auto-disable
  after 60 days of repo inactivity (daily force-pushes should prevent this). Verify the cron
  actually fires after step 12. If it does not, the fallback is a `repository_dispatch` from a
  small non-fork repo owned by the same account, or a local launchd timer calling
  `gh workflow run`.
- **Fork-only rebuilds of the same upstream version cannot ship through the updater.** The app
  version is upstream's verbatim, and semver build metadata (`1.4.16+fork.2`) is ignored in
  precedence comparisons, so the updater will not offer it. Install those by hand. Accepted
  tradeoff; the alternative schemes all distort ordering.
- **`billing-context.ts` conflicts** are the main recurring maintenance cost. `rerere` should
  absorb most of them. If upstream restructures the hook, re-derive the seam from Section 4.1
  rather than force-fitting the old diff.
- **The ungating patch will be publicly readable** on the fork. MIT permits this outright; it is
  the owner's accepted choice in exchange for free macOS runners and auth-free release assets.
- **Upstream's S3 bucket** (Section 4.6) is a soft dependency for all local model downloads. No
  mitigation planned; note it if downloads ever start failing.
- **Notarization on a shared identifier**: signing `com.hyprnote.stable` with a different Team ID
  is technically fine for Developer ID distribution, but if Apple ever objects the fix is to move
  to an own identifier plus a one-time copy of the Application Support directory.
- Upstream ships near-daily, so expect a build (and an update toast) most days. If that becomes
  noisy, switch the cron to weekly — the workflow is unchanged, only the schedule.
- **Keychain/TCC do not follow the bundle ID** — both are keyed (fully or partly) to the signing
  Team ID. First fork launch re-prompts mic/system-audio permissions, and official-app Keychain
  items are unreadable (permanently, once the official app is deleted). Accepted — cloud auth is
  abandoned anyway. See step 16.


## 8. Verification checklist for the first fork build

- [ ] `pnpm -F desktop test` passes 19/19 in `billing.test.tsx` with the patch applied
- [ ] Merged tauri config carries the **fork** updater pubkey, not upstream's
- [ ] DMG is notarized and stapled (`xcrun stapler validate`), `spctl -a -t open --context context:primary-signature` accepts it
- [ ] `latest.json` asset resolves at the `releases/latest/download/` URL without auth
- [ ] Release carries all **four** assets (DMG, `.app.tar.gz`, `.app.tar.gz.sig`, `latest.json`)
      and `latest.json`'s `url` points at the `.app.tar.gz`, not the DMG
- [ ] The **CI-built DMG** (not just a local build) shows Dictionary, Automations, Templates,
      custom app icon, and variable playback speed with no paywall while signed out
- [ ] First launch: mic/system-audio permission prompts reappear (expected — Team ID changed)
      and the existing notes database loads intact
- [ ] Sync still shows "Sign in to use cloud sync" (inert, not crashed)
- [ ] On-device STT works via Soniqo or Apple Speech (Argmax models are expected to fail — see 4.2)
- [ ] A second run of the workflow against a newer upstream tag delivers an in-app update
