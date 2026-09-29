/* Meșter — funcțiile ajutătoare folosite de codul JavaScript generat (obiectul R).
   Implementează semantica C/C++: împărțire întreagă, șiruri char, String Arduino,
   tablouri, referințe, copierea structurilor și căderile (crash) de tip ESP32. */
(function (M) {
  'use strict';

  class EroareRulare extends Error {
    constructor(tip, mesaj, explicatie) {
      super(mesaj);
      this.tipPanica = tip;
      this.explicatie = explicatie || mesaj;
      this.esteCrash = true;
    }
  }
  M.EroareRulare = EroareRulare;

  const PAUZA = { pauza: true };
  const BUCLA = { bucla: true };
  const dec = new TextDecoder('utf-8');

  // șir de octeți (fiecare caracter = un octet) din Uint8Array, până la NUL
  function dinOcteti(a) {
    let s = '';
    for (let i = 0; i < a.length; i++) { if (a[i] === 0) break; s += String.fromCharCode(a[i]); }
    return s;
  }
  function txt(x) {
    if (x === null || x === undefined) return '';
    if (typeof x === 'string') return x;
    if (x instanceof Uint8Array || x instanceof Int8Array) return dinOcteti(x);
    if (typeof x === 'number') return String.fromCharCode(x & 255);
    if (x && typeof x.toString === 'function' && x.toString !== Object.prototype.toString) return String(x);
    return String(x);
  }
  function formatReal(v, zecimale) {
    if (zecimale === undefined || zecimale === null) zecimale = 2;
    if (isNaN(v)) return 'nan';
    if (!isFinite(v)) return v > 0 ? 'inf' : '-inf';
    if (Math.abs(v) > 4294967040) return 'ovf';
    zecimale = Math.max(0, Math.min(zecimale | 0, 20));
    // rotunjire ca Arduino Print::printFloat (adaugă 0,5 la ultima zecimală, apoi trunchiază)
    const r = Math.abs(v) + 0.5 * Math.pow(10, -zecimale);
    const intreg = Math.floor(r);
    let frac = r - intreg;
    let s = String(intreg);
    if (zecimale > 0) {
      s += '.';
      for (let i = 0; i < zecimale; i++) { frac *= 10; const d = Math.min(9, Math.floor(frac)); s += d; frac -= d; }
    }
    return (v < 0 ? '-' : '') + s;
  }
  function formatIntreg(v, baza, litereMari) {
    baza = baza || 10;
    if (baza === 10) return String(Math.trunc(v));
    let n = Math.trunc(v);
    if (n < 0) n = n >>> 0;
    let s = n.toString(baza);
    return litereMari ? s.toUpperCase() : s;
  }
  // Formatare ca în Arduino Print / String, după eticheta de tip
  function formateaza(v, fmt, tag, pentruString) {
    if (v === null || v === undefined) return tag === 'f' ? formatReal(0, fmt) : '';
    switch (tag) {
      case 's': return txt(v);
      case 'c': return typeof v === 'number' ? String.fromCharCode(v & 255) : txt(v);
      case 'b': return v ? '1' : '0';
      case 'f': return formatReal(+v, fmt === undefined ? 2 : fmt);
      case 'i': case 'u':
        if (typeof v === 'boolean') return v ? '1' : '0';
        if (fmt !== undefined && fmt !== 10 && fmt !== 0) return formatIntreg(tag === 'u' && v < 0 ? v >>> 0 : v, fmt, !pentruString);
        return String(Math.trunc(tag === 'u' && v < 0 ? v >>> 0 : v));
    }
    // tip necunoscut: deducem din valoare
    if (typeof v === 'string') return v;
    if (typeof v === 'boolean') return v ? '1' : '0';
    if (v instanceof Uint8Array) return dinOcteti(v);
    if (typeof v === 'number') {
      if (Number.isInteger(v)) return fmt !== undefined && fmt !== 10 ? formatIntreg(v, fmt, !pentruString) : String(v);
      return formatReal(v, fmt === undefined ? 2 : fmt);
    }
    if (typeof v === 'object' && typeof v.toString === 'function') return String(v);
    return String(v);
  }

  // Ajutoare statice; fiecare rulare primește un obiect nou cu prototipul acesta
  const ajutoare = {
    P: PAUZA, BUCLA,
    div(a, b) {
      if (b === 0) throw new EroareRulare('IntegerDivideByZero', 'Împărțire la zero', 'Ai împărțit un număr întreg la 0. Pe ESP32 asta oprește programul și placa se resetează.');
      return a / b;
    },
    mod(a, b) {
      if (b === 0) throw new EroareRulare('IntegerDivideByZero', 'Rest la împărțirea cu zero', 'Operația % cu 0 oprește programul pe ESP32.');
      return a % b;
    },
    impartire(a, b) {
      if (Number.isInteger(a) && Number.isInteger(b)) { if (b === 0) return ajutoare.div(a, b); return Math.trunc(a / b); }
      return a / b;
    },
    S(v, fmt, tag) { return formateaza(v, fmt, tag || 'x', true); },
    txt,
    formateaza, formatReal, formatIntreg, dinOcteti,
    ci(s, i) {
      if (s === null || s === undefined) throw new EroareRulare('LoadProhibited', 'Citire dintr-un pointer NULL', 'Ai citit un caracter dintr-un șir care nu există (NULL).');
      if (typeof s === 'string') { const c = s.charCodeAt(i); return isNaN(c) ? 0 : c; }
      const v = s[i]; return v === undefined ? 0 : v;
    },
    padd(p, n) {
      if (p === null || p === undefined) return p;
      if (typeof p === 'string') return n >= 0 ? p.slice(n) : p;
      if (ArrayBuffer.isView(p)) {
        const nou = p.length - n;
        return new p.constructor(p.buffer, p.byteOffset + n * p.BYTES_PER_ELEMENT, Math.max(0, nou));
      }
      if (Array.isArray(p)) return p.slice(n);
      return p;
    },
    deref(p) {
      if (p === null || p === undefined) throw new EroareRulare('LoadProhibited', 'Pointer NULL', 'Ai folosit un pointer care nu indică nimic (NULL).');
      if (typeof p === 'string') return p.charCodeAt(0) || 0;
      if (p && 'v' in p && !ArrayBuffer.isView(p)) return p.v;
      return p[0];
    },
    ref(get, set) { return { get v() { return get(); }, set v(x) { set(x); } }; },
    ref0(v) { return { v }; },
    lung(x) { return x ? x.length : 0; },
    tablou(dims, fab, init) {
      const construieste = (nivel, ini) => {
        let n = dims[nivel];
        if (n === null || n === undefined) n = ini ? (typeof ini === 'string' ? ini.length + 1 : ini.length) : 0;
        if (n < 0 || n > 4000000) throw new EroareRulare('StoreProhibited', 'Tablou prea mare', 'Tabloul cerut are ' + n + ' elemente — nu încape în memoria plăcii.');
        if (nivel === dims.length - 1) {
          if (typeof fab === 'string') {
            const Ctor = globalThis[fab];
            const a = new Ctor(n);
            if (ini) {
              if (typeof ini === 'string') { for (let i = 0; i < ini.length && i < n; i++) a[i] = ini.charCodeAt(i); }
              else for (let i = 0; i < ini.length && i < n; i++) a[i] = typeof ini[i] === 'boolean' ? +ini[i] : ini[i];
            }
            return a;
          }
          const a = new Array(n);
          for (let i = 0; i < n; i++) a[i] = ini && i < ini.length ? ini[i] : fab();
          return a;
        }
        const a = new Array(n);
        for (let i = 0; i < n; i++) a[i] = construieste(nivel + 1, ini ? ini[i] : null);
        return a;
      };
      return construieste(0, init);
    },
    tablouDin(tinta, v) {
      if (typeof v === 'string') { for (let i = 0; i < tinta.length; i++) tinta[i] = i < v.length ? v.charCodeAt(i) : 0; return tinta; }
      if (v && v.length !== undefined) { for (let i = 0; i < v.length && i < tinta.length; i++) tinta[i] = v[i]; }
      return tinta;
    },
    copie(o) { return o && typeof o.__copie === 'function' ? o.__copie() : o; },
    copieTablou(a) {
      if (!a) return a;
      if (ArrayBuffer.isView(a)) return a.slice();
      return a.map(x => Array.isArray(x) || ArrayBuffer.isView(x) ? ajutoare.copieTablou(x) : ajutoare.copie(x));
    },
    nou(Cls, idx, args) {
      const o = new Cls();
      if (idx >= 0) ajutoare.sinc(o['__c' + idx].apply(o, args));
      return o;
    },
    // rulează un generator până la capăt fără să cedeze controlul (constructori, întreruperi)
    sinc(gen) {
      let r = gen.next();
      let pasi = 0;
      while (!r.done) {
        if (++pasi > 2000000) throw new EroareRulare('Watchdog', 'Buclă prea lungă', 'O funcție care trebuia să ruleze scurt (constructor sau întrerupere) nu se mai termină.');
        const v = r.value;
        if (v && v.dorm !== undefined && M.simCurenta) M.simCurenta.consuma(v.dorm);
        r = gen.next();
      }
      return r.value;
    },
    *apeleaza(f, args) {
      if (!f) throw new EroareRulare('InstrFetchProhibited', 'Apel prin pointer NULL', 'Ai apelat o funcție printr-un pointer gol (NULL).');
      const r = f.apply(null, args);
      if (r && typeof r.next === 'function' && typeof r[Symbol.iterator] === 'function') return yield* r;
      return r;
    },
    *metoda(o, n, args) {
      if (o === null || o === undefined) throw new EroareRulare('LoadProhibited', 'Obiect NULL', 'Ai apelat .' + n + '() pe un obiect care nu există.');
      const f = o[n];
      if (typeof f !== 'function') throw new EroareRulare('IllegalInstruction', 'Metodă inexistentă: ' + n, 'Obiectul nu are metoda ' + n + '().');
      const r = f.apply(o, args);
      if (r && typeof r.next === 'function' && typeof r[Symbol.iterator] === 'function') return yield* r;
      return r;
    },
    adev(o) {
      if (o === null || o === undefined) return false;
      if (typeof o.__bool === 'function') return !!o.__bool();
      return !!o;
    },
    egal(a, b) { if (a && typeof a.egal === 'function') return a.egal(b); return a === b; },
    octeti(o) { return o; },
    constrain(x, a, b) { return x < a ? a : (x > b ? b : x); },
    toInt(s) {
      const m = /^\s*([+-]?\d+)/.exec(s || '');
      return m ? (parseInt(m[1], 10) | 0) : 0;
    },
    toFloat(s) {
      const m = /^\s*([+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?)/.exec(s || '');
      return m ? parseFloat(m[1]) : 0;
    },
    substring(s, a, b) {
      if (b === undefined) return a > s.length ? '' : s.substring(a);
      if (a > b) { const t = a; a = b; b = t; }
      if (a > s.length) return '';
      return s.substring(a, b);
    },
    compara(a, b) { return a < b ? -1 : a > b ? 1 : 0; },
    sterge(s, i, n) { if (i < 0 || i >= s.length) return s; if (n === undefined) return s.slice(0, i); return s.slice(0, i) + s.slice(i + n); },
    setChar(s, i, c) { if (i < 0 || i >= s.length) return s; return s.slice(0, i) + String.fromCharCode(c & 255) + s.slice(i + 1); },
    inTablou(s, buf, len) {
      if (!buf) return;
      const n = Math.min(len === undefined ? buf.length : len, buf.length);
      if (n <= 0) return;
      let i = 0;
      for (; i < s.length && i < n - 1; i++) buf[i] = s.charCodeAt(i);
      buf[i] = 0;
    },
    vector(a) { return a ? a.slice() : []; },
    harta() { return new Map(); },
    hartaCheie(m, k) { if (!m.has(k)) m.set(k, 0); return m.get(k); },
    hartaAre(m, k) { return m instanceof Map ? m.has(k) : (Array.isArray(m) ? m.includes(k) : false); },
    la(v, i) { if (i < 0 || i >= v.length) throw new EroareRulare('Abort', 'std::out_of_range', 'Indexul ' + i + ' e în afara vectorului (are ' + v.length + ' elemente).'); return v[i]; },
    redim(v, n, fab) { if (n < v.length) v.length = n; else while (v.length < n) v.push(fab()); },
    stergeLa(v, i) { if (i >= 0 && i < v.length) v.splice(i, 1); },
    insereaza(v, i, x) { v.splice(i, 0, x); },
    shl64(a, b) { return Number(BigInt.asIntN(64, BigInt(Math.trunc(a)) << BigInt(b))); },
    shr64(a, b) { return Number(BigInt(Math.trunc(a)) >> BigInt(b)); },
    bit64(op, a, b) {
      const x = BigInt(Math.trunc(a)), y = BigInt(Math.trunc(b));
      return Number(op === '&' ? x & y : op === '|' ? x | y : x ^ y);
    },
    not64(a) { return Number(~BigInt(Math.trunc(a))); },
    rtc(nume, init) {
      const s = M.simCurenta;
      if (s && s.memorieRTC && Object.prototype.hasOwnProperty.call(s.memorieRTC, nume)) return s.memorieRTC[nume];
      return init();
    }
  };

  M.ajutoareR = ajutoare;
  M.jetoane = { PAUZA, BUCLA };
  M.utf8 = {
    // text de octeți -> text afișabil (decodare UTF-8, cu înlocuire pentru octeți invalizi)
    decodeaza(s) {
      const a = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 255;
      return dec.decode(a);
    },
    codifica: M.utf8Octeti
  };
})(window.M = window.M || {});
