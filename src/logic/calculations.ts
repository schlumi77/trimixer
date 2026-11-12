export interface GasMix {
  o2: number;
  he: number;
  p: number;
  v: number;
}

export interface SupplyConfig {
  o2P: number;
  heP: number;
  o2V: number;
  heV: number;
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

/**
 * Van der Waals coefficients fitted to NIST Chemistry WebBook isotherms
 * (-10 to 80 °C, 50 to 350 bar) rather than the textbook critical-point values,
 * which are several percent off at cylinder pressures. The attraction term is
 * linear in temperature: a(T) = a0 + a1 * (T - 293.15 K), in L²·bar/mol²;
 * b is in L/mol. Pure-gas pressures match NIST within 0.7% over that range.
 */
const CONSTANTS = {
  HE: { a0: 0, a1: 0, b: 0.01148 },
  O2: { a0: 1.0204, a1: -0.001342, b: 0.02666 },
  N2: { a0: 0.8894, a1: -0.001567, b: 0.03217 },
  /** Reference temperature of the a(T) fit (K). */
  T_REF: 293.15,
  R: 0.083144,
  P_ATM: 1.01325,
};

/** Minimum breathable oxygen partial pressure (bar); below it a mix is hypoxic. */
export const PPO2_MIN = 0.18;

/** Selectable maximum oxygen partial pressures for the MOD calculation (bar). */
export const PPO2_MAX_OPTIONS = [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6];

/** Breathing-gas density limits (g/L): recommended working max and absolute max. */
export const DENSITY_LIMIT = {
  RECOMMENDED_MAX: 5.2,
  ABSOLUTE_MAX: 6.2,
};

/** Molar masses of the component gases (g/mol). */
const MOLAR_MASS = { o2: 31.9988, he: 4.0026, n2: 28.0134 };

/** Operational and safety limits used for validation and warnings. */
export const LIMITS = {
  /** Maximum target fill pressure accepted (bar, gauge). */
  MAX_PRESSURE: 300,
  /** Above this gauge pressure a standard-rated cylinder warning is raised (bar). */
  HIGH_PRESSURE: 232,
  /** O2 fraction above which oxygen-clean service is required. */
  O2_CLEAN_FRACTION: 0.4,
  /** Safe ambient blending temperature range (°C). */
  TEMP_MIN: -10,
  TEMP_MAX: 50,
};

/**
 * Gauge pressure returned when the requested gas quantity cannot physically fit
 * in the given volume (molar volume at or below the Van der Waals covolume b).
 * A large sentinel keeps downstream "exceeds pressure" comparisons truthful.
 */
const OVERFULL_PRESSURE = 999;

function getMixParams(o2: number, he: number, T: number) {
  const n2 = Math.max(0, 1 - o2 - he);
  const aAtT = (gas: { a0: number; a1: number }) => Math.max(0, gas.a0 + gas.a1 * (T - CONSTANTS.T_REF));
  const b = o2 * CONSTANTS.O2.b + he * CONSTANTS.HE.b + n2 * CONSTANTS.N2.b;
  const a_sqrt = o2 * Math.sqrt(aAtT(CONSTANTS.O2)) +
                 he * Math.sqrt(aAtT(CONSTANTS.HE)) +
                 n2 * Math.sqrt(aAtT(CONSTANTS.N2));
  return { a: a_sqrt * a_sqrt, b };
}

function getGaugePressureAtT(n: number, V: number, o2: number, he: number, T: number): number {
  if (n <= 0) return -CONSTANTS.P_ATM;
  const { a, b } = getMixParams(o2, he, T);
  const Vm = V / n;
  if (Vm <= b) return OVERFULL_PRESSURE;
  const pAbs = (CONSTANTS.R * T) / (Vm - b) - a / (Vm * Vm);
  return pAbs - CONSTANTS.P_ATM;
}

function getMolesAtT(pGauge: number, V: number, o2: number, he: number, T: number): number {
  const pAbs = pGauge + CONSTANTS.P_ATM;
  if (pAbs <= 0) return 0;
  const { a, b } = getMixParams(o2, he, T);
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

/** Compressibility factor Z = pV / nRT of a mix at an absolute pressure (bar) and temperature (°C). */
export function compressibilityFactor(pAbs: number, o2: number, he: number, tempC: number): number {
  const T = tempC + 273.15;
  const n = getMolesAtT(pAbs - CONSTANTS.P_ATM, 1, o2, he, T);
  return pAbs / (n * CONSTANTS.R * T);
}

/**
 * Decants `nDrawn` moles of a pure gas from its supply cylinder. Returns the
 * supply's remaining gauge pressure and, when the fill cannot be completed
 * without a booster, a warning: either the supply does not hold enough gas, or
 * it would drop below `pCylinder`, the pressure the cylinder has to reach.
 */
function drawFromSupply(
  gas: 'He' | 'O2',
  nDrawn: number,
  supply: SupplyConfig,
  T: number,
  pCylinder: number
): { remainingP: number; warning?: string } {
  const isHe = gas === 'He';
  const name = isHe ? 'Helium' : 'Oxygen';
  const supplyP = isHe ? supply.heP : supply.o2P;
  const supplyV = isHe ? supply.heV : supply.o2V;
  const o2 = isHe ? 0 : 1.0;
  const he = isHe ? 1.0 : 0;

  const nLeft = getMolesAtT(supplyP, supplyV, o2, he, T) - nDrawn;
  const pLeft = getGaugePressureAtT(nLeft, supplyV, o2, he, T);

  if (pLeft < 0) {
    return { remainingP: 0, warning: `${name} supply does not hold enough gas for this fill.` };
  }
  if (pLeft < pCylinder) {
    return {
      remainingP: pLeft,
      warning: `${name} supply drops to ${pLeft.toFixed(0)} bar, below the ${pCylinder.toFixed(0)} bar needed in the cylinder (booster required).`,
    };
  }
  return { remainingP: pLeft };
}

export interface TopUpResult {
  pFinal: number;
  o2Final: number;
  heFinal: number;
  pSettled: number;
  safety: SafetyInfo;
  warnings: string[];
  validationErrors: string[];
  /** Supply cylinder the top-up gas is drawn from; null for air or premixed gas. */
  supplyGas: 'He' | 'O2' | null;
  /** Remaining gauge pressure of that supply cylinder (bar); null when `supplyGas` is null. */
  remainingSupplyP: number | null;
}

/** Fraction above which a top-up gas is treated as pure He / O2 from the supply cylinders. */
const PURE_GAS_FRACTION = 0.995;

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
    o2ServiceRequired: target.o2 > LIMITS.O2_CLEAN_FRACTION,
    highPressureWarning: target.p > LIMITS.HIGH_PRESSURE,
  };

  // Bounds Checking
  if (target.o2 + target.he > 1.0) validationErrors.push('O2 + He cannot exceed 100%');
  if (current.o2 + current.he > 1.0) validationErrors.push('Current O2 + He cannot exceed 100%');
  if (target.o2 < 0 || target.he < 0 || current.o2 < 0 || current.he < 0)
    validationErrors.push('Gas fractions cannot be negative');
  if (target.p > LIMITS.MAX_PRESSURE)
    validationErrors.push(`Target pressure exceeds maximum limit (${LIMITS.MAX_PRESSURE} bar)`);
  if (target.p <= 0) validationErrors.push('Target pressure must be greater than 0 bar');
  if (current.p < 0) validationErrors.push('Current pressure cannot be negative');
  if (current.v <= 0 || target.v <= 0) validationErrors.push('Cylinder volume must be greater than 0 L');
  if (tempC < LIMITS.TEMP_MIN || tempC > LIMITS.TEMP_MAX)
    validationErrors.push(`Temperature out of safe blending range (${LIMITS.TEMP_MIN} to ${LIMITS.TEMP_MAX}°C)`);

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
      const draw = drawFromSupply(gas, nToAdd, supply, T, pHotGauge);
      supplyLeft = draw.remainingP;
      if (draw.warning) warnings.push(draw.warning);
    }

    steps.push({
      name: `Add ${gas === 'He' ? 'Helium' : gas === 'O2' ? 'Oxygen' : 'Air'}`,
      addP: pAfterGauge - currentGaugeP,
      pAfter: pAfterGauge,
      pHot: pHotGauge,
      mixAfter: { o2: o2Fraction, he: heFraction },
      supplyRemaining: supplyLeft,
      gas
    });

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

  const nHeInitialSupply = getMolesAtT(supply.heP, supply.heV, 0, 1.0, T);
  const nO2InitialSupply = getMolesAtT(supply.o2P, supply.o2V, 1.0, 0, T);

  return {
    steps,
    warnings,
    validationErrors: [],
    safety,
    remainingHeP: Math.max(0, getGaugePressureAtT(nHeInitialSupply - nHeToAdd, supply.heV, 0, 1.0, T)),
    remainingO2P: Math.max(0, getGaugePressureAtT(nO2InitialSupply - nO2ToAdd, supply.o2V, 1.0, 0, T))
  };
}

export function calculateTopUpResult(
  current: GasMix,
  topUpGas: { o2: number; he: number; pFinal: number },
  supply: SupplyConfig,
  tempC: number,
  fillTempDelta: number = 0
): TopUpResult {
  const T = tempC + 273.15;
  const THot = T + fillTempDelta;

  // targetHotP is what is seen on the gauge during the fill (hot)
  const targetHotP = topUpGas.pFinal;

  const supplyGas: 'He' | 'O2' | null =
    topUpGas.he >= PURE_GAS_FRACTION ? 'He' : topUpGas.o2 >= PURE_GAS_FRACTION ? 'O2' : null;
  const supplyP = supplyGas === 'He' ? supply.heP : supplyGas === 'O2' ? supply.o2P : null;

  // Result for "nothing added": invalid input, or the cylinder is already at the final pressure.
  const unchanged = (validationErrors: string[]): TopUpResult => ({
    pFinal: targetHotP,
    o2Final: current.o2,
    heFinal: current.he,
    pSettled: current.p,
    safety: {
      o2ServiceRequired: current.o2 > LIMITS.O2_CLEAN_FRACTION,
      highPressureWarning: targetHotP > LIMITS.HIGH_PRESSURE
    },
    warnings: [],
    validationErrors,
    supplyGas,
    remainingSupplyP: supplyP
  });

  const validationErrors: string[] = [];
  if (topUpGas.o2 + topUpGas.he > 1.0) validationErrors.push('O2 + He cannot exceed 100%');
  if (current.o2 + current.he > 1.0) validationErrors.push('Current O2 + He cannot exceed 100%');
  if (topUpGas.o2 < 0 || topUpGas.he < 0 || current.o2 < 0 || current.he < 0)
    validationErrors.push('Gas fractions cannot be negative');
  if (targetHotP > LIMITS.MAX_PRESSURE)
    validationErrors.push(`Final pressure exceeds maximum limit (${LIMITS.MAX_PRESSURE} bar)`);
  if (current.p < 0) validationErrors.push('Current pressure cannot be negative');
  if (current.v <= 0) validationErrors.push('Cylinder volume must be greater than 0 L');
  if (tempC < LIMITS.TEMP_MIN || tempC > LIMITS.TEMP_MAX)
    validationErrors.push(`Temperature out of safe blending range (${LIMITS.TEMP_MIN} to ${LIMITS.TEMP_MAX}°C)`);

  if (validationErrors.length > 0 || targetHotP <= current.p) return unchanged(validationErrors);

  const nInitial = getMolesAtT(current.p, current.v, current.o2, current.he, T);

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

  // Only pure He / O2 comes from the supply cylinders; air and premixes do not.
  const warnings: string[] = [];
  let remainingSupplyP: number | null = null;
  if (supplyGas) {
    const draw = drawFromSupply(supplyGas, nAdded, supply, T, targetHotP);
    remainingSupplyP = draw.remainingP;
    if (draw.warning) warnings.push(draw.warning);
  }

  return { 
    pFinal: targetHotP, 
    o2Final, 
    heFinal,
    pSettled,
    safety: {
      o2ServiceRequired: o2Final > LIMITS.O2_CLEAN_FRACTION,
      highPressureWarning: targetHotP > LIMITS.HIGH_PRESSURE
    },
    warnings,
    validationErrors: [],
    supplyGas,
    remainingSupplyP
  };
}

export interface MixMetrics {
  /** Maximum operating depth (metres of seawater). */
  mod: number;
  /** Absolute ambient pressure at the MOD (bar). */
  pAbsAtMod: number;
  /** Breathing-gas density at the MOD (g/L). */
  density: number;
  /** True when density exceeds the recommended working limit. */
  densityWarning: boolean;
  /** True when density exceeds the absolute limit. */
  densityCritical: boolean;
  /** True when the mix is not breathable at the surface (ppO2 below PPO2_MIN at 1 bar). */
  hypoxic: boolean;
  /** Shallowest depth at which the mix reaches PPO2_MIN (metres of seawater); 0 unless hypoxic. */
  minDepth: number;
}

/**
 * Maximum operating depth and breathing-gas density for a mix.
 *
 * MOD uses the diving convention of 10 m per bar with a 1 bar surface, so the
 * absolute pressure at the MOD equals ppO2Max / FO2. Gas density at that depth
 * is derived from the ideal gas law at temperature `tempC` — the basis on which
 * the 5.2 g/L working and 6.2 g/L absolute density limits are defined.
 *
 * A mix whose ppO2 at the surface is below PPO2_MIN is hypoxic; `minDepth` is
 * the depth at which it first reaches PPO2_MIN.
 */
export function calculateMixMetrics(o2: number, he: number, ppO2Max: number, tempC: number): MixMetrics {
  const T = tempC + 273.15;
  const n2 = Math.max(0, 1 - o2 - he);
  const mMix = o2 * MOLAR_MASS.o2 + he * MOLAR_MASS.he + n2 * MOLAR_MASS.n2;

  // A mix with no oxygen has no finite MOD.
  if (o2 <= 0) {
    return {
      mod: Infinity, pAbsAtMod: Infinity, density: Infinity,
      densityWarning: true, densityCritical: true,
      hypoxic: true, minDepth: Infinity,
    };
  }

  const pAbsAtMod = ppO2Max / o2;
  const mod = Math.max(0, (pAbsAtMod - 1) * 10);
  const density = (mMix * pAbsAtMod) / (CONSTANTS.R * T);

  return {
    mod,
    pAbsAtMod,
    density,
    densityWarning: density > DENSITY_LIMIT.RECOMMENDED_MAX,
    densityCritical: density > DENSITY_LIMIT.ABSOLUTE_MAX,
    hypoxic: o2 < PPO2_MIN,
    minDepth: Math.max(0, (PPO2_MIN / o2 - 1) * 10),
  };
}
