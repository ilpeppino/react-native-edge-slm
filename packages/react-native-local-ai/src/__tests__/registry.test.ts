import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ModelRegistry } from '../registry/ModelRegistry';
import { InMemoryKeyValueStore } from '../storage/KeyValueStore';
import type { InstalledModel } from '../types/status';
import { NodeFileStore } from './helpers/NodeFileStore';

let root: string;
let fileStore: NodeFileStore;
let kv: InMemoryKeyValueStore;
let registry: ModelRegistry;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'localai-reg-'));
  fileStore = new NodeFileStore(root);
  kv = new InMemoryKeyValueStore();
  registry = new ModelRegistry(kv, fileStore);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function record(presetId: string): Promise<InstalledModel> {
  const path = join(root, `${presetId}.gguf`);
  await writeFile(path, 'weights');
  return {
    presetId,
    path,
    fileName: `${presetId}.gguf`,
    sizeBytes: 7,
    installedAt: 1_000,
  };
}

describe('ModelRegistry', () => {
  it('stores and retrieves an installed record', async () => {
    const rec = await record('m1');
    await registry.put(rec);
    expect(await registry.get('m1')).toEqual(rec);
    expect(await registry.isInstalled('m1')).toBe(true);
  });

  it('self-heals a record whose file is gone', async () => {
    const rec = await record('m1');
    await registry.put(rec);
    await rm(rec.path);
    expect(await registry.get('m1')).toBeUndefined();
    expect(await registry.isInstalled('m1')).toBe(false);
    // pruned from storage
    expect(await registry.getAll()).toHaveLength(0);
  });

  it('removes a record and deletes its file', async () => {
    const rec = await record('m1');
    await registry.put(rec);
    await registry.remove('m1');
    expect(await fileStore.exists(rec.path)).toBe(false);
    expect(await registry.get('m1')).toBeUndefined();
  });

  it('tracks a selected pointer and clears it when the model is removed', async () => {
    await registry.put(await record('m1'));
    await registry.put(await record('m2'));
    await registry.setSelected('m2');
    expect(await registry.getSelected()).toBe('m2');

    await registry.remove('m2');
    expect(await registry.getSelected()).toBeUndefined();
  });

  it('refuses to select a model that is not installed', async () => {
    await registry.setSelected('ghost');
    expect(await registry.getSelected()).toBeUndefined();
  });

  it('returns only survivors from getAll after reconcile', async () => {
    const a = await record('a');
    const b = await record('b');
    await registry.put(a);
    await registry.put(b);
    await rm(a.path);
    const all = await registry.getAll();
    expect(all.map((r) => r.presetId)).toEqual(['b']);
  });
});
