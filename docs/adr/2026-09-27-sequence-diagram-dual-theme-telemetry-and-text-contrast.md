# Architecture Decision Record (ADR)

## Title
Sequence Diagram Dual-Theme Telemetry Styling, Actor Stick Figure Contrast, and Dark-Mode Re-Theming Synchronization

## Status
Accepted

## Date
2026-09-27

## Context
1. **Sequence Diagram Contrast Failure in Dark Mode**:
   - When switching Aerial Canvas from light mode to dark mode, flowcharts and state diagrams adapted correctly, but sequence diagrams (such as `OAuth2 & PKCE Auth Flow`) appeared nearly invisible or remained dark ("this alone didnt switch based on the theme change to darmode").
   - Actor stick figures had `.actor { stroke: #3f3f46; }`, rendering 1.5px dark gray limbs against the pitch-black (`#0a0a0a`) canvas.
   - Message text labels on arrow signals (`Click 'Sign In'`, `GET /authorize...`, `Return ID Token...`) retained Mermaid's inline `#333333` fill or child `<tspan>` fills, causing severe contrast collapse.
   - Sequence Notes (`Note over User,API: ...`) retained dark reddish-brown backgrounds with unreadable dark text.
   - Autonumber indicator circles and text remained dark grey without Araskova accent borders.
2. **Root Cause Analysis in SVG DOM & Retheming Pipeline**:
   - Unlike flowchart nodes (`.node`) and state diagrams (`.stateGroup`), Mermaid sequence diagrams use a distinct element architecture:
     - Stick figure actors: `<line class="actor">`, `<circle class="actor">`, `<line class="actor-man">`, `<text class="actor"> <tspan>`.
     - Message text: `<text class="messageText">` with nested `<tspan>` tags carrying inline `fill="#333333"`.
     - Note boxes and texts: `<rect class="note">`, `<text class="noteText">`.
     - Autonumbers: `<circle class="sequenceNumber">`, `<text class="sequenceNumber">`.
   - `applyAraskovaDiagramAesthetics` only traversed `.node` and `.stateGroup`, completely omitting sequence diagram DOM nodes.
   - When `rethemeDiagrams` executed, CSS inheritance failed to penetrate `<tspan>` elements with explicit inline fill attributes.

## Decision
1. **Sequence Diagram Theme Configuration**:
   - Set `actorBorder: isDark ? '#f4f4f5' : '#18181b'` to guarantee bright, crisp stick figure limbs in dark mode.
   - Set `signalColor: isDark ? '#f4f4f5' : '#18181b'` and `messageTextColor: textPrimary` to guarantee high-visibility message arrows.
   - Set `noteBkgColor: isDark ? '#18181b' : '#fff7ed'` with `noteTextColor: isDark ? '#f4f4f5' : '#7c2d12'` and `noteBorderColor: brandAccent`.
   - Set `sequenceNumberColor: brandAccent` for precision tactical numbering.
2. **Comprehensive High-Specificity `themeCSS`**:
   - Added explicit rules for `.actor`, `line.actor`, `circle.actor`, `text.actor tspan`, `.actor-line`, `.messageLine0`, `.messageLine1`, `.messageText tspan`, `rect.note`, `.noteText tspan`, `circle.sequenceNumber`, `text.sequenceNumber`, and `.labelBox`.
3. **Direct SVG DOM Mutation & Data URL Decoding in `applyAraskovaDiagramAesthetics`**:
   - Implemented Step 6b in `applyAraskovaDiagramAesthetics` to traverse all sequence diagram elements:
     - Overwrite stick figure limb and head strokes with `#f4f4f5` (dark mode) / `#18181b` (light mode).
     - Overwrite `.messageText` and all `<tspan>` fills with `textPrimary`.
     - Overwrite `.noteText` and all `<tspan>` fills with `#f4f4f5` (dark mode) / `#7c2d12` (light mode).
     - Update `.actor-line` to subtle dashed lifelines and `line[marker-end]` to `#araskova-arrow-head`.
     - Automatically decode base64 `data:image/svg+xml;base64,...` inputs so re-theming works seamlessly on both raw code and cached SVG data URLs.
4. **Resilient Re-Theming Loop**:
   - Wrapped `mermaid.render` inside `rethemeDiagrams` in a scoped try-catch that falls back to raw SVG re-theming if parsing ever encounters diagram syntax variations.

## Consequences
- Sequence diagrams now switch themes seamlessly on the canvas alongside flowcharts and state diagrams.
- Stick figures, lifelines, message arrows, signal labels, notes, and autonumber markers display with machinery-grade crispness in both dark and light modes.
