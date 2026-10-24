/* Optional local-only diagnostics. No requests, storage, or automatic upload. */
(() => {
  'use strict';
  const report = window.landingIABReport;
  if (!report) return;
  const panel = document.createElement('details');
  panel.id = 'iab-diagnostics';
  panel.innerHTML = '<summary>Діагностика v5</summary><output></output><label>Що видно у Facebook?<select aria-label="Стан панелі Facebook"><option value="not-observed">Ще не оцінював</option><option value="visible">Панель залишається</option><option value="hidden">Панель сховалася</option><option value="returned">Панель повернулася</option></select></label><button type="button" data-download>Зберегти звіт</button><button type="button" data-show>Показати звіт</button><textarea hidden readonly aria-label="Звіт перевірки"></textarea><small>Журнал залишається тут. Автоматичного надсилання немає.</small>';
  document.body.appendChild(panel);
  const output = panel.querySelector('output');
  const textarea = panel.querySelector('textarea');
  const json = () => JSON.stringify(report.read(), null, 2);
  panel.querySelector('select').addEventListener('change', event => report.mark(event.target.value));
  panel.querySelector('[data-show]').addEventListener('click', () => { textarea.hidden = false; textarea.value = json(); });
  panel.querySelector('[data-download]').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([json()], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'meta-iab-press-v5.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
  function update() {
    if (!panel.open || document.hidden) return;
    const r = report.read();
    output.textContent = `${r.mode} · ${r.current.state} · ${r.current.reason}\nСпроб: ${r.attempts} · крок: ${r.current.step} · y: ${r.current.y} · h: ${r.current.visualHeight}\nОцінка панелі: ${r.verdict}`;
  }
  panel.addEventListener('toggle', update);
  window.setInterval(update, 300);
})();
