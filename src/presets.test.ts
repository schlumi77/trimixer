import { describe, it, expect } from 'vitest';
import { PRESETS, CUSTOM_PRESET, matchPreset } from './presets';

describe('matchPreset', () => {
  it('finds the preset for a matching mix', () => {
    expect(matchPreset(0.21, 0)).toBe('air');
    expect(matchPreset(0.18, 0.45)).toBe('tx18_45');
  });

  it('matches mixes entered as percent in the UI', () => {
    // The UI stores percent inputs as value / 100.
    expect(matchPreset(18 / 100, 45 / 100)).toBe('tx18_45');
    expect(matchPreset(32 / 100, 0)).toBe('nx32');
  });

  it('returns custom when no preset matches', () => {
    expect(matchPreset(0.19, 0.45)).toBe(CUSTOM_PRESET);
  });

  it('has a unique mix for every preset', () => {
    for (const [key, p] of Object.entries(PRESETS)) {
      expect(matchPreset(p.o2, p.he)).toBe(key);
    }
  });
});
