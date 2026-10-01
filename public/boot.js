// Aerial boot screen controller.
//
// Loaded as a classic same-origin script so it runs before the app bundle and
// satisfies the CSP (no inline scripts). It applies the saved theme before
// first paint, then exposes `window.__aerialBoot(phase, detail)` which the app
// calls as each real start-up phase completes:
//
//   engine → board → fonts → ready      (or 'error')
//
// The overlay leaves only once the app is ready *and* the intro animation has
// finished, so it never pops or flashes on fast machines.
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
  if (!el) return;
  var bar = el.querySelector('.ab-bar i');
  var caption = el.querySelector('.ab-caption');
  var started = performance.now();
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var INTRO_MS = reduced ? 0 : 1050;
  var progress = 0.04;
  var finished = false;

  var PHASES = {
    engine: [0.38, 'Warming up the engine…'],
    board: [0.72, 'Opening your board…'],
    fonts: [0.9, 'Sharpening pencils…'],
    ready: [1, 'Ready'],
  };

  function setCaption(text) {
    if (!caption || caption.textContent === text) return;
    caption.classList.add('ab-swap');
    setTimeout(function () {
      caption.textContent = text;
      caption.classList.remove('ab-swap');
    }, 140);
  }

  function setProgress(p, fast) {
    progress = Math.max(progress, p);
    if (!bar) return;
    if (fast) bar.style.transitionDuration = '0.24s';
    bar.style.transform = 'scaleX(' + progress + ')';
    el.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
  }

  function dismiss(delay) {
    if (finished) return;
    finished = true;
    setTimeout(function () {
      el.classList.add('ab-done');
      var remove = function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      };
      el.addEventListener('transitionend', function (e) {
        if (e.target === el && e.propertyName === 'opacity') remove();
      });
      setTimeout(remove, 800); // in case transitionend never fires
    }, delay);
  }

  window.__aerialBoot = function (phase, detail) {
    if (finished) return;
    if (phase === 'error') {
      el.classList.add('ab-error');
      setCaption(detail ? 'Something went wrong — ' + String(detail).slice(0, 80) : 'Something went wrong');
      setProgress(1, true);
      dismiss(1800); // reveal the app's own error UI
      return;
    }
    var spec = PHASES[phase];
    if (!spec) return;
    setProgress(spec[0], phase === 'ready');
    setCaption(spec[1]);
    if (phase === 'ready') {
      var wait = Math.max(0, INTRO_MS - (performance.now() - started));
      dismiss(wait + 260); // let the bar visibly reach the end
    }
  };

  // Start creeping immediately: the engine download is the first real phase.
  requestAnimationFrame(function () {
    window.__aerialBoot('engine');
  });

  // Never trap the user behind the splash if the app fails silently.
  setTimeout(function () {
    if (!finished) dismiss(0);
  }, 20000);
})();
