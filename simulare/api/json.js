/* Meșter — JSON: biblioteca ArduinoJson (versiunile 6 și 7) și Arduino_JSON (JSONVar).
   Ca pe placă: StaticJsonDocument / DynamicJsonDocument au o capacitate fixă și dau „NoMemory” când
   documentul nu încape, deserializeJson() întoarce codurile de eroare reale, as<int>() pe un text dă 0,
   iar JSONVar tipărește textele cu ghilimele. */
(function (M) {
  'use strict';
  const api = M.api;
  const S = () => M.simCurenta;
  const txt = M.ajutoareR.txt;
  const linie = () => { const s = S(); return s && s.R ? s.R.L : 0; };
  const SLOT = 16; // octeți pe valoare în ArduinoJson 6 (ESP32)

  // ---------- valori: null, boolean, number, string, Array, Map (ordinea cheilor se păstrează) ----------
  function clona(v) {
    if (v instanceof Map) { const m = new Map(); for (const [k, x] of v) m.set(k, clona(x)); return m; }
    if (Array.isArray(v)) return v.map(clona);
    return v;
  }
  function dinArgument(v) {
    if (v instanceof JsonVariant) return clona(v._v === undefined ? null : v._v);
    if (v === undefined || v === null) return null;
    if (typeof v === 'string') return v;
    if (v instanceof Uint8Array || v instanceof Int8Array) return txt(v);
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v;
    if (typeof v === 'bigint') return Number(v);
    if (v && typeof v.toString === 'function' && v.toString !== Object.prototype.toString) return String(v);
    return null;
  }
  // numerele ca în ArduinoJson: float scurt (21.7, nu 21.700000762939453), double cu cel mult 9 zecimale
  function numar(x) {
    if (!isFinite(x)) return 'null';
    if (Number.isInteger(x) && Math.abs(x) < 1e15) return String(x);
    const a = Math.abs(x);
    let s;
    if (Math.fround(x) === x) {
      for (let p = 1; p <= 9; p++) { const c = x.toPrecision(p); if (Math.fround(parseFloat(c)) === x) { s = String(parseFloat(c)); break; } }
    }
    if (!s) s = String(parseFloat(x.toFixed(9)));
    if ((a >= 1e7 || (a > 0 && a < 1e-5)) && !/e/.test(s)) { const e = x.toExponential(); s = e.replace(/\.?0+e/, 'e').replace('e+', 'e'); }
    return s.replace('e+', 'e');
  }
  const scapa = (s) => '"' + s.replace(/[\\"\u0000-\u001f]/g, c => ({ '"': '\\"', '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f' })[c] || '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + '"';
  function serializeaza(v, frumos, ind) {
    ind = ind || '';
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return numar(v);
    if (typeof v === 'string') return scapa(v);
    const nl = frumos ? '\r\n' : '', sp = frumos ? ind + '  ' : '';
    if (Array.isArray(v)) {
      if (!v.length) return '[]';
      return '[' + nl + v.map(x => sp + serializeaza(x, frumos, sp)).join(',' + nl) + nl + (frumos ? ind : '') + ']';
    }
    if (v instanceof Map) {
      if (!v.size) return '{}';
      return '{' + nl + [...v].map(([k, x]) => sp + scapa(k) + ':' + (frumos ? ' ' : '') + serializeaza(x, frumos, sp)).join(',' + nl) + nl + (frumos ? ind : '') + '}';
    }
    return 'null';
  }
  function memorie(v, siruri) {
    siruri = siruri || new Set();
    let n = 0;
    const sir = (s) => { if (!siruri.has(s)) { siruri.add(s); n += s.length + 1; } };
    if (v instanceof Map) for (const [k, x] of v) { n += SLOT; sir(k); n += memorie(x, siruri) - (x instanceof Map || Array.isArray(x) ? 0 : 0); }
    else if (Array.isArray(v)) for (const x of v) { n += SLOT; n += memorie(x, siruri); }
    else if (typeof v === 'string') sir(v);
    return n;
  }

  // ---------- citirea textului JSON (ca ArduinoJson: acceptă și ghilimele simple) ----------
  class EroareJson { constructor(cod) { this.cod = cod; } }
  function parseaza(s, poz, adancimeMax) {
    let i = poz || 0;
    const n = s.length;
    const alb = () => { while (i < n && ' \t\r\n'.includes(s[i])) i++; };
    const gata = () => { if (i >= n) throw new EroareJson(2); };
    function valoare(adancime) {
      alb(); gata();
      const c = s[i];
      if (c === '{' || c === '[') {
        if (adancime >= adancimeMax) throw new EroareJson(5);
        i++;
        if (c === '{') {
          const m = new Map();
          alb(); gata();
          if (s[i] === '}') { i++; return m; }
          for (;;) {
            alb(); gata();
            let k;
            if (s[i] === '"' || s[i] === '\'') k = sir();
            else { const st = i; while (i < n && /[A-Za-z0-9_$]/.test(s[i])) i++; if (i === st) throw new EroareJson(i >= n ? 2 : 3); k = s.slice(st, i); }
            alb(); gata();
            if (s[i] !== ':') throw new EroareJson(3);
            i++;
            m.set(k, valoare(adancime + 1));
            alb(); gata();
            if (s[i] === ',') { i++; continue; }
            if (s[i] === '}') { i++; return m; }
            throw new EroareJson(3);
          }
        }
        const a = [];
        alb(); gata();
        if (s[i] === ']') { i++; return a; }
        for (;;) {
          a.push(valoare(adancime + 1));
          alb(); gata();
          if (s[i] === ',') { i++; continue; }
          if (s[i] === ']') { i++; return a; }
          throw new EroareJson(3);
        }
      }
      if (c === '"' || c === '\'') return sir();
      const m = /^(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|true|false|null|NaN|-?Infinity)/.exec(s.slice(i, i + 64));
      if (!m) {
        // începutul unui cuvânt-cheie tăiat la capăt: intrare incompletă
        const rest = s.slice(i);
        if (['true', 'false', 'null'].some(w => w.startsWith(rest)) && rest.length) throw new EroareJson(2);
        throw new EroareJson(3);
      }
      i += m[0].length;
      if (i >= n && /^-?\d/.test(m[0]) && poz === undefined) { /* număr la sfârșitul textului: e complet */ }
      if (m[0] === 'true') return true;
      if (m[0] === 'false') return false;
      if (m[0] === 'null') return null;
      if (/NaN|Infinity/.test(m[0])) throw new EroareJson(3);
      return parseFloat(m[0]);
    }
    function sir() {
      const q = s[i++];
      let r = '';
      for (;;) {
        if (i >= n) throw new EroareJson(2);
        const c = s[i++];
        if (c === q) return r;
        if (c === '\\') {
          if (i >= n) throw new EroareJson(2);
          const e = s[i++];
          if (e === 'u') { const h = s.slice(i, i + 4); if (h.length < 4) throw new EroareJson(2); const cod = parseInt(h, 16); i += 4; r += cod < 0x80 ? String.fromCharCode(cod) : unescape(encodeURIComponent(String.fromCharCode(cod))); }
          else r += ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '/': '/', '\\': '\\', '"': '"', '\'': '\'' })[e] || e;
        } else r += c;
      }
    }
    alb();
    if (i >= n) throw new EroareJson(1);
    const v = valoare(0);
    return { v, poz: i };
  }

  // ---------- DeserializationError ----------
  const COD_EROARE = ['Ok', 'EmptyInput', 'IncompleteInput', 'InvalidInput', 'NoMemory', 'TooDeep'];
  class DeserializationError {
    constructor(c) { this._c = c | 0; }
    __bool() { return this._c !== 0; }
    code() { return this._c; }
    c_str() { return COD_EROARE[this._c] || 'Unknown'; }
    f_str() { return this.c_str(); }
    toString() { return this.c_str(); }
    egal(x) { return (x instanceof DeserializationError ? x._c : +x) === this._c; }
  }
  DeserializationError.tipuri = { code: 'int', c_str: 'cstr', f_str: 'cstr' };
  DeserializationError.constanteStatice = { Ok: 0, EmptyInput: 1, IncompleteInput: 2, InvalidInput: 3, NoMemory: 4, TooDeep: 5 };
  api.clasa('DeserializationError', DeserializationError);

  // ---------- JsonVariant (și JsonObject, JsonArray: aceeași „privire” spre o valoare din document) ----------
  const tipCpp = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  const ESTE_INT = /^(int|long|short|unsigned|unsigned int|unsigned long|unsigned short|long long|unsigned long long|u?int(8|16|32|64)_t|size_t|char|signed char|unsigned char|byte|uint)$/;
  class JsonVariant {
    constructor(h, p, k) { this._h = h || { v: null }; this._p = p || null; this._k = k; }
    static liber(v) { return new this({ v: v === undefined ? null : v }); }
    static nul() { return new this({ v: null, blocat: true }); }
    get _v() {
      if (!this._p) return this._h.v;
      const pv = this._p._v;
      if (pv instanceof Map) return typeof this._k === 'string' ? pv.get(this._k) : undefined;
      if (Array.isArray(pv)) return typeof this._k === 'number' ? pv[this._k] : undefined;
      return undefined;
    }
    _doc() { let x = this; while (x._p) x = x._p; return x._h.doc || null; }
    _scrie(v) {
      if (this._h.blocat) return false;
      if (!this._p) { this._h.v = v; return this._verificaMemorie(); }
      const pv = this._p._asigura(typeof this._k === 'number' ? 'arr' : 'obj');
      if (!pv) return false;
      if (pv instanceof Map) pv.set(this._k, v);
      else { if (this._k < 0) return false; while (pv.length < this._k) pv.push(null); pv[this._k] = v; }
      return this._verificaMemorie();
    }
    _verificaMemorie() {
      const d = this._doc();
      if (d && d._cap && memorie(d._h.v) > d._cap) {
        d._depasit = true;
        S().problema('json-plin', 'avertisment', 'Documentul JSON (capacitate ' + d._cap + ' octeți) s-a umplut: valorile noi se pierd în tăcere. Mărește capacitatea (StaticJsonDocument<' + Math.ceil(memorie(d._h.v) * 1.3 / 16) * 16 + '>) sau folosește JsonDocument din ArduinoJson 7.', { linie: linie() });
        return false;
      }
      return true;
    }
    _asigura(tip) {
      let v = this._v;
      if (v === undefined || v === null) {
        v = tip === 'arr' ? [] : new Map();
        if (!this._scrie(v)) return null;
        return this._v;
      }
      if (tip === 'arr' ? Array.isArray(v) : v instanceof Map) return v;
      return null;
    }
    _copil(k) {
      if (k instanceof JsonVariant) k = k._v;
      if (typeof k === 'number') return new (this._CopilCls())(this._h, this, Math.trunc(k));
      return new (this._CopilCls())(this._h, this, txt(k));
    }
    _CopilCls() { return JsonVariant; }
    __index(k) { return this._copil(k); }
    __setIndex(k, v) { this._copil(k)._scrie(dinArgument(v)); return v; }
    __laSablon() { return this; }
    // conversii
    valueOf() { const v = this._v; if (typeof v === 'number') return v; if (typeof v === 'boolean') return v ? 1 : 0; return 0; }
    toString() { const v = this._v; if (typeof v === 'string') return v; return serializeaza(v === undefined ? null : v); }
    __str() { return this.toString(); }
    __cstr() { const v = this._v; return typeof v === 'string' ? v : null; }
    __bool() { const v = this._v; if (v === null || v === undefined) return false; if (typeof v === 'boolean') return v; if (typeof v === 'number') return v !== 0; return true; }
    egal(x) {
      const v = this._v === undefined ? null : this._v;
      if (x instanceof JsonVariant) return serializeaza(v) === serializeaza(x._v === undefined ? null : x._v);
      if (x === null || x === undefined) return v === null;
      if (typeof x === 'string' || x instanceof Uint8Array) return typeof v === 'string' && v === txt(x);
      if (typeof x === 'boolean') return v === x;
      if (typeof x === 'number') return (typeof v === 'number' || typeof v === 'boolean') && +v === x;
      return false;
    }
    __copie() { return this; }
    // ArduinoJson: valoare | implicit
    static __op(op, a, b) {
      if (op !== '|') {
        const x = a instanceof JsonVariant ? a.valueOf() : a, y = b instanceof JsonVariant ? b.valueOf() : b;
        return JsonVariant.liber(({ '+': x + y, '-': x - y, '*': x * y, '/': x / y })[op]);
      }
      const v = a instanceof JsonVariant ? a._v : a;
      const imp = b instanceof JsonVariant ? b._v : dinArgument(b);
      const potrivit = v !== null && v !== undefined && (typeof imp === 'string' ? typeof v === 'string' : typeof imp === 'number' ? typeof v === 'number' : typeof imp === 'boolean' ? typeof v === 'boolean' : true);
      return JsonVariant.liber(potrivit ? v : imp);
    }
    static __tipOp() { return 'JsonVariant'; }
    as(sablon) {
      const t = tipCpp(sablon && sablon[0]);
      const v = this._v;
      if (t === 'float' || t === 'double') {
        if (typeof v === 'string') this._textInNumar(t);
        return typeof v === 'number' ? (t === 'float' ? Math.fround(v) : v) : typeof v === 'boolean' ? +v : 0;
      }
      if (ESTE_INT.test(t)) {
        if (typeof v === 'string') this._textInNumar(t);
        return typeof v === 'number' ? Math.trunc(v) : typeof v === 'boolean' ? +v : 0;
      }
      if (t === 'bool') return this.__bool();
      if (t === 'const char*' || t === 'char*') return typeof v === 'string' ? v : null;
      if (t === 'String' || t === 'std::string') return v === undefined || v === null ? 'null' : this.toString();
      if (t === 'JsonObject' || t === 'JsonObjectConst') return v instanceof Map ? this : JsonVariant.nul();
      if (t === 'JsonArray' || t === 'JsonArrayConst') return Array.isArray(v) ? this : JsonVariant.nul();
      return this;
    }
    _textInNumar(t) { S().problema('json-text-numar', 'info', 'as<' + t + '>() pe o valoare care e text („' + this._v + '”) dă 0 în ArduinoJson. Dacă serverul trimite numărul între ghilimele, folosește doc["…"].as<String>().toInt() sau .toFloat().', { linie: linie() }); }
    is(sablon) {
      const t = tipCpp(sablon && sablon[0]);
      const v = this._v;
      if (t === 'float' || t === 'double') return typeof v === 'number';
      if (ESTE_INT.test(t)) return typeof v === 'number' && Number.isInteger(v);
      if (t === 'bool') return typeof v === 'boolean';
      if (t === 'const char*' || t === 'char*' || t === 'String' || t === 'JsonString') return typeof v === 'string';
      if (t === 'JsonObject' || t === 'JsonObjectConst') return v instanceof Map;
      if (t === 'JsonArray' || t === 'JsonArrayConst') return Array.isArray(v);
      if (t === 'JsonVariant') return v !== undefined && v !== null;
      return false;
    }
    to(sablon) {
      const t = tipCpp(sablon && sablon[0]);
      if (t === 'JsonArray') { this._scrie([]); return this; }
      if (t === 'JsonObject') { this._scrie(new Map()); return this; }
      this._scrie(null);
      return this;
    }
    set(v) { return this._scrie(dinArgument(v)); }
    add(a) {
      const arr = this._asigura('arr');
      if (!arr) return Array.isArray(a) ? JsonVariant.nul() : false;
      if (Array.isArray(a) && typeof a[0] === 'string') {
        // v7: arr.add<JsonObject>()
        const t = tipCpp(a[0]);
        arr.push(t === 'JsonArray' ? [] : t === 'JsonObject' ? new Map() : null);
        this._verificaMemorie();
        return new (this._CopilCls())(this._h, this, arr.length - 1);
      }
      arr.push(dinArgument(a));
      return this._verificaMemorie();
    }
    createNestedObject(k) { if (k === undefined) return this.add(['JsonObject']); const c = this._copil(k); c._scrie(new Map()); return c; }
    createNestedArray(k) { if (k === undefined) return this.add(['JsonArray']); const c = this._copil(k); c._scrie([]); return c; }
    getMember(k) { return this._copil(k); }
    getElement(i) { return this._copil(+i); }
    size() { const v = this._v; return v instanceof Map ? v.size : Array.isArray(v) ? v.length : 0; }
    isNull() { const v = this._v; return v === null || v === undefined; }
    containsKey(k) { const v = this._v; return v instanceof Map && v.has(txt(k)); }
    remove(k) { const v = this._v; if (v instanceof Map) v.delete(txt(k)); else if (Array.isArray(v) && typeof k === 'number') v.splice(k, 1); }
    clear() { const v = this._v; if (v instanceof Map) v.clear(); else if (Array.isArray(v)) v.length = 0; }
    nesting() { const f = (v) => v instanceof Map ? 1 + Math.max(0, ...[...v.values()].map(f)) : Array.isArray(v) ? 1 + Math.max(0, ...v.map(f)) : 0; return f(this._v); }
    memoryUsage() { return memorie(this._v); }
    __elemente() {
      const v = this._v;
      if (Array.isArray(v)) return v.map((x, i) => new (this._CopilCls())(this._h, this, i));
      if (v instanceof Map) return [...v.keys()].map(k => new JsonPair(k, new (this._CopilCls())(this._h, this, k)));
      return [];
    }
  }
  const TIPURI_VARIANT = { is: 'bool', set: 'bool', add: 'bool', size: 'size_t', isNull: 'bool', containsKey: 'bool', createNestedObject: 'obj:JsonObject', createNestedArray: 'obj:JsonArray', getMember: 'obj:JsonVariant', getElement: 'obj:JsonVariant', nesting: 'size_t', memoryUsage: 'size_t', to: 'obj:JsonVariant' };
  JsonVariant.tipuri = TIPURI_VARIANT;
  // tipul întors de as<T>(), to<T>(), add<T>()
  const tipDinSablon = (t, cls) => {
    t = tipCpp(t);
    if (t === 'const char*' || t === 'char*') return 'cstr';
    if (t === 'String' || t === 'std::string') return 'String';
    if (/^Json(Object|Array|Variant)(Const)?$/.test(t)) return 'obj:' + t.replace('Const', '');
    if (t === 'bool' || t === 'float' || t === 'double' || ESTE_INT.test(t)) return t === 'byte' ? 'uint8_t' : t;
    return 'obj:' + cls;
  };
  JsonVariant.tipSablon = { as: (a) => tipDinSablon(a[0], 'JsonVariant'), to: (a) => tipDinSablon(a[0], 'JsonVariant'), add: (a) => tipDinSablon(a[0], 'JsonVariant'), is: () => 'bool' };
  JsonVariant.tipIndex = 'JsonVariant';
  JsonVariant.tipElement = 'JsonVariant';
  api.clasa('JsonVariant', JsonVariant);
  for (const n of ['JsonVariantConst', 'JsonObject', 'JsonObjectConst', 'JsonArray', 'JsonArrayConst']) api.clasa(n, JsonVariant);

  class JsonString {
    constructor(s) { this._s = s; }
    c_str() { return this._s; }
    size() { return this._s.length; }
    toString() { return this._s; }
    __str() { return this._s; }
    __cstr() { return this._s; }
    egal(x) { return txt(x) === this._s; }
    __bool() { return true; }
  }
  JsonString.tipuri = { c_str: 'cstr', size: 'size_t' };
  api.clasa('JsonString', JsonString);
  class JsonPair {
    constructor(k, v) { this._k = k; this._val = v; }
    key() { return new JsonString(this._k); }
    value() { return this._val; }
  }
  JsonPair.tipuri = { key: 'obj:JsonString', value: 'obj:JsonVariant' };
  api.clasa('JsonPair', JsonPair);
  api.clasa('JsonPairConst', JsonPair);

  // ---------- documentele ----------
  class JsonDocument extends JsonVariant {
    constructor(cap) {
      super({ v: null });
      this._h.doc = this;
      this._cap = cap === undefined || typeof cap !== 'number' ? 0 : cap;
      this._depasit = false;
    }
    __laSablon(a) { if (typeof a[0] === 'number') this._cap = a[0]; this._verificaCapacitate(); return this; }
    _verificaCapacitate() {
      const s = S();
      if (this._cap > 7000 && this instanceof StaticJsonDocument && s) s.problema('json-stiva', 'avertisment', 'StaticJsonDocument<' + this._cap + '> stă pe stivă, iar loop() are doar 8 KB de stivă pe ESP32: la peste ~7000 de octeți placa se poate reseta. Folosește DynamicJsonDocument sau JsonDocument (v7).', { linie: linie() });
    }
    capacity() { return this._cap || memorie(this._h.v); }
    memoryUsage() { return memorie(this._h.v); }
    overflowed() { return this._depasit; }
    garbageCollect() { return true; }
    shrinkToFit() { }
    clear() { this._h.v = null; this._depasit = false; }
    __copie() { const d = new this.constructor(this._cap); d._h.v = clona(this._h.v); return d; }
    __din() { return this; }
  }
  JsonDocument.tipuri = Object.assign({}, TIPURI_VARIANT, { capacity: 'size_t', overflowed: 'bool', garbageCollect: 'bool' });
  JsonDocument.tipSablon = JsonVariant.tipSablon;
  JsonDocument.tipIndex = 'JsonVariant';
  JsonDocument.tipElement = 'JsonVariant';
  api.clasa('JsonDocument', JsonDocument);
  class StaticJsonDocument extends JsonDocument { }
  StaticJsonDocument.sablon = true;
  api.clasa('StaticJsonDocument', StaticJsonDocument);
  class DynamicJsonDocument extends JsonDocument {
    constructor(cap) {
      super(cap);
      const s = S();
      if (s && cap > 60000) s.problema('json-mare', 'avertisment', 'DynamicJsonDocument(' + cap + ') cere un bloc de ' + cap + ' octeți din RAM; ESP32 are rar mai mult de ~110 KB liberi într-o bucată, iar alocarea poate eșua.', { linie: linie() });
    }
  }
  api.clasa('DynamicJsonDocument', DynamicJsonDocument);
  for (const c of [JsonDocument, StaticJsonDocument, DynamicJsonDocument]) { c.tipuri = JsonDocument.tipuri; c.tipSablon = JsonVariant.tipSablon; c.tipIndex = 'JsonVariant'; c.tipElement = 'JsonVariant'; }

  // ---------- funcțiile ----------
  // textul de intrare: String, char[], sau un flux (Serial, fișier, răspunsul unui HTTPClient)
  function* citesteIntrare(x, n) {
    if (typeof x === 'string') return { text: n === undefined ? x : x.slice(0, n) };
    if (x instanceof Uint8Array || x instanceof Int8Array) { let t = txt(x); if (n !== undefined) t = t.slice(0, n); return { text: t }; }
    if (x instanceof JsonVariant) return { text: x.toString() };
    if (x && typeof x._date === 'string' && typeof x._poz === 'number') return { text: x._date.slice(x._poz), flux: x, fisier: true };
    if (x && typeof x._in === 'string') {
      // fluxul poate să nu aibă încă tot textul: ArduinoJson așteaptă până la timeout
      const sim = S();
      const t0 = sim.timp, lim = (x._timeout || 1000) * 1000;
      for (;;) {
        try { parseaza(x._in, undefined, 10); break; } catch (e) { if (!(e instanceof EroareJson) || e.cod !== 2 && e.cod !== 1) break; }
        if (sim.timp - t0 >= lim) break;
        yield { dorm: 2000 };
      }
      return { text: x._in, flux: x };
    }
    return { text: txt(x) };
  }
  function* deserializeJson(doc, intrare, a, b) {
    const n = typeof a === 'number' ? a : undefined;
    const lim = (a && a.__adancime) || (b && b.__adancime) || 10;
    const inp = yield* citesteIntrare(intrare, n);
    const sim = S();
    sim.consuma(inp.text.length * 0.6 + 30);
    doc._depasit = false;
    let r;
    try { r = parseaza(inp.text, undefined, lim); }
    catch (e) {
      if (!(e instanceof EroareJson)) throw e;
      doc._h.v = null;
      if (inp.flux) { if (inp.fisier) inp.flux._poz = inp.flux._date.length; else inp.flux._in = ''; }
      return new DeserializationError(e.cod);
    }
    if (inp.flux) { if (inp.fisier) inp.flux._poz += r.poz; else inp.flux._in = inp.flux._in.slice(r.poz); }
    if (doc._cap && memorie(r.v) > doc._cap) {
      doc._h.v = null;
      sim.problema('json-nomemory', 'avertisment', 'deserializeJson() a dat NoMemory: textul primit are nevoie de ~' + memorie(r.v) + ' octeți, dar documentul are ' + doc._cap + '. Mărește capacitatea (ex. ' + (doc instanceof StaticJsonDocument ? 'StaticJsonDocument<' : 'DynamicJsonDocument doc(') + Math.ceil(memorie(r.v) * 1.3 / 64) * 64 + (doc instanceof StaticJsonDocument ? '>' : ')') + ') sau folosește JsonDocument (ArduinoJson 7).', { linie: linie() });
      return new DeserializationError(4);
    }
    doc._h.v = r.v;
    return new DeserializationError(0);
  }
  api.functie('deserializeJson', deserializeJson, 'obj:DeserializationError');
  api.functie('deserializeMsgPack', function* deserializeMsgPack() { S().problema('msgpack', 'info', 'MessagePack nu e simulat; folosește deserializeJson().', { linie: linie() }); return new DeserializationError(3); }, 'obj:DeserializationError');
  // destinația: String (prin referință), char[] cu mărime, sau orice Print (Serial, fișier, client web)
  function* scrieIn(dest, text, n) {
    if (dest && typeof dest === 'object' && 'v' in dest && !(dest instanceof Uint8Array) && typeof dest.print !== 'function') { dest.v = (typeof dest.v === 'string' ? dest.v : '') + text; return text.length; }
    if (dest instanceof Uint8Array) {
      const max = n === undefined ? dest.length : Math.min(n, dest.length);
      const k = Math.min(text.length, max - 1);
      for (let i = 0; i < k; i++) dest[i] = text.charCodeAt(i) & 255;
      if (max > 0) dest[k] = 0;
      if (text.length > max - 1) S().problema('json-buffer', 'avertisment', 'serializeJson(): tabloul de ' + max + ' caractere e prea mic pentru ' + (text.length + 1) + '; textul a fost tăiat.', { linie: linie() });
      return k;
    }
    if (dest && typeof dest.print === 'function') { const r = dest.print(text); if (r && typeof r.next === 'function') yield* r; return text.length; }
    return text.length;
  }
  api.functie('serializeJson', function* serializeJson(doc, dest, n) { const t = serializeaza(valoareDin(doc)); S().consuma(t.length * 0.3 + 10); return yield* scrieIn(dest, t, n); }, 'size_t').refString = [1];
  api.functie('serializeJsonPretty', function* serializeJsonPretty(doc, dest, n) { const t = serializeaza(valoareDin(doc), true); S().consuma(t.length * 0.3 + 10); return yield* scrieIn(dest, t, n); }, 'size_t').refString = [1];
  const valoareDin = (d) => d instanceof JsonVariant ? (d._v === undefined ? null : d._v) : dinArgument(d);
  api.functie('measureJson', function measureJson(doc) { return serializeaza(valoareDin(doc)).length; }, 'size_t');
  api.functie('measureJsonPretty', function measureJsonPretty(doc) { return serializeaza(valoareDin(doc), true).length; }, 'size_t');
  api.functie('JSON_OBJECT_SIZE', function JSON_OBJECT_SIZE(n) { return n * SLOT; }, 'size_t');
  api.functie('JSON_ARRAY_SIZE', function JSON_ARRAY_SIZE(n) { return n * SLOT; }, 'size_t');
  api.functie('JSON_STRING_SIZE', function JSON_STRING_SIZE(n) { return n + 1; }, 'size_t');
  api.functie('serialized', function serialized(s) { const t = txt(s); try { return JsonVariant.liber(parseaza(t).v); } catch (e) { return t; } }, 'obj:JsonVariant');
  api.functie('copyArray', function copyArray(a, b, n) {
    if (b instanceof JsonVariant) { const arr = b._asigura('arr'); if (!arr) return 0; const k = n === undefined ? a.length : Math.min(n, a.length); for (let i = 0; i < k; i++) arr.push(a[i]); return k; }
    if (a instanceof JsonVariant) { const v = Array.isArray(a._v) ? a._v : []; const k = Math.min(v.length, b.length); for (let i = 0; i < k; i++) b[i] = typeof v[i] === 'number' ? v[i] : 0; return k; }
    return 0;
  }, 'size_t');
  class NestingLimit { constructor(n) { this.__adancime = n | 0; } }
  api.clasa('DeserializationOption_NestingLimit', NestingLimit);
  api.include('ArduinoJson.h', 'ArduinoJson.hpp');

  // ---------- Arduino_JSON (JSONVar) ----------
  class JSONVar extends JsonVariant {
    constructor(v, p, k) { if (p !== undefined) super(v, p, k); else super({ v: v === undefined ? undefined : dinArgument(v) }); }
    static liber(v) { const x = new JSONVar(); x._h.v = v; return x; }
    _CopilCls() { return JSONVar; }
    // tipărirea arată JSON (textele cu ghilimele), ca biblioteca
    toString() { const v = this._v; return v === undefined ? 'undefined' : serializeaza(v); }
    __str() { const v = this._v; return typeof v === 'string' ? v : v === undefined ? '' : serializeaza(v); }
    __cstr() { const v = this._v; return typeof v === 'string' ? v : null; }
    __copie() { return this; }
    keys() { const v = this._v; const r = new JSONVar(); r._h.v = v instanceof Map ? [...v.keys()] : []; return r; }
    length() { const v = this._v; return v instanceof Map ? v.size : Array.isArray(v) ? v.length : typeof v === 'string' ? v.length : -1; }
    hasOwnProperty(k) { const v = this._v; return v instanceof Map && v.has(txt(k)); }
    __setIndex(k, v) { this._copil(k)._scrie(v instanceof JSONVar ? clona(v._v) : dinArgument(v)); return v; }
    static __op(op, a, b) { const r = JsonVariant.__op(op, a, b); return JSONVar.liber(r._v); }
    static __tipOp() { return 'JSONVar'; }
    static __din(v) { if (v instanceof JSONVar) return v; const x = new JSONVar(); x._h.v = v instanceof JsonVariant ? clona(v._v) : dinArgument(v); return x; }
  }
  JSONVar.tipuri = { keys: 'obj:JSONVar', length: 'int', hasOwnProperty: 'bool' };
  JSONVar.tipIndex = 'JSONVar';
  JSONVar.tipElement = 'JSONVar';
  api.clasa('JSONVar', JSONVar);
  class JSONClass {
    parse(s) {
      const x = new JSONVar();
      try { const r = parseaza(txt(s)); x._h.v = r.v; } catch (e) { x._h.v = undefined; }
      S().consuma(txt(s).length * 0.6 + 20);
      return x;
    }
    stringify(v) { if (v instanceof JsonVariant) return v._v === undefined ? '' : serializeaza(v._v); return serializeaza(dinArgument(v)); }
    typeof(v) {
      const x = v instanceof JsonVariant ? v._v : dinArgument(v);
      if (x === undefined) return 'undefined';
      if (x === null) return 'null';
      if (typeof x === 'boolean') return 'boolean';
      if (typeof x === 'number') return 'number';
      if (typeof x === 'string') return 'string';
      if (Array.isArray(x)) return 'array';
      return 'object';
    }
    typeof_(v) { return this.typeof(v); }
  }
  JSONClass.tipuri = { parse: 'obj:JSONVar', stringify: 'String', typeof: 'String', typeof_: 'String' };
  api.clasa('JSONClass', JSONClass);
  api.obiecte.JSON = 'JSONClass';
  api.creatoriObiecte.push(() => ({ JSON: new JSONClass() }));
  api.include('Arduino_JSON.h');

  M.json = { parseaza, serializeaza, memorie };
})(window.M = window.M || {});
