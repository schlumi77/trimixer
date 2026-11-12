# Trimixer

Trimixer is a specialized gas blending calculator for technical divers. It uses the **Van der Waals equation of state** to provide highly accurate blending plans for Nitrox and Trimix, accounting for the non-ideal behavior of gases at high pressures.

## 🚀 Features

- **Real-Gas Accuracy**: Van der Waals equation of state with coefficients fitted to NIST reference data; pure-gas pressures match NIST within 0.7% from -10 to 80 °C and up to 350 bar, where the ideal gas law is off by 5–15%.
- **Two Blending Modes**:
  - **Blending Plan**: Calculate the exact amount of Helium and Oxygen needed to reach a target mix from your current cylinder contents.
  - **Top-up Simulator**: Predict the final mix when adding a specific gas to an existing cylinder.
- **Fill Order Optimization**: Choose between `He → O2 → Air` or `O2 → He → Air` sequences.
- **Independent Supply Cylinders**: Configure separate sizes and pressures for the O2 and He supply bottles.
- **Bleed Calculations**: Automatically detects if the current cylinder content makes the target mix impossible and calculates the required bleed-down pressure. A **Confirm bleed done** button then updates the current cylinder pressure in one tap so the plan continues.
- **MOD & Gas Density**: For the target mix, calculates the Maximum Operating Depth from a selectable maximum ppO2 (1.0–1.6 bar) and the breathing-gas density at that depth, warning when density exceeds the recommended 5.2 g/L (and flagging the 6.2 g/L absolute maximum). Hypoxic mixes (ppO2 below 0.18 bar at the surface) are flagged with their minimum operating depth.
- **Temperature Compensation**: Adjust calculations based on the working temperature.
- **Common Presets**: Quick access to standard mixes (Air, EAN32, EAN50, Tx 21/35, Tx 18/45, etc.).
- **PWA Ready**: Can be installed on mobile devices for offline use at the dive site or filling station.

## 🛠 Tech Stack

- **Framework**: React 19 (TypeScript)
- **Bundler**: Vite
- **Styling**: Vanilla CSS (Modern Grid/Flexbox)
- **Mathematical Model**: Van der Waals equation for real gas behavior, with NIST-fitted coefficients.
- **Deployment**: GitHub Pages (via GitHub Actions)

## 📦 Installation & Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/schlumi77/trimixer.git
   cd trimixer
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run development server**:
   ```bash
   npm run dev
   ```
   Add `-- --host` (`npm run dev -- --host`) to open it from a phone on the same network.

4. **Run the test suite**:
   ```bash
   npm test
   ```

5. **Build for production**:
   ```bash
   npm run build
   ```

## 📱 Mobile & Offline Use

Trimixer is a Progressive Web App for use at remote dive sites and filling stations:

- **Install**: open the app in Safari or Chrome, then choose **Share → Add to Home Screen** (iOS) or **Menu → Install app** (Android).
- **Offline**: once installed, it works without an internet connection.

## 🧮 How It Works

- **Real gas model**: Van der Waals equation of state with coefficients fitted to NIST Chemistry WebBook data (−10 to 80 °C, 50 to 350 bar). The attraction term varies with temperature. Mixtures use quadratic mixing for the attraction term and linear mixing for the volume term; mixture results are not validated against measured mixture data.
- **Gauge vs. absolute pressure**: you enter gauge pressures, as read on a cylinder gauge. Calculations add atmospheric pressure (1.013 bar), so the residual air in an "empty" cylinder is accounted for.
- **MOD and gas density**: the MOD uses 10 m per bar with a 1 bar surface, so the absolute pressure at the MOD is `ppO2Max / FO2`. Gas density at that depth is computed with the ideal gas law at the configured temperature.

## 🤖 AI Agents

Guidance for AI coding agents (architecture, conventions, rules for changes) is in [CLAUDE.md](CLAUDE.md).

## ⚠️ Safety Warning

**Gas blending is inherently dangerous.** 

Handling high-pressure oxygen and mixing breathing gases requires specialized training and equipment. This software is provided as a tool for planning purposes only. 

- **Always** analyze your final gas mix with a calibrated oxygen and (if applicable) helium analyzer.
- **Never** dive a gas that you haven't personally analyzed and verified.
- The author(s) of this software are not responsible for any accidents, injuries, or fatalities resulting from the use of this tool.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
