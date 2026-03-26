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
  mixAfter: { o2: number; he: number };
  supplyRemaining: number;
  gas: 'He' | 'O2' | 'Air' | 'Custom' | 'Bleed';
}

export interface BlendingSteps {
  steps: Step[];
  warnings: string[];
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
  order: 'HeFirst' | 'O2First'
): BlendingSteps {
  const warnings: string[] = [];
  const T = tempC + 273.15;
  const RT = CONSTANTS.R * T;
  
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

  const { nHeToAdd, nO2ToAdd, nAirToAdd, nStart, nHeStart, nO2Start } = solveForMoles(current.p);

  // Check if impossible (negative addition required)
  if (nHeToAdd < -0.01 || nO2ToAdd < -0.01 || nAirToAdd < -0.01) {
    let bleedP = current.p - 1;
    while (bleedP > 0) {
      const check = solveForMoles(bleedP);
      if (check.nHeToAdd >= -0.01 && check.nO2ToAdd >= -0.01 && check.nAirToAdd >= -0.01) break;
      bleedP -= 1;
    }
    return {
      steps: [],
      warnings: [`Desired mix is impossible with current cylinder content. Bleed required.`],
      remainingHeP: supply.heP,
      remainingO2P: supply.o2P,
      bleedRequired: Math.max(0, bleedP)
    };
  }

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
    
    let supplyLeft = 0;
    if (gas === 'He') supplyLeft = Math.max(0, supply.heP - (nToAdd * RT) / supply.v);
    if (gas === 'O2') supplyLeft = Math.max(0, supply.o2P - (nToAdd * RT) / supply.v);

    steps.push({
      name: `Add ${gas === 'He' ? 'Helium' : gas === 'O2' ? 'Oxygen' : 'Air'}`,
      addP: pAfterGauge - currentGaugeP,
      pAfter: pAfterGauge,
      mixAfter: { o2: o2Fraction, he: heFraction },
      supplyRemaining: supplyLeft,
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

  return {
    steps,
    warnings,
    remainingHeP: Math.max(0, supply.heP - (nHeToAdd * RT) / supply.v),
    remainingO2P: Math.max(0, supply.o2P - (nO2ToAdd * RT) / supply.v)
  };
}

export function calculateTopUpResult(
  current: GasMix,
  addedGas: { o2: number; he: number; pToAdd: number },
  tempC: number
): { pFinal: number; o2Final: number; heFinal: number } {
  const T = tempC + 273.15;
  const nInitial = getMolesAtT(current.p, current.v, current.o2, current.he, T);
  const targetGaugeP = current.p + addedGas.pToAdd;
  let nAdded = getMolesAtT(addedGas.pToAdd, current.v, addedGas.o2, addedGas.he, T);
  let o2Final = 0;
  let heFinal = 0;

  for (let i = 0; i < 10; i++) {
    const totalN = nInitial + nAdded;
    o2Final = (nInitial * current.o2 + nAdded * addedGas.o2) / totalN;
    heFinal = (nInitial * current.he + nAdded * addedGas.he) / totalN;
    const pCalc = getGaugePressureAtT(totalN, current.v, o2Final, heFinal, T);
    const diff = targetGaugeP - pCalc;
    if (Math.abs(diff) < 0.01) break;
    nAdded += diff * (current.v / (CONSTANTS.R * T)); 
  }

  return { pFinal: targetGaugeP, o2Final, heFinal };
}
