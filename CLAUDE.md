# CLAUDE.md

Guidance for AI coding agents working in this repository. User-facing features and setup are in [README.md](README.md).

## Project

Trimixer is a gas blending calculator for technical divers (Nitrox and Trimix by partial pressure). It is a client-side React 19 + TypeScript app built with Vite 8, installable as an offline PWA (`vite-plugin-pwa`) and deployed to GitHub Pages. There is no backend; user input is persisted to `localStorage`.

Its output is used to fill breathing gas. Treat correctness as safety-critical: a wrong pressure or a missing warning can hurt someone.

## Commands

- `npm run dev` — dev server on port 5173 (`npm run dev -- --host` to open it from a phone on the same network)
- `npm test` — Vitest unit tests
- `npm run lint` — ESLint
- `npm run build` — type-check (`tsc -b`) and production build to `dist/`
- `npm run preview` — serve the production build

Before opening a PR, run lint, tests and build; CI runs the same three on every pull request.

## Layout

- `src/logic/calculations.ts` — all physics and safety logic, as pure functions with no React or DOM dependencies:
  - `calculateBlending` — blending plan (He / O2 / Air steps, bleed-down detection, supply checks)
  - `calculateTopUpResult` — top-up simulator
  - `calculateMixMetrics` — MOD, gas density at MOD, hypoxic flag and minimum depth
  - `compressibilityFactor` — exposed for tests against reference data
  - Constants: `LIMITS`, `DENSITY_LIMIT`, `PPO2_MIN`, `PPO2_MAX_OPTIONS`, and the gas-model `CONSTANTS`
- `src/logic/calculations.test.ts` — unit tests, including checks against NIST reference densities.
- `src/App.tsx` — the whole UI in one component: state, `localStorage` persistence, presets and rendering.
- `src/App.css`, `src/index.css` — styles; colours are CSS variables on `:root` (dark theme).
- `src/version.ts` — `APP_VERSION`, shown in the footer and the About modal. See [Versioning](#versioning).
- `public/` — favicon and PWA icons. `vite.config.ts` holds the PWA manifest.
- `.github/workflows/` — `ci.yml` (lint, test, build on PRs) and `deploy.yml` (same checks, then deploy to GitHub Pages on push to `main`).

## Units and conventions

- Gas fractions are 0–1 inside the logic; the UI shows and accepts percent and converts in `handleInputChange` / `formatInput`.
- Pressures entered by the user are gauge pressures in bar (as read on a cylinder gauge). The gas model works in absolute pressure (`P_ATM = 1.01325` bar). Depth calculations instead use the diving convention of 1 bar at the surface and 10 m per bar.
- Temperatures are in °C at the API and converted to kelvin internally.
- Volumes are water capacity in litres.
- A blank numeric input means 0, so input placeholders show "0".

## Physics model

- Real gas: Van der Waals equation with coefficients fitted to NIST Chemistry WebBook isotherms (−10 to 80 °C, 50 to 350 bar), not the textbook critical-point constants. The attraction term is linear in temperature, `a(T) = a0 + a1 (T − 293.15 K)`; helium uses `a = 0`. Pure-gas pressures match NIST within 0.7% over that range.
- Mixtures use quadratic mixing for `a` and linear mixing for `b`. Mixtures are not validated against measured mixture data.
- Molar volume is solved with Newton-Raphson in `getMolesAtT`; `getGaugePressureAtT` is the explicit inverse.
- MOD: absolute pressure at the MOD is `ppO2Max / FO2`. Gas density at the MOD uses the ideal gas law at the configured temperature, which is how the 5.2 g/L (recommended) and 6.2 g/L (absolute) limits are defined.
- Supply cylinders are pure O2 and pure He. Only a top-up gas that is ≥ 99.5% He or O2 is drawn from them; air and premixes are not.

## Rules for changes

- Keep physics and validation in `calculations.ts` as pure functions, and add or update tests there for every logic change. UI-only changes do not need unit tests but should be checked in the running app.
- Do not change safety thresholds (`LIMITS`, `DENSITY_LIMIT`, `PPO2_MIN`, `PPO2_MAX_OPTIONS`) or the gas-model coefficients without the maintainer asking for it. A coefficient change must come with tests against published reference data.
- Prefer a visible warning over silently clamping or ignoring an unsafe or impossible input.
- When a persisted state shape changes, migrate old `localStorage` values (see the legacy supply migration in `App.tsx`). Keys: `trimixer-current`, `trimixer-target`, `trimixer-supply`, `trimixer-temp`, `trimixer-fill-temp-delta`, `trimixer-order`, `trimixer-ppo2max`.
- Keep README.md in sync with user-visible features.
- The PNG icons in `public/` (`pwa-192.png`, `pwa-512.png`, `pwa-maskable-512.png`, `apple-touch-icon.png`) are rendered from `public/favicon.svg` by hand; there is no generation script. Regenerate them if the icon changes.

## Versioning

Every pull request bumps the version, following [Semantic Versioning](https://semver.org) (`MAJOR.MINOR.PATCH`). Decide the bump from what the PR changes for someone using the app:

- **MAJOR** — a breaking change: a feature is removed, or saved settings in `localStorage` are lost or reset because there is no migration.
- **MINOR** — a new user-visible feature, input, output or warning. Reset PATCH to 0.
- **PATCH** — anything else: bug fixes (including fixes that change calculated results), documentation, CI, dependency updates and refactors.

If a PR fits more than one level, use the highest. Rules:

- Set the same version in **both** `package.json` (`"version"`) and `src/version.ts` (`APP_VERSION`), and refresh `package-lock.json` with `npm install --package-lock-only`.
- Bump on the feature branch as part of the PR, relative to the version on `main`. If `main` moves on before the PR is merged, re-check the bump after updating the branch.
- State the new version and the reason for the level in the PR description, and say so when a PR changes calculated results.

## Workflow

- Work on a feature branch and open a pull request against `main`; do not commit to `main` directly.
- Bump the version in every pull request (see [Versioning](#versioning)).
- Merging to `main` deploys to GitHub Pages.
