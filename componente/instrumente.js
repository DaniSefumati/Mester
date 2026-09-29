/* Meșter — instrumente de măsură: multimetru digital (tensiune, curent, rezistență, cu siguranță care se
   arde dacă îl pui greșit), osciloscop cu două canale (declanșare pe front, măsoară frecvența și tensiunile)
   și analizor logic cu 4 canale (arată semnalele digitale și frecvența lor). */
(function (M) {
  'use strict';
  const D = M.desen;

  // ---------- multimetru ----------
  const MODURI_MM = ['V', 'mA', 'Ω'];
  const V_OHM = 2.0, R_OHM = 10000; // ohmmetrul: 2 V în gol, prin 10 kΩ
  function afisajMM(mod, x) {
    if (x === 'OL' || x === 'FUSE' || x === '----') return { val: x, unit: mod === 0 ? 'V' : mod === 1 ? 'mA' : 'Ω' };
    const cif = (v) => { const a = Math.abs(v); return a < 2 ? v.toFixed(3) : a < 20 ? v.toFixed(2) : a < 200 ? v.toFixed(1) : v.toFixed(0); };
    if (mod === 0) return Math.abs(x) < 0.2 ? { val: cif(x * 1000), unit: 'mV' } : { val: cif(x), unit: 'V' };
    if (mod === 1) return Math.abs(x) < 0.002 ? { val: cif(x * 1e6), unit: 'µA' } : { val: cif(x * 1000), unit: 'mA' };
    if (x < 1000) return { val: cif(x), unit: 'Ω' };
    if (x < 1e6) return { val: cif(x / 1000), unit: 'kΩ' };
    return { val: cif(x / 1e6), unit: 'MΩ' };
  }
  M.componente.defineste({
    tip: 'multimetru', nume: 'Multimetru digital', categorie: 'instrumente', eticheta: 'MM', vizualLaDesen: true,
    cauta: 'multimetru voltmetru ampermetru ohmmetru masura tensiune curent rezistenta aparat',
    descriere: 'Măsoară tensiunea (în paralel, între două puncte), curentul (în serie, circuitul trece prin aparat) și rezistența (cu circuitul oprit). Firul negru merge la COM. Alege modul cu butoanele de pe aparat sau din panoul din dreapta.',
    control: [{ cheie: 'mod', eticheta: 'Mod de măsură', min: 0, max: 2, pas: 1, implicit: 0, format: (v) => ['Tensiune (V)', 'Curent (mA)', 'Rezistență (Ω)'][v] || '' }],
    pini: () => [
      { id: 'COM', x: 0, y: 0, eticheta: 'COM', tip: 'pasiv', descriere: 'Borna comună (firul negru)' },
      { id: 'V', x: 30, y: 0, eticheta: 'VΩmA', tip: 'pasiv', descriere: 'Borna de măsură (firul roșu)' }
    ],
    cutie: () => ({ x: -17, y: -112, w: 64, h: 114 }),
    desen() {
      let s = '';
      s += `<rect x="-17" y="-112" width="64" height="108" rx="7" fill="#f2b705" stroke="#b8860b" stroke-width="0.8"/>`;
      s += `<rect x="-13" y="-108" width="56" height="100" rx="5" fill="#2b2e33"/>`;
      s += `<rect x="-9" y="-104" width="48" height="26" rx="2" fill="#b9c8a4" stroke="#6f7d5f" stroke-width="0.6"/>`;
      s += `<text data-r="val" x="36" y="-88" font-size="12" font-family="var(--font-cod)" font-weight="700" fill="#1e261a" text-anchor="end" dominant-baseline="central">0.000</text>`;
      s += `<text data-r="unit" x="36" y="-81" font-size="4.2" font-family="var(--font-pcb)" font-weight="700" fill="#1e261a" text-anchor="end" dominant-baseline="central">V</text>`;
      s += `<text data-r="mod" x="-6" y="-100.5" font-size="3.4" font-family="var(--font-pcb)" font-weight="700" fill="#1e261a" dominant-baseline="central">DC</text>`;
      // butoanele de mod
      MODURI_MM.forEach((m, i) => {
        const x = -8 + i * 16;
        s += `<g data-act="mod${i}" class="interactiv"><rect data-r="b${i}" x="${x}" y="-72" width="14" height="10" rx="2" fill="#3b4048" stroke="#555c66" stroke-width="0.5"/>`;
        s += D.text(x + 7, -67, m, { m: 4.6, c: '#e8eaed' }) + '</g>';
      });
      // selectorul rotativ (decorativ, arată modul)
      s += `<circle cx="15" cy="-40" r="14" fill="#1b1d21" stroke="#4a4f57" stroke-width="0.8"/>`;
      s += `<g data-r="selector" transform="rotate(-40 15 -40)"><rect x="13.6" y="-53" width="2.8" height="12" rx="1.2" fill="#e8eaed"/></g>`;
      s += D.text(-2, -55, 'V⎓', { m: 3.4, c: '#f2b705' }) + D.text(15, -58, 'mA', { m: 3.4, c: '#f2b705' }) + D.text(32, -55, 'Ω', { m: 3.6, c: '#f2b705' });
      // bornele
      s += `<circle cx="0" cy="-14" r="5" fill="#111" stroke="#666" stroke-width="0.6"/><circle cx="0" cy="-14" r="2" fill="#444"/>`;
      s += `<circle cx="30" cy="-14" r="5" fill="#b3261e" stroke="#e57373" stroke-width="0.6"/><circle cx="30" cy="-14" r="2" fill="#5a0f0b"/>`;
      s += D.text(0, -22, 'COM', { m: 3.2, c: '#e8eaed' }) + D.text(30, -22, 'VΩmA', { m: 3.2, c: '#e8eaed' });
      s += `<path d="M0 -9 V0" stroke="#111" stroke-width="1.6"/><path d="M30 -9 V0" stroke="#b3261e" stroke-width="1.6"/>`;
      return s;
    },
    electric(ctx, inst) {
      const r = ctx.R('V', 'COM', 1e7);
      const src = ctx.V('V', 'COM', V_OHM, R_OHM);
      const el = { r, src, siguranta: true };
      el.actualizeaza = () => {
        const mod = +(inst.control && inst.control.mod) || 0;
        el.mod = mod;
        r.r = mod === 0 ? 1e7 : mod === 1 ? (el.siguranta ? 0.5 : 1e12) : 1e12;
        src.activa = mod === 2;
      };
      el.actualizeaza();
      return el;
    },
    laControl(inst, el, sim) { if (el && el.actualizeaza) { el.actualizeaza(); sim.murdarComponenta(inst); } },
    actiune(inst, act, faza, el, sim) {
      if (faza !== 'jos' || !/^mod\d$/.test(act)) return;
      sim.control(inst, 'mod', +act.slice(3));
      M.bus && M.bus.emit('control');
    },
    dispozitiv(inst, sim, el) {
      return {
        afisat: null, tAfis: 0,
        cadru() {
          if (!el.r) return;
          if (el.mod === 1 && el.siguranta && Math.abs(el.r.i) > 0.4) {
            el.siguranta = false;
            el.actualizeaza();
            sim.murdarComponenta(inst);
            sim.problema('mm-siguranta-' + inst.id, 'eroare', 'Siguranța multimetrului ' + inst.eticheta + ' s-a ars: prin el au trecut ' + Math.abs(el.r.i).toFixed(2) + ' A. În modul mA, aparatul se pune în serie cu circuitul (circuitul trece prin el), niciodată direct pe o sursă.', { comp: inst.id });
          }
          if (el.mod === 2) {
            const i = el.src.iMed !== undefined ? el.src.iMed : el.src.i;
            if (i < -1e-6) sim.problema('mm-ohm-' + inst.id, 'avertisment', 'Multimetrul ' + inst.eticheta + ' măsoară rezistența într-un circuit alimentat: valoarea e greșită și aparatul se poate strica. Oprește alimentarea (sau scoate piesa) înainte să măsori în Ω.', { comp: inst.id });
          }
        },
        valoare() {
          if (!el.r) return '----';
          if (el.mod === 1 && !el.siguranta) return 'FUSE';
          if (el.mod === 0) { const i = el.r.iMed !== undefined ? el.r.iMed : el.r.i; return i * el.r.r; }
          if (el.mod === 1) return el.r.iMed !== undefined ? el.r.iMed : el.r.i;
          const i = el.src.iMed !== undefined ? el.src.iMed : el.src.i;
          if (!(i > 1e-9)) return 'OL';
          const vm = V_OHM - i * R_OHM;
          const rx = vm / i;
          return rx > 4e7 || rx < 0 ? 'OL' : rx;
        }
      };
    },
    vizual(g, inst, sim, el, disp) {
      const mod = +(inst.control && inst.control.mod) || 0;
      for (let i = 0; i < 3; i++) { const b = g.querySelector('[data-r="b' + i + '"]'); if (b) b.setAttribute('fill', i === mod ? '#c77700' : '#3b4048'); }
      const sel = g.querySelector('[data-r="selector"]');
      if (sel) sel.setAttribute('transform', 'rotate(' + [-40, 0, 40][mod] + ' 15 -40)');
      const tv = g.querySelector('[data-r="val"]'), tu = g.querySelector('[data-r="unit"]'), tm = g.querySelector('[data-r="mod"]');
      if (tm) tm.textContent = mod === 2 ? '' : 'DC';
      if (!sim || !disp) { if (tv) tv.textContent = mod === 2 ? 'OL' : '0.000'; if (tu) tu.textContent = ['V', 'mA', 'Ω'][mod]; return; }
      // afișajul se împrospătează de ~3 ori pe secundă, ca la un aparat adevărat
      const acum = performance.now();
      if (disp.afisat && acum - disp.tAfis < 330) return;
      disp.tAfis = acum;
      const a = afisajMM(mod, disp.valoare());
      disp.afisat = a;
      if (tv) tv.textContent = a.val;
      if (tu) tu.textContent = a.unit;
    },
    masura(el, inst, sim) {
      const d = sim && sim.disp.get(inst.id);
      if (!d) return [];
      const a = afisajMM(el.mod || 0, d.valoare());
      return [['Afișaj', a.val + ' ' + a.unit]];
    },
    reseteaza(disp, el) { if (el) { el.siguranta = true; if (el.actualizeaza) el.actualizeaza(); } }
  });

  // ---------- captura semnalelor (osciloscop, analizor logic) ----------
  const BAZE = [[0.0001, '0,1 ms'], [0.0002, '0,2 ms'], [0.0005, '0,5 ms'], [0.001, '1 ms'], [0.002, '2 ms'], [0.005, '5 ms'], [0.01, '10 ms'], [0.02, '20 ms'], [0.05, '50 ms'], [0.1, '0,1 s'], [0.2, '0,2 s'], [0.5, '0,5 s'], [1, '1 s']];
  const VOLTI = [[0.2, '0,2 V'], [0.5, '0,5 V'], [1, '1 V'], [2, '2 V'], [5, '5 V']];
  const PUNCTE = 400;
  class Captura {
    constructor(sim, inst, canale, gnd) {
      this.sim = sim; this.inst = inst;
      const ng = sim.netPin(inst, gnd);
      this.sonde = canale.map(c => { const n = sim.netPin(inst, c); return n >= 0 ? new M.sunet.Sonda(sim, n, ng) : null; });
      this.gndLegat = ng >= 0 && !sim.circuit.flotant(ng);
      this.buf = canale.map(() => new Float32Array(PUNCTE * 4));
      this.n = 0; this.t0 = sim.timp; this.baza = -1;
    }
    // adaugă eșantioanele până la timpul de acum
    avanseaza(baza) {
      const sim = this.sim;
      const dt = BAZE[baza][0] * 10 / PUNCTE * 1e6; // µs pe eșantion
      if (baza !== this.baza) { this.baza = baza; this.n = 0; this.t0 = sim.timp; for (const s of this.sonde) if (s) s.randeaza(sim.timp - 1, sim.timp, 1); return; }
      let k = Math.floor((sim.timp - this.t0) / dt);
      if (k <= 0) return;
      const max = this.buf[0].length;
      if (k > max) { this.t0 += (k - max) * dt; for (const s of this.sonde) if (s) s.randeaza(this.t0 - 1, this.t0, 1); k = max; }
      const t1 = this.t0 + k * dt;
      this.sonde.forEach((s, c) => {
        const v = s ? s.randeaza(this.t0, t1, k) : new Float32Array(k);
        const b = this.buf[c];
        if (this.n + k > max) { const pastrez = max - k; b.copyWithin(0, this.n - pastrez, this.n); }
        const start = Math.min(this.n, max - k);
        b.set(v, start);
      });
      this.n = Math.min(max, this.n + k);
      this.t0 = t1;
    }
    // fereastra afișată: după ultimul front crescător care are o fereastră întreagă după el
    fereastra(c, nivel) {
      const b = this.buf[c], n = this.n;
      if (n < PUNCTE) return { start: Math.max(0, n - PUNCTE), declansat: false };
      let lo = Infinity, hi = -Infinity;
      for (let i = n - PUNCTE * 2 > 0 ? n - PUNCTE * 2 : 0; i < n; i++) { if (b[i] < lo) lo = b[i]; if (b[i] > hi) hi = b[i]; }
      const prag = nivel !== undefined ? nivel : (lo + hi) / 2;
      if (hi - lo > 0.1) for (let i = n - PUNCTE; i > 0; i--) if (b[i - 1] < prag && b[i] >= prag) return { start: i - PUNCTE / 10, declansat: true, prag };
      return { start: n - PUNCTE, declansat: false, prag };
    }
    masuri(c) {
      const b = this.buf[c], n = this.n;
      if (!n) return null;
      const de = Math.max(0, n - PUNCTE * 4);
      let lo = Infinity, hi = -Infinity, s = 0;
      for (let i = de; i < n; i++) { const v = b[i]; if (v < lo) lo = v; if (v > hi) hi = v; s += v; }
      const med = s / (n - de);
      const prag = (lo + hi) / 2;
      const fronturi = [];
      let sus = 0;
      for (let i = de + 1; i < n; i++) { if (b[i - 1] < prag && b[i] >= prag) fronturi.push(i); if (b[i] >= prag) sus++; }
      const dt = BAZE[this.baza][0] * 10 / PUNCTE;
      let f = 0;
      if (hi - lo > 0.1 && fronturi.length >= 2) f = (fronturi.length - 1) / ((fronturi[fronturi.length - 1] - fronturi[0]) * dt);
      return { min: lo, max: hi, med, f, umplere: hi - lo > 0.1 ? sus / (n - de - 1) : (med > 1.6 ? 1 : 0) };
    }
  }
  const fmtF = (f) => !f ? '—' : f >= 1000 ? (f / 1000).toFixed(f >= 1e4 ? 1 : 2) + ' kHz' : f.toFixed(f >= 100 ? 0 : 1) + ' Hz';
  const fmtV = (v) => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2) + ' V';
  const cale = (b, start, n, x0, w, y) => {
    let s = '';
    for (let i = 0; i < PUNCTE; i++) {
      const j = Math.round(start + i);
      if (j < 0 || j >= n) continue;
      s += (s ? 'L' : 'M') + (x0 + i * w / (PUNCTE - 1)).toFixed(1) + ' ' + y(b[j]).toFixed(1);
    }
    return s;
  };

  // ---------- osciloscop ----------
  const OSC = { x: -4, y: -126, w: 160, h: 100 };
  M.componente.defineste({
    tip: 'osciloscop', nume: 'Osciloscop (2 canale)', categorie: 'instrumente', eticheta: 'OSC', vizualLaDesen: true,
    cauta: 'osciloscop scope semnal forma unda pwm frecventa tensiune in timp',
    descriere: 'Desenează tensiunea în timp pe două canale (CH1 galben, CH2 albastru), față de GND. Se sincronizează pe frontul crescător al lui CH1 și arată frecvența, umplerea și tensiunile. Schimbă timpul și volții pe diviziune cu butoanele de pe aparat.',
    control: [
      { cheie: 'baza', eticheta: 'Timp / diviziune', min: 0, max: BAZE.length - 1, pas: 1, implicit: 3, format: (v) => (BAZE[v] || BAZE[3])[1] },
      { cheie: 'volti', eticheta: 'Volți / diviziune', min: 0, max: VOLTI.length - 1, pas: 1, implicit: 2, format: (v) => (VOLTI[v] || VOLTI[2])[1] }
    ],
    pini: () => [
      { id: 'CH1', x: 20, y: 0, eticheta: 'CH1', tip: 'intrare', descriere: 'Canalul 1 (galben)' },
      { id: 'CH2', x: 70, y: 0, eticheta: 'CH2', tip: 'intrare', descriere: 'Canalul 2 (albastru)' },
      { id: 'GND', x: 120, y: 0, eticheta: 'GND', tip: 'gnd', descriere: 'Masa sondelor — leag-o la GND-ul circuitului' }
    ],
    cutie: () => ({ x: -14, y: -140, w: 216, h: 142 }),
    desen() {
      let s = '';
      s += `<rect x="-14" y="-140" width="216" height="130" rx="6" fill="#d9dde2" stroke="#9aa3ad" stroke-width="0.8"/>`;
      s += `<rect x="${OSC.x - 3}" y="${OSC.y - 3}" width="${OSC.w + 6}" height="${OSC.h + 6}" rx="3" fill="#1f2428"/>`;
      s += `<rect x="${OSC.x}" y="${OSC.y}" width="${OSC.w}" height="${OSC.h}" fill="#0b1411"/>`;
      let grila = '';
      for (let i = 1; i < 10; i++) grila += `M${OSC.x + i * OSC.w / 10} ${OSC.y}V${OSC.y + OSC.h}`;
      for (let i = 1; i < 8; i++) grila += `M${OSC.x} ${OSC.y + i * OSC.h / 8}H${OSC.x + OSC.w}`;
      s += `<path d="${grila}" stroke="#23433a" stroke-width="0.35" fill="none"/>`;
      s += `<path d="M${OSC.x} ${OSC.y + OSC.h / 2}H${OSC.x + OSC.w}M${OSC.x + OSC.w / 2} ${OSC.y}V${OSC.y + OSC.h}" stroke="#2f5a4d" stroke-width="0.5" fill="none"/>`;
      s += `<path data-r="ch2" d="" stroke="#4fc3f7" stroke-width="0.9" fill="none" stroke-linejoin="round"/>`;
      s += `<path data-r="ch1" d="" stroke="#ffd54f" stroke-width="0.9" fill="none" stroke-linejoin="round"/>`;
      s += `<text data-r="info1" x="${OSC.x + 3}" y="${OSC.y + 5}" font-size="4.2" font-family="var(--font-cod)" fill="#ffd54f" dominant-baseline="central"></text>`;
      s += `<text data-r="info2" x="${OSC.x + 3}" y="${OSC.y + 11}" font-size="4.2" font-family="var(--font-cod)" fill="#4fc3f7" dominant-baseline="central"></text>`;
      s += `<text data-r="scala" x="${OSC.x + OSC.w - 3}" y="${OSC.y + OSC.h - 4}" font-size="4.2" font-family="var(--font-cod)" fill="#9fb8ae" text-anchor="end" dominant-baseline="central"></text>`;
      s += `<text data-r="trig" x="${OSC.x + OSC.w - 3}" y="${OSC.y + 5}" font-size="4.2" font-family="var(--font-cod)" fill="#9fb8ae" text-anchor="end" dominant-baseline="central">AUTO</text>`;
      // butoane: timp/div și volți/div
      const buton = (act, x, y, t) => `<g data-act="${act}" class="interactiv"><rect x="${x}" y="${y}" width="15" height="11" rx="2" fill="#4a525c" stroke="#2d3339" stroke-width="0.5"/>${D.text(x + 7.5, y + 5.6, t, { m: 5.4, c: '#eef1f4' })}</g>`;
      s += D.text(181, -121, 'TIMP', { m: 3.6, c: '#39424c' }) + buton('t-', 166, -114, '−') + buton('t+', 183, -114, '+');
      s += D.text(181, -93, 'VOLȚI', { m: 3.6, c: '#39424c' }) + buton('v-', 166, -86, '−') + buton('v+', 183, -86, '+');
      s += D.text(181, -64, 'OSC', { m: 5, c: '#39424c', g: 700 });
      // mufele sondelor
      const mufa = (x, cul) => `<circle cx="${x}" cy="-17" r="5" fill="#c9ced4" stroke="#7d868f" stroke-width="0.6"/><circle cx="${x}" cy="-17" r="2" fill="${cul}"/><path d="M${x} -12 V0" stroke="${cul}" stroke-width="1.5"/>`;
      s += mufa(20, '#f9a825') + mufa(70, '#1e88e5') + mufa(120, '#212121');
      s += D.text(33, -17, 'CH1', { m: 3.6, c: '#39424c', a: 'start' }) + D.text(83, -17, 'CH2', { m: 3.6, c: '#39424c', a: 'start' }) + D.text(133, -17, 'GND', { m: 3.6, c: '#39424c', a: 'start' });
      return s;
    },
    electric(ctx) {
      // intrări de 1 MΩ, ca sondele obișnuite (x1)
      return { r1: ctx.R('CH1', 'GND', 1e6), r2: ctx.R('CH2', 'GND', 1e6) };
    },
    laControl() { },
    actiune(inst, act, faza, el, sim) {
      if (faza !== 'jos') return;
      const c = inst.control || {};
      if (act === 't-' || act === 't+') sim.control(inst, 'baza', Math.max(0, Math.min(BAZE.length - 1, (c.baza === undefined ? 3 : c.baza) + (act === 't+' ? 1 : -1))));
      if (act === 'v-' || act === 'v+') sim.control(inst, 'volti', Math.max(0, Math.min(VOLTI.length - 1, (c.volti === undefined ? 2 : c.volti) + (act === 'v+' ? 1 : -1))));
      M.bus && M.bus.emit('control');
    },
    dispozitiv(inst, sim) {
      return {
        cap: null,
        cadru() {
          if (!this.cap) this.cap = new Captura(sim, inst, ['CH1', 'CH2'], 'GND');
          this.cap.avanseaza(+(inst.control && inst.control.baza !== undefined ? inst.control.baza : 3));
        }
      };
    },
    vizual(g, inst, sim, el, disp) {
      const ctl = inst.control || {};
      const bz = BAZE[ctl.baza === undefined ? 3 : ctl.baza] || BAZE[3], vd = VOLTI[ctl.volti === undefined ? 2 : ctl.volti] || VOLTI[2];
      const sc = g.querySelector('[data-r="scala"]');
      if (sc) sc.textContent = bz[1] + '/div  ' + vd[1] + '/div';
      const p1 = g.querySelector('[data-r="ch1"]'), p2 = g.querySelector('[data-r="ch2"]');
      const i1 = g.querySelector('[data-r="info1"]'), i2 = g.querySelector('[data-r="info2"]'), tr = g.querySelector('[data-r="trig"]');
      if (!sim || !disp || !disp.cap) { p1.setAttribute('d', ''); p2.setAttribute('d', ''); i1.textContent = ''; i2.textContent = ''; return; }
      const cap = disp.cap;
      const y = (v) => Math.max(OSC.y, Math.min(OSC.y + OSC.h, OSC.y + OSC.h / 2 - v / vd[0] * OSC.h / 8 + OSC.h * 0.25));
      const f = cap.fereastra(0);
      p1.setAttribute('d', cap.sonde[0] ? cale(cap.buf[0], f.start, cap.n, OSC.x, OSC.w, y) : '');
      p2.setAttribute('d', cap.sonde[1] ? cale(cap.buf[1], f.start, cap.n, OSC.x, OSC.w, y) : '');
      tr.textContent = f.declansat ? 'TRIG ↑' : 'AUTO';
      const text = (m) => !m ? '' : m.max - m.min > 0.1 ? fmtF(m.f) + '  ' + Math.round(m.umplere * 100) + '%  ' + fmtV(m.min) + '…' + fmtV(m.max) : 'DC ' + fmtV(m.med);
      i1.textContent = cap.sonde[0] ? 'CH1 ' + text(cap.masuri(0)) : '';
      i2.textContent = cap.sonde[1] ? 'CH2 ' + text(cap.masuri(1)) : '';
      if (!cap.gndLegat && !disp.avertizat) { disp.avertizat = true; sim.problema('osc-gnd-' + inst.id, 'avertisment', 'GND-ul osciloscopului ' + inst.eticheta + ' nu e legat la circuit: fără masă comună, tensiunile afișate nu au sens.', { comp: inst.id }); }
    },
    masura(el, inst, sim) {
      const d = sim && sim.disp.get(inst.id);
      if (!d || !d.cap) return [];
      const r = [];
      [0, 1].forEach(c => { const m = d.cap.sonde[c] && d.cap.masuri(c); if (m) r.push(['CH' + (c + 1), m.max - m.min > 0.1 ? fmtF(m.f) + ', ' + fmtV(m.min) + '…' + fmtV(m.max) : fmtV(m.med)]); });
      return r;
    }
  });

  // ---------- analizor logic ----------
  const AL = { x: 16, y: -104, w: 150, h: 82 };
  const CUL_AL = ['#ffb74d', '#81c784', '#64b5f6', '#e57373'];
  M.componente.defineste({
    tip: 'analizor-logic', nume: 'Analizor logic (4 canale)', categorie: 'instrumente', eticheta: 'LA', vizualLaDesen: true,
    cauta: 'analizor logic logic analyzer digital semnale canale protocol',
    descriere: 'Arată patru semnale digitale în timp (0 sub 1,4 V, 1 peste) și frecvența fiecăruia. Bun pentru PWM, impulsuri, servo, UART sau I2C încetinite. Leagă GND la masa circuitului.',
    control: [{ cheie: 'baza', eticheta: 'Timp / diviziune', min: 0, max: BAZE.length - 1, pas: 1, implicit: 3, format: (v) => (BAZE[v] || BAZE[3])[1] }],
    pini: () => [0, 1, 2, 3].map(i => ({ id: 'D' + i, x: i * 10, y: 0, eticheta: 'D' + i, tip: 'intrare', descriere: 'Canalul ' + i })).concat([{ id: 'GND', x: 40, y: 0, eticheta: 'GND', tip: 'gnd', descriere: 'Masa' }]),
    cutie: () => ({ x: -10, y: -114, w: 196, h: 116 }),
    desen() {
      let s = '';
      s += `<rect x="-10" y="-114" width="196" height="104" rx="6" fill="#263238" stroke="#11181c" stroke-width="0.8"/>`;
      s += `<rect x="${AL.x - 2}" y="${AL.y - 2}" width="${AL.w + 4}" height="${AL.h + 4}" rx="2" fill="#0d1215"/>`;
      let grila = '';
      for (let i = 1; i < 10; i++) grila += `M${AL.x + i * AL.w / 10} ${AL.y}V${AL.y + AL.h}`;
      s += `<path d="${grila}" stroke="#1c2a31" stroke-width="0.35" fill="none"/>`;
      for (let c = 0; c < 4; c++) {
        const yc = AL.y + 6 + c * 19;
        s += D.text(9, yc + 6, 'D' + c, { m: 4, c: CUL_AL[c], g: 700 });
        s += `<path data-r="d${c}" d="" stroke="${CUL_AL[c]}" stroke-width="0.9" fill="none"/>`;
        s += `<text data-r="f${c}" x="${AL.x + AL.w - 2}" y="${yc - 1.5}" font-size="3.6" font-family="var(--font-cod)" fill="#9fb3bd" text-anchor="end" dominant-baseline="central"></text>`;
      }
      s += `<text data-r="scala" x="${AL.x + 2}" y="${AL.y + AL.h - 3}" font-size="3.6" font-family="var(--font-cod)" fill="#7f97a3" dominant-baseline="central"></text>`;
      const buton = (act, x, y, t) => `<g data-act="${act}" class="interactiv"><rect x="${x}" y="${y}" width="13" height="10" rx="2" fill="#455a64" stroke="#1c262b" stroke-width="0.5"/>${D.text(x + 6.5, y + 5.2, t, { m: 5, c: '#eceff1' })}</g>`;
      s += buton('t-', 168, -80, '−') + buton('t+', 168, -66, '+') + D.text(174.5, -86, 'TIMP', { m: 3, c: '#9fb3bd' });
      s += D.text(90, -16, 'ANALIZOR LOGIC · 4 CANALE', { m: 3.6, c: '#78909c', ls: 0.4 });
      for (let i = 0; i < 5; i++) s += `<rect x="${i * 10 - 3}" y="-13" width="6" height="7" fill="#11181c"/><path d="M${i * 10} -7 V0" stroke="${i < 4 ? CUL_AL[i] : '#212121'}" stroke-width="1.5"/>`;
      return s;
    },
    electric(ctx) {
      // intrări de 1 MΩ
      const r = [];
      for (let i = 0; i < 4; i++) r.push(ctx.R('D' + i, 'GND', 1e6));
      return { r };
    },
    laControl() { },
    actiune(inst, act, faza, el, sim) {
      if (faza !== 'jos' || (act !== 't-' && act !== 't+')) return;
      const c = inst.control || {};
      sim.control(inst, 'baza', Math.max(0, Math.min(BAZE.length - 1, (c.baza === undefined ? 3 : c.baza) + (act === 't+' ? 1 : -1))));
      M.bus && M.bus.emit('control');
    },
    dispozitiv(inst, sim) {
      return {
        cap: null,
        cadru() {
          if (!this.cap) this.cap = new Captura(sim, inst, ['D0', 'D1', 'D2', 'D3'], 'GND');
          this.cap.avanseaza(+(inst.control && inst.control.baza !== undefined ? inst.control.baza : 3));
        }
      };
    },
    vizual(g, inst, sim, el, disp) {
      const ctl = inst.control || {};
      const bz = BAZE[ctl.baza === undefined ? 3 : ctl.baza] || BAZE[3];
      const sc = g.querySelector('[data-r="scala"]');
      if (sc) sc.textContent = bz[1] + '/div';
      for (let c = 0; c < 4; c++) {
        const p = g.querySelector('[data-r="d' + c + '"]'), f = g.querySelector('[data-r="f' + c + '"]');
        if (!sim || !disp || !disp.cap || !disp.cap.sonde[c]) { p.setAttribute('d', ''); f.textContent = ''; continue; }
        const cap = disp.cap;
        const yc = AL.y + 6 + c * 19;
        const fe = cap.fereastra(0, 1.4);
        const b = cap.buf[c];
        const dig = { length: b.length };
        const y = (v) => v >= 1.4 ? yc : yc + 11;
        p.setAttribute('d', cale(b, fe.start, cap.n, AL.x, AL.w, y).replace(/L([\d.]+) ([\d.]+)/g, (m, x, yy) => 'H' + x + 'V' + yy));
        const m = cap.masuri(c);
        f.textContent = m ? (m.max - m.min > 0.1 ? fmtF(m.f) + ' ' + Math.round(m.umplere * 100) + '%' : (m.med >= 1.4 ? '1' : '0')) : '';
        void dig;
      }
    }
  });
})(window.M = window.M || {});
