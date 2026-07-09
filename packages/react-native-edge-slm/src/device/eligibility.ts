/**
 * Pure device-eligibility evaluation: does a device meet a preset's minimum requirements?
 *
 * Best-effort and conservative — a requirement only *blocks* when the corresponding capability
 * is known and falls short. Unknown capabilities never fabricate a failure.
 */

import type { MinimumDeviceRequirements } from '../types/presets';
import type { DeviceCapabilities } from '../types/status';

export interface EligibilityResult {
  supported: boolean;
  reasons: string[];
}

const GiB = 1024 ** 3;

function gib(bytes: number): string {
  return `${(bytes / GiB).toFixed(1)} GiB`;
}

export function evaluateDeviceEligibility(
  capabilities: DeviceCapabilities,
  requirements?: MinimumDeviceRequirements
): EligibilityResult {
  const reasons: string[] = [];
  if (!requirements) return { supported: true, reasons };

  if (
    requirements.minAndroidApiLevel !== undefined &&
    capabilities.androidApiLevel !== undefined &&
    capabilities.androidApiLevel < requirements.minAndroidApiLevel
  ) {
    reasons.push(
      `Android API ${capabilities.androidApiLevel} < required ${requirements.minAndroidApiLevel}`
    );
  }

  if (
    requirements.minRamBytes !== undefined &&
    capabilities.totalRamBytes !== undefined &&
    capabilities.totalRamBytes < requirements.minRamBytes
  ) {
    reasons.push(`RAM ${gib(capabilities.totalRamBytes)} < required ${gib(requirements.minRamBytes)}`);
  }

  if (
    requirements.minFreeStorageBytes !== undefined &&
    capabilities.freeStorageBytes !== undefined &&
    capabilities.freeStorageBytes < requirements.minFreeStorageBytes
  ) {
    reasons.push(
      `Free storage ${gib(capabilities.freeStorageBytes)} < required ${gib(requirements.minFreeStorageBytes)}`
    );
  }

  return { supported: reasons.length === 0, reasons };
}
