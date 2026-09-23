// ── Araskova Universal Design System — Mermaid & Architecture Diagram Engine ──
// High-contrast, razor-sharp technical blueprints with military-grade clarity.
// Zero blurry drop-shadows, zero cloudy filters, zero external font network blocking.

export type AraskovaDiagramStyle = 'brutalist' | 'blueprint' | 'industrial_light';

export interface MermaidThemeConfig {
  theme: 'base';
  themeVariables: Record<string, string | boolean | number>;
  themeCSS: string;
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
  const brandBorderActive = brandAccent;
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

    // Sequence Diagram
    actorBkg: brandSurface,
    actorBorder: brandBorder,
    actorTextColor: textPrimary,
    actorLineColor: brandBorder,
    signalColor: lineCol,
    signalTextColor: textPrimary,
    labelBoxBkgColor: brandSurfaceElevated,
    labelBoxBorderColor: brandBorder,
    labelTextColor: textPrimary,
    loopTextColor: textSecondary,
    noteBorderColor: brandBorderActive,
    noteBkgColor: isDark ? '#261712' : '#fff7ed',
    noteTextColor: isDark ? '#ffffff' : '#7c2d12',
    activationBorderColor: brandAccent,
    activationBkgColor: isDark ? '#3d1b11' : '#ffedd5',

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
      fill: ${textPrimary} !important;
      color: ${textPrimary} !important;
    }

    /* Edge Connectors & Technical Lines */
    .edgePath .path {
      stroke: ${lineCol} !important;
      stroke-width: 1.5px !important;
      stroke-linecap: square !important;
    }

    /* Sharp Arrowheads with Configurable Accent */
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

    /* Sequence Diagrams — Telemetry Cards */
    .actor {
      fill: ${brandSurface} !important;
      stroke: ${brandBorder} !important;
      stroke-width: 1.5px !important;
      rx: 3px !important;
      filter: none !important;
    }
    .actor text, text.actor {
      font-family: 'Inter', 'Roboto', sans-serif !important;
      font-weight: 700 !important;
      font-size: 12px !important;
      text-transform: uppercase !important;
      letter-spacing: 0.05em !important;
      fill: ${textPrimary} !important;
    }
    .actor-line {
      stroke: ${brandBorder} !important;
      stroke-dasharray: 3 3 !important;
      stroke-width: 1.5px !important;
    }
    .messageLine0, .messageLine1 {
      stroke: ${lineCol} !important;
      stroke-width: 1.5px !important;
    }
    .messageText {
      font-family: 'Space Mono', monospace !important;
      font-size: 10px !important;
      font-weight: 700 !important;
      letter-spacing: 0.06em !important;
      fill: ${textPrimary} !important;
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
  };
}

/**
 * Architectural SVG Post-Processor:
 * 1. Enforces explicit pixel width & height from viewBox so Image loading in canvas never produces 0x0.
 * 2. Purges any blurry drop-shadow filters or hazy styles.
 * 3. Injects custom precision arrowhead markers styled with the chosen accent color.
 * 4. Ensures cluster wireframes have clean technical // SYS. headers.
 */
export function applyAraskovaDiagramAesthetics(
  svgString: string,
  isDarkMode = true,
  style: AraskovaDiagramStyle = 'brutalist',
  customAccent?: string
): string {
  if (!svgString || typeof svgString !== 'string') return svgString;

  const isDark = style === 'industrial_light' ? false : style === 'blueprint' ? true : isDarkMode;
  const isBlueprint = style === 'blueprint';

  const brandAccent = customAccent || '#e73f07';
  const brandSurface = isBlueprint ? '#0c1524' : isDark ? '#18181b' : '#ffffff';
  const brandBorder = isBlueprint ? '#2563eb' : isDark ? '#3f3f46' : '#18181b';
  const textPrimary = isBlueprint ? '#ffffff' : isDark ? '#f4f4f5' : '#09090b';
  const lineCol = isBlueprint ? '#38bdf8' : isDark ? '#a1a1aa' : '#27272a';
  const clusterBkg = isBlueprint ? '#09101d' : isDark ? '#101012' : '#fafafa';

  if (typeof DOMParser === 'undefined') return svgString;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return svgString;

    // Remove any hardcoded background colors on root SVG
    svgEl.removeAttribute('style');
    svgEl.setAttribute('style', 'background: transparent !important;');

    // 1. Ensure explicit pixel dimensions from viewBox
    const vb = svgEl.getAttribute('viewBox');
    if (vb) {
      const parts = vb.trim().split(/[\s,]+/).map(parseFloat);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        svgEl.setAttribute('width', String(Math.round(parts[2])));
        svgEl.setAttribute('height', String(Math.round(parts[3])));
      }
    }

    // 2. Ensure or create <defs>
    let defsEl = svgEl.querySelector('defs');
    if (!defsEl) {
      defsEl = doc.createElementNS('http://www.w3.org/2000/svg', 'defs');
      svgEl.insertBefore(defsEl, svgEl.firstChild);
    }

    // 3. Inject our theme CSS into SVG <style id="araskova-theme-override">
    const { themeCSS } = getAraskovaMermaidConfig(isDarkMode, style, brandAccent);
    let themeStyleEl = svgEl.querySelector('#araskova-theme-override');
    if (!themeStyleEl) {
      themeStyleEl = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
      themeStyleEl.setAttribute('id', 'araskova-theme-override');
      svgEl.insertBefore(themeStyleEl, defsEl.nextSibling);
    }
    themeStyleEl.textContent = themeCSS;

    // 4. Update Node fills, strokes, and texts in DOM to guarantee theme sync
    const nodeShapes = doc.querySelectorAll('.node rect, .node circle, .node polygon, .node path');
    nodeShapes.forEach((el) => {
      const currentStroke = el.getAttribute('stroke') || '';
      const isAccent =
        currentStroke.toLowerCase().includes('e73f07') ||
        currentStroke.toLowerCase().includes('orange') ||
        (customAccent && currentStroke.toLowerCase() === customAccent.toLowerCase());
      if (isAccent) {
        el.setAttribute('stroke', brandAccent);
      } else {
        el.setAttribute('fill', brandSurface);
        el.setAttribute('stroke', brandBorder);
      }
      el.removeAttribute('filter');
    });

    const nodeTexts = doc.querySelectorAll('.node text, .nodeLabel, .node span, text.actor');
    nodeTexts.forEach((el) => {
      el.setAttribute('fill', textPrimary);
      (el as HTMLElement).style.color = textPrimary;
    });

    // 5. Update Clusters
    const clusterRects = doc.querySelectorAll('g.cluster rect');
    clusterRects.forEach((r) => {
      r.setAttribute('fill', clusterBkg);
      r.setAttribute('stroke', brandBorder);
      r.removeAttribute('filter');
    });

    // 6. Update Edges and Labels
    const edgePaths = doc.querySelectorAll('.edgePath .path, .flowchart-link');
    edgePaths.forEach((p) => {
      p.setAttribute('stroke', lineCol);
    });

    const edgeLabelRects = doc.querySelectorAll('.edgeLabel rect');
    edgeLabelRects.forEach((r) => {
      r.setAttribute('fill', isDark ? '#27272a' : '#ffffff');
      r.setAttribute('stroke', brandBorder);
    });

    // 7. Purge all drop-shadow filters from the SVG DOM to guarantee crispness
    const elementsWithFilter = doc.querySelectorAll('[filter]');
    elementsWithFilter.forEach(el => el.removeAttribute('filter'));

    // 8. Inject precision sharp arrowhead marker with chosen accent color
    let markerEl = doc.querySelector('#araskova-arrow-head');
    if (!markerEl) {
      markerEl = doc.createElementNS('http://www.w3.org/2000/svg', 'marker');
      markerEl.setAttribute('id', 'araskova-arrow-head');
      markerEl.setAttribute('viewBox', '0 0 10 10');
      markerEl.setAttribute('refX', '7');
      markerEl.setAttribute('refY', '5');
      markerEl.setAttribute('markerWidth', '6');
      markerEl.setAttribute('markerHeight', '6');
      markerEl.setAttribute('orient', 'auto-start-reverse');
      const markerPath = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      markerPath.setAttribute('d', 'M 0 2 L 7 5 L 0 8 Z');
      markerPath.setAttribute('fill', brandAccent);
      markerEl.appendChild(markerPath);
      defsEl.appendChild(markerEl);
    } else {
      const p = markerEl.querySelector('path');
      if (p) p.setAttribute('fill', brandAccent);
    }

    // 9. Update all line markers to the configured accent
    const pathsWithMarker = doc.querySelectorAll('path[marker-end]');
    pathsWithMarker.forEach(p => {
      p.setAttribute('marker-end', 'url(#araskova-arrow-head)');
    });

    // 10. Stylize Subgraphs / Clusters with crisp // SYS.<NAME> Header Bar
    const clusterGroups = doc.querySelectorAll('g.cluster');
    clusterGroups.forEach(cluster => {
      const clusterRect = cluster.querySelector('rect');
      const clusterText = cluster.querySelector('text, span, .nodeLabel');
      if (clusterRect && clusterText) {
        const cx = parseFloat(clusterRect.getAttribute('x') || '0');
        const cy = parseFloat(clusterRect.getAttribute('y') || '0');
        const cw = parseFloat(clusterRect.getAttribute('width') || '0');

        let tab = cluster.querySelector('.araskova-cluster-tab');
        if (cw > 50) {
          if (!tab) {
            tab = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
            tab.setAttribute('class', 'araskova-cluster-tab');
            cluster.insertBefore(tab, clusterRect.nextSibling);
          }
          tab.setAttribute('x', `${cx + 6}`);
          tab.setAttribute('y', `${cy}`);
          tab.setAttribute('width', `${Math.min(cw - 12, 60)}`);
          tab.setAttribute('height', '2.5');
          tab.setAttribute('fill', brandAccent);
          tab.setAttribute('rx', '1');
        }

        const rawContent = clusterText.textContent?.trim() || '';
        if (rawContent && !rawContent.startsWith('//')) {
          clusterText.textContent = `// SYS.${rawContent.toUpperCase()}`;
        }
      }
    });

    // 11. Serialize modified SVG back to string
    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc);
  } catch (err) {
    return svgString;
  }
}

/**
 * Standard, production software & cloud architecture templates.
 * Zero proprietary secrets, zero weapon/internal codenames.
 */
export const ARASKOVA_DIAGRAM_TEMPLATES = [
  {
    id: 'microservices',
    name: 'Cloud Microservices',
    desc: 'API Gateway, Auth, Order & Inventory microservices with Kafka event bus',
    type: 'Flowchart',
    code: `graph TD
    classDef edge stroke:#3f3f46,stroke-width:1.5px;
    classDef accent stroke:#e73f07,stroke-width:2px;
    classDef storage stroke:#3f3f46,stroke-width:1.5px;

    subgraph CLIENT_TIER ["// Client Layer"]
        A[Web Frontend] --> G[API Gateway]
        B[Mobile Client] --> G
    end

    subgraph SERVICES ["// Microservices Mesh"]
        G -->|JWT AUTH| S1[Auth Service]:::accent
        G -->|REST / gRPC| S2[Order Service]:::accent
        G -->|CATALOG| S3[Product Service]:::accent
    end

    subgraph EVENT_BUS ["// Async Event Streaming"]
        S2 -->|ORDER_CREATED| K[Kafka Broker]
        K --> S4[Notification Service]
        K --> S5[Inventory Sync]
    end

    subgraph STORAGE ["// Persistence Layer"]
        S1 --> D1[(User Auth DB)]:::storage
        S2 --> D2[(Order Store)]:::storage
        S3 --> D3[(Redis Cache)]:::storage
    end`,
  },
  {
    id: 'event_stream',
    name: 'Real-Time Event Stream',
    desc: 'Multi-source stream ingestion, Apache Flink compute, and analytics sinks',
    type: 'Architecture',
    code: `graph LR
    subgraph INGESTION ["// Ingestion Sources"]
        IOT[IoT Edge Sensors] -->|MQTT| GW[Stream Gateway]
        APP[Web App Telemetry] -->|HTTP / JSON| GW
        CDC[Database CDC Logs] -->|Debezium| GW
    end

    subgraph STREAM_PROCESSOR ["// Real-Time Compute"]
        GW -->|PARTITIONED TOPIC| TOPIC[Kafka Event Cluster]
        TOPIC --> FLINK[Apache Flink Engine]
        FLINK -->|AGGREGATED METRICS| AN[Anomaly Detector]
    end

    subgraph SINKS ["// Data Destinations"]
        AN -->|ALERTS| SLACK[Incident Webhook]
        FLINK -->|TIMESERIES| TSDB[(ClickHouse Storage)]
        FLINK -->|RAW ARCHIVE| S3[(Object Storage / S3)]
    end`,
  },
  {
    id: 'oauth2_pkce',
    name: 'OAuth2 & PKCE Auth Flow',
    desc: 'Modern Single Page Application authorization with PKCE and JWT exchange',
    type: 'Sequence',
    code: `sequenceDiagram
    autonumber
    actor User as User Agent
    actor App as Single Page App (SPA)
    actor Auth as Identity Provider
    actor API as Resource Server

    Note over User,API: OAuth 2.0 Authorization Code Flow with PKCE
    App->>App: Generate code_verifier & code_challenge
    User->>App: Click 'Sign In'
    App->>Auth: GET /authorize?code_challenge=xyz&response_type=code
    Auth-->>User: Present Login & Consent Screen
    User->>Auth: Submit Credentials & Consent
    Auth-->>App: Redirect with authorization code
    App->>Auth: POST /oauth/token with code & code_verifier
    Auth-->>App: Return ID Token & Access Token (JWT)
    App->>API: GET /api/v1/profile with Bearer JWT
    API-->>App: Return 200 OK + User Profile JSON`,
  },
  {
    id: 'order_state',
    name: 'Order Lifecycle State Machine',
    desc: 'E-commerce transactional transitions from payment to delivery & return',
    type: 'State Diagram',
    code: `stateDiagram-v2
    [*] --> Draft: Cart Checkout
    Draft --> PendingPayment: Place Order
    PendingPayment --> PaymentFailed: Card Declined
    PaymentFailed --> PendingPayment: Retry Payment
    PaymentFailed --> Cancelled: Timeout (30m)
    PendingPayment --> Processing: Payment Authorized
    Processing --> Shipped: Package Dispatched
    Shipped --> Delivered: Carrier Confirmed
    Processing --> Refunded: Customer Cancellation
    Delivered --> Refunded: Return Accepted
    Delivered --> [*]
    Cancelled --> [*]
    Refunded --> [*]`,
  },
  {
    id: 'domain_entities',
    name: 'E-Commerce Domain Entities',
    desc: 'Standard clean domain architecture for customers, orders, and payment items',
    type: 'Class Diagram',
    code: `classDiagram
    class Customer {
        +UUID customer_id
        +String email
        +String full_name
        +get_order_history() List
    }
    class Order {
        +UUID order_id
        +DateTime created_at
        +Decimal total_amount
        +OrderStatus status
        +calculate_tax() Decimal
    }
    class LineItem {
        +UUID item_id
        +String sku
        +Int quantity
        +Decimal unit_price
    }
    class PaymentMethod {
        +UUID payment_id
        +String provider
        +String masked_pan
        +is_valid() Boolean
    }
    Customer "1" *-- "0..*" Order
    Order "1" *-- "1..*" LineItem
    Customer "1" o-- "1..*" PaymentMethod`,
  },
];
