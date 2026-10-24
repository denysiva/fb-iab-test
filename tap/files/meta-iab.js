/* Isolated element-fullscreen experiment. Request synchronously from the original
   click, before changing the quiz step. Never infer fullscreen from viewport size.
   This cannot enable a native app preference that the host has disabled. */
(() => {
  'use strict';
  const root = document.documentElement;
  const shell = document.querySelector('#landing-shell');
  const release = document.querySelector('#iab-release');
  const query = new URLSearchParams(location.search);
  const mode = root.dataset.iabMode || 'off';
  const debug = query.get('iab_debug') === '1';
  let stopped = mode === 'off';
  let pending = null;
  let entered = false;
  let attempts = 0;
  let nextApi = 0;
  let verdict = 'not-observed';
  const timeline = [];
  const actualElement = () => document.fullscreenElement || document.webkitFullscreenElement || document.webkitCurrentFullScreenElement || null;
  const apis = [
    { name: 'standard', method: shell.requestFullscreen },
    { name: 'webkit', method: shell.webkitRequestFullscreen || shell.webkitRequestFullScreen }
  ].filter(api => typeof api.method === 'function');
  shell.appendChild(release);
  release.setAttribute('aria-label', 'Exit fullscreen');

  function capabilities() {
    let policyAllowed = null;
    try {
      const policy = document.permissionsPolicy || document.featurePolicy;
      if (policy && typeof policy.allowsFeature === 'function') policyAllowed = policy.allowsFeature('fullscreen');
    } catch (_) { /* An absent policy inspector is not an explicit denial. */ }
    return { methods: apis.map(api => api.name), standardEnabled: document.fullscreenEnabled ?? null,
      webkitEnabled: document.webkitFullscreenEnabled ?? null, secureContext: window.isSecureContext,
      topLevel: window === window.top, policyAllowed };
  }
  function snapshot() {
    return { t: Math.round(performance.now()), step: shell.dataset.step || '1', y: Math.round(window.scrollY),
      height: window.innerHeight, visualHeight: window.visualViewport ? Math.round(window.visualViewport.height) : null,
      state: root.dataset.iabState, result: root.dataset.iabResult, fullscreen: actualElement() === shell };
  }
  function record(event, extra = {}) {
    if (!debug) return;
    timeline.push({ event, ...snapshot(), ...extra });
    if (timeline.length > 100) timeline.shift();
  }
  function status(state, result) {
    root.dataset.iabState = state;
    root.dataset.iabResult = result;
    record('state');
    document.dispatchEvent(new Event('iabstatuschange'));
  }
  function finish(result) {
    const request = pending;
    if (!request) return;
    pending = null;
    clearTimeout(request.timer);
    if (actualElement() === shell) {
      entered = true;
      release.hidden = false;
      status('fullscreen', 'entered');
    } else status(stopped ? 'released' : 'ready', result);
    request.resolve();
  }
  function changed() {
    if (actualElement() === shell) {
      entered = true;
      release.hidden = false;
      status('fullscreen', 'entered');
      finish('entered');
    } else if (entered) {
      entered = false;
      stopped = true;
      release.hidden = true;
      finish('exited');
      status('released', 'exited');
    }
  }
  function beforeNext(event) {
    if (stopped || !event.isTrusted || document.hidden || actualElement() === shell) return null;
    if (pending) return pending.promise;
    if (!apis.length) { status('ready', 'api-unavailable'); return null; }
    const api = apis[nextApi++ % apis.length];
    attempts += 1;
    root.dataset.iabAttempts = String(attempts);
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    const current = { resolve, promise, timer: 0 };
    pending = current;
    status('requesting', api.name);
    record('request', { api: api.name, trusted: event.isTrusted,
      userActivation: navigator.userActivation ? navigator.userActivation.isActive : null,
      capabilities: capabilities() });
    current.timer = window.setTimeout(() => finish('no-entry'), 1500);
    try {
      // No scrolling, touchstart handler, synthetic click, or quiz DOM change here.
      const result = api.name === 'standard'
        ? api.method.call(shell, { navigationUI: 'hide' }) : api.method.call(shell);
      Promise.resolve(result).then(() => {
        if (pending === current && actualElement() === shell) changed();
      }, error => {
        record('rejection', { api: api.name, name: error && error.name || 'Error',
          message: String(error && error.message || '').slice(0, 200) });
        if (pending === current) finish(`rejected-${error && error.name || 'Error'}`);
      });
    } catch (error) {
      record('exception', { api: api.name, name: error.name, message: String(error.message || '').slice(0, 200) });
      finish(`rejected-${error.name || 'Error'}`);
    }
    return promise;
  }
  release.addEventListener('click', () => {
    const exit = document.exitFullscreen || document.webkitExitFullscreen || document.webkitCancelFullScreen;
    if (actualElement() !== shell || typeof exit !== 'function') return;
    try {
      Promise.resolve(exit.call(document)).catch(error => {
        record('exit-error', { name: error.name });
        status('fullscreen', 'exit-rejected-use-native-control');
      });
    } catch (error) { record('exit-error', { name: error.name }); }
  });
  document.addEventListener('fullscreenchange', changed);
  document.addEventListener('webkitfullscreenchange', changed);
  document.addEventListener('fullscreenerror', () => finish('fullscreen-error-event'));
  document.addEventListener('webkitfullscreenerror', () => finish('fullscreen-error-event'));
  document.addEventListener('visibilitychange', () => { if (document.hidden) finish('background'); });
  window.addEventListener('pageshow', event => {
    if (event.persisted) { finish('history-restore'); changed(); }
  });
  window.landingPresentation = Object.freeze({ beforeNext });
  if (debug) {
    window.landingIABReport = Object.freeze({
      read: () => ({ version: 'tap-v6', mode, userAgent: navigator.userAgent, page: location.pathname,
        capabilities: capabilities(), attempts, verdict, current: snapshot(), timeline: timeline.map(item => ({ ...item })) }),
      mark: value => { if (['visible', 'hidden', 'not-observed'].includes(value)) { verdict = value; record('human-observation'); } }
    });
    const diagnostics = document.createElement('script');
    diagnostics.src = './files/iab-diagnostics.js';
    document.head.appendChild(diagnostics);
  }
  root.dataset.iabVersion = 'tap-v6';
  root.dataset.iabReady = 'true';
  status(stopped ? 'off' : 'ready', apis.length ? 'not-requested' : 'api-unavailable');
})();
