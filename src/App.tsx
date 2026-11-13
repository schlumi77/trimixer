import { useState, useMemo, useEffect } from 'react';
import { calculateBlending, calculateTopUpResult, calculateMixMetrics, LIMITS, PPO2_MAX_OPTIONS, PPO2_MIN, DENSITY_LIMIT } from './logic/calculations';
import type { GasMix, SupplyConfig, BlendingSteps } from './logic/calculations';
import { APP_VERSION } from './version';
import { useLocalStorage } from './hooks/useLocalStorage';
import { PRESETS, CUSTOM_PRESET, matchPreset } from './presets';
import InfoModal from './components/InfoModal';
import MixingChart from './components/MixingChart';
import './App.css';

/** Initial values, also restored by the reset button. */
const DEFAULTS = {
  current: { o2: 0.21, he: 0, p: 0, v: 12 } as GasMix,
  target: { o2: 0.21, he: 0, p: 200, v: 12 } as GasMix,
  supply: { o2P: 300, heP: 300, o2V: 50, heV: 50 } as SupplyConfig,
  temp: 20,
  fillTempDelta: 0,
  order: 'HeFirst' as 'HeFirst' | 'O2First',
  ppO2Max: 1.2,
  topUpGas: { o2: 0.21, he: 0, pFinal: 200 },
};

function App() {
  const [mode, setMode] = useState<'plan' | 'topup'>('plan');
  const [showInfo, setShowInfo] = useState(false);
  const [current, setCurrent] = useLocalStorage<GasMix>('trimixer-current', DEFAULTS.current);
  const [target, setTarget] = useLocalStorage<GasMix>('trimixer-target', DEFAULTS.target);
  const [supply, setSupply] = useLocalStorage<SupplyConfig>('trimixer-supply', DEFAULTS.supply);
  const [temp, setTemp] = useLocalStorage<number>('trimixer-temp', DEFAULTS.temp);
  const [fillTempDelta, setFillTempDelta] = useLocalStorage<number>('trimixer-fill-temp-delta', DEFAULTS.fillTempDelta);
  const [order, setOrder] = useLocalStorage<'HeFirst' | 'O2First'>('trimixer-order', DEFAULTS.order);
  const [ppO2Max, setPpO2Max] = useLocalStorage<number>('trimixer-ppo2max', DEFAULTS.ppO2Max);
  const [topUpGas, setTopUpGas] = useState(DEFAULTS.topUpGas);

  // Migrate legacy supply config that used a single shared bottle volume `v`.
  useEffect(() => {
    const legacy = supply as SupplyConfig & { v?: number };
    if (legacy.v !== undefined && (legacy.o2V === undefined || legacy.heV === undefined)) {
      setSupply({ o2P: legacy.o2P, heP: legacy.heP, o2V: legacy.o2V ?? legacy.v, heV: legacy.heV ?? legacy.v });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!showInfo) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowInfo(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showInfo]);

  const steps: BlendingSteps = useMemo(() => {
    try {
      return calculateBlending(current, target, supply, temp, order, fillTempDelta);
    } catch (e) {
      console.error('Calculation error:', e);
      return { 
        steps: [], 
        warnings: ['Error in calculation'], 
        validationErrors: [], 
        safety: { o2ServiceRequired: false, highPressureWarning: false },
        remainingHeP: 0, 
        remainingO2P: 0 
      };
    }
  }, [current, target, supply, temp, order, fillTempDelta]);

  const topUpResult = useMemo(() => {
    return calculateTopUpResult(current, topUpGas, supply, temp, fillTempDelta);
  }, [current, topUpGas, supply, temp, fillTempDelta]);

  const targetMetrics = useMemo(() => {
    return calculateMixMetrics(target.o2, target.he, ppO2Max, temp);
  }, [target.o2, target.he, ppO2Max, temp]);

  const handleInputChange = (
    section: 'current' | 'target' | 'supply' | 'config' | 'topup',
    field: string,
    value: string
  ) => {
    const val = value === '' ? 0 : parseFloat(value);
    if (Number.isNaN(val)) return;

    // Temperature may be negative; every other field must be non-negative.
    if (field !== 'temp' && val < 0) return;
    // Fraction validation (0-100%)
    if ((field === 'o2' || field === 'he') && val > 100) return;

    if (section === 'current') {
      if (field === 'o2' && (val / 100 + current.he > 1.0)) return;
      if (field === 'he' && (val / 100 + current.o2 > 1.0)) return;
      setCurrent(prev => ({ ...prev, [field]: (field === 'p' || field === 'v') ? val : val / 100 }));
      if (field === 'v') {
        setTarget(prev => ({ ...prev, v: val }));
      }
    }
    else if (section === 'target') {
      if (field === 'o2' && (val / 100 + target.he > 1.0)) return;
      if (field === 'he' && (val / 100 + target.o2 > 1.0)) return;
      setTarget(prev => ({ ...prev, [field]: (field === 'p' || field === 'v') ? val : val / 100 }));
    }
    else if (section === 'supply') setSupply(prev => ({ ...prev, [field]: val }));
    else if (section === 'topup') {
      if (field === 'o2' && (val / 100 + topUpGas.he > 1.0)) return;
      if (field === 'he' && (val / 100 + topUpGas.o2 > 1.0)) return;
      setTopUpGas(prev => ({ ...prev, [field]: (field === 'pFinal') ? val : val / 100 }));
    }
    else if (field === 'temp') setTemp(val);
    else if (field === 'fillTempDelta') setFillTempDelta(val);
  };

  const formatInput = (val: number, isPercent: boolean = false) => {
    const d = isPercent ? val * 100 : val;
    // Fix floating point precision issues (e.g., 0.07 * 100 = 7.000000000000001)
    const rounded = Math.round(d * 1e10) / 1e10;
    return rounded === 0 ? '' : rounded.toString();
  };

  const renderSafetyBadges = (safety: { o2ServiceRequired: boolean; highPressureWarning: boolean }) => {
    return (
      <div className="safety-badges">
        {safety.o2ServiceRequired && (
          <span className="badge danger">⚠️ O2 CLEAN REQUIRED ({'>'}{Math.round(LIMITS.O2_CLEAN_FRACTION * 100)}% O2)</span>
        )}
        {safety.highPressureWarning && (
          <span className="badge warning">⚠️ HIGH PRESSURE ({'>'}{LIMITS.HIGH_PRESSURE} BAR)</span>
        )}
      </div>
    );
  };

  // Bleeding removes gas proportionally, so the mix is unchanged — only the
  // current cylinder pressure drops to the calculated bleed-down value.
  const confirmBleed = (bleedP: number) => {
    setCurrent(prev => ({ ...prev, p: bleedP }));
  };

  const resetInputs = () => {
    if (confirm('Reset all values to default?')) {
      setCurrent(DEFAULTS.current);
      setTarget(DEFAULTS.target);
      setSupply(DEFAULTS.supply);
      setTemp(DEFAULTS.temp);
      setFillTempDelta(DEFAULTS.fillTempDelta);
      setOrder(DEFAULTS.order);
      setPpO2Max(DEFAULTS.ppO2Max);
      setTopUpGas(DEFAULTS.topUpGas);
    }
  };

  return (
    <div className="app-container">
      <header>
        <div className="header-top">
          <button className="reset-button" onClick={() => setShowInfo(true)} title="About Trimixer" aria-label="About Trimixer">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5" strokeLinecap="round" />
              <path d="M12 7.5h.01" strokeLinecap="round" />
            </svg>
          </button>
          <h1>Trimixer</h1>
          <button className="reset-button" onClick={resetInputs} title="Reset all inputs">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
        <div className="mode-toggle">
          <button className={mode === 'plan' ? 'active' : ''} onClick={() => setMode('plan')}>Blending Plan</button>
          <button className={mode === 'topup' ? 'active' : ''} onClick={() => setMode('topup')}>Top-up Simulator</button>
        </div>
      </header>

      <main className="grid">
        <section className="input-card">
          <h2>Environmental & Config</h2>
          <div className="grid">
            <div className="input-group">
              <label htmlFor="cfg-temp">Storage Temp (°C)</label>
              <input id="cfg-temp" type="number" inputMode="decimal" min={LIMITS.TEMP_MIN} max={LIMITS.TEMP_MAX} value={formatInput(temp)} placeholder="0" onChange={(e) => handleInputChange('config', 'temp', e.target.value)} />
            </div>
            <div className="input-group">
              <label htmlFor="cfg-fill-delta">Fill Temp Increase (Δ°C)</label>
              <input id="cfg-fill-delta" type="number" inputMode="decimal" min="0" value={formatInput(fillTempDelta)} placeholder="0" onChange={(e) => handleInputChange('config', 'fillTempDelta', e.target.value)} />
            </div>
          </div>
          {mode === 'plan' && (
            <div className="input-group">
              <label htmlFor="cfg-order">Fill Order</label>
              <select id="cfg-order" value={order} onChange={(e) => setOrder(e.target.value as 'HeFirst' | 'O2First')} className="select-input">
                <option value="HeFirst">He → O2 → Air</option>
                <option value="O2First">O2 → He → Air</option>
              </select>
            </div>
          )}
        </section>

        <section className="input-card">
          <h2>Cylinder Configuration</h2>
          <div className="grid">
            <div>
              <h3>Target Cylinder</h3>
              <div className="input-group">
                <label htmlFor="cur-v">Size (L)</label>
                <input id="cur-v" type="number" inputMode="decimal" min="0" value={formatInput(current.v)} placeholder="0" onChange={(e) => handleInputChange('current', 'v', e.target.value)} />
              </div>
              <div className="input-group">
                <label htmlFor="cur-p">Initial P (bar)</label>
                <input id="cur-p" type="number" inputMode="decimal" min="0" value={formatInput(current.p)} placeholder="0" onChange={(e) => handleInputChange('current', 'p', e.target.value)} />
              </div>
              <div className="input-group">
                <label htmlFor="cur-o2">Initial O2 (%)</label>
                <input id="cur-o2" type="number" inputMode="decimal" min="0" max="100" value={formatInput(current.o2, true)} placeholder="0" onChange={(e) => handleInputChange('current', 'o2', e.target.value)} />
              </div>
              <div className="input-group">
                <label htmlFor="cur-he">Initial He (%)</label>
                <input id="cur-he" type="number" inputMode="decimal" min="0" max="100" value={formatInput(current.he, true)} placeholder="0" onChange={(e) => handleInputChange('current', 'he', e.target.value)} />
              </div>
            </div>
            <div>
              <h3>Supply Cylinders</h3>
              <div className="input-group">
                <label htmlFor="sup-o2v">O2 Supply Size (L)</label>
                <input id="sup-o2v" type="number" inputMode="decimal" min="0" value={formatInput(supply.o2V)} placeholder="0" onChange={(e) => handleInputChange('supply', 'o2V', e.target.value)} />
              </div>
              <div className="input-group">
                <label htmlFor="sup-o2p">O2 Supply P (bar)</label>
                <input id="sup-o2p" type="number" inputMode="decimal" min="0" value={formatInput(supply.o2P)} placeholder="0" onChange={(e) => handleInputChange('supply', 'o2P', e.target.value)} />
              </div>
              <div className="input-group">
                <label htmlFor="sup-hev">He Supply Size (L)</label>
                <input id="sup-hev" type="number" inputMode="decimal" min="0" value={formatInput(supply.heV)} placeholder="0" onChange={(e) => handleInputChange('supply', 'heV', e.target.value)} />
              </div>
              <div className="input-group">
                <label htmlFor="sup-hep">He Supply P (bar)</label>
                <input id="sup-hep" type="number" inputMode="decimal" min="0" value={formatInput(supply.heP)} placeholder="0" onChange={(e) => handleInputChange('supply', 'heP', e.target.value)} />
              </div>
            </div>
          </div>
        </section>

        {mode === 'plan' ? (
          <>
            <section className="input-card">
              <h2>Target Mix</h2>
              <div className="input-group">
                <label htmlFor="tgt-preset">Preset</label>
                <select id="tgt-preset" className="select-input" value={matchPreset(target.o2, target.he)} onChange={(e) => {
                  const p = PRESETS[e.target.value];
                  if (p) setTarget(prev => ({ ...prev, o2: p.o2, he: p.he }));
                }}>
                  <option value={CUSTOM_PRESET}>Custom</option>
                  {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label htmlFor="tgt-p">Final P (bar)</label>
                <input id="tgt-p" type="number" inputMode="decimal" min="0" max={LIMITS.MAX_PRESSURE} value={formatInput(target.p)} placeholder="0" onChange={(e) => handleInputChange('target', 'p', e.target.value)} />
              </div>
              <div className="input-group">
                <label htmlFor="tgt-o2">Final O2 (%)</label>
                <input id="tgt-o2" type="number" inputMode="decimal" min="0" max="100" value={formatInput(target.o2, true)} placeholder="0" onChange={(e) => handleInputChange('target', 'o2', e.target.value)} />
              </div>
              <div className="input-group">
                <label htmlFor="tgt-he">Final He (%)</label>
                <input id="tgt-he" type="number" inputMode="decimal" min="0" max="100" value={formatInput(target.he, true)} placeholder="0" onChange={(e) => handleInputChange('target', 'he', e.target.value)} />
              </div>
              <div className="input-group">
                <label htmlFor="tgt-ppo2">Max ppO2 (bar)</label>
                <select id="tgt-ppo2" className="select-input" value={ppO2Max} onChange={(e) => setPpO2Max(parseFloat(e.target.value))}>
                  {PPO2_MAX_OPTIONS.map(v => <option key={v} value={v}>{v.toFixed(1)}</option>)}
                </select>
              </div>
              <div className="mod-metrics">
                <div className="metric">
                  <span className="metric-label">MOD</span>
                  <span className="metric-value">{Number.isFinite(targetMetrics.mod) ? `${Math.floor(targetMetrics.mod)} m` : '—'}</span>
                </div>
                <div className={`metric${targetMetrics.densityWarning ? ' metric-warn' : ''}`}>
                  <span className="metric-label">Density @ MOD</span>
                  <span className="metric-value">{Number.isFinite(targetMetrics.density) ? `${targetMetrics.density.toFixed(1)} g/L` : '—'}</span>
                </div>
              </div>
              {targetMetrics.hypoxic && (
                <div className="error-banner">
                  ⚠️ Hypoxic mix: not breathable at the surface.
                  {Number.isFinite(targetMetrics.minDepth) ? ` Minimum depth ${Math.ceil(targetMetrics.minDepth - 1e-9)} m (ppO2 ${PPO2_MIN} bar).` : ''}
                </div>
              )}
              {targetMetrics.densityWarning && Number.isFinite(targetMetrics.density) && (
                <div className="warning-banner">
                  ⚠️ Gas density {targetMetrics.density.toFixed(1)} g/L exceeds the recommended {DENSITY_LIMIT.RECOMMENDED_MAX} g/L limit
                  {targetMetrics.densityCritical ? ` (above the ${DENSITY_LIMIT.ABSOLUTE_MAX} g/L absolute maximum)` : ''}.
                </div>
              )}
            </section>


            <section className="results-card">
              <h2>Blending Plan</h2>
              {steps.validationErrors.map((err, i) => <div key={i} className="error-banner">❌ {err}</div>)}
              {steps.validationErrors.length === 0 && renderSafetyBadges(steps.safety)}
              {steps.warnings.map((w, i) => <div key={i} className="warning-banner">⚠️ {w}</div>)}
              
              {steps.bleedRequired !== undefined ? (
                <div className="bleed-instruction">
                  <div className="bleed-icon">⬇️</div>
                  <div className="bleed-text">
                    <h3>Bleed Required</h3>
                    <p>Cylinder contains too much Oxygen or Helium.</p>
                    <p>Bleed down to <strong>{steps.bleedRequired.toFixed(0)} bar</strong> before starting.</p>
                    <button className="confirm-bleed-button" onClick={() => confirmBleed(steps.bleedRequired!)}>
                      Confirm bleed done ({steps.bleedRequired.toFixed(0)} bar)
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {steps.steps.length > 0 && <MixingChart initialMix={current} steps={steps.steps} />}
                  {steps.steps.map((s, i) => (
                    <div key={i} className="result-step">
                      <span className="step-number">{i + 1}</span>
                      <div className="step-content">
                        <strong>{s.name}</strong>
                        <p>Add <span>{s.addP.toFixed(1)} bar</span></p>
                        <p>Settled: <strong>{s.pAfter.toFixed(1)} bar</strong></p>
                        {fillTempDelta > 0 && (
                          <p className="hot-pressure">FILL GAUGE: <strong>{s.pHot.toFixed(1)} bar</strong></p>
                        )}
                        <p className="mix-info">{Math.round(s.mixAfter.o2 * 100)}/{Math.round(s.mixAfter.he * 100)} (O2/He)</p>
                        {(s.gas === 'He' || s.gas === 'O2') && (
                          <p className="subtext">Supply remaining: <strong>{s.supplyRemaining.toFixed(1)} bar</strong></p>
                        )}
                      </div>
                    </div>
                  ))}

                  {steps.steps.length > 0 && (
                    <div className="summary-banner">
                      <h3>Supply Summary (O2 {formatInput(supply.o2V) || '0'}L / He {formatInput(supply.heV) || '0'}L)</h3>
                      <div className="grid">
                        <div>
                          <p className="subtext">Remaining Helium</p>
                          <p><strong>{steps.remainingHeP.toFixed(1)} bar</strong></p>
                        </div>
                        <div>
                          <p className="subtext">Remaining Oxygen</p>
                          <p><strong>{steps.remainingO2P.toFixed(1)} bar</strong></p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        ) : (
          <>
            <section className="input-card">
              <h2>Gas to Add</h2>
              <div className="input-group">
                <label htmlFor="tu-preset">Preset</label>
                <select id="tu-preset" className="select-input" value={matchPreset(topUpGas.o2, topUpGas.he)} onChange={(e) => {
                  const p = PRESETS[e.target.value];
                  if (p) setTopUpGas(prev => ({ ...prev, o2: p.o2, he: p.he }));
                }}>
                  <option value={CUSTOM_PRESET}>Custom</option>
                  {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label htmlFor="tu-pfinal">Final pressure (bar)</label>
                <input id="tu-pfinal" type="number" inputMode="decimal" min="0" max={LIMITS.MAX_PRESSURE} value={formatInput(topUpGas.pFinal)} placeholder="0" onChange={(e) => handleInputChange('topup', 'pFinal', e.target.value)} />
              </div>
              <div className="input-group">
                <label htmlFor="tu-o2">O2 of Top-up (%)</label>
                <input id="tu-o2" type="number" inputMode="decimal" min="0" max="100" value={formatInput(topUpGas.o2, true)} placeholder="0" onChange={(e) => handleInputChange('topup', 'o2', e.target.value)} />
              </div>
              <div className="input-group">
                <label htmlFor="tu-he">He of Top-up (%)</label>
                <input id="tu-he" type="number" inputMode="decimal" min="0" max="100" value={formatInput(topUpGas.he, true)} placeholder="0" onChange={(e) => handleInputChange('topup', 'he', e.target.value)} />
              </div>
            </section>

            <section className="results-card highlight">
              <h2>Simulation Result</h2>
              {topUpResult.validationErrors.map((err, i) => <div key={i} className="error-banner">❌ {err}</div>)}
              {topUpResult.validationErrors.length === 0 && (
                <>
                  {renderSafetyBadges(topUpResult.safety)}
                  {topUpResult.warnings.map((w, i) => <div key={i} className="warning-banner">⚠️ {w}</div>)}
                  <div className="summary-banner large">
                    <p>Final Pressure: <strong>{topUpResult.pFinal.toFixed(1)} bar</strong></p>
                    <p>Final Mix: <strong className="mix-accent">{Math.round(topUpResult.o2Final * 100)}/{Math.round(topUpResult.heFinal * 100)}</strong></p>
                    <p className="subtext">Settled (Cooled): {topUpResult.pSettled.toFixed(1)} bar</p>
                    {topUpResult.supplyGas && topUpResult.remainingSupplyP !== null && (
                      <p className="subtext">Remaining {topUpResult.supplyGas} Supply: <strong>{topUpResult.remainingSupplyP.toFixed(1)} bar</strong></p>
                    )}
                    <p className="subtext small">Van der Waals calculated at {temp}°C</p>
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </main>

      <footer>
        <p>Warning: Gas blending is dangerous. Always analyze and double check. (Version {APP_VERSION})</p>
      </footer>

      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
    </div>
  );
}

export default App;
