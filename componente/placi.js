/* Meșter — plăcile de dezvoltare: ESP32 DevKit V1, ESP32-S3 DevKitC-1, ESP32-C3 SuperMini,
   NodeMCU ESP8266 și Arduino Nano. Pinii, capabilitățile GPIO și desenele urmează plăcile reale. */
(function (M) {
  'use strict';
  const D = M.desen;
  const C = D.CUL;

  // ---------- informații despre cipuri ----------
  function gamă(a, b) { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; }

  const CIP_ESP32 = {
    platforma: 'esp32', cip: 'ESP32', vdd: 3.3, adcBiti: 12, adcVmax: 3.1, adcVmin: 0.14, toleranta5V: false,
    valide: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 37, 38, 39],
    doarIntrare: [34, 35, 36, 37, 38, 39], faraPull: [34, 35, 36, 37, 38, 39],
    adc1: [32, 33, 34, 35, 36, 37, 38, 39], adc2: [0, 2, 4, 12, 13, 14, 15, 25, 26, 27],
    touch: { 4: 0, 0: 1, 2: 2, 15: 3, 13: 4, 12: 5, 14: 6, 27: 7, 33: 8, 32: 9 },
    dac: { 25: 1, 26: 2 }, strapping: [0, 2, 5, 12, 15], flash: [6, 7, 8, 9, 10, 11], psram: [], uart0: [1, 3],
    i2c: { sda: 21, scl: 22 }, spi: { sck: 18, miso: 19, mosi: 23, ss: 5 }, serial1: { rx: 9, tx: 10 }, serial2: { rx: 16, tx: 17 },
    touchLiber: 1280, touchAtins: 300, touchCrescator: false, ledcCanale: 16, pwmMaxFrecv: 40000000, arePwm: true
  };
  const CIP_S3 = {
    platforma: 'esp32', cip: 'ESP32-S3', vdd: 3.3, adcBiti: 12, adcVmax: 3.1, adcVmin: 0.0, toleranta5V: false,
    valide: gamă(0, 21).concat(gamă(26, 48)), doarIntrare: [], faraPull: [],
    adc1: gamă(1, 10), adc2: gamă(11, 20),
    touch: Object.fromEntries(gamă(1, 14).map(g => [g, g])), dac: {}, strapping: [0, 3, 45, 46], flash: gamă(26, 32), psram: [35, 36, 37], uart0: [43, 44], usb: [19, 20],
    i2c: { sda: 8, scl: 9 }, spi: { sck: 12, miso: 13, mosi: 11, ss: 10 }, serial1: { rx: 18, tx: 17 }, serial2: { rx: 16, tx: 15 },
    touchLiber: 26000, touchAtins: 48000, touchCrescator: true, ledcCanale: 8, arePwm: true
  };
  const CIP_C3 = {
    platforma: 'esp32', cip: 'ESP32-C3', vdd: 3.3, adcBiti: 12, adcVmax: 2.5, adcVmin: 0.0, toleranta5V: false,
    valide: gamă(0, 21), doarIntrare: [], faraPull: [],
    adc1: [0, 1, 2, 3, 4], adc2: [5], touch: {}, dac: {}, strapping: [2, 8, 9], flash: gamă(12, 17), psram: [], uart0: [20, 21], usb: [18, 19],
    i2c: { sda: 8, scl: 9 }, spi: { sck: 4, miso: 5, mosi: 6, ss: 7 }, serial1: { rx: 18, tx: 19 },
    ledcCanale: 6, arePwm: true
  };
  const CIP_8266 = {
    platforma: 'esp8266', cip: 'ESP8266', vdd: 3.3, adcBiti: 10, adcVmax: 3.2, adcVmin: 0, toleranta5V: false,
    valide: [0, 1, 2, 3, 4, 5, 9, 10, 12, 13, 14, 15, 16, 17], doarIntrare: [17], faraPull: [16, 17],
    adc1: [17], adc2: [], touch: {}, dac: {}, strapping: [0, 2, 15], flash: [6, 7, 8, 11], psram: [], uart0: [1, 3],
    i2c: { sda: 4, scl: 5 }, spi: { sck: 14, miso: 12, mosi: 13, ss: 15 }, faraIntrerupere: [16], arePwm: true
  };
  const CIP_NANO = {
    platforma: 'avr', cip: 'ATmega328P', vdd: 5, adcBiti: 10, adcVmax: 5, adcVmin: 0, toleranta5V: true,
    valide: gamă(0, 21), doarIntrare: [20, 21], faraPull: [20, 21],
    adc1: gamă(14, 21), adc2: [], touch: {}, dac: {}, strapping: [], flash: [], psram: [], uart0: [0, 1],
    i2c: { sda: 18, scl: 19 }, spi: { sck: 13, miso: 12, mosi: 11, ss: 10 }, pwm: [3, 5, 6, 9, 10, 11], intreruperi: { 2: 0, 3: 1 },
    doarAnalog: [20, 21], arePwm: true
  };

  function constanteEsp32(ledBuiltin) {
    const k = { LED_BUILTIN: ledBuiltin, BUILTIN_LED: ledBuiltin, SDA: 21, SCL: 22, SS: 5, MOSI: 23, MISO: 19, SCK: 18, TX: 1, RX: 3, DAC1: 25, DAC2: 26,
      A0: 36, A3: 39, A4: 32, A5: 33, A6: 34, A7: 35, A10: 4, A11: 0, A12: 2, A13: 15, A14: 13, A15: 12, A16: 14, A17: 27, A18: 25, A19: 26,
      T0: 4, T1: 0, T2: 2, T3: 15, T4: 13, T5: 12, T6: 14, T7: 27, T8: 33, T9: 32, NUM_DIGITAL_PINS: 40, NUM_ANALOG_INPUTS: 16, SOC_GPIO_PIN_COUNT: 40 };
    return k;
  }
  function constanteS3(rev) {
    const rgb = rev === 'v1.1' ? 38 : 48;
    const k = { SDA: 8, SCL: 9, SS: 10, MOSI: 11, MISO: 13, SCK: 12, TX: 43, RX: 44, PIN_RGB_LED: rgb, LED_BUILTIN: 49 + rgb, RGB_BUILTIN: 49 + rgb, BUILTIN_LED: 49 + rgb, RGB_BRIGHTNESS: 64, SOC_GPIO_PIN_COUNT: 49, NUM_DIGITAL_PINS: 49 };
    for (let i = 0; i <= 9; i++) k['A' + i] = i + 1;
    for (let i = 10; i <= 19; i++) k['A' + i] = i + 1;
    for (let i = 1; i <= 14; i++) k['T' + i] = i;
    return k;
  }
  function constanteC3() {
    return { LED_BUILTIN: 8, BUILTIN_LED: 8, SDA: 8, SCL: 9, SS: 7, MOSI: 6, MISO: 5, SCK: 4, TX: 21, RX: 20, A0: 0, A1: 1, A2: 2, A3: 3, A4: 4, A5: 5, SOC_GPIO_PIN_COUNT: 22, NUM_DIGITAL_PINS: 22 };
  }
  function constante8266() {
    return { D0: 16, D1: 5, D2: 4, D3: 0, D4: 2, D5: 14, D6: 12, D7: 13, D8: 15, D9: 3, D10: 1, RX: 3, TX: 1, A0: 17, LED_BUILTIN: 2, BUILTIN_LED: 2, LED_BUILTIN_AUX: 16, SDA: 4, SCL: 5, SS: 15, MOSI: 13, MISO: 12, SCK: 14, NUM_DIGITAL_PINS: 17, NUM_ANALOG_INPUTS: 1 };
  }
  function constanteNano() {
    const k = { LED_BUILTIN: 13, SDA: 18, SCL: 19, SS: 10, MOSI: 11, MISO: 12, SCK: 13, NUM_DIGITAL_PINS: 20, NUM_ANALOG_INPUTS: 8 };
    for (let i = 0; i < 8; i++) k['A' + i] = 14 + i;
    return k;
  }
  const MACRO_ESP32 = { ESP32: 1, ARDUINO_ARCH_ESP32: 1, ARDUINO: 10819, ESP_ARDUINO_VERSION_MAJOR: 3, ESP_ARDUINO_VERSION_MINOR: 0, ESP_ARDUINO_VERSION_PATCH: 7, CONFIG_IDF_TARGET_ESP32: 1, ARDUINO_ESP32_DEV: 1, CONFIG_FREERTOS_HZ: 1000 };
  const MACRO_S3 = { ESP32: 1, ARDUINO_ARCH_ESP32: 1, ARDUINO: 10819, ESP_ARDUINO_VERSION_MAJOR: 3, ESP_ARDUINO_VERSION_MINOR: 0, ESP_ARDUINO_VERSION_PATCH: 7, CONFIG_IDF_TARGET_ESP32S3: 1, ARDUINO_ESP32S3_DEV: 1, BOARD_HAS_PSRAM: 1, CONFIG_FREERTOS_HZ: 1000, ARDUINO_USB_CDC_ON_BOOT: 1 };
  const MACRO_C3 = { ESP32: 1, ARDUINO_ARCH_ESP32: 1, ARDUINO: 10819, ESP_ARDUINO_VERSION_MAJOR: 3, ESP_ARDUINO_VERSION_MINOR: 0, ESP_ARDUINO_VERSION_PATCH: 7, CONFIG_IDF_TARGET_ESP32C3: 1, ARDUINO_ESP32C3_DEV: 1, CONFIG_FREERTOS_HZ: 1000, ARDUINO_USB_CDC_ON_BOOT: 1 };
  const MACRO_8266 = { ESP8266: 1, ARDUINO_ARCH_ESP8266: 1, ARDUINO: 10819, ARDUINO_ESP8266_NODEMCU_ESP12E: 1 };
  const MACRO_NANO = { __AVR__: 1, __AVR_ATmega328P__: 1, ARDUINO_ARCH_AVR: 1, ARDUINO_AVR_NANO: 1, ARDUINO: 10819, F_CPU: 16000000 };

  // ---------- plăci ----------
  // Construiește lista de pini pentru o placă cu două rânduri verticale
  function piniDouaRanduri(stanga, dreapta, dx, pas) {
    pas = pas || 10;
    const r = [];
    stanga.forEach((p, i) => { if (p) r.push(Object.assign({ x: 0, y: i * pas, latura: 'st' }, p)); });
    dreapta.forEach((p, i) => { if (p) r.push(Object.assign({ x: dx, y: i * pas, latura: 'dr' }, p)); });
    return r;
  }
  function pinG(gpio, et, extra) { return Object.assign({ id: et.replace(/\s/g, ''), eticheta: et, gpio, tip: 'io' }, extra || {}); }
  function pinP(id, et, tip) { return { id, eticheta: et || id, tip }; }

  function descrierePin(placa, p) {
    if (p.tip === 'gnd') return 'Masă (GND, 0 V)';
    if (p.tip === '3v3') return 'Ieșire 3,3 V de la regulatorul plăcii';
    if (p.tip === '5v') return placa.cip.platforma === 'avr' ? 'Alimentare 5 V' : 'Tensiunea de la USB (≈5 V). Poate fi folosit și ca intrare de alimentare';
    if (p.tip === 'en') return 'Reset (EN) — la LOW placa se resetează';
    if (p.gpio === undefined) return p.eticheta;
    const c = placa.cip;
    const parti = ['GPIO' + p.gpio];
    if (c.doarIntrare.includes(p.gpio)) parti.push('doar intrare');
    if (c.adc1.includes(p.gpio)) parti.push('ADC1');
    if (c.adc2.includes(p.gpio)) parti.push('ADC2 (nu merge cu WiFi pornit)');
    if (c.touch[p.gpio] !== undefined) parti.push('tactil T' + c.touch[p.gpio]);
    if (c.dac[p.gpio]) parti.push('DAC' + c.dac[p.gpio]);
    if (c.strapping.includes(p.gpio)) parti.push('pin de pornire (strapping) — atenție ce legi aici');
    if (c.flash.includes(p.gpio)) parti.push('folosit de memoria flash — NU îl folosi');
    if (c.psram.includes(p.gpio)) parti.push('folosit de PSRAM pe modulele N16R8/N8R8');
    if (c.uart0.includes(p.gpio)) parti.push('UART0 (programare / Serial)');
    if (c.i2c.sda === p.gpio) parti.push('SDA implicit');
    if (c.i2c.scl === p.gpio) parti.push('SCL implicit');
    if (c.spi.mosi === p.gpio) parti.push('MOSI implicit');
    if (c.spi.miso === p.gpio) parti.push('MISO implicit');
    if (c.spi.sck === p.gpio) parti.push('SCK implicit');
    if (c.spi.ss === p.gpio) parti.push('SS/CS implicit');
    return parti.join(' · ');
  }

  // Elemente electrice comune plăcilor alimentate prin USB
  function electricPlaca(ctx, inst, info) {
    const p = inst.prop || {};
    const extern = p.alimentare === 'extern';
    for (const pid of info.gnd) ctx.fix(pid, 0, 'GND placă');
    if (!extern) {
      for (const pid of info.v5) ctx.fix(pid, info.v5val || 4.9, 'USB (5 V)');
      for (const pid of info.v33) ctx.fix(pid, info.cip.vdd === 5 ? 3.3 : 3.3, 'regulator 3,3 V');
    } else {
      // regulator liniar din VIN: ieșire 3,3 V dacă intrarea e suficientă
      const vin = info.v5[0];
      for (const pid of info.v33) ctx.regulator(vin, pid, info.gnd[0], 3.3, 1.1, 'regulator 3,3 V');
    }
    return {};
  }

  // ---------- ESP32 DevKit V1 ----------
  const DEVKIT_ST = [
    pinP('EN', 'EN', 'en'), pinG(36, 'VP', { id: 'VP' }), pinG(39, 'VN', { id: 'VN' }), pinG(34, 'D34'), pinG(35, 'D35'), pinG(32, 'D32'), pinG(33, 'D33'),
    pinG(25, 'D25'), pinG(26, 'D26'), pinG(27, 'D27'), pinG(14, 'D14'), pinG(12, 'D12'), pinG(13, 'D13'), pinP('GND2', 'GND', 'gnd'), pinP('VIN', 'VIN', '5v')
  ];
  const DEVKIT_DR = [
    pinG(23, 'D23'), pinG(22, 'D22'), pinG(1, 'TX0'), pinG(3, 'RX0'), pinG(21, 'D21'), pinG(19, 'D19'), pinG(18, 'D18'), pinG(5, 'D5'),
    pinG(17, 'TX2'), pinG(16, 'RX2'), pinG(4, 'D4'), pinG(2, 'D2'), pinG(15, 'D15'), pinP('GND1', 'GND', 'gnd'), pinP('3V3', '3V3', '3v3')
  ];

  function desenModulWroom(x, y, w, h, eticheta, sub) {
    let s = '';
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="#15171a"/>`;
    // antenă în meandre
    const ah = h * 0.24;
    let d = `M ${x + 4} ${y + ah - 2}`;
    const pasM = (w - 8) / 7;
    for (let i = 0; i < 7; i++) {
      const xx = x + 4 + i * pasM;
      d += ` L ${xx} ${y + 3} L ${xx + pasM / 2} ${y + 3} L ${xx + pasM / 2} ${y + ah - 3} L ${xx + pasM} ${y + ah - 3}`;
    }
    s += `<path d="${d}" fill="none" stroke="#b58b3c" stroke-width="1.1" stroke-linejoin="round"/>`;
    // scut metalic
    const sy = y + ah, sh = h - ah - 1.5;
    s += `<rect x="${x + 2.5}" y="${sy}" width="${w - 5}" height="${sh}" rx="1" fill="url(#metalScut)" stroke="#7d838b" stroke-width="0.5"/>`;
    s += D.text(x + w / 2, sy + sh * 0.35, eticheta, { m: 5, c: '#3a3f46', g: 700, f: 'var(--font-afisaj)' });
    if (sub) s += D.text(x + w / 2, sy + sh * 0.55, sub, { m: 3, c: '#4a5058', g: 500 });
    s += `<rect x="${x + w * 0.35}" y="${sy + sh * 0.72}" width="${w * 0.3}" height="${sh * 0.13}" fill="none" stroke="#5c626a" stroke-width="0.5"/>`;
    return s;
  }
  function microUSB(cx, y) {
    return `<rect x="${cx - 9}" y="${y}" width="18" height="11" rx="1.2" fill="url(#metalScut)" stroke="#6f757d" stroke-width="0.6"/><rect x="${cx - 6}" y="${y + 3}" width="12" height="3" rx="1" fill="#2c2f34"/>`;
  }
  function usbC(cx, y) {
    return `<rect x="${cx - 9}" y="${y}" width="18" height="9" rx="4" fill="url(#metalScut)" stroke="#6f757d" stroke-width="0.6"/><rect x="${cx - 6}" y="${y + 3}" width="12" height="3" rx="1.5" fill="#2c2f34"/>`;
  }

  M.componente.defineste({
    tip: 'esp32-devkit-v1', nume: 'ESP32 DevKit V1', categorie: 'placi', eticheta: 'ESP',
    cauta: 'esp32 devkit doit wroom 30 pini placa microcontroler wifi bluetooth',
    descriere: 'Placa clasică ESP32 cu 30 de pini (DOIT DevKit V1). WiFi + Bluetooth, 240 MHz, două nuclee, logică de 3,3 V. LED albastru pe GPIO2.',
    prop: [
      { cheie: 'alimentare', eticheta: 'Alimentare', tip: 'alegere', optiuni: [['usb', 'USB de la calculator'], ['extern', 'Extern, pe pinul VIN']], implicit: 'usb' }
    ],
    placa: { cip: CIP_ESP32, constante: constanteEsp32(2), macrouri: MACRO_ESP32, nume: 'ESP32 Dev Module', fqbn: 'esp32:esp32:esp32' },
    pini: () => piniDouaRanduri(DEVKIT_ST, DEVKIT_DR, 100),
    cutie: () => ({ x: -9, y: -52, w: 118, h: 214 }),
    interne: () => [['GND1', 'GND2']],
    esteplaca: true,
    desen(p) {
      let s = D.pcb(-9, -52, 118, 214, { culoare: '#1b1e22', raza: 3, gauri: 4 });
      s += desenModulWroom(8, -50, 84, 118, 'ESP32-WROOM-32', 'Wi-Fi · BT');
      // componente sub modul
      s += D.cip(30, 82, 22, 14, { eticheta: 'CP2102', m: 2.6, punct: true });
      s += D.cip(60, 84, 14, 10, { eticheta: 'AMS1117', m: 2 });
      s += `<rect x="64" y="104" width="7" height="4" fill="#d9d9d9"/><rect x="28" y="104" width="6" height="4" fill="#caa56b"/>`;
      s += D.butonSMD(20, 140, 'EN');
      s += D.butonSMD(80, 140, 'BOOT');
      s += `<g data-act="en" class="buton-placa"><rect x="14" y="134" width="12" height="12" fill="transparent"/></g>`;
      s += `<g data-act="boot" class="buton-placa"><rect x="74" y="134" width="12" height="12" fill="transparent"/></g>`;
      // LED-uri: roșu (alimentare), albastru (GPIO2)
      s += `<rect x="37" y="118" width="4" height="2.4" fill="#e6e6e6"/><circle cx="39" cy="119.2" r="3.4" fill="#ff2a1a" opacity="0" data-r="led-pwr"/>`;
      s += `<rect x="59" y="118" width="4" height="2.4" fill="#e6e6e6"/><circle cx="61" cy="119.2" r="3.4" fill="#3b8bff" opacity="0" data-r="led-io"/>`;
      s += D.text(39, 124.5, 'PWR', { m: 2.3 }) + D.text(61, 124.5, 'D2', { m: 2.3 });
      s += microUSB(50, 150);
      s += D.text(50, 72, 'ESP32 DEVKIT V1', { m: 3.6, g: 700, ls: 0.3 });
      // pini + etichete
      for (const pin of this.pini(p)) {
        s += D.pinAntet(pin.x, pin.y);
        const dx = pin.latura === 'st' ? 5 : -5;
        s += D.text(pin.x + dx, pin.y, pin.eticheta, { m: 3.1, a: pin.latura === 'st' ? 'start' : 'end' });
      }
      return s;
    },
    electric(ctx, inst) {
      const info = { cip: CIP_ESP32, gnd: ['GND1', 'GND2'], v5: ['VIN'], v33: ['3V3'] };
      electricPlaca(ctx, inst, info);
      // LED-ul albastru de pe GPIO2 (prin rezistență de 1 kΩ la masă)
      const nodLed = ctx.nodNou();
      ctx.R('D2', nodLed, 1000);
      const led = ctx.D(nodLed, 'GND1', 'albastru');
      // butonul BOOT leagă GPIO0 la masă
      const boot = ctx.S(ctx.netGpio(0), 'GND1', false);
      return { ledIo: led, boot };
    },
    vizual(g, inst, sim, el) {
      const pwr = g.querySelector('[data-r="led-pwr"]');
      if (pwr) pwr.setAttribute('opacity', sim && sim.alimentata !== false ? 0.85 : 0);
      const io = g.querySelector('[data-r="led-io"]');
      if (io && el && el.ledIo) io.setAttribute('opacity', Math.min(1, Math.max(0, el.ledIo.iMed / 0.0012)) * 0.95);
    }
  });

  // ---------- ESP32-S3 DevKitC-1 ----------
  const S3_ST = [
    pinP('3V3a', '3V3', '3v3'), pinP('3V3b', '3V3', '3v3'), pinP('RST', 'RST', 'en'),
    pinG(4, '4', { id: 'GPIO4' }), pinG(5, '5', { id: 'GPIO5' }), pinG(6, '6', { id: 'GPIO6' }), pinG(7, '7', { id: 'GPIO7' }), pinG(15, '15', { id: 'GPIO15' }),
    pinG(16, '16', { id: 'GPIO16' }), pinG(17, '17', { id: 'GPIO17' }), pinG(18, '18', { id: 'GPIO18' }), pinG(8, '8', { id: 'GPIO8' }), pinG(3, '3', { id: 'GPIO3' }),
    pinG(46, '46', { id: 'GPIO46' }), pinG(9, '9', { id: 'GPIO9' }), pinG(10, '10', { id: 'GPIO10' }), pinG(11, '11', { id: 'GPIO11' }), pinG(12, '12', { id: 'GPIO12' }),
    pinG(13, '13', { id: 'GPIO13' }), pinG(14, '14', { id: 'GPIO14' }), pinP('5V', '5V', '5v'), pinP('GNDa', 'G', 'gnd')
  ];
  const S3_DR = [
    pinP('GNDb', 'G', 'gnd'), pinG(43, 'TX', { id: 'GPIO43' }), pinG(44, 'RX', { id: 'GPIO44' }), pinG(1, '1', { id: 'GPIO1' }), pinG(2, '2', { id: 'GPIO2' }),
    pinG(42, '42', { id: 'GPIO42' }), pinG(41, '41', { id: 'GPIO41' }), pinG(40, '40', { id: 'GPIO40' }), pinG(39, '39', { id: 'GPIO39' }), pinG(38, '38', { id: 'GPIO38' }),
    pinG(37, '37', { id: 'GPIO37' }), pinG(36, '36', { id: 'GPIO36' }), pinG(35, '35', { id: 'GPIO35' }), pinG(0, '0', { id: 'GPIO0' }), pinG(45, '45', { id: 'GPIO45' }),
    pinG(48, '48', { id: 'GPIO48' }), pinG(47, '47', { id: 'GPIO47' }), pinG(21, '21', { id: 'GPIO21' }), pinG(20, '20', { id: 'GPIO20' }), pinG(19, '19', { id: 'GPIO19' }),
    pinP('GNDc', 'G', 'gnd'), pinP('GNDd', 'G', 'gnd')
  ];
  M.componente.defineste({
    tip: 'esp32-s3-devkitc', nume: 'ESP32-S3 DevKitC-1', categorie: 'placi', eticheta: 'ESP',
    cauta: 'esp32 s3 devkitc n16r8 n8r8 psram usb c rgb placa',
    descriere: 'ESP32-S3 cu 44 de pini (N16R8: 16 MB flash, 8 MB PSRAM). USB nativ, LED RGB adresabil, fără DAC. Pe modulele N16R8, GPIO35–37 sunt ocupați de PSRAM.',
    prop: [
      { cheie: 'modul', eticheta: 'Modul', tip: 'alegere', optiuni: [['N16R8', 'N16R8 (PSRAM octal)'], ['N8', 'N8 (fără PSRAM)']], implicit: 'N16R8' },
      { cheie: 'revizie', eticheta: 'Revizie placă', tip: 'alegere', optiuni: [['v1.0', 'v1.0 (LED RGB pe GPIO48)'], ['v1.1', 'v1.1 (LED RGB pe GPIO38)']], implicit: 'v1.0' },
      { cheie: 'alimentare', eticheta: 'Alimentare', tip: 'alegere', optiuni: [['usb', 'USB de la calculator'], ['extern', 'Extern, pe pinul 5V']], implicit: 'usb' }
    ],
    placa: { cip: CIP_S3, constante: constanteS3('v1.0'), macrouri: MACRO_S3, nume: 'ESP32S3 Dev Module', fqbn: 'esp32:esp32:esp32s3' },
    placaDin(p) {
      const cip = Object.assign({}, CIP_S3, { psram: p.modul === 'N8' ? [] : [35, 36, 37] });
      return { cip, constante: constanteS3(p.revizie), macrouri: MACRO_S3, nume: 'ESP32S3 Dev Module', fqbn: 'esp32:esp32:esp32s3', rgbPin: p.revizie === 'v1.1' ? 38 : 48 };
    },
    pini: () => piniDouaRanduri(S3_ST, S3_DR, 90),
    cutie: () => ({ x: -8, y: -58, w: 106, h: 298 }),
    interne: () => [['GNDa', 'GNDb', 'GNDc', 'GNDd'], ['3V3a', '3V3b']],
    esteplaca: true,
    desen(p) {
      let s = D.pcb(-8, -58, 106, 298, { culoare: '#16181c', raza: 3, gauri: 4 });
      s += desenModulWroom(10, -56, 70, 110, 'ESP32-S3', 'WROOM-1 ' + (p.modul || 'N16R8'));
      s += D.cip(30, 120, 30, 16, { eticheta: 'CH343', m: 2.6, punct: true });
      s += D.butonSMD(18, 212, 'BOOT');
      s += D.butonSMD(72, 212, 'RST');
      s += `<g data-act="boot" class="buton-placa"><rect x="12" y="206" width="12" height="12" fill="transparent"/></g>`;
      s += `<g data-act="en" class="buton-placa"><rect x="66" y="206" width="12" height="12" fill="transparent"/></g>`;
      s += `<rect x="41" y="160" width="8" height="8" rx="1" fill="#f1efe8" stroke="#bbb" stroke-width="0.4"/><circle cx="45" cy="164" r="5" fill="#000" opacity="0" data-r="rgb"/>`;
      s += D.text(45, 172, 'RGB@IO' + (p.revizie === 'v1.1' ? '38' : '48'), { m: 2.4 });
      s += `<rect x="58" y="180" width="3" height="2" fill="#e6e6e6"/><circle cx="59.5" cy="181" r="2.8" fill="#ff2a1a" opacity="0" data-r="led-pwr"/>`;
      s += usbC(26, 230) + usbC(64, 230);
      s += D.text(26, 226, 'USB', { m: 2.5 }) + D.text(64, 226, 'UART', { m: 2.5 });
      s += D.text(45, 100, 'ESP32-S3-DevKitC-1', { m: 3.4, g: 700 });
      for (const pin of this.pini(p)) {
        s += D.pinAntet(pin.x, pin.y);
        const dx = pin.latura === 'st' ? 5 : -5;
        s += D.text(pin.x + dx, pin.y, pin.eticheta, { m: 3.2, a: pin.latura === 'st' ? 'start' : 'end' });
      }
      return s;
    },
    electric(ctx, inst) {
      electricPlaca(ctx, inst, { cip: CIP_S3, gnd: ['GNDa', 'GNDb', 'GNDc', 'GNDd'], v5: ['5V'], v33: ['3V3a', '3V3b'] });
      const boot = ctx.S(ctx.netGpio(0), 'GNDa', false);
      return { boot };
    },
    vizual(g, inst, sim) {
      const pwr = g.querySelector('[data-r="led-pwr"]');
      if (pwr) pwr.setAttribute('opacity', sim ? 0.85 : 0);
      const rgb = g.querySelector('[data-r="rgb"]');
      if (rgb) {
        const c = sim && sim.rgbPlaca;
        if (c && (c[0] || c[1] || c[2])) {
          const m = Math.max(c[0], c[1], c[2]);
          rgb.setAttribute('fill', `rgb(${Math.round(c[0] / m * 255)},${Math.round(c[1] / m * 255)},${Math.round(c[2] / m * 255)})`);
          rgb.setAttribute('opacity', Math.min(1, 0.35 + m / 255));
        } else rgb.setAttribute('opacity', 0);
      }
    }
  });

  // ---------- ESP32-C3 SuperMini ----------
  const C3_ST = [pinP('5V', '5V', '5v'), pinP('GND', 'G', 'gnd'), pinP('3V3', '3.3', '3v3'), pinG(4, '4', { id: 'GPIO4' }), pinG(3, '3', { id: 'GPIO3' }), pinG(2, '2', { id: 'GPIO2' }), pinG(1, '1', { id: 'GPIO1' }), pinG(0, '0', { id: 'GPIO0' })];
  const C3_DR = [pinG(5, '5', { id: 'GPIO5' }), pinG(6, '6', { id: 'GPIO6' }), pinG(7, '7', { id: 'GPIO7' }), pinG(8, '8', { id: 'GPIO8' }), pinG(9, '9', { id: 'GPIO9' }), pinG(10, '10', { id: 'GPIO10' }), pinG(20, '20', { id: 'GPIO20' }), pinG(21, '21', { id: 'GPIO21' })];
  M.componente.defineste({
    tip: 'esp32-c3-supermini', nume: 'ESP32-C3 SuperMini', categorie: 'placi', eticheta: 'ESP',
    cauta: 'esp32 c3 super mini supermini risc-v usb c mica',
    descriere: 'Plăcuță minusculă cu ESP32-C3 (RISC-V, un nucleu, WiFi + BLE). LED albastru pe GPIO8, aprins la LOW. ADC-ul măsoară până la aproximativ 2,5 V.',
    prop: [{ cheie: 'alimentare', eticheta: 'Alimentare', tip: 'alegere', optiuni: [['usb', 'USB de la calculator'], ['extern', 'Extern, pe pinul 5V']], implicit: 'usb' }],
    placa: { cip: CIP_C3, constante: constanteC3(), macrouri: MACRO_C3, nume: 'ESP32C3 Dev Module', fqbn: 'esp32:esp32:esp32c3' },
    pini: () => piniDouaRanduri(C3_ST, C3_DR, 60),
    cutie: () => ({ x: -9, y: -22, w: 78, h: 98 }),
    esteplaca: true,
    desen(p) {
      let s = D.pcb(-9, -22, 78, 98, { culoare: '#17191d', raza: 3 });
      s += usbC(30, -24);
      s += D.cip(15, 18, 30, 26, { culoare: '#26292e', eticheta: 'ESP32-C3', m: 3.4, punct: true });
      s += `<rect x="18" y="52" width="24" height="3" fill="#b58b3c"/>`;
      s += D.butonSMD(12, 4, 'B') + D.butonSMD(48, 4, 'R');
      s += `<g data-act="boot" class="buton-placa"><rect x="6" y="-2" width="12" height="12" fill="transparent"/></g>`;
      s += `<g data-act="en" class="buton-placa"><rect x="42" y="-2" width="12" height="12" fill="transparent"/></g>`;
      s += `<rect x="28" y="60" width="4" height="2.4" fill="#e6e6e6"/><circle cx="30" cy="61.2" r="3.4" fill="#3b8bff" opacity="0" data-r="led-io"/>`;
      s += D.text(30, 67, 'SuperMini', { m: 3, g: 700 });
      for (const pin of this.pini(p)) {
        s += D.pinAntet(pin.x, pin.y);
        const dx = pin.latura === 'st' ? 5 : -5;
        s += D.text(pin.x + dx, pin.y, pin.eticheta, { m: 3.2, a: pin.latura === 'st' ? 'start' : 'end' });
      }
      return s;
    },
    electric(ctx, inst) {
      electricPlaca(ctx, inst, { cip: CIP_C3, gnd: ['GND'], v5: ['5V'], v33: ['3V3'] });
      // LED albastru între 3V3 și GPIO8 (se aprinde când GPIO8 e LOW)
      const n = ctx.nodNou();
      ctx.R('3V3', n, 1000);
      const led = ctx.D(n, 'GPIO8', 'albastru');
      const boot = ctx.S(ctx.netGpio(9), 'GND', false);
      return { ledIo: led, boot };
    },
    vizual(g, inst, sim, el) {
      const io = g.querySelector('[data-r="led-io"]');
      if (io && el && el.ledIo) io.setAttribute('opacity', Math.min(1, Math.max(0, el.ledIo.iMed / 0.001)) * 0.95);
    }
  });

  // ---------- NodeMCU ESP8266 ----------
  const NM_ST = [pinG(17, 'A0', { id: 'A0' }), pinP('RSV1', 'RSV', 'nc'), pinP('RSV2', 'RSV', 'nc'), pinG(10, 'SD3'), pinG(9, 'SD2'), pinP('SD1', 'SD1', 'nc'), pinP('CMD', 'CMD', 'nc'), pinP('SD0', 'SD0', 'nc'), pinP('CLK', 'CLK', 'nc'),
    pinP('GND1', 'GND', 'gnd'), pinP('3V3a', '3V3', '3v3'), pinP('EN', 'EN', 'en'), pinP('RST', 'RST', 'en'), pinP('GND2', 'GND', 'gnd'), pinP('VIN', 'Vin', '5v')];
  const NM_DR = [pinG(16, 'D0'), pinG(5, 'D1'), pinG(4, 'D2'), pinG(0, 'D3'), pinG(2, 'D4'), pinP('3V3b', '3V3', '3v3'), pinP('GND3', 'GND', 'gnd'), pinG(14, 'D5'), pinG(12, 'D6'),
    pinG(13, 'D7'), pinG(15, 'D8'), pinG(3, 'RX'), pinG(1, 'TX'), pinP('GND4', 'GND', 'gnd'), pinP('3V3c', '3V3', '3v3')];
  M.componente.defineste({
    tip: 'nodemcu-esp8266', nume: 'NodeMCU ESP8266', categorie: 'placi', eticheta: 'ESP',
    cauta: 'nodemcu esp8266 esp-12e amica lolin wemos wifi placa',
    descriere: 'NodeMCU v2 cu ESP8266 (ESP-12E). Un singur pin analogic (A0, 0–3,3 V). Pinii se numesc D0–D8; LED-ul de pe D4 (GPIO2) se aprinde la LOW.',
    prop: [{ cheie: 'alimentare', eticheta: 'Alimentare', tip: 'alegere', optiuni: [['usb', 'USB de la calculator'], ['extern', 'Extern, pe pinul Vin']], implicit: 'usb' }],
    placa: { cip: CIP_8266, constante: constante8266(), macrouri: MACRO_8266, nume: 'NodeMCU 1.0 (ESP-12E)', fqbn: 'esp8266:esp8266:nodemcuv2' },
    pini: () => piniDouaRanduri(NM_ST, NM_DR, 90),
    cutie: () => ({ x: -9, y: -58, w: 108, h: 220 }),
    interne: () => [['GND1', 'GND2', 'GND3', 'GND4'], ['3V3a', '3V3b', '3V3c'], ['EN', 'RST']],
    esteplaca: true,
    desen(p) {
      let s = D.pcb(-9, -58, 108, 220, { culoare: '#1a1c20', raza: 3, gauri: 4 });
      s += `<rect x="12" y="-56" width="66" height="90" rx="1" fill="#15171a"/>`;
      s += `<path d="M16 -50 h10 v10 h8 v-10 h8 v10 h8 v-10 h8 v10 h8" fill="none" stroke="#b58b3c" stroke-width="1.1"/>`;
      s += `<rect x="14" y="-34" width="62" height="64" rx="1" fill="url(#metalScut)" stroke="#7d838b" stroke-width="0.5"/>`;
      s += D.text(45, -12, 'ESP8266MOD', { m: 4.6, c: '#3a3f46', g: 700 });
      s += D.text(45, -4, 'ESP-12E', { m: 3.2, c: '#4a5058' });
      s += D.cip(30, 76, 26, 14, { eticheta: 'CP2102', m: 2.6, punct: true });
      s += D.butonSMD(20, 126, 'RST') + D.butonSMD(70, 126, 'FLASH');
      s += `<g data-act="en" class="buton-placa"><rect x="14" y="120" width="12" height="12" fill="transparent"/></g>`;
      s += `<g data-act="boot" class="buton-placa"><rect x="64" y="120" width="12" height="12" fill="transparent"/></g>`;
      s += `<circle cx="72" cy="-22" r="3" fill="#3b8bff" opacity="0" data-r="led-io"/>`;
      s += microUSB(45, 150);
      s += D.text(45, 58, 'NodeMCU V2', { m: 3.6, g: 700 });
      for (const pin of this.pini(p)) {
        s += D.pinAntet(pin.x, pin.y);
        const dx = pin.latura === 'st' ? 5 : -5;
        s += D.text(pin.x + dx, pin.y, pin.eticheta, { m: 3.1, a: pin.latura === 'st' ? 'start' : 'end' });
      }
      return s;
    },
    electric(ctx, inst) {
      electricPlaca(ctx, inst, { cip: CIP_8266, gnd: ['GND1', 'GND2', 'GND3', 'GND4'], v5: ['VIN'], v33: ['3V3a', '3V3b', '3V3c'] });
      const n = ctx.nodNou();
      ctx.R('3V3a', n, 470);
      const led = ctx.D(n, 'D4', 'albastru');
      const boot = ctx.S(ctx.netGpio(0), 'GND1', false);
      return { ledIo: led, boot };
    },
    vizual(g, inst, sim, el) {
      const io = g.querySelector('[data-r="led-io"]');
      if (io && el && el.ledIo) io.setAttribute('opacity', Math.min(1, Math.max(0, el.ledIo.iMed / 0.001)) * 0.95);
    }
  });

  // ---------- Arduino Nano ----------
  const NANO_ST = [pinG(13, 'D13'), pinP('3V3', '3V3', '3v3'), pinP('AREF', 'REF', 'nc'), pinG(14, 'A0'), pinG(15, 'A1'), pinG(16, 'A2'), pinG(17, 'A3'), pinG(18, 'A4'), pinG(19, 'A5'), pinG(20, 'A6'), pinG(21, 'A7'),
    pinP('5V', '5V', '5v'), pinP('RST1', 'RST', 'en'), pinP('GND1', 'GND', 'gnd'), pinP('VIN', 'VIN', 'vin')];
  const NANO_DR = [pinG(12, 'D12'), pinG(11, 'D11'), pinG(10, 'D10'), pinG(9, 'D9'), pinG(8, 'D8'), pinG(7, 'D7'), pinG(6, 'D6'), pinG(5, 'D5'), pinG(4, 'D4'), pinG(3, 'D3'), pinG(2, 'D2'),
    pinP('GND2', 'GND', 'gnd'), pinP('RST2', 'RST', 'en'), pinG(0, 'RX0', { id: 'RX0' }), pinG(1, 'TX1', { id: 'TX1' })];
  M.componente.defineste({
    tip: 'arduino-nano', nume: 'Arduino Nano', categorie: 'placi', eticheta: 'NANO',
    cauta: 'arduino nano atmega328p avr 5v clasic',
    descriere: 'Arduino Nano (ATmega328P, 16 MHz, 5 V). int are 16 biți, double e la fel ca float, PWM doar pe 3, 5, 6, 9, 10, 11. Util pentru comparație cu ESP32.',
    prop: [{ cheie: 'alimentare', eticheta: 'Alimentare', tip: 'alegere', optiuni: [['usb', 'USB de la calculator'], ['extern', 'Extern, pe pinul 5V']], implicit: 'usb' }],
    placa: { cip: CIP_NANO, constante: constanteNano(), macrouri: MACRO_NANO, nume: 'Arduino Nano', fqbn: 'arduino:avr:nano' },
    pini: () => piniDouaRanduri(NANO_ST, NANO_DR, 60),
    cutie: () => ({ x: -9, y: -26, w: 78, h: 184 }),
    interne: () => [['GND1', 'GND2'], ['RST1', 'RST2']],
    esteplaca: true,
    desen(p) {
      let s = D.pcb(-9, -26, 78, 184, { culoare: '#1f5aa0', raza: 2, gauri: 3.5 });
      s += `<rect x="20" y="-30" width="20" height="14" rx="1.5" fill="url(#metalScut)" stroke="#6f757d" stroke-width="0.6"/>`;
      s += D.cip(16, 50, 28, 28, { eticheta: 'ATMEGA328P', m: 2.4, punct: true });
      s += `<rect x="24" y="95" width="12" height="6" rx="1" fill="${C.metal}"/>`;
      s += D.text(30, 98, '16.000', { m: 2, c: '#555' });
      s += D.butonSMD(30, 115, 'RESET');
      s += `<g data-act="en" class="buton-placa"><rect x="24" y="109" width="12" height="12" fill="transparent"/></g>`;
      s += `<rect x="12" y="130" width="3" height="2" fill="#eee"/><circle cx="13.5" cy="131" r="2.6" fill="#ffae00" opacity="0" data-r="led-io"/>`;
      s += `<rect x="45" y="130" width="3" height="2" fill="#eee"/><circle cx="46.5" cy="131" r="2.6" fill="#35d04a" opacity="0" data-r="led-pwr"/>`;
      s += D.text(13.5, 136, 'L', { m: 2.4 }) + D.text(46.5, 136, 'ON', { m: 2.4 });
      s += D.text(30, 30, 'ARDUINO', { m: 4, g: 800, ls: 0.4 }) + D.text(30, 36, 'NANO', { m: 3.4, g: 700 });
      for (const pin of this.pini(p)) {
        s += D.pad(pin.x, pin.y, { patrat: pin.id === 'D13' || pin.id === 'D12' });
        const dx = pin.latura === 'st' ? 5 : -5;
        s += D.text(pin.x + dx, pin.y, pin.eticheta, { m: 3.1, a: pin.latura === 'st' ? 'start' : 'end' });
      }
      return s;
    },
    electric(ctx, inst) {
      const p = inst.prop || {};
      ctx.fix('GND1', 0, 'GND placă');
      if (p.alimentare !== 'extern') ctx.fix('5V', 5.0, 'USB (5 V)');
      ctx.fix('3V3', 3.3, 'regulator 3,3 V');
      const n = ctx.nodNou();
      ctx.R('D13', n, 1000);
      const led = ctx.D(n, 'GND1', 'galben');
      return { ledIo: led };
    },
    vizual(g, inst, sim, el) {
      const pwr = g.querySelector('[data-r="led-pwr"]');
      if (pwr) pwr.setAttribute('opacity', sim ? 0.9 : 0);
      const io = g.querySelector('[data-r="led-io"]');
      if (io && el && el.ledIo) io.setAttribute('opacity', Math.min(1, Math.max(0, el.ledIo.iMed / 0.002)) * 0.95);
    }
  });

  M.placi = {
    info(inst) {
      const d = M.componente.def(inst.tip);
      if (!d || !d.placa) return null;
      const p = M.componente.prop(inst);
      return d.placaDin ? d.placaDin(p) : d.placa;
    },
    descrierePin,
    CIP_ESP32, CIP_S3, CIP_C3, CIP_8266, CIP_NANO
  };
})(window.M = window.M || {});
