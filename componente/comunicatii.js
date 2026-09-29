/* Meșter — comunicații și memorie: ceasuri RTC (DS3231, DS1307), cititorul RFID RC522 cu carduri MIFARE,
   receptorul IR și telecomanda, GPS-ul NEO-6M, modulul Bluetooth HC-05 și modulul de card microSD.
   Modulele vorbesc cu placa prin protocoalele lor reale (I2C, SPI, UART, impulsuri IR NEC), iar
   bibliotecile simulate (RTClib, MFRC522, IRremote, TinyGPS++, SD) le găsesc după firele din schemă. */
(function (M) {
  'use strict';
  const D = M.desen;
  const tensiuneModul = (sim, inst, vcc, gnd) => M.tensiuneModul ? M.tensiuneModul(sim, inst, vcc, gnd) : 0;
  const ctl = (inst, k, implicit) => inst.control && inst.control[k] !== undefined ? +inst.control[k] : implicit;
  const antete = (pini, dy) => { let s = ''; for (const p of pini) { s += D.pinAntet(p.x, p.y); if (p.eticheta) s += D.text(p.x, p.y + (dy === undefined ? 5.5 : dy), p.eticheta, { m: 2.2, c: 'var(--text-2)' }); } return s; };
  const piniRand = (lista) => lista.map((p, i) => Object.assign({ x: i * 10, y: 0 }, p));
  const ledMic = (x, y, cheie, cul) => `<circle cx="${x}" cy="${y}" r="1.5" fill="rgba(0,0,0,.4)"/><circle cx="${x}" cy="${y}" r="1.2" fill="${cul || '#ff3b2f'}" opacity="0.15" data-r="${cheie}"/>`;
  const aprinde = (g, cheie, on) => { const e = g.querySelector('[data-r="' + cheie + '"]'); if (e) e.setAttribute('opacity', on ? 0.95 : 0.15); };
  const bcd = (v) => ((Math.floor(v / 10) % 10) << 4) | (v % 10);
  const dinBcd = (b) => ((b >> 4) & 15) * 10 + (b & 15);

  // ---------- timp calendaristic (secunde de la 1 ianuarie 2000, ca RTClib) ----------
  const ZILE_LUNA = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  function dinSecunde2000(t) {
    t = Math.floor(t);
    const ss = t % 60; t = Math.floor(t / 60);
    const mm = t % 60; t = Math.floor(t / 60);
    const hh = t % 24;
    let zile = Math.floor(t / 24);
    const dow = (zile + 6) % 7; // 1.1.2000 a fost sâmbătă (6)
    let an = 0;
    for (; ; an++) { const z = an % 4 === 0 ? 366 : 365; if (zile < z) break; zile -= z; }
    let luna = 1;
    for (; ; luna++) { let z = ZILE_LUNA[luna - 1]; if (luna === 2 && an % 4 === 0) z++; if (zile < z) break; zile -= z; }
    return { an: 2000 + an, luna, zi: zile + 1, ora: hh, min: mm, sec: ss, dow };
  }
  function laSecunde2000(an, luna, zi, ora, min, sec) {
    let y = an >= 2000 ? an - 2000 : an;
    let zile = zi - 1;
    for (let i = 1; i < luna; i++) zile += ZILE_LUNA[i - 1] + (i === 2 && y % 4 === 0 ? 1 : 0);
    zile += 365 * y + Math.floor((y + 3) / 4);
    return ((zile * 24 + ora) * 60 + min) * 60 + sec;
  }
  M.calendar = { dinSecunde2000, laSecunde2000, bcd, dinBcd };
  const acumLocal2000 = () => { const d = new Date(); return laSecunde2000(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()); };

  // ---------- RTC DS3231 / DS1307 ----------
  const RTC = {
    ds3231: { nume: 'DS3231 (modul ZS-042)', pini: ['32K', 'SQW', 'SCL', 'SDA', 'VCC', 'GND'], cip: 'DS3231' },
    ds1307: { nume: 'DS1307 (modul Tiny RTC)', pini: ['SQ', 'DS', 'SCL', 'SDA', 'VCC', 'GND', 'BAT'], cip: 'DS1307' }
  };
  M.componente.defineste({
    tip: 'rtc', nume: 'Ceas RTC (DS3231 / DS1307)', categorie: 'comunicatii', eticheta: 'RTC',
    cauta: 'rtc ceas timp real ds3231 ds1307 zs-042 tiny rtc data ora rtclib',
    descriere: 'Ceas de timp real pe I2C (adresa 0x68), cu baterie: ține ora și când placa e oprită. DS3231 e precis și are termometru și alarme (pinul SQW coboară la alarmă). DS1307 cere 5 V. Un modul nou are ora nesetată: în cod, dacă rtc.lostPower() e adevărat, setezi ora cu rtc.adjust(DateTime(F(__DATE__), F(__TIME__))).',
    prop: [
      { cheie: 'model', eticheta: 'Model', tip: 'alegere', optiuni: Object.keys(RTC).map(k => [k, RTC[k].nume]), implicit: 'ds3231' },
      { cheie: 'ora', eticheta: 'Ora la pornire', tip: 'alegere', optiuni: [['nesetata', 'Nesetată (baterie nouă)'], ['setata', 'Setată (ora de acum a calculatorului)']], implicit: 'nesetata' }
    ],
    control: [{ cheie: 'temperatura', eticheta: 'Temperatura (DS3231)', min: -10, max: 50, pas: 0.5, unitate: '°C', implicit: 24 }],
    alimentare: { min: 2.3, max: 5.5 },
    pini: (p) => piniRand((RTC[p.model] || RTC.ds3231).pini.map(id => ({ id, eticheta: id, tip: id === 'VCC' ? 'vcc' : id === 'GND' ? 'gnd' : id === 'SDA' ? 'i2c-sda' : id === 'SCL' ? 'i2c-scl' : id === 'SQW' || id === 'SQ' || id === '32K' ? 'iesire' : 'pasiv' }))),
    cutie: (p) => { const n = (RTC[p.model] || RTC.ds3231).pini.length; return { x: -7, y: -52, w: n * 10 + 4, h: 58 }; },
    desen(p) {
      const m = RTC[p.model] || RTC.ds3231;
      const w = m.pini.length * 10 + 2;
      let s = D.pcb(-6, -50, w, 46, { culoare: p.model === 'ds1307' ? '#1d5aa6' : '#1d5aa6', gauri: 2.4 });
      s += `<circle cx="${w / 2 - 6}" cy="-30" r="12" fill="#c9ccd1" stroke="#8a9099" stroke-width="0.6"/><circle cx="${w / 2 - 6}" cy="-30" r="10" fill="#dfe2e6"/>` + D.text(w / 2 - 6, -30, 'CR2032', { m: 2.4, c: '#555' });
      s += D.cip(w - 22, -44, 12, 9, { eticheta: m.cip, m: 1.7, picioare: 4, pasPicioare: 2.4 });
      if (p.model === 'ds3231') s += D.cip(w - 20, -24, 8, 5, { eticheta: '24C32', m: 1.2 });
      else s += `<rect x="${w - 22}" y="-26" width="10" height="4" rx="1" fill="#c9ccd1"/>`;
      s += ledMic(w - 10, -12, 'alim', '#ff3b2f');
      s += antete(this.pini(p));
      return s;
    },
    electric(ctx, inst) {
      const m = inst.prop.model;
      const r = { consum: ctx.R('VCC', 'GND', 25000), puSda: ctx.R('SDA', 'VCC', 4700), puScl: ctx.R('SCL', 'VCC', 4700) };
      const sqw = m === 'ds1307' ? 'SQ' : 'SQW';
      if (m !== 'ds1307') r.puSqw = ctx.R('SQW', 'VCC', 4700);
      r.sqw = ctx.iesire(sqw, () => { const d = ctx.sim && ctx.sim.disp.get(inst.id); return d && d.sqwJos && d.sqwJos() ? { v: 0, r: 60 } : null; });
      return r;
    },
    dispozitiv(inst, sim, el) {
      const m = inst.prop.model === 'ds1307' ? 'ds1307' : 'ds3231';
      const d = {
        familie: 'rtc', pinVcc: 'VCC', pinGnd: 'GND',
        reg: new Uint8Array(m === 'ds1307' ? 64 : 19), ptr: 0,
        sec0: 0, t0: 0, merge: true, osf: false, nivelSqw: 1, dowBaza: 1, zileBaza: 0,
        get adresaI2C() {
          // DS1307 sub ~4,5 V trece pe baterie și nu mai răspunde pe I2C
          if (m === 'ds1307' && tensiuneModul(sim, inst) < 4.3) {
            if (tensiuneModul(sim, inst) > 1) sim.problema('ds1307-v-' + inst.id, 'eroare', inst.eticheta + ' (DS1307) primește doar ' + M.fmtV(tensiuneModul(sim, inst)) + ': sub 4,5 V trece pe baterie și nu mai răspunde pe I2C. Alimentează-l din 5 V (VIN) sau folosește un DS3231, care merge și la 3,3 V.', { comp: inst.id });
            return undefined;
          }
          return 0x68;
        },
        start() {
          const setata = inst.prop.ora === 'setata';
          this.sec0 = setata ? acumLocal2000() : 0;
          this.t0 = sim.timp;
          this.osf = !setata;
          if (m === 'ds1307') { this.merge = setata; this.reg[7] = 0x03; }
          else { this.reg[0x0E] = 0x1C; this.reg[0x0F] = (setata ? 0 : 0x80) | 0x08; }
          const t = dinSecunde2000(this.sec0);
          this.dowBaza = m === 'ds1307' ? t.dow + 1 : (t.dow || 7);
          this.zileBaza = Math.floor(this.sec0 / 86400);
          this.programeazaSecunda();
        },
        acum() { return this.sec0 + (this.merge ? (sim.timp - this.t0) / 1e6 : 0); },
        // registrele de timp, din contorul intern
        actualizeazaTimp() {
          const s = this.acum();
          const t = dinSecunde2000(s);
          this.reg[0] = bcd(t.sec) | (m === 'ds1307' && !this.merge ? 0x80 : 0);
          this.reg[1] = bcd(t.min);
          this.reg[2] = bcd(t.ora);
          const zile = Math.floor(s / 86400);
          this.reg[3] = ((this.dowBaza - 1 + zile - this.zileBaza) % 7 + 7) % 7 + 1;
          this.reg[4] = bcd(t.zi);
          this.reg[5] = bcd(t.luna);
          this.reg[6] = bcd((t.an - 2000) % 100);
          if (m === 'ds3231') {
            const temp = Math.round(ctl(inst, 'temperatura', 24) * 4) / 4;
            const raw = Math.round(temp * 4) & 0x3FF;
            this.reg[0x11] = (raw >> 2) & 0xFF; this.reg[0x12] = (raw & 3) << 6;
            this.reg[0x0F] = (this.reg[0x0F] & 0x7F) | (this.osf ? 0x80 : 0);
          }
        },
        i2cScrie(o) {
          if (!o.length) return true;
          this.actualizeazaTimp();
          this.ptr = o[0] % this.reg.length;
          let timp = false;
          for (let i = 1; i < o.length; i++) {
            const a = this.ptr;
            if (a <= 6) timp = true;
            if (m === 'ds3231' && a === 0x0F) { this.reg[a] = (this.reg[a] & (o[i] | 0x7C) & 0x8F) | (o[i] & 0x08); this.osf = !!(this.reg[a] & 0x80) && this.osf; if (!(o[i] & 0x80)) this.osf = false; }
            else if (m === 'ds3231' && (a === 0x11 || a === 0x12)) { /* doar citire */ }
            else this.reg[a] = o[i] & 255;
            this.ptr = (this.ptr + 1) % this.reg.length;
          }
          if (timp) {
            const r = this.reg;
            const ora = (r[2] & 0x40) ? ((dinBcd(r[2] & 0x1F) % 12) + ((r[2] & 0x20) ? 12 : 0)) : dinBcd(r[2] & 0x3F);
            this.sec0 = laSecunde2000(2000 + dinBcd(r[6]), Math.max(1, dinBcd(r[5] & 0x1F)), Math.max(1, dinBcd(r[4] & 0x3F)), ora, dinBcd(r[1] & 0x7F), dinBcd(r[0] & 0x7F));
            this.t0 = sim.timp;
            this.dowBaza = r[3] & 7 || 1; this.zileBaza = Math.floor(this.sec0 / 86400);
            if (m === 'ds1307') this.merge = !(r[0] & 0x80);
          }
          if (m === 'ds3231' && o[0] <= 0x0E && o[0] + o.length - 1 >= 0x0E) this.programeazaSecunda();
          if (m === 'ds1307' && o[0] <= 7 && o[0] + o.length - 1 >= 7) this.programeazaSecunda();
          sim.murdarComponenta(inst);
          return true;
        },
        i2cCiteste(n) {
          this.actualizeazaTimp();
          const r = [];
          for (let i = 0; i < n; i++) { r.push(this.reg[this.ptr]); this.ptr = (this.ptr + 1) % this.reg.length; }
          return r;
        },
        // semnalul de pe SQW: undă de 1 Hz sau întrerupere de alarmă (activă pe LOW)
        sqwJos() {
          if (tensiuneModul(sim, inst) < 1.5) return false;
          if (m === 'ds1307') { const c = this.reg[7]; if (c & 0x10) return this.nivelSqw === 0; return !(c & 0x80); }
          const c = this.reg[0x0E];
          if (c & 0x04) return !!((this.reg[0x0F] & 1) && (c & 1)) || !!((this.reg[0x0F] & 2) && (c & 2));
          return this.nivelSqw === 0;
        },
        // la fiecare jumătate de secundă: unda pătrată, alarmele
        programeazaSecunda() {
          const tk = this.tokenSec = (this.tokenSec || 0) + 1;
          const pas = () => {
            if (tk !== this.tokenSec) return;
            const s = this.acum();
            const frac = s - Math.floor(s);
            this.nivelSqw = frac < 0.5 ? 1 : 0;
            if (m === 'ds3231' && frac < 0.5) this.verificaAlarme(Math.floor(s));
            sim.murdarComponenta(inst);
            const urm = (frac < 0.5 ? 0.5 - frac : 1 - frac) * 1e6;
            sim.programeaza(Math.max(1000, urm), pas);
          };
          const s = this.acum(), frac = s - Math.floor(s);
          sim.programeaza(Math.max(1000, (frac < 0.5 ? 0.5 - frac : 1 - frac) * 1e6), pas);
        },
        verificaAlarme(sec) {
          if (this.ultimaVerif === sec) return;
          this.ultimaVerif = sec;
          const t = dinSecunde2000(sec), r = this.reg;
          const zi = ((this.dowBaza - 1 + Math.floor(sec / 86400) - this.zileBaza) % 7 + 7) % 7 + 1;
          const potriveste = (baza, cuSec) => {
            const m1 = cuSec ? (r[baza] >> 7) & 1 : 1, m2 = (r[baza + (cuSec ? 1 : 0)] >> 7) & 1, m3 = (r[baza + (cuSec ? 2 : 1)] >> 7) & 1, m4 = (r[baza + (cuSec ? 3 : 2)] >> 7) & 1;
            const o = cuSec ? 1 : 0;
            if (!cuSec && t.sec !== 0) return false;
            const okS = !cuSec || m1 || dinBcd(r[baza] & 0x7F) === t.sec;
            const okM = m2 || dinBcd(r[baza + o] & 0x7F) === t.min;
            const okH = m3 || dinBcd(r[baza + o + 1] & 0x3F) === t.ora;
            const zz = r[baza + o + 2];
            const okD = m4 || ((zz & 0x40) ? (zz & 0x0F) === zi : dinBcd(zz & 0x3F) === t.zi);
            return okS && okM && okH && okD;
          };
          if (potriveste(0x07, true)) r[0x0F] |= 1;
          if (potriveste(0x0B, false)) r[0x0F] |= 2;
        }
      };
      return d;
    },
    vizual(g, inst, sim) { aprinde(g, 'alim', sim && tensiuneModul(sim, inst) > 2); },
    masura(el, inst, sim, disp) {
      if (!disp) return [];
      const t = dinSecunde2000(disp.acum());
      const d2 = (x) => String(x).padStart(2, '0');
      return [['Ora din cip', t.an + '-' + d2(t.luna) + '-' + d2(t.zi) + ' ' + d2(t.ora) + ':' + d2(t.min) + ':' + d2(t.sec)], ['Stare', disp.merge ? (disp.osf ? 'merge, dar ora a fost pierdută (OSF)' : 'merge') : 'oprit (CH = 1)']];
    }
  });

  // ---------- RFID RC522 ----------
  const CARDURI = [
    null,
    { nume: 'Card alb MIFARE 1K', uid: [0xDE, 0xAD, 0xBE, 0xEF] },
    { nume: 'Breloc albastru MIFARE 1K', uid: [0x04, 0xA1, 0xB2, 0xC3] },
    { nume: 'Card străin MIFARE 1K', uid: [0x13, 0x37, 0xC0, 0xDE] }
  ];
  const uidText = (u) => u.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  // memoria unui card MIFARE Classic 1K nou: 16 sectoare × 4 blocuri de 16 octeți
  function cardNou(uid) {
    const b = [];
    for (let i = 0; i < 64; i++) b.push(new Array(16).fill(0));
    const bcc = uid[0] ^ uid[1] ^ uid[2] ^ uid[3];
    b[0] = [...uid, bcc, 0x08, 0x04, 0x00, 0x62, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69];
    for (let s = 0; s < 16; s++) b[s * 4 + 3] = [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x07, 0x80, 0x69, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF];
    return { uid: uid.slice(), sak: 0x08, blocuri: b };
  }
  M.componente.defineste({
    tip: 'rc522', nume: 'Cititor RFID RC522', categorie: 'comunicatii', eticheta: 'RFID',
    cauta: 'rfid rc522 mfrc522 nfc card breloc cititor 13.56 mifare acces',
    descriere: 'Citește carduri și brelocuri RFID de 13,56 MHz (MIFARE) pe SPI: SDA = CS, SCK, MOSI, MISO, plus RST. Doar 3,3 V! Alege cardul din controale și apasă pe antenă ca să-l apropii. Fiecare card are UID-ul lui și 1 KB de memorie în care poți scrie.',
    control: [{ cheie: 'card', eticheta: 'Cardul apropiat', min: 0, max: 3, pas: 1, implicit: 0, format: (v) => v ? CARDURI[Math.round(v)].nume + ' (' + uidText(CARDURI[Math.round(v)].uid) + ')' : 'niciun card' }],
    alimentare: { vcc: '3V3', min: 2.5, max: 3.6 },
    pini: () => piniRand([
      { id: 'SDA', eticheta: 'SDA', tip: 'intrare', descriere: 'Selecția cipului (SS / CS) pe SPI' }, { id: 'SCK', eticheta: 'SCK', tip: 'intrare' }, { id: 'MOSI', eticheta: 'MOSI', tip: 'intrare' },
      { id: 'MISO', eticheta: 'MISO', tip: 'iesire' }, { id: 'IRQ', eticheta: 'IRQ', tip: 'iesire' }, { id: 'GND', eticheta: 'GND', tip: 'gnd' }, { id: 'RST', eticheta: 'RST', tip: 'intrare' }, { id: '3V3', eticheta: '3.3V', tip: 'vcc', descriere: 'Doar 3,3 V' }]),
    cutie: () => ({ x: -8, y: -86, w: 86, h: 92 }),
    desen() {
      let s = D.pcb(-7, -84, 84, 80, { culoare: '#1d5aa6', gauri: 3 });
      s += `<g data-act="apropie" class="interactiv"><rect x="4" y="-78" width="62" height="50" rx="3" fill="none" stroke="#c9a64b" stroke-width="1.4"/>`;
      s += `<rect x="9" y="-73" width="52" height="40" rx="2" fill="none" stroke="#c9a64b" stroke-width="1.2"/><rect x="14" y="-68" width="42" height="30" rx="2" fill="none" stroke="#c9a64b" stroke-width="1"/>`;
      s += `<rect x="4" y="-78" width="62" height="50" fill="transparent"/>`;
      s += `<g data-r="card" opacity="0"><rect x="10" y="-86" width="50" height="32" rx="3" fill="#f4f4ef" stroke="#9aa0a8" stroke-width="0.6" transform="rotate(-8 35 -70)"/><text x="35" y="-70" font-size="4" text-anchor="middle" fill="#555" transform="rotate(-8 35 -70)" data-r="uid"></text></g></g>`;
      s += D.cip(48, -24, 12, 12, { eticheta: 'RC522', m: 1.8 });
      s += `<rect x="30" y="-22" width="8" height="5" rx="0.6" fill="#b9bec6"/>`;
      s += ledMic(8, -12, 'alim', '#ff3b2f');
      s += antete(this.pini());
      return s;
    },
    electric(ctx) { return { consum: ctx.R('3V3', 'GND', 260), irq: ctx.iesire('IRQ', () => null) }; },
    dispozitiv(inst, sim) {
      inst.carduri = inst.carduri || {};
      return {
        familie: 'rfid', stareCard: 'departe', indexCard: 0, apropiatPana: 0,
        start() { this.urmareste(); },
        cardCurent() {
          let i = Math.round(ctl(inst, 'card', 0));
          if (!i && sim.timp < this.apropiatPana) i = this.indexTap || 1;
          if (!i) return null;
          const c = CARDURI[i];
          const cheie = uidText(c.uid);
          if (!inst.carduri[cheie]) inst.carduri[cheie] = cardNou(c.uid);
          return inst.carduri[cheie];
        },
        // un card nou apropiat pleacă din starea IDLE (răspunde la REQA); după HALT așteaptă să fie îndepărtat
        urmareste() {
          const c = this.cardCurent();
          const id = c ? uidText(c.uid) : '';
          if (id !== this.idCurent) { this.idCurent = id; this.stareCard = c ? 'idle' : 'departe'; this.autentificat = null; }
        },
        alimentat() { return tensiuneModul(sim, inst, '3V3', 'GND') > 2.4; }
      };
    },
    laControl(inst, el, sim) { const d = sim.disp.get(inst.id); if (d) d.urmareste(); },
    actiune(inst, act, faza, el, sim, disp) {
      if (act !== 'apropie' || faza !== 'jos' || !disp) return;
      disp.indexTap = Math.round(ctl(inst, 'card', 0)) || 1;
      disp.apropiatPana = sim.timp + 1200000;
      disp.urmareste();
      sim.programeaza(1200001, () => disp.urmareste());
    },
    vizual(g, inst, sim, el, disp) {
      aprinde(g, 'alim', sim && tensiuneModul(sim, inst, '3V3', 'GND') > 2.4);
      const c = g.querySelector('[data-r="card"]');
      let i = Math.round(ctl(inst, 'card', 0));
      if (!i && disp && sim && sim.timp < disp.apropiatPana) i = disp.indexTap || 1;
      if (c) c.setAttribute('opacity', i ? 0.92 : 0);
      const u = g.querySelector('[data-r="uid"]');
      if (u && i) u.textContent = 'UID ' + uidText(CARDURI[i].uid);
    },
    masura(el, inst, sim, disp) { return disp ? [['Card', disp.idCurent ? 'UID ' + disp.idCurent : 'niciunul'], ['Stare card', disp.stareCard]] : []; }
  });
  M.rfid = { CARDURI, uidText, cardNou };

  // ---------- IR: telecomanda și receptorul ----------
  // protocolul NEC: 9 ms puls, 4,5 ms pauză, 32 de biți (562 µs puls + 562 / 1687 µs pauză), bit de stop;
  // cât timp tasta e ținută apăsată, la fiecare 108 ms vine un cod de repetare (9 ms, 2,25 ms, 562 µs)
  const IR = {
    trimite(sim, adresa, comanda, repetare) {
      const d = [];
      if (repetare) d.push(9000, 2250, 562);
      else {
        d.push(9000, 4500);
        const octeti = [adresa & 255, (~adresa) & 255, comanda & 255, (~comanda) & 255];
        for (const o of octeti) for (let b = 0; b < 8; b++) d.push(562, (o >> b) & 1 ? 1687 : 562);
        d.push(562);
      }
      for (const r of sim.dispozitive(['ir-receptor'])) r.primesteLumina(d);
    }
  };
  M.ir = IR;
  M.componente.defineste({
    tip: 'ir-receptor', nume: 'Receptor IR (VS1838B / KY-022)', categorie: 'comunicatii', eticheta: 'IR',
    cauta: 'ir infrarosu receptor vs1838b ky-022 tsop telecomanda 38khz',
    descriere: 'Primește comenzile unei telecomenzi cu infraroșu (38 kHz) și le scoate pe OUT ca impulsuri: LOW cât timp vine lumină, HIGH în rest. Biblioteca IRremote le decodează. Pune pe schemă și o telecomandă IR și apasă-i tastele.',
    prop: [{ cheie: 'model', eticheta: 'Model', tip: 'alegere', optiuni: [['vs1838b', 'VS1838B (3 picioare: OUT, GND, VCC)'], ['ky022', 'Modul KY-022 (S, VCC, −)']], implicit: 'vs1838b' }],
    alimentare: { min: 2.7, max: 5.5 },
    pini: (p) => p.model === 'ky022'
      ? [{ id: 'OUT', x: 0, y: 0, eticheta: 'S', tip: 'iesire' }, { id: 'VCC', x: 10, y: 0, eticheta: '+', tip: 'vcc' }, { id: 'GND', x: 20, y: 0, eticheta: '−', tip: 'gnd' }]
      : [{ id: 'OUT', x: 0, y: 0, eticheta: 'OUT', tip: 'iesire' }, { id: 'GND', x: 10, y: 0, eticheta: 'GND', tip: 'gnd' }, { id: 'VCC', x: 20, y: 0, eticheta: 'VCC', tip: 'vcc' }],
    cutie: (p) => p.model === 'ky022' ? { x: -6, y: -40, w: 32, h: 46 } : { x: -4, y: -30, w: 28, h: 33 },
    desen(p) {
      let s = '';
      if (p.model === 'ky022') {
        s += D.pcb(-5, -38, 30, 34, { culoare: '#1c1f24', gauri: 2 });
        s += `<rect x="3" y="-34" width="14" height="14" rx="2" fill="#15171a"/><circle cx="10" cy="-27" r="4.6" fill="#2a2d33" stroke="#444" stroke-width="0.5"/><circle cx="10" cy="-27" r="2.4" fill="#3b3f46"/>`;
        s += ledMic(20, -12, 'led', '#ff3b2f');
        s += antete(this.pini(p));
      } else {
        s += D.picior(0, 0, 0, -8) + D.picior(10, 0, 10, -8) + D.picior(20, 0, 20, -8);
        s += `<rect x="-2" y="-26" width="24" height="18" rx="2" fill="#15171a"/><rect x="0" y="-24" width="20" height="3" fill="#2a2d33"/>`;
        s += `<ellipse cx="10" cy="-17" rx="6" ry="6.5" fill="#23262b" stroke="#3b3f46" stroke-width="0.5"/><ellipse cx="10" cy="-17" rx="3.2" ry="3.6" fill="#30343a"/>`;
        s += `<circle cx="10" cy="-17" r="1.3" fill="#ff5a4a" opacity="0" data-r="led"/>`;
      }
      return s;
    },
    electric(ctx, inst, sim) {
      return {
        consum: ctx.R('VCC', 'GND', 12000),
        out: ctx.iesire('OUT', () => {
          const v = tensiuneModul(sim, inst);
          if (v < 2.5) return null;
          const d = sim && sim.disp.get(inst.id);
          return d && d.lumina ? { v: 0, r: 80 } : { v, r: 20000 };
        })
      };
    },
    dispozitiv(inst, sim) {
      return {
        familie: 'ir', lumina: false, ocupatPana: 0,
        primesteLumina(durate) {
          if (tensiuneModul(sim, inst) < 2.5) return;
          let t = Math.max(0, this.ocupatPana - sim.timp);
          let lumina = true;
          for (const us of durate) {
            const aprinde = lumina;
            sim.programeaza(t, () => { this.lumina = aprinde; sim.murdarComponenta(inst); });
            t += us; lumina = !lumina;
          }
          sim.programeaza(t, () => { this.lumina = false; sim.murdarComponenta(inst); });
          this.ocupatPana = sim.timp + t + 200;
        }
      };
    },
    vizual(g, inst, sim, el, disp) { const l = g.querySelector('[data-r="led"]'); if (l) l.setAttribute('opacity', disp && disp.lumina ? 0.9 : (inst.prop.model === 'ky022' ? 0.15 : 0)); }
  });
  // telecomanda cu 17 taste (codurile NEC ale telecomenzilor din kiturile pentru Arduino / ESP32)
  const TASTE_IR = [
    ['1', 0x45], ['2', 0x46], ['3', 0x47], ['4', 0x44], ['5', 0x40], ['6', 0x43], ['7', 0x07], ['8', 0x15], ['9', 0x09],
    ['*', 0x16], ['0', 0x19], ['#', 0x0D], ['▲', 0x18], ['◀', 0x08], ['OK', 0x1C], ['▶', 0x5A], ['▼', 0x52]
  ];
  M.componente.defineste({
    tip: 'telecomanda-ir', nume: 'Telecomandă IR (17 taste)', categorie: 'comunicatii', eticheta: 'TEL',
    cauta: 'telecomanda ir infrarosu remote nec taste',
    descriere: 'Telecomandă cu infraroșu (protocol NEC, adresa 0x00). Apasă tastele în timpul simulării: toate receptoarele IR din schemă primesc codul. Ținută apăsat, trimite coduri de repetare la fiecare 108 ms.',
    faraConexiuni: true,
    pini: () => [],
    cutie: () => ({ x: -2, y: -132, w: 54, h: 134 }),
    desen() {
      let s = `<rect x="0" y="-130" width="50" height="130" rx="10" fill="#1d1f24" stroke="#000" stroke-width="0.6"/>`;
      s += `<circle cx="25" cy="-122" r="2.4" fill="#5a1e1e" data-r="led"/>`;
      const poz = { '▲': [25, -106], '◀': [11, -94], 'OK': [25, -94], '▶': [39, -94], '▼': [25, -82] };
      TASTE_IR.forEach(([k, cod], i) => {
        let x, y;
        if (poz[k]) [x, y] = poz[k];
        else { const j = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].indexOf(k); x = 11 + (j % 3) * 14; y = -66 + Math.floor(j / 3) * 15; }
        s += `<g data-act="k${cod}" class="interactiv"><circle cx="${x}" cy="${y}" r="5.6" fill="${k === 'OK' ? '#c62828' : '#3a3d44'}" stroke="#111" stroke-width="0.4"/>` + D.text(x, y + 0.2, k, { m: k.length > 1 ? 3 : 3.8, c: '#f1f1ea', g: 700 }) + '</g>';
      });
      return s;
    },
    dispozitiv(inst, sim) {
      return {
        familie: 'telecomanda', apasata: null,
        apasa(cod) {
          this.apasata = cod;
          IR.trimite(sim, 0x00, cod, false);
          const tk = this.tk = (this.tk || 0) + 1;
          const repeta = () => { if (this.apasata !== cod || tk !== this.tk) return; IR.trimite(sim, 0, cod, true); sim.programeaza(108000, repeta); };
          sim.programeaza(108000, repeta);
        },
        elibereaza() { this.apasata = null; }
      };
    },
    actiune(inst, act, faza, el, sim, disp) {
      if (!disp || !/^k\d+$/.test(act)) return;
      if (faza === 'jos') disp.apasa(+act.slice(1)); else disp.elibereaza();
    },
    vizual(g, inst, sim, el, disp) { const l = g.querySelector('[data-r="led"]'); if (l) l.setAttribute('fill', disp && disp.apasata !== null ? '#ff3b2f' : '#5a1e1e'); }
  });
  M.ir.TASTE = TASTE_IR;

  // ---------- GPS NEO-6M ----------
  M.componente.defineste({
    tip: 'gps-neo6m', nume: 'GPS NEO-6M', categorie: 'comunicatii', eticheta: 'GPS',
    cauta: 'gps neo-6m neo6m gy-neo6mv2 locatie coordonate nmea tinygps satelit',
    descriere: 'Receptor GPS pe serial (9600 baud): trimite în fiecare secundă propoziții NMEA ($GPRMC, $GPGGA…) cu poziția, ora (UTC), viteza și sateliții. În casă nu prinde semnal; afară are nevoie de câteva secunde pentru prima poziție (LED-ul clipește după ce o găsește). TX-ul modulului la RX-ul plăcii.',
    control: [
      { cheie: 'semnal', eticheta: 'Unde e antena', min: 0, max: 2, pas: 1, implicit: 1, format: (v) => ['În casă (fără semnal)', 'Afară, pornire la cald (~5 s)', 'Afară, pornire la rece (~30 s)'][Math.round(v)] },
      { cheie: 'lat', eticheta: 'Latitudine', min: 43.6, max: 48.3, pas: 0.0001, unitate: '°', implicit: 44.4268 },
      { cheie: 'lon', eticheta: 'Longitudine', min: 20.2, max: 29.7, pas: 0.0001, unitate: '°', implicit: 26.1025 },
      { cheie: 'viteza', eticheta: 'Viteză', min: 0, max: 130, pas: 1, unitate: 'km/h', implicit: 0 },
      { cheie: 'curs', eticheta: 'Direcție', min: 0, max: 359, pas: 1, unitate: '°', implicit: 90 }
    ],
    alimentare: { min: 3, max: 5.5 },
    pini: () => piniRand([{ id: 'VCC', eticheta: 'VCC', tip: 'vcc' }, { id: 'RX', eticheta: 'RX', tip: 'intrare' }, { id: 'TX', eticheta: 'TX', tip: 'iesire', descriere: 'Datele NMEA, la RX-ul plăcii' }, { id: 'GND', eticheta: 'GND', tip: 'gnd' }]),
    cutie: () => ({ x: -12, y: -66, w: 56, h: 72 }),
    desen() {
      let s = D.pcb(-11, -64, 54, 60, { culoare: '#1d5aa6', gauri: 3 });
      s += `<rect x="-4" y="-58" width="40" height="40" rx="2" fill="#c9a64b" stroke="#8a6b3a" stroke-width="0.6"/><rect x="2" y="-52" width="28" height="28" rx="1" fill="#e2c16d"/><circle cx="16" cy="-38" r="3" fill="#b99a4a"/>`;
      s += D.text(16, -30, 'GPS', { m: 3.2, c: '#6b5424' });
      s += ledMic(36, -12, 'fix', '#3cff5a');
      s += antete(this.pini());
      return s;
    },
    electric(ctx, inst, sim) {
      return { consum: ctx.R('VCC', 'GND', 110), tx: ctx.iesire('TX', () => tensiuneModul(sim, inst) > 2.7 ? { v: 3.3, r: 500 } : null) };
    },
    dispozitiv(inst, sim) {
      return {
        familie: 'gps', uart: { tx: 'TX', rx: 'RX', baud: 9600 }, fixLa: 0, fix: false, pornit: -1, dist: 0, lat: 0, lon: 0, ledPana: 0,
        start() {
          this.pornit = sim.timp;
          this.lat = ctl(inst, 'lat', 44.4268); this.lon = ctl(inst, 'lon', 26.1025);
          const s = Math.round(ctl(inst, 'semnal', 1));
          this.fixLa = s === 0 ? Infinity : sim.timp + (s === 1 ? 4.5e6 : 29e6);
          this.tOraUtc = Date.now() / 1000;
          sim.programeaza(1000000 - (sim.timp % 1000000) + 50000, () => this.secunda());
        },
        laControl(k) {
          if (k === 'semnal') { const s = Math.round(ctl(inst, 'semnal', 1)); if (s === 0) { this.fixLa = Infinity; this.fix = false; } else if (!this.fix && this.fixLa === Infinity) this.fixLa = sim.timp + (s === 1 ? 4.5e6 : 29e6); }
          if (k === 'lat' || k === 'lon') { this.lat = ctl(inst, 'lat', 44.4268); this.lon = ctl(inst, 'lon', 26.1025); }
        },
        secunda() {
          sim.programeaza(1000000, () => this.secunda());
          if (tensiuneModul(sim, inst) < 2.7) return;
          this.fix = sim.timp >= this.fixLa;
          // deplasare cu viteza și direcția alese
          const v = ctl(inst, 'viteza', 0) / 3.6, c = ctl(inst, 'curs', 90) * Math.PI / 180;
          if (this.fix && v > 0) { this.lat += v * Math.cos(c) / 111320; this.lon += v * Math.sin(c) / (111320 * Math.cos(this.lat * Math.PI / 180)); }
          if (this.fix) this.ledPana = sim.timp + 100000;
          this.trimiteLent(this.propozitii());
          sim.murdarComponenta(inst);
        },
        // caracterele pleacă în ritmul liniei seriale (9600 baud ≈ 1 caracter pe 1,04 ms)
        trimiteLent(text) {
          const bucata = 12, pas = 12 * 1042;
          for (let i = 0; i * bucata < text.length; i++) {
            const t = text.slice(i * bucata, (i + 1) * bucata);
            sim.programeaza(i * pas, () => { if (this.uartSpre) this.uartSpre(t); });
          }
        },
        propozitii() {
          const utc = new Date((this.tOraUtc + (sim.timp - this.pornit) / 1e6) * 1000);
          const d2 = (x) => String(x).padStart(2, '0');
          const ora = d2(utc.getUTCHours()) + d2(utc.getUTCMinutes()) + d2(utc.getUTCSeconds()) + '.00';
          const data = d2(utc.getUTCDate()) + d2(utc.getUTCMonth() + 1) + d2(utc.getUTCFullYear() % 100);
          const cs = (p) => { let x = 0; for (let i = 0; i < p.length; i++) x ^= p.charCodeAt(i); return '$' + p + '*' + x.toString(16).toUpperCase().padStart(2, '0') + '\r\n'; };
          const coord = (v, lat) => {
            const a = Math.abs(v), g = Math.floor(a), m = (a - g) * 60;
            return (lat ? d2(g) : String(g).padStart(3, '0')) + m.toFixed(5).padStart(8, '0') + ',' + (lat ? (v >= 0 ? 'N' : 'S') : (v >= 0 ? 'E' : 'W'));
          };
          const tremur = () => (Math.random() - 0.5) * 0.00003;
          const lat = this.lat + tremur(), lon = this.lon + tremur();
          const nd = this.fix ? ctl(inst, 'viteza', 0) / 1.852 : 0;
          const sat = this.fix ? 7 + Math.floor(Math.random() * 3) : (sim.timp - this.pornit > 3e6 && isFinite(this.fixLa) ? 2 : 0);
          let s = '';
          if (this.fix) {
            s += cs('GPRMC,' + ora + ',A,' + coord(lat, true) + ',' + coord(lon, false) + ',' + nd.toFixed(3) + ',' + (nd > 0.5 ? ctl(inst, 'curs', 90).toFixed(2) : '') + ',' + data + ',,,A');
            s += cs('GPVTG,' + (nd > 0.5 ? ctl(inst, 'curs', 90).toFixed(2) : '') + ',T,,M,' + nd.toFixed(3) + ',N,' + (nd * 1.852).toFixed(3) + ',K,A');
            s += cs('GPGGA,' + ora + ',' + coord(lat, true) + ',' + coord(lon, false) + ',1,' + d2(sat) + ',1.05,' + (82.4 + Math.random()).toFixed(1) + ',M,36.9,M,,');
            s += cs('GPGSA,A,3,05,07,13,15,20,24,28,30' + (sat > 8 ? ',02' : ',') + ',,,,1.89,1.05,1.57');
          } else {
            s += cs('GPRMC,' + (sim.timp - this.pornit > 1.5e6 ? ora : '') + ',V,,,,,,,' + (sim.timp - this.pornit > 1.5e6 ? data : '') + ',,,N');
            s += cs('GPVTG,,,,,,,,,N');
            s += cs('GPGGA,' + (sim.timp - this.pornit > 1.5e6 ? ora : '') + ',,,,,0,' + d2(sat) + ',99.99,,,,,,');
            s += cs('GPGSA,A,1,,,,,,,,,,,,,99.99,99.99,99.99');
          }
          s += cs('GPGSV,1,1,' + d2(sat) + (sat ? ',05,42,061,35,07,65,172,40,13,28,298,31,15,12,041,27' : ''));
          s += cs('GPGLL,' + (this.fix ? coord(lat, true) + ',' + coord(lon, false) + ',' + ora + ',A,A' : ',,,,' + ora + ',V,N'));
          return s;
        }
      };
    },
    laControl(inst, el, sim) { },
    vizual(g, inst, sim, el, disp) { aprinde(g, 'fix', disp && sim && sim.timp < disp.ledPana); },
    masura(el, inst, sim, disp) { return disp ? [['Poziție', disp.fix ? disp.lat.toFixed(5) + ', ' + disp.lon.toFixed(5) : 'caută sateliți…']] : []; }
  });

  // ---------- HC-05 (Bluetooth clasic, serial) ----------
  M.componente.defineste({
    tip: 'hc05', nume: 'Modul Bluetooth HC-05', categorie: 'comunicatii', eticheta: 'BT',
    cauta: 'hc-05 hc05 hc-06 bluetooth serial telefon modul wireless',
    descriere: 'Modul Bluetooth clasic cu port serial (9600 baud): tot ce primește pe RXD pleacă la telefon și invers. Telefonul simulat e în fila Monitor serial → „Telefon (Bluetooth)”. LED-ul clipește repede până se conectează telefonul, apoi rar; STATE e HIGH cât e conectat. Cu EN pe HIGH la pornire intră în modul AT (38400 baud).',
    alimentare: { min: 3.6, max: 6 },
    pini: () => piniRand([{ id: 'STATE', eticheta: 'STATE', tip: 'iesire' }, { id: 'RXD', eticheta: 'RXD', tip: 'intrare', descriere: 'Primește de la TX-ul plăcii (3,3 V)' }, { id: 'TXD', eticheta: 'TXD', tip: 'iesire', descriere: 'Trimite la RX-ul plăcii' }, { id: 'GND', eticheta: 'GND', tip: 'gnd' }, { id: 'VCC', eticheta: 'VCC', tip: 'vcc', descriere: '3,6–6 V (de obicei 5 V)' }, { id: 'EN', eticheta: 'EN', tip: 'intrare', descriere: 'HIGH la pornire = modul AT' }]),
    cutie: () => ({ x: -6, y: -84, w: 62, h: 90 }),
    desen() {
      let s = D.pcb(-5, -82, 60, 78, { culoare: '#1d5aa6', gauri: false });
      s += `<rect x="4" y="-80" width="42" height="56" rx="1" fill="#2d7a3f"/><path d="M10 -76 h30 v5 h-26 v5 h26 v5 h-26" stroke="#c9a64b" stroke-width="1.2" fill="none"/>`;
      s += D.cip(12, -52, 26, 16, { eticheta: 'HC-05', m: 3, culoare: '#1f2124' });
      s += `<rect x="40" y="-20" width="8" height="5" rx="1" fill="#c9ccd1"/>`;
      s += ledMic(8, -14, 'led', '#ff3b2f');
      s += antete(this.pini());
      return s;
    },
    electric(ctx, inst, sim) {
      const d = () => sim && sim.disp.get(inst.id);
      return {
        consum: ctx.R('VCC', 'GND', 125),
        tx: ctx.iesire('TXD', () => tensiuneModul(sim, inst) > 3.4 ? { v: 3.3, r: 500 } : null),
        stare: ctx.iesire('STATE', () => { if (tensiuneModul(sim, inst) < 3.4) return null; const x = d(); return x && x.conectat ? { v: 3.3, r: 300 } : { v: 0, r: 300 }; })
      };
    },
    dispozitiv(inst, sim) {
      return {
        familie: 'bluetooth', uart: { tx: 'TXD', rx: 'RXD', baud: 9600 }, conectat: false, modAT: false, nume: 'HC-05', tampon: '',
        start() {
          const nEn = sim.netPin(inst, 'EN');
          this.modAT = !sim.flotant(nEn) && sim.circuit.tensiune(nEn) > 2;
          if (this.modAT) { this.uart.baud = 38400; sim.problema('hc05-at-' + inst.id, 'info', inst.eticheta + ' a pornit în modul AT (EN pe HIGH): comunică la 38400 baud și răspunde la comenzi AT, nu trimite nimic la telefon.', { comp: inst.id }); }
          if (M.bluetooth) M.bluetooth.inregistreaza(sim, { tip: 'hc05', nume: () => this.nume, disp: this, dinTelefon: (t) => { if (this.uartSpre) this.uartSpre(t); } });
        },
        uartPrimeste(t) {
          if (tensiuneModul(sim, inst) < 3.4) return;
          if (this.modAT) {
            this.tampon += t;
            let i;
            while ((i = this.tampon.indexOf('\n')) >= 0) {
              const cmd = this.tampon.slice(0, i).replace(/\r$/, '').trim();
              this.tampon = this.tampon.slice(i + 1);
              const r = this.comandaAT(cmd);
              if (r !== null) sim.programeaza(20000, () => { if (this.uartSpre) this.uartSpre(r); });
            }
            return;
          }
          if (this.conectat && M.bluetooth) M.bluetooth.laTelefon(sim, t, this.nume);
        },
        comandaAT(cmd) {
          const c = cmd.toUpperCase();
          if (c === 'AT') return 'OK\r\n';
          if (c === 'AT+VERSION?') return '+VERSION:2.0-20100601\r\nOK\r\n';
          if (c === 'AT+NAME?') return '+NAME:' + this.nume + '\r\nOK\r\n';
          if (c.startsWith('AT+NAME=')) { this.nume = cmd.slice(8) || 'HC-05'; return 'OK\r\n'; }
          if (c === 'AT+UART?') return '+UART:9600,0,0\r\nOK\r\n';
          if (c === 'AT+ROLE?') return '+ROLE:0\r\nOK\r\n';
          if (c === 'AT+PSWD?') return '+PSWD:1234\r\nOK\r\n';
          if (c === 'AT+ADDR?') return '+ADDR:98d3:31:fd1234\r\nOK\r\n';
          if (c.startsWith('AT+')) return 'OK\r\n';
          return cmd ? 'ERROR:(0)\r\n' : null;
        }
      };
    },
    vizual(g, inst, sim, el, disp) {
      const l = g.querySelector('[data-r="led"]');
      if (!l) return;
      if (!sim || !disp || tensiuneModul(sim, inst) < 3.4) { l.setAttribute('opacity', 0.15); return; }
      const t = sim.timp / 1e6;
      const on = disp.modAT ? (t % 2) < 1 : disp.conectat ? ((t % 2) < 0.1 || ((t % 2) > 0.2 && (t % 2) < 0.3)) : (t % 0.2) < 0.1;
      l.setAttribute('opacity', on ? 0.95 : 0.15);
    },
    masura(el, inst, sim, disp) { return disp ? [['Stare', disp.modAT ? 'mod AT (38400 baud)' : disp.conectat ? 'conectat la telefon' : 'așteaptă conectarea']] : []; }
  });

  // ---------- card microSD ----------
  M.componente.defineste({
    tip: 'card-sd', nume: 'Modul card microSD', categorie: 'comunicatii', eticheta: 'SD',
    cauta: 'sd card microsd modul spi fisiere memorie log fat32',
    descriere: 'Card microSD pe SPI (CS, SCK, MOSI, MISO). Modulul obișnuit are regulator și convertor de nivel: vrea 5 V pe VCC — la 3,3 V cardul nu pornește. Fișierele scrise din cod rămân pe card (le vezi aici, în panoul piesei) și după oprirea simulării.',
    prop: [
      { cheie: 'model', eticheta: 'Modul', tip: 'alegere', optiuni: [['regulator', 'Cu regulator (VCC 5 V)'], ['direct', 'Fără regulator (VCC 3,3 V)']], implicit: 'regulator' },
      { cheie: 'card', eticheta: 'Card', tip: 'alegere', optiuni: [['sdhc', 'microSDHC 8 GB, FAT32'], ['lipsa', 'Fără card'], ['nefromatat', 'Card neformatat (exFAT)']], implicit: 'sdhc' }
    ],
    alimentare: { min: 3, max: 5.5 },
    pini: () => piniRand([{ id: 'CS', eticheta: 'CS', tip: 'intrare' }, { id: 'SCK', eticheta: 'SCK', tip: 'intrare' }, { id: 'MOSI', eticheta: 'MOSI', tip: 'intrare' }, { id: 'MISO', eticheta: 'MISO', tip: 'iesire' }, { id: 'VCC', eticheta: 'VCC', tip: 'vcc' }, { id: 'GND', eticheta: 'GND', tip: 'gnd' }]),
    cutie: () => ({ x: -6, y: -68, w: 62, h: 74 }),
    desen(p) {
      let s = D.pcb(-5, -66, 60, 62, { culoare: '#1d5aa6', gauri: 3 });
      s += `<rect x="8" y="-62" width="34" height="34" rx="2" fill="#b9bec6" stroke="#8a9099" stroke-width="0.6"/><rect x="11" y="-59" width="28" height="26" rx="1" fill="#cfd3d9"/>`;
      if (p.card !== 'lipsa') s += `<rect x="14" y="-50" width="22" height="16" rx="1.5" fill="#16181b"/>` + D.text(25, -42, 'microSD', { m: 2.4, c: '#9aa0a8' });
      if (p.model === 'regulator') s += D.cip(6, -22, 12, 8, { eticheta: 'AMS1117', m: 1.5 }) + D.cip(30, -22, 14, 8, { eticheta: 'LVC125', m: 1.5 });
      s += antete(this.pini());
      return s;
    },
    electric(ctx, inst) { return { consum: ctx.R('VCC', 'GND', inst.prop.model === 'regulator' ? 90 : 60) }; },
    dispozitiv(inst, sim) {
      inst.card = inst.card || { fisiere: {} };
      return {
        familie: 'sd', fs: inst.card,
        tensiuneCard() { const v = tensiuneModul(sim, inst); return inst.prop.model === 'regulator' ? Math.max(0, Math.min(3.3, v - 1.1)) : v; },
        modificat() { sim.emit('memorie'); }
      };
    },
    controaleSpeciale(sec, inst, app, el) {
      const f = inst.card && inst.card.fisiere ? inst.card.fisiere : {};
      const nume = Object.keys(f).filter(k => !f[k].dosar).sort();
      sec.append(el('h4', { text: 'Fișiere pe card (' + nume.length + ')' }));
      if (!nume.length) { sec.append(el('p', { class: 'nota', text: 'Cardul e gol. Ce scrie codul cu SD.open(…, FILE_WRITE) apare aici.' })); return; }
      for (const n of nume.slice(0, 30)) {
        const date = f[n].date || '';
        const r = el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', margin: '4px 0' } });
        r.append(el('code', { text: n, style: { flex: '1', overflow: 'hidden', textOverflow: 'ellipsis' } }), el('span', { class: 'nota', text: date.length + ' o' }));
        r.append(el('button', { class: 'btn', text: 'Descarcă', on: { click: () => { const b = new Blob([Uint8Array.from(date, c => c.charCodeAt(0) & 255)], { type: 'application/octet-stream' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = n.split('/').pop(); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); } } }));
        sec.append(r);
      }
      sec.append(el('button', { class: 'btn', text: 'Golește cardul', on: { click: () => { if (app.simuleaza) { M.dialog.notifica('Oprește simularea înainte.'); return; } inst.card = { fisiere: {} }; app.salveazaIntarziat(); M.bus.emit('selectie', inst); } } }));
    }
  });
})(window.M = window.M || {});
