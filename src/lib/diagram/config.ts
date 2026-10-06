// ── Mermaid configuration in the Araskova diagram styles ─────────────────────
// High-contrast, razor-sharp technical blueprints with military-grade clarity.
// Zero blurry drop-shadows, zero cloudy filters, zero external font network blocking.

export type AraskovaDiagramStyle = 'brutalist' | 'blueprint' | 'industrial_light';

export interface MermaidThemeConfig {
  theme: 'base';
  themeVariables: Record<string, string | boolean | number>;
  themeCSS: string;
  /** Always 'strict': diagram source is user/AI supplied and the SVG is injected into the DOM. */
  securityLevel: 'strict';
}

/**
 * Generates Mermaid initialization configuration adhering strictly to Araskova brand tokens.
 * Prioritizes razor-sharp contrast, clean vector edges, and crystal-clear legibility.
 */
export function getAraskovaMermaidConfig(
  isDarkMode = true,
  style: AraskovaDiagramStyle = 'brutalist',
  customAccent?: string
): MermaidThemeConfig {
  const isDark = style === 'industrial_light' ? false : isDarkMode;
  const isBlueprint = style === 'blueprint';

  // Araskova Brand Tokens (High-Contrast, Crisp Palettes)
  const brandAccent = customAccent || '#e73f07'; // Customizable accent (defaults to Araskova Orange-Red)
  const brandDark = '#0a0a0a';

  // Crisp Surfaces & Borders (No muddy dark-on-dark)
  const brandSurface = isBlueprint ? '#0c1524' : isDark ? '#18181b' : '#ffffff';
  const brandSurfaceElevated = isBlueprint ? '#132138' : isDark ? '#27272a' : '#f4f4f5';
  const brandBorder = isBlueprint ? '#2563eb' : isDark ? '#3f3f46' : '#18181b';
  const textPrimary = isBlueprint ? '#ffffff' : isDark ? '#f4f4f5' : '#09090b';
  const textSecondary = isBlueprint ? '#93c5fd' : isDark ? '#a1a1aa' : '#52525b';
  const lineCol = isBlueprint ? '#38bdf8' : isDark ? '#a1a1aa' : '#27272a';

  const themeVariables: Record<string, string | boolean | number> = {
    darkMode: isDark,
    background: 'transparent',
    fontFamily: "'Inter', 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    fontSize: '13px',

    // Primary Nodes
    primaryColor: brandSurface,
    primaryBorderColor: brandBorder,
    primaryTextColor: textPrimary,

    // Secondary / Auxiliary Nodes
    secondaryColor: brandSurfaceElevated,
    secondaryBorderColor: brandBorder,
    secondaryTextColor: textSecondary,

    // Tertiary
    tertiaryColor: brandSurface,
    tertiaryBorderColor: brandBorder,
    tertiaryTextColor: textPrimary,

    // Lines & Edges
    lineColor: lineCol,
    textColor: textPrimary,
    mainBkg: brandSurface,
    nodeBorder: brandBorder,
    nodeTextColor: textPrimary,

    // Subgraphs / Clusters
    clusterBkg: isBlueprint ? '#09101d' : isDark ? '#101012' : '#fafafa',
    clusterBorder: brandBorder,
    titleColor: isDark ? '#ffffff' : '#09090b',

    // Edge Labels & Arrowheads
    edgeLabelBackground: isDark ? '#27272a' : '#ffffff',
    arrowheadColor: brandAccent,

    // Sequence Diagram (Machinery-Grade Telemetry & Flows)
    actorBkg: isDark ? '#18181b' : '#ffffff',
    actorBorder: isDark ? '#f4f4f5' : '#18181b',
    actorTextColor: textPrimary,
    actorLineColor: isDark ? 'rgba(244, 244, 245, 0.3)' : 'rgba(24, 24, 27, 0.25)',
    signalColor: isDark ? '#f4f4f5' : '#18181b',
    signalTextColor: textPrimary,
    messageColor: textPrimary,
    messageTextColor: textPrimary,
    labelBoxBkgColor: brandSurfaceElevated,
    labelBoxBorderColor: brandBorder,
    labelTextColor: brandAccent,
    loopTextColor: textPrimary,
    noteBorderColor: brandAccent,
    noteBkgColor: isDark ? '#18181b' : '#fff7ed',
    noteTextColor: isDark ? '#f4f4f5' : '#7c2d12',
    activationBorderColor: brandAccent,
    activationBkgColor: isDark ? `${brandAccent}26` : '#ffedd5',
    sequenceNumberColor: brandAccent,

    // Class & State Diagram
    classText: textPrimary,
    labelColor: textPrimary,
    altBackground: brandSurfaceElevated,

    // Git Graph
    git0: brandAccent,
    git1: isDark ? '#ffffff' : '#09090b',
    git2: '#a1a1aa',
    git3: '#0ea5e9',
    gitBranchLabel0: '#ffffff',
    gitBranchLabel1: isDark ? '#000000' : '#ffffff',
    gitBranchLabel2: '#ffffff',
    gitBranchLabel3: '#ffffff',
  };

  const themeCSS = `
    svg {
      font-family: 'Inter', 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif !important;
      background: transparent !important;
    }

    /* Crisp High-Contrast Nodes — Zero Blurry Drop Shadows */
    .node rect, .node circle, .node ellipse, .node polygon {
      fill: ${brandSurface} !important;
      stroke: ${brandBorder} !important;
      stroke-width: 1.5px !important;
      rx: 3px !important;
      filter: none !important;
    }

    .node:hover rect, .node:hover polygon, .node:hover circle {
      stroke: ${brandAccent} !important;
      stroke-width: 2px !important;
    }

    /* Node Text — Crisp Bold Sans */
    .node .label, .nodeLabel {
      font-family: 'Inter', 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif !important;
      font-weight: 700 !important;
      font-size: 13px !important;
      letter-spacing: -0.01em !important;
      fill: ${textPrimary};
      color: ${textPrimary};
    }

    /* Edge Connectors & Technical Lines */
    .edgePath .path {
      stroke: ${lineCol} !important;
      stroke-width: 1.5px !important;
      stroke-linecap: square !important;
    }

    /* Sharp Arrowheads with Configurable Accent */
    marker path, #flowchart-pointEnd, #statediagram-barbEnd, [id*="pointEnd"], [id*="arrowhead"] path, [id*="crosshead"] path {
      fill: ${brandAccent} !important;
      stroke: ${brandAccent} !important;
      stroke-width: 1px !important;
    }

    /* Telemetry Edge Labels — Space Mono Badges */
    .edgeLabel {
      background-color: transparent !important;
    }
    .edgeLabel rect {
      fill: ${isDark ? '#27272a' : '#ffffff'} !important;
      stroke: ${brandBorder} !important;
      stroke-width: 1px !important;
      rx: 2px !important;
      filter: none !important;
    }
    .edgeLabel .label, .edgeLabel span {
      font-family: 'Space Mono', 'SF Mono', ui-monospace, Menlo, Monaco, monospace !important;
      font-size: 10px !important;
      font-weight: 700 !important;
      letter-spacing: 0.08em !important;
      text-transform: uppercase !important;
      fill: ${brandAccent} !important;
      color: ${brandAccent} !important;
    }

    /* Subgraphs / Clusters — Clean Technical Enclosures */
    .cluster rect {
      fill: ${isBlueprint ? '#09101d' : isDark ? '#101012' : '#fafafa'} !important;
      stroke: ${brandBorder} !important;
      stroke-width: 1.5px !important;
      stroke-dasharray: 4 4 !important;
      rx: 4px !important;
      filter: none !important;
    }

    .cluster text, .cluster .nodeLabel, .cluster-label span {
      font-family: 'Space Mono', 'SF Mono', ui-monospace, monospace !important;
      font-size: 10.5px !important;
      font-weight: 700 !important;
      letter-spacing: 0.15em !important;
      text-transform: uppercase !important;
      fill: ${brandAccent} !important;
      color: ${brandAccent} !important;
    }

    /* Sequence Diagrams — Full High-Contrast Araskova Brutalist Engine */
    .actor {
      stroke: ${isDark ? '#f4f4f5' : '#18181b'} !important;
      fill: ${brandSurface} !important;
      stroke-width: 1.5px !important;
    }
    line.actor, line.actor-man, line[class*="actor"] {
      stroke: ${isDark ? '#f4f4f5' : '#18181b'} !important;
      stroke-width: 1.5px !important;
      fill: none !important;
    }
    circle.actor, circle.actor-man, circle[class*="actor"] {
      stroke: ${isDark ? '#f4f4f5' : '#18181b'} !important;
      fill: ${isDark ? '#27272a' : '#ffffff'} !important;
      stroke-width: 1.5px !important;
    }
    rect.actor {
      fill: ${brandSurface} !important;
      stroke: ${brandBorder} !important;
      stroke-width: 1.5px !important;
      rx: 3px !important;
    }
    .actor text, text.actor, text.actor-man, text.actor-top, text.actor-bottom,
    text.actor tspan, text.actor-man tspan, .actor tspan, [class*="actor"] text, [class*="actor"] tspan {
      font-family: 'Inter', 'Roboto', sans-serif !important;
      font-weight: 700 !important;
      font-size: 12px !important;
      text-transform: uppercase !important;
      letter-spacing: 0.05em !important;
      fill: ${textPrimary} !important;
      color: ${textPrimary} !important;
    }
    .actor-line, line.actor-line {
      stroke: ${isDark ? 'rgba(244, 244, 245, 0.3)' : 'rgba(24, 24, 27, 0.25)'} !important;
      stroke-dasharray: 4 4 !important;
      stroke-width: 1.5px !important;
    }
    .messageLine0, .messageLine1, line[class*="messageLine"], path[class*="messageLine"] {
      stroke: ${isDark ? '#f4f4f5' : '#18181b'} !important;
      stroke-width: 1.5px !important;
    }
    .messageText, text.messageText, text.messageText tspan, .messageText tspan, g.messageText text, g.messageText tspan {
      font-family: 'Space Mono', 'SF Mono', ui-monospace, monospace !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      letter-spacing: 0.02em !important;
      fill: ${textPrimary} !important;
      color: ${textPrimary} !important;
    }
    .note, rect.note {
      fill: ${isDark ? '#18181b' : '#fff7ed'} !important;
      stroke: ${brandAccent} !important;
      stroke-width: 1.5px !important;
      rx: 4px !important;
      filter: none !important;
    }
    .noteText, text.noteText, text.noteText tspan, .noteText tspan, .note text, .note tspan {
      font-family: 'Inter', 'Roboto', sans-serif !important;
      font-size: 11.5px !important;
      font-weight: 700 !important;
      letter-spacing: 0.02em !important;
      fill: ${isDark ? '#f4f4f5' : '#7c2d12'} !important;
      color: ${isDark ? '#f4f4f5' : '#7c2d12'} !important;
    }
    .sequenceNumber, circle.sequenceNumber {
      fill: ${isDark ? '#18181b' : '#ffffff'} !important;
      stroke: ${brandAccent} !important;
      stroke-width: 1.5px !important;
    }
    text.sequenceNumber, .sequenceNumber tspan, text.sequenceNumber tspan {
      font-family: 'Space Mono', monospace !important;
      font-weight: 800 !important;
      font-size: 10px !important;
      fill: ${brandAccent} !important;
      color: ${brandAccent} !important;
    }
    .labelBox, rect.labelBox {
      fill: ${isDark ? '#18181b' : '#f4f4f5'} !important;
      stroke: ${brandBorder} !important;
      stroke-width: 1.5px !important;
      rx: 3px !important;
    }
    .labelText, text.labelText, .labelText tspan {
      font-family: 'Space Mono', monospace !important;
      font-size: 10px !important;
      font-weight: 700 !important;
      fill: ${brandAccent} !important;
      color: ${brandAccent} !important;
    }
    .loopText, text.loopText, .loopText tspan {
      font-family: 'Space Mono', monospace !important;
      font-size: 10px !important;
      fill: ${textPrimary} !important;
      color: ${textPrimary} !important;
    }
    .loopLine, line.loopLine {
      stroke: ${brandBorder} !important;
      stroke-dasharray: 3 3 !important;
    }

    /* Class Diagrams */
    .classGroup rect {
      fill: ${brandSurface} !important;
      stroke: ${brandBorder} !important;
      stroke-width: 1.5px !important;
      rx: 3px !important;
      filter: none !important;
    }
    .classGroup line {
      stroke: ${brandBorder} !important;
      stroke-width: 1px !important;
    }
    .classTitleText {
      font-family: 'Inter', sans-serif !important;
      font-weight: 800 !important;
      text-transform: uppercase !important;
      fill: ${brandAccent} !important;
    }
    .classText {
      font-family: 'Space Mono', monospace !important;
      font-size: 10.5px !important;
      fill: ${textPrimary} !important;
    }

    /* State Diagrams */
    .stateGroup rect {
      fill: ${brandSurface} !important;
      stroke: ${brandBorder} !important;
      stroke-width: 1.5px !important;
      rx: 4px !important;
      filter: none !important;
    }
    .stateGroup .state-title {
      font-family: 'Inter', sans-serif !important;
      font-weight: 800 !important;
      text-transform: uppercase !important;
      fill: ${textPrimary} !important;
    }
    .statediagram-state circle {
      fill: ${brandAccent} !important;
      stroke: ${brandDark} !important;
    }

    /* Entity Relationship */
    .er.entityBox {
      fill: ${brandSurface} !important;
      stroke: ${brandBorder} !important;
      stroke-width: 1.5px !important;
      rx: 3px !important;
      filter: none !important;
    }
    .er.relationshipLine {
      stroke: ${lineCol} !important;
      stroke-width: 1.5px !important;
    }

    /* Git Graphs */
    .commit-bullets {
      stroke-width: 2px !important;
    }
    .branch-label text {
      font-family: 'Space Mono', monospace !important;
      font-weight: 700 !important;
      letter-spacing: 0.1em !important;
      font-size: 9px !important;
    }
  `;

  return {
    theme: 'base',
    themeVariables,
    themeCSS,
    securityLevel: 'strict',
  };
}
