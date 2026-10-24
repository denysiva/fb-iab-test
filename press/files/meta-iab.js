/* v5 timing experiment. The test variable is WHEN the same scroll is requested:
   press = touchstart while a finger is down; click = after release. Neither
   request manufactures a native pan. Meta's toolbar remains outside DOM control.
   No History API changes, synthetic quiz clicks, or touch cancellation. */
(() => {
  'use strict';
  const root = document.documentElement;
  const shell = document.querySelector('#landing-shell');
  const releaseButton = document.querySelector('#iab-release');
  const query = new URLSearchParams(location.search);
  const mode = root.dataset.iabMode || 'off';
  const forced = root.dataset.iabForced === 'true';
  const debugEnabled = query.get('iab_debug') === '1';
  const threshold = 40;
  let stopped = mode === 'off';
  let locked = false;
  let touching = false;
  let gesture = null;
  let probe = null;
  let resizeFrame = 0;
  let attempts = 0;
  let lastPress = null;
  let lockViewport = null;
  let verdict = 'not-observed';
  let lastScrollLog = -Infinity;
  const timeline = [];

  function viewport() {
    const vv = window.visualViewport;
    return { width: window.innerWidth, height: vv ? vv.height : window.innerHeight, scale: vv ? vv.scale : 1 };
  }
  function snapshot() {
    const v = viewport();
    return { t: Math.round(performance.now()), step: shell.dataset.step || '1', y: Math.round(window.scrollY),
      innerHeight: window.innerHeight, visualHeight: Math.round(v.height), width: v.width, scale: v.scale,
      touching, state: root.dataset.iabState, reason: root.dataset.iabReason };
  }
  function record(event, extra = {}) {
    if (!debugEnabled) return;
    timeline.push({ event, ...snapshot(), ...extra });
    if (timeline.length > 200) timeline.shift();
  }
  function status(state, reason) {
    root.dataset.iabState = state;
    root.dataset.iabReason = reason;
    record('state');
  }
  function cancelProbe(reason) {
    if (!probe) return;
    clearTimeout(probe.timer);
    record('probe-end', { outcome: reason });
    probe = null;
  }
  function lock(reason) {
    if (stopped || locked) return;
    cancelProbe('layer-activated');
    const offset = Math.max(0, -shell.getBoundingClientRect().top);
    locked = true;
    lockViewport = viewport();
    root.classList.add('iab-locked');
    shell.scrollTop = offset;
    releaseButton.hidden = false;
    status('locked', reason);
  }
  function rearm(reason) {
    cancelProbe(reason);
    gesture = null;
    touching = false;
    locked = false;
    lockViewport = null;
    root.classList.remove('iab-locked');
    releaseButton.hidden = true;
    if (!stopped) status('armed', reason);
  }
  function release() {
    rearm('user-release');
    stopped = true;
    root.classList.remove('iab-armed');
    root.style.removeProperty('--iab-track-height');
    window.scrollTo(0, 0);
    status('released', 'user');
  }
  function eligible(target) {
    if (!(target instanceof Element)) return null;
    const button = target.closest('.next-step');
    return button && shell.contains(button) && !button.disabled && button.closest('.step.active') ? button : null;
  }
  function keyboardOpen() {
    const el = document.activeElement;
    return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  }
  function startProbe(source, button) {
    if (stopped || locked || document.hidden || viewport().scale !== 1 || keyboardOpen()) return;
    cancelProbe('new-attempt');
    const before = viewport();
    const startY = window.scrollY;
    const targetY = Math.ceil(startY + 96);
    const startTime = performance.now();
    root.style.setProperty('--iab-track-height', `${Math.ceil(targetY + before.height * 2)}px`);
    const current = { timer: 0, before, startY, startTime, lastHeight: before.height, lastChange: startTime };
    probe = current;
    attempts += 1;
    root.dataset.iabAttempts = String(attempts);
    root.dataset.iabAttemptStep = shell.dataset.step || '1';
    root.dataset.iabTrigger = source;
    root.dataset.iabFingerAtRequest = String(touching);
    // Exclude our own requested displacement from the later real-swipe fallback.
    if (gesture) gesture.scrollY = targetY;
    status('probing', source);
    record('scroll-request', { targetY, fingerAtRequest: touching });
    window.scrollTo(0, targetY);
    record('scroll-request-returned');
    function inspect() {
      if (probe !== current || stopped || locked) return;
      const after = viewport();
      const now = performance.now();
      if (Math.abs(after.width - before.width) >= 4 || after.scale !== 1 || document.hidden || keyboardOpen()) {
        cancelProbe('viewport-context-changed');
        status('armed', 'probe-cancelled');
        return;
      }
      if (Math.abs(after.height - current.lastHeight) > 1) {
        current.lastChange = now;
        current.lastHeight = after.height;
      }
      const dy = window.scrollY - startY;
      const dh = after.height - before.height;
      root.dataset.iabScrollDelta = String(Math.round(dy));
      root.dataset.iabHeightDelta = String(Math.round(dh));
      // Don't freeze the touched control under the finger. Let its click happen,
      // and let viewport animation settle. Growth is a heuristic, NOT a verdict.
      if (!touching && dy >= threshold && dh >= 24 && now - current.lastChange >= 160) {
        lock('viewport-growth-heuristic');
        return;
      }
      if (now - startTime >= 1600) {
        cancelProbe('no-stable-expansion');
        status('armed', 'no-expansion-use-swipe');
        return;
      }
      current.timer = window.setTimeout(inspect, 80);
    }
    current.timer = window.setTimeout(inspect, 80);
    lastPress = { button, time: startTime, source };
  }
  function checkGesture() {
    if (stopped || locked || !gesture || performance.now() > gesture.validUntil || viewport().scale !== 1) return;
    // Require real finger travel AND root travel beyond our own scroll request.
    if (gesture.upward && gesture.dy >= threshold && window.scrollY - gesture.scrollY >= threshold) lock('native-swipe-unconfirmed');
  }
  document.addEventListener('touchstart', (event) => {
    if (stopped || !event.isTrusted) return;
    touching = event.touches.length > 0;
    record('touchstart', { trusted: event.isTrusted, fingers: event.touches.length });
    if (locked) return;
    cancelProbe('new-touch');
    if (event.touches.length !== 1) { gesture = null; return; }
    const point = event.touches[0];
    gesture = { x: point.clientX, y: point.clientY, dy: 0, scrollY: window.scrollY, upward: false, validUntil: performance.now() + 2000 };
    const button = eligible(event.target);
    if (mode === 'press' && button) startProbe('touchstart', button);
  }, { capture: true, passive: true });
  document.addEventListener('touchmove', (event) => {
    if (stopped || locked || !gesture || !event.isTrusted) return;
    if (event.touches.length !== 1) { gesture = null; return; }
    const point = event.touches[0];
    const dy = gesture.y - point.clientY;
    gesture.dy = dy;
    gesture.upward = dy > 12 && dy > Math.abs(point.clientX - gesture.x);
    gesture.validUntil = performance.now() + 1500;
    checkGesture();
  }, { passive: true });
  document.addEventListener('touchend', (event) => {
    if (!event.isTrusted) return;
    touching = event.touches.length > 0;
    if (gesture) gesture.validUntil = performance.now() + 1000;
    record('touchend');
    checkGesture();
  }, { passive: true });
  document.addEventListener('touchcancel', (event) => {
    if (!event.isTrusted) return;
    touching = event.touches.length > 0;
    gesture = null;
    record('touchcancel');
  }, { passive: true });
  document.addEventListener('pointercancel', (event) => {
    if (event.isTrusted) record('pointercancel', { pointerType: event.pointerType });
  }, { passive: true });
  document.addEventListener('mousedown', (event) => {
    // Desktop QA checks ordering and quiz operation, NOT native iPhone behavior.
    if (!forced || mode !== 'press' || !event.isTrusted || event.button !== 0 || touching) return;
    if (lastPress && performance.now() - lastPress.time < 2000 && lastPress.source === 'touchstart') return;
    const button = eligible(event.target);
    if (button) startProbe('mousedown-desktop-qa', button);
  }, { capture: true, passive: true });
  document.addEventListener('click', (event) => {
    if (stopped || locked || !event.isTrusted || mode === 'swipe') return;
    const button = eligible(event.target);
    if (!button) return;
    record('quiz-click', { trusted: event.isTrusted });
    if (mode === 'click') startProbe('click-after-release', button);
    // Preserve keyboard/accessibility input, which may have no touchstart.
    else if (mode === 'press' && event.detail === 0 && (!lastPress || performance.now() - lastPress.time > 2000 || lastPress.button !== button)) startProbe('keyboard-or-accessibility-click', button);
  }, { capture: true });
  window.addEventListener('scroll', () => {
    checkGesture();
    if (performance.now() - lastScrollLog > 80) { record('root-scroll'); lastScrollLog = performance.now(); }
  }, { passive: true });
  function size() {
    if (!window.CSS || !CSS.supports('height', '100dvh')) root.style.setProperty('--view-height', `${window.innerHeight}px`);
    const after = viewport();
    record('viewport');
    if (locked && lockViewport && (Math.abs(after.width - lockViewport.width) >= 4 || after.scale !== 1 || after.height < lockViewport.height - 24)) rearm('viewport-changed');
  }
  const onResize = () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(size); };
  window.addEventListener('resize', onResize, { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize, { passive: true });
  releaseButton.addEventListener('click', release);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && locked) release(); });
  window.addEventListener('pageshow', (event) => { if (event.persisted && !stopped) rearm('history-restore'); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelProbe('background'); gesture = null; touching = false; record('background');
      if (!stopped && !locked) status('armed', 'background');
    }
    else if (!stopped) rearm('foreground');
  });
  if (debugEnabled) {
    window.landingIABReport = Object.freeze({
      read: () => ({ version: 'press-v5', mode, userAgent: navigator.userAgent, page: location.pathname,
        verdict, attempts, current: snapshot(), timeline: timeline.map(item => ({ ...item })) }),
      mark: (value) => { if (['visible', 'hidden', 'returned', 'not-observed'].includes(value)) { verdict = value; record('human-observation', { verdict }); } }
    });
    const diagnostics = document.createElement('script');
    diagnostics.src = './files/iab-diagnostics.js';
    document.head.appendChild(diagnostics);
  }
  root.dataset.iabVersion = 'press-v5';
  root.setAttribute('data-iab-ready', 'true');
  if (!stopped) root.classList.add('iab-armed');
  size();
  status(stopped ? 'off' : 'armed', 'ready');
})();
