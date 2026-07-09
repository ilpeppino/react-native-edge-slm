# Integrating a proprietary app

This package is generic and public. A closed-source app can consume it **without exposing any
private assets** — no private model URLs, no product presets, no prompts, and no private engine
code need to live in this OSS repo. This page describes the boundary.

> Nothing here requires copying private code into this repository. Private URLs, presets,
> prompts, and backends stay entirely inside the consuming app.

## The boundary

```
┌───────────────────────────────  your private app  ───────────────────────────────┐
│  private preset(s)      private source (signed URL + sha256)     private backend   │
│  private prompts/logic  private model hosting (your CDN/bucket)   (optional)        │
└─────────────────────────────────────┬───────────────────────────────────────────────┘
                                       │  runtime configuration only (never committed here)
                                       ▼
                           react-native-edge-slm (this OSS package)
                   presets · sources · download · registry · runtime · benchmark
```

Everything above the line lives in the private app. This package only receives configuration
**at runtime**.

## 1. Keep model hosting private

Host your model on your own infrastructure and hand the package a **signed, expiring URL** plus
a **checksum** — computed and injected by your app/backend, never hardcoded here:

```ts
// inside the private app — values come from your backend/remote-config, not source control
const { url, sha256, expiresAt } = await myBackend.getModelDownloadTicket();

LocalAI.configurePresetSource('my-private-model', {
  type: 'signed-url',
  url,          // e.g. a presigned GET from your private bucket
  sha256,       // integrity check
  expiresAt,    // refresh before expiry
});
```

The package downloads, verifies, and stores the file in app-private storage. It never sees or
persists your hosting credentials.

## 2. Keep presets and prompts private

Register your product preset **in the app**, with your own display name and defaults. Keep all
prompt construction and domain logic in your app code — this package has no notion of prompts:

```ts
LocalAI.registerPreset({
  id: 'my-private-model',
  displayName: 'My App Model',
  runtime: 'llama.cpp',
  fileName: 'my-model.gguf',
  // ...your device requirements and generation defaults
});

const runtime = await LocalAI.loadPreset('my-private-model');
const { text } = await runtime.generate({
  prompt: buildMyPrivatePrompt(input), // your logic, your repo
  onToken: appendToUi,
});
```

## 3. (Optional) Plug a private runtime backend

The package exposes a pluggable `RuntimeBackend` interface. The default backend is llama.cpp
(via `llama.rn`). If your app uses a different engine, you can implement `RuntimeBackend` **in
your app** and register it there — without forking this package and without that engine's code
appearing in this repo. The lifecycle layers (presets, sources, download, registry,
device/benchmark) are backend-agnostic and reused as-is.

## What stays out of this repo

- Private model hosting URLs and bucket ids.
- Backend endpoints and any credentials/secrets.
- Product presets, prompts, and domain/business logic.
- Any private engine/runtime implementation.

The [leak gate](./security.md#contributing-to-this-repo-the-leak-gate)
(`npm run lint:no-private-assets`) enforces the secret/private-infrastructure side of this: it
fails CI if likely secrets or private hosting identifiers appear in tracked source.
