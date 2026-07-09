/**
 * Typed error taxonomy for react-native-edge-slm.
 *
 * Every error carries a stable, machine-readable {@link LocalAIErrorCode} so callers can
 * branch on failure kind without string-matching messages. Codes are namespaced `LOCALAI.*`.
 */

export type LocalAIErrorCode =
  | 'LOCALAI.PRESET_NOT_FOUND'
  | 'LOCALAI.PRESET_INVALID'
  | 'LOCALAI.SOURCE_INVALID'
  | 'LOCALAI.SOURCE_NOT_CONFIGURED'
  | 'LOCALAI.INSECURE_URL'
  | 'LOCALAI.NETWORK'
  | 'LOCALAI.DOWNLOAD_FAILED'
  | 'LOCALAI.RANGE_NOT_SUPPORTED'
  | 'LOCALAI.INSUFFICIENT_STORAGE'
  | 'LOCALAI.WIFI_REQUIRED'
  | 'LOCALAI.CHECKSUM_MISMATCH'
  | 'LOCALAI.MODEL_NOT_INSTALLED'
  | 'LOCALAI.MODEL_FILE_MISSING'
  | 'LOCALAI.DEVICE_UNSUPPORTED'
  | 'LOCALAI.RUNTIME_UNAVAILABLE'
  | 'LOCALAI.LOAD_FAILED'
  | 'LOCALAI.GENERATION_FAILED'
  | 'LOCALAI.GENERATION_BUSY'
  | 'LOCALAI.CANCELLED'
  | 'LOCALAI.TIMEOUT'
  | 'LOCALAI.NOT_IMPLEMENTED';

/** Base class for all errors thrown by this package. */
export class LocalAIError extends Error {
  readonly code: LocalAIErrorCode;
  /** Optional structured context (never contains secrets). */
  readonly details?: Record<string, unknown>;

  constructor(
    code: LocalAIErrorCode,
    message: string,
    options?: { cause?: unknown; details?: Record<string, unknown> }
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = code;
    this.details = options?.details;
    // Restore prototype chain for correct `instanceof` across transpile targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** A preset id was referenced that has not been registered. */
export class PresetNotFoundError extends LocalAIError {
  constructor(presetId: string) {
    super('LOCALAI.PRESET_NOT_FOUND', `No preset registered with id "${presetId}".`, {
      details: { presetId },
    });
  }
}

/** A preset failed validation in {@link registerPreset}. */
export class PresetInvalidError extends LocalAIError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super('LOCALAI.PRESET_INVALID', `Invalid preset: ${reason}`, { details });
  }
}

/** A model source failed validation in {@link configurePresetSource}. */
export class SourceInvalidError extends LocalAIError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super('LOCALAI.SOURCE_INVALID', `Invalid model source: ${reason}`, { details });
  }
}

/** No source has been configured for a preset that requires one to install. */
export class SourceNotConfiguredError extends LocalAIError {
  constructor(presetId: string) {
    super(
      'LOCALAI.SOURCE_NOT_CONFIGURED',
      `No source configured for preset "${presetId}". Call configurePresetSource() first.`,
      { details: { presetId } }
    );
  }
}

/** A remote URL used a non-HTTPS scheme while insecure downloads were not opted in. */
export class InsecureUrlError extends LocalAIError {
  constructor(url: string) {
    super(
      'LOCALAI.INSECURE_URL',
      'Refusing to download over a non-HTTPS URL. Set allowInsecureHttp on the source to override.',
      { details: { scheme: safeScheme(url) } }
    );
  }
}

/** A downloaded file's SHA-256 digest did not match the expected value. */
export class ChecksumMismatchError extends LocalAIError {
  constructor(expected: string, actual: string) {
    super(
      'LOCALAI.CHECKSUM_MISMATCH',
      'Downloaded model failed SHA-256 verification; the file was deleted.',
      { details: { expected, actual } }
    );
  }
}

/** A preset was loaded/benchmarked before being installed. */
export class ModelNotInstalledError extends LocalAIError {
  constructor(presetId: string) {
    super(
      'LOCALAI.MODEL_NOT_INSTALLED',
      `Preset "${presetId}" is not installed. Call installPreset() first.`,
      { details: { presetId } }
    );
  }
}

/** The device does not meet a preset's minimum requirements. */
export class DeviceUnsupportedError extends LocalAIError {
  constructor(reasons: string[], details?: Record<string, unknown>) {
    super('LOCALAI.DEVICE_UNSUPPORTED', `Device unsupported: ${reasons.join('; ')}`, {
      details: { reasons, ...details },
    });
  }
}

/** A generation call arrived while another was in flight on the same runtime. */
export class GenerationBusyError extends LocalAIError {
  constructor() {
    super(
      'LOCALAI.GENERATION_BUSY',
      'A generation is already in progress on this runtime. Cancel it or await completion first.'
    );
  }
}

/** Generation was cancelled via cancel() or an AbortSignal. */
export class CancelledError extends LocalAIError {
  constructor() {
    super('LOCALAI.CANCELLED', 'Operation was cancelled.');
  }
}

/** Placeholder thrown by API surface not yet implemented in the current release stage. */
export class NotImplementedError extends LocalAIError {
  constructor(what: string) {
    super('LOCALAI.NOT_IMPLEMENTED', `${what} is not implemented in this release stage yet.`, {
      details: { what },
    });
  }
}

/** Extract a URL scheme for diagnostics without throwing on malformed input. */
function safeScheme(url: string): string {
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url);
  return match ? match[1]!.toLowerCase() : 'unknown';
}
