/* Meșter — diode și tranzistoare: diode redresoare, de semnal, Schottky și Zener, tranzistoare NPN/PNP,
   Darlington TIP120, MOSFET-uri (IRLZ44N logic-level și IRF520, care la 3,3 V abia se deschide),
   modulul MOSFET IRF520 și optocuplorul PC817. */
(function (M) {
  'use strict';
  const D = M.desen;
  const fv = D.formatValoare;

  // ---------- diode ----------
  const DIODE = {
    '1n4007': { nume: '1N4007 (redresoare, 1 A)', corp: '#1d1f22', inel: '#c9ccd1', text: '4007' },
    '1n4148': { nume: '1N4148 (semnal)', corp: '#c75a2a', inel: '#1d1f22', text: '', sticla: true },
    '1n5819': { nume: '1N5819 (Schottky, 0,3 V)', corp: '#1d1f22', inel: '#c9ccd1', text: '5819' },
    'zener5v1': { nume: 'Zener 5,1 V', corp: '#c75a2a', inel: '#1d1f22', text: '5V1', sticla: true },
    'zener3v3': { nume: 'Zener 3,3 V', corp: '#c75a2a', inel: '#1d1f22', text: '3V3', sticla: true }
  };
  M.componente.defineste({
    tip: 'dioda', nume: 'Diodă', categorie: 'semiconductoare', eticheta: 'D',
    cauta: 'dioda 1n4007 1n4148 schottky 1n5819 zener redresare protectie flyback',
    descriere: 'Lasă curentul să treacă într-un singur sens: de la anod la catod (partea cu dunga). 1N4007 pentru protecție și redresare (cade ~0,7 V), 1N4148 pentru semnale, 1N5819 Schottky cade doar ~0,3 V. Zener-ul, montat invers, ține tensiunea fixă. Pune o diodă în paralel cu motoarele și releele (catodul spre +).',
    prop: [{ cheie: 'model', eticheta: 'Model', tip: 'alegere', optiuni: Object.keys(DIODE).map(k => [k, DIODE[k].nume]), implicit: '1n4007' }, { cheie: 'pas', eticheta: 'Distanța dintre picioare', tip: 'alegere', optiuni: [['3', '3 găuri'], ['4', '4 găuri'], ['5', '5 găuri']], implicit: '4' }],
    pini: p => { const n = (+p.pas || 4) * 10; return [{ id: 'A', x: 0, y: 0, eticheta: 'A', tip: 'pasiv', descriere: 'Anod (+)' }, { id: 'K', x: n, y: 0, eticheta: 'K', tip: 'pasiv', descriere: 'Catod (−) — partea cu dunga' }]; },
    cutie: p => ({ x: -2, y: -5, w: (+p.pas || 4) * 10 + 4, h: 10 }),
    desen(p) {
      const m = DIODE[p.model] || DIODE['1n4007'];
      const n = (+p.pas || 4) * 10, c = n / 2;
      let s = D.picior(0, 0, c - 7, 0) + D.picior(c + 7, 0, n, 0);
      s += `<rect x="${c - 7}" y="-2.6" width="14" height="5.2" rx="1.4" fill="${m.corp}" ${m.sticla ? 'opacity="0.85"' : ''}/>`;
      s += `<rect x="${c + 3.2}" y="-2.6" width="2" height="5.2" fill="${m.inel}"/>`;
      if (m.text) s += D.text(c - 1.5, 0, m.text, { m: 1.8, c: '#9aa0a8' });
      return s;
    },
    electric(ctx, inst) { return { d: ctx.D('A', 'K', inst.prop.model || '1n4007') }; },
    dispozitiv(inst, sim, el) {
      return {
        cadru() {
          if (!el.d) return;
          const i = Math.abs(el.d.iMed !== undefined ? el.d.iMed : el.d.i);
          const max = /zener|4148/.test(inst.prop.model) ? 0.2 : 1.2;
          if (i > max) sim.problema('dioda-' + inst.id, 'eroare', inst.eticheta + ': prin diodă trec ' + fv(i, 'A') + ' — peste maximul de ' + fv(max, 'A') + '. În realitate se arde.', { comp: inst.id });
        }
      };
    },
    masura(el) { return el.d ? [['Curent', fv(el.d.iMed !== undefined ? el.d.iMed : el.d.i, 'A')], ['Tensiune', fv(el.d.v || 0, 'V')]] : []; },
    etichetaValoare: p => (DIODE[p.model] || DIODE['1n4007']).nume.split(' ')[0]
  });

  // ---------- tranzistoare bipolare ----------
  const BJT = {
    bc547: { nume: 'BC547 (NPN, 100 mA)', pnp: false, beta: 300, imax: 0.1, ordine: ['C', 'B', 'E'], text: 'BC547' },
    '2n2222': { nume: '2N2222 (NPN, 600 mA)', pnp: false, beta: 150, imax: 0.6, ordine: ['E', 'B', 'C'], text: '2N2222' },
    bc557: { nume: 'BC557 (PNP, 100 mA)', pnp: true, beta: 250, imax: 0.1, ordine: ['C', 'B', 'E'], text: 'BC557' },
    '2n2907': { nume: '2N2907 (PNP, 600 mA)', pnp: true, beta: 150, imax: 0.6, ordine: ['E', 'B', 'C'], text: '2N2907' },
    tip120: { nume: 'TIP120 (Darlington NPN, 5 A)', pnp: false, beta: 1000, imax: 5, ordine: ['B', 'C', 'E'], text: 'TIP120', darlington: true }
  };
  const NUME_PIN = { B: 'Bază', C: 'Colector', E: 'Emitor', G: 'Grilă (gate)', D: 'Drenă (drain)', S: 'Sursă (source)' };
  M.componente.defineste({
    tip: 'tranzistor', nume: 'Tranzistor bipolar', categorie: 'semiconductoare', eticheta: 'Q',
    cauta: 'tranzistor npn pnp bc547 2n2222 bc557 tip120 darlington comutare',
    descriere: 'Un curent mic în bază comandă un curent mare între colector și emitor. Folosește-l ca întrerupător: emitorul (NPN) la GND, sarcina între + și colector, iar baza la pin printr-un rezistor de 1 kΩ. Ordinea picioarelor diferă de la un model la altul!',
    prop: [{ cheie: 'model', eticheta: 'Model', tip: 'alegere', optiuni: Object.keys(BJT).map(k => [k, BJT[k].nume]), implicit: 'bc547' }],
    pini: p => (BJT[p.model] || BJT.bc547).ordine.map((id, i) => ({ id, x: i * 10, y: 0, eticheta: id, tip: 'pasiv', descriere: NUME_PIN[id] })),
    cutie: p => p.model === 'tip120' ? { x: -6, y: -40, w: 32, h: 42 } : { x: -3, y: -22, w: 26, h: 24 },
    desen(p) {
      const m = BJT[p.model] || BJT.bc547;
      let s = '';
      if (m.darlington) {
        s += D.picior(0, 0, 0, -10) + D.picior(10, 0, 10, -10) + D.picior(20, 0, 20, -10);
        s += `<rect x="-5" y="-38" width="30" height="12" rx="1" fill="#c9ccd1" stroke="#8a9099" stroke-width="0.5"/><circle cx="10" cy="-32" r="3" fill="#6c727a"/>`;
        s += `<rect x="-5" y="-27" width="30" height="17" rx="1" fill="#1d1f22"/>` + D.text(10, -18, m.text, { m: 2.8, c: '#aaa' });
      } else {
        for (let i = 0; i < 3; i++) s += D.picior(i * 10, 0, 7 + i * 3, -9);
        s += `<path d="M1 -9 h18 v-6 a9 9 0 0 0 -18 0z" fill="#222"/>` + D.text(10, -13, m.text, { m: 2, c: '#aaa' });
      }
      (m.ordine).forEach((id, i) => { s += D.text(i * 10, 4.5, id, { m: 2.6, c: 'var(--text-2)' }); });
      return s;
    },
    electric(ctx, inst) {
      const m = BJT[inst.prop.model] || BJT.bc547;
      if (m.darlington) {
        // două tranzistoare în cascadă + rezistoarele interne
        const x = ctx.nodNou();
        const q1 = ctx.Q('C', 'B', x, false, 30);
        const q2 = ctx.Q('C', x, 'E', false, 40);
        ctx.R('B', x, 8000); ctx.R(x, 'E', 120);
        return { q: q2, q1 };
      }
      return { q: ctx.Q('C', 'B', 'E', m.pnp, m.beta) };
    },
    dispozitiv(inst, sim, el) {
      const m = BJT[inst.prop.model] || BJT.bc547;
      return {
        cadru() {
          const q = el.q; if (!q) return;
          const ic = Math.abs(q.ic !== undefined ? q.ic : q.i || 0);
          if (ic > m.imax * 1.2) sim.problema('bjt-' + inst.id, 'eroare', inst.eticheta + ' (' + m.text + '): curentul de colector e ' + fv(ic, 'A') + ', peste maximul de ' + fv(m.imax, 'A') + '. Folosește un tranzistor mai mare sau un MOSFET.', { comp: inst.id });
        }
      };
    },
    masura(el) { const q = el.q; if (!q) return []; return [['Ic', fv(Math.abs(q.ic || 0), 'A')], ['Ib', fv(Math.abs(q.ib || 0), 'A')], ['Vce', fv(Math.abs(q.vce || 0), 'V')]]; },
    etichetaValoare: p => (BJT[p.model] || BJT.bc547).text
  });

  // ---------- MOSFET ----------
  const MOSFETURI = {
    irlz44n: { nume: 'IRLZ44N (canal N, logic-level)', pcanal: false, vth: 1.5, kp: 25, text: 'IRLZ44N', imax: 30 },
    irf520: { nume: 'IRF520 (canal N, are nevoie de 10 V pe grilă)', pcanal: false, vth: 3.4, kp: 3, text: 'IRF520', imax: 9 },
    '2n7000': { nume: '2N7000 (canal N mic, 200 mA)', pcanal: false, vth: 2.1, kp: 0.3, text: '2N7000', imax: 0.2, to92: true },
    irf9540: { nume: 'IRF9540 (canal P)', pcanal: true, vth: 3, kp: 5, text: 'IRF9540', imax: 19 }
  };
  M.componente.defineste({
    tip: 'mosfet', nume: 'Tranzistor MOSFET', categorie: 'semiconductoare', eticheta: 'Q',
    cauta: 'mosfet irlz44n irf520 2n7000 irf9540 canal n p comutare motor banda led',
    descriere: 'Comandat prin tensiune: grila (G) nu consumă curent. Pentru ESP32 alege un MOSFET „logic-level” (IRLZ44N): IRF520 are nevoie de ~10 V pe grilă și la 3,3 V abia conduce. Pune un rezistor de 10 kΩ între grilă și sursă, ca să nu rămână „în aer”.',
    prop: [{ cheie: 'model', eticheta: 'Model', tip: 'alegere', optiuni: Object.keys(MOSFETURI).map(k => [k, MOSFETURI[k].nume]), implicit: 'irlz44n' }],
    pini: p => ((MOSFETURI[p.model] || MOSFETURI.irlz44n).to92 ? ['S', 'G', 'D'] : ['G', 'D', 'S']).map((id, i) => ({ id, x: i * 10, y: 0, eticheta: id, tip: 'pasiv', descriere: NUME_PIN[id] })),
    cutie: p => (MOSFETURI[p.model] || MOSFETURI.irlz44n).to92 ? { x: -3, y: -22, w: 26, h: 24 } : { x: -6, y: -40, w: 32, h: 42 },
    desen(p) {
      const m = MOSFETURI[p.model] || MOSFETURI.irlz44n;
      let s = '';
      if (m.to92) {
        for (let i = 0; i < 3; i++) s += D.picior(i * 10, 0, 7 + i * 3, -9);
        s += `<path d="M1 -9 h18 v-6 a9 9 0 0 0 -18 0z" fill="#222"/>` + D.text(10, -13, m.text, { m: 2, c: '#aaa' });
      } else {
        s += D.picior(0, 0, 0, -10) + D.picior(10, 0, 10, -10) + D.picior(20, 0, 20, -10);
        s += `<rect x="-5" y="-38" width="30" height="12" rx="1" fill="#c9ccd1" stroke="#8a9099" stroke-width="0.5"/><circle cx="10" cy="-32" r="3" fill="#6c727a"/>`;
        s += `<rect x="-5" y="-27" width="30" height="17" rx="1" fill="#1d1f22"/>` + D.text(10, -18, m.text, { m: 2.4, c: '#aaa' });
      }
      for (const pin of this.pini(p)) s += D.text(pin.x, 4.5, pin.id, { m: 2.6, c: 'var(--text-2)' });
      return s;
    },
    electric(ctx, inst) { const m = MOSFETURI[inst.prop.model] || MOSFETURI.irlz44n; return { q: ctx.MOS('D', 'G', 'S', m.pcanal, m.vth, m.kp) }; },
    dispozitiv(inst, sim, el) {
      const m = MOSFETURI[inst.prop.model] || MOSFETURI.irlz44n;
      return {
        cadru() {
          const q = el.q; if (!q) return;
          const id = Math.abs(q.id || 0);
          if (id > m.imax) sim.problema('mos-' + inst.id, 'eroare', inst.eticheta + ': ' + fv(id, 'A') + ' prin MOSFET, peste maximul de ' + fv(m.imax, 'A') + '.', { comp: inst.id });
          const vg = sim.tensiunePin(inst, 'G'), vs = sim.tensiunePin(inst, 'S');
          if (!m.pcanal && m.vth > 3 && vg - vs > 2.5 && vg - vs < 5 && id > 0.02) sim.problema('mos-vg-' + inst.id, 'avertisment', inst.eticheta + ' (' + m.text + ') primește doar ' + M.fmtV(vg - vs) + ' pe grilă și conduce prost (se încălzește). Folosește un MOSFET logic-level ca IRLZ44N.', { comp: inst.id });
          if (sim.flotant(sim.netPin(inst, 'G'))) sim.problema('mos-flotant-' + inst.id, 'avertisment', inst.eticheta + ': grila MOSFET-ului e „în aer” — se poate deschide singură. Pune 10 kΩ între G și S.', { comp: inst.id });
        }
      };
    },
    masura(el) { const q = el.q; return q ? [['Id', fv(Math.abs(q.id || 0), 'A')], ['Vgs', fv(q.vgsV || 0, 'V')]] : []; },
    etichetaValoare: p => (MOSFETURI[p.model] || MOSFETURI.irlz44n).text
  });

  // ---------- modul MOSFET IRF520 ----------
  M.componente.defineste({
    tip: 'modul-mosfet', nume: 'Modul MOSFET (IRF520)', categorie: 'semiconductoare', eticheta: 'MOS',
    cauta: 'modul mosfet irf520 driver motor banda led pwm sarcina',
    descriere: 'Modul gata făcut pentru a porni o sarcină (motor, bandă LED) de la un pin: SIG la pin, V+/V− la sursa sarcinii, iar sarcina la bornele de ieșire. Atenție: are IRF520, care la 3,3 V de la ESP32 abia se deschide — sarcina primește puțin curent.',
    prop: [],
    pini: () => [
      { id: 'SIG', x: 0, y: 0, eticheta: 'SIG', tip: 'intrare' }, { id: 'VCC', x: 10, y: 0, eticheta: 'VCC', tip: 'nc', descriere: 'Neconectat intern (doar pentru LED)' }, { id: 'GND', x: 20, y: 0, eticheta: 'GND', tip: 'gnd' },
      { id: 'VIN', x: 0, y: -60, eticheta: 'VIN', tip: 'pasiv', descriere: 'Sursa sarcinii (+)' }, { id: 'GNDIN', x: 10, y: -60, eticheta: 'GND', tip: 'pasiv', descriere: 'Sursa sarcinii (−)' },
      { id: 'V+', x: 30, y: -60, eticheta: 'V+', tip: 'pasiv', descriere: 'Ieșire +: legată direct la VIN' }, { id: 'V-', x: 40, y: -60, eticheta: 'V−', tip: 'pasiv', descriere: 'Ieșire −: trecută prin MOSFET spre GND' }],
    interne: () => [['VIN', 'V+'], ['GNDIN', 'GND']],
    cutie: () => ({ x: -6, y: -66, w: 54, h: 69 }),
    desen() {
      let s = D.pcb(-5, -52, 50, 48, { culoare: '#1c1f24', gauri: 3 });
      s += `<rect x="-5" y="-66" width="20" height="12" rx="1" fill="#2f7fd8"/><rect x="25" y="-66" width="20" height="12" rx="1" fill="#2f7fd8"/>`;
      for (const p of this.pini().slice(3)) s += D.pad(p.x, p.y, { r: 2.2 });
      s += `<rect x="12" y="-44" width="18" height="10" rx="1" fill="#c9ccd1"/><rect x="12" y="-36" width="18" height="14" fill="#1d1f22"/>` + D.text(21, -28, 'IRF520', { m: 2, c: '#aaa' });
      s += `<circle cx="36" cy="-14" r="1.5" fill="rgba(0,0,0,.4)"/><circle cx="36" cy="-14" r="1.2" fill="#ff3b2f" opacity="0.15" data-r="led"/>`;
      for (const p of this.pini().slice(0, 3)) { s += D.pinAntet(p.x, p.y); s += D.text(p.x, p.y + 5.5, p.eticheta, { m: 2.4, c: 'var(--text-2)' }); }
      return s;
    },
    electric(ctx) {
      return { q: ctx.MOS('V-', 'SIG', 'GND', false, 3.4, 3), rg: ctx.R('SIG', 'GND', 10000), led: ctx.D('SIG', 'GND', { is: 0.02 / (Math.exp(2.0 / (2 * M.circuit.VT)) - 1), n: 2, rs: 1000, led: true }) };
    },
    dispozitiv(inst, sim, el) {
      return {
        cadru() {
          const vg = sim.tensiunePin(inst, 'SIG');
          const id = Math.abs(el.q.id || 0);
          if (vg > 2.5 && vg < 4.5 && id > 0.05) sim.problema('mosmod-' + inst.id, 'avertisment', inst.eticheta + ': cu ' + M.fmtV(vg) + ' pe SIG, IRF520 conduce doar parțial (' + fv(id, 'A') + '). Pentru ESP32 folosește un MOSFET logic-level (IRLZ44N) sau un modul cu driver.', { comp: inst.id });
        }
      };
    },
    vizual(g, inst, sim, el) { const l = g.querySelector('[data-r="led"]'); if (l) l.setAttribute('opacity', el && el.led && (el.led.iMed || el.led.i) > 0.0003 ? 0.95 : 0.15); },
    masura(el) { return [['Curent sarcină', fv(Math.abs(el.q.id || 0), 'A')]]; }
  });

  // ---------- optocuplor PC817 ----------
  M.componente.defineste({
    tip: 'pc817', nume: 'Optocuplor PC817', categorie: 'semiconductoare', eticheta: 'U',
    cauta: 'optocuplor pc817 izolare optocoupler',
    descriere: 'Un LED infraroșu și un fototranzistor în aceeași capsulă, izolați electric. Curentul prin LED (pinii 1–2, cu rezistor) face tranzistorul (4–3) să conducă. Separă circuitele cu mase diferite.',
    prop: [],
    pini: () => [{ id: 'A', x: 0, y: 0, eticheta: '1', tip: 'pasiv', descriere: 'Anodul LED-ului' }, { id: 'K', x: 10, y: 0, eticheta: '2', tip: 'pasiv', descriere: 'Catodul LED-ului' },
      { id: 'E', x: 10, y: -30, eticheta: '3', tip: 'pasiv', descriere: 'Emitorul fototranzistorului' }, { id: 'C', x: 0, y: -30, eticheta: '4', tip: 'pasiv', descriere: 'Colectorul fototranzistorului' }],
    cutie: () => ({ x: -4, y: -32, w: 18, h: 34 }),
    desen() {
      let s = `<rect x="-3" y="-26" width="16" height="22" rx="1" fill="#f4f4ef" stroke="#bdbdb4" stroke-width="0.5"/>` + D.text(5, -15, 'PC817', { m: 2, c: '#555', rot: -90 });
      s += `<circle cx="0" cy="-8" r="0.9" fill="#555"/>`;
      s += D.picior(0, 0, 0, -4) + D.picior(10, 0, 10, -4) + D.picior(0, -30, 0, -26) + D.picior(10, -30, 10, -26);
      return s;
    },
    electric(ctx) {
      const led = ctx.D('A', 'K', 'ir');
      // fototranzistorul: o rezistență C–E comandată de curentul LED-ului (CTR ~ 100 %)
      const sw = ctx.R('C', 'E', 1e9);
      return { led, sw };
    },
    dispozitiv(inst, sim, el) {
      return {
        cadru() {
          const i = Math.max(0, el.led.iMed !== undefined ? el.led.iMed : el.led.i);
          const r = i > 1e-5 ? Math.max(30, 0.25 / Math.min(0.05, i * 1.0)) : 1e9;
          if (Math.abs(el.sw.r - r) / r > 0.05) { el.sw.r = r; sim.murdarComponenta(inst); }
        }
      };
    },
    masura(el) { return [['Curent LED', fv(Math.max(0, el.led.i || 0), 'A')]]; }
  });
})(window.M = window.M || {});
