/**
 * Path resolution for model files.
 *
 * Models live in app-private storage split into two directories: `temp/` for in-progress
 * (resumable) downloads and `installed/` for verified, ready-to-load files. Both live under a
 * single root so the final temp→installed step is an atomic rename on the same filesystem.
 */

/** Absolute app-private directories for model storage. */
export interface ModelPaths {
  /** Root, e.g. `<filesDir>/localai/models`. */
  root: string;
  /** In-progress downloads, e.g. `<root>/temp`. */
  tempDir: string;
  /** Verified installed models, e.g. `<root>/installed`. */
  installedDir: string;
}

/**
 * Make a filesystem-safe single path segment: strip separators and control/reserved chars,
 * collapse whitespace, and bound length. Never returns an empty string.
 */
export function sanitizeSegment(input: string): string {
  const cleaned = input
    .normalize('NFKD')
    .replace(/[\/\\]+/g, '_') // path separators
    .replace(/[\x00-\x1f\x7f]/g, '') // control chars
    .replace(/[<>:"|?*]/g, '_') // reserved on some filesystems
    .replace(/\s+/g, '_')
    .replace(/^\.+/, '_') // no leading dots (hidden / traversal)
    .slice(0, 180)
    .trim();
  return cleaned.length > 0 ? cleaned : '_';
}

/** Join path segments with a single `/`, tolerating trailing slashes on the base. */
export function joinPath(base: string, ...segments: string[]): string {
  const trimmedBase = base.replace(/\/+$/, '');
  const parts = segments.map((s) => s.replace(/^\/+|\/+$/g, '')).filter((s) => s.length > 0);
  return [trimmedBase, ...parts].join('/');
}

/** Temp file path for an in-progress download: `<tempDir>/<presetId>.part`. */
export function resolveTempPath(paths: ModelPaths, presetId: string): string {
  return joinPath(paths.tempDir, `${sanitizeSegment(presetId)}.part`);
}

/** Installed file path: `<installedDir>/<fileName>`. */
export function resolveInstalledPath(paths: ModelPaths, fileName: string): string {
  return joinPath(paths.installedDir, sanitizeSegment(fileName));
}
