/* Meșter — rețeaua: WiFi (stație și punct de acces), servere web (WebServer, WiFiServer „brut”,
   ESPAsyncWebServer cu WebSocket și Server-Sent Events), clientul HTTP (cereri reale din browser, prin fetch),
   mDNS, NTPClient și WiFiUDP.
   Placa „se conectează” la rețeaua din cod după 1–2,5 s, primește o adresă IP, iar pagina „Web” din aplicație
   e calculatorul din aceeași rețea: cere pagini de la serverul plăcii și le afișează. */
(function (M) {
  'use strict';
  const api = M.api;
  const S = () => M.simCurenta;
  const f = api.functii;
  const txt = M.ajutoareR.txt;
  const octeti = (s) => { try { return unescape(encodeURIComponent(s)); } catch (e) { return s; } };
  const linie = () => { const s = S(); return s && s.R ? s.R.L : 0; };
  const logE = (fis, t) => { const s = S().obiecte.Serial; if (s && s.pornit) s._scrie('[' + String(Math.floor(S().timp / 1000)).padStart(6, ' ') + '][E][' + fis + '] ' + t + '\r\n'); };

  // rulează pe loc o funcție a utilizatorului (handler, callback) și întoarce ce returnează
  function ruleazaSincron(fn, args, context) {
    const sim = S();
    if (typeof fn !== 'function') return undefined;
    const r = fn(...(args || []));
    if (!r || typeof r.next !== 'function') return r;
    let x = r.next(), n = 0;
    while (!x.done && n++ < 200000) {
      if (x.value && x.value.dorm > 0) {
        sim.consuma(x.value.dorm);
        if (context) sim.problema('async-delay', 'avertisment', 'delay() în ' + context + ' blochează serverul web asincron (și poate declanșa watchdog-ul). Setează doar o variabilă aici și fă treaba lungă în loop().', { linie: linie() });
      }
      x = r.next();
    }
    return x.value;
  }

  // ---------- IPAddress ----------
  class IPAddress {
    constructor(a, b, c, d) {
      if (a instanceof IPAddress) this.o = a.o.slice();
      else if (typeof a === 'string' || a instanceof Uint8Array) { this.o = [0, 0, 0, 0]; this.fromString(a); }
      else if (b !== undefined) this.o = [a & 255, b & 255, c & 255, d & 255];
      else { const v = (a >>> 0) || 0; this.o = [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
    }
    get 0() { return this.o[0]; } get 1() { return this.o[1]; } get 2() { return this.o[2]; } get 3() { return this.o[3]; }
    toString() { return this.o.join('.'); }
    fromString(s) { const p = txt(s).trim().split('.').map(x => x === '' ? NaN : Number(x)); if (p.length !== 4 || p.some(x => !(x >= 0 && x <= 255) || !Number.isInteger(x))) return false; this.o = p; return true; }
    valueOf() { return (this.o[0] | (this.o[1] << 8) | (this.o[2] << 16) | (this.o[3] << 24)) >>> 0; }
    egal(x) { return x instanceof IPAddress ? x.o.join() === this.o.join() : this.valueOf() === (x >>> 0); }
    __copie() { return new IPAddress(this); }
    __bool() { return this.valueOf() !== 0; }
  }
  IPAddress.tipuri = { toString: 'String', fromString: 'bool' };
  api.clasa('IPAddress', IPAddress);
  const ip = (s) => new IPAddress(s);

  // ---------- starea rețelei în simulare ----------
  const VECINI = [
    { ssid: 'DIGI-24-7A31', rssi: -71, canal: 1, criptare: 3 }, { ssid: 'TP-Link_5C2E', rssi: -78, canal: 6, criptare: 3 },
    { ssid: 'Vodafone-8C2F', rssi: -84, canal: 11, criptare: 4 }, { ssid: 'HUAWEI-B535-2F1A', rssi: -88, canal: 6, criptare: 3 }, { ssid: 'Mester-Oaspeti', rssi: -60, canal: 11, criptare: 0 }
  ];
  const NET = {
    stare(sim) {
      if (!sim.__net) {
        let h = 7; for (const c of (sim.proiect.id || 'x')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
        sim.__net = {
          mod: 0, stare: 255, ssid: '', parola: '', ip: '192.168.1.' + (100 + h % 120), masca: '255.255.255.0', gw: '192.168.1.1', dns: '192.168.1.1', staticIp: false,
          ap: null, servere: new Map(), mdns: '', nume: 'esp32-' + (h & 0xFFFFFF).toString(16).toUpperCase().padStart(6, '0'), evenimente: [], scanare: null, token: 0, reconectare: true,
          mac: '24:0A:C4:' + [(h >> 16) & 255, (h >> 8) & 255, h & 255].map(x => x.toString(16).toUpperCase().padStart(2, '0')).join(':'), rssi: -52
        };
      }
      return sim.__net;
    },
    conectat(sim) { const n = NET.stare(sim); return n.stare === 3; },
    emite(sim, ev, info) {
      const n = NET.stare(sim);
      const inf = new WiFiEventInfo_t();
      if (info && info.ip) inf.got_ip.ip_info.ip.addr = ip(info.ip).valueOf();
      if (info && info.reason !== undefined) inf.wifi_sta_disconnected.reason = info.reason;
      for (const e of n.evenimente.slice()) if (e.ev === undefined || e.ev === ev || e.ev === -1) ruleazaSincron(e.cb, [ev, inf], null);
    },
    // încercarea de conectare la router (după WiFi.begin sau la reconectare)
    incearca(sim, tk, durata) {
      const n = NET.stare(sim);
      sim.programeaza(durata * 0.6, () => { if (tk === n.token && !n.routerOprit) NET.emite(sim, EV.ARDUINO_EVENT_WIFI_STA_CONNECTED, {}); }, 'mcu');
      sim.programeaza(durata, () => {
        if (tk !== n.token) return;
        if (n.routerOprit) {
          // rețeaua nu se vede: WL_NO_SSID_AVAIL, iar biblioteca reîncearcă singură
          n.stare = 1;
          NET.emite(sim, EV.ARDUINO_EVENT_WIFI_STA_DISCONNECTED, { reason: 201 });
          if (n.reconectare) NET.incearca(sim, tk, 3000000);
          return;
        }
        n.stare = 3; sim.wifiConectat = true; n.rssi = -48 - Math.floor(Math.random() * 10); n.tConectat = sim.timp;
        const mem = sim.proiect.memorie = sim.proiect.memorie || {};
        mem.wifi = { ssid: n.ssid, parola: n.parola };
        sim.emit('retea', { tip: 'conectat', ip: n.ip });
        NET.emite(sim, EV.ARDUINO_EVENT_WIFI_STA_GOT_IP, { ip: n.ip });
      }, 'mcu');
    },
    // butonul „Router” din pagina Web: oprește / pornește rețeaua la care e legată placa
    router(sim, pornit) {
      const n = NET.stare(sim);
      n.routerOprit = !pornit;
      if (!pornit && n.stare === 3) {
        n.stare = 5; sim.wifiConectat = false;
        const tk = ++n.token;
        sim.emit('retea', { tip: 'deconectat' });
        NET.emite(sim, EV.ARDUINO_EVENT_WIFI_STA_DISCONNECTED, { reason: 200 });
        if (n.reconectare) NET.incearca(sim, tk, 3000000);
      }
      sim.emit('retea', { tip: 'router', pornit: !!pornit });
    },
    adrese(sim) {
      const n = NET.stare(sim), r = [];
      if (n.stare === 3) r.push(n.ip);
      if (n.ap) r.push(n.ap.ip);
      return r;
    }
  };
  // rezumatul pentru pagina Web: modul, rețeaua, adresele
  function rezumat(sim) {
    const n = NET.stare(sim);
    return { mod: n.mod, stare: n.stare, ssid: n.ssid, ip: n.stare === 3 ? n.ip : '', ap: n.ap ? { ssid: n.ap.ssid, ip: n.ap.ip } : null, mdns: n.mdns, servere: [...n.servere.keys()], routerOprit: !!n.routerOprit, rssi: n.stare === 3 ? n.rssi : 0 };
  }
  M.web = { rezumat, octeti, stare: NET.stare, adrese: NET.adrese, router: (sim, pornit) => NET.router(sim, pornit), routerPornit: (sim) => !NET.stare(sim).routerOprit };

  // ---------- WiFi ----------
  const WL = { WL_NO_SHIELD: 255, WL_STOPPED: 254, WL_IDLE_STATUS: 0, WL_NO_SSID_AVAIL: 1, WL_SCAN_COMPLETED: 2, WL_CONNECTED: 3, WL_CONNECT_FAILED: 4, WL_CONNECTION_LOST: 5, WL_DISCONNECTED: 6 };
  const EV = {
    ARDUINO_EVENT_WIFI_READY: 10, ARDUINO_EVENT_WIFI_SCAN_DONE: 11, ARDUINO_EVENT_WIFI_STA_START: 12, ARDUINO_EVENT_WIFI_STA_STOP: 13, ARDUINO_EVENT_WIFI_STA_CONNECTED: 14,
    ARDUINO_EVENT_WIFI_STA_DISCONNECTED: 15, ARDUINO_EVENT_WIFI_STA_GOT_IP: 17, ARDUINO_EVENT_WIFI_STA_LOST_IP: 19, ARDUINO_EVENT_WIFI_AP_START: 22, ARDUINO_EVENT_WIFI_AP_STOP: 23,
    ARDUINO_EVENT_WIFI_AP_STACONNECTED: 24, ARDUINO_EVENT_WIFI_AP_STADISCONNECTED: 25, ARDUINO_EVENT_WIFI_AP_STAIPASSIGNED: 26,
    SYSTEM_EVENT_STA_GOT_IP: 17, SYSTEM_EVENT_STA_DISCONNECTED: 15, SYSTEM_EVENT_STA_CONNECTED: 14, ARDUINO_EVENT_MAX: 99
  };
  class WiFiClass {
    _n() { return NET.stare(S()); }
    _verificaCip() {
      const sim = S();
      if (sim.cip && sim.cip.platforma === 'avr') { sim.problema('wifi-nano', 'eroare', 'Arduino Nano nu are WiFi. Folosește un ESP32 sau un ESP8266.', { linie: linie() }); return false; }
      return true;
    }
    mode(m) {
      if (!this._verificaCip()) return false;
      const sim = S(), n = this._n();
      n.mod = m | 0;
      sim.wifiPornit = n.mod !== 0;
      if (n.mod === 0) { this.disconnect(); if (n.ap) this.softAPdisconnect(); }
      else if (n.stare === 255) n.stare = 0;
      sim.consuma(80000);
      return true;
    }
    getMode() { return this._n().mod; }
    persistent() { } setAutoConnect() { return true; }
    setAutoReconnect(b) { this._n().reconectare = !!b; return true; }
    getAutoReconnect() { return this._n().reconectare; }
    setHostname(h) { const n = this._n(); if (n.stare === 3) S().problema('wifi-hostname', 'info', 'WiFi.setHostname() are efect doar dacă e apelat înainte de WiFi.begin().', { linie: linie() }); else n.nume = txt(h); return true; }
    getHostname() { return this._n().nume; }
    setSleep() { return true; } getSleep() { return true; } setTxPower() { return true; } getTxPower() { return 78; }
    config(ipLocal, gw, masca, dns1) {
      const n = this._n();
      if (ipLocal && ipLocal.valueOf && ipLocal.valueOf() !== 0) { n.ip = String(ipLocal); n.staticIp = true; }
      if (gw) n.gw = String(gw); if (masca) n.masca = String(masca); if (dns1) n.dns = String(dns1);
      return true;
    }
    begin(ssid, parola) {
      if (!this._verificaCip()) return 4;
      const sim = S(), n = this._n();
      let s = ssid === undefined ? null : txt(ssid), p = parola === undefined || parola === null ? '' : txt(parola);
      const mem = sim.proiect.memorie = sim.proiect.memorie || {};
      if (s === null) {
        // begin() fără argumente: datele salvate în NVS de la conectarea precedentă
        if (!mem.wifi) { logE('WiFiSTA.cpp:224', 'begin(): connect failed! 0x300a'); sim.problema('wifi-fara-date', 'avertisment', 'WiFi.begin() fără nume de rețea folosește datele salvate de la o conectare anterioară, dar placa nu are încă niciuna. Scrie WiFi.begin("nume", "parolă").', { linie: linie() }); n.stare = 4; return 4; }
        s = mem.wifi.ssid; p = mem.wifi.parola;
      }
      if (!s.length || s.length > 32) { logE('STA.cpp:337', 'connect(): SSID too long or missing!'); n.stare = 4; return 4; }
      if (p.length && p.length < 8) { logE('STA.cpp:344', 'connect(): passphrase too short!'); sim.problema('wifi-parola', 'eroare', 'Parola WiFi „' + p + '” are doar ' + p.length + ' caractere: WPA2 cere cel puțin 8, așa că WiFi.begin() eșuează.', { linie: linie() }); n.stare = 4; return 4; }
      if (p.length > 63) { logE('STA.cpp:348', 'connect(): passphrase too long!'); n.stare = 4; return 4; }
      if (!(n.mod & 1)) n.mod |= 1;
      sim.wifiPornit = true;
      if (n.stare === 3 && n.ssid === s && n.parola === p) return 3;
      n.ssid = s; n.parola = p;
      n.stare = 6; sim.wifiConectat = false;
      const tk = ++n.token;
      sim.consuma(12000);
      NET.incearca(sim, tk, 1100000 + Math.floor(Math.random() * 1400000));
      return 6;
    }
    status() { S().consuma(2); return this._n().stare === 255 ? 255 : this._n().stare; }
    isConnected() { return this._n().stare === 3; }
    *waitForConnectResult(timeout) {
      const n = this._n(), sim = S();
      const lim = sim.timp + (timeout === undefined ? 60000 : timeout) * 1000;
      yield { asteapta: () => (n.stare === 3 || n.stare === 1 || n.stare === 4) ? true : undefined, pana: lim, laExpirare: false, pas: 5000 };
      return n.stare === 6 || n.stare === 0 ? 255 : n.stare;
    }
    disconnect(oprit) {
      const sim = S(), n = this._n();
      n.token++;
      const era = n.stare === 3;
      n.stare = 6; sim.wifiConectat = false;
      if (oprit) { n.mod &= ~1; sim.wifiPornit = n.mod !== 0; }
      if (era) { sim.emit('retea', { tip: 'deconectat' }); NET.emite(sim, EV.ARDUINO_EVENT_WIFI_STA_DISCONNECTED, { reason: 8 }); }
      return true;
    }
    reconnect() { const n = this._n(); if (!n.ssid) return false; this.begin(n.ssid, n.parola); return true; }
    localIP() { const n = this._n(); return ip(n.stare === 3 ? n.ip : '0.0.0.0'); }
    subnetMask() { const n = this._n(); return ip(n.stare === 3 ? n.masca : '0.0.0.0'); }
    gatewayIP() { const n = this._n(); return ip(n.stare === 3 ? n.gw : '0.0.0.0'); }
    dnsIP() { const n = this._n(); return ip(n.stare === 3 ? n.dns : '0.0.0.0'); }
    broadcastIP() { return ip('192.168.1.255'); }
    networkID() { return ip('192.168.1.0'); }
    macAddress(buf) {
      const m = this._n().mac;
      if (buf && ArrayBuffer.isView(buf)) { m.split(':').forEach((x, i) => { buf[i] = parseInt(x, 16); }); return buf; }
      return m;
    }
    SSID(i) { if (i !== undefined) { const r = this._n().scanare; return r && r[i] ? r[i].ssid : ''; } const n = this._n(); return n.stare === 3 ? n.ssid : ''; }
    psk() { return this._n().parola; }
    RSSI(i) {
      if (i !== undefined) { const r = this._n().scanare; return r && r[i] ? r[i].rssi : 0; }
      const n = this._n(); if (n.stare !== 3) return 0;
      return n.rssi + Math.round((Math.random() - 0.5) * 4);
    }
    BSSIDstr(i) { return i !== undefined ? 'A4:2B:B0:' + (10 + i) + ':7F:31' : 'A4:2B:B0:C1:7F:31'; }
    channel(i) { if (i !== undefined) { const r = this._n().scanare; return r && r[i] ? r[i].canal : 0; } return 6; }
    encryptionType(i) { const r = this._n().scanare; return r && r[i] ? r[i].criptare : 0; }
    *scanNetworks(async) {
      const sim = S(), n = this._n();
      if (!(n.mod & 1)) n.mod |= 1;
      sim.wifiPornit = true;
      const lista = VECINI.map(v => Object.assign({}, v, { rssi: v.rssi + Math.round((Math.random() - 0.5) * 6) }));
      if (n.ssid && !lista.some(v => v.ssid === n.ssid)) lista.unshift({ ssid: n.ssid, rssi: -50, canal: 6, criptare: n.parola ? 3 : 0 });
      lista.sort((a, b) => b.rssi - a.rssi);
      if (async) { n.scanare = null; sim.programeaza(2200000, () => { n.scanare = lista; NET.emite(sim, EV.ARDUINO_EVENT_WIFI_SCAN_DONE, {}); }, 'mcu'); return -1; }
      yield { dorm: 2200000 };
      n.scanare = lista;
      return lista.length;
    }
    scanComplete() { const r = this._n().scanare; return r ? r.length : -1; }
    scanDelete() { this._n().scanare = null; }
    onEvent(cb, ev) { const n = this._n(); n.evenimente.push({ cb, ev }); return n.evenimente.length; }
    removeEvent(id) { const n = this._n(); if (typeof id === 'number') n.evenimente.splice(id - 1, 1); }
    // ---------- punct de acces ----------
    softAP(ssid, parola, canal, ascuns, max) {
      if (!this._verificaCip()) return false;
      const sim = S(), n = this._n();
      const s = txt(ssid), p = parola === undefined || parola === null ? '' : txt(parola);
      if (p.length && p.length < 8) { logE('AP.cpp:196', 'enable(): passphrase too short!'); sim.problema('ap-parola', 'eroare', 'WiFi.softAP(): parola „' + p + '” are sub 8 caractere, așa că punctul de acces nu pornește (softAP întoarce false). Folosește o parolă de 8+ caractere sau niciuna.', { linie: linie() }); return false; }
      n.mod |= 2; sim.wifiPornit = true;
      n.ap = { ssid: s, parola: p, ip: n.ap && n.ap.ip ? n.ap.ip : '192.168.4.1', clienti: 0 };
      sim.consuma(150000);
      sim.emit('retea', { tip: 'ap', ip: n.ap.ip, ssid: s });
      NET.emite(sim, EV.ARDUINO_EVENT_WIFI_AP_START, {});
      return true;
    }
    softAPConfig(ipLocal) { const n = this._n(); n.ap = n.ap || { ssid: '', parola: '', clienti: 0 }; n.ap.ip = String(ipLocal); return true; }
    softAPIP() { const n = this._n(); return ip(n.ap ? n.ap.ip : '0.0.0.0'); }
    softAPgetStationNum() { const n = this._n(); return n.ap ? n.ap.clienti : 0; }
    softAPdisconnect() { const n = this._n(); n.ap = null; n.mod &= ~2; S().wifiPornit = n.mod !== 0; return true; }
    softAPmacAddress() { return '24:0A:C4:3F:12:6D'; }
    softAPSSID() { const n = this._n(); return n.ap ? n.ap.ssid : ''; }
    softAPsetHostname(h) { return true; }
    hostByName(nume, rez) {
      const n = this._n();
      if (n.stare !== 3) return 0;
      if (rez && typeof rez === 'object') { if (rez instanceof IPAddress) rez.o = [93, 184, 216, 34]; else rez.v = ip('93.184.216.34'); }
      return 1;
    }
  }
  WiFiClass.tipuri = { mode: 'bool', getMode: 'int', begin: 'int', status: 'int', isConnected: 'bool', waitForConnectResult: 'uint8_t', disconnect: 'bool', reconnect: 'bool', localIP: 'obj:IPAddress', subnetMask: 'obj:IPAddress', gatewayIP: 'obj:IPAddress', dnsIP: 'obj:IPAddress', broadcastIP: 'obj:IPAddress', macAddress: 'String', SSID: 'String', psk: 'String', RSSI: 'int8_t', BSSIDstr: 'String', channel: 'int32_t', encryptionType: 'int', scanNetworks: 'int16_t', scanComplete: 'int16_t', softAP: 'bool', softAPConfig: 'bool', softAPIP: 'obj:IPAddress', softAPgetStationNum: 'uint8_t', softAPdisconnect: 'bool', softAPmacAddress: 'String', softAPSSID: 'String', setHostname: 'bool', getHostname: 'cstr', config: 'bool', hostByName: 'int', getAutoReconnect: 'bool', onEvent: 'int', setSleep: 'bool', getTxPower: 'int' };
  api.clasa('WiFiClass', WiFiClass);
  api.obiecte.WiFi = 'WiFiClass';
  Object.assign(api.constante, WL, EV, {
    WIFI_OFF: 0, WIFI_STA: 1, WIFI_AP: 2, WIFI_AP_STA: 3, WIFI_MODE_NULL: 0, WIFI_MODE_STA: 1, WIFI_MODE_AP: 2, WIFI_MODE_APSTA: 3,
    WIFI_AUTH_OPEN: 0, WIFI_AUTH_WEP: 1, WIFI_AUTH_WPA_PSK: 2, WIFI_AUTH_WPA2_PSK: 3, WIFI_AUTH_WPA_WPA2_PSK: 4, WIFI_AUTH_WPA2_ENTERPRISE: 5, WIFI_AUTH_WPA3_PSK: 6, WIFI_AUTH_WPA2_WPA3_PSK: 7,
    CONTENT_LENGTH_UNKNOWN: -1, CONTENT_LENGTH_NOT_SET: -2,
    WIFI_POWER_19_5dBm: 78, WIFI_POWER_2dBm: 8, WIFI_POWER_8_5dBm: 34, WIFI_POWER_11dBm: 44, WIFI_POWER_15dBm: 60, WIFI_SCAN_RUNNING: -1, WIFI_SCAN_FAILED: -2, INADDR_NONE: 0
  });
  Object.assign(api.tipuriNumerice, { wl_status_t: 'int', wifi_mode_t: 'int', WiFiEvent_t: 'int', arduino_event_id_t: 'int', wifi_auth_mode_t: 'int', wifi_power_t: 'int' });
  class WiFiEventInfo_t { constructor() { this.got_ip = { ip_info: { ip: { addr: 0 } } }; this.wifi_sta_disconnected = { reason: 0 }; } }
  api.clasa('WiFiEventInfo_t', WiFiEventInfo_t);
  class arduino_event_info_t extends WiFiEventInfo_t { }
  api.clasa('arduino_event_info_t', arduino_event_info_t);

  // ---------- cererile venite de la pagina „Web” (calculatorul din rețea) ----------
  // pe placă textele sunt octeți UTF-8: %C8%99 devine doi octeți, nu litera „ș”
  const decodeaza = (s) => { try { return unescape(String(s).replace(/\+/g, ' ')); } catch (e) { return s; } };
  function parseazaParametri(q) {
    const r = [];
    for (const p of String(q || '').split('&')) { if (!p) continue; const i = p.indexOf('='); r.push(i < 0 ? [decodeaza(p), ''] : [decodeaza(p.slice(0, i)), decodeaza(p.slice(i + 1))]); }
    return r;
  }
  const METODE = { GET: 1, POST: 2, DELETE: 4, PUT: 8, PATCH: 16, HEAD: 32, OPTIONS: 64 };
  const TEXT_STARE = { 200: 'OK', 201: 'Created', 204: 'No Content', 301: 'Moved Permanently', 302: 'Found', 303: 'See Other', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 500: 'Internal Server Error' };
  // M.web.cerere(sim, {url, metoda, corp, tip}) -> Promise<{cod, tip, corp, anteturi}> — folosit de pagina „Web”
  function cerere(sim, c) {
    return new Promise((rezolva) => {
      const n = NET.stare(sim);
      let url = String(c.url || '/');
      if (!/^https?:\/\//.test(url)) url = 'http://' + (c.gazda || n.ip) + (url.startsWith('/') ? '' : '/') + url;
      let u;
      try { u = new URL(url); } catch (e) { rezolva({ eroare: 'Adresă greșită: ' + url }); return; }
      const gazda = u.hostname, port = +(u.port || 80);
      const peSta = n.stare === 3 && (gazda === n.ip || (n.mdns && gazda === n.mdns + '.local'));
      const peAp = n.ap && gazda === n.ap.ip;
      if (!peSta && !peAp) {
        if (!n.mod) rezolva({ eroare: 'Placa nu are WiFi pornit. În cod: WiFi.begin("rețea", "parolă") sau WiFi.softAP("nume").' });
        else if (n.stare !== 3 && !n.ap) rezolva({ eroare: 'Placa nu e (încă) conectată la WiFi. Așteaptă „WL_CONNECTED” și încearcă din nou.' });
        else rezolva({ eroare: 'Nu există niciun dispozitiv la ' + gazda + '. Adresa plăcii e ' + NET.adrese(sim).join(' sau ') + '.' });
        return;
      }
      const srv = n.servere.get(port);
      if (!srv) { rezolva({ eroare: 'Placa (' + gazda + ') nu are niciun server web pornit pe portul ' + port + ' — conexiune refuzată. Lipsește server.begin()?' }); return; }
      const metoda = (c.metoda || 'GET').toUpperCase();
      const corp = c.corp || '';
      const tipCorp = c.tip || (corp ? 'application/x-www-form-urlencoded' : '');
      const param = parseazaParametri(u.search.slice(1));
      const paramCorp = /x-www-form-urlencoded/.test(tipCorp) ? parseazaParametri(corp) : [];
      const cer = { metoda, cale: decodeaza(u.pathname), query: u.search.slice(1), param, paramCorp, corp, tipCorp, anteturi: Object.assign({ Host: gazda, 'User-Agent': 'Mozilla/5.0 (Mester)', Accept: '*/*' }, c.anteturi || {}), rezolva, t0: sim.timp, clientIp: peAp ? '192.168.4.2' : '192.168.1.50' };
      if (peAp && n.ap) n.ap.clienti = Math.max(1, n.ap.clienti);
      srv.primeste(cer);
      // dacă serverul nu răspunde în 10 s de simulare
      sim.programeaza(10e6, () => { if (!cer.gata) { cer.gata = true; srv.expirat && srv.expirat(cer); rezolva({ eroare: 'Placa nu a răspuns în 10 secunde.' + (srv.motivTacere ? ' ' + srv.motivTacere() : '') }); } }, 'mcu');
    });
  }
  function raspunde(cer, cod, tip, corp, anteturi) {
    if (!cer || cer.gata) return false;
    cer.gata = true;
    const sim = S();
    const lung = typeof corp === 'string' ? corp.length : 0;
    sim.consuma(300 + lung * 0.1);
    cer.rezolva({ cod, tip: tip || 'text/plain', corp: corp || '', anteturi: anteturi || {}, durataUs: sim.timp - cer.t0 });
    if (!cer.faraJurnal) INTERNET.jurnal(sim, { dir: 'intrare', metoda: cer.metoda, url: cer.cale + (cer.query ? '?' + cer.query : ''), cod, tipCont: tip, corp: typeof corp === 'string' ? corp : '', durata: sim.timp - cer.t0 });
    return true;
  }
  M.web.cerere = cerere;

  // ---------- WebServer (sincron: handleClient() în loop) ----------
  class WebServer {
    constructor(port) { this.port = port === undefined ? 80 : port | 0; this.rute = []; this.lipsa = null; this.coada = []; this.cer = null; this.antet = {}; this.pornit = false; this.ultimHandle = 0; this.antetDorite = []; }
    begin(port) {
      const sim = S(), n = NET.stare(sim);
      if (port !== undefined) this.port = port;
      if (!n.mod) sim.problema('ws-fara-wifi', 'avertisment', 'server.begin() fără WiFi pornit: serverul nu poate fi accesat. Conectează-te întâi cu WiFi.begin() sau pornește WiFi.softAP().', { linie: linie() });
      n.servere.set(this.port, this);
      this.pornit = true;
      sim.emit('retea', { tip: 'server', port: this.port });
    }
    close() { const n = NET.stare(S()); if (n.servere.get(this.port) === this) n.servere.delete(this.port); this.pornit = false; }
    stop() { this.close(); }
    on(cale, a, b, c) {
      const metoda = typeof a === 'number' ? a : 127;
      const fn = typeof a === 'function' ? a : b;
      this.rute.push({ cale: txt(cale), metoda, fn, upload: typeof a === 'number' ? c : undefined });
      return this;
    }
    onNotFound(fn) { this.lipsa = fn; }
    onFileUpload() { }
    serveStatic(cale, fs, dosar) { this.rute.push({ cale: txt(cale), metoda: 127, static: { fs, dosar: txt(dosar) } }); return this; }
    collectHeaders(...nume) { this.antetDorite = nume.flat().map(x => txt(x)); }
    enableCORS() { } enableCrossOrigin() { }
    primeste(cer) { this.coada.push(cer); }
    motivTacere() { return S().timp - this.ultimHandle > 3e6 ? 'Serverul nu verifică cererile: lipsește server.handleClient() în loop() (sau loop() stă blocat în delay() lung).' : ''; }
    *handleClient() {
      const sim = S();
      this.ultimHandle = sim.timp;
      sim.consuma(15);
      while (this.coada.length && this.coada[0].gata) this.coada.shift();
      const cer = this.coada.shift();
      if (!cer) return;
      this.cer = cer; this.raspuns = { antete: {} };
      const bit = METODE[cer.metoda] || 1;
      const r = this.rute.find(x => (x.metoda & bit || x.metoda === 127) && (x.cale === cer.cale || (x.static && cer.cale.startsWith(x.cale))));
      try {
        if (r && r.static) {
          const fs = r.static.fs, rel = cer.cale.slice(r.cale.length).replace(/^\/?/, '/');
          let cale = (r.static.dosar.replace(/\/$/, '') + rel).replace(/\/\//g, '/');
          if (cale.endsWith('/')) cale += 'index.html';
          const fis = fs && fs.open ? fs.open(cale, 'r') : null;
          if (fis && fis.__bool()) { this.send(200, tipDupaExtensie(cale), fis.readString()); fis.close(); }
          else if (this.lipsa) { const x = this.lipsa(); if (x && x.next) yield* x; }
          else this.send(404, 'text/plain', 'Not found: ' + cer.cale);
        } else if (r) { const x = r.fn(); if (x && x.next) yield* x; }
        else if (this.lipsa) { const x = this.lipsa(); if (x && x.next) yield* x; }
        else this.send(404, 'text/plain', 'Not found: ' + cer.cale);
      } finally {
        if (!cer.gata && this.raspuns && this.raspuns.bucati !== undefined) raspunde(cer, this.raspuns.cod || 200, this.raspuns.tip, this.raspuns.bucati, this.raspuns.antete);
        if (!cer.gata) {
          // handler-ul nu a trimis nimic: clientul primește un răspuns gol
          sim.problema('ws-fara-send', 'avertisment', 'Funcția pentru „' + cer.cale + '” nu a trimis niciun răspuns: fiecare handler trebuie să termine cu server.send(cod, tip, conținut).', { linie: linie() });
          raspunde(cer, 500, 'text/plain', '');
        }
        this.cer = null;
      }
    }
    _toti() { return this.cer ? this.cer.param.concat(this.cer.paramCorp) : []; }
    arg(nume) { if (typeof nume === 'number') { const x = this._toti()[nume]; return x ? x[1] : ''; } const n = txt(nume); if (n === 'plain' && this.cer) return this.cer.corp; const x = this._toti().find(p => p[0] === n); return x ? x[1] : ''; }
    argName(i) { const x = this._toti()[i]; return x ? x[0] : ''; }
    args() { return this._toti().length; }
    hasArg(nume) { const n = txt(nume); if (n === 'plain' && this.cer) return !!this.cer.corp; return this._toti().some(p => p[0] === n); }
    uri() { return this.cer ? this.cer.cale : ''; }
    method() { return this.cer ? (METODE[this.cer.metoda] || 1) : 1; }
    header(nume) { if (!this.cer) return ''; const n = txt(nume).toLowerCase(); for (const [k, v] of Object.entries(this.cer.anteturi)) if (k.toLowerCase() === n) return v; return ''; }
    hasHeader(nume) { return this.header(nume) !== ''; }
    hostHeader() { return this.header('Host'); }
    client() { return new WiFiClient(null, this.cer ? this.cer.clientIp : '0.0.0.0'); }
    sendHeader(nume, val) { if (this.raspuns) this.raspuns.antete[txt(nume)] = txt(val); }
    setContentLength(n) { if (this.raspuns) this.raspuns.lungime = n; }
    send(cod, tip, continut) {
      if (!this.cer) { S().problema('ws-send-afara', 'avertisment', 'server.send() apelat în afara unui handler de cerere: nu are cui răspunde.', { linie: linie() }); return; }
      if (this.raspuns && this.raspuns.lungime === -1) { this.raspuns.bucati = (this.raspuns.bucati || '') + txt(continut || ''); this.raspuns.cod = cod; this.raspuns.tip = txt(tip); return; }
      raspunde(this.cer, cod | 0, txt(tip === undefined ? 'text/plain' : tip), txt(continut === undefined ? '' : continut), this.raspuns ? this.raspuns.antete : {});
    }
    send_P(cod, tip, continut) { this.send(cod, tip, continut); }
    sendContent(t) { if (this.raspuns) { this.raspuns.bucati = (this.raspuns.bucati || '') + txt(t); if (txt(t) === '' && this.cer) raspunde(this.cer, this.raspuns.cod || 200, this.raspuns.tip, this.raspuns.bucati, this.raspuns.antete); } }
    streamFile(fis, tip) { const d = fis && fis.readString ? fis.readString() : ''; this.send(200, tip, d); return d.length; }
    requestAuthentication() { this.send(401, 'text/plain', 'Unauthorized'); }
    authenticate(u, p) { const a = this.header('Authorization'); if (!a.startsWith('Basic ')) return false; try { return atob(a.slice(6)) === txt(u) + ':' + txt(p); } catch (e) { return false; } }
  }
  WebServer.tipuri = { arg: 'String', argName: 'String', args: 'int', hasArg: 'bool', uri: 'String', method: 'int', header: 'String', hasHeader: 'bool', hostHeader: 'String', client: 'obj:WiFiClient', streamFile: 'size_t', authenticate: 'bool' };
  api.clasa('WebServer', WebServer);
  api.clasa('ESP8266WebServer', WebServer);
  const tipDupaExtensie = (c) => ({ html: 'text/html', htm: 'text/html', css: 'text/css', js: 'application/javascript', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', ico: 'image/x-icon', svg: 'image/svg+xml', txt: 'text/plain', csv: 'text/csv' })[String(c).split('.').pop().toLowerCase()] || 'text/plain';

  // ---------- WiFiClient / WiFiServer (TCP „brut”, ca în exemplele clasice) ----------
  class WiFiClient extends api.clase.Stream {
    constructor(cer, ipClient) { super(); this.cer = cer || null; this.deschis = !!cer; this.iesire = ''; this.ipClient = ipClient || (cer ? cer.clientIp : '0.0.0.0'); if (cer) this._in = cerereBruta(cer); }
    __bool() { return this.deschis; }
    connected() { return this.deschis ? 1 : 0; }
    available() { return this._in.length; }
    _scrie(t) { if (this.deschis) { this.iesire += t; S().consuma(t.length * 0.05 + 5); } }
    stop() {
      if (!this.deschis) return;
      this.deschis = false;
      if (this.cer) raspundeBrut(this.cer, this.iesire);
    }
    remoteIP() { return ip(this.ipClient); }
    remotePort() { return 51514; }
    localIP() { return f.__wifiIp ? f.__wifiIp() : ip('0.0.0.0'); }
    setTimeout(ms) { this._timeout = ms; }
    setNoDelay() { }
    // conexiuni ieșite din placă (spre internet): nu le simulăm pe TCP brut
    connect(gazda) {
      const sim = S();
      if (!NET.conectat(sim)) return 0;
      sim.problema('tcp-iesire', 'info', 'Conexiunile TCP „brute” spre internet (client.connect("' + txt(gazda) + '", …)) nu sunt simulate. Pentru cereri web folosește HTTPClient: http.begin(url); http.GET(); — acelea merg de-adevăratelea.', { linie: linie() });
      return 0;
    }
    flush() { }
  }
  WiFiClient.tipuri = Object.assign({}, api.clase.Stream.tipuri, { connected: 'uint8_t', available: 'int', remoteIP: 'obj:IPAddress', remotePort: 'uint16_t', localIP: 'obj:IPAddress', connect: 'int' });
  api.clasa('WiFiClient', WiFiClient);
  api.clasa('NetworkClient', WiFiClient);
  class WiFiClientSecure extends WiFiClient { setInsecure() { } setCACert() { } setCertificate() { } setPrivateKey() { } }
  api.clasa('WiFiClientSecure', WiFiClientSecure);
  function cerereBruta(c) {
    let s = c.metoda + ' ' + c.cale + (c.query ? '?' + c.query : '') + ' HTTP/1.1\r\n';
    for (const [k, v] of Object.entries(c.anteturi)) s += k + ': ' + v + '\r\n';
    if (c.corp) s += 'Content-Type: ' + (c.tipCorp || 'text/plain') + '\r\nContent-Length: ' + c.corp.length + '\r\n';
    s += 'Connection: close\r\n\r\n' + (c.corp || '');
    return s;
  }
  function raspundeBrut(cer, text) {
    const i = text.indexOf('\r\n\r\n'), j = text.indexOf('\n\n');
    const sep = i >= 0 && (j < 0 || i < j) ? i : j;
    let cap = sep >= 0 ? text.slice(0, sep) : '', corp = sep >= 0 ? text.slice(sep + (sep === i ? 4 : 2)) : text;
    const linii = cap.split(/\r?\n/);
    const m = /^HTTP\/1\.[01]\s+(\d{3})/.exec(linii[0] || '');
    if (!m) { S().problema('tcp-http', 'avertisment', 'Răspunsul trimis cu client.print() nu începe cu linia de stare HTTP („HTTP/1.1 200 OK”) urmată de antete și de o linie goală; browserul îl afișează ca text simplu.', { linie: linie() }); raspunde(cer, 200, 'text/plain', text); return; }
    const antete = {};
    for (const l of linii.slice(1)) { const k = l.indexOf(':'); if (k > 0) antete[l.slice(0, k).trim()] = l.slice(k + 1).trim(); }
    const tip = Object.entries(antete).find(([k]) => k.toLowerCase() === 'content-type');
    raspunde(cer, +m[1], tip ? tip[1] : 'text/html', corp, antete);
  }
  class WiFiServer {
    constructor(port) { this.port = port === undefined ? 80 : port | 0; this.coada = []; this.ultim = 0; }
    begin(port) { const n = NET.stare(S()); if (port !== undefined) this.port = port; n.servere.set(this.port, this); if (!n.mod) S().problema('ws-fara-wifi', 'avertisment', 'server.begin() fără WiFi pornit: serverul nu poate fi accesat.', { linie: linie() }); S().emit('retea', { tip: 'server', port: this.port }); }
    end() { const n = NET.stare(S()); if (n.servere.get(this.port) === this) n.servere.delete(this.port); }
    stop() { this.end(); } close() { this.end(); }
    setNoDelay() { }
    primeste(cer) { this.coada.push(cer); }
    motivTacere() { return S().timp - this.ultim > 3e6 ? 'Serverul nu verifică conexiunile noi: lipsește server.available() în loop().' : 'Clientul nu a fost închis cu client.stop() după răspuns, deci browserul așteaptă în continuare.'; }
    available() { this.ultim = S().timp; S().consuma(10); while (this.coada.length && this.coada[0].gata) this.coada.shift(); const c = this.coada.shift(); return new WiFiClient(c || null); }
    accept() { return this.available(); }
    hasClient() { return this.coada.length > 0; }
    __bool() { return true; }
  }
  WiFiServer.tipuri = { available: 'obj:WiFiClient', accept: 'obj:WiFiClient', hasClient: 'bool' };
  api.clasa('WiFiServer', WiFiServer);
  api.clasa('NetworkServer', WiFiServer);

  // ---------- ESPAsyncWebServer ----------
  class AsyncWebParameter {
    constructor(n, v, post, fisier) { this._n = n; this._v = v; this._post = !!post; this._f = !!fisier; }
    name() { return this._n; } value() { return this._v; } isPost() { return this._post; } isFile() { return this._f; } size() { return this._v.length; }
  }
  AsyncWebParameter.tipuri = { name: 'String', value: 'String', isPost: 'bool', isFile: 'bool', size: 'size_t' };
  api.clasa('AsyncWebParameter', AsyncWebParameter);
  api.clasa('AsyncWebHeader', class AsyncWebHeader { constructor(n, v) { this._n = n; this._v = v; } name() { return this._n; } value() { return this._v; } });
  // înlocuirea %NUME% cu ce întoarce funcția „processor”, exact ca biblioteca: orice text dintre două semne %
  // e luat drept nume (tăiat la 32 de caractere), iar %% înseamnă un singur %. De aici capcana cu „width: 50%” din CSS.
  function sablon(html, proc) {
    if (typeof proc !== 'function') return html;
    let r = '', i = 0, avertizat = false;
    while (i < html.length) {
      const a = html.indexOf('%', i);
      if (a < 0) { r += html.slice(i); break; }
      r += html.slice(i, a);
      if (html[a + 1] === '%') { r += '%'; i = a + 2; continue; }
      const b = html.indexOf('%', a + 1);
      if (b < 0) { r += html.slice(a); break; }
      const nume = html.slice(a + 1, b).slice(0, 32);
      if (!avertizat && !/^[A-Za-z0-9_.\-]+$/.test(nume)) {
        avertizat = true;
        const ex = '…' + html.slice(Math.max(0, a - 14), a + 5).replace(/\s+/g, ' ') + '…';
        S().problema('async-procent', 'avertisment', 'Pagina trimisă cu processor conține un % care nu e o variabilă (lângă „' + ex + '”). Biblioteca ia tot textul până la următorul % drept nume de variabilă și îl înlocuiește, așa că pagina iese stricată. Scrie %% acolo unde vrei semnul % (de ex. width: 50%%).', { linie: linie() });
      }
      const v = ruleazaSincron(proc, [nume], 'funcția processor');
      r += txt(v === undefined ? '' : v);
      i = b + 1;
    }
    return r;
  }
  class AsyncWebServerRequest {
    constructor(cer, server) { this.cer = cer; this.server = server; this._raspuns = null; this._tmp = null; }
    _toti() { return this.cer.param.map(p => new AsyncWebParameter(p[0], p[1], false)).concat(this.cer.paramCorp.map(p => new AsyncWebParameter(p[0], p[1], true))); }
    hasParam(nume, post) { const n = txt(nume); return this._toti().some(p => p._n === n && (post === undefined || p._post === !!post)); }
    getParam(a, post) { if (typeof a === 'number') return this._toti()[a] || null; const n = txt(a); return this._toti().find(p => p._n === n && (post === undefined || p._post === !!post)) || null; }
    params() { return this._toti().length; }
    hasArg(n) { return this.hasParam(n); }
    arg(n) { const p = this.getParam(n); return p ? p._v : ''; }
    url() { return this.cer.cale; }
    host() { return this.cer.anteturi.Host || ''; }
    method() { return METODE[this.cer.metoda] || 1; }
    methodToString() { return this.cer.metoda; }
    contentType() { return this.cer.tipCorp || ''; }
    contentLength() { return this.cer.corp.length; }
    hasHeader(n) { return this.getHeader(n) !== null; }
    getHeader(n) { const k = Object.keys(this.cer.anteturi).find(x => x.toLowerCase() === txt(n).toLowerCase()); return k ? new (api.clase.AsyncWebHeader)(k, this.cer.anteturi[k]) : null; }
    client() { return { remoteIP: () => ip(this.cer.clientIp) }; }
    send(cod, tip, continut, proc) {
      if (cod && typeof cod === 'object' && cod.__raspuns) { cod.__trimite(this.cer); return; }
      if (cod && typeof cod === 'object' && typeof cod._fis === 'function') {
        // send(LittleFS, "/index.html", "text/html", download, processor)
        const fs = cod, cale = txt(tip);
        if (typeof continut === 'boolean') { proc = arguments[4]; continut = undefined; }
        const fis = fs.open ? fs.open(cale, 'r') : null;
        if (!fis || !fis.__bool()) { raspunde(this.cer, 404, 'text/plain', 'Not found'); return; }
        const d = fis.readString(); fis.close();
        raspunde(this.cer, 200, continut === undefined ? tipDupaExtensie(cale) : txt(continut), sablon(d, proc));
        return;
      }
      const corp = continut === undefined ? '' : txt(continut);
      raspunde(this.cer, cod === undefined ? 200 : cod | 0, tip === undefined ? 'text/plain' : txt(tip), sablon(corp, proc), this._antete || {});
    }
    send_P(cod, tip, continut, proc) { this.send(cod, tip, continut, proc); }
    redirect(url) { raspunde(this.cer, 302, 'text/plain', '', { Location: txt(url) }); }
    requestAuthentication() { raspunde(this.cer, 401, 'text/plain', 'Unauthorized', { 'WWW-Authenticate': 'Basic realm="Login Required"' }); }
    authenticate(u, p) { const h = this.getHeader('Authorization'); if (!h) return false; const a = h._v; try { return a.startsWith('Basic ') && atob(a.slice(6)) === txt(u) + ':' + txt(p); } catch (e) { return false; } }
    beginResponse(cod, tip, continut, proc) { const self = this; return new AsyncWebServerResponse(cod, tip, continut, proc); }
    beginResponseStream(tip) { return new AsyncResponseStream(txt(tip)); }
    beginResponse_P(cod, tip, continut, proc) { return new AsyncWebServerResponse(cod, tip, continut, proc); }
  }
  AsyncWebServerRequest.tipuri = { hasParam: 'bool', getParam: 'obj:AsyncWebParameter', params: 'size_t', hasArg: 'bool', arg: 'String', url: 'String', host: 'String', method: 'int', methodToString: 'cstr', contentType: 'String', contentLength: 'size_t', hasHeader: 'bool', getHeader: 'obj:AsyncWebHeader', authenticate: 'bool', beginResponse: 'obj:AsyncWebServerResponse', beginResponseStream: 'obj:AsyncResponseStream', beginResponse_P: 'obj:AsyncWebServerResponse' };
  api.clasa('AsyncWebServerRequest', AsyncWebServerRequest);
  class AsyncWebServerResponse {
    constructor(cod, tip, continut, proc) { this.__raspuns = true; this.cod = cod | 0; this.tip = txt(tip); this.corp = continut === undefined ? '' : txt(continut); this.proc = proc; this.antete = {}; }
    addHeader(n, v) { this.antete[txt(n)] = txt(v); }
    setCode(c) { this.cod = c; }
    setContentType(t) { this.tip = txt(t); }
    __trimite(cer) { raspunde(cer, this.cod, this.tip, sablon(this.corp, this.proc), this.antete); }
  }
  api.clasa('AsyncWebServerResponse', AsyncWebServerResponse);
  class AsyncResponseStream extends api.clase.Print {
    constructor(tip) { super(); this.__raspuns = true; this.tip = tip; this.corp = ''; this.cod = 200; this.antete = {}; }
    _scrie(t) { this.corp += t; }
    addHeader(n, v) { this.antete[txt(n)] = txt(v); }
    setCode(c) { this.cod = c; }
    __trimite(cer) { raspunde(cer, this.cod, this.tip, this.corp, this.antete); }
  }
  api.clasa('AsyncResponseStream', AsyncResponseStream);
  class AsyncWebHandler { setDefaultFile(f) { this.implicit = txt(f); return this; } setCacheControl() { return this; } setAuthentication() { return this; } setFilter() { return this; } setTemplateProcessor(p) { this.proc = p; return this; } }
  api.clasa('AsyncStaticWebHandler', AsyncWebHandler);
  api.clasa('AsyncCallbackWebHandler', AsyncWebHandler);
  class AsyncWebServer {
    constructor(port) { this.port = port === undefined ? 80 : port | 0; this.rute = []; this.lipsa = null; this.handlere = []; this.pornit = false; }
    begin() { const sim = S(), n = NET.stare(sim); if (!n.mod) sim.problema('ws-fara-wifi', 'avertisment', 'server.begin() fără WiFi pornit: serverul nu poate fi accesat.', { linie: linie() }); n.servere.set(this.port, this); this.pornit = true; sim.emit('retea', { tip: 'server', port: this.port }); }
    end() { const n = NET.stare(S()); if (n.servere.get(this.port) === this) n.servere.delete(this.port); }
    reset() { this.rute = []; this.lipsa = null; }
    on(cale, a, b, c) {
      const metoda = typeof a === 'number' ? a : 127;
      const fn = typeof a === 'function' ? a : b;
      const h = new AsyncWebHandler();
      this.rute.push({ cale: txt(cale), metoda, fn, h, upload: typeof a === 'number' ? c : undefined });
      return h;
    }
    onNotFound(fn) { this.lipsa = fn; }
    onFileUpload() { } onRequestBody() { }
    serveStatic(cale, fs, dosar) { const h = new AsyncWebHandler(); h.implicit = 'index.htm'; this.rute.push({ cale: txt(cale), metoda: 127, static: { fs, dosar: txt(dosar) }, h }); return h; }
    addHandler(h) { this.handlere.push(h); if (h && h.__legaLaServer) h.__legaLaServer(this); return h; }
    primeste(cer) {
      const sim = S();
      // biblioteca răspunde din sarcina ei (async_tcp), imediat ce vine cererea — nu din loop()
      sim.programeaza(400, () => {
        if (cer.gata) return;
        const bit = METODE[cer.metoda] || 1;
        const req = new AsyncWebServerRequest(cer, this);
        for (const h of this.handlere) if (h && h.__trateaza && h.__trateaza(cer, req)) return;
        const potrivire = (r) => r.cale === cer.cale || (r.cale.endsWith('*') && cer.cale.startsWith(r.cale.slice(0, -1))) || (r.static && cer.cale.startsWith(r.cale)) || (!r.static && r.cale !== '/' && cer.cale.startsWith(r.cale + '/') && false);
        const r = this.rute.find(x => (x.metoda & bit) && potrivire(x));
        if (r && r.static) {
          const fs = r.static.fs, rel = cer.cale.slice(r.cale.length).replace(/^\/?/, '/');
          let cale = (r.static.dosar.replace(/\/$/, '') + rel).replace(/\/\//g, '/');
          if (cale.endsWith('/')) cale += r.h.implicit || 'index.htm';
          const fis = fs && fs.open ? fs.open(cale, 'r') : null;
          if (fis && fis.__bool()) { const d = fis.readString(); fis.close(); raspunde(cer, 200, tipDupaExtensie(cale), sablon(d, r.h.proc)); return; }
        } else if (r) { ruleazaSincron(r.fn, [req], 'handler-ul serverului asincron'); }
        else if (this.lipsa) ruleazaSincron(this.lipsa, [req], 'handler-ul serverului asincron');
        if (!cer.gata) {
          if (r || this.lipsa) sim.problema('async-fara-send', 'avertisment', 'Handler-ul pentru „' + cer.cale + '” nu a trimis răspuns: termină cu request->send(cod, tip, conținut).', { linie: linie() });
          raspunde(cer, 404, 'text/plain', 'Not found');
        }
      }, 'mcu');
    }
  }
  AsyncWebServer.tipuri = { on: 'obj:AsyncCallbackWebHandler', serveStatic: 'obj:AsyncStaticWebHandler' };
  api.clasa('AsyncWebServer', AsyncWebServer);

  // Server-Sent Events: pagina ascultă cu new EventSource('/events')
  class AsyncEventSource {
    constructor(cale) { this.cale = txt(cale); this.clienti = new Set(); this.laConectare = null; }
    __legaLaServer(s) { this.server = s; }
    onConnect(fn) { this.laConectare = fn; }
    count() { return this.clienti.size; }
    __trateaza(cer) { return false; }
    __conecteaza(cb) {
      const sim = S();
      const cl = { trimite: cb, send: (m, e, id) => cb({ tip: 'sse', mesaj: txt(m), eveniment: e ? txt(e) : 'message', id: id || 0 }) };
      this.clienti.add(cl);
      sim.programeaza(500, () => { if (this.clienti.has(cl) && this.laConectare) ruleazaSincron(this.laConectare, [new AsyncEventSourceClient(cl)], 'onConnect()'); }, 'mcu');
      return { inchide: () => this.clienti.delete(cl) };
    }
    send(mesaj, eveniment, id) { for (const c of this.clienti) c.trimite({ tip: 'sse', mesaj: txt(mesaj), eveniment: eveniment ? txt(eveniment) : 'message', id: id || 0 }); S().consuma(30 * this.clienti.size); }
    close() { this.clienti.clear(); }
  }
  class AsyncEventSourceClient { constructor(cl) { this.cl = cl; } lastId() { return 0; } send(m, e, id) { this.cl.send(m, e, id); } }
  AsyncEventSource.tipuri = { count: 'size_t' };
  AsyncEventSourceClient.tipuri = { lastId: 'uint32_t' };
  api.clasa('AsyncEventSource', AsyncEventSource);
  api.clasa('AsyncEventSourceClient', AsyncEventSourceClient);

  // WebSocket: new WebSocket('ws://' + location.hostname + '/ws')
  class AwsFrameInfo { constructor(len, text) { this.message_opcode = text ? 1 : 2; this.num = 0; this.final = 1; this.masked = 1; this.opcode = text ? 1 : 2; this.len = len; this.index = 0; } }
  AwsFrameInfo.proprietati = { message_opcode: 'uint8_t', num: 'uint32_t', final: 'uint8_t', masked: 'uint8_t', opcode: 'uint8_t', len: 'uint64_t', index: 'uint64_t' };
  api.clasa('AwsFrameInfo', AwsFrameInfo);
  class AsyncWebSocketClient {
    constructor(ws, id, cb) { this.ws = ws; this._id = id; this.cb = cb; this.deschis = true; }
    id() { return this._id; }
    text(m) { if (this.deschis) this.cb({ tip: 'ws', mesaj: txt(m) }); }
    binary(m) { this.text(m); }
    ping() { } close() { this.deschis = false; this.cb({ tip: 'ws-inchis' }); this.ws.clienti.delete(this._id); }
    remoteIP() { return ip('192.168.1.50'); }
    status() { return this.deschis ? 1 : 3; }
    canSend() { return this.deschis; }
  }
  AsyncWebSocketClient.tipuri = { id: 'uint32_t', remoteIP: 'obj:IPAddress', status: 'int', canSend: 'bool' };
  api.clasa('AsyncWebSocketClient', AsyncWebSocketClient);
  class AsyncWebSocket {
    constructor(cale) { this.cale = txt(cale); this.clienti = new Map(); this.urmId = 1; this.handler = null; }
    __legaLaServer(s) { this.server = s; }
    __trateaza() { return false; }
    onEvent(fn) { this.handler = fn; }
    count() { return this.clienti.size; }
    __conecteaza(cb) {
      const sim = S();
      const c = new AsyncWebSocketClient(this, this.urmId++, cb);
      this.clienti.set(c._id, c);
      sim.programeaza(300, () => this._eveniment(c, 0, null, null), 'mcu');
      return {
        trimite: (t) => sim.programeaza(300, () => {
          const date = new Uint8Array(t.length + 1);
          for (let i = 0; i < t.length; i++) date[i] = t.charCodeAt(i) & 255;
          this._eveniment(c, 3, new AwsFrameInfo(t.length, true), date, t.length);
        }, 'mcu'),
        inchide: () => sim.programeaza(300, () => { if (!this.clienti.has(c._id)) return; this.clienti.delete(c._id); c.deschis = false; this._eveniment(c, 1, null, null); }, 'mcu')
      };
    }
    _eveniment(c, tip, arg, date, lung) { if (this.handler) ruleazaSincron(this.handler, [this, c, tip, arg, date || new Uint8Array(1), lung || 0], 'handler-ul WebSocket'); }
    textAll(m) { for (const c of this.clienti.values()) c.text(m); S().consuma(40 * this.clienti.size); }
    binaryAll(m) { this.textAll(m); }
    text(id, m) { const c = this.clienti.get(id); if (c) c.text(m); }
    client(id) { return this.clienti.get(id) || null; }
    cleanupClients() { }
    closeAll() { for (const c of [...this.clienti.values()]) c.close(); }
    availableForWriteAll() { return true; }
  }
  AsyncWebSocket.tipuri = { count: 'size_t', client: 'obj:AsyncWebSocketClient', availableForWriteAll: 'bool' };
  api.clasa('AsyncWebSocket', AsyncWebSocket);
  // conexiunile paginii „Web” la /events și /ws
  M.web.conecteaza = function (sim, cale, tip, cb) {
    const n = NET.stare(sim);
    for (const srv of n.servere.values()) for (const h of (srv.handlere || [])) {
      if (h.cale === cale && ((tip === 'sse' && h instanceof AsyncEventSource) || (tip === 'ws' && h instanceof AsyncWebSocket))) return h.__conecteaza(cb);
    }
    return null;
  };
  Object.assign(api.constante, {
    HTTP_GET: 1, HTTP_POST: 2, HTTP_DELETE: 4, HTTP_PUT: 8, HTTP_PATCH: 16, HTTP_HEAD: 32, HTTP_OPTIONS: 64, HTTP_ANY: 127,
    WS_EVT_CONNECT: 0, WS_EVT_DISCONNECT: 1, WS_EVT_PONG: 2, WS_EVT_DATA: 3, WS_EVT_ERROR: 4, WS_TEXT: 1, WS_BINARY: 2, WS_CONTINUATION: 0
  });
  Object.assign(api.tipuriNumerice, { HTTPMethod: 'int', WebRequestMethodComposite: 'int', AwsEventType: 'int', WebRequestMethod: 'int' });
  api.tipuriNumerice.ArRequestHandlerFunction = 'int';

  // ---------- internetul văzut de placă ----------
  // Ordinea: răspunsurile scrise în proiect (fila Web → Jurnal), apoi răspunsuri tipice ale serviciilor folosite
  // des în proiecte ESP32 (vreme, oră, IoT, notificări), apoi cererea reală din browser (când pagina are voie).
  const INTERNET = {
    jurnal(sim, d) { d.t = sim.timp; const n = NET.stare(sim); (n.jurnal = n.jurnal || []).push(d); if (n.jurnal.length > 200) n.jurnal.shift(); sim.emit('retea', Object.assign({ tip: 'jurnal' }, d)); },
    dinProiect(sim, metoda, url) {
      const lista = sim.proiect.internet || [];
      let best = null;
      for (const r of lista) if (r.url && url.startsWith(r.url) && (!r.metoda || r.metoda === metoda) && (!best || r.url.length > best.url.length)) best = r;
      return best ? { cod: best.cod || 200, corp: octeti(best.corp || ''), antete: { 'content-type': best.tip || 'application/json' }, sursa: 'proiect' } : null;
    },
    async cere(sim, metoda, url, corp, antete) {
      const p = INTERNET.dinProiect(sim, metoda, url);
      // întârzierea rețelei se socotește în timpul simulării (latenta, în µs)
      if (p) return Object.assign({ latenta: 120000 }, p);
      const ex = INTERNET.exemplu(metoda, url, corp, antete);
      if (ex) return Object.assign({ sursa: 'exemplu', latenta: 150000 + Math.floor(Math.random() * 250000) }, ex, { corp: octeti(ex.corp) });
      if (typeof fetch === 'function') {
        try {
          const urlReal = (typeof location !== 'undefined' && location.protocol === 'https:') ? url.replace(/^http:\/\//i, 'https://') : url;
          delete antete['User-Agent'];
          const ctl = typeof AbortController === 'function' ? new AbortController() : null;
          const tm = setTimeout(() => ctl && ctl.abort(), 4000);
          const r = await fetch(urlReal, { method: metoda, headers: antete, body: metoda === 'GET' || metoda === 'HEAD' ? undefined : corp, redirect: 'follow', signal: ctl ? ctl.signal : undefined });
          clearTimeout(tm);
          const text = await r.text();
          const ant = {}; r.headers.forEach((v, k) => { ant[k] = v; });
          return { cod: r.status, corp: octeti(text), antete: ant, sursa: 'internet' };
        } catch (e) { /* blocată (CORS, fără rețea) */ }
      }
      return { eroare: true };
    },
    exemplu(metoda, url, corp) {
      let u; try { u = new URL(url); } catch (e) { return null; }
      const h = u.hostname.replace(/^www\./, ''), cale = u.pathname, q = (k) => u.searchParams.get(k);
      const json = (o, cod) => ({ cod: cod || 200, corp: JSON.stringify(o), antete: { 'content-type': 'application/json; charset=utf-8' } });
      const text = (t, tip, cod) => ({ cod: cod || 200, corp: t, antete: { 'content-type': tip || 'text/plain; charset=utf-8' } });
      const acum = Date.now(), zi = new Date(acum);
      const oraLocala = (dec) => { const d = new Date(acum + dec * 1000); const p = (x, k) => String(x).padStart(k || 2, '0'); return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + 'T' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds()) + '.' + p(d.getUTCMilliseconds(), 3) + '000'; };
      const vreme = (oras) => { let x = 0; for (const c of (oras || 'Bucuresti').toLowerCase()) x = (x * 31 + c.charCodeAt(0)) >>> 0; const ora = zi.getUTCHours() + 3; return { t: 12 + (x % 9) + 5 * Math.sin((ora - 9) / 24 * 2 * Math.PI), u: 45 + (x % 35), p: 1008 + (x % 15), v: 1 + (x % 7) }; };
      if (h === 'api.openweathermap.org') {
        if (!q('appid')) return json({ cod: 401, message: 'Invalid API key. Please see https://openweathermap.org/faq#error401 for more info.' }, 401);
        const oras = (q('q') || 'Bucharest').split(',')[0];
        const v = vreme(oras), k = q('units') === 'metric' ? 0 : q('units') === 'imperial' ? -1 : 273.15;
        const tt = (c) => +(k < 0 ? c * 9 / 5 + 32 : c + k).toFixed(2);
        const obj = { coord: { lon: +(q('lon') || 26.1063), lat: +(q('lat') || 44.4323) }, weather: [{ id: 802, main: 'Clouds', description: 'scattered clouds', icon: '03d' }], base: 'stations', main: { temp: tt(v.t), feels_like: tt(v.t - 0.6), temp_min: tt(v.t - 1.3), temp_max: tt(v.t + 1.1), pressure: v.p, humidity: v.u, sea_level: v.p, grnd_level: v.p - 9 }, visibility: 10000, wind: { speed: v.v + 0.1, deg: 220 }, clouds: { all: 40 }, dt: Math.floor(acum / 1000), sys: { country: 'RO', sunrise: Math.floor(acum / 1000) - 20000, sunset: Math.floor(acum / 1000) + 22000 }, timezone: 10800, id: 683506, name: oras, cod: 200 };
        if (/forecast/.test(cale)) return json({ cod: '200', message: 0, cnt: 3, list: [0, 1, 2].map(i => ({ dt: Math.floor(acum / 1000) + i * 10800, main: obj.main, weather: obj.weather, wind: obj.wind, dt_txt: oraLocala(i * 10800).slice(0, 19).replace('T', ' ') })), city: { name: oras, country: 'RO', timezone: 10800 } });
        return json(obj);
      }
      if (h === 'api.open-meteo.com') {
        const v = vreme(q('latitude') || ''), t = oraLocala(0).slice(0, 16);
        return json({ latitude: +(q('latitude') || 44.43), longitude: +(q('longitude') || 26.1), generationtime_ms: 0.05, utc_offset_seconds: 0, timezone: 'GMT', elevation: 80, current_weather: { temperature: +v.t.toFixed(1), windspeed: +(v.v * 3.6).toFixed(1), winddirection: 220, weathercode: 2, is_day: 1, time: t }, current: { time: t, interval: 900, temperature_2m: +v.t.toFixed(1), relative_humidity_2m: v.u, wind_speed_10m: +(v.v * 3.6).toFixed(1), weather_code: 2 } });
      }
      if (h === 'worldtimeapi.org' || h === 'timeapi.io') {
        const tz = decodeURIComponent(cale.replace(/^\/api\/(timezone|time\/current\/zone)\/?/, '')) || q('timeZone') || 'Europe/Bucharest';
        const dec = /Bucharest|Athens|Kiev|Kyiv|Chisinau|Helsinki|Sofia/.test(tz) ? 10800 : /London|Lisbon/.test(tz) ? 3600 : /Europe/.test(tz) ? 7200 : 0;
        const semn = (d) => (d >= 0 ? '+' : '-') + String(Math.floor(Math.abs(d) / 3600)).padStart(2, '0') + ':00';
        if (h === 'timeapi.io') { const d = new Date(acum + dec * 1000); return json({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), seconds: d.getUTCSeconds(), milliSeconds: d.getUTCMilliseconds(), dateTime: oraLocala(dec).slice(0, 26), date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16), timeZone: tz, dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()], dstActive: dec === 10800 }); }
        const d = new Date(acum + dec * 1000);
        return json({ abbreviation: dec === 10800 ? 'EEST' : 'UTC', client_ip: '86.124.10.77', datetime: oraLocala(dec) + semn(dec), day_of_week: d.getUTCDay(), day_of_year: Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5) + 1, dst: dec === 10800, dst_offset: dec === 10800 ? 3600 : 0, raw_offset: dec ? dec - (dec === 10800 ? 3600 : 0) : 0, timezone: tz, unixtime: Math.floor(acum / 1000), utc_datetime: new Date(acum).toISOString().replace('Z', '+00:00'), utc_offset: semn(dec), week_number: Math.ceil((((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5) + 1) / 7) });
      }
      if (h === 'ip-api.com') return json({ status: 'success', country: 'Romania', countryCode: 'RO', region: 'B', regionName: 'Bucuresti', city: 'Bucharest', zip: '', lat: 44.4323, lon: 26.1063, timezone: 'Europe/Bucharest', isp: 'RCS & RDS', org: '', as: 'AS8708 RCS & RDS SA', query: '86.124.10.77' });
      if (h === 'api.ipify.org' || h === 'api64.ipify.org') return q('format') === 'json' ? json({ ip: '86.124.10.77' }) : text('86.124.10.77');
      if (h === 'api.thingspeak.com') {
        if (/update/.test(cale)) { INTERNET.nrThingSpeak = (INTERNET.nrThingSpeak || 0) + 1; return text(String(INTERNET.nrThingSpeak)); }
        return json({ channel: { id: 1, name: 'Canalul meu', field1: 'Temperatura', created_at: '2026-01-01T00:00:00Z', last_entry_id: INTERNET.nrThingSpeak || 0 }, feeds: [{ created_at: new Date(acum).toISOString(), entry_id: INTERNET.nrThingSpeak || 0, field1: '22.5' }] });
      }
      if (h === 'maker.ifttt.com') { const m = /\/trigger\/([^/]+)/.exec(cale); return text('Congratulations! You\'ve fired the ' + (m ? m[1] : 'event') + ' event'); }
      if (h === 'api.telegram.org') {
        if (/getUpdates/.test(cale)) return json({ ok: true, result: [] });
        if (/getMe/.test(cale)) return json({ ok: true, result: { id: 7000000001, is_bot: true, first_name: 'ESP32 Bot', username: 'esp32_mester_bot' } });
        const txtM = q('text') || (() => { try { return JSON.parse(corp).text; } catch (e) { return ''; } })();
        return json({ ok: true, result: { message_id: Math.floor(acum / 1000) % 100000, from: { id: 7000000001, is_bot: true, first_name: 'ESP32 Bot' }, chat: { id: +(q('chat_id') || 123456789), type: 'private' }, date: Math.floor(acum / 1000), text: txtM || '' } });
      }
      if (h === 'api.callmebot.com') return text('<p><b>Message queued.</b> You will receive it in a few seconds.</p>', 'text/html');
      if (h === 'httpbin.org') {
        const args = {}; u.searchParams.forEach((v, k) => { args[k] = v; });
        if (cale === '/ip') return json({ origin: '86.124.10.77' });
        let jsonCorp = null; try { jsonCorp = JSON.parse(corp); } catch (e) { /* nu e JSON */ }
        return json({ args, data: corp || '', form: /=/.test(corp || '') && !jsonCorp ? Object.fromEntries(new URLSearchParams(corp)) : {}, headers: { Host: 'httpbin.org', 'User-Agent': 'ESP32HTTPClient' }, json: jsonCorp, origin: '86.124.10.77', url: url.replace(/^http:/, 'https:') });
      }
      if (h === 'jsonplaceholder.typicode.com') {
        const m = /^\/(todos|posts|users|comments)\/?(\d+)?/.exec(cale);
        if (metoda === 'POST') { let o = {}; try { o = JSON.parse(corp); } catch (e) { /* gol */ } return json(Object.assign(o, { id: 101 }), 201); }
        if (m && m[1] === 'todos') return json(m[2] ? { userId: 1, id: +m[2], title: 'delectus aut autem', completed: false } : [{ userId: 1, id: 1, title: 'delectus aut autem', completed: false }, { userId: 1, id: 2, title: 'quis ut nam facilis et officia qui', completed: false }]);
        if (m && m[1] === 'users') return json({ id: +(m[2] || 1), name: 'Leanne Graham', username: 'Bret', email: 'Sincere@april.biz' });
        return json({ userId: 1, id: +((m && m[2]) || 1), title: 'sunt aut facere repellat provident occaecati excepturi optio reprehenderit', body: 'quia et suscipit\nsuscipit recusandae consequuntur expedita et cum' });
      }
      if (h === 'api.coingecko.com') return json({ bitcoin: { usd: 64210, eur: 59180, ron: 294300 }, ethereum: { usd: 3120, eur: 2875, ron: 14300 } });
      if (h === 'api.coindesk.com') return json({ time: { updated: new Date(acum).toUTCString() }, bpi: { USD: { code: 'USD', rate: '64,210.1234', rate_float: 64210.1234 }, EUR: { code: 'EUR', rate: '59,180.5500', rate_float: 59180.55 } } });
      if (h === 'example.com' || h === 'example.org') return text('<!doctype html>\n<html>\n<head>\n    <title>Example Domain</title>\n</head>\n<body>\n<div>\n    <h1>Example Domain</h1>\n    <p>This domain is for use in illustrative examples in documents.</p>\n</div>\n</body>\n</html>\n', 'text/html; charset=UTF-8');
      if (h === 'google.com' || h === 'clients3.google.com' || h === 'connectivitycheck.gstatic.com') return /generate_204/.test(cale) ? text('', 'text/html', 204) : text('<!doctype html><html><head><title>Google</title></head><body></body></html>', 'text/html; charset=ISO-8859-1');
      return null;
    }
  };
  M.web.internet = INTERNET;

  // ---------- HTTPClient: cereri spre internet ----------
  const HTTPC = { HTTPC_ERROR_CONNECTION_REFUSED: -1, HTTPC_ERROR_SEND_HEADER_FAILED: -2, HTTPC_ERROR_SEND_PAYLOAD_FAILED: -3, HTTPC_ERROR_NOT_CONNECTED: -4, HTTPC_ERROR_CONNECTION_LOST: -5, HTTPC_ERROR_NO_STREAM: -6, HTTPC_ERROR_NO_HTTP_SERVER: -7, HTTPC_ERROR_TOO_LESS_RAM: -8, HTTPC_ERROR_ENCODING: -9, HTTPC_ERROR_STREAM_WRITE: -10, HTTPC_ERROR_READ_TIMEOUT: -11 };
  const TEXT_HTTPC = { '-1': 'connection refused', '-2': 'send header failed', '-3': 'send payload failed', '-4': 'not connected', '-5': 'connection lost', '-6': 'no stream', '-7': 'no HTTP server', '-8': 'too less ram', '-9': 'Transfer-Encoding not supported', '-10': 'Stream write error', '-11': 'read Timeout' };
  class HTTPClient {
    constructor() { this.url = ''; this.antete = {}; this.timeout = 5000; this.raspuns = null; this.antetDorite = []; this.urmeaza = false; }
    begin(a, b, c) {
      // begin(url) · begin(client, url) · begin(host, port, uri)
      const cuClient = a instanceof WiFiClient;
      let url = cuClient ? txt(b) : txt(a);
      if (!cuClient && typeof b === 'number') url = 'http://' + txt(a) + ':' + b + txt(c === undefined ? '/' : c);
      if (!/^https?:\/\//i.test(url)) { S().problema('http-url', 'avertisment', 'http.begin("' + url + '"): adresa trebuie să înceapă cu http:// sau https://.', { linie: linie() }); return false; }
      this.url = url; this.antete = {}; this.raspuns = null;
      return true;
    }
    addHeader(k, v) { this.antete[txt(k)] = txt(v); }
    setTimeout(ms) { this.timeout = ms; }
    setConnectTimeout() { }
    setUserAgent(u) { this.antete['User-Agent'] = txt(u); }
    setAuthorization(u, p) { this.antete.Authorization = 'Basic ' + (p === undefined ? txt(u) : btoa(txt(u) + ':' + txt(p))); }
    setFollowRedirects(m) { this.urmeaza = m !== 0; }
    setReuse() { }
    collectHeaders(nume) { this.antetDorite = Array.from(nume || []).map(x => txt(x)); }
    *GET() { return yield* this.sendRequest('GET'); }
    *POST(corp, n) { return yield* this.sendRequest('POST', corp, n); }
    *PUT(corp) { return yield* this.sendRequest('PUT', corp); }
    *PATCH(corp) { return yield* this.sendRequest('PATCH', corp); }
    *sendRequest(metoda, corp, n) {
      const sim = S();
      metoda = txt(metoda);
      if (!this.url) return -4;
      if (!NET.conectat(sim)) {
        sim.problema('http-wifi', 'avertisment', 'http.' + metoda + '() fără WiFi conectat: cererea nu pleacă (cod -1). Așteaptă WiFi.status() == WL_CONNECTED înainte.', { linie: linie() });
        yield { dorm: 20000 };
        return -1;
      }
      const u = new URL(this.url);
      // cereri spre propriul server al plăcii sau spre alt dispozitiv din rețeaua locală
      if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname)) {
        if (NET.adrese(sim).includes(u.hostname)) {
          const st = { gata: false };
          cerere(sim, { url: this.url, metoda, corp: corp === undefined ? '' : txt(corp) }).then(r => { st.r = r; st.gata = true; });
          yield { asteapta: () => st.gata ? true : undefined, pana: sim.timp + this.timeout * 1000, laExpirare: false, pas: 2000 };
          if (!st.gata || st.r.eroare) return -11;
          this.raspuns = { cod: st.r.cod, corp: st.r.corp, antete: st.r.anteturi || {} };
          return st.r.cod;
        }
        yield { dorm: 3000000 };
        return -1;
      }
      const st = { gata: false };
      const body = corp === undefined ? '' : (ArrayBuffer.isView(corp) ? String.fromCharCode(...corp.slice(0, n === undefined ? corp.length : n)) : txt(corp));
      const t0 = sim.timp;
      INTERNET.cere(sim, metoda, this.url, body, Object.assign({}, this.antete)).then(r => { Object.assign(st, r); st.gata = true; });
      sim.consuma(3000);
      // placa așteaptă răspunsul (timpul simulării curge cât durează cererea)
      yield { asteapta: () => st.gata && sim.timp >= t0 + (st.latenta || 0) ? true : undefined, pana: sim.timp + this.timeout * 1000, laExpirare: false, pas: 5000 };
      if (st.gata && sim.timp < t0 + (st.latenta || 0)) st.gata = false;
      if (!st.gata) {
        sim.problema('http-timeout', 'avertisment', 'Cererea către ' + u.hostname + ' nu a primit răspuns în ' + this.timeout + ' ms (read Timeout, cod -11). Dacă e un server al tău, scrie în fila Web → Jurnal ce ar răspunde, iar simularea îl va folosi.', { linie: linie() });
        INTERNET.jurnal(sim, { dir: 'iesire', metoda, url: this.url, cod: -11, durata: sim.timp - t0 });
        return -11;
      }
      if (st.eroare) {
        sim.problema('http-necunoscut', 'avertisment', 'Simularea nu poate ajunge la ' + u.hostname + ' (cod -1): paginile din browser nu au voie să ceară orice site. Deschide fila Web → Jurnal și scrie răspunsul pe care l-ar da serverul, apoi rulează din nou. Merg direct: OpenWeatherMap, Open-Meteo, WorldTimeAPI, ip-api, ThingSpeak, Telegram, IFTTT, httpbin, JSONPlaceholder.', { linie: linie() });
        INTERNET.jurnal(sim, { dir: 'iesire', metoda, url: this.url, cod: -1, eroare: true, durata: sim.timp - t0 });
        return -1;
      }
      this.raspuns = { cod: st.cod, corp: st.corp, antete: st.antete || {} };
      sim.consuma(st.corp.length * 0.5);
      INTERNET.jurnal(sim, { dir: 'iesire', metoda, url: this.url, cod: st.cod, sursa: st.sursa, corp: st.corp, durata: sim.timp - t0 });
      return st.cod;
    }
    getString() { if (!this.raspuns) return ''; if (this.raspuns.corp.length > 90000) S().problema('http-mare', 'avertisment', 'Răspunsul are ' + this.raspuns.corp.length + ' octeți; getString() îl pune tot în RAM, iar ESP32 are ~110 KB într-un singur bloc. Citește-l pe bucăți cu getStream().', { linie: linie() }); return this.raspuns.corp; }
    getSize() { return this.raspuns ? this.raspuns.corp.length : -1; }
    getStream() { const c = new WiFiClient(null); c._in = this.raspuns ? this.raspuns.corp : ''; c.deschis = !!this.raspuns; return c; }
    getStreamPtr() { return this.getStream(); }
    header(nume) { if (!this.raspuns) return ''; const n = txt(nume).toLowerCase(); for (const [k, v] of Object.entries(this.raspuns.antete)) if (k.toLowerCase() === n) return v; return ''; }
    hasHeader(nume) { return this.header(nume) !== ''; }
    headers() { return this.raspuns ? Object.keys(this.raspuns.antete).length : 0; }
    getLocation() { return this.header('location'); }
    connected() { return !!this.raspuns; }
    end() { this.raspuns = null; }
    static errorToString(c) { return TEXT_HTTPC[c] || ''; }
    errorToString(c) { return TEXT_HTTPC[c] || ''; }
  }
  HTTPClient.tipuri = { begin: 'bool', GET: 'int', POST: 'int', PUT: 'int', PATCH: 'int', sendRequest: 'int', getString: 'String', getSize: 'int', getStream: 'obj:WiFiClient', getStreamPtr: 'obj:WiFiClient', header: 'String', hasHeader: 'bool', headers: 'int', getLocation: 'String', connected: 'bool', errorToString: 'String' };
  HTTPClient.tipuriStatice = { errorToString: 'String' };
  api.clasa('HTTPClient', HTTPClient);
  Object.assign(api.constante, HTTPC, {
    HTTP_CODE_OK: 200, HTTP_CODE_CREATED: 201, HTTP_CODE_NO_CONTENT: 204, HTTP_CODE_MOVED_PERMANENTLY: 301, HTTP_CODE_FOUND: 302, HTTP_CODE_BAD_REQUEST: 400, HTTP_CODE_UNAUTHORIZED: 401, HTTP_CODE_FORBIDDEN: 403, HTTP_CODE_NOT_FOUND: 404, HTTP_CODE_INTERNAL_SERVER_ERROR: 500,
    HTTPC_DISABLE_FOLLOW_REDIRECTS: 0, HTTPC_STRICT_FOLLOW_REDIRECTS: 1, HTTPC_FORCE_FOLLOW_REDIRECTS: 2
  });

  // ---------- mDNS ----------
  class MDNSResponder {
    begin(nume) { const n = NET.stare(S()); n.mdns = txt(nume); S().consuma(20000); return true; }
    end() { NET.stare(S()).mdns = ''; }
    addService() { return true; } addServiceTxt() { return true; } setInstanceName() { }
    queryService() { return 0; }
  }
  MDNSResponder.tipuri = { begin: 'bool', addService: 'bool', queryService: 'int' };
  api.clasa('MDNSResponder', MDNSResponder);
  api.obiecte.MDNS = 'MDNSResponder';

  // ---------- WiFiUDP și NTPClient ----------
  class WiFiUDP extends api.clase.Stream {
    begin() { return 1; } stop() { }
    beginPacket() { return NET.conectat(S()) ? 1 : 0; } endPacket() { return NET.conectat(S()) ? 1 : 0; }
    parsePacket() { return 0; } remoteIP() { return ip('0.0.0.0'); } remotePort() { return 0; }
    _scrie() { }
  }
  WiFiUDP.tipuri = Object.assign({}, api.clase.Stream.tipuri, { begin: 'uint8_t', beginPacket: 'int', endPacket: 'int', parsePacket: 'int', remoteIP: 'obj:IPAddress' });
  api.clasa('WiFiUDP', WiFiUDP);
  api.clasa('NetworkUDP', WiFiUDP);
  class NTPClient {
    constructor(udp, a, b, c) {
      // NTPClient(udp) · (udp, server) · (udp, server, decalaj) · (udp, server, decalaj, interval)
      this.server = typeof a === 'string' || a instanceof Uint8Array ? txt(a) : 'pool.ntp.org';
      this.decalaj = typeof a === 'number' ? a : (b || 0);
      this.interval = c || 60000;
      this.epoca = 0; this.ultim = -1e12; this.setat = false;
    }
    begin() { }
    end() { }
    setTimeOffset(s) { this.decalaj = s; }
    setUpdateInterval(ms) { this.interval = ms; }
    setPoolServerName(s) { this.server = txt(s); }
    *forceUpdate() {
      const sim = S();
      if (!NET.conectat(sim)) { yield { dorm: 1000000 }; return false; }
      yield { dorm: 25000 + Math.floor(Math.random() * 40000) };
      if (!sim.epocaStart) sim.epocaStart = Date.now() / 1000;
      this.epoca = sim.epocaStart + sim.timp / 1e6; this.ultim = sim.timp; this.setat = true;
      return true;
    }
    *update() { const sim = S(); if (!this.setat || sim.timp - this.ultim >= this.interval * 1000) return yield* this.forceUpdate(); return false; }
    isTimeSet() { return this.setat; }
    getEpochTime() { if (!this.setat) return this.decalaj + Math.floor(S().timp / 1e6); return Math.floor(this.epoca + this.decalaj + (S().timp - this.ultim) / 1e6); }
    getDay() { return (Math.floor(this.getEpochTime() / 86400) + 4) % 7; }
    getHours() { return Math.floor(this.getEpochTime() % 86400 / 3600); }
    getMinutes() { return Math.floor(this.getEpochTime() % 3600 / 60); }
    getSeconds() { return this.getEpochTime() % 60; }
    getFormattedTime() { const d2 = (x) => String(x).padStart(2, '0'); return d2(this.getHours()) + ':' + d2(this.getMinutes()) + ':' + d2(this.getSeconds()); }
  }
  NTPClient.tipuri = { update: 'bool', forceUpdate: 'bool', isTimeSet: 'bool', getEpochTime: 'unsigned long', getDay: 'int', getHours: 'int', getMinutes: 'int', getSeconds: 'int', getFormattedTime: 'String' };
  api.clasa('NTPClient', NTPClient);

  api.creatoriObiecte.push((sim) => {
    // la resetarea plăcii radioul se oprește; serverele trebuie pornite din nou din cod
    if (sim && sim.__net) { const n = sim.__net; n.token++; n.stare = 255; n.mod = 0; n.ap = null; n.servere.clear(); n.evenimente = []; n.scanare = null; sim.emit('retea', { tip: 'reset' }); }
    if (sim) { sim.wifiConectat = false; }
    return { WiFi: new WiFiClass(), MDNS: new MDNSResponder() };
  });
  api.include('WiFi.h', 'WiFiClient.h', 'WiFiServer.h', 'WiFiUdp.h', 'WiFiClientSecure.h', 'WiFiMulti.h', 'WebServer.h', 'HTTPClient.h', 'ESPmDNS.h', 'ESPAsyncWebServer.h', 'AsyncTCP.h', 'NTPClient.h', 'ESP8266WiFi.h', 'ESP8266WebServer.h', 'ESP8266HTTPClient.h', 'ESP8266mDNS.h', 'Network.h', 'NetworkClient.h', 'esp_wifi.h');

  // WiFiMulti: încearcă pe rând rețelele adăugate
  class WiFiMulti {
    constructor() { this.retele = []; }
    addAP(s, p) { this.retele.push([txt(s), p === undefined ? '' : txt(p)]); return true; }
    *run(timeout) {
      const sim = S(), n = NET.stare(sim);
      if (n.stare === 3) return 3;
      if (!this.retele.length) return 6;
      const w = sim.obiecte.WiFi;
      w.begin(this.retele[0][0], this.retele[0][1]);
      return yield* w.waitForConnectResult(timeout || 5000);
    }
  }
  WiFiMulti.tipuri = { addAP: 'bool', run: 'uint8_t' };
  api.clasa('WiFiMulti', WiFiMulti);
})(window.M = window.M || {});
