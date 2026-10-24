/* v6 isolates element fullscreen. No scroll track, overlay or load request. */
(() => {
  'use strict';
  const root = document.documentElement;
  const requested = new URLSearchParams(location.search).get('iab');
  const metaMobile = /FBAN|FBAV|FB_IAB|Instagram|Messenger/i.test(navigator.userAgent)
    && /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent);
  const mode = requested === 'tap' || requested === 'off' ? requested : (metaMobile ? 'tap' : 'off');
  root.dataset.iabMode = mode;
  root.dataset.iabState = mode === 'off' ? 'off' : 'ready';
})();
