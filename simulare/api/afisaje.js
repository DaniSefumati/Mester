/* Meșter — bibliotecile de afișaje: Adafruit_SSD1306, Adafruit_SH110X, U8g2/U8x8, LiquidCrystal_I2C,
   LiquidCrystal, TFT_eSPI (+ sprite-uri), Adafruit_ILI9341/ST7789/ST7735/GC9A01A, TM1637Display,
   LedControl, Adafruit_NeoPixel și FastLED. Fiecare se leagă de afișajul real din schemă și
   reproduce și greșelile obișnuite (adresă greșită, culoare lipsă, luminozitate neapelată). */
(function (M) {
  'use strict';
  const api = M.api;
  const S = () => M.simCurenta;
  const txt = M.ajutoareR.txt;
  const GFX = M.grafica.GFX;
  const linie = () => { const s = S(); return s && s.R ? s.R.L : 0; };
  const sugestie = (cheie, mesaj) => S().problema(cheie, 'info', mesaj, { linie: linie() });
  const inverseaza16 = (c) => ((c & 0xFF) << 8) | ((c >> 8) & 0xFF);

  // ---------- rezolvarea numelor necunoscute (fonturi), extensibilă de alte biblioteci ----------
  api.rezolvatori = api.rezolvatori || [];
  api.rezolvaNecunoscut = function (n) { for (const f of api.rezolvatori) { const r = f(n); if (r) return r; } return null; };

  // ---------- fonturi GFX ----------
  class GFXglyph {
    constructor(o, w, h, xa, xo, yo) { this.bitmapOffset = o || 0; this.width = w || 0; this.height = h || 0; this.xAdvance = xa || 0; this.xOffset = xo || 0; this.yOffset = yo || 0; }
  }
  api.clasa('GFXglyph', GFXglyph);
  // fonturi proprii definite în schiță: const GFXfont f = {bitmap, glife, 0x20, 0x7E, 24};
  class GFXfont {
    constructor(bitmap, glife, first, last, yAdvance) {
      if (bitmap === undefined) return;
      this.nume = 'font propriu';
      this.bitmap = bitmap;
      const g = [];
      for (const x of (glife || [])) {
        if (Array.isArray(x) || ArrayBuffer.isView(x)) { for (let i = 0; i < 6; i++) g.push(x[i] | 0); }
        else if (x) g.push(x.bitmapOffset | 0, x.width | 0, x.height | 0, x.xAdvance | 0, x.xOffset | 0, x.yOffset | 0);
      }
      this.glife = g; this.first = first | 0; this.last = last | 0; this.yAdvance = yAdvance | 0;
    }
  }
  api.clasa('GFXfont', GFXfont);
  const FG = M.grafica.fonturiGfx;
  for (const k in FG) api.obiecte[k] = 'GFXfont';
  api.creatoriObiecte.push(() => Object.assign({}, FG));

  // mărimile disponibile în simulator, pe familii
  const DISPONIBIL = { Mono: { '': [9, 12], Bold: [9, 12] }, Sans: { '': [9, 12, 18, 24], Bold: [9, 12, 18, 24] }, Serif: { '': [9, 12], Bold: [12] } };
  function fontApropiat(fam, bold, pt) {
    const grup = DISPONIBIL[fam] || DISPONIBIL.Sans;
    const lista = bold && grup.Bold.length ? grup.Bold : grup[''];
    let best = lista[0];
    for (const o of lista) if (Math.abs(o - pt) < Math.abs(best - pt)) best = o;
    const nume = 'Free' + fam + (bold && lista === grup.Bold ? 'Bold' : '') + best + 'pt7b';
    return FG[nume] || FG.FreeSans9pt7b;
  }
  // fonturile Adafruit care nu sunt în simulator se înlocuiesc cu cea mai apropiată mărime
  api.functie('__fontGfx', function __fontGfx(nume) {
    const m = /^Free(Mono|Sans|Serif)(Bold)?(Oblique|Italic)?(\d+)pt7b$/.exec(nume);
    const f = m ? fontApropiat(m[1], !!m[2], +m[4]) : FG.FreeSans9pt7b;
    sugestie('font-' + nume, 'Fontul ' + nume + ' nu e inclus în simulator; folosesc ' + f.nume + ', cel mai apropiat ca mărime și stil.');
    return f;
  }, 'obj:GFXfont');
  // prescurtările din Free_Fonts.h (TFT_eSPI)
  const ALIAS_FONT = {};
  (function () {
    const fam = [['FM', 'Mono', ''], ['FMB', 'Mono', 'Bold'], ['FMO', 'Mono', 'Oblique'], ['FMBO', 'Mono', 'BoldOblique'], ['FSS', 'Sans', ''], ['FSSB', 'Sans', 'Bold'], ['FSSO', 'Sans', 'Oblique'], ['FSSBO', 'Sans', 'BoldOblique'],
      ['FS', 'Serif', ''], ['FSI', 'Serif', 'Italic'], ['FSB', 'Serif', 'Bold'], ['FSBI', 'Serif', 'BoldItalic']];
    for (const [pre, f, st] of fam) for (const pt of [9, 12, 18, 24]) ALIAS_FONT[pre + pt] = 'Free' + f + st + pt + 'pt7b';
    let nr = 1;
    for (const [, f, st] of fam) for (const pt of [9, 12, 18, 24]) ALIAS_FONT['FF' + (nr++)] = 'Free' + f + st + pt + 'pt7b';
  })();
  function refFont(numeAdafruit) {
    if (FG[numeAdafruit]) return { c: 'O.' + numeAdafruit, t: 'obj:GFXfont' };
    return { c: 'F.__fontGfx(' + JSON.stringify(numeAdafruit) + ')', t: 'obj:GFXfont' };
  }
  api.rezolvatori.push(function (n) {
    if (/^u8g2_font_\w+$/.test(n)) return { c: 'F.__fontU8g2(' + JSON.stringify(n) + ')', t: 'obj:GFXfont' };
    if (/^u8x8_font_\w+$/.test(n)) return { c: 'F.__fontU8x8(' + JSON.stringify(n) + ')', t: 'obj:GFXfont' };
    if (ALIAS_FONT[n]) return refFont(ALIAS_FONT[n]);
    if (/^Free(Mono|Sans|Serif)(Bold)?(Oblique|Italic)?\d+pt7b$/.test(n)) return refFont(n);
    return null;
  });
  // fonturile U8g2: le potrivim după înălțimea literelor mari cu fontul clasic 5×7 sau cu un font GFX
  function capFont(f) { const i = 65 - f.first; return -f.glife[i * 6 + 5]; }
  function fontU8g2(nume) {
    const rest = nume.replace(/^u8g2_font_/, '');
    let m;
    if ((m = /^(\d+)x(\d+)/.exec(rest))) return { u8g2: true, gfx: null, marime: +m[2] >= 18 ? 2 : 1, nume };
    if (/open_iconic|iconic|siji|streamline|emoticons|battery|cursor|unifont_t_symbols|m2icon|twelvedings|pictogram/.test(rest)) {
      sugestie('u8g2-iconite', 'Fonturile cu pictograme din U8g2 (' + nume + ') nu sunt simulate; pictogramele apar ca litere obișnuite.');
      return { u8g2: true, gfx: null, marime: 1, nume };
    }
    let fam = 'Sans', cap;
    const bold = /(^|[a-z])B\d|_b\d|bold|^fub|^inb/i.test(rest) && !/^(fur|inr)/.test(rest);
    if ((m = /logisoso(\d+)/.exec(rest))) cap = +m[1];
    else if ((m = /^(fub|fur)(\d+)/.exec(rest))) cap = +m[2] * 0.72;
    else if ((m = /^(inb|inr)(\d+)/.exec(rest))) { fam = 'Mono'; cap = +m[2] * 0.62; }
    else {
      if (/^(cour|profont|t0_|pro|mono|inconsolata|ter|spleen)/.test(rest)) fam = 'Mono';
      else if (/^(ncen|tim|times|serif)/.test(rest)) fam = 'Serif';
      let px = 8;
      if (/^unifont/.test(rest)) px = 12;
      else if ((m = /(\d+)/.exec(rest))) px = +m[1];
      cap = px * 0.72;
    }
    if (cap <= 9) return { u8g2: true, gfx: null, marime: 1, nume };
    // alegem între fonturile GFX din aceeași familie și fontul clasic mărit (înălțime 14)
    let best = null, dist = Infinity;
    for (const st of ['', 'Bold']) for (const pt of (DISPONIBIL[fam][st] || [])) {
      const f = FG['Free' + fam + st + pt + 'pt7b'];
      if (!f) continue;
      const d = Math.abs(capFont(f) - cap) + ((st === 'Bold') === bold ? 0 : 1.5);
      if (d < dist) { dist = d; best = f; }
    }
    if (!best || (fam === 'Mono' && Math.abs(14 - cap) <= dist)) return { u8g2: true, gfx: null, marime: 2, nume };
    return { u8g2: true, gfx: best, marime: 1, nume };
  }
  api.functie('__fontU8g2', function __fontU8g2(n) { return fontU8g2(n); }, 'obj:GFXfont');
  api.functie('__fontU8x8', function __fontU8x8(n) { return { u8x8: true, nume: n }; }, 'obj:GFXfont');

  // ---------- culori și constante ----------
  const TFT = { TFT_BLACK: 0x0000, TFT_NAVY: 0x000F, TFT_DARKGREEN: 0x03E0, TFT_DARKCYAN: 0x03EF, TFT_MAROON: 0x7800, TFT_PURPLE: 0x780F, TFT_OLIVE: 0x7BE0, TFT_LIGHTGREY: 0xD69A, TFT_DARKGREY: 0x7BEF,
    TFT_BLUE: 0x001F, TFT_GREEN: 0x07E0, TFT_CYAN: 0x07FF, TFT_RED: 0xF800, TFT_MAGENTA: 0xF81F, TFT_YELLOW: 0xFFE0, TFT_WHITE: 0xFFFF, TFT_ORANGE: 0xFDA0, TFT_GREENYELLOW: 0xB7E0, TFT_PINK: 0xFE19,
    TFT_BROWN: 0x9A60, TFT_GOLD: 0xFEA0, TFT_SILVER: 0xC618, TFT_SKYBLUE: 0x867D, TFT_VIOLET: 0x915C, TFT_TRANSPARENT: 0x0120 };
  Object.assign(api.constante, TFT);
  for (const pre of ['ILI9341_', 'ST77XX_', 'ST7735_', 'GC9A01A_', 'ILI9488_']) {
    for (const [k, v] of Object.entries({ BLACK: 0x0000, NAVY: 0x000F, DARKGREEN: 0x03E0, DARKCYAN: 0x03EF, MAROON: 0x7800, PURPLE: 0x780F, OLIVE: 0x7BE0, LIGHTGREY: 0xC618, DARKGREY: 0x7BEF, BLUE: 0x001F, GREEN: 0x07E0, CYAN: 0x07FF, RED: 0xF800, MAGENTA: 0xF81F, YELLOW: 0xFFE0, WHITE: 0xFFFF, ORANGE: 0xFD20, GREENYELLOW: 0xAFE5, PINK: 0xFC18 })) api.constante[pre + k] = v;
  }
  Object.assign(api.constante, {
    SSD1306_WHITE: 1, SSD1306_BLACK: 0, SSD1306_INVERSE: 2, WHITE: 1, BLACK: 0, INVERSE: 2, SH110X_WHITE: 1, SH110X_BLACK: 0, SH110X_INVERSE: 2,
    SSD1306_SWITCHCAPVCC: 2, SSD1306_EXTERNALVCC: 1, SSD1306_DISPLAYOFF: 0xAE, SSD1306_DISPLAYON: 0xAF, SSD1306_SETCONTRAST: 0x81, SSD1306_INVERTDISPLAY: 0xA7, SSD1306_NORMALDISPLAY: 0xA6,
    TL_DATUM: 0, TC_DATUM: 1, TR_DATUM: 2, ML_DATUM: 3, CL_DATUM: 3, MC_DATUM: 4, CC_DATUM: 4, MR_DATUM: 5, CR_DATUM: 5, BL_DATUM: 6, BC_DATUM: 7, BR_DATUM: 8, L_BASELINE: 9, C_BASELINE: 10, R_BASELINE: 11, GFXFF: 1,
    U8G2_R0: 0, U8G2_R1: 1, U8G2_R2: 2, U8G2_R3: 3, U8G2_MIRROR: 4, U8X8_PIN_NONE: 255, U8G2_DRAW_ALL: 15, U8G2_DRAW_UPPER_RIGHT: 1, U8G2_DRAW_UPPER_LEFT: 2, U8G2_DRAW_LOWER_LEFT: 4, U8G2_DRAW_LOWER_RIGHT: 8,
    INITR_BLACKTAB: 0, INITR_REDTAB: 1, INITR_GREENTAB: 2, INITR_144GREENTAB: 3, INITR_MINI160x80: 4, INITR_HALLOWING: 5,
    SEG_A: 1, SEG_B: 2, SEG_C: 4, SEG_D: 8, SEG_E: 16, SEG_F: 32, SEG_G: 64, SEG_DP: 128,
    NEO_RGB: 0x06, NEO_RBG: 0x09, NEO_GRB: 0x52, NEO_GBR: 0xA1, NEO_BRG: 0x58, NEO_BGR: 0xA4, NEO_RGBW: 0xC6, NEO_GRBW: 0xD2, NEO_KHZ800: 0, NEO_KHZ400: 0x100,
    LCD_5x8DOTS: 0, LCD_5x10DOTS: 4
  });

  // ---------- afișaje monocrome cu tampon în placă (SSD1306, SH1106) ----------
  class AfisajMono extends GFX {
    constructor(w, h) {
      super(w || 128, h || 64);
      this.buf = new Uint8Array(this.WIDTH * this.HEIGHT);
      this.dev = null;
      this.culoareGresita = false;
    }
    // ca în Adafruit_SSD1306: doar 0 (negru), 1 (alb) și 2 (inversare) desenează ceva
    _px(x, y, c) {
      const i = y * this.WIDTH + x;
      if (c === 1) this.buf[i] = 1; else if (c === 0) this.buf[i] = 0; else if (c === 2) this.buf[i] ^= 1;
      else this.culoareGresita = true;
    }
    clearDisplay() { this.buf.fill(0); }
    getBuffer() { return this.buf; }
    getPixel(x, y) {
      if (x < 0 || y < 0 || x >= this._width || y >= this._height) return false;
      let t;
      switch (this.rotation) { case 1: t = x; x = this.WIDTH - 1 - y; y = t; break; case 2: x = this.WIDTH - 1 - x; y = this.HEIGHT - 1 - y; break; case 3: t = x; x = y; y = this.HEIGHT - 1 - t; break; }
      return !!this.buf[y * this.WIDTH + x];
    }
    _leaga(adresa, numeLib, wire) {
      const dev = M.i2c.gasesteI2C(wire, adresa, ['oled'], numeLib);
      this.dev = dev;
      if (!dev) return;
      if (dev.tampon.h !== this.HEIGHT || dev.tampon.w !== this.WIDTH) {
        S().problema('oled-inaltime-' + dev.inst.id, 'avertisment', numeLib + ' e configurat pentru ' + this.WIDTH + '×' + this.HEIGHT + ', dar ' + dev.inst.eticheta + ' are ' + dev.tampon.w + '×' + dev.tampon.h + '. Imaginea apare întinsă sau tăiată.', { linie: linie(), comp: dev.inst.id });
      }
      if (dev.controler !== this.controler) {
        S().problema('oled-controler-' + dev.inst.id, 'avertisment', dev.inst.eticheta + ' are controlerul ' + dev.controler + ', dar biblioteca e pentru ' + this.controler + '. ' +
          (dev.controler === 'SH1106' ? 'Imaginea apare deplasată cu 2 coloane și cu o dungă de zgomot în stânga — folosește Adafruit_SH1106G (biblioteca Adafruit_SH110X) sau U8G2_SH1106_128X64_NONAME_F_HW_I2C.' : 'Imaginea apare deplasată cu 2 coloane — folosește Adafruit_SSD1306.'), { linie: linie(), comp: dev.inst.id });
      }
      dev.initializat = true; dev.pornit = true; dev.invers = false; dev.contrast = 1; dev.murdar = true;
    }
    // copiază o zonă din tamponul plăcii în memoria afișajului
    _trimite(x0, y0, x1, y1) {
      const d = this.dev;
      if (!d) return;
      const t = d.tampon, sim = S();
      const gresit = d.controler !== this.controler;
      const dx = gresit ? (d.controler === 'SH1106' ? 2 : -2) : 0;
      const sy = this.HEIGHT / t.h;
      for (let y = Math.max(0, y0); y < Math.min(t.h, y1); y++) {
        for (let x = Math.max(0, x0 + dx); x < Math.min(t.w, x1 + dx); x++) {
          const bx = x - dx, by = Math.floor(y * sy);
          t.date[y * t.w + x] = bx >= 0 && bx < this.WIDTH && by < this.HEIGHT ? this.buf[by * this.WIDTH + bx] : 0;
        }
        // coloanele scrise pe alături păstrează „zgomotul” din memoria controlerului
        if (gresit && d.controler === 'SH1106') for (let x = 0; x < 2; x++) t.date[y * t.w + x] = ((x * 7 + y * 13 + (sim.timp / 4e5 | 0)) % 3 === 0) ? 1 : 0;
      }
      d.murdar = true;
    }
    display() {
      const sim = S();
      const fr = this.wire ? this.wire.frecventa : 400000;
      sim.consuma(this.WIDTH * this.HEIGHT / 8 * 9e6 / Math.max(fr, 400000) + 300);
      if (this.culoareGresita && !this.avertizatCuloare) {
        this.avertizatCuloare = true;
        sugestie('oled-culoare', 'O parte din desene nu apare: pe OLED culorile sunt doar SSD1306_WHITE (1), SSD1306_BLACK (0) și SSD1306_INVERSE (2). Pentru text scrie display.setTextColor(SSD1306_WHITE);');
      }
      this._trimite(0, 0, this.WIDTH, this.HEIGHT);
    }
    invertDisplay(i) { if (this.dev) { this.dev.invers = !!i; this.dev.murdar = true; } }
    dim(d) { if (this.dev) { this.dev.contrast = d ? 0.3 : 1; this.dev.murdar = true; } }
    setContrast(c) { if (this.dev) { this.dev.contrast = Math.max(0.1, (c & 255) / 255); this.dev.murdar = true; } }
    oled_command(c) { this.ssd1306_command(c); }
    ssd1306_command(c) {
      if (!this.dev) return;
      if (c === 0xAE) this.dev.pornit = false; else if (c === 0xAF) this.dev.pornit = true;
      else if (c === 0xA7) this.dev.invers = true; else if (c === 0xA6) this.dev.invers = false;
      this.dev.murdar = true;
    }
    startscrollright() { sugestie('oled-scroll', 'Derularea hardware a OLED-ului (startscroll…) nu e animată în simulare; imaginea rămâne pe loc.'); }
    startscrollleft() { this.startscrollright(); } startscrolldiagright() { this.startscrollright(); } startscrolldiagleft() { this.startscrollright(); } stopscroll() { }
  }
  AfisajMono.tipuri = Object.assign({}, GFX.tipuri, { begin: 'bool', getPixel: 'bool' });

  class Adafruit_SSD1306 extends AfisajMono {
    constructor(a, b, c, ...rest) {
      // (w, h, &Wire, rst) · (w, h, &SPI, dc, rst, cs) · (w, h, mosi, sclk, dc, rst, cs) · (rst) — forma veche
      const vechi = b === undefined;
      super(vechi ? 128 : a, vechi ? 64 : b);
      this.controler = 'SSD1306';
      this.wire = c instanceof api.clase.TwoWire ? c : null;
      this.spi = c instanceof api.clase.SPIClass || (typeof c === 'number' && rest.length >= 3);
      this.textcolor = this.textbgcolor = 0xFFFF;
    }
    begin(vcs, adresa) {
      S().consuma(4000);
      if (this.spi) { S().problema('oled-spi', 'eroare', 'Adafruit_SSD1306 e creat pentru SPI, dar OLED-urile din schemă sunt pe I2C. Folosește Adafruit_SSD1306 display(128, 64, &Wire, -1);', { linie: linie() }); return true; }
      // ca în bibliotecă: fără adresă, 128×32 folosește 0x3C, iar 128×64 folosește 0x3D
      const adr = adresa ? adresa : (this.HEIGHT === 32 ? 0x3C : 0x3D);
      this._leaga(adr, 'Adafruit_SSD1306', this.wire);
      if (!this.dev && !adresa && adr === 0x3D) sugestie('oled-adresa-implicita', 'display.begin(SSD1306_SWITCHCAPVCC) fără adresă caută OLED-ul 128×64 la 0x3D. Majoritatea modulelor sunt la 0x3C: scrie display.begin(SSD1306_SWITCHCAPVCC, 0x3C).');
      return true; // biblioteca întoarce false doar dacă nu are memorie pentru tampon
    }
  }
  Adafruit_SSD1306.tipuri = AfisajMono.tipuri;
  api.clasa('Adafruit_SSD1306', Adafruit_SSD1306);
  class Adafruit_SH1106G extends AfisajMono {
    constructor(w, h, wire) { super(w || 128, h || 64); this.wire = wire instanceof api.clase.TwoWire ? wire : null; this.controler = 'SH1106'; this.textcolor = this.textbgcolor = 0xFFFF; }
    begin(adresa) { S().consuma(4000); this._leaga(adresa === undefined ? 0x3C : adresa, 'Adafruit_SH1106G', this.wire); return true; }
  }
  Adafruit_SH1106G.tipuri = AfisajMono.tipuri;
  api.clasa('Adafruit_SH1106G', Adafruit_SH1106G);
  api.clasa('Adafruit_SH1106', Adafruit_SH1106G);

  // ---------- U8g2 (cu tampon) și U8x8 (doar text, fără tampon) ----------
  function leagaU8(obj, numeLib) {
    const sim = S();
    if (obj.magistrala.includes('SPI')) {
      sim.problema('u8g2-spi', 'eroare', numeLib + ' e varianta pentru SPI, dar OLED-urile din schemă sunt pe I2C. Folosește varianta …_HW_I2C (ex. U8G2_SSD1306_128X64_NONAME_F_HW_I2C).', { linie: linie() });
      return;
    }
    let wire;
    const valid = (p) => typeof p === 'number' && p >= 0 && p !== 255;
    if (obj.magistrala === 'SW_I2C') {
      wire = new api.clase.TwoWire(9);
      wire.begin(obj.pinDate, obj.pinCeas);
      wire.frecventa = 100000;
    } else {
      wire = obj.magistrala === '2ND_HW_I2C' ? sim.obiecte.Wire1 : sim.obiecte.Wire;
      if (valid(obj.pinCeas) && valid(obj.pinDate)) wire.begin(obj.pinDate, obj.pinCeas);
      else if (!wire.pornit) wire.begin();
    }
    obj.wire = wire;
    obj._leaga(obj.adresa, numeLib, wire);
  }
  function argsU8(obj, magistrala, rot, a, b, c) {
    obj.magistrala = magistrala; obj.adresa = 0x3C;
    if (magistrala === 'SW_I2C') { obj.pinCeas = a; obj.pinDate = b; }
    else if (magistrala.includes('I2C')) { obj.pinCeas = b; obj.pinDate = c; }
    obj.rotatieInitiala = rot | 0;
  }
  class U8G2 extends AfisajMono {
    constructor(w, h, controler, magistrala, rot, a, b, c) {
      super(w || 128, h || 64);
      this.controler = controler || 'SSD1306';
      argsU8(this, magistrala || 'HW_I2C', rot, a, b, c);
      if (this.rotatieInitiala & 3) this.setRotation(this.rotatieInitiala & 3);
      this.culoareDesen = 1; this.pozFont = 'baseline'; this.modBitmap = 0;
      this.textcolor = this.textbgcolor = 1;
      this.wrap = false;
      this.fontCurent = null;
      this.numeLib = 'U8g2';
    }
    begin() { S().consuma(4000); leagaU8(this, this.numeLib); if (this.dev) { this.clearBuffer(); this._trimite(0, 0, this.WIDTH, this.HEIGHT); } return true; }
    initDisplay() { } clearDisplay() { this.clearBuffer(); this.sendBuffer(); }
    setI2CAddress(a) { this.adresa = (a & 0xFF) >> 1; }
    setPowerSave(p) { if (this.dev) { this.dev.pornit = !p; this.dev.murdar = true; } }
    setBusClock(f) { if (this.wire) this.wire.frecventa = f; }
    clearBuffer() { this.buf.fill(0); }
    sendBuffer() {
      const fr = this.wire ? this.wire.frecventa : 400000;
      S().consuma(this.WIDTH * this.HEIGHT / 8 * 9e6 / fr + 300);
      this._trimite(0, 0, this.WIDTH, this.HEIGHT);
    }
    updateDisplay() { this.sendBuffer(); }
    updateDisplayArea() { this.sendBuffer(); }
    clear() { this.clearBuffer(); this.sendBuffer(); this.home(); }
    home() { this.setCursor(0, 0); }
    firstPage() { this.clearBuffer(); }
    nextPage() { this.sendBuffer(); return 0; }
    // culori: 0 șterge, 1 aprinde, 2 inversează
    _c() { const c = this.culoareDesen; return c === 0 ? 0 : c === 2 ? 2 : 1; }
    setDrawColor(c) { this.culoareDesen = c & 3; }
    getDrawColor() { return this.culoareDesen; }
    setFontMode(m) { this.modFont = m; }
    setBitmapMode(m) { this.modBitmap = m; }
    setFont(f) {
      this.fontCurent = f || null;
      if (f && f.glife) { this.gfxFont = f; this.textsize_x = this.textsize_y = 1; }
      else if (f && f.u8g2) { this.gfxFont = f.gfx || null; this.textsize_x = this.textsize_y = f.gfx ? 1 : (f.marime || 1); }
      else { this.gfxFont = null; this.textsize_x = this.textsize_y = 1; }
    }
    setFontPosTop() { this.pozFont = 'top'; } setFontPosBaseline() { this.pozFont = 'baseline'; } setFontPosCenter() { this.pozFont = 'center'; } setFontPosBottom() { this.pozFont = 'bottom'; }
    setFontDirection() { } setFontRefHeightExtendedText() { } setFontRefHeightText() { } setFontRefHeightAll() { } enableUTF8Print() { } disableUTF8Print() { }
    getAscent() { return this.gfxFont ? capFont(this.gfxFont) : 7 * this.textsize_y; }
    getDescent() {
      if (!this.gfxFont) return -1 * this.textsize_y;
      const f = this.gfxFont, i = 103 - f.first; // „g”
      return -(f.glife[i * 6 + 2] + f.glife[i * 6 + 5]);
    }
    // deplasarea pe verticală dintre punctul dat și locul de desenare (U8g2 măsoară de la linia de bază)
    _dy() {
      const asc = this.getAscent(), desc = this.getDescent();
      const sus = this.gfxFont ? 0 : -7 * this.textsize_y; // fontul clasic se desenează din colțul de sus
      switch (this.pozFont) {
        case 'top': return sus + asc;
        case 'center': return sus + Math.round((asc + desc) / 2);
        case 'bottom': return sus + desc;
        default: return sus;
      }
    }
    write(c, n) {
      if (typeof c !== 'number') return super.write(c, n);
      const dy = this._dy();
      this.textcolor = this.textbgcolor = this._c();
      this.cursor_y += dy;
      const r = super.write(c);
      this.cursor_y -= dy;
      return r;
    }
    drawStr(x, y, s) {
      const t = txt(s);
      const vx = this.cursor_x, vy = this.cursor_y;
      this.cursor_x = x; this.cursor_y = y;
      for (let i = 0; i < t.length; i++) this.write(t.charCodeAt(i));
      this.cursor_x = vx; this.cursor_y = vy;
      return this.getStrWidth(t);
    }
    drawUTF8(x, y, s) { return this.drawStr(x, y, M.utf8.decodeaza(txt(s)).normalize('NFD').replace(/[̀-ͯ]/g, '')); }
    drawGlyph(x, y, c) { const vx = this.cursor_x, vy = this.cursor_y; this.cursor_x = x; this.cursor_y = y; this.write(c & 255); this.cursor_x = vx; this.cursor_y = vy; return this.getStrWidth(String.fromCharCode(c & 255)); }
    drawButtonUTF8(x, y, flags, w, px, py, s) { return this.drawUTF8(x, y, s); }
    getStrWidth(s) {
      const t = txt(s);
      if (!this.gfxFont) return t.length * 6 * this.textsize_x;
      const f = this.gfxFont;
      let w = 0;
      for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); if (c >= f.first && c <= f.last) w += f.glife[(c - f.first) * 6 + 3]; }
      return w;
    }
    getUTF8Width(s) { return this.getStrWidth(M.utf8.decodeaza(txt(s))); }
    getMaxCharHeight() { return this.gfxFont ? this.gfxFont.yAdvance : 8 * this.textsize_y; }
    getMaxCharWidth() { return this.gfxFont ? this.getStrWidth('W') : 6 * this.textsize_x; }
    getFontAscent() { return this.getAscent(); } getFontDescent() { return this.getDescent(); }
    getDisplayWidth() { return this._width; }
    getDisplayHeight() { return this._height; }
    getBufferTileWidth() { return this.WIDTH / 8; } getBufferTileHeight() { return this.HEIGHT / 8; }
    // primitive U8g2: culoarea vine din setDrawColor
    drawPixel(x, y, c) { super.drawPixel(x, y, c === undefined ? this._c() : c); }
    drawBox(x, y, w, h) { this.fillRect(x, y, w, h, this._c()); }
    drawFrame(x, y, w, h) { this.drawRect(x, y, w, h, this._c()); }
    drawRBox(x, y, w, h, r) { this.fillRoundRect(x, y, w, h, r, this._c()); }
    drawRFrame(x, y, w, h, r) { this.drawRoundRect(x, y, w, h, r, this._c()); }
    drawDisc(x, y, r) { this.fillCircle(x, y, r, this._c()); }
    drawCircle(x, y, r) { super.drawCircle(x, y, r, this._c()); }
    drawEllipse(x0, y0, rx, ry) { this._elipsa(x0, y0, rx, ry, false); }
    drawFilledEllipse(x0, y0, rx, ry) { this._elipsa(x0, y0, rx, ry, true); }
    _elipsa(x0, y0, rx, ry, plin) {
      const c = this._c();
      for (let y = -ry; y <= ry; y++) {
        const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry || 1))));
        if (plin) this.drawFastHLine(x0 - w, y0 + y, 2 * w + 1, c);
        else { super.drawPixel(x0 - w, y0 + y, c); if (w) super.drawPixel(x0 + w, y0 + y, c); }
      }
      if (!plin) for (let x = -rx; x <= rx; x++) { const h = Math.round(ry * Math.sqrt(Math.max(0, 1 - (x * x) / (rx * rx || 1)))); super.drawPixel(x0 + x, y0 - h, c); if (h) super.drawPixel(x0 + x, y0 + h, c); }
    }
    drawLine(a, b, c, d) { super.drawLine(a, b, c, d, this._c()); }
    drawHLine(x, y, w) { this.drawFastHLine(x, y, w, this._c()); }
    drawVLine(x, y, h) { this.drawFastVLine(x, y, h, this._c()); }
    drawTriangle(a, b, c, d, e, f) { this.fillTriangle(a, b, c, d, e, f, this._c()); }
    _bmp(x, y, w, h, bmp, xbm) {
      const c = this._c();
      const fond = this.modBitmap ? undefined : (c === 1 ? 0 : c === 0 ? 1 : undefined);
      const bw = (w + 7) >> 3;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const b = this._octet(bmp, j * bw + (i >> 3));
        const on = xbm ? (b >> (i & 7)) & 1 : (b >> (7 - (i & 7))) & 1;
        if (on) super.drawPixel(x + i, y + j, c); else if (fond !== undefined) super.drawPixel(x + i, y + j, fond);
      }
    }
    drawXBM(x, y, w, h, bmp) { this._bmp(x, y, w, h, bmp, true); }
    drawXBMP(x, y, w, h, bmp) { this._bmp(x, y, w, h, bmp, true); }
    drawBitmap(x, y, cnt, h, bmp) { this._bmp(x, y, cnt * 8, h, bmp, false); }
    setContrast(c) { if (this.dev) { this.dev.contrast = Math.max(0.1, (c & 255) / 255); this.dev.murdar = true; } }
    setFlipMode(m) { this.setRotation(m ? 2 : 0); }
    setDisplayRotation(r) { this.setRotation(r & 3); }
    userInterfaceMessage() { return 1; }
  }
  U8G2.tipuri = Object.assign({}, AfisajMono.tipuri, { getStrWidth: 'uint16_t', getUTF8Width: 'uint16_t', getAscent: 'int8_t', getDescent: 'int8_t', getFontAscent: 'int8_t', getFontDescent: 'int8_t', getDisplayWidth: 'uint16_t', getDisplayHeight: 'uint16_t',
    nextPage: 'uint8_t', drawStr: 'uint16_t', drawUTF8: 'uint16_t', drawGlyph: 'uint16_t', getMaxCharHeight: 'int8_t', getMaxCharWidth: 'int8_t', getDrawColor: 'uint8_t', getBufferTileWidth: 'uint8_t', getBufferTileHeight: 'uint8_t', userInterfaceMessage: 'uint8_t' });
  api.clasa('U8G2', U8G2);

  class U8X8 extends AfisajMono {
    constructor(w, h, controler, magistrala, rot, a, b, c) {
      super(w || 128, h || 64);
      this.controler = controler || 'SSD1306';
      argsU8(this, magistrala || 'HW_I2C', rot, a, b, c);
      this.invers = false; this.col = 0; this.rand = 0;
      this.numeLib = 'U8x8';
    }
    begin() { S().consuma(4000); leagaU8(this, this.numeLib); this.clearDisplay(); return true; }
    initDisplay() { }
    setI2CAddress(a) { this.adresa = (a & 0xFF) >> 1; }
    setPowerSave(p) { if (this.dev) { this.dev.pornit = !p; this.dev.murdar = true; } }
    setFont() { }
    setInverseFont(i) { this.invers = !!i; }
    getCols() { return this.WIDTH / 8; }
    getRows() { return this.HEIGHT / 8; }
    clearDisplay() { this.buf.fill(0); S().consuma(this.WIDTH * this.HEIGHT / 8 * 9e6 / 400000); this._trimite(0, 0, this.WIDTH, this.HEIGHT); }
    clear() { this.clearDisplay(); this.home(); }
    home() { this.col = 0; this.rand = 0; }
    clearLine(r) { this.buf.fill(0, r * 8 * this.WIDTH, (r + 1) * 8 * this.WIDTH); this._trimite(0, r * 8, this.WIDTH, r * 8 + 8); }
    refreshDisplay() { } setFlipMode() { } setContrast(c) { if (this.dev) { this.dev.contrast = Math.max(0.1, (c & 255) / 255); this.dev.murdar = true; } }
    // un caracter într-o celulă de 8×8 (sau mărit)
    _celula(col, rand, c, sx, sy) {
      const x = col * 8, y = rand * 8, w = 8 * sx, h = 8 * sy;
      this.fillRect(x, y, w, h, this.invers ? 1 : 0);
      GFX.prototype.drawChar.call(this, x + sx, y, c & 255, this.invers ? 0 : 1, this.invers ? 0 : 1, sx, sy);
      S().consuma(w / 8 * sy * 9e6 / 400000 + 40);
      this._trimite(x, y, x + w, y + h);
    }
    drawGlyph(col, rand, c) { this._celula(col, rand, c, 1, 1); }
    drawString(col, rand, s) { const t = txt(s); for (let i = 0; i < t.length; i++) this._celula(col + i, rand, t.charCodeAt(i), 1, 1); }
    drawUTF8(col, rand, s) { this.drawString(col, rand, M.utf8.decodeaza(txt(s)).normalize('NFD').replace(/[̀-ͯ]/g, '')); }
    draw2x2String(col, rand, s) { const t = txt(s); for (let i = 0; i < t.length; i++) this._celula(col + i * 2, rand, t.charCodeAt(i), 2, 2); }
    draw1x2String(col, rand, s) { const t = txt(s); for (let i = 0; i < t.length; i++) this._celula(col + i, rand, t.charCodeAt(i), 1, 2); }
    draw2x2Glyph(col, rand, c) { this._celula(col, rand, c, 2, 2); }
    draw2x2UTF8(col, rand, s) { this.draw2x2String(col, rand, M.utf8.decodeaza(txt(s))); }
    setCursor(col, rand) { this.col = col; this.rand = rand; }
    write(c, n) {
      if (typeof c !== 'number') return super.write(c, n);
      c &= 255;
      if (c === 10) { this.col = 0; this.rand++; return 1; }
      if (c === 13) return 1;
      this._celula(this.col, this.rand, c, 1, 1);
      this.col++;
      return 1;
    }
  }
  U8X8.tipuri = Object.assign({}, AfisajMono.tipuri, { getCols: 'uint8_t', getRows: 'uint8_t' });
  api.clasa('U8X8', U8X8);

  // numele claselor: U8G2_<CONTROLER>_<W>X<H>_<VARIANTĂ>_<F|1|2>_<MAGISTRALĂ> și U8X8_<…>_<MAGISTRALĂ>
  const MODELE_U8 = [['SSD1306', 128, 64, ['NONAME', 'VCOMH0', 'ALT0', 'EA_OLEDS102']], ['SSD1306', 128, 32, ['UNIVISION', 'WINSTAR']], ['SSD1306', 64, 48, ['ER']], ['SSD1306', 72, 40, ['ER']], ['SSD1306', 96, 16, ['ER']], ['SSD1306', 64, 32, ['NONAME', '1F']],
    ['SH1106', 128, 64, ['NONAME', 'VCOMH0', 'WINSTAR']], ['SH1106', 72, 40, ['WISE']], ['SSD1309', 128, 64, ['NONAME0', 'NONAME2']]];
  const MAGISTRALE = ['HW_I2C', 'SW_I2C', '2ND_HW_I2C', '4W_HW_SPI', '4W_SW_SPI', '3W_SW_SPI'];
  for (const [ctrl, w, h, variante] of MODELE_U8) for (const v of variante) for (const bus of MAGISTRALE) {
    const ctrlSim = ctrl === 'SH1106' ? 'SH1106' : 'SSD1306';
    for (const b of ['F', '1', '2']) {
      const nume = 'U8G2_' + ctrl + '_' + w + 'X' + h + '_' + v + '_' + b + '_' + bus;
      const C = class extends U8G2 { constructor(rot, a, b2, c) { super(w, h, ctrlSim, bus, rot, a, b2, c); this.numeLib = nume; } };
      C.tipuri = U8G2.tipuri;
      api.clase[nume] = C;
    }
    const numeX = 'U8X8_' + ctrl + '_' + w + 'X' + h + '_' + v + '_' + bus;
    const CX = class extends U8X8 { constructor(rot, a, b2, c) { super(w, h, ctrlSim, bus, rot, a, b2, c); this.numeLib = numeX; } };
    CX.tipuri = U8X8.tipuri;
    api.clase[numeX] = CX;
  }

  // ---------- LCD cu caractere (HD44780) ----------
  class LcdBaza extends api.clase.Print {
    constructor() { super(); this.dev = null; this.costCaracter = 60; }
    _cost(n) { S().consuma(n); }
    _scrie(t) { for (let i = 0; i < t.length; i++) this.write(t.charCodeAt(i)); }
    clear() { this._cost(2000 + this.costCaracter); if (this.dev) this.dev.goleste(); }
    home() { this._cost(2000 + this.costCaracter); if (this.dev) { this.dev.cursor = 0; this.dev.deplasare = 0; this.dev.murdar = true; } }
    setCursor(c, r) { this._cost(this.costCaracter); if (this.dev) this.dev.seteazaCursor(c & 0xFF, r & 0xFF); }
    write(c, n) {
      if (typeof c !== 'number') return super.write(c, n);
      this._cost(this.costCaracter);
      if (this._laScriere) this._laScriere();
      if (this.dev) this.dev.scrie(this._transforma ? this._transforma(c & 255) : c & 255);
      return 1;
    }
    createChar(n, octeti) {
      this._cost(this.costCaracter * 9);
      if (!this.dev) return;
      const g = [];
      for (let i = 0; i < 8; i++) g.push(((octeti && octeti[i]) || 0) & 0x1F);
      this.dev.cgram[n & 7] = g; this.dev.murdar = true;
    }
    display() { if (this.dev) { this.dev.afisaj = true; this.dev.murdar = true; } }
    noDisplay() { if (this.dev) { this.dev.afisaj = false; this.dev.murdar = true; } }
    cursor() { if (this.dev) { this.dev.cursorVizibil = true; this.dev.murdar = true; } }
    noCursor() { if (this.dev) { this.dev.cursorVizibil = false; this.dev.murdar = true; } }
    blink() { if (this.dev) { this.dev.clipire = true; this.dev.murdar = true; } }
    noBlink() { if (this.dev) { this.dev.clipire = false; this.dev.murdar = true; } }
    scrollDisplayLeft() { this._cost(this.costCaracter); if (this.dev) { this.dev.deplasare++; this.dev.murdar = true; } }
    scrollDisplayRight() { this._cost(this.costCaracter); if (this.dev) { this.dev.deplasare--; this.dev.murdar = true; } }
    leftToRight() { } rightToLeft() { } autoscroll() { } noAutoscroll() { } command() { }
  }
  LcdBaza.tipuri = api.clase.Print.tipuri;
  class LiquidCrystal_I2C extends LcdBaza {
    constructor(adresa, col, rand) {
      super();
      this.adresa = adresa; this.col = col || 16; this.rand = rand || 2;
      this.lumina = false; // ca în bibliotecă: lumina de fundal pornește doar cu backlight()
      this.costCaracter = 550; // 4 biți prin PCF8574 la 100 kHz
      this._laScriere = () => {
        if (!this.lumina && !this.avertizatLumina && this.dev) { this.avertizatLumina = true; sugestie('lcd-lumina', 'Lumina de fundal a LCD-ului e stinsă, așa că textul abia se vede. Adaugă lcd.backlight(); după lcd.init() (sau lcd.begin()).'); }
      };
    }
    init() { this.begin(); }
    begin(c, r) {
      if (typeof c === 'number' && typeof r === 'number') { this.col = c; this.rand = r; }
      S().consuma(52000);
      this.dev = M.i2c.gasesteI2C(null, this.adresa, ['lcd'], 'LiquidCrystal_I2C');
      if (!this.dev) return;
      const d = this.dev;
      d.goleste(); d.afisaj = true; d.initializat = true; d.cursorVizibil = false; d.clipire = false; d.lumina = this.lumina; d.murdar = true;
      if (d.col !== this.col || d.rand !== this.rand) S().problema('lcd-marime-' + d.inst.id, 'avertisment', 'În cod LCD-ul e ' + this.col + '×' + this.rand + ', dar în schemă ' + d.inst.eticheta + ' e ' + d.col + '×' + d.rand + '. Rândurile pot ieși amestecate.', { linie: linie(), comp: d.inst.id });
    }
    backlight() { this.lumina = true; this._cost(200); if (this.dev) { this.dev.lumina = true; this.dev.murdar = true; } }
    noBacklight() { this.lumina = false; this._cost(200); if (this.dev) { this.dev.lumina = false; this.dev.murdar = true; } }
    setBacklight(v) { if (v) this.backlight(); else this.noBacklight(); }
    getBacklight() { return this.lumina; }
    printstr(s) { this.print(s); }
    load_custom_character(n, b) { this.createChar(n, b); }
    on() { this.display(); this.backlight(); }
    off() { this.noDisplay(); this.noBacklight(); }
  }
  LiquidCrystal_I2C.tipuri = Object.assign({}, LcdBaza.tipuri, { getBacklight: 'bool' });
  api.clasa('LiquidCrystal_I2C', LiquidCrystal_I2C);
  class LiquidCrystal extends LcdBaza {
    constructor(...p) {
      super();
      // (rs, en, d4..d7) · (rs, rw, en, d4..d7) · (rs, en, d0..d7) · (rs, rw, en, d0..d7)
      if (p.length === 6) { this.rs = p[0]; this.en = p[1]; this.date = p.slice(2); }
      else if (p.length === 7) { this.rs = p[0]; this.en = p[2]; this.date = p.slice(3); }
      else if (p.length === 10) { this.rs = p[0]; this.en = p[1]; this.date = p.slice(6); }
      else { this.rs = p[0]; this.en = p[2]; this.date = p.slice(7); }
      this.costCaracter = 45;
    }
    begin(col, rand) {
      const sim = S();
      sim.consuma(52000);
      const lcd = sim.cautaDupaPin(['lcd-16x2'], 'RS', this.rs).find(d => sim.netPin(d.inst, 'E') === sim.netGPIO(this.en));
      this.dev = lcd || null;
      if (!lcd) {
        const oricare = sim.dispozitive(['lcd-16x2'])[0];
        sim.problema('lcd-par', 'eroare', 'LiquidCrystal: nu găsesc LCD-ul cu RS pe pinul ' + this.rs + ' și E pe pinul ' + this.en + '.' + (oricare ? ' Verifică firele RS și E ale lui ' + oricare.inst.eticheta + '.' : ' Nu există un LCD paralel în schemă.'), { linie: linie() });
        return;
      }
      // biții de date: LCD-ul primește pe D(4+i) ce e pe firul legat acolo
      const perm = [], lipsa = [];
      for (let i = 0; i < 4; i++) {
        const netDev = sim.netPin(lcd.inst, 'D' + (4 + i));
        const idx = this.date.findIndex(g => netDev >= 0 && sim.netGPIO(g) === netDev);
        perm.push(idx);
        if (idx < 0) lipsa.push('D' + (4 + i));
      }
      if (lipsa.length) sim.problema('lcd-date', 'eroare', 'LCD: ' + lipsa.join(', ') + (lipsa.length > 1 ? ' nu sunt legați' : ' nu e legat') + ' la pinii dați în LiquidCrystal(...). Pe ecran apar caractere greșite.', { linie: linie(), comp: lcd.inst.id });
      else if (perm.some((v, i) => v !== i)) sim.problema('lcd-ordine', 'eroare', 'LCD: firele D4–D7 nu sunt în aceeași ordine ca în LiquidCrystal(...). Caracterele ies amestecate.', { linie: linie(), comp: lcd.inst.id });
      const rw = sim.netPin(lcd.inst, 'RW');
      if (sim.circuit.fix.get(rw) !== 0) sim.problema('lcd-rw', 'avertisment', 'Pinul RW al LCD-ului trebuie legat la GND; altfel LCD-ul poate încerca să citească în loc să scrie.', { linie: linie(), comp: lcd.inst.id });
      const identic = perm.every((v, i) => v === i);
      this._transforma = identic ? null : (c) => {
        let r = 0;
        for (const jum of [4, 0]) {
          const n = (c >> jum) & 15;
          let o = 0;
          for (let i = 0; i < 4; i++) { const src = perm[i]; const bit = src < 0 ? (Math.random() < 0.5 ? 1 : 0) : (n >> src) & 1; o |= bit << i; }
          r |= o << jum;
        }
        return r;
      };
      lcd.goleste(); lcd.afisaj = true; lcd.initializat = true; lcd.murdar = true;
      if (col && rand && (col !== lcd.col || rand !== lcd.rand)) sim.problema('lcd-marime-' + lcd.inst.id, 'avertisment', 'lcd.begin(' + col + ', ' + rand + '), dar LCD-ul din schemă e ' + lcd.col + '×' + lcd.rand + '.', { linie: linie(), comp: lcd.inst.id });
      sim.verificaAlimentare(lcd.inst, 4.5, 5.5, 'VDD', 'VSS');
    }
  }
  LiquidCrystal.tipuri = LcdBaza.tipuri;
  api.clasa('LiquidCrystal', LiquidCrystal);

  // ---------- ecrane TFT ----------
  // ascensiunea/coborârea maximă a unui font GFX (ca glyph_ab/glyph_bb din TFT_eSPI)
  function limiteFont(f) {
    if (f.__ab !== undefined) return f;
    let ab = 0, bb = 0;
    for (let c = Math.max(32, f.first); c <= Math.min(126, f.last); c++) {
      const i = c - f.first, h = f.glife[i * 6 + 2], yo = f.glife[i * 6 + 5];
      if (-yo > ab) ab = -yo;
      if (h + yo > bb) bb = h + yo;
    }
    f.__ab = ab; f.__bb = bb;
    return f;
  }
  class TFT_eSPI extends GFX {
    constructor(w, h) {
      super(w || 240, h || 320);
      this.dev = null; this.datum = 0; this.font = 1; this.padding = 0;
      this.textcolor = 0xFFFF; this.textbgcolor = 0x0000; // ca în TFT_eSPI: text alb pe fundal negru
      this.schimbOcteti = false;
      this.esteSprite = false;
      this.costPixel = 0.4;
    }
    init() { this.begin(); }
    begin() {
      const sim = S();
      sim.consuma(120000);
      const cip = sim.cip || {};
      const cuSpi = sim.dispozitive(['tft']).filter(d => {
        const g = (p) => sim.gpioLaNet(sim.netPin(d.inst, p)).length > 0;
        return g('SCK') && g('MOSI');
      });
      const tft = cuSpi.find(d => cip.spi && sim.gpioLaNet(sim.netPin(d.inst, 'SCK')).includes(cip.spi.sck)) || cuSpi[0];
      if (!tft) {
        const oricare = sim.dispozitive(['tft'])[0];
        sim.problema('tft-lipsa', 'eroare', oricare ? 'TFT_eSPI: ' + oricare.inst.eticheta + ' nu are SCK și MOSI (SDA/SDI) legate la placă.' : 'TFT_eSPI: nu există niciun ecran TFT în schemă.', { linie: linie() });
        return;
      }
      this._leagaTft(tft);
    }
    _leagaTft(tft) {
      const sim = S();
      this.dev = tft;
      this.WIDTH = tft.w; this.HEIGHT = tft.h;
      this.setRotation(this.rotation);
      tft.pornit = true; tft.murdar = true; tft.invers = false;
      // la prima pornire memoria ecranului conține zgomot, până e ștearsă
      if (!tft.initializat) { const d = tft.tampon.date; for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 65536) | 0; tft.initializat = true; }
      this.costPixel = tft.costPixeli(1);
      if (tft.info.pini !== 'fara-cs') {
        const nCs = sim.netPin(tft.inst, 'CS');
        if (sim.gpioLaNet(nCs).length === 0 && sim.circuit.fix.get(nCs) !== 0) sim.problema('tft-cs-' + tft.inst.id, 'avertisment', tft.inst.eticheta + ': pinul CS nu e legat la placă (sau la GND), deci ecranul nu răspunde la comenzi.', { comp: tft.inst.id });
      }
      if (sim.gpioLaNet(sim.netPin(tft.inst, 'DC')).length === 0) sim.problema('tft-dc-' + tft.inst.id, 'eroare', tft.inst.eticheta + ': pinul DC nu e legat la placă — ecranul nu poate deosebi comenzile de date.', { comp: tft.inst.id });
      const nRst = sim.netPin(tft.inst, 'RST');
      if (nRst < 0 || sim.retea.piniReali(nRst).length < 2) sim.problema('tft-rst-' + tft.inst.id, 'info', tft.inst.eticheta + ': pinul RST (RESET) nu e legat. Leagă-l la un pin al plăcii sau la 3V3, altfel ecranul poate rămâne alb.', { comp: tft.inst.id });
    }
    // memoria în care se desenează: sprite-ul sau ecranul
    _tinta() { return this.esteSprite ? this.sprite : (this.dev ? this.dev.tampon : null); }
    _cuantizeaza(c) {
      if (!this.esteSprite || this.adancime === 16) return c & 0xFFFF;
      if (this.adancime === 1) return (c & 0xFFFF) ? 0xFFFF : 0;
      const r3 = (c >> 13) & 7, g3 = (c >> 8) & 7, b2 = (c >> 3) & 3;
      return (((r3 << 2) | (r3 >> 1)) << 11) | (((g3 << 3) | g3) << 5) | ((b2 << 3) | (b2 << 1) | (b2 >> 1));
    }
    _px(x, y, c) {
      const t = this._tinta();
      if (!t || x >= t.w || y >= t.h) return;
      t.date[y * t.w + x] = this._cuantizeaza(c);
      if (!this.esteSprite) this.dev.murdar = true;
    }
    // scriere directă cu rotația acestui obiect, fără cost (folosită la pushSprite)
    _scrieDirect(x, y, c) {
      if (x < 0 || y < 0 || x >= this._width || y >= this._height) return;
      let t;
      switch (this.rotation) { case 1: t = x; x = this.WIDTH - 1 - y; y = t; break; case 2: x = this.WIDTH - 1 - x; y = this.HEIGHT - 1 - y; break; case 3: t = x; x = y; y = this.HEIGHT - 1 - t; break; }
      this._px(x, y, c);
    }
    // dreptunghiul logic -> dreptunghiul din memorie (rotația mută colțurile)
    _fizic(x0, y0, x1, y1) {
      const W = this.WIDTH, H = this.HEIGHT;
      const p = (x, y) => { switch (this.rotation) { case 1: return [W - 1 - y, x]; case 2: return [W - 1 - x, H - 1 - y]; case 3: return [y, H - 1 - x]; default: return [x, y]; } };
      const a = p(x0, y0), b = p(x1 - 1, y1 - 1);
      return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]) + 1, Math.max(a[1], b[1]) + 1];
    }
    fillRect(x, y, w, h, c) {
      x = Math.trunc(x); y = Math.trunc(y); w = Math.trunc(w); h = Math.trunc(h);
      if (w < 0) { x += w + 1; w = -w; } if (h < 0) { y += h + 1; h = -h; }
      const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(this._width, x + w), y1 = Math.min(this._height, y + h);
      if (x1 <= x0 || y1 <= y0) return;
      if (!this.esteSprite) S().consuma((x1 - x0) * (y1 - y0) * this.costPixel + 2);
      const t = this._tinta();
      if (!t) return;
      const [fx0, fy0, fx1, fy1] = this._fizic(x0, y0, x1, y1);
      const v = this._cuantizeaza(c);
      const xa = Math.max(0, fx0), xb = Math.min(t.w, fx1);
      if (xb <= xa) return;
      for (let j = Math.max(0, fy0); j < Math.min(t.h, fy1); j++) t.date.fill(v, j * t.w + xa, j * t.w + xb);
      if (!this.esteSprite) this.dev.murdar = true;
    }
    drawFastHLine(x, y, w, c) { this.fillRect(x, y, w, 1, c); }
    drawFastVLine(x, y, h, c) { this.fillRect(x, y, 1, h, c); }
    drawPixel(x, y, c) { if (!this.esteSprite) S().consuma(this.costPixel + 0.6); super.drawPixel(x, y, c); }
    fillScreen(c) { this.fillRect(0, 0, this._width, this._height, c); }
    setCursor(x, y, f) { super.setCursor(x, y); if (f !== undefined) this.setTextFont(f); }
    setTextFont(f) { this.font = f; this.gfxFont = null; }
    setFreeFont(f) { this.gfxFont = f && f.glife ? limiteFont(f) : null; this.font = 1; }
    setTextDatum(d) { this.datum = d; }
    getTextDatum() { return this.datum; }
    setTextPadding(p) { this.padding = p; }
    getTextPadding() { return this.padding; }
    setTextColor(c, bg) { this.textcolor = c; this.textbgcolor = bg === undefined ? c : bg; }
    getTextColor() { return this.textcolor; }
    setSwapBytes(s) { this.schimbOcteti = !!s; }
    getSwapBytes() { return this.schimbOcteti; }
    color24to16(c) { return ((c >> 8) & 0xF800) | ((c >> 5) & 0x07E0) | ((c >> 3) & 0x001F); }
    color16to24(c) { const [r, g, b] = M.grafica.rgb565(c); return ((r << 16) | (g << 8) | b) >>> 0; }
    color8to16(c) { const r3 = (c >> 5) & 7, g3 = (c >> 2) & 7, b2 = c & 3; return (((r3 << 2) | (r3 >> 1)) << 11) | (((g3 << 3) | g3) << 5) | ((b2 << 3) | (b2 << 1) | (b2 >> 1)); }
    alphaBlend(a, fg, bg) {
      const [r1, g1, b1] = M.grafica.rgb565(fg), [r2, g2, b2] = M.grafica.rgb565(bg);
      const f = (a & 255) / 255;
      return this.color565(Math.round(r2 + (r1 - r2) * f), Math.round(g2 + (g1 - g2) * f), Math.round(b2 + (b1 - b2) * f));
    }
    // --- fonturile TFT_eSPI (2, 4, 6, 7, 8) ---
    _fontTft(n) { return n >= 2 ? (M.grafica.fonturiTft[n] || null) : null; }
    fontHeight(f) {
      if (f === undefined) f = this.font;
      if (this.gfxFont && f === 1) return this.gfxFont.yAdvance * this.textsize_y;
      const ft = this._fontTft(f);
      return (ft ? ft.h : 8) * this.textsize_y;
    }
    textWidth(s, f) {
      s = txt(s);
      if (f === undefined) f = this.font;
      if (this.gfxFont && f === 1) {
        const g = this.gfxFont; let w = 0;
        for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c >= g.first && c <= g.last) w += g.glife[(c - g.first) * 6 + 3]; }
        return w * this.textsize_x;
      }
      const ft = this._fontTft(f);
      if (!ft) return s.length * 6 * this.textsize_x;
      let w = 0;
      for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c >= 32 && c < 128) w += ft.w[c - 32]; }
      return w * this.textsize_x;
    }
    _caracterTft(c, x, y, ft) {
      if (c < 32 || c > 127) return 0;
      const i = c - 32, w = ft.w[i], h = ft.h, o = ft.o[i], d = ft.d;
      const sx = this.textsize_x, sy = this.textsize_y;
      const fond = this.textcolor !== this.textbgcolor;
      const pune = (px, py, on) => {
        if (!on && !fond) return;
        const cul = on ? this.textcolor : this.textbgcolor;
        if (sx === 1 && sy === 1) this.drawPixel(x + px, y + py, cul); else this.fillRect(x + px * sx, y + py * sy, sx, sy, cul);
      };
      if (!ft.rle) {
        const bw = Math.floor((w + 6) / 8);
        for (let r = 0; r < h; r++) for (let k = 0; k < bw; k++) {
          const b = d[o + r * bw + k];
          for (let bit = 0; bit < 8; bit++) { const px = k * 8 + bit; if (px < w) pune(px, r, (b >> (7 - bit)) & 1); }
        }
      } else {
        let pc = 0, p = o;
        const tot = w * h;
        while (pc < tot && p < d.length) {
          const b = d[p++];
          const on = !!(b & 0x80);
          let n = (b & 0x7F) + 1;
          while (n-- > 0 && pc < tot) { pune(pc % w, Math.floor(pc / w), on); pc++; }
        }
      }
      return w * sx;
    }
    drawChar(a, b, c, d, e, f, g) {
      // TFT_eSPI: drawChar(caracter, x, y[, font]) · Adafruit GFX: drawChar(x, y, caracter, culoare, fundal, mărime)
      if (e === undefined) {
        const font = d === undefined ? this.font : d;
        const ft = this._fontTft(font);
        if (ft) return this._caracterTft(a & 255, b, c, ft);
        GFX.prototype.drawChar.call(this, b, c, a & 255, this.textcolor, this.textbgcolor, this.textsize_x, this.textsize_y);
        if (this.gfxFont) { const fnt = this.gfxFont, k = (a & 255) - fnt.first; return k >= 0 && (a & 255) <= fnt.last ? fnt.glife[k * 6 + 3] * this.textsize_x : 0; }
        return 6 * this.textsize_x;
      }
      GFX.prototype.drawChar.call(this, a, b, c, d, e, f, g === undefined ? f : g);
      return 6 * (f || 1);
    }
    write(c, n) {
      if (typeof c !== 'number') return super.write(c, n);
      const ft = !this.gfxFont && this._fontTft(this.font);
      if (!ft) return super.write(c, n);
      c &= 255;
      if (c === 10) { this.cursor_x = 0; this.cursor_y += ft.h * this.textsize_y; return 1; }
      if (c === 13) return 1;
      const w = (c >= 32 && c < 128 ? ft.w[c - 32] : 0) * this.textsize_x;
      if (this.wrap && this.cursor_x + w > this._width) { this.cursor_x = 0; this.cursor_y += ft.h * this.textsize_y; }
      this.cursor_x += this._caracterTft(c, this.cursor_x, this.cursor_y, ft);
      return 1;
    }
    drawString(s, x, y, f) {
      s = txt(s);
      if (f !== undefined) { this.font = f; if (f !== 1) this.gfxFont = null; }
      const w = this.textWidth(s);
      const gfx = !!(this.gfxFont && this.font === 1);
      let cinalt = this.fontHeight(), baza;
      let px = x, py = y;
      if (gfx) {
        const fnt = limiteFont(this.gfxFont);
        cinalt = fnt.__ab * this.textsize_y;
        py += cinalt; baza = cinalt;
        if (this.datum === 6 || this.datum === 7 || this.datum === 8) cinalt += fnt.__bb * this.textsize_y;
      } else {
        const ft = this._fontTft(this.font);
        baza = (ft ? ft.base : 7) * this.textsize_y;
      }
      switch (this.datum) {
        case 1: px -= w / 2; break;
        case 2: px -= w; break;
        case 3: py -= cinalt / 2; break;
        case 4: px -= w / 2; py -= cinalt / 2; break;
        case 5: px -= w; py -= cinalt / 2; break;
        case 6: py -= cinalt; break;
        case 7: px -= w / 2; py -= cinalt; break;
        case 8: px -= w; py -= cinalt; break;
        case 9: py -= baza; break;
        case 10: px -= w / 2; py -= baza; break;
        case 11: px -= w; py -= baza; break;
      }
      px = Math.trunc(px); py = Math.trunc(py);
      const fond = this.textcolor !== this.textbgcolor;
      // setTextPadding: umple până la lățimea dată (șterge textul vechi, mai lung)
      if (fond && (this.padding > w || gfx)) {
        const lat = Math.max(this.padding, w);
        const col = this.datum % 3;
        const ox = this.datum > 8 ? (this.datum === 10 ? px - Math.trunc((lat - w) / 2) : this.datum === 11 ? px - (lat - w) : px) : (col === 1 ? px - Math.trunc((lat - w) / 2) : col === 2 ? px - (lat - w) : px);
        if (gfx) { const fnt = limiteFont(this.gfxFont); this.fillRect(ox, py - fnt.__ab * this.textsize_y, lat, (fnt.__ab + fnt.__bb) * this.textsize_y, this.textbgcolor); }
        else this.fillRect(ox, py, lat, this.fontHeight(), this.textbgcolor);
      }
      const vx = this.cursor_x, vy = this.cursor_y, vw = this.wrap;
      this.wrap = false;
      this.cursor_x = px; this.cursor_y = py;
      for (let i = 0; i < s.length; i++) this.write(s.charCodeAt(i));
      this.cursor_x = vx; this.cursor_y = vy; this.wrap = vw;
      return w;
    }
    drawCentreString(s, x, y, f) { const d = this.datum; this.datum = 1; const r = this.drawString(s, x, y, f); this.datum = d; return r; }
    drawCenterString(s, x, y, f) { return this.drawCentreString(s, x, y, f); }
    drawRightString(s, x, y, f) { const d = this.datum; this.datum = 2; const r = this.drawString(s, x, y, f); this.datum = d; return r; }
    drawNumber(n, x, y, f) { return this.drawString(String(Math.trunc(n)), x, y, f); }
    drawFloat(v, dp, x, y, f) { return this.drawString(M.ajutoareR.formatReal(v, dp), x, y, f); }
    // imagini: cu setSwapBytes(true) valorile RGB565 obișnuite apar corect; fără, octeții apar inversați
    pushImage(x, y, w, h, date, transp) {
      if (!date) return;
      const tr = transp === undefined ? undefined : transp & 0xFFFF;
      if (!this.esteSprite) S().consuma(w * h * this.costPixel + 5);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        let c = date[j * w + i];
        if (c === undefined) continue;
        c = this.schimbOcteti ? c & 0xFFFF : inverseaza16(c);
        if (tr !== undefined && c === tr) continue;
        this._scrieDirect(x + i, y + j, c);
      }
    }
    pushColors() { } pushColor() { }
    readPixel(x, y) {
      if (x < 0 || y < 0 || x >= this._width || y >= this._height) return 0;
      const t = this._tinta(); if (!t) return 0;
      let q;
      switch (this.rotation) { case 1: q = x; x = this.WIDTH - 1 - y; y = q; break; case 2: x = this.WIDTH - 1 - x; y = this.HEIGHT - 1 - y; break; case 3: q = x; x = y; y = this.HEIGHT - 1 - q; break; }
      return x < t.w && y < t.h ? t.date[y * t.w + x] : 0;
    }
    // arcele TFT_eSPI: 0° e jos (ora 6) și unghiul crește în sensul acelor de ceas
    drawArc(x, y, r, ir, a0, a1, fg, bg) { this.drawSmoothArc(x, y, r, ir, a0, a1, fg, bg); }
    drawSmoothArc(x, y, r, ir, a0, a1, fg) {
      for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) {
        const d = Math.hypot(xx, yy);
        if (d > r + 0.5 || d < ir - 0.5) continue;
        const a = (Math.atan2(xx, -yy) * 180 / Math.PI + 540) % 360;
        const inArc = a0 <= a1 ? (a >= a0 && a <= a1) : (a >= a0 || a <= a1);
        if (inArc) this.drawPixel(x + xx, y + yy, fg);
      }
    }
    fillSmoothCircle(x, y, r, c) { this.fillCircle(x, y, r, c); }
    drawSmoothCircle(x, y, r, c) { this.drawCircle(x, y, r, c); }
    fillSmoothRoundRect(x, y, w, h, r, c) { this.fillRoundRect(x, y, w, h, r, c); }
    drawSmoothRoundRect(x, y, r, ir, w, h, c) { this.drawRoundRect(x, y, w, h, r, c); }
    drawSpot(x, y, r, c) { this.fillCircle(x, y, Math.round(r), c); }
    drawWideLine(ax, ay, bx, by, w, c) {
      const n = Math.max(1, Math.round(w));
      for (let i = 0; i < n; i++) { const o = i - (n - 1) / 2; if (Math.abs(bx - ax) > Math.abs(by - ay)) this.drawLine(ax, ay + o, bx, by + o, c); else this.drawLine(ax + o, ay, bx + o, by, c); }
    }
    drawWedgeLine(ax, ay, bx, by, ar, br, c) { this.drawWideLine(ax, ay, bx, by, ar + br, c); }
    fillRectVGradient(x, y, w, h, c1, c2) { for (let j = 0; j < h; j++) this.fillRect(x, y + j, w, 1, this.alphaBlend(255 - Math.round(j * 255 / Math.max(1, h - 1)), c1, c2)); }
    fillRectHGradient(x, y, w, h, c1, c2) { for (let i = 0; i < w; i++) this.fillRect(x + i, y, 1, h, this.alphaBlend(255 - Math.round(i * 255 / Math.max(1, w - 1)), c1, c2)); }
    invertDisplay(i) { if (this.dev) { this.dev.invers = !!i; this.dev.murdar = true; } }
    setViewport() { sugestie('tft-viewport', 'setViewport() din TFT_eSPI nu e simulat; se desenează pe tot ecranul.'); } resetViewport() { }
    writecommand() { } writedata() { } setAddrWindow() { } setWindow() { } startWrite() { } endWrite() { }
    getCursorX() { return this.cursor_x; } getCursorY() { return this.cursor_y; }
    loadFont() { sugestie('tft-loadfont', 'Fonturile netede (.vlw) din TFT_eSPI nu sunt simulate; se folosește fontul obișnuit.'); }
    unloadFont() { }
  }
  TFT_eSPI.tipuri = Object.assign({}, GFX.tipuri, { textWidth: 'int16_t', fontHeight: 'int16_t', drawString: 'int16_t', drawCentreString: 'int16_t', drawRightString: 'int16_t', drawNumber: 'int16_t', drawFloat: 'int16_t', color24to16: 'uint16_t', color16to24: 'uint32_t', color8to16: 'uint16_t',
    alphaBlend: 'uint16_t', readPixel: 'uint16_t', getTextDatum: 'uint8_t', getTextPadding: 'uint16_t', getTextColor: 'uint16_t', drawChar: 'int16_t', getSwapBytes: 'bool' });
  api.clasa('TFT_eSPI', TFT_eSPI);

  class TFT_eSprite extends TFT_eSPI {
    constructor(parinte) { super(1, 1); this.parinte = parinte || null; this.esteSprite = true; this.sprite = null; this.adancime = 16; }
    createSprite(w, h) {
      const sim = S();
      const octeti = w * h * this.adancime / 8;
      const cip = sim.cip || {};
      const psram = cip.platforma === 'esp32' && (cip.psram || []).length > 0;
      const limita = cip.platforma === 'avr' ? 1500 : cip.platforma === 'esp8266' ? 30000 : 110000;
      if (!psram && octeti > limita) {
        sim.problema('sprite-mare', 'eroare', 'createSprite(' + w + ', ' + h + ') are nevoie de ' + Math.round(octeti / 1024) + ' KB într-un singur bloc, dar placa are cel mult ~' + Math.round(limita / 1024) + ' KB liberi. Sprite-ul nu se creează (întoarce NULL). Folosește setColorDepth(8) sau un sprite mai mic.', { linie: linie() });
        this.sprite = null;
        return null;
      }
      this.sprite = new M.grafica.Tampon(w, h, true);
      this.WIDTH = w; this.HEIGHT = h; this.setRotation(0);
      return this.sprite.date;
    }
    deleteSprite() { this.sprite = null; }
    created() { return !!this.sprite; }
    setColorDepth(b) { this.adancime = b === 1 || b === 8 ? b : 16; }
    getColorDepth() { return this.adancime; }
    fillSprite(c) { this.fillRect(0, 0, this._width, this._height, c); }
    width() { return this.sprite ? this._width : 0; }
    height() { return this.sprite ? this._height : 0; }
    setBitmapColor() { }
    pushSprite(x, y, transp) {
      const p = this.parinte;
      if (!this.sprite || !p) return;
      const t = this.sprite;
      if (!p.esteSprite) {
        if (!p.dev) return;
        S().consuma(t.w * t.h * p.costPixel + 5);
      } else if (!p.sprite) return;
      const tr = transp === undefined ? undefined : transp & 0xFFFF;
      for (let j = 0; j < t.h; j++) for (let i = 0; i < t.w; i++) {
        const c = t.date[j * t.w + i];
        if (tr !== undefined && c === tr) continue;
        p._scrieDirect(x + i, y + j, c);
      }
      if (p.dev) p.dev.murdar = true;
    }
    pushToSprite(dest, x, y, transp) { const vp = this.parinte; this.parinte = dest; this.pushSprite(x, y, transp); this.parinte = vp; }
  }
  TFT_eSprite.tipuri = Object.assign({}, TFT_eSPI.tipuri, { created: 'bool', getColorDepth: 'int8_t' });
  api.clasa('TFT_eSprite', TFT_eSprite);

  // bibliotecile Adafruit pentru TFT (aceleași ecrane, alt API)
  function clasaAdafruitTft(nume, modele, spiPrimulDc) {
    const C = class extends TFT_eSPI {
      constructor(a, b, c) {
        super();
        // (cs, dc, …) sau (&SPI, dc, cs, rst) la ILI9341 / (&SPI, cs, dc, rst) la ST77xx
        if (a instanceof api.clase.SPIClass) { if (spiPrimulDc) { this.dc = b; this.cs = c; } else { this.cs = b; this.dc = c; } }
        else { this.cs = a; this.dc = b; }
        this.textcolor = this.textbgcolor = 0xFFFF; // ca în Adafruit GFX: text transparent
        this.font = 1;
      }
      begin() { this._gaseste(); }
      init(w, h) { this._gaseste(w, h); }
      initR() { this._gaseste(); }
      _gaseste(w, h) {
        const sim = S();
        sim.consuma(150000);
        let tft = null;
        if (typeof this.cs === 'number' && this.cs >= 0) tft = sim.cautaDupaPin(['tft'], 'CS', this.cs)[0];
        if (!tft) tft = sim.dispozitive(['tft']).find(d => d.info.pini === 'fara-cs' && sim.gpioLaNet(sim.netPin(d.inst, 'DC')).includes(this.dc));
        if (!tft) {
          sim.problema('tft-cs-' + this.cs, 'eroare', nume + ': nu găsesc un ecran TFT cu CS pe pinul ' + this.cs + (this.cs < 0 ? ' (fără CS) și DC pe pinul ' + this.dc : '') + '. Verifică firul CS (și DC).', { linie: linie() });
          return;
        }
        if (modele && !modele.includes(tft.model)) sim.problema('tft-model-' + tft.inst.id, 'avertisment', nume + ' e pentru ' + modele.join('/').toUpperCase() + ', dar ' + tft.inst.eticheta + ' e ' + tft.info.nume + '. Imaginea sau culorile ies greșit.', { linie: linie(), comp: tft.inst.id });
        if (!sim.gpioLaNet(sim.netPin(tft.inst, 'DC')).includes(this.dc)) sim.problema('tft-dc-cod-' + tft.inst.id, 'eroare', nume + ': în cod DC e pinul ' + this.dc + ', dar DC-ul ecranului e legat altundeva.', { linie: linie(), comp: tft.inst.id });
        this._leagaTft(tft);
        if (w && h && (w !== tft.w || h !== tft.h)) {
          sim.problema('tft-init-' + tft.inst.id, 'avertisment', 'init(' + w + ', ' + h + '), dar ' + tft.inst.eticheta + ' are ' + tft.w + '×' + tft.h + ' pixeli. O parte din imagine lipsește.', { linie: linie(), comp: tft.inst.id });
          this.WIDTH = w; this.HEIGHT = h; this.setRotation(this.rotation);
        }
      }
      setTextColor(c, bg) { this.textcolor = c; this.textbgcolor = bg === undefined ? c : bg; }
      setFont(f) { GFX.prototype.setFont.call(this, f); }
    };
    C.tipuri = TFT_eSPI.tipuri;
    api.clasa(nume, C);
  }
  clasaAdafruitTft('Adafruit_ILI9341', ['ili9341'], true);
  clasaAdafruitTft('Adafruit_ST7789', ['st7789', 'st7789-320'], false);
  clasaAdafruitTft('Adafruit_ST7735', ['st7735'], false);
  clasaAdafruitTft('Adafruit_GC9A01A', ['gc9a01'], true);
  clasaAdafruitTft('Adafruit_ILI9488', ['ili9488'], true);

  // ---------- TM1637 ----------
  class TM1637Display {
    // un obiect global nou are luminozitatea 0 (afișaj stins) până la setBrightness()
    constructor(clk, dio, intarziere) { this.clk = clk; this.dio = dio; this.intarziere = intarziere || 100; this.lum = 0; }
    _dev() {
      const sim = S();
      const d = sim.cautaDupaPin(['tm1637'], 'CLK', this.clk).find(x => sim.netPin(x.inst, 'DIO') === sim.netGPIO(this.dio));
      if (!d) {
        const inv = sim.cautaDupaPin(['tm1637'], 'CLK', this.dio).find(x => sim.netPin(x.inst, 'DIO') === sim.netGPIO(this.clk));
        sim.problema('tm1637-' + this.clk, 'eroare', inv ? 'TM1637: CLK și DIO sunt inversate față de TM1637Display(' + this.clk + ', ' + this.dio + ').' : 'TM1637Display(' + this.clk + ', ' + this.dio + '): nu găsesc afișajul cu CLK pe pinul ' + this.clk + ' și DIO pe pinul ' + this.dio + '.', { linie: linie() });
        return null;
      }
      return d;
    }
    // durata transferului bit-banging: 3 întârzieri pe bit, 9 biți pe octet
    _cost(octeti) { S().consuma(octeti * 27 * this.intarziere + 4 * this.intarziere); }
    setBrightness(b, on) { this.lum = (b & 7) | (on === undefined || on ? 8 : 0); }
    setSegments(seg, lung, poz) {
      lung = lung === undefined ? 4 : lung; poz = poz || 0;
      this._cost(lung + 3);
      const d = this._dev();
      if (!d) return;
      for (let i = 0; i < lung && poz + i < 4; i++) d.segmente[poz + i] = (seg[i] || 0) & 255;
      d.luminozitate = this.lum & 7; d.pornit = !!(this.lum & 8);
      d.schimbat = true;
      if (!d.pornit && !this.avertizat) { this.avertizat = true; sugestie('tm1637-luminozitate', 'Afișajul TM1637 rămâne stins: biblioteca îl pornește abia după display.setBrightness(7) (sau 0x0f). Adaug-o în setup().'); }
    }
    clear() { this.setSegments([0, 0, 0, 0]); }
    encodeDigit(n) { return M.CIFRE_SEG[n & 15]; }
    _arata(baza, num, puncte, zero, lung, poz) {
      lung = lung === undefined ? 4 : lung;
      let negativ = baza < 0;
      if (negativ) baza = -baza;
      num = Math.trunc(num) >>> 0;
      const cif = new Array(lung).fill(0);
      if (num === 0 && !zero) cif[lung - 1] = M.CIFRE_SEG[0];
      else {
        for (let i = lung - 1; i >= 0; i--) {
          const c = num % baza;
          cif[i] = c === 0 && num === 0 && !zero ? 0 : M.CIFRE_SEG[c];
          if (c === 0 && num === 0 && negativ) { cif[i] = 0x40; negativ = false; }
          num = Math.floor(num / baza);
        }
      }
      for (let i = 0; i < lung; i++) if (puncte & (0x80 >> i)) cif[i] |= 0x80;
      this.setSegments(cif, lung, poz);
    }
    showNumberDec(num, zero, lung, poz) { this.showNumberDecEx(num, 0, zero, lung, poz); }
    showNumberDecEx(num, puncte, zero, lung, poz) { this._arata(num < 0 ? -10 : 10, num < 0 ? -num : num, puncte || 0, !!zero, lung, poz); }
    showNumberHexEx(num, puncte, zero, lung, poz) { this._arata(16, num & 0xFFFF, puncte || 0, !!zero, lung, poz); }
  }
  TM1637Display.tipuri = { encodeDigit: 'uint8_t' };
  api.clasa('TM1637Display', TM1637Display);

  // ---------- LedControl (MAX7219) ----------
  class LedControl {
    constructor(din, clk, cs, n) {
      this.din = din; this.clk = clk; this.cs = cs; this.n = Math.max(1, Math.min(8, n || 1));
      // ca în bibliotecă: la creare, fiecare modul e șters și pus în „shutdown”
      if (S()) for (const d of this._toate()) { d.randuri.fill(0); d.pornit = false; d.schimbat = true; }
    }
    _toate() {
      const sim = S();
      return sim.cautaDupaPin(['max7219'], 'DIN', this.din).filter(x => sim.netPin(x.inst, 'CLK') === sim.netGPIO(this.clk) && sim.netPin(x.inst, 'CS') === sim.netGPIO(this.cs));
    }
    _dev(adr) {
      const d = this._toate();
      if (!d.length) { S().problema('max7219-' + this.din, 'eroare', 'LedControl(' + this.din + ', ' + this.clk + ', ' + this.cs + '): nu găsesc o matrice MAX7219 cu DIN, CLK și CS pe acești pini (ordinea e DIN, CLK, CS).', { linie: linie() }); return null; }
      return d[adr || 0] || null;
    }
    _scriere(d) {
      S().consuma(16 * this.n * 1.2 + 4);
      if (d && !d.pornit && !this.avertizat) { this.avertizat = true; sugestie('max7219-shutdown', 'Matricea MAX7219 pornește în modul de economisire (shutdown). Adaugă lc.shutdown(0, false); în setup().'); }
    }
    getDeviceCount() { return this.n; }
    shutdown(adr, oprit) { const d = this._dev(adr); S().consuma(20); if (d) { d.pornit = !oprit; d.schimbat = true; } }
    setScanLimit() { S().consuma(20); }
    setIntensity(adr, i) { const d = this._dev(adr); S().consuma(20); if (d) { d.intensitate = i & 15; d.schimbat = true; } }
    clearDisplay(adr) { const d = this._dev(adr); S().consuma(8 * (16 * this.n * 1.2 + 4)); if (d) { d.randuri.fill(0); d.schimbat = true; } }
    setLed(adr, r, c, st) {
      const d = this._dev(adr); this._scriere(d); if (!d || r < 0 || r > 7 || c < 0 || c > 7) return;
      if (st) d.randuri[r] |= (0x80 >> c); else d.randuri[r] &= ~(0x80 >> c);
      d.schimbat = true;
    }
    setRow(adr, r, v) { const d = this._dev(adr); this._scriere(d); if (!d || r < 0 || r > 7) return; d.randuri[r] = v & 255; d.schimbat = true; }
    setColumn(adr, c, v) {
      const d = this._dev(adr); if (!d || c < 0 || c > 7) return;
      for (let r = 0; r < 8; r++) { this._scriere(d); if ((v >> (7 - r)) & 1) d.randuri[r] |= (0x80 >> c); else d.randuri[r] &= ~(0x80 >> c); }
      d.schimbat = true;
    }
    setDigit() { sugestie('max7219-cifre', 'setDigit()/setChar() sunt pentru afișaje cu 7 segmente; pe matricea 8×8 folosește setRow() sau setLed().'); }
    setChar() { this.setDigit(); }
  }
  LedControl.tipuri = { getDeviceCount: 'int' };
  api.clasa('LedControl', LedControl);

  // ---------- NeoPixel ----------
  function hsv16(h, s, v) {
    h = ((h & 0xFFFF) * 1530 + 32768) >> 16;
    let r, g, b;
    if (h < 510) { b = 0; if (h < 255) { r = 255; g = h; } else { r = 510 - h; g = 255; } }
    else if (h < 1020) { r = 0; if (h < 765) { g = 255; b = h - 510; } else { g = 1020 - h; b = 255; } }
    else if (h < 1530) { g = 0; if (h < 1275) { r = h - 1020; b = 255; } else { r = 255; b = 1530 - h; } }
    else { r = 255; g = b = 0; }
    const v1 = 1 + v, s1 = 1 + s, s2 = 255 - s;
    return [((((r * s1) >> 8) + s2) * v1) >> 8, ((((g * s1) >> 8) + s2) * v1) >> 8, ((((b * s1) >> 8) + s2) * v1) >> 8];
  }
  const GAMMA = new Uint8Array(256).map((_, i) => Math.round(Math.pow(i / 255, 2.6) * 255));
  const ORDINE_NEO = { 0x52: 'GRB', 0x06: 'RGB', 0x09: 'RBG', 0xA1: 'GBR', 0x58: 'BRG', 0xA4: 'BGR', 0xD2: 'GRB', 0xC6: 'RGB' };
  // culorile ajung la LED în ordinea trimisă; dacă banda așteaptă altă ordine, canalele se amestecă
  function reordoneaza(culori, ordineCod, ordineBanda) {
    if (ordineCod === ordineBanda) return culori;
    return culori.map(c => {
      const m = { R: c[0], G: c[1], B: c[2] };
      const trimis = [...ordineCod].map(k => m[k]);
      const r = {};
      [...ordineBanda].forEach((k, i) => { r[k] = trimis[i]; });
      return [r.R, r.G, r.B];
    });
  }
  function trimiteLaBanda(sim, pin, culori, ordineCod, numeLib) {
    const benzi = sim.cautaDupaPin(['ws2812'], 'DIN', pin);
    if (!benzi.length) {
      const b = sim.dispozitive(['ws2812'])[0];
      sim.problema('neo-' + pin, 'eroare', numeLib + ' pe pinul ' + pin + ': nicio bandă WS2812 nu are DIN legat aici.' + (b ? ' ' + b.inst.eticheta + ' are DIN pe alt pin.' : ''), { linie: linie() });
      return;
    }
    const b0 = benzi[0];
    const ordineBanda = (b0.inst.prop && b0.inst.prop.ordine) || 'GRB';
    if (ordineCod !== ordineBanda && culori.some(c => c[0] !== c[1] || c[1] !== c[2])) {
      sugestie('neo-ordine-' + pin, 'Banda WS2812B primește culorile în ordinea ' + ordineBanda + ', dar codul le trimite ca ' + ordineCod + ', așa că roșul și verdele (sau albastrul) apar schimbate. ' + (numeLib === 'FastLED' ? 'Folosește addLeds<WS2812B, PIN, GRB>.' : 'Folosește NEO_GRB + NEO_KHZ800.'));
    }
    b0.seteaza(reordoneaza(culori, ordineCod, ordineBanda));
  }
  class Adafruit_NeoPixel {
    constructor(n, pin, tip) {
      this.n = n || 0; this.pin = pin === undefined ? -1 : pin; this.tip = tip === undefined ? 0x52 : tip;
      this.px = Array.from({ length: this.n }, () => [0, 0, 0]);
      this.lum = 0; // ca în bibliotecă: 0 înseamnă „fără scalare”
    }
    begin() { }
    updateLength(n) { this.n = n; this.px = Array.from({ length: n }, () => [0, 0, 0]); }
    setPin(p) { this.pin = p; }
    getPin() { return this.pin; }
    updateType(t) { this.tip = t; }
    numPixels() { return this.n; }
    setBrightness(b) { this.lum = (b + 1) & 255; }
    getBrightness() { return (this.lum - 1) & 255; }
    clear() { for (const p of this.px) { p[0] = p[1] = p[2] = 0; } }
    setPixelColor(i, r, g, b) {
      if (i < 0 || i >= this.n) return;
      if (g === undefined) { const c = r >>> 0; r = (c >> 16) & 255; g = (c >> 8) & 255; b = c & 255; }
      this.px[i] = [r & 255, g & 255, b & 255];
    }
    getPixelColor(i) { const p = this.px[i]; return p ? ((p[0] << 16) | (p[1] << 8) | p[2]) >>> 0 : 0; }
    fill(c, prim, nr) {
      prim = prim || 0;
      const sf = !nr ? this.n : Math.min(this.n, prim + nr);
      for (let i = prim; i < sf; i++) this.setPixelColor(i, c === undefined ? 0 : c);
    }
    static Color(r, g, b) { return (((r & 255) << 16) | ((g & 255) << 8) | (b & 255)) >>> 0; }
    Color(r, g, b) { return Adafruit_NeoPixel.Color(r, g, b); }
    static ColorHSV(h, s, v) { const [r, g, b] = hsv16(h, s === undefined ? 255 : s, v === undefined ? 255 : v); return Adafruit_NeoPixel.Color(r, g, b); }
    ColorHSV(h, s, v) { return Adafruit_NeoPixel.ColorHSV(h, s, v); }
    static gamma32(c) { return ((GAMMA[(c >> 16) & 255] << 16) | (GAMMA[(c >> 8) & 255] << 8) | GAMMA[c & 255]) >>> 0; }
    gamma32(c) { return Adafruit_NeoPixel.gamma32(c); }
    static gamma8(x) { return GAMMA[x & 255]; }
    gamma8(x) { return GAMMA[x & 255]; }
    static sine8(x) { return Math.round(128 + 127.5 * Math.sin((x & 255) / 256 * 2 * Math.PI)) & 255; }
    sine8(x) { return Adafruit_NeoPixel.sine8(x); }
    rainbow(prim, rep, sat, str, gam) {
      prim = prim || 0; rep = rep === undefined ? 1 : rep;
      for (let i = 0; i < this.n; i++) {
        let c = Adafruit_NeoPixel.ColorHSV(prim + Math.floor((i * rep * 65536) / this.n), sat === undefined ? 255 : sat, str === undefined ? 255 : str);
        if (gam !== false) c = Adafruit_NeoPixel.gamma32(c);
        this.setPixelColor(i, c);
      }
    }
    canShow() { return true; }
    show() {
      const sim = S();
      sim.consuma(this.n * 30 + 80);
      const lum = this.lum;
      const cul = this.px.map(p => lum ? [(p[0] * lum) >> 8, (p[1] * lum) >> 8, (p[2] * lum) >> 8] : p.slice());
      trimiteLaBanda(sim, this.pin, cul, ORDINE_NEO[this.tip & 0xFF] || 'GRB', 'Adafruit_NeoPixel');
    }
  }
  Adafruit_NeoPixel.tipuri = { numPixels: 'uint16_t', getPixelColor: 'uint32_t', Color: 'uint32_t', ColorHSV: 'uint32_t', gamma32: 'uint32_t', gamma8: 'uint8_t', sine8: 'uint8_t', getBrightness: 'uint8_t', canShow: 'bool', getPin: 'int16_t' };
  Adafruit_NeoPixel.tipuriStatice = { Color: 'uint32_t', ColorHSV: 'uint32_t', gamma32: 'uint32_t', gamma8: 'uint8_t', sine8: 'uint8_t' };
  api.clasa('Adafruit_NeoPixel', Adafruit_NeoPixel);

  // ---------- FastLED ----------
  const q8 = (x) => Math.max(0, Math.min(255, Math.round(x)));
  const scale8 = (a, b) => (a * (b + 1)) >> 8;
  // hsv2rgb_rainbow din FastLED: 0 roșu, 32 portocaliu, 64 galben, 96 verde, 128 aqua, 160 albastru, 192 mov, 224 roz
  function hsvCurcubeu(hue, sat, val) {
    hue &= 255; sat &= 255; val &= 255;
    const offset8 = (hue & 0x1F) << 3;
    const treime = scale8(offset8, 85);
    const douaTreimi = scale8(offset8, 170);
    let r, g, b;
    if (!(hue & 0x80)) {
      if (!(hue & 0x40)) {
        if (!(hue & 0x20)) { r = 255 - treime; g = treime; b = 0; }
        else { r = 171; g = 85 + treime; b = 0; }
      } else if (!(hue & 0x20)) { r = 171 - douaTreimi; g = 170 + treime; b = 0; }
      else { r = 0; g = 255 - treime; b = treime; }
    } else if (!(hue & 0x40)) {
      if (!(hue & 0x20)) { r = 0; g = 171 - douaTreimi; b = 85 + douaTreimi; }
      else { r = treime; g = 0; b = 255 - treime; }
    } else if (!(hue & 0x20)) { r = 85 + treime; g = 0; b = 171 - treime; }
    else { r = 170 + treime; g = 0; b = 85 - treime; }
    if (sat !== 255) {
      if (sat === 0) { r = g = b = 255; }
      else {
        let desat = 255 - sat;
        desat = ((desat * desat) >> 8) + (desat ? 1 : 0);
        const satScala = 255 - desat;
        r = scale8(r, satScala) + desat; g = scale8(g, satScala) + desat; b = scale8(b, satScala) + desat;
      }
    }
    if (val !== 255) {
      const v2 = ((val * val) >> 8) + (val ? 1 : 0);
      if (v2 === 0 || val === 0) { r = g = b = 0; }
      else { r = scale8(r, v2); g = scale8(g, v2); b = scale8(b, v2); }
    }
    return [r & 255, g & 255, b & 255];
  }
  class CHSV {
    constructor(h, s, v) {
      if (h instanceof CHSV) { this.h = h.h; this.s = h.s; this.v = h.v; }
      else { this.h = (h || 0) & 255; this.s = s === undefined ? 255 : s & 255; this.v = v === undefined ? 255 : v & 255; }
    }
    static __din(x) { return new CHSV(x); }
    __copie() { return new CHSV(this); }
    setHSV(h, s, v) { this.h = h & 255; this.s = s & 255; this.v = v & 255; return this; }
    get hue() { return this.h; } set hue(x) { this.h = x & 255; }
    get sat() { return this.s; } set sat(x) { this.s = x & 255; }
    get val() { return this.v; } set val(x) { this.v = x & 255; }
    egal(o) { return o instanceof CHSV && o.h === this.h && o.s === this.s && o.v === this.v; }
  }
  CHSV.proprietati = { h: 'uint8_t', s: 'uint8_t', v: 'uint8_t', hue: 'uint8_t', sat: 'uint8_t', val: 'uint8_t' };
  api.clasa('CHSV', CHSV);
  class CRGB {
    constructor(r, g, b) {
      if (r instanceof CRGB) { this.r = r.r; this.g = r.g; this.b = r.b; }
      else if (r instanceof CHSV) { const c = hsvCurcubeu(r.h, r.s, r.v); this.r = c[0]; this.g = c[1]; this.b = c[2]; }
      else if (g === undefined && typeof r === 'number') { const c = r >>> 0; this.r = (c >> 16) & 255; this.g = (c >> 8) & 255; this.b = c & 255; }
      else { this.r = (r || 0) & 255; this.g = (g || 0) & 255; this.b = (b || 0) & 255; }
    }
    static __din(x) { return new CRGB(x); }
    static __op(op, a, b) {
      const A = new CRGB(a);
      // + și - cu un număr: numărul e un cod de culoare (ex. CRGB::Blue); restul operatorilor îl folosesc ca scalar
      const num = typeof b === 'number' && op !== '+' && op !== '-';
      const B = num ? null : new CRGB(b);
      const f = (x, y) => {
        switch (op) {
          case '+': return q8(x + y); case '-': return q8(x - y);
          case '*': return q8(x * y); case '/': return y ? Math.floor(x / y) : 0;
          case '%': return scale8(x, y);
          case '|': return Math.max(x, y); case '&': return Math.min(x, y);
          case '>>': return x >> y; case '<<': return q8(x << y);
        }
        return x;
      };
      if (num) return new CRGB(f(A.r, b), f(A.g, b), f(A.b, b));
      return new CRGB(f(A.r, B.r), f(A.g, B.g), f(A.b, B.b));
    }
    __copie() { return new CRGB(this); }
    __bool() { return !!(this.r || this.g || this.b); }
    egal(o) { const x = new CRGB(o); return this.r === x.r && this.g === x.g && this.b === x.b; }
    setRGB(r, g, b) { this.r = r & 255; this.g = g & 255; this.b = b & 255; return this; }
    setHSV(h, s, v) { const c = hsvCurcubeu(h, s, v); this.r = c[0]; this.g = c[1]; this.b = c[2]; return this; }
    setHue(h) { return this.setHSV(h, 255, 255); }
    setColorCode(c) { return this.setRGB((c >> 16) & 255, (c >> 8) & 255, c & 255); }
    nscale8(s) {
      if (s instanceof CRGB) { this.r = scale8(this.r, s.r); this.g = scale8(this.g, s.g); this.b = scale8(this.b, s.b); }
      else { this.r = scale8(this.r, s & 255); this.g = scale8(this.g, s & 255); this.b = scale8(this.b, s & 255); }
      return this;
    }
    nscale8_video(s) { return this.nscale8(s); }
    fadeToBlackBy(f) { return this.nscale8(255 - (f & 255)); }
    fadeLightBy(f) { return this.nscale8(255 - (f & 255)); }
    subtractFromRGB(d) { this.r = q8(this.r - d); this.g = q8(this.g - d); this.b = q8(this.b - d); return this; }
    addToRGB(d) { this.r = q8(this.r + d); this.g = q8(this.g + d); this.b = q8(this.b + d); return this; }
    getLuma() { return (this.r * 54 + this.g * 183 + this.b * 18) >> 8; }
    getAverageLight() { return Math.floor((this.r + this.g + this.b) / 3); }
    maximizeBrightness() { const m = Math.max(this.r, this.g, this.b); if (m) { this.r = Math.floor(this.r * 255 / m); this.g = Math.floor(this.g * 255 / m); this.b = Math.floor(this.b * 255 / m); } return this; }
    lerp8(o, f) { o = new CRGB(o); return new CRGB(this.r + ((o.r - this.r) * f >> 8), this.g + ((o.g - this.g) * f >> 8), this.b + ((o.b - this.b) * f >> 8)); }
    get red() { return this.r; } set red(x) { this.r = x & 255; }
    get green() { return this.g; } set green(x) { this.g = x & 255; }
    get blue() { return this.b; } set blue(x) { this.b = x & 255; }
  }
  CRGB.tipuri = { getLuma: 'uint8_t', getAverageLight: 'uint8_t', setRGB: 'obj:CRGB', setHSV: 'obj:CRGB', setHue: 'obj:CRGB', nscale8: 'obj:CRGB', fadeToBlackBy: 'obj:CRGB', fadeLightBy: 'obj:CRGB', lerp8: 'obj:CRGB', maximizeBrightness: 'obj:CRGB' };
  CRGB.proprietati = { r: 'uint8_t', g: 'uint8_t', b: 'uint8_t', red: 'uint8_t', green: 'uint8_t', blue: 'uint8_t' };
  CRGB.constanteStatice = { Black: 0x000000, White: 0xFFFFFF, Red: 0xFF0000, Green: 0x008000, Lime: 0x00FF00, Blue: 0x0000FF, Yellow: 0xFFFF00, Cyan: 0x00FFFF, Aqua: 0x00FFFF, Magenta: 0xFF00FF, Fuchsia: 0xFF00FF, Orange: 0xFFA500, Purple: 0x800080,
    Pink: 0xFFC0CB, HotPink: 0xFF69B4, DeepPink: 0xFF1493, Gold: 0xFFD700, Gray: 0x808080, Grey: 0x808080, DarkGray: 0xA9A9A9, DarkBlue: 0x00008B, DarkGreen: 0x006400, DarkRed: 0x8B0000, Navy: 0x000080, Teal: 0x008080, Violet: 0xEE82EE,
    Indigo: 0x4B0082, Brown: 0xA52A2A, Maroon: 0x800000, Olive: 0x808000, Silver: 0xC0C0C0, SkyBlue: 0x87CEEB, Turquoise: 0x40E0D0, Coral: 0xFF7F50, Crimson: 0xDC143C, Salmon: 0xFA8072, FairyLight: 0xFFE42D, FairyLightNCC: 0xFF9D2A,
    Amethyst: 0x9966CC, OrangeRed: 0xFF4500, Chartreuse: 0x7FFF00, SeaGreen: 0x2E8B57, ForestGreen: 0x228B22, RoyalBlue: 0x4169E1, DarkOrange: 0xFF8C00, Tomato: 0xFF6347, LightBlue: 0xADD8E6, LightGreen: 0x90EE90,
    MidnightBlue: 0x191970, MediumBlue: 0x0000CD, CadetBlue: 0x5F9EA0, DarkCyan: 0x008B8B, CornflowerBlue: 0x6495ED, Aquamarine: 0x7FFFD4, LightSkyBlue: 0x87CEFA, DarkOliveGreen: 0x556B2F, OliveDrab: 0x6B8E23,
    MediumAquamarine: 0x66CDAA, LimeGreen: 0x32CD32, YellowGreen: 0x9ACD32, LawnGreen: 0x7CFC00, Green4: 0x008B00, SpringGreen: 0x00FF7F, DeepSkyBlue: 0x00BFFF, DodgerBlue: 0x1E90FF, SteelBlue: 0x4682B4, Plum: 0xDDA0DD, Lavender: 0xE6E6FA,
    Khaki: 0xF0E68C, Beige: 0xF5F5DC, Ivory: 0xFFFFF0, Snow: 0xFFFAFA, Wheat: 0xF5DEB3, Chocolate: 0xD2691E, Sienna: 0xA0522D, Tan: 0xD2B48C, Orchid: 0xDA70D6, BlueViolet: 0x8A2BE2, DarkViolet: 0x9400D3, Goldenrod: 0xDAA520, Linen: 0xFAF0E6 };
  api.clasa('CRGB', CRGB);

  // palete de 16 culori
  const PALETE = {
    RainbowColors_p: [0xFF0000, 0xD52A00, 0xAB5500, 0xAB7F00, 0xABAB00, 0x56D500, 0x00FF00, 0x00D52A, 0x00AB55, 0x0056AA, 0x0000FF, 0x2A00D5, 0x5500AB, 0x7F0081, 0xAB0055, 0xD5002B],
    RainbowStripeColors_p: [0xFF0000, 0x000000, 0xAB5500, 0x000000, 0xABAB00, 0x000000, 0x00FF00, 0x000000, 0x00AB55, 0x000000, 0x0000FF, 0x000000, 0x5500AB, 0x000000, 0xAB0055, 0x000000],
    PartyColors_p: [0x5500AB, 0x84007C, 0xB5004B, 0xE5001B, 0xE81700, 0xB84700, 0xAB7700, 0xABAB00, 0xAB5500, 0xDD2200, 0xF2000E, 0xC2003E, 0x8F0071, 0x5F00A1, 0x2F00D0, 0x0007F9],
    HeatColors_p: [0x000000, 0x330000, 0x660000, 0x990000, 0xCC0000, 0xFF0000, 0xFF3300, 0xFF6600, 0xFF9900, 0xFFCC00, 0xFFFF00, 0xFFFF33, 0xFFFF66, 0xFFFF99, 0xFFFFCC, 0xFFFFFF],
    CloudColors_p: [0x0000FF, 0x00008B, 0x00008B, 0x00008B, 0x00008B, 0x00008B, 0x00008B, 0x00008B, 0x0000FF, 0x00008B, 0x87CEEB, 0x87CEEB, 0xADD8E6, 0xFFFFFF, 0xADD8E6, 0x87CEEB],
    LavaColors_p: [0x000000, 0x800000, 0x000000, 0x800000, 0x8B0000, 0x8B0000, 0x800000, 0x8B0000, 0x8B0000, 0x8B0000, 0xFF0000, 0xFFA500, 0xFFFFFF, 0xFFA500, 0xFF0000, 0x8B0000],
    OceanColors_p: [0x191970, 0x00008B, 0x191970, 0x000080, 0x00008B, 0x0000CD, 0x2E8B57, 0x008080, 0x5F9EA0, 0x0000FF, 0x008B8B, 0x6495ED, 0x7FFFD4, 0x2E8B57, 0x00FFFF, 0x87CEFA],
    ForestColors_p: [0x006400, 0x006400, 0x556B2F, 0x006400, 0x008000, 0x228B22, 0x6B8E23, 0x008000, 0x2E8B57, 0x66CDAA, 0x32CD32, 0x9ACD32, 0x90EE90, 0x7CFC00, 0x66CDAA, 0x228B22]
  };
  class CRGBPalette16 {
    constructor(...c) {
      if (c.length === 1 && c[0] instanceof CRGBPalette16) { this.culori = c[0].culori.map(x => new CRGB(x)); return; }
      if (c.length === 1 && Array.isArray(c[0])) c = c[0];
      if (c.length >= 16) { this.culori = c.slice(0, 16).map(x => new CRGB(x)); return; }
      if (!c.length) { this.culori = Array.from({ length: 16 }, () => new CRGB(0)); return; }
      // 1–4 culori: gradient uniform, ca în FastLED
      const k = c.map(x => new CRGB(x));
      this.culori = [];
      for (let i = 0; i < 16; i++) {
        if (k.length === 1) { this.culori.push(new CRGB(k[0])); continue; }
        const poz = i / 15 * (k.length - 1), j = Math.min(k.length - 2, Math.floor(poz)), f = poz - j;
        const a = k[j], b = k[j + 1];
        this.culori.push(new CRGB(Math.round(a.r + (b.r - a.r) * f), Math.round(a.g + (b.g - a.g) * f), Math.round(a.b + (b.b - a.b) * f)));
      }
    }
    static __din(x) { return new CRGBPalette16(x); }
    __copie() { return new CRGBPalette16(this); }
  }
  api.clasa('CRGBPalette16', CRGBPalette16);
  api.clasa('CRGBPalette256', CRGBPalette16);
  api.clasa('TProgmemRGBPalette16', CRGBPalette16);
  for (const k in PALETE) api.obiecte[k] = 'CRGBPalette16';
  api.creatoriObiecte.push(() => { const o = {}; for (const k in PALETE) o[k] = new CRGBPalette16(PALETE[k]); return o; });
  function colorFromPalette(pal, index, lum, amestec) {
    index &= 255;
    lum = lum === undefined ? 255 : lum & 255;
    const culori = pal && pal.culori ? pal.culori : PALETE.RainbowColors_p.map(x => new CRGB(x));
    const hi = index >> 4, lo = index & 15;
    const a = culori[hi];
    let r = a.r, g = a.g, b = a.b;
    if ((amestec === undefined || amestec) && lo) {
      const n = culori[(hi + 1) & 15];
      const f2 = lo << 4, f1 = 255 - f2;
      r = scale8(r, f1) + scale8(n.r, f2); g = scale8(g, f1) + scale8(n.g, f2); b = scale8(b, f1) + scale8(n.b, f2);
    }
    if (lum !== 255) { r = scale8(r, lum); g = scale8(g, lum); b = scale8(b, lum); }
    return new CRGB(q8(r), q8(g), q8(b));
  }
  api.functie('ColorFromPalette', function ColorFromPalette(pal, index, lum, amestec) { return colorFromPalette(pal, index, lum, amestec); }, 'obj:CRGB');
  api.functie('HeatColor', function HeatColor(t) {
    t &= 255;
    const t192 = scale8(t, 191), rampa = (t192 & 0x3F) << 2;
    if (t192 & 0x80) return new CRGB(255, 255, rampa);
    if (t192 & 0x40) return new CRGB(255, rampa, 0);
    return new CRGB(rampa, 0, 0);
  }, 'obj:CRGB');
  api.functie('blend', function blend(a, b, f) {
    a = new CRGB(a); b = new CRGB(b); f &= 255;
    return new CRGB(a.r + (((b.r - a.r) * f) >> 8), a.g + (((b.g - a.g) * f) >> 8), a.b + (((b.b - a.b) * f) >> 8));
  }, 'obj:CRGB');
  api.functie('nblend', function nblend(a, b, f) { const c = api.functii.blend(a, b, f); a.setRGB(c.r, c.g, c.b); return a; }, 'obj:CRGB');
  Object.assign(api.constante, { LINEARBLEND: 1, NOBLEND: 0, LINEARBLEND_NOWRAP: 2, TypicalLEDStrip: 0xFFB0F0, TypicalSMD5050: 0xFFB0F0, TypicalPixelString: 0xFFE08C, UncorrectedColor: 0xFFFFFF, Candle: 0xFF9329, Tungsten100W: 0xFFD6AA, UncorrectedTemperature: 0xFFFFFF, DirectSunlight: 0xFFFFFF,
    HUE_RED: 0, HUE_ORANGE: 32, HUE_YELLOW: 64, HUE_GREEN: 96, HUE_AQUA: 128, HUE_BLUE: 160, HUE_PURPLE: 192, HUE_PINK: 224 });
  Object.assign(api.tipuriNumerice, { TBlendType: 'uint8_t', fract8: 'uint8_t', fract16: 'uint16_t', accum88: 'uint16_t', saccum78: 'int16_t' });

  // cipurile ale căror nume apar ca argument de șablon: addLeds<WS2812B, PIN, GRB>
  const CIPURI_FASTLED = ['WS2812B', 'WS2812', 'WS2811', 'WS2813', 'WS2815', 'NEOPIXEL', 'SK6812', 'SK6812RGBW', 'TM1809', 'TM1804', 'UCS1903', 'GS1903', 'PL9823', 'APA106', 'WS2852', 'GW6205', 'LPD1886'];
  class CFastLED {
    constructor() { this.benzi = []; this.lum = 255; }
    addLeds(sablon, leds, n, offset) {
      const s = Array.isArray(sablon) ? sablon : [];
      const cipLed = s.length ? String(s[0]) : '';
      const pin = typeof s[1] === 'number' ? s[1] : -1;
      const ordine = typeof s[2] === 'string' && /^[RGB]{3}$/.test(s[2]) ? s[2] : (cipLed === 'NEOPIXEL' ? 'GRB' : 'RGB');
      if (cipLed && !CIPURI_FASTLED.includes(cipLed)) {
        S().problema('fastled-cip-' + cipLed, 'avertisment', 'FastLED: ' + cipLed + (/^(APA102|DOTSTAR|SK9822|WS2801|LPD8806|P9813)$/.test(cipLed) ? ' are fir de ceas separat; ' : ' nu e cunoscut; ') + 'simulatorul are benzi WS2812B (un singur fir de date). Folosește addLeds<WS2812B, PIN, GRB>.', { linie: linie() });
      }
      if (pin < 0 && s.length) S().problema('fastled-pin', 'eroare', 'FastLED.addLeds<…>: pinul de date trebuie să fie un număr cunoscut la compilare (ex. #define DATA_PIN 5).', { linie: linie() });
      this.benzi.push({ pin, leds: leds || [], n: n === undefined ? (leds ? leds.length : 0) : n, offset: offset || 0, ordine, cipLed });
      return this;
    }
    setBrightness(b) { this.lum = b & 255; }
    getBrightness() { return this.lum; }
    setMaxPowerInVoltsAndMilliamps() { } setMaxPowerInMilliWatts() { } setMaxRefreshRate() { }
    setCorrection() { return this; } setTemperature() { return this; } setDither() { return this; }
    clear(scrie) {
      for (const b of this.benzi) for (let i = 0; i < b.n; i++) { const l = b.leds[b.offset + i]; if (l instanceof CRGB) l.setRGB(0, 0, 0); else b.leds[b.offset + i] = new CRGB(0); }
      if (scrie) this.show();
    }
    clearData() { this.clear(false); }
    show(lum) {
      const sim = S();
      if (!this.benzi.length && !this.avertizat) { this.avertizat = true; sim.problema('fastled-addleds', 'eroare', 'FastLED.show() fără FastLED.addLeds<…>() în setup().', { linie: linie() }); }
      const L = lum === undefined ? this.lum : lum & 255;
      for (const b of this.benzi) {
        sim.consuma(b.n * 30 + 80);
        const cul = [];
        for (let i = 0; i < b.n; i++) {
          const x = b.leds[b.offset + i];
          const c = x instanceof CRGB ? x : new CRGB(x || 0);
          cul.push([scale8(c.r, L), scale8(c.g, L), scale8(c.b, L)]);
        }
        trimiteLaBanda(sim, b.pin, cul, b.ordine, 'FastLED');
      }
    }
    showColor(c, lum) { const x = new CRGB(c); for (const b of this.benzi) for (let i = 0; i < b.n; i++) b.leds[b.offset + i] = new CRGB(x); this.show(lum); }
    *delay(ms) { const sim = S(); const pana = sim.timp + ms * 1000; do { this.show(); yield { dorm: Math.min(10000, Math.max(0, pana - sim.timp)) }; } while (sim.timp < pana); }
    size() { return this.benzi[0] ? this.benzi[0].n : 0; }
    count() { return this.benzi.length; }
    leds() { return this.benzi[0] ? this.benzi[0].leds : null; }
    getFPS() { return 0; } countFPS() { }
  }
  CFastLED.tipuri = { getBrightness: 'uint8_t', size: 'int', count: 'int', addLeds: 'obj:CFastLED', setCorrection: 'obj:CFastLED', setTemperature: 'obj:CFastLED', setDither: 'obj:CFastLED', getFPS: 'uint16_t' };
  api.clasa('CFastLED', CFastLED);
  api.clasa('CLEDController', CFastLED);
  api.obiecte.FastLED = 'CFastLED';
  api.creatoriObiecte.push(() => ({ FastLED: new CFastLED() }));

  const peLed = (leds, n, f) => { for (let i = 0; i < n; i++) { if (!(leds[i] instanceof CRGB)) leds[i] = new CRGB(leds[i] || 0); f(leds[i], i); } };
  api.functie('fill_solid', function fill_solid(leds, n, c) { const x = new CRGB(c); peLed(leds, n, l => l.setRGB(x.r, x.g, x.b)); }, 'void');
  api.functie('fill_rainbow', function fill_rainbow(leds, n, hue, delta) { let h = hue & 255; const d = delta === undefined ? 5 : delta; peLed(leds, n, l => { l.setHSV(h, 240, 255); h = (h + d) & 255; }); }, 'void');
  api.functie('fill_rainbow_circular', function fill_rainbow_circular(leds, n, hue) { peLed(leds, n, (l, i) => l.setHSV((hue + Math.floor(i * 256 / n)) & 255, 240, 255)); }, 'void');
  api.functie('fill_gradient_RGB', function fill_gradient_RGB(leds, n, a, b) { a = new CRGB(a); b = new CRGB(b); peLed(leds, n, (l, i) => { const f = n > 1 ? i / (n - 1) : 0; l.setRGB(Math.round(a.r + (b.r - a.r) * f), Math.round(a.g + (b.g - a.g) * f), Math.round(a.b + (b.b - a.b) * f)); }); }, 'void');
  api.functie('fill_palette', function fill_palette(leds, n, index, pas, pal, lum, amestec) { let k = index & 255; peLed(leds, n, l => { const c = colorFromPalette(pal, k, lum, amestec); l.setRGB(c.r, c.g, c.b); k = (k + pas) & 255; }); }, 'void');
  api.functie('fadeToBlackBy', function fadeToBlackBy(leds, n, f) { peLed(leds, n, l => l.nscale8(255 - (f & 255))); }, 'void');
  api.functie('fadeLightBy', function fadeLightBy(leds, n, f) { peLed(leds, n, l => l.nscale8(255 - (f & 255))); }, 'void');
  api.functie('fadeUsingColor', function fadeUsingColor(leds, n, c) { const m = new CRGB(c); peLed(leds, n, l => l.nscale8(m)); }, 'void');
  api.functie('nscale8', function nscale8(leds, n, s) { peLed(leds, n, l => l.nscale8(s)); }, 'void');
  api.functie('blur1d', function blur1d(leds, n, cat) {
    const pastreaza = 255 - (cat & 255), scurge = (cat & 255) >> 1;
    let rest = new CRGB(0);
    peLed(leds, n, () => { });
    for (let i = 0; i < n; i++) {
      const cur = leds[i];
      const parte = new CRGB(cur).nscale8(scurge);
      cur.nscale8(pastreaza);
      cur.r = q8(cur.r + rest.r); cur.g = q8(cur.g + rest.g); cur.b = q8(cur.b + rest.b);
      if (i) { const p = leds[i - 1]; p.r = q8(p.r + parte.r); p.g = q8(p.g + parte.g); p.b = q8(p.b + parte.b); }
      rest = parte;
    }
  }, 'void');
  api.functie('hsv2rgb_rainbow', function hsv2rgb_rainbow(h, rgb) { const c = hsvCurcubeu(h.h, h.s, h.v); rgb.setRGB(c[0], c[1], c[2]); }, 'void');
  api.functie('hsv2rgb_spectrum', function hsv2rgb_spectrum(h, rgb) { const c = hsvCurcubeu(h.h, h.s, h.v); rgb.setRGB(c[0], c[1], c[2]); }, 'void');
  const aleator = (a, b, max) => { if (a === undefined) return (Math.random() * max) | 0; if (b === undefined) return (Math.random() * a) | 0; return a + ((Math.random() * (b - a)) | 0); };
  api.functie('random8', function random8(a, b) { return aleator(a, b, 256); }, 'uint8_t');
  api.functie('random16', function random16(a, b) { return aleator(a, b, 65536); }, 'uint16_t');
  api.functie('random16_add_entropy', function random16_add_entropy() { }, 'void');
  api.functie('random16_set_seed', function random16_set_seed() { }, 'void');
  api.functie('qadd8', function qadd8(a, b) { return Math.min(255, a + b); }, 'uint8_t');
  api.functie('qsub8', function qsub8(a, b) { return Math.max(0, a - b); }, 'uint8_t');
  api.functie('qmul8', function qmul8(a, b) { return Math.min(255, a * b); }, 'uint8_t');
  api.functie('scale8', function scale8f(a, b) { return scale8(a & 255, b & 255); }, 'uint8_t');
  api.functie('scale8_video', function scale8_video(a, b) { return a && b ? scale8(a & 255, b & 255) + 1 : 0; }, 'uint8_t');
  api.functie('scale16', function scale16(a, b) { return Math.floor((a * (b + 1)) / 65536); }, 'uint16_t');
  api.functie('lerp8by8', function lerp8by8(a, b, f) { return (a + (((b - a) * f) >> 8)) & 255; }, 'uint8_t');
  api.functie('ease8InOutQuad', function ease8InOutQuad(i) { const x = (i & 255) / 255; return Math.round((x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2) * 255); }, 'uint8_t');
  api.functie('sin8', function sin8(x) { return Math.round(128 + 127.5 * Math.sin((x & 255) / 256 * 2 * Math.PI)) & 255; }, 'uint8_t');
  api.functie('cos8', function cos8(x) { return Math.round(128 + 127.5 * Math.cos((x & 255) / 256 * 2 * Math.PI)) & 255; }, 'uint8_t');
  api.functie('sin16', function sin16(x) { return Math.round(32767 * Math.sin((x & 0xFFFF) / 65536 * 2 * Math.PI)); }, 'int16_t');
  api.functie('cos16', function cos16(x) { return Math.round(32767 * Math.cos((x & 0xFFFF) / 65536 * 2 * Math.PI)); }, 'int16_t');
  api.functie('quadwave8', function quadwave8(x) { return Math.round((1 - Math.cos((x & 255) / 256 * 2 * Math.PI)) / 2 * 255); }, 'uint8_t');
  api.functie('triwave8', function triwave8(x) { x &= 255; return x < 128 ? x * 2 : 255 - (x - 128) * 2; }, 'uint8_t');
  const faza = (bpm) => S().timp / 1e6 * (bpm > 255 ? bpm / 256 : bpm) / 60;
  api.functie('beat8', function beat8(bpm) { return Math.floor(faza(bpm) * 256) & 255; }, 'uint8_t');
  api.functie('beat16', function beat16(bpm) { return Math.floor(faza(bpm) * 65536) & 0xFFFF; }, 'uint16_t');
  api.functie('beatsin8', function beatsin8(bpm, lo, hi, tb, fz) { lo = lo || 0; hi = hi === undefined ? 255 : hi; const b = (Math.floor(faza(bpm) * 256) + (fz || 0)) & 255; return lo + Math.floor((api.functii.sin8(b) * (hi - lo + 1)) / 256); }, 'uint8_t');
  api.functie('beatsin16', function beatsin16(bpm, lo, hi, tb, fz) { lo = lo || 0; hi = hi === undefined ? 65535 : hi; const b = (Math.floor(faza(bpm) * 65536) + (fz || 0)) & 0xFFFF; return lo + Math.floor(((api.functii.sin16(b) + 32768) * (hi - lo + 1)) / 65536); }, 'uint16_t');
  api.functie('beatsin88', function beatsin88(bpm88, lo, hi) { return api.functii.beatsin16(bpm88 / 256, lo, hi); }, 'uint16_t');
  // EVERY_N_MILLISECONDS(N) { … } — ca în FastLED, prima execuție vine după N ms
  api.functie('__laFiecare', function __laFiecare(id, ms) {
    const sim = S();
    const o = sim.obiecte;
    o.__temporizatoare = o.__temporizatoare || {};
    const t = sim.timp / 1000;
    const u = o.__temporizatoare[id];
    if (u === undefined) { o.__temporizatoare[id] = t; return false; }
    if (t - u >= ms) { o.__temporizatoare[id] = t; return true; }
    return false;
  }, 'bool');
  api.macrouri.EVERY_N_MILLISECONDS = { parametri: ['N'], corp: 'if (__laFiecare(__COUNTER__, (N)))' };
  api.macrouri.EVERY_N_MILLIS = api.macrouri.EVERY_N_MILLISECONDS;
  api.macrouri.EVERY_N_SECONDS = { parametri: ['N'], corp: 'if (__laFiecare(__COUNTER__, (N) * 1000))' };
  api.macrouri.EVERY_N_MINUTES = { parametri: ['N'], corp: 'if (__laFiecare(__COUNTER__, (N) * 60000))' };
  api.macrouri.ARRAY_SIZE = { parametri: ['A'], corp: '(sizeof(A) / sizeof((A)[0]))' };

  // ---------- fișierele antet ----------
  const fonturiH = [];
  for (const fam of ['Mono', 'Sans', 'Serif']) for (const st of ['', 'Bold', 'Oblique', 'BoldOblique', 'Italic', 'BoldItalic']) for (const pt of [9, 12, 18, 24]) fonturiH.push('Fonts/Free' + fam + st + pt + 'pt7b.h');
  api.include('Adafruit_GFX.h', 'Adafruit_SSD1306.h', 'Adafruit_SH110X.h', 'Adafruit_SH1106.h', 'U8g2lib.h', 'U8x8lib.h', 'LiquidCrystal_I2C.h', 'LiquidCrystal.h', 'TFT_eSPI.h', 'Adafruit_ILI9341.h', 'Adafruit_ST7789.h', 'Adafruit_ST7735.h', 'Adafruit_GC9A01A.h', 'Adafruit_ILI9488.h',
    'TM1637Display.h', 'LedControl.h', 'Adafruit_NeoPixel.h', 'FastLED.h', 'Free_Fonts.h', 'Adafruit_I2CDevice.h', 'Adafruit_SPIDevice.h', 'splash.h', ...fonturiH);
})(window.M = window.M || {});
