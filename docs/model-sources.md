# Model sources

A **source** tells the package where a model comes from. Sources are always provided by *you*
at runtime — the package hardcodes no model URLs and hosts no models. Attach one to a
registered preset with `configurePresetSource(presetId, source)`.

```ts
type ModelSource =
  | { type: 'url';        url: string; sha256?: string; headers?: Record<string,string>; allowInsecureHttp?: boolean }
  | { type: 'signed-url'; url: string; sha256?: string; expiresAt?: number; headers?: …; allowInsecureHttp?: boolean }
  | { type: 'huggingface'; repo: string; file: string; revision?: string; sha256?: string; … }
  | { type: 'local-file'; path: string }
  | { type: 'app-bundle'; asset: string };
```

## Types

### `url`
A directly downloadable URL. HTTPS required by default.
```ts
{ type: 'url', url: 'https://cdn.example.com/models/model.gguf', sha256: '…' }
```

### `signed-url`
A pre-signed, expiring URL (S3/R2/GCS presigned GET, etc.). Same as `url`, plus an optional
`expiresAt` (epoch ms) so you can refresh the link before it expires. **The signing happens in
your app/backend — the package only consumes the URL you pass.**
```ts
{ type: 'signed-url', url: signed, sha256: '…', expiresAt: Date.now() + 5 * 60_000 }
```

### `huggingface`
Resolve a file from a public Hugging Face repo.
```ts
{ type: 'huggingface', repo: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF', file: 'qwen2.5-1.5b-instruct-q4_k_m.gguf', revision: 'main' }
```

### `local-file`
A model already on the device filesystem (an app-readable absolute path). No download.
```ts
{ type: 'local-file', path: '/data/user/0/app/files/models/model.gguf' }
```

### `app-bundle`
A model shipped inside your app bundle / Android assets. Copied into app-private storage on install.
```ts
{ type: 'app-bundle', asset: 'models/model.gguf' }
```

## Rules

- **HTTPS by default.** `url` / `signed-url` / `huggingface` must be HTTPS unless you set
  `allowInsecureHttp: true` on the source (discouraged; see [security.md](./security.md)).
- **Optional SHA-256.** When `sha256` (64 hex chars) is present, the downloaded file is verified
  before install; a mismatch deletes the partial file and throws `ChecksumMismatchError`.
- **`headers` are request-only.** They are never written into the local model registry.
- **You own licensing.** You are responsible for complying with each model's license and the
  terms of whatever host you download from.
