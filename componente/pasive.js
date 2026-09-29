/* Meșter — componente pasive: rezistor, condensatoare, potențiometru, fotorezistor, termistor NTC. */
(function (M) {
  'use strict';
  const D = M.desen;
  const fv = D.formatValoare;

  // ---------- Rezistor ----------
  M.componente.defineste({
    tip: 'rezistor', nume: 'Rezistor', categorie: 'pasive', eticheta: 'R',
    cauta: 'rezistor rezistenta resistor ohm 220 330 1k 10k',
    descriere: 'Limitează curentul. Inelele colorate arată valoarea. Pentru un LED pe 3,3 V folosește 150–330 Ω.',
    prop: [
      { cheie: 'valoare', eticheta: 'Rezistență', tip: 'valoare', unitate: 'Ω', implicit: 220, rapide: [100, 220, 330, 470, 1000, 2200, 4700, 10000, 47000, 100000] },
      { cheie: 'pas', eticheta: 'Distanța dintre picioare', tip: 'alegere', optiuni: [['3', '3 găuri'], ['4', '4 găuri'], ['5', '5 găuri'], ['6', '6 găuri'], ['8', '8 găuri']], implicit: '4' },
      { cheie: 'putere', eticheta: 'Putere maximă', tip: 'alegere', optiuni: [['0.25', '0,25 W'], ['0.5', '0,5 W'], ['1', '1 W']], implicit: '0.25' }
    ],
    pini: p => [{ id: '1', x: 0, y: 0, eticheta: '1', tip: 'pasiv' }, { id: '2', x: +p.pas * 10, y: 0, eticheta: '2', tip: 'pasiv' }],
    cutie: p => ({ x: -3, y: -5, w: +p.pas * 10 + 6, h: 10 }),
    desen(p) {
      const L = +p.pas * 10;
      const c = L / 2;
      const bw = 22, bh = 7;
      const inel = D.inele(+p.valoare);
      let s = D.picior(0, 0, c - bw / 2 + 1, 0) + D.picior(c + bw / 2 - 1, 0, L, 0);
      s += `<rect x="${c - bw / 2}" y="${-bh / 2}" width="${bw}" height="${bh}" rx="3.2" fill="var(--rezistor-corp)" stroke="rgba(0,0,0,.35)" stroke-width="0.5"/>`;
      const culori = [inel.benzi[0], inel.benzi[1], inel.mult, '#c9a227'];
      const poz = [-7, -3.8, -0.6, 5.5];
      culori.forEach((cl, i) => { s += `<rect x="${c + poz[i]}" y="${-bh / 2 + 0.2}" width="1.9" height="${bh - 0.4}" fill="${cl}"/>`; });
      s += `<rect x="${c - bw / 2 + 1}" y="${-bh / 2 + 0.8}" width="${bw - 2}" height="1.4" rx="0.7" fill="rgba(255,255,255,.35)"/>`;
      s += `<g data-r="fum" opacity="0"><circle cx="${c}" cy="-8" r="4" fill="#777"/><circle cx="${c + 3}" cy="-12" r="3" fill="#999"/></g>`;
      return s;
    },
    electric(ctx, inst) { return { r: ctx.R('1', '2', Math.max(0.01, +inst.prop.valoare || 220)) }; },
    vizual(g, inst, sim, el) {
      if (!el || !el.r) return;
      const pmax = +(inst.prop.putere || 0.25);
      const p = Math.abs((el.r.v || 0) * (el.r.iMed !== undefined ? el.r.iMed : el.r.i));
      g.querySelector('[data-r="fum"]').setAttribute('opacity', p > pmax * 1.5 ? 0.8 : 0);
    },
    masura(el, inst) {
      if (!el.r) return [];
      const i = el.r.iMed !== undefined ? el.r.iMed : el.r.i;
      return [['Curent', fv(Math.abs(i), 'A')], ['Tensiune', fv(Math.abs(el.r.v || 0), 'V')], ['Putere', fv(Math.abs((el.r.v || 0) * i), 'W')]];
    },
    etichetaValoare: p => fv(+p.valoare, 'Ω')
  });

  // ---------- Condensator ceramic ----------
  M.componente.defineste({
    tip: 'condensator', nume: 'Condensator ceramic', categorie: 'pasive', eticheta: 'C',
    cauta: 'condensator ceramic capacitor 100nf 10nf decuplare',
    descriere: 'Condensator ceramic, fără polaritate. 100 nF lângă alimentarea unui modul reduce zgomotul. În curent continuu nu lasă curentul să treacă.',
    prop: [{ cheie: 'valoare', eticheta: 'Capacitate', tip: 'valoare', unitate: 'F', implicit: 100e-9, rapide: [10e-12, 22e-12, 100e-12, 1e-9, 10e-9, 100e-9, 1e-6] }],
    pini: () => [{ id: '1', x: 0, y: 0, eticheta: '1', tip: 'pasiv' }, { id: '2', x: 10, y: 0, eticheta: '2', tip: 'pasiv' }],
    cutie: () => ({ x: -5, y: -16, w: 20, h: 18 }),
    desen(p) {
      let s = D.picior(0, 0, 3, -6) + D.picior(10, 0, 7, -6);
      s += `<ellipse cx="5" cy="-10" rx="7" ry="5.5" fill="#d9a441" stroke="#9c6f1d" stroke-width="0.6"/>`;
      const v = +p.valoare;
      let cod = '';
      if (v >= 1e-12) { const pf = v / 1e-12; const e = Math.max(0, Math.floor(Math.log10(pf)) - 1); cod = String(Math.round(pf / Math.pow(10, e))).slice(0, 2) + e; }
      s += D.text(5, -10, cod, { m: 3.4, c: '#4a3208', g: 700 });
      return s;
    },
    electric() { return {}; },
    etichetaValoare: p => fv(+p.valoare, 'F')
  });

  // ---------- Condensator electrolitic ----------
  M.componente.defineste({
    tip: 'electrolitic', nume: 'Condensator electrolitic', categorie: 'pasive', eticheta: 'C',
    cauta: 'condensator electrolitic polarizat 100uf 470uf 1000uf capacitor filtrare',
    descriere: 'Condensator polarizat pentru filtrarea alimentării. Piciorul lung e plusul; banda deschisă de pe corp marchează minusul. Invers polarizat se poate umfla.',
    prop: [
      { cheie: 'valoare', eticheta: 'Capacitate', tip: 'valoare', unitate: 'F', implicit: 470e-6, rapide: [1e-6, 10e-6, 47e-6, 100e-6, 220e-6, 470e-6, 1000e-6] },
      { cheie: 'tensiune', eticheta: 'Tensiune maximă', tip: 'alegere', optiuni: [['6.3', '6,3 V'], ['10', '10 V'], ['16', '16 V'], ['25', '25 V'], ['35', '35 V'], ['50', '50 V']], implicit: '16' }
    ],
    pini: () => [{ id: '+', x: 0, y: 0, eticheta: '+', tip: 'pasiv', descriere: 'Plus (piciorul lung)' }, { id: '-', x: 10, y: 0, eticheta: '−', tip: 'pasiv', descriere: 'Minus (partea cu banda)' }],
    cutie: () => ({ x: -6, y: -30, w: 22, h: 32 }),
    desen(p) {
      let s = D.picior(0, 0, 2, -6) + D.picior(10, 0, 8, -6);
      s += `<rect x="-4" y="-29" width="18" height="24" rx="2.5" fill="#23324d" stroke="#141d2e" stroke-width="0.6"/>`;
      s += `<rect x="8.5" y="-29" width="5.5" height="24" fill="#8fa2c2" opacity="0.85"/>`;
      s += D.text(11.2, -21, '−', { m: 4.5, c: '#23324d', g: 800 }) + D.text(11.2, -12, '−', { m: 4.5, c: '#23324d', g: 800 });
      s += `<rect x="-4" y="-29" width="18" height="3" rx="1.5" fill="#c3cad6"/>`;
      s += D.text(2.5, -16, fv(+p.valoare, 'F').replace(' ', ''), { m: 3, c: '#e8ecf2', rot: -90 });
      s += `<g data-r="umflat" opacity="0"><ellipse cx="5" cy="-29" rx="8" ry="3" fill="#c3cad6"/></g>`;
      return s;
    },
    electric() { return {}; },
    etichetaValoare: p => fv(+p.valoare, 'F')
  });

  // ---------- Potențiometru ----------
  M.componente.defineste({
    tip: 'potentiometru', nume: 'Potențiometru', categorie: 'intrari', eticheta: 'POT',
    cauta: 'potentiometru rezistor variabil 10k buton rotativ trimmer',
    descriere: 'Rezistor reglabil cu 3 picioare. Capetele merg la 3,3 V și GND, iar piciorul din mijloc dă o tensiune între ele (citește-l cu analogRead).',
    prop: [
      { cheie: 'valoare', eticheta: 'Rezistență totală', tip: 'valoare', unitate: 'Ω', implicit: 10000, rapide: [1000, 5000, 10000, 50000, 100000] },
      { cheie: 'forma', eticheta: 'Formă', tip: 'alegere', optiuni: [['rotativ', 'Rotativ cu buton'], ['trimmer', 'Trimmer albastru']], implicit: 'rotativ' }
    ],
    control: [{ cheie: 'pozitie', eticheta: 'Poziție', min: 0, max: 100, pas: 1, unitate: '%', implicit: 50 }],
    pini: () => [{ id: '1', x: 0, y: 0, eticheta: '1', tip: 'pasiv', descriere: 'Capăt 1' }, { id: 'W', x: 10, y: 0, eticheta: 'W', tip: 'pasiv', descriere: 'Cursor (ieșirea tensiunii)' }, { id: '2', x: 20, y: 0, eticheta: '2', tip: 'pasiv', descriere: 'Capăt 2' }],
    cutie: p => p.forma === 'trimmer' ? { x: -5, y: -24, w: 30, h: 27 } : { x: -8, y: -42, w: 36, h: 45 },
    desen(p) {
      let s = '';
      if (p.forma === 'trimmer') {
        s += D.picior(0, 0, 0, -4) + D.picior(10, 0, 10, -4) + D.picior(20, 0, 20, -4);
        s += `<rect x="-4" y="-22" width="28" height="19" rx="2" fill="#2f63c4" stroke="#1d3f82" stroke-width="0.6"/>`;
        s += `<g data-r="cursor" transform="rotate(0 10 -12.5)"><circle cx="10" cy="-12.5" r="6.5" fill="#f1f1ea" stroke="#9aa" stroke-width="0.5"/><rect x="9" y="-18" width="2" height="11" fill="#4a4f57"/><rect x="4.5" y="-13.5" width="11" height="2" fill="#4a4f57"/></g>`;
        s += `<g data-act="pot" class="interactiv"><rect x="-4" y="-22" width="28" height="19" fill="transparent"/></g>`;
        return s;
      }
      s += D.picior(0, 0, 0, -6) + D.picior(10, 0, 10, -6) + D.picior(20, 0, 20, -6);
      s += `<rect x="-6" y="-14" width="32" height="10" rx="1.5" fill="#1d4f9c" stroke="#123366" stroke-width="0.6"/>`;
      s += `<circle cx="10" cy="-26" r="15" fill="#2a2d33" stroke="#15171a" stroke-width="0.8"/>`;
      s += `<g data-r="cursor" transform="rotate(0 10 -26)"><circle cx="10" cy="-26" r="11" fill="url(#butonRotativ)"/><rect x="9" y="-37" width="2" height="7" rx="1" fill="#f0f0ea"/></g>`;
      s += `<g data-act="pot" class="interactiv"><circle cx="10" cy="-26" r="15" fill="transparent"/></g>`;
      return s;
    },
    electric(ctx, inst) {
      const R = Math.max(1, +inst.prop.valoare || 10000);
      const poz = () => Math.min(1, Math.max(0, (inst.control && inst.control.pozitie !== undefined ? inst.control.pozitie : 50) / 100));
      const a = ctx.R('1', 'W', R);
      const b = ctx.R('W', '2', R);
      const actualizeaza = () => { a.r = Math.max(0.5, R * poz()); b.r = Math.max(0.5, R * (1 - poz())); };
      actualizeaza();
      return { a, b, actualizeaza };
    },
    laControl(inst, el, sim) { if (el && el.actualizeaza) { el.actualizeaza(); sim.murdarComponenta(inst); } },
    vizual(g, inst) {
      const poz = (inst.control && inst.control.pozitie !== undefined ? inst.control.pozitie : 50) / 100;
      const unghi = -135 + 270 * poz;
      const c = g.querySelector('[data-r="cursor"]');
      if (c) { const t = c.getAttribute('transform').replace(/rotate\([^ ]+/, 'rotate(' + unghi.toFixed(1)); c.setAttribute('transform', t); }
    },
    rotire: { cheie: 'pozitie', min: 0, max: 100 },
    etichetaValoare: p => fv(+p.valoare, 'Ω')
  });

  // ---------- Fotorezistor (LDR) ----------
  M.componente.defineste({
    tip: 'fotorezistor', nume: 'Fotorezistor (LDR)', categorie: 'senzori', eticheta: 'LDR',
    cauta: 'fotorezistor ldr lumina senzor gl5528 photoresistor',
    descriere: 'Rezistența scade când e mai multă lumină (≈10 kΩ la lumină de cameră, ≈1 MΩ în întuneric). Pune-l într-un divizor cu un rezistor de 10 kΩ și citește cu analogRead.',
    prop: [],
    control: [{ cheie: 'lux', eticheta: 'Lumină', min: 0, max: 20000, pas: 1, unitate: 'lx', implicit: 300, log: true }],
    pini: () => [{ id: '1', x: 0, y: 0, eticheta: '1', tip: 'pasiv' }, { id: '2', x: 20, y: 0, eticheta: '2', tip: 'pasiv' }],
    cutie: () => ({ x: -2, y: -22, w: 24, h: 24 }),
    desen() {
      let s = D.picior(0, 0, 6, -8) + D.picior(20, 0, 14, -8);
      s += `<circle cx="10" cy="-13" r="9" fill="#e9dcc0" stroke="#b9a57c" stroke-width="0.7"/>`;
      s += `<path d="M4 -16 h12 M4 -13 h12 M4 -10 h12" stroke="#c0392b" stroke-width="1" fill="none"/>`;
      s += `<path d="M5 -16 v3 M15 -13 v3" stroke="#c0392b" stroke-width="1"/>`;
      return s;
    },
    electric(ctx, inst) {
      const r = ctx.R('1', '2', 10000);
      const actualizeaza = () => {
        const lux = Math.max(0, inst.control && inst.control.lux !== undefined ? +inst.control.lux : 300);
        r.r = lux <= 0.1 ? 2e6 : Math.min(2e6, Math.max(80, 12000 * Math.pow(lux / 10, -0.75)));
      };
      actualizeaza();
      return { r, actualizeaza };
    },
    laControl(inst, el, sim) { el.actualizeaza(); sim.murdarComponenta(inst); },
    masura(el) { return [['Rezistență', fv(el.r.r, 'Ω')]]; }
  });

  // ---------- Termistor NTC ----------
  M.componente.defineste({
    tip: 'ntc', nume: 'Termistor NTC 10k', categorie: 'senzori', eticheta: 'NTC',
    cauta: 'termistor ntc 10k temperatura thermistor b3950',
    descriere: 'Rezistența scade când crește temperatura (10 kΩ la 25 °C, B = 3950). Folosește un divizor cu 10 kΩ și formula Steinhart–Hart.',
    prop: [{ cheie: 'r25', eticheta: 'Rezistență la 25 °C', tip: 'valoare', unitate: 'Ω', implicit: 10000 }, { cheie: 'beta', eticheta: 'Coeficient B', tip: 'numar', implicit: 3950 }],
    control: [{ cheie: 'temperatura', eticheta: 'Temperatură', min: -40, max: 125, pas: 0.5, unitate: '°C', implicit: 24 }],
    pini: () => [{ id: '1', x: 0, y: 0, eticheta: '1', tip: 'pasiv' }, { id: '2', x: 10, y: 0, eticheta: '2', tip: 'pasiv' }],
    cutie: () => ({ x: -4, y: -18, w: 18, h: 20 }),
    desen() {
      let s = D.picior(0, 0, 3, -8) + D.picior(10, 0, 7, -8);
      s += `<path d="M5 -17 c5 0 6 3 6 6 c0 3 -3 4 -6 4 c-3 0 -6 -1 -6 -4 c0 -3 1 -6 6 -6z" fill="#2b2b2b"/>`;
      s += D.text(5, -12, '103', { m: 2.6, c: '#ddd' });
      return s;
    },
    electric(ctx, inst) {
      const r = ctx.R('1', '2', 10000);
      const actualizeaza = () => {
        const t = (inst.control && inst.control.temperatura !== undefined ? +inst.control.temperatura : 24) + 273.15;
        const r25 = +inst.prop.r25 || 10000, b = +inst.prop.beta || 3950;
        r.r = r25 * Math.exp(b * (1 / t - 1 / 298.15));
      };
      actualizeaza();
      return { r, actualizeaza };
    },
    laControl(inst, el, sim) { el.actualizeaza(); sim.murdarComponenta(inst); },
    masura(el) { return [['Rezistență', fv(el.r.r, 'Ω')]]; }
  });
})(window.M = window.M || {});
