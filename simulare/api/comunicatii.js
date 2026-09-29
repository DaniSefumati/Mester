/* Meșter — magistrale de comunicație: Wire (I2C), SPI, OneWire, SoftwareSerial și legătura UART
   dintre placă și module (GPS, Bluetooth). Dispozitivele se găsesc după firele reale din schemă. */
(function (M) {
  'use strict';
  const api = M.api;
  const S = () => M.simCurenta;
  const txt = M.ajutoareR.txt;
  const linie = () => { const s = S(); return s && s.R ? s.R.L : 0; };
  const hex = (a) => '0x' + (a >>> 0).toString(16).toUpperCase().padStart(2, '0');

  // ---------- I2C ----------
  class TwoWire extends api.clase.Stream {
    constructor(nr) { super(); this.nr = nr || 0; this.pornit = false; this.frecventa = 100000; this.tx = null; this.sda = -1; this.scl = -1; }
    pini() {
      const cip = S().cip;
      if (this.sda < 0 && cip) { this.sda = cip.i2c.sda; this.scl = cip.i2c.scl; }
      return [this.sda, this.scl];
    }
    begin(a, b, fr) {
      const sim = S(), cip = sim.cip;
      if (typeof a === 'number' && b === undefined) {
        sim.problema('wire-slave', 'info', 'Wire.begin(' + a + ') pornește placa în mod I2C „slave” (cu adresa ' + a + '), care nu e simulat. Pentru afișaje și senzori folosește Wire.begin()' + (cip.platforma === 'avr' ? '.' : ' sau Wire.begin(SDA, SCL).'), { linie: linie() });
      }
      const sda = typeof a === 'number' && typeof b === 'number' && cip.platforma !== 'avr' ? a : cip.i2c.sda;
      const scl = typeof a === 'number' && typeof b === 'number' && cip.platforma !== 'avr' ? b : cip.i2c.scl;
      if (this.pornit) {
        // ca în nucleul ESP32 3.x: a doua pornire nu mai schimbă pinii
        if ((sda !== this.sda || scl !== this.scl) && typeof a === 'number' && typeof b === 'number') {
          sim.problema('wire-repornit', 'avertisment', 'Wire.begin(' + a + ', ' + b + ') vine după ce magistrala I2C era deja pornită pe GPIO' + this.sda + '/' + this.scl + ' (de exemplu de display.begin() sau lcd.init()), așa că pinii noi nu se aplică. Pune Wire.begin(SDA, SCL) la începutul lui setup(), înainte de display.begin() / lcd.init().', { linie: linie() });
        }
        if (fr) this.frecventa = fr;
        return true;
      }
      this.sda = sda; this.scl = scl;
      if (fr) this.frecventa = fr;
      this.pornit = true;
      return true;
    }
    setPins(sda, scl) { this.sda = sda; this.scl = scl; return true; }
    setClock(f) { this.frecventa = f; }
    getClock() { return this.frecventa; }
    end() { this.pornit = false; return true; }
    setTimeOut() { } setTimeout() { } setBufferSize(n) { return n; }
    // dispozitivele alimentate de pe magistrala acestui Wire
    dispozitive() {
      const sim = S();
      const [sda, scl] = this.pini();
      return sim.magistralaI2C(sda, scl).filter(d => sim.alimentare(d.inst, d.pinVcc, d.pinGnd).v > 2.4);
    }
    gaseste(adresa) { return this.dispozitive().find(d => d.adresaI2C === adresa) || null; }
    cost(octeti) { S().consuma((octeti + 1) * 9e6 / this.frecventa + 10); }
    beginTransmission(adresa) {
      if (!this.pornit) this._faraBegin();
      this.tx = { adresa: adresa & 0x7F, date: [] };
    }
    write(v, n) {
      if (!this.tx) { if (typeof v === 'number') return 1; return 0; }
      if (typeof v === 'number') { this.tx.date.push(v & 255); return 1; }
      const s = ArrayBuffer.isView(v) ? v : null;
      if (s) { const k = n === undefined ? s.length : n; for (let i = 0; i < k; i++) this.tx.date.push(s[i] & 255); return k; }
      const t = txt(v).slice(0, n); for (let i = 0; i < t.length; i++) this.tx.date.push(t.charCodeAt(i)); return t.length;
    }
    endTransmission() {
      const tx = this.tx; this.tx = null;
      if (!tx) return 4;
      this.cost(tx.date.length);
      if (!this.pornit) return 4;
      const dev = this.gaseste(tx.adresa);
      if (!dev) return 2;
      if (dev.i2cScrie) { const r = dev.i2cScrie(tx.date); if (r === false) return 3; }
      return 0;
    }
    requestFrom(adresa, n) {
      if (!this.pornit) this._faraBegin();
      adresa &= 0x7F; n = n | 0;
      this.cost(n);
      const dev = this.pornit ? this.gaseste(adresa) : null;
      if (!dev) { this._in = ''; return 0; }
      const date = dev.i2cCiteste ? dev.i2cCiteste(n) : new Array(n).fill(0xFF);
      this._in = String.fromCharCode(...date.slice(0, n).map(x => x & 255));
      return this._in.length;
    }
    _faraBegin() {
      if (this.avertizat) return;
      this.avertizat = true;
      S().problema('wire-begin', 'avertisment', 'Folosești magistrala I2C (Wire) fără Wire.begin() în setup().', { linie: linie() });
    }
    onReceive() { } onRequest() { }
  }
  TwoWire.tipuri = Object.assign({}, api.clase.Stream.tipuri, { endTransmission: 'uint8_t', requestFrom: 'uint8_t', getClock: 'unsigned long', begin: 'bool' });
  api.clasa('TwoWire', TwoWire);
  api.obiecte.Wire = 'TwoWire';
  api.obiecte.Wire1 = 'TwoWire';
  api.creatoriObiecte.push(() => ({ Wire: new TwoWire(0), Wire1: new TwoWire(1) }));

  // găsește un dispozitiv I2C pentru o bibliotecă și explică problema dacă lipsește
  function gasesteI2C(wire, adresa, familii, numeBiblioteca) {
    const sim = S();
    wire = wire || sim.obiecte.Wire;
    if (!wire.pornit) wire.begin();
    const [sda, scl] = wire.pini();
    const toate = sim.magistralaI2C(sda, scl);
    const potrivite = toate.filter(d => !familii || familii.includes(d.familie) || familii.includes(d.tip));
    let dev = potrivite.find(d => d.adresaI2C === adresa);
    const nume = numeBiblioteca || 'Biblioteca';
    if (!dev) {
      if (potrivite.length) {
        sim.problema('i2c-adresa-' + adresa, 'eroare', nume + ' caută dispozitivul la adresa ' + hex(adresa) + ', dar ' + potrivite[0].inst.eticheta + ' e la ' + hex(potrivite[0].adresaI2C) + '. Schimbă adresa în cod.', { linie: linie(), comp: potrivite[0].inst.id });
      } else {
        const altundeva = sim.dispozitive(familii).filter(d => d.adresaI2C !== undefined);
        if (altundeva.length) {
          const d = altundeva[0];
          const ns = sim.netPin(d.inst, 'SDA'), nc = sim.netPin(d.inst, 'SCL');
          const gs = sim.gpioLaNet(ns), gc = sim.gpioLaNet(nc);
          let unde = gs.length && gc.length ? 'SDA pe GPIO' + gs[0] + ' și SCL pe GPIO' + gc[0] : 'SDA/SCL nelegați la placă';
          sim.problema('i2c-lipsa-' + adresa, 'eroare', nume + ' folosește I2C pe SDA=GPIO' + sda + ', SCL=GPIO' + scl + ', dar ' + d.inst.eticheta + ' are ' + unde + '. ' + (gs.length && gc.length ? 'Scrie Wire.begin(' + gs[0] + ', ' + gc[0] + ') sau mută firele.' : 'Leagă SDA și SCL.'), { linie: linie(), comp: d.inst.id });
        } else sim.problema('i2c-lipsa-' + adresa, 'eroare', nume + ': nu există niciun dispozitiv potrivit la adresa ' + hex(adresa) + ' în schemă.', { linie: linie() });
      }
      return null;
    }
    const a = sim.alimentare(dev.inst, dev.pinVcc, dev.pinGnd);
    if (a.motiv || a.v < 2.4) { sim.verificaAlimentare(dev.inst, 3, 5.5, dev.pinVcc, dev.pinGnd); return null; }
    return dev;
  }
  M.i2c = { gasesteI2C, hex };

  // ---------- SPI ----------
  class SPISettings { constructor(f, o, m) { this.frecventa = f; this.ordine = o; this.mod = m; } }
  api.clasa('SPISettings', SPISettings);
  class SPIClass {
    constructor(bus) { this.bus = bus; this.pornit = false; this.frecventa = 8000000; }
    begin(sck, miso, mosi, ss) {
      const cip = S().cip;
      this.sck = sck !== undefined && sck >= 0 ? sck : cip.spi.sck;
      this.miso = miso !== undefined && miso >= 0 ? miso : cip.spi.miso;
      this.mosi = mosi !== undefined && mosi >= 0 ? mosi : cip.spi.mosi;
      this.ss = ss !== undefined && ss >= 0 ? ss : cip.spi.ss;
      this.pornit = true;
      return true;
    }
    end() { this.pornit = false; }
    beginTransaction(s) { if (s && s.frecventa) this.frecventa = s.frecventa; }
    endTransaction() { }
    setFrequency(f) { this.frecventa = f; }
    setDataMode() { } setBitOrder() { } setClockDivider() { } setHwCs() { }
    transfer(b) {
      S().consuma(8e6 / this.frecventa);
      if (ArrayBuffer.isView(b)) { return; }
      return 0xFF;
    }
    transfer16() { S().consuma(16e6 / this.frecventa); return 0xFFFF; }
    transfer32() { return 0xFFFFFFFF; }
    transferBytes(a, b, n) { S().consuma(n * 8e6 / this.frecventa); }
    writeBytes(a, n) { S().consuma(n * 8e6 / this.frecventa); }
    write(b) { S().consuma(8e6 / this.frecventa); }
    write16() { } write32() { }
  }
  SPIClass.tipuri = { transfer: 'uint8_t', transfer16: 'uint16_t' };
  api.clasa('SPIClass', SPIClass);
  api.obiecte.SPI = 'SPIClass';
  api.creatoriObiecte.push(() => ({ SPI: new SPIClass(0) }));
  Object.assign(api.constante, { SPI_MODE0: 0, SPI_MODE1: 1, SPI_MODE2: 2, SPI_MODE3: 3, VSPI: 3, HSPI: 2, FSPI: 0, SPI_CLOCK_DIV2: 2, SPI_CLOCK_DIV4: 4, SPI_CLOCK_DIV8: 8, SPI_CLOCK_DIV16: 16 });

  // ---------- OneWire (protocolul DS18B20: ROM + scratchpad) ----------
  function crc8(a, n) { let crc = 0; for (let i = 0; i < n; i++) { let b = a[i]; for (let j = 0; j < 8; j++) { const mix = (crc ^ b) & 1; crc >>= 1; if (mix) crc ^= 0x8C; b >>= 1; } } return crc; }
  // memoria de lucru a unui DS18B20: la pornire conține 85 °C, până la prima conversie
  function pad(d) {
    if (!d.pad) { d.pad = [0x50, 0x05, d.th & 255, d.tl & 255, 0x7F, 0xFF, 0x0C, 0x10, 0]; d.pad[8] = crc8(d.pad, 8); }
    return d.pad;
  }
  function incheieConversia(d) {
    const sim = S();
    if (d.gataLa !== undefined && sim.timp >= d.gataLa) {
      const p = pad(d);
      const raw = Math.max(-880, Math.min(2000, Math.round(d.temperatura() * 16))) & 0xFFFF;
      const masca = [0xFFF8, 0xFFFC, 0xFFFE, 0xFFFF][d.rezolutie - 9];
      p[0] = raw & masca & 255; p[1] = (raw >> 8) & 255;
      p[8] = crc8(p, 8);
      d.gataLa = undefined;
    }
  }
  const OW = {
    pad, incheieConversia,
    pornesteConversia(d) { incheieConversia(d); d.gataLa = S().timp + d.timpConversie(); },
    ocupat(d) { return d.gataLa !== undefined && S().timp < d.gataLa; },
    citesteTemperatura(d) {
      incheieConversia(d);
      const p = pad(d);
      let raw = p[0] | (p[1] << 8); if (raw & 0x8000) raw -= 0x10000;
      return raw / 16;
    },
    seteazaRezolutia(d, biti) { d.rezolutie = Math.max(9, Math.min(12, biti | 0)); const p = pad(d); p[4] = ((d.rezolutie - 9) << 5) | 0x1F; p[8] = crc8(p, 8); },
    // magistrala funcționează doar cu pull-up (4,7 kΩ) și cu senzorii alimentați
    dispozitive(pin, numeLib) {
      const sim = S();
      const net = sim.netGPIO(pin);
      const toti = sim.cautaDupaPin(['ds18b20'], 'DQ', pin);
      if (!toti.length) {
        const alti = sim.dispozitive(['ds18b20']);
        sim.problema('onewire-lipsa-' + pin, 'eroare', (numeLib || 'OneWire') + ' pe pinul ' + pin + ': niciun DS18B20 nu are DQ legat aici.' + (alti.length ? ' ' + alti[0].inst.eticheta + ' are DQ pe alt pin.' : ''), { linie: linie() });
        return [];
      }
      const pu = M.senzori.pullUp(sim, net);
      if (pu > 15000) {
        sim.problema('onewire-pullup-' + pin, 'eroare', 'Linia de date 1-Wire (pinul ' + pin + ') nu are rezistor de pull-up. Pune 4,7 kΩ între DQ și 3,3 V — fără el senzorul nu răspunde și citirea dă −127 °C.', { linie: linie(), comp: toti[0].inst.id });
        return [];
      }
      return toti.filter(d => d.parazit || sim.alimentare(d.inst, 'VDD').v > 2.9);
    }
  };
  M.oneWire = OW;
  class OneWire {
    constructor(pin) { this.pin = pin; this.cauta = 0; this.stare = 'inactiv'; this.coada = []; this.sel = []; this.octetiRom = null; }
    _dev() { return OW.dispozitive(this.pin, 'OneWire'); }
    reset() {
      S().consuma(960);
      const d = this._dev();
      this.stare = 'rom'; this.coada = []; this.sel = [];
      return d.length ? 1 : 0;
    }
    select(rom) {
      S().consuma(600);
      this.sel = this._dev().filter(d => d.adresa.every((b, i) => b === (rom[i] & 255)));
      this.stare = 'functie';
    }
    skip() { S().consuma(80); this.sel = this._dev(); this.stare = 'functie'; }
    write(v, putere) {
      S().consuma(70);
      v &= 255;
      if (this.stare === 'rom') {
        if (v === 0xCC) { this.sel = this._dev(); this.stare = 'functie'; }
        else if (v === 0x55) { this.octetiRom = []; this.stare = 'potrivire'; }
        else if (v === 0x33) { const d = this._dev(); if (d.length) this.coada.push(...d[0].adresa); this.sel = d.slice(0, 1); this.stare = 'functie'; }
        return;
      }
      if (this.stare === 'potrivire') {
        this.octetiRom.push(v);
        if (this.octetiRom.length === 8) { this.sel = this._dev().filter(d => d.adresa.every((b, i) => b === this.octetiRom[i])); this.stare = 'functie'; }
        return;
      }
      if (this.stare === 'scrie-pad') {
        const d = this.sel[0];
        if (d) { const p = pad(d); p[this.indexPad] = v; if (this.indexPad === 2) d.th = v; if (this.indexPad === 3) d.tl = v; if (this.indexPad === 4) OW.seteazaRezolutia(d, ((v >> 5) & 3) + 9); p[8] = crc8(p, 8); }
        this.indexPad++;
        if (this.indexPad > 4) this.stare = 'gata';
        return;
      }
      if (this.stare !== 'functie') return;
      switch (v) {
        case 0x44: for (const d of this.sel) { if (d.parazit && !putere) S().problema('ds-parazit', 'avertisment', 'DS18B20 alimentat parazit (VDD la GND) are nevoie de ds.write(0x44, 1) — cu „1” — ca să primească putere în timpul conversiei.', { linie: linie() }); OW.pornesteConversia(d); } this.stare = 'conversie'; break;
        case 0xBE:
          if (this.sel.length === 1) { OW.incheieConversia(this.sel[0]); this.coada.push(...pad(this.sel[0])); }
          else this.coada.push(0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF); // niciun senzor sau mai mulți răspund deodată
          this.stare = 'gata'; break;
        case 0x4E: this.indexPad = 2; this.stare = 'scrie-pad'; break;
        case 0xB4: this.coada.push(this.sel.some(d => d.parazit) ? 0x00 : 0xFF); this.stare = 'gata'; break;
        case 0x48: case 0xB8: this.stare = 'gata'; break;
      }
    }
    write_bytes(buf, n, putere) { for (let i = 0; i < n; i++) this.write(buf[i], putere); }
    read() {
      S().consuma(70);
      if (this.coada.length) return this.coada.shift();
      if (this.stare === 'conversie') return this.sel.some(d => OW.ocupat(d)) ? 0x00 : 0xFF;
      return 0xFF;
    }
    read_bytes(buf, n) { for (let i = 0; i < n; i++) buf[i] = this.read(); }
    read_bit() { return this.read() & 1; }
    write_bit() { S().consuma(70); }
    depower() { }
    reset_search() { this.cauta = 0; }
    target_search() { this.cauta = 0; }
    search(adr) {
      S().consuma(12000);
      const d = this._dev().slice().sort((a, b) => { for (let i = 7; i >= 0; i--) if (a.adresa[i] !== b.adresa[i]) return a.adresa[i] - b.adresa[i]; return 0; });
      if (this.cauta >= d.length) { this.cauta = 0; return false; }
      const a = d[this.cauta++].adresa;
      for (let i = 0; i < 8; i++) adr[i] = a[i];
      return true;
    }
    static crc8(a, n) { return crc8(a, n); }
    crc8(a, n) { return crc8(a, n); }
    static crc16(a, n) { let crc = 0; for (let i = 0; i < n; i++) { let c = (a[i] ^ (crc & 0xFF)) & 0xFF; crc >>= 8; const p = [0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0]; if (p[c & 0x0F] ^ p[c >> 4]) crc ^= 0xC001; c <<= 6; crc ^= c; c <<= 1; crc ^= c; } return crc & 0xFFFF; }
  }
  OneWire.tipuri = { reset: 'uint8_t', read: 'uint8_t', read_bit: 'uint8_t', search: 'bool', crc8: 'uint8_t' };
  OneWire.tipuriStatice = { crc8: 'uint8_t', crc16: 'uint16_t' };
  api.clasa('OneWire', OneWire);

  // ---------- UART între placă și module ----------
  M.uart = {
    // leagă un port serial al plăcii de modulul aflat pe pinii lui RX/TX (legați încrucișat)
    leaga(sim, port) {
      port.legatura = null;
      const nRx = sim.netGPIO(port.rx), nTx = sim.netGPIO(port.tx);
      for (const d of sim.disp.values()) {
        if (!d.uart) continue;
        const dTx = sim.netPin(d.inst, d.uart.tx || 'TX'), dRx = sim.netPin(d.inst, d.uart.rx || 'RX');
        const primesteDeLaModul = dTx === nRx && nRx >= 0, trimiteLaModul = dRx === nTx && nTx >= 0;
        if (!primesteDeLaModul && !trimiteLaModul) {
          if ((dTx === nTx && nTx >= 0) || (dRx === nRx && nRx >= 0)) sim.problema('tx-tx-' + d.inst.id, 'eroare', d.inst.eticheta + ': firele seriale sunt legate drept (TX la TX, RX la RX). Se leagă încrucișat: TX-ul modulului la RX-ul plăcii (GPIO' + port.rx + ') și RX-ul modulului la TX-ul plăcii (GPIO' + port.tx + ').', { comp: d.inst.id });
          continue;
        }
        const legatura = {
          dev: d,
          trimite(t, baud) {
            if (!trimiteLaModul) return;
            if (d.uart.baud && baud !== d.uart.baud) t = zgomot(t);
            if (d.uartPrimeste) d.uartPrimeste(t);
          }
        };
        port.legatura = legatura;
        d.uartSpre = (t) => {
          if (!primesteDeLaModul || !port.pornit) return;
          if (d.uart.baud && port.baud !== d.uart.baud) {
            t = zgomot(t);
            sim.problema('baud-' + d.inst.id, 'avertisment', d.inst.eticheta + ' comunică la ' + d.uart.baud + ' baud, dar portul serial al plăcii e pornit la ' + port.baud + '. Datele vin deformate.', { comp: d.inst.id });
          }
          port.primeste(t);
        };
        if (!primesteDeLaModul) sim.problema('uart-rx-' + d.inst.id, 'avertisment', d.inst.eticheta + ': TX-ul modulului nu ajunge la RX-ul plăcii (GPIO' + port.rx + '), deci placa nu primește nimic de la el.', { comp: d.inst.id });
        return legatura;
      }
      return null;
    }
  };
  function zgomot(t) { let r = ''; for (let i = 0; i < t.length; i++) r += String.fromCharCode((t.charCodeAt(i) * 37 + 91) & 255); return r; }

  class SoftwareSerial extends api.clase.HardwareSerial {
    constructor(rx, tx) { super(9); this.rxPin = rx; this.txPin = tx; }
    begin(baud) {
      const sim = S();
      this.pornit = true; this.baud = baud || 9600;
      this.rx = this.rxPin; this.tx = this.txPin;
      if (baud > 57600) sim.problema('softserial-baud', 'avertisment', 'SoftwareSerial la ' + baud + ' baud pierde des caractere; folosește 9600–38400 sau un port hardware (Serial2).', { linie: linie() });
      M.uart.leaga(sim, this);
    }
    listen() { return true; }
    isListening() { return true; }
    overflow() { return false; }
  }
  api.clasa('SoftwareSerial', SoftwareSerial);
  api.clasa('EspSoftwareSerial', SoftwareSerial);
  api.include('Wire.h', 'SPI.h', 'OneWire.h', 'SoftwareSerial.h');
  api.constante.SWSERIAL_8N1 = 0;
})(window.M = window.M || {});
