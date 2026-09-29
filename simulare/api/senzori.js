/* Meșter — bibliotecile senzorilor: DHT (Adafruit și DHTesp), DallasTemperature, Adafruit_BME280 /
   Adafruit_BMP280, Adafruit_MPU6050, MPU6050 (jrowberg și MPU6050_light), BH1750, NewPing și HX711.
   Senzorii I2C sunt citiți prin tranzacții Wire reale, deci adresa, firele și timpul contează. */
(function (M) {
  'use strict';
  const api = M.api;
  const S = () => M.simCurenta;
  const f = api.functii;
  const linie = () => { const s = S(); return s && s.R ? s.R.L : 0; };
  const sugestie = (cheie, mesaj) => S().problema(cheie, 'info', mesaj, { linie: linie() });
  const hex = (a) => '0x' + (a >>> 0).toString(16).toUpperCase().padStart(2, '0');
  // constantele pinMode diferă de la o platformă la alta
  const MOD = (m) => { const pl = S().cip ? S().cip.platforma : 'esp32'; return ({ esp32: { in: 1, out: 3, pu: 5 }, esp8266: { in: 0, out: 1, pu: 2 }, avr: { in: 0, out: 1, pu: 2 } })[pl][m]; };

  // registre I2C prin Wire: scrie(reg, val), citeste(reg, n) -> octeți sau null dacă nu răspunde
  class RegistreI2C {
    constructor(wire, adresa) { this.wire = wire; this.adresa = adresa; }
    scrie(reg, ...val) { const w = this.wire; w.beginTransmission(this.adresa); w.write(reg); for (const v of val) w.write(v & 255); return w.endTransmission() === 0; }
    citeste(reg, n) {
      const w = this.wire;
      w.beginTransmission(this.adresa); w.write(reg);
      if (w.endTransmission(false) !== 0) return null;
      if (w.requestFrom(this.adresa, n) < n) return null;
      const r = []; for (let i = 0; i < n; i++) r.push(w.read());
      return r;
    }
  }
  const s16 = (h, l) => { const v = ((h & 255) << 8) | (l & 255); return v & 0x8000 ? v - 0x10000 : v; };
  const wireDin = (w) => w instanceof api.clase.TwoWire ? w : S().obiecte.Wire;
  const pornesteWire = (w) => { if (!w.pornit) w.begin(); return w; };

  // ---------- DHT (Adafruit) ----------
  function gasesteDht(pin, numeLib) {
    const sim = S();
    const d = sim.cautaDupaPin(['dht'], 'DATA', pin)[0];
    if (!d) {
      const alt = sim.dispozitive(['dht'])[0];
      sim.problema('dht-pin-' + pin, 'eroare', numeLib + ' pe pinul ' + pin + ': niciun senzor DHT nu are pinul de date legat aici.' + (alt ? ' ' + alt.inst.eticheta + ' are DATA pe alt pin.' : ''), { linie: linie() });
    }
    return d || null;
  }
  // o citire completă pe fir: {ok, t, h} decodate cum le-ar decoda biblioteca pentru modelul dat
  function citireDht(d, modelCod) {
    const sim = S();
    const m = d.masoara();
    if (!m.ok) { sim.verificaAlimentare(d.inst, 3.3, 6); return { ok: false, stare: 1 }; }
    if (M.senzori.pullUp(sim, sim.netPin(d.inst, 'DATA')) > 50000 && Math.random() < 0.08) {
      sugestie('dht-pullup', 'Senzorul DHT nu are rezistor de pull-up pe DATA; merge cu pull-up-ul intern al plăcii, dar unele citiri eșuează. Pune 10 kΩ între DATA și VCC.');
      return { ok: false, stare: 1 };
    }
    const o = d.octeti(m);
    let t, h;
    if (modelCod === 11) { h = o[0] + o[1] * 0.1; t = o[2] + (o[3] & 0x0F) * 0.1; if (o[3] & 0x80) t = -1 - t; }
    else { h = ((o[0] << 8) | o[1]) * 0.1; t = (((o[2] & 0x7F) << 8) | o[3]) * 0.1; if (o[2] & 0x80) t = -t; }
    if ((modelCod === 11) !== (d.model === 'dht11')) {
      sim.problema('dht-model-' + d.inst.id, 'eroare', 'În cod senzorul e ' + (modelCod === 11 ? 'DHT11' : 'DHT22') + ', dar în schemă ' + d.inst.eticheta + ' e ' + (d.model === 'dht11' ? 'DHT11' : 'DHT22') + '. Datele se decodează greșit (valori absurde).', { linie: linie(), comp: d.inst.id });
    }
    return { ok: true, t: Math.fround(t), h: Math.fround(h) };
  }
  function indiceCaldura(t, h, faren) {
    const T = faren ? t : t * 1.8 + 32;
    let hi = 0.5 * (T + 61.0 + (T - 68.0) * 1.2 + h * 0.094);
    if (hi > 79) {
      hi = -42.379 + 2.04901523 * T + 10.14333127 * h - 0.22475541 * T * h - 0.00683783 * T * T - 0.05481717 * h * h + 0.00122874 * T * T * h + 0.00085282 * T * h * h - 0.00000199 * T * T * h * h;
      if (h < 13 && T >= 80 && T <= 112) hi -= ((13 - h) * 0.25) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
      else if (h > 85 && T >= 80 && T <= 87) hi += ((h - 85) * 0.1) * ((87 - T) * 0.2);
    }
    return faren ? hi : (hi - 32) * 0.55555;
  }
  class DHT {
    constructor(pin, tip) { this.pin = pin; this.tip = tip === 11 ? 11 : 22; this.ultimaCitire = -1e12; this.rezultat = { ok: false }; }
    begin() { f.pinMode(this.pin, MOD('pu')); this.ultimaCitire = S().timp / 1000 - 2000; }
    read(forteaza) {
      const sim = S();
      const acum = sim.timp / 1000;
      if (!forteaza && acum - this.ultimaCitire < 2000) return this.rezultat.ok;
      this.ultimaCitire = acum;
      const d = gasesteDht(this.pin, 'DHT');
      sim.consuma(this.tip === 11 ? 24000 : 5600); // semnalul de start + 40 de biți
      this.rezultat = d ? citireDht(d, this.tip) : { ok: false };
      return this.rezultat.ok;
    }
    readTemperature(faren, forteaza) { if (!this.read(forteaza)) return NaN; const t = this.rezultat.t; return faren ? t * 1.8 + 32 : t; }
    readHumidity(forteaza) { if (!this.read(forteaza)) return NaN; return this.rezultat.h; }
    computeHeatIndex(t, h, faren) { if (faren === undefined) faren = true; return indiceCaldura(t, h, faren); }
    convertCtoF(c) { return c * 1.8 + 32; }
    convertFtoC(x) { return (x - 32) * 0.55555; }
  }
  DHT.tipuri = { read: 'bool', readTemperature: 'float', readHumidity: 'float', computeHeatIndex: 'float', convertCtoF: 'float', convertFtoC: 'float' };
  api.clasa('DHT', DHT);
  Object.assign(api.constante, { DHT11: 11, DHT12: 12, DHT21: 21, DHT22: 22, AM2301: 21 });

  // ---------- DHTesp ----------
  class TempAndHumidity { constructor() { this.temperature = NaN; this.humidity = NaN; } __copie() { const o = new TempAndHumidity(); o.temperature = this.temperature; o.humidity = this.humidity; return o; } }
  TempAndHumidity.proprietati = { temperature: 'float', humidity: 'float' };
  api.clasa('TempAndHumidity', TempAndHumidity);
  class DHTesp {
    constructor() { this.pin = -1; this.model = 2; this.ultimaCitire = -1e12; this.stare = 0; this.t = NaN; this.h = NaN; }
    setup(pin, model) { this.pin = pin; this.model = model === undefined ? 0 : model; f.pinMode(pin, MOD('pu')); this.ultimaCitire = -1e12; }
    _citeste() {
      const sim = S();
      const acum = sim.timp / 1000;
      if (acum - this.ultimaCitire < this.getMinimumSamplingPeriod()) return;
      this.ultimaCitire = acum;
      const d = gasesteDht(this.pin, 'DHTesp');
      let cod = this.model === 1 ? 11 : 22;
      if (this.model === 0 && d) cod = d.model === 'dht11' ? 11 : 22; // AUTO_DETECT
      sim.consuma(cod === 11 ? 24000 : 5600);
      const r = d ? citireDht(d, cod) : { ok: false, stare: 1 };
      if (r.ok) { this.t = r.t; this.h = r.h; this.stare = 0; } else { this.t = NaN; this.h = NaN; this.stare = 1; }
    }
    getTemperature() { this._citeste(); return this.t; }
    getHumidity() { this._citeste(); return this.h; }
    getTempAndHumidity() { this._citeste(); const o = new TempAndHumidity(); o.temperature = this.t; o.humidity = this.h; return o; }
    getStatus() { return this.stare; }
    getStatusString() { return ['OK', 'TIMEOUT', 'CHECKSUM'][this.stare] || 'OK'; }
    getModel() { return this.model; }
    getMinimumSamplingPeriod() { return this.model === 1 ? 1000 : 2000; }
    getPin() { return this.pin; }
    computeHeatIndex(t, h, faren) { return indiceCaldura(t, h, !!faren); }
    computeDewPoint(t, h, faren) { if (faren) t = (t - 32) / 1.8; const a = 17.271, b = 237.7; const g = a * t / (b + t) + Math.log(h / 100); const dp = b * g / (a - g); return faren ? dp * 1.8 + 32 : dp; }
    toFahrenheit(c) { return c * 1.8 + 32; }
    toCelsius(x) { return (x - 32) / 1.8; }
  }
  DHTesp.tipuri = { getTemperature: 'float', getHumidity: 'float', getTempAndHumidity: 'obj:TempAndHumidity', getStatus: 'int', getStatusString: 'cstr', getModel: 'int', getMinimumSamplingPeriod: 'int', getPin: 'int', computeHeatIndex: 'float', computeDewPoint: 'float', toFahrenheit: 'float', toCelsius: 'float' };
  DHTesp.constanteStatice = { AUTO_DETECT: 0, DHT11: 1, DHT22: 2, AM2302: 3, RHT03: 4, ERROR_NONE: 0, ERROR_TIMEOUT: 1, ERROR_CHECKSUM: 2 };
  api.clasa('DHTesp', DHTesp);

  // ---------- DallasTemperature ----------
  const DECONECTAT = -127;
  class DallasTemperature {
    constructor(ow) { this.ow = ow || null; this.asteapta = true; this.rezolutie = 12; this.lista = []; }
    _dev() { return this.ow ? M.oneWire.dispozitive(this.ow.pin, 'DallasTemperature') : []; }
    setOneWire(ow) { this.ow = ow; }
    begin() {
      S().consuma(15000);
      this.lista = this._dev().slice().sort((a, b) => { for (let i = 7; i >= 0; i--) if (a.adresa[i] !== b.adresa[i]) return a.adresa[i] - b.adresa[i]; return 0; });
      for (const d of this.lista) if (d.rezolutie > this.rezolutie) this.rezolutie = d.rezolutie;
    }
    getDeviceCount() { return this.lista.length; }
    getDS18Count() { return this.lista.length; }
    validAddress(a) { return M.oneWire && a && OneWireCrc(a) === a[7]; }
    isConnected(a) { return !!this._dupaAdresa(a); }
    getAddress(buf, i) { const d = this.lista[i]; if (!d || !this._dev().includes(d)) return false; for (let k = 0; k < 8; k++) buf[k] = d.adresa[k]; return true; }
    _dupaAdresa(a) { return this._dev().find(d => d.adresa.every((b, i) => b === (a[i] & 255))) || null; }
    isParasitePowerMode() { return this._dev().some(d => d.parazit); }
    setResolution(a, b) {
      if (b === undefined) { this.rezolutie = Math.max(9, Math.min(12, a | 0)); for (const d of this._dev()) M.oneWire.seteazaRezolutia(d, this.rezolutie); return; }
      const d = this._dupaAdresa(a); if (d) M.oneWire.seteazaRezolutia(d, b); return !!d;
    }
    getResolution(a) { if (a === undefined) return this.rezolutie; const d = this._dupaAdresa(a); return d ? d.rezolutie : 0; }
    setWaitForConversion(x) { this.asteapta = !!x; }
    getWaitForConversion() { return this.asteapta; }
    setCheckForConversion() { }
    millisToWaitForConversion(r) { return [94, 188, 375, 750][Math.max(9, Math.min(12, (r === undefined ? this.rezolutie : r) | 0)) - 9]; }
    isConversionComplete() { return !this._dev().some(d => M.oneWire.ocupat(d)); }
    *_cere(dev) {
      S().consuma(2500);
      if (!dev.length) return false;
      for (const d of dev) M.oneWire.pornesteConversia(d);
      if (this.asteapta) yield { dorm: Math.max(...dev.map(d => d.timpConversie())) };
      return true;
    }
    *requestTemperatures() { return yield* this._cere(this._dev()); }
    *requestTemperaturesByIndex(i) { const d = this.lista[i]; return yield* this._cere(d && this._dev().includes(d) ? [d] : []); }
    *requestTemperaturesByAddress(a) { const d = this._dupaAdresa(a); return yield* this._cere(d ? [d] : []); }
    _temp(d) {
      S().consuma(6000);
      if (!d || !this._dev().includes(d)) return DECONECTAT;
      if (M.oneWire.ocupat(d) && !this.asteapta) { /* citirea în timpul conversiei dă valoarea veche */ }
      const t = M.oneWire.citesteTemperatura(d);
      if (t === 85 && !this.avertizat85) { this.avertizat85 = true; sugestie('ds-85', 'DS18B20 a răspuns cu 85 °C: e valoarea de la pornire, înainte de prima conversie. Apelează sensors.requestTemperatures() înainte de getTempCByIndex().'); }
      return t;
    }
    getTempCByIndex(i) { return this._temp(this.lista[i] || this._dev()[i]); }
    getTempFByIndex(i) { const t = this.getTempCByIndex(i); return t === DECONECTAT ? -196.6 : t * 1.8 + 32; }
    getTempC(a) { return this._temp(this._dupaAdresa(a)); }
    getTempF(a) { const t = this.getTempC(a); return t === DECONECTAT ? -196.6 : t * 1.8 + 32; }
    getTemp(a) { const t = this.getTempC(a); return t === DECONECTAT ? -7040 : Math.round(t * 128); }
    static toFahrenheit(c) { return c * 1.8 + 32; }
    static toCelsius(x) { return (x - 32) / 1.8; }
    static rawToCelsius(r) { return r / 128; }
    setHighAlarmTemp(a, t) { const d = this._dupaAdresa(a); if (d) d.th = t; }
    setLowAlarmTemp(a, t) { const d = this._dupaAdresa(a); if (d) d.tl = t; }
    hasAlarm() { return this._dev().some(d => { const t = M.oneWire.citesteTemperatura(d); return t >= d.th || t <= d.tl; }); }
  }
  function OneWireCrc(a) { return api.clase.OneWire.crc8(a, 7); }
  DallasTemperature.tipuri = { getDeviceCount: 'uint8_t', getDS18Count: 'uint8_t', getAddress: 'bool', isParasitePowerMode: 'bool', getResolution: 'uint8_t', getWaitForConversion: 'bool', millisToWaitForConversion: 'int16_t', isConversionComplete: 'bool',
    requestTemperatures: 'bool', requestTemperaturesByIndex: 'bool', requestTemperaturesByAddress: 'bool', getTempCByIndex: 'float', getTempFByIndex: 'float', getTempC: 'float', getTempF: 'float', getTemp: 'int32_t', isConnected: 'bool', validAddress: 'bool', setResolution: 'bool', hasAlarm: 'bool' };
  DallasTemperature.tipuriStatice = { toFahrenheit: 'float', toCelsius: 'float', rawToCelsius: 'float' };
  api.clasa('DallasTemperature', DallasTemperature);
  api.tipuriTablou.DeviceAddress = ['uint8_t', 8];
  Object.assign(api.constante, { DEVICE_DISCONNECTED_C: -127, DEVICE_DISCONNECTED_F: -196.6, DEVICE_DISCONNECTED_RAW: -7040, TEMP_9_BIT: 9, TEMP_10_BIT: 10, TEMP_11_BIT: 11, TEMP_12_BIT: 12 });

  // ---------- evenimente Adafruit_Sensor ----------
  class sensors_vec_t { constructor() { this.x = 0; this.y = 0; this.z = 0; this.roll = 0; this.pitch = 0; this.heading = 0; } __copie() { return Object.assign(new sensors_vec_t(), this); } }
  sensors_vec_t.proprietati = { x: 'float', y: 'float', z: 'float', roll: 'float', pitch: 'float', heading: 'float' };
  api.clasa('sensors_vec_t', sensors_vec_t);
  class sensors_event_t {
    constructor() { this.acceleration = new sensors_vec_t(); this.gyro = new sensors_vec_t(); this.magnetic = new sensors_vec_t(); this.orientation = new sensors_vec_t(); this.temperature = 0; this.relative_humidity = 0; this.pressure = 0; this.light = 0; this.timestamp = 0; this.version = 1; this.sensor_id = 0; this.type = 0; }
    __copie() { const o = new sensors_event_t(); Object.assign(o, this); o.acceleration = this.acceleration.__copie(); o.gyro = this.gyro.__copie(); return o; }
  }
  sensors_event_t.proprietati = { acceleration: 'obj:sensors_vec_t', gyro: 'obj:sensors_vec_t', magnetic: 'obj:sensors_vec_t', orientation: 'obj:sensors_vec_t', temperature: 'float', relative_humidity: 'float', pressure: 'float', light: 'float', timestamp: 'int32_t', version: 'int32_t', sensor_id: 'int32_t', type: 'int32_t' };
  api.clasa('sensors_event_t', sensors_event_t);
  Object.assign(api.constante, { SENSORS_GRAVITY_EARTH: 9.80665, SENSORS_GRAVITY_STANDARD: 9.80665, SENSORS_DPS_TO_RADS: 0.017453293, SENSORS_RADS_TO_DPS: 57.29577793, SEALEVELPRESSURE_HPA: 1013.25 });

  // ---------- BME280 / BMP280 (Adafruit) ----------
  const EȘANTIONARE = { MODE_SLEEP: 0, MODE_FORCED: 1, MODE_NORMAL: 3, MODE_SOFT_RESET_CODE: 0xB6, SAMPLING_NONE: 0, SAMPLING_X1: 1, SAMPLING_X2: 2, SAMPLING_X4: 3, SAMPLING_X8: 4, SAMPLING_X16: 5,
    FILTER_OFF: 0, FILTER_X2: 1, FILTER_X4: 2, FILTER_X8: 3, FILTER_X16: 4, STANDBY_MS_0_5: 0, STANDBY_MS_1: 0, STANDBY_MS_10: 6, STANDBY_MS_20: 7, STANDBY_MS_62_5: 1, STANDBY_MS_63: 1, STANDBY_MS_125: 2, STANDBY_MS_250: 3, STANDBY_MS_500: 4, STANDBY_MS_1000: 5, STANDBY_MS_2000: 6, STANDBY_MS_4000: 7 };
  function clasaBarometru(nume, idAsteptat, adresaImplicita, cuUmiditate) {
    const C = class {
      constructor() { this.dev = null; this.id = 0xFF; }
      begin(adresa, a2) {
        const sim = S();
        // BMP280: begin(adresă, chipid); BME280: begin(adresă, &Wire)
        const wire = pornesteWire(wireDin(a2));
        const idCerut = !cuUmiditate && typeof a2 === 'number' ? a2 : idAsteptat;
        const adr = adresa === undefined ? adresaImplicita : adresa;
        sim.consuma(3000);
        const r = new RegistreI2C(wire, adr);
        const id = r.citeste(0xD0, 1);
        this.id = id ? id[0] : 0xFF;
        const dev = wire.gaseste(adr);
        if (!id) {
          const altul = sim.dispozitive(['bme280']).filter(d => d.adresaI2C !== undefined);
          if (altul.length && altul[0].adresaI2C !== adr) sim.problema('bme-adresa', 'eroare', nume + '.begin(' + (adresa === undefined ? '' : hex(adr)) + ') caută senzorul la ' + hex(adr) + (adresa === undefined ? ' (adresa implicită a bibliotecii)' : '') + ', dar ' + altul[0].inst.eticheta + ' e la ' + hex(altul[0].adresaI2C) + '. Pune adresa în cod: .begin(' + hex(altul[0].adresaI2C) + ').', { linie: linie(), comp: altul[0].inst.id });
          else M.i2c.gasesteI2C(wire, adr, ['bme280'], nume);
          this.dev = null;
          return false;
        }
        if (this.id !== idCerut) {
          sim.problema('bme-id', 'eroare', nume + ' a găsit la ' + hex(adr) + ' un cip cu ID-ul ' + hex(this.id) + (this.id === 0x58 ? ' (BMP280, fără umiditate)' : this.id === 0x60 ? ' (BME280)' : '') + ', nu ' + hex(idCerut) + '. ' + (this.id === 0x58 && cuUmiditate ? 'Modulul tău e BMP280: folosește biblioteca Adafruit_BMP280.' : this.id === 0x60 && !cuUmiditate ? 'Modulul e BME280: folosește Adafruit_BME280.' : ''), { linie: linie(), comp: dev ? dev.inst.id : undefined });
          this.dev = null;
          return false;
        }
        this.dev = dev; this.r = r;
        return true;
      }
      init() { return this.begin(); }
      sensorID() { return this.id; }
      setSampling() { }
      takeForcedMeasurement() { S().consuma(10000); return true; }
      reset() { }
      _m() { if (!this.dev) return null; const d = this.r.citeste(0xF7, 8); return d ? this.dev.masura() : null; }
      readTemperature() { const m = this._m(); return m ? Math.fround(m.t) : NaN; }
      readPressure() { const m = this._m(); return m ? Math.fround(m.p) : NaN; }
      readHumidity() { if (!cuUmiditate) return NaN; const m = this._m(); return m ? Math.fround(m.h) : NaN; }
      readAltitude(pNivelMare) { const p = this.readPressure(); if (isNaN(p)) return NaN; return 44330 * (1 - Math.pow(p / 100 / (pNivelMare || 1013.25), 0.1903)); }
      seaLevelForAltitude(alt, p) { return p / Math.pow(1 - alt / 44330, 5.255); }
      getStatus() { return 0; }
    };
    C.tipuri = { begin: 'bool', init: 'bool', sensorID: 'uint32_t', readTemperature: 'float', readPressure: 'float', readHumidity: 'float', readAltitude: 'float', seaLevelForAltitude: 'float', takeForcedMeasurement: 'bool', getStatus: 'uint8_t' };
    C.constanteStatice = EȘANTIONARE;
    api.clasa(nume, C);
  }
  clasaBarometru('Adafruit_BME280', 0x60, 0x77, true);
  clasaBarometru('Adafruit_BMP280', 0x58, 0x77, false);
  Object.assign(api.constante, { BME280_ADDRESS: 0x77, BME280_ADDRESS_ALTERNATE: 0x76, BMP280_ADDRESS: 0x77, BMP280_ADDRESS_ALT: 0x76, BMP280_CHIPID: 0x58 });

  // ---------- MPU6050 ----------
  function mpuPrezent(r) { const id = r.citeste(0x75, 1); return id && id[0] === 0x68; }
  function mpuDate(r) {
    const d = r.citeste(0x3B, 14);
    if (!d) return null;
    return { ax: s16(d[0], d[1]), ay: s16(d[2], d[3]), az: s16(d[4], d[5]), t: s16(d[6], d[7]), gx: s16(d[8], d[9]), gy: s16(d[10], d[11]), gz: s16(d[12], d[13]) };
  }
  class Adafruit_MPU6050 {
    constructor() { this.r = null; this.gamaA = 0; this.gamaG = 1; this.banda = 0; }
    begin(adresa, wire) {
      const sim = S();
      const w = pornesteWire(wireDin(wire));
      const adr = adresa === undefined ? 0x68 : adresa;
      this.r = new RegistreI2C(w, adr);
      if (!mpuPrezent(this.r)) { M.i2c.gasesteI2C(w, adr, ['mpu6050'], 'Adafruit_MPU6050'); this.r = null; return false; }
      this.r.scrie(0x6B, 0x80);
      sim.consuma(100000); // biblioteca așteaptă 100 ms după reset
      this.r.scrie(0x19, 0); this.r.scrie(0x1A, 0); this.r.scrie(0x1B, 1 << 3); this.r.scrie(0x1C, 0); this.r.scrie(0x6B, 0x01);
      this.gamaA = 0; this.gamaG = 1;
      sim.consuma(100000);
      return true;
    }
    setAccelerometerRange(g) { this.gamaA = g & 3; if (this.r) this.r.scrie(0x1C, this.gamaA << 3); }
    getAccelerometerRange() { return this.gamaA; }
    setGyroRange(g) { this.gamaG = g & 3; if (this.r) this.r.scrie(0x1B, this.gamaG << 3); }
    getGyroRange() { return this.gamaG; }
    setFilterBandwidth(b) { this.banda = b & 7; if (this.r) this.r.scrie(0x1A, this.banda); }
    getFilterBandwidth() { return this.banda; }
    setSampleRateDivisor() { } setHighPassFilter() { } setMotionDetectionThreshold() { } setMotionDetectionDuration() { } setInterruptPinLatch() { } setInterruptPinPolarity() { } setMotionInterrupt() { } setCycleRate() { } enableCycle() { }
    getMotionInterruptStatus() { return false; }
    enableSleep(x) { if (this.r) this.r.scrie(0x6B, x ? 0x41 : 0x01); }
    reset() { if (this.r) this.r.scrie(0x6B, 0x80); }
    getEvent(a, g, t) {
      const d = this.r ? mpuDate(this.r) : null;
      if (!d) return false;
      const la = 16384 / (1 << this.gamaA), lg = 131 / (1 << this.gamaG);
      const G = 9.80665, RAD = 0.017453293;
      const ts = Math.floor(S().timp / 1000);
      if (a) { a.acceleration.x = Math.fround(d.ax / la * G); a.acceleration.y = Math.fround(d.ay / la * G); a.acceleration.z = Math.fround(d.az / la * G); a.timestamp = ts; }
      if (g) { g.gyro.x = Math.fround(d.gx / lg * RAD); g.gyro.y = Math.fround(d.gy / lg * RAD); g.gyro.z = Math.fround(d.gz / lg * RAD); g.timestamp = ts; }
      if (t) { t.temperature = Math.fround(d.t / 340 + 36.53); t.timestamp = ts; }
      return true;
    }
  }
  Adafruit_MPU6050.tipuri = { begin: 'bool', getEvent: 'bool', getAccelerometerRange: 'int', getGyroRange: 'int', getFilterBandwidth: 'int', getMotionInterruptStatus: 'bool' };
  api.clasa('Adafruit_MPU6050', Adafruit_MPU6050);
  Object.assign(api.constante, { MPU6050_RANGE_2_G: 0, MPU6050_RANGE_4_G: 1, MPU6050_RANGE_8_G: 2, MPU6050_RANGE_16_G: 3, MPU6050_RANGE_250_DEG: 0, MPU6050_RANGE_500_DEG: 1, MPU6050_RANGE_1000_DEG: 2, MPU6050_RANGE_2000_DEG: 3,
    MPU6050_BAND_260_HZ: 0, MPU6050_BAND_184_HZ: 1, MPU6050_BAND_94_HZ: 2, MPU6050_BAND_44_HZ: 3, MPU6050_BAND_21_HZ: 4, MPU6050_BAND_10_HZ: 5, MPU6050_BAND_5_HZ: 6, MPU6050_I2CADDR_DEFAULT: 0x68,
    MPU6050_ACCEL_FS_2: 0, MPU6050_ACCEL_FS_4: 1, MPU6050_ACCEL_FS_8: 2, MPU6050_ACCEL_FS_16: 3, MPU6050_GYRO_FS_250: 0, MPU6050_GYRO_FS_500: 1, MPU6050_GYRO_FS_1000: 2, MPU6050_GYRO_FS_2000: 3,
    MPU6050_DEFAULT_ADDRESS: 0x68, MPU6050_ADDRESS_AD0_LOW: 0x68, MPU6050_ADDRESS_AD0_HIGH: 0x69, MPU6050_DLPF_BW_256: 0, MPU6050_DLPF_BW_188: 1, MPU6050_DLPF_BW_98: 2, MPU6050_DLPF_BW_42: 3, MPU6050_DLPF_BW_20: 4, MPU6050_DLPF_BW_10: 5, MPU6050_DLPF_BW_5: 6 });

  // MPU6050 (jrowberg / Electronic Cats) și MPU6050_light — aceeași clasă, după cum e creată
  class MPU6050 {
    constructor(a) {
      this.usoara = a instanceof api.clase.TwoWire;
      this.wire = this.usoara ? a : null;
      this.adresa = typeof a === 'number' ? a : 0x68;
      this.r = null; this.gamaA = 0; this.gamaG = 0;
      this.offA = [0, 0, 0]; this.offG = [0, 0, 0];
      // MPU6050_light
      this.unghi = [0, 0, 0]; this.ultim = 0; this.coef = 0.98; this.ult = null; this.offL = { ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0 };
    }
    _r() { if (!this.r) this.r = new RegistreI2C(pornesteWire(this.wire || S().obiecte.Wire), this.adresa); return this.r; }
    initialize() {
      const r = this._r();
      r.scrie(0x6B, 0x01); r.scrie(0x1B, 0); r.scrie(0x1C, 0);
      this.gamaA = 0; this.gamaG = 0;
      if (!mpuPrezent(r)) M.i2c.gasesteI2C(r.wire, this.adresa, ['mpu6050'], 'MPU6050');
    }
    testConnection() { return this.getDeviceID() === 0x34; }
    getDeviceID() { const id = this._r().citeste(0x75, 1); return id ? (id[0] >> 1) & 0x3F : 0; }
    setSleepEnabled(x) { this._r().scrie(0x6B, x ? 0x41 : 0x01); }
    getSleepEnabled() { const v = this._r().citeste(0x6B, 1); return !!(v && v[0] & 0x40); }
    setClockSource() { }
    setFullScaleAccelRange(g) { this.gamaA = g & 3; this._r().scrie(0x1C, this.gamaA << 3); }
    getFullScaleAccelRange() { return this.gamaA; }
    setFullScaleGyroRange(g) { this.gamaG = g & 3; this._r().scrie(0x1B, this.gamaG << 3); }
    getFullScaleGyroRange() { return this.gamaG; }
    setDLPFMode(m) { this._r().scrie(0x1A, m & 7); }
    setRate() { }
    // decalaje „hardware”: pentru accelerometru în unități de ±16 g (2048/g), pentru giroscop de ±1000 °/s (32,8 pe °/s)
    _date() {
      const d = mpuDate(this._r());
      if (!d) return { ax: 0, ay: 0, az: 0, t: 0, gx: 0, gy: 0, gz: 0 };
      const fa = (16384 >> this.gamaA) / 2048, fg = (131 / (1 << this.gamaG)) / 32.8;
      const c = (v) => Math.max(-32768, Math.min(32767, Math.round(v)));
      return { ax: c(d.ax + this.offA[0] * fa), ay: c(d.ay + this.offA[1] * fa), az: c(d.az + this.offA[2] * fa), t: d.t, gx: c(d.gx + this.offG[0] * fg), gy: c(d.gy + this.offG[1] * fg), gz: c(d.gz + this.offG[2] * fg) };
    }
    getMotion6(ax, ay, az, gx, gy, gz) { const d = this._date(); ax.v = d.ax; ay.v = d.ay; az.v = d.az; gx.v = d.gx; gy.v = d.gy; gz.v = d.gz; }
    getAcceleration(ax, ay, az) { const d = this._date(); ax.v = d.ax; ay.v = d.ay; az.v = d.az; }
    getRotation(gx, gy, gz) { const d = this._date(); gx.v = d.gx; gy.v = d.gy; gz.v = d.gz; }
    getAccelerationX() { return this._date().ax; } getAccelerationY() { return this._date().ay; } getAccelerationZ() { return this._date().az; }
    getRotationX() { return this._date().gx; } getRotationY() { return this._date().gy; } getRotationZ() { return this._date().gz; }
    getTemperature() { return this._date().t; }
    setXAccelOffset(v) { this.offA[0] = v | 0; } setYAccelOffset(v) { this.offA[1] = v | 0; } setZAccelOffset(v) { this.offA[2] = v | 0; }
    setXGyroOffset(v) { this.offG[0] = v | 0; } setYGyroOffset(v) { this.offG[1] = v | 0; } setZGyroOffset(v) { this.offG[2] = v | 0; }
    getXAccelOffset() { return this.offA[0]; } getYAccelOffset() { return this.offA[1]; } getZAccelOffset() { return this.offA[2]; }
    getXGyroOffset() { return this.offG[0]; } getYGyroOffset() { return this.offG[1]; } getZGyroOffset() { return this.offG[2]; }
    // calibrarea: aduce X și Y la 0 și Z la +1 g, cu placa ținută nemișcată și orizontal
    *_calibreaza(bucle, acc) {
      const n = Math.max(1, (bucle | 0) * 100);
      const s = [0, 0, 0];
      for (let i = 0; i < n; i++) { const d = this._date(); if (acc) { s[0] += d.ax; s[1] += d.ay; s[2] += d.az; } else { s[0] += d.gx; s[1] += d.gy; s[2] += d.gz; } if (i % 50 === 49) yield { dorm: 1000 }; }
      if (acc) { const unu = 16384 >> this.gamaA, fa = unu / 2048; this.offA[0] -= Math.round(s[0] / n / fa); this.offA[1] -= Math.round(s[1] / n / fa); this.offA[2] -= Math.round((s[2] / n - unu) / fa); }
      else { const fg = (131 / (1 << this.gamaG)) / 32.8; for (let k = 0; k < 3; k++) this.offG[k] -= Math.round(s[k] / n / fg); }
      const ser = S().obiecte.Serial; if (ser && ser.pornit) ser._scrie('*');
    }
    *CalibrateAccel(b) { yield* this._calibreaza(b === undefined ? 15 : b, true); }
    *CalibrateGyro(b) { yield* this._calibreaza(b === undefined ? 15 : b, false); }
    PrintActiveOffsets() {
      const ser = S().obiecte.Serial;
      if (ser) ser._scrie('\r\n//           X Accel  Y Accel  Z Accel   X Gyro   Y Gyro   Z Gyro\r\n//OFFSETS   ' + [...this.offA, ...this.offG].map(v => String(v).padStart(6)).join(',  ') + '\r\n');
    }
    // ---- MPU6050_light ----
    begin(gcfg, acfg) {
      const r = this._r();
      if (!mpuPrezent(r)) { M.i2c.gasesteI2C(r.wire, this.adresa, ['mpu6050'], 'MPU6050'); return 1; }
      r.scrie(0x19, 0); r.scrie(0x1A, 0); r.scrie(0x6B, 0x01);
      this.setFullScaleGyroRange(gcfg === undefined ? 1 : gcfg); this.setFullScaleAccelRange(acfg === undefined ? 0 : acfg);
      this.ultim = S().timp;
      this.update();
      this.unghi = [this.getAccAngleX(), this.getAccAngleY(), 0];
      return 0;
    }
    setAddress(a) { this.adresa = a; this.r = null; }
    getAddress() { return this.adresa; }
    _fizic() {
      const d = this._date();
      const la = 16384 >> this.gamaA, lg = 131 / (1 << this.gamaG);
      const o = this.offL;
      return { ax: d.ax / la - o.ax, ay: d.ay / la - o.ay, az: d.az / la - o.az, gx: d.gx / lg - o.gx, gy: d.gy / lg - o.gy, gz: d.gz / lg - o.gz, t: d.t / 340 + 36.53 };
    }
    *calcOffsets(calcG, calcA) {
      if (calcG === undefined) calcG = true; if (calcA === undefined) calcA = true;
      const vechi = this.offL; this.offL = { ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0 };
      const s = { ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0 };
      for (let i = 0; i < 500; i++) { const x = this._fizic(); for (const k in s) s[k] += x[k]; yield { dorm: 1000 }; }
      this.offL = { ax: calcA ? s.ax / 500 : vechi.ax, ay: calcA ? s.ay / 500 : vechi.ay, az: calcA ? s.az / 500 - 1 : vechi.az, gx: calcG ? s.gx / 500 : vechi.gx, gy: calcG ? s.gy / 500 : vechi.gy, gz: calcG ? s.gz / 500 : vechi.gz };
    }
    setGyroOffsets(x, y, z) { this.offL.gx = x; this.offL.gy = y; this.offL.gz = z; }
    setAccOffsets(x, y, z) { this.offL.ax = x; this.offL.ay = y; this.offL.az = z; }
    setFilterGyroCoef(c) { this.coef = Math.max(0, Math.min(1, c)); }
    setFilterAccCoef(c) { this.coef = 1 - Math.max(0, Math.min(1, c)); }
    update() {
      const x = this._fizic();
      this.ult = x;
      const acum = S().timp;
      const dt = Math.max(0, (acum - this.ultim) / 1e6); this.ultim = acum;
      const ax = this.getAccAngleX(), ay = this.getAccAngleY();
      this.unghi[0] = this.coef * (this.unghi[0] + x.gx * dt) + (1 - this.coef) * ax;
      this.unghi[1] = this.coef * (this.unghi[1] + x.gy * dt) + (1 - this.coef) * ay;
      this.unghi[2] += x.gz * dt;
    }
    fetchData() { this.ult = this._fizic(); }
    _u() { return this.ult || (this.ult = this._fizic()); }
    getAccX() { return this._u().ax; } getAccY() { return this._u().ay; } getAccZ() { return this._u().az; }
    getGyroX() { return this._u().gx; } getGyroY() { return this._u().gy; } getGyroZ() { return this._u().gz; }
    getTemp() { return this._u().t; }
    getAccAngleX() { const u = this._u(); const sg = u.az < 0 ? -1 : 1; return Math.atan2(u.ay, sg * Math.sqrt(u.az * u.az + u.ax * u.ax)) * 180 / Math.PI; }
    getAccAngleY() { const u = this._u(); return -Math.atan2(u.ax, Math.sqrt(u.az * u.az + u.ay * u.ay)) * 180 / Math.PI; }
    getAngleX() { return this.unghi[0]; } getAngleY() { return this.unghi[1]; } getAngleZ() { return this.unghi[2]; }
    getGyroXoffset() { return this.offL.gx; } getGyroYoffset() { return this.offL.gy; } getGyroZoffset() { return this.offL.gz; }
    getAccXoffset() { return this.offL.ax; } getAccYoffset() { return this.offL.ay; } getAccZoffset() { return this.offL.az; }
  }
  const i16 = 'int16_t', fl = 'float';
  MPU6050.tipuri = { testConnection: 'bool', getDeviceID: 'uint8_t', getSleepEnabled: 'bool', getFullScaleAccelRange: 'uint8_t', getFullScaleGyroRange: 'uint8_t', getAccelerationX: i16, getAccelerationY: i16, getAccelerationZ: i16, getRotationX: i16, getRotationY: i16, getRotationZ: i16, getTemperature: i16,
    getXAccelOffset: i16, getYAccelOffset: i16, getZAccelOffset: i16, getXGyroOffset: i16, getYGyroOffset: i16, getZGyroOffset: i16, begin: 'uint8_t', getAddress: 'uint8_t',
    getAccX: fl, getAccY: fl, getAccZ: fl, getGyroX: fl, getGyroY: fl, getGyroZ: fl, getTemp: fl, getAccAngleX: fl, getAccAngleY: fl, getAngleX: fl, getAngleY: fl, getAngleZ: fl,
    getGyroXoffset: fl, getGyroYoffset: fl, getGyroZoffset: fl, getAccXoffset: fl, getAccYoffset: fl, getAccZoffset: fl };
  api.clasa('MPU6050', MPU6050);

  // ---------- BH1750 ----------
  class BH1750 {
    constructor(adresa) { this.adresa = adresa || 0x23; this.r = null; this.mod = 0; this.mt = 69; }
    begin(mod, adresa, wire) {
      if (adresa) this.adresa = adresa;
      const w = pornesteWire(wireDin(wire));
      this.r = new RegistreI2C(w, this.adresa);
      return this.configure(mod === undefined ? 0x10 : mod);
    }
    configure(mod) {
      if (!this.r) return false;
      const w = this.r.wire;
      w.beginTransmission(this.adresa); w.write(mod & 255);
      const ok = w.endTransmission() === 0;
      if (!ok) { M.i2c.gasesteI2C(w, this.adresa, ['bh1750'], 'BH1750'); return false; }
      this.mod = mod;
      S().consuma(10);
      return true;
    }
    setMTreg(mt) { if (!this.r) return false; this.mt = Math.max(31, Math.min(254, mt | 0)); const w = this.r.wire; w.beginTransmission(this.adresa); w.write(0x40 | (this.mt >> 5)); w.endTransmission(); w.beginTransmission(this.adresa); w.write(0x60 | (this.mt & 0x1F)); w.endTransmission(); return this.configure(this.mod); }
    measurementReady(asteapta) { return true; }
    readLightLevel() {
      if (!this.r) return -2;
      const w = this.r.wire;
      if (w.requestFrom(this.adresa, 2) !== 2) return -1;
      const v = (w.read() << 8) | w.read();
      let lux = v / 1.2 * 69 / this.mt;
      if (this.mod === 0x11 || this.mod === 0x21) lux /= 2;
      return Math.fround(lux);
    }
  }
  BH1750.tipuri = { begin: 'bool', configure: 'bool', setMTreg: 'bool', measurementReady: 'bool', readLightLevel: 'float' };
  BH1750.constanteStatice = { UNCONFIGURED: 0, CONTINUOUS_HIGH_RES_MODE: 0x10, CONTINUOUS_HIGH_RES_MODE_2: 0x11, CONTINUOUS_LOW_RES_MODE: 0x13, ONE_TIME_HIGH_RES_MODE: 0x20, ONE_TIME_HIGH_RES_MODE_2: 0x21, ONE_TIME_LOW_RES_MODE: 0x23 };
  api.clasa('BH1750', BH1750);

  // ---------- NewPing (conduce pinii ca biblioteca reală) ----------
  class NewPing {
    constructor(trig, echo, maxCm) { this.trig = trig; this.echo = echo; this.max = Math.min(500, maxCm || 500); this.pornit = false; }
    *ping(maxCm) {
      const sim = S();
      const max = Math.min(this.max, maxCm || this.max);
      if (!this.pornit) { f.pinMode(this.trig, MOD('out')); f.pinMode(this.echo, MOD('in')); this.pornit = true; }
      f.digitalWrite(this.trig, 0); sim.consuma(4);
      f.digitalWrite(this.trig, 1); sim.consuma(10);
      f.digitalWrite(this.trig, 0);
      const nivel = () => sim.citesteNivelFaraEfecte(this.echo);
      const asteapta = function* (cond, pana) {
        if (cond()) return true;
        return !!(yield { asteapta: () => cond() ? true : undefined, pana, laExpirare: false, pas: 4 });
      };
      // ecoul trebuie să înceapă în cel mult 5,8 ms
      if (!(yield* asteapta(() => nivel() === 1, sim.timp + 5800))) return 0;
      const start = sim.timp;
      const limita = start + max * 57 + 60;
      if (!(yield* asteapta(() => nivel() === 0, limita))) return 0;
      return Math.max(1, Math.round(sim.timp - start));
    }
    *ping_cm(maxCm) { const us = yield* this.ping(maxCm); return us ? Math.max(1, Math.floor(us / 57)) : 0; }
    *ping_in(maxCm) { const us = yield* this.ping(maxCm); return us ? Math.max(1, Math.floor(us / 146)) : 0; }
    *ping_median(n, maxCm) {
      n = Math.max(1, n || 5);
      const v = [];
      for (let i = 0; i < n; i++) { const us = yield* this.ping(maxCm); if (us) v.push(us); if (i < n - 1) yield { dorm: 30000 }; }
      if (!v.length) return 0;
      v.sort((a, b) => a - b);
      return v[Math.floor(v.length / 2)];
    }
    convert_cm(us) { return us ? Math.max(1, Math.floor(us / 57)) : 0; }
    convert_in(us) { return us ? Math.max(1, Math.floor(us / 146)) : 0; }
    static convert_cm(us) { return us ? Math.max(1, Math.floor(us / 57)) : 0; }
    static convert_in(us) { return us ? Math.max(1, Math.floor(us / 146)) : 0; }
  }
  NewPing.tipuri = { ping: 'unsigned long', ping_cm: 'unsigned long', ping_in: 'unsigned long', ping_median: 'unsigned long', convert_cm: 'unsigned long', convert_in: 'unsigned long' };
  NewPing.tipuriStatice = { convert_cm: 'unsigned long', convert_in: 'unsigned long' };
  api.clasa('NewPing', NewPing);
  Object.assign(api.constante, { NO_ECHO: 0, US_ROUNDTRIP_CM: 57, US_ROUNDTRIP_IN: 146 });

  // ---------- HX711 ----------
  class HX711 {
    constructor() { this.dt = -1; this.sck = -1; this.castig = 128; this.offset = 0; this.scala = 1; this.urmatoarea = 0; this.oprit = false; }
    begin(dt, sck, castig) { this.dt = dt; this.sck = sck; this.set_gain(castig === undefined ? 128 : castig); f.pinMode(sck, MOD('out')); f.pinMode(dt, MOD('in')); this.urmatoarea = S().timp + 100000; }
    _dev() {
      const sim = S();
      const d = sim.cautaDupaPin(['hx711'], 'DT', this.dt).find(x => sim.netPin(x.inst, 'SCK') === sim.netGPIO(this.sck));
      if (!d) {
        const inv = sim.cautaDupaPin(['hx711'], 'DT', this.sck).length;
        sim.problema('hx711-' + this.dt, 'eroare', inv ? 'HX711: DT și SCK sunt inversate față de scale.begin(' + this.dt + ', ' + this.sck + ').' : 'HX711: nu găsesc modulul cu DT pe pinul ' + this.dt + ' și SCK pe pinul ' + this.sck + '. scale.read() va aștepta la nesfârșit.', { linie: linie() });
      }
      return d || null;
    }
    set_gain(g) { this.castig = g === 64 ? 64 : g === 32 ? 32 : 128; const d = this._dev(); if (d) d.castig = this.castig; }
    get_gain() { return this.castig; }
    is_ready() { const d = this._dev(); return !!(d && !this.oprit && d.valoare() !== null && S().timp >= this.urmatoarea); }
    *wait_ready(ms) { while (!this.is_ready()) yield { dorm: (ms || 1) * 1000 }; }
    *wait_ready_timeout(timeout, ms) { const lim = S().timp + (timeout === undefined ? 1000 : timeout) * 1000; while (!this.is_ready()) { if (S().timp >= lim) return false; yield { dorm: (ms || 1) * 1000 }; } return true; }
    *read() {
      const sim = S();
      // modulul dă o valoare nouă de 10 ori pe secundă; biblioteca așteaptă până e gata
      let astept = 0;
      while (!this.is_ready()) {
        yield { dorm: 1000 };
        if (++astept > 3000 && !this.avertizat) { this.avertizat = true; sim.problema('hx711-blocat', 'eroare', 'scale.read() așteaptă de peste 3 secunde: HX711 nu răspunde (verifică DT, SCK și alimentarea).', { linie: linie() }); }
      }
      const d = this._dev();
      sim.consuma(60);
      this.urmatoarea = Math.max(sim.timp, this.urmatoarea) + 100000;
      return d.valoare();
    }
    *read_average(n) { n = Math.max(1, n === undefined ? 10 : n); let s = 0; for (let i = 0; i < n; i++) s += yield* this.read(); return Math.trunc(s / n); }
    *get_value(n) { return (yield* this.read_average(n === undefined ? 1 : n)) - this.offset; }
    *get_units(n) { return (yield* this.get_value(n === undefined ? 1 : n)) / this.scala; }
    *tare(n) { this.offset = yield* this.read_average(n === undefined ? 10 : n); }
    set_scale(s) { this.scala = s === undefined ? 1 : (s || 1); }
    get_scale() { return this.scala; }
    set_offset(o) { this.offset = o | 0; }
    get_offset() { return this.offset; }
    power_down() { this.oprit = true; f.digitalWrite(this.sck, 0); f.digitalWrite(this.sck, 1); }
    power_up() { this.oprit = false; f.digitalWrite(this.sck, 0); this.urmatoarea = S().timp + 400000; }
  }
  HX711.tipuri = { is_ready: 'bool', read: 'long', read_average: 'long', get_value: 'double', get_units: 'float', get_scale: 'float', get_offset: 'long', get_gain: 'uint8_t', wait_ready_timeout: 'bool' };
  api.clasa('HX711', HX711);

  api.include('DHT.h', 'DHT_U.h', 'DHTesp.h', 'OneWire.h', 'DallasTemperature.h', 'Adafruit_Sensor.h', 'Adafruit_BME280.h', 'Adafruit_BMP280.h', 'Adafruit_MPU6050.h', 'MPU6050.h', 'MPU6050_light.h', 'I2Cdev.h', 'BH1750.h', 'NewPing.h', 'HX711.h');
})(window.M = window.M || {});
