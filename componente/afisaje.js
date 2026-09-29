/* Meșter — afișaje: OLED SSD1306 / SH1106, LCD 16×2 și 20×4 (I2C și paralel), ecrane TFT color
   (ILI9341, ILI9488, ST7735, ST7789, GC9A01), TM1637 cu 4 cifre și matricea 8×8 MAX7219. */
(function (M) {
  'use strict';
  const D = M.desen;
  const G = () => M.grafica;

  function piniRand(lista, x0, y) { return lista.map((p, i) => Object.assign({ x: (x0 || 0) + i * 10, y: y || 0 }, p)); }
  function antete(pini, etDy) { let s = ''; for (const p of pini) { s += D.pinAntet(p.x, p.y); if (p.eticheta) s += D.text(p.x, p.y + (etDy || -7), p.eticheta, { m: 2.8 }); } return s; }
  function tensiune(sim, inst, vcc, gnd) { return M.tensiuneModul ? M.tensiuneModul(sim, inst, vcc, gnd) : 0; }

  // ---------- OLED ----------
  const CULORI_OLED = { alb: [226, 240, 255], albastru: [72, 190, 255], galben: [255, 214, 72] };
  function defOled(opt) {
    const h = opt.h;
    const piniImplicit = [{ id: 'GND', eticheta: 'GND', tip: 'gnd' }, { id: 'VCC', eticheta: 'VCC', tip: 'vcc', descriere: 'Alimentare 3,3–5 V' }, { id: 'SCL', eticheta: 'SCL', tip: 'i2c-scl', descriere: 'Ceas I2C' }, { id: 'SDA', eticheta: 'SDA', tip: 'i2c-sda', descriere: 'Date I2C' }];
    M.componente.defineste({
      tip: opt.tip, nume: opt.nume, categorie: 'afisaje', eticheta: 'OLED',
      cauta: opt.cauta,
      descriere: opt.descriere,
      prop: [
        { cheie: 'culoare', eticheta: 'Culoare', tip: 'alegere', optiuni: [['alb', 'Alb'], ['albastru', 'Albastru'], ['galben', 'Galben'], ['galben-albastru', 'Galben sus, albastru jos']].filter(o => h === 64 || o[0] !== 'galben-albastru'), implicit: opt.culoareImplicita || 'alb' },
        { cheie: 'adresa', eticheta: 'Adresă I2C', tip: 'alegere', optiuni: [['0x3C', '0x3C'], ['0x3D', '0x3D']], implicit: '0x3C' },
        { cheie: 'ordine', eticheta: 'Ordinea pinilor', tip: 'alegere', optiuni: [['gnd', 'GND VCC SCL SDA'], ['vcc', 'VCC GND SCL SDA']], implicit: 'gnd' }
      ],
      alimentare: { min: 3, max: 5.5 },
      pini: p => {
        let l = piniImplicit.slice();
        if (p.ordine === 'vcc') l = [l[1], l[0], l[2], l[3]];
        return piniRand(l, 0, 0);
      },
      cutie: () => ({ x: -18, y: -4, w: 66, h: opt.corpH + 6 }),
      ecran: p => ({ x: opt.ex, y: opt.ey, w: opt.ew, h: opt.eh, pw: 128, ph: h, fond: '#07090b' }),
      desen(p) {
        let s = D.pcb(-17, -3, 64, opt.corpH, { culoare: opt.pcb || '#1a3f8f', gauri: 3 });
        s += `<rect x="${opt.ex - 3}" y="${opt.ey - 3}" width="${opt.ew + 6}" height="${opt.eh + 10}" rx="1" fill="#0b0c0e"/>`;
        s += `<rect x="${opt.ex - 1}" y="${opt.ey + opt.eh + 2}" width="${opt.ew + 2}" height="4" fill="#15171a"/>`;
        s += antete(this.pini(p), 6);
        return s;
      },
      dispozitiv(inst, sim) {
        const T = G().Tampon;
        const d = {
          familie: 'oled', controler: opt.controler,
          adresaI2C: parseInt(inst.prop.adresa, 16) || 0x3C,
          tampon: new T(128, h, false), pornit: false, invers: false, contrast: 1, murdar: true, initializat: false,
          i2cScrie() { return true; },
          deseneaza(ctx) {
            const v = tensiune(sim, inst);
            const cul = inst.prop.culoare;
            if (!this.pornit || v < 2.6) { ctx.fillStyle = '#07090b'; ctx.fillRect(0, 0, 128, h); return; }
            const zone = cul === 'galben-albastru' ? [{ pana: 16, culoare: CULORI_OLED.galben }, { pana: 999, culoare: CULORI_OLED.albastru }] : null;
            G().deseneazaMono(ctx, this.tampon, CULORI_OLED[cul] || CULORI_OLED.alb, [7, 9, 11], this.invers, zone, 0.55 + this.contrast * 0.45);
          },
          laResetMcu() { /* afișajul păstrează imaginea până e reinițializat */ }
        };
        return d;
      },
      electric(ctx) { return { consum: ctx.R('VCC', 'GND', 220) }; },
      verifica(c, v) { verificaI2C(c, v); }
    });
  }
  defOled({ tip: 'oled-128x64', nume: 'OLED 0,96" 128×64 (SSD1306)', h: 64, corpH: 62, ex: -12, ey: 12, ew: 54, eh: 27, controler: 'SSD1306', cauta: 'oled ssd1306 0.96 128x64 i2c afisaj display', descriere: 'Afișaj OLED monocrom de 0,96" pe I2C (adresa 0x3C). Se folosește cu bibliotecile Adafruit_SSD1306 sau U8g2.' });
  defOled({ tip: 'oled-128x32', nume: 'OLED 0,91" 128×32 (SSD1306)', h: 32, corpH: 36, ex: -13, ey: 8, ew: 56, eh: 14, controler: 'SSD1306', cauta: 'oled ssd1306 0.91 128x32 i2c afisaj ingust', descriere: 'Afișaj OLED îngust de 0,91" pe I2C. Folosește Adafruit_SSD1306 display(128, 32, &Wire, -1).', pcb: '#101214' });
  defOled({ tip: 'oled-sh1106', nume: 'OLED 1,3" 128×64 (SH1106)', h: 64, corpH: 70, ex: -13, ey: 12, ew: 56, eh: 30, controler: 'SH1106', cauta: 'oled sh1106 1.3 128x64 i2c afisaj mare', descriere: 'OLED mai mare, de 1,3". Atenție: are controlerul SH1106, nu SSD1306 — cu biblioteca Adafruit_SSD1306 imaginea apare deplasată și cu zgomot. Folosește Adafruit_SH110X sau U8g2.', culoareImplicita: 'alb' });

  function verificaI2C(c, v) {
    const cip = v.sim.cip;
    if (!cip || !cip.i2c) return;
    const nS = v.retea.net(c.id, 'SDA'), nC = v.retea.net(c.id, 'SCL');
    const gS = v.sim.gpioLaNet(nS), gC = v.sim.gpioLaNet(nC);
    if (gS.length && gC.length && (gS[0] !== cip.i2c.sda || gC[0] !== cip.i2c.scl)) {
      if (gS[0] === cip.i2c.scl && gC[0] === cip.i2c.sda) v.adauga('eroare', c.eticheta + ': SDA și SCL sunt inversate. Pe ' + cip.cip + ' SDA implicit e GPIO' + cip.i2c.sda + ' și SCL e GPIO' + cip.i2c.scl + '.', { comp: c.id });
      else v.adauga('info', c.eticheta + ' folosește pinii I2C GPIO' + gS[0] + ' (SDA) și GPIO' + gC[0] + ' (SCL), nu pe cei impliciți (' + cip.i2c.sda + '/' + cip.i2c.scl + '). În cod scrie Wire.begin(' + gS[0] + ', ' + gC[0] + ');', { comp: c.id });
    }
  }
  M.verificaI2C = verificaI2C;

  // ---------- LCD cu caractere (HD44780) ----------
  const ROM_SPECIAL = {
    0x5C: [0x11, 0x0A, 0x1F, 0x04, 0x1F, 0x04, 0x04, 0], // ¥ în locul backslash-ului
    0x7E: [0x00, 0x04, 0x02, 0x1F, 0x02, 0x04, 0x00, 0], // →
    0x7F: [0x00, 0x04, 0x08, 0x1F, 0x08, 0x04, 0x00, 0], // ←
    0xDF: [0x1C, 0x14, 0x1C, 0x00, 0x00, 0x00, 0x00, 0], // °
    0xE4: [0x00, 0x00, 0x11, 0x11, 0x13, 0x1D, 0x10, 0x10], // µ
    0xF4: [0x00, 0x0E, 0x11, 0x11, 0x11, 0x0A, 0x1B, 0], // Ω
    0xE0: [0x00, 0x00, 0x09, 0x15, 0x12, 0x12, 0x0D, 0], // α
    0xE2: [0x00, 0x0E, 0x11, 0x1E, 0x11, 0x1E, 0x10, 0x10], // β
    0xF7: [0x00, 0x00, 0x1F, 0x0A, 0x0A, 0x0A, 0x13, 0], // π
    0xFF: [0x1F, 0x1F, 0x1F, 0x1F, 0x1F, 0x1F, 0x1F, 0x1F], // bloc plin
    0xA5: [0x00, 0x00, 0x00, 0x0C, 0x0C, 0x00, 0x00, 0], // punct central
    0xFD: [0x00, 0x04, 0x00, 0x1F, 0x00, 0x04, 0x00, 0] // ÷
  };
  function glifaLcd(cod, custom) {
    if (cod < 8 && custom) return custom[cod & 7];
    if (cod >= 8 && cod < 16 && custom) return custom[cod & 7];
    if (ROM_SPECIAL[cod]) return ROM_SPECIAL[cod];
    const r = [0, 0, 0, 0, 0, 0, 0, 0];
    const src = (cod >= 32 && cod < 128) ? cod : (cod >= 0xA0 ? ((cod * 7) % 94) + 33 : 32);
    if (cod >= 0xA0 && cod !== 0xA0) {
      // katakana din ROM-ul A00 — aproximăm cu glife fără sens, ca să se vadă că nu e text latin
      for (let y = 0; y < 7; y++) r[y] = ((cod * 13 + y * 7) ^ (cod >> 3)) & 0x1F & (y % 2 ? 0x15 : 0x1F);
      return r;
    }
    const f = M.grafica.GLCD;
    for (let col = 0; col < 5; col++) {
      const linie = f[src * 5 + col];
      for (let y = 0; y < 8; y++) if (linie & (1 << y)) r[y] |= (0x10 >> col);
    }
    return r;
  }
  const CULORI_LCD = {
    albastru: { fond: '#1f4fd6', aprins: '#f2f6ff', stins: 'rgba(255,255,255,0.07)', fara: '#1a2f6a' },
    verde: { fond: '#8fc23a', aprins: '#1d2a0e', stins: 'rgba(40,60,10,0.12)', fara: '#6a8a38' }
  };
  function dispozitivLcd(inst, sim, col, rand, i2c, el) {
    const d = {
      familie: 'lcd', col, rand,
      adresaI2C: i2c ? (parseInt(inst.prop.adresa, 16) || 0x27) : undefined,
      ddram: new Uint8Array(128).fill(32), cgram: Array.from({ length: 8 }, () => [0, 0, 0, 0, 0, 0, 0, 0]),
      cursor: 0, afisaj: false, cursorVizibil: false, clipire: false, lumina: true, deplasare: 0, initializat: false, murdar: true, mereuDesenat: false,
      adresaRand(r) { return [0x00, 0x40, col, 0x40 + col][r] || 0; },
      seteazaCursor(c, r) { this.cursor = this.adresaRand(Math.min(r, rand - 1)) + c; this.murdar = true; },
      scrie(cod) { this.ddram[this.cursor & 0x7F] = cod & 255; this.cursor = (this.cursor + 1) & 0x7F; this.murdar = true; },
      goleste() { this.ddram.fill(32); this.cursor = 0; this.deplasare = 0; this.murdar = true; },
      i2cScrie() { return true; },
      deseneaza(ctx, cv) {
        const cul = CULORI_LCD[inst.prop.culoare] || CULORI_LCD.albastru;
        const v = i2c ? tensiune(sim, inst) : tensiune(sim, inst, 'VDD', 'VSS');
        const W = cv.width, H = cv.height;
        let lumina;
        if (i2c) lumina = this.lumina && v > 2.5 ? Math.min(1, v / 4.6) : 0;
        else lumina = el && el.lumina ? Math.min(1, M.stralucireLed(el.lumina.iMed !== undefined ? el.lumina.iMed : el.lumina.i, 0.015)) : 0;
        ctx.fillStyle = cul.fara; ctx.fillRect(0, 0, W, H);
        if (lumina > 0.02) { ctx.globalAlpha = lumina; ctx.fillStyle = cul.fond; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
        // contrastul: la 3,3 V textul abia se vede
        let contrast = v >= 4.3 ? 1 : v >= 3 ? 0.35 : 0;
        if (!i2c && el && el.v0) {
          const vv0 = sim.tensiuneNet(sim.netPin(inst, 'V0'));
          const dif = v - (isNaN(vv0) || sim.flotant(sim.netPin(inst, 'V0')) ? v : vv0);
          contrast = dif > 3.2 ? Math.min(1, (dif - 3.2) / 1.1) : 0;
        } else if (i2c) contrast *= (inst.prop.contrast === 'mic' ? 0.4 : inst.prop.contrast === 'mare' ? 1.05 : 0.9);
        const cx = 4, cy = 4, pas = 4, dot = 3;
        const pc = 6 * pas, pr = 9 * pas;
        for (let r = 0; r < rand; r++) for (let c = 0; c < col; c++) {
          const x0 = cx + c * pc, y0 = cy + r * pr;
          ctx.fillStyle = cul.stins;
          for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 5; xx++) ctx.fillRect(x0 + xx * pas, y0 + yy * pas, dot, dot);
          if (!this.afisaj || contrast <= 0 || v < 2.5) continue;
          const adr = (this.adresaRand(r) + ((c + this.deplasare) % 40 + 40) % 40) & 0x7F;
          const g = glifaLcd(this.ddram[adr], this.cgram);
          ctx.globalAlpha = Math.min(1, contrast);
          ctx.fillStyle = cul.aprins;
          for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 5; xx++) if (g[yy] & (0x10 >> xx)) ctx.fillRect(x0 + xx * pas, y0 + yy * pas, dot, dot);
          const peCursor = (this.cursor & 0x7F) === adr;
          if (peCursor && this.cursorVizibil) ctx.fillRect(x0, y0 + 7 * pas, 5 * pas - 1, dot);
          if (peCursor && this.clipire && Math.floor(sim.timp / 530000) % 2 === 0) ctx.fillRect(x0, y0, 5 * pas - 1, 8 * pas - 1);
          ctx.globalAlpha = 1;
        }
        this.mereuDesenat = this.clipire;
      }
    };
    return d;
  }
  function defLcdI2c(tip, nume, col, rand) {
    const pw = 8 + col * 24, ph = 8 + rand * 36;
    const w = col === 20 ? 196 : 158, h = rand === 4 ? 76 : 42;
    const lat = col === 20 ? 240 : 196, inalt = rand === 4 ? 150 : 106;
    M.componente.defineste({
      tip, nume, categorie: 'afisaje', eticheta: 'LCD',
      cauta: 'lcd ' + col + 'x' + rand + ' i2c pcf8574 hd44780 liquidcrystal afisaj caractere',
      descriere: 'Afișaj cu ' + rand + ' rânduri de câte ' + col + ' caractere, cu modul I2C (PCF8574) pe spate. Adresa e de obicei 0x27 (sau 0x3F). Are nevoie de 5 V pe VCC; la 3,3 V textul abia se vede.',
      prop: [
        { cheie: 'culoare', eticheta: 'Lumina de fundal', tip: 'alegere', optiuni: [['albastru', 'Albastră, text alb'], ['verde', 'Verde, text negru']], implicit: 'albastru' },
        { cheie: 'adresa', eticheta: 'Adresă I2C', tip: 'alegere', optiuni: [['0x27', '0x27 (PCF8574T)'], ['0x3F', '0x3F (PCF8574AT)']], implicit: '0x27' },
        { cheie: 'contrast', eticheta: 'Contrast (trimmer-ul albastru)', tip: 'alegere', optiuni: [['mic', 'Prea mic'], ['bun', 'Reglat bine'], ['mare', 'Prea mare']], implicit: 'bun' }
      ],
      alimentare: { min: 4.5, max: 5.5 },
      pini: () => piniRand([{ id: 'GND', eticheta: 'GND', tip: 'gnd' }, { id: 'VCC', eticheta: 'VCC', tip: 'vcc', descriere: 'Alimentare 5 V' }, { id: 'SDA', eticheta: 'SDA', tip: 'i2c-sda' }, { id: 'SCL', eticheta: 'SCL', tip: 'i2c-scl' }], -34, 0),
      cutie: () => ({ x: -44, y: -inalt - 4, w: lat, h: inalt + 8 }),
      ecran: () => ({ x: -44 + (lat - w) / 2, y: -inalt + 12 + (inalt - 32 - h) / 2, w, h, pw, ph, neted: true, fond: '#1a2f6a' }),
      desen() {
        let s = D.pcb(-44, -inalt - 2, lat, inalt, { culoare: '#2c7a3b', gauri: 5 });
        s += `<rect x="${-44 + (lat - w) / 2 - 8}" y="${-inalt + 12 + (inalt - 32 - h) / 2 - 8}" width="${w + 16}" height="${h + 16}" rx="2" fill="#1a1c20"/>`;
        s += `<rect x="-40" y="-14" width="52" height="12" rx="1" fill="#121417"/>`;
        s += D.cip(-18, -12, 16, 8, { eticheta: 'PCF8574', m: 1.6 });
        s += `<rect x="-38" y="-12" width="8" height="8" rx="1" fill="#2f63c4"/><circle cx="-34" cy="-8" r="2.4" fill="#e9e9e2"/><path d="M-35.5 -8h3" stroke="#555" stroke-width="0.6"/>`;
        s += antete(this.pini(), 6);
        return s;
      },
      dispozitiv(inst, sim) { return dispozitivLcd(inst, sim, col, rand, true); },
      electric(ctx) { return { consum: ctx.R('VCC', 'GND', 180) }; },
      verifica(c, v) { verificaI2C(c, v); }
    });
  }
  defLcdI2c('lcd-16x2-i2c', 'LCD 16×2 cu I2C', 16, 2);
  defLcdI2c('lcd-20x4-i2c', 'LCD 20×4 cu I2C', 20, 4);

  // LCD 16×2 paralel (16 pini)
  const PINI_LCD = [['VSS', 'VSS', 'gnd', 'Masă'], ['VDD', 'VDD', 'vcc', 'Alimentare 5 V'], ['V0', 'V0', 'intrare', 'Contrast: la cursorul unui potențiometru de 10 kΩ'], ['RS', 'RS', 'intrare', 'Registru: comenzi sau date'], ['RW', 'RW', 'intrare', 'Citire/scriere — leagă-l la GND'], ['E', 'E', 'intrare', 'Enable'],
    ['D0', 'D0', 'intrare', ''], ['D1', 'D1', 'intrare', ''], ['D2', 'D2', 'intrare', ''], ['D3', 'D3', 'intrare', ''], ['D4', 'D4', 'intrare', 'Date (mod 4 biți)'], ['D5', 'D5', 'intrare', 'Date (mod 4 biți)'], ['D6', 'D6', 'intrare', 'Date (mod 4 biți)'], ['D7', 'D7', 'intrare', 'Date (mod 4 biți)'], ['A', 'A', 'pasiv', 'Anodul luminii de fundal (+)'], ['K', 'K', 'pasiv', 'Catodul luminii de fundal (−)']];
  M.componente.defineste({
    tip: 'lcd-16x2', nume: 'LCD 16×2 paralel', categorie: 'afisaje', eticheta: 'LCD',
    cauta: 'lcd 16x2 paralel hd44780 1602 liquidcrystal 16 pini',
    descriere: 'LCD clasic cu 16 pini, comandat în mod 4 biți cu biblioteca LiquidCrystal (RS, E, D4–D7). V0 reglează contrastul (potențiometru de 10 kΩ), RW la GND, iar A/K aprind lumina de fundal (cu rezistor de 220 Ω).',
    prop: [{ cheie: 'culoare', eticheta: 'Lumina de fundal', tip: 'alegere', optiuni: [['albastru', 'Albastră, text alb'], ['verde', 'Verde, text negru']], implicit: 'verde' }],
    alimentare: { vcc: 'VDD', gnd: 'VSS', min: 4.5, max: 5.5 },
    pini: () => PINI_LCD.map((p, i) => ({ id: p[0], eticheta: p[1], tip: p[2], descriere: p[3], x: i * 10, y: 0 })),
    cutie: () => ({ x: -26, y: -104, w: 202, h: 108 }),
    ecran: () => ({ x: -4, y: -80, w: 158, h: 42, pw: 392, ph: 80, neted: true }),
    desen() {
      let s = D.pcb(-26, -102, 202, 100, { culoare: '#2c7a3b', gauri: 5 });
      s += `<rect x="-12" y="-88" width="174" height="58" rx="2" fill="#1a1c20"/>`;
      s += antete(this.pini(), -7);
      return s;
    },
    electric(ctx) {
      return { consum: ctx.R('VDD', 'VSS', 3000), v0: ctx.R('V0', 'VSS', 1e7), lumina: ctx.D('A', 'K', { is: 0.02 / (Math.exp(3.0 / (2 * M.circuit.VT)) - 1), n: 2, rs: 12, led: true }) };
    },
    dispozitiv(inst, sim, el) { return dispozitivLcd(inst, sim, 16, 2, false, el); }
  });

  // ---------- ecrane TFT ----------
  const MODELE_TFT = {
    ili9341: { nume: 'TFT 2,8" 240×320 (ILI9341)', w: 240, h: 320, diag: '2.8"', driver: 'ILI9341_DRIVER', lat: 116, inalt: 150, eW: 86, eH: 115, pcb: '#b8281f', pini: 'standard', culoriBiti: 16, spiMhz: 40 },
    ili9488: { nume: 'TFT 3,5" 320×480 (ILI9488)', w: 320, h: 480, diag: '3.5"', driver: 'ILI9488_DRIVER', lat: 156, inalt: 222, eW: 128, eH: 192, pcb: '#b8281f', pini: 'standard', culoriBiti: 18, spiMhz: 27 },
    st7735: { nume: 'TFT 1,8" 128×160 (ST7735)', w: 128, h: 160, diag: '1.8"', driver: 'ST7735_DRIVER', lat: 76, inalt: 106, eW: 57, eH: 71, pcb: '#b8281f', pini: 'standard', culoriBiti: 16, spiMhz: 27 },
    st7789: { nume: 'TFT 1,3" 240×240 (ST7789)', w: 240, h: 240, diag: '1.3"', driver: 'ST7789_DRIVER', lat: 90, inalt: 104, eW: 62, eH: 62, pcb: '#1c4f9c', pini: 'fara-cs', culoriBiti: 16, spiMhz: 40 },
    'st7789-320': { nume: 'TFT 2,0" 240×320 (ST7789)', w: 240, h: 320, diag: '2.0"', driver: 'ST7789_DRIVER', lat: 96, inalt: 132, eW: 70, eH: 94, pcb: '#1c4f9c', pini: 'cu-cs', culoriBiti: 16, spiMhz: 40 },
    gc9a01: { nume: 'TFT rotund 1,28" 240×240 (GC9A01)', w: 240, h: 240, diag: '1.28"', driver: 'GC9A01_DRIVER', lat: 96, inalt: 110, eW: 64, eH: 64, pcb: '#1c1f24', pini: 'rotund', culoriBiti: 16, spiMhz: 40, rotund: true }
  };
  function piniTft(model) {
    const m = MODELE_TFT[model];
    const P = (id, et, tip, d) => ({ id, eticheta: et, tip, descriere: d });
    let l;
    if (m.pini === 'fara-cs') l = [P('GND', 'GND', 'gnd'), P('VCC', 'VCC', 'vcc', '3,3 V'), P('SCK', 'SCL', 'spi-sck', 'Ceas SPI'), P('MOSI', 'SDA', 'spi-mosi', 'Date SPI (MOSI)'), P('RST', 'RES', 'intrare', 'Reset'), P('DC', 'DC', 'intrare', 'Date/comandă'), P('BLK', 'BLK', 'intrare', 'Lumina de fundal (liber = aprinsă)')];
    else if (m.pini === 'cu-cs') l = [P('GND', 'GND', 'gnd'), P('VCC', 'VCC', 'vcc', '3,3 V'), P('SCK', 'SCL', 'spi-sck'), P('MOSI', 'SDA', 'spi-mosi'), P('RST', 'RES', 'intrare'), P('DC', 'DC', 'intrare'), P('CS', 'CS', 'spi-cs', 'Selecție cip'), P('BLK', 'BLK', 'intrare', 'Lumina de fundal')];
    else if (m.pini === 'rotund') l = [P('VCC', 'VCC', 'vcc'), P('GND', 'GND', 'gnd'), P('SCK', 'SCL', 'spi-sck'), P('MOSI', 'SDA', 'spi-mosi'), P('DC', 'DC', 'intrare'), P('CS', 'CS', 'spi-cs'), P('RST', 'RST', 'intrare')];
    else l = [P('VCC', 'VCC', 'vcc', '3,3–5 V (are regulator)'), P('GND', 'GND', 'gnd'), P('CS', 'CS', 'spi-cs', 'Selecție cip'), P('RST', 'RESET', 'intrare', 'Reset (sau la 3,3 V)'), P('DC', 'DC', 'intrare', 'Date/comandă (RS)'), P('MOSI', 'SDI', 'spi-mosi', 'Date SPI de la placă (MOSI)'), P('SCK', 'SCK', 'spi-sck', 'Ceas SPI'), P('LED', 'LED', 'intrare', 'Lumina de fundal: la 3,3 V sau la un pin (PWM)'), P('MISO', 'SDO', 'spi-miso', 'Date SPI spre placă (MISO, opțional)')];
    return l.map((p, i) => Object.assign(p, { x: i * 10, y: 0 }));
  }
  M.componente.defineste({
    tip: 'tft', nume: 'Ecran TFT color SPI', categorie: 'afisaje', eticheta: 'TFT',
    cauta: 'tft lcd color spi ili9341 ili9488 st7735 st7789 gc9a01 ecran 2.8 3.5 1.8 1.3 tft_espi',
    descriere: 'Ecran color pe SPI. Merge cu TFT_eSPI sau cu bibliotecile Adafruit. Pinul LED (lumina de fundal) trebuie alimentat, altfel ecranul rămâne negru. ILI9488 transmite 3 octeți pe pixel, deci o umplere completă durează ~0,1 s.',
    prop: [{ cheie: 'model', eticheta: 'Model', tip: 'alegere', optiuni: Object.keys(MODELE_TFT).map(k => [k, MODELE_TFT[k].nume]), implicit: 'ili9341' }],
    alimentare: { min: 3, max: 5.5 },
    pini: p => piniTft(p.model),
    cutie: p => { const m = MODELE_TFT[p.model]; const nP = piniTft(p.model).length; const cx = (nP - 1) * 5; return { x: cx - m.lat / 2, y: -m.inalt - 2, w: m.lat, h: m.inalt + 6 }; },
    ecran: p => { const m = MODELE_TFT[p.model]; const nP = piniTft(p.model).length; const cx = (nP - 1) * 5; return { x: cx - m.eW / 2, y: -m.inalt + (m.inalt - m.eH) / 2 - 8, w: m.eW, h: m.eH, pw: m.w, ph: m.h, fond: '#050607' }; },
    desen(p) {
      const m = MODELE_TFT[p.model];
      const pini = piniTft(p.model);
      const cx = (pini.length - 1) * 5;
      const e = this.ecran(p);
      let s = '';
      if (m.rotund) {
        s += `<circle cx="${cx}" cy="${e.y + e.h / 2}" r="${m.lat / 2 - 2}" fill="${m.pcb}" stroke="#000" stroke-width="0.6"/>`;
        s += `<rect x="${cx - 32}" y="-14" width="64" height="12" fill="${m.pcb}"/>`;
        s += `<circle cx="${cx}" cy="${e.y + e.h / 2}" r="${e.w / 2 + 3}" fill="#0b0c0e"/>`;
      } else {
        s += D.pcb(cx - m.lat / 2, -m.inalt - 2, m.lat, m.inalt, { culoare: m.pcb, gauri: 4 });
        s += `<rect x="${e.x - 4}" y="${e.y - 4}" width="${e.w + 8}" height="${e.h + 12}" rx="2" fill="#0b0c0e"/>`;
        s += D.text(cx, -m.inalt + 5, m.diag + ' SPI ' + m.w + '×' + m.h, { m: 3 });
      }
      s += antete(pini, -6);
      return s;
    },
    electric(ctx, inst) {
      const m = MODELE_TFT[inst.prop.model];
      const r = { consum: ctx.R('VCC', 'GND', 90) };
      if (m.pini === 'standard') r.lumina = ctx.R('LED', 'GND', 1500);
      if (m.pini === 'fara-cs' || m.pini === 'cu-cs') { r.lumina = ctx.R('BLK', 'GND', 50000); r.pullBlk = ctx.R('BLK', 'VCC', 10000); }
      return r;
    },
    dispozitiv(inst, sim, el) {
      const m = MODELE_TFT[inst.prop.model];
      const T = G().Tampon;
      const d = {
        familie: 'tft', model: inst.prop.model, info: m, w: m.w, h: m.h,
        tampon: new T(m.w, m.h, true), pornit: false, invers: false, murdar: true,
        deseneaza(ctx) {
          const v = tensiune(sim, inst);
          let lum = 0;
          if (el.lumina) {
            if (m.pini === 'standard') { const i = el.lumina.iMed !== undefined ? el.lumina.iMed : el.lumina.i; lum = Math.max(0, Math.min(1, i / 0.0019)); }
            else { const vb = sim.tensiunePin(inst, 'BLK'); lum = isNaN(vb) ? 1 : Math.max(0, Math.min(1, (vb - 0.6) / 2)); }
          } else lum = 1;
          if (v < 2.6) lum = 0;
          if (!this.pornit || lum <= 0.01) { ctx.fillStyle = lum > 0.01 && v >= 2.6 ? 'rgb(' + Math.round(235 * lum) + ',' + Math.round(240 * lum) + ',' + Math.round(245 * lum) + ')' : '#050607'; ctx.fillRect(0, 0, m.w, m.h); if (m.rotund) this.masca(ctx); return; }
          G().deseneazaColor(ctx, this.tampon, m.w, m.h, 0.25 + 0.75 * lum);
          if (this.invers) { ctx.save(); ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = 'rgb(' + Math.round(255 * (0.25 + 0.75 * lum)) + ',' + Math.round(255 * (0.25 + 0.75 * lum)) + ',' + Math.round(255 * (0.25 + 0.75 * lum)) + ')'; ctx.fillRect(0, 0, m.w, m.h); ctx.restore(); }
          if (m.rotund) this.masca(ctx);
        },
        masca(ctx) {
          ctx.save(); ctx.globalCompositeOperation = 'destination-in'; ctx.beginPath(); ctx.arc(m.w / 2, m.h / 2, m.w / 2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        },
        // cost realist al transferului SPI (µs) pentru n pixeli
        costPixeli(n) { return n * (m.culoriBiti === 18 ? 24 : 16) / m.spiMhz; }
      };
      return d;
    },
    verifica(c, v) {
      const m = MODELE_TFT[c.prop.model];
      const cip = v.sim.cip;
      if (!cip) return;
      const ns = v.retea.net(c.id, 'SCK'), nm = v.retea.net(c.id, 'MOSI');
      const gs = v.sim.gpioLaNet(ns), gm = v.sim.gpioLaNet(nm);
      if (m.pini === 'standard') {
        const nl = v.retea.net(c.id, 'LED');
        if (v.retea.piniReali(nl).length < 2) v.adauga('avertisment', c.eticheta + ': pinul LED (lumina de fundal) nu e conectat — ecranul va rămâne negru. Leagă-l la 3V3 sau la un pin.', { comp: c.id });
      }
      if (gs.length && gm.length && (gs[0] !== cip.spi.sck || gm[0] !== cip.spi.mosi)) {
        v.adauga('info', c.eticheta + ' folosește SCK=GPIO' + gs[0] + ', MOSI=GPIO' + gm[0] + ' (pinii SPI impliciți sunt SCK=' + cip.spi.sck + ', MOSI=' + cip.spi.mosi + '). Cu TFT_eSPI setează-i în User_Setup.h.', { comp: c.id });
      }
    }
  });
  M.MODELE_TFT = MODELE_TFT;

  // ---------- TM1637 ----------
  const CIFRE_SEG = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f, 0x77, 0x7c, 0x39, 0x5e, 0x79, 0x71];
  M.componente.defineste({
    tip: 'tm1637', nume: 'Afișaj 4 cifre TM1637', categorie: 'afisaje', eticheta: 'TM',
    cauta: 'tm1637 4 cifre 7 segmente ceas afisaj numere doua fire',
    descriere: 'Patru cifre cu 7 segmente și două puncte la mijloc, comandate pe doar 2 fire (CLK și DIO). Se folosește cu biblioteca TM1637Display.',
    prop: [{ cheie: 'culoare', eticheta: 'Culoare', tip: 'alegere', optiuni: [['rosu', 'Roșu'], ['verde', 'Verde'], ['albastru', 'Albastru'], ['alb', 'Alb']], implicit: 'rosu' }],
    alimentare: { min: 3.3, max: 5.5 },
    pini: () => piniRand([{ id: 'CLK', eticheta: 'CLK', tip: 'intrare' }, { id: 'DIO', eticheta: 'DIO', tip: 'intrare' }, { id: 'VCC', eticheta: 'VCC', tip: 'vcc' }, { id: 'GND', eticheta: 'GND', tip: 'gnd' }], 0, 0),
    cutie: () => ({ x: -26, y: -52, w: 82, h: 56 }),
    desen() {
      let s = D.pcb(-26, -50, 82, 46, { culoare: '#1c4f9c', gauri: 3 });
      s += `<rect x="-20" y="-44" width="70" height="30" rx="1" fill="#17181b"/>`;
      for (let i = 0; i < 4; i++) {
        const ox = -15 + i * 16 + (i >= 2 ? 3 : 0), oy = -40;
        const seg = { a: [2, 0, 7, 2], b: [9, 1, 2, 9], c: [9, 12, 2, 9], d: [2, 20, 7, 2], e: [0, 12, 2, 9], f: [0, 1, 2, 9], g: [2, 10, 7, 2] };
        s += `<g transform="translate(${ox} ${oy}) skewX(-6)">`;
        for (const k in seg) { const [x, y, w, h] = seg[k]; s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="0.8" fill="#2a2426" data-s="${i}${k}"/>`; }
        s += `</g>`;
      }
      s += `<circle cx="18.5" cy="-34" r="1.3" fill="#2a2426" data-s="dp1"/><circle cx="18.5" cy="-24" r="1.3" fill="#2a2426" data-s="dp2"/>`;
      s += antete(this.pini(), 6);
      return s;
    },
    electric(ctx) { return { consum: ctx.R('VCC', 'GND', 400) }; },
    dispozitiv() { return { familie: 'tm1637', segmente: [0, 0, 0, 0], luminozitate: 7, pornit: true, schimbat: true }; },
    vizual(g, inst, sim, el, disp) {
      const cul = { rosu: '#ff3b2f', verde: '#3cff5a', albastru: '#4d8dff', alb: '#f4f7ff' }[inst.prop.culoare] || '#ff3b2f';
      const v = sim ? tensiune(sim, inst) : 0;
      for (let i = 0; i < 4; i++) {
        const b = disp && disp.pornit && v > 2.8 ? disp.segmente[i] : 0;
        ['a', 'b', 'c', 'd', 'e', 'f', 'g'].forEach((k, j) => {
          const e = g.querySelector('[data-s="' + i + k + '"]');
          if (e) { const on = (b >> j) & 1; e.setAttribute('fill', on ? cul : '#2a2426'); e.setAttribute('opacity', on ? (0.5 + (disp.luminozitate + 1) / 16) : 1); }
        });
      }
      const dp = disp && disp.pornit && v > 2.8 && (disp.segmente[1] & 0x80);
      for (const k of ['dp1', 'dp2']) { const e = g.querySelector('[data-s="' + k + '"]'); if (e) e.setAttribute('fill', dp ? cul : '#2a2426'); }
    }
  });
  M.CIFRE_SEG = CIFRE_SEG;

  // ---------- matrice 8×8 MAX7219 ----------
  M.componente.defineste({
    tip: 'max7219', nume: 'Matrice LED 8×8 (MAX7219)', categorie: 'afisaje', eticheta: 'MTX',
    cauta: 'max7219 matrice led 8x8 dot matrix ledcontrol',
    descriere: 'Matrice de 64 de LED-uri roșii cu driverul MAX7219. Se comandă pe 3 fire (DIN, CS, CLK) cu biblioteca LedControl. Mai multe module se înlănțuie prin DOUT.',
    prop: [{ cheie: 'culoare', eticheta: 'Culoare', tip: 'alegere', optiuni: [['rosu', 'Roșu'], ['verde', 'Verde'], ['albastru', 'Albastru']], implicit: 'rosu' }],
    alimentare: { min: 4, max: 5.5 },
    pini: () => piniRand([{ id: 'VCC', eticheta: 'VCC', tip: 'vcc' }, { id: 'GND', eticheta: 'GND', tip: 'gnd' }, { id: 'DIN', eticheta: 'DIN', tip: 'intrare' }, { id: 'CS', eticheta: 'CS', tip: 'intrare' }, { id: 'CLK', eticheta: 'CLK', tip: 'intrare' }], 0, 0),
    cutie: () => ({ x: -12, y: -94, w: 64, h: 98 }),
    desen() {
      let s = D.pcb(-12, -92, 64, 88, { culoare: '#1c4f9c', gauri: 3 });
      s += `<rect x="-9" y="-89" width="58" height="58" rx="1" fill="#15161a"/>`;
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) s += `<circle cx="${-5.5 + c * 7.2}" cy="${-85.5 + r * 7.2}" r="2.7" fill="#3a2a2a" data-m="${r},${c}"/>`;
      s += D.cip(6, -26, 20, 12, { eticheta: 'MAX7219', m: 2.2, picioare: 6 });
      s += antete(this.pini(), -6);
      return s;
    },
    electric(ctx) { return { consum: ctx.R('VCC', 'GND', 600) }; },
    dispozitiv() { return { familie: 'max7219', randuri: new Uint8Array(8), intensitate: 8, pornit: false, schimbat: true }; },
    vizual(g, inst, sim, el, disp) {
      if (disp && !disp.schimbat && sim) return;
      if (disp) disp.schimbat = false;
      const cul = { rosu: '#ff3b2f', verde: '#3cff5a', albastru: '#4d8dff' }[inst.prop.culoare] || '#ff3b2f';
      const v = sim ? tensiune(sim, inst) : 0;
      for (const e of g.querySelectorAll('[data-m]')) {
        const [r, c] = e.dataset.m.split(',').map(Number);
        const on = disp && disp.pornit && v > 3.5 && ((disp.randuri[r] >> (7 - c)) & 1);
        e.setAttribute('fill', on ? cul : '#3a2a2a');
        e.setAttribute('opacity', on ? 0.45 + disp.intensitate / 30 : 1);
      }
    }
  });
})(window.M = window.M || {});
