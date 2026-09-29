/* Meșter — motoare și relee: servomotoare SG90 / MG90S / MG996R, motor pas cu pas 28BYJ-48 cu driver
   ULN2003, NEMA 17 cu driver A4988, motor de curent continuu (și ventilator, pompă, motor de vibrații),
   driverul L298N și modulul de releu cu optocuplor. */
(function (M) {
  'use strict';
  const D = M.desen;
  const fv = D.formatValoare;
  const tensiuneModul = (sim, inst, vcc, gnd) => M.tensiuneModul(sim, inst, vcc, gnd);
  const ctl = (inst, k, implicit) => inst.control && inst.control[k] !== undefined ? +inst.control[k] : implicit;

  // nivelul logic (0…1, ca factor de umplere la PWM) al unei rețele, fără să rezolvăm circuitul
  function nivelDigital(sim, net, pragV) {
    if (!sim || net < 0) return 0;
    const c = sim.circuit;
    if (c.fix.has(net)) return c.fix.get(net) > (pragV || 1.6) ? 1 : 0;
    for (const g of sim.gpioLaNet(net)) {
      const st = sim.stariPin.get(g);
      if (!st || (st.mod !== 'OUTPUT' && st.mod !== 'OUTPUT_OPEN_DRAIN')) continue;
      if (st.pwm && st.pwm.frecventa > 0) return Math.max(0, Math.min(1, st.pwm.duty));
      if (st.dac !== null && st.dac !== undefined) return st.dac > (pragV || 1.6) ? 1 : 0;
      return st.nivel ? 1 : 0;
    }
    return 0;
  }
  // semnalul PWM de pe o rețea: {frecventa, puls (µs)} sau null
  function pwmPeNet(sim, net) {
    for (const g of sim.gpioLaNet(net)) {
      const st = sim.stariPin.get(g);
      if (st && st.mod === 'OUTPUT' && st.pwm && st.pwm.frecventa > 0) return { frecventa: st.pwm.frecventa, puls: st.pwm.duty / st.pwm.frecventa * 1e6 };
    }
    return null;
  }
  // sursa care alimentează o rețea (descrierea ei) — ca să vedem dacă un motor stă pe 3,3 V-ul plăcii
  const sursaRetelei = (sim, net) => (sim.circuit.fixSursa && sim.circuit.fixSursa.get(net)) || '';
  M.motoare = { nivelDigital, pwmPeNet };
  const antete = (pini) => { let s = ''; for (const p of pini) { s += D.pinAntet(p.x, p.y); s += D.text(p.x, p.y + 5.5, p.eticheta, { m: 2.4, c: 'var(--text-2)' }); } return s; };

  // ---------- servomotor ----------
  const SERVO = {
    sg90: { nume: 'SG90 (micro, 1,8 kg·cm)', viteza: 600, iMers: 0.25, iRepaus: 0.006, vmin: 4, corp: '#2f63c4', mare: false },
    mg90s: { nume: 'MG90S (micro, angrenaje metalice)', viteza: 600, iMers: 0.35, iRepaus: 0.008, vmin: 4, corp: '#1d1f22', mare: false },
    mg996r: { nume: 'MG996R (mare, 10 kg·cm)', viteza: 350, iMers: 0.9, iRepaus: 0.01, vmin: 4.5, corp: '#1d1f22', mare: true }
  };
  M.componente.defineste({
    tip: 'servo', nume: 'Servomotor', categorie: 'motoare', eticheta: 'SRV',
    cauta: 'servo servomotor sg90 mg90s mg996r unghi 180 pwm',
    descriere: 'Se rotește la un unghi între 0° și 180°, după lățimea impulsului primit pe firul portocaliu (≈0,5 ms → 0°, ≈2,4 ms → 180°, de 50 de ori pe secundă). Are nevoie de 5 V pe firul roșu: la 3,3 V e slab, iar un servo mare poate reseta placa (brownout).',
    prop: [{ cheie: 'model', eticheta: 'Model', tip: 'alegere', optiuni: Object.keys(SERVO).map(k => [k, SERVO[k].nume]), implicit: 'sg90' }],
    pini: () => [{ id: 'GND', x: 0, y: 0, eticheta: 'maro', tip: 'gnd', descriere: 'Firul maro: GND' }, { id: 'VCC', x: 10, y: 0, eticheta: 'roșu', tip: 'vcc', descriere: 'Firul roșu: 4,8–6 V' }, { id: 'SIG', x: 20, y: 0, eticheta: 'port.', tip: 'intrare', descriere: 'Firul portocaliu: semnal PWM 50 Hz' }],
    cutie: p => SERVO[p.model] && SERVO[p.model].mare ? { x: -26, y: -86, w: 72, h: 89 } : { x: -14, y: -66, w: 50, h: 69 },
    desen(p) {
      const m = SERVO[p.model] || SERVO.sg90;
      const k = m.mare ? 1.45 : 1;
      let s = `<path d="M0 0 C0 -8 4 -12 6 -18" stroke="#6d4c41" stroke-width="1.3" fill="none"/><path d="M10 0 C10 -8 10 -12 10 -18" stroke="#d32f2f" stroke-width="1.3" fill="none"/><path d="M20 0 C20 -8 16 -12 14 -18" stroke="#fb8c00" stroke-width="1.3" fill="none"/>`;
      s += `<rect x="3" y="-22" width="14" height="5" rx="1" fill="#1d1f22"/>`;
      const cx = 10, cy = -44 * (m.mare ? 1.25 : 1);
      s += `<rect x="${cx - 16 * k}" y="${cy - 18 * k}" width="${32 * k}" height="${24 * k}" rx="2" fill="${m.corp}" stroke="rgba(0,0,0,.4)" stroke-width="0.6"/>`;
      s += `<rect x="${cx - 21 * k}" y="${cy - 4 * k}" width="${42 * k}" height="${4 * k}" rx="1" fill="${m.corp}" opacity="0.85"/>`;
      s += `<circle cx="${cx - 6 * k}" cy="${cy - 8 * k}" r="${6 * k}" fill="rgba(255,255,255,.12)"/>`;
      s += `<g data-r="brat" transform="rotate(0 ${cx - 6 * k} ${cy - 8 * k})"><path d="M${cx - 6 * k} ${cy - 11 * k} L${cx + 14 * k} ${cy - 9.5 * k} L${cx + 14 * k} ${cy - 6.5 * k} L${cx - 6 * k} ${cy - 5 * k} Z" fill="#f4f4ef" stroke="#bdbdb4" stroke-width="0.5"/><circle cx="${cx - 6 * k}" cy="${cy - 8 * k}" r="${3.4 * k}" fill="#f4f4ef" stroke="#bdbdb4" stroke-width="0.5"/><circle cx="${cx - 6 * k}" cy="${cy - 8 * k}" r="${1.2 * k}" fill="#999"/></g>`;
      s += D.text(cx + 4 * k, cy + 2.5 * k, p.model === 'mg996r' ? 'MG996R' : p.model === 'mg90s' ? 'MG90S' : 'SG90', { m: 2.6 * k, c: '#e8eefc' });
      return s;
    },
    electric(ctx) { return { consum: ctx.R('VCC', 'GND', 800) }; },
    dispozitiv(inst, sim, el) {
      const m = SERVO[inst.prop.model] || SERVO.sg90;
      return {
        familie: 'servo', unghi: 90, tinta: null, merge: false, ultim: 0,
        cadru(t) {
          const dt = Math.max(0, (t - this.ultim) / 1e6); this.ultim = t;
          const v = tensiuneModul(sim, inst);
          const p = pwmPeNet(sim, sim.netPin(inst, 'SIG'));
          if (p && p.frecventa >= 35 && p.frecventa <= 400 && p.puls >= 400 && p.puls <= 2700 && v > 2.8) this.tinta = Math.max(0, Math.min(180, (p.puls - 544) / (2400 - 544) * 180));
          else if (p && v > 2.8 && (p.frecventa > 400 || p.frecventa < 35)) sim.problema('servo-frecv-' + inst.id, 'avertisment', inst.eticheta + ' primește PWM de ' + Math.round(p.frecventa) + ' Hz; un servo vrea impulsuri de 50 Hz (0,5–2,4 ms). Folosește biblioteca ESP32Servo.', { comp: inst.id });
          let merge = false;
          if (this.tinta !== null && v > 2.8) {
            const viteza = m.viteza * Math.min(1.2, v / 4.8);
            const d = this.tinta - this.unghi;
            if (Math.abs(d) > 0.5) { this.unghi += Math.sign(d) * Math.min(Math.abs(d), viteza * dt); merge = true; }
            if (v < m.vmin) {
              sim.problema('servo-v-' + inst.id, 'avertisment', inst.eticheta + ' primește doar ' + M.fmtV(v) + '. Un servo vrea 4,8–6 V: la tensiune mică e slab și tremură. Leagă firul roșu la VIN (5 V).', { comp: inst.id });
              this.unghi += (Math.random() - 0.5) * 1.5;
            }
          }
          if (merge !== this.merge) {
            this.merge = merge;
            const I = merge ? m.iMers : m.iRepaus;
            el.consum.r = Math.max(1, (v || 5) / I);
            sim.murdarComponenta(inst);
            if (merge) {
              const src = sursaRetelei(sim, sim.netPin(inst, 'VCC'));
              if (/3,3 V/.test(src) && m.iMers >= 0.3) sim.brownout && sim.brownout(inst.eticheta + ' (' + m.nume.split(' ')[0] + ') a tras ~' + Math.round(m.iMers * 1000) + ' mA din regulatorul de 3,3 V al plăcii');
              else if (/USB/.test(src) && m.mare) sim.problema('servo-usb-' + inst.id, 'avertisment', inst.eticheta + ' (MG996R) trage până la 1–2,5 A din USB-ul plăcii. Pe o placă reală asta resetează des ESP32 (brownout); alimentează servo-ul dintr-o sursă separată de 5 V, cu GND comun.', { comp: inst.id });
            }
          }
        }
      };
    },
    vizual(g, inst, sim, el, disp) {
      const b = g.querySelector('[data-r="brat"]');
      if (b) { const a = disp ? disp.unghi : 90; b.setAttribute('transform', b.getAttribute('transform').replace(/rotate\([^ ]+/, 'rotate(' + (90 - a).toFixed(1))); }
    },
    masura(el, inst, sim, disp) { return disp ? [['Unghi', Math.round(disp.unghi) + '°'], ['Curent', fv(disp.merge ? (SERVO[inst.prop.model] || SERVO.sg90).iMers : (SERVO[inst.prop.model] || SERVO.sg90).iRepaus, 'A')]] : []; }
  });

  // ---------- 28BYJ-48 + ULN2003 ----------
  M.componente.defineste({
    tip: 'stepper-28byj', nume: 'Motor pas cu pas 28BYJ-48 + ULN2003', categorie: 'motoare', eticheta: 'STP',
    cauta: 'stepper pas cu pas 28byj-48 uln2003 motor 5v',
    descriere: 'Motor pas cu pas cu reductor (2048 de pași pe tură, ~15 rot/min maxim) și placa ULN2003. IN1–IN4 la patru pini. Cu biblioteca Stepper, pinii se dau în ordinea IN1, IN3, IN2, IN4 — altfel motorul doar vibrează. Alimentare 5 V pe + și −.',
    prop: [],
    pini: () => [{ id: 'IN1', x: 0, y: 0, eticheta: 'IN1', tip: 'intrare' }, { id: 'IN2', x: 10, y: 0, eticheta: 'IN2', tip: 'intrare' }, { id: 'IN3', x: 20, y: 0, eticheta: 'IN3', tip: 'intrare' }, { id: 'IN4', x: 30, y: 0, eticheta: 'IN4', tip: 'intrare' },
      { id: 'GND', x: 50, y: 0, eticheta: '−', tip: 'gnd' }, { id: 'VCC', x: 60, y: 0, eticheta: '+', tip: 'vcc', descriere: '5–12 V pentru motor' }],
    cutie: () => ({ x: -8, y: -104, w: 80, h: 107 }),
    desen() {
      let s = D.pcb(-7, -40, 76, 36, { culoare: '#2e7d32', gauri: 3 });
      s += D.cip(10, -34, 26, 10, { eticheta: 'ULN2003', m: 2.2, picioare: 8 });
      ['A', 'B', 'C', 'D'].forEach((k, i) => { s += `<circle cx="${46 + i * 6}" cy="-28" r="1.5" fill="rgba(0,0,0,.4)"/><circle cx="${46 + i * 6}" cy="-28" r="1.2" fill="#ff3b2f" opacity="0.15" data-r="led${i}"/>` + D.text(46 + i * 6, -23, k, { m: 2 }); });
      s += `<rect x="44" y="-18" width="16" height="8" rx="1" fill="#f4f4ef"/>`;
      s += `<path d="M52 -40 C52 -52 40 -54 34 -60" stroke="#ddd" stroke-width="3" fill="none"/>`;
      s += `<circle cx="28" cy="-78" r="22" fill="#c9ccd1" stroke="#8a9099" stroke-width="0.8"/><circle cx="28" cy="-78" r="17" fill="#b9bec6"/>`;
      s += `<rect x="4" y="-82" width="48" height="8" rx="2" fill="#c9ccd1" stroke="#8a9099" stroke-width="0.5"/>`;
      s += `<g data-r="ax" transform="rotate(0 28 -86)"><circle cx="28" cy="-86" r="4.5" fill="#d6b25a"/><rect x="26.8" y="-94" width="2.4" height="16" rx="0.8" fill="#8a6b3a"/></g>`;
      s += antete(this.pini());
      return s;
    },
    electric(ctx) { return { consum: ctx.R('VCC', 'GND', 100000) }; },
    dispozitiv(inst, sim, el) {
      const DIR = [0, 90, 180, 270];
      return {
        familie: 'stepper', elec: 0, pasi: 0, ultimPas: -1e9, bobine: [0, 0, 0, 0], ratari: 0,
        start() { for (let i = 1; i <= 4; i++) sim.asculta(sim.netPin(inst, 'IN' + i), () => this.programeaza()); },
        // pinii se schimbă pe rând, la câteva µs distanță; rotorul reacționează abia la starea finală
        programeaza() { if (this.inAsteptare) return; this.inAsteptare = true; sim.programeaza(40, () => { this.inAsteptare = false; this.actualizeaza(); }); },
        actualizeaza() {
          const b = [1, 2, 3, 4].map(i => nivelDigital(sim, sim.netPin(inst, 'IN' + i)) >= 0.5 ? 1 : 0);
          if (b.every((x, i) => x === this.bobine[i])) return;
          this.bobine = b;
          const v = tensiuneModul(sim, inst);
          const nr = b.reduce((a, x) => a + x, 0);
          el.consum.r = nr && v > 1 ? 50 / nr : 100000; // ~50 Ω pe bobină
          sim.murdarComponenta(inst);
          if (v < 3.8) { if (nr) sim.problema('stp-v-' + inst.id, 'avertisment', inst.eticheta + ': motorul 28BYJ-48 e de 5 V; cu ' + M.fmtV(v) + ' pe + nu are forță să se rotească.', { comp: inst.id }); return; }
          let x = 0, y = 0;
          b.forEach((on, i) => { if (on) { x += Math.cos(DIR[i] * Math.PI / 180); y += Math.sin(DIR[i] * Math.PI / 180); } });
          if (Math.hypot(x, y) < 0.3) { this.ambigue = (this.ambigue || 0) + 1; return; } // bobine opuse: câmpul se anulează
          const tinta = Math.atan2(y, x) * 180 / Math.PI;
          let d = ((tinta - this.elec) % 360 + 540) % 360 - 180;
          if (Math.abs(d) > 135) { // salt prea mare: rotorul nu știe încotro să meargă și doar tremură
            this.ambigue = (this.ambigue || 0) + 1;
            if (this.ambigue > 6) sim.problema('stp-ordine-' + inst.id, 'avertisment', inst.eticheta + ': bobinele se aprind într-o ordine greșită și motorul doar tremură. Cu biblioteca Stepper dă pinii în ordinea IN1, IN3, IN2, IN4 (ex. Stepper motor(2048, IN1, IN3, IN2, IN4)).', { comp: inst.id });
            return;
          }
          const acum = sim.timp;
          // prea repede: rotorul nu mai ține pasul (≈ 15 rot/min la 5 V)
          if (acum - this.ultimPas < 850 * Math.abs(d) / 45 * (5 / v)) {
            this.ratari++;
            if (this.ratari > 20) sim.problema('stp-rapid-' + inst.id, 'avertisment', inst.eticheta + ': pașii vin prea repede — 28BYJ-48 nu ține pasul peste ~15 rot/min și doar vibrează. Micșorează viteza (ex. setSpeed(10)).', { comp: inst.id });
            this.ultimPas = acum;
            return;
          }
          this.ratari = Math.max(0, this.ratari - 1);
          this.ultimPas = acum;
          this.elec += d;
          this.pasi += d / 45; // jumătăți de pas
        },
        unghi() { return this.pasi * 360 / 4096; }
      };
    },
    vizual(g, inst, sim, el, disp) {
      for (let i = 0; i < 4; i++) { const l = g.querySelector('[data-r="led' + i + '"]'); if (l) l.setAttribute('opacity', disp && disp.bobine[i] ? 0.95 : 0.15); }
      const a = g.querySelector('[data-r="ax"]'); if (a && disp) a.setAttribute('transform', 'rotate(' + (disp.unghi() % 360).toFixed(2) + ' 28 -86)');
    },
    masura(el, inst, sim, disp) { return disp ? [['Unghi', (disp.unghi()).toFixed(1).replace('.', ',') + '°'], ['Pași (jumătăți)', Math.round(disp.pasi)]] : []; }
  });

  // ---------- NEMA 17 + A4988 ----------
  M.componente.defineste({
    tip: 'a4988', nume: 'Motor NEMA 17 + driver A4988', categorie: 'motoare', eticheta: 'A49',
    cauta: 'a4988 nema17 stepper driver pas cu pas step dir drv8825 imprimanta 3d cnc',
    descriere: 'Driver pentru motoare pas cu pas mari: fiecare impuls pe STEP face un pas (1,8°, adică 200 pe tură), iar DIR alege sensul. Leagă RST de SLP (altfel driverul stă oprit), EN la GND sau liber, VDD la 3,3 V și VMOT la 8–35 V. MS1–MS3 aleg micro-pașii.',
    prop: [],
    pini: () => [
      { id: 'EN', x: 0, y: 0, eticheta: 'EN', tip: 'intrare', descriere: 'Activ pe LOW (are pull-down: liber = pornit)' }, { id: 'MS1', x: 10, y: 0, eticheta: 'MS1', tip: 'intrare' }, { id: 'MS2', x: 20, y: 0, eticheta: 'MS2', tip: 'intrare' }, { id: 'MS3', x: 30, y: 0, eticheta: 'MS3', tip: 'intrare' },
      { id: 'RST', x: 40, y: 0, eticheta: 'RST', tip: 'intrare', descriere: 'Reset — leagă-l la SLP' }, { id: 'SLP', x: 50, y: 0, eticheta: 'SLP', tip: 'intrare', descriere: 'Sleep — are pull-up pe placă; leagă-l de RST' }, { id: 'STEP', x: 60, y: 0, eticheta: 'STEP', tip: 'intrare' }, { id: 'DIR', x: 70, y: 0, eticheta: 'DIR', tip: 'intrare' },
      { id: 'VMOT', x: 0, y: -80, eticheta: 'VMOT', tip: 'vcc', descriere: '8–35 V pentru motor' }, { id: 'GNDM', x: 10, y: -80, eticheta: 'GND', tip: 'gnd' }, { id: 'VDD', x: 60, y: -80, eticheta: 'VDD', tip: 'vcc', descriere: 'Logica: 3–5,5 V' }, { id: 'GND', x: 70, y: -80, eticheta: 'GND', tip: 'gnd' }],
    interne: () => [['GNDM', 'GND']],
    cutie: () => ({ x: -8, y: -88, w: 150, h: 91 }),
    desen() {
      let s = D.pcb(-6, -74, 82, 66, { culoare: '#2e7d32' });
      s += `<rect x="20" y="-52" width="30" height="24" rx="2" fill="#1d1f22"/><rect x="24" y="-50" width="22" height="20" fill="#c9ccd1" opacity="0.5"/>` + D.text(35, -40, 'A4988', { m: 3, c: '#222' });
      s += `<circle cx="62" cy="-60" r="3" fill="#c9ccd1"/>`;
      s += `<rect x="90" y="-78" width="50" height="50" rx="4" fill="#2a2d33" stroke="#15171a" stroke-width="0.8"/><circle cx="115" cy="-53" r="11" fill="#c9ccd1"/>`;
      s += `<g data-r="ax" transform="rotate(0 115 -53)"><circle cx="115" cy="-53" r="3" fill="#8a9099"/><rect x="114" y="-64" width="2" height="11" fill="#555"/></g>`;
      s += `<path d="M76 -40 C84 -40 84 -50 90 -50 M76 -36 C85 -36 85 -46 90 -46 M76 -32 C86 -32 86 -42 90 -42 M76 -28 C87 -28 87 -38 90 -38" stroke="#aaa" stroke-width="1" fill="none"/>`;
      for (const p of this.pini()) { s += D.pinAntet(p.x, p.y); s += D.text(p.x, p.y + (p.y ? 5.5 : 5.5), p.eticheta, { m: 2.2, c: 'var(--text-2)' }); }
      return s;
    },
    electric(ctx) {
      return { en: ctx.R('EN', 'GND', 100000), ms1: ctx.R('MS1', 'GND', 100000), ms2: ctx.R('MS2', 'GND', 50000), ms3: ctx.R('MS3', 'GND', 100000), slp: ctx.R('SLP', 'VDD', 10000), logica: ctx.R('VDD', 'GND', 10000), motor: ctx.R('VMOT', 'GNDM', 10000) };
    },
    dispozitiv(inst, sim, el) {
      return {
        familie: 'a4988', pasi: 0, ultim: -1e9, inainte: 0,
        start() { sim.asculta(sim.netPin(inst, 'STEP'), (nivel) => { if (nivel && !this.inainte) this.pas(); this.inainte = nivel; }); },
        micro() {
          const vdd = tensiuneModul(sim, inst, 'VDD', 'GND');
          const m = [1, 2, 3].map(i => sim.nivelNet(sim.netPin(inst, 'MS' + i), vdd));
          const cod = (m[0] ? 1 : 0) | (m[1] ? 2 : 0) | (m[2] ? 4 : 0);
          return ({ 0: 1, 1: 2, 2: 4, 3: 8, 7: 16 })[cod] || 1;
        },
        pas() {
          const vdd = tensiuneModul(sim, inst, 'VDD', 'GND'), vm = tensiuneModul(sim, inst, 'VMOT', 'GNDM');
          if (vdd < 2.7) { sim.problema('a4988-vdd-' + inst.id, 'eroare', inst.eticheta + ': VDD (logica) nu e alimentat.', { comp: inst.id }); return; }
          const netRst = sim.netPin(inst, 'RST');
          if (sim.circuit.flotant(netRst)) { sim.problema('a4988-rst-' + inst.id, 'eroare', inst.eticheta + ': pinul RST e „în aer”, așa că driverul stă în reset și motorul nu se mișcă. Leagă RST de SLP.', { comp: inst.id }); return; }
          if (!sim.nivelNet(netRst, vdd) || !sim.nivelNet(sim.netPin(inst, 'SLP'), vdd)) return; // în reset sau în somn
          if (sim.nivelNet(sim.netPin(inst, 'EN'), vdd)) return; // EN pe HIGH = ieșiri oprite
          if (vm < 7.5) { sim.problema('a4988-vm-' + inst.id, 'avertisment', inst.eticheta + ': VMOT are ' + M.fmtV(vm) + '; A4988 cere minimum 8 V pentru motor.', { comp: inst.id }); return; }
          const acum = sim.timp;
          const ms = this.micro();
          // prea repede fără accelerare: motorul pierde pași
          if ((acum - this.ultim) * ms < 350) { this.ultim = acum; sim.problema('a4988-rapid-' + inst.id, 'avertisment', inst.eticheta + ': pașii vin prea repede și motorul pierde pași. Folosește accelerare (AccelStepper) sau o viteză mai mică.', { comp: inst.id }); return; }
          this.ultim = acum;
          this.pasi += (sim.nivelNet(sim.netPin(inst, 'DIR'), vdd) ? 1 : -1) / ms;
        },
        unghi() { return this.pasi * 1.8; }
      };
    },
    vizual(g, inst, sim, el, disp) { const a = g.querySelector('[data-r="ax"]'); if (a && disp) a.setAttribute('transform', 'rotate(' + (disp.unghi() % 360).toFixed(2) + ' 115 -53)'); },
    masura(el, inst, sim, disp) { return disp ? [['Unghi', disp.unghi().toFixed(1).replace('.', ',') + '°'], ['Pași', disp.pasi.toFixed(2).replace('.', ',')]] : []; }
  });

  // ---------- motor de curent continuu ----------
  const MOTOARE = {
    motor: { nume: 'Motor DC 3–6 V', r: 3.5, vnom: 5, corp: 'motor' },
    ventilator: { nume: 'Ventilator 5 V', r: 25, vnom: 5, corp: 'ventilator' },
    pompa: { nume: 'Pompă de apă 5 V', r: 6, vnom: 5, corp: 'pompa' },
    vibratii: { nume: 'Motor de vibrații (monedă)', r: 40, vnom: 3, corp: 'vibratii' }
  };
  M.componente.defineste({
    tip: 'motor-dc', nume: 'Motor de curent continuu', categorie: 'motoare', eticheta: 'M',
    cauta: 'motor dc curent continuu ventilator pompa vibratii tt jucarie',
    descriere: 'Se învârte cu atât mai repede cu cât primește mai multă tensiune; inversând firele schimbi sensul. Trage sute de mA (la pornire chiar peste 1 A), deci NU îl lega direct la un pin: folosește un tranzistor/MOSFET sau un driver (L298N) și o diodă în paralel.',
    prop: [{ cheie: 'model', eticheta: 'Tip', tip: 'alegere', optiuni: Object.keys(MOTOARE).map(k => [k, MOTOARE[k].nume]), implicit: 'motor' }],
    pini: () => [{ id: '1', x: 0, y: 0, eticheta: '+', tip: 'pasiv' }, { id: '2', x: 20, y: 0, eticheta: '−', tip: 'pasiv' }],
    cutie: p => p.model === 'ventilator' ? { x: -20, y: -62, w: 60, h: 64 } : { x: -12, y: -56, w: 44, h: 58 },
    desen(p) {
      let s = `<path d="M0 0 C0 -8 4 -10 6 -14" stroke="#d32f2f" stroke-width="1.3" fill="none"/><path d="M20 0 C20 -8 16 -10 14 -14" stroke="#212121" stroke-width="1.3" fill="none"/>`;
      if (p.model === 'ventilator') {
        s += `<rect x="-18" y="-60" width="56" height="48" rx="3" fill="#1d1f22"/><circle cx="10" cy="-36" r="21" fill="#2a2d33"/>`;
        s += `<g data-r="rotor" transform="rotate(0 10 -36)">`;
        for (let i = 0; i < 7; i++) s += `<path d="M10 -36 C${10 + 18 * Math.cos(i * 0.9)} ${-36 + 18 * Math.sin(i * 0.9)} ${10 + 20 * Math.cos(i * 0.9 + 0.4)} ${-36 + 20 * Math.sin(i * 0.9 + 0.4)} 10 -36" fill="#3b3f46" stroke="#555" stroke-width="0.4" transform="rotate(${i * 51.4} 10 -36)"/>`;
        s += `<circle cx="10" cy="-36" r="6" fill="#444"/></g>`;
      } else if (p.model === 'vibratii') {
        s += `<circle cx="10" cy="-30" r="12" fill="#c9ccd1" stroke="#8a9099" stroke-width="0.6"/><g data-r="rotor" transform="rotate(0 10 -30)"><path d="M10 -30 h8 a8 8 0 0 1 -8 8z" fill="#8a9099"/></g>`;
      } else if (p.model === 'pompa') {
        s += `<rect x="-6" y="-54" width="32" height="40" rx="6" fill="#1d1f22"/><rect x="18" y="-48" width="12" height="6" fill="#444"/><rect x="-2" y="-58" width="8" height="6" fill="#444"/>`;
        s += `<g data-r="rotor" transform="rotate(0 10 -34)"><path d="M4 -34 h12 M10 -40 v12" stroke="#7fd6ff" stroke-width="1.4"/></g>`;
      } else {
        s += `<rect x="-8" y="-50" width="36" height="34" rx="6" fill="#c9ccd1" stroke="#8a9099" stroke-width="0.7"/><rect x="-8" y="-24" width="36" height="8" rx="2" fill="#d6b25a"/>`;
        s += `<g data-r="rotor" transform="rotate(0 10 -54)"><rect x="9" y="-58" width="2" height="8" fill="#555"/><circle cx="10" cy="-54" r="5" fill="none" stroke="#f4b400" stroke-width="1.5" stroke-dasharray="4 3"/></g>`;
      }
      return s;
    },
    electric(ctx, inst) { const m = MOTOARE[inst.prop.model] || MOTOARE.motor; return { r: ctx.R('1', '2', m.r) }; },
    dispozitiv(inst, sim, el) {
      const m = MOTOARE[inst.prop.model] || MOTOARE.motor;
      return {
        familie: 'motor', viteza: 0, unghi: 0, ultim: 0,
        cadru(t) {
          const dt = Math.min(0.2, Math.max(0, (t - this.ultim) / 1e6)); this.ultim = t;
          const i = el.r.iMed !== undefined ? el.r.iMed : el.r.i || 0;
          const v = i * el.r.r;
          const tinta = Math.max(-1.3, Math.min(1.3, v / m.vnom));
          this.viteza += (tinta - this.viteza) * Math.min(1, dt / 0.25);
          if (Math.abs(this.viteza) < 0.02 && Math.abs(tinta) < 0.1) this.viteza = 0;
          this.unghi = (this.unghi + this.viteza * 2400 * dt) % 360;
          // forța contra-electromotoare: un motor care se învârte trage mai puțin curent
          const r = m.r / Math.max(0.15, 1 - 0.8 * Math.min(1, Math.abs(this.viteza)));
          if (Math.abs(r - el.r.r) / el.r.r > 0.05) { el.r.r = r; sim.murdarComponenta(inst); }
          for (const n of [sim.netPin(inst, '1'), sim.netPin(inst, '2')]) {
            if (sim.gpioLaNet(n).length && Math.abs(i) > 0.03) sim.problema('motor-gpio-' + inst.id, 'eroare', inst.eticheta + ' e legat direct la un pin al plăcii și cere ' + fv(Math.abs(i), 'A') + ' (un pin dă maximum 40 mA). Folosește un tranzistor, un MOSFET sau un driver de motor.', { comp: inst.id });
          }
        }
      };
    },
    vizual(g, inst, sim, el, disp) {
      const r = g.querySelector('[data-r="rotor"]');
      if (r && disp) { const t = r.getAttribute('transform'); r.setAttribute('transform', t.replace(/rotate\([^ ]+/, 'rotate(' + disp.unghi.toFixed(1))); }
    },
    masura(el, inst, sim, disp) { const i = el.r.iMed !== undefined ? el.r.iMed : el.r.i || 0; return [['Curent', fv(Math.abs(i), 'A')], ['Tensiune', fv(i * el.r.r, 'V')], ['Turație', disp ? Math.round(Math.abs(disp.viteza) * 100) + ' %' : '0 %']]; }
  });

  // ---------- L298N ----------
  M.componente.defineste({
    tip: 'l298n', nume: 'Driver de motoare L298N', categorie: 'motoare', eticheta: 'DRV',
    cauta: 'l298n driver motor punte h doua motoare dc pwm robot',
    descriere: 'Punte H dublă: comandă două motoare DC în ambele sensuri. IN1/IN2 aleg sensul motorului A, ENA (scoate jumperul) primește PWM pentru viteză. Cade ~2 V pe punte, deci motoarele primesc mai puțin decât sursa de pe 12V. Cu jumperul 5V pus, pinul 5V dă 5 V (dacă sursa are sub 12 V).',
    prop: [
      { cheie: 'jumperA', eticheta: 'Jumper pe ENA', tip: 'alegere', optiuni: [['da', 'Pus (motorul A mereu activ)'], ['nu', 'Scos (ENA la un pin, pentru viteză)']], implicit: 'da' },
      { cheie: 'jumperB', eticheta: 'Jumper pe ENB', tip: 'alegere', optiuni: [['da', 'Pus (motorul B mereu activ)'], ['nu', 'Scos (ENB la un pin, pentru viteză)']], implicit: 'da' }
    ],
    pini: () => [
      { id: 'ENA', x: 0, y: 0, eticheta: 'ENA', tip: 'intrare' }, { id: 'IN1', x: 10, y: 0, eticheta: 'IN1', tip: 'intrare' }, { id: 'IN2', x: 20, y: 0, eticheta: 'IN2', tip: 'intrare' }, { id: 'IN3', x: 30, y: 0, eticheta: 'IN3', tip: 'intrare' }, { id: 'IN4', x: 40, y: 0, eticheta: 'IN4', tip: 'intrare' }, { id: 'ENB', x: 50, y: 0, eticheta: 'ENB', tip: 'intrare' },
      { id: 'VS', x: 60, y: 0, eticheta: '12V', tip: 'vcc', descriere: 'Alimentarea motoarelor (5–35 V)' }, { id: 'GND', x: 70, y: 0, eticheta: 'GND', tip: 'gnd' }, { id: 'V5', x: 80, y: 0, eticheta: '5V', tip: 'vcc', descriere: '5 V de la regulatorul de pe placă (cu jumperul pus)' },
      { id: 'OUT1', x: -20, y: -30, eticheta: 'OUT1', tip: 'iesire' }, { id: 'OUT2', x: -20, y: -50, eticheta: 'OUT2', tip: 'iesire' }, { id: 'OUT3', x: 100, y: -50, eticheta: 'OUT3', tip: 'iesire' }, { id: 'OUT4', x: 100, y: -30, eticheta: 'OUT4', tip: 'iesire' }],
    cutie: () => ({ x: -26, y: -94, w: 132, h: 97 }),
    desen(p) {
      let s = D.pcb(-24, -92, 128, 86, { culoare: '#b3262a', gauri: 4 });
      s += `<rect x="20" y="-90" width="40" height="30" rx="1" fill="#1d1f22"/>`;
      for (let i = 0; i < 9; i++) s += `<rect x="${21 + i * 4.3}" y="-90" width="3" height="28" fill="#2a2d33"/>`;
      s += D.cip(24, -58, 32, 12, { eticheta: 'L298N', m: 3 });
      s += `<rect x="-26" y="-56" width="12" height="32" rx="1" fill="#2f7fd8"/><rect x="94" y="-56" width="12" height="32" rx="1" fill="#2f7fd8"/><rect x="56" y="-20" width="30" height="12" rx="1" fill="#2f7fd8"/>`;
      if (p.jumperA === 'da') s += `<rect x="-3" y="-6" width="6" height="4" fill="#1d1f22"/>`;
      if (p.jumperB === 'da') s += `<rect x="47" y="-6" width="6" height="4" fill="#1d1f22"/>`;
      s += `<circle cx="80" cy="-70" r="1.5" fill="rgba(0,0,0,.4)"/><circle cx="80" cy="-70" r="1.2" fill="#ff3b2f" opacity="0.15" data-r="led"/>`;
      for (const pin of this.pini(p)) {
        if (pin.y === 0) { s += D.pinAntet(pin.x, pin.y); s += D.text(pin.x, 5.5, pin.eticheta, { m: 2.2, c: 'var(--text-2)' }); }
        else { s += D.pad(pin.x, pin.y, { r: 2.4 }); s += D.text(pin.x + (pin.x < 0 ? 9 : -9), pin.y, pin.eticheta, { m: 2.2 }); }
      }
      return s;
    },
    electric(ctx, inst, sim) {
      const r = { consum: ctx.R('VS', 'GND', 1000), pullA: ctx.R('ENA', 'GND', 10000), pullB: ctx.R('ENB', 'GND', 10000) };
      for (const k of ['IN1', 'IN2', 'IN3', 'IN4']) r['p' + k] = ctx.R(k, 'GND', 20000);
      const vs = () => { const v = tensiuneModul(sim, inst, 'VS', 'GND'); return isNaN(v) ? 0 : v; };
      const intrare = (pin) => sim ? nivelDigital(sim, sim.netPin(inst, pin)) : 0;
      const en = (lit) => inst.prop['jumper' + lit] === 'da' ? 1 : intrare('EN' + lit);
      const iesire = (pinOut, pinIn, lit) => ctx.iesire(pinOut, () => {
        const e = en(lit), v = vs();
        if (e <= 0.02 || v < 4) return null; // punte dezactivată: ieșirile în gol
        const sus = Math.max(0, v - 1.8), jos = 1.0;
        const nivel = intrare(pinIn);
        return { v: jos + (sus - jos) * nivel * e, r: 0.4 };
      });
      r.o1 = iesire('OUT1', 'IN1', 'A'); r.o2 = iesire('OUT2', 'IN2', 'A'); r.o3 = iesire('OUT3', 'IN3', 'B'); r.o4 = iesire('OUT4', 'IN4', 'B');
      // regulatorul de 5 V (jumperul 5V pus)
      r.reg = ctx.regulator('VS', 'V5', 'GND', 5, 2, 'regulator 5 V L298N');
      return r;
    },
    dispozitiv(inst, sim) {
      return {
        familie: 'l298n',
        start() {
          const iesiri = ['OUT1', 'OUT2', 'OUT3', 'OUT4'].map(p => sim.netPin(inst, p));
          const reactioneaza = () => { for (const n of iesiri) sim.murdar(n); };
          for (const p of ['IN1', 'IN2', 'IN3', 'IN4', 'ENA', 'ENB']) sim.asculta(sim.netPin(inst, p), reactioneaza);
          const vs = tensiuneModul(sim, inst, 'VS', 'GND');
          if (vs > 0 && vs < 6) sim.problema('l298-vs-' + inst.id, 'info', inst.eticheta + ': cu ' + M.fmtV(vs) + ' pe 12V, după căderea de ~2 V pe punte motoarele primesc doar ~' + M.fmtV(Math.max(0, vs - 2.8)) + '. L298N e potrivit pentru 7–12 V; la tensiuni mici folosește TB6612FNG.', { comp: inst.id });
        }
      };
    },
    vizual(g, inst, sim) { const l = g.querySelector('[data-r="led"]'); if (l) l.setAttribute('opacity', sim && tensiuneModul(sim, inst, 'VS', 'GND') > 4 ? 0.95 : 0.15); }
  });

  // ---------- modul releu ----------
  M.componente.defineste({
    tip: 'releu', nume: 'Modul releu 5 V (1 canal)', categorie: 'motoare', eticheta: 'REL',
    cauta: 'releu relay modul 5v srd-05vdc optocuplor 220v comutare bec',
    descriere: 'Un întrerupător comandat electric: COM se leagă cu NO când releul e acționat și cu NC când e liber. Majoritatea modulelor sunt active pe LOW (IN la GND = pornit) și cer 5 V pe VCC. Atenție: la un modul activ pe LOW alimentat la 5 V, HIGH-ul de 3,3 V al ESP32 poate să nu-l oprească.',
    prop: [{ cheie: 'declansare', eticheta: 'Se acționează cu', tip: 'alegere', optiuni: [['low', 'LOW pe IN (cel mai des)'], ['high', 'HIGH pe IN']], implicit: 'low' }],
    pini: () => [{ id: 'VCC', x: 0, y: 0, eticheta: 'VCC', tip: 'vcc', descriere: '5 V pentru bobină' }, { id: 'GND', x: 10, y: 0, eticheta: 'GND', tip: 'gnd' }, { id: 'IN', x: 20, y: 0, eticheta: 'IN', tip: 'intrare' },
      { id: 'NO', x: 0, y: -70, eticheta: 'NO', tip: 'pasiv', descriere: 'Normal deschis: legat la COM doar când releul e acționat' }, { id: 'COM', x: 10, y: -70, eticheta: 'COM', tip: 'pasiv', descriere: 'Comun' }, { id: 'NC', x: 20, y: -70, eticheta: 'NC', tip: 'pasiv', descriere: 'Normal închis: legat la COM când releul e liber' }],
    cutie: () => ({ x: -8, y: -76, w: 38, h: 79 }),
    desen() {
      let s = D.pcb(-7, -62, 36, 58, { culoare: '#1f5fa8', gauri: 2.5 });
      s += `<rect x="-8" y="-76" width="36" height="12" rx="1" fill="#2f7fd8"/>`;
      for (const p of this.pini().slice(3)) s += D.pad(p.x, p.y, { r: 2.2 }) + D.text(p.x, p.y + 8.5, p.eticheta, { m: 2 });
      s += `<rect x="-3" y="-56" width="28" height="24" rx="1" fill="#1e5fd0"/>` + D.text(11, -48, 'SRD-05VDC', { m: 2, c: '#e8eefc' }) + D.text(11, -42, '10A 250VAC', { m: 1.8, c: '#e8eefc' });
      s += `<g data-r="contact"><path d="M6 -36 l8 -3" stroke="#f4f4ef" stroke-width="1" data-r="lama"/></g>`;
      s += `<circle cx="22" cy="-26" r="1.5" fill="rgba(0,0,0,.4)"/><circle cx="22" cy="-26" r="1.2" fill="#ff3b2f" opacity="0.15" data-r="led"/>`;
      s += `<rect x="-2" y="-28" width="10" height="7" rx="1" fill="#1d1f22"/>` + D.text(3, -24.5, '817', { m: 1.6, c: '#999' });
      s += antete(this.pini().slice(0, 3));
      return s;
    },
    electric(ctx, inst) {
      const x = ctx.nodNou();
      const opto = { is: 2e-16, n: 1.5, rs: 2 };
      const r = { bobina: ctx.R('VCC', 'GND', 1e6), no: ctx.S('COM', 'NO', false, 0.03), nc: ctx.S('COM', 'NC', true, 0.03) };
      if (inst.prop.declansare === 'high') { r.led = ctx.D('IN', x, opto); r.rin = ctx.R(x, 'GND', 1000); }
      else { r.led = ctx.D('VCC', x, opto); r.rin = ctx.R(x, 'IN', 1000); }
      return r;
    },
    dispozitiv(inst, sim, el) {
      return {
        familie: 'releu', actionat: false, dorit: false, id: 0,
        start() { sim.asculta(sim.netPin(inst, 'IN'), () => this.evalueaza()); this.evalueaza(); },
        evalueaza() {
          sim.circuit.tensiune(sim.netPin(inst, 'IN'));
          const i = Math.max(0, el.led.i || 0);
          const v = tensiuneModul(sim, inst);
          const vrea = i > 0.00035 && v > 3.6;
          if (v > 0.5 && v < 4.2 && i > 0.00035) sim.problema('releu-v-' + inst.id, 'avertisment', inst.eticheta + ': bobina releului e de 5 V; cu ' + M.fmtV(v) + ' pe VCC nu se închide sigur. Alimentează VCC din VIN (5 V).', { comp: inst.id });
          if (vrea === this.dorit) return;
          this.dorit = vrea;
          const id = ++this.id;
          // contactele se mută după ~8 ms (timpul mecanic al releului)
          sim.programeaza(8000, () => {
            if (id !== this.id) return;
            this.actionat = vrea;
            el.no.inchis = vrea; el.nc.inchis = !vrea;
            el.bobina.r = vrea ? 70 : 1e6;
            sim.murdarComponenta(inst);
            if (vrea && inst.prop.declansare !== 'high') {
              const vin = sim.tensiunePin(inst, 'IN');
              if (vin > 2.5) sim.problema('releu-3v3-' + inst.id, 'avertisment', inst.eticheta + ' rămâne acționat deși IN e pe HIGH (' + M.fmtV(vin) + '): modulul e activ pe LOW și alimentat la ' + M.fmtV(v) + ', iar 3,3 V nu stinge complet optocuplorul. Folosește un modul de releu cu declanșare pe HIGH (sau de 3,3 V), ori comandă-l printr-un tranzistor NPN.', { comp: inst.id });
            }
          });
        },
        cadru() { this.evalueaza(); }
      };
    },
    vizual(g, inst, sim, el, disp) {
      const l = g.querySelector('[data-r="led"]'); if (l) l.setAttribute('opacity', disp && disp.actionat ? 0.95 : 0.15);
      const c = g.querySelector('[data-r="lama"]'); if (c) c.setAttribute('d', disp && disp.actionat ? 'M6 -36 l8 3' : 'M6 -36 l8 -3');
    },
    masura(el, inst, sim, disp) { return [['Stare', disp && disp.actionat ? 'acționat (COM–NO)' : 'liber (COM–NC)'], ['Curent optocuplor', fv(Math.max(0, el.led.i || 0), 'A')]]; }
  });
})(window.M = window.M || {});
