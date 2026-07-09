# Contributing to react-native-edge-slm

Thanks for your interest! This is a generic, open-source on-device AI runtime for React
Native. Contributions of all kinds are welcome — bug reports, docs, tests, and code.

## Ground rules

- **No proprietary content.** This package is extracted, clean-room, from a private app. Never
  add private URLs, secrets, backend endpoints, product namespaces, domain-specific prompts, or
  medical/business logic. A CI gate blocks known private identifiers (see below).
- **No model binaries or hosting.** The package ships no `.gguf`/weights and hardcodes no model
  URLs. Sources are always developer-provided at runtime.
- **You are responsible for model licensing.** Examples/tests must only reference models you have
  the right to use.

## Development setup

Requires Node 18+.

```sh
git clone https://github.com/ilpeppino/react-native-edge-slm.git
cd react-native-edge-slm
npm install
```

This is an npm-workspaces monorepo:

- `packages/react-native-edge-slm` — the library (TypeScript + Android Kotlin + iOS Swift).
- `apps/example` — the example app / usage demo.

## Everyday commands

Run from the repo root:

```sh
npm run typecheck            # tsc --noEmit on the package
npm run test                 # jest (unit tests)
npm run build                # emit lib/ (CommonJS + d.ts)
npm run lint:no-private-assets   # the private-asset leak gate
```

CI runs exactly these (leak gate → typecheck → test → build). Please run them locally before
opening a PR.

## The private-asset leak gate

`scripts/check-no-private-assets.sh` fails if any forbidden identifier appears in tracked
source (private hosting URLs, backend endpoints, product namespaces, internal engine/class
names). It runs in CI and you can run it locally with `npm run lint:no-private-assets`. If you
believe a match is a false positive, discuss it in the PR rather than weakening the gate.

## Architecture at a glance

- **Lifecycle (pure TS):** presets, sources, download, registry, device eligibility — all over
  injectable boundaries (`FileStore`, `DownloadTransport`, `KeyValueStore`, `DeviceInfoProvider`),
  so the same code runs on-device and under Jest against a local static server.
- **Runtime backend seam:** `RuntimeBackend` is pluggable. `llama.cpp` (via `llama.rn`) is the
  default; register your own with `LocalAI.registerBackend(...)`. See `docs/runtimes.md`.
- **Native modules** (`android/` Kotlin, `ios/` Swift) implement the same contract the TS
  boundaries define. When changing a boundary, update both platforms.

## Tests

- Add or update tests for any behavior change. Orchestration is fully testable without a device
  or `llama.rn` — use the Node-backed fakes and `FakeBackend` under `src/__tests__/helpers/`.
- Native (Kotlin/Swift/C++) changes can't be unit-tested here; validate them by building
  `apps/example` on a device/emulator and note that in the PR.

## Commits & PRs

- Keep PRs focused; write a clear description of what and why.
- Ensure `typecheck`, `test`, `build`, and the leak gate pass.
- Update relevant docs under `docs/` when behavior or the public API changes.

## License

By contributing, you agree that your contributions are licensed under the project's
[MIT License](./LICENSE).
