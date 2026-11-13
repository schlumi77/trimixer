import { LIMITS, DENSITY_LIMIT, PPO2_MIN } from '../logic/calculations';
import { APP_VERSION } from '../version';

const FEATURES: { icon: string; title: string; text: string }[] = [
  { icon: '🧪', title: 'Van der Waals accuracy', text: 'Real-gas equation of state with coefficients fitted to NIST reference data, for precise partial pressures at 200–300 bar where the ideal gas law drifts off.' },
  { icon: '📋', title: 'Blending Plan', text: 'Step-by-step Helium, Oxygen and Air fills to reach a target mix from your current cylinder contents.' },
  { icon: '➕', title: 'Top-up Simulator', text: 'Predict the final mix and settled pressure when adding a given gas to an existing cylinder.' },
  { icon: '🔀', title: 'Fill order', text: 'Switch between He → O2 → Air and O2 → He → Air sequences to match your filling station.' },
  { icon: '🛢️', title: 'Supply cylinders', text: 'Separate O2 and He supply sizes and pressures, with a warning when a supply cannot deliver the fill by decanting.' },
  { icon: '⬇️', title: 'Bleed detection', text: 'Detects when the current contents make the target impossible, calculates the bleed-down pressure, and updates the cylinder once you confirm the bleed.' },
  { icon: '📏', title: 'MOD & gas density', text: `Maximum operating depth for a selectable max ppO2, and gas density at that depth with a warning above ${DENSITY_LIMIT.RECOMMENDED_MAX} g/L. Hypoxic mixes (ppO2 below ${PPO2_MIN} bar at the surface) show their minimum depth.` },
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

export default InfoModal;
