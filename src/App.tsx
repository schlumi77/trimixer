import { useState, useMemo } from 'react';
import { calculateBlending, calculateTopUpResult } from './logic/calculations';
import type { GasMix, SupplyConfig, BlendingSteps } from './logic/calculations';
import './App.css';

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
  const [current, setCurrent] = useState<GasMix>({ o2: 0.21, he: 0, p: 0, v: 12 });
  const [target, setTarget] = useState<GasMix>({ o2: 0.21, he: 0, p: 200, v: 12 });
  const [supply, setSupply] = useState<SupplyConfig>({ o2P: 300, heP: 300, v: 50 });
  const [temp, setTemp] = useState<number>(20);
  const [order, setOrder] = useState<'HeFirst' | 'O2First'>('HeFirst');
  const [topUpGas, setTopUpGas] = useState({ o2: 0.21, he: 0, pToAdd: 100 });

  const steps: BlendingSteps = useMemo(() => {
    try {
      return calculateBlending(current, target, supply, temp, order);
    } catch (e) {
      console.error('Calculation error:', e);
      return { steps: [], warnings: ['Error in calculation'], remainingHeP: 0, remainingO2P: 0 };
    }
  }, [current, target, supply, temp, order]);

  const topUpResult = useMemo(() => {
    return calculateTopUpResult(current, topUpGas, temp);
  }, [current, topUpGas, temp]);

  const handleInputChange = (
    section: 'current' | 'target' | 'supply' | 'config' | 'topup',
    field: string,
    value: string
  ) => {
    const val = value === '' ? 0 : parseFloat(value);
    if (section === 'current') setCurrent(prev => ({ ...prev, [field]: (field === 'p' || field === 'v') ? val : val / 100 }));
    else if (section === 'target') setTarget(prev => ({ ...prev, [field]: (field === 'p' || field === 'v') ? val : val / 100 }));
    else if (section === 'supply') setSupply(prev => ({ ...prev, [field]: val }));
    else if (section === 'topup') setTopUpGas(prev => ({ ...prev, [field]: (field === 'pToAdd') ? val : val / 100 }));
    else if (field === 'temp') setTemp(val);
  };

  const formatInput = (val: number, isPercent: boolean = false) => {
    const d = isPercent ? val * 100 : val;
    return d === 0 ? '' : d.toString();
  };

  return (
    <div className="app-container">
      <header>
        <h1>Trimixer v1.2</h1>
        <div className="mode-toggle">
          <button className={mode === 'plan' ? 'active' : ''} onClick={() => setMode('plan')}>Blending Plan</button>
          <button className={mode === 'topup' ? 'active' : ''} onClick={() => setMode('topup')}>Top-up Simulator</button>
        </div>
      </header>

      <main className="grid">
        <section className="input-card">
          <h2>Environmental & Config</h2>
          <div className="input-group">
            <label>Temperature (°C)</label>
            <input type="number" value={formatInput(temp)} placeholder="20" onChange={(e) => handleInputChange('config', 'temp', e.target.value)} />
          </div>
          {mode === 'plan' && (
            <div className="input-group">
              <label>Fill Order</label>
              <select value={order} onChange={(e) => setOrder(e.target.value as 'HeFirst' | 'O2First')} className="select-input">
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
                <label>Size (L)</label>
                <input type="number" value={formatInput(current.v)} placeholder="12" onChange={(e) => handleInputChange('current', 'v', e.target.value)} />
              </div>
              <div className="input-group">
                <label>Initial P (bar)</label>
                <input type="number" value={formatInput(current.p)} placeholder="0" onChange={(e) => handleInputChange('current', 'p', e.target.value)} />
              </div>
              <div className="input-group">
                <label>Initial O2 (%)</label>
                <input type="number" value={formatInput(current.o2, true)} placeholder="21" onChange={(e) => handleInputChange('current', 'o2', e.target.value)} />
              </div>
              <div className="input-group">
                <label>Initial He (%)</label>
                <input type="number" value={formatInput(current.he, true)} placeholder="0" onChange={(e) => handleInputChange('current', 'he', e.target.value)} />
              </div>
            </div>
            <div>
              <h3>Supply (50L Bottles)</h3>
              <div className="input-group">
                <label>Bottle Size (L)</label>
                <input type="number" value={formatInput(supply.v)} placeholder="50" onChange={(e) => handleInputChange('supply', 'v', e.target.value)} />
              </div>
              <div className="input-group">
                <label>O2 Supply P (bar)</label>
                <input type="number" value={formatInput(supply.o2P)} placeholder="300" onChange={(e) => handleInputChange('supply', 'o2P', e.target.value)} />
              </div>
              <div className="input-group">
                <label>He Supply P (bar)</label>
                <input type="number" value={formatInput(supply.heP)} placeholder="300" onChange={(e) => handleInputChange('supply', 'heP', e.target.value)} />
              </div>
            </div>
          </div>
        </section>

        {mode === 'plan' ? (
          <>
            <section className="input-card">
              <h2>Target Mix</h2>
              <div className="input-group">
                <label>Preset</label>
                <select className="select-input" onChange={(e) => {
                  const p = PRESETS[e.target.value];
                  if (p) setTarget(prev => ({ ...prev, o2: p.o2, he: p.he }));
                }} defaultValue="custom">
                  {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label>Final P (bar)</label>
                <input type="number" value={formatInput(target.p)} placeholder="200" onChange={(e) => handleInputChange('target', 'p', e.target.value)} />
              </div>
              <div className="input-group">
                <label>Final O2 (%)</label>
                <input type="number" value={formatInput(target.o2, true)} placeholder="21" onChange={(e) => handleInputChange('target', 'o2', e.target.value)} />
              </div>
              <div className="input-group">
                <label>Final He (%)</label>
                <input type="number" value={formatInput(target.he, true)} placeholder="0" onChange={(e) => handleInputChange('target', 'he', e.target.value)} />
              </div>
            </section>

            <section className="results-card">
              <h2>Blending Plan</h2>
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
                  {steps.steps.map((s, i) => (
                    <div key={i} className="result-step">
                      <span className="step-number">{i + 1}</span>
                      <div className="step-content">
                        <strong>{s.name}</strong>
                        <p>Add <span>{s.addP.toFixed(1)} bar</span> to reach <strong>{s.pAfter.toFixed(1)} bar</strong></p>
                        <p className="mix-info">{Math.round(s.mixAfter.o2 * 100)}/{Math.round(s.mixAfter.he * 100)} (O2/He)</p>
                        {(s.gas === 'He' || s.gas === 'O2') && (
                          <p className="subtext">Supply remaining: <strong>{s.supplyRemaining.toFixed(1)} bar</strong></p>
                        )}
                      </div>
                    </div>
                  ))}

                  <div className="summary-banner">
                    <h3>Supply Summary (50L)</h3>
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
                </>
              )}
            </section>
          </>
        ) : (
          <>
            <section className="input-card">
              <h2>Gas to Add</h2>
              <div className="input-group">
                <label>Preset</label>
                <select className="select-input" onChange={(e) => {
                  const p = PRESETS[e.target.value];
                  if (p) setTopUpGas(prev => ({ ...prev, o2: p.o2, he: p.he }));
                }} defaultValue="custom">
                  {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label>P to Add (bar)</label>
                <input type="number" value={formatInput(topUpGas.pToAdd)} placeholder="100" onChange={(e) => handleInputChange('topup', 'pToAdd', e.target.value)} />
              </div>
              <div className="input-group">
                <label>O2 of Top-up (%)</label>
                <input type="number" value={formatInput(topUpGas.o2, true)} placeholder="21" onChange={(e) => handleInputChange('topup', 'o2', e.target.value)} />
              </div>
              <div className="input-group">
                <label>He of Top-up (%)</label>
                <input type="number" value={formatInput(topUpGas.he, true)} placeholder="0" onChange={(e) => handleInputChange('topup', 'he', e.target.value)} />
              </div>
            </section>

            <section className="results-card highlight">
              <h2>Simulation Result</h2>
              <div className="summary-banner large">
                <p>Final Pressure: <strong>{topUpResult.pFinal.toFixed(1)} bar</strong></p>
                <p>Final Mix: <strong className="mix-accent">{Math.round(topUpResult.o2Final * 100)}/{Math.round(topUpResult.heFinal * 100)}</strong></p>
                <p className="subtext">Van der Waals calculated at {temp}°C</p>
              </div>
            </section>
          </>
        )}
      </main>

      <footer>
        <p>Warning: Gas blending is dangerous. Always analyze and double check. (Version 1.2)</p>
      </footer>
    </div>
  );
}

export default App;
