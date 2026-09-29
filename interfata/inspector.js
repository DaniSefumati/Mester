/* Meșter — inspectorul: proprietățile piesei selectate, controalele din simulare (senzori, potențiometre),
   măsurători live, lista pinilor cu legăturile lor și culoarea firelor. */
(function (M) {
  'use strict';
  const { el, esc } = M.u;
  const D = M.desen;

  M.Inspector = class {
    constructor(app) {
      this.app = app;
      this.nod = null;
      M.bus.on('selectie', () => this.randeaza());
      M.bus.on('control', () => this.actualizeazaControale());
      setInterval(() => this.actualizeazaLive(), 300);
    }
    inchide() { if (this.nod) { this.nod.remove(); this.nod = null; } }
    randeaza() {
      const s = this.app.spatiu.selectie;
      this.inchide();
      if (!s) return;
      const gazda = document.getElementById('spatiu');
      if (s.tip === 'fir') { this.nod = this.panouFir(s.id); if (this.nod) gazda.append(this.nod); return; }
      const c = this.app.proiect.componente.find(x => x.id === s.id);
      if (!c) return;
      this.comp = c;
      this.nod = this.panouComp(c);
      gazda.append(this.nod);
    }
    cap(titlu, eticheta, descriere) {
      const cap = el('div', { class: 'cap' });
      const t = el('div', { class: 'titlu' });
      t.append(el('h3', { html: esc(titlu) + (eticheta ? ' <span class="et">' + esc(eticheta) + '</span>' : '') }));
      if (descriere) t.append(el('p', { text: descriere }));
      cap.append(t, el('button', { class: 'btn icon fantoma', title: 'Închide', html: M.icon('inchide'), on: { click: () => this.app.spatiu.selecteaza(null) } }));
      return cap;
    }
    panouComp(c) {
      const def = M.componente.def(c.tip);
      const sim = this.app.simuleaza;
      const panou = el('div', { class: 'inspector', role: 'region', 'aria-label': 'Proprietăți' });
      panou.append(this.cap(def.nume, c.eticheta, def.descriere));
      const corp = el('div', { class: 'corp' });
      // controale de simulare
      if (def.control && def.control.length) {
        const sec = el('div', { class: 'sectiune' }, el('h4', { text: sim ? 'Controale (în simulare)' : 'Valori pentru simulare' }));
        this.sliders = [];
        for (const k of def.control) sec.append(this.controlSlider(c, k));
        corp.append(sec);
      }
      if (def.controaleSpeciale) {
        const sec = el('div', { class: 'sectiune' });
        def.controaleSpeciale(sec, c, this.app, el);
        corp.append(sec);
      }
      // proprietăți
      if (def.prop.length && !def.esteBreadboard || def.esteBreadboard) {
        const sec = el('div', { class: 'sectiune' }, el('h4', { text: 'Proprietăți' }));
        sec.append(this.randProp('Etichetă', el('input', { class: 'camp', value: c.eticheta, disabled: sim, on: { change: (e) => { this.schimbaEticheta(c, e.target.value); } } })));
        for (const pr of def.prop) sec.append(this.editorProp(c, def, pr, sim));
        corp.append(sec);
      }
      // măsurători
      this.nodMasuri = el('dl', { class: 'masuratori' });
      const secM = el('div', { class: 'sectiune ascuns' }, el('h4', { text: 'Măsurători' }), this.nodMasuri);
      this.secMasuri = secM;
      corp.append(secM);
      // pini
      if (!def.esteBreadboard) {
        const sec = el('div', { class: 'sectiune' }, el('h4', { text: 'Pini și legături' }));
        const lst = el('div', { class: 'lista-pini' });
        const retea = M.retea.construieste(this.app.proiect);
        const vazute = new Set();
        for (const pin of M.componente.pini(c)) {
          const net = retea.net(c.id, pin.id);
          // pinii legați intern cu aceeași etichetă (ex. picioarele pereche ale unui buton) apar o singură dată
          const cheie = (pin.eticheta || pin.id) + '|' + net;
          if (vazute.has(cheie)) continue;
          vazute.add(cheie);
          const altii = retea.piniReali(net).filter(i => retea.chei[i] !== c.id + ':' + pin.id).map(i => { const pi = retea.pinInfo[i]; return pi.comp.eticheta + '.' + (pi.pin.eticheta || pi.pin.id); });
          const r = el('div', { class: 'p', title: def.esteplaca ? M.placi.descrierePin(M.placi.info(c), pin) : (pin.descriere || '') });
          r.append(el('b', { text: pin.eticheta || pin.id }));
          r.append(altii.length ? el('span', { text: '→ ' + altii.slice(0, 5).join(', ') + (altii.length > 5 ? ' …' : '') }) : el('span', { class: 'nc', text: 'neconectat' }));
          lst.append(r);
        }
        sec.append(lst);
        corp.append(sec);
      }
      panou.append(corp);
      if (!sim) {
        const act = el('div', { class: 'actiuni-inspector' });
        act.append(el('button', { class: 'btn', html: M.icon('roteste') + 'Rotește', on: { click: () => this.app.spatiu.rotesteSelectia(90) } }));
        act.append(el('button', { class: 'btn', html: M.icon('duplica') + 'Duplică', on: { click: () => this.app.spatiu.duplicaSelectia() } }));
        act.append(el('button', { class: 'btn pericol', html: M.icon('sterge') + 'Șterge', on: { click: () => this.app.spatiu.stergeSelectia() } }));
        panou.append(act);
      }
      this.actualizeazaLive();
      return panou;
    }
    randProp(eticheta, editor) {
      const id = 'p-' + Math.random().toString(36).slice(2, 8);
      editor.id = id;
      return el('div', { class: 'rand-prop' }, el('label', { text: eticheta, for: id }), editor);
    }
    editorProp(c, def, pr, sim) {
      const v = c.prop[pr.cheie] !== undefined ? c.prop[pr.cheie] : pr.implicit;
      const schimba = (val) => this.schimbaProp(c, pr.cheie, val);
      if (pr.tip === 'alegere') {
        const s = el('select', { class: 'camp', disabled: sim, on: { change: (e) => schimba(e.target.value) } });
        for (const [k, n] of pr.optiuni) s.append(el('option', { value: k, text: n, selected: String(k) === String(v) }));
        return this.randProp(pr.eticheta, s);
      }
      if (pr.tip === 'valoare') {
        const inp = el('input', { class: 'camp mono', value: D.formatValoare(+v, pr.unitate), disabled: sim, inputmode: 'decimal' });
        inp.addEventListener('change', () => {
          const x = D.parseValoare(inp.value);
          if (isNaN(x) || x <= 0) { M.dialog.notifica('Valoare invalidă. Exemple: 220, 4.7k, 10k, 100n'); inp.value = D.formatValoare(+v, pr.unitate); return; }
          schimba(x);
        });
        const rand = this.randProp(pr.eticheta, inp);
        if (pr.rapide) {
          const r = el('div', { class: 'valori-rapide' });
          for (const x of pr.rapide) r.append(el('button', { class: Math.abs(x - v) < 1e-12 ? 'activ' : '', text: D.formatValoare(x, pr.unitate).replace(' ', ''), disabled: sim, on: { click: () => schimba(x) } }));
          rand.append(r);
        }
        return rand;
      }
      if (pr.tip === 'numar') {
        const inp = el('input', { class: 'camp mono', type: 'number', value: v, min: pr.min, max: pr.max, step: pr.pas || 1, disabled: sim });
        inp.addEventListener('change', () => { let x = +inp.value; if (isNaN(x)) return; if (pr.min !== undefined) x = Math.max(pr.min, x); if (pr.max !== undefined) x = Math.min(pr.max, x); schimba(x); });
        return this.randProp(pr.eticheta, inp);
      }
      if (pr.tip === 'bool') {
        const inp = el('input', { type: 'checkbox', checked: !!v, disabled: sim, on: { change: (e) => schimba(e.target.checked) } });
        return this.randProp(pr.eticheta, inp);
      }
      const inp = el('input', { class: 'camp', value: v, disabled: sim, on: { change: (e) => schimba(e.target.value) } });
      return this.randProp(pr.eticheta, inp);
    }
    schimbaProp(c, cheie, val) {
      if (this.app.simuleaza) return;
      this.app.istoric.inregistreaza();
      c.prop[cheie] = val;
      const def = M.componente.def(c.tip);
      if (def.laSchimbareProp) def.laSchimbareProp(c, cheie, val);
      this.app.spatiu.randeazaComp(c);
      this.app.spatiu.actualizeazaFireComp(c.id);
      this.app.spatiu.reconstruiesteIndex();
      this.app.schimbare('schema');
      this.randeaza();
    }
    schimbaEticheta(c, e) {
      e = String(e).trim().slice(0, 20);
      if (!e || this.app.proiect.componente.some(x => x !== c && x.eticheta === e)) { M.dialog.notifica('Eticheta trebuie să fie unică.'); this.randeaza(); return; }
      this.app.istoric.inregistreaza();
      c.eticheta = e;
      this.app.schimbare('schema');
      this.randeaza();
    }
    controlSlider(c, k) {
      c.control = c.control || {};
      const v0 = c.control[k.cheie] !== undefined ? c.control[k.cheie] : k.implicit;
      const id = 'ctl-' + Math.random().toString(36).slice(2, 8);
      const out = el('output', { for: id });
      const fmt = (v) => (k.format ? k.format(v) : (Number.isInteger(k.pas) ? Math.round(v) : M.u.numar(v, (String(k.pas).split('.')[1] || '').length || 1)) + (k.unitate ? ' ' + k.unitate : ''));
      const log = !!k.log;
      const inLog = (v) => log ? Math.log10(Math.max(1, v + 1)) : v;
      const dinLog = (x) => log ? Math.pow(10, x) - 1 : x;
      const inp = el('input', { type: 'range', id, min: inLog(k.min), max: inLog(k.max), step: log ? 0.01 : k.pas, value: inLog(v0) });
      out.textContent = fmt(v0);
      inp.addEventListener('input', () => {
        let v = dinLog(+inp.value);
        if (!log) v = Math.round(v / k.pas) * k.pas; else v = Math.round(v);
        out.textContent = fmt(v);
        if (this.app.simuleaza && this.app.sim) { this.app.sim.control(c, k.cheie, v); }
        else { c.control[k.cheie] = v; this.app.spatiu.actualizeazaVizualComp(c); this.app.salveazaIntarziat(); }
      });
      const r = el('div', { class: 'control-sim' }, el('label', { for: id, text: k.eticheta }), out, inp);
      (this.sliders = this.sliders || []).push({ c, k, inp, out, fmt, inLog });
      return r;
    }
    actualizeazaControale() {
      for (const s of this.sliders || []) {
        const v = s.c.control[s.k.cheie];
        if (v === undefined) continue;
        if (document.activeElement !== s.inp) { s.inp.value = s.inLog(v); s.out.textContent = s.fmt(v); }
      }
    }
    actualizeazaLive() {
      if (!this.nod || !this.comp || !this.secMasuri) return;
      const sim = this.app.simuleaza ? this.app.sim : null;
      const def = M.componente.def(this.comp.tip);
      if (!sim || !def.masura) { this.secMasuri.classList.add('ascuns'); return; }
      const elc = sim.el.get(this.comp.id);
      let m = [];
      try { m = def.masura(elc || {}, this.comp, sim, sim.disp.get(this.comp.id)) || []; } catch (e) { m = []; }
      this.secMasuri.classList.toggle('ascuns', !m.length);
      this.nodMasuri.innerHTML = m.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('');
    }
    panouFir(id) {
      const f = this.app.proiect.fire.find(x => x.id === id);
      if (!f) return null;
      const proiect = this.app.proiect;
      const nume = (r) => { const c = proiect.componente.find(x => x.id === r.c); if (!c) return '?'; const def = M.componente.def(c.tip); if (def.esteBreadboard) return c.eticheta + ' ' + r.p; const pin = M.componente.pini(c).find(x => x.id === r.p); return c.eticheta + '.' + (pin ? pin.eticheta || pin.id : r.p); };
      const panou = el('div', { class: 'inspector' });
      panou.append(this.cap('Fir', null, nume(f.a) + '  ↔  ' + nume(f.b)));
      const corp = el('div', { class: 'corp' });
      const sim = this.app.simuleaza;
      const sec = el('div', { class: 'sectiune' }, el('h4', { text: 'Culoare' }));
      const cul = el('div', { class: 'culori-fir' });
      for (const c of M.proiect.CULORI_FIRE) {
        cul.append(el('button', { class: f.culoare === c.c ? 'activ' : '', title: c.n, style: { background: c.c }, disabled: sim, on: { click: () => { this.app.istoric.inregistreaza(); f.culoare = c.c; this.app.spatiu.randeazaFir(f); this.app.schimbare('schema-vizual'); this.randeaza(); } } }));
      }
      sec.append(cul);
      corp.append(sec);
      corp.append(el('p', { class: 'sectiune', style: { margin: 0, fontSize: '12px', color: 'var(--text-3)' }, text: 'Trage de punctele de pe fir ca să-i faci colțuri.' }));
      panou.append(corp);
      if (!sim) {
        const act = el('div', { class: 'actiuni-inspector' });
        if ((f.puncte || []).length) act.append(el('button', { class: 'btn', text: 'Îndreaptă firul', on: { click: () => { this.app.istoric.inregistreaza(); f.puncte = []; this.app.spatiu.randeazaFir(f); this.app.spatiu.deseneazaManere(); this.app.schimbare('schema-vizual'); this.randeaza(); } } }));
        act.append(el('button', { class: 'btn pericol', html: M.icon('sterge') + 'Șterge firul', on: { click: () => this.app.spatiu.stergeSelectia() } }));
        panou.append(act);
      }
      return panou;
    }
  };
})(window.M = window.M || {});
