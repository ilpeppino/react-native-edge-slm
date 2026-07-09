/**
 * Model source schema.
 *
 * A source describes **where a model comes from**. Sources are always provided by the
 * developer at runtime — this package hardcodes no model URLs and hosts no models.
 *
 * For remote sources (`url`, `signed-url`, `huggingface`) HTTPS is required by default;
 * set {@link RemoteSourceCommon.allowInsecureHttp} to opt into plain HTTP (discouraged).
 */

/** A lowercase 64-character hex SHA-256 digest. */
export type Sha256Hex = string;

interface RemoteSourceCommon {
  /**
   * Optional SHA-256 (64 hex chars) checked after download. When present, a mismatch
   * deletes the partial file and throws `ChecksumMismatchError`.
   */
  sha256?: Sha256Hex;
  /** Additional request headers (e.g. auth). Never persisted to the model registry. */
  headers?: Record<string, string>;
  /** Opt into non-HTTPS downloads for this source. Default: HTTPS required. */
  allowInsecureHttp?: boolean;
}

/** A plain, directly-downloadable URL. */
export interface UrlModelSource extends RemoteSourceCommon {
  type: 'url';
  url: string;
}

/**
 * A pre-signed, expiring URL (e.g. S3/R2/GCS presigned GET). Behaves like `url` but the
 * optional {@link expiresAt} lets callers detect/refresh an expired link before download.
 */
export interface SignedUrlModelSource extends RemoteSourceCommon {
  type: 'signed-url';
  url: string;
  /** Epoch milliseconds after which the URL is expected to be invalid. */
  expiresAt?: number;
}

/** A file resolved from a public Hugging Face repository. */
export interface HuggingFaceModelSource extends RemoteSourceCommon {
  type: 'huggingface';
  /** e.g. `"Qwen/Qwen2.5-1.5B-Instruct-GGUF"`. */
  repo: string;
  /** File within the repo, e.g. `"qwen2.5-1.5b-instruct-q4_k_m.gguf"`. */
  file: string;
  /** Git revision / branch / tag. Defaults to `"main"`. */
  revision?: string;
}

/** A model already present on the device filesystem (app-readable absolute path). */
export interface LocalFileModelSource {
  type: 'local-file';
  path: string;
}

/** A model shipped inside the app bundle / Android assets. */
export interface AppBundleModelSource {
  type: 'app-bundle';
  /** Asset name/path within the app bundle. */
  asset: string;
}

export type ModelSource =
  | UrlModelSource
  | SignedUrlModelSource
  | HuggingFaceModelSource
  | LocalFileModelSource
  | AppBundleModelSource;

/** Source kinds that involve a network download (and therefore HTTPS/checksum rules). */
export type RemoteModelSource =
  | UrlModelSource
  | SignedUrlModelSource
  | HuggingFaceModelSource;

export function isRemoteSource(source: ModelSource): source is RemoteModelSource {
  return (
    source.type === 'url' || source.type === 'signed-url' || source.type === 'huggingface'
  );
}
