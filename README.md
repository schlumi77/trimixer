# Trimixer

Trimixer is a specialized gas blending calculator for technical divers. It uses the **Van der Waals equation of state** to provide highly accurate blending plans for Nitrox and Trimix, accounting for the non-ideal behavior of gases at high pressures.

## 🚀 Features

- **Van der Waals Accuracy**: More precise than simple ideal gas law calculators, especially at typical scuba cylinder pressures (200-300 bar).
- **Two Blending Modes**:
  - **Blending Plan**: Calculate the exact amount of Helium and Oxygen needed to reach a target mix from your current cylinder contents.
  - **Top-up Simulator**: Predict the final mix when adding a specific gas to an existing cylinder.
- **Fill Order Optimization**: Choose between `He → O2 → Air` or `O2 → He → Air` sequences.
- **Independent Supply Cylinders**: Configure separate sizes and pressures for the O2 and He supply bottles.
- **Bleed Calculations**: Automatically detects if the current cylinder content makes the target mix impossible and calculates the required bleed-down pressure. A **Confirm bleed done** button then updates the current cylinder pressure in one tap so the plan continues.
- **MOD & Gas Density**: For the target mix, calculates the Maximum Operating Depth from a selectable maximum ppO2 (1.0–1.6 bar) and the breathing-gas density at that depth, warning when density exceeds the recommended 5.2 g/L (and flagging the 6.2 g/L absolute maximum).
- **Temperature Compensation**: Adjust calculations based on the working temperature.
- **Common Presets**: Quick access to standard mixes (Air, EAN32, EAN50, Tx 21/35, Tx 18/45, etc.).
- **PWA Ready**: Can be installed on mobile devices for offline use at the dive site or filling station.

## 🛠 Tech Stack

- **Framework**: React 19 (TypeScript)
- **Bundler**: Vite
- **Styling**: Vanilla CSS (Modern Grid/Flexbox)
- **Mathematical Model**: Van der Waals equation for real gas behavior.
- **Deployment**: GitHub Pages (via GitHub Actions)

## 📦 Installation & Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/trimixer.git
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

4. **Run the test suite**:
   ```bash
   npm test
   ```

5. **Build for production**:
   ```bash
   npm run build
   ```

## ⚠️ Safety Warning

**Gas blending is inherently dangerous.** 

Handling high-pressure oxygen and mixing breathing gases requires specialized training and equipment. This software is provided as a tool for planning purposes only. 

- **Always** analyze your final gas mix with a calibrated oxygen and (if applicable) helium analyzer.
- **Never** dive a gas that you haven't personally analyzed and verified.
- The author(s) of this software are not responsible for any accidents, injuries, or fatalities resulting from the use of this tool.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
