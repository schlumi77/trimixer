import { describe, it, expect } from 'vitest';
import { calculateBlending, calculateTopUpResult, calculateMixMetrics } from './calculations';

describe('Gas Physics Engine (Van der Waals)', () => {
  const supply = { o2P: 300, heP: 300, o2V: 50, heV: 50 };
  const temp = 20;

  describe('calculateBlending', () => {
    it('calculates correct partial pressures for EAN32', () => {
      const current = { o2: 0.21, he: 0, p: 0, v: 12 };
      const target = { o2: 0.32, he: 0, p: 200, v: 12 };
      const result = calculateBlending(current, target, supply, temp, 'HeFirst');
      
      const o2Step = result.steps.find(s => s.gas === 'O2');
      expect(o2Step?.addP).toBeGreaterThan(25);
      expect(o2Step?.addP).toBeLessThan(30);
      expect(result.steps.at(-1)?.pAfter).toBeCloseTo(200, 0);
    });

    it('handles optimized bleed-down logic', () => {
      const current = { o2: 0.21, he: 0, p: 200, v: 12 };
      const target = { o2: 0.21, he: 0, p: 100, v: 12 };
      const result = calculateBlending(current, target, supply, temp, 'HeFirst');
      
      expect(result.bleedRequired).toBeDefined();
      expect(result.bleedRequired).toBeCloseTo(100, 0);
    });

    it('calculates hot pressure for heat of compression', () => {
      const current = { o2: 0.21, he: 0, p: 0, v: 12 };
      const target = { o2: 0.32, he: 0, p: 200, v: 12 };
      const fillTempDelta = 20;
      const result = calculateBlending(current, target, supply, temp, 'HeFirst', fillTempDelta);
      
      const lastStep = result.steps.at(-1);
      expect(lastStep).toBeDefined();
      expect(lastStep?.pAfter).toBeCloseTo(200, 0);
      expect(lastStep?.pHot).toBeGreaterThan(lastStep?.pAfter || 0);
    });

    it('maintains mass balance for Helium', () => {
      const current = { o2: 0.21, he: 0, p: 0, v: 12 };
      const target = { o2: 0.18, he: 0.45, p: 200, v: 12 };
      const result = calculateBlending(current, target, supply, temp, 'HeFirst');
      
      const heStep = result.steps.find(s => s.gas === 'He');
      expect(heStep).toBeDefined();
      expect(result.steps.at(-1)?.mixAfter.he).toBeCloseTo(0.45, 2);
    });

    it('validates O2 + He exceeding 100%', () => {
      const current = { o2: 0.21, he: 0, p: 0, v: 12 };
      const target = { o2: 0.6, he: 0.5, p: 200, v: 12 };
      const result = calculateBlending(current, target, supply, temp, 'HeFirst');
      expect(result.validationErrors).toContain('O2 + He cannot exceed 100%');
    });

    it('rejects negative gas fractions', () => {
      const current = { o2: 0.21, he: 0, p: 0, v: 12 };
      const target = { o2: -0.1, he: 0, p: 200, v: 12 };
      const result = calculateBlending(current, target, supply, temp, 'HeFirst');
      expect(result.validationErrors).toContain('Gas fractions cannot be negative');
      expect(result.steps).toHaveLength(0);
    });

    it('rejects non-positive target pressure', () => {
      const current = { o2: 0.21, he: 0, p: 0, v: 12 };
      expect(calculateBlending(current, { o2: 0.21, he: 0, p: 0, v: 12 }, supply, temp, 'HeFirst').validationErrors)
        .toContain('Target pressure must be greater than 0 bar');
      expect(calculateBlending(current, { o2: 0.21, he: 0, p: -50, v: 12 }, supply, temp, 'HeFirst').validationErrors)
        .toContain('Target pressure must be greater than 0 bar');
    });

    it('rejects negative current pressure', () => {
      const current = { o2: 0.21, he: 0, p: -10, v: 12 };
      const target = { o2: 0.21, he: 0, p: 200, v: 12 };
      expect(calculateBlending(current, target, supply, temp, 'HeFirst').validationErrors)
        .toContain('Current pressure cannot be negative');
    });

    it('rejects non-positive cylinder volume', () => {
      const current = { o2: 0.21, he: 0, p: 0, v: 0 };
      const target = { o2: 0.21, he: 0, p: 200, v: 0 };
      expect(calculateBlending(current, target, supply, temp, 'HeFirst').validationErrors)
        .toContain('Cylinder volume must be greater than 0 L');
    });

    it('validates temperature bounds', () => {
      const current = { o2: 0.21, he: 0, p: 0, v: 12 };
      const target = { o2: 0.21, he: 0, p: 200, v: 12 };
      expect(calculateBlending(current, target, supply, -15, 'HeFirst').validationErrors).toContain('Temperature out of safe blending range (-10 to 50°C)');
      expect(calculateBlending(current, target, supply, 55, 'HeFirst').validationErrors).toContain('Temperature out of safe blending range (-10 to 50°C)');
    });

    it('triggers safety warnings for O2 clean and high pressure', () => {
      const current = { o2: 0.21, he: 0, p: 0, v: 12 };
      const target = { o2: 0.50, he: 0, p: 240, v: 12 };
      const result = calculateBlending(current, target, supply, temp, 'HeFirst');
      expect(result.safety.o2ServiceRequired).toBe(true);
      expect(result.safety.highPressureWarning).toBe(true);
    });

    it('warns when the He supply pressure is too low to decant', () => {
      const current = { o2: 0.21, he: 0, p: 0, v: 12 };
      const target = { o2: 0.21, he: 0.50, p: 200, v: 12 }; // Tx 21/50
      const lowSupply = { o2P: 300, heP: 50, o2V: 50, heV: 50 }; // Low He supply
      const result = calculateBlending(current, target, lowSupply, temp, 'HeFirst');
      expect(result.warnings.some(w => w.includes('Helium supply drops to'))).toBe(true);
    });

    it('warns when the O2 supply pressure is too low to decant', () => {
      const current = { o2: 0.21, he: 0, p: 0, v: 12 };
      const target = { o2: 0.40, he: 0, p: 200, v: 12 }; // 40% O2 to 200 bar
      const lowSupply = { o2P: 40, heP: 300, o2V: 50, heV: 50 }; // O2 supply only 40 bar
      const result = calculateBlending(current, target, lowSupply, temp, 'O2First');
      expect(result.warnings.some(w => w.includes('Oxygen supply drops to'))).toBe(true);
    });

    it('warns when the supply ends below the cylinder pressure', () => {
      // 50 L He at 150 bar starts above the ~98 bar needed, but decanting pulls it below.
      const current = { o2: 0.21, he: 0, p: 0, v: 24 };
      const target = { o2: 0.18, he: 0.45, p: 230, v: 24 };
      const result = calculateBlending(current, target, { o2P: 200, heP: 150, o2V: 50, heV: 50 }, temp, 'HeFirst');
      const heStep = result.steps.find(s => s.gas === 'He');
      expect(heStep!.supplyRemaining).toBeLessThan(heStep!.pAfter);
      expect(result.warnings.some(w => w.includes('Helium supply drops to') && w.includes('booster required'))).toBe(true);
    });

    it('warns when the supply does not hold enough gas', () => {
      const current = { o2: 0.21, he: 0, p: 0, v: 24 };
      const target = { o2: 0.18, he: 0.45, p: 230, v: 24 };
      const result = calculateBlending(current, target, { o2P: 200, heP: 200, o2V: 50, heV: 10 }, temp, 'HeFirst');
      expect(result.warnings).toContain('Helium supply does not hold enough gas for this fill.');
    });

    it('raises no supply warning when the supply is sufficient', () => {
      const current = { o2: 0.21, he: 0, p: 0, v: 12 };
      const target = { o2: 0.18, he: 0.45, p: 200, v: 12 };
      const result = calculateBlending(current, target, supply, temp, 'HeFirst');
      expect(result.warnings).toHaveLength(0);
    });

    it('handles O2First order correctly', () => {
      const current = { o2: 0.21, he: 0, p: 0, v: 12 };
      const target = { o2: 0.18, he: 0.45, p: 200, v: 12 };
      const result = calculateBlending(current, target, supply, temp, 'O2First');
      expect(result.steps[0].gas).toBe('O2');
      expect(result.steps[1].gas).toBe('He');
      expect(result.steps[2].gas).toBe('Air');
    });
  });

  describe('calculateTopUpResult', () => {
    it('calculates top-up correctly with heat of compression', () => {
      const current = { o2: 0.32, he: 0, p: 100, v: 12 };
      const topUpGas = { o2: 0.21, he: 0, pFinal: 200 };
      const fillTempDelta = 20;
      const result = calculateTopUpResult(current, topUpGas, supply, temp, fillTempDelta);
      
      expect(result.pFinal).toBe(200);
      expect(result.pSettled).toBeLessThan(200);
      expect(result.o2Final).toBeGreaterThan(0.26);
      // Air does not come from the O2 / He supply cylinders.
      expect(result.supplyGas).toBeNull();
      expect(result.remainingSupplyP).toBeNull();
    });

    it('handles top-up when final pressure is less than current', () => {
      const current = { o2: 0.32, he: 0, p: 150, v: 12 };
      const topUpGas = { o2: 0.21, he: 0, pFinal: 100 };
      const result = calculateTopUpResult(current, topUpGas, supply, temp);
      expect(result.pFinal).toBe(100);
      expect(result.o2Final).toBe(0.32);
    });

    it('calculates top-up with Helium correctly', () => {
      const current = { o2: 0.21, he: 0, p: 100, v: 12 };
      const topUpGas = { o2: 0, he: 1.0, pFinal: 200 };
      const result = calculateTopUpResult(current, topUpGas, supply, temp);
      expect(result.heFinal).toBeGreaterThan(0.3);
      expect(result.o2Final).toBeLessThan(0.21);
      expect(result.supplyGas).toBe('He');
      expect(result.remainingSupplyP).toBeLessThan(300);
      expect(result.warnings).toHaveLength(0);
    });

    it('draws a pure O2 top-up from the O2 supply', () => {
      const current = { o2: 0.21, he: 0, p: 100, v: 12 };
      const result = calculateTopUpResult(current, { o2: 1.0, he: 0, pFinal: 130 }, supply, temp);
      expect(result.supplyGas).toBe('O2');
      expect(result.remainingSupplyP).toBeLessThan(300);
    });

    it('does not draw a premixed trimix top-up from the He supply', () => {
      const current = { o2: 0.21, he: 0.35, p: 100, v: 12 };
      const result = calculateTopUpResult(current, { o2: 0.21, he: 0.35, pFinal: 200 }, supply, temp);
      expect(result.supplyGas).toBeNull();
      expect(result.remainingSupplyP).toBeNull();
    });

    it('warns when the supply cannot deliver a pure-gas top-up', () => {
      const current = { o2: 0.21, he: 0, p: 100, v: 12 };
      const lowSupply = { o2P: 300, heP: 150, o2V: 50, heV: 50 };
      const result = calculateTopUpResult(current, { o2: 0, he: 1.0, pFinal: 200 }, lowSupply, temp);
      expect(result.warnings.some(w => w.includes('Helium supply drops to'))).toBe(true);
    });

    it('rejects a final pressure above the maximum', () => {
      const current = { o2: 0.21, he: 0, p: 100, v: 12 };
      const result = calculateTopUpResult(current, { o2: 0.21, he: 0, pFinal: 400 }, supply, temp);
      expect(result.validationErrors).toContain('Final pressure exceeds maximum limit (300 bar)');
      expect(result.o2Final).toBe(0.21);
      expect(result.pSettled).toBe(100);
    });

    it('rejects invalid top-up fractions, volume and temperature', () => {
      const current = { o2: 0.21, he: 0, p: 100, v: 12 };
      expect(calculateTopUpResult(current, { o2: 0.6, he: 0.5, pFinal: 200 }, supply, temp).validationErrors)
        .toContain('O2 + He cannot exceed 100%');
      expect(calculateTopUpResult({ ...current, v: 0 }, { o2: 0.21, he: 0, pFinal: 200 }, supply, temp).validationErrors)
        .toContain('Cylinder volume must be greater than 0 L');
      expect(calculateTopUpResult(current, { o2: 0.21, he: 0, pFinal: 200 }, supply, 60).validationErrors)
        .toContain('Temperature out of safe blending range (-10 to 50°C)');
    });
  });

  describe('calculateMixMetrics', () => {
    it('calculates MOD from ppO2 and O2 fraction', () => {
      // Air (21% O2) at ppO2 1.4: MOD = 10 * (1.4/0.21 - 1)
      const m = calculateMixMetrics(0.21, 0, 1.4, temp);
      expect(m.mod).toBeCloseTo(56.7, 1);
    });

    it('uses the selected ppO2 max', () => {
      const at12 = calculateMixMetrics(0.21, 0, 1.2, temp);
      const at16 = calculateMixMetrics(0.21, 0, 1.6, temp);
      // Higher ppO2 allowance means a deeper MOD.
      expect(at16.mod).toBeGreaterThan(at12.mod);
      expect(at12.mod).toBeCloseTo(47.1, 1);
    });

    it('flags high gas density above the recommended 5.2 g/L limit', () => {
      // Air at ppO2 1.2 -> ~47 m, dense enough to exceed 5.2 g/L.
      const dense = calculateMixMetrics(0.21, 0, 1.2, temp);
      expect(dense.density).toBeGreaterThan(5.2);
      expect(dense.densityWarning).toBe(true);
    });

    it('keeps a helium-rich mix below the density limit at its MOD', () => {
      // Trimix 18/45 has low molar mass thanks to helium.
      const trimix = calculateMixMetrics(0.18, 0.45, 1.2, temp);
      expect(trimix.density).toBeLessThan(5.2);
      expect(trimix.densityWarning).toBe(false);
    });

    it('marks a zero-oxygen mix as having no finite MOD', () => {
      const m = calculateMixMetrics(0, 0.5, 1.2, temp);
      expect(Number.isFinite(m.mod)).toBe(false);
    });
  });
});
