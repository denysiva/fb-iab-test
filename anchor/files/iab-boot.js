/* Small head script: select mode before first paint. It never locks scrolling. */
(() => {
  'use strict';
  const root = document.documentElement;
  const query = new URLSearchParams(location.search);
  const requested = query.get('iab');
  const metaMobile = /FBAN|FBAV|FB_IAB|Instagram|Messenger/i.test(navigator.userAgent)
    && /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent);
  const modes = ['anchor', 'swipe', 'off'];
  const explicit = modes.includes(requested);
  const mode = explicit ? requested : (metaMobile ? 'anchor' : 'off');
  root.dataset.iabMode = mode;
  root.dataset.iabForced = String(explicit && mode !== 'off');
  root.dataset.iabState = mode === 'off' ? 'off' : 'armed';
  if (mode !== 'off') root.classList.add('iab-armed');
  // Fail open if the deferred controller cannot load.
  window.setTimeout(() => {
    if (!root.hasAttribute('data-iab-ready')) {
      root.classList.remove('iab-armed', 'iab-locked');
      root.dataset.iabState = 'fallback';
    }
  }, 8000);
})();
