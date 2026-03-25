# Trimixer - High Precision Gas Blender

Trimixer is a professional-grade, reactive web application designed for technical divers. It calculates complex Nitrox and Trimix fillings using the partial pressure method, powered by real-world physics and offline-first capabilities.

## Project Overview
- **Purpose:** Calculate partial pressures for Helium, Oxygen, and Air top-ups, with support for bleed-down logic and top-up simulations.
- **Key Features:**
  - **Van der Waals Equation of State:** High-accuracy calculations accounting for gas compressibility at pressures up to 300 bar.
  - **Temperature Compensation:** Real-time adjustments based on ambient blending temperature.
  - **Bleed-Down Intelligence:** Automatically calculates the required pressure to bleed an existing cylinder to reach a target mix.
  - **Top-up Simulator:** Predicts the resulting mixture when adding a specific pressure of gas to an existing cylinder.
  - **PWA Support:** Works completely offline on mobile devices (iPhone/Android) when added to the home screen.

## Technologies
- **Frontend:** React (v19) + TypeScript
- **Physics Engine:** Custom iterative Newton-Raphson solver for Van der Waals cubic equations.
- **Build Tool:** Vite (v8) + `vite-plugin-pwa` for offline service workers.
- **Styling:** Vanilla CSS with a mobile-first, dark-themed technical UI.

## Core Logic (Physics)
The application moves beyond the Ideal Gas Law to handle the complexities of high-pressure technical diving:
- **Constants Used:** Specific $a$ (attraction) and $b$ (volume) constants for He, O2, and N2.
- **Atmospheric Offset:** All user inputs are treated as **Gauge Pressure** (matching SPGs), while internal math uses **Absolute Pressure** (adding 1.013 bar) to account for residual air in "empty" tanks.
- **Mixing Rules:** Uses quadratic mixing for the $a$ parameter and linear mixing for $b$.

## Mobile & Offline Use
Trimixer is optimized for use at remote dive sites:
- **Installation:** Open the app in Safari/Chrome, tap "Share" or "Menu", and select **"Add to Home Screen"**.
- **Offline Mode:** Once installed, the app functions without any internet connection.
- **Local Network Access:** Run `npm run dev -- --host` to access the app from your iPhone via your Mac's local IP address.

## Building and Running
- **Development:** `npm run dev -- --host`
- **Build:** `npm run build`
- **Preview:** `npm run preview`

## Safety Warning
**Gas blending is inherently dangerous.** This tool is intended for certified gas blenders. Always analyze your final mixture with a calibrated Oxygen and Helium analyzer before diving. Never rely solely on software for life-critical calculations.
