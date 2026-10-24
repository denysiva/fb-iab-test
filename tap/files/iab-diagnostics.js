/* On-device diagnostics only. No uploads, query parameters, answers or storage. */
(() => {
  'use strict';
  const report = window.landingIABReport;
  if (!report) return;
  const panel = document.createElement('details');
  panel.id = 'iab-diagnostics';
  panel.innerHTML = '<summary>Тест NEXT v6</summary><output aria-live="polite"></output><label>Панель Facebook<select aria-label="Панель Facebook"><option value="not-observed">Ще не оцінював</option><option value="visible">Залишилася</option><option value="hidden">Сховалася</option></select></label><button type="button">Показати звіт</button><textarea hidden readonly aria-label="Звіт перевірки"></textarea><small>Це локальний журнал. Дані нікуди не надсилаються.</small>';
  document.querySelector('#landing-shell').appendChild(panel);
  const labels = { 'api-unavailable': 'Браузер не надав API', entered: 'Справжній fullscreen увімкнено',
    'not-requested': 'Натисни NEXT', 'no-entry': 'Браузер не підтвердив вхід',
    'fullscreen-error-event': 'Браузер відхилив запит', exited: 'Вихід із fullscreen' };
  function update() {
    const r = report.read();
    const result = labels[r.current.result] || r.current.result;
    panel.querySelector('summary').textContent = `v6 · ${r.mode === 'off' ? 'вимкнено' : result}`;
    panel.querySelector('output').textContent = `Методи: ${r.capabilities.methods.join(', ') || 'немає'}\nДозвіл standard: ${r.capabilities.standardEnabled} · WebKit: ${r.capabilities.webkitEnabled}\nСпроб: ${r.attempts} · ${result}`;
  }
  panel.querySelector('select').addEventListener('change', event => report.mark(event.target.value));
  panel.querySelector('button').addEventListener('click', () => {
    const textarea = panel.querySelector('textarea');
    textarea.hidden = false;
    textarea.value = JSON.stringify(report.read(), null, 2);
  });
  document.addEventListener('iabstatuschange', update);
  panel.addEventListener('toggle', update);
  update();
})();
