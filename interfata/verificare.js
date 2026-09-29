/* Meșter — panoul „Verificare”: erorile codului, problemele schemei și ce s-a întâmplat în simulare. */
(function (M) {
  'use strict';
  const { $, el, esc } = M.u;

  M.Verificare = class {
    constructor(app) {
      this.app = app;
      this.lista = $('#lista-probleme');
      this.statice = [];
      this.ruleazaIntarziat = M.u.debounce(() => this.verificaSchema(), 450);
      M.bus.on('compilare', () => this.randeaza());
      this.bara();
    }
    bara() {
      const b = $('#bara-verificare');
      b.innerHTML = '';
      this.sumar = el('div', { class: 'sumar-verificare' });
      b.append(this.sumar);
      b.append(el('button', { class: 'btn', style: { marginLeft: 'auto' }, html: M.icon('verificare') + '<span>Verifică acum</span>', on: { click: () => { this.verificaSchema(); this.app.editor.verifica(); M.dialog.notifica('Am verificat schema și codul.'); } } }));
    }
    verificaSchema() {
      try { this.statice = M.verificari.ruleaza(this.app.proiect, this.app.proiect.cod); } catch (e) { console.error(e); this.statice = []; }
      this.randeaza();
    }
    toate() {
      const r = [];
      const ec = this.app.eroareCompilare;
      if (ec) r.push({ nivel: 'eroare', mesaj: ec.mesaj, linie: ec.linie, sursa: 'Cod' });
      for (const a of this.app.avertismenteCod || []) r.push({ nivel: 'avertisment', mesaj: a.mesaj, linie: a.linie, sursa: 'Cod' });
      for (const p of this.statice) r.push(Object.assign({ sursa: 'Schemă' }, p));
      const sim = this.app.sim;
      if (sim) for (const p of sim.probleme.values()) r.push(Object.assign({ sursa: 'Simulare' }, p));
      const ord = { eroare: 0, avertisment: 1, info: 2 };
      r.sort((a, b) => ord[a.nivel] - ord[b.nivel]);
      return r;
    }
    randeaza() {
      const toate = this.toate();
      const n = { eroare: 0, avertisment: 0, info: 0 };
      for (const p of toate) n[p.nivel]++;
      this.sumar.innerHTML = '<span><b>' + n.eroare + '</b> erori</span><span><b>' + n.avertisment + '</b> avertismente</span><span><b>' + n.info + '</b> sfaturi</span>';
      this.app.actualizeazaInsigne(n);
      this.lista.innerHTML = '';
      if (!toate.length) {
        this.lista.append(el('div', { class: 'gol-verificare', html: M.icon('ok') + '<p>Nicio problemă găsită. Schema și codul arată bine.</p>' }));
        return;
      }
      for (const p of toate) {
        const b = el('button', { class: 'problema ' + p.nivel });
        const ic = p.nivel === 'eroare' ? 'eroare' : p.nivel === 'avertisment' ? 'avert' : 'info';
        let meta = p.sursa;
        if (p.linie) meta += ' · linia ' + p.linie;
        if (p.comp) { const c = this.app.proiect.componente.find(x => x.id === p.comp); if (c) meta += ' · ' + c.eticheta; }
        if (p.nr > 1) meta += ' · de ' + p.nr + ' ori';
        b.innerHTML = M.icon(ic) + '<span>' + esc(p.mesaj) + '<span class="meta">' + esc(meta) + '</span></span>';
        b.addEventListener('click', () => {
          if (p.linie) { this.app.editor.mergiLa(p.linie); return; }
          if (p.comp) { this.app.arataVedere('schema'); this.app.spatiu.selecteaza({ tip: 'comp', id: p.comp }); this.app.centreazaPe(p.comp); }
        });
        this.lista.append(b);
      }
    }
  };
})(window.M = window.M || {});
