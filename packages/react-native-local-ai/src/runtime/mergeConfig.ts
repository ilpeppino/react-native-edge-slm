/**
 * Merge generation configs. Later sources win; `undefined` fields never clobber a set value.
 * Arrays (e.g. `stop`) are replaced wholesale, not concatenated.
 */

import type { GenerationConfig } from '../types/presets';

export function mergeGenerationConfig(
  ...configs: Array<Partial<GenerationConfig> | undefined>
): GenerationConfig {
  const result: GenerationConfig = {};
  for (const config of configs) {
    if (!config) continue;
    for (const [key, value] of Object.entries(config)) {
      if (value !== undefined) {
        (result as Record<string, unknown>)[key] = value;
      }
    }
  }
  return result;
}
