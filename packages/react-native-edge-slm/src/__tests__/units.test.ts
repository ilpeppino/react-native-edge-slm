import { evaluateDeviceEligibility } from '../device/eligibility';
import { huggingFaceResolveUrl, resolveRemoteSource } from '../download/resolveSourceUrl';
import { InsecureUrlError } from '../errors';
import { resolveInstalledPath, resolveTempPath, sanitizeSegment } from '../storage/paths';
import { isValidSha256 } from '../validation';

describe('sanitizeSegment', () => {
  it('strips path separators and traversal', () => {
    expect(sanitizeSegment('../../etc/passwd')).not.toContain('/');
    expect(sanitizeSegment('a/b\\c')).toBe('a_b_c');
    expect(sanitizeSegment('   ')).toBe('_');
    expect(sanitizeSegment('.hidden')).not.toMatch(/^\./);
  });
});

describe('path resolution', () => {
  const paths = { root: '/r', tempDir: '/r/temp', installedDir: '/r/installed' };
  it('builds temp and installed paths', () => {
    expect(resolveTempPath(paths, 'my-model')).toBe('/r/temp/my-model.part');
    expect(resolveInstalledPath(paths, 'model.gguf')).toBe('/r/installed/model.gguf');
  });
});

describe('isValidSha256', () => {
  it('accepts 64 hex chars, rejects others', () => {
    expect(isValidSha256('a'.repeat(64))).toBe(true);
    expect(isValidSha256('a'.repeat(63))).toBe(false);
    expect(isValidSha256('z'.repeat(64))).toBe(false);
  });
});

describe('resolveRemoteSource', () => {
  it('builds a Hugging Face resolve URL', () => {
    expect(huggingFaceResolveUrl('Org/Repo', 'a/model.gguf', 'main')).toBe(
      'https://huggingface.co/Org/Repo/resolve/main/a/model.gguf'
    );
  });

  it('enforces HTTPS by default', () => {
    expect(() => resolveRemoteSource({ type: 'url', url: 'http://x/m.gguf' })).toThrow(
      InsecureUrlError
    );
    expect(
      resolveRemoteSource({ type: 'url', url: 'http://x/m.gguf', allowInsecureHttp: true }).url
    ).toBe('http://x/m.gguf');
    expect(resolveRemoteSource({ type: 'url', url: 'https://x/m.gguf' }).url).toBe(
      'https://x/m.gguf'
    );
  });
});

describe('evaluateDeviceEligibility', () => {
  it('passes when requirements are met or unknown', () => {
    expect(evaluateDeviceEligibility({ platform: 'android' }).supported).toBe(true);
    expect(
      evaluateDeviceEligibility(
        { platform: 'android', totalRamBytes: 8 * 1024 ** 3 },
        { minRamBytes: 4 * 1024 ** 3 }
      ).supported
    ).toBe(true);
  });

  it('fails with reasons when a known capability falls short', () => {
    const result = evaluateDeviceEligibility(
      { platform: 'android', androidApiLevel: 24, totalRamBytes: 2 * 1024 ** 3 },
      { minAndroidApiLevel: 29, minRamBytes: 6 * 1024 ** 3 }
    );
    expect(result.supported).toBe(false);
    expect(result.reasons).toHaveLength(2);
  });
});
