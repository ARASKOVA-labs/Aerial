// ── SVG post-processing: Araskova look on any Mermaid / Aras SVG ─────────────

import { hslToHex, parseColorToHsl } from './colors';
import { getAraskovaMermaidConfig, type AraskovaDiagramStyle } from './config';

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

  let raw = svgString.trim();
  if (raw.startsWith('data:image/svg+xml;base64,')) {
    try {
      raw = decodeURIComponent(escape(atob(raw.replace('data:image/svg+xml;base64,', ''))));
    } catch (_) {}
  } else if (raw.startsWith('data:image/svg+xml;utf8,')) {
    raw = decodeURIComponent(raw.replace('data:image/svg+xml;utf8,', ''));
  }

  const isDark = style === 'industrial_light' ? false : style === 'blueprint' ? true : isDarkMode;
  const isBlueprint = style === 'blueprint';

  const brandAccent = customAccent || '#e73f07';
  const brandSurface = isBlueprint ? '#0c1524' : isDark ? '#18181b' : '#ffffff';
  const brandBorder = isBlueprint ? '#2563eb' : isDark ? '#3f3f46' : '#18181b';
  const textPrimary = isBlueprint ? '#ffffff' : isDark ? '#f4f4f5' : '#09090b';
  const lineCol = isBlueprint ? '#38bdf8' : isDark ? '#a1a1aa' : '#27272a';
  const clusterBkg = isBlueprint ? '#09101d' : isDark ? '#101012' : '#fafafa';

  if (typeof DOMParser === 'undefined') return raw;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(raw, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return raw;

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

    // 3b. Adapt light-mode pastel classDef fills in SVG <style> blocks when in dark mode
    const styleTags = doc.querySelectorAll('style:not(#araskova-theme-override)');
    styleTags.forEach((styleTag) => {
      let content = styleTag.textContent || '';
      if (isDark) {
        content = content.replace(/fill\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/gi, (match, color) => {
          const hsl = parseColorToHsl(color);
          if (hsl && hsl[2] >= 0.55) {
            // Light pastel fill detected in dark mode: map to rich dark machinery surface
            const darkHex = hslToHex(hsl[0], Math.min(hsl[1], 0.65), 0.12);
            return `fill: ${darkHex}`;
          }
          return match;
        });

        // Ensure internal style tags don't force dark text on sequence diagrams in dark mode
        content = content.replace(/(\.messageText[^{]*\{[^}]*fill\s*:\s*)[^;}]+/gi, `$1${textPrimary}`);
        content = content.replace(/(text\.actor[^{]*\{[^}]*fill\s*:\s*)[^;}]+/gi, `$1${textPrimary}`);
        content = content.replace(/(\.noteText[^{]*\{[^}]*fill\s*:\s*)[^;}]+/gi, `$1${textPrimary}`);
      }
      styleTag.textContent = content;
    });

    // 4. Update Node fills, strokes, and texts in DOM to guarantee theme sync
    const nodeShapes = doc.querySelectorAll(
      '.node rect, .node circle, .node polygon, .node path, .stateGroup rect, .statediagram-state rect, .statediagram-state circle, .classGroup rect'
    );
    nodeShapes.forEach((el) => {
      const nodeGroup = el.closest('g.node') || el.closest('.node') || el.closest('.stateGroup') || el.closest('.statediagram-state') || el.closest('.classGroup');
      const classes = (nodeGroup?.getAttribute('class') || '').split(/\s+/);
      const isCustomClass = classes.some(
        (c) => c && c !== 'node' && c !== 'default' && !c.startsWith('flowchart-') && !c.startsWith('statediagram-')
      );

      let inlineFill = el.getAttribute('fill') || '';
      const styleAttr = el.getAttribute('style') || '';
      const fillMatch = styleAttr.match(/fill\s*:\s*([^;]+)/i);
      if (fillMatch) inlineFill = fillMatch[1].trim();

      if (isDark && inlineFill) {
        const hsl = parseColorToHsl(inlineFill);
        if (hsl && hsl[2] >= 0.55) {
          const darkHex = hslToHex(hsl[0], Math.min(hsl[1], 0.65), 0.12);
          el.setAttribute('fill', darkHex);
          if (styleAttr) {
            el.setAttribute('style', styleAttr.replace(/fill\s*:\s*[^;]+/i, `fill: ${darkHex}`));
          }
        }
      }

      const currentStroke = el.getAttribute('stroke') || '';
      const isAccent =
        currentStroke.toLowerCase().includes('e73f07') ||
        currentStroke.toLowerCase().includes('orange') ||
        (customAccent && currentStroke.toLowerCase() === customAccent.toLowerCase());

      if (isAccent) {
        el.setAttribute('stroke', brandAccent);
      } else if (!isCustomClass && !inlineFill) {
        el.setAttribute('fill', brandSurface);
        el.setAttribute('stroke', brandBorder);
      }
      el.removeAttribute('filter');
    });

    const nodeTexts = doc.querySelectorAll(
      '.node text, .nodeLabel, .node span, text.actor, .stateGroup text, .stateGroup .state-title, .statediagram-state text, .classTitleText, .classText'
    );
    nodeTexts.forEach((el) => {
      // Dynamic Contrast Guard: Inspect parent node's background fill
      const nodeGroup = el.closest('g.node') || el.closest('.node') || el.closest('.stateGroup') || el.closest('.statediagram-state') || el.closest('.classGroup');
      let shapeFill = '';
      if (nodeGroup) {
        const shape = nodeGroup.querySelector('rect, circle, polygon, path');
        if (shape) {
          shapeFill = shape.getAttribute('fill') || '';
          const sAttr = shape.getAttribute('style') || '';
          const m = sAttr.match(/fill\s*:\s*([^;]+)/i);
          if (m) shapeFill = m[1].trim();
        }
      }

      const hsl = parseColorToHsl(shapeFill);
      // If effective background is light (lightness > 0.50), force high-contrast dark text
      if (hsl && hsl[2] > 0.50) {
        el.setAttribute('fill', '#0a0a0a');
        (el as HTMLElement).style.color = '#0a0a0a';
        (el as HTMLElement).style.fontWeight = '700';
      } else {
        el.setAttribute('fill', textPrimary);
        (el as HTMLElement).style.color = textPrimary;
      }
    });

    // 5. Update Clusters
    const clusterRects = doc.querySelectorAll('g.cluster rect');
    clusterRects.forEach((r) => {
      r.setAttribute('fill', clusterBkg);
      r.setAttribute('stroke', brandBorder);
      r.removeAttribute('filter');
    });

    // 6. Update Edges and Labels (Flowcharts & State Diagrams)
    const edgePaths = doc.querySelectorAll('.edgePath .path, .flowchart-link, .transition, path.transition');
    edgePaths.forEach((p) => {
      p.setAttribute('stroke', lineCol);
    });

    const edgeLabelRects = doc.querySelectorAll('.edgeLabel rect, .statediagram-transition rect');
    edgeLabelRects.forEach((r) => {
      r.setAttribute('fill', isDark ? '#27272a' : '#ffffff');
      r.setAttribute('stroke', brandBorder);
    });

    const edgeLabelTexts = doc.querySelectorAll('.edgeLabel text, .edgeLabel span, .statediagram-transition text');
    edgeLabelTexts.forEach((t) => {
      t.setAttribute('fill', brandAccent);
      (t as HTMLElement).style.color = brandAccent;
    });

    // 6b. Sequence Diagram Specific DOM Synchronizations
    // Stick figures (lines, circles, paths)
    const actorLines = doc.querySelectorAll('.actor line, .actor-man line, line.actor, line.actor-man, .actor path, .actor-man path');
    actorLines.forEach((l) => {
      l.setAttribute('stroke', isDark ? '#f4f4f5' : '#18181b');
      l.setAttribute('stroke-width', '1.5');
    });

    const actorCircles = doc.querySelectorAll('.actor circle, .actor-man circle, circle.actor, circle.actor-man');
    actorCircles.forEach((c) => {
      c.setAttribute('stroke', isDark ? '#f4f4f5' : '#18181b');
      c.setAttribute('fill', isDark ? '#27272a' : '#ffffff');
      c.setAttribute('stroke-width', '1.5');
    });

    const actorRects = doc.querySelectorAll('rect.actor, .actor rect');
    actorRects.forEach((r) => {
      r.setAttribute('fill', brandSurface);
      r.setAttribute('stroke', isDark ? '#f4f4f5' : brandBorder);
      r.setAttribute('stroke-width', '1.5');
      r.setAttribute('rx', '3');
      r.removeAttribute('filter');
    });

    // Actor text & tspans
    const actorTexts = doc.querySelectorAll(
      '.actor text, text.actor, text.actor-man, text.actor-top, text.actor-bottom, .actor-man text, text.actor tspan, text.actor-man tspan, [class*="actor"] text, [class*="actor"] tspan'
    );
    actorTexts.forEach((t) => {
      t.setAttribute('fill', textPrimary);
      (t as HTMLElement).style.fill = textPrimary;
      (t as HTMLElement).style.color = textPrimary;
    });

    // Lifelines (vertical actor lines)
    const lifelines = doc.querySelectorAll('.actor-line, line.actor-line');
    lifelines.forEach((l) => {
      l.setAttribute('stroke', isDark ? 'rgba(244, 244, 245, 0.3)' : 'rgba(24, 24, 27, 0.25)');
      l.setAttribute('stroke-width', '1.5');
      l.setAttribute('stroke-dasharray', '4 4');
    });

    // Message lines (signals)
    const messageLines = doc.querySelectorAll(
      '.messageLine0, .messageLine1, line.messageLine0, line.messageLine1, path.messageLine0, path.messageLine1, line[class*="messageLine"], path[class*="messageLine"]'
    );
    messageLines.forEach((m) => {
      m.setAttribute('stroke', isDark ? '#f4f4f5' : '#18181b');
      m.setAttribute('stroke-width', '1.5');
    });

    // Message text & tspans (ALL arrow labels!)
    const messageTexts = doc.querySelectorAll(
      '.messageText, text.messageText, text.messageText tspan, .messageText tspan, g.messageText text, g.messageText tspan'
    );
    messageTexts.forEach((mt) => {
      mt.setAttribute('fill', textPrimary);
      (mt as HTMLElement).style.fill = textPrimary;
      (mt as HTMLElement).style.color = textPrimary;
      (mt as HTMLElement).style.fontFamily = "'Space Mono', monospace";
      (mt as HTMLElement).style.fontWeight = '700';
    });

    // Note boxes & note texts
    const noteRects = doc.querySelectorAll('.note, rect.note');
    noteRects.forEach((nr) => {
      nr.setAttribute('fill', isDark ? '#18181b' : '#fff7ed');
      nr.setAttribute('stroke', brandAccent);
      nr.setAttribute('stroke-width', '1.5');
      nr.setAttribute('rx', '4');
      nr.removeAttribute('filter');
    });

    const noteTexts = doc.querySelectorAll(
      '.noteText, text.noteText, text.noteText tspan, .noteText tspan, .note text, .note tspan'
    );
    noteTexts.forEach((nt) => {
      const col = isDark ? '#f4f4f5' : '#7c2d12';
      nt.setAttribute('fill', col);
      (nt as HTMLElement).style.fill = col;
      (nt as HTMLElement).style.color = col;
      (nt as HTMLElement).style.fontWeight = '700';
    });

    // Sequence numbers
    const seqCircles = doc.querySelectorAll('.sequenceNumber, circle.sequenceNumber');
    seqCircles.forEach((sc) => {
      sc.setAttribute('fill', isDark ? '#18181b' : '#ffffff');
      sc.setAttribute('stroke', brandAccent);
      sc.setAttribute('stroke-width', '1.5');
    });

    const seqTexts = doc.querySelectorAll(
      'text.sequenceNumber, text.sequenceNumber tspan, .sequenceNumber text, .sequenceNumber tspan'
    );
    seqTexts.forEach((st) => {
      st.setAttribute('fill', brandAccent);
      (st as HTMLElement).style.fill = brandAccent;
      (st as HTMLElement).style.color = brandAccent;
      (st as HTMLElement).style.fontWeight = '800';
    });

    // 7. Purge all drop-shadow filters from the SVG DOM to guarantee crispness
    const elementsWithFilter = doc.querySelectorAll('[filter]');
    elementsWithFilter.forEach((el) => el.removeAttribute('filter'));

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
    const pathsWithMarker = doc.querySelectorAll('path[marker-end], line[marker-end]');
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
