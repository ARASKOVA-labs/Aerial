# ADR 2026-09-23: Universal Diagram Presets, Interactive Canvas Resize, Custom Diagram Accents, and Toolbar Jitter Bug Resolution

## Status
Accepted

## Context
Following recent releases, users identified four critical areas requiring architectural refinement:
1. *"also for the samples of the chart dont give company secrets and also for poeple to use it effecitvly ask them to copy the prompt to chatgpt or claode or any other ai to get the correct systax for this for whatver you desire and itll give and then paste it here to rendor it like that"*
2. *"also the the charts that are generated there size adjuster the selecter animation of smthg that is selected"*
3. *"also feature to chagne the colour from orange to anything they want so that they can create colour ones if needed"*
4. *"when increasing the stroke size there tool bar is jittering fix the the jitter bug"*

---

## Technical Root Cause Analysis

### 1. Toolbar Jitter Bug:
- **Compound CSS Layout & Transform Interpolation**:
  - The main toolbar container in `src/App.tsx` possessed:
    `className="... absolute top-4 left-1/2 -translate-x-1/2 flex items-center ... w-max ... transition-all duration-500 ease-in-out ..."`
  - Nested inside the toolbar, the stroke settings button displayed `{strokeWidth}px` with unconstrained width and a `transition-all duration-200` class.
  - When scrubbing the stroke slider (values between 1px and 24px in 0.5px steps), character length oscillated repeatedly (e.g., `2px` [3 chars], `2.5px` [5 chars], `10px` [4 chars], `10.5px` [6 chars]).
  - The button changed intrinsic width by 8–12px on almost every slider step.
  - Because the parent toolbar had `w-max` and `transition-all duration-500`, every width shift triggered a 500ms CSS transition on both `width` and `transform` (`-translate-x-1/2`, which resolves to -50% of the element width).
  - High-frequency pointer scrubbing (60Hz) caused multiple overlapping CSS transitions to fight each other continuously, creating violent horizontal oscillation and jitter.

### 2. Diagram Preset Sanitization & AI Workflow:
- Diagram presets previously contained internal codenames and proprietary defense terminology. Users required public-safe, standardized architectural patterns (`Cloud Microservices`, `Real-Time Event Stream`, `OAuth2 & PKCE Auth Flow`, `Order Lifecycle State Machine`, `E-Commerce Domain Entities`).
- Users needed a guided mechanism to generate custom diagrams via ChatGPT or Claude without syntax errors.

### 3. Canvas Diagram Selection, Marching Reticles & 4-Corner Resizing:
- Previously, diagrams placed on canvas were static in dimensions and lacked interactive handles or visual bounding telemetry.
- Users needed direct on-canvas scaling and visual selection cues consistent with Araskova brutalist design standards.

### 4. Customizable Diagram Accent Colors:
- Diagrams were locked to `#e73f07` (Araskova Orange). Users required customizable accent themes (Cyan, Emerald, Violet, Amber, Crimson, White, or custom hex) both in Diagram Studio and via an on-canvas HUD.

---

## Decisions & Implementation

### 1. Toolbar Jitter Bug Resolution (`src/App.tsx` & `src/components/AerialToolbar.tsx`)
- **Decoupled Transition Architecture**:
  - Separated toolbar positioning from the content container.
  - The outer wrapper handles `absolute top-4 left-1/2 -translate-x-1/2` with scoped `transition-[opacity,transform] duration-300 ease-in-out`, dedicated exclusively to fullscreen toggling.
  - The inner container holds the toolbar background and tool items with zero width or layout transitions.
- **Fixed Geometry & Tabular Numerals**:
  - Fixed button width on the stroke settings button (`w-[76px] shrink-0`).
  - Wrapped `{strokeWidth}px` in a fixed-width container:
    `<span className="text-[10px] font-mono font-bold w-10 text-center tabular-nums shrink-0">{strokeWidth}px</span>`.
  - Replaced `transition-all duration-200` on the button with `transition-colors duration-150`.
  - Fixed width on eraser mode button (`w-24 shrink-0` and `w-14 text-center shrink-0`).
  - Added `font-mono tabular-nums` to size labels in popovers.
  - Updated embeddable `AerialToolbar` and `AerialZoomBar` to use `transition-[opacity,transform] duration-300 ease-in-out`.

### 2. Diagram Presets & AI Prompt Assistant (`src/lib/diagram-theme.ts` & `src/App.tsx`)
- Sanitized all presets with public, production-grade architectures.
- Added AI Prompt Assistant banner in Diagram Studio with a 1-click `Copy Prompt for ChatGPT / Claude` button that formats strict instructions for Mermaid DSL generation.

### 3. Interactive On-Canvas Resizing & Animated Reticle (`aerial-core/aerial-engine/src/lib.rs`)
- Added 4-corner interactive resize handles (`ResizeHandle::TopLeft`, `TopRight`, `BottomRight`, `BottomLeft`) with aspect ratio preservation.
- Implemented 60 FPS marching dashed bounding reticle, CAD corner L-brackets, and `[ W × H px ]` telemetry pill in `Space Mono`.
- Added WASM APIs: `scale_selected`, `set_accent_color`, `get_accent_color`, `set_selected_id`, `deselect`.

### 4. Diagram Accent Customization (`src/lib/diagram-theme.ts` & `src/components/AerialCanvas.tsx`)
- Parameterized `customAccent` in Mermaid styling and SVG DOM rewriting.
- Provided preset palette swatches and custom hex picker in Diagram Studio.
- Added floating on-canvas HUD above selected diagrams with quick scale (`[-]`/`[+]`), 7 color swatches, custom color input, and delete action.

---

## Consequences
- **Zero Toolbar Jitter**: Dragging stroke size or eraser size sliders causes zero toolbar oscillation or layout shifting.
- **Machinery-Grade Visual Feedback**: Diagrams feel responsive, tactile, and aligned with Araskova brutalist design standards.
- **Privacy & Extensibility**: No confidential references exist in code or presets. Users can generate arbitrary diagrams with external LLMs and adjust accents freely.
