/* Meșter — recepția IR: IRremote (versiunile 3/4: IrReceiver, decodedIRData), API-ul vechi IRrecv /
   decode_results (IRremote 2.x și IRremoteESP8266). Decodarea se face din fronturile reale de pe pin:
   receptorul IR din schemă scoate impulsurile NEC, iar biblioteca le măsoară duratele. */
(function (M) {
  'use strict';
  const api = M.api;
  const S = () => M.simCurenta;
  const linie = () => { const s = S(); return s && s.R ? s.R.L : 0; };

  const PROTOCOALE = ['UNKNOWN', 'PULSE_WIDTH', 'PULSE_DISTANCE', 'APPLE', 'DENON', 'JVC', 'LG', 'LG2', 'NEC', 'NEC2', 'ONKYO', 'PANASONIC', 'KASEIKYO', 'KASEIKYO_DENON', 'KASEIKYO_SHARP', 'KASEIKYO_JVC', 'KASEIKYO_MITSUBISHI', 'RC5', 'RC6', 'SAMSUNG', 'SAMSUNGLG', 'SAMSUNG48', 'SHARP', 'SONY', 'BANG_OLUFSEN', 'BOSEWAVE', 'LEGO_PF', 'MAGIQUEST', 'WHYNTER', 'FAST'];
  const P = {}; PROTOCOALE.forEach((n, i) => { P[n] = i; });
  const FL = { IRDATA_FLAGS_EMPTY: 0, IRDATA_FLAGS_IS_REPEAT: 0x01, IRDATA_FLAGS_IS_AUTO_REPEAT: 0x02, IRDATA_FLAGS_PARITY_FAILED: 0x04, IRDATA_FLAGS_TOGGLE_BIT: 0x08, IRDATA_FLAGS_EXTRA_INFO: 0x10, IRDATA_FLAGS_IS_PROTOCOL_WITH_DIFFERENT_REPEAT: 0x20, IRDATA_FLAGS_WAS_OVERFLOW: 0x40, IRDATA_FLAGS_IS_MSB_FIRST: 0x80, IRDATA_FLAGS_IS_LSB_FIRST: 0 };
  Object.assign(api.constante, P, FL, { ENABLE_LED_FEEDBACK: true, DISABLE_LED_FEEDBACK: false, USE_DEFAULT_FEEDBACK_LED_PIN: 0, kTolerance: 25, kTimeoutMs: 15, kCaptureBufferSize: 1024, REPEAT: 0xFFFFFFFF });
  api.tipuriNumerice.decode_type_t = 'int';
  const aproape = (x, tinta, tol) => Math.abs(x - tinta) <= tinta * (tol || 0.3);
  const inversOctet = (b) => { let r = 0; for (let i = 0; i < 8; i++) r = (r << 1) | ((b >> i) & 1); return r; };

  // decodorul comun: ascultă fronturile de pe pin și recunoaște cadrele NEC
  class DecodorIR {
    constructor() { this.pin = -1; this.fronturi = []; this.gata = null; this.oprit = false; this.ultimCod = null; }
    porneste(pin) {
      const sim = S();
      this.pin = pin; this.sim = sim;
      const net = sim.netGPIO(pin);
      const rec = sim.dispozitive(['ir']);
      if (!rec.some(d => sim.netPin(d.inst, 'OUT') === net && net >= 0)) {
        if (rec.length) {
          const g = sim.gpioLaNet(sim.netPin(rec[0].inst, 'OUT'));
          sim.problema('ir-pin', 'eroare', 'Receptorul IR e ascultat pe GPIO' + pin + ', dar OUT-ul lui ' + rec[0].inst.eticheta + ' e ' + (g.length ? 'pe GPIO' + g[0] : 'nelegat') + '. Pune în cod pinul la care e legat OUT.', { linie: linie(), comp: rec[0].inst.id });
        }
      }
      if (this.ascultaNet === net) return;
      this.ascultaNet = net;
      const st = sim.pin(pin); if (st && st.mod !== 'INPUT_PULLUP') st.mod = 'INPUT';
      let ultim = 1;
      sim.asculta(net, (nivel, t) => {
        if (this.pin < 0) return;
        if (nivel === ultim) return;
        ultim = nivel;
        this.fronturi.push({ t, nivel });
        if (this.fronturi.length > 300) this.fronturi.shift();
        const tk = this.tk = (this.tk || 0) + 1;
        sim.programeaza(12000, () => { if (tk === this.tk) this.incheieCadru(); });
      });
    }
    // după 12 ms de liniște, cadrul e complet
    incheieCadru() {
      const f = this.fronturi; this.fronturi = [];
      if (this.oprit || f.length < 2) return;
      const d = [];
      let i0 = f.findIndex(x => x.nivel === 0);
      if (i0 < 0) return;
      for (let i = i0 + 1; i < f.length; i++) d.push(f[i].t - f[i - 1].t);
      let r = null;
      if (d.length >= 3 && aproape(d[0], 9000, 0.25) && aproape(d[1], 2250, 0.3)) {
        r = this.ultimCod ? Object.assign({}, this.ultimCod, { repetare: true }) : { protocol: P.UNKNOWN, repetare: true, adresa: 0, comanda: 0, biti: 0, brut: 0 };
      } else if (d.length >= 66 && aproape(d[0], 9000, 0.25) && aproape(d[1], 4500, 0.25)) {
        let v = 0;
        for (let b = 0; b < 32; b++) { const pauza = d[3 + b * 2]; if (pauza > 1100) v |= (1 << b); }
        v >>>= 0;
        const a = v & 255, na = (v >>> 8) & 255, c = (v >>> 16) & 255, nc = (v >>> 24) & 255;
        const adresa = (na === ((~a) & 255)) ? a : (a | (na << 8));
        r = { protocol: P.NEC, repetare: false, adresa, comanda: c, biti: 32, brut: v, paritate: nc !== ((~c) & 255) };
        this.ultimCod = r;
      } else {
        let h = 0; for (const x of d) h = (h * 31 + Math.round(x / 50)) >>> 0;
        r = { protocol: P.UNKNOWN, repetare: false, adresa: 0, comanda: 0, biti: 0, brut: h, durate: d };
      }
      r.t = this.sim.timp; r.durate = r.durate || d;
      this.gata = r;
      this.oprit = true; // biblioteca nu mai primește nimic până la resume()
    }
    reia() { this.oprit = false; this.gata = null; }
  }

  // ---------- IRremote 3.x / 4.x ----------
  class IRData {
    constructor() { this.protocol = 0; this.address = 0; this.command = 0; this.extra = 0; this.numberOfBits = 0; this.flags = 0; this.decodedRawData = 0; this.rawDataPtr = null; }
    __copie() { return Object.assign(new IRData(), this); }
  }
  IRData.proprietati = { protocol: 'int', address: 'uint16_t', command: 'uint16_t', extra: 'uint16_t', numberOfBits: 'uint16_t', flags: 'uint8_t', decodedRawData: 'uint32_t' };
  api.clasa('IRData', IRData);
  class IRrecvV4 {
    constructor(pin) { this.dec = new DecodorIR(); this.pinInit = pin === undefined ? -1 : pin; this.decodedIRData = new IRData(); this.pornit = false; }
    begin(pin) { this.pornit = true; this.dec.porneste(pin === undefined ? this.pinInit : pin); }
    enableIRIn() { this.begin(); }
    start() { this.pornit = true; this.dec.reia(); }
    stop() { this.pornit = false; }
    end() { this.stop(); }
    resume() { this.dec.reia(); }
    isIdle() { return !this.dec.fronturi.length; }
    available() { return !!this.dec.gata; }
    // decode(): true când a sosit un cadru; decode(&results) = API-ul vechi
    decode(rez) {
      S().consuma(20);
      if (!this.pornit) { if (!this.avertizat) { this.avertizat = true; S().problema('ir-begin', 'avertisment', 'IrReceiver.decode() fără IrReceiver.begin(PIN) în setup(): receptorul nu ascultă.', { linie: linie() }); } return false; }
      const g = this.dec.gata;
      if (!g) return false;
      const d = this.decodedIRData;
      d.protocol = g.protocol; d.address = g.adresa; d.command = g.comanda; d.numberOfBits = g.repetare ? 0 : g.biti;
      d.flags = g.repetare ? FL.IRDATA_FLAGS_IS_REPEAT : (g.paritate ? FL.IRDATA_FLAGS_PARITY_FAILED : 0);
      d.decodedRawData = g.repetare ? 0 : g.brut >>> 0;
      if (rez && typeof rez === 'object') completeazaVechi(rez, g);
      return true;
    }
    printIRResultShort(ser) {
      const d = this.decodedIRData, s = ser || S().obiecte.Serial;
      let t = 'Protocol=' + PROTOCOALE[d.protocol];
      if (d.protocol === P.UNKNOWN) t += ' Hash=0x' + (this.dec.gata ? this.dec.gata.brut >>> 0 : 0).toString(16).toUpperCase() + ' ' + (this.dec.gata ? this.dec.gata.durate.length + 1 : 0) + ' bits (incl. gap and start) received';
      else {
        t += ' Address=0x' + d.address.toString(16).toUpperCase() + ' Command=0x' + d.command.toString(16).toUpperCase();
        if (d.flags & FL.IRDATA_FLAGS_IS_REPEAT) t += ' Repeat';
        else t += ' Raw-Data=0x' + (d.decodedRawData >>> 0).toString(16).toUpperCase() + ' 32 bits LSB first';
      }
      s._scrie(t + '\r\n');
    }
    printIRResultMinimal(ser) { const d = this.decodedIRData; (ser || S().obiecte.Serial)._scrie('P=' + PROTOCOALE[d.protocol] + ' A=0x' + d.address.toString(16).toUpperCase() + ' C=0x' + d.command.toString(16).toUpperCase() + (d.flags & 1 ? ' R' : '')); }
    printIRSendUsage(ser) { const d = this.decodedIRData; if (d.protocol === P.NEC && !(d.flags & 1)) (ser || S().obiecte.Serial)._scrie('Send with: IrSender.sendNEC(0x' + d.address.toString(16).toUpperCase() + ', 0x' + d.command.toString(16).toUpperCase() + ', <numberOfRepeats>);\r\n'); }
    printIRResultRawFormatted(ser) { const g = this.dec.gata; (ser || S().obiecte.Serial)._scrie('rawData[' + (g ? g.durate.length : 0) + ']: ' + (g ? g.durate.map((x, i) => (i % 2 ? '-' : '+') + Math.round(x)).join(',') : '') + '\r\n'); }
    printActiveIRProtocols(ser) { (ser || S().obiecte.Serial)._scrie('NEC/NEC2/Onkyo/Apple, Panasonic/Kaseikyo, Denon/Sharp, Sony, RC5, RC6, LG, JVC, Samsung, FAST, Whynter, Lego Power Functions, Bosewave , MagiQuest, Universal Pulse Distance Width, Hash '); }
    getProtocolString() { return PROTOCOALE[this.decodedIRData.protocol]; }
  }
  IRrecvV4.tipuri = { decode: 'bool', available: 'bool', isIdle: 'bool', getProtocolString: 'cstr' };
  IRrecvV4.proprietati = { decodedIRData: 'obj:IRData' };
  api.clasa('IRrecv', IRrecvV4);
  api.obiecte.IrReceiver = 'IRrecv';
  api.creatoriObiecte.push(() => ({ IrReceiver: new IRrecvV4() }));
  api.functie('getProtocolString', function getProtocolString(p) { return PROTOCOALE[p] || 'UNKNOWN'; }, 'cstr');

  // ---------- API-ul vechi: decode_results ----------
  class decode_results {
    constructor() { this.decode_type = -1; this.value = 0; this.bits = 0; this.address = 0; this.command = 0; this.repeat = false; this.overflow = false; this.rawlen = 0; this.rawbuf = new Uint16Array(0); }
    __copie() { return Object.assign(new decode_results(), this); }
  }
  decode_results.proprietati = { decode_type: 'int', value: 'uint64_t', bits: 'uint16_t', address: 'uint32_t', command: 'uint32_t', repeat: 'bool', overflow: 'bool', rawlen: 'uint16_t', rawbuf: 'uint16_t[]' };
  api.clasa('decode_results', decode_results);
  function completeazaVechi(r, g) {
    r.decode_type = g.protocol;
    r.repeat = !!g.repetare;
    if (g.repetare) { r.value = 0xFFFFFFFF; r.bits = 0; }
    else if (g.protocol === P.NEC) {
      // valoarea „ca pe fir”, cel mai semnificativ bit primul: 0x00FFA25D pentru tasta 1
      const b = [g.brut & 255, (g.brut >>> 8) & 255, (g.brut >>> 16) & 255, (g.brut >>> 24) & 255].map(inversOctet);
      r.value = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
      r.bits = 32; r.address = g.adresa; r.command = g.comanda;
    } else { r.value = g.brut >>> 0; r.bits = g.durate.length >> 1; }
    r.rawlen = g.durate.length + 1;
    r.rawbuf = Uint16Array.from([0].concat(g.durate.map(x => Math.round(x / 2))));
  }
  api.functie('serialPrintUint64', function serialPrintUint64(v, baza) {
    const s = S().obiecte.Serial;
    const n = typeof v === 'bigint' ? v : BigInt(Math.floor(+v || 0));
    s._scrie(n.toString(baza === 16 || baza === undefined ? 16 : baza === 2 ? 2 : baza === 8 ? 8 : 10).toUpperCase());
  }, 'void');
  api.functie('uint64ToString', function uint64ToString(v, baza) { const n = typeof v === 'bigint' ? v : BigInt(Math.floor(+v || 0)); return n.toString(baza || 10).toUpperCase(); }, 'String');
  api.functie('typeToString', function typeToString(t) { return t === P.NEC ? 'NEC' : (PROTOCOALE[t] || 'UNKNOWN'); }, 'String');
  api.functie('resultToHumanReadableBasic', function resultToHumanReadableBasic(r) {
    const v = typeof r.value === 'bigint' ? r.value : BigInt(Math.floor(+r.value || 0));
    return 'Protocol  : ' + (PROTOCOALE[r.decode_type] || 'UNKNOWN') + (r.repeat ? ' (Repeat)' : '') + '\nCode      : 0x' + v.toString(16).toUpperCase() + ' (' + r.bits + ' Bits)\n';
  }, 'String');
  api.functie('resultToSourceCode', function resultToSourceCode(r) { return 'uint16_t rawData[' + Math.max(0, r.rawlen - 1) + '] = {' + Array.from(r.rawbuf).slice(1).map(x => x * 2).join(', ') + '};\n'; }, 'String');
  api.include('IRremote.h', 'IRremote.hpp', 'IRrecv.h', 'IRutils.h', 'IRremoteESP8266.h', 'IRac.h', 'IRtext.h');
})(window.M = window.M || {});
