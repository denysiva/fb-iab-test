(() => {
  'use strict';
  const shell = document.querySelector('#landing-shell');
  const steps = Array.from(shell.querySelectorAll('.step'));
  let current = 0;
  let lastTransition = -Infinity;
  const errorTimers = new WeakMap();

  steps.forEach((step, index) => {
    step.hidden = index !== current;
    step.setAttribute('aria-hidden', String(index !== current));
    const heading = step.querySelector('.heading-block');
    if (heading) { heading.id = `step-title-${index + 1}`; step.setAttribute('aria-labelledby', heading.id); }
    step.querySelectorAll('.options-block__item').forEach((option) => {
      option.setAttribute('role', 'checkbox');
      option.setAttribute('aria-checked', String(option.classList.contains('checked')));
      option.tabIndex = 0;
    });
  });
  shell.dataset.step = '1';

  function select(option) {
    const list = option.closest('.options-block__list');
    if (!list || !steps[current].contains(option)) return;
    if (!option.classList.contains('checked') && list.querySelectorAll('.checked').length >= 3) {
      option.classList.add('checkbox-item-error');
      clearTimeout(errorTimers.get(option));
      errorTimers.set(option, setTimeout(() => option.classList.remove('checkbox-item-error'), 600));
      return;
    }
    option.classList.toggle('checked');
    option.setAttribute('aria-checked', String(option.classList.contains('checked')));
  }

  shell.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const option = event.target.closest('.options-block__item');
    if (option) { select(option); return; }
    const button = event.target.closest('.next-step');
    if (!button || !steps[current].contains(button) || current >= steps.length - 1) return;
    // Suppress double taps without making every step unresponsive for 1.8 seconds.
    const now = performance.now();
    if (now - lastTransition < 300) return;
    lastTransition = now;
    const previous = steps[current];
    previous.classList.replace('active', 'hide');
    previous.hidden = true;
    previous.setAttribute('aria-hidden', 'true');
    const next = steps[++current];
    next.hidden = false;
    next.setAttribute('aria-hidden', 'false');
    next.classList.replace('hide', 'active');
    shell.dataset.step = String(current + 1);
    const nextButtons = next.querySelectorAll('.next-step');
    nextButtons.forEach((control) => { control.disabled = true; });
    window.setTimeout(() => nextButtons.forEach((control) => { control.disabled = false; }), 300);
    document.body.classList.toggle('translate-bages', current > 0);
    if (document.documentElement.classList.contains('iab-locked')) shell.scrollTop = 0;
    else if (!document.documentElement.classList.contains('iab-armed')) window.scrollTo(0, 0);
    // Keyboard focus follows the new content without scrolling the document.
    if (event.detail === 0) {
      const heading = next.querySelector('.heading-block');
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  });

  shell.addEventListener('keydown', (event) => {
    if (!(event.target instanceof Element)) return;
    const option = event.target.closest('.options-block__item');
    if (option && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault(); select(option);
    }
  });
})();
