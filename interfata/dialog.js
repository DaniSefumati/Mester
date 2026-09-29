/* Meșter — ferestre de dialog, confirmări în pagină și notificări scurte. */
(function (M) {
  'use strict';
  const { el } = M.u;
  let notifTimer = null;

  M.dialog = {
    deschide(opt) {
      const fundal = el('div', { class: 'fundal-dialog', role: 'dialog', 'aria-modal': 'true' });
      const d = el('div', { class: 'dialog' + (opt.lat ? ' lat' : '') });
      const inchide = () => { fundal.remove(); document.removeEventListener('keydown', tasta); if (opt.laInchidere) opt.laInchidere(); };
      const tasta = (e) => { if (e.key === 'Escape') inchide(); };
      const cap = el('div', { class: 'cap-dialog' }, el('h2', { text: opt.titlu || '' }));
      const x = el('button', { class: 'btn icon fantoma', title: 'Închide', html: M.icon('inchide'), on: { click: inchide } });
      cap.append(x);
      const corp = el('div', { class: 'corp-dialog' });
      if (typeof opt.continut === 'string') corp.innerHTML = opt.continut; else if (opt.continut) corp.append(opt.continut);
      d.append(cap, corp);
      if (opt.butoane && opt.butoane.length) {
        const sub = el('div', { class: 'subsol-dialog' });
        for (const b of opt.butoane) {
          sub.append(el('button', { class: 'btn ' + (b.clasa || ''), text: b.text, on: { click: async () => { const r = b.actiune ? await b.actiune() : undefined; if (b.inchide !== false && r !== false) inchide(); } } }));
        }
        d.append(sub);
      }
      fundal.append(d);
      fundal.addEventListener('pointerdown', (e) => { if (e.target === fundal) inchide(); });
      document.addEventListener('keydown', tasta);
      document.body.append(fundal);
      const primul = d.querySelector('input, textarea, select, .btn.principal');
      if (primul) setTimeout(() => primul.focus(), 30);
      return { inchide, corp, el: d };
    },
    confirma(mesaj, opt) {
      opt = opt || {};
      return new Promise((rez) => {
        let raspuns = false;
        M.dialog.deschide({
          titlu: opt.titlu || 'Confirmare',
          continut: el('p', { text: mesaj }),
          butoane: [
            { text: opt.nu || 'Renunță', clasa: '', actiune: () => { raspuns = false; } },
            { text: opt.da || 'Da', clasa: opt.pericol ? 'pericol' : 'principal', actiune: () => { raspuns = true; } }
          ],
          laInchidere: () => rez(raspuns)
        });
      });
    },
    notifica(text, ms) {
      let n = document.querySelector('.notificare');
      if (!n) { n = el('div', { class: 'notificare', role: 'status' }); document.body.append(n); }
      n.textContent = text;
      clearTimeout(notifTimer);
      notifTimer = setTimeout(() => n.remove(), ms || 2600);
    }
  };
})(window.M = window.M || {});
