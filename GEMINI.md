# Trimixer - High Precision Gas Blender

Trimixer is a professional-grade, reactive web application designed for technical divers. It calculates complex Nitrox and Trimix fillings using the partial pressure method, powered by real-world physics and offline-first capabilities.

## Project Overview
- **Purpose:** Calculate partial pressures for Helium, Oxygen, and Air top-ups, with support for bleed-down logic and top-up simulations.
- **Key Features:**
  - **Van der Waals Equation of State:** Coefficients fitted to NIST reference data, accounting for gas compressibility at pressures up to 300 bar.
  - **Temperature Compensation:** Real-time adjustments based on ambient blending temperature.
  - **Bleed-Down Intelligence:** Automatically calculates the required pressure to bleed an existing cylinder to reach a target mix, with a one-tap confirmation that updates the current cylinder pressure to the bleed-down value.
  - **Top-up Simulator:** Predicts the resulting mixture when adding a specific pressure of gas to an existing cylinder.
  - **Independent Supply Cylinders:** Separate size and pressure inputs for the O2 and He supply bottles.
  - **MOD & Gas Density:** Derives the Maximum Operating Depth from a selectable maximum ppO2 (1.0–1.6 bar) and the breathing-gas density at that depth, warning above the recommended 5.2 g/L working limit and the 6.2 g/L absolute maximum. Hypoxic mixes (ppO2 below 0.18 bar at the surface) are flagged with their minimum operating depth.
  - **PWA Support:** Works completely offline on mobile devices (iPhone/Android) when added to the home screen.

## Technologies
- **Frontend:** React (v19) + TypeScript
- **Physics Engine:** Custom iterative Newton-Raphson solver for Van der Waals cubic equations.
- **Build Tool:** Vite (v8) + `vite-plugin-pwa` for offline service workers.
- **Styling:** Vanilla CSS with a mobile-first, dark-themed technical UI.

## Core Logic (Physics)
The application moves beyond the Ideal Gas Law to handle the complexities of high-pressure technical diving:
- **Constants Used:** Per-gas $a$ (attraction) and $b$ (volume) coefficients for He, O2, and N2, fitted to NIST Chemistry WebBook isotherms (-10 to 80 °C, 50 to 350 bar) instead of the textbook critical-point values. $a$ is linear in temperature, $a(T) = a_0 + a_1 (T - 293.15\,\text{K})$; helium uses $a = 0$. Pure-gas pressures match NIST within 0.7% over that range, and unit tests check the model against NIST densities. Mixtures rely on the mixing rules below and are not validated against measured mixture data.
- **Atmospheric Offset:** All user inputs are treated as **Gauge Pressure** (matching SPGs), while internal math uses **Absolute Pressure** (adding 1.013 bar) to account for residual air in "empty" tanks.
- **Mixing Rules:** Uses quadratic mixing for the $a$ parameter and linear mixing for $b$.
- **MOD & Gas Density:** The Maximum Operating Depth uses the diving convention of 10 m per bar with a 1 bar surface, so the absolute pressure at the MOD is `ppO2Max / FO2`. Breathing-gas density at that depth is derived from the ideal gas law (mix molar mass × absolute pressure / RT) at the configured temperature — the basis on which the 5.2 g/L working and 6.2 g/L absolute density limits are defined.

## Mobile & Offline Use
Trimixer is optimized for use at remote dive sites:
- **Installation:** Open the app in Safari/Chrome, tap "Share" or "Menu", and select **"Add to Home Screen"**.
- **Offline Mode:** Once installed, the app functions without any internet connection.
- **Local Network Access:** Run `npm run dev -- --host` to access the app from your iPhone via your Mac's local IP address.

## Building and Running
- **Development:** `npm run dev -- --host`
- **Test:** `npm test` (Vitest unit tests for the physics engine)
- **Build:** `npm run build`
- **Preview:** `npm run preview`

## Safety Warning
**Gas blending is inherently dangerous.** This tool is intended for certified gas blenders. Always analyze your final mixture with a calibrated Oxygen and Helium analyzer before diving. Never rely solely on software for life-critical calculations.
