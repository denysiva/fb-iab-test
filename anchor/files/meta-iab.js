/* Experimental v4: the browser follows a REAL anchor from a trusted click.
   No scrollTo / scrollIntoView / fullscreen request in the button path.
   Facebook owns its toolbar; viewport growth is only an indirect observation.
   Keep the user's working upward-swipe fallback and a visible release control. */
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
  let navigation = null;
  let gesture = null;
  let recentGestureUntil = 0;
  let attempts = 0;
  let resizeFrame = 0;
  let debug = null;
  let anchor = null;

  root.setAttribute('data-iab-ready', 'true');
  root.dataset.iabVersion = 'anchor-v4';
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
    if (debug) debug.textContent = `v4 · ${mode} · ${state} · ${reason} · taps:${attempts} · step:${root.dataset.iabAttemptStep || '-'} · dy:${root.dataset.iabScrollDelta || '0'} · dh:${root.dataset.iabHeightDelta || '0'} · history:${root.dataset.iabHistoryDelta || '0'}`;
  }
  function size() {
    if (!hasDynamicUnits) root.style.setProperty('--view-height', `${window.innerHeight}px`);
    if (debug) status(root.dataset.iabState, root.dataset.iabReason || 'ready');
  }
  function cancelProbe() {
    if (probe) clearTimeout(probe.timer);
    probe = null;
  }
  function finishNavigation() {
    if (!navigation) return;
    const current = navigation;
    navigation = null;
    clearTimeout(current.timer);
    // A same-fragment anchor replaces the current entry. Restore its URL/state
    // after the default action, preserving query parameters and previous hash.
    // Never overwrite an unrelated navigation that happened in the meantime.
    if (location.href === current.targetURL) {
      try { history.replaceState(current.state, '', current.url); }
      catch (_) { root.dataset.iabNavigation = 'url-restore-failed'; }
    }
    root.dataset.iabHistoryDelta = String(history.length - current.length);
    if (current.keyboard) {
      const heading = shell.querySelector('.step.active .heading-block');
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    }
  }
  function lock(reason) {
    if (locked || stopped) return;
    cancelProbe();
    finishNavigation();
    const offset = Math.max(0, -shell.getBoundingClientRect().top);
    locked = true;
    root.classList.add('iab-locked');
    shell.scrollTop = offset;
    releaseButton.hidden = false;
    status('locked', reason);
  }
  function release() {
    cancelProbe();
    finishNavigation();
    stopped = true;
    locked = false;
    gesture = null;
    root.classList.remove('iab-locked', 'iab-armed');
    root.style.removeProperty('--iab-track-height');
    releaseButton.hidden = true;
    window.scrollTo(0, 0);
    status('released', 'user');
  }
  function startAnchor(event, control) {
    cancelProbe();
    finishNavigation();
    gesture = null;
    const before = viewport();
    const startY = window.scrollY;
    const targetY = Math.ceil(startY + Math.max(96, threshold));
    anchor.style.top = `${targetY}px`;
    // Leave sufficient real document space for every quiz path and later swipe.
    root.style.setProperty('--iab-track-height', `${Math.ceil(targetY + before.height * 2)}px`);
    const url = location.href;
    const target = new URL(url);
    target.hash = anchor.id;
    const current = { url, targetURL: target.href, state: history.state, length: history.length, keyboard: event.detail === 0, consumed: false, timer: 0 };
    try {
      // Without this, each anchor would add a Back entry. replaceState itself
      // does not scroll: the browser's actual link default action does that.
      history.replaceState(current.state, '', current.targetURL);
    } catch (_) {
      event.preventDefault();
      status('armed', 'anchor-unavailable');
      return;
    }
    control.href = current.targetURL;
    navigation = current;
    // Fragment navigation dispatches popstate synchronously before scrolling.
    // Clear the one-action exemption at the first task after this click.
    current.timer = window.setTimeout(finishNavigation, 0);
    attempts += 1;
    root.dataset.iabAttempts = String(attempts);
    root.dataset.iabAttemptStep = shell.dataset.step || '1';
    root.dataset.iabNavigation = 'pending-default-action';
    const attempt = { timer: 0 };
    probe = attempt;
    status('probing', 'native-anchor');
    attempt.timer = window.setTimeout(() => {
      if (probe !== attempt || stopped || locked) return;
      probe = null;
      const after = viewport();
      const dy = window.scrollY - startY;
      const dh = after.height - before.height;
      root.dataset.iabScrollDelta = String(Math.round(dy));
      root.dataset.iabHeightDelta = String(Math.round(dh));
      if (dy >= threshold && dh >= 24 && Math.abs(after.width - before.width) < 4 && after.scale === 1) {
        lock('anchor-viewport-heuristic');
      } else {
        // Movement alone is NOT proof that Meta hid its toolbar. Stay scrollable.
        status('armed', dy >= threshold ? 'anchor-no-expansion' : 'anchor-no-scroll');
      }
    }, 800);
  }
  // The existing vendor treats EVERY popstate as Back and redirects away.
  // Exempt only this click's one synchronous, exact-URL fragment event. Normal
  // Back/Forward and all later events still reach the existing integration.
  window.addEventListener('popstate', (event) => {
    if (!navigation || navigation.consumed || location.href !== navigation.targetURL) return;
    navigation.consumed = true;
    root.dataset.iabNavigation = 'native-default-action';
    event.stopImmediatePropagation();
  }, { capture: true });
  function checkGesture() {
    if (stopped || locked || !gesture || performance.now() > recentGestureUntil || viewport().scale !== 1) return;
    if (gesture.upward && window.scrollY - gesture.scrollY >= threshold) lock('native-scroll');
  }
  document.addEventListener('touchstart', (event) => {
    if (stopped || locked || !event.isTrusted) return;
    cancelProbe(); finishNavigation();
    if (event.touches.length !== 1) { gesture = null; return; }
    const touch = event.touches[0];
    gesture = { x: touch.clientX, y: touch.clientY, scrollY: window.scrollY, upward: false };
    recentGestureUntil = performance.now() + 2000;
    status('armed', 'touch');
  }, { passive: true });
  document.addEventListener('touchmove', (event) => {
    if (stopped || locked || !gesture || !event.isTrusted) return;
    if (event.touches.length !== 1) { gesture = null; return; }
    const touch = event.touches[0];
    const dy = gesture.y - touch.clientY;
    gesture.upward = dy > 12 && dy > Math.abs(touch.clientX - gesture.x);
    recentGestureUntil = performance.now() + 1500;
    checkGesture();
  }, { passive: true });
  document.addEventListener('touchcancel', () => { gesture = null; }, { passive: true });
  document.addEventListener('touchend', () => { recentGestureUntil = performance.now() + 1000; }, { passive: true });
  window.addEventListener('scroll', checkGesture, { passive: true });
  document.addEventListener('wheel', (event) => {
    if (!forced || stopped || locked || !event.isTrusted || event.deltaY <= 0) return;
    cancelProbe();
    if (!gesture || performance.now() > recentGestureUntil) gesture = { scrollY: window.scrollY, upward: true };
    recentGestureUntil = performance.now() + 1000;
  }, { passive: true });

  if (mode === 'anchor') {
    anchor = document.createElement('span');
    anchor.id = 'iab-anchor';
    anchor.setAttribute('aria-hidden', 'true');
    document.body.appendChild(anchor);
    shell.querySelectorAll('.next-step').forEach((button) => {
      const link = document.createElement('a');
      for (const attr of button.attributes) if (attr.name !== 'type') link.setAttribute(attr.name, attr.value);
      link.href = '#iab-anchor';
      while (button.firstChild) link.appendChild(button.firstChild);
      button.replaceWith(link);
    });
    document.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      const control = event.target.closest('.next-step');
      if (!control || !shell.contains(control)) return;
      if (stopped || locked || !event.isTrusted || control.disabled || control.getAttribute('aria-disabled') === 'true'
        || !control.closest('.step.active') || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        event.preventDefault(); return;
      }
      if (document.hidden || viewport().scale !== 1) { event.preventDefault(); return; }
      startAnchor(event, control);
    }, { capture: true });
  }
  releaseButton.addEventListener('click', release);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && locked) release(); });
  const onResize = () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(size); };
  window.addEventListener('resize', onResize, { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    cancelProbe(); finishNavigation(); gesture = null; size();
    if (!stopped) {
      locked = false;
      root.classList.remove('iab-locked');
      releaseButton.hidden = true;
      status('armed', 'history-restore');
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelProbe(); finishNavigation(); gesture = null;
      if (!stopped && !locked) status('armed', 'background-cancelled');
    }
  });
  size();
  status(stopped ? 'off' : 'armed', 'ready');
})();
