# ADR 2026-09-23: Native Canvas Background Engine Synchronization and Theme-Adaptive Rephen 'A' Monogram

## Status
Accepted

## Context
Following user testing of the v1.2.0 release, two critical UX and branding defects were reported:
1. **Canvas Background Modification in Settings**:
   - The user reported that changing the canvas background was not functioning from settings.
   - Root-cause analysis revealed that while CSS background styling was applied to the canvas container, the Rust WebAssembly engine (`aerial-engine`) hardcoded `self.ctx.fill_rect(0.0, 0.0, width, height)` to either `#000000` (dark mode) or `#ffffff` (light mode) on every `render()` pass. This opaque rectangle occluded any CSS background styling.
   - Furthermore, the toolbar's floating Settings Popover (`AerialSettingsPopover` / `showSettings`) lacked a dedicated, persistent canvas background modification section, leaving users confused when modifying settings while different tools were active.
2. **Brand Identity & Monogram System**:
   - The user requested updating the logo to feature an Araskova Orange (`#e73f07`) background with a high-contrast black monogram of Rephen 'A' in dark mode (`#0a0a0a`) and a crisp white monogram of Rephen 'A' in light mode (`#ffffff`).
   - The logo mark must be prominently visible both in the top-left menu trigger button and within drawer/header components, adapting dynamically across theme transitions without layout shift.

## Decision

1. **Rust WebAssembly Engine Dynamic Background Color (`aerial-core/aerial-engine/src/lib.rs`)**:
   - Added `bg_color: Option<String>` field to `AerialCanvas`.
   - Exposed `pub fn set_background_color(&mut self, color: &str)` to JavaScript/TypeScript through `wasm-bindgen`.
   - In `render()`, resolved the effective background color from `self.bg_color`, defaulting to `#000000` in dark mode and `#ffffff` in light mode.
   - If not set to `"transparent"`, cleared the canvas viewport and filled it with `effective_bg`.
   - Enhanced grid rendering luminance calculation: dynamically sampled RGB values from hex codes (`#RRGGBB`) to compute luminance `(0.299*r + 0.587*g + 0.114*b) / 255.0` and adaptively rendered light or dark grid dots/crosses/lines to ensure maximum visual contrast on custom backgrounds.
   - Compiled with `wasm-pack build --target web` and distributed artifacts to `public/aerial-engine/` and `dist/aerial-engine/`.

2. **React Imperative and Declarative Engine Synchronization (`src/components/AerialCanvas.tsx`, `src/lib/types.ts`)**:
   - Added `setBackgroundColor(color: string)` method to `AerialCanvasRef` imperative API.
   - Added `backgroundColor?: string` and `onChangeBackgroundColor?: (color: string) => void` props to `AerialCanvasProps` and `AerialSettingsPopoverProps`.
   - In `AerialCanvas.tsx`, added a reactive `useEffect` monitoring `[backgroundColor, engineReady]` that invokes `engine.set_background_color(color)` and `engine.render()`.
   - Synchronized `style={{ background: backgroundColor || 'transparent' }}` on the `<canvas>` DOM element to prevent white flash during initial WebAssembly boot.

3. **Persistent Canvas Background in Settings Popover & Drawer (`src/App.tsx`, `src/components/AerialToolbar.tsx`)**:
   - Centralized `changeCanvasBg(color: string)` callback in `App.tsx` updating React state, `localStorage` (`aerial_canvas_bg`), and the underlying engine via `canvasRef.current?.setBackgroundColor(color)`.
   - Added persistent Canvas Background section (6 curated presets: Brand Dark `#0a0a0a`, OLED Black `#000000`, Blueprint Deep `#0d1b2a`, Terminal Forest `#0a1912`, Clean White `#ffffff`, Warm Canvas `#fdfbf7`, plus custom HTML5 color picker) to:
     - The floating Settings Popover (`showSettings`), placed before text translation so it is universally accessible across all tools.
     - The standalone `AerialSettingsPopover` component in `AerialToolbar.tsx`.
     - The expanded top-left hamburger side menu drawer.

4. **Theme-Adaptive Rephen 'A' Monogram Brand Mark (`src/AerialLogo.tsx`, `public/favicon.svg`)**:
   - Redesigned `MonogramA` in `AerialLogo.tsx`:
     - Squircle background filled with Araskova Orange (`#e73f07`, `rx="11"`).
     - Monogram letter 'A' rendered in bold `Rephen` font (`font-weight: 900`, `font-size: 27px`).
     - Dynamic fill color: `#0a0a0a` in dark mode, `#ffffff` in light mode.
     - Implemented both prop-based control (`isDarkMode`) and CSS class/media query overrides (`:root.dark .aerial-monogram-text`).
   - Updated `AerialMark`, `AerialWordmark`, and `AerialLogoStack` to forward `isDarkMode`.
   - Updated `public/favicon.svg` to feature the Araskova Orange squircle and theme-adaptive Rephen 'A' glyph.
   - Prominently integrated `<AerialMark size={24} isDarkMode={isDarkMode} />` directly into the top-left menu pill button alongside the hamburger icon, ensuring constant brand presence.

5. **Release & Version Bump (v1.2.1)**:
   - Bumped semantic version from `1.2.0` to `1.2.1` in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
   - Rebuilt client distribution bundle and standalone npm library.
   - Compiled macOS desktop application via `bun run tauri build` and installed to `/Applications/Aerial.app`.

## Consequences
- Canvas background modifications work instantly and smoothly from both Settings and Side Menu with persistent storage.
- Real-time canvas rendering, SVG export, and PNG blob export all respect the chosen background color.
- Brand logo strictly matches Araskova specifications with vibrant orange squircle and high-contrast theme-dependent monogram.
