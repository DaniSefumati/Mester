/* Meșter — alimentare: baterii, sursă USB de 5 V, sursă de laborator, modulul de alimentare pentru
   breadboard (MB102), regulatoarele AMS1117 și 7805 și convertorul coborâtor LM2596. */
(function (M) {
  'use strict';
  const D = M.desen;
  const fv = D.formatValoare;

  // ---------- baterii ----------
  const BATERII = {
    '9v': { nume: 'Baterie 9 V', v: 9, r: 1.8, imax: 0.5 },
    '2aa': { nume: '2 × AA (3 V)', v: 3.0, r: 0.3, imax: 2 },
    '3aa': { nume: '3 × AA (4,5 V)', v: 4.5, r: 0.45, imax: 2 },
    '4aa': { nume: '4 × AA (6 V)', v: 6.0, r: 0.6, imax: 2 },
    '18650': { nume: 'Li-ion 18650 (3,7 V)', v: 3.8, r: 0.06, imax: 10 },
    '2x18650': { nume: '2 × Li-ion 18650 (7,4 V)', v: 7.6, r: 0.12, imax: 10 },
    'cr2032': { nume: 'CR2032 (3 V)', v: 3.0, r: 18, imax: 0.02 }
  };
  M.componente.defineste({
    tip: 'baterie', nume: 'Baterie', categorie: 'alimentare', eticheta: 'BAT',
    cauta: 'baterie acumulator 9v aa 18650 li-ion cr2032 pila alimentare',
    descriere: 'Sursă de tensiune cu rezistență internă: sub sarcină tensiunea scade (o baterie de 9 V nu poate da mult curent). Firul roșu e +, cel negru e −.',
    prop: [{ cheie: 'model', eticheta: 'Tip', tip: 'alegere', optiuni: Object.keys(BATERII).map(k => [k, BATERII[k].nume]), implicit: '9v' }],
    pini: () => [{ id: 'PLUS', x: 0, y: 0, eticheta: '+', tip: 'vcc', descriere: 'Plus (firul roșu)' }, { id: 'MINUS', x: 10, y: 0, eticheta: '−', tip: 'gnd', descriere: 'Minus (firul negru)' }],
    cutie: p => p.model === '9v' ? { x: -16, y: -76, w: 42, h: 79 } : p.model === 'cr2032' ? { x: -12, y: -44, w: 34, h: 47 } : { x: -20, y: -74, w: 50, h: 77 },
    desen(p) {
      const m = BATERII[p.model] || BATERII['9v'];
      let s = `<path d="M0 0 C0 -10 -2 -14 -2 -22" stroke="#d32f2f" stroke-width="1.4" fill="none"/><path d="M10 0 C10 -10 12 -14 12 -22" stroke="#212121" stroke-width="1.4" fill="none"/>`;
      if (p.model === '9v') {
        s += `<rect x="-14" y="-74" width="38" height="52" rx="3" fill="#2a2d33"/><rect x="-14" y="-60" width="38" height="24" fill="#e0b52a"/>` + D.text(5, -48, '9V', { m: 7, c: '#1d1f22', g: 700 });
        s += `<rect x="-8" y="-78" width="8" height="5" rx="1" fill="#c9ccd1"/><rect x="10" y="-78" width="8" height="5" rx="1" fill="#c9ccd1"/>`;
      } else if (p.model === 'cr2032') {
        s += `<circle cx="5" cy="-30" r="14" fill="#c9ccd1" stroke="#8a9099" stroke-width="0.8"/>` + D.text(5, -30, 'CR2032', { m: 3, c: '#555' });
      } else {
        const n = p.model === '18650' ? 1 : p.model === '2x18650' ? 2 : +p.model[0];
        const w = 44 / n;
        s += `<rect x="-18" y="-72" width="46" height="50" rx="2" fill="#1d1f22"/>`;
        for (let i = 0; i < n; i++) s += `<rect x="${-17 + i * w}" y="-70" width="${w - 2}" height="46" rx="${w / 3}" fill="${p.model.includes('18650') ? '#2e7d32' : '#c62828'}"/>` + D.text(-17 + i * w + (w - 2) / 2, -47, p.model.includes('18650') ? '3,7V' : '1,5V', { m: 2.4, rot: -90 });
      }
      return s;
    },
    electric(ctx, inst) { const m = BATERII[inst.prop.model] || BATERII['9v']; return { v: ctx.V('PLUS', 'MINUS', m.v, m.r) }; },
    dispozitiv(inst, sim, el) {
      const m = BATERII[inst.prop.model] || BATERII['9v'];
      return {
        cadru() {
          const i = Math.abs(el.v.iMed !== undefined ? el.v.iMed : el.v.i || 0);
          if (i > m.imax) sim.problema('baterie-' + inst.id, 'avertisment', inst.eticheta + ' (' + m.nume + ') dă ' + fv(i, 'A') + ' — prea mult pentru ea; tensiunea scade și bateria se descarcă repede.', { comp: inst.id });
        }
      };
    },
    masura(el, inst, sim) { const i = Math.abs(el.v.i || 0); const m = BATERII[inst.prop.model] || BATERII['9v']; return [['Tensiune la borne', fv(m.v - i * m.r, 'V')], ['Curent', fv(i, 'A')]]; }
  });

  // ---------- sursă USB 5 V ----------
  M.componente.defineste({
    tip: 'usb-5v', nume: 'Sursă USB 5 V (încărcător / powerbank)', categorie: 'alimentare', eticheta: 'USB',
    cauta: 'usb 5v incarcator powerbank alimentare adaptor',
    descriere: 'Un încărcător de telefon sau un powerbank cu un cablu USB tăiat: firul roșu dă 5 V, cel negru e GND. Poate da cam 1–2 A.',
    prop: [{ cheie: 'curent', eticheta: 'Curent maxim', tip: 'alegere', optiuni: [['1', '1 A'], ['2', '2 A'], ['3', '3 A']], implicit: '2' }],
    pini: () => [{ id: 'VBUS', x: 0, y: 0, eticheta: '+5V', tip: 'vcc' }, { id: 'GND', x: 10, y: 0, eticheta: 'GND', tip: 'gnd' }],
    cutie: () => ({ x: -14, y: -62, w: 38, h: 65 }),
    desen() {
      let s = `<path d="M0 0 C0 -12 3 -16 3 -24" stroke="#d32f2f" stroke-width="1.4" fill="none"/><path d="M10 0 C10 -12 7 -16 7 -24" stroke="#212121" stroke-width="1.4" fill="none"/>`;
      s += `<rect x="-2" y="-30" width="14" height="8" rx="2" fill="#2a2d33"/><rect x="-12" y="-60" width="34" height="31" rx="4" fill="#f4f4ef" stroke="#bdbdb4" stroke-width="0.6"/>` + D.text(5, -44, '5V ⎓', { m: 4.2, c: '#333' });
      return s;
    },
    electric(ctx) { return { v: ctx.V('VBUS', 'GND', 5.05, 0.15) }; },
    dispozitiv(inst, sim, el) {
      return { cadru() { const i = Math.abs(el.v.iMed !== undefined ? el.v.iMed : el.v.i || 0); if (i > +inst.prop.curent) sim.problema('usb-' + inst.id, 'avertisment', inst.eticheta + ': se cer ' + fv(i, 'A') + ', dar sursa dă doar ' + inst.prop.curent + ' A. Tensiunea scade și placa se poate reseta.', { comp: inst.id }); } };
    },
    masura(el) { return [['Curent', fv(Math.abs(el.v.i || 0), 'A')]]; }
  });

  // ---------- sursă de laborator ----------
  M.componente.defineste({
    tip: 'sursa-laborator', nume: 'Sursă de laborator reglabilă', categorie: 'alimentare', eticheta: 'PSU',
    cauta: 'sursa laborator reglabila tensiune curent bench power supply',
    descriere: 'Sursă cu tensiune reglabilă (0–30 V) și limită de curent. Când sarcina cere mai mult decât limita, sursa trece în modul de curent constant și coboară tensiunea.',
    prop: [{ cheie: 'tensiune', eticheta: 'Tensiune', tip: 'numar', unitate: 'V', implicit: 12, min: 0, max: 30 }, { cheie: 'limita', eticheta: 'Limită de curent', tip: 'numar', unitate: 'A', implicit: 1, min: 0.01, max: 5 }],
    pini: () => [{ id: 'PLUS', x: 0, y: 0, eticheta: '+', tip: 'vcc' }, { id: 'MINUS', x: 20, y: 0, eticheta: '−', tip: 'gnd' }],
    cutie: () => ({ x: -22, y: -64, w: 64, h: 67 }),
    desen(p) {
      let s = `<rect x="-20" y="-62" width="60" height="54" rx="3" fill="#2a2d33" stroke="#15171a" stroke-width="0.6"/>`;
      s += `<rect x="-14" y="-56" width="48" height="16" rx="1" fill="#0d1a0f"/>` + D.text(10, -48, (+p.tensiune || 0).toFixed(1).replace('.', ',') + ' V', { m: 6, c: '#5dff7a', f: 'var(--font-mono)' });
      s += `<circle cx="-4" cy="-26" r="6" fill="#4a4f57"/><circle cx="24" cy="-26" r="6" fill="#4a4f57"/>`;
      s += D.picior(0, 0, 0, -8, { c: '#d32f2f', g: 2 }) + D.picior(20, 0, 20, -8, { c: '#212121', g: 2 });
      return s;
    },
    electric(ctx, inst) {
      const vset = Math.max(0, +inst.prop.tensiune || 0), lim = Math.max(0.01, +inst.prop.limita || 1);
      const v = ctx.V('PLUS', 'MINUS', () => vset, 0.02);
      v.neliniar = true;
      return { v, vset, lim };
    },
    dispozitiv(inst, sim, el) {
      return {
        cc: false,
        cadru() {
          // curent constant: coborâm tensiunea până curentul intră în limită
          const i = Math.abs(el.v.i || 0);
          if (i > el.lim * 1.02) {
            const rSarcina = Math.max(0.01, (el.v.val() - i * 0.02) / i);
            const nou = Math.max(0, el.lim * rSarcina);
            el.v.val = () => nou; this.cc = true; sim.murdarComponenta(inst);
          } else if (this.cc && i < el.lim * 0.9) { el.v.val = () => el.vset; this.cc = false; sim.murdarComponenta(inst); }
        }
      };
    },
    masura(el, inst, sim) { const d = sim && sim.disp.get(inst.id); return [['Tensiune', fv(el.v.val(), 'V')], ['Curent', fv(Math.abs(el.v.i || 0), 'A')], ['Mod', d && d.cc ? 'curent constant' : 'tensiune constantă']]; }
  });

  // ---------- modul de alimentare pentru breadboard (MB102) ----------
  M.componente.defineste({
    tip: 'mb102', nume: 'Modul de alimentare pentru breadboard (MB102)', categorie: 'alimentare', eticheta: 'PWR',
    cauta: 'mb102 modul alimentare breadboard 3.3v 5v jack sursa sine',
    descriere: 'Se înfige la capătul breadboard-ului, cu pinii în șinele + și −. Primește 6,5–12 V prin mufă (sau 5 V prin USB) și dă 5 V sau 3,3 V pe fiecare pereche de șine, după jumper. Butonul alb îl pornește.',
    prop: [
      { cheie: 'sus', eticheta: 'Șinele de sus', tip: 'alegere', optiuni: [['5', '5 V'], ['3.3', '3,3 V'], ['0', 'Oprit (jumper scos)']], implicit: '5' },
      { cheie: 'jos', eticheta: 'Șinele de jos', tip: 'alegere', optiuni: [['5', '5 V'], ['3.3', '3,3 V'], ['0', 'Oprit (jumper scos)']], implicit: '3.3' }
    ],
    control: [{ cheie: 'pornit', eticheta: 'Pornit', min: 0, max: 1, pas: 1, implicit: 1 }],
    pini: () => [
      { id: 'SUS_P', x: 0, y: 0, eticheta: '+', tip: 'vcc', descriere: 'Șina + de sus' }, { id: 'SUS_N', x: 0, y: 10, eticheta: '−', tip: 'gnd', descriere: 'Șina − de sus' },
      { id: 'JOS_P', x: 0, y: 180, eticheta: '+', tip: 'vcc', descriere: 'Șina + de jos' }, { id: 'JOS_N', x: 0, y: 190, eticheta: '−', tip: 'gnd', descriere: 'Șina − de jos' }],
    interne: () => [['SUS_N', 'JOS_N']],
    cutie: () => ({ x: -34, y: -8, w: 52, h: 206 }),
    desen(p) {
      let s = D.pcb(-32, -6, 48, 202, { culoare: '#1c7a3f', gauri: 3 });
      s += `<rect x="-30" y="80" width="22" height="26" rx="2" fill="#1d1f22"/><circle cx="-19" cy="93" r="6" fill="#2a2d33"/><circle cx="-19" cy="93" r="2" fill="#aaa"/>`;
      s += `<rect x="-28" y="120" width="16" height="10" rx="1" fill="#c9ccd1"/>`;
      s += `<g data-act="comuta" class="interactiv"><rect x="-4" y="84" width="14" height="14" rx="2" fill="#f1f1ea" stroke="#bbb" stroke-width="0.5"/><circle cx="3" cy="91" r="4" fill="#e0e0d8"/></g>`;
      s += D.cip(-26, 30, 14, 10, { eticheta: '1117', m: 2 }) + D.cip(-26, 150, 14, 10, { eticheta: '1117', m: 2 });
      s += D.text(-8, 22, p.sus === '0' ? 'OFF' : p.sus.replace('.', ',') + 'V', { m: 3.2 }) + D.text(-8, 170, p.jos === '0' ? 'OFF' : p.jos.replace('.', ',') + 'V', { m: 3.2 });
      s += `<circle cx="6" cy="60" r="1.5" fill="rgba(0,0,0,.4)"/><circle cx="6" cy="60" r="1.2" fill="#3cff5a" opacity="0.15" data-r="led"/>`;
      for (const pin of this.pini()) s += D.pinAntet(pin.x, pin.y);
      return s;
    },
    electric(ctx, inst) {
      const pornit = () => !inst.control || inst.control.pornit === undefined || +inst.control.pornit >= 1;
      const vs = () => pornit() ? +inst.prop.sus : 0, vj = () => pornit() ? +inst.prop.jos : 0;
      const sus = ctx.V('SUS_P', 'SUS_N', vs, 0.08), jos = ctx.V('JOS_P', 'JOS_N', vj, 0.08);
      return { sus, jos };
    },
    laControl(inst, el, sim) { sim.murdarComponenta(inst); },
    actiune(inst, act, faza, el, sim) { if (act === 'comuta' && faza === 'jos') { sim.control(inst, 'pornit', inst.control && +inst.control.pornit >= 1 ? 0 : 1); } },
    dispozitiv(inst, sim, el) {
      return { cadru() { const i = Math.abs(el.sus.i || 0) + Math.abs(el.jos.i || 0); if (i > 0.7) sim.problema('mb102-' + inst.id, 'avertisment', inst.eticheta + ': se cer ' + fv(i, 'A') + ' — regulatoarele modulului dau cel mult ~700 mA și se încălzesc.', { comp: inst.id }); } };
    },
    vizual(g, inst) { const l = g.querySelector('[data-r="led"]'); if (l) l.setAttribute('opacity', !inst.control || +inst.control.pornit >= 1 ? 0.95 : 0.15); },
    masura(el) { return [['Curent sus', fv(Math.abs(el.sus.i || 0), 'A')], ['Curent jos', fv(Math.abs(el.jos.i || 0), 'A')]]; }
  });

  // ---------- regulatoare ----------
  function regulator(o) {
    M.componente.defineste({
      tip: o.tip, nume: o.nume, categorie: 'alimentare', eticheta: o.eticheta,
      cauta: o.cauta, descriere: o.descriere, prop: o.prop || [],
      pini: o.pini, cutie: o.cutie, desen: o.desen,
      electric(ctx, inst) {
        const v = o.tensiune(inst.prop);
        const reg = ctx.regulator(o.vin, o.vout, o.gnd, v, o.dropout, o.eticheta);
        const q = ctx.R(o.vin, o.gnd, o.iq || 200000);
        return { reg, q };
      },
      dispozitiv(inst, sim, el) {
        return {
          cadru() {
            const i = Math.abs(el.reg.i || 0);
            const vin = sim.tensiunePin(inst, o.vin), vout = sim.tensiunePin(inst, o.vout);
            if (i > o.imax) sim.problema('reg-' + inst.id, 'avertisment', inst.eticheta + ' dă ' + fv(i, 'A') + ', peste ' + fv(o.imax, 'A') + '. Se supraîncălzește.', { comp: inst.id });
            if (!isNaN(vin) && !isNaN(vout) && o.liniar && (vin - vout) * i > 1.2) sim.problema('reg-caldura-' + inst.id, 'avertisment', inst.eticheta + ' disipă ' + ((vin - vout) * i).toFixed(1).replace('.', ',') + ' W ca căldură (' + fv(vin - vout, 'V') + ' × ' + fv(i, 'A') + '). Fără radiator se oprește din cauza temperaturii.', { comp: inst.id });
            if (!isNaN(vin) && vin > 0.5 && vin < o.tensiune(inst.prop) + o.dropout) sim.problema('reg-drop-' + inst.id, 'info', inst.eticheta + ': la intrare sunt doar ' + fv(vin, 'V') + ', așa că ieșirea nu ajunge la ' + fv(o.tensiune(inst.prop), 'V') + ' (îi trebuie cu ~' + fv(o.dropout, 'V') + ' mai mult).', { comp: inst.id });
          }
        };
      },
      masura(el, inst, sim) { return [['Ieșire', fv(sim ? sim.tensiunePin(inst, o.vout) : 0, 'V')], ['Curent', fv(Math.abs(el.reg.i || 0), 'A')]]; }
    });
  }
  regulator({
    tip: 'ams1117', nume: 'Regulator AMS1117 3,3 V (modul)', eticheta: 'REG', cauta: 'ams1117 regulator 3.3v ldo modul',
    descriere: 'Coboară 4,5–12 V la 3,3 V (până la ~800 mA). E liniar: diferența de tensiune se transformă în căldură.',
    vin: 'VIN', vout: 'VOUT', gnd: 'GND', dropout: 1.1, imax: 0.8, liniar: true, iq: 1000, tensiune: () => 3.3,
    pini: () => [{ id: 'VIN', x: 0, y: 0, eticheta: 'IN', tip: 'vcc' }, { id: 'GND', x: 10, y: 0, eticheta: 'GND', tip: 'gnd' }, { id: 'VOUT', x: 20, y: 0, eticheta: 'OUT', tip: 'iesire' }],
    cutie: () => ({ x: -6, y: -28, w: 32, h: 31 }),
    desen() { let s = D.pcb(-5, -26, 30, 22, { culoare: '#1f5fa8' }) + `<rect x="3" y="-22" width="14" height="10" rx="1" fill="#1d1f22"/><rect x="5" y="-26" width="10" height="4" fill="#c9ccd1"/>` + D.text(10, -17, 'AMS1117', { m: 1.8, c: '#aaa' }); for (const p of this.pini()) { s += D.pinAntet(p.x, p.y); s += D.text(p.x, p.y + 5.5, p.eticheta, { m: 2.4, c: 'var(--text-2)' }); } return s; }
  });
  regulator({
    tip: '7805', nume: 'Regulator 7805 (5 V)', eticheta: 'REG', cauta: '7805 lm7805 regulator 5v to220',
    descriere: 'Regulator liniar clasic: 7–35 V la intrare, 5 V la ieșire, până la 1 A (cu radiator). Pinii: IN, GND, OUT. Cere cu ~2 V mai mult la intrare decât la ieșire.',
    vin: 'IN', vout: 'OUT', gnd: 'GND', dropout: 2, imax: 1, liniar: true, iq: 1000, tensiune: () => 5,
    pini: () => [{ id: 'IN', x: 0, y: 0, eticheta: 'IN', tip: 'vcc' }, { id: 'GND', x: 10, y: 0, eticheta: 'GND', tip: 'gnd' }, { id: 'OUT', x: 20, y: 0, eticheta: 'OUT', tip: 'iesire' }],
    cutie: () => ({ x: -6, y: -40, w: 32, h: 42 }),
    desen() { let s = D.picior(0, 0, 0, -10) + D.picior(10, 0, 10, -10) + D.picior(20, 0, 20, -10); s += `<rect x="-5" y="-38" width="30" height="12" rx="1" fill="#c9ccd1" stroke="#8a9099" stroke-width="0.5"/><circle cx="10" cy="-32" r="3" fill="#6c727a"/><rect x="-5" y="-27" width="30" height="17" rx="1" fill="#1d1f22"/>` + D.text(10, -18, 'L7805', { m: 2.6, c: '#aaa' }); return s; }
  });
  regulator({
    tip: 'lm2596', nume: 'Convertor coborâtor LM2596 (reglabil)', eticheta: 'DC', cauta: 'lm2596 buck step down convertor coborator reglabil dc-dc',
    descriere: 'Convertor în comutație: coboară 4–40 V la o tensiune reglabilă (1,25–35 V) cu randament ~85 %, fără să se încălzească mult. Reglează ieșirea cu trimmer-ul, cu multimetrul pe OUT, înainte să legi placa!',
    prop: [{ cheie: 'tensiune', eticheta: 'Tensiunea de ieșire (trimmer)', tip: 'numar', unitate: 'V', implicit: 5, min: 1.25, max: 35 }],
    vin: 'IN+', vout: 'OUT+', gnd: 'IN-', dropout: 1.5, imax: 2.5, liniar: false, iq: 20000, tensiune: (p) => Math.max(1.25, +p.tensiune || 5),
    pini: () => [{ id: 'IN+', x: 0, y: 0, eticheta: 'IN+', tip: 'vcc' }, { id: 'IN-', x: 0, y: -30, eticheta: 'IN−', tip: 'gnd' }, { id: 'OUT+', x: 60, y: 0, eticheta: 'OUT+', tip: 'iesire' }, { id: 'OUT-', x: 60, y: -30, eticheta: 'OUT−', tip: 'gnd' }],
    cutie: () => ({ x: -6, y: -36, w: 72, h: 42 }),
    desen(p) {
      let s = D.pcb(-5, -35, 70, 40, { culoare: '#1f5fa8' });
      s += `<circle cx="20" cy="-15" r="9" fill="#2a2d33"/><circle cx="20" cy="-15" r="6" fill="#4a4f57"/>` + D.cip(34, -26, 14, 10, { eticheta: 'LM2596', m: 1.8 });
      s += `<rect x="46" y="-8" width="9" height="9" rx="1" fill="#2f63c4"/><circle cx="50.5" cy="-3.5" r="2.4" fill="#f1f1ea"/>`;
      s += D.text(30, 2, (+p.tensiune || 5).toFixed(1).replace('.', ',') + ' V', { m: 3 });
      for (const pin of this.pini(p)) s += D.pad(pin.x, pin.y) + D.text(pin.x + (pin.x ? -7 : 7), pin.y, pin.eticheta, { m: 2.2 });
      return s;
    }
  });
  M.componente.def('lm2596').interne = () => [['IN-', 'OUT-']];
})(window.M = window.M || {});
