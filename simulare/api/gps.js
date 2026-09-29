/* Meșter — TinyGPS++ (Mikal Hart): analizează propozițiile NMEA primite caracter cu caracter prin encode(),
   exact ca biblioteca: sumă de control, câmpuri valide doar după un $GPRMC/$GPGGA cu fix, isUpdated() care se
   resetează la citire, age(), distanceBetween() și courseTo(). */
(function (M) {
  'use strict';
  const api = M.api;
  const S = () => M.simCurenta;
  const acumMs = () => Math.floor(S().timp / 1000);

  const RAD = Math.PI / 180;
  function distanceBetween(lat1, lon1, lat2, lon2) {
    const delta = (lon1 - lon2) * RAD;
    const sdlong = Math.sin(delta), cdlong = Math.cos(delta);
    const a1 = lat1 * RAD, a2 = lat2 * RAD;
    const slat1 = Math.sin(a1), clat1 = Math.cos(a1), slat2 = Math.sin(a2), clat2 = Math.cos(a2);
    let d = (clat1 * slat2) - (slat1 * clat2 * cdlong);
    d = d * d + (clat2 * sdlong) * (clat2 * sdlong);
    d = Math.sqrt(d);
    const numitor = (slat1 * slat2) + (clat1 * clat2 * cdlong);
    return Math.atan2(d, numitor) * 6372795;
  }
  function courseTo(lat1, lon1, lat2, lon2) {
    const dlon = (lon2 - lon1) * RAD, a1 = lat1 * RAD, a2 = lat2 * RAD;
    const a = Math.sin(dlon) * Math.cos(a2);
    const b = Math.sin(a1) * Math.cos(a2) * Math.cos(dlon);
    let c = Math.atan2(a, Math.cos(a1) * Math.sin(a2) - b);
    if (c < 0) c += 2 * Math.PI;
    return c / RAD;
  }
  const DIRECTII = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const cardinal = (c) => DIRECTII[Math.floor(((c + 11.25) % 360) / 22.5)];

  // câmp cu valoare nouă / validă / vârstă, ca TinyGPS++
  class Camp {
    constructor() { this.valid = false; this.updated = false; this.ultimaFix = 0; this.v = 0; this.nou = 0; }
    isValid() { return this.valid; }
    isUpdated() { return this.updated; }
    age() { return this.valid ? (acumMs() - this.ultimaFix) >>> 0 : 0xFFFFFFFF; }
    _confirma() { this.v = this.nou; this.valid = this.updated = true; this.ultimaFix = acumMs(); }
    value() { this.updated = false; return this.v; }
  }
  class TinyGPSLocation extends Camp {
    constructor() { super(); this.v = { lat: 0, lng: 0 }; this.nou = { lat: 0, lng: 0 }; this.fixQuality = 0; this.fixMode = 'N'; }
    lat() { this.updated = false; return this.v.lat; }
    lng() { this.updated = false; return this.v.lng; }
    rawLat() { this.updated = false; const a = Math.abs(this.v.lat); return { deg: Math.floor(a), billionths: Math.round((a - Math.floor(a)) * 1e9), negative: this.v.lat < 0 }; }
    rawLng() { this.updated = false; const a = Math.abs(this.v.lng); return { deg: Math.floor(a), billionths: Math.round((a - Math.floor(a)) * 1e9), negative: this.v.lng < 0 }; }
    FixQuality() { return this.fixQuality; }
    FixMode() { return this.fixMode.charCodeAt(0); }
  }
  TinyGPSLocation.tipuri = { isValid: 'bool', isUpdated: 'bool', age: 'uint32_t', lat: 'double', lng: 'double', FixQuality: 'int', FixMode: 'int' };
  class TinyGPSDate extends Camp {
    year() { this.updated = false; return 2000 + (this.v % 100); }
    month() { this.updated = false; return Math.floor(this.v / 100) % 100; }
    day() { this.updated = false; return Math.floor(this.v / 10000); }
  }
  TinyGPSDate.tipuri = { isValid: 'bool', isUpdated: 'bool', age: 'uint32_t', value: 'uint32_t', year: 'uint16_t', month: 'uint8_t', day: 'uint8_t' };
  class TinyGPSTime extends Camp {
    hour() { this.updated = false; return Math.floor(this.v / 1000000); }
    minute() { this.updated = false; return Math.floor(this.v / 10000) % 100; }
    second() { this.updated = false; return Math.floor(this.v / 100) % 100; }
    centisecond() { this.updated = false; return this.v % 100; }
  }
  TinyGPSTime.tipuri = { isValid: 'bool', isUpdated: 'bool', age: 'uint32_t', value: 'uint32_t', hour: 'uint8_t', minute: 'uint8_t', second: 'uint8_t', centisecond: 'uint8_t' };
  class TinyGPSDecimal extends Camp { }
  TinyGPSDecimal.tipuri = { isValid: 'bool', isUpdated: 'bool', age: 'uint32_t', value: 'int32_t' };
  class TinyGPSSpeed extends TinyGPSDecimal {
    knots() { this.updated = false; return this.v / 100; }
    mph() { this.updated = false; return this.v / 100 * 1.15077945; }
    mps() { this.updated = false; return this.v / 100 * 0.51444444; }
    kmph() { this.updated = false; return this.v / 100 * 1.852; }
  }
  TinyGPSSpeed.tipuri = Object.assign({}, TinyGPSDecimal.tipuri, { knots: 'double', mph: 'double', mps: 'double', kmph: 'double' });
  class TinyGPSCourse extends TinyGPSDecimal { deg() { this.updated = false; return this.v / 100; } }
  TinyGPSCourse.tipuri = Object.assign({}, TinyGPSDecimal.tipuri, { deg: 'double' });
  class TinyGPSAltitude extends TinyGPSDecimal {
    meters() { this.updated = false; return this.v / 100; }
    miles() { this.updated = false; return this.v / 100 * 0.00062137112; }
    kilometers() { this.updated = false; return this.v / 100000; }
    feet() { this.updated = false; return this.v / 100 * 3.2808399; }
  }
  TinyGPSAltitude.tipuri = Object.assign({}, TinyGPSDecimal.tipuri, { meters: 'double', miles: 'double', kilometers: 'double', feet: 'double' });
  class TinyGPSInteger extends Camp { }
  TinyGPSInteger.tipuri = { isValid: 'bool', isUpdated: 'bool', age: 'uint32_t', value: 'uint32_t' };
  class TinyGPSHDOP extends TinyGPSDecimal { hdop() { this.updated = false; return this.v / 100; } }
  TinyGPSHDOP.tipuri = Object.assign({}, TinyGPSDecimal.tipuri, { hdop: 'double' });
  for (const [n, c] of Object.entries({ TinyGPSLocation, TinyGPSDate, TinyGPSTime, TinyGPSDecimal, TinyGPSSpeed, TinyGPSCourse, TinyGPSAltitude, TinyGPSInteger, TinyGPSHDOP })) api.clasa(n, c);

  // câmp personalizat: TinyGPSCustom(gps, "GPGSA", 15)
  class TinyGPSCustom {
    constructor(gps, propozitie, nr) { this.valid = false; this.updated = false; this.buf = ''; this.nou = ''; this.ultima = 0; if (gps && gps._custom) gps._custom.push({ c: this, p: String(M.ajutoareR.txt(propozitie)), nr }); }
    isValid() { return this.valid; }
    isUpdated() { return this.updated; }
    age() { return this.valid ? (acumMs() - this.ultima) >>> 0 : 0xFFFFFFFF; }
    value() { this.updated = false; return this.buf; }
  }
  TinyGPSCustom.tipuri = { isValid: 'bool', isUpdated: 'bool', age: 'uint32_t', value: 'cstr' };
  api.clasa('TinyGPSCustom', TinyGPSCustom);

  const intZecimal = (t) => { if (!t) return 0; const neg = t[0] === '-'; const [a, b = ''] = t.replace('-', '').split('.'); const v = parseInt(a || '0', 10) * 100 + parseInt((b + '00').slice(0, 2), 10); return neg ? -v : v; };
  const grade = (t) => { if (!t || t.indexOf('.') < 0) { const v = parseFloat(t || '0'); return Math.floor(v / 100) + (v % 100) / 60; } const v = parseFloat(t); const g = Math.floor(v / 100); return g + (v - g * 100) / 60; };

  class TinyGPSPlus {
    constructor() {
      this.location = new TinyGPSLocation(); this.date = new TinyGPSDate(); this.time = new TinyGPSTime();
      this.speed = new TinyGPSSpeed(); this.course = new TinyGPSCourse(); this.altitude = new TinyGPSAltitude();
      this.satellites = new TinyGPSInteger(); this.hdop = new TinyGPSHDOP();
      this._custom = [];
      this.parte = ''; this.campuri = []; this.inPropozitie = false; this.inSuma = false; this.suma = 0; this.sumaText = '';
      this.encodedCharCount = 0; this.sentencesWithFixCount = 0; this.failedChecksumCount = 0; this.passedChecksumCount = 0;
    }
    // un caracter din fluxul NMEA; întoarce true când s-a terminat o propoziție validă
    encode(c) {
      c &= 255;
      this.encodedCharCount++;
      const ch = String.fromCharCode(c);
      if (ch === '$') { this.inPropozitie = true; this.campuri = []; this.parte = ''; this.suma = 0; this.inSuma = false; this.sumaText = ''; return false; }
      if (!this.inPropozitie) return false;
      if (ch === ',' || ch === '*' || ch === '\r' || ch === '\n') {
        let valid = false;
        if (this.inSuma) {
          if (ch === '\r' || ch === '\n') {
            this.inPropozitie = false;
            const s = parseInt(this.sumaText, 16);
            if (s === this.suma) { this.passedChecksumCount++; valid = this.commit(); }
            else { this.failedChecksumCount++; }
          }
          return valid;
        }
        this.campuri.push(this.parte); this.parte = '';
        if (ch === ',') this.suma ^= c;
        if (ch === '*') this.inSuma = true;
        if (ch === '\r' || ch === '\n') this.inPropozitie = false;
        return false;
      }
      if (this.inSuma) { this.sumaText += ch; return false; }
      this.suma ^= c;
      this.parte += ch;
      if (this.parte.length > 20) this.inPropozitie = false;
      return false;
    }
    commit() {
      const f = this.campuri;
      const tip = f[0] || '';
      const idTip = tip.slice(2);
      for (const x of this._custom) if (x.p === tip && f[x.nr] !== undefined) { x.c.buf = f[x.nr]; x.c.valid = x.c.updated = true; x.c.ultima = acumMs(); }
      if (idTip === 'RMC') {
        const activ = f[2] === 'A';
        if (f[1]) { this.time.nou = Math.round(parseFloat(f[1]) * 100); this.time._confirma(); }
        if (f[9]) { this.date.nou = parseInt(f[9], 10); this.date._confirma(); }
        if (activ) {
          this.sentencesWithFixCount++;
          this.location.nou = { lat: grade(f[3]) * (f[4] === 'S' ? -1 : 1), lng: grade(f[5]) * (f[6] === 'W' ? -1 : 1) };
          this.location._confirma();
          this.location.fixMode = f[12] || 'A';
          this.speed.nou = intZecimal(f[7]); this.speed._confirma();
          if (f[8]) { this.course.nou = intZecimal(f[8]); this.course._confirma(); }
        }
        return true;
      }
      if (idTip === 'GGA') {
        const fix = parseInt(f[6] || '0', 10) > 0;
        if (f[1]) { this.time.nou = Math.round(parseFloat(f[1]) * 100); this.time._confirma(); }
        this.location.fixQuality = parseInt(f[6] || '0', 10);
        if (f[7]) { this.satellites.nou = parseInt(f[7], 10); this.satellites._confirma(); }
        if (f[8]) { this.hdop.nou = intZecimal(f[8]); this.hdop._confirma(); }
        if (fix) {
          this.sentencesWithFixCount++;
          this.location.nou = { lat: grade(f[2]) * (f[3] === 'S' ? -1 : 1), lng: grade(f[4]) * (f[5] === 'W' ? -1 : 1) };
          this.location._confirma();
          if (f[9]) { this.altitude.nou = intZecimal(f[9]); this.altitude._confirma(); }
        }
        return true;
      }
      return true;
    }
    charsProcessed() { return this.encodedCharCount; }
    sentencesWithFix() { return this.sentencesWithFixCount; }
    failedChecksum() { return this.failedChecksumCount; }
    passedChecksum() { return this.passedChecksumCount; }
    static libraryVersion() { return '1.0.3'; }
    static distanceBetween(a, b, c, d) { return distanceBetween(a, b, c, d); }
    static courseTo(a, b, c, d) { return courseTo(a, b, c, d); }
    static cardinal(c) { return cardinal(c); }
    distanceBetween(a, b, c, d) { return distanceBetween(a, b, c, d); }
    courseTo(a, b, c, d) { return courseTo(a, b, c, d); }
    cardinal(c) { return cardinal(c); }
  }
  TinyGPSPlus.tipuri = { encode: 'bool', charsProcessed: 'uint32_t', sentencesWithFix: 'uint32_t', failedChecksum: 'uint32_t', passedChecksum: 'uint32_t', libraryVersion: 'cstr', distanceBetween: 'double', courseTo: 'double', cardinal: 'cstr' };
  TinyGPSPlus.tipuriStatice = { libraryVersion: 'cstr', distanceBetween: 'double', courseTo: 'double', cardinal: 'cstr' };
  TinyGPSPlus.proprietati = { location: 'obj:TinyGPSLocation', date: 'obj:TinyGPSDate', time: 'obj:TinyGPSTime', speed: 'obj:TinyGPSSpeed', course: 'obj:TinyGPSCourse', altitude: 'obj:TinyGPSAltitude', satellites: 'obj:TinyGPSInteger', hdop: 'obj:TinyGPSHDOP' };
  api.clasa('TinyGPSPlus', TinyGPSPlus);
  api.constante._GPS_MPH_PER_KNOT = 1.15077945; api.constante._GPS_KMPH_PER_KNOT = 1.852; api.constante._GPS_MPS_PER_KNOT = 0.51444444;
  api.include('TinyGPS++.h', 'TinyGPSPlus.h');
})(window.M = window.M || {});
