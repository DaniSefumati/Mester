/* Meșter — RTClib (Adafruit): DateTime, TimeSpan, RTC_DS3231, RTC_DS1307, RTC_Millis.
   Ceasurile hardware se citesc și se scriu prin I2C, registru cu registru, ca biblioteca reală — deci
   contează firele, adresa, alimentarea și dacă ora a fost setată. */
(function (M) {
  'use strict';
  const api = M.api;
  const S = () => M.simCurenta;
  const txt = M.ajutoareR.txt;
  const linie = () => { const s = S(); return s && s.R ? s.R.L : 0; };
  const C = () => M.calendar;
  const SEC_1970_2000 = 946684800;
  const LUNI = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const ZILE = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const d2 = (x) => String(x).padStart(2, '0');

  // ---------- TimeSpan ----------
  class TimeSpan {
    constructor(a, h, m, s) {
      if (a instanceof TimeSpan) this._s = a._s;
      else if (h === undefined) this._s = (a | 0);
      else this._s = (((a | 0) * 24 + (h | 0)) * 60 + (m | 0)) * 60 + (s | 0);
    }
    days() { return Math.trunc(this._s / 86400); }
    hours() { return Math.trunc(this._s / 3600) % 24; }
    minutes() { return Math.trunc(this._s / 60) % 60; }
    seconds() { return this._s % 60; }
    totalseconds() { return this._s; }
    __copie() { return new TimeSpan(this._s); }
    egal(o) { return o instanceof TimeSpan && o._s === this._s; }
    valueOf() { return this._s; }
    static __op(op, a, b) {
      const x = a instanceof TimeSpan ? a._s : +a, y = b instanceof TimeSpan ? b._s : +b;
      return new TimeSpan(op === '-' ? x - y : x + y);
    }
  }
  TimeSpan.tipuri = { days: 'int16_t', hours: 'int8_t', minutes: 'int8_t', seconds: 'int8_t', totalseconds: 'int32_t' };
  api.clasa('TimeSpan', TimeSpan);

  // ---------- DateTime ----------
  class DateTime {
    constructor(a, luna, zi, ora, min, sec) {
      let s2000;
      if (a instanceof DateTime) s2000 = a._s;
      else if (a === undefined) s2000 = 0;
      else if (luna !== undefined && typeof luna === 'number') {
        s2000 = C().laSecunde2000(a >= 2000 ? a - 2000 : a, luna, zi || 1, ora || 0, min || 0, sec || 0);
        this._invalid = !(luna >= 1 && luna <= 12 && zi >= 1 && zi <= 31 && (ora || 0) < 24 && (min || 0) < 60 && (sec || 0) < 60);
      } else if (typeof a === 'number') s2000 = (a >>> 0) - SEC_1970_2000;
      else {
        // DateTime(__DATE__, __TIME__) sau DateTime("2026-09-29T14:05:09")
        const t = txt(a), t2 = luna === undefined ? null : txt(luna);
        let m;
        if (t2 !== null && (m = /^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})$/.exec(t.trim()))) {
          const [h, mi, se] = t2.split(':').map(x => parseInt(x, 10) || 0);
          s2000 = C().laSecunde2000(+m[3] - 2000, LUNI.indexOf(m[1]) + 1, +m[2], h, mi, se);
        } else if ((m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/.exec(t))) {
          s2000 = C().laSecunde2000(+m[1] - 2000, +m[2], +m[3], +m[4], +m[5], +m[6]);
        } else { s2000 = 0; this._invalid = true; }
      }
      this._s = s2000;
      this._c = C().dinSecunde2000(Math.max(0, s2000));
    }
    year() { return this._c.an; }
    month() { return this._c.luna; }
    day() { return this._c.zi; }
    hour() { return this._c.ora; }
    twelveHour() { const h = this._c.ora % 12; return h === 0 ? 12 : h; }
    isPM() { return this._c.ora >= 12 ? 1 : 0; }
    minute() { return this._c.min; }
    second() { return this._c.sec; }
    dayOfTheWeek() { return this._c.dow; }
    secondstime() { return this._s >>> 0; }
    unixtime() { return (this._s + SEC_1970_2000) >>> 0; }
    isValid() { return !this._invalid && this._c.an >= 2000 && this._c.an <= 2099; }
    timestamp(opt) {
      const c = this._c;
      const d = c.an + '-' + d2(c.luna) + '-' + d2(c.zi), o = d2(c.ora) + ':' + d2(c.min) + ':' + d2(c.sec);
      return opt === 1 ? o : opt === 2 ? d : d + 'T' + o;
    }
    // înlocuiește în tampon YYYY, YY, MM, MMM, DD, DDD, hh, mm, ss, AP, ap (ca RTClib)
    toString(buf) {
      const c = this._c;
      let f = txt(buf);
      const r = [];
      for (let i = 0; i < f.length;) {
        const s = f.slice(i);
        if (s.startsWith('YYYY')) { r.push(String(c.an)); i += 4; }
        else if (s.startsWith('YY')) { r.push(d2(c.an % 100)); i += 2; }
        else if (s.startsWith('MMM')) { r.push(LUNI[c.luna - 1]); i += 3; }
        else if (s.startsWith('MM')) { r.push(d2(c.luna)); i += 2; }
        else if (s.startsWith('DDD')) { r.push(ZILE[c.dow].slice(0, 3)); i += 3; }
        else if (s.startsWith('DD')) { r.push(d2(c.zi)); i += 2; }
        else if (s.startsWith('hh')) { r.push(d2(/AP|ap/.test(f) ? this.twelveHour() : c.ora)); i += 2; }
        else if (s.startsWith('mm')) { r.push(d2(c.min)); i += 2; }
        else if (s.startsWith('ss')) { r.push(d2(c.sec)); i += 2; }
        else if (s.startsWith('AP')) { r.push(c.ora >= 12 ? 'PM' : 'AM'); i += 2; }
        else if (s.startsWith('ap')) { r.push(c.ora >= 12 ? 'pm' : 'am'); i += 2; }
        else { r.push(f[i]); i++; }
      }
      const rez = r.join('');
      if (ArrayBuffer.isView(buf)) { for (let i = 0; i < buf.length; i++) buf[i] = i < rez.length ? rez.charCodeAt(i) : 0; return buf; }
      return rez;
    }
    __copie() { return new DateTime(this); }
    egal(o) { return o instanceof DateTime && o._s === this._s; }
    valueOf() { return this._s; }
    static __op(op, a, b) {
      if (op === '-' && a instanceof DateTime && b instanceof DateTime) return new TimeSpan(a._s - b._s);
      const x = a instanceof DateTime ? a : b, y = a instanceof DateTime ? b : a;
      const ds = y instanceof TimeSpan ? y._s : +y;
      const n = new DateTime(0); n._s = x._s + (op === '-' ? -ds : ds); n._c = C().dinSecunde2000(Math.max(0, n._s));
      return n;
    }
    static __tipOp(op, ca, cb) { return op === '-' && ca === 'DateTime' && cb === 'DateTime' ? 'TimeSpan' : 'DateTime'; }
  }
  DateTime.tipuri = { year: 'uint16_t', month: 'uint8_t', day: 'uint8_t', hour: 'uint8_t', twelveHour: 'uint8_t', isPM: 'uint8_t', minute: 'uint8_t', second: 'uint8_t', dayOfTheWeek: 'uint8_t', secondstime: 'uint32_t', unixtime: 'uint32_t', isValid: 'bool', timestamp: 'String', toString: 'cstr' };
  DateTime.constanteStatice = { TIMESTAMP_FULL: 0, TIMESTAMP_TIME: 1, TIMESTAMP_DATE: 2 };
  api.clasa('DateTime', DateTime);

  // ---------- acces I2C comun ----------
  class RTCI2C {
    constructor() { this.wire = null; this.dev = null; }
    _cauta(wire, nume) {
      const sim = S();
      this.wire = wire || sim.obiecte.Wire;
      this.dev = M.i2c.gasesteI2C(this.wire, 0x68, ['rtc'], nume);
      return !!this.dev;
    }
    _citeste(reg, n) {
      const w = this.wire;
      if (!this.dev) return new Array(n).fill(0);
      w.beginTransmission(0x68); w.write(reg);
      if (w.endTransmission() !== 0) return new Array(n).fill(0xFF);
      w.requestFrom(0x68, n);
      const r = [];
      for (let i = 0; i < n; i++) { const b = w.read(); r.push(b < 0 ? 0xFF : b); }
      return r;
    }
    _scrie(reg, ...v) {
      const w = this.wire;
      if (!this.dev) return false;
      w.beginTransmission(0x68); w.write(reg); for (const x of v) w.write(x & 255);
      return w.endTransmission() === 0;
    }
    _faraBegin() { if (!this.dev) { S().problema('rtc-begin', 'avertisment', 'Folosești RTC-ul fără rtc.begin() reușit în setup(); valorile citite nu au sens.', { linie: linie() }); } }
    adjust(dt) {
      if (!this.dev) this._faraBegin();
      const b = M.calendar.bcd;
      const dow = dt.dayOfTheWeek();
      this._scrie(0, b(dt.second()), b(dt.minute()), b(dt.hour()), this._dowScris(dow), b(dt.day()), b(dt.month()), b(dt.year() - 2000));
      this._dupaAjustare();
    }
    _dowScris(d) { return d === 0 ? 7 : d; }
    _dupaAjustare() { }
    now() {
      if (!this.dev) this._faraBegin();
      const r = this._citeste(0, 7), f = M.calendar.dinBcd;
      const ora = (r[2] & 0x40) ? (f(r[2] & 0x1F) % 12) + ((r[2] & 0x20) ? 12 : 0) : f(r[2] & 0x3F);
      return new DateTime(f(r[6]) + 2000, f(r[5] & 0x1F), f(r[4] & 0x3F), ora, f(r[1] & 0x7F), f(r[0] & 0x7F));
    }
  }

  // ---------- RTC_DS3231 ----------
  class RTC_DS3231 extends RTCI2C {
    begin(wire) { return this._cauta(wire, 'RTC_DS3231.begin()'); }
    lostPower() { return !!(this._citeste(0x0F, 1)[0] & 0x80); }
    _dupaAjustare() { const st = this._citeste(0x0F, 1)[0]; this._scrie(0x0F, st & ~0x80); }
    getTemperature() { const r = this._citeste(0x11, 2); let v = (r[0] << 8) | r[1]; if (v & 0x8000) v -= 0x10000; return (v >> 6) * 0.25; }
    readSqwPinMode() { const c = this._citeste(0x0E, 1)[0] & 0x1C; return (c & 0x04) ? 0x1C : c; }
    writeSqwPinMode(mod) { let c = this._citeste(0x0E, 1)[0]; c &= ~0x1C; c |= mod & 0x1C; this._scrie(0x0E, c); }
    enable32K() { const s = this._citeste(0x0F, 1)[0]; this._scrie(0x0F, s | 0x08); }
    disable32K() { const s = this._citeste(0x0F, 1)[0]; this._scrie(0x0F, s & ~0x08); }
    isEnabled32K() { return !!(this._citeste(0x0F, 1)[0] & 0x08); }
    setAlarm1(dt, mod) {
      const c = this._citeste(0x0E, 1)[0];
      if (!(c & 0x04)) return false; // INTCN trebuie să fie 1 (nu undă pătrată)
      const b = M.calendar.bcd;
      const A1M1 = (mod & 0x01) << 7, A1M2 = (mod & 0x02) << 6, A1M3 = (mod & 0x04) << 5, A1M4 = (mod & 0x08) << 4, DY = (mod & 0x10) << 2;
      const zi = DY ? this._dowScris(dt.dayOfTheWeek()) : b(dt.day());
      this._scrie(0x07, b(dt.second()) | A1M1, b(dt.minute()) | A1M2, b(dt.hour()) | A1M3, zi | A1M4 | DY);
      this._scrie(0x0E, c | 0x01);
      return true;
    }
    setAlarm2(dt, mod) {
      const c = this._citeste(0x0E, 1)[0];
      if (!(c & 0x04)) return false;
      const b = M.calendar.bcd;
      const A2M2 = (mod & 0x01) << 7, A2M3 = (mod & 0x02) << 6, A2M4 = (mod & 0x04) << 5, DY = (mod & 0x08) << 3;
      const zi = DY ? this._dowScris(dt.dayOfTheWeek()) : b(dt.day());
      this._scrie(0x0B, b(dt.minute()) | A2M2, b(dt.hour()) | A2M3, zi | A2M4 | DY);
      this._scrie(0x0E, c | 0x02);
      return true;
    }
    getAlarm1() { const r = this._citeste(0x07, 4), f = M.calendar.dinBcd; return new DateTime(2000, 1, Math.max(1, f(r[3] & 0x3F)), f(r[2] & 0x3F), f(r[1] & 0x7F), f(r[0] & 0x7F)); }
    getAlarm2() { const r = this._citeste(0x0B, 3), f = M.calendar.dinBcd; return new DateTime(2000, 1, Math.max(1, f(r[2] & 0x3F)), f(r[1] & 0x3F), f(r[0] & 0x7F), 0); }
    disableAlarm(n) { const c = this._citeste(0x0E, 1)[0]; this._scrie(0x0E, c & ~(1 << (n - 1))); }
    clearAlarm(n) { const s = this._citeste(0x0F, 1)[0]; this._scrie(0x0F, s & ~(1 << (n - 1))); }
    alarmFired(n) { return !!((this._citeste(0x0F, 1)[0] >> (n - 1)) & 1); }
  }
  RTC_DS3231.tipuri = { begin: 'bool', lostPower: 'bool', now: 'obj:DateTime', getTemperature: 'float', readSqwPinMode: 'int', isEnabled32K: 'bool', setAlarm1: 'bool', setAlarm2: 'bool', getAlarm1: 'obj:DateTime', getAlarm2: 'obj:DateTime', alarmFired: 'bool' };
  api.clasa('RTC_DS3231', RTC_DS3231);

  // ---------- RTC_DS1307 ----------
  class RTC_DS1307 extends RTCI2C {
    begin(wire) { return this._cauta(wire, 'RTC_DS1307.begin()'); }
    isrunning() { return !(this._citeste(0, 1)[0] >> 7); }
    _dowScris(d) { return d + 1; }
    readSqwPinMode() { return this._citeste(7, 1)[0] & 0x93; }
    writeSqwPinMode(mod) { this._scrie(7, mod); }
    readnvram(a, b, c) {
      if (b === undefined) return this._citeste(8 + (a % 56), 1)[0];
      const [buf, n, adr] = [a, b, c];
      const r = this._citeste(8 + adr, n); for (let i = 0; i < n; i++) buf[i] = r[i];
    }
    writenvram(a, b, c) {
      if (c === undefined) { this._scrie(8 + (a % 56), b); return; }
      const [adr, buf, n] = [a, b, c];
      this._scrie(8 + adr, ...Array.from(buf).slice(0, n));
    }
  }
  RTC_DS1307.tipuri = { begin: 'bool', isrunning: 'uint8_t', now: 'obj:DateTime', readSqwPinMode: 'int', readnvram: 'uint8_t' };
  api.clasa('RTC_DS1307', RTC_DS1307);

  // ---------- RTC_Millis (ceas software, fără modul) ----------
  class RTC_Millis {
    constructor() { this.baza = 0; this.t0 = 0; }
    begin(dt) { this.adjust(dt || new DateTime(0)); return true; }
    adjust(dt) { this.baza = dt._s; this.t0 = S().timp; }
    now() { const d = new DateTime(0); d._s = this.baza + Math.floor((S().timp - this.t0) / 1e6); d._c = M.calendar.dinSecunde2000(d._s); return d; }
  }
  RTC_Millis.tipuri = { begin: 'bool', now: 'obj:DateTime' };
  api.clasa('RTC_Millis', RTC_Millis);
  api.clasa('RTC_Micros', RTC_Millis);

  Object.assign(api.constante, {
    DS3231_OFF: 0x1C, DS3231_SquareWave1Hz: 0x00, DS3231_SquareWave1kHz: 0x08, DS3231_SquareWave4kHz: 0x10, DS3231_SquareWave8kHz: 0x18,
    DS3231_A1_PerSecond: 0x0F, DS3231_A1_Second: 0x0E, DS3231_A1_Minute: 0x0C, DS3231_A1_Hour: 0x08, DS3231_A1_Date: 0x00, DS3231_A1_Day: 0x10,
    DS3231_A2_PerMinute: 0x7, DS3231_A2_Minute: 0x6, DS3231_A2_Hour: 0x4, DS3231_A2_Date: 0x0, DS3231_A2_Day: 0x8,
    DS1307_OFF: 0x00, DS1307_ON: 0x80, DS1307_SquareWave1HZ: 0x10, DS1307_SquareWave4kHz: 0x11, DS1307_SquareWave8kHz: 0x12, DS1307_SquareWave32kHz: 0x13,
    SECONDS_PER_DAY: 86400, SECONDS_FROM_1970_TO_2000: 946684800
  });
  Object.assign(api.tipuriNumerice, { Ds3231SqwPinMode: 'int', Ds3231Alarm1Mode: 'int', Ds3231Alarm2Mode: 'int', Ds1307SqwPinMode: 'int' });
  api.include('RTClib.h');
})(window.M = window.M || {});
