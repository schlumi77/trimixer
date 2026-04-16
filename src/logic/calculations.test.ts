import { describe, it, expect } from 'vitest';
import { calculateBlending, calculateTopUpResult } from './calculations';

describe('Gas Physics Engine (Van der Waals)', () => {
  const supply = { o2P: 300, heP: 300, v: 50 };
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

    it('warns when supply pressure is exceeded', () => {
      const current = { o2: 0.21, he: 0, p: 0, v: 12 };
      const target = { o2: 0.21, he: 0.50, p: 200, v: 12 }; // Tx 21/50
      const lowSupply = { o2P: 300, heP: 50, v: 50 }; // Low He supply
      const result = calculateBlending(current, target, lowSupply, temp, 'HeFirst');
      expect(result.warnings.some(w => w.includes('Helium step exceeds supply pressure'))).toBe(true);
    });

    it('warns when O2 supply pressure is exceeded', () => {
      const current = { o2: 0.21, he: 0, p: 0, v: 12 };
      const target = { o2: 0.40, he: 0, p: 200, v: 12 }; // 40% O2 to 200 bar
      const lowSupply = { o2P: 10, heP: 300, v: 50 }; // O2 supply only 10 bar
      const result = calculateBlending(current, target, lowSupply, temp, 'O2First');
      expect(result.warnings.some(w => w.includes('Oxygen step exceeds supply pressure'))).toBe(true);
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
      expect(result.remainingSupplyP).toBeLessThan(300);
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
    });
  });
});
