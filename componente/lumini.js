/* Meșter — LED-uri și lumini: LED 5 mm, LED RGB, bandă și inel WS2812B, afișaj cu 7 segmente, bec 12 V. */
(function (M) {
  'use strict';
  const D = M.desen;
  const fv = D.formatValoare;

  const CULORI_LED = {
    rosu: { nume: 'Roșu', lumina: '#ff3b2f', corp: '#c62a22', model: 'rosu' },
    verde: { nume: 'Verde', lumina: '#3cff5a', corp: '#27a53b', model: 'verde' },
    albastru: { nume: 'Albastru', lumina: '#3d8bff', corp: '#2a5fd1', model: 'albastru' },
    galben: { nume: 'Galben', lumina: '#ffe23a', corp: '#d8b72a', model: 'galben' },
    portocaliu: { nume: 'Portocaliu', lumina: '#ff9a2e', corp: '#e07a1c', model: 'portocaliu' },
    alb: { nume: 'Alb', lumina: '#fffbe8', corp: '#e7e6df', model: 'alb' },
    roz: { nume: 'Roz', lumina: '#ff6fd0', corp: '#e25ab6', model: 'roz' },
    ir: { nume: 'Infraroșu (IR)', lumina: '#9a6bff', corp: '#5a5a66', model: 'ir' }
  };

  // luminozitatea percepută din curent (mA) — LED-urile moderne sunt vizibile de la ~0,1 mA
  function stralucire(i, imax) {
    if (!(i > 0)) return 0;
    const x = i / (imax || 0.02);
    return Math.max(0, Math.min(1, Math.pow(x, 0.45)));
  }
  M.stralucireLed = stralucire;

  M.componente.defineste({
    tip: 'led', nume: 'LED', categorie: 'lumini', eticheta: 'LED',
    cauta: 'led dioda luminiscenta lumina 5mm rosu verde albastru',
    descriere: 'Diodă care luminează. Piciorul lung (+, anod) spre pin, piciorul scurt (−, catod) spre GND. Pune mereu un rezistor în serie (220 Ω la 3,3 V).',
    prop: [{ cheie: 'culoare', eticheta: 'Culoare', tip: 'alegere', optiuni: Object.keys(CULORI_LED).map(k => [k, CULORI_LED[k].nume]), implicit: 'rosu' }],
    pini: () => [{ id: 'A', x: 0, y: 0, eticheta: '+', tip: 'pasiv', descriere: 'Anod (+) — piciorul lung' }, { id: 'K', x: 10, y: 0, eticheta: '−', tip: 'pasiv', descriere: 'Catod (−) — piciorul scurt, partea teșită' }],
    cutie: () => ({ x: -6, y: -34, w: 22, h: 36 }),
    desen(p) {
      const c = CULORI_LED[p.culoare] || CULORI_LED.rosu;
      let s = '';
      s += `<path d="M0 0 V-9 L1 -11" stroke="#b8bcc2" stroke-width="1.2" fill="none"/>`;
      s += `<path d="M10 0 V-11" stroke="#b8bcc2" stroke-width="1.2" fill="none"/>`;
      s += `<g data-r="corp"><path d="M-3 -11 h16 v2 h-16z" fill="${c.corp}" opacity="0.95"/>`;
      s += `<path d="M-2 -11 V-24 a7 7 0 0 1 14 0 V-11 z" fill="${c.corp}" opacity="0.8"/>`;
      s += `<path d="M0 -13 V-23 a5 5 0 0 1 3 -4.5" stroke="rgba(255,255,255,.55)" stroke-width="1.2" fill="none"/></g>`;
      s += `<circle cx="5" cy="-20" r="16" fill="url(#str-${c.lumina.slice(1)})" opacity="0" data-r="halou"/>`;
      s += `<path d="M-2 -11 V-24 a7 7 0 0 1 14 0 V-11 z" fill="${c.lumina}" opacity="0" data-r="lumina"/>`;
      s += `<g data-r="ars" opacity="0"><path d="M-2 -11 V-24 a7 7 0 0 1 14 0 V-11 z" fill="#2b2522"/><path d="M2 -20 l6 -4 M3 -15 l5 2" stroke="#6b5a50" stroke-width="0.8"/></g>`;
      return s;
    },
    electric(ctx, inst) {
      const c = CULORI_LED[inst.prop.culoare] || CULORI_LED.rosu;
      return { d: ctx.D('A', 'K', c.model) };
    },
    dispozitiv(inst, sim, el) {
      return {
        ars: false,
        cadru() {
          if (this.ars || !el.d) return;
          const i = el.d.iMed !== undefined ? el.d.iMed : el.d.i;
          if (i > 0.1) {
            this.ars = true;
            sim.problema('led-ars-' + inst.id, 'eroare', inst.eticheta + ' s-a ars: prin el au trecut ' + (i * 1000).toFixed(0) + ' mA (maxim ~30 mA). Lipsește rezistorul în serie!', { comp: inst.id });
          } else if (i > 0.032) {
            sim.problema('led-mult-' + inst.id, 'avertisment', 'Prin ' + inst.eticheta + ' trec ' + (i * 1000).toFixed(0) + ' mA — prea mult (recomandat 5–20 mA). Mărește rezistorul.', { comp: inst.id });
          }
          if (el.d.v < -5.2) sim.problema('led-invers-' + inst.id, 'avertisment', inst.eticheta + ' primește ' + M.fmtV(-el.d.v) + ' invers — LED-urile suportă doar ~5 V în sens invers.', { comp: inst.id });
        }
      };
    },
    vizual(g, inst, sim, el, disp) {
      const lum = g.querySelector('[data-r="lumina"]'), hal = g.querySelector('[data-r="halou"]'), ars = g.querySelector('[data-r="ars"]');
      if (disp && disp.ars) { ars.setAttribute('opacity', 1); lum.setAttribute('opacity', 0); hal.setAttribute('opacity', 0); return; }
      ars.setAttribute('opacity', 0);
      const b = el && el.d ? stralucire(el.d.iMed !== undefined ? el.d.iMed : el.d.i) : 0;
      lum.setAttribute('opacity', (b * 0.85).toFixed(3));
      hal.setAttribute('opacity', (b * 0.9).toFixed(3));
    },
    masura(el) {
      if (!el.d) return [];
      const i = el.d.iMed !== undefined ? el.d.iMed : el.d.i;
      return [['Curent', fv(Math.max(0, i), 'A')], ['Tensiune', fv(el.d.v || 0, 'V')]];
    },
    reseteaza(disp) { if (disp) disp.ars = false; }
  });

  // ---------- LED RGB ----------
  M.componente.defineste({
    tip: 'led-rgb', nume: 'LED RGB', categorie: 'lumini', eticheta: 'RGB',
    cauta: 'led rgb trei culori catod comun anod comun',
    descriere: 'Trei LED-uri (roșu, verde, albastru) într-o singură capsulă. Cu PWM pe fiecare culoare obții orice nuanță. Fiecare culoare are nevoie de rezistorul ei.',
    prop: [{ cheie: 'comun', eticheta: 'Pin comun', tip: 'alegere', optiuni: [['catod', 'Catod comun (−, la GND)'], ['anod', 'Anod comun (+, la 3,3 V)']], implicit: 'catod' }],
    pini: p => [
      { id: 'R', x: 0, y: 0, eticheta: 'R', tip: 'pasiv', descriere: 'Roșu' },
      { id: 'COM', x: 10, y: 0, eticheta: p.comun === 'anod' ? '+' : '−', tip: 'pasiv', descriere: p.comun === 'anod' ? 'Anod comun (+) — piciorul cel mai lung' : 'Catod comun (−) — piciorul cel mai lung' },
      { id: 'G', x: 20, y: 0, eticheta: 'G', tip: 'pasiv', descriere: 'Verde' },
      { id: 'B', x: 30, y: 0, eticheta: 'B', tip: 'pasiv', descriere: 'Albastru' }
    ],
    cutie: () => ({ x: -3, y: -40, w: 36, h: 42 }),
    desen() {
      let s = '';
      for (const x of [0, 20, 30]) s += `<path d="M${x} 0 V-12" stroke="#b8bcc2" stroke-width="1.2"/>`;
      s += `<path d="M10 0 V-12" stroke="#b8bcc2" stroke-width="1.4"/>`;
      s += `<path d="M3 -12 V-27 a12 12 0 0 1 24 0 V-12 z" fill="#f2f2ee" stroke="#cfcfc8" stroke-width="0.6" opacity="0.95"/>`;
      s += `<path d="M1 -12 h28 v2.5 h-28z" fill="#e6e6df"/>`;
      s += `<circle cx="15" cy="-24" r="20" fill="url(#str-ffffff)" opacity="0" data-r="halou"/>`;
      s += `<path d="M3 -12 V-27 a12 12 0 0 1 24 0 V-12 z" opacity="0" data-r="lumina"/>`;
      s += D.text(0, 5.5, 'R', { m: 3, c: 'var(--text-2)' }) + D.text(20, 5.5, 'G', { m: 3, c: 'var(--text-2)' }) + D.text(30, 5.5, 'B', { m: 3, c: 'var(--text-2)' });
      return s;
    },
    electric(ctx, inst) {
      const an = inst.prop.comun === 'anod';
      const d = (pin, m) => an ? ctx.D('COM', pin, m) : ctx.D(pin, 'COM', m);
      return { r: d('R', 'rosu'), g: d('G', 'verde-pur'), b: d('B', 'albastru') };
    },
    vizual(g, inst, sim, el) {
      if (!el || !el.r) return;
      const cur = e => stralucire(e.iMed !== undefined ? e.iMed : e.i);
      const r = cur(el.r), gg = cur(el.g), b = cur(el.b);
      const m = Math.max(r, gg, b);
      const lum = g.querySelector('[data-r="lumina"]'), hal = g.querySelector('[data-r="halou"]');
      if (m < 0.01) { lum.setAttribute('opacity', 0); hal.setAttribute('opacity', 0); return; }
      const q = v => Math.round(v * 15) * 17;
      const hex = [q(r / m), q(gg / m), q(b / m)].map(v => v.toString(16).padStart(2, '0')).join('');
      lum.setAttribute('fill', '#' + hex); lum.setAttribute('opacity', (m * 0.85).toFixed(3));
      if (M.stralucire) hal.setAttribute('fill', M.stralucire(hex));
      hal.setAttribute('opacity', (m * 0.9).toFixed(3));
    },
    masura(el) { const i = e => fv(Math.max(0, e.iMed !== undefined ? e.iMed : e.i), 'A'); return el.r ? [['Roșu', i(el.r)], ['Verde', i(el.g)], ['Albastru', i(el.b)]] : []; }
  });

  // ---------- WS2812B: bandă, inel, matrice ----------
  function geometrieWs(p) {
    const n = Math.max(1, Math.min(300, +p.numar || 8));
    if (p.forma === 'inel') {
      const r = Math.max(22, n * 3.6);
      return { n, forma: 'inel', r, w: 2 * r + 24, h: 2 * r + 34 };
    }
    if (p.forma === 'matrice') {
      const lat = Math.round(Math.sqrt(n));
      return { n: lat * lat, forma: 'matrice', lat, w: lat * 12 + 16, h: lat * 12 + 30 };
    }
    return { n, forma: 'banda', w: n * 16.7 + 26, h: 30 };
  }
  function pozitiiLed(g) {
    const r = [];
    if (g.forma === 'inel') {
      const cx = g.w / 2 - 12, cy = -g.h + 12 + g.r + 4;
      for (let i = 0; i < g.n; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / g.n; r.push([cx + Math.cos(a) * (g.r - 7), cy + Math.sin(a) * (g.r - 7)]); }
    } else if (g.forma === 'matrice') {
      for (let y = 0; y < g.lat; y++) for (let x = 0; x < g.lat; x++) {
        const xx = y % 2 === 0 ? x : g.lat - 1 - x; // serpentină, ca plăcile 8x8
        r.push([-2 + 12 * xx + 6, -g.h + 14 + y * 12 + 6]);
      }
    } else {
      for (let i = 0; i < g.n; i++) r.push([6 + i * 16.7 + 8, -15]);
    }
    return r;
  }
  M.componente.defineste({
    tip: 'ws2812', nume: 'LED-uri WS2812B (NeoPixel)', categorie: 'lumini', eticheta: 'NEO',
    cauta: 'ws2812 ws2812b neopixel banda led adresabila inel ring matrice rgb sk6812',
    descriere: 'LED-uri RGB adresabile controlate pe un singur fir de date. Fiecare LED trage până la 60 mA la alb maxim — o bandă lungă are nevoie de sursă separată de 5 V.',
    prop: [
      { cheie: 'forma', eticheta: 'Formă', tip: 'alegere', optiuni: [['banda', 'Bandă'], ['inel', 'Inel'], ['matrice', 'Matrice pătrată']], implicit: 'banda' },
      { cheie: 'numar', eticheta: 'Număr de LED-uri', tip: 'numar', implicit: 8, min: 1, max: 300 }
    ],
    pini: p => {
      const g = geometrieWs(p);
      return [
        { id: 'VCC', x: 0, y: 0, eticheta: '5V', tip: 'vcc', descriere: 'Alimentare 5 V' },
        { id: 'DIN', x: 10, y: 0, eticheta: 'DIN', tip: 'intrare', descriere: 'Intrare de date (de la pinul plăcii)' },
        { id: 'GND', x: 20, y: 0, eticheta: 'GND', tip: 'gnd', descriere: 'Masă' },
        { id: 'DOUT', x: Math.max(40, Math.floor((g.w - 20) / 10) * 10), y: 0, eticheta: 'DO', tip: 'iesire', descriere: 'Ieșire de date (spre următoarea bandă)' }
      ];
    },
    cutie: p => { const g = geometrieWs(p); return { x: -6, y: -g.h + 2, w: g.w, h: g.h + 2 }; },
    desen(p) {
      const g = geometrieWs(p);
      let s = '';
      if (g.forma === 'inel') {
        const cx = g.w / 2 - 12, cy = -g.h + 12 + g.r + 4;
        s += `<circle cx="${cx}" cy="${cy}" r="${g.r}" fill="#1d1f24"/><circle cx="${cx}" cy="${cy}" r="${g.r - 14}" fill="var(--mat-fond, #0f2a26)"/>`;
        s += `<path d="M${cx - 10} ${cy + g.r - 2} L0 -4 M${cx} ${cy + g.r - 1} L10 -4 M${cx + 10} ${cy + g.r - 2} L20 -4" stroke="#aeb3ba" stroke-width="1"/>`;
      } else if (g.forma === 'matrice') {
        s += `<rect x="-6" y="${-g.h + 8}" width="${g.w}" height="${g.h - 12}" rx="2" fill="#1d1f24"/>`;
      } else {
        s += `<rect x="-6" y="-26" width="${g.w}" height="22" rx="2" fill="#f1f1ec" stroke="#cfcfc5" stroke-width="0.6"/>`;
        s += `<rect x="-6" y="-26" width="${g.w}" height="3" fill="#e0e0d8"/>`;
      }
      const poz = pozitiiLed(g);
      poz.forEach(([x, y], i) => {
        s += `<rect x="${x - 4.5}" y="${y - 4.5}" width="9" height="9" rx="1" fill="#f7f7f2" stroke="#bdbdb4" stroke-width="0.5"/>`;
        s += `<circle cx="${x}" cy="${y}" r="2.6" fill="#222" data-px="${i}"/>`;
      });
      s += `<g data-r="haloWs" opacity="0.9"></g>`;
      s += D.text(0, 4.5, '5V', { m: 2.8, c: 'var(--text-2)' }) + D.text(10, 4.5, 'DI', { m: 2.8, c: 'var(--text-2)' }) + D.text(20, 4.5, 'G', { m: 2.8, c: 'var(--text-2)' });
      return s;
    },
    electric(ctx, inst) {
      // consumul LED-urilor: rezistență variabilă între VCC și GND
      const r = ctx.R('VCC', 'GND', 1e6);
      return { consum: r };
    },
    dispozitiv(inst, sim, el) {
      const g = geometrieWs(inst.prop);
      const d = {
        n: g.n, culori: new Array(g.n).fill(null).map(() => [0, 0, 0]),
        schimbat: true,
        seteaza(cul, dela) {
          const off = dela || 0;
          for (let i = 0; i < this.n; i++) this.culori[i] = cul[i + off] ? cul[i + off].slice() : [0, 0, 0];
          this.schimbat = true;
          // consum: ~20 mA per canal la maxim (60 mA alb) + 1 mA în repaus per LED
          let sum = 0; for (const c of this.culori) sum += (c[0] + c[1] + c[2]) / 255 * 0.02;
          const I = sum + this.n * 0.001;
          const v = sim.alimentare(inst).v || 5;
          if (el.consum) { el.consum.r = Math.max(0.5, v / I); sim.murdarComponenta(inst); }
          // lanț: restul culorilor merg mai departe pe DOUT
          if (cul.length - off > this.n) {
            const net = sim.netPin(inst, 'DOUT');
            for (const alt of sim.dispozitive(['ws2812'])) if (alt !== d && sim.netPin(alt.inst, 'DIN') === net) alt.seteaza(cul, off + this.n);
          }
          if (I > 0.45) sim.problema('ws-curent-' + inst.id, 'avertisment', inst.eticheta + ' trage ~' + Math.round(I * 1000) + ' mA. Din pinul 5V al plăcii (USB) poți lua în siguranță ~400 mA; pentru mai mult folosește o sursă separată de 5 V.', { comp: inst.id });
        },
        stingeTot() { this.culori.forEach(c => { c[0] = c[1] = c[2] = 0; }); this.schimbat = true; }
      };
      return d;
    },
    vizual(g, inst, sim, el, disp) {
      if (!disp || !disp.schimbat) return;
      disp.schimbat = false;
      const alim = sim ? sim.alimentare(inst).v : 0;
      const factor = alim >= 3.3 ? Math.min(1, alim / 5) : 0;
      const px = g.querySelectorAll('[data-px]');
      px.forEach((c, i) => {
        const col = disp.culori[i] || [0, 0, 0];
        const m = Math.max(col[0], col[1], col[2]) * factor;
        if (m < 1) { c.setAttribute('fill', '#222'); c.setAttribute('r', 2.6); c.removeAttribute('filter'); return; }
        const k = 255 / Math.max(col[0], col[1], col[2]);
        const intensitate = Math.pow(m / 255, 0.5);
        c.setAttribute('fill', `rgb(${Math.round(col[0] * k)},${Math.round(col[1] * k)},${Math.round(col[2] * k)})`);
        c.setAttribute('r', (2.8 + intensitate * 2.4).toFixed(2));
        c.setAttribute('opacity', (0.45 + intensitate * 0.55).toFixed(2));
      });
    }
  });

  // ---------- afișaj cu 7 segmente ----------
  const SEG = { a: [2, -34, 12, 3], b: [14, -32, 3, 12], c: [14, -18, 3, 12], d: [2, -6, 12, 3], e: [-1, -18, 3, 12], f: [-1, -32, 3, 12], g: [2, -20, 12, 3] };
  M.componente.defineste({
    tip: 'sapte-segmente', nume: 'Afișaj 7 segmente', categorie: 'afisaje', eticheta: 'DISP',
    cauta: 'afisaj 7 segmente cifra led sapte segment catod comun',
    descriere: 'O cifră din 7 LED-uri (a–g) plus punct. Fiecare segment are nevoie de rezistorul lui (220–330 Ω). Pinul comun merge la GND (catod comun) sau la 3,3 V (anod comun).',
    prop: [{ cheie: 'comun', eticheta: 'Tip', tip: 'alegere', optiuni: [['catod', 'Catod comun'], ['anod', 'Anod comun']], implicit: 'catod' }, { cheie: 'culoare', eticheta: 'Culoare', tip: 'alegere', optiuni: [['rosu', 'Roșu'], ['verde', 'Verde'], ['albastru', 'Albastru']], implicit: 'rosu' }],
    // pinii ca pe o capsulă reală: 5 sus, 5 jos
    pini: () => [
      { id: 'G', x: 0, y: -60, eticheta: 'g' }, { id: 'F', x: 10, y: -60, eticheta: 'f' }, { id: 'COM1', x: 20, y: -60, eticheta: 'COM' }, { id: 'A', x: 30, y: -60, eticheta: 'a' }, { id: 'B', x: 40, y: -60, eticheta: 'b' },
      { id: 'E', x: 0, y: 0, eticheta: 'e' }, { id: 'D', x: 10, y: 0, eticheta: 'd' }, { id: 'COM2', x: 20, y: 0, eticheta: 'COM' }, { id: 'C', x: 30, y: 0, eticheta: 'c' }, { id: 'DP', x: 40, y: 0, eticheta: 'dp' }
    ].map(p => Object.assign(p, { tip: 'pasiv' })),
    interne: () => [['COM1', 'COM2']],
    cutie: () => ({ x: -5, y: -64, w: 50, h: 68 }),
    desen(p) {
      let s = `<rect x="-4" y="-56" width="48" height="52" rx="2" fill="#18191c" stroke="#000" stroke-width="0.6"/>`;
      const tr = 'translate(13 -3) skewX(-8)';
      s += `<g transform="${tr}">`;
      for (const k in SEG) { const [x, y, w, h] = SEG[k]; s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.3" fill="#2a2426" data-seg="${k}"/>`; }
      s += `</g><circle cx="35" cy="-12" r="1.8" fill="#2a2426" data-seg="dp"/>`;
      for (const pin of this.pini(p)) s += D.text(pin.x, pin.y + (pin.y < 0 ? 5.5 : -5.5), pin.eticheta, { m: 3, c: '#8a8f96' });
      return s;
    },
    electric(ctx, inst) {
      const an = inst.prop.comun === 'anod';
      const m = inst.prop.culoare === 'verde' ? 'verde' : inst.prop.culoare === 'albastru' ? 'albastru' : 'rosu';
      const r = {};
      for (const k of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP']) r[k] = an ? ctx.D('COM1', k, m) : ctx.D(k, 'COM1', m);
      return r;
    },
    vizual(g, inst, sim, el) {
      if (!el || !el.A) return;
      const cul = inst.prop.culoare === 'verde' ? '#3cff5a' : inst.prop.culoare === 'albastru' ? '#4d8dff' : '#ff3b2f';
      for (const k of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP']) {
        const s = g.querySelector('[data-seg="' + k.toLowerCase() + '"]');
        const b = stralucire(el[k].iMed !== undefined ? el[k].iMed : el[k].i);
        s.setAttribute('fill', b > 0.05 ? cul : '#2a2426');
        s.setAttribute('opacity', b > 0.05 ? (0.4 + b * 0.6).toFixed(2) : 1);
      }
    }
  });

  // ---------- bec 12 V ----------
  M.componente.defineste({
    tip: 'bec', nume: 'Bec 12 V', categorie: 'lumini', eticheta: 'BEC',
    cauta: 'bec lampa incandescent 12v sarcina',
    descriere: 'Bec cu filament de 12 V / 5 W (≈29 Ω la cald). Ideal ca sarcină pentru un releu sau un tranzistor MOSFET. Nu se leagă direct la un pin al plăcii.',
    prop: [{ cheie: 'putere', eticheta: 'Putere', tip: 'alegere', optiuni: [['5', '5 W'], ['10', '10 W'], ['21', '21 W']], implicit: '5' }],
    pini: () => [{ id: '1', x: 0, y: 0, eticheta: '1', tip: 'pasiv' }, { id: '2', x: 30, y: 0, eticheta: '2', tip: 'pasiv' }],
    cutie: () => ({ x: -4, y: -44, w: 38, h: 46 }),
    desen() {
      let s = D.picior(0, 0, 0, -10) + D.picior(30, 0, 30, -10);
      s += `<rect x="-3" y="-14" width="36" height="6" rx="1" fill="#6d737b"/>`;
      s += `<rect x="7" y="-20" width="16" height="8" fill="#b9bec6"/><path d="M7 -18 h16 M7 -16 h16" stroke="#8a9099" stroke-width="0.7"/>`;
      s += `<circle cx="15" cy="-32" r="12" fill="#f4f1e6" opacity="0.55" stroke="#c9c5b8" stroke-width="0.6"/>`;
      s += `<path d="M11 -22 L11 -32 q2 -4 4 0 q2 4 4 0 L19 -22" stroke="#6b5b3a" stroke-width="0.8" fill="none" data-r="filament"/>`;
      s += `<circle cx="15" cy="-32" r="22" fill="url(#str-ffd27a)" opacity="0" data-r="halou"/>`;
      return s;
    },
    electric(ctx, inst) {
      const P = +inst.prop.putere || 5;
      return { r: ctx.R('1', '2', 144 / P) };
    },
    vizual(g, inst, sim, el) {
      if (!el || !el.r) return;
      const P = +inst.prop.putere || 5;
      const i = Math.abs(el.r.iMed !== undefined ? el.r.iMed : el.r.i);
      const p = i * i * el.r.r;
      const b = Math.max(0, Math.min(1, Math.pow(p / P, 0.6)));
      g.querySelector('[data-r="halou"]').setAttribute('opacity', (b * 0.95).toFixed(2));
      g.querySelector('[data-r="filament"]').setAttribute('stroke', b > 0.1 ? '#ffe9a8' : '#6b5b3a');
    },
    masura(el) { const i = Math.abs(el.r.iMed !== undefined ? el.r.iMed : el.r.i); return [['Curent', fv(i, 'A')], ['Putere', fv(i * i * el.r.r, 'W')]]; }
  });
})(window.M = window.M || {});
