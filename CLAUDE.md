# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Mega App** (`mega-tools`) is a Windows-first Tauri 2 desktop app for Mega Research's internal tools. It bundles two tools today (Brand Audit YPF, Limpiador de Encuestas) plus a Settings view, and ships with a signed auto-updater that pulls from GitHub Releases.

User-facing strings and docs are in **Spanish** (rioplatense). Comments and identifiers in code are also Spanish-leaning. Match that style when editing.

## Common commands

```powershell
npm install
npm run bundle:python      # one-time: download python-build-standalone + install requirements
npm run bundle:python:force # nuke and re-bundle the Python sidecar from scratch
npm run tauri dev          # dev with hot reload (Vite on :1420 + Rust)
npm run tauri build        # production MSI/NSIS (requires TAURI_SIGNING_PRIVATE_KEY)
npm run build              # tsc + vite build only (no Tauri shell)
```

There is no test runner, no linter, and no formatter wired up — don't invent commands for them.

## High-level architecture

### Shell (no router)

`src/App.tsx` is the root: title bar + sidebar (`Toolbar`) + a `<main>` that renders one view at a time based on a `ViewId` state. Adding a new tool means: add an entry to `TOOLS` in `src/components/Toolbar.tsx`, extend the `ToolId`/`ViewId` union, and render the tool component in `App.tsx`.

The Limpiador's internal multi-screen flow (`list → new → project → upload/rules/review/export`) is also a state machine inside `LimpiadorView.tsx` — not React Router. Preserve `selectedProjectId` across navigations even when the next screen only needs `versionId`, so back-navigation works without an extra fetch.

### Two backend modes for tools

Each tool picks one of these patterns:

1. **TS-only (Limpiador)** — runs entirely in the renderer. Reads/writes to a remote Supabase project via `@supabase/supabase-js`, and calls OpenAI via native `fetch` (no SDK). All keys live in `tauri-plugin-store` (`src/lib/settings.ts`); the user enters them in the Settings view. The Limpiador refuses to render if Supabase URL/anon key are missing.

2. **Python sidecar (Brand Audit)** — Rust spawns a bundled `python.exe` (python-build-standalone) running scripts under `python-scripts/<tool>/`. The Tauri command lives in `src-tauri/src/commands/<tool>.rs`; the generic spawner is `src-tauri/src/python_bridge.rs`.

   Sidecar contract:
   - **stdout:** any number of lines, each parseable as JSON. The **last non-empty line is the final result**; intermediate lines may carry `{"type":"progress",...}` and are forwarded to the renderer as Tauri events when `stream_event` is set.
   - **stderr:** free-form logs.
   - **exit code:** 0 = ok.
   - Secrets (e.g. `GEMINI_API_KEY`) are passed as **env vars**, never argv.
   - The bridge force-sets `PYTHONIOENCODING=utf-8` and `PYTHONUTF8=1` because Windows console cp1252 will crash on emoji prints.

### Limpiador domain (`src/lib/cleaning/`)

- `supabase-client.ts` — cached Supabase client built from settings; throws `MissingSupabaseSettingsError` when keys are absent. Reset cache after the user changes keys.
- `cleaning-service.ts` — OpenAI QC engine (port of the original Lightsail `cleaning-service.js`). Pure function over a batch.
- `cleaning-job.ts` — orchestrator. Returns a controller `{ promise, cancel(), isCancelled }`. **Cancellation is checked between batches**, not mid-batch (matches Lightsail behavior — preserves the in-flight OpenAI call and its persistence).
- `*-repository.ts` files own all reads/writes against Supabase tables.
- The full DB contract for a QC job (which tables/columns get written and when) is documented in `docs/LIMPIADOR_QC_CONTRACT.md`. Update that file when you change writes.
- The end-to-end roadmap (5 steps, multi-origin Qualtrics + QuestionPro) is in `docs/limpiador-plan.md`.
- SQL migrations live in `docs/migrations/`; the Limpiador requires the corporate Supabase project to have these applied — RLS is permissive (`USING (true)`), which is why the anon key suffices.

### Settings store

`src/lib/settings.ts` wraps `tauri-plugin-store` with one helper per key (`getGeminiApiKey`, `getSupabaseUrl`, `getOpenaiApiKey`, …). Empty/whitespace strings are treated as "delete the key". The store file lives in the OS app-data dir (Windows: `%APPDATA%\ar.megaresearch.tools\settings.json`) — it is local to the user, never synced, never committed.

### Tauri permissions

When a new Tauri plugin or command needs a non-default capability, add it to `src-tauri/capabilities/default.json`. The app silently fails the call otherwise.

## Auto-updater

The updater is the whole reason this repo exists; treat it carefully.

- `tauri.conf.json` → `plugins.updater.endpoints` points to the GitHub Releases `latest.json`. The matching Ed25519 `pubkey` is embedded in the same file.
- `src-tauri/src/lib.rs` reads `option_env!("UPDATER_GITHUB_TOKEN")` at compile time and, if present, attaches `Authorization: Bearer …` headers so the binary can pull assets from the **private** repo. In dev this is empty and the check just fails silently — that's expected.
- Update policy is **mandatory**: when a newer version is found, `UpdateDialog.tsx` blocks the UI until the user accepts. Install mode is `quiet` (no Windows installer UI; app relaunches after install).
- See `docs/DEV_GUIDE.md` for key rotation, secret setup (`TAURI_SIGNING_PRIVATE_KEY`, `UPDATER_GITHUB_TOKEN`), and the release-cut procedure.

## Versioning

The version number lives in **four files** that must stay in sync. When bumping:

1. `src-tauri/tauri.conf.json` → `version`
2. `src-tauri/Cargo.toml` → `version`
3. `package.json` → `version`
4. `src/App.tsx` → `APP_VERSION` constant

A release is cut by tagging `vX.Y.Z` and pushing the tag — `release.yml` (tauri-action) builds, signs, and publishes a GitHub Release with the MSI/NSIS installer plus `latest.json`. PRs to `main` run `ci.yml`, which builds an unpublished installer artifact for QA. Pushes to feature branches do **not** trigger CI by design.

## Path alias

Imports use `@/` → `src/` (`vite.config.ts` + `tsconfig.json`). Keep using it; don't write deep relative paths.

## shadcn / UI

Components are shadcn-style under `src/components/ui/`. Style is `radix-nova`, base color `neutral`, icon library `lucide`. The shadcn config is in `components.json`. When adding a new shadcn primitive, install via `shadcn` CLI to keep the convention.
