/* Meșter — butoane și comenzi: buton cu 4 picioare, comutator glisant, limitator, encoder rotativ KY-040,
   tastatură matricială 4×4 / 4×3, joystick KY-023, pad tactil capacitiv ESP32, modul tactil TTP223. */
(function (M) {
  'use strict';
  const D = M.desen;

  // tensiunea de alimentare a unui modul (fixă sau ultima calculată)
  function tensiuneModul(sim, inst, vcc, gnd) {
    if (!sim) return 0;
    const nv = sim.netPin(inst, vcc || 'VCC'), ng = sim.netPin(inst, gnd || 'GND');
    const c = sim.circuit;
    const v = (n) => c.fix.has(n) ? c.fix.get(n) : (c.insulaNodului && c.insulaNodului[n] >= 0 ? c.v[n] : NaN);
    const a = v(nv), b = v(ng);
    if (isNaN(a) || isNaN(b)) return 0;
    return a - b;
  }
  M.tensiuneModul = tensiuneModul;

  // vibrațiile contactului: câteva comutări rapide înainte de starea finală
  function cuVibratii(sim, inst, el, cheie, stareFinala, activ) {
    const sw = el[cheie];
    if (!sw) return;
    if (!activ || !sim) { sw.inchis = stareFinala; sim && sim.murdarComponenta(inst); return; }
    const pasi = [120, 380, 610, 1150, 1700];
    let st = stareFinala;
    sw.inchis = stareFinala; sim.murdarComponenta(inst);
    pasi.forEach((t, i) => {
      st = i % 2 === 0 ? !stareFinala : stareFinala;
      const s = st;
      sim.programeaza(t, () => { sw.inchis = s; sim.murdarComponenta(inst); });
    });
    sim.programeaza(2200, () => { sw.inchis = stareFinala; sim.murdarComponenta(inst); });
  }

  const CULORI_BUTON = { negru: '#2b2d31', rosu: '#d33a2c', albastru: '#2f6fd6', verde: '#2e9b4f', galben: '#e8c21f', alb: '#f1f1ec' };

  M.componente.defineste({
    tip: 'buton', nume: 'Buton', categorie: 'intrari', eticheta: 'BTN',
    cauta: 'buton push button tactil apasare switch 6x6 12x12',
    descriere: 'Buton cu 4 picioare. Picioarele de pe aceeași parte a șanțului breadboard-ului sunt mereu legate; apăsarea leagă partea stângă de cea dreaptă. Folosește INPUT_PULLUP și leagă butonul la GND.',
    prop: [
      { cheie: 'culoare', eticheta: 'Culoarea capacului', tip: 'alegere', optiuni: [['negru', 'Negru'], ['rosu', 'Roșu'], ['albastru', 'Albastru'], ['verde', 'Verde'], ['galben', 'Galben'], ['alb', 'Alb']], implicit: 'negru' },
      { cheie: 'vibratii', eticheta: 'Vibrații de contact', tip: 'alegere', optiuni: [['da', 'Da (ca în realitate)'], ['nu', 'Nu (contact curat)']], implicit: 'da' }
    ],
    pini: () => [
      { id: 'A1', x: 0, y: 0, eticheta: '1', tip: 'pasiv', descriere: 'Legat intern cu piciorul de sub el (1)' },
      { id: 'B1', x: 20, y: 0, eticheta: '2', tip: 'pasiv', descriere: 'Legat intern cu piciorul de sub el (2)' },
      { id: 'A2', x: 0, y: 30, eticheta: '1', tip: 'pasiv', descriere: 'Legat intern cu piciorul de deasupra (1)' },
      { id: 'B2', x: 20, y: 30, eticheta: '2', tip: 'pasiv', descriere: 'Legat intern cu piciorul de deasupra (2)' }
    ],
    interne: () => [['A1', 'A2'], ['B1', 'B2']],
    cutie: () => ({ x: -4, y: -2, w: 28, h: 34 }),
    desen(p) {
      const c = CULORI_BUTON[p.culoare] || CULORI_BUTON.negru;
      let s = `<rect x="-3" y="2" width="26" height="26" rx="2" fill="#2a2c30" stroke="#15171a" stroke-width="0.6"/>`;
      s += `<rect x="-1.5" y="3.5" width="23" height="23" rx="1.5" fill="#b9bec6"/>`;
      for (const [x, y] of [[1.5, 6.5], [18.5, 6.5], [1.5, 23.5], [18.5, 23.5]]) s += `<circle cx="${x}" cy="${y}" r="1" fill="#6c727a"/>`;
      s += `<g data-act="apasa" class="interactiv"><circle cx="10" cy="15" r="8.2" fill="rgba(0,0,0,.35)"/><circle cx="10" cy="15" r="7.6" fill="${c}" stroke="rgba(0,0,0,.35)" stroke-width="0.6" data-r="capac"/><circle cx="8" cy="13" r="3" fill="rgba(255,255,255,.18)" data-r="luciu"/></g>`;
      return s;
    },
    electric(ctx) { return { sw: ctx.S('A1', 'B1', false) }; },
    actiune(inst, act, faza, el, sim) {
      if (act !== 'apasa') return;
      inst._apasat = faza === 'jos';
      cuVibratii(sim, inst, el, 'sw', faza === 'jos', inst.prop.vibratii !== 'nu');
    },
    vizual(g, inst) {
      const cap = g.querySelector('[data-r="capac"]');
      if (cap) cap.setAttribute('r', inst._apasat ? 6.9 : 7.6);
      const l = g.querySelector('[data-r="luciu"]');
      if (l) l.setAttribute('opacity', inst._apasat ? 0.4 : 1);
    },
    cod: { tip: 'buton' }
  });

  M.componente.defineste({
    tip: 'comutator', nume: 'Comutator glisant', categorie: 'intrari', eticheta: 'SW',
    cauta: 'comutator glisant slide switch spdt pornit oprit',
    descriere: 'Comutator cu 3 picioare (SPDT): piciorul din mijloc se leagă fie cu cel din stânga, fie cu cel din dreapta. Atinge-l în simulare ca să-l muți.',
    prop: [],
    control: [{ cheie: 'pozitie', eticheta: 'Poziție (0 = stânga, 1 = dreapta)', min: 0, max: 1, pas: 1, implicit: 0 }],
    pini: () => [{ id: '1', x: 0, y: 0, eticheta: '1', tip: 'pasiv' }, { id: 'C', x: 10, y: 0, eticheta: 'C', tip: 'pasiv', descriere: 'Comun' }, { id: '2', x: 20, y: 0, eticheta: '2', tip: 'pasiv' }],
    cutie: () => ({ x: -6, y: -16, w: 32, h: 18 }),
    desen() {
      let s = D.picior(0, 0, 0, -4) + D.picior(10, 0, 10, -4) + D.picior(20, 0, 20, -4);
      s += `<rect x="-5" y="-15" width="30" height="11" rx="1.5" fill="#1c5fa8" stroke="#123e70" stroke-width="0.6"/>`;
      s += `<rect x="1" y="-13" width="18" height="7" rx="1" fill="#0f2a4a"/>`;
      s += `<g data-act="comuta" class="interactiv"><rect x="1" y="-15" width="18" height="11" fill="transparent"/><rect data-r="maneta" x="2" y="-13.5" width="8" height="8" rx="1" fill="#e8e8e2"/></g>`;
      return s;
    },
    electric(ctx, inst) {
      const a = ctx.S('C', '1', true), b = ctx.S('C', '2', false);
      const act = () => { const p = +((inst.control || {}).pozitie || 0); a.inchis = p < 0.5; b.inchis = p >= 0.5; };
      act();
      return { a, b, act };
    },
    laControl(inst, el, sim) { el.act(); sim.murdarComponenta(inst); },
    actiune(inst, act, faza, el, sim) { if (faza === 'jos') { sim.control(inst, 'pozitie', +((inst.control || {}).pozitie || 0) >= 0.5 ? 0 : 1); M.bus.emit('control', inst); } },
    vizual(g, inst) { const m = g.querySelector('[data-r="maneta"]'); if (m) m.setAttribute('x', +((inst.control || {}).pozitie || 0) >= 0.5 ? 10 : 2); }
  });

  M.componente.defineste({
    tip: 'limitator', nume: 'Limitator (microîntrerupător)', categorie: 'intrari', eticheta: 'LIM',
    cauta: 'limitator microswitch limit switch capat de cursa',
    descriere: 'Microîntrerupător cu pârghie, folosit ca senzor de capăt de cursă. COM se leagă cu NO când pârghia e apăsată și cu NC când e liberă.',
    prop: [],
    pini: () => [{ id: 'COM', x: 0, y: 0, eticheta: 'C', tip: 'pasiv', descriere: 'Comun' }, { id: 'NO', x: 20, y: 0, eticheta: 'NO', tip: 'pasiv', descriere: 'Normal deschis' }, { id: 'NC', x: 40, y: 0, eticheta: 'NC', tip: 'pasiv', descriere: 'Normal închis' }],
    cutie: () => ({ x: -6, y: -34, w: 52, h: 36 }),
    desen() {
      let s = D.picior(0, 0, 0, -6) + D.picior(20, 0, 20, -6) + D.picior(40, 0, 40, -6);
      s += `<rect x="-5" y="-22" width="50" height="16" rx="1.5" fill="#1b1b1e"/>`;
      s += `<g data-act="apasa" class="interactiv"><rect x="-5" y="-34" width="50" height="14" fill="transparent"/><path data-r="parghie" d="M-2 -24 L42 -30" stroke="#c9ccd1" stroke-width="2.4" stroke-linecap="round"/><circle cx="42" cy="-30" r="2.6" fill="#e0e0da"/></g>`;
      s += `<rect x="16" y="-26" width="5" height="4" fill="#d33a2c"/>`;
      return s;
    },
    electric(ctx) { return { no: ctx.S('COM', 'NO', false), nc: ctx.S('COM', 'NC', true) }; },
    actiune(inst, act, faza, el, sim) { inst._apasat = faza === 'jos'; el.no.inchis = inst._apasat; el.nc.inchis = !inst._apasat; sim.murdarComponenta(inst); },
    vizual(g, inst) { const p = g.querySelector('[data-r="parghie"]'); if (p) p.setAttribute('d', inst._apasat ? 'M-2 -24 L42 -25' : 'M-2 -24 L42 -30'); }
  });

  // ---------- Encoder rotativ KY-040 ----------
  M.componente.defineste({
    tip: 'encoder', nume: 'Encoder rotativ KY-040', categorie: 'intrari', eticheta: 'ENC',
    cauta: 'encoder rotativ ky-040 rotary incremental buton',
    descriere: 'Encoder cu 20 de clicuri pe tură și buton la apăsare. CLK și DT au rezistențe de 10 kΩ spre +; SW nu are, deci folosește INPUT_PULLUP. Rotește butonul din simulare sau folosește săgețile din panou.',
    prop: [],
    alimentare: { vcc: '+', min: 3, max: 5.5 },
    pini: () => [
      { id: 'CLK', x: 0, y: 0, eticheta: 'CLK', tip: 'iesire', descriere: 'Semnalul A' },
      { id: 'DT', x: 10, y: 0, eticheta: 'DT', tip: 'iesire', descriere: 'Semnalul B' },
      { id: 'SW', x: 20, y: 0, eticheta: 'SW', tip: 'iesire', descriere: 'Butonul (la GND când e apăsat)' },
      { id: '+', x: 30, y: 0, eticheta: '+', tip: 'vcc', descriere: 'Alimentare 3,3–5 V' },
      { id: 'GND', x: 40, y: 0, eticheta: 'GND', tip: 'gnd' }
    ],
    cutie: () => ({ x: -6, y: -62, w: 52, h: 64 }),
    desen() {
      let s = D.pcb(-6, -60, 52, 54, { culoare: '#1f5ca8', gauri: 3.5 });
      s += `<rect x="4" y="-50" width="32" height="30" rx="1" fill="#b3b8bf"/>`;
      s += `<g data-act="enc" class="interactiv"><circle cx="20" cy="-35" r="14" fill="#2a2d33"/><g data-r="ax"><circle cx="20" cy="-35" r="10" fill="url(#butonRotativ)"/><path d="M20 -44 v7" stroke="#f0f0ea" stroke-width="1.6" stroke-linecap="round"/><path d="M12 -31 a8.5 8.5 0 0 0 16 0" fill="none" stroke="#1a1c20" stroke-width="0.6"/></g></g>`;
      for (const p of this.pini()) { s += D.pinAntet(p.x, p.y); s += D.text(p.x, p.y - 7, p.eticheta, { m: 2.8 }); }
      return s;
    },
    electric(ctx) {
      return {
        pa: ctx.R('CLK', '+', 10000), pb: ctx.R('DT', '+', 10000),
        a: ctx.S('CLK', 'GND', false), b: ctx.S('DT', 'GND', false), sw: ctx.S('SW', 'GND', false)
      };
    },
    dispozitiv(inst, sim, el) {
      const d = {
        unghi: 0, poz: 0,
        pas(dir) {
          // secvența în cuadratură: 4 stări pe clic, cu ~1,5 ms între ele
          const seq = dir > 0 ? [[1, 0], [1, 1], [0, 1], [0, 0]] : [[0, 1], [1, 1], [1, 0], [0, 0]];
          const baza = sim.timp;
          seq.forEach(([a, b], i) => sim.programeazaLa(baza + (i + 1) * 1500 + (this.coada || 0), () => { el.a.inchis = !!a; el.b.inchis = !!b; sim.murdarComponenta(inst); }));
          this.coada = (this.coada || 0) + 6000;
          sim.programeazaLa(baza + this.coada + 100, () => { this.coada = Math.max(0, (this.coada || 0) - 6000); });
          this.poz += dir;
          this.unghi += dir * 18;
        }
      };
      return d;
    },
    actiune(inst, act, faza, el, sim, disp, extra) {
      if (act === 'enc') {
        // apăsare scurtă = butonul SW
        el.sw.inchis = faza === 'jos';
        sim.murdarComponenta(inst);
        inst._apasat = faza === 'jos';
      }
      if (act === 'sus' || act === 'jos') { }
    },
    controaleSpeciale(sec, inst, app, el) {
      sec.append(el('h4', { text: 'Rotire' }));
      const r = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } });
      const rot = (dir, n) => { if (!app.simuleaza) { M.dialog.notifica('Pornește simularea ca să rotești encoderul.'); return; } const d = app.sim.disp.get(inst.id); for (let i = 0; i < n; i++) d.pas(dir); };
      r.append(el('button', { class: 'btn', text: '⟲ 1 clic', on: { click: () => rot(-1, 1) } }), el('button', { class: 'btn', text: '⟳ 1 clic', on: { click: () => rot(1, 1) } }), el('button', { class: 'btn', text: '⟳ 5 clicuri', on: { click: () => rot(1, 5) } }));
      const apasa = el('button', { class: 'btn', text: 'Apasă (SW)' });
      apasa.addEventListener('pointerdown', () => { if (app.simuleaza) app.sim.actiune(inst, 'enc', 'jos'); });
      apasa.addEventListener('pointerup', () => { if (app.simuleaza) app.sim.actiune(inst, 'enc', 'sus'); });
      r.append(apasa);
      sec.append(r);
    },
    vizual(g, inst, sim, el, disp) { const a = g.querySelector('[data-r="ax"]'); if (a) a.setAttribute('transform', 'rotate(' + (disp ? disp.unghi : 0) + ' 20 -35)'); }
  });

  // ---------- Tastatură matricială ----------
  const TASTE4 = ['1', '2', '3', 'A', '4', '5', '6', 'B', '7', '8', '9', 'C', '*', '0', '#', 'D'];
  const TASTE3 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
  M.componente.defineste({
    tip: 'tastatura', nume: 'Tastatură matricială', categorie: 'intrari', eticheta: 'KP',
    cauta: 'tastatura keypad matriciala membrana 4x4 4x3 cod pin',
    descriere: 'Tastatură cu membrană: rândurile R1–R4 și coloanele C1–C4. Apăsarea unei taste leagă rândul ei de coloana ei. Se citește cu biblioteca Keypad.',
    prop: [{ cheie: 'marime', eticheta: 'Mărime', tip: 'alegere', optiuni: [['4x4', '4 × 4 (cu A–D)'], ['4x3', '4 × 3']], implicit: '4x4' }],
    pini: p => {
      const nc = p.marime === '4x3' ? 3 : 4;
      const r = [];
      for (let i = 0; i < 4; i++) r.push({ id: 'R' + (i + 1), x: i * 10, y: 0, eticheta: 'R' + (i + 1), tip: 'pasiv', descriere: 'Rândul ' + (i + 1) });
      for (let j = 0; j < nc; j++) r.push({ id: 'C' + (j + 1), x: (4 + j) * 10, y: 0, eticheta: 'C' + (j + 1), tip: 'pasiv', descriere: 'Coloana ' + (j + 1) });
      return r;
    },
    cutie: p => { const nc = p.marime === '4x3' ? 3 : 4; const w = nc * 16 + 10; return { x: (4 + nc) * 5 - 5 - w / 2, y: -96, w, h: 98 }; },
    desen(p) {
      const nc = p.marime === '4x3' ? 3 : 4;
      const taste = nc === 4 ? TASTE4 : TASTE3;
      const w = nc * 16 + 10;
      const cx = (4 + nc) * 5 - 5;
      const x0 = cx - w / 2;
      let s = '';
      // cablul panglică
      s += `<path d="M${-2} -2 H${(4 + nc) * 10 - 8} V-14 H${-2}z" fill="#e7e2d6"/>`;
      for (let i = 0; i < 4 + nc; i++) s += `<line x1="${i * 10}" y1="0" x2="${i * 10}" y2="-13" stroke="#b9ab8e" stroke-width="1"/>`;
      s += `<rect x="${x0}" y="-94" width="${w}" height="78" rx="3" fill="#1d1f24"/>`;
      for (let r = 0; r < 4; r++) for (let c = 0; c < nc; c++) {
        const t = taste[r * nc + c];
        const x = x0 + 6 + c * 16, y = -90 + r * 18;
        const col = /[A-D]/.test(t) ? '#c0392b' : /[*#]/.test(t) ? '#2f6fd6' : '#e9e9e4';
        s += `<g data-act="tasta" data-k="${r},${c}" class="interactiv"><rect x="${x}" y="${y}" width="13" height="14" rx="2" fill="${col}" data-tasta="${r},${c}"/>${D.text(x + 6.5, y + 7, t, { m: 6, c: /[A-D*#]/.test(t) ? '#fff' : '#222', g: 700, f: 'var(--font-ui)' })}</g>`;
      }
      return s;
    },
    electric(ctx, inst) {
      const nc = inst.prop.marime === '4x3' ? 3 : 4;
      const sw = {};
      for (let r = 0; r < 4; r++) for (let c = 0; c < nc; c++) sw[r + ',' + c] = ctx.S('R' + (r + 1), 'C' + (c + 1), false, 80);
      return { sw };
    },
    actiune(inst, act, faza, el, sim, disp, extra) {
      if (act !== 'tasta' || !extra) return;
      const s = el.sw[extra.k];
      if (!s) return;
      s.inchis = faza === 'jos';
      inst._tasta = faza === 'jos' ? extra.k : null;
      sim.murdarComponenta(inst);
    },
    vizual(g, inst) {
      for (const t of g.querySelectorAll('[data-tasta]')) t.setAttribute('opacity', inst._tasta === t.dataset.tasta ? 0.6 : 1);
    }
  });

  // ---------- Joystick KY-023 ----------
  M.componente.defineste({
    tip: 'joystick', nume: 'Joystick KY-023', categorie: 'intrari', eticheta: 'JOY',
    cauta: 'joystick ky-023 manete analogic xy',
    descriere: 'Două potențiometre (X și Y) și un buton. Pe VRx și VRy iese o tensiune între 0 și alimentare, cu mijlocul la jumătate. Trage de manetă în simulare.',
    prop: [],
    alimentare: { vcc: '+5V', min: 3, max: 5.5 },
    control: [{ cheie: 'x', eticheta: 'Axa X', min: -100, max: 100, pas: 1, unitate: '%', implicit: 0 }, { cheie: 'y', eticheta: 'Axa Y', min: -100, max: 100, pas: 1, unitate: '%', implicit: 0 }],
    pini: () => [
      { id: 'GND', x: 0, y: 0, eticheta: 'GND', tip: 'gnd' }, { id: '+5V', x: 10, y: 0, eticheta: '+5V', tip: 'vcc', descriere: 'Alimentare (la ESP32 folosește 3,3 V ca să nu depășești tensiunea ADC-ului)' },
      { id: 'VRx', x: 20, y: 0, eticheta: 'VRx', tip: 'iesire', descriere: 'Tensiunea axei X' }, { id: 'VRy', x: 30, y: 0, eticheta: 'VRy', tip: 'iesire', descriere: 'Tensiunea axei Y' },
      { id: 'SW', x: 40, y: 0, eticheta: 'SW', tip: 'iesire', descriere: 'Buton (la GND când e apăsat)' }
    ],
    cutie: () => ({ x: -8, y: -72, w: 56, h: 74 }),
    desen() {
      let s = D.pcb(-8, -70, 56, 64, { culoare: '#1c1f24', gauri: 3.5 });
      s += `<rect x="3" y="-60" width="34" height="34" rx="2" fill="#2b2e33"/>`;
      s += `<g data-act="stick" class="interactiv"><circle cx="20" cy="-43" r="17" fill="transparent"/><g data-r="stick"><circle cx="20" cy="-43" r="13" fill="#15171a"/><circle cx="20" cy="-43" r="11" fill="url(#butonRotativ)"/><circle cx="17" cy="-46" r="3" fill="rgba(255,255,255,.1)"/></g></g>`;
      for (const p of this.pini()) { s += D.pinAntet(p.x, p.y); s += D.text(p.x, p.y - 7, p.eticheta, { m: 2.6 }); }
      return s;
    },
    electric(ctx, inst) {
      const xa = ctx.R('+5V', 'VRx', 5000), xb = ctx.R('VRx', 'GND', 5000);
      const ya = ctx.R('+5V', 'VRy', 5000), yb = ctx.R('VRy', 'GND', 5000);
      const sw = ctx.S('SW', 'GND', false);
      const act = () => {
        const c = inst.control || {};
        const fx = (1 + (+c.x || 0) / 100) / 2, fy = (1 + (+c.y || 0) / 100) / 2;
        xa.r = Math.max(10, 10000 * (1 - fx)); xb.r = Math.max(10, 10000 * fx);
        ya.r = Math.max(10, 10000 * (1 - fy)); yb.r = Math.max(10, 10000 * fy);
      };
      act();
      return { xa, xb, ya, yb, sw, act };
    },
    laControl(inst, el, sim) { el.act(); sim.murdarComponenta(inst); },
    actiune(inst, act, faza, el, sim, disp, extra) {
      if (act !== 'stick') return;
      if (faza === 'jos') {
        const l = extra.local;
        const dx = (l.x - 20) / 14, dy = (l.y + 43) / 14;
        if (Math.hypot(dx, dy) < 0.35) { el.sw.inchis = true; inst._apasat = true; sim.murdarComponenta(inst); return; }
        sim.control(inst, 'x', Math.round(M.u.clamp(dx, -1, 1) * 100));
        sim.control(inst, 'y', Math.round(M.u.clamp(-dy, -1, 1) * 100));
      } else {
        el.sw.inchis = false; inst._apasat = false;
        sim.control(inst, 'x', 0); sim.control(inst, 'y', 0);
      }
      M.bus.emit('control', inst);
    },
    vizual(g, inst) {
      const c = inst.control || {};
      const st = g.querySelector('[data-r="stick"]');
      if (st) st.setAttribute('transform', `translate(${(+c.x || 0) / 100 * 5} ${-(+c.y || 0) / 100 * 5})` + (inst._apasat ? ' translate(20 -43) scale(.92) translate(-20 43)' : ''));
    }
  });

  // ---------- Pad tactil capacitiv (ESP32 touch) ----------
  M.componente.defineste({
    tip: 'pad-tactil', nume: 'Pad tactil (senzor capacitiv ESP32)', categorie: 'intrari', eticheta: 'TOUCH',
    cauta: 'pad tactil touch capacitiv touchread atingere senzor degete',
    descriere: 'O placă de cupru legată la un pin tactil al ESP32 (ex. GPIO4 = T0). Citește-l cu touchRead(): pe ESP32 valoarea scade când atingi (≈1280 liber, ≈300 atins), pe ESP32-S3 crește.',
    prop: [{ cheie: 'marime', eticheta: 'Mărime', tip: 'alegere', optiuni: [['mic', 'Mic (15 mm)'], ['mare', 'Mare (30 mm)']], implicit: 'mare' }],
    pini: () => [{ id: 'P', x: 0, y: 0, eticheta: 'T', tip: 'pasiv', descriere: 'La un pin tactil al plăcii' }],
    cutie: p => p.marime === 'mic' ? { x: -14, y: -32, w: 28, h: 34 } : { x: -22, y: -48, w: 44, h: 50 },
    desen(p) {
      const r = p.marime === 'mic' ? 12 : 20;
      let s = D.picior(0, 0, 0, -6);
      s += `<g data-act="atinge" class="interactiv"><circle cx="0" cy="${-8 - r}" r="${r}" fill="#c98b4b" stroke="#8e5a26" stroke-width="1"/><circle cx="0" cy="${-8 - r}" r="${r * 0.72}" fill="none" stroke="#e8b27a" stroke-width="0.8" opacity="0.6"/>`;
      s += `<circle cx="0" cy="${-8 - r}" r="${r * 0.5}" fill="#f1d3a8" opacity="0" data-r="deget"/></g>`;
      return s;
    },
    dispozitiv(inst) {
      return { atins: false, apasare() { return this.atins ? 1 : 0; } };
    },
    actiune(inst, act, faza, el, sim, disp) { if (disp) disp.atins = faza === 'jos'; inst._atins = faza === 'jos'; },
    vizual(g, inst) { const d = g.querySelector('[data-r="deget"]'); if (d) d.setAttribute('opacity', inst._atins ? 0.85 : 0); },
    faraVerificareScurt: true
  });

  // ---------- Modul tactil TTP223 ----------
  M.componente.defineste({
    tip: 'ttp223', nume: 'Modul tactil TTP223', categorie: 'intrari', eticheta: 'TTP',
    cauta: 'ttp223 touch modul tactil capacitiv buton',
    descriere: 'Buton tactil gata făcut: pinul SIG trece pe HIGH cât timp atingi placa. Merge cu orice pin digital și se alimentează la 2–5,5 V.',
    prop: [],
    alimentare: { vcc: 'VCC', min: 2, max: 5.5 },
    pini: () => [{ id: 'GND', x: 0, y: 0, eticheta: 'GND', tip: 'gnd' }, { id: 'VCC', x: 10, y: 0, eticheta: 'VCC', tip: 'vcc' }, { id: 'SIG', x: 20, y: 0, eticheta: 'SIG', tip: 'iesire', descriere: 'HIGH când e atins' }],
    cutie: () => ({ x: -6, y: -34, w: 32, h: 36 }),
    desen() {
      let s = D.pcb(-6, -32, 32, 26, { culoare: '#c0392b', raza: 2 });
      s += `<g data-act="atinge" class="interactiv"><circle cx="10" cy="-21" r="9" fill="#e5e1d8" stroke="#a9a498" stroke-width="0.6"/><circle cx="10" cy="-21" r="4" fill="#f1d3a8" opacity="0" data-r="deget"/></g>`;
      s += `<circle cx="22" cy="-10" r="1.4" fill="#3cff5a" opacity="0" data-r="led"/>`;
      for (const p of this.pini()) { s += D.pinAntet(p.x, p.y); s += D.text(p.x, p.y + 5.5, p.eticheta, { m: 2.6, c: 'var(--text-2)' }); }
      return s;
    },
    electric(ctx, inst, sim) {
      const iesire = ctx.iesire('SIG', () => {
        const v = tensiuneModul(sim, inst);
        if (v < 1.8) return null;
        return { v: inst._atins ? v : 0, r: 150 };
      });
      return { iesire };
    },
    actiune(inst, act, faza, el, sim) { inst._atins = faza === 'jos'; sim.murdarComponenta(inst); },
    vizual(g, inst, sim) {
      const d = g.querySelector('[data-r="deget"]'); if (d) d.setAttribute('opacity', inst._atins ? 0.85 : 0);
      const l = g.querySelector('[data-r="led"]'); if (l) l.setAttribute('opacity', inst._atins && sim && tensiuneModul(sim, inst) > 1.8 ? 0.95 : 0);
    }
  });
})(window.M = window.M || {});
