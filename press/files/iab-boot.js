/* Choose the experiment before first paint; never lock on page load. */
(() => {
  'use strict';
  const root = document.documentElement;
  const requested = new URLSearchParams(location.search).get('iab');
  const metaMobile = /FBAN|FBAV|FB_IAB|Instagram|Messenger/i.test(navigator.userAgent)
    && /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent);
  const explicit = ['press', 'click', 'swipe', 'off'].includes(requested);
  const mode = explicit ? requested : (metaMobile ? 'press' : 'off');
  root.dataset.iabMode = mode;
  root.dataset.iabForced = String(explicit && mode !== 'off');
  root.dataset.iabState = mode === 'off' ? 'off' : 'armed';
  if (mode !== 'off') root.classList.add('iab-armed');
  window.setTimeout(() => {
    if (!root.hasAttribute('data-iab-ready')) {
      root.classList.remove('iab-armed', 'iab-locked');
      root.dataset.iabState = 'fallback';
    }
  }, 8000);
})();
