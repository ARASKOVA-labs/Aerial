// Aerial boot screen.
//
// A spark writes the wordmark in a single-stroke script, trailing embers,
// inside a crop-mark frame, over a readout that tracks real start-up progress
// (the Araskova motion language: ink, bone and one signal orange).
//
// Loaded as a classic same-origin script so it runs before the app bundle and
// satisfies the CSP (no inline scripts). It applies the saved theme before
// first paint, then exposes `window.__aerialBoot(phase, detail)` which the app
// calls as each real start-up phase completes:
//
//   engine → board → fonts → ready      (or 'error')
//
// The overlay leaves only once the app is ready *and* the word is written, so
// it never pops or flashes on fast machines. Every frame is a pure function of
// time since start (particles are hashed, not random).
(function () {
  'use strict';

  var dark = false;
  try {
    dark = localStorage.getItem('aerial_dark_mode') === 'true';
  } catch (e) {
    // Storage blocked: fall back to the light theme.
  }
  var root = document.documentElement;
  root.setAttribute('data-boot-theme', dark ? 'dark' : 'light');
  root.style.colorScheme = dark ? 'dark' : 'light';
  if (dark) root.classList.add('dark');

  var el = document.getElementById('aerial-boot');
  var canvas = el && el.querySelector('canvas');
  var ctx = canvas && canvas.getContext('2d');
  var live = el && el.querySelector('.ab-live');
  var mark = window.__aerialWordmark;
  if (!el || !ctx || !mark) return;

  // ── Palette ──────────────────────────────────────────────────────────────
  var C = dark
    ? { bg: '#0a0a0b', ink: '#eee9df', dim: 'rgba(238,233,223,0.34)', faint: 'rgba(238,233,223,0.16)', label: 'rgba(238,233,223,0.55)' }
    : { bg: '#f7f5f0', ink: '#141416', dim: 'rgba(20,20,22,0.42)', faint: 'rgba(20,20,22,0.14)', label: 'rgba(20,20,22,0.55)' };
  var SIGNAL = [231, 63, 7]; // #e73f07, Araskova orange
  var EMBER = [255, 138, 61];
  var rgba = function (c, a) {
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  };

  // ── Timing ───────────────────────────────────────────────────────────────
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FRAME_IN = 0.55; // crop marks fly in
  var WRITE_AT = 0.25; // pen touches down
  var WRITE_S = 1.45; // time to write the word
  var INTRO_S = reduced ? 0 : WRITE_AT + WRITE_S + 0.15;
  var t0 = performance.now();
  var now = function () {
    return reduced ? 99 : (performance.now() - t0) / 1000;
  };

  // ── Helpers ──────────────────────────────────────────────────────────────
  var clamp = function (x, a, b) {
    return x < a ? a : x > b ? b : x;
  };
  var inOutCubic = function (t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };
  var outExpo = function (t) {
    return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
  };
  var hash = function (n, s) {
    var x = Math.sin(n * 127.1 + s * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  // Stroke lengths, so the pen can stop anywhere along the word.
  var strokes = mark.strokes.map(function (flat) {
    var pts = [];
    var lens = [0];
    for (var i = 0; i < flat.length; i += 2) {
      pts.push([flat[i], flat[i + 1]]);
      if (i) {
        var a = pts[pts.length - 2];
        var b = pts[pts.length - 1];
        lens.push(lens[lens.length - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
      }
    }
    return { pts: pts, lens: lens, len: lens[lens.length - 1] };
  });
  var starts = [];
  var total = strokes.reduce(function (acc, s) {
    starts.push(acc);
    return acc + s.len;
  }, 0);

  /** Pen position (in wordmark units) after writing `len` of the word. */
  function headAt(len) {
    for (var i = strokes.length - 1; i >= 0; i--) {
      if (len < starts[i]) continue;
      var s = strokes[i];
      var r = Math.min(len - starts[i], s.len);
      for (var j = 1; j < s.pts.length; j++) {
        if (s.lens[j] >= r) {
          var u = (r - s.lens[j - 1]) / Math.max(1e-6, s.lens[j] - s.lens[j - 1]);
          var a = s.pts[j - 1];
          var b = s.pts[j];
          return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
        }
      }
      return s.pts[s.pts.length - 1];
    }
    return strokes[0].pts[0];
  }

  // Writing speed eases in and out but keeps moving, like a hand.
  function writtenAt(t) {
    var p = clamp((t - WRITE_AT) / WRITE_S, 0, 1);
    return total * (0.12 * p + 0.88 * inOutCubic(p));
  }

  // ── Layout (CSS px) ──────────────────────────────────────────────────────
  var W = 0;
  var H = 0;
  var L = null;
  function layout() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var fw = Math.min(520, W - 48);
    var fh = Math.round(fw * 0.56);
    var fx = Math.round((W - fw) / 2);
    var fy = Math.round((H - fh) / 2) - 8;
    var scale = (fw * 0.62) / mark.w;
    L = {
      fx: fx,
      fy: fy,
      fw: fw,
      fh: fh,
      scale: scale,
      wx: Math.round(W / 2 - (mark.w * scale) / 2),
      wy: Math.round(fy + fh * 0.44 - (mark.h * scale) / 2),
      line: Math.max(2.2, scale * 0.036),
    };
  }

  // ── Progress (real phases from the app) ──────────────────────────────────
  var PHASES = {
    engine: [0.4, 'LOADING ENGINE'],
    board: [0.74, 'OPENING BOARD'],
    fonts: [0.92, 'SETTING TYPE'],
    ready: [1, 'READY'],
  };
  var target = 0.06;
  var shown = 0;
  var status = 'STARTING';
  var failed = false;
  var readyAt = -1;
  var leaving = -1;

  // ── Drawing ──────────────────────────────────────────────────────────────
  function cropMarks(t) {
    var k = inOutCubic(clamp(t / FRAME_IN, 0, 1));
    var out = leaving >= 0 ? inOutCubic(clamp((t - leaving) / 0.4, 0, 1)) : 0;
    var m = (1 - k) * -48 + out * -48; // inset: negative = outside the frame
    var arm = 18;
    ctx.save();
    ctx.globalAlpha = clamp(k * 2, 0, 1) * (1 - out);
    ctx.strokeStyle = C.dim;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    [
      [L.fx - m, L.fy - m, 1, 1],
      [L.fx + L.fw + m, L.fy - m, -1, 1],
      [L.fx - m, L.fy + L.fh + m, 1, -1],
      [L.fx + L.fw + m, L.fy + L.fh + m, -1, -1],
    ].forEach(function (c) {
      ctx.moveTo(c[0] + c[2] * arm, c[1] + 0.5);
      ctx.lineTo(c[0], c[1] + 0.5);
      ctx.lineTo(c[0], c[1] + c[3] * arm);
    });
    ctx.stroke();
    ctx.restore();
  }

  function word(len) {
    ctx.save();
    ctx.translate(L.wx, L.wy);
    ctx.scale(L.scale, L.scale);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = L.line / L.scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (var i = 0; i < strokes.length; i++) {
      if (starts[i] >= len) break;
      var s = strokes[i];
      var r = len - starts[i];
      ctx.moveTo(s.pts[0][0], s.pts[0][1]);
      for (var j = 1; j < s.pts.length; j++) {
        if (s.lens[j] <= r) {
          ctx.lineTo(s.pts[j][0], s.pts[j][1]);
        } else {
          var u = (r - s.lens[j - 1]) / Math.max(1e-6, s.lens[j] - s.lens[j - 1]);
          var a = s.pts[j - 1];
          var b = s.pts[j];
          ctx.lineTo(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u);
          break;
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  var toScreen = function (p) {
    return [L.wx + p[0] * L.scale, L.wy + p[1] * L.scale];
  };

  // Embers: born on a fixed clock at the pen's past positions, so each keeps
  // its identity frame to frame.
  function embers(t, until) {
    var RATE = 70;
    var LIFE = 0.5;
    var n0 = Math.floor((t - LIFE) * RATE);
    var n1 = Math.floor(Math.min(t, until) * RATE);
    ctx.save();
    if (dark) ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (var n = Math.max(n0, Math.ceil(WRITE_AT * RATE)); n <= n1; n++) {
      var tb = n / RATE;
      var age = t - tb;
      var life = LIFE * (0.35 + 0.65 * hash(n, 3));
      if (age < 0 || age > life) continue;
      var h = toScreen(headAt(writtenAt(tb)));
      var ang = hash(n, 1) * Math.PI * 2;
      var sp = 150 * (0.25 + Math.pow(hash(n, 2), 2) * 1.2);
      var vx = Math.cos(ang) * sp;
      var vy = Math.sin(ang) * sp - 45;
      var g = 420;
      var a0 = Math.max(0, age - 0.02);
      var k = 1 - age / life;
      ctx.strokeStyle = rgba(k > 0.6 ? EMBER : SIGNAL, Math.min(1, k * 1.3));
      ctx.lineWidth = 1.4 * (0.5 + k * 0.7);
      ctx.beginPath();
      ctx.moveTo(h[0] + vx * a0, h[1] + vy * a0 + 0.5 * g * a0 * a0);
      ctx.lineTo(h[0] + vx * age, h[1] + vy * age + 0.5 * g * age * age);
      ctx.stroke();
    }
    ctx.restore();
  }

  function spark(p, t, intensity) {
    var flick = 0.85 + 0.15 * Math.sin(t * 91.7) * Math.sin(t * 57.3);
    var I = intensity * flick;
    ctx.save();
    if (dark) ctx.globalCompositeOperation = 'lighter';
    var halo = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 16);
    halo.addColorStop(0, rgba(SIGNAL, 0.55 * I));
    halo.addColorStop(1, rgba(SIGNAL, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(p[0] - 16, p[1] - 16, 32, 32);
    ctx.fillStyle = rgba(EMBER, 0.95 * I);
    ctx.beginPath();
    ctx.arc(p[0], p[1], 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,248,236,' + I + ')';
    ctx.beginPath();
    ctx.arc(p[0], p[1], 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(EMBER, 0.7 * I);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 0; i < 4; i++) {
      var a = (i * Math.PI) / 2 + t * 3 + 0.4;
      ctx.moveTo(p[0] + Math.cos(a) * 6, p[1] + Math.sin(a) * 6);
      ctx.lineTo(p[0] + Math.cos(a) * 11, p[1] + Math.sin(a) * 11);
    }
    ctx.stroke();
    ctx.restore();
  }

  function readout(t) {
    var appear = clamp((t - 0.35) / 0.4, 0, 1);
    if (appear <= 0) return;
    var x = L.fx + 28;
    var bw = L.fw - 56;
    var y = L.fy + L.fh - 34;
    ctx.save();
    ctx.globalAlpha = appear;
    ctx.font = '500 10px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '2.5px';
    ctx.fillStyle = C.label;
    ctx.textAlign = 'left';
    ctx.fillText('AERIAL ' + (el.getAttribute('data-version') || ''), x, y - 12);
    ctx.textAlign = 'right';
    ctx.fillStyle = failed ? rgba([224, 49, 49], 1) : C.label;
    ctx.fillText(status, x + bw, y - 12);
    // Tick bar: ten divisions, every fifth taller, signal fill = progress.
    ctx.fillStyle = C.faint;
    ctx.fillRect(x, y, bw, 1);
    for (var i = 0; i <= 10; i++) {
      var tall = i % 5 === 0 ? 5 : 3;
      ctx.fillRect(Math.round(x + (bw * i) / 10), y - tall, 1, tall);
    }
    ctx.fillStyle = failed ? rgba([224, 49, 49], 1) : rgba(SIGNAL, 1);
    ctx.fillRect(x, y - 1, bw * shown, 3);
    ctx.restore();
  }

  // ── Loop ─────────────────────────────────────────────────────────────────
  var raf = 0;
  var last = performance.now();
  function frame() {
    var t = now();
    var dtMs = performance.now() - last;
    last = performance.now();
    shown += (target - shown) * (1 - Math.exp(-dtMs / 160));

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    cropMarks(t);
    var len = writtenAt(t);
    word(len);
    var writing = t >= WRITE_AT && len < total;
    var fade = clamp(1 - (t - (WRITE_AT + WRITE_S)) / 0.3, 0, 1);
    if (!reduced) {
      embers(t, WRITE_AT + WRITE_S);
      if (writing || fade > 0) spark(toScreen(headAt(len)), t, writing ? 1 : fade);
    }
    readout(t);

    if (readyAt < 0 || leaving < 0 || t - leaving < 0.6) raf = requestAnimationFrame(frame);
  }

  function setPhase(p, label) {
    target = Math.max(target, p);
    status = label;
    el.setAttribute('aria-valuenow', String(Math.round(target * 100)));
    if (live) live.textContent = label.charAt(0) + label.slice(1).toLowerCase();
  }

  function dismiss(delay) {
    if (leaving >= 0) return;
    setTimeout(function () {
      leaving = now();
      el.classList.add('ab-done');
      var remove = function () {
        cancelAnimationFrame(raf);
        if (el.parentNode) el.parentNode.removeChild(el);
      };
      el.addEventListener('transitionend', function (e) {
        if (e.target === el && e.propertyName === 'opacity') remove();
      });
      setTimeout(remove, 900); // in case transitionend never fires
    }, delay);
  }

  window.__aerialBoot = function (phase, detail) {
    if (leaving >= 0) return;
    if (phase === 'error') {
      failed = true;
      setPhase(1, 'ERROR' + (detail ? ' · ' + String(detail).slice(0, 40).toUpperCase() : ''));
      dismiss(1800); // reveal the app's own error UI
      return;
    }
    var spec = PHASES[phase];
    if (!spec) return;
    setPhase(spec[0], spec[1]);
    if (phase === 'ready') {
      readyAt = now();
      var wait = Math.max(0, INTRO_S - readyAt) * 1000;
      dismiss(wait + 280); // let the bar visibly reach the end
    }
  };

  layout();
  window.addEventListener('resize', layout);
  raf = requestAnimationFrame(frame);
  requestAnimationFrame(function () {
    window.__aerialBoot('engine');
  });

  // Never trap the user behind the splash if the app fails silently.
  setTimeout(function () {
    dismiss(0);
  }, 20000);
})();
