/* Meșter — planșa de lucru: desenarea componentelor și firelor, mutare, rotire, fire trase pin la pin,
   găurile breadboard-ului, zoom/pan cu mouse și cu două degete, interacțiunea în timpul simulării. */
(function (M) {
  'use strict';
  const { $, svgEl, esc, clamp } = M.u;
  const R = M.retea;

  function tipPin(def, pin) {
    const t = (pin.tip || '').toLowerCase();
    if (t === 'gnd') return 'gnd';
    if (t === 'vcc' || t === '3v3' || t === '5v' || t === 'vin' || t === 'sursa+') return 'vcc';
    return 'semnal';
  }

  class Spatiu {
    constructor(app) {
      this.app = app;
      this.gazda = $('#spatiu');
      this.svg = $('#scena');
      this.lume = $('#lume');
      this.defs = $('#scena-defs');
      this.stratBB = $('#strat-breadboard');
      this.stratComp = $('#strat-comp');
      this.stratFire = $('#strat-fire');
      this.stratSus = $('#strat-sus');
      this.stratHtml = $('#strat-html');
      this.vedere = { x: 60, y: 60, k: 1.6 };
      this.noduri = new Map();
      this.noduriFir = new Map();
      this.canvasuri = new Map();
      this.selectie = null;
      this.firInCurs = null;
      this.pointeri = new Map();
      this.gestiune = null;
      this.indexPini = new Map();
      this.urmatoareaCuloare = 2;
      this.balon = null;
      this.gradiente = new Set();
      this.initDefs();
      this.evenimente();
      M.stralucire = (hex) => this.gradient(hex);
    }
    get proiect() { return this.app.proiect; }
    get sim() { return this.app.sim; }

    // ---------- definiții SVG ----------
    initDefs() {
      this.defs.innerHTML = `
        <pattern id="grila-mica" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" style="stroke:var(--mat-grila)" stroke-width="0.6"/></pattern>
        <pattern id="grila-mare" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M100 0H0V100" fill="none" style="stroke:var(--mat-grila-mare)" stroke-width="1"/></pattern>
        <linearGradient id="metalScut" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9ecef"/><stop offset=".45" stop-color="#c3c8cf"/><stop offset="1" stop-color="#9aa1aa"/></linearGradient>
        <radialGradient id="butonRotativ" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#5b606a"/><stop offset=".7" stop-color="#2d3036"/><stop offset="1" stop-color="#1b1d21"/></radialGradient>
        <linearGradient id="lucire" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <linearGradient id="sticlaLcd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
    }
    gradient(hex) {
      hex = String(hex).replace('#', '').toLowerCase();
      const id = 'str-' + hex;
      if (!this.gradiente.has(id)) {
        this.gradiente.add(id);
        const g = svgEl('radialGradient', { id, cx: '50%', cy: '50%', r: '50%' });
        g.append(svgEl('stop', { offset: '0', 'stop-color': '#' + hex, 'stop-opacity': '0.95' }));
        g.append(svgEl('stop', { offset: '0.35', 'stop-color': '#' + hex, 'stop-opacity': '0.45' }));
        g.append(svgEl('stop', { offset: '1', 'stop-color': '#' + hex, 'stop-opacity': '0' }));
        this.defs.append(g);
      }
      return 'url(#' + id + ')';
    }
    asiguraGradiente(markup) {
      const re = /url\(#str-([0-9a-f]{6})\)/g;
      let m;
      while ((m = re.exec(markup))) this.gradient(m[1]);
    }

    // ---------- vedere ----------
    aplicaVedere() {
      const v = this.vedere;
      this.lume.setAttribute('transform', `translate(${v.x.toFixed(2)} ${v.y.toFixed(2)}) scale(${v.k.toFixed(4)})`);
      this.stratHtml.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
      $('#fundal-mat').style.opacity = v.k < 0.55 ? 0 : v.k < 0.9 ? (v.k - 0.55) / 0.35 : 1;
      if (this.proiect) this.proiect.vedere = { x: v.x, y: v.y, k: v.k };
      this.actualizeazaInfo();
    }
    actualizeazaInfo() {
      const i = $('#info-plansa');
      if (i) i.textContent = Math.round(this.vedere.k / 1.6 * 100) + '%';
    }
    ecranLaLume(cx, cy) {
      const r = this.svg.getBoundingClientRect();
      return { x: (cx - r.left - this.vedere.x) / this.vedere.k, y: (cy - r.top - this.vedere.y) / this.vedere.k };
    }
    lumeLaEcran(x, y) {
      const r = this.svg.getBoundingClientRect();
      return { x: r.left + this.vedere.x + x * this.vedere.k, y: r.top + this.vedere.y + y * this.vedere.k };
    }
    zoom(factor, cx, cy) {
      const r = this.svg.getBoundingClientRect();
      if (cx === undefined) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
      const v = this.vedere;
      const k2 = clamp(v.k * factor, 0.2, 9);
      const px = cx - r.left, py = cy - r.top;
      v.x = px - (px - v.x) * (k2 / v.k);
      v.y = py - (py - v.y) * (k2 / v.k);
      v.k = k2;
      this.aplicaVedere();
    }
    arataTot() {
      const p = this.proiect;
      const r = this.svg.getBoundingClientRect();
      if (!p || !p.componente.length || r.width < 10) { this.vedere = { x: r.width / 2 - 100, y: r.height / 2 - 100, k: 1.6 }; this.aplicaVedere(); return; }
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const c of p.componente) {
        const b = this.cutieLume(c);
        x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
      }
      for (const f of p.fire) for (const pt of f.puncte || []) { x0 = Math.min(x0, pt[0]); y0 = Math.min(y0, pt[1]); x1 = Math.max(x1, pt[0]); y1 = Math.max(y1, pt[1]); }
      const marja = 40;
      const sus = r.width < 760 ? 56 : 60;
      const k = clamp(Math.min((r.width - marja * 2) / (x1 - x0 || 1), (r.height - marja * 2 - sus) / (y1 - y0 || 1)), 0.25, 4);
      this.vedere.k = k;
      this.vedere.x = (r.width - (x1 - x0) * k) / 2 - x0 * k;
      this.vedere.y = sus + (r.height - sus - (y1 - y0) * k) / 2 - y0 * k;
      this.aplicaVedere();
    }
    cutieLume(c) {
      const b = M.componente.cutie(c);
      const colturi = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].map(([x, y]) => R.transforma(c, x, y));
      const xs = colturi.map(p => p.x), ys = colturi.map(p => p.y);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }

    // ---------- desenare ----------
    randeazaTot() {
      this.stratBB.innerHTML = ''; this.stratComp.innerHTML = ''; this.stratFire.innerHTML = ''; this.stratSus.innerHTML = '';
      this.stratHtml.innerHTML = '';
      this.noduri.clear(); this.noduriFir.clear(); this.canvasuri.clear();
      if (!this.proiect) return;
      for (const c of this.proiect.componente) this.randeazaComp(c);
      this.randeazaFire();
      this.reconstruiesteIndex();
      this.actualizeazaSelectie();
      $('#plansa-goala').classList.toggle('ascuns', this.proiect.componente.length > 0);
    }
    transformComp(c) { return `translate(${c.x} ${c.y}) rotate(${c.rot || 0})`; }
    randeazaComp(c) {
      const def = M.componente.def(c.tip);
      if (!def) return;
      const p = M.componente.prop(c);
      let markup = '';
      try { markup = def.desen.call(def, p, c); } catch (e) { console.error('desen', c.tip, e); markup = '<rect x="-10" y="-10" width="20" height="20" fill="red"/>'; }
      markup = markup.replace(/(\s)(fill|stroke)="(var\([^"]+\))"/g, '$1style="$2:$3"');
      this.asiguraGradiente(markup);
      let g = this.noduri.get(c.id);
      const nou = !g;
      if (!g) {
        g = svgEl('g', { class: 'comp', 'data-id': c.id });
        (def.esteBreadboard ? this.stratBB : this.stratComp).append(g);
        this.noduri.set(c.id, g);
      }
      g.setAttribute('transform', this.transformComp(c));
      let pini = '';
      if (!def.esteBreadboard) {
        for (const pin of M.componente.pini(c)) pini += `<circle class="pin" data-pin="${esc(pin.id)}" cx="${pin.x}" cy="${pin.y}" r="3.4"/>`;
      }
      g.innerHTML = `<g class="corp-comp">${markup}</g>${pini}`;
      if (this.selectie && this.selectie.tip === 'comp' && this.selectie.id === c.id) g.classList.add('selectat');
      // ecran (canvas deasupra planșei)
      if (def.ecran) this.pregatesteCanvas(c, def, p);
      if (!nou || def.vizualLaDesen) this.actualizeazaVizualComp(c);
      return g;
    }
    pregatesteCanvas(c, def, p) {
      const e = typeof def.ecran === 'function' ? def.ecran(p) : def.ecran;
      let cv = this.canvasuri.get(c.id);
      if (!cv) { cv = document.createElement('canvas'); this.stratHtml.append(cv); this.canvasuri.set(c.id, cv); }
      if (cv.width !== e.pw || cv.height !== e.ph) { cv.width = e.pw; cv.height = e.ph; }
      cv.style.width = e.pw + 'px'; cv.style.height = e.ph + 'px';
      cv.style.transform = `translate(${c.x}px, ${c.y}px) rotate(${c.rot || 0}deg) translate(${e.x}px, ${e.y}px) scale(${e.w / e.pw}, ${e.h / e.ph})`;
      cv.dataset.comp = c.id;
      cv.style.imageRendering = e.neted ? 'auto' : 'pixelated';
      const ctx = cv.getContext('2d');
      const d = this.sim && this.sim.disp.get(c.id);
      if (d && d.deseneaza) { d.canvas = cv; d.murdar = true; d.deseneaza(ctx, cv); }
      else { ctx.fillStyle = e.fond || '#0a0c0e'; ctx.fillRect(0, 0, cv.width, cv.height); }
    }
    stergeNodComp(id) {
      const g = this.noduri.get(id); if (g) g.remove(); this.noduri.delete(id);
      const cv = this.canvasuri.get(id); if (cv) cv.remove(); this.canvasuri.delete(id);
    }
    pozitiePin(ref) {
      const c = this.proiect.componente.find(x => x.id === ref.c);
      if (!c) return null;
      const pin = M.componente.pini(c).find(x => x.id === ref.p);
      if (!pin) return null;
      return R.transforma(c, pin.x, pin.y);
    }
    caleFir(f) {
      const a = this.pozitiePin(f.a), b = this.pozitiePin(f.b);
      if (!a || !b) return null;
      const pts = [a, ...(f.puncte || []).map(p => ({ x: p[0], y: p[1] })), b];
      return { d: caleRotunjita(pts, 4), a, b, pts };
    }
    randeazaFire() {
      this.stratFire.innerHTML = '';
      this.noduriFir.clear();
      for (const f of this.proiect.fire) this.randeazaFir(f);
    }
    randeazaFir(f) {
      const cale = this.caleFir(f);
      if (!cale) return;
      let g = this.noduriFir.get(f.id);
      if (!g) { g = svgEl('g', { class: 'fir', 'data-fir': f.id }); this.stratFire.append(g); this.noduriFir.set(f.id, g); }
      const c = f.culoare || '#43a047';
      g.innerHTML = `<path class="lovire" d="${cale.d}" fill="none" stroke="transparent" stroke-width="9" stroke-linecap="round" style="pointer-events:stroke"/>` +
        `<path class="contur" d="${cale.d}" stroke-width="3.6"/>` +
        `<path class="miez" d="${cale.d}" stroke="${c}" stroke-width="2.5"/>` +
        `<path class="lucire" d="${cale.d}" stroke-width="0.7" transform="translate(-0.35 -0.45)"/>` +
        `<circle class="capat" cx="${cale.a.x}" cy="${cale.a.y}" r="1.9" fill="${c}"/><circle class="capat" cx="${cale.b.x}" cy="${cale.b.y}" r="1.9" fill="${c}"/>`;
      g.classList.toggle('selectat', !!(this.selectie && this.selectie.tip === 'fir' && this.selectie.id === f.id));
    }
    // firele legate de o componentă (după mutare)
    actualizeazaFireComp(id) {
      for (const f of this.proiect.fire) if (f.a.c === id || f.b.c === id) this.randeazaFir(f);
    }

    // ---------- index de pini pentru lovire ----------
    reconstruiesteIndex() {
      this.indexPini.clear();
      this.grupuriBB = new Map();
      for (const c of this.proiect.componente) {
        const def = M.componente.def(c.tip);
        if (!def) continue;
        for (const pin of M.componente.pini(c)) {
          const w = R.transforma(c, pin.x, pin.y);
          const k = Math.round(w.x) + ',' + Math.round(w.y);
          if (!this.indexPini.has(k)) this.indexPini.set(k, []);
          this.indexPini.get(k).push({ c: c.id, p: pin.id, bb: !!def.esteBreadboard, x: w.x, y: w.y });
        }
        if (def.esteBreadboard && def.interne) {
          const m = new Map();
          for (const gr of def.interne(M.componente.prop(c))) for (const id of gr) m.set(id, gr);
          this.grupuriBB.set(c.id, m);
        }
      }
    }
    pinLa(wx, wy, preferComp) {
      const raza = Math.max(4.2, 9 / this.vedere.k);
      let best = null, bd = raza * raza;
      const gx = Math.round(wx / 10) * 10, gy = Math.round(wy / 10) * 10;
      for (let dx = -10; dx <= 10; dx += 10) for (let dy = -10; dy <= 10; dy += 10) {
        const lst = this.indexPini.get((gx + dx) + ',' + (gy + dy));
        if (!lst) continue;
        for (const p of lst) {
          const d = (p.x - wx) ** 2 + (p.y - wy) ** 2;
          const pen = p.bb && preferComp !== false ? 0.5 : 0;
          if (d + pen < bd) { bd = d + pen; best = p; }
        }
      }
      if (best && best.bb) {
        // dacă în aceeași gaură e înfipt un pin de componentă, îl preferăm
        const lst = this.indexPini.get(Math.round(best.x) + ',' + Math.round(best.y));
        const comp = lst.find(p => !p.bb);
        if (comp && preferComp !== false) return comp;
      }
      return best;
    }

    // ---------- selecție ----------
    selecteaza(sel) {
      this.selectie = sel;
      this.actualizeazaSelectie();
      M.bus.emit('selectie', sel);
    }
    actualizeazaSelectie() {
      for (const [id, g] of this.noduri) g.classList.toggle('selectat', !!(this.selectie && this.selectie.tip === 'comp' && this.selectie.id === id));
      for (const [id, g] of this.noduriFir) g.classList.toggle('selectat', !!(this.selectie && this.selectie.tip === 'fir' && this.selectie.id === id));
      this.deseneazaManere();
    }
    deseneazaManere() {
      $$('.manere-fir', this.stratSus).forEach(e => e.remove());
      if (!this.selectie || this.selectie.tip !== 'fir' || this.app.simuleaza) return;
      const f = this.proiect.fire.find(x => x.id === this.selectie.id);
      if (!f) return;
      const cale = this.caleFir(f);
      if (!cale) return;
      const g = svgEl('g', { class: 'manere-fir' });
      (f.puncte || []).forEach((p, i) => g.append(svgEl('circle', { class: 'punct-fir', cx: p[0], cy: p[1], r: 3.2, 'data-punct': i })));
      // mijloacele segmentelor: trage ca să adaugi un colț
      for (let i = 0; i < cale.pts.length - 1; i++) {
        const a = cale.pts[i], b = cale.pts[i + 1];
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        g.append(svgEl('circle', { class: 'punct-fir', cx: mx, cy: my, r: 2.2, 'data-mijloc': i, style: 'opacity:.6' }));
      }
      this.stratSus.append(g);
    }

    // ---------- adăugare ----------
    adauga(tip, lume) {
      const def = M.componente.def(tip);
      if (!def) return null;
      if (this.app.simuleaza) { M.dialog.notifica('Oprește simularea ca să modifici schema.'); return null; }
      this.app.istoric.inregistreaza();
      let poz = lume;
      if (!poz) {
        const r = this.svg.getBoundingClientRect();
        poz = this.ecranLaLume(r.left + r.width / 2, r.top + r.height / 2);
        const b = def.cutie(M.componente.propImplicite(def));
        poz = { x: poz.x - b.w / 2 - b.x, y: poz.y - b.h / 2 - b.y };
        // evităm suprapunerea exactă cu ultima piesă adăugată
        const ult = this.proiect.componente[this.proiect.componente.length - 1];
        if (ult && Math.abs(ult.x - poz.x) < 30 && Math.abs(ult.y - poz.y) < 30) { poz.x += 40; poz.y += 40; }
      }
      const c = M.proiect.adaugaComponenta(this.proiect, tip, poz.x, poz.y);
      this.randeazaTot();
      this.selecteaza({ tip: 'comp', id: c.id });
      this.app.schimbare('schema');
      return c;
    }
    stergeSelectia() {
      const s = this.selectie;
      if (!s) return;
      if (this.app.simuleaza) { M.dialog.notifica('Oprește simularea ca să modifici schema.'); return; }
      this.app.istoric.inregistreaza();
      if (s.tip === 'comp') M.proiect.stergeComponenta(this.proiect, s.id);
      else this.proiect.fire = this.proiect.fire.filter(f => f.id !== s.id);
      this.selectie = null;
      this.randeazaTot();
      M.bus.emit('selectie', null);
      this.app.schimbare('schema');
    }
    rotesteSelectia(pas) {
      const s = this.selectie;
      if (!s || s.tip !== 'comp' || this.app.simuleaza) return;
      const c = this.proiect.componente.find(x => x.id === s.id);
      if (!c) return;
      this.app.istoric.inregistreaza();
      c.rot = (((c.rot || 0) + (pas || 90)) % 360 + 360) % 360;
      this.randeazaComp(c);
      this.actualizeazaFireComp(c.id);
      this.reconstruiesteIndex();
      this.deseneazaManere();
      this.app.schimbare('schema');
    }
    duplicaSelectia() {
      const s = this.selectie;
      if (!s || s.tip !== 'comp' || this.app.simuleaza) return;
      const c = this.proiect.componente.find(x => x.id === s.id);
      if (!c) return;
      this.app.istoric.inregistreaza();
      const n = M.proiect.adaugaComponenta(this.proiect, c.tip, c.x + 30, c.y + 30, M.proiect.copie(c.prop), { rot: c.rot });
      this.randeazaTot();
      this.selecteaza({ tip: 'comp', id: n.id });
      this.app.schimbare('schema');
    }
    mutaSelectia(dx, dy) {
      const s = this.selectie;
      if (!s || s.tip !== 'comp' || this.app.simuleaza) return;
      const c = this.proiect.componente.find(x => x.id === s.id);
      if (!c) return;
      this.app.istoric.inregistreaza();
      c.x += dx; c.y += dy;
      this.randeazaComp(c); this.actualizeazaFireComp(c.id); this.reconstruiesteIndex();
      this.app.schimbare('schema');
    }

    // ---------- evenimente ----------
    evenimente() {
      const svg = this.svg;
      svg.addEventListener('pointerdown', e => this.jos(e));
      svg.addEventListener('pointermove', e => this.misca(e));
      svg.addEventListener('pointerup', e => this.sus(e));
      svg.addEventListener('pointercancel', e => this.sus(e, true));
      svg.addEventListener('pointerleave', () => this.ascundeBalon());
      svg.addEventListener('wheel', e => {
        e.preventDefault();
        if (e.ctrlKey || Math.abs(e.deltaY) >= 40 || e.deltaMode === 1) {
          const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0022));
          this.zoom(f, e.clientX, e.clientY);
        } else {
          this.vedere.x -= e.deltaX; this.vedere.y -= e.deltaY; this.aplicaVedere();
        }
      }, { passive: false });
      svg.addEventListener('dragover', e => { if (e.dataTransfer && e.dataTransfer.types.includes('text/mester-tip')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
      svg.addEventListener('drop', e => {
        const tip = e.dataTransfer && e.dataTransfer.getData('text/mester-tip');
        if (!tip) return;
        e.preventDefault();
        const def = M.componente.def(tip);
        const w = this.ecranLaLume(e.clientX, e.clientY);
        const b = def.cutie(M.componente.propImplicite(def));
        this.adauga(tip, { x: w.x - b.x - b.w / 2, y: w.y - b.y - b.h / 2 });
      });
      new ResizeObserver(() => { if (!this.vedereInitiala) { this.vedereInitiala = true; } }).observe(this.gazda);
    }
    tinta(e) {
      const t = e.target;
      const act = t.closest ? t.closest('[data-act]') : null;
      const pin = t.closest ? t.closest('.pin') : null;
      const punct = t.closest ? t.closest('.punct-fir') : null;
      const fir = t.closest ? t.closest('.fir') : null;
      const comp = t.closest ? t.closest('.comp') : null;
      return { act, pin, punct, fir, comp };
    }
    jos(e) {
      this.svg.setPointerCapture && this.svg.setPointerCapture(e.pointerId);
      this.pointeri.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointeri.size === 2) {
        const [a, b] = [...this.pointeri.values()];
        this.gestiune = { tip: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), k0: this.vedere.k, c0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, v0: Object.assign({}, this.vedere) };
        this.anuleazaActiuneSim();
        return;
      }
      if (this.pointeri.size > 2) return;
      const w = this.ecranLaLume(e.clientX, e.clientY);
      const t = this.tinta(e);
      const sim = this.app.simuleaza;
      this.start = { x: e.clientX, y: e.clientY, w, timp: performance.now() };
      // în simulare: butoane, potențiometre etc.
      if (sim && t.act && t.comp) {
        const id = t.comp.dataset.id;
        const c = this.proiect.componente.find(x => x.id === id);
        const act = t.act.dataset.act;
        const def = M.componente.def(c.tip);
        this.selecteaza({ tip: 'comp', id });
        if (def.rotire && act === def.rotireAct || act === 'pot') {
          this.gestiune = { tip: 'rotire', c, def, v0: (c.control || {})[def.rotire.cheie] !== undefined ? c.control[def.rotire.cheie] : 50, y0: e.clientY, x0: e.clientX };
          return;
        }
        const extra = Object.assign({}, t.act.dataset, { lume: w, local: R.inversTransforma(c, w.x, w.y) });
        this.sim.actiune(c, act, 'jos', extra);
        this.gestiune = { tip: 'actiune', c, act, extra };
        e.preventDefault();
        return;
      }
      // fir început: al doilea clic termină firul
      if (this.firInCurs) {
        const p = this.pinLa(w.x, w.y);
        if (p && !(p.c === this.firInCurs.a.c && p.p === this.firInCurs.a.p)) { this.termina(p); return; }
        if (p && p.c === this.firInCurs.a.c && p.p === this.firInCurs.a.p) { this.anuleazaFir(); return; }
        // punct intermediar
        this.gestiune = { tip: 'fir-punct', w };
        return;
      }
      if (!sim && t.punct) {
        const f = this.proiect.fire.find(x => this.selectie && x.id === this.selectie.id);
        if (f) {
          this.app.istoric.inregistreaza();
          if (t.punct.dataset.mijloc !== undefined) {
            const i = +t.punct.dataset.mijloc;
            f.puncte = f.puncte || [];
            f.puncte.splice(i, 0, [Math.round(w.x / 5) * 5, Math.round(w.y / 5) * 5]);
            this.gestiune = { tip: 'punct', f, i };
          } else this.gestiune = { tip: 'punct', f, i: +t.punct.dataset.punct };
          return;
        }
      }
      // pin sau gaură: începe un fir
      if (!sim) {
        const p = this.pinLa(w.x, w.y);
        const pePin = t.pin || (p && (!t.comp || M.componente.def(this.proiect.componente.find(x => x.id === t.comp.dataset.id).tip).esteBreadboard));
        if (p && pePin) {
          this.gestiune = { tip: 'fir-start', p };
          return;
        }
      }
      if (t.fir) {
        this.selecteaza({ tip: 'fir', id: t.fir.dataset.fir });
        this.gestiune = { tip: 'nimic' };
        return;
      }
      if (t.comp) {
        const id = t.comp.dataset.id;
        const c = this.proiect.componente.find(x => x.id === id);
        this.selecteaza({ tip: 'comp', id });
        if (!sim) this.gestiune = { tip: 'muta', c, x0: c.x, y0: c.y, w0: w, mutat: false };
        else this.gestiune = { tip: 'nimic' };
        return;
      }
      this.gestiune = { tip: 'pan', v0: Object.assign({}, this.vedere), s0: { x: e.clientX, y: e.clientY }, mutat: false };
    }
    misca(e) {
      if (this.pointeri.has(e.pointerId)) this.pointeri.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = this.gestiune;
      const w = this.ecranLaLume(e.clientX, e.clientY);
      if (g && g.tip === 'pinch' && this.pointeri.size >= 2) {
        const [a, b] = [...this.pointeri.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const r = this.svg.getBoundingClientRect();
        const k = clamp(g.k0 * d / (g.d0 || 1), 0.2, 9);
        const px = g.c0.x - r.left, py = g.c0.y - r.top;
        this.vedere.k = k;
        this.vedere.x = px - (px - g.v0.x) * (k / g.v0.k) + (c.x - g.c0.x);
        this.vedere.y = py - (py - g.v0.y) * (k / g.v0.k) + (c.y - g.c0.y);
        this.aplicaVedere();
        return;
      }
      const dist = this.start ? Math.hypot(e.clientX - this.start.x, e.clientY - this.start.y) : 0;
      if (g && g.tip === 'pan' && e.buttons) {
        if (dist > 3) g.mutat = true;
        this.vedere.x = g.v0.x + (e.clientX - g.s0.x);
        this.vedere.y = g.v0.y + (e.clientY - g.s0.y);
        this.aplicaVedere();
        return;
      }
      if (g && g.tip === 'muta' && e.buttons) {
        if (!g.mutat && dist < 4) return;
        if (!g.mutat) { g.mutat = true; this.app.istoric.inregistreaza(); this.noduri.get(g.c.id).classList.add('trage'); }
        g.c.x = Math.round((g.x0 + (w.x - g.w0.x)) / 10) * 10;
        g.c.y = Math.round((g.y0 + (w.y - g.w0.y)) / 10) * 10;
        this.noduri.get(g.c.id).setAttribute('transform', this.transformComp(g.c));
        const cv = this.canvasuri.get(g.c.id);
        if (cv) this.pregatesteCanvas(g.c, M.componente.def(g.c.tip), M.componente.prop(g.c));
        this.actualizeazaFireComp(g.c.id);
        this.evidentiazaInfingere(g.c);
        return;
      }
      if (g && g.tip === 'punct' && e.buttons) {
        g.f.puncte[g.i] = [Math.round(w.x / 5) * 5, Math.round(w.y / 5) * 5];
        this.randeazaFir(g.f);
        this.deseneazaManere();
        return;
      }
      if (g && g.tip === 'fir-start' && e.buttons && dist > 6) {
        this.firInCurs = { a: g.p, puncte: [], trasare: true };
        this.gestiune = { tip: 'fir-trage' };
      }
      if (g && g.tip === 'rotire' && e.buttons) {
        const d = def => def.rotire;
        const r = d(g.def);
        const delta = (g.y0 - e.clientY) + (e.clientX - g.x0);
        const v = clamp(g.v0 + delta * (r.max - r.min) / 220, r.min, r.max);
        this.sim.control(g.c, r.cheie, Math.round(v * 10) / 10);
        M.bus.emit('control', g.c);
        return;
      }
      if (this.firInCurs) {
        this.deseneazaFirFantoma(w);
      }
      // balon pentru pini și găuri
      if (!e.buttons || (g && (g.tip === 'fir-trage'))) this.balonPin(w, e);
    }
    sus(e, anulat) {
      this.pointeri.delete(e.pointerId);
      const g = this.gestiune;
      if (this.pointeri.size > 0) { if (g && g.tip === 'pinch') this.gestiune = null; return; }
      this.gestiune = null;
      if (!g || anulat) { if (g && g.tip === 'actiune') this.sim.actiune(g.c, g.act, 'sus', g.extra); this.curataEvidentieri(); return; }
      const w = this.ecranLaLume(e.clientX, e.clientY);
      switch (g.tip) {
        case 'actiune': this.sim.actiune(g.c, g.act, 'sus', g.extra); break;
        case 'pan': if (!g.mutat) { this.selecteaza(null); } break;
        case 'muta':
          if (g.mutat) {
            this.noduri.get(g.c.id).classList.remove('trage');
            this.curataEvidentieri();
            this.reconstruiesteIndex();
            this.app.schimbare('schema');
          }
          break;
        case 'punct': this.app.schimbare('schema'); break;
        case 'fir-start':
          // atingere scurtă pe un pin: pornim firul în modul „atinge al doilea pin”
          this.firInCurs = { a: g.p, puncte: [] };
          this.deseneazaFirFantoma(w);
          M.dialog.notifica('Atinge al doilea pin ca să termini firul. Atinge planșa ca să faci un colț.', 3200);
          break;
        case 'fir-trage': {
          const p = this.pinLa(w.x, w.y);
          if (p && !(p.c === this.firInCurs.a.c && p.p === this.firInCurs.a.p)) this.termina(p);
          else if (!p) { /* rămâne în curs, utilizatorul poate continua cu atingeri */ this.deseneazaFirFantoma(w); }
          break;
        }
        case 'fir-punct': {
          const dist = this.start ? Math.hypot(e.clientX - this.start.x, e.clientY - this.start.y) : 0;
          if (dist < 6 && this.firInCurs) { this.firInCurs.puncte.push([Math.round(w.x / 5) * 5, Math.round(w.y / 5) * 5]); this.deseneazaFirFantoma(w); }
          break;
        }
      }
    }
    anuleazaActiuneSim() {
      const g = this.gestiune;
      if (g && g.tip === 'actiune') this.sim.actiune(g.c, g.act, 'sus', g.extra);
    }
    termina(p) {
      const a = this.firInCurs.a;
      const puncte = this.firInCurs.puncte;
      this.firInCurs = null;
      $$('.fir-fantoma', this.stratSus).forEach(x => x.remove());
      const exista = this.proiect.fire.some(f => (f.a.c === a.c && f.a.p === a.p && f.b.c === p.c && f.b.p === p.p) || (f.b.c === a.c && f.b.p === a.p && f.a.c === p.c && f.a.p === p.p));
      if (exista) { M.dialog.notifica('Firul există deja.'); return; }
      this.app.istoric.inregistreaza();
      const f = M.proiect.adaugaFir(this.proiect, { c: a.c, p: a.p }, { c: p.c, p: p.p }, this.culoareFir(a, p), puncte);
      this.randeazaFir(f);
      this.selecteaza({ tip: 'fir', id: f.id });
      this.app.schimbare('schema');
    }
    anuleazaFir() {
      this.firInCurs = null;
      $$('.fir-fantoma', this.stratSus).forEach(x => x.remove());
    }
    culoareFir(a, b) {
      const tip = (ref) => {
        const c = this.proiect.componente.find(x => x.id === ref.c);
        const def = M.componente.def(c.tip);
        if (def.esteBreadboard) {
          const s = /^S(\d)_/.exec(ref.p);
          if (s) return s[1] === '1' || s[1] === '3' ? 'vcc' : 'gnd';
          return 'semnal';
        }
        const pin = M.componente.pini(c).find(x => x.id === ref.p);
        return pin ? tipPin(def, pin) : 'semnal';
      };
      const ta = tip(a), tb = tip(b);
      if (ta === 'gnd' || tb === 'gnd') return '#1f1f1f';
      if (ta === 'vcc' || tb === 'vcc') return '#e53935';
      const paleta = ['#43a047', '#1e88e5', '#fdd835', '#fb8c00', '#8e24aa', '#f5f5f5', '#795548'];
      const c = paleta[this.urmatoareaCuloare % paleta.length];
      this.urmatoareaCuloare++;
      return c;
    }
    deseneazaFirFantoma(w) {
      $$('.fir-fantoma', this.stratSus).forEach(x => x.remove());
      if (!this.firInCurs) return;
      const a = this.pozitiePin(this.firInCurs.a);
      if (!a) return;
      const p = this.pinLa(w.x, w.y);
      const final = p ? { x: p.x, y: p.y } : w;
      const pts = [a, ...this.firInCurs.puncte.map(q => ({ x: q[0], y: q[1] })), final];
      const d = caleRotunjita(pts, 4);
      this.stratSus.append(svgEl('path', { class: 'fir-fantoma', d, style: 'stroke:var(--accent)', 'stroke-width': 2.2 }));
      this.stratSus.append(svgEl('circle', { class: 'fir-fantoma', cx: a.x, cy: a.y, r: 3.2, style: 'fill:var(--accent)' }));
      if (p) this.stratSus.append(svgEl('circle', { class: 'fir-fantoma', cx: p.x, cy: p.y, r: 4, style: 'fill:none;stroke:var(--accent)', 'stroke-width': 1.2 }));
    }
    // arată ce găuri de breadboard ar prinde pinii componentei trase
    evidentiazaInfingere(c) {
      this.curataEvidentieri();
      const g = svgEl('g', { class: 'evidentieri' });
      for (const pin of M.componente.pini(c)) {
        const w = R.transforma(c, pin.x, pin.y);
        const lst = this.indexPini.get(Math.round(w.x) + ',' + Math.round(w.y));
        if (lst && lst.some(p => p.c !== c.id)) g.append(svgEl('circle', { cx: w.x, cy: w.y, r: 3.4, class: 'pin conectat-ok' }));
      }
      this.stratSus.append(g);
    }
    curataEvidentieri() { $$('.evidentieri, .banda', this.stratSus).forEach(x => x.remove()); }
    balonPin(w, e) {
      const p = this.pinLa(w.x, w.y);
      $$('.banda', this.stratSus).forEach(x => x.remove());
      if (!p) { this.ascundeBalon(); return; }
      const c = this.proiect.componente.find(x => x.id === p.c);
      const def = M.componente.def(c.tip);
      let titlu, desc = '';
      if (def.esteBreadboard) {
        const s = /^S(\d)_(\d+)/.exec(p.p);
        titlu = s ? 'Șina ' + (s[1] === '1' || s[1] === '3' ? '+' : '−') + (s[1] <= 2 ? ' de sus' : ' de jos') : 'Gaura ' + p.p;
        // evidențiem banda (găurile legate)
        const gr = this.grupuriBB.get(c.id) && this.grupuriBB.get(c.id).get(p.p);
        if (gr) {
          const g = svgEl('g', { class: 'banda' });
          for (const id of gr) {
            const pin = M.componente.pini(c).find(x => x.id === id);
            const ww = R.transforma(c, pin.x, pin.y);
            g.append(svgEl('rect', { x: ww.x - 2.4, y: ww.y - 2.4, width: 4.8, height: 4.8, rx: 1, class: 'gaura-evidentiata' }));
          }
          this.stratSus.append(g);
        }
        desc = s ? 'Toată șina e legată' : 'Legată cu ' + (gr ? gr.length - 1 : 4) + ' găuri de pe aceeași coloană';
      } else {
        const pin = M.componente.pini(c).find(x => x.id === p.p);
        titlu = c.eticheta + ' · ' + (pin.eticheta || pin.id);
        if (def.esteplaca) desc = M.placi.descrierePin(M.placi.info(c), pin);
        else desc = pin.descriere || '';
      }
      let tensiune = '';
      if (this.app.simuleaza && this.sim) {
        const net = this.sim.netPin(p.c, p.p);
        if (this.sim.circuit.flotant(net)) tensiune = 'neconectat (flotant)';
        else { const v = this.sim.circuit.tensiune(net); if (!isNaN(v)) tensiune = M.u.numar(v, 2) + ' V'; }
      }
      this.arataBalon(e.clientX, e.clientY, '<b>' + esc(titlu) + '</b>' + (tensiune ? ' — <b>' + esc(tensiune) + '</b>' : '') + (desc ? '<br><span class="sec">' + esc(desc) + '</span>' : ''));
    }
    arataBalon(x, y, html) {
      if (!this.balon) { this.balon = M.u.el('div', { class: 'balon' }); document.body.append(this.balon); }
      this.balon.innerHTML = html;
      this.balon.hidden = false;
      const lat = this.balon.offsetWidth, ina = this.balon.offsetHeight;
      let bx = x + 14, by = y + 16;
      if (bx + lat > window.innerWidth - 8) bx = x - lat - 14;
      if (by + ina > window.innerHeight - 8) by = y - ina - 12;
      this.balon.style.left = bx + 'px'; this.balon.style.top = by + 'px';
    }
    ascundeBalon() { if (this.balon) this.balon.hidden = true; $$('.banda', this.stratSus).forEach(x => x.remove()); }

    // ---------- simulare: actualizarea vizuală ----------
    actualizeazaVizualComp(c) {
      const def = M.componente.def(c.tip);
      if (!def || !def.vizual) return;
      const g = this.noduri.get(c.id);
      if (!g) return;
      const sim = this.app.simuleaza ? this.sim : null;
      try { def.vizual(g, c, sim, sim ? sim.el.get(c.id) : null, sim ? sim.disp.get(c.id) : null); } catch (e) { console.error('vizual', c.tip, e); }
    }
    actualizeazaVizual() {
      for (const c of this.proiect.componente) this.actualizeazaVizualComp(c);
      if (this.sim) {
        for (const [id, cv] of this.canvasuri) {
          const d = this.sim.disp.get(id);
          if (d && d.deseneaza && (d.murdar || d.mereuDesenat)) { d.canvas = cv; d.murdar = false; d.deseneaza(cv.getContext('2d'), cv); }
        }
      }
    }
    // readuce ecranele la „stins” după oprirea simulării
    reseteazaEcrane() {
      for (const [id, cv] of this.canvasuri) {
        const c = this.proiect.componente.find(x => x.id === id);
        if (c) this.pregatesteCanvas(c, M.componente.def(c.tip), M.componente.prop(c));
      }
    }
  }

  const $$ = M.u.$$;
  // cale cu colțuri rotunjite printr-o listă de puncte
  function caleRotunjita(pts, raza) {
    if (pts.length < 2) return '';
    let d = 'M' + pts[0].x.toFixed(2) + ' ' + pts[0].y.toFixed(2);
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      const l1 = Math.hypot(b.x - a.x, b.y - a.y), l2 = Math.hypot(c.x - b.x, c.y - b.y);
      const r = Math.min(raza, l1 / 2, l2 / 2);
      const p1 = { x: b.x - (b.x - a.x) / (l1 || 1) * r, y: b.y - (b.y - a.y) / (l1 || 1) * r };
      const p2 = { x: b.x + (c.x - b.x) / (l2 || 1) * r, y: b.y + (c.y - b.y) / (l2 || 1) * r };
      d += ' L' + p1.x.toFixed(2) + ' ' + p1.y.toFixed(2) + ' Q' + b.x.toFixed(2) + ' ' + b.y.toFixed(2) + ' ' + p2.x.toFixed(2) + ' ' + p2.y.toFixed(2);
    }
    const u = pts[pts.length - 1];
    d += ' L' + u.x.toFixed(2) + ' ' + u.y.toFixed(2);
    return d;
  }

  M.Spatiu = Spatiu;
  M.caleRotunjita = caleRotunjita;
})(window.M = window.M || {});
