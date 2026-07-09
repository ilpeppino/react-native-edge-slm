import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';

import type { FileStore } from '../../storage/FileStore';
import type { ModelPaths } from '../../storage/paths';

/** Node `fs`/`crypto`-backed FileStore for tests — mirrors the on-device native contract. */
export class NodeFileStore implements FileStore {
  /** Overridable to exercise the insufficient-storage path. */
  public freeBytes = 100 * 1024 ** 3;

  constructor(private readonly root: string) {}

  async paths(): Promise<ModelPaths> {
    return {
      root: this.root,
      tempDir: `${this.root}/temp`,
      installedDir: `${this.root}/installed`,
    };
  }

  async ensureDir(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true });
  }

  async exists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }

  async size(path: string): Promise<number> {
    try {
      return (await stat(path)).size;
    } catch {
      return 0;
    }
  }

  async delete(path: string): Promise<void> {
    await rm(path, { force: true });
  }

  async move(from: string, to: string): Promise<void> {
    await rename(from, to);
  }

  async sha256(path: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(path);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  async freeStorageBytes(): Promise<number> {
    return this.freeBytes;
  }
}
