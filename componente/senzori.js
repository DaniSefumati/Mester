/* Meșter — senzori: DHT11/DHT22, DS18B20, HC-SR04, PIR HC-SR501, BME280/BMP280, MPU6050, BH1750,
   celulă de sarcină cu HX711, LM35, TMP36, ACS712 și modulele cu ieșire analogică + digitală
   (umiditate sol, ploaie, gaz MQ, sunet, flacără, obstacol IR, Hall, înclinare, vibrații, nivel apă). */
(function (M) {
  'use strict';
  const D = M.desen;
  const tensiuneModul = (sim, inst, vcc, gnd) => M.tensiuneModul(sim, inst, vcc, gnd);
  const ctl = (inst, k, implicit) => inst.control && inst.control[k] !== undefined ? +inst.control[k] : implicit;
  const zgomot = (a) => (Math.random() - 0.5) * 2 * a;

  // rezistența de pull-up de pe o rețea (cel mai mic rezistor spre o tensiune fixă ≥ 2,5 V)
  function pullUp(sim, net) {
    if (!sim || net < 0) return Infinity;
    const c = sim.circuit;
    let min = Infinity;
    for (const el of c.elemente) {
      if (el.tip !== 'R') continue;
      const alt = el.a === net ? el.b : el.b === net ? el.a : -2;
      if (alt < 0) continue;
      if (c.fix.has(alt) && c.fix.get(alt) >= 2.5) min = Math.min(min, el.r);
    }
    return min;
  }
  // memorie de registre I2C cu adresare auto-incrementată (ca la majoritatea senzorilor)
  function registre(extra) {
    return Object.assign({
      reg: new Uint8Array(256), ptr: 0,
      i2cScrie(o) {
        if (!o.length) return true;
        this.ptr = o[0] & 255;
        for (let i = 1; i < o.length; i++) { this.scrieReg(this.ptr, o[i] & 255); this.ptr = (this.ptr + 1) & 255; }
        return true;
      },
      i2cCiteste(n) {
        if (this.actualizeaza) this.actualizeaza();
        const r = [];
        for (let i = 0; i < n; i++) { r.push(this.citesteReg(this.ptr)); this.ptr = (this.ptr + 1) & 255; }
        return r;
      },
      scrieReg(a, v) { this.reg[a] = v; },
      citesteReg(a) { return this.reg[a]; }
    }, extra || {});
  }
  M.senzori = { pullUp, registre, zgomot };

  const antete = (pini, dy) => { let s = ''; for (const p of pini) { s += D.pinAntet(p.x, p.y); if (p.eticheta) s += D.text(p.x, p.y + (dy === undefined ? -6 : dy), p.eticheta, { m: 2.6 }); } return s; };
  const piniRand = (lista) => lista.map((p, i) => Object.assign({ x: i * 10, y: 0 }, p));
  const ledMic = (x, y, cheie, cul) => `<circle cx="${x}" cy="${y}" r="1.5" fill="rgba(0,0,0,.4)"/><circle cx="${x}" cy="${y}" r="1.2" fill="${cul || '#ff3b2f'}" opacity="0.15" data-r="${cheie}"/>`;
  const aprinde = (g, cheie, on) => { const e = g.querySelector('[data-r="' + cheie + '"]'); if (e) e.setAttribute('opacity', on ? 0.95 : 0.15); };

  // ---------- DHT11 / DHT22 ----------
  M.componente.defineste({
    tip: 'dht', nume: 'Senzor DHT22 / DHT11', categorie: 'senzori', eticheta: 'DHT',
    cauta: 'dht22 dht11 am2302 temperatura umiditate senzor',
    descriere: 'Măsoară temperatura și umiditatea aerului pe un singur fir de date. DHT22 (alb) e precis la 0,1 °C și poate fi citit o dată la 2 secunde; DHT11 (albastru) are pași de 1 °C și 1 %. Varianta de modul are rezistorul de pull-up montat.',
    prop: [
      { cheie: 'model', eticheta: 'Model', tip: 'alegere', optiuni: [['dht22', 'DHT22 (AM2302)'], ['dht11', 'DHT11']], implicit: 'dht22' },
      { cheie: 'forma', eticheta: 'Formă', tip: 'alegere', optiuni: [['modul', 'Modul cu 3 pini (are pull-up)'], ['senzor', 'Senzor simplu cu 4 pini']], implicit: 'modul' }
    ],
    control: [
      { cheie: 'temperatura', eticheta: 'Temperatură', min: -40, max: 80, pas: 0.1, unitate: '°C', implicit: 23.5 },
      { cheie: 'umiditate', eticheta: 'Umiditate', min: 0, max: 100, pas: 0.5, unitate: '%', implicit: 45 }
    ],
    alimentare: { min: 3.3, max: 6 },
    pini: p => p.forma === 'senzor'
      ? piniRand([{ id: 'VCC', eticheta: 'VCC', tip: 'vcc' }, { id: 'DATA', eticheta: 'DATA', tip: 'io', descriere: 'Date (are nevoie de pull-up de 10 kΩ spre VCC)' }, { id: 'NC', eticheta: 'NC', tip: 'nc', descriere: 'Neconectat' }, { id: 'GND', eticheta: 'GND', tip: 'gnd' }])
      : piniRand([{ id: 'VCC', eticheta: '+', tip: 'vcc' }, { id: 'DATA', eticheta: 'OUT', tip: 'io', descriere: 'Date (pull-up de 10 kΩ pe modul)' }, { id: 'GND', eticheta: '−', tip: 'gnd' }]),
    cutie: p => p.forma === 'senzor' ? { x: -6, y: -54, w: 42, h: 57 } : { x: -10, y: -60, w: 40, h: 63 },
    desen(p) {
      const alb = p.model === 'dht22';
      const corp = alb ? '#f1f1ec' : '#3f7fd8', gril = alb ? '#d9d9d2' : '#2f63b0';
      let s = '';
      if (p.forma === 'senzor') {
        for (let i = 0; i < 4; i++) s += D.picior(i * 10, 0, i * 10, -8);
        s += `<rect x="-4" y="-52" width="38" height="45" rx="2" fill="${corp}" stroke="rgba(0,0,0,.3)" stroke-width="0.6"/>`;
        for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++) s += `<rect x="${-1 + c * 7}" y="${-49 + r * 6}" width="5" height="4" rx="0.8" fill="${gril}"/>`;
        s += D.text(15, -11, alb ? 'DHT22' : 'DHT11', { m: 3, c: alb ? '#555' : '#e8eefc' });
      } else {
        s += D.pcb(-9, -24, 38, 22, { culoare: '#1c4f9c' });
        s += `<rect x="-3" y="-58" width="26" height="38" rx="2" fill="${corp}" stroke="rgba(0,0,0,.3)" stroke-width="0.6"/>`;
        for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) s += `<rect x="${1 + c * 7}" y="${-55 + r * 6}" width="5" height="4" rx="0.8" fill="${gril}"/>`;
        s += D.cip(20, -12, 6, 4, {}) + ledMic(-5, -8, 'alim', '#ff3b2f');
        s += antete(this.pini(p), 5.5);
      }
      return s;
    },
    electric(ctx, inst) {
      const r = { consum: ctx.R('VCC', 'GND', 3300) };
      if (inst.prop.forma !== 'senzor') r.pull = ctx.R('DATA', 'VCC', 10000);
      return r;
    },
    dispozitiv(inst, sim) {
      return {
        familie: 'dht', model: inst.prop.model, pinDate: 'DATA',
        // o măsurătoare: {ok, t, h} sau {ok: false, motiv}
        masoara() {
          const v = tensiuneModul(sim, inst);
          if (v < (this.model === 'dht22' ? 3.0 : 2.9)) return { ok: false, motiv: 'alimentare' };
          let t = ctl(inst, 'temperatura', 23.5), h = ctl(inst, 'umiditate', 45);
          if (this.model === 'dht11') { t = Math.max(0, Math.min(50, Math.round(t + zgomot(0.4)))); h = Math.max(20, Math.min(90, Math.round(h + zgomot(0.6)))); }
          else { t = Math.round((t + zgomot(0.06)) * 10) / 10; h = Math.max(0, Math.min(99.9, Math.round((h + zgomot(0.15)) * 10) / 10)); }
          return { ok: true, t, h };
        },
        // cei 5 octeți trimiși pe fir, ca să putem decoda greșit dacă biblioteca așteaptă alt model
        octeti(m) {
          if (this.model === 'dht11') return [m.h | 0, 0, Math.abs(m.t) | 0, 0];
          const h = Math.round(m.h * 10), t = Math.round(Math.abs(m.t) * 10) | (m.t < 0 ? 0x8000 : 0);
          return [(h >> 8) & 255, h & 255, (t >> 8) & 255, t & 255];
        }
      };
    },
    vizual(g, inst, sim) { aprinde(g, 'alim', sim && tensiuneModul(sim, inst) > 2.5); },
    masura(el, inst) { return [['Temperatură', ctl(inst, 'temperatura', 23.5).toFixed(1).replace('.', ',') + ' °C'], ['Umiditate', ctl(inst, 'umiditate', 45).toFixed(0) + ' %']]; }
  });

  // ---------- DS18B20 ----------
  function adresaRom(id) {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
    const a = [0x28];
    for (let i = 0; i < 6; i++) { a.push((h >>> (i * 5)) & 255); h = Math.imul(h ^ (h >>> 13), 2246822507); }
    let crc = 0;
    for (const b0 of a) { let b = b0; for (let j = 0; j < 8; j++) { const mix = (crc ^ b) & 1; crc >>= 1; if (mix) crc ^= 0x8C; b >>= 1; } }
    a.push(crc);
    return a;
  }
  M.componente.defineste({
    tip: 'ds18b20', nume: 'Senzor de temperatură DS18B20', categorie: 'senzori', eticheta: 'DS',
    cauta: 'ds18b20 temperatura onewire dallas sonda impermeabila 1-wire',
    descriere: 'Termometru digital pe magistrala 1-Wire (−55…125 °C, ±0,5 °C). Mai mulți senzori pot sta pe același fir. Firul de date (DQ) are nevoie de un rezistor de 4,7 kΩ spre 3,3 V — fără el citirea dă −127 °C.',
    prop: [{ cheie: 'forma', eticheta: 'Formă', tip: 'alegere', optiuni: [['to92', 'Capsulă TO-92'], ['sonda', 'Sondă impermeabilă (3 fire)'], ['modul', 'Modul cu rezistor de 4,7 kΩ']], implicit: 'to92' }],
    control: [{ cheie: 'temperatura', eticheta: 'Temperatură', min: -55, max: 125, pas: 0.1, unitate: '°C', implicit: 21.5 }],
    alimentare: { vcc: 'VDD', min: 3, max: 5.5 },
    pini: p => p.forma === 'sonda'
      ? [{ id: 'VDD', x: 0, y: 0, eticheta: 'roșu', tip: 'vcc', descriere: 'Firul roșu: 3,3–5 V' }, { id: 'DQ', x: 10, y: 0, eticheta: 'galben', tip: 'io', descriere: 'Firul galben: date 1-Wire' }, { id: 'GND', x: 20, y: 0, eticheta: 'negru', tip: 'gnd', descriere: 'Firul negru: GND' }]
      : p.forma === 'modul'
        ? piniRand([{ id: 'VDD', eticheta: 'VCC', tip: 'vcc' }, { id: 'DQ', eticheta: 'DAT', tip: 'io' }, { id: 'GND', eticheta: 'GND', tip: 'gnd' }])
        : piniRand([{ id: 'GND', eticheta: 'GND', tip: 'gnd', descriere: 'Piciorul 1 (stânga, cu fața plată spre tine)' }, { id: 'DQ', eticheta: 'DQ', tip: 'io', descriere: 'Date 1-Wire' }, { id: 'VDD', eticheta: 'VDD', tip: 'vcc', descriere: '3,3–5 V (sau GND pentru alimentare parazită)' }]),
    cutie: p => p.forma === 'sonda' ? { x: -6, y: -96, w: 32, h: 99 } : p.forma === 'modul' ? { x: -8, y: -34, w: 36, h: 37 } : { x: -3, y: -22, w: 26, h: 25 },
    desen(p) {
      let s = '';
      if (p.forma === 'sonda') {
        s += `<path d="M0 0 C0 -20 8 -30 8 -44" stroke="#d32f2f" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M10 0 C10 -20 10 -30 10 -44" stroke="#fbc02d" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M20 0 C20 -20 12 -30 12 -44" stroke="#212121" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
        s += `<rect x="5" y="-60" width="10" height="18" rx="2" fill="#222"/>`;
        s += `<rect x="4.5" y="-94" width="11" height="36" rx="5" fill="url(#lucire)" stroke="#8a9099" stroke-width="0.6"/><rect x="4.5" y="-94" width="11" height="36" rx="5" fill="#c8ccd2" opacity="0.8"/>`;
        s += D.text(0, 4.5, '+', { m: 2.6, c: 'var(--text-2)' }) + D.text(10, 4.5, 'D', { m: 2.6, c: 'var(--text-2)' }) + D.text(20, 4.5, '−', { m: 2.6, c: 'var(--text-2)' });
      } else if (p.forma === 'modul') {
        s += D.pcb(-7, -32, 34, 30, { culoare: '#1c1f24' });
        s += `<path d="M4 -28 h12 v7 a6 6 0 0 1 -12 0z" fill="#222" stroke="#444" stroke-width="0.5"/>`;
        s += D.text(10, -9, 'DS18B20', { m: 2.4 }) + ledMic(22, -26, 'alim', '#ff3b2f');
        s += antete(this.pini(p), 5.5);
      } else {
        for (let i = 0; i < 3; i++) s += D.picior(i * 10, 0, 7 + i * 3, -9);
        s += `<path d="M1 -9 h18 v-6 a9 9 0 0 0 -18 0z" fill="#222"/>`;
        s += D.text(10, -13, '18B20', { m: 2.4, c: '#aaa' });
      }
      return s;
    },
    electric(ctx, inst) {
      const r = { consum: ctx.R('VDD', 'GND', 200000) };
      if (inst.prop.forma === 'modul') r.pull = ctx.R('DQ', 'VDD', 4700);
      return r;
    },
    dispozitiv(inst, sim) {
      return {
        familie: 'ds18b20', adresa: adresaRom(inst.id), rezolutie: 12, th: 75, tl: 70,
        get parazit() { const nv = sim.netPin(inst, 'VDD'), ng = sim.netPin(inst, 'GND'); return nv === ng || (sim.circuit.fix.get(nv) === 0); },
        temperatura() {
          const t = ctl(inst, 'temperatura', 21.5) + zgomot(0.05);
          const pas = [0.5, 0.25, 0.125, 0.0625][this.rezolutie - 9];
          return Math.round(t / pas) * pas;
        },
        timpConversie() { return [94, 188, 375, 750][this.rezolutie - 9] * 1000; }
      };
    },
    vizual(g, inst, sim) { aprinde(g, 'alim', sim && tensiuneModul(sim, inst, 'VDD') > 2.5); },
    masura(el, inst) { return [['Temperatură', ctl(inst, 'temperatura', 21.5).toFixed(1).replace('.', ',') + ' °C']]; }
  });

  // ---------- HC-SR04 ----------
  M.componente.defineste({
    tip: 'hcsr04', nume: 'Senzor ultrasonic HC-SR04', categorie: 'senzori', eticheta: 'US',
    cauta: 'hc-sr04 ultrasonic distanta sonar hcsr04 rcwl ultrasunete',
    descriere: 'Măsoară distanța (2–400 cm) cu ultrasunete: un impuls de 10 µs pe TRIG, apoi ECHO stă pe HIGH cât durează ecoul (58 µs pe centimetru). HC-SR04 clasic cere 5 V, iar ECHO scoate 5 V — pentru ESP32 pune un divizor de tensiune. Varianta HC-SR04P merge și la 3,3 V.',
    prop: [{ cheie: 'model', eticheta: 'Model', tip: 'alegere', optiuni: [['hcsr04', 'HC-SR04 (5 V)'], ['hcsr04p', 'HC-SR04P / RCWL-1601 (3–5,5 V)']], implicit: 'hcsr04' }],
    control: [{ cheie: 'distanta', eticheta: 'Distanța până la obstacol', min: 1, max: 450, pas: 0.5, unitate: 'cm', implicit: 50 }],
    alimentare: { min: 3, max: 5.5 },
    pini: () => piniRand([{ id: 'VCC', eticheta: 'VCC', tip: 'vcc' }, { id: 'TRIG', eticheta: 'Trig', tip: 'intrare', descriere: 'Impuls de 10 µs pornește o măsurătoare' }, { id: 'ECHO', eticheta: 'Echo', tip: 'iesire', descriere: 'HIGH cât durează ecoul (tensiunea = VCC!)' }, { id: 'GND', eticheta: 'Gnd', tip: 'gnd' }]),
    cutie: () => ({ x: -12, y: -46, w: 54, h: 49 }),
    desen() {
      let s = D.pcb(-11, -44, 52, 40, { culoare: '#1f5fa8', gauri: 2.2 });
      s += D.cilindruMetal(1, -26, 10) + D.cilindruMetal(29, -26, 10);
      s += D.text(15, -40, 'HC-SR04', { m: 2.6 }) + D.text(1, -12, 'T', { m: 2.4 }) + D.text(29, -12, 'R', { m: 2.4 });
      s += `<g opacity="0" data-r="unda"><path d="M-9 -26 a14 14 0 0 1 0 -1 M-13 -34 a18 18 0 0 0 0 16" fill="none" stroke="#7fd6ff" stroke-width="0.8"/></g>`;
      s += antete(this.pini(), 5.5);
      return s;
    },
    electric(ctx, inst, sim) {
      const r = { consum: ctx.R('VCC', 'GND', 330), trig: ctx.R('TRIG', 'GND', 47000) };
      r.echo = ctx.iesire('ECHO', () => {
        const d = sim && sim.disp.get(inst.id);
        const v = tensiuneModul(sim, inst);
        if (v < 2.5) return null;
        return { v: d && d.echo ? v : 0, r: 60 };
      });
      return r;
    },
    dispozitiv(inst, sim) {
      const d = {
        familie: 'sonar', echo: false, tSus: -1, ocupat: false, ultim: 0,
        start() { sim.asculta(sim.netPin(inst, 'TRIG'), (nivel, t) => this.trig(nivel, t)); },
        // ce ar măsura modulul acum (în µs), sau -1 dacă nu răspunde
        durataEcou() {
          const v = tensiuneModul(sim, inst);
          if (inst.prop.model === 'hcsr04' && v < 4.3) return -1;
          if (v < 2.8) return -1;
          const cm = ctl(inst, 'distanta', 50);
          if (cm > 400 || cm < 1.5) return 38000;
          return Math.max(100, (cm + zgomot(0.25)) * 58.3);
        },
        trig(nivel, t) {
          if (nivel) { if (this.tSus < 0) this.tSus = t; return; }
          if (this.tSus < 0) return;
          const lat = t - this.tSus; this.tSus = -1;
          if (lat < 8 || this.ocupat) return;
          const durata = this.durataEcou();
          if (durata < 0) {
            if (inst.prop.model === 'hcsr04') sim.problema('hcsr04-5v-' + inst.id, 'avertisment', inst.eticheta + ' (HC-SR04) are nevoie de 5 V pe VCC; la ' + M.fmtV(tensiuneModul(sim, inst)) + ' nu răspunde. Leagă VCC la VIN (5 V) sau folosește HC-SR04P.', { comp: inst.id });
            return;
          }
          this.ocupat = true; this.ultim = sim.timp;
          const netEcho = sim.netPin(inst, 'ECHO');
          sim.programeaza(460, () => {
            this.echo = true; sim.semnal(netEcho);
            sim.programeaza(durata, () => { this.echo = false; sim.semnal(netEcho); sim.programeaza(2000, () => { this.ocupat = false; }); });
          });
        }
      };
      return d;
    },
    vizual(g, inst, sim, el, disp) { const u = g.querySelector('[data-r="unda"]'); if (u) u.setAttribute('opacity', disp && sim && sim.timp - disp.ultim < 80000 ? 0.9 : 0); },
    masura(el, inst) { return [['Distanță', ctl(inst, 'distanta', 50).toFixed(1).replace('.', ',') + ' cm']]; }
  });

  // ---------- PIR HC-SR501 ----------
  M.componente.defineste({
    tip: 'pir', nume: 'Senzor de mișcare PIR HC-SR501', categorie: 'senzori', eticheta: 'PIR',
    cauta: 'pir hc-sr501 miscare prezenta infrarosu motion am312',
    descriere: 'Detectează oameni în mișcare (căldura corpului). OUT trece pe HIGH (3,3 V) câteva secunde după o mișcare. Atinge cupola în simulare ca să „treci prin fața lui”. Alimentare 5 V (VIN).',
    prop: [
      { cheie: 'timp', eticheta: 'Timp de menținere', tip: 'numar', unitate: 's', implicit: 5, min: 1, max: 300 },
      { cheie: 'mod', eticheta: 'Mod (jumper)', tip: 'alegere', optiuni: [['H', 'H — repornește cât e mișcare'], ['L', 'L — un singur impuls']], implicit: 'H' }
    ],
    alimentare: { min: 4.5, max: 20 },
    pini: () => piniRand([{ id: 'VCC', eticheta: 'VCC', tip: 'vcc', descriere: '4,5–20 V (are regulator de 3,3 V)' }, { id: 'OUT', eticheta: 'OUT', tip: 'iesire', descriere: 'HIGH (3,3 V) la mișcare' }, { id: 'GND', eticheta: 'GND', tip: 'gnd' }]),
    cutie: () => ({ x: -12, y: -46, w: 44, h: 49 }),
    desen() {
      let s = D.pcb(-11, -44, 42, 40, { culoare: '#1c7a3f' });
      s += `<g data-act="miscare" class="interactiv"><circle cx="10" cy="-24" r="17" fill="#f4f4ef" stroke="#cfcfc5" stroke-width="0.8"/>`;
      for (let i = 0; i < 4; i++) s += `<circle cx="10" cy="-24" r="${4 + i * 3.6}" fill="none" stroke="#dcdcd3" stroke-width="0.6"/>`;
      s += `<circle cx="10" cy="-24" r="17" fill="#ffb74d" opacity="0" data-r="activ"/></g>`;
      s += antete(this.pini(), 5.5);
      return s;
    },
    electric(ctx, inst, sim) {
      return {
        consum: ctx.R('VCC', 'GND', 80000),
        out: ctx.iesire('OUT', () => {
          const v = tensiuneModul(sim, inst);
          if (v < 3.5) return { v: 0, r: 1000 };
          const d = sim && sim.disp.get(inst.id);
          return { v: d && d.activ ? 3.3 : 0, r: 1000 };
        })
      };
    },
    dispozitiv(inst, sim) {
      return {
        familie: 'pir', activ: false, panaLa: 0, blocatPana: 0, id: 0,
        miscare() {
          const acum = sim.timp;
          const T = Math.max(1, +inst.prop.timp || 5) * 1e6;
          if (this.activ && inst.prop.mod === 'L') return;
          if (!this.activ && acum < this.blocatPana) return;
          this.panaLa = acum + T;
          const id = ++this.id;
          if (!this.activ) { this.activ = true; sim.murdarComponenta(inst); }
          sim.programeaza(T, () => {
            if (id !== this.id) return;
            this.activ = false; this.blocatPana = sim.timp + 2.5e6; sim.murdarComponenta(inst);
          });
        }
      };
    },
    actiune(inst, act, faza, el, sim, disp) { if (act === 'miscare' && faza === 'jos' && disp) disp.miscare(); },
    vizual(g, inst, sim, el, disp) { const a = g.querySelector('[data-r="activ"]'); if (a) a.setAttribute('opacity', disp && disp.activ ? 0.45 : 0); }
  });

  // ---------- BME280 / BMP280 ----------
  M.componente.defineste({
    tip: 'bme280', nume: 'Senzor BME280 / BMP280', categorie: 'senzori', eticheta: 'BME',
    cauta: 'bme280 bmp280 presiune altitudine temperatura umiditate i2c barometru',
    descriere: 'Senzor pe I2C pentru temperatură, presiune atmosferică și (doar BME280) umiditate. Adresa e 0x76 dacă SDO e la GND (cum vin majoritatea modulelor) sau 0x77. Atenție: multe module vândute ca „BME280” au de fapt BMP280, fără umiditate.',
    prop: [
      { cheie: 'cip', eticheta: 'Cip', tip: 'alegere', optiuni: [['bme280', 'BME280 (cu umiditate)'], ['bmp280', 'BMP280 (fără umiditate)']], implicit: 'bme280' },
      { cheie: 'adresa', eticheta: 'Adresă I2C', tip: 'alegere', optiuni: [['0x76', '0x76 (SDO la GND)'], ['0x77', '0x77 (SDO la VCC)']], implicit: '0x76' }
    ],
    control: [
      { cheie: 'temperatura', eticheta: 'Temperatură', min: -40, max: 85, pas: 0.1, unitate: '°C', implicit: 22.4 },
      { cheie: 'umiditate', eticheta: 'Umiditate (BME280)', min: 0, max: 100, pas: 0.5, unitate: '%', implicit: 48 },
      { cheie: 'presiune', eticheta: 'Presiune', min: 300, max: 1100, pas: 0.1, unitate: 'hPa', implicit: 1008.5 }
    ],
    alimentare: { min: 1.8, max: 5.5 },
    pini: () => piniRand([{ id: 'VCC', eticheta: 'VIN', tip: 'vcc' }, { id: 'GND', eticheta: 'GND', tip: 'gnd' }, { id: 'SCL', eticheta: 'SCL', tip: 'i2c-scl' }, { id: 'SDA', eticheta: 'SDA', tip: 'i2c-sda' }]),
    cutie: () => ({ x: -6, y: -34, w: 42, h: 37 }),
    desen(p) {
      let s = D.pcb(-5, -32, 40, 28, { culoare: '#5b2d8e', gauri: 3 });
      s += `<rect x="11" y="-24" width="8" height="8" rx="0.8" fill="#c9ccd1" stroke="#8a9099" stroke-width="0.4"/><circle cx="17" cy="-18" r="0.8" fill="#333"/>`;
      s += D.text(15, -10, p.cip === 'bmp280' ? 'BMP280' : 'BME280', { m: 2.6 });
      s += antete(this.pini(), 5.5);
      return s;
    },
    electric(ctx) { return { consum: ctx.R('VCC', 'GND', 100000) }; },
    dispozitiv(inst) {
      const bme = inst.prop.cip !== 'bmp280';
      return registre({
        familie: 'bme280', cipId: bme ? 0x60 : 0x58, areUmiditate: bme,
        adresaI2C: parseInt(inst.prop.adresa, 16) || 0x76,
        masura() {
          return {
            t: ctl(inst, 'temperatura', 22.4) + zgomot(0.01),
            h: bme ? Math.max(0, Math.min(100, ctl(inst, 'umiditate', 48) + zgomot(0.05))) : NaN,
            p: (ctl(inst, 'presiune', 1008.5) + zgomot(0.02)) * 100
          };
        },
        citesteReg(a) { return a === 0xD0 ? this.cipId : this.reg[a]; }
      });
    },
    verifica(c, v) { M.verificaI2C && M.verificaI2C(c, v); }
  });

  // ---------- MPU6050 (GY-521) ----------
  M.componente.defineste({
    tip: 'mpu6050', nume: 'Accelerometru + giroscop MPU6050', categorie: 'senzori', eticheta: 'MPU',
    cauta: 'mpu6050 gy-521 accelerometru giroscop imu i2c inclinare unghi',
    descriere: 'Accelerometru și giroscop pe 3 axe, pe I2C la adresa 0x68 (0x69 dacă AD0 e la VCC). Pornește în modul de somn: trebuie trezit scriind 0 în registrul 0x6B (bibliotecile o fac singure). Înclină-l din controalele simulării.',
    prop: [],
    control: [
      { cheie: 'ruliu', eticheta: 'Înclinare stânga–dreapta (ruliu)', min: -180, max: 180, pas: 1, unitate: '°', implicit: 0 },
      { cheie: 'tangaj', eticheta: 'Înclinare față–spate (tangaj)', min: -90, max: 90, pas: 1, unitate: '°', implicit: 0 },
      { cheie: 'rotireZ', eticheta: 'Rotire în jurul axei Z', min: -250, max: 250, pas: 1, unitate: '°/s', implicit: 0 },
      { cheie: 'vibratii', eticheta: 'Vibrații', min: 0, max: 100, pas: 1, unitate: '%', implicit: 0 },
      { cheie: 'temperatura', eticheta: 'Temperatură', min: -40, max: 85, pas: 0.5, unitate: '°C', implicit: 26 }
    ],
    alimentare: { min: 3, max: 5.5 },
    pini: () => piniRand([{ id: 'VCC', eticheta: 'VCC', tip: 'vcc' }, { id: 'GND', eticheta: 'GND', tip: 'gnd' }, { id: 'SCL', eticheta: 'SCL', tip: 'i2c-scl' }, { id: 'SDA', eticheta: 'SDA', tip: 'i2c-sda' },
      { id: 'XDA', eticheta: 'XDA', tip: 'nc' }, { id: 'XCL', eticheta: 'XCL', tip: 'nc' }, { id: 'AD0', eticheta: 'AD0', tip: 'intrare', descriere: 'Adresa: GND sau liber = 0x68, VCC = 0x69' }, { id: 'INT', eticheta: 'INT', tip: 'iesire' }]),
    cutie: () => ({ x: -6, y: -52, w: 82, h: 55 }),
    desen() {
      let s = D.pcb(-5, -50, 80, 46, { culoare: '#1f5fa8', gauri: 3 });
      s += `<rect x="29" y="-38" width="14" height="14" rx="1" fill="#1d1f22"/>` + D.text(36, -31, 'MPU', { m: 2.4, c: '#999' });
      s += `<g stroke="#f3f5f2" stroke-width="0.7" fill="none"><path d="M55 -40 h10 M63 -42 l2 2 l-2 2 M55 -40 v-6 M53 -44 l2 -2 l2 2"/></g>` + D.text(67, -40, 'X', { m: 2.4 }) + D.text(55, -48, 'Y', { m: 2.4 });
      s += D.text(36, -12, 'GY-521', { m: 2.6 }) + ledMic(10, -40, 'alim', '#3cff5a');
      s += antete(this.pini(), 5.5);
      return s;
    },
    electric(ctx) { return { consum: ctx.R('VCC', 'GND', 1000), ad0: ctx.R('AD0', 'GND', 4700) }; },
    dispozitiv(inst, sim) {
      const aleator = () => Math.random() - 0.5;
      // abateri proprii fiecărui cip, ca la unul real: de aceea există calibrarea
      const abatere = { ax: aleator() * 0.06, ay: aleator() * 0.06, az: aleator() * 0.08, gx: aleator() * 5, gy: aleator() * 5, gz: aleator() * 3 };
      let ultim = null;
      const d = registre({
        familie: 'mpu6050', abatere,
        get adresaI2C() { const n = sim.netPin(inst, 'AD0'); const v = sim.circuit.tensiune(n); return v > 1.6 ? 0x69 : 0x68; },
        resetRegistre() { this.reg.fill(0); this.reg[0x6B] = 0x40; this.reg[0x75] = 0x68; },
        scrieReg(a, v) {
          if (a === 0x6B && (v & 0x80)) { this.resetRegistre(); return; }
          if (a === 0x75 || (a >= 0x3B && a <= 0x48)) return;
          this.reg[a] = v;
        },
        // valorile fizice acum: accelerație (g), rotație (°/s), temperatură
        fizic() {
          const r = ctl(inst, 'ruliu', 0) * Math.PI / 180, p = ctl(inst, 'tangaj', 0) * Math.PI / 180;
          const vib = ctl(inst, 'vibratii', 0) / 100;
          const t = sim.timp / 1e6;
          const acum = { r: ctl(inst, 'ruliu', 0), p: ctl(inst, 'tangaj', 0), t };
          let gx = 0, gy = 0;
          if (ultim && t > ultim.t) { gx = (acum.r - ultim.r) / (t - ultim.t); gy = (acum.p - ultim.p) / (t - ultim.t); }
          if (!ultim || t - ultim.t > 0.02) ultim = acum;
          const z = (k) => zgomot(k) + vib * zgomot(0.8);
          return {
            ax: -Math.sin(p) + abatere.ax + z(0.004), ay: Math.sin(r) * Math.cos(p) + abatere.ay + z(0.004), az: Math.cos(r) * Math.cos(p) + abatere.az + z(0.006),
            gx: Math.max(-2000, Math.min(2000, gx)) + abatere.gx + z(0.002) * 30, gy: Math.max(-2000, Math.min(2000, gy)) + abatere.gy + z(0.002) * 30, gz: ctl(inst, 'rotireZ', 0) + abatere.gz + z(0.002) * 30,
            temp: ctl(inst, 'temperatura', 26) + zgomot(0.05)
          };
        },
        actualizeaza() {
          if (this.reg[0x6B] & 0x40) return; // în somn: datele nu se schimbă
          const f = this.fizic();
          const la = 16384 / (1 << ((this.reg[0x1C] >> 3) & 3)), lg = 131 / (1 << ((this.reg[0x1B] >> 3) & 3));
          const pune = (a, v) => { v = Math.max(-32768, Math.min(32767, Math.round(v))); this.reg[a] = (v >> 8) & 255; this.reg[a + 1] = v & 255; };
          pune(0x3B, f.ax * la); pune(0x3D, f.ay * la); pune(0x3F, f.az * la);
          pune(0x41, (f.temp - 36.53) * 340);
          pune(0x43, f.gx * lg); pune(0x45, f.gy * lg); pune(0x47, f.gz * lg);
          this.reg[0x3A] |= 1;
        }
      });
      d.resetRegistre();
      d.laResetMcu = () => { }; // cipul rămâne alimentat și își păstrează registrele la resetarea plăcii
      return d;
    },
    vizual(g, inst, sim) { aprinde(g, 'alim', sim && tensiuneModul(sim, inst) > 2.5); },
    verifica(c, v) { M.verificaI2C && M.verificaI2C(c, v); }
  });

  // ---------- BH1750 ----------
  M.componente.defineste({
    tip: 'bh1750', nume: 'Senzor de lumină BH1750', categorie: 'senzori', eticheta: 'LUX',
    cauta: 'bh1750 gy-302 lumina lux luminozitate i2c',
    descriere: 'Măsoară lumina direct în lucși, pe I2C (adresa 0x23; 0x5C dacă ADDR e la VCC). O măsurătoare de înaltă rezoluție durează 120 ms.',
    prop: [],
    control: [{ cheie: 'lux', eticheta: 'Lumină', min: 0, max: 65000, pas: 1, unitate: 'lx', implicit: 320, log: true }],
    alimentare: { min: 2.4, max: 5.5 },
    pini: () => piniRand([{ id: 'VCC', eticheta: 'VCC', tip: 'vcc' }, { id: 'GND', eticheta: 'GND', tip: 'gnd' }, { id: 'SCL', eticheta: 'SCL', tip: 'i2c-scl' }, { id: 'SDA', eticheta: 'SDA', tip: 'i2c-sda' }, { id: 'ADDR', eticheta: 'ADDR', tip: 'intrare', descriere: 'Adresa: GND sau liber = 0x23, VCC = 0x5C' }]),
    cutie: () => ({ x: -6, y: -34, w: 52, h: 37 }),
    desen() {
      let s = D.pcb(-5, -32, 50, 28, { culoare: '#1f5fa8', gauri: 3 });
      s += `<rect x="16" y="-24" width="8" height="6" rx="0.6" fill="#1d1f22"/><rect x="18" y="-23" width="4" height="4" fill="#6b5b3a"/>`;
      s += D.text(20, -10, 'GY-302', { m: 2.6 });
      s += antete(this.pini(), 5.5);
      return s;
    },
    electric(ctx) { return { consum: ctx.R('VCC', 'GND', 30000), addr: ctx.R('ADDR', 'GND', 100000) }; },
    dispozitiv(inst, sim) {
      return {
        familie: 'bh1750', mod: 0, pornit: false, gataLa: Infinity, valoare: 0, mt: 69,
        get adresaI2C() { const v = sim.circuit.tensiune(sim.netPin(inst, 'ADDR')); return v > 1.6 ? 0x5C : 0x23; },
        durata() { return ((this.mod & 0x03) === 3 ? 16000 : 120000) * this.mt / 69; },
        masoara() { const lux = Math.max(0, ctl(inst, 'lux', 320) * (1 + zgomot(0.004))); const fact = (this.mod & 3) === 1 ? 2 : 1; this.valoare = Math.min(65535, Math.round(lux * 1.2 * this.mt / 69 * fact)); },
        i2cScrie(o) {
          for (const c of o) {
            if (c === 0x00) this.pornit = false;
            else if (c === 0x01) this.pornit = true;
            else if (c === 0x07) this.valoare = 0;
            else if ((c & 0xF8) === 0x40) this.mt = (this.mt & 0x1F) | ((c & 7) << 5);
            else if ((c & 0xE0) === 0x60) this.mt = (this.mt & 0xE0) | (c & 0x1F);
            else if (c === 0x10 || c === 0x11 || c === 0x13 || c === 0x20 || c === 0x21 || c === 0x23) { this.mod = c; this.pornit = true; this.gataLa = sim.timp + this.durata(); }
          }
          return true;
        },
        i2cCiteste(n) {
          if (this.pornit && sim.timp >= this.gataLa) {
            this.masoara();
            if (this.mod >= 0x20) { this.pornit = false; this.gataLa = Infinity; } else this.gataLa = sim.timp + this.durata();
          }
          const r = [(this.valoare >> 8) & 255, this.valoare & 255];
          while (r.length < n) r.push(0xFF);
          return r.slice(0, n);
        }
      };
    },
    verifica(c, v) { M.verificaI2C && M.verificaI2C(c, v); }
  });

  // ---------- HX711 + celulă de sarcină ----------
  M.componente.defineste({
    tip: 'hx711', nume: 'Cântar: HX711 + celulă de sarcină', categorie: 'senzori', eticheta: 'HX',
    cauta: 'hx711 celula sarcina load cell cantar greutate masa',
    descriere: 'Amplificatorul HX711 cu o celulă de sarcină deja legată. Dă valori brute de 24 de biți pe DT/SCK; în cod faci „tara” (zero) și împarți la un factor de calibrare ca să obții grame.',
    prop: [{ cheie: 'capacitate', eticheta: 'Celula de sarcină', tip: 'alegere', optiuni: [['1', '1 kg'], ['5', '5 kg'], ['20', '20 kg']], implicit: '5' }],
    control: [{ cheie: 'masa', eticheta: 'Greutate pe cântar', min: 0, max: 20000, pas: 1, unitate: 'g', implicit: 0 }],
    alimentare: { min: 2.6, max: 5.5 },
    pini: () => piniRand([{ id: 'GND', eticheta: 'GND', tip: 'gnd' }, { id: 'DT', eticheta: 'DT', tip: 'iesire', descriere: 'Date (DOUT)' }, { id: 'SCK', eticheta: 'SCK', tip: 'intrare', descriere: 'Ceas' }, { id: 'VCC', eticheta: 'VCC', tip: 'vcc' }]),
    cutie: () => ({ x: -6, y: -72, w: 96, h: 75 }),
    desen() {
      let s = D.pcb(-5, -30, 40, 26, { culoare: '#b3262a' });
      s += D.cip(6, -24, 18, 8, { eticheta: 'HX711', m: 2.2, picioare: 8 });
      s += `<path d="M34 -24 C44 -24 44 -52 52 -52" stroke="#d32f2f" stroke-width="1" fill="none"/><path d="M34 -20 C46 -20 46 -48 52 -48" stroke="#212121" stroke-width="1" fill="none"/><path d="M34 -16 C48 -16 48 -44 52 -44" stroke="#fafafa" stroke-width="1" fill="none"/><path d="M34 -12 C50 -12 50 -40 52 -40" stroke="#2e7d32" stroke-width="1" fill="none"/>`;
      s += `<rect x="50" y="-60" width="38" height="24" rx="1.5" fill="#c9ccd1" stroke="#8a9099" stroke-width="0.6"/><circle cx="62" cy="-48" r="3" fill="#7d838c"/><circle cx="76" cy="-48" r="3" fill="#7d838c"/>`;
      s += `<rect x="48" y="-70" width="42" height="6" rx="1" fill="#e0e0d8" stroke="#b0b0a8" stroke-width="0.5" data-r="taler"/>`;
      s += antete(this.pini(), 5.5);
      return s;
    },
    electric(ctx) { return { consum: ctx.R('VCC', 'GND', 2200), dt: ctx.R('DT', 'VCC', 100000) }; },
    dispozitiv(inst, sim) {
      const cap = +inst.prop.capacitate || 5;
      const factor = 2100 / cap * 0.2; // unități brute pe gram (≈ 420 la 1 kg)
      const zero = 8200 + Math.round(Math.random() * 12000);
      return {
        familie: 'hx711', castig: 128, pornit: true, factor, zero,
        // următoarea valoare de 24 de biți (sau null dacă modulul nu e alimentat)
        valoare() {
          if (tensiuneModul(sim, inst) < 2.5) return null;
          const g = Math.min(ctl(inst, 'masa', 0), cap * 1500);
          if (ctl(inst, 'masa', 0) > cap * 1000 * 1.2) sim.problema('hx711-supra-' + inst.id, 'avertisment', 'Greutatea depășește capacitatea celulei de ' + cap + ' kg; în realitate celula se poate deforma permanent.', { comp: inst.id });
          const v = zero + g * factor * this.castig / 128 + zgomot(35);
          return Math.max(-8388608, Math.min(8388607, Math.round(v)));
        }
      };
    },
    vizual(g, inst) { const t = g.querySelector('[data-r="taler"]'); if (t) t.setAttribute('y', -70 + Math.min(2, ctl(inst, 'masa', 0) / 2500)); },
    masura(el, inst) { return [['Greutate', ctl(inst, 'masa', 0).toFixed(0) + ' g']]; }
  });

  // ---------- LM35 și TMP36 ----------
  function senzorTemperaturaAnalogic(tip, nume, desc, vmin, formula, eticheta) {
    M.componente.defineste({
      tip, nume, categorie: 'senzori', eticheta,
      cauta: tip + ' temperatura analogic senzor to92',
      descriere: desc,
      prop: [],
      control: [{ cheie: 'temperatura', eticheta: 'Temperatură', min: tip === 'lm35' ? 0 : -40, max: tip === 'lm35' ? 150 : 125, pas: 0.1, unitate: '°C', implicit: 24 }],
      alimentare: { min: vmin, max: tip === 'lm35' ? 30 : 5.5 },
      pini: () => piniRand([{ id: 'VCC', eticheta: '+Vs', tip: 'vcc' }, { id: 'OUT', eticheta: 'Vout', tip: 'iesire-analogica' }, { id: 'GND', eticheta: 'GND', tip: 'gnd' }]),
      cutie: () => ({ x: -3, y: -22, w: 26, h: 25 }),
      desen() {
        let s = '';
        for (let i = 0; i < 3; i++) s += D.picior(i * 10, 0, 7 + i * 3, -9);
        s += `<path d="M1 -9 h18 v-6 a9 9 0 0 0 -18 0z" fill="#222"/>` + D.text(10, -13, tip.toUpperCase(), { m: 2.4, c: '#aaa' });
        return s;
      },
      electric(ctx, inst, sim) {
        return {
          consum: ctx.R('VCC', 'GND', 60000),
          out: ctx.iesire('OUT', () => {
            const v = tensiuneModul(sim, inst);
            if (v < 1) return null;
            let o = formula(ctl(inst, 'temperatura', 24));
            if (v < vmin) o *= Math.max(0, (v - 1.2) / (vmin - 1.2)); // sub tensiunea minimă ieșirea nu mai e corectă
            return { v: Math.max(0, Math.min(v - 0.5, o)), r: tip === 'lm35' ? 80 : 50 };
          })
        };
      },
      dispozitiv(inst, sim) {
        return { familie: 'temp-analog', start() { const v = tensiuneModul(sim, inst); if (v > 1 && v < vmin) sim.problema('vmin-' + inst.id, 'avertisment', inst.eticheta + ' (' + nume + ') are nevoie de minimum ' + M.fmtV(vmin) + ' pe +Vs; la ' + M.fmtV(v) + ' citirile ies prea mici. Alimentează-l din VIN (5 V) — ieșirea rămâne sub 1,5 V, deci e sigură pentru ESP32.', { comp: inst.id }); } };
      },
      masura(el, inst) { return [['Temperatură', ctl(inst, 'temperatura', 24).toFixed(1).replace('.', ',') + ' °C'], ['Ieșire', formula(ctl(inst, 'temperatura', 24)).toFixed(3).replace('.', ',') + ' V']]; }
    });
  }
  senzorTemperaturaAnalogic('lm35', 'Senzor de temperatură LM35', 'Senzor analogic: 10 mV pe grad (25 °C → 0,25 V). Are nevoie de minimum 4 V pe +Vs. Citește ieșirea cu analogReadMilliVolts() și împarte la 10.', 4, t => t * 0.01, 'LM35');
  senzorTemperaturaAnalogic('tmp36', 'Senzor de temperatură TMP36', 'Senzor analogic: 0,5 V la 0 °C și 10 mV pe grad (25 °C → 0,75 V). Merge de la 2,7 V, deci și la 3,3 V.', 2.7, t => 0.5 + t * 0.01, 'TMP');

  // ---------- ACS712 ----------
  M.componente.defineste({
    tip: 'acs712', nume: 'Senzor de curent ACS712', categorie: 'senzori', eticheta: 'ACS',
    cauta: 'acs712 curent amper senzor hall 5a 20a 30a',
    descriere: 'Măsoară curentul care trece prin bornele IP+ și IP−. Ieșirea e VCC/2 fără curent și crește cu 185 mV/A (5 A), 100 mV/A (20 A) sau 66 mV/A (30 A). Are nevoie de 5 V.',
    prop: [{ cheie: 'varianta', eticheta: 'Variantă', tip: 'alegere', optiuni: [['5', '±5 A (185 mV/A)'], ['20', '±20 A (100 mV/A)'], ['30', '±30 A (66 mV/A)']], implicit: '5' }],
    alimentare: { min: 4.5, max: 5.5 },
    pini: () => [{ id: 'IP+', x: 0, y: -40, eticheta: 'IP+', tip: 'pasiv', descriere: 'Intrarea curentului măsurat' }, { id: 'IP-', x: 20, y: -40, eticheta: 'IP−', tip: 'pasiv', descriere: 'Ieșirea curentului măsurat' },
      { id: 'VCC', x: 0, y: 0, eticheta: 'VCC', tip: 'vcc' }, { id: 'OUT', x: 10, y: 0, eticheta: 'OUT', tip: 'iesire-analogica' }, { id: 'GND', x: 20, y: 0, eticheta: 'GND', tip: 'gnd' }],
    cutie: () => ({ x: -6, y: -46, w: 32, h: 49 }),
    desen() {
      let s = D.pcb(-5, -34, 30, 30, { culoare: '#b3262a' });
      s += `<rect x="-5" y="-45" width="30" height="10" rx="1" fill="#2f7fd8"/>` + D.pad(0, -40) + D.pad(20, -40);
      s += D.cip(4, -26, 12, 8, { eticheta: 'ACS712', m: 1.8, picioare: 4 });
      s += antete(this.pini().slice(2), 5.5);
      return s;
    },
    electric(ctx, inst, sim) {
      const sunt = ctx.R('IP+', 'IP-', 0.0012);
      const sens = { 5: 0.185, 20: 0.1, 30: 0.066 }[inst.prop.varianta] || 0.185;
      const out = ctx.iesire('OUT', () => {
        const v = tensiuneModul(sim, inst);
        if (v < 2) return null;
        return { v: Math.max(0.05, Math.min(v - 0.05, v / 2 + sunt.i * sens * v / 5)), r: 100 };
      });
      out.dinamic = true;
      return { sunt, out, consum: ctx.R('VCC', 'GND', 500) };
    },
    masura(el) { return [['Curent', (el.sunt.i || 0).toFixed(3).replace('.', ',') + ' A']]; }
  });

  // ---------- module cu ieșire analogică (AO) și/sau digitală (DO) ----------
  // o = {tip, nume, cauta, descriere, eticheta, pcb, control, ao(inst, sim, t) -> fracție din VCC, do(inst, sim, fr) -> true dacă e „activ”, activLow, piniAo, piniDo, desenSenzor}
  function modul(o) {
    const pini = [{ id: 'VCC', eticheta: 'VCC', tip: 'vcc' }, { id: 'GND', eticheta: 'GND', tip: 'gnd' }];
    if (o.cuDo !== false) pini.push({ id: 'DO', eticheta: 'DO', tip: 'iesire', descriere: o.descriereDo || 'Ieșire digitală: comparator reglat din potențiometrul de pe modul' });
    if (o.cuAo !== false) pini.push({ id: 'AO', eticheta: 'AO', tip: 'iesire-analogica', descriere: o.descriereAo || 'Ieșire analogică (citește cu analogRead)' });
    const control = (o.control || []).slice();
    if (o.cuDo !== false && o.cuAo !== false) control.push({ cheie: 'prag', eticheta: 'Pragul comparatorului (potențiometrul albastru)', min: 0, max: 100, pas: 1, unitate: '%', implicit: 50 });
    const lat = Math.max(34, pini.length * 10 + 12);
    M.componente.defineste({
      tip: o.tip, nume: o.nume, categorie: o.categorie || 'senzori', eticheta: o.eticheta,
      cauta: o.cauta, descriere: o.descriere, prop: o.prop || [], control,
      alimentare: o.alimentare || { min: 3.3, max: 5.5 },
      pini: () => piniRand(pini),
      cutie: () => ({ x: -6, y: -(o.inaltime || 40) - 2, w: lat, h: (o.inaltime || 40) + 5 }),
      desen(p) {
        const h = o.inaltime || 40;
        let s = D.pcb(-5, -h, lat - 2, h - 4, { culoare: o.pcb || '#1f5fa8', gauri: 2.2 });
        if (o.cuDo !== false && o.cuAo !== false) s += `<rect x="${lat - 22}" y="${-h + 4}" width="9" height="9" rx="1" fill="#2f63c4"/><circle cx="${lat - 17.5}" cy="${-h + 8.5}" r="2.6" fill="#f1f1ea"/><path d="M${lat - 19} ${-h + 8.5} h3" stroke="#555" stroke-width="0.6"/>`;
        s += ledMic(0, -9, 'alim', '#ff3b2f');
        if (o.cuDo !== false) s += ledMic(8, -9, 'do', '#3cff5a');
        if (o.desenSenzor) s += o.desenSenzor(p, lat, h);
        s += antete(this.pini(p), 5.5);
        return s;
      },
      electric(ctx, inst, sim) {
        const r = { consum: ctx.R('VCC', 'GND', o.consum || 10000) };
        const fr = () => Math.max(0, Math.min(1, o.ao(inst, sim, sim ? sim.timp : 0)));
        if (o.cuAo !== false) {
          r.ao = ctx.iesire('AO', () => { const v = tensiuneModul(sim, inst); if (v < 2) return null; return { v: fr() * v, r: 1000 }; });
          if (o.dinamic) r.ao.dinamic = true;
        }
        if (o.cuDo !== false) {
          r.activ = () => {
            if (o.do) return o.do(inst, sim, fr());
            return fr() * 100 > ctl(inst, 'prag', 50) === !o.invers;
          };
          r.do = ctx.iesire('DO', () => {
            const v = tensiuneModul(sim, inst);
            if (v < 2) return null;
            const jos = o.activLow !== false ? r.activ() : !r.activ();
            return jos ? { v: 0, r: 60 } : { v, r: 10000 };
          });
          if (o.dinamic) r.do.dinamic = true;
        }
        r.actualizeaza = () => { };
        return r;
      },
      dispozitiv: o.dispozitiv,
      laControl(inst, el, sim) { sim.murdarComponenta(inst); },
      actiune: o.actiune,
      vizual(g, inst, sim, el) {
        const v = sim ? tensiuneModul(sim, inst) : 0;
        aprinde(g, 'alim', v > 2);
        if (o.cuDo !== false) aprinde(g, 'do', v > 2 && el && el.activ && el.activ());
        if (o.vizual) o.vizual(g, inst, sim, el);
      },
      masura: o.masura
    });
  }
  M.modulSenzor = modul;

  modul({
    tip: 'umiditate-sol', nume: 'Senzor de umiditate a solului', eticheta: 'SOL', pcb: '#1c1f24',
    cauta: 'umiditate sol soil moisture capacitiv yl-69 fc-28 planta udare',
    descriere: 'Sonda se înfige în pământ. AO scade când solul e mai ud (la varianta rezistivă: ~3 V în aer, ~1,2 V în apă). DO trece pe LOW când umiditatea depășește pragul.',
    control: [{ cheie: 'umiditate', eticheta: 'Umiditatea solului', min: 0, max: 100, pas: 1, unitate: '%', implicit: 35 }],
    ao: (inst) => 0.92 - ctl(inst, 'umiditate', 35) / 100 * 0.58 + zgomot(0.004),
    do: (inst) => ctl(inst, 'umiditate', 35) > 100 - ctl(inst, 'prag', 50),
    desenSenzor: (p, lat) => `<path d="M${lat / 2 - 12} -40 v-26 l3 -6 l3 6 v26 M${lat / 2 + 6} -40 v-26 l3 -6 l3 6 v26" fill="#c9a86b" stroke="#8a6b3a" stroke-width="0.6"/>`,
    inaltime: 40
  });
  modul({
    tip: 'ploaie', nume: 'Senzor de ploaie', eticheta: 'RAIN', pcb: '#1c1f24',
    cauta: 'ploaie rain senzor picaturi apa fc-37 yl-83',
    descriere: 'Placa cu piste detectează picăturile de apă. AO scade cu cât e mai multă apă; DO trece pe LOW când plouă.',
    control: [{ cheie: 'apa', eticheta: 'Apă pe placă', min: 0, max: 100, pas: 1, unitate: '%', implicit: 0 }],
    ao: (inst) => 0.97 - ctl(inst, 'apa', 0) / 100 * 0.7 + zgomot(0.003),
    do: (inst) => ctl(inst, 'apa', 0) > 100 - ctl(inst, 'prag', 50),
    desenSenzor: (p, lat) => `<rect x="-2" y="-78" width="${lat - 10}" height="34" rx="1" fill="#1a1c20"/><path d="M1 -74 h${lat - 18} M1 -70 h${lat - 18} M1 -66 h${lat - 18} M1 -62 h${lat - 18} M1 -58 h${lat - 18} M1 -54 h${lat - 18} M1 -50 h${lat - 18}" stroke="#c9ccd1" stroke-width="1.4"/>`,
    inaltime: 40
  });
  function gaz(tip, nume, cauta, descriere, eticheta, ppmImplicit) {
    modul({
      tip, nume, eticheta, pcb: '#1f5fa8', cauta, descriere, consum: 33,
      alimentare: { min: 4.5, max: 5.5 },
      control: [{ cheie: 'ppm', eticheta: 'Concentrație gaz', min: 10, max: 10000, pas: 1, unitate: 'ppm', implicit: ppmImplicit, log: true }],
      dispozitiv(inst, sim) { return { familie: 'mq', pornitLa: 0, start() { this.pornitLa = sim.timp; } }; },
      ao(inst, sim) {
        const v = tensiuneModul(sim, inst);
        const d = sim && sim.disp.get(inst.id);
        // încălzirea: în primele ~20 s ieșirea pornește mare și coboară
        const inc = d ? Math.max(0, 1 - (sim.timp - d.pornitLa) / 20e6) : 0;
        const ppm = ctl(inst, 'ppm', ppmImplicit);
        let f = 0.08 + 0.72 * Math.log10(ppm / 10) / 3 + inc * 0.5 + zgomot(0.005);
        if (v < 4.3) f *= 0.4;
        return f;
      },
      desenSenzor: () => D.cilindruMetal(14, -24, 11),
      inaltime: 40,
      masura: (el, inst) => [['Concentrație', ctl(inst, 'ppm', ppmImplicit).toFixed(0) + ' ppm']]
    });
  }
  gaz('mq2', 'Senzor de gaz MQ-2', 'mq-2 mq2 gaz fum lpg metan senzor', 'Detectează gaz (GPL, metan) și fum. Încălzitorul lui are nevoie de 5 V și ~150 mA; după pornire valorile se stabilizează în ~20 s. AO crește cu concentrația.', 'MQ2', 300);
  gaz('mq135', 'Senzor calitatea aerului MQ-135', 'mq-135 mq135 aer co2 calitate amoniac', 'Detectează gaze din aer (CO₂, NH₃, benzen). Încălzitorul cere 5 V; AO crește când aerul e mai încărcat.', 'MQ135', 420);
  modul({
    tip: 'sunet', nume: 'Senzor de sunet (microfon KY-038)', eticheta: 'MIC', pcb: '#1c1f24', dinamic: true,
    cauta: 'sunet microfon ky-038 lm393 zgomot clap aplauze',
    descriere: 'Microfon cu amplificator: AO e semnalul audio, în jurul lui VCC/2, cu amplitudinea mai mare la sunete puternice. DO trece pe HIGH cât timp sunetul depășește pragul. Apasă microfonul ca să „bați din palme”.',
    control: M.sunet.controaleMicrofon(45),
    ao(inst, sim, t) {
      // sunetul din jur (vezi simulare/sunet.js): voce, muzică… plus buzzerele și difuzoarele din schemă
      return 0.5 + M.sunet.presiune(sim, inst, t) * 0.45 + zgomot(0.004);
    },
    do(inst, sim) { return M.sunet.nivelAsteptat(sim, inst) > M.sunet.dinDb(40 + ctl(inst, 'prag', 50) * 0.6); },
    activLow: false,
    dispozitiv(inst, sim) { return { familie: 'sunet', aplauzaPana: 0 }; },
    actiune(inst, act, faza, el, sim, disp) { if (act === 'aplauze' && faza === 'jos' && disp) { disp.aplauzaPana = sim.timp + 60000; sim.murdarComponenta(inst); sim.programeaza(60000, () => sim.murdarComponenta(inst)); } },
    desenSenzor: () => `<g data-act="aplauze" class="interactiv"><circle cx="14" cy="-26" r="8" fill="#c9ccd1" stroke="#8a9099" stroke-width="0.6"/><circle cx="14" cy="-26" r="5.5" fill="#2a2d31"/></g>`,
    inaltime: 40
  });
  modul({
    tip: 'flacara', nume: 'Senzor de flacără', eticheta: 'FLC', pcb: '#1f5fa8',
    cauta: 'flacara flame foc senzor infrarosu ky-026',
    descriere: 'Fotodiodă sensibilă la infraroșul flăcării (760–1100 nm). AO scade când flacăra e aproape; DO trece pe LOW când detectează foc.',
    control: [{ cheie: 'flacara', eticheta: 'Intensitatea flăcării', min: 0, max: 100, pas: 1, unitate: '%', implicit: 0 }],
    ao: (inst) => 0.98 - ctl(inst, 'flacara', 0) / 100 * 0.9 + zgomot(0.003),
    do: (inst) => ctl(inst, 'flacara', 0) > 100 - ctl(inst, 'prag', 50),
    desenSenzor: () => `<rect x="12" y="-52" width="4" height="16" fill="#aeb3ba"/><ellipse cx="14" cy="-56" rx="4" ry="5" fill="#1d1f22"/>`,
    inaltime: 40
  });
  modul({
    tip: 'obstacol-ir', nume: 'Senzor de obstacol IR', eticheta: 'IR', pcb: '#1c1f24', cuAo: false,
    cauta: 'obstacol infrarosu ir fc-51 evitare obstacole robot senzor',
    descriere: 'Un LED infraroșu și o fotodiodă: OUT trece pe LOW când un obiect e mai aproape decât distanța reglată (2–30 cm).',
    control: [{ cheie: 'distanta', eticheta: 'Distanța până la obiect', min: 1, max: 60, pas: 0.5, unitate: 'cm', implicit: 40 }, { cheie: 'reglaj', eticheta: 'Distanța de detecție reglată', min: 2, max: 30, pas: 1, unitate: 'cm', implicit: 10 }],
    ao: () => 0,
    do: (inst) => ctl(inst, 'distanta', 40) < ctl(inst, 'reglaj', 10),
    desenSenzor: (p, lat) => `<rect x="${lat - 18}" y="-50" width="5" height="10" rx="2" fill="#e8f0ff"/><rect x="${lat - 11}" y="-50" width="5" height="10" rx="2" fill="#1d1f22"/>`,
    descriereDo: 'LOW când e un obstacol în față',
    inaltime: 40
  });
  modul({
    tip: 'hall', nume: 'Senzor Hall (magnet) KY-003', eticheta: 'HALL', pcb: '#1c1f24', cuAo: false,
    cauta: 'hall magnet a3144 ky-003 senzor magnetic',
    descriere: 'Senzorul A3144 trage ieșirea pe LOW când lângă el e polul sud al unui magnet. Folosit pentru turometre și capete de cursă. Atinge senzorul ca să apropii magnetul.',
    control: [{ cheie: 'magnet', eticheta: 'Magnet aproape', min: 0, max: 1, pas: 1, implicit: 0 }],
    ao: () => 0,
    do: (inst) => ctl(inst, 'magnet', 0) >= 1 || !!inst._magnet,
    actiune(inst, act, faza, el, sim) { if (act === 'magnet') { inst._magnet = faza === 'jos'; sim.murdarComponenta(inst); } },
    desenSenzor: () => `<g data-act="magnet" class="interactiv"><rect x="10" y="-52" width="8" height="10" rx="1" fill="#1d1f22"/>${D.text(14, -47, '3144', { m: 1.8, c: '#999' })}<rect x="4" y="-60" width="20" height="24" fill="transparent"/></g>`,
    descriereDo: 'LOW când simte magnetul',
    inaltime: 40
  });
  modul({
    tip: 'inclinare', nume: 'Senzor de înclinare SW-520D', eticheta: 'TILT', pcb: '#1c1f24', cuAo: false,
    cauta: 'inclinare tilt sw-520d bila senzor',
    descriere: 'O bilă care închide contactul când senzorul stă drept. Când îl înclini, contactul se deschide și DO trece pe HIGH.',
    control: [{ cheie: 'inclinat', eticheta: 'Înclinat', min: 0, max: 1, pas: 1, implicit: 0 }],
    ao: () => 0,
    do: (inst) => ctl(inst, 'inclinat', 0) < 1,
    desenSenzor: () => `<rect x="10" y="-56" width="8" height="16" rx="3" fill="#2a2d33"/>`,
    descriereDo: 'LOW cât timp e drept, HIGH când e înclinat',
    inaltime: 40
  });
  modul({
    tip: 'vibratii', nume: 'Senzor de vibrații SW-420', eticheta: 'VIB', pcb: '#1f5fa8', cuAo: false,
    cauta: 'vibratii vibratie sw-420 cutremur soc senzor',
    descriere: 'Un arc în tub: la vibrații contactul se deschide scurt, iar DO dă impulsuri pe HIGH. Atinge senzorul ca să-l scuturi.',
    control: [{ cheie: 'vibratii', eticheta: 'Vibrații', min: 0, max: 100, pas: 1, unitate: '%', implicit: 0 }],
    dinamic: true,
    ao: () => 0,
    do: (inst, sim) => { const f = Math.max(ctl(inst, 'vibratii', 0), inst._scuturat ? 80 : 0) / 100; return f > 0 && Math.random() < f * 0.7; },
    activLow: false,
    actiune(inst, act, faza, el, sim) { if (act === 'scutura') { inst._scuturat = faza === 'jos'; sim.murdarComponenta(inst); } },
    desenSenzor: () => `<g data-act="scutura" class="interactiv"><rect x="8" y="-56" width="14" height="10" rx="4" fill="#c9ccd1" stroke="#8a9099" stroke-width="0.5"/><rect x="4" y="-60" width="22" height="18" fill="transparent"/></g>`,
    descriereDo: 'Impulsuri pe HIGH la vibrații',
    inaltime: 40
  });
  modul({
    tip: 'nivel-apa', nume: 'Senzor de nivel al apei', eticheta: 'APA', pcb: '#b3262a', cuDo: false,
    cauta: 'nivel apa water level senzor rezervor',
    descriere: 'Pistele se scufundă în apă: cu cât apa e mai sus, cu atât AO (numit și S) e mai mare. Nu îl ține alimentat mereu — pistele se corodează; alimentează-l dintr-un pin doar când citești.',
    control: [{ cheie: 'nivel', eticheta: 'Nivelul apei pe senzor', min: 0, max: 100, pas: 1, unitate: '%', implicit: 20 }],
    ao: (inst) => ctl(inst, 'nivel', 20) <= 0 ? 0.001 : 0.2 + ctl(inst, 'nivel', 20) / 100 * 0.55 + zgomot(0.004),
    desenSenzor: (p, lat) => { let s = ''; for (let i = 0; i < 5; i++) s += `<rect x="${2 + i * 5}" y="-86" width="2" height="44" fill="#c9ccd1"/>`; return `<rect x="-2" y="-88" width="${lat - 10}" height="46" rx="1" fill="#b3262a"/>` + s; },
    inaltime: 40
  });
})(window.M = window.M || {});
