/* Progressive enhancement, based on the user's working mechanic A.
   Facebook owns its toolbar. There is no web API that confirms it is hidden.
   A trusted upward gesture + document scroll is the tested trigger. A viewport
   increase after a programmatic probe is only a heuristic, labelled as such.
   No synthetic gestures, History API changes or global touch cancellation. */
(() => {
  'use strict';
  const root = document.documentElement;
  const shell = document.querySelector('#landing-shell');
  const releaseButton = document.querySelector('#iab-release');
  const query = new URLSearchParams(location.search);
  const mode = root.dataset.iabMode || 'off';
  const threshold = Math.min(160, Math.max(40, Number(query.get('iab_threshold')) || 40));
  const forced = root.dataset.iabForced === 'true';
  const hasDynamicUnits = window.CSS && CSS.supports('height', '100dvh');
  let stopped = mode === 'off';
  let locked = false;
  let probe = null;
  let gesture = null;
  let recentGestureUntil = 0;
  let fullscreenAttempted = false;
  let resizeFrame = 0;
  let debug = null;

  root.setAttribute('data-iab-ready', 'true');
  // Recover if the fail-open timeout fired while this file was still loading.
  if (!stopped) root.classList.add('iab-armed');
  if (query.get('iab_debug') === '1') {
    debug = document.createElement('output');
    debug.id = 'iab-debug';
    document.body.appendChild(debug);
  }

  function viewport() {
    const vv = window.visualViewport;
    return { width: window.innerWidth, height: vv ? vv.height : window.innerHeight, scale: vv ? vv.scale : 1 };
  }

  function status(state, reason) {
    root.dataset.iabState = state;
    root.dataset.iabReason = reason;
    if (debug) debug.textContent = `${mode} · ${state} · ${reason} · y:${Math.round(window.scrollY)} · h:${Math.round(viewport().height)}`;
  }

  function size() {
    if (!hasDynamicUnits) root.style.setProperty('--view-height', `${window.innerHeight}px`);
    if (debug) status(root.dataset.iabState, root.dataset.iabReason || 'ready');
  }

  function cancelProbe() {
    if (!probe) return;
    clearTimeout(probe.timer);
    probe = null;
  }

  function lock(reason) {
    if (locked || stopped) return;
    cancelProbe();
    // Preserve a short-screen content offset, while a sticky shell stays at 0.
    const offset = Math.max(0, -shell.getBoundingClientRect().top);
    locked = true;
    root.classList.add('iab-locked');
    shell.scrollTop = offset;
    releaseButton.hidden = false;
    status('locked', reason);
  }

  function release() {
    cancelProbe();
    stopped = true;
    locked = false;
    gesture = null;
    root.classList.remove('iab-locked', 'iab-armed');
    releaseButton.hidden = true;
    if (document.fullscreenElement && document.exitFullscreen) {
      Promise.resolve(document.exitFullscreen()).catch(() => {});
    }
    window.scrollTo(0, 0);
    status('released', 'user');
  }

  function tryFullscreen() {
    if (fullscreenAttempted || !root.requestFullscreen || !document.fullscreenEnabled) return;
    // Call synchronously inside the trusted click; activation expires across tasks.
    fullscreenAttempted = true;
    try {
      Promise.resolve(root.requestFullscreen({ navigationUI: 'hide' }))
        .then(() => {
          if (document.fullscreenElement === root && !stopped) lock('fullscreen-api');
        })
        .catch(() => { if (!locked && !stopped) status('armed', 'fullscreen-unavailable'); });
    } catch (_) { status('armed', 'fullscreen-unavailable'); }
  }

  function scrollProbe(source) {
    if (stopped || locked || probe || document.hidden || viewport().scale !== 1) return;
    const before = viewport();
    const startY = window.scrollY;
    const attempt = { timer: 0, startY };
    probe = attempt;
    status('probing', source);
    window.scrollTo(0, startY + Math.max(60, threshold));
    attempt.timer = window.setTimeout(() => {
      if (probe !== attempt || stopped || locked) return;
      probe = null;
      const after = viewport();
      if (Math.abs(after.width - before.width) < 4 && after.scale === 1 && after.height - before.height >= 24) {
        lock(`${source}-viewport-heuristic`);
      } else {
        // No evidence of extra screen space: keep the root scrollable for A.
        window.scrollTo(0, startY);
        status('armed', `${source}-fallback-swipe`);
      }
    }, 650);
  }

  function checkGesture() {
    if (stopped || locked || !gesture || performance.now() > recentGestureUntil || viewport().scale !== 1) return;
    if (gesture.upward && window.scrollY - gesture.scrollY >= threshold) lock('native-scroll');
  }

  function touchStart(event) {
    if (stopped || locked || !event.isTrusted) return;
    cancelProbe();
    if (event.touches.length !== 1) { gesture = null; return; }
    const touch = event.touches[0];
    gesture = { x: touch.clientX, y: touch.clientY, scrollY: window.scrollY, upward: false };
    recentGestureUntil = performance.now() + 2000;
    status('armed', 'touch');
  }

  function touchMove(event) {
    if (stopped || locked || !gesture || !event.isTrusted) return;
    if (event.touches.length !== 1) { gesture = null; return; }
    const touch = event.touches[0];
    const dy = gesture.y - touch.clientY;
    gesture.upward = dy > 12 && dy > Math.abs(touch.clientX - gesture.x);
    recentGestureUntil = performance.now() + 1500;
    checkGesture();
  }

  window.addEventListener('scroll', checkGesture, { passive: true });
  document.addEventListener('touchstart', touchStart, { passive: true });
  document.addEventListener('touchmove', touchMove, { passive: true });
  document.addEventListener('touchcancel', () => { gesture = null; }, { passive: true });
  document.addEventListener('touchend', () => { recentGestureUntil = performance.now() + 1000; }, { passive: true });
  // Wheel input is useful for desktop QA of an explicitly forced mode only.
  document.addEventListener('wheel', (event) => {
    if (!forced || stopped || locked || !event.isTrusted || event.deltaY <= 0) return;
    cancelProbe();
    if (!gesture || performance.now() > recentGestureUntil) gesture = { scrollY: window.scrollY, upward: true };
    recentGestureUntil = performance.now() + 1000;
  }, { passive: true });

  document.addEventListener('click', (event) => {
    if (mode === 'swipe' || stopped || locked || !event.isTrusted || !(event.target instanceof Element)) return;
    if (!event.target.closest('.next-step')) return;
    tryFullscreen();
    scrollProbe('button');
  });
  releaseButton.addEventListener('click', release);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && locked) release(); });
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement === root) lock('fullscreen-api');
    else if (locked && root.dataset.iabReason === 'fullscreen-api') release();
  });
  const onResize = () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(size);
  };
  window.addEventListener('resize', onResize, { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    cancelProbe();
    gesture = null;
    size();
    // A browser-history restore is not a fresh gesture and may restore toolbar UI.
    if (!stopped) {
      locked = false;
      root.classList.remove('iab-locked');
      releaseButton.hidden = true;
      status('armed', 'history-restore');
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Don't leave a pending probe or stale gesture alive while the app is backgrounded.
      if (probe) { const y = probe.startY; cancelProbe(); window.scrollTo(0, y); status('armed', 'background-cancelled'); }
      gesture = null;
    }
  });
  size();
  status(stopped ? 'off' : 'armed', 'ready');
  if (mode === 'auto') requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!gesture) scrollProbe('load');
  }));
})();
