/* Meșter — fișiere: SD (card microSD pe SPI), LittleFS și SPIFFS (memoria flash a plăcii), cu clasa File.
   Ca pe ESP32: căile încep cu „/”, FILE_WRITE golește fișierul (pentru adăugare e FILE_APPEND), datele ajung
   pe card abia la flush()/close(), LittleFS trebuie formatat la prima pornire (begin(true)).
   Conținutul rămâne în proiect: cardul în piesa SD, flash-ul în memoria plăcii. */
(function (M) {
  'use strict';
  const api = M.api;
  const S = () => M.simCurenta;
  const txt = M.ajutoareR.txt;
  const linie = () => { const s = S(); return s && s.R ? s.R.L : 0; };
  const log = (t, fis) => { const s = S().obiecte.Serial; if (s && s.pornit) s._scrie('[' + String(Math.floor(S().timp / 1000)).padStart(6, ' ') + '][E][' + (fis || 'vfs_api.cpp:105') + '] ' + t + '\r\n'); };

  // ---------- fișierul deschis ----------
  class File extends api.clase.Stream {
    constructor(fs, cale, mod) {
      super();
      this._fs = fs; this._cale = cale || null; this._mod = mod || 'r'; this._poz = 0; this._deschis = !!fs; this._date = ''; this._murdar = false; this._lista = null;
      if (fs && cale) {
        const e = fs._intrare(cale);
        this._dosar = !!(e && e.dosar);
        this._date = e && !e.dosar ? e.date : '';
        if (mod === 'w') this._date = '';
        if (mod === 'a') this._poz = this._date.length;
      }
    }
    __bool() { return this._deschis; }
    _scrie(t) {
      if (!this._deschis || this._mod === 'r' || this._dosar) return 0;
      if (this._mod === 'a') this._poz = this._date.length;
      this._date = this._date.slice(0, this._poz) + t + this._date.slice(this._poz + t.length);
      this._poz += t.length;
      this._murdar = true;
      S().consuma(t.length * 0.8 + 20);
      if (this._date.length - (this._salvatLa || 0) >= 512) this.flush(); // sectorul plin se scrie pe card
      return t.length;
    }
    write(v, n) {
      if (typeof v === 'number') return this._scrie(String.fromCharCode(v & 255));
      if (ArrayBuffer.isView(v)) { const u = new Uint8Array(v.buffer, v.byteOffset, v.byteLength); const k = n === undefined ? u.length : Math.min(n, u.length); let s = ''; for (let i = 0; i < k; i++) s += String.fromCharCode(u[i]); return this._scrie(s); }
      const t = txt(v).slice(0, n); return this._scrie(t);
    }
    available() { return this._deschis && !this._dosar ? Math.max(0, this._date.length - this._poz) : 0; }
    read(buf, n) {
      if (!this._deschis) return -1;
      if (buf === undefined) { S().consuma(0.5); if (this._poz >= this._date.length) return -1; return this._date.charCodeAt(this._poz++) & 255; }
      const k = Math.max(0, Math.min(n, this._date.length - this._poz));
      for (let i = 0; i < k; i++) buf[i] = this._date.charCodeAt(this._poz + i) & 255;
      this._poz += k; S().consuma(k * 0.5 + 10);
      return k;
    }
    peek() { return this._poz < this._date.length ? this._date.charCodeAt(this._poz) & 255 : -1; }
    readBytes(buf, n) { return this.read(buf, n); }
    readString() { const t = this._date.slice(this._poz); this._poz = this._date.length; return t; }
    readStringUntil(c) { const term = String.fromCharCode(c & 255); const i = this._date.indexOf(term, this._poz); const t = i < 0 ? this._date.slice(this._poz) : this._date.slice(this._poz, i); this._poz = i < 0 ? this._date.length : i + 1; return t; }
    readBytesUntil(c, buf, n) { const t = this.readStringUntil(c).slice(0, n); for (let i = 0; i < t.length; i++) buf[i] = t.charCodeAt(i); return t.length; }
    parseInt() { const m = /^[^-\d]*(-?\d+)/.exec(this._date.slice(this._poz)); if (!m) { this._poz = this._date.length; return 0; } this._poz += m.index + m[0].length; return parseInt(m[1], 10) | 0; }
    parseFloat() { const m = /^[^-\d.]*(-?\d*\.?\d+)/.exec(this._date.slice(this._poz)); if (!m) { this._poz = this._date.length; return 0; } this._poz += m.index + m[0].length; return parseFloat(m[1]); }
    find(t) { const s = txt(t); const i = this._date.indexOf(s, this._poz); if (i < 0) { this._poz = this._date.length; return false; } this._poz = i + s.length; return true; }
    size() { return this._dosar ? 0 : this._date.length; }
    position() { return this._poz; }
    seek(p, mod) { const x = mod === 1 ? this._poz + p : mod === 2 ? this._date.length + p : p; if (x < 0 || x > this._date.length) return false; this._poz = x; return true; }
    name() { return this._cale ? (this._cale === '/' ? '/' : this._cale.split('/').pop()) : ''; }
    path() { return this._cale || ''; }
    isDirectory() { return !!this._dosar; }
    getLastWrite() { const e = this._fs && this._fs._intrare(this._cale); return e && e.mod ? Math.floor(e.mod / 1000) : 0; }
    flush() {
      if (!this._deschis || !this._murdar || !this._fs) return;
      this._fs._salveaza(this._cale, this._date);
      this._murdar = false; this._salvatLa = this._date.length;
      S().consuma(2500);
    }
    close() { if (!this._deschis) return; this.flush(); this._deschis = false; if (this._fs) this._fs._inchis(this); }
    openNextFile(mod) {
      if (!this._dosar || !this._fs) return new File(null);
      if (!this._lista) this._lista = this._fs._copii(this._cale);
      const urm = this._lista.shift();
      return urm ? this._fs._deschide(urm, mod === 'w' || mod === 'a' ? mod : 'r') : new File(null);
    }
    getNextFileName() { if (!this._dosar || !this._fs) return ''; if (!this._lista) this._lista = this._fs._copii(this._cale); return this._lista.shift() || ''; }
    rewindDirectory() { this._lista = null; }
    setBufferSize(n) { return n; }
  }
  File.tipuri = Object.assign({}, api.clase.Stream.tipuri, { available: 'int', read: 'int', peek: 'int', readBytes: 'size_t', readString: 'String', readStringUntil: 'String', size: 'size_t', position: 'size_t', seek: 'bool', name: 'cstr', path: 'cstr', isDirectory: 'bool', getLastWrite: 'time_t', openNextFile: 'obj:File', getNextFileName: 'String' });
  api.clasa('File', File);

  // ---------- sistemul de fișiere ----------
  class FS {
    constructor() { this._montat = false; this._deschise = new Set(); this._maxDeschise = 10; }
    _stocare() { return null; }
    _fis() { const s = this._stocare(); return s ? (s.fisiere = s.fisiere || {}) : {}; }
    _normal(cale) { let c = txt(cale); if (c.length > 1 && c.endsWith('/')) c = c.slice(0, -1); return c; }
    _intrare(c) { if (c === '/') return { dosar: true }; return this._fis()[c] || null; }
    _parinteExista(c) { const p = c.slice(0, c.lastIndexOf('/')) || '/'; return p === '/' || !!(this._fis()[p] && this._fis()[p].dosar); }
    _copii(c) {
      const pref = c === '/' ? '/' : c + '/';
      return Object.keys(this._fis()).filter(k => k.startsWith(pref) && k.slice(pref.length).indexOf('/') < 0).sort();
    }
    _salveaza(c, date) { const f = this._fis(); f[c] = { date, mod: Date.now() }; this._modificat(); }
    _modificat() { S().emit('memorie'); }
    _verificaCale(c, op) {
      if (!this._montat) { if (!this._avertizat) { this._avertizat = true; S().problema('fs-montat-' + this._nume, 'eroare', this._nume + '.' + op + '() fără ' + this._nume + '.begin() reușit: sistemul de fișiere nu e montat.', { linie: linie() }); } return false; }
      if (!c.startsWith('/')) { log(op + '(): ' + c + ' does not start with /'); S().problema('fs-slash', 'eroare', this._nume + '.' + op + '("' + c + '"): pe ESP32 căile trebuie să înceapă cu „/” — scrie "/' + c + '".', { linie: linie() }); return false; }
      return true;
    }
    _deschide(c, mod) {
      const f = new File(this, c, mod);
      this._deschise.add(f);
      S().consuma(3000);
      return f;
    }
    _inchis(f) { this._deschise.delete(f); }
    open(cale, mod, creeaza) {
      const c = this._normal(cale);
      const m = txt(mod === undefined ? 'r' : mod).replace('+', '');
      if (!this._verificaCale(c, 'open')) return new File(null);
      const e = this._intrare(c);
      if (m === 'r' && !e) { log('open(): ' + this._prefix + c + ' does not exist, no permits for creation'); return new File(null); }
      if ((m === 'w' || m === 'a') && !e && !this._parinteExista(c)) { log('open(): ' + this._prefix + c + ' parent does not exist'); return new File(null); }
      if (e && e.dosar && m !== 'r') return new File(null);
      if (this._deschise.size >= this._maxDeschise) { S().problema('fs-prea-multe', 'avertisment', this._nume + ': sunt deja ' + this._maxDeschise + ' fișiere deschise; închide-le cu close() după folosire.', { linie: linie() }); return new File(null); }
      if ((m === 'w' || m === 'a') && !e) this._fis()[c] = { date: '', mod: Date.now() };
      if (m === 'w') this._fis()[c].date = '';
      return this._deschide(c, m);
    }
    exists(cale) { const c = this._normal(cale); if (!this._montat) return false; return !!this._intrare(c); }
    remove(cale) { const c = this._normal(cale); if (!this._verificaCale(c, 'remove')) return false; const e = this._fis()[c]; if (!e || e.dosar) return false; delete this._fis()[c]; this._modificat(); return true; }
    rename(a, b) { const x = this._normal(a), y = this._normal(b); if (!this._verificaCale(x, 'rename') || !this._verificaCale(y, 'rename')) return false; const f = this._fis(); if (!f[x] || f[y]) return false; f[y] = f[x]; delete f[x]; this._modificat(); return true; }
    mkdir(cale) { const c = this._normal(cale); if (!this._verificaCale(c, 'mkdir')) return false; if (this._intrare(c)) return !!this._intrare(c).dosar; if (!this._parinteExista(c)) return false; this._fis()[c] = { dosar: true, mod: Date.now() }; this._modificat(); return true; }
    rmdir(cale) { const c = this._normal(cale); if (!this._verificaCale(c, 'rmdir')) return false; const e = this._fis()[c]; if (!e || !e.dosar || this._copii(c).length) return false; delete this._fis()[c]; this._modificat(); return true; }
    usedBytes() { let n = 0; for (const e of Object.values(this._fis())) n += e.dosar ? 0 : Math.ceil((e.date.length || 1) / this._bloc) * this._bloc; return n; }
    end() { for (const f of [...this._deschise]) f.close(); this._montat = false; }
    // la resetarea plăcii, ce n-a fost scris pe card se pierde
    _laReset() {
      const pierdute = [...this._deschise].filter(f => f._murdar).map(f => f._cale);
      if (pierdute.length) S().problema('fs-neinchis', 'avertisment', 'La resetare, ' + pierdute.join(', ') + ' era încă deschis: ultimele date scrise (după ultimul flush()/close()) s-au pierdut, ca pe o placă reală. Apelează close() sau flush() după scriere.');
      this._deschise.clear(); this._montat = false;
    }
  }
  FS.tipuri = { open: 'obj:File', exists: 'bool', remove: 'bool', rename: 'bool', mkdir: 'bool', rmdir: 'bool', usedBytes: 'size_t', totalBytes: 'size_t' };
  api.clasa('FS', FS);

  // ---------- SD pe SPI ----------
  class SDFS extends FS {
    constructor() { super(); this._nume = 'SD'; this._prefix = '/sd'; this._maxDeschise = 5; this._bloc = 32768; this._dev = null; }
    _stocare() { return this._dev ? this._dev.fs : null; }
    _modificat() { if (this._dev) this._dev.modificat(); else super._modificat(); }
    begin(cs, spi) {
      const sim = S();
      sim.consuma(250000);
      this._montat = false; this._dev = null;
      const cip = sim.cip;
      const pinCs = cs === undefined ? cip.spi.ss : cs;
      const bus = spi && spi.begin ? spi : sim.obiecte.SPI;
      if (!bus.pornit) bus.begin();
      const toate = sim.dispozitive(['sd']);
      const nCs = sim.netGPIO(pinCs);
      const dev = toate.find(d => sim.netPin(d.inst, 'CS') === nCs && nCs >= 0);
      if (!dev) {
        if (toate.length) { const g = sim.gpioLaNet(sim.netPin(toate[0].inst, 'CS')); sim.problema('sd-cs', 'eroare', 'SD.begin(' + pinCs + ') caută cardul cu CS pe GPIO' + pinCs + ', dar ' + toate[0].inst.eticheta + ' are CS ' + (g.length ? 'pe GPIO' + g[0] + '. Scrie SD.begin(' + g[0] + ').' : 'nelegat.'), { linie: linie(), comp: toate[0].inst.id }); }
        return false;
      }
      const lipsa = [];
      for (const [pin, g] of [['SCK', bus.sck], ['MOSI', bus.mosi], ['MISO', bus.miso]]) if (sim.netPin(dev.inst, pin) !== sim.netGPIO(g)) { const x = sim.gpioLaNet(sim.netPin(dev.inst, pin)); lipsa.push(pin + ' e ' + (x.length ? 'pe GPIO' + x[0] : 'nelegat') + ' (SPI îl vrea pe GPIO' + g + ')'); }
      if (lipsa.length) { sim.problema('sd-fire', 'eroare', dev.inst.eticheta + ': ' + lipsa.join('; ') + '. Pe ESP32 SPI-ul implicit are SCK = 18, MISO = 19, MOSI = 23; altfel pornește SPI.begin(SCK, MISO, MOSI) înainte de SD.begin().', { linie: linie(), comp: dev.inst.id }); return false; }
      const vCard = dev.tensiuneCard();
      if (vCard < 2.7) {
        const v = sim.alimentare(dev.inst, 'VCC', 'GND').v;
        if (dev.inst.prop.model === 'regulator' && v > 2) sim.problema('sd-5v', 'eroare', dev.inst.eticheta + ' are regulator de 3,3 V pe placă și primește doar ' + M.fmtV(v) + ' pe VCC: după regulator cardul rămâne cu ~' + M.fmtV(Math.max(0, v - 1.1)) + ' și nu pornește. Leagă VCC la VIN (5 V).', { linie: linie(), comp: dev.inst.id });
        return false;
      }
      const card = dev.inst.prop.card;
      if (card === 'lipsa') { sim.problema('sd-lipsa', 'info', 'SD.begin() a eșuat: în ' + dev.inst.eticheta + ' nu e niciun card microSD.', { comp: dev.inst.id }); return false; }
      if (card === 'nefromatat') { sim.problema('sd-fat', 'avertisment', 'Cardul din ' + dev.inst.eticheta + ' nu e formatat FAT32 (e exFAT), așa că SD.begin() eșuează. Formatează-l FAT32 (cardurile de peste 32 GB vin de obicei cu exFAT).', { comp: dev.inst.id }); return false; }
      this._dev = dev; this._montat = true;
      return true;
    }
    cardType() { return this._montat ? 3 : 0; }
    cardSize() { return this._montat ? 7948206080 : 0; }
    numSectors() { return this._montat ? 15523840 : 0; }
    sectorSize() { return 512; }
    totalBytes() { return this._montat ? 7939817472 : 0; }
  }
  SDFS.tipuri = Object.assign({}, FS.tipuri, { begin: 'bool', cardType: 'uint8_t', cardSize: 'uint64_t', numSectors: 'size_t', sectorSize: 'size_t', totalBytes: 'uint64_t', usedBytes: 'uint64_t' });
  api.clasa('SDFS', SDFS);

  // ---------- LittleFS / SPIFFS / FFat în flash ----------
  function clasaFlash(nume, total) {
    const C = class extends FS {
      constructor() { super(); this._nume = nume; this._prefix = '/' + nume.toLowerCase(); this._bloc = 4096; }
      _mem() { const p = S().proiect; p.memorie = p.memorie || {}; return p.memorie; }
      _stocare() { const m = this._mem(); return m[nume] || null; }
      begin(formatare) {
        const sim = S();
        sim.consuma(40000);
        const m = this._mem();
        if (!m[nume]) {
          if (!formatare) {
            sim.problema('fs-format-' + nume, 'avertisment', nume + '.begin() a eșuat: partiția din flash nu e formatată încă (la prima pornire a unei plăci e goală). Scrie ' + nume + '.begin(true) ca s-o formateze automat.', { linie: linie() });
            if (nume === 'LittleFS') log('begin(): Mounting LittleFS failed! Error: -84', 'LittleFS.cpp:79');
            else log('mount(): Mounting ' + nume + ' failed!', nume + '.cpp:89');
            return false;
          }
          sim.consuma(900000);
          m[nume] = { fisiere: {} };
          this._modificat();
        }
        this._montat = true;
        return true;
      }
      format() { const m = this._mem(); m[nume] = { fisiere: {} }; this._modificat(); S().consuma(1500000); return true; }
      totalBytes() { return total; }
    };
    C.tipuri = Object.assign({}, FS.tipuri, { begin: 'bool', format: 'bool', totalBytes: 'size_t' });
    api.clasa(nume + 'FS', C);
    return C;
  }
  const LittleFSFS = clasaFlash('LittleFS', 1441792);
  const SPIFFSFS = clasaFlash('SPIFFS', 1318001);
  const FFatFS = clasaFlash('FFat', 1507328);
  Object.assign(api.obiecte, { SD: 'SDFS', LittleFS: 'LittleFSFS', SPIFFS: 'SPIFFSFS', FFat: 'FFatFS' });
  api.creatoriObiecte.push((sim) => {
    // resetarea plăcii (nu o simulare nouă): fișierele deschise își pierd datele nescrise
    if (sim && sim.__fsVechi) for (const f of Object.values(sim.__fsVechi)) try { f._laReset(); } catch (e) { /* ignorăm */ }
    const o = { SD: new SDFS(), LittleFS: new LittleFSFS(), SPIFFS: new SPIFFSFS(), FFat: new FFatFS() };
    if (sim) sim.__fsVechi = o;
    return o;
  });
  Object.assign(api.constante, { FILE_READ: 'r', FILE_WRITE: 'w', FILE_APPEND: 'a', CARD_NONE: 0, CARD_MMC: 1, CARD_SD: 2, CARD_SDHC: 3, CARD_UNKNOWN: 4, SeekSet: 0, SeekCur: 1, SeekEnd: 2, O_READ: 'r', O_WRITE: 'w', O_APPEND: 'a' });
  api.tipConstante.FILE_READ = 'cstr'; api.tipConstante.FILE_WRITE = 'cstr'; api.tipConstante.FILE_APPEND = 'cstr';
  Object.assign(api.tipuriNumerice, { sdcard_type_t: 'uint8_t', SeekMode: 'int' });
  api.include('SD.h', 'FS.h', 'LittleFS.h', 'SPIFFS.h', 'FFat.h', 'SD_MMC.h', 'sd_defines.h');
})(window.M = window.M || {});
