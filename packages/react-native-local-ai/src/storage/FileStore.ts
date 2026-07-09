/**
 * FileStore — the filesystem boundary.
 *
 * On-device this is backed by a native module (app-private storage + streamed SHA-256). In
 * tests it is backed by Node `fs`/`crypto`. All paths are absolute. `DownloadManager` and
 * `ModelRegistry` depend only on this interface, never on a concrete platform.
 */

import type { ModelPaths } from './paths';

export interface FileStore {
  /** The app-private model directories. */
  paths(): Promise<ModelPaths>;
  /** Create a directory (and parents) if it does not already exist. */
  ensureDir(dir: string): Promise<void>;
  /** Whether a file or directory exists at `path`. */
  exists(path: string): Promise<boolean>;
  /** Size in bytes of the file at `path`. Returns 0 if it does not exist. */
  size(path: string): Promise<number>;
  /** Delete a file if present. No-op if absent. */
  delete(path: string): Promise<void>;
  /**
   * Move/rename `from` to `to`. Expected to be atomic when both are on the same filesystem
   * (temp and installed dirs are, by construction). Overwrites `to` if it exists.
   */
  move(from: string, to: string): Promise<void>;
  /** Lowercase hex SHA-256 of the file at `path`, computed by streaming (never loads it all). */
  sha256(path: string): Promise<string>;
  /** Best-effort free bytes on the volume backing the model directories. */
  freeStorageBytes(): Promise<number>;
}
