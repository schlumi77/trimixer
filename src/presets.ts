export interface GasPreset {
  o2: number;
  he: number;
  label: string;
}

/** Standard mixes offered in the preset dropdowns. Fractions are 0–1. */
export const PRESETS: Record<string, GasPreset> = {
  air: { o2: 0.21, he: 0, label: 'Air' },
  nx32: { o2: 0.32, he: 0, label: 'Nx32' },
  nx50: { o2: 0.50, he: 0, label: 'Nx50' },
  tx50_15: { o2: 0.50, he: 0.15, label: 'Tx50/15' },
  tx21_35: { o2: 0.21, he: 0.35, label: 'Tx21/35' },
  tx18_45: { o2: 0.18, he: 0.45, label: 'Tx18/45' },
  tx15_55: { o2: 0.15, he: 0.55, label: 'Tx15/55' },
  tx12_65: { o2: 0.12, he: 0.65, label: 'Tx12/65' },
  tx10_80: { o2: 0.10, he: 0.80, label: 'Tx10/80' },
  tx6_90: { o2: 0.06, he: 0.90, label: 'Tx6/90' },
  oxygen: { o2: 1.0, he: 0, label: 'Oxygen' },
};

/** Value of the "no preset" option in the preset dropdowns. */
export const CUSTOM_PRESET = 'custom';

/** Key of the preset matching a mix, or CUSTOM_PRESET when none matches. */
export function matchPreset(o2: number, he: number): string {
  const match = Object.entries(PRESETS).find(
    ([, p]) => Math.abs(p.o2 - o2) < 1e-6 && Math.abs(p.he - he) < 1e-6
  );
  return match ? match[0] : CUSTOM_PRESET;
}
