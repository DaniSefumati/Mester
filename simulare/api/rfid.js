/* Meșter — biblioteca MFRC522 (miguelbalboa) pentru cititorul RFID RC522.
   Cititorul se găsește după firele SPI reale (SS/SDA, SCK, MOSI, MISO) și alimentare; cardurile se comportă ca
   MIFARE Classic 1K: REQA / SELECT / HALT, autentificare cu cheia A sau B pe sector, citire și scriere de blocuri. */
(function (M) {
  'use strict';
  const api = M.api;
  const S = () => M.simCurenta;
  const linie = () => { const s = S(); return s && s.R ? s.R.L : 0; };
  const hex2 = (b) => (b & 255).toString(16).toUpperCase().padStart(2, '0');

  const ST = { STATUS_OK: 0, STATUS_ERROR: 1, STATUS_COLLISION: 2, STATUS_TIMEOUT: 3, STATUS_NO_ROOM: 4, STATUS_INTERNAL_ERROR: 5, STATUS_INVALID: 6, STATUS_CRC_WRONG: 7, STATUS_MIFARE_NACK: 0xFF };
  const TIP = { PICC_TYPE_UNKNOWN: 0, PICC_TYPE_ISO_14443_4: 1, PICC_TYPE_ISO_18092: 2, PICC_TYPE_MIFARE_MINI: 3, PICC_TYPE_MIFARE_1K: 4, PICC_TYPE_MIFARE_4K: 5, PICC_TYPE_MIFARE_UL: 6, PICC_TYPE_MIFARE_PLUS: 7, PICC_TYPE_MIFARE_DESFIRE: 8, PICC_TYPE_TNP3XXX: 9, PICC_TYPE_NOT_COMPLETE: 0xFF };
  const CMD = { PICC_CMD_REQA: 0x26, PICC_CMD_WUPA: 0x52, PICC_CMD_CT: 0x88, PICC_CMD_SEL_CL1: 0x93, PICC_CMD_SEL_CL2: 0x95, PICC_CMD_SEL_CL3: 0x97, PICC_CMD_HLTA: 0x50, PICC_CMD_RATS: 0xE0, PICC_CMD_MF_AUTH_KEY_A: 0x60, PICC_CMD_MF_AUTH_KEY_B: 0x61, PICC_CMD_MF_READ: 0x30, PICC_CMD_MF_WRITE: 0xA0, PICC_CMD_MF_DECREMENT: 0xC0, PICC_CMD_MF_INCREMENT: 0xC1, PICC_CMD_MF_RESTORE: 0xC2, PICC_CMD_MF_TRANSFER: 0xB0, PICC_CMD_UL_WRITE: 0xA2 };
  const REG = { VersionReg: 0x37, CommandReg: 0x01, ComIrqReg: 0x04, ErrorReg: 0x06, Status2Reg: 0x08, FIFODataReg: 0x09, TxControlReg: 0x14, RFCfgReg: 0x26 };
  const NUME_TIP = ['PICC compliant with ISO/IEC 14443-4', 'PICC compliant with ISO/IEC 18092 (NFC)', 'MIFARE Mini, 320 bytes', 'MIFARE 1KB', 'MIFARE 4KB', 'MIFARE Ultralight or Ultralight C', 'MIFARE Plus', 'MIFARE DESFire', 'MIFARE TNP3XXX'];
  const NUME_STATUS = { 0: 'Success.', 1: 'Error in communication.', 2: 'Collission detected.', 3: 'Timeout in communication.', 4: 'A buffer is not big enough.', 5: 'Internal error in the code. Should not happen.', 6: 'Invalid argument.', 7: 'The CRC_A does not match.', 255: 'A MIFARE PICC responded with NAK.' };

  class Uid {
    constructor() { this.size = 0; this.uidByte = new Uint8Array(10); this.sak = 0; }
    __copie() { const u = new Uid(); u.size = this.size; u.uidByte = this.uidByte.slice(); u.sak = this.sak; return u; }
  }
  Uid.proprietati = { size: 'uint8_t', uidByte: 'uint8_t[]', sak: 'uint8_t' };
  api.clasa('Uid', Uid);
  class MIFARE_Key {
    constructor() { this.keyByte = new Uint8Array(6); }
    __copie() { const k = new MIFARE_Key(); k.keyByte = this.keyByte.slice(); return k; }
  }
  MIFARE_Key.proprietati = { keyByte: 'uint8_t[]' };
  api.clasa('MIFARE_Key', MIFARE_Key);
  Object.assign(api.tipuriNumerice, { StatusCode: 'uint8_t', PICC_Type: 'uint8_t', PICC_Command: 'uint8_t', PCD_Register: 'uint8_t', PCD_RxGain: 'uint8_t' });

  class MFRC522 {
    constructor(a, b) {
      // MFRC522(SS, RST) sau MFRC522(RST) (SS implicit) sau MFRC522()
      if (b === undefined && a !== undefined) { this.rstPin = a; this.ssPin = null; } else { this.ssPin = a === undefined ? null : a; this.rstPin = b === undefined ? -1 : b; }
      this.uid = new Uid();
      this.dev = null; this.ok = false; this.aut = null;
    }
    _sim() { return S(); }
    // găsește cititorul după fire; explică ce lipsește
    PCD_Init(a, b) {
      const sim = S();
      if (a !== undefined) { if (b !== undefined) { this.ssPin = a; this.rstPin = b; } else this.rstPin = a; }
      const cip = sim.cip;
      if (this.ssPin === null) this.ssPin = cip.spi.ss;
      if (this.rstPin >= 0) { const st = sim.pin(this.rstPin); if (st) { st.mod = 'OUTPUT'; st.nivel = 1; sim.semnal(sim.netGPIO(this.rstPin)); } }
      sim.consuma(60000);
      this.ok = false; this.dev = null;
      const spi = sim.obiecte.SPI;
      const toate = sim.dispozitive(['rfid']);
      const nSs = sim.netGPIO(this.ssPin);
      const dev = toate.find(d => sim.netPin(d.inst, 'SDA') === nSs && nSs >= 0);
      if (!dev) {
        if (toate.length) {
          const d = toate[0], g = sim.gpioLaNet(sim.netPin(d.inst, 'SDA'));
          sim.problema('rfid-ss', 'eroare', 'MFRC522 folosește SS (SDA) pe GPIO' + this.ssPin + ', dar ' + d.inst.eticheta + ' are SDA ' + (g.length ? 'pe GPIO' + g[0] : 'nelegat') + '. Primul argument din MFRC522(SS, RST) trebuie să fie pinul legat la SDA.', { linie: linie(), comp: d.inst.id });
        }
        return;
      }
      this.dev = dev;
      if (!spi || !spi.pornit) {
        sim.problema('rfid-spi', 'eroare', 'Lipsește SPI.begin() înainte de PCD_Init(): fără el magistrala SPI nu merge și cititorul nu răspunde (Firmware Version: 0x0).', { linie: linie(), comp: dev.inst.id });
        return;
      }
      const lipsa = [];
      for (const [pin, g] of [['SCK', spi.sck], ['MOSI', spi.mosi], ['MISO', spi.miso]]) {
        if (sim.netPin(dev.inst, pin) !== sim.netGPIO(g)) { const x = sim.gpioLaNet(sim.netPin(dev.inst, pin)); lipsa.push(pin + ' e ' + (x.length ? 'pe GPIO' + x[0] : 'nelegat') + ' (SPI îl așteaptă pe GPIO' + g + ')'); }
      }
      if (lipsa.length) {
        sim.problema('rfid-fire', 'eroare', dev.inst.eticheta + ': ' + lipsa.join('; ') + '. Pe ESP32, SPI-ul implicit (VSPI) are SCK = GPIO18, MISO = GPIO19, MOSI = GPIO23; altfel scrie SPI.begin(SCK, MISO, MOSI, SS).', { linie: linie(), comp: dev.inst.id });
        return;
      }
      const v = sim.alimentare(dev.inst, '3V3', 'GND').v;
      if (v > 3.9) { dev.ars = true; sim.problema('rfid-5v', 'eroare', dev.inst.eticheta + ' primește ' + M.fmtV(v) + ' pe 3.3V: RC522 merge doar la 3,3 V; la 5 V se strică.', { comp: dev.inst.id }); }
      if (dev.ars || v < 2.4) return;
      if (this.rstPin >= 0 && sim.netPin(dev.inst, 'RST') !== sim.netGPIO(this.rstPin)) {
        const x = sim.gpioLaNet(sim.netPin(dev.inst, 'RST'));
        if (x.length) sim.problema('rfid-rst', 'avertisment', 'MFRC522: RST e declarat pe GPIO' + this.rstPin + ', dar pe schemă e legat la GPIO' + x[0] + '.', { linie: linie(), comp: dev.inst.id });
      }
      this.ok = true;
      dev.urmareste();
    }
    _merge() { return this.ok && this.dev && !this.dev.ars && this.dev.alimentat(); }
    PCD_Reset() { S().consuma(50000); }
    PCD_AntennaOn() { } PCD_AntennaOff() { } PCD_SetAntennaGain() { } PCD_GetAntennaGain() { return 0x40; }
    PCD_SoftPowerDown() { } PCD_SoftPowerUp() { }
    PCD_ReadRegister(r) { S().consuma(10); if (r === REG.VersionReg) return this._merge() ? 0x92 : 0x00; return 0; }
    PCD_WriteRegister() { S().consuma(10); }
    PCD_PerformSelfTest() { S().consuma(40000); return this._merge(); }
    PCD_DumpVersionToSerial() {
      const v = this.PCD_ReadRegister(REG.VersionReg);
      const ser = S().obiecte.Serial;
      let t = 'Firmware Version: 0x' + v.toString(16).toUpperCase();
      t += v === 0x88 ? ' = (clone)' : v === 0x90 ? ' = v0.0' : v === 0x91 ? ' = v1.0' : v === 0x92 ? ' = v2.0' : v === 0x12 ? ' = counterfeit chip' : ' = (unknown)';
      ser._scrie(t + '\r\n');
      if (v === 0 || v === 0xFF) ser._scrie('WARNING: Communication failure, is the MFRC522 properly connected?\r\n');
    }
    // REQA: doar cardurile în starea IDLE răspund (cele oprite cu HaltA așteaptă să plece din câmp)
    PICC_IsNewCardPresent() {
      const sim = S();
      sim.consuma(1500);
      if (!this._merge()) return false;
      this.dev.urmareste();
      if (this.dev.stareCard === 'idle') { this.dev.stareCard = 'ready'; return true; }
      if (this.dev.stareCard === 'active' || this.dev.stareCard === 'ready') { this.dev.stareCard = 'idle'; return false; } // fără HALT, cardul e resetat și răspunde abia la următoarea cerere
      return false;
    }
    PICC_ReadCardSerial() {
      S().consuma(4000);
      if (!this._merge()) return false;
      const c = this.dev.cardCurent();
      if (!c || this.dev.stareCard !== 'ready') return false;
      this.uid.size = c.uid.length;
      this.uid.uidByte.fill(0);
      c.uid.forEach((b, i) => { this.uid.uidByte[i] = b; });
      this.uid.sak = c.sak;
      this.dev.stareCard = 'active';
      return true;
    }
    PICC_HaltA() { S().consuma(1200); if (this.dev && this.dev.stareCard !== 'departe') this.dev.stareCard = 'halt'; this.aut = null; return ST.STATUS_OK; }
    PCD_StopCrypto1() { this.aut = null; }
    PICC_WakeupA() { if (this.dev && this.dev.stareCard === 'halt') this.dev.stareCard = 'ready'; return this.dev && this.dev.stareCard === 'ready' ? ST.STATUS_OK : ST.STATUS_TIMEOUT; }
    PICC_RequestA() { return this.PICC_IsNewCardPresent() ? ST.STATUS_OK : ST.STATUS_TIMEOUT; }
    PICC_Select(uid) {
      const ok = this.PICC_ReadCardSerial();
      if (ok && uid && uid !== this.uid) { uid.size = this.uid.size; uid.uidByte = this.uid.uidByte.slice(); uid.sak = this.uid.sak; }
      return ok ? ST.STATUS_OK : ST.STATUS_TIMEOUT;
    }
    PICC_GetType(sak) {
      sak &= 0x7F;
      switch (sak) { case 0x04: return TIP.PICC_TYPE_NOT_COMPLETE; case 0x09: return TIP.PICC_TYPE_MIFARE_MINI; case 0x08: return TIP.PICC_TYPE_MIFARE_1K; case 0x18: return TIP.PICC_TYPE_MIFARE_4K; case 0x00: return TIP.PICC_TYPE_MIFARE_UL; case 0x10: case 0x11: return TIP.PICC_TYPE_MIFARE_PLUS; case 0x01: return TIP.PICC_TYPE_TNP3XXX; case 0x20: return TIP.PICC_TYPE_ISO_14443_4; case 0x40: return TIP.PICC_TYPE_ISO_18092; default: return TIP.PICC_TYPE_UNKNOWN; }
    }
    PICC_GetTypeName(t) { if (t === TIP.PICC_TYPE_NOT_COMPLETE) return 'SAK indicates UID is not complete.'; return t >= 1 && t <= 9 ? NUME_TIP[t - 1] : 'Unknown type'; }
    GetStatusCodeName(c) { return NUME_STATUS[c & 255] || 'Unknown error'; }
    // cardul activ, dacă e încă lângă antenă
    _card() { if (!this._merge()) return null; this.dev.urmareste(); return this.dev.stareCard === 'active' ? this.dev.cardCurent() : null; }
    PCD_Authenticate(cmd, bloc, cheie, uid) {
      S().consuma(4000);
      const c = this._card();
      if (!c) return ST.STATUS_TIMEOUT;
      if (bloc < 0 || bloc > 63) return ST.STATUS_INVALID;
      const tr = c.blocuri[(bloc >> 2) * 4 + 3];
      const k = cheie && cheie.keyByte ? Array.from(cheie.keyByte) : [];
      const asteptat = cmd === CMD.PICC_CMD_MF_AUTH_KEY_B ? tr.slice(10, 16) : tr.slice(0, 6);
      if (k.length !== 6 || k.some((b, i) => b !== asteptat[i])) {
        this.dev.stareCard = 'idle'; this.aut = null;
        return ST.STATUS_TIMEOUT;
      }
      this.aut = { sector: bloc >> 2 };
      return ST.STATUS_OK;
    }
    MIFARE_Read(bloc, buf, marime) {
      S().consuma(3000);
      const n = marime && typeof marime === 'object' ? marime.v : 18;
      if (!buf || n < 18) return ST.STATUS_NO_ROOM;
      const c = this._card();
      if (!c) return ST.STATUS_TIMEOUT;
      if (!this.aut || this.aut.sector !== (bloc >> 2)) return ST.STATUS_MIFARE_NACK;
      const d = c.blocuri[bloc].slice();
      if ((bloc & 3) === 3) for (let i = 0; i < 6; i++) d[i] = 0; // cheia A nu se poate citi
      for (let i = 0; i < 16; i++) buf[i] = d[i];
      buf[16] = 0x12; buf[17] = 0x34;
      if (marime && typeof marime === 'object') marime.v = 18;
      return ST.STATUS_OK;
    }
    MIFARE_Write(bloc, buf, n) {
      S().consuma(8000);
      if (!buf || n < 16) return ST.STATUS_INVALID;
      const c = this._card();
      if (!c) return ST.STATUS_TIMEOUT;
      if (!this.aut || this.aut.sector !== (bloc >> 2) || bloc === 0) return ST.STATUS_MIFARE_NACK;
      for (let i = 0; i < 16; i++) c.blocuri[bloc][i] = buf[i] & 255;
      S().emit('memorie');
      return ST.STATUS_OK;
    }
    MIFARE_Ultralight_Write() { return ST.STATUS_MIFARE_NACK; }
    PICC_DumpToSerial(uid) {
      this.PICC_DumpDetailsToSerial(uid || this.uid);
      const ser = S().obiecte.Serial;
      const c = this._card();
      if (!c) { ser._scrie('Dumping memory contents not implemented for that PICC type.\r\n'); return; }
      ser._scrie('Sector Block   0  1  2  3   4  5  6  7   8  9 10 11  12 13 14 15  AccessBits\r\n');
      const cheie = new MIFARE_Key(); cheie.keyByte.fill(0xFF);
      for (let s = 15; s >= 0; s--) {
        const st = this.PCD_Authenticate(CMD.PICC_CMD_MF_AUTH_KEY_A, s * 4 + 3, cheie, this.uid);
        for (let b = 3; b >= 0; b--) {
          const nr = s * 4 + b;
          let r = (b === 3 ? String(s).padStart(3, ' ') + '   ' : '      ') + String(nr).padStart(3, ' ') + '  ';
          if (st !== ST.STATUS_OK) { ser._scrie(r + 'PCD_Authenticate() failed: ' + this.GetStatusCodeName(st) + '\r\n'); break; }
          const d = c.blocuri[nr].slice(); if (b === 3) for (let i = 0; i < 6; i++) d[i] = 0;
          r += d.map((x, i) => (i && i % 4 === 0 ? ' ' : '') + ' ' + hex2(x)).join('');
          r += b === 3 ? '  [ 0 0 1 ]' : '  [ 0 0 0 ]';
          ser._scrie(r + '\r\n');
        }
      }
      this.PICC_HaltA();
    }
    PICC_DumpDetailsToSerial(uid) {
      const ser = S().obiecte.Serial;
      const u = uid || this.uid;
      let t = 'Card UID:';
      for (let i = 0; i < u.size; i++) t += (u.uidByte[i] < 0x10 ? ' 0' : ' ') + u.uidByte[i].toString(16).toUpperCase();
      ser._scrie(t + '\r\nCard SAK: ' + (u.sak < 0x10 ? '0' : '') + u.sak.toString(16).toUpperCase() + '\r\nPICC type: ' + this.PICC_GetTypeName(this.PICC_GetType(u.sak)) + '\r\n');
    }
    PICC_DumpMifareClassicToSerial(uid, tip, cheie) { this.PICC_DumpToSerial(uid); }
    PCD_CalculateCRC() { return ST.STATUS_OK; }
  }
  MFRC522.tipuri = { PCD_ReadRegister: 'uint8_t', PCD_PerformSelfTest: 'bool', PICC_IsNewCardPresent: 'bool', PICC_ReadCardSerial: 'bool', PICC_GetType: 'uint8_t', PICC_GetTypeName: 'cstr', GetStatusCodeName: 'cstr', PCD_Authenticate: 'uint8_t', MIFARE_Read: 'uint8_t', MIFARE_Write: 'uint8_t', PICC_HaltA: 'uint8_t', PICC_WakeupA: 'uint8_t', PICC_RequestA: 'uint8_t', PICC_Select: 'uint8_t', PCD_GetAntennaGain: 'uint8_t' };
  MFRC522.proprietati = { uid: 'obj:Uid' };
  MFRC522.constanteStatice = Object.assign({}, ST, TIP, CMD, REG, { RxGain_18dB: 0x00, RxGain_23dB: 0x10, RxGain_33dB: 0x40, RxGain_38dB: 0x50, RxGain_43dB: 0x60, RxGain_48dB: 0x70, RxGain_max: 0x70, RxGain_min: 0x00, RxGain_avg: 0x40 });
  api.clasa('MFRC522', MFRC522);
  api.include('MFRC522.h', 'MFRC522v2.h', 'MFRC522Extended.h');
})(window.M = window.M || {});
