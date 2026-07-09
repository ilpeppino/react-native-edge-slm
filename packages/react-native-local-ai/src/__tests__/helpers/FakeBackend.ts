import type {
  GenerateOptions,
  GenerateResult,
  LoadOptions,
  RuntimeBackend,
  RuntimeBackendCapabilities,
  RuntimeBackendContext,
} from '../../types/runtime';
import type { GenerationConfig } from '../../types/presets';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A fake streaming backend for tests — mimics a real engine without llama.rn. */
export class FakeBackend implements RuntimeBackend {
  readonly key: string;
  loadCount = 0;
  lastLoadOptions?: LoadOptions;
  lastContext?: FakeContext;

  constructor(
    private readonly tokens: string[] = ['Hello', ', ', 'world', '!'],
    private readonly tokenDelayMs = 4,
    key = 'llama.cpp'
  ) {
    this.key = key;
  }

  capabilities(): RuntimeBackendCapabilities {
    return { runtime: this.key, streaming: true, vision: false, cancellable: true };
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async load(options: LoadOptions): Promise<RuntimeBackendContext> {
    this.loadCount += 1;
    this.lastLoadOptions = options;
    const ctx = new FakeContext(this.tokens, this.tokenDelayMs);
    this.lastContext = ctx;
    return ctx;
  }
}

export class FakeContext implements RuntimeBackendContext {
  private stopped = false;
  unloadCount = 0;
  lastConfig?: GenerationConfig;

  constructor(private readonly tokens: string[], private readonly tokenDelayMs: number) {}

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    this.lastConfig = options.config;
    const startedAt = Date.now();
    let firstTokenAt: number | undefined;
    let count = 0;
    for (const token of this.tokens) {
      if (this.stopped) break;
      await sleep(this.tokenDelayMs);
      if (this.stopped) break;
      if (firstTokenAt === undefined) firstTokenAt = Date.now();
      count += 1;
      options.onToken?.(token);
    }
    const totalMs = Date.now() - startedAt;
    return {
      text: this.tokens.slice(0, count).join(''),
      stats: {
        tokensGenerated: count,
        firstTokenMs: firstTokenAt !== undefined ? firstTokenAt - startedAt : undefined,
        totalMs,
        tokensPerSecond: totalMs > 0 ? (count * 1000) / totalMs : undefined,
        cancelled: false,
        finishReason: 'stop',
      },
    };
  }

  cancel(): void {
    this.stopped = true;
  }

  async unload(): Promise<void> {
    this.unloadCount += 1;
  }
}
