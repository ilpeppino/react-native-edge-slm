/**
 * Resolve a remote {@link ModelSource} to a concrete download request (URL + headers +
 * checksum), applying the HTTPS-by-default policy.
 */

import { InsecureUrlError } from '../errors';
import type { RemoteModelSource, Sha256Hex } from '../types/sources';
import { isHttpsUrl } from '../validation';

export interface ResolvedRemoteSource {
  url: string;
  headers?: Record<string, string>;
  sha256?: Sha256Hex;
}

/** Build the canonical Hugging Face resolve URL for a repo file. */
export function huggingFaceResolveUrl(repo: string, file: string, revision = 'main'): string {
  const enc = (s: string) => s.split('/').map(encodeURIComponent).join('/');
  return `https://huggingface.co/${enc(repo)}/resolve/${encodeURIComponent(revision)}/${enc(file)}`;
}

/**
 * Turn a remote source into a URL + headers + checksum, enforcing HTTPS unless the source
 * opted into insecure HTTP. Throws {@link InsecureUrlError} for a non-HTTPS URL without opt-in.
 */
export function resolveRemoteSource(source: RemoteModelSource): ResolvedRemoteSource {
  const url =
    source.type === 'huggingface'
      ? huggingFaceResolveUrl(source.repo, source.file, source.revision)
      : source.url;

  if (!isHttpsUrl(url) && !source.allowInsecureHttp) {
    throw new InsecureUrlError(url);
  }

  return { url, headers: source.headers, sha256: source.sha256 };
}
