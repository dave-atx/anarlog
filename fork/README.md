# Fork notes

This is `dave-atx/anarlog`, a personal long-lived fork of `fastrepl/anarlog`.

## What this fork does

Only deviation from upstream: ungate **local, on-device** Pro features so they work
without a subscription. Cloud features (CloudSync, sharing, hosted LLM/STT, Nango OAuth,
Stripe checkout) remain inert-but-not-crashing.

## Patch

Single-file override in `apps/desktop/src/auth/billing-context.ts`:

```ts
if (import.meta.env.MODE !== "test") {
  return { ...context, isPro: true, isPaid: true, isLite: true, isReady: true, plan: "pro" as const };
}
```

Guarded by `MODE !== "test"` so `billing.test.tsx` still sees real values. `isReady`
is forced because the claims query is `enabled: false` when unauthenticated.

No `env.ts` change; `VITE_API_URL` etc. are injected only by the fork CI workflow.

## Build

`apps/desktop/src-tauri/tauri.conf.fork.json` overlays the stable config to point the
Tauri updater at this fork's GitHub Releases (`releases/latest/download/latest.json`)
and to carry the fork's updater pubkey. Bundle ID stays `com.hyprnote.stable` so the
database at `~/Library/Application Support/com.hyprnote.stable/` carries over.

Updater asset is `.app.tar.gz` (+ `.app.tar.gz.sig`); DMG is for manual installs.
`latest.json`'s `url` must point at the tarball, not the DMG.

## Release CI

Workflow: `.github/workflows/fork-release.yml` on default branch `fork`.

- Daily cron + `workflow_dispatch`
- Rebases `fork` onto latest `desktop_v*` tag, force-pushes, builds `aarch64` on `macos-26`,
  notarizes DMG, publishes `fork_v<version>` with DMG + tarball + sig + `latest.json`.

If rebase conflicts: `fork/update.sh` locally; `git rerere` helps after first resolution.

## Local gotchas (from exploratory session)

- `cargo` needs `export PATH="$HOME/.cargo/bin:$PATH"` in non-interactive shells
- `SDKROOT` from `xcrun --sdk macosx --show-sdk-path` for Tauri builds
- DMG bundling needs Finder Automation permission; use `--bundles app` to skip locally
- Ad-hoc local builds may need `codesign --force --deep --sign - "Anarlog.app"`
- Generated churn after rebases: `crates/api-client/openapi.gen.json`, `routeTree.gen.ts`,
  `tauri.gen.ts`, `plugins/*/js/bindings.gen.ts`, lingui locales, `Cargo.lock` — usually `git checkout` it
- Argmax STT models (`ParakeetV2/V3`, `WhisperLargeV3`) require `AM_API_KEY` at compile time; not
  available to the fork — use Soniqo/Apple Speech instead
- First launch after switching Team ID re-prompts mic/system-audio TCC and orphans prior Keychain items

## Updater keypair

Generate once:

```
pnpm exec tauri signer generate -w fork/updater.key
```

Put private key contents into `TAURI_SIGNING_PRIVATE_KEY` secret and password into
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Update `tauri.conf.fork.json` pubkey. Never commit
`fork/updater.key`.
