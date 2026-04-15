export interface GasMix {
  o2: number;
  he: number;
  p: number;
  v: number;
}

export interface SupplyConfig {
  o2P: number;
  heP: number;
  v: number;
}

export interface Step {
  name: string;
  addP: number;
  pAfter: number;
  pHot: number;
  mixAfter: { o2: number; he: number };
  supplyRemaining: number;
  gas: 'He' | 'O2' | 'Air' | 'Custom' | 'Bleed';
}

export interface SafetyInfo {
  o2ServiceRequired: boolean;
  highPressureWarning: boolean;
  narcoticDepth?: number;
}

export interface BlendingSteps {
  steps: Step[];
  warnings: string[];
  validationErrors: string[];
  safety: SafetyInfo;
  remainingHeP: number;
  remainingO2P: number;
  bleedRequired?: number;
}

const CONSTANTS = {
  HE: { a: 0.0346, b: 0.0238 },
  O2: { a: 1.382, b: 0.03186 },
  N2: { a: 1.370, b: 0.0387 },
  R: 0.083144,
  P_ATM: 1.01325,
};

function getMixParams(o2: number, he: number) {
  const n2 = Math.max(0, 1 - o2 - he);
  const b = o2 * CONSTANTS.O2.b + he * CONSTANTS.HE.b + n2 * CONSTANTS.N2.b;
  const a_sqrt = o2 * Math.sqrt(CONSTANTS.O2.a) + 
                 he * Math.sqrt(CONSTANTS.HE.a) + 
                 n2 * Math.sqrt(CONSTANTS.N2.a);
  return { a: a_sqrt * a_sqrt, b };
}

function getGaugePressureAtT(n: number, V: number, o2: number, he: number, T: number): number {
  if (n <= 0) return -CONSTANTS.P_ATM;
  const { a, b } = getMixParams(o2, he);
  const Vm = V / n;
  if (Vm <= b) return 999;
  const pAbs = (CONSTANTS.R * T) / (Vm - b) - a / (Vm * Vm);
  return pAbs - CONSTANTS.P_ATM;
}

function getMolesAtT(pGauge: number, V: number, o2: number, he: number, T: number): number {
  const pAbs = pGauge + CONSTANTS.P_ATM;
  if (pAbs <= 0) return 0;
  const { a, b } = getMixParams(o2, he);
  const RT = CONSTANTS.R * T;
  let Vm = RT / pAbs;
  for (let i = 0; i < 20; i++) {
    const f = (pAbs + a / (Vm * Vm)) * (Vm - b) - RT;
    const df = (pAbs - a / (Vm * Vm)) + (2 * a * b) / (Vm * Vm * Vm);
    const nextVm = Vm - f / df;
    if (Math.abs(nextVm - Vm) < 0.000001) { Vm = nextVm; break; }
    Vm = nextVm;
  }
  return V / Vm;
}

export function calculateBlending(
  current: GasMix, 
  target: GasMix, 
  supply: SupplyConfig, 
  tempC: number,
  order: 'HeFirst' | 'O2First',
  fillTempDelta: number = 0
): BlendingSteps {
  const warnings: string[] = [];
  const validationErrors: string[] = [];
  const T = tempC + 273.15;
  const THot = T + fillTempDelta;

  // Safety checks
  const safety: SafetyInfo = {
    o2ServiceRequired: target.o2 > 0.40,
    highPressureWarning: target.p > 232,
  };

  // Bounds Checking
  if (target.o2 + target.he > 1.0) validationErrors.push('O2 + He cannot exceed 100%');
  if (current.o2 + current.he > 1.0) validationErrors.push('Current O2 + He cannot exceed 100%');
  if (target.p > 300) validationErrors.push('Target pressure exceeds maximum limit (300 bar)');
  if (tempC < -10 || tempC > 50) validationErrors.push('Temperature out of safe blending range (-10 to 50°C)');

  if (validationErrors.length > 0) {
    return {
      steps: [],
      warnings: [],
      validationErrors,
      safety,
      remainingHeP: supply.heP,
      remainingO2P: supply.o2P
    };
  }
  
  const nTotal = getMolesAtT(target.p, target.v, target.o2, target.he, T);
  
  const solveForMoles = (pStart: number) => {
    const nStart = getMolesAtT(pStart, current.v, current.o2, current.he, T);
    const nHeTarget = nTotal * target.he;
    const nO2Target = nTotal * target.o2;
    const nN2Target = nTotal * (1 - target.o2 - target.he);
    const nHeStart = nStart * current.he;
    const nO2Start = nStart * current.o2;
    const nN2Start = nStart * (1 - current.o2 - current.he);

    const nHeToAdd = nHeTarget - nHeStart;
    const nN2ToAdd = nN2Target - nN2Start;
    const nAirToAdd = nN2ToAdd / 0.79;
    const nO2FromAir = nAirToAdd * 0.21;
    const nO2ToAdd = nO2Target - nO2Start - nO2FromAir;

    return { nHeToAdd, nO2ToAdd, nAirToAdd, nStart, nHeStart, nO2Start };
  };

  const initialCheck = solveForMoles(current.p);

  // Check if impossible (negative addition required)
  if (initialCheck.nHeToAdd < -0.01 || initialCheck.nO2ToAdd < -0.01 || initialCheck.nAirToAdd < -0.01) {
    let low = 0;
    let high = current.p;
    let bleedP = 0;
    for (let i = 0; i < 20; i++) {
      const mid = (low + high) / 2;
      const check = solveForMoles(mid);
      if (check.nHeToAdd >= -0.01 && check.nO2ToAdd >= -0.01 && check.nAirToAdd >= -0.01) {
        bleedP = mid;
        low = mid;
      } else {
        high = mid;
      }
    }
    return {
      steps: [],
      warnings: [`Desired mix is impossible with current cylinder content. Bleed required.`],
      validationErrors: [],
      safety,
      remainingHeP: supply.heP,
      remainingO2P: supply.o2P,
      bleedRequired: Math.floor(bleedP)
    };
  }

  const { nHeToAdd, nO2ToAdd, nAirToAdd, nStart, nHeStart, nO2Start } = initialCheck;

  let currentN = nStart;
  let currentO2N = nO2Start;
  let currentHeN = nHeStart;
  let currentGaugeP = current.p;
  const steps: Step[] = [];

  const addStep = (gas: 'He' | 'O2' | 'Air', nToAdd: number) => {
    if (nToAdd <= 0.01 && gas !== 'Air') return;
    if (gas === 'He') currentHeN += nToAdd;
    else if (gas === 'O2') currentO2N += nToAdd;
    else currentO2N += nToAdd * 0.21;
    currentN += nToAdd;
    
    const o2Fraction = currentO2N / currentN;
    const heFraction = currentHeN / currentN;
    const pAfterGauge = getGaugePressureAtT(currentN, target.v, o2Fraction, heFraction, T);
    const pHotGauge = getGaugePressureAtT(currentN, target.v, o2Fraction, heFraction, THot);
    
    let supplyLeft = 0;
    if (gas === 'He' || gas === 'O2') {
      const nSupplyInitial = getMolesAtT(gas === 'He' ? supply.heP : supply.o2P, supply.v, gas === 'He' ? 0 : 1.0, gas === 'He' ? 1.0 : 0, T);
      const nSupplyFinal = nSupplyInitial - nToAdd;
      supplyLeft = getGaugePressureAtT(nSupplyFinal, supply.v, gas === 'He' ? 0 : 1.0, gas === 'He' ? 1.0 : 0, T);
    }

    steps.push({
      name: `Add ${gas === 'He' ? 'Helium' : gas === 'O2' ? 'Oxygen' : 'Air'}`,
      addP: pAfterGauge - currentGaugeP,
      pAfter: pAfterGauge,
      pHot: pHotGauge,
      mixAfter: { o2: o2Fraction, he: heFraction },
      supplyRemaining: Math.max(0, supplyLeft),
      gas
    });
    
    if (gas === 'He' && pAfterGauge > supply.heP) warnings.push(`Helium step exceeds supply pressure.`);
    if (gas === 'O2' && pAfterGauge > supply.o2P) warnings.push(`Oxygen step exceeds supply pressure.`);
    currentGaugeP = pAfterGauge;
  };

  if (order === 'HeFirst') {
    addStep('He', nHeToAdd);
    addStep('O2', nO2ToAdd);
  } else {
    addStep('O2', nO2ToAdd);
    addStep('He', nHeToAdd);
  }
  addStep('Air', nAirToAdd);

  const nHeInitialSupply = getMolesAtT(supply.heP, supply.v, 0, 1.0, T);
  const nO2InitialSupply = getMolesAtT(supply.o2P, supply.v, 1.0, 0, T);
  
  return {
    steps,
    warnings,
    validationErrors: [],
    safety,
    remainingHeP: Math.max(0, getGaugePressureAtT(nHeInitialSupply - nHeToAdd, supply.v, 0, 1.0, T)),
    remainingO2P: Math.max(0, getGaugePressureAtT(nO2InitialSupply - nO2ToAdd, supply.v, 1.0, 0, T))
  };
}

export function calculateTopUpResult(
  current: GasMix,
  topUpGas: { o2: number; he: number; pFinal: number },
  supply: SupplyConfig,
  tempC: number,
  fillTempDelta: number = 0
): { pFinal: number; o2Final: number; heFinal: number; pSettled: number; safety: SafetyInfo; remainingSupplyP: number } {
  const T = tempC + 273.15;
  const THot = T + fillTempDelta;
  const nInitial = getMolesAtT(current.p, current.v, current.o2, current.he, T);
  
  // targetHotP is what is seen on the gauge during the fill (hot)
  const targetHotP = topUpGas.pFinal;
  
  if (targetHotP <= current.p) {
    return {
      pFinal: targetHotP,
      o2Final: current.o2,
      heFinal: current.he,
      pSettled: current.p,
      safety: {
        o2ServiceRequired: current.o2 > 0.40,
        highPressureWarning: targetHotP > 232
      },
      remainingSupplyP: topUpGas.he > 0 ? supply.heP : supply.o2P
    };
  }

  // Initial guess for nAdded based on simple Ideal Gas Law delta
  const pDelta = targetHotP - current.p;
  let nAdded = getMolesAtT(pDelta, current.v, topUpGas.o2, topUpGas.he, T);
  let o2Final = 0;
  let heFinal = 0;

  for (let i = 0; i < 20; i++) {
    const totalN = nInitial + nAdded;
    o2Final = (nInitial * current.o2 + nAdded * topUpGas.o2) / totalN;
    heFinal = (nInitial * current.he + nAdded * topUpGas.he) / totalN;
    
    // The gauge shows targetHotP when the tank is at THot
    const pCalcHot = getGaugePressureAtT(totalN, current.v, o2Final, heFinal, THot);
    const diff = targetHotP - pCalcHot;
    if (Math.abs(diff) < 0.001) break;
    // Simple proportional adjustment for next iteration
    nAdded += diff * (current.v / (CONSTANTS.R * THot)); 
  }

  const finalN = nInitial + nAdded;
  const pSettled = getGaugePressureAtT(finalN, current.v, o2Final, heFinal, T);

  // Remaining supply
  const isHeSupply = topUpGas.he > 0;
  const initialP = isHeSupply ? supply.heP : supply.o2P;
  const supplyMix = isHeSupply ? { o2: 0, he: 1.0 } : { o2: topUpGas.o2, he: topUpGas.he }; // Simple assumption
  const nSupplyInitial = getMolesAtT(initialP, supply.v, supplyMix.o2, supplyMix.he, T);
  const nSupplyFinal = nSupplyInitial - nAdded;
  const pRemaining = getGaugePressureAtT(nSupplyFinal, supply.v, supplyMix.o2, supplyMix.he, T);

  return { 
    pFinal: targetHotP, 
    o2Final, 
    heFinal,
    pSettled,
    safety: {
      o2ServiceRequired: o2Final > 0.40,
      highPressureWarning: targetHotP > 232
    },
    remainingSupplyP: Math.max(0, pRemaining)
  };
}
