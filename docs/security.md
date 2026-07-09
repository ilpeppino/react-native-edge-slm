# Security

This package is designed so an app can run local models **without shipping secrets, private
hosting, or telemetry**. This page states the guarantees and the developer's responsibilities.

## What the package does NOT do

- **No hardcoded model URLs.** Every model source is provided by you at runtime.
- **No bundled model weights and no model hosting.** The project ships no `.gguf`/`.bin` files.
- **No secrets.** No API keys, tokens, or credentials are embedded.
- **No telemetry by default.** Nothing is sent anywhere. There is no analytics or phone-home.

## Transport & integrity

- **HTTPS required by default.** Remote sources (`url` / `signed-url` / `huggingface`) must use
  HTTPS. Plain HTTP requires an explicit per-source `allowInsecureHttp: true` opt-in and is
  discouraged (use it only for local dev servers).
- **SHA-256 verification.** When a source includes `sha256` (64 hex chars), the downloaded file
  is verified before install. A mismatch deletes the partial file and throws
  `ChecksumMismatchError`. Supplying a checksum is strongly recommended for remote models.
- **App-private storage.** Models are stored in app-private directories, not world-readable
  locations, and are removed when the app is uninstalled.

## Your responsibilities

- **Model licensing.** You choose and download the models; you are responsible for complying
  with each model's license and the host's terms.
- **Source trust.** Point presets only at hosts you trust. Prefer checksummed, HTTPS sources.
- **Auth headers.** If a source needs credentials, pass them via the source's `headers` (used
  for the request only, never persisted to the model registry). Keep any signing on your side.

## Contributing to this repo: the leak gate

To keep secrets and private infrastructure out of the public tree, CI and a pre-commit check
run:

```sh
npm run lint:no-private-assets   # scripts/check-no-private-assets.sh
```

It fails the build if a likely secret or private hosting identifier appears in tracked source —
Cloudflare R2 URLs, private/CGNAT IPs, cloud access keys, API tokens, or PEM private keys. Never
add real private URLs, tokens, or proprietary code to this repository; if you are integrating
this package into a proprietary app, keep those in *your* app (see
[private-app-integration.md](./private-app-integration.md) for the pattern).
