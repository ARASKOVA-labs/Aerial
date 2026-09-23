// ── Araskova Universal Design System — Mermaid & Architecture Diagram Engine ──
// Transforms Mermaid and DSL charts into military-grade machinery brutalist blueprints.
// Implements dual-theme luminance, tactical corner reticles, Space Mono telemetry,
// Araskova Orange (#e73f07) arrowheads, and self-contained embedded typography.

export type AraskovaDiagramStyle = 'brutalist' | 'blueprint' | 'industrial_light';

export interface MermaidThemeConfig {
  theme: 'base';
  themeVariables: Record<string, string | boolean | number>;
  themeCSS: string;
}

/**
 * Generates Mermaid initialization configuration adhering strictly to Araskova brand tokens.
 */
export function getAraskovaMermaidConfig(isDarkMode = true, style: AraskovaDiagramStyle = 'brutalist'): MermaidThemeConfig {
  const isDark = style === 'industrial_light' ? false : isDarkMode;
  const isBlueprint = style === 'blueprint';

  // Araskova Brand Tokens
  const brandDark = '#0a0a0a';
  const brandSurface = isBlueprint ? '#0d1522' : isDark ? '#111111' : '#ffffff';
  const brandSurfaceElevated = isBlueprint ? '#121e33' : isDark ? '#171717' : '#f5f5f5';
  const brandAccent = '#e73f07'; // Araskova Orange-Red
  const brandBorder = isBlueprint ? '#1e3a5f' : isDark ? '#2a2a2a' : '#d4d4d8';
  const brandBorderActive = isBlueprint ? '#3b82f6' : brandAccent;
  const brandLight = '#f3f3f2';
  const brandGray = '#81868b';
  const textPrimary = isDark ? brandLight : '#0a0a0a';
  const textSecondary = isDark ? brandGray : '#52525b';
  const lineCol = isBlueprint ? '#3b82f6' : isDark ? '#81868b' : '#71717a';

  const themeVariables: Record<string, string | boolean | number> = {
    darkMode: isDark,
    background: 'transparent',
    fontFamily: "'Inter', 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif",
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
    clusterBkg: isBlueprint ? 'rgba(13, 21, 34, 0.7)' : isDark ? 'rgba(13, 13, 13, 0.7)' : 'rgba(249, 249, 249, 0.8)',
    clusterBorder: brandBorder,
    titleColor: isDark ? brandLight : '#0a0a0a',

    // Edge Labels & Arrowheads
    edgeLabelBackground: isDark ? '#141414' : '#ffffff',
    arrowheadColor: brandAccent,

    // Sequence Diagram
    actorBkg: brandSurface,
    actorBorder: brandBorder,
    actorTextColor: textPrimary,
    actorLineColor: brandBorder,
    signalColor: textPrimary,
    signalTextColor: textPrimary,
    labelBoxBkgColor: brandSurfaceElevated,
    labelBoxBorderColor: brandBorder,
    labelTextColor: textPrimary,
    loopTextColor: textSecondary,
    noteBorderColor: brandBorderActive,
    noteBkgColor: isDark ? '#1c1512' : '#fff7ed',
    noteTextColor: isDark ? brandLight : '#7c2d12',
    activationBorderColor: brandAccent,
    activationBkgColor: isDark ? '#261712' : '#ffedd5',

    // Class & State Diagram
    classText: textPrimary,
    labelColor: textPrimary,
    altBackground: brandSurfaceElevated,

    // Git Graph
    git0: brandAccent,
    git1: isDark ? '#f3f3f2' : '#0a0a0a',
    git2: '#81868b',
    git3: '#0ea5e9',
    gitBranchLabel0: '#ffffff',
    gitBranchLabel1: isDark ? '#000000' : '#ffffff',
    gitBranchLabel2: '#ffffff',
    gitBranchLabel3: '#ffffff',
  };

  const themeCSS = `
    /* Araskova Typography Standards: Inter/Roboto for titles, Space Mono for telemetry */
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&family=Roboto:wght@400;700;900&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap');

    svg {
      font-family: 'Inter', 'Roboto', sans-serif !important;
      background: transparent !important;
    }

    /* Flowchart Nodes — Machinery Surfaces & High-Contrast Borders */
    .node rect, .node circle, .node ellipse, .node polygon, .node path {
      fill: ${brandSurface} !important;
      stroke: ${brandBorder} !important;
      stroke-width: 1.5px !important;
      rx: 4px !important;
      filter: drop-shadow(0 2px 6px rgba(0, 0, 0, ${isDark ? '0.4' : '0.08'}));
      transition: all 0.2s ease;
    }

    .node:hover rect, .node:hover polygon, .node:hover path {
      stroke: ${brandAccent} !important;
      stroke-width: 2px !important;
    }

    /* Node Text — Upper Bold Brutalist */
    .node .label, .nodeLabel {
      font-family: 'Inter', 'Roboto', sans-serif !important;
      font-weight: 700 !important;
      font-size: 12px !important;
      letter-spacing: -0.01em !important;
      fill: ${textPrimary} !important;
      color: ${textPrimary} !important;
    }

    /* Edge Connectors & Technical Lines */
    .edgePath .path {
      stroke: ${lineCol} !important;
      stroke-width: 1.5px !important;
      stroke-linecap: square !important;
    }

    /* Araskova Orange Arrowheads */
    marker path, #flowchart-pointEnd, #statediagram-barbEnd, [id*="pointEnd"], [id*="arrowhead"] path {
      fill: ${brandAccent} !important;
      stroke: ${brandAccent} !important;
      stroke-width: 1px !important;
    }

    /* Telemetry Edge Labels — Space Mono Badges */
    .edgeLabel {
      background-color: transparent !important;
    }
    .edgeLabel rect {
      fill: ${isDark ? '#141414' : '#ffffff'} !important;
      stroke: ${brandBorder} !important;
      stroke-width: 1px !important;
      rx: 3px !important;
    }
    .edgeLabel .label, .edgeLabel span {
      font-family: 'Space Mono', ui-monospace, monospace !important;
      font-size: 9.5px !important;
      font-weight: 700 !important;
      letter-spacing: 0.12em !important;
      text-transform: uppercase !important;
      fill: ${brandAccent} !important;
      color: ${brandAccent} !important;
    }

    /* Subgraphs / Clusters — Tactical Industrial Wireframes */
    .cluster rect {
      fill: ${isBlueprint ? 'rgba(13, 21, 34, 0.45)' : isDark ? 'rgba(13, 13, 13, 0.55)' : 'rgba(250, 250, 250, 0.7)'} !important;
      stroke: ${brandBorder} !important;
      stroke-width: 1.5px !important;
      stroke-dasharray: 6 3 !important;
      rx: 6px !important;
    }

    .cluster text, .cluster .nodeLabel, .cluster-label span {
      font-family: 'Space Mono', ui-monospace, monospace !important;
      font-size: 10px !important;
      font-weight: 700 !important;
      letter-spacing: 0.2em !important;
      text-transform: uppercase !important;
      fill: ${brandAccent} !important;
      color: ${brandAccent} !important;
    }

    /* Sequence Diagrams — Military Telemetry & Hardware Cards */
    .actor {
      fill: ${brandSurface} !important;
      stroke: ${brandBorder} !important;
      stroke-width: 1.5px !important;
      rx: 4px !important;
    }
    .actor text, text.actor {
      font-family: 'Inter', 'Roboto', sans-serif !important;
      font-weight: 800 !important;
      font-size: 12px !important;
      text-transform: uppercase !important;
      letter-spacing: 0.05em !important;
      fill: ${textPrimary} !important;
    }
    .actor-line {
      stroke: ${brandBorder} !important;
      stroke-dasharray: 4 4 !important;
      stroke-width: 1.5px !important;
    }
    .messageLine0, .messageLine1 {
      stroke: ${lineCol} !important;
      stroke-width: 1.75px !important;
    }
    .messageText {
      font-family: 'Space Mono', monospace !important;
      font-size: 10px !important;
      font-weight: 600 !important;
      letter-spacing: 0.08em !important;
      fill: ${textPrimary} !important;
    }

    /* Class Diagrams */
    .classGroup rect {
      fill: ${brandSurface} !important;
      stroke: ${brandBorder} !important;
      stroke-width: 1.5px !important;
      rx: 4px !important;
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
      rx: 6px !important;
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
      rx: 4px !important;
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
  };
}

/**
 * Architectural SVG Post-Processor:
 * Injects Araskova machinery brutalist elements directly into the SVG DOM:
 * 1. Self-contained Google Font imports in <defs><style> for canvas snapshot & export fidelity.
 * 2. Tactical Corner Reticles (L-bracket ticks ┌ ┐ └ ┘) on major rectangular nodes.
 * 3. Status indicator micro-dots (#e73f07) on primary components.
 * 4. Space Mono telemetry formatting for clusters and metadata labels.
 * 5. Razor-sharp Araskova Orange directional arrowheads.
 */
export function applyAraskovaDiagramAesthetics(
  svgString: string,
  isDarkMode = true,
  style: AraskovaDiagramStyle = 'brutalist'
): string {
  if (!svgString || typeof svgString !== 'string') return svgString;

  const isDark = style === 'industrial_light' ? false : isDarkMode;
  const brandAccent = '#e73f07';
  const reticleColor = style === 'blueprint' ? '#3b82f6' : brandAccent;
  const brandBorder = style === 'blueprint' ? '#1e3a5f' : isDark ? '#2a2a2a' : '#d4d4d8';
  const brandSurface = style === 'blueprint' ? '#0d1522' : isDark ? '#111111' : '#ffffff';
  const textPrimary = isDark ? '#f3f3f2' : '#0a0a0a';

  if (typeof DOMParser === 'undefined') return svgString;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return svgString;

    // 1. Ensure or create <defs>
    let defsEl = svgEl.querySelector('defs');
    if (!defsEl) {
      defsEl = doc.createElementNS('http://www.w3.org/2000/svg', 'defs');
      svgEl.insertBefore(defsEl, svgEl.firstChild);
    }

    // 2. Inject self-contained Web Fonts & Tactical Styles inside <defs><style>
    const styleEl = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
    styleEl.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&family=Roboto:wght@400;700;900&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap');

      .araskova-reticle {
        stroke: ${reticleColor};
        stroke-width: 1.5px;
        stroke-linecap: square;
        fill: none;
      }
      .araskova-status-dot {
        fill: ${brandAccent};
        filter: drop-shadow(0 0 3px ${brandAccent});
      }
      .araskova-node-frame {
        stroke: ${brandBorder} !important;
        fill: ${brandSurface} !important;
      }
      .araskova-text-primary {
        fill: ${textPrimary} !important;
      }
      .araskova-telemetry {
        font-family: 'Space Mono', ui-monospace, monospace !important;
        font-size: 8.5px !important;
        font-weight: 700 !important;
        letter-spacing: 0.15em !important;
        text-transform: uppercase !important;
        fill: ${reticleColor} !important;
      }
    `;
    defsEl.appendChild(styleEl);

    // 3. Inject custom precision Araskova arrowhead marker
    const markerEl = doc.createElementNS('http://www.w3.org/2000/svg', 'marker');
    markerEl.setAttribute('id', 'araskova-arrow-head');
    markerEl.setAttribute('viewBox', '0 0 10 10');
    markerEl.setAttribute('refX', '7');
    markerEl.setAttribute('refY', '5');
    markerEl.setAttribute('markerWidth', '6');
    markerEl.setAttribute('markerHeight', '6');
    markerEl.setAttribute('orient', 'auto-start-reverse');
    const markerPath = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    markerPath.setAttribute('d', 'M 0 1.5 L 8 5 L 0 8.5 L 2 5 Z');
    markerPath.setAttribute('fill', brandAccent);
    markerEl.appendChild(markerPath);
    defsEl.appendChild(markerEl);

    // 4. Transform Nodes: Add Tactical Corner Reticles (┌ ┐ └ ┘)
    // Query all flowchart and diagram node groups
    const nodeGroups = doc.querySelectorAll('g.node, g.actor, g.classGroup, g.stateGroup');
    const tickLen = 6.0; // Length of corner reticle arms

    nodeGroups.forEach((group, idx) => {
      // Find the primary bounding box for this node
      const rect = group.querySelector('rect');
      if (rect) {
        const x = parseFloat(rect.getAttribute('x') || '0');
        const y = parseFloat(rect.getAttribute('y') || '0');
        const w = parseFloat(rect.getAttribute('width') || '0');
        const h = parseFloat(rect.getAttribute('height') || '0');

        // Only add reticles to prominent nodes (width >= 40, height >= 25)
        if (w >= 40 && h >= 25) {
          // Tactical corner reticle paths
          const gReticles = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
          gReticles.setAttribute('class', 'araskova-reticle-group');
          gReticles.setAttribute('pointer-events', 'none');

          // Top-Left ┌
          const tl = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
          tl.setAttribute('d', `M ${x} ${y + tickLen} L ${x} ${y} L ${x + tickLen} ${y}`);
          tl.setAttribute('class', 'araskova-reticle');
          gReticles.appendChild(tl);

          // Top-Right ┐
          const tr = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
          tr.setAttribute('d', `M ${x + w - tickLen} ${y} L ${x + w} ${y} L ${x + w} ${y + tickLen}`);
          tr.setAttribute('class', 'araskova-reticle');
          gReticles.appendChild(tr);

          // Bottom-Left └
          const bl = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
          bl.setAttribute('d', `M ${x} ${y + h - tickLen} L ${x} ${y + h} L ${x + tickLen} ${y + h}`);
          bl.setAttribute('class', 'araskova-reticle');
          gReticles.appendChild(bl);

          // Bottom-Right ┘
          const br = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
          br.setAttribute('d', `M ${x + w - tickLen} ${y + h} L ${x + w} ${y + h} L ${x + w} ${y + h - tickLen}`);
          br.setAttribute('class', 'araskova-reticle');
          gReticles.appendChild(br);

          // Top-left status LED dot on entry/active nodes
          if (idx === 0 || idx % 3 === 0) {
            const led = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
            led.setAttribute('cx', `${x + 6}`);
            led.setAttribute('cy', `${y + 6}`);
            led.setAttribute('r', '2');
            led.setAttribute('class', 'araskova-status-dot');
            gReticles.appendChild(led);
          }

          group.appendChild(gReticles);
        }
      }
    });

    // 5. Stylize Subgraphs / Clusters with // [SYSTEM: NAME] Header Bar
    const clusterGroups = doc.querySelectorAll('g.cluster');
    clusterGroups.forEach(cluster => {
      const clusterRect = cluster.querySelector('rect');
      const clusterText = cluster.querySelector('text, span, .nodeLabel');
      if (clusterRect && clusterText) {
        const cx = parseFloat(clusterRect.getAttribute('x') || '0');
        const cy = parseFloat(clusterRect.getAttribute('y') || '0');
        const cw = parseFloat(clusterRect.getAttribute('width') || '0');

        // Add sleek top-left machinery badge tab
        if (cw > 60) {
          const tab = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
          tab.setAttribute('x', `${cx + 8}`);
          tab.setAttribute('y', `${cy}`);
          tab.setAttribute('width', `${Math.min(cw - 16, 110)}`);
          tab.setAttribute('height', '3');
          tab.setAttribute('fill', brandAccent);
          tab.setAttribute('rx', '1.5');
          cluster.insertBefore(tab, clusterRect.nextSibling);
        }

        // Format cluster label text with technical slash prefix
        const rawContent = clusterText.textContent?.trim() || '';
        if (rawContent && !rawContent.startsWith('//')) {
          clusterText.textContent = `// SYS.${rawContent.toUpperCase()}`;
        }
      }
    });

    // 6. Update all line markers to Araskova Orange
    const pathsWithMarker = doc.querySelectorAll('path[marker-end]');
    pathsWithMarker.forEach(p => {
      p.setAttribute('marker-end', 'url(#araskova-arrow-head)');
    });

    // 7. Serialize modified SVG back to string
    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc);
  } catch (err) {
    // If DOMParser fails or is restricted, fallback to raw svg string safely
    return svgString;
  }
}

/**
 * Curated deep-tech architecture templates showcasing the Araskova design aesthetic.
 */
export const ARASKOVA_DIAGRAM_TEMPLATES = [
  {
    id: 'pipeline',
    name: 'Vigil Perception Pipeline',
    desc: 'Autonomous multi-spectral defect detection & neural perception',
    type: 'Flowchart',
    code: `graph TD
    classDef hardware fill:#141414,stroke:#2a2a2a,stroke-width:1.5px;
    classDef neural fill:#1c1310,stroke:#e73f07,stroke-width:2px;
    classDef telemetry fill:#111111,stroke:#2a2a2a,stroke-width:1.5px;

    subgraph INGESTION ["// Edge Ingestion Cluster"]
        A[RGB Camera Feed] --> B[Frame Demuxer]
        C[IR Thermal Sensor] --> B
    end

    subgraph INFERENCE ["// Neural Perception Engine"]
        B -->|RAW 120FPS| D[TensorRT Backbone]:::neural
        D -->|Feature Map| E[Vigil Defect Head]:::neural
        D -->|Bounding Box| F[Spatial Locator]:::neural
    end

    subgraph TELEMETRY ["// Realtime Action & Telemetry"]
        E -->|ALERT| G[Pneumatic Rejector]:::hardware
        F -->|COORDINATES| H[Robotic Arm Controller]:::hardware
        E -->|LOG_STREAM| I[Cerberus Audit Trail]:::telemetry
    end`,
  },
  {
    id: 'drone_grid',
    name: 'Argus Autonomous Drone Grid',
    desc: 'Distributed swarm telemetry & edge mesh coordination',
    type: 'Architecture',
    code: `graph LR
    subgraph PERIMETER ["// Tactical Perimeter"]
        UAV1[Argus Drone Alpha] -->|P2P MESH| GW[Tactical Gateway Node]
        UAV2[Argus Drone Bravo] -->|P2P MESH| GW
        UAV3[Argus Drone Charlie] -->|P2P MESH| GW
    end

    subgraph EDGE_COMPUTE ["// Field Edge Compute"]
        GW -->|ENCRYPTED STREAM| PROC[Edge AI Processor]
        PROC -->|SPATIAL MAP| LOC[Local Coordinate Fusion]
    end

    subgraph COMMAND ["// Command & Control Center"]
        LOC -->|SATELLITE DOWNLINK| C2[HQ Defense Console]
        C2 -->|TASKING ORDERS| GW
    end`,
  },
  {
    id: 'quantum_protocol',
    name: 'Cerberus Quantum-Safe Protocol',
    desc: 'Post-Quantum Key Encapsulation (NIST ML-KEM-768) handshake',
    type: 'Sequence',
    code: `sequenceDiagram
    autonumber
    actor Alice as Aerial Edge Node
    actor Vault as Cerberus Hardware Vault
    actor Bob as Field Terminal

    Note over Alice,Bob: NIST ML-KEM-768 Post-Quantum Handshake
    Alice->>Vault: Request Ephemeral Public Key (KEM.KeyGen)
    Vault-->>Alice: Return pk_vault (768-bit lattice)
    Alice->>Alice: KEM.Encaps(pk_vault) -> (c, ss_alice)
    Alice->>Bob: Transmit Ciphertext c + MAC
    Bob->>Vault: Decapsulate Ciphertext c (KEM.Decaps)
    Vault-->>Bob: Shared Secret ss_bob
    Note over Alice,Bob: AES-256-GCM Symmetrical Tunnel Established
    Alice-)Bob: Encrypted Telemetry Frame [120 FPS]`,
  },
  {
    id: 'state_machine',
    name: 'Hardware Target Acquisition',
    desc: 'Military sensor tracking, thermal lock, and engagement state machine',
    type: 'State Diagram',
    code: `stateDiagram-v2
    [*] --> Standby: System Init [001]
    Standby --> Scanning: Radar Pulse Active
    Scanning --> Tracking: Candidate Acquired
    Tracking --> ThermalLock: IR Contrast > 88%
    Tracking --> Scanning: Target Lost
    ThermalLock --> Engaged: Fire Control Authorization
    Engaged --> TargetNeutralized: Impact Confirmed
    TargetNeutralized --> Standby: Reset Subsystem
    Engaged --> Standby: Abort Command`,
  },
  {
    id: 'class_hierarchy',
    name: 'Perception Engine Entities',
    desc: 'Core vision models, vector anchors, and spatial bounding primitives',
    type: 'Class Diagram',
    code: `classDiagram
    class SensorFrame {
        +UUID frame_id
        +Timestamp capture_time
        +Dimensions resolution
        +get_luminance() float
    }
    class BoundingReticle {
        +float x
        +float y
        +float width
        +float height
        +float confidence_score
        +render_corners() void
    }
    class DefectClassification {
        +String anomaly_type
        +SeverityLevel severity
        +calculate_drift() float
    }
    SensorFrame <|-- ThermalFrame
    SensorFrame *-- BoundingReticle
    BoundingReticle o-- DefectClassification`,
  },
];
