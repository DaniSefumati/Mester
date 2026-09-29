/* Meșter — Bluetooth clasic: BluetoothSerial (ESP32 are Bluetooth în cip) și legătura cu „telefonul” simulat
   din monitorul serial. Telefonul se poate conecta fie la ESP32 (SerialBT.begin("nume")), fie la un modul HC-05. */
(function (M) {
  'use strict';
  const api = M.api;
  const S = () => M.simCurenta;
  const linie = () => { const s = S(); return s && s.R ? s.R.L : 0; };

  // ---------- telefonul și dispozitivele Bluetooth din simulare ----------
  const BT = {
    stare(sim) { return (sim.__bt = sim.__bt || { puncte: [], conectat: null }); },
    inregistreaza(sim, p) { const st = BT.stare(sim); st.puncte = st.puncte.filter(x => x.id !== p.id || !p.id); st.puncte.push(p); sim.emit('bluetooth-lista', BT.lista(sim)); },
    scoate(sim, p) { const st = BT.stare(sim); st.puncte = st.puncte.filter(x => x !== p); if (st.conectat === p) BT.deconecteaza(sim); sim.emit('bluetooth-lista', BT.lista(sim)); },
    lista(sim) { return BT.stare(sim).puncte.map(p => p.nume()); },
    conectat(sim) { const c = BT.stare(sim).conectat; return c ? c.nume() : null; },
    conecteaza(sim, i) {
      const st = BT.stare(sim);
      const p = st.puncte[i === undefined ? 0 : i];
      if (!p) return false;
      if (st.conectat && st.conectat !== p) BT.deconecteaza(sim);
      st.conectat = p;
      if (p.laConectare) p.laConectare(true);
      if (p.disp) { p.disp.conectat = true; sim.murdarComponenta(p.disp.inst); }
      sim.emit('bluetooth', { text: 'Conectat la ' + p.nume() + '\n', sistem: true });
      return true;
    },
    deconecteaza(sim) {
      const st = BT.stare(sim), p = st.conectat;
      if (!p) return;
      st.conectat = null;
      if (p.laConectare) p.laConectare(false);
      if (p.disp) { p.disp.conectat = false; sim.murdarComponenta(p.disp.inst); }
      sim.emit('bluetooth', { text: 'Deconectat\n', sistem: true });
    },
    // text trimis de pe telefon către dispozitiv
    dinTelefon(sim, text) {
      const st = BT.stare(sim);
      if (!st.conectat && !BT.conecteaza(sim, 0)) return false;
      // la 115200 de baud virtuali ai SPP, textul ajunge în câteva milisecunde
      sim.programeaza(8000, () => { if (st.conectat) st.conectat.dinTelefon(text); });
      return true;
    },
    // text de la dispozitiv către telefon
    laTelefon(sim, text) { sim.emit('bluetooth', { text }); }
  };
  M.bluetooth = BT;

  // ---------- BluetoothSerial ----------
  class BluetoothSerial extends api.clase.Stream {
    constructor() { super(); this.pornit = false; this.nume = 'ESP32'; this.client = false; this.cb = null; this._punct = null; }
    begin(nume, master) {
      const sim = S();
      const cip = sim.cip || {};
      if (cip.cip && cip.cip !== 'ESP32') {
        sim.problema('bt-cip', 'eroare', cip.cip + ' nu are Bluetooth clasic, deci BluetoothSerial nu merge (pe placă nici nu se compilează: „Bluetooth is not enabled”). Folosește BLE (NimBLE) sau un modul HC-05 pe serial.', { linie: linie() });
        return false;
      }
      if (sim.wifiPornit) sim.problema('bt-wifi', 'info', 'Bluetooth și WiFi împart aceeași antenă: merg împreună, dar mai încet, iar memoria liberă scade mult.', { linie: linie() });
      this.nume = nume === undefined ? 'ESP32' : M.ajutoareR.txt(nume);
      this.pornit = true;
      sim.consuma(600000);
      this._punct = { id: 'esp32', tip: 'esp32', nume: () => this.nume, dinTelefon: (t) => { this._in += t; }, laConectare: (da) => { this.client = da; if (this.cb) { try { sim.coadaIsr.push(() => this.cb(da ? 34 : 27, null)); } catch (e) { /* ignorăm */ } } } };
      BT.inregistreaza(sim, this._punct);
      return true;
    }
    end() { const sim = S(); this.pornit = false; if (this._punct) BT.scoate(sim, this._punct); this._punct = null; }
    _scrie(t) {
      if (!this.pornit) { if (!this.avertizat) { this.avertizat = true; S().problema('bt-begin', 'avertisment', 'SerialBT.print() fără SerialBT.begin("nume") în setup().', { linie: linie() }); } return; }
      if (!this.client) return; // nimeni conectat: datele se pierd
      S().consuma(t.length * 10 + 50);
      BT.laTelefon(S(), t);
    }
    hasClient() { return this.client; }
    connected() { return this.client; }
    isReady() { return this.pornit; }
    disconnect() { BT.deconecteaza(S()); return true; }
    register_callback(f) { this.cb = f; return 0; }
    setPin() { return true; }
    enableSSP() { } disableSSP() { }
    getBtAddressString() { return '24:0A:C4:3F:12:6E'; }
    connect() { return false; }
    unpairDevice() { return true; }
  }
  BluetoothSerial.tipuri = Object.assign({}, api.clase.Stream.tipuri, { begin: 'bool', hasClient: 'bool', connected: 'bool', isReady: 'bool', disconnect: 'bool', setPin: 'bool', getBtAddressString: 'String', connect: 'bool', register_callback: 'int' });
  api.clasa('BluetoothSerial', BluetoothSerial);
  Object.assign(api.constante, { ESP_SPP_INIT_EVT: 0, ESP_SPP_SRV_OPEN_EVT: 34, ESP_SPP_CLOSE_EVT: 27, ESP_SPP_DATA_IND_EVT: 30, ESP_SPP_WRITE_EVT: 33 });
  api.tipuriNumerice.esp_spp_cb_event_t = 'int';
  api.include('BluetoothSerial.h');
})(window.M = window.M || {});
