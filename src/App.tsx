import { useState, useMemo, useEffect } from 'react';
import { calculateBlending, calculateTopUpResult, LIMITS } from './logic/calculations';
import type { GasMix, SupplyConfig, BlendingSteps, Step } from './logic/calculations';
import { APP_VERSION } from './version';
import './App.css';

const FEATURES: { icon: string; title: string; text: string }[] = [
  { icon: '🧪', title: 'Van der Waals accuracy', text: 'Real-gas equation of state for precise partial pressures at 200–300 bar, where the ideal gas law drifts off.' },
  { icon: '📋', title: 'Blending Plan', text: 'Step-by-step Helium, Oxygen and Air fills to reach a target mix from your current cylinder contents.' },
  { icon: '➕', title: 'Top-up Simulator', text: 'Predict the final mix and settled pressure when adding a given gas to an existing cylinder.' },
  { icon: '🔀', title: 'Fill order', text: 'Switch between He → O2 → Air and O2 → He → Air sequences to match your filling station.' },
  { icon: '⬇️', title: 'Bleed detection', text: 'Detects when the current contents make the target impossible and calculates the bleed-down pressure.' },
  { icon: '🌡️', title: 'Temperature compensation', text: 'Account for ambient storage temperature and heat of compression during the fill (hot gauge pressure).' },
  { icon: '⚠️', title: 'Safety checks', text: `Flags O2-clean service above ${Math.round(LIMITS.O2_CLEAN_FRACTION * 100)}% O2 and high-pressure fills above ${LIMITS.HIGH_PRESSURE} bar.` },
  { icon: '📱', title: 'Offline PWA', text: 'Install to your home screen and use it without a connection at the dive site or fill station.' },
];

const InfoModal = ({ onClose }: { onClose: () => void }) => (
  <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="info-title" onClick={onClose}>
    <div className="modal-card" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header">
        <h2 id="info-title">About Trimixer</h2>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <p className="modal-intro">
        A gas blending calculator for technical divers, using the Van der Waals equation of state for
        accurate Nitrox and Trimix planning.
      </p>

      <ul className="feature-list">
        {FEATURES.map((f) => (
          <li key={f.title} className="feature-item">
            <span className="feature-icon" aria-hidden="true">{f.icon}</span>
            <div>
              <strong>{f.title}</strong>
              <p>{f.text}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="modal-safety">
        ⚠️ Gas blending is dangerous. Always analyze your final mix with a calibrated O2/He analyzer
        before diving. Never rely solely on software for life-critical calculations.
      </div>

      <div className="modal-version">Version {APP_VERSION}</div>
    </div>
  </div>
);

const MixingChart = ({ initialMix, steps }: { initialMix: { o2: number, he: number }, steps: Step[] }) => {
  const chartWidth = 400;
  const chartHeight = 100;
  const padding = 10;
  
  const data = [
    initialMix,
    ...steps.map(s => s.mixAfter)
  ];

  const pointsHe = data.map((d, i) => `${(i / (data.length - 1)) * (chartWidth - 2 * padding) + padding},${chartHeight - padding - d.he * (chartHeight - 2 * padding)}`).join(' ');
  const pointsO2 = data.map((d, i) => `${(i / (data.length - 1)) * (chartWidth - 2 * padding) + padding},${chartHeight - padding - d.o2 * (chartHeight - 2 * padding)}`).join(' ');

  return (
    <div className="mixing-chart-container">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="mixing-chart">
        {/* Grids */}
        <line x1={padding} y1={chartHeight - padding} x2={chartWidth - padding} y2={chartHeight - padding} stroke="#333" />
        <line x1={padding} y1={padding} x2={padding} y2={chartHeight - padding} stroke="#333" />
        
        {/* Helium Path */}
        <polyline fill="none" stroke="#ff9800" strokeWidth="2" points={pointsHe} />
        {/* Oxygen Path */}
        <polyline fill="none" stroke="#00bcd4" strokeWidth="2" points={pointsO2} />
        
        {/* Dots */}
        {data.map((d, i) => (
          <g key={i}>
            <circle cx={(i / (data.length - 1)) * (chartWidth - 2 * padding) + padding} cy={chartHeight - padding - d.he * (chartHeight - 2 * padding)} r="3" fill="#ff9800" />
            <circle cx={(i / (data.length - 1)) * (chartWidth - 2 * padding) + padding} cy={chartHeight - padding - d.o2 * (chartHeight - 2 * padding)} r="3" fill="#00bcd4" />
          </g>
        ))}
      </svg>
      <div className="chart-legend">
        <span style={{ color: '#00bcd4' }}>● Oxygen (%)</span>
        <span style={{ color: '#ff9800' }}>● Helium (%)</span>
      </div>
    </div>
  );
};

const useLocalStorage = <T,>(key: string, defaultValue: T) => {
  const [value, setValue] = useState<T>(() => {
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return defaultValue;
      }
    }
    return defaultValue;
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
};

function App() {
  const PRESETS: Record<string, { o2: number; he: number; label: string }> = {
    custom: { o2: 0.21, he: 0, label: 'Custom' },
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

  const [mode, setMode] = useState<'plan' | 'topup'>('plan');
  const [showInfo, setShowInfo] = useState(false);
  const [current, setCurrent] = useLocalStorage<GasMix>('trimixer-current', { o2: 0.21, he: 0, p: 0, v: 12 });
  const [target, setTarget] = useLocalStorage<GasMix>('trimixer-target', { o2: 0.21, he: 0, p: 200, v: 12 });
  const [supply, setSupply] = useLocalStorage<SupplyConfig>('trimixer-supply', { o2P: 300, heP: 300, v: 50 });
  const [temp, setTemp] = useLocalStorage<number>('trimixer-temp', 20);
  const [fillTempDelta, setFillTempDelta] = useLocalStorage<number>('trimixer-fill-temp-delta', 0);
  const [order, setOrder] = useLocalStorage<'HeFirst' | 'O2First'>('trimixer-order', 'HeFirst');
  const [topUpGas, setTopUpGas] = useState({ o2: 0.21, he: 0, pFinal: 200 });

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

  const resetInputs = () => {
    if (confirm('Reset all values to default?')) {
      setCurrent({ o2: 0.21, he: 0, p: 0, v: 12 });
      setTarget({ o2: 0.21, he: 0, p: 200, v: 12 });
      setSupply({ o2P: 300, heP: 300, v: 50 });
      setTemp(20);
      setFillTempDelta(0);
      setOrder('HeFirst');
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
              <input id="cfg-temp" type="number" inputMode="decimal" min={LIMITS.TEMP_MIN} max={LIMITS.TEMP_MAX} value={formatInput(temp)} placeholder="20" onChange={(e) => handleInputChange('config', 'temp', e.target.value)} />
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
                <input id="cur-v" type="number" inputMode="decimal" min="0" value={formatInput(current.v)} placeholder="12" onChange={(e) => handleInputChange('current', 'v', e.target.value)} />
              </div>
              <div className="input-group">
                <label htmlFor="cur-p">Initial P (bar)</label>
                <input id="cur-p" type="number" inputMode="decimal" min="0" value={formatInput(current.p)} placeholder="0" onChange={(e) => handleInputChange('current', 'p', e.target.value)} />
              </div>
              <div className="input-group">
                <label htmlFor="cur-o2">Initial O2 (%)</label>
                <input id="cur-o2" type="number" inputMode="decimal" min="0" max="100" value={formatInput(current.o2, true)} placeholder="21" onChange={(e) => handleInputChange('current', 'o2', e.target.value)} />
              </div>
              <div className="input-group">
                <label htmlFor="cur-he">Initial He (%)</label>
                <input id="cur-he" type="number" inputMode="decimal" min="0" max="100" value={formatInput(current.he, true)} placeholder="0" onChange={(e) => handleInputChange('current', 'he', e.target.value)} />
              </div>
            </div>
            <div>
              <h3>Supply Cylinders</h3>
              <div className="input-group">
                <label htmlFor="sup-v">Bottle Size (L)</label>
                <input id="sup-v" type="number" inputMode="decimal" min="0" value={formatInput(supply.v)} placeholder="50" onChange={(e) => handleInputChange('supply', 'v', e.target.value)} />
              </div>
              <div className="input-group">
                <label htmlFor="sup-o2p">O2 Supply P (bar)</label>
                <input id="sup-o2p" type="number" inputMode="decimal" min="0" value={formatInput(supply.o2P)} placeholder="300" onChange={(e) => handleInputChange('supply', 'o2P', e.target.value)} />
              </div>
              <div className="input-group">
                <label htmlFor="sup-hep">He Supply P (bar)</label>
                <input id="sup-hep" type="number" inputMode="decimal" min="0" value={formatInput(supply.heP)} placeholder="300" onChange={(e) => handleInputChange('supply', 'heP', e.target.value)} />
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
                <select id="tgt-preset" className="select-input" onChange={(e) => {
                  const p = PRESETS[e.target.value];
                  if (p) setTarget(prev => ({ ...prev, o2: p.o2, he: p.he }));
                }} defaultValue="custom">
                  {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label htmlFor="tgt-p">Final P (bar)</label>
                <input id="tgt-p" type="number" inputMode="decimal" min="0" max={LIMITS.MAX_PRESSURE} value={formatInput(target.p)} placeholder="200" onChange={(e) => handleInputChange('target', 'p', e.target.value)} />
              </div>
              <div className="input-group">
                <label htmlFor="tgt-o2">Final O2 (%)</label>
                <input id="tgt-o2" type="number" inputMode="decimal" min="0" max="100" value={formatInput(target.o2, true)} placeholder="21" onChange={(e) => handleInputChange('target', 'o2', e.target.value)} />
              </div>
              <div className="input-group">
                <label htmlFor="tgt-he">Final He (%)</label>
                <input id="tgt-he" type="number" inputMode="decimal" min="0" max="100" value={formatInput(target.he, true)} placeholder="0" onChange={(e) => handleInputChange('target', 'he', e.target.value)} />
              </div>
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
                      <h3>Supply Summary ({formatInput(supply.v) || '0'}L)</h3>
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
                <select id="tu-preset" className="select-input" onChange={(e) => {
                  const p = PRESETS[e.target.value];
                  if (p) setTopUpGas(prev => ({ ...prev, o2: p.o2, he: p.he }));
                }} defaultValue="custom">
                  {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label htmlFor="tu-pfinal">Final pressure (bar)</label>
                <input id="tu-pfinal" type="number" inputMode="decimal" min="0" max={LIMITS.MAX_PRESSURE} value={formatInput(topUpGas.pFinal)} placeholder="200" onChange={(e) => handleInputChange('topup', 'pFinal', e.target.value)} />
              </div>
              <div className="input-group">
                <label htmlFor="tu-o2">O2 of Top-up (%)</label>
                <input id="tu-o2" type="number" inputMode="decimal" min="0" max="100" value={formatInput(topUpGas.o2, true)} placeholder="21" onChange={(e) => handleInputChange('topup', 'o2', e.target.value)} />
              </div>
              <div className="input-group">
                <label htmlFor="tu-he">He of Top-up (%)</label>
                <input id="tu-he" type="number" inputMode="decimal" min="0" max="100" value={formatInput(topUpGas.he, true)} placeholder="0" onChange={(e) => handleInputChange('topup', 'he', e.target.value)} />
              </div>
            </section>

            <section className="results-card highlight">
              <h2>Simulation Result</h2>
              {renderSafetyBadges(topUpResult.safety)}
              <div className="summary-banner large">
                <p>Final Pressure: <strong>{topUpResult.pFinal.toFixed(1)} bar</strong></p>
                <p>Final Mix: <strong className="mix-accent">{Math.round(topUpResult.o2Final * 100)}/{Math.round(topUpResult.heFinal * 100)}</strong></p>
                <p className="subtext">Settled (Cooled): {topUpResult.pSettled.toFixed(1)} bar</p>
                <p className="subtext">Remaining Supply: <strong>{topUpResult.remainingSupplyP.toFixed(1)} bar</strong></p>
                <p className="subtext small">Van der Waals calculated at {temp}°C</p>
              </div>
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
