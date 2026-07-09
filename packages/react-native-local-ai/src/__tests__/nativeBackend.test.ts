import { NativeLlamaCppBackend, NATIVE_LLAMA_CPP_RUNTIME } from '../runtime/backends/NativeLlamaCppBackend';
import { NotImplementedError } from '../errors';

describe('NativeLlamaCppBackend (scaffold)', () => {
  const backend = new NativeLlamaCppBackend();

  it('uses a distinct runtime key from the default llama.cpp backend', () => {
    expect(backend.key).toBe(NATIVE_LLAMA_CPP_RUNTIME);
    expect(backend.key).not.toBe('llama.cpp');
  });

  it('advertises streaming + cancellable capabilities', () => {
    expect(backend.capabilities()).toMatchObject({ streaming: true, cancellable: true });
  });

  it('is not available until the native module is built', async () => {
    expect(await backend.isAvailable()).toBe(false);
  });

  it('throws NotImplementedError on load', async () => {
    await expect(backend.load({ modelPath: '/x.gguf' })).rejects.toBeInstanceOf(NotImplementedError);
  });
});
