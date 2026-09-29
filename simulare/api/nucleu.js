/* Meșter — API-ul Arduino de bază pentru simulare: pini, timp, PWM (LEDC), ADC,
   întreruperi, Serial, funcții matematice și de text din C, sprintf, ESP, Preferences, EEPROM. */
(function (M) {
  'use strict';
  const S = () => M.simCurenta;
  const Err = M.EroareRulare;
  const txt = M.ajutoareR.txt;

  const api = M.api = M.api || { constante: {}, functii: {}, obiecte: {}, clase: {}, macrouri: {}, tipuriNumerice: {}, tipuriTablou: {}, includeri: new Set(), creatoriObiecte: [], constantePlatforma: {}, tipConstante: {} };
  api.clasa = function (nume, cls, optiuni) { api.clase[nume] = cls; if (optiuni) Object.assign(cls, optiuni); return cls; };
  api.functie = function (nume, f, ret) { if (ret) f.ret = ret; api.functii[nume] = f; return f; };
  api.include = function (...n) { for (const x of n) api.includeri.add(x); };
  api.creeazaObiecte = function (sim) {
    const o = {};
    for (const f of api.creatoriObiecte) Object.assign(o, f(sim) || {});
    return o;
  };
  // constantele plăcii + ale platformei, pentru compilator
  api.infoCompilare = function (placa) {
    const pl = placa && placa.cip ? placa.cip.platforma : 'esp32';
    return {
      platforma: pl,
      constante: Object.assign({}, api.constantePlatforma[pl] || {}, placa ? placa.constante : {}),
      macrouri: Object.assign({}, placa ? placa.macrouri : {})
    };
  };

  // ---------- constante ----------
  Object.assign(api.constante, {
    HIGH: 1, LOW: 0, DEC: 10, HEX: 16, OCT: 8, BIN: 2, LSBFIRST: 0, MSBFIRST: 1,
    PI: Math.PI, HALF_PI: Math.PI / 2, TWO_PI: Math.PI * 2, DEG_TO_RAD: Math.PI / 180, RAD_TO_DEG: 180 / Math.PI, EULER: Math.E, M_PI: Math.PI, M_PI_2: Math.PI / 2, M_E: Math.E, M_SQRT2: Math.SQRT2,
    INT_MAX: 2147483647, INT_MIN: -2147483648, UINT_MAX: 4294967295, LONG_MAX: 2147483647, LONG_MIN: -2147483648, ULONG_MAX: 4294967295,
    INT8_MAX: 127, INT8_MIN: -128, UINT8_MAX: 255, INT16_MAX: 32767, INT16_MIN: -32768, UINT16_MAX: 65535, INT32_MAX: 2147483647, INT32_MIN: -2147483648, UINT32_MAX: 4294967295,
    FLT_MAX: 3.4028234663852886e+38, FLT_MIN: 1.1754943508222875e-38, DBL_MAX: Number.MAX_VALUE, FLT_EPSILON: 1.1920928955078125e-7,
    NAN: NaN, INFINITY: Infinity, RAND_MAX: 2147483647, EOF: -1,
    ADC_0db: 0, ADC_2_5db: 1, ADC_6db: 2, ADC_11db: 3, ADC_ATTENDB_MAX: 3, ADC_ATTEN_DB_0: 0, ADC_ATTEN_DB_2_5: 1, ADC_ATTEN_DB_6: 2, ADC_ATTEN_DB_11: 3, ADC_ATTEN_DB_12: 3,
    portTICK_PERIOD_MS: 1, portTICK_RATE_MS: 1, portMAX_DELAY: 4294967295, pdTRUE: 1, pdFALSE: 0, pdPASS: 1, pdFAIL: 0, errQUEUE_FULL: 0, tskIDLE_PRIORITY: 0, configMAX_PRIORITIES: 25,
    APP_CPU_NUM: 1, PRO_CPU_NUM: 0, tskNO_AFFINITY: 2147483647, configTICK_RATE_HZ: 1000, configMINIMAL_STACK_SIZE: 768,
    ESP_OK: 0, ESP_FAIL: -1, ESP_ERR_TIMEOUT: 263, ESP_ERR_INVALID_ARG: 258,
    ESP_SLEEP_WAKEUP_UNDEFINED: 0, ESP_SLEEP_WAKEUP_ALL: 1, ESP_SLEEP_WAKEUP_EXT0: 2, ESP_SLEEP_WAKEUP_EXT1: 3, ESP_SLEEP_WAKEUP_TIMER: 4, ESP_SLEEP_WAKEUP_TOUCHPAD: 5, ESP_SLEEP_WAKEUP_ULP: 6, ESP_SLEEP_WAKEUP_GPIO: 7,
    ESP_EXT1_WAKEUP_ALL_LOW: 0, ESP_EXT1_WAKEUP_ANY_HIGH: 1,
    SERIAL_8N1: 0x800001c, SERIAL_8N2: 0x800003c, SERIAL_8E1: 0x800001e, SERIAL_7N1: 0x8000018,
    ESP_RST_POWERON: 1, ESP_RST_SW: 3, ESP_RST_PANIC: 4, ESP_RST_DEEPSLEEP: 8, ESP_RST_BROWNOUT: 9,
    CHANGE_ALL: 3
  });
  for (let i = 0; i <= 48; i++) api.constante['GPIO_NUM_' + i] = i;
  api.constante.GPIO_NUM_NC = -1;
  api.constantePlatforma.esp32 = { INPUT: 1, OUTPUT: 3, PULLUP: 4, INPUT_PULLUP: 5, PULLDOWN: 8, INPUT_PULLDOWN: 9, OPEN_DRAIN: 16, OUTPUT_OPEN_DRAIN: 19, ANALOG: 192, RISING: 1, FALLING: 2, CHANGE: 3, ONLOW: 4, ONHIGH: 5, ONLOW_WE: 12, ONHIGH_WE: 13 };
  api.constantePlatforma.esp8266 = { INPUT: 0, OUTPUT: 1, INPUT_PULLUP: 2, INPUT_PULLDOWN_16: 4, OUTPUT_OPEN_DRAIN: 3, WAKEUP_PULLUP: 5, WAKEUP_PULLDOWN: 7, RISING: 1, FALLING: 2, CHANGE: 3, ONLOW: 4, ONHIGH: 5 };
  api.constantePlatforma.avr = { INPUT: 0, OUTPUT: 1, INPUT_PULLUP: 2, RISING: 3, FALLING: 2, CHANGE: 1 };
  api.tipConstante.ULONG_MAX = 'unsigned long';
  api.tipConstante.UINT_MAX = 'unsigned long';
  api.tipConstante.UINT32_MAX = 'unsigned long';
  api.tipConstante.portMAX_DELAY = 'unsigned long';
  api.tipConstante.PI = 'double';

  function modPin(mod) {
    const pl = S().cip ? S().cip.platforma : 'esp32';
    if (pl === 'esp32') {
      switch (mod) {
        case 1: return 'INPUT'; case 3: case 2: return 'OUTPUT'; case 5: case 4: return 'INPUT_PULLUP'; case 9: case 8: return 'INPUT_PULLDOWN';
        case 19: case 16: case 18: return 'OUTPUT_OPEN_DRAIN'; case 192: return 'ANALOG'; case 0: return 'INPUT';
      }
      return 'INPUT';
    }
    if (pl === 'esp8266') return ({ 0: 'INPUT', 1: 'OUTPUT', 2: 'INPUT_PULLUP', 4: 'INPUT_PULLDOWN', 3: 'OUTPUT_OPEN_DRAIN' })[mod] || 'INPUT';
    return ({ 0: 'INPUT', 1: 'OUTPUT', 2: 'INPUT_PULLUP' })[mod] || 'INPUT';
  }
  function modIntrerupere(mod) {
    const pl = S().cip ? S().cip.platforma : 'esp32';
    if (pl === 'avr') return ({ 0: 'ONLOW', 1: 'CHANGE', 2: 'FALLING', 3: 'RISING' })[mod] || 'CHANGE';
    return ({ 1: 'RISING', 2: 'FALLING', 3: 'CHANGE', 4: 'ONLOW', 5: 'ONHIGH', 12: 'ONLOW', 13: 'ONHIGH' })[mod] || 'CHANGE';
  }
  function linie() { const s = S(); return s && s.R ? s.R.L : 0; }
  function eEsp32() { const s = S(); return s.cip && s.cip.platforma === 'esp32'; }

  // ---------- pini digitali ----------
  const f = api.functii;
  api.functie('pinMode', function pinMode(p, mod) {
    const sim = S();
    const g = +p;
    if (sim.placa && sim.placa.rgbPin !== undefined && g === (sim.placa.constante.LED_BUILTIN)) return; // LED RGB integrat (S3)
    const st = sim.pin(g, 'pinMode');
    if (!st) return;
    const m = modPin(mod);
    const cip = sim.cip;
    if ((m === 'OUTPUT' || m === 'OUTPUT_OPEN_DRAIN') && cip.doarIntrare.includes(g)) {
      sim.problema('doar-intrare-' + g, 'eroare', 'GPIO' + g + ' poate fi doar intrare pe ' + cip.cip + ' — pinMode(' + g + ', OUTPUT) nu are efect.', { linie: linie(), gpio: g });
      return;
    }
    if ((m === 'INPUT_PULLUP' || m === 'INPUT_PULLDOWN') && (cip.faraPull || []).includes(g)) {
      sim.problema('fara-pull-' + g, 'avertisment', 'GPIO' + g + ' nu are rezistență internă de pull-up/pull-down pe ' + cip.cip + '. Pune o rezistență externă (10 kΩ).', { linie: linie(), gpio: g });
    }
    if (cip.psram && cip.psram.includes(g)) sim.problema('psram-' + g, 'eroare', 'GPIO' + g + ' e folosit de memoria PSRAM pe modulele N16R8/N8R8 — nu îl folosi.', { linie: linie(), gpio: g });
    if (cip.usb && cip.usb.includes(g)) sim.problema('usb-' + g, 'avertisment', 'GPIO' + g + ' e folosit de USB-ul nativ. Dacă îl folosești, se pierde conexiunea USB/Serial.', { linie: linie(), gpio: g });
    st.mod = m;
    st.pwm = null; st.dac = null;
    if (st.ledc) st.ledc = null;
    sim.murdar(st.element ? st.element.net : -1);
    const net = sim.netGPIO(g);
    if (net >= 0 && (m === 'OUTPUT')) sim.notificaNet(net, st.nivel);
    sim.verificaIntreruperi();
  }, 'void');

  function scrieNivel(sim, st, g, v) {
    const vechi = st.nivel;
    st.nivel = v ? 1 : 0;
    if (st.pwm) { st.pwm = null; st.ledc = null; }
    if (st.dac !== null && st.dac !== undefined) st.dac = null;
    const net = sim.netGPIO(g);
    if (vechi !== st.nivel || true) {
      sim.circuit.murdarNet(net);
      if (net >= 0 && (st.mod === 'OUTPUT' || st.mod === 'OUTPUT_OPEN_DRAIN')) {
        sim.notificaNet(net, st.mod === 'OUTPUT_OPEN_DRAIN' && st.nivel ? undefined : st.nivel);
        if (sim.intreruperi.length) sim.verificaIntreruperi();
      }
    }
  }
  api.functie('digitalWrite', function digitalWrite(p, v) {
    const sim = S();
    const g = +p;
    sim.consuma(0.05);
    if (sim.placa && sim.placa.rgbPin !== undefined && g === sim.placa.constante.LED_BUILTIN) {
      const b = sim.placa.constante.RGB_BRIGHTNESS || 64;
      sim.rgbPlaca = v ? [b, b, b] : [0, 0, 0];
      return;
    }
    const st = sim.pin(g, 'digitalWrite');
    if (!st) return;
    if (st.mod === 'INPUT' || st.mod === 'INPUT_PULLUP' || st.mod === 'INPUT_PULLDOWN') {
      if (sim.cip.platforma === 'avr') {
        // pe AVR, digitalWrite(HIGH) pe un pin de intrare activează pull-up-ul
        st.mod = v ? 'INPUT_PULLUP' : 'INPUT';
        sim.circuit.murdarNet(sim.netGPIO(g));
        return;
      }
      sim.problema('dw-intrare-' + g, 'avertisment', 'digitalWrite(' + g + ', …) pe un pin care nu e setat ca ieșire. Lipsește pinMode(' + g + ', OUTPUT) în setup()?', { linie: linie(), gpio: g });
      st.nivel = v ? 1 : 0;
      return;
    }
    scrieNivel(sim, st, g, v);
  }, 'void');

  api.functie('digitalRead', function digitalRead(p) {
    const sim = S();
    const g = +p;
    sim.consuma(0.05);
    const st = sim.pin(g, 'digitalRead');
    if (!st) return 0;
    const net = sim.netGPIO(g);
    if (net < 0) {
      if (st.mod === 'OUTPUT') return st.nivel;
      if (st.mod === 'INPUT_PULLUP') return 1;
      if (st.mod === 'INPUT_PULLDOWN') return 0;
      return Math.random() < 0.5 ? 1 : 0;
    }
    if (sim.circuit.flotant(net)) {
      if (st.mod === 'INPUT' && !st.avertizatFlotant) {
        sim.problema('flotant-' + g, 'avertisment', 'GPIO' + g + ' e „în aer” (flotant): nu e legat nici la 3,3 V, nici la GND. digitalRead() întoarce valori la întâmplare. Folosește INPUT_PULLUP sau pune o rezistență de 10 kΩ.', { linie: linie(), gpio: g });
      }
      // un pin flotant își schimbă rar valoarea — simulăm zgomot lent
      if (st.ultimFlotant === undefined || Math.random() < 0.08) st.ultimFlotant = Math.random() < 0.5 ? 1 : 0;
      return st.ultimFlotant;
    }
    const v = sim.circuit.tensiune(net);
    const vdd = sim.cip.vdd;
    if (v > vdd * 0.75) return 1;
    if (v < vdd * 0.25) return 0;
    sim.problema('nedefinit-' + g, 'avertisment', 'Pe GPIO' + g + ' sunt ' + M.fmtV(v) + ' — o tensiune între LOW și HIGH. Citirea e nesigură.', { linie: linie(), gpio: g });
    return v > vdd / 2 ? 1 : 0;
  }, 'int');

  // ---------- ADC ----------
  let rezolutieAdc = 12, atenuare = 3;
  api.functie('analogReadResolution', function analogReadResolution(b) { rezolutieAdc = Math.max(1, Math.min(16, b | 0)); }, 'void');
  api.functie('analogSetAttenuation', function analogSetAttenuation(a) { atenuare = a; }, 'void');
  api.functie('analogSetPinAttenuation', function analogSetPinAttenuation(p, a) { const st = S().pin(+p); if (st) st.atenuare = a; }, 'void');
  api.functie('analogSetWidth', function analogSetWidth(b) { rezolutieAdc = b; }, 'void');
  api.functie('adcAttachPin', function adcAttachPin() { return true; }, 'bool');
  function citireAdc(g, milivolti) {
    const sim = S();
    const cip = sim.cip;
    const st = sim.pin(g, 'analogRead');
    if (!st) return 0;
    const esteAdc = cip.adc1.includes(g) || cip.adc2.includes(g);
    if (!esteAdc) {
      sim.problema('adc-' + g, 'eroare', (cip.platforma === 'avr' ? 'Pinul ' : 'GPIO') + g + ' nu poate citi valori analogice pe ' + cip.cip + '. ' + (cip.platforma === 'esp32' ? 'Folosește un pin ADC1 (ex. ' + cip.adc1.slice(0, 4).join(', ') + ').' : ''), { linie: linie(), gpio: g });
      return 0;
    }
    if (cip.adc2.includes(g) && sim.wifiPornit && cip.platforma === 'esp32') {
      sim.problema('adc2-wifi-' + g, 'eroare', 'GPIO' + g + ' e pe ADC2, care nu funcționează cât timp WiFi e pornit. Mută senzorul pe un pin ADC1 (' + cip.adc1.slice(0, 6).join(', ') + ').', { linie: linie(), gpio: g });
      return 0;
    }
    sim.consuma(cip.platforma === 'avr' ? 112 : 40);
    const net = sim.netGPIO(g);
    let v;
    if (net < 0 || sim.circuit.flotant(net)) {
      if (!st.avertizatAdc) sim.problema('adc-flotant-' + g, 'avertisment', 'analogRead(' + g + ') citește un pin neconectat — valorile vor fi aleatoare.', { linie: linie(), gpio: g });
      v = (st.vFlotant = Math.max(0, Math.min(cip.vdd, (st.vFlotant || cip.vdd * 0.3) + (Math.random() - 0.5) * 0.2)));
    } else v = sim.circuit.tensiune(net);
    if (isNaN(v)) v = 0;
    if (cip.platforma === 'avr') {
      const r = Math.round(Math.max(0, Math.min(1023, v / 5 * 1023 + (Math.random() - 0.5) * 1.2)));
      return milivolti ? Math.round(v * 1000) : r;
    }
    if (cip.platforma === 'esp8266') {
      const r = Math.round(Math.max(0, Math.min(1023, v / 3.2 * 1023 + (Math.random() - 0.5) * 2)));
      return milivolti ? Math.round(v * 1000) : r;
    }
    const at = st.atenuare !== undefined ? st.atenuare : atenuare;
    const vmax = at === 0 ? 0.95 : at === 1 ? 1.25 : at === 2 ? 1.75 : cip.adcVmax;
    const vmin = at === 3 ? cip.adcVmin : 0.05;
    if (milivolti) return Math.round(Math.max(0, Math.min(vmax, v)) * 1000 + (Math.random() - 0.5) * 6);
    // ADC-ul ESP32 e neliniar la capete: „zonă moartă” jos și saturare sus
    let x = (v - vmin) / (vmax - vmin);
    x = Math.max(0, Math.min(1, x));
    const maxim = (1 << rezolutieAdc) - 1;
    let r = x * 4095 + (x > 0 && x < 1 ? (Math.random() - 0.5) * 12 : 0);
    r = Math.max(0, Math.min(4095, Math.round(r)));
    return Math.round(r * maxim / 4095);
  }
  api.functie('analogRead', function analogRead(p) { return citireAdc(+p, false); }, 'int');
  api.functie('analogReadMilliVolts', function analogReadMilliVolts(p) { return citireAdc(+p, true); }, 'unsigned long');

  // ---------- PWM ----------
  let rezolutiePwm = 8, frecventaPwm = 1000, gamaPwm8266 = 255;
  const canaleLedc = {};
  function setPwm(sim, g, frecventa, duty, sursa) {
    const st = sim.pin(g, 'PWM');
    if (!st) return;
    if (sim.cip.doarIntrare.includes(g)) { sim.problema('doar-intrare-' + g, 'eroare', 'GPIO' + g + ' e doar intrare; nu poate genera PWM.', { linie: linie() }); return; }
    if (st.mod !== 'OUTPUT') st.mod = 'OUTPUT';
    st.pwm = { frecventa, duty: Math.max(0, Math.min(1, duty)), sursa };
    st.dac = null;
    const net = sim.netGPIO(g);
    sim.circuit.murdarNet(net);
    if (net >= 0) sim.notificaNet(net, duty >= 0.5 ? 1 : 0);
  }
  api.setPwm = (g, frecventa, duty, sursa) => setPwm(S(), g, frecventa, duty, sursa);
  api.functie('analogWriteResolution', function analogWriteResolution(a, b) { if (b === undefined) rezolutiePwm = a; else { const st = S().pin(+a); if (st) st.rezPwm = b; } }, 'void');
  api.functie('analogWriteFrequency', function analogWriteFrequency(a, b) { if (b === undefined) frecventaPwm = a; else { const st = S().pin(+a); if (st) st.frPwm = b; } }, 'void');
  api.functie('analogWriteRange', function analogWriteRange(r) { gamaPwm8266 = r; }, 'void');
  api.functie('analogWrite', function analogWrite(p, v) {
    const sim = S();
    const g = +p;
    const cip = sim.cip;
    if (cip.platforma === 'avr') {
      const st = sim.pin(g); if (!st) return;
      if (st.mod !== 'OUTPUT') { st.mod = 'OUTPUT'; }
      if (!cip.pwm.includes(g)) {
        sim.problema('pwm-avr-' + g, 'avertisment', 'Pinul ' + g + ' nu are PWM pe Arduino Nano (doar 3, 5, 6, 9, 10, 11). analogWrite() îl pune doar pe LOW sau HIGH.', { linie: linie() });
        scrieNivel(sim, st, g, v >= 128 ? 1 : 0);
        return;
      }
      if (v <= 0) return scrieNivel(sim, st, g, 0);
      if (v >= 255) return scrieNivel(sim, st, g, 1);
      setPwm(sim, g, g === 5 || g === 6 ? 980 : 490, v / 255, 'analogWrite');
      return;
    }
    if (cip.platforma === 'esp8266') {
      const st = sim.pin(g); if (!st) return;
      if (g === 16) { sim.problema('pwm-16', 'avertisment', 'GPIO16 (D0) nu suportă PWM pe ESP8266.', { linie: linie() }); return; }
      setPwm(sim, g, 1000, v / gamaPwm8266, 'analogWrite');
      return;
    }
    const st = sim.pin(g); if (!st) return;
    const rez = st.rezPwm || rezolutiePwm;
    const max = (1 << rez) - 1;
    setPwm(sim, g, st.frPwm || frecventaPwm, Math.max(0, v) / max, 'analogWrite');
  }, 'void');
  // LEDC — API din nucleul 3.x (pe pin)
  api.functie('ledcAttach', function ledcAttach(p, fr, rez) {
    const sim = S(); const st = sim.pin(+p, 'ledcAttach'); if (!st) return false;
    if (!eEsp32()) { sim.problema('ledc-platforma', 'eroare', 'ledcAttach există doar pe ESP32.', { linie: linie() }); return false; }
    st.ledc = { fr, rez, duty: 0 };
    st.mod = 'OUTPUT';
    setPwm(sim, +p, fr, 0, 'ledc');
    return true;
  }, 'bool');
  api.functie('ledcAttachChannel', function ledcAttachChannel(p, fr, rez, ch) { canaleLedc[ch] = { fr, rez, pini: [+p] }; return f.ledcAttach(p, fr, rez); }, 'bool');
  // LEDC — API din nucleul 2.x (pe canal)
  api.functie('ledcSetup', function ledcSetup(ch, fr, rez) {
    const sim = S();
    sim.problema('ledc-2x', 'info', 'ledcSetup()/ledcAttachPin() sunt din nucleul ESP32 2.x. În nucleul 3.x (cel actual) folosește ledcAttach(pin, frecvență, rezoluție) și ledcWrite(pin, valoare).', { linie: linie() });
    canaleLedc[ch] = Object.assign(canaleLedc[ch] || { pini: [] }, { fr, rez, v2: true });
    return fr;
  }, 'unsigned long');
  api.functie('ledcAttachPin', function ledcAttachPin(p, ch) {
    const sim = S(); const st = sim.pin(+p, 'ledcAttachPin'); if (!st) return;
    const c = canaleLedc[ch] = canaleLedc[ch] || { fr: 5000, rez: 8, pini: [], v2: true };
    if (!c.pini.includes(+p)) c.pini.push(+p);
    st.ledc = { canal: ch, fr: c.fr, rez: c.rez, duty: 0 };
    st.mod = 'OUTPUT';
    setPwm(sim, +p, c.fr, 0, 'ledc');
  }, 'void');
  api.functie('ledcDetachPin', function ledcDetachPin(p) { const st = S().pin(+p); if (st) { st.ledc = null; st.pwm = null; S().murdar(S().netGPIO(+p)); } }, 'void');
  api.functie('ledcDetach', function ledcDetach(p) { f.ledcDetachPin(p); return true; }, 'bool');
  api.functie('ledcWrite', function ledcWrite(x, duty) {
    const sim = S();
    const c = canaleLedc[x];
    if (c && c.v2 && c.pini.length) {
      for (const g of c.pini) { const st = sim.pin(g); if (st) { st.ledc.duty = duty; setPwm(sim, g, c.fr, duty / ((1 << c.rez) - 1 || 1), 'ledc'); } }
      return true;
    }
    const st = sim.pin(+x, 'ledcWrite');
    if (!st) return false;
    if (!st.ledc) {
      sim.problema('ledc-neatasat-' + x, 'eroare', 'ledcWrite(' + x + ', …): pinul nu a fost atașat cu ledcAttach(' + x + ', frecvență, rezoluție).', { linie: linie() });
      return false;
    }
    const rez = st.ledc.rez;
    st.ledc.duty = duty;
    setPwm(sim, +x, st.ledc.fr, duty / (Math.pow(2, rez) - 1), 'ledc');
    return true;
  }, 'bool');
  api.functie('ledcRead', function ledcRead(x) { const st = S().pin(+x); return st && st.ledc ? st.ledc.duty : 0; }, 'unsigned long');
  api.functie('ledcReadFreq', function ledcReadFreq(x) { const st = S().pin(+x); return st && st.pwm ? st.pwm.frecventa : 0; }, 'unsigned long');
  api.functie('ledcChangeFrequency', function ledcChangeFrequency(x, fr, rez) {
    const sim = S(); const st = sim.pin(+x); if (!st || !st.ledc) return 0;
    st.ledc.fr = fr; if (rez) st.ledc.rez = rez;
    if (st.pwm) setPwm(sim, +x, fr, st.pwm.duty, 'ledc');
    return fr;
  }, 'unsigned long');
  api.functie('ledcWriteTone', function ledcWriteTone(x, fr) {
    const sim = S();
    const c = canaleLedc[x];
    const pini = c && c.v2 ? c.pini : [+x];
    for (const g of pini) { if (fr > 0) setPwm(sim, g, fr, 0.5, 'ton'); else { const st = sim.pin(g); if (st) { st.pwm = null; st.nivel = 0; sim.murdar(sim.netGPIO(g)); sim.notificaNet(sim.netGPIO(g), 0); } } }
    return fr;
  }, 'unsigned long');
  api.functie('ledcWriteNote', function ledcWriteNote(x, nota, octava) {
    const frecv = [4186.01, 4434.92, 4698.63, 4978.03, 5274.04, 5587.65, 5919.91, 6271.93, 6644.88, 7040, 7458.62, 7902.13];
    return f.ledcWriteTone(x, frecv[nota] / Math.pow(2, 8 - octava));
  }, 'unsigned long');
  Object.assign(api.constante, { NOTE_C: 0, NOTE_Cs: 1, NOTE_D: 2, NOTE_Eb: 3, NOTE_E: 4, NOTE_F: 5, NOTE_Fs: 6, NOTE_G: 7, NOTE_Gs: 8, NOTE_A: 9, NOTE_Bb: 10, NOTE_B: 11 });
  api.functie('dacWrite', function dacWrite(p, v) {
    const sim = S(); const g = +p;
    if (!sim.cip.dac || !sim.cip.dac[g]) { sim.problema('dac-' + g, 'eroare', (sim.cip.cip) + (Object.keys(sim.cip.dac || {}).length ? ': doar GPIO25 și GPIO26 au DAC.' : ' nu are DAC (convertor digital-analogic).'), { linie: linie() }); return; }
    const st = sim.pin(g); st.mod = 'OUTPUT'; st.pwm = null;
    st.dac = 0.09 + Math.max(0, Math.min(255, v)) / 255 * 3.07;
    sim.murdar(sim.netGPIO(g));
    sim.notificaNet(sim.netGPIO(g));
  }, 'void');
  api.functie('dacDisable', function dacDisable(p) { const st = S().pin(+p); if (st) { st.dac = null; S().murdar(S().netGPIO(+p)); } }, 'void');
  api.functie('tone', function tone(p, fr, durata) {
    const sim = S(); const g = +p;
    if (fr <= 0) return f.noTone(p);
    setPwm(sim, g, fr, 0.5, 'ton');
    const st = sim.pin(g);
    if (st) st.idTon = (st.idTon || 0) + 1;
    if (durata > 0) { const id = st.idTon; sim.programeaza(durata * 1000, () => { if (st.idTon === id) f.noTone(p); }, 'mcu'); }
  }, 'void');
  api.functie('noTone', function noTone(p) {
    const sim = S(); const g = +p; const st = sim.pin(g); if (!st) return;
    st.pwm = null; st.nivel = 0; st.idTon = (st.idTon || 0) + 1;
    sim.murdar(sim.netGPIO(g)); sim.notificaNet(sim.netGPIO(g), 0);
  }, 'void');

  // ---------- senzorul tactil ESP32 ----------
  api.functie('touchRead', function touchRead(p) {
    const sim = S(); const g = +p; const cip = sim.cip;
    if (!cip.touch || cip.touch[g] === undefined) {
      sim.problema('touch-' + g, 'eroare', (cip.platforma === 'esp32' ? 'GPIO' + g + ' nu este pin tactil. ' : '') + (Object.keys(cip.touch || {}).length ? 'Pinii tactili sunt: ' + Object.keys(cip.touch).join(', ') + '.' : cip.cip + ' nu are senzori tactili capacitivi.'), { linie: linie() });
      return 0;
    }
    sim.consuma(500);
    const pad = sim.cautaDupaPin(['pad-tactil'], 'P', g)[0];
    const liber = cip.touchLiber, atins = cip.touchAtins;
    let v;
    if (!pad) v = cip.touchCrescator ? liber * 0.9 : Math.round(liber * 0.08 + 60);
    else {
      const f2 = pad.apasare();
      v = liber + (atins - liber) * f2;
    }
    return Math.max(0, Math.round(v + (Math.random() - 0.5) * (cip.touchCrescator ? 300 : 14)));
  }, 'unsigned long');
  api.functie('touchAttachInterrupt', function touchAttachInterrupt(p, fn, prag) {
    const sim = S();
    const g = +p;
    let ultim = false;
    const verifica = () => {
      if (sim.stare !== 'ruleaza') return;
      const v = f.touchRead(g);
      const atins = sim.cip.touchCrescator ? v > prag : v < prag;
      if (atins && !ultim) sim.coadaIsr.push(fn);
      ultim = atins;
      sim.programeaza(20000, verifica, 'mcu');
    };
    sim.programeaza(20000, verifica, 'mcu');
  }, 'void');
  api.functie('hallRead', function hallRead() {
    S().problema('hall', 'info', 'hallRead() a fost eliminat în nucleul ESP32 3.x; senzorul Hall intern nu mai e disponibil.', { linie: linie() });
    return Math.round((Math.random() - 0.5) * 20);
  }, 'int');
  api.functie('temperatureRead', function temperatureRead() { return 46 + Math.sin(S().timp / 3e7) * 2 + Math.random() * 0.4; }, 'float');

  // ---------- întreruperi ----------
  api.functie('attachInterrupt', function attachInterrupt(p, fn, mod) {
    const sim = S(); const g = +p;
    if (!fn) return;
    const cip = sim.cip;
    if (cip.platforma === 'avr' && cip.intreruperi[g] === undefined && g > 1) {
      sim.problema('isr-avr-' + g, 'eroare', 'Pe Arduino Nano doar pinii 2 și 3 au întreruperi externe (attachInterrupt).', { linie: linie() });
      return;
    }
    if (cip.faraIntrerupere && cip.faraIntrerupere.includes(g)) { sim.problema('isr-' + g, 'eroare', 'GPIO' + g + ' nu suportă întreruperi pe ' + cip.cip + '.', { linie: linie() }); return; }
    sim.ataseazaIntrerupere(g, fn, modIntrerupere(mod));
  }, 'void');
  api.functie('attachInterruptArg', function attachInterruptArg(p, fn, arg, mod) { f.attachInterrupt(p, () => fn(arg), mod); }, 'void');
  api.functie('detachInterrupt', function detachInterrupt(p) { S().detaseazaIntrerupere(+p); }, 'void');
  api.functie('interrupts', function interrupts() { }, 'void');
  api.functie('noInterrupts', function noInterrupts() { }, 'void');
  api.functie('sei', function sei() { }, 'void');
  api.functie('cli', function cli() { }, 'void');
  api.functie('portENTER_CRITICAL', function portENTER_CRITICAL() { }, 'void');
  api.functie('portEXIT_CRITICAL', function portEXIT_CRITICAL() { }, 'void');
  api.functie('portENTER_CRITICAL_ISR', function portENTER_CRITICAL_ISR() { }, 'void');
  api.functie('portEXIT_CRITICAL_ISR', function portEXIT_CRITICAL_ISR() { }, 'void');
  api.clasa('portMUX_TYPE', class portMUX_TYPE { });
  api.constante.portMUX_INITIALIZER_UNLOCKED = 0;

  // ---------- timp ----------
  api.functie('delay', function* delay(ms) {
    const sim = S();
    if (sim.inIsr) { sim.problema('delay-isr', 'avertisment', 'delay() în funcția de întrerupere (ISR) nu funcționează pe ESP32.', { linie: linie() }); return; }
    ms = +ms;
    if (!(ms >= 0)) ms = 0;
    // delay(0) doar cedează procesorul; bucla care îl apelează tot consumă câteva microsecunde
    yield { dorm: Math.max(ms * 1000, 5) };
  }, 'void');
  api.functie('delayMicroseconds', function* delayMicroseconds(us) {
    us = +us;
    if (us > 0) {
      // pentru pauze scurte (<50 µs) doar consumăm timp, ca un ciclu activ
      if (us < 50) S().consuma(us); else yield { dorm: us };
    }
  }, 'void');
  api.functie('millis', function millis() { const s = S(); s.consuma(0.02); return Math.floor(s.timp / 1000) >>> 0; }, 'unsigned long');
  api.functie('micros', function micros() { const s = S(); s.consuma(0.02); return Math.floor(s.timp) >>> 0; }, 'unsigned long');
  api.functie('esp_timer_get_time', function esp_timer_get_time() { return Math.floor(S().timp); }, 'int64_t');
  api.functie('yield', function* yield_() { yield { dorm: 1 }; }, 'void');
  api.functie('vPortYield', function* vPortYield() { yield { dorm: 1 }; }, 'void');
  api.functie('taskYIELD', function* taskYIELD() { yield { dorm: 1 }; }, 'void');
  api.functie('pulseIn', function* pulseIn(p, stare, timeout) {
    const sim = S(); const g = +p;
    timeout = timeout === undefined ? 1000000 : +timeout;
    const lim = sim.timp + timeout;
    stare = stare ? 1 : 0;
    const nivel = () => sim.citesteNivelFaraEfecte(g);
    const asteapta = function* (cond) {
      if (cond()) return true;
      const r = yield { asteapta: () => cond() ? true : undefined, pana: lim, laExpirare: false, pas: 4 };
      return !!r;
    };
    if (!(yield* asteapta(() => nivel() !== stare))) return 0;
    if (!(yield* asteapta(() => nivel() === stare))) return 0;
    const start = sim.timp;
    if (!(yield* asteapta(() => nivel() !== stare))) return 0;
    return Math.max(1, Math.round(sim.timp - start));
  }, 'unsigned long');
  api.functii.pulseInLong = api.functii.pulseIn;
  api.functie('shiftOut', function shiftOut(date, ceas, ordine, val) {
    for (let i = 0; i < 8; i++) {
      const bit = ordine === 0 ? (val >> i) & 1 : (val >> (7 - i)) & 1;
      f.digitalWrite(date, bit);
      f.digitalWrite(ceas, 1);
      f.digitalWrite(ceas, 0);
    }
  }, 'void');
  api.functie('shiftIn', function shiftIn(date, ceas, ordine) {
    let v = 0;
    for (let i = 0; i < 8; i++) {
      f.digitalWrite(ceas, 1);
      const b = f.digitalRead(date);
      if (ordine === 0) v |= b << i; else v |= b << (7 - i);
      f.digitalWrite(ceas, 0);
    }
    return v;
  }, 'uint8_t');

  // ---------- numere aleatoare ----------
  let seed = null;
  function rnd() {
    if (seed === null) {
      const s = S();
      if (s && s.cip && s.cip.platforma === 'avr') seed = 1; // pe AVR secvența e aceeași la fiecare pornire
      else return Math.floor(Math.random() * 2147483647);
    }
    // generator congruențial ca în newlib/avr-libc
    seed = (Math.imul(seed, 16807) % 2147483647 + 2147483647) % 2147483647 || 1;
    return seed;
  }
  api.creatoriObiecte.push(() => { seed = null; rezolutieAdc = 12; atenuare = 3; rezolutiePwm = 8; frecventaPwm = 1000; for (const k in canaleLedc) delete canaleLedc[k]; return {}; });
  api.functie('randomSeed', function randomSeed(s) { if (s) seed = (s >>> 0) % 2147483647 || 1; }, 'void');
  api.functie('random', function random(a, b) {
    if (b === undefined) { if (!a) return 0; return rnd() % a; }
    if (a >= b) return a;
    return a + rnd() % (b - a);
  }, 'long');
  api.functie('esp_random', function esp_random() { return Math.floor(Math.random() * 4294967296) >>> 0; }, 'unsigned long');
  api.functie('rand', function rand() { return rnd(); }, 'int');
  api.functie('srand', function srand(s) { seed = (s >>> 0) % 2147483647 || 1; }, 'void');
  api.functie('map', function map(x, a, b, c, d, cuReale) {
    const sim = S();
    if (cuReale) sim.problema('map-real', 'info', 'map() lucrează cu numere întregi: valorile cu zecimale sunt trunchiate. Pentru numere reale scrie formula direct.', { linie: linie() });
    x = Math.trunc(x); a = Math.trunc(a); b = Math.trunc(b); c = Math.trunc(c); d = Math.trunc(d);
    const run = b - a;
    if (run === 0) return -1;
    return Math.trunc((x - a) * (d - c) / run) + c | 0;
  }, 'long');

  // ---------- matematică ----------
  const mat = {
    sqrt: Math.sqrt, sqrtf: Math.sqrt, pow: Math.pow, powf: Math.pow, sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
    sinf: Math.sin, cosf: Math.cos, tanf: Math.tan, atan2f: Math.atan2, exp: Math.exp, log: Math.log, log10: Math.log10, log2: Math.log2, floor: Math.floor, ceil: Math.ceil, floorf: Math.floor, ceilf: Math.ceil,
    round: Math.round, roundf: Math.round, fabs: Math.abs, fabsf: Math.abs, fmod: (a, b) => a % b, fmodf: (a, b) => a % b, fmin: Math.min, fmax: Math.max, fminf: Math.min, fmaxf: Math.max, trunc: Math.trunc, cbrt: Math.cbrt, hypot: Math.hypot,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, expf: Math.exp, logf: Math.log, lround: (x) => Math.round(x) | 0, lrint: (x) => Math.round(x) | 0
  };
  for (const k in mat) api.functie(k, mat[k], k === 'lround' || k === 'lrint' ? 'long' : 'double');
  api.functie('sq', function sq(x) { return x * x; }, 'double');
  api.functie('degrees', function degrees(x) { return x * 180 / Math.PI; }, 'double');
  api.functie('radians', function radians(x) { return x * Math.PI / 180; }, 'double');
  api.functie('isnan', function isnan(x) { return Number.isNaN(x); }, 'bool');
  api.functie('isinf', function isinf(x) { return x === Infinity || x === -Infinity; }, 'bool');
  api.functie('signbit', function signbit(x) { return x < 0 || Object.is(x, -0); }, 'bool');

  // ---------- caractere ----------
  const ch = {
    isDigit: c => c >= 48 && c <= 57, isdigit: c => c >= 48 && c <= 57, isAlpha: c => (c >= 65 && c <= 90) || (c >= 97 && c <= 122), isalpha: c => (c >= 65 && c <= 90) || (c >= 97 && c <= 122),
    isAlphaNumeric: c => ch.isDigit(c) || ch.isAlpha(c), isalnum: c => ch.isDigit(c) || ch.isAlpha(c), isSpace: c => c === 32 || (c >= 9 && c <= 13), isspace: c => c === 32 || (c >= 9 && c <= 13),
    isWhitespace: c => c === 32 || c === 9, isUpperCase: c => c >= 65 && c <= 90, isupper: c => c >= 65 && c <= 90, isLowerCase: c => c >= 97 && c <= 122, islower: c => c >= 97 && c <= 122,
    isHexadecimalDigit: c => ch.isDigit(c) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102), isxdigit: c => ch.isHexadecimalDigit(c), isPrintable: c => c >= 32 && c < 127, isprint: c => c >= 32 && c < 127,
    isControl: c => c < 32 || c === 127, iscntrl: c => c < 32 || c === 127, isAscii: c => c >= 0 && c < 128, isGraph: c => c > 32 && c < 127, isPunct: c => c > 32 && c < 127 && !ch.isAlphaNumeric(c), ispunct: c => c > 32 && c < 127 && !ch.isAlphaNumeric(c)
  };
  for (const k in ch) api.functie(k, function (c) { return ch[k](typeof c === 'string' ? c.charCodeAt(0) : c); }, 'bool');
  api.functie('toupper', function toupper(c) { return c >= 97 && c <= 122 ? c - 32 : c; }, 'int');
  api.functie('tolower', function tolower(c) { return c >= 65 && c <= 90 ? c + 32 : c; }, 'int');
  api.functie('toUpperCase', function toUpperCase(c) { return c >= 97 && c <= 122 ? c - 32 : c; }, 'int');
  api.functie('toLowerCase', function toLowerCase(c) { return c >= 65 && c <= 90 ? c + 32 : c; }, 'int');
  api.functie('toAscii', function toAscii(c) { return c & 127; }, 'int');

  // ---------- șiruri C ----------
  function lungC(s) {
    if (s === null || s === undefined) throw new Err('LoadProhibited', 'strlen(NULL)', 'Ai trimis un șir NULL unei funcții de text.');
    if (typeof s === 'string') return s.length;
    let i = 0; while (i < s.length && s[i] !== 0) i++; return i;
  }
  function scrieC(dest, text, maxim, numeFunctie) {
    if (!dest) throw new Err('StoreProhibited', 'Scriere în NULL', numeFunctie + '() a primit un tablou NULL.');
    if (typeof dest === 'string') throw new Err('StoreProhibited', 'Scriere într-un text constant', numeFunctie + '() încearcă să scrie într-un text constant ("..."). Folosește un tablou char[].');
    const lim = maxim === undefined ? dest.length : Math.min(maxim, dest.length);
    if (text.length + 1 > dest.length && maxim === undefined) {
      S().problema('depasire-' + numeFunctie, 'eroare', numeFunctie + '(): textul (' + (text.length + 1) + ' octeți cu terminatorul) nu încape în tabloul de ' + dest.length + ' octeți. Pe placă asta strică alte variabile din memorie.', { linie: linie() });
    }
    let i = 0;
    for (; i < text.length && i < lim - 1; i++) dest[i] = text.charCodeAt(i) & 255;
    if (lim > 0) dest[i] = 0;
    return dest;
  }
  api.functie('strlen', function strlen(s) { return lungC(s); }, 'size_t');
  api.functie('strnlen', function strnlen(s, n) { return Math.min(lungC(s), n); }, 'size_t');
  api.functie('strcpy', function strcpy(d, s) { return scrieC(d, txt(s), undefined, 'strcpy'); }, 'cstr');
  api.functie('strncpy', function strncpy(d, s, n) { const t = txt(s).slice(0, n); for (let i = 0; i < n && i < d.length; i++) d[i] = i < t.length ? t.charCodeAt(i) : 0; return d; }, 'cstr');
  api.functie('strlcpy', function strlcpy(d, s, n) { scrieC(d, txt(s), n, 'strlcpy'); return lungC(s); }, 'size_t');
  api.functie('strcat', function strcat(d, s) { return scrieC(d, txt(d) + txt(s), undefined, 'strcat'); }, 'cstr');
  api.functie('strncat', function strncat(d, s, n) { return scrieC(d, txt(d) + txt(s).slice(0, n), undefined, 'strncat'); }, 'cstr');
  api.functie('strlcat', function strlcat(d, s, n) { scrieC(d, txt(d) + txt(s), n, 'strlcat'); return txt(d).length + txt(s).length; }, 'size_t');
  const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  api.functie('strcmp', function strcmp(a, b) { return cmp(txt(a), txt(b)); }, 'int');
  api.functie('strncmp', function strncmp(a, b, n) { return cmp(txt(a).slice(0, n), txt(b).slice(0, n)); }, 'int');
  api.functie('strcasecmp', function strcasecmp(a, b) { return cmp(txt(a).toLowerCase(), txt(b).toLowerCase()); }, 'int');
  api.functie('strncasecmp', function strncasecmp(a, b, n) { return cmp(txt(a).slice(0, n).toLowerCase(), txt(b).slice(0, n).toLowerCase()); }, 'int');
  function subsir(s, i) { if (i < 0) return null; return typeof s === 'string' ? s.slice(i) : M.ajutoareR.padd(s, i); }
  api.functie('strstr', function strstr(a, b) { return subsir(a, txt(a).indexOf(txt(b))); }, 'cstr');
  api.functie('strchr', function strchr(a, c) { return subsir(a, txt(a).indexOf(String.fromCharCode(c))); }, 'cstr');
  api.functie('strrchr', function strrchr(a, c) { return subsir(a, txt(a).lastIndexOf(String.fromCharCode(c))); }, 'cstr');
  let strtokStare = null;
  api.functie('strtok', function strtok(s, delim) {
    const d = txt(delim);
    if (s !== null && s !== undefined) {
      if (typeof s === 'string') { const b = new Uint8Array(s.length + 1); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); s = b; }
      strtokStare = { buf: s, poz: 0 };
    }
    if (!strtokStare) return null;
    const b = strtokStare.buf;
    let i = strtokStare.poz;
    while (i < b.length && b[i] !== 0 && d.includes(String.fromCharCode(b[i]))) i++;
    if (i >= b.length || b[i] === 0) { strtokStare = null; return null; }
    const start = i;
    while (i < b.length && b[i] !== 0 && !d.includes(String.fromCharCode(b[i]))) i++;
    if (i < b.length && b[i] !== 0) { b[i] = 0; strtokStare.poz = i + 1; } else strtokStare.poz = i;
    return M.ajutoareR.padd(b, start);
  }, 'cstr');
  api.functie('atoi', function atoi(s) { return M.ajutoareR.toInt(txt(s)); }, 'int');
  api.functie('atol', function atol(s) { return M.ajutoareR.toInt(txt(s)); }, 'long');
  api.functie('atof', function atof(s) { return M.ajutoareR.toFloat(txt(s)); }, 'double');
  api.functie('strtol', function strtol(s, fin, baza) {
    const t = txt(s).trim();
    let v = parseInt(t, baza || 10);
    if (isNaN(v)) v = 0;
    return v | 0;
  }, 'long');
  api.functie('strtoul', function strtoul(s, fin, baza) { let v = parseInt(txt(s).trim(), baza || 10); if (isNaN(v)) v = 0; return v >>> 0; }, 'unsigned long');
  api.functie('strtod', function strtod(s) { return M.ajutoareR.toFloat(txt(s)); }, 'double');
  api.functie('strtof', function strtof(s) { return M.ajutoareR.toFloat(txt(s)); }, 'float');
  function numarInBaza(v, b) { return b === 10 ? String(v) : (v < 0 ? (v >>> 0) : v).toString(b); }
  api.functie('itoa', function itoa(v, buf, b) { return scrieC(buf, numarInBaza(v | 0, b || 10), undefined, 'itoa'); }, 'cstr');
  api.functie('ltoa', function ltoa(v, buf, b) { return scrieC(buf, numarInBaza(v | 0, b || 10), undefined, 'ltoa'); }, 'cstr');
  api.functie('utoa', function utoa(v, buf, b) { return scrieC(buf, (v >>> 0).toString(b || 10), undefined, 'utoa'); }, 'cstr');
  api.functie('ultoa', function ultoa(v, buf, b) { return scrieC(buf, (v >>> 0).toString(b || 10), undefined, 'ultoa'); }, 'cstr');
  api.functie('dtostrf', function dtostrf(v, latime, prec, buf) {
    let s = M.ajutoareR.formatReal(v, prec);
    const w = Math.abs(latime);
    if (s.length < w) s = latime < 0 ? s.padEnd(w) : s.padStart(w);
    return scrieC(buf, s, undefined, 'dtostrf');
  }, 'cstr');
  api.functie('memset', function memset(d, v, n) {
    if (!d) return d;
    if (ArrayBuffer.isView(d)) { const u = new Uint8Array(d.buffer, d.byteOffset, Math.min(n === undefined ? d.byteLength : n, d.byteLength)); u.fill(v & 255); }
    else if (Array.isArray(d)) d.fill(v, 0, n);
    else if (typeof d === 'object') { for (const k in d) if (typeof d[k] === 'number') d[k] = 0; else if (ArrayBuffer.isView(d[k])) d[k].fill(0); }
    return d;
  }, 'void');
  api.functie('memcpy', function memcpy(d, s, n) {
    if (!d || !s) return d;
    if (ArrayBuffer.isView(d) && (ArrayBuffer.isView(s) || typeof s === 'string')) {
      const ud = new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
      if (typeof s === 'string') { for (let i = 0; i < n && i < ud.length; i++) ud[i] = i < s.length ? s.charCodeAt(i) : 0; return d; }
      const us = new Uint8Array(s.buffer, s.byteOffset, s.byteLength);
      ud.set(us.subarray(0, Math.min(n, us.length, ud.length)));
      return d;
    }
    if (typeof d === 'object' && typeof s === 'object') { for (const k in s) { if (ArrayBuffer.isView(s[k])) d[k] = s[k].slice(); else d[k] = s[k]; } }
    return d;
  }, 'void');
  api.functii.memmove = api.functii.memcpy;
  api.functie('memcmp', function memcmp(a, b, n) {
    const ua = ArrayBuffer.isView(a) ? new Uint8Array(a.buffer, a.byteOffset, a.byteLength) : null, ub = ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : null;
    if (!ua || !ub) return txt(a) === txt(b) ? 0 : 1;
    for (let i = 0; i < n; i++) { if (ua[i] !== ub[i]) return ua[i] < ub[i] ? -1 : 1; }
    return 0;
  }, 'int');

  // ---------- printf ----------
  function sprintfText(fmt, args) {
    fmt = txt(fmt);
    const avr = S() && S().cip && S().cip.platforma === 'avr';
    let k = 0;
    return fmt.replace(/%([-+ 0#]*)(\*|\d+)?(?:\.(\*|\d+))?(hh|h|ll|l|L|z|j|t)?([diuxXofFeEgGcsp%])/g, (tot, fl, w, pr, lung, conv) => {
      if (conv === '%') return '%';
      if (w === '*') w = args[k++];
      if (pr === '*') pr = args[k++];
      let a = args[k++];
      let s;
      const precizie = pr === undefined ? undefined : +pr;
      switch (conv) {
        case 'd': case 'i': {
          let v = typeof a === 'boolean' ? +a : Math.trunc(+a || 0);
          if (lung !== 'll') v = v | 0;
          s = String(Math.abs(v));
          if (precizie !== undefined) s = s.padStart(precizie, '0');
          s = (v < 0 ? '-' : fl.includes('+') ? '+' : fl.includes(' ') ? ' ' : '') + s;
          break;
        }
        case 'u': s = String(lung === 'll' ? Math.trunc(+a || 0) : ((+a || 0) >>> 0)); break;
        case 'x': case 'X': case 'o': {
          const v = lung === 'll' ? Math.trunc(+a || 0) : ((+a || 0) >>> 0);
          s = v.toString(conv === 'o' ? 8 : 16);
          if (conv === 'X') s = s.toUpperCase();
          if (precizie !== undefined) s = s.padStart(precizie, '0');
          if (fl.includes('#') && v) s = (conv === 'o' ? '0' : conv === 'x' ? '0x' : '0X') + s;
          break;
        }
        case 'f': case 'F': case 'e': case 'E': case 'g': case 'G': {
          if (avr) { s = '?'; break; }
          const v = +a;
          const p = precizie === undefined ? 6 : precizie;
          if (isNaN(v)) s = 'nan'; else if (!isFinite(v)) s = v > 0 ? 'inf' : '-inf';
          else if (conv === 'f' || conv === 'F') s = v.toFixed(p);
          else if (conv === 'e' || conv === 'E') { s = v.toExponential(p).replace(/e([+-])(\d)$/, 'e$10$2'); if (conv === 'E') s = s.toUpperCase(); }
          else { s = String(+v.toPrecision(p || 1)); if (conv === 'G') s = s.toUpperCase(); }
          if (v >= 0 && fl.includes('+')) s = '+' + s;
          break;
        }
        case 'c': s = String.fromCharCode((typeof a === 'string' ? a.charCodeAt(0) : +a) & 255); break;
        case 's':
          if (typeof a === 'number') { S().problema('printf-s', 'eroare', 'printf: %s a primit un număr în loc de text. Pe placă asta poate reseta programul.', { linie: linie() }); s = '(null)'; break; }
          s = a === null || a === undefined ? '(null)' : txt(a);
          if (precizie !== undefined) s = s.slice(0, precizie);
          break;
        case 'p': s = '0x3ffb' + ((Math.random() * 65535) | 0).toString(16).padStart(4, '0'); break;
      }
      if (w !== undefined) {
        const wn = +w;
        if (s.length < wn) {
          if (fl.includes('-')) s = s.padEnd(wn);
          else if (fl.includes('0') && /[diuxXofFeE]/.test(conv) && precizie === undefined) {
            const semn = /^[-+ ]/.test(s) ? s[0] : '';
            s = semn + s.slice(semn.length).padStart(wn - semn.length, '0');
          } else s = s.padStart(wn);
        }
      }
      return s;
    });
  }
  api.sprintfText = sprintfText;
  api.functie('sprintf', function sprintf(buf, fmt, ...args) { const t = sprintfText(fmt, args); scrieC(buf, t, undefined, 'sprintf'); return t.length; }, 'int');
  api.functie('snprintf', function snprintf(buf, n, fmt, ...args) { const t = sprintfText(fmt, args); if (n > 0) scrieC(buf, t, n, 'snprintf'); return t.length; }, 'int');
  api.functie('printf', function printf(fmt, ...args) { const t = sprintfText(fmt, args); const s = S().obiecte.Serial; if (s) s._scrie(t); return t.length; }, 'int');
  api.functie('sscanf', function sscanf(sursa, fmt, ...tinte) {
    const s = txt(sursa), fm = txt(fmt);
    let i = 0, k = 0, nr = 0;
    for (let j = 0; j < fm.length; j++) {
      const c = fm[j];
      if (c === '%') {
        let conv = fm[++j];
        while ('lh'.includes(conv)) conv = fm[++j];
        while (s[i] === ' ' && conv !== 'c') i++;
        let m;
        if ('di'.includes(conv)) m = /^[-+]?\d+/.exec(s.slice(i));
        else if (conv === 'u') m = /^\d+/.exec(s.slice(i));
        else if ('fgeE'.includes(conv)) m = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(s.slice(i));
        else if ('xX'.includes(conv)) m = /^(0x)?[0-9a-fA-F]+/.exec(s.slice(i));
        else if (conv === 's') m = /^\S+/.exec(s.slice(i));
        else if (conv === 'c') m = [s[i] || ''];
        if (!m || !m[0]) break;
        const t = tinte[k++];
        const val = 'di'.includes(conv) || conv === 'u' ? parseInt(m[0], 10) : 'xX'.includes(conv) ? parseInt(m[0], 16) : 'fgeE'.includes(conv) ? parseFloat(m[0]) : m[0];
        if (t) {
          if (conv === 's') scrieC(t, val, undefined, 'sscanf');
          else if (conv === 'c') { if (ArrayBuffer.isView(t)) t[0] = val.charCodeAt(0); else t.v = val.charCodeAt(0); }
          else if (ArrayBuffer.isView(t)) t[0] = val; else t.v = val;
        }
        i += m[0].length; nr++;
      } else if (c === ' ') { while (s[i] === ' ') i++; }
      else { if (s[i] !== c) break; i++; }
    }
    return nr;
  }, 'int');
  api.functie('__log', function __log(nivel, tag, fmt, ...args) {
    const s = S().obiecte.Serial;
    if (s && s.pornit) s._scrie('[' + String(nivel).slice(-1).toUpperCase() + '][' + txt(tag) + '] ' + sprintfText(fmt === undefined ? tag : fmt, fmt === undefined ? [] : args) + '\r\n');
  }, 'void');

  // ---------- Print / Stream / HardwareSerial ----------
  class Print {
    _scrie() { }
    print(v, fmt, tag) {
      if (v === undefined) return 0;
      let t;
      if (v && typeof v === 'object' && v.__tm) { t = f.__strftime(fmt === undefined ? '%c' : txt(fmt), v); }
      else t = M.ajutoareR.formateaza(v, fmt, tag || 'x', false);
      this._scrie(t);
      return t.length;
    }
    println(v, fmt, tag) { const n = this.print(v, fmt, tag); this._scrie('\r\n'); return n + 2; }
    write(v, n) {
      if (typeof v === 'number') { this._scrie(String.fromCharCode(v & 255)); return 1; }
      if (ArrayBuffer.isView(v)) { let s = ''; const lim = n === undefined ? v.length : Math.min(n, v.length); for (let i = 0; i < lim; i++) s += String.fromCharCode(v[i] & 255); this._scrie(s); return lim; }
      const t = txt(v).slice(0, n === undefined ? undefined : n); this._scrie(t); return t.length;
    }
    printf(fmt, ...args) { const t = sprintfText(fmt, args); this._scrie(t); return t.length; }
    flush() { }
    availableForWrite() { return 128; }
  }
  Print.tipuri = { print: 'size_t', println: 'size_t', write: 'size_t', printf: 'size_t' };
  class Stream extends Print {
    constructor() { super(); this._in = ''; this._timeout = 1000; }
    available() { return this._in.length; }
    read() { if (!this._in.length) return -1; const c = this._in.charCodeAt(0); this._in = this._in.slice(1); return c; }
    peek() { return this._in.length ? this._in.charCodeAt(0) : -1; }
    setTimeout(ms) { this._timeout = ms; }
    getTimeout() { return this._timeout; }
    *_asteptaDate(cond) {
      const sim = S();
      const lim = sim.timp + this._timeout * 1000;
      for (;;) {
        if (cond()) return true;
        const r = yield { asteapta: () => cond() ? true : undefined, pana: lim, laExpirare: false, pas: 1000 };
        if (!r) return cond();
      }
    }
    *readString() {
      let s = '';
      for (;;) {
        if (this._in.length) { s += this._in; this._in = ''; }
        const ok = yield* this._asteptaDate(() => this._in.length > 0);
        if (!ok) break;
      }
      return s;
    }
    *readStringUntil(c) {
      const term = String.fromCharCode(c & 255);
      yield* this._asteptaDate(() => this._in.includes(term));
      const i = this._in.indexOf(term);
      let s;
      if (i >= 0) { s = this._in.slice(0, i); this._in = this._in.slice(i + 1); }
      else { s = this._in; this._in = ''; }
      return s;
    }
    *readBytes(buf, n) {
      yield* this._asteptaDate(() => this._in.length >= n);
      const k = Math.min(n, this._in.length);
      for (let i = 0; i < k; i++) { if (ArrayBuffer.isView(buf)) buf[i] = this._in.charCodeAt(i); }
      this._in = this._in.slice(k);
      return k;
    }
    *readBytesUntil(c, buf, n) {
      const term = String.fromCharCode(c & 255);
      yield* this._asteptaDate(() => this._in.includes(term) || this._in.length >= n);
      let i = this._in.indexOf(term);
      if (i < 0 || i > n) i = Math.min(n, this._in.length);
      for (let j = 0; j < i; j++) buf[j] = this._in.charCodeAt(j);
      this._in = this._in.slice(i + (this._in[i] === term ? 1 : 0));
      return i;
    }
    *parseInt() {
      yield* this._asteptaDate(() => /[-\d]/.test(this._in));
      const m = /^[^-\d]*(-?\d+)/.exec(this._in);
      if (!m) { this._in = ''; return 0; }
      // așteptăm puțin să vină și restul cifrelor
      yield* this._asteptaDate(() => /[-\d]+[^\d]/.test(this._in));
      const m2 = /^[^-\d]*(-?\d+)/.exec(this._in);
      this._in = this._in.slice(m2.index + m2[0].length);
      return parseInt(m2[1], 10) | 0;
    }
    *parseFloat() {
      yield* this._asteptaDate(() => /[-\d.]/.test(this._in));
      yield* this._asteptaDate(() => /[-\d.]+[^\d.]/.test(this._in));
      const m = /^[^-\d.]*(-?\d*\.?\d+)/.exec(this._in);
      if (!m) { this._in = ''; return 0; }
      this._in = this._in.slice(m.index + m[0].length);
      return parseFloat(m[1]);
    }
    *find(t) {
      const ts = txt(t);
      const ok = yield* this._asteptaDate(() => this._in.includes(ts));
      const i = this._in.indexOf(ts);
      if (i >= 0) { this._in = this._in.slice(i + ts.length); return true; }
      this._in = '';
      return !!ok && false;
    }
    __bool() { return true; }
  }
  Stream.tipuri = Object.assign({}, Print.tipuri, { available: 'int', read: 'int', peek: 'int', readString: 'String', readStringUntil: 'String', parseInt: 'long', parseFloat: 'float', readBytes: 'size_t', find: 'bool' });

  class HardwareSerial extends Stream {
    constructor(port) { super(); this.port = port; this.pornit = false; this.baud = 0; this.rx = -1; this.tx = -1; }
    begin(baud, config, rx, tx) {
      const sim = S();
      this.pornit = true;
      this.baud = baud || 115200;
      const cip = sim.cip;
      this.usbCdc = this.port === 0 && cip && (cip.cip === 'ESP32-S3' || cip.cip === 'ESP32-C3');
      if (this.port === 0) { this.rx = cip.uart0[1]; this.tx = cip.uart0[0]; if (cip.platforma === 'avr') { this.rx = 0; this.tx = 1; } }
      else {
        const impl = this.port === 1 ? cip.serial1 : cip.serial2;
        this.rx = rx !== undefined && rx >= 0 ? rx : (impl ? impl.rx : -1);
        this.tx = tx !== undefined && tx >= 0 ? tx : (impl ? impl.tx : -1);
        if (this.port === 1 && cip.platforma === 'esp32' && cip.cip === 'ESP32' && (rx === undefined || rx < 0)) {
          sim.problema('serial1-flash', 'eroare', 'Serial1 folosește implicit GPIO9/10 (memoria flash) pe ESP32. Dă pinii explicit: Serial1.begin(9600, SERIAL_8N1, RX, TX).', { linie: linie() });
        }
        M.uart && M.uart.leaga(sim, this);
      }
    }
    end() { this.pornit = false; }
    setRxBufferSize(n) { if (this.pornit && this.port !== 0) S().problema('rx-buf-' + this.port, 'avertisment', 'setRxBufferSize() trebuie apelat înainte de begin(); după begin() nu mai schimbă nimic.', { linie: linie() }); else this.rxMax = n; return this.rxMax || 256; }
    setTxBufferSize() { return 256; }
    setDebugOutput() { }
    onReceive() { }
    updateBaudRate(b) { this.baud = b; }
    baudRate() { return this.baud; }
    _scrie(t) {
      const sim = S();
      if (!this.pornit) {
        if (this.port === 0 && !this.avertizat) { this.avertizat = true; sim.problema('serial-begin', 'avertisment', 'Folosești Serial.print() fără Serial.begin(115200) în setup(). Pe placă nu apare nimic în monitor.', { linie: linie() }); }
        return;
      }
      // timpul de transmisie: la 115200 baud, ~87 µs pe caracter; bufferul de 128 octeți ascunde o parte
      sim.consuma(Math.max(0, t.length - 64) * (10e6 / this.baud) * 0.5 + 2);
      if (this.port === 0) sim.emit('serial', { port: 0, text: t, baud: this.usbCdc ? 0 : this.baud });
      else if (this.legatura) this.legatura.trimite(t, this.baud);
    }
    iesireBrutaInitiala(t, baud) { S().emit('serial', { port: 0, text: t, baud, sistem: true }); }
    // bufferul de recepție are 256 de octeți (64 pe Arduino Nano); ce vine în plus se pierde
    primeste(t) {
      const max = this.rxMax || (S() && S().cip && S().cip.platforma === 'avr' ? 64 : 256);
      if (this._in.length + t.length <= max) { this._in += t; return; }
      const loc = Math.max(0, max - this._in.length);
      this._in += t.slice(0, loc);
      this.pierdute = (this.pierdute || 0) + t.length - loc;
      if (this.port !== 0 && this.pierdute > 20) S().problema('rx-plin-' + this.port, 'avertisment', 'Bufferul de recepție al lui ' + (this.port === 1 ? 'Serial1' : this.port === 2 ? 'Serial2' : 'portului serial') + ' (' + max + ' octeți) s-a umplut și s-au pierdut ' + this.pierdute + ' octeți: codul nu citește destul de des (de exemplu are delay() lung în loop()). Citește datele des, fără pauze lungi, sau mărește bufferul cu setRxBufferSize(1024) înainte de begin().', { linie: linie() });
    }
    __bool() { return true; }
  }
  HardwareSerial.tipuri = Object.assign({}, Stream.tipuri, { setRxBufferSize: 'size_t' });
  api.clasa('Print', Print);
  api.clasa('Stream', Stream);
  api.clasa('HardwareSerial', HardwareSerial);
  api.clasa('USBCDC', HardwareSerial);
  api.clasa('HWCDC', HardwareSerial);
  Object.assign(api.obiecte, { Serial: 'HardwareSerial', Serial1: 'HardwareSerial', Serial2: 'HardwareSerial', USBSerial: 'HardwareSerial' });
  api.creatoriObiecte.push(() => ({ Serial: new HardwareSerial(0), Serial1: new HardwareSerial(1), Serial2: new HardwareSerial(2), USBSerial: new HardwareSerial(0) }));

  // ---------- ESP ----------
  class EspClass {
    restart() { const sim = S(); sim.programeaza(1000, () => sim.reset('SW_CPU_RESET'), 'mcu'); sim.sarcini.forEach(s => { s.activa = false; }); }
    getFreeHeap() { const c = S().cip; return c.platforma === 'esp8266' ? 45000 + ((Math.random() * 200) | 0) : 282000 - ((S().timp / 1e6) % 7 | 0) * 16; }
    getHeapSize() { return S().cip.platforma === 'esp8266' ? 80000 : 327680; }
    getMinFreeHeap() { return 276000; }
    getMaxAllocHeap() { return 110580; }
    getPsramSize() { const c = S().cip; return c.cip === 'ESP32-S3' && c.psram.length ? 8388608 : 0; }
    getFreePsram() { return this.getPsramSize() ? 8386000 : 0; }
    getChipModel() { const c = S().cip.cip; return c === 'ESP32' ? 'ESP32-D0WD-V3' : c; }
    getChipRevision() { return 3; }
    getChipCores() { const c = S().cip.cip; return c === 'ESP32-C3' ? 1 : 2; }
    getCpuFreqMHz() { const c = S().cip.cip; return c === 'ESP32-C3' ? 160 : (c === 'ESP8266' ? 80 : 240); }
    getFlashChipSize() { const s = S(); return s.cip.cip === 'ESP32-S3' ? 16777216 : 4194304; }
    getFlashChipSpeed() { return 80000000; }
    getSketchSize() { return 285000; }
    getFreeSketchSpace() { return 1310720; }
    getSdkVersion() { return 'v5.1.4'; }
    getCoreVersion() { return '3.0.7'; }
    getEfuseMac() { return 0x3C71BF9D2A24; }
    getChipId() { return 0x9D2A24; }
    getCycleCount() { return Math.floor(S().timp * 240) >>> 0; }
    getResetReason() { return S().motivReset || 'Power On'; }
    *deepSleep(us) { yield* f.esp_sleep_enable_timer_wakeup(us); yield* f.esp_deep_sleep_start(); }
    getVcc() { return 3300; }
    magicFlashChipSize() { return 4194304; }
  }
  EspClass.tipuri = { getFreeHeap: 'unsigned long', getHeapSize: 'unsigned long', getChipModel: 'cstr', getChipRevision: 'uint8_t', getCpuFreqMHz: 'unsigned long', getFlashChipSize: 'unsigned long', getSdkVersion: 'cstr', getEfuseMac: 'uint64_t', getChipId: 'unsigned long', getPsramSize: 'unsigned long', getFreePsram: 'unsigned long', getCycleCount: 'unsigned long', getChipCores: 'uint8_t', getMinFreeHeap: 'unsigned long', getMaxAllocHeap: 'unsigned long', getSketchSize: 'unsigned long', getFreeSketchSpace: 'unsigned long', getResetReason: 'String', getCoreVersion: 'String', getVcc: 'uint16_t' };
  api.clasa('EspClass', EspClass);
  api.obiecte.ESP = 'EspClass';
  api.creatoriObiecte.push(() => ({ ESP: new EspClass() }));
  api.functie('esp_restart', function esp_restart() { new EspClass().restart(); }, 'void');
  api.functie('esp_get_free_heap_size', function esp_get_free_heap_size() { return new EspClass().getFreeHeap(); }, 'unsigned long');
  api.functie('heap_caps_get_free_size', function heap_caps_get_free_size() { return new EspClass().getFreeHeap(); }, 'unsigned long');
  api.functie('xPortGetCoreID', function xPortGetCoreID() { const s = S(); return s.sarcinaCurenta ? (s.sarcinaCurenta.nucleu === 0 ? 0 : 1) : 1; }, 'int');
  api.functie('getCpuFrequencyMhz', function getCpuFrequencyMhz() { return new EspClass().getCpuFreqMHz(); }, 'unsigned long');
  api.functie('setCpuFrequencyMhz', function setCpuFrequencyMhz() { return true; }, 'bool');
  api.functie('psramFound', function psramFound() { return new EspClass().getPsramSize() > 0; }, 'bool');
  api.functie('psramInit', function psramInit() { return new EspClass().getPsramSize() > 0; }, 'bool');
  api.functie('ps_malloc', function ps_malloc(n) { return new Uint8Array(n); }, 'void');
  api.functie('malloc', function malloc(n) { return new Uint8Array(n); }, 'void');
  api.functie('calloc', function calloc(n, m) { return new Uint8Array(n * m); }, 'void');
  api.functie('free', function free() { }, 'void');
  api.functie('esp_reset_reason', function esp_reset_reason() { const m = S().motivReset; return m === 'SW_CPU_RESET' ? 3 : m === 'PANIC' ? 4 : m === 'DEEPSLEEP_RESET' ? 8 : 1; }, 'int');
  // somn adânc
  let trezireTimer = null, trezireExt0 = null;
  api.functie('esp_sleep_enable_timer_wakeup', function* esp_sleep_enable_timer_wakeup(us) { trezireTimer = +us; return 0; }, 'int');
  api.functie('esp_sleep_enable_ext0_wakeup', function esp_sleep_enable_ext0_wakeup(g, nivel) { trezireExt0 = { g: +g, nivel: +nivel }; return 0; }, 'int');
  api.functie('esp_sleep_enable_ext1_wakeup', function esp_sleep_enable_ext1_wakeup() { return 0; }, 'int');
  api.functie('esp_sleep_enable_touchpad_wakeup', function esp_sleep_enable_touchpad_wakeup() { return 0; }, 'int');
  api.functie('esp_sleep_get_wakeup_cause', function esp_sleep_get_wakeup_cause() { return S().cauzaTrezire || 0; }, 'int');
  api.functie('esp_deep_sleep_start', function* esp_deep_sleep_start() {
    const sim = S();
    // păstrăm variabilele RTC_DATA_ATTR
    const prog = sim.prog;
    sim.memorieRTC = sim.memorieRTC || {};
    if (sim.ultimeleValoriRtc) Object.assign(sim.memorieRTC, sim.ultimeleValoriRtc());
    sim.emit('serial', { port: 0, text: '', baud: 0 });
    sim.problema('somn', 'info', 'Placa a intrat în somn adânc' + (trezireTimer ? ' pentru ' + (trezireTimer / 1e6).toFixed(1).replace('.', ',') + ' s' : '') + '. Consumul scade la ~10 µA.', {});
    sim.sarcini.forEach(s => { s.activa = false; });
    for (const st of sim.stariPin.values()) { st.mod = 'INPUT'; st.pwm = null; }
    sim.circuit.murdarTot();
    sim.doarme = true;
    const t = trezireTimer, e0 = trezireExt0;
    trezireTimer = null; trezireExt0 = null;
    if (t) sim.programeaza(t, () => { sim.doarme = false; sim.cauzaTrezire = 4; sim.reset('DEEPSLEEP_RESET'); }, 'mcu');
    if (e0) {
      const verif = () => {
        if (!sim.doarme) return;
        if (sim.citesteNivelFaraEfecte(e0.g) === e0.nivel) { sim.doarme = false; sim.cauzaTrezire = 2; sim.reset('DEEPSLEEP_RESET'); return; }
        sim.programeaza(10000, verif, 'mcu');
      };
      sim.programeaza(10000, verif, 'mcu');
    }
    void prog;
    yield { dorm: 1e12 };
  }, 'void');
  api.functie('esp_light_sleep_start', function* esp_light_sleep_start() { if (trezireTimer) { const t = trezireTimer; trezireTimer = null; yield { dorm: t }; } return 0; }, 'int');
  api.functie('gpio_hold_en', function gpio_hold_en() { return 0; }, 'int');
  api.functie('gpio_deep_sleep_hold_en', function gpio_deep_sleep_hold_en() { }, 'void');
  api.functie('rtc_gpio_pullup_en', function rtc_gpio_pullup_en() { return 0; }, 'int');
  api.functie('rtc_gpio_pulldown_dis', function rtc_gpio_pulldown_dis() { return 0; }, 'int');

  // LED RGB integrat (neopixelWrite / rgbLedWrite)
  function rgbWrite(p, r, g, b) {
    const sim = S();
    const pinRgb = sim.placa && sim.placa.rgbPin;
    if (pinRgb !== undefined && (+p === pinRgb || +p === sim.placa.constante.LED_BUILTIN)) { sim.rgbPlaca = [r & 255, g & 255, b & 255]; return; }
    // un LED WS2812 extern pe pin
    const benzi = sim.cautaDupaPin(['ws2812'], 'DIN', +p);
    if (benzi.length && benzi[0].seteaza) benzi[0].seteaza([[r & 255, g & 255, b & 255]]);
  }
  api.functie('neopixelWrite', function neopixelWrite(p, r, g, b) { rgbWrite(p, r, g, b); }, 'void');
  api.functie('rgbLedWrite', function rgbLedWrite(p, r, g, b) { rgbWrite(p, r, g, b); }, 'void');

  // ---------- timp real (NTP) ----------
  class tm { constructor() { this.tm_sec = 0; this.tm_min = 0; this.tm_hour = 0; this.tm_mday = 1; this.tm_mon = 0; this.tm_year = 70; this.tm_wday = 4; this.tm_yday = 0; this.tm_isdst = 0; this.__tm = true; } }
  api.clasa('tm', tm);
  // starea ceasului (fusul orar și sincronizarea NTP) ține de placă: se pierde la resetare
  const ceas = () => { const s = S(); return s.__ceas || (s.__ceas = { decalaj: 0, configurat: false, tConfig: 0 }); };
  api.creatoriObiecte.push((sim) => { if (sim) sim.__ceas = null; return {}; });
  function decalajDinTz(tz) { const m = /^[A-Za-z<>+\-0-9]*?([A-Za-z]{3,})([-+]?\d+)(?::(\d+))?/.exec(tz); if (!m) return 0; let d = -parseInt(m[2], 10) * 3600 - Math.sign(parseInt(m[2], 10) || 1) * (m[3] ? parseInt(m[3], 10) * 60 : 0); if (/,M|EEST|CEST|BST|EDT|PDT|CDT|MDT/.test(tz) && estVara()) d += 3600; return d; }
  api.functie('configTime', function configTime(gmt, dst) { const c = ceas(); c.decalaj = (+gmt || 0) + (+dst || 0); c.configurat = true; c.tConfig = S().timp; }, 'void');
  api.functie('configTzTime', function configTzTime(tz) { const c = ceas(); c.decalaj = decalajDinTz(txt(tz)); c.configurat = true; c.tConfig = S().timp; }, 'void');
  api.functie('setenv', function setenv(nume, val) { if (txt(nume) === 'TZ') { const c = ceas(); c.tzCerut = decalajDinTz(txt(val)); } return 0; }, 'int');
  api.functie('tzset', function tzset() { const c = ceas(); if (c.tzCerut !== undefined) c.decalaj = c.tzCerut; }, 'void');
  // ora vine de la serverul NTP la ~0,3 s după ce placa are și configTime(), și WiFi
  function sincronizat() {
    const sim = S(), c = ceas();
    if (!c.configurat || !sim.wifiConectat) return false;
    const tc = sim.__net && sim.__net.tConectat ? sim.__net.tConectat : 0;
    return sim.timp >= Math.max(c.tConfig, tc) + 300000;
  }
  function estVara() { const d = new Date(); const an = d.getUTCFullYear(); const inceput = new Date(Date.UTC(an, 2, 31 - new Date(Date.UTC(an, 2, 31)).getUTCDay(), 1)); const sfarsit = new Date(Date.UTC(an, 9, 31 - new Date(Date.UTC(an, 9, 31)).getUTCDay(), 1)); return d >= inceput && d < sfarsit; }
  function epocaSim() { const sim = S(); if (!sim.epocaStart) sim.epocaStart = Date.now() / 1000; return sim.epocaStart + sim.timp / 1e6; }
  function umple(t, secunde) {
    const d = new Date(secunde * 1000);
    t.tm_sec = d.getUTCSeconds(); t.tm_min = d.getUTCMinutes(); t.tm_hour = d.getUTCHours(); t.tm_mday = d.getUTCDate(); t.tm_mon = d.getUTCMonth(); t.tm_year = d.getUTCFullYear() - 1900; t.tm_wday = d.getUTCDay();
    t.tm_yday = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5);
    return t;
  }
  api.functie('getLocalTime', function* getLocalTime(t, ms) {
    const sim = S(), c = ceas();
    const asteptare = (ms === undefined ? 5000 : ms) * 1000;
    // ca pe placă: încearcă la fiecare 10 ms până vine ora sau trece timpul dat (implicit 5 s)
    if (!sincronizat()) yield { asteapta: () => sincronizat() ? true : undefined, pana: sim.timp + asteptare, laExpirare: false, pas: 10000 };
    if (!sincronizat()) {
      if (!c.configurat) sim.problema('ntp-config', 'avertisment', 'getLocalTime() nu primește ora: lipsește configTime(decalajGMT, decalajVara, "pool.ntp.org") în setup().', { linie: linie() });
      else if (!sim.wifiConectat) sim.problema('ntp', 'avertisment', 'getLocalTime() nu primește ora: placa nu e conectată la WiFi, deci nu poate întreba serverul NTP.', { linie: linie() });
      return false;
    }
    umple(t, epocaSim() + c.decalaj);
    return true;
  }, 'bool');
  // până la sincronizare, ceasul pornește de la 1 ian. 1970 (secundele de la pornire)
  const secundeAcum = () => Math.floor(sincronizat() ? epocaSim() : S().timp / 1e6);
  api.functie('time', function time(p) { const v = secundeAcum(); if (p && typeof p === 'object') p.v = v; return v; }, 'time_t');
  api.functie('localtime', function localtime(p) { const t = new tm(); umple(t, (p && p.v !== undefined ? p.v : p) + ceas().decalaj); return t; }, 'obj:tm');
  api.functie('localtime_r', function localtime_r(p, t) { umple(t, (p && p.v !== undefined ? p.v : p) + ceas().decalaj); return t; }, 'obj:tm');
  api.functie('gmtime', function gmtime(p) { const t = new tm(); umple(t, p && p.v !== undefined ? p.v : p); return t; }, 'obj:tm');
  api.functie('mktime', function mktime(t) { return Math.floor(Date.UTC(t.tm_year + 1900, t.tm_mon, t.tm_mday, t.tm_hour, t.tm_min, t.tm_sec) / 1000) - ceas().decalaj; }, 'time_t');
  const ZILE = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const LUNI = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  api.functie('__strftime', function __strftime(fmt, t) {
    const p2 = n => String(n).padStart(2, '0');
    return fmt.replace(/%([a-zA-Z%])/g, (x, c) => {
      switch (c) {
        case 'Y': return String(t.tm_year + 1900); case 'y': return p2((t.tm_year + 1900) % 100); case 'm': return p2(t.tm_mon + 1); case 'd': return p2(t.tm_mday); case 'e': return String(t.tm_mday).padStart(2);
        case 'H': return p2(t.tm_hour); case 'I': return p2(t.tm_hour % 12 || 12); case 'M': return p2(t.tm_min); case 'S': return p2(t.tm_sec); case 'p': return t.tm_hour < 12 ? 'AM' : 'PM';
        case 'A': return ZILE[t.tm_wday]; case 'a': return ZILE[t.tm_wday].slice(0, 3); case 'B': return LUNI[t.tm_mon]; case 'b': case 'h': return LUNI[t.tm_mon].slice(0, 3);
        case 'j': return String(t.tm_yday + 1).padStart(3, '0'); case 'T': return p2(t.tm_hour) + ':' + p2(t.tm_min) + ':' + p2(t.tm_sec); case 'R': return p2(t.tm_hour) + ':' + p2(t.tm_min);
        case 'D': return p2(t.tm_mon + 1) + '/' + p2(t.tm_mday) + '/' + p2((t.tm_year + 1900) % 100); case 'F': return (t.tm_year + 1900) + '-' + p2(t.tm_mon + 1) + '-' + p2(t.tm_mday);
        case 'c': return ZILE[t.tm_wday].slice(0, 3) + ' ' + LUNI[t.tm_mon].slice(0, 3) + ' ' + String(t.tm_mday).padStart(2) + ' ' + p2(t.tm_hour) + ':' + p2(t.tm_min) + ':' + p2(t.tm_sec) + ' ' + (t.tm_year + 1900);
        case 'w': return String(t.tm_wday); case '%': return '%';
      }
      return x;
    });
  }, 'cstr');
  api.functie('strftime', function strftime(buf, n, fmt, t) { const s = f.__strftime(txt(fmt), t); scrieC(buf, s, n, 'strftime'); return Math.min(s.length, n - 1); }, 'size_t');

  // ---------- Preferences (NVS) și EEPROM ----------
  function nvs() { const sim = S(); const p = sim.proiect; p.memorie = p.memorie || {}; p.memorie.nvs = p.memorie.nvs || {}; return p.memorie.nvs; }
  class Preferences {
    constructor() { this.ns = null; this.ro = false; }
    begin(ns, ro) { const n = txt(ns); if (n.length > 15) { S().problema('nvs-nume', 'eroare', 'Numele spațiului Preferences „' + n + '” are peste 15 caractere — begin() eșuează pe placă.', { linie: linie() }); return false; } this.ns = n; this.ro = !!ro; const d = nvs(); d[n] = d[n] || {}; return true; }
    end() { this.ns = null; }
    _d() { if (!this.ns) { S().problema('nvs-begin', 'eroare', 'Preferences folosit fără begin("nume").', { linie: linie() }); return {}; } return nvs()[this.ns]; }
    _pune(k, v) { if (this.ro) { S().problema('nvs-ro', 'avertisment', 'Preferences a fost deschis doar pentru citire (begin(nume, true)); scrierea nu are efect.', { linie: linie() }); return 0; } const kk = txt(k); if (kk.length > 15) { S().problema('nvs-cheie', 'eroare', 'Cheia „' + kk + '” are peste 15 caractere — nu se salvează.', { linie: linie() }); return 0; } this._d()[kk] = v; S().emit('memorie'); return typeof v === 'string' ? v.length : 4; }
    _ia(k, implicit) { const d = this._d(); const kk = txt(k); return Object.prototype.hasOwnProperty.call(d, kk) ? d[kk] : implicit; }
    clear() { if (this.ns) nvs()[this.ns] = {}; return true; }
    remove(k) { delete this._d()[txt(k)]; return true; }
    isKey(k) { return Object.prototype.hasOwnProperty.call(this._d(), txt(k)); }
    freeEntries() { return 500 - Object.keys(this._d()).length; }
  }
  const tipuriPref = { Char: 'int8_t', UChar: 'uint8_t', Short: 'int16_t', UShort: 'uint16_t', Int: 'int', UInt: 'unsigned int', Long: 'long', ULong: 'unsigned long', Long64: 'int64_t', ULong64: 'uint64_t', Float: 'float', Double: 'double', Bool: 'bool', String: 'String' };
  Preferences.tipuri = {};
  for (const k in tipuriPref) {
    Preferences.prototype['put' + k] = function (key, v) { return this._pune(key, k === 'String' ? txt(v) : k === 'Bool' ? !!v : v); };
    Preferences.prototype['get' + k] = function (key, implicit) { const v = this._ia(key, implicit === undefined ? (k === 'String' ? '' : k === 'Bool' ? false : 0) : implicit); return k === 'String' ? txt(v) : v; };
    Preferences.tipuri['get' + k] = tipuriPref[k];
  }
  Preferences.prototype.putBytes = function (key, buf, n) { return this._pune(key, Array.from(buf).slice(0, n)); };
  Preferences.prototype.getBytes = function (key, buf, n) { const v = this._ia(key, null); if (!v) return 0; for (let i = 0; i < n && i < v.length; i++) buf[i] = v[i]; return Math.min(n, v.length); };
  Preferences.prototype.getBytesLength = function (key) { const v = this._ia(key, null); return v ? v.length : 0; };
  api.clasa('Preferences', Preferences);
  class EEPROMClass {
    begin(n) { const p = S().proiect; p.memorie = p.memorie || {}; if (!p.memorie.eeprom || p.memorie.eeprom.length < n) p.memorie.eeprom = (p.memorie.eeprom || []).concat(new Array(Math.max(0, n - (p.memorie.eeprom || []).length)).fill(255)); this.n = n; return true; }
    _m() { const p = S().proiect; p.memorie = p.memorie || {}; if (!p.memorie.eeprom) p.memorie.eeprom = new Array(S().cip.platforma === 'avr' ? 1024 : 512).fill(255); return p.memorie.eeprom; }
    read(a) { return this._m()[a] === undefined ? 255 : this._m()[a]; }
    write(a, v) { this._m()[a] = v & 255; }
    update(a, v) { this.write(a, v); }
    commit() { S().emit('memorie'); return true; }
    end() { this.commit(); }
    length() { return this._m().length; }
    put(a, v) {
      const m = this._m();
      if (typeof v === 'number') { const b = new Uint8Array(new Float64Array([v]).buffer); for (let i = 0; i < 8; i++) m[a + i] = b[i]; m.__tipuri = m.__tipuri || {}; }
      else if (ArrayBuffer.isView(v)) { const u = new Uint8Array(v.buffer, v.byteOffset, v.byteLength); for (let i = 0; i < u.length; i++) m[a + i] = u[i]; }
      else if (typeof v === 'object') { const j = JSON.stringify(v); for (let i = 0; i < j.length; i++) m[a + i] = j.charCodeAt(i); m[a + j.length] = 0; }
      return v;
    }
    get(a, v) {
      const m = this._m();
      if (v && typeof v === 'object' && !ArrayBuffer.isView(v)) {
        if ('v' in v && !(v.__copie)) { const b = new Uint8Array(8); for (let i = 0; i < 8; i++) b[i] = m[a + i] === undefined ? 255 : m[a + i]; v.v = new Float64Array(b.buffer)[0]; return v; }
        let j = ''; for (let i = a; i < m.length && m[i]; i++) j += String.fromCharCode(m[i]);
        try { Object.assign(v, JSON.parse(j)); } catch (e) { }
        return v;
      }
      if (ArrayBuffer.isView(v)) { const u = new Uint8Array(v.buffer, v.byteOffset, v.byteLength); for (let i = 0; i < u.length; i++) u[i] = m[a + i] === undefined ? 255 : m[a + i]; }
      return v;
    }
  }
  EEPROMClass.tipuri = { read: 'uint8_t', length: 'unsigned int' };
  api.clasa('EEPROMClass', EEPROMClass);
  api.obiecte.EEPROM = 'EEPROMClass';
  api.creatoriObiecte.push(() => ({ EEPROM: new EEPROMClass() }));

  api.include('Arduino.h', 'Arduino', 'esp32-hal.h', 'Preferences.h', 'EEPROM.h', 'time.h', 'sys/time.h', 'math.h', 'stdio.h', 'stdlib.h', 'string.h', 'stdint.h', 'stdbool.h', 'ctype.h',
    'esp_sleep.h', 'esp_system.h', 'esp_timer.h', 'driver/gpio.h', 'driver/rtc_io.h', 'soc/soc.h', 'soc/rtc_cntl_reg.h', 'esp32-hal-ledc.h', 'avr/pgmspace.h', 'pgmspace.h', 'avr/io.h', 'avr/interrupt.h',
    'limits.h', 'float.h', 'cmath', 'cstdio', 'cstdlib', 'cstring', 'string', 'vector', 'Print.h', 'Stream.h', 'HardwareSerial.h', 'esp_task_wdt.h', 'esp_log.h', 'rom/rtc.h', 'esp32/rom/rtc.h', 'functional', 'algorithm', 'map');
  api.functie('esp_task_wdt_init', function esp_task_wdt_init() { return 0; }, 'int');
  api.functie('esp_task_wdt_add', function esp_task_wdt_add() { return 0; }, 'int');
  api.functie('esp_task_wdt_reset', function esp_task_wdt_reset() { return 0; }, 'int');
  api.functie('esp_task_wdt_delete', function esp_task_wdt_delete() { return 0; }, 'int');
  api.functie('WRITE_PERI_REG', function WRITE_PERI_REG() { }, 'void');
  api.constante.RTC_CNTL_BROWN_OUT_REG = 0;
  api.functie('disableCore0WDT', function disableCore0WDT() { }, 'void');
  api.functie('disableCore1WDT', function disableCore1WDT() { }, 'void');
  api.functie('enableLoopWDT', function enableLoopWDT() { }, 'void');
  api.functie('feedLoopWDT', function feedLoopWDT() { }, 'void');
  api.functie('rtc_get_reset_reason', function rtc_get_reset_reason() { return 1; }, 'int');
})(window.M = window.M || {});
