import { describe, it, expect } from 'vitest';
import { calculateBlending, calculateTopUpResult } from './calculations';

describe('Gas Physics Engine (Van der Waals)', () => {
  const supply = { o2P: 300, heP: 300, v: 50 };
  const temp = 20;

  it('calculates correct partial pressures for EAN32', () => {
    const current = { o2: 0.21, he: 0, p: 0, v: 12 };
    const target = { o2: 0.32, he: 0, p: 200, v: 12 };
    const result = calculateBlending(current, target, supply, temp, 'HeFirst');
    
    // EAN32 from 0 to 200 bar
    // Standard Ideal calculation: 
    // Air O2 = 21%, Target O2 = 32%
    // Required O2 = (0.32 - 0.21) / (1.0 - 0.21) * 200 = 27.8 bar
    // Van der Waals will be slightly different but in this range.
    const o2Step = result.steps.find(s => s.gas === 'O2');
    expect(o2Step?.addP).toBeGreaterThan(25);
    expect(o2Step?.addP).toBeLessThan(30);
    expect(result.steps.at(-1)?.pAfter).toBeCloseTo(200, 0);
  });

  it('handles optimized bleed-down logic', () => {
    // Current is 200 bar Air, target is 100 bar Air (impossible without bleed)
    const current = { o2: 0.21, he: 0, p: 200, v: 12 };
    const target = { o2: 0.21, he: 0, p: 100, v: 12 };
    const result = calculateBlending(current, target, supply, temp, 'HeFirst');
    
    expect(result.bleedRequired).toBeDefined();
    // Bleed required should be exactly 100 bar for this simple case
    expect(result.bleedRequired).toBeCloseTo(100, 0);
  });

  it('calculates hot pressure for heat of compression', () => {
    const current = { o2: 0.21, he: 0, p: 0, v: 12 };
    const target = { o2: 0.32, he: 0, p: 200, v: 12 };
    const fillTempDelta = 20; // 20°C increase during fill
    const result = calculateBlending(current, target, supply, temp, 'HeFirst', fillTempDelta);
    
    const lastStep = result.steps.at(-1);
    expect(lastStep).toBeDefined();
    expect(lastStep?.pAfter).toBeCloseTo(200, 0);
    // At higher temperature, the same moles of gas should have higher pressure
    expect(lastStep?.pHot).toBeGreaterThan(lastStep?.pAfter || 0);
  });

  it('calculates top-up correctly', () => {
    const current = { o2: 0.32, he: 0, p: 100, v: 12 };
    const addedGas = { o2: 0.21, he: 0, pToAdd: 100 };
    const result = calculateTopUpResult(current, addedGas, temp);
    
    // 100 bar 32% + 100 bar 21% -> ~200 bar ~26.5%
    expect(result.pFinal).toBe(200);
    expect(result.o2Final).toBeGreaterThan(0.26);
    expect(result.o2Final).toBeLessThan(0.27);
  });

  it('maintains mass balance for Helium', () => {
    const current = { o2: 0.21, he: 0, p: 0, v: 12 };
    const target = { o2: 0.18, he: 0.45, p: 200, v: 12 }; // Tx 18/45
    const result = calculateBlending(current, target, supply, temp, 'HeFirst');
    
    const heStep = result.steps.find(s => s.gas === 'He');
    expect(heStep).toBeDefined();
    expect(result.steps.at(-1)?.mixAfter.he).toBeCloseTo(0.45, 2);
  });
});
