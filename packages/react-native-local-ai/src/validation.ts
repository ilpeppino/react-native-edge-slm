/**
 * Pure validation helpers for presets and sources. No I/O, no native calls — safe to unit test.
 */

import { PresetInvalidError, SourceInvalidError } from './errors';
import type { ModelPreset } from './types/presets';
import type { ModelSource, Sha256Hex } from './types/sources';
import { isRemoteSource } from './types/sources';

const SHA256_RE = /^[a-fA-F0-9]{64}$/;

export function isValidSha256(value: string): value is Sha256Hex {
  return SHA256_RE.test(value);
}

/** True for `https:`. `http:` is only acceptable when the source opts in. */
export function isHttpsUrl(url: string): boolean {
  return /^https:\/\//i.test(url);
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** Validate a preset at registration time. Throws {@link PresetInvalidError} on failure. */
export function validatePreset(preset: ModelPreset): void {
  if (!preset || typeof preset !== 'object') {
    throw new PresetInvalidError('preset must be an object');
  }
  if (!isNonEmptyString(preset.id)) {
    throw new PresetInvalidError('`id` is required and must be a non-empty string');
  }
  if (!isNonEmptyString(preset.displayName)) {
    throw new PresetInvalidError('`displayName` is required', { id: preset.id });
  }
  if (!isNonEmptyString(preset.runtime)) {
    throw new PresetInvalidError('`runtime` is required', { id: preset.id });
  }
  if (!isNonEmptyString(preset.fileName)) {
    throw new PresetInvalidError('`fileName` is required', { id: preset.id });
  }
  if (preset.fileName.includes('/') || preset.fileName.includes('\\')) {
    throw new PresetInvalidError('`fileName` must not contain path separators', {
      id: preset.id,
      fileName: preset.fileName,
    });
  }
  if (preset.expectedSizeBytes !== undefined && !isPositiveNumber(preset.expectedSizeBytes)) {
    throw new PresetInvalidError('`expectedSizeBytes` must be a positive number', {
      id: preset.id,
    });
  }
}

/** Validate a source at configuration time. Throws {@link SourceInvalidError} on failure. */
export function validateSource(source: ModelSource): void {
  if (!source || typeof source !== 'object') {
    throw new SourceInvalidError('source must be an object');
  }
  switch (source.type) {
    case 'url':
    case 'signed-url': {
      if (!isNonEmptyString(source.url)) {
        throw new SourceInvalidError('`url` is required', { type: source.type });
      }
      if (!isHttpUrl(source.url)) {
        throw new SourceInvalidError('`url` must be an http(s) URL', { type: source.type });
      }
      break;
    }
    case 'huggingface': {
      if (!isNonEmptyString(source.repo) || !isNonEmptyString(source.file)) {
        throw new SourceInvalidError('`repo` and `file` are required for huggingface sources');
      }
      break;
    }
    case 'local-file': {
      if (!isNonEmptyString(source.path)) {
        throw new SourceInvalidError('`path` is required for local-file sources');
      }
      return; // no checksum/https rules for local sources
    }
    case 'app-bundle': {
      if (!isNonEmptyString(source.asset)) {
        throw new SourceInvalidError('`asset` is required for app-bundle sources');
      }
      return;
    }
    default: {
      throw new SourceInvalidError(
        `unknown source type "${(source as { type?: string }).type ?? ''}"`
      );
    }
  }

  if (isRemoteSource(source) && source.sha256 !== undefined && !isValidSha256(source.sha256)) {
    throw new SourceInvalidError('`sha256` must be a 64-character hex string', {
      type: source.type,
    });
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
