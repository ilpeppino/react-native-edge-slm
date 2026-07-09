/**
 * ModelRegistry — the local record of installed models.
 *
 * Persists {@link InstalledModel} records and a "selected" pointer in a {@link KeyValueStore}.
 * Self-heals: records whose file no longer exists on disk are dropped on read/reconcile, so an
 * app that clears its storage never reports a phantom install.
 */

import type { FileStore } from '../storage/FileStore';
import type { KeyValueStore } from '../storage/KeyValueStore';
import type { InstalledModel } from '../types/status';

const INSTALLED_KEY = 'localai.installed.v1';
const SELECTED_KEY = 'localai.selected.v1';

export class ModelRegistry {
  constructor(
    private readonly store: KeyValueStore,
    private readonly fileStore: FileStore
  ) {}

  /** Record (or replace) an installed model. */
  async put(model: InstalledModel): Promise<void> {
    const all = await this.readAll();
    all[model.presetId] = model;
    await this.writeAll(all);
  }

  /**
   * Get a record by preset id, self-healing: if the file is gone, the record is removed and
   * `undefined` is returned.
   */
  async get(presetId: string): Promise<InstalledModel | undefined> {
    const all = await this.readAll();
    const record = all[presetId];
    if (!record) return undefined;
    if (await this.fileStore.exists(record.path)) return record;
    delete all[presetId];
    await this.writeAll(all);
    await this.unselectIf(presetId);
    return undefined;
  }

  /** All installed records, after self-healing missing files. */
  async getAll(): Promise<InstalledModel[]> {
    return this.reconcile();
  }

  /** Whether a preset is currently installed (and its file present). */
  async isInstalled(presetId: string): Promise<boolean> {
    return (await this.get(presetId)) !== undefined;
  }

  /** Remove a record and delete its installed file. */
  async remove(presetId: string): Promise<void> {
    const all = await this.readAll();
    const record = all[presetId];
    if (record) {
      await this.fileStore.delete(record.path);
      delete all[presetId];
      await this.writeAll(all);
    }
    await this.unselectIf(presetId);
  }

  /** Set the selected model pointer (must be installed). */
  async setSelected(presetId: string): Promise<void> {
    if (await this.isInstalled(presetId)) {
      await this.store.setItem(SELECTED_KEY, presetId);
    }
  }

  /** The selected preset id, or `undefined` if none/no-longer-installed. */
  async getSelected(): Promise<string | undefined> {
    const selected = await this.store.getItem(SELECTED_KEY);
    if (!selected) return undefined;
    return (await this.isInstalled(selected)) ? selected : undefined;
  }

  /** Drop records whose files are missing; returns the survivors. */
  async reconcile(): Promise<InstalledModel[]> {
    const all = await this.readAll();
    const survivors: InstalledModel[] = [];
    let mutated = false;
    for (const record of Object.values(all)) {
      if (await this.fileStore.exists(record.path)) {
        survivors.push(record);
      } else {
        delete all[record.presetId];
        mutated = true;
        await this.unselectIf(record.presetId);
      }
    }
    if (mutated) await this.writeAll(all);
    return survivors;
  }

  private async unselectIf(presetId: string): Promise<void> {
    const selected = await this.store.getItem(SELECTED_KEY);
    if (selected === presetId) await this.store.removeItem(SELECTED_KEY);
  }

  private async readAll(): Promise<Record<string, InstalledModel>> {
    const raw = await this.store.getItem(INSTALLED_KEY);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private async writeAll(all: Record<string, InstalledModel>): Promise<void> {
    await this.store.setItem(INSTALLED_KEY, JSON.stringify(all));
  }
}
