/* Meșter — generatorul de JavaScript pentru schițele Arduino.
   Primește arborele sintactic și produce o funcție-fabrică ce rulează codul
   cu semantica C++ (împărțire întreagă, depășiri, String, char, tablouri),
   folosind generatoare JS ca delay() să nu blocheze interfața. */
(function (M) {
  'use strict';
  const E = M.lexer.EroareCompilare;

  // ---------- tipuri ----------
  const TI = (b, u) => ({ c: 'int', b, u: !!u });
  const T = {
    void: { c: 'void' }, bool: { c: 'bool' }, char: { c: 'char' }, String: { c: 'String' }, cstr: { c: 'cstr' },
    float: { c: 'float', b: 32 }, double: { c: 'float', b: 64 }, unk: { c: 'unk' },
    i8: TI(8), u8: TI(8, 1), i16: TI(16), u16: TI(16, 1), i32: TI(32), u32: TI(32, 1), i64: TI(64), u64: TI(64, 1)
  };
  M.tipuriC = T;

  function tipBaza(nume, platforma) {
    const avr = platforma === 'avr';
    switch (nume) {
      case 'void': return T.void;
      case 'bool': case 'boolean': return T.bool;
      case 'char': return T.char;
      case 'int8_t': return T.i8;
      case 'uint8_t': case 'byte': case 'u8': case 'uint_least8_t': case 'uint_fast8_t': return T.u8;
      case 'short': case 'int16_t': return T.i16;
      case 'uint16_t': case 'word': case 'u16': return T.u16;
      case 'int': return avr ? T.i16 : T.i32;
      case 'int_fast16_t': return T.i32;
      case 'unsigned int': case 'uint': return avr ? T.u16 : T.u32;
      case 'long': case 'int32_t': case 'BaseType_t': case 'esp_err_t': case 'intptr_t': case 'ssize_t': return T.i32;
      case 'unsigned long': case 'uint32_t': case 'size_t': case 'u32': case 'TickType_t': case 'UBaseType_t': case 'uintptr_t': return T.u32;
      case 'int64_t': case 'long long': case 'time_t': return T.i64;
      case 'uint64_t': return T.u64;
      case 'float': return T.float;
      case 'double': return avr ? T.float : T.double;
      case 'String': return T.String;
      case 'auto': return { c: 'auto' };
      case '__functie': return { c: 'fn' };
      case 'wchar_t': case 'char16_t': case 'char32_t': return T.u16;
      default: return null;
    }
  }
  const esteInt = t => t && (t.c === 'int' || t.c === 'char' || t.c === 'bool' || t.c === 'enum');
  const esteIntStrict = t => t && (t.c === 'int' || t.c === 'char' || t.c === 'enum');
  const esteReal = t => t && t.c === 'float';
  const esteNumeric = t => t && (esteInt(t) || esteReal(t));
  const esteText = t => t && (t.c === 'String' || t.c === 'cstr');
  function tag(t) {
    if (!t) return 'x';
    switch (t.c) {
      case 'int': return t.u ? 'u' : 'i';
      case 'enum': return 'i';
      case 'float': return 'f';
      case 'char': return 'c';
      case 'bool': return 'b';
      case 'String': case 'cstr': return 's';
      case 'arr': return t.el && t.el.c === 'char' ? 's' : 'x';
      default: return 'x';
    }
  }
  function numeTip(t) {
    if (!t) return '?';
    switch (t.c) {
      case 'int': return (t.u ? 'uint' : 'int') + t.b + '_t';
      case 'float': return t.b === 64 ? 'double' : 'float';
      case 'char': return 'char';
      case 'bool': return 'bool';
      case 'String': return 'String';
      case 'cstr': return 'const char*';
      case 'arr': return numeTip(t.el) + '[]';
      case 'obj': return t.cls;
      case 'void': return 'void';
      default: return t.c;
    }
  }
  // Tipul rezultat al operațiilor aritmetice (conversiile uzuale din C)
  function tipAritmetic(a, b, platforma) {
    if (esteReal(a) || esteReal(b)) {
      const bits = Math.max(esteReal(a) ? a.b : 0, esteReal(b) ? b.b : 0);
      return bits === 64 ? T.double : T.float;
    }
    const intB = platforma === 'avr' ? 16 : 32;
    const norm = t => {
      if (!t || t.c === 'bool' || t.c === 'char' || t.c === 'enum') return { c: 'int', b: intB, u: false };
      if (t.c === 'int') { if (t.b < intB) return { c: 'int', b: intB, u: false }; return t; }
      return { c: 'int', b: intB, u: false };
    };
    const x = norm(a), y = norm(b);
    if (x.b === 64 || y.b === 64) return { c: 'int', b: 64, u: (x.b === 64 && x.u) || (y.b === 64 && y.u) };
    if (x.b === y.b) return { c: 'int', b: x.b, u: x.u || y.u };
    const mare = x.b > y.b ? x : y;
    return mare;
  }
  // Cod care aduce o valoare numerică la tipul întreg dat (trunchiere + depășire)
  function inf(t, cod) {
    if (!t) return cod;
    if (t.c === 'bool') return '!!(' + cod + ')';
    if (t.c === 'char') return '((' + cod + ') << 24 >> 24)';
    if (t.c === 'enum') return '((' + cod + ') | 0)';
    if (t.c !== 'int') return cod;
    switch (t.b) {
      case 8: return t.u ? '((' + cod + ') & 255)' : '((' + cod + ') << 24 >> 24)';
      case 16: return t.u ? '((' + cod + ') & 65535)' : '((' + cod + ') << 16 >> 16)';
      case 32: return t.u ? '((' + cod + ') >>> 0)' : '((' + cod + ') | 0)';
      default: return 'Math.trunc(' + cod + ')';
    }
  }

  const RESERVATE_JS = new Set(['arguments', 'eval', 'function', 'var', 'let', 'yield', 'await', 'in', 'of', 'typeof', 'instanceof', 'with', 'export', 'import', 'debugger', 'undefined', 'NaN', 'Infinity']);

  class Generator {
    constructor(ast, opt) {
      this.ast = ast;
      this.api = opt.api;
      this.placa = opt.placa || {};
      this.platforma = (opt.placa && opt.placa.platforma) || 'esp32';
      this.tipuriParser = opt.tipuri;
      this.avertismente = [];
      this.globale = new Map();   // nume -> simbol
      this.clase = new Map();     // nume -> info clasă (utilizator)
      this.tipdef = new Map();    // typedef -> tip
      this.enumuri = new Map();   // nume enum -> {clasa, valori}
      this.scopuri = [];
      this.clasaCurenta = null;
      this.functieCurenta = null;
      this.contor = 0;
      this.staticeLocale = [];
      this.linii = []; // cod JS generat
      this.folosite = { f: new Set(), o: new Set(), c: new Set(), k: new Set() };
      this.functiiUser = new Map(); // nume -> [supraincarcari]
      this.hotLinie = 0;
    }
    eroare(m, nod) { throw new E(m, nod && nod.l || this.hotLinie || 0, nod && nod.c || 0); }
    avertizeaza(m, nod) { this.avertismente.push({ mesaj: m, linie: nod && nod.l || 0 }); }
    tmp() { return '_t' + (this.contor++); }

    // ---------- rezolvarea tipurilor ----------
    tipDin(spec, ptr, dim, ref) {
      if (!spec) return T.unk;
      let t;
      const b = spec.baza;
      if (spec.enumNume) t = { c: 'enum', nume: spec.enumNume };
      else if (b === 'vector' || b === 'deque' || b === 'list' || b === 'array') {
        const el = spec.sablon && spec.sablon[0] && !spec.sablon[0].numar ? this.tipDin(spec.sablon[0], spec.sablon[0].ptr) : T.unk;
        t = { c: 'vector', el };
      } else if (b === 'map') {
        t = { c: 'map', k: spec.sablon ? this.tipDin(spec.sablon[0]) : T.unk, v: spec.sablon ? this.tipDin(spec.sablon[1]) : T.unk };
      } else if (b === 'pair') {
        t = { c: 'obj', cls: '__pair', user: false };
      } else if (b === 'function') {
        t = { c: 'fn' };
      } else {
        t = tipBaza(b, this.platforma);
        if (!t) {
          if (this.tipdef.has(b)) {
            const td = this.tipdef.get(b);
            t = td.t;
            if (td.dim && td.dim.length) t = { c: 'arr', el: t, dims: td.dim };
          }
          else if (this.enumuri.has(b)) t = { c: 'enum', nume: b };
          else if (this.clase.has(b)) t = { c: 'obj', cls: b, user: true };
          else if (this.api.clase[b]) {
            t = this.api.clase[b].esteHandle ? { c: 'obj', cls: b, user: false, ptrObj: true } : { c: 'obj', cls: b, user: false };
            if (spec.sablon && this.api.clase[b].sablon) t.sablonArgs = spec.sablon;
          }
          else if (this.api.tipuriNumerice && this.api.tipuriNumerice[b]) t = tipBaza(this.api.tipuriNumerice[b], this.platforma) || T.i32;
          else if (this.api.tipuriTablou && this.api.tipuriTablou[b]) { const [el, n] = this.api.tipuriTablou[b]; t = { c: 'arr', el: tipBaza(el, this.platforma), dims: [{ k: 'Num', v: n }] }; }
          else this.eroare('Tip necunoscut: „' + b + '” — poate lipsește un #include sau biblioteca nu e simulată încă', spec);
        }
      }
      const p = (ptr || 0) + (spec.ptr || 0);
      if (p > 0) {
        if (t.c === 'char' || (t.c === 'int' && t.b === 8 && spec.const && b === 'char')) t = T.cstr;
        else if (t.c === 'obj' || t.c === 'fn') { t = Object.assign({}, t, { ptrObj: true }); }
        else if (t.c === 'void') t = { c: 'ptr', el: T.u8 };
        else if (t.c === 'cstr') t = { c: 'arr', el: T.cstr, dims: [null] };
        else t = { c: 'ptr', el: t };
      }
      if (dim && dim.length) t = { c: 'arr', el: t, dims: dim };
      if (ref) t = Object.assign({}, t, { ref: true });
      return t;
    }
    // Construiește tipul de element pentru tablouri tipizate JS
    constructorTablou(t) {
      if (!t) return null;
      switch (t.c) {
        case 'bool': return 'Uint8Array';
        case 'char': return 'Uint8Array';
        case 'enum': return 'Int32Array';
        case 'int':
          if (t.b === 8) return t.u ? 'Uint8Array' : 'Int8Array';
          if (t.b === 16) return t.u ? 'Uint16Array' : 'Int16Array';
          if (t.b === 32) return t.u ? 'Uint32Array' : 'Int32Array';
          return 'Float64Array';
        case 'float': return t.b === 64 ? 'Float64Array' : 'Float32Array';
        default: return null;
      }
    }
    valoareImplicita(t, noduri) {
      if (!t) return '0';
      switch (t.c) {
        case 'int': case 'float': case 'char': case 'enum': return '0';
        case 'bool': return 'false';
        case 'String': return '""';
        case 'cstr': return 'null';
        case 'ptr': return 'null';
        case 'fn': return 'null';
        case 'vector': return 'R.vector()';
        case 'map': return 'R.harta()';
        case 'arr': return this.tablouNou(t, null, noduri);
        case 'obj':
          if (t.ptrObj) return 'null';
          if (t.user) {
            const info = this.clase.get(t.cls);
            if (info && info.ctoruri.length) {
              const idx = info.ctoruri.findIndex(c => c.params.filter(p => !p.variadic && !p.implicit).length === 0);
              if (idx < 0) this.eroare('Clasa „' + t.cls + '” nu are constructor fără parametri — dă valori la creare, ex. ' + t.cls + ' obiect(…);', noduri);
              const c = info.ctoruri[idx];
              const impl = c.params.filter(p => !p.variadic).length ? this.argumente(c.params, [], noduri).join(', ') : '';
              return 'R.nou(' + this.jsClasa(t.cls) + ', ' + idx + ', [' + impl + '])';
            }
            return 'R.nou(' + this.jsClasa(t.cls) + ', -1, [])';
          }
          if (this.api.clase[t.cls] && this.api.clase[t.cls].faraConstructorImplicit) return 'null';
          this.folosite.c.add(t.cls);
          return this.cuSablon(t, 'new C.' + t.cls + '()');
        default: return '0';
      }
    }
    tablouNou(t, lista, nod) {
      // t = {c:'arr', el, dims:[expr|null]}
      const dims = [];
      for (const d of t.dims) {
        if (d === null) dims.push('null');
        else dims.push(this.expr(d).c);
      }
      const el = t.el;
      const ctor = this.constructorTablou(el);
      let fab;
      if (ctor) fab = '"' + ctor + '"';
      else fab = '() => ' + this.valoareImplicita(el, nod);
      const init = lista ? this.listaInitPentruTablou(lista, t, t.dims.length) : 'null';
      return 'R.tablou([' + dims.join(',') + '], ' + fab + ', ' + init + ')';
    }
    listaInitPentruTablou(li, t, nivel) {
      if (li.k === 'Str') return JSON.stringify(li.v);
      if (li.k !== 'ListaInit') {
        // char s[10] = "abc" sau alte expresii
        const e = this.expr(li);
        return e.c;
      }
      if (nivel <= 1) {
        return '[' + li.elemente.map(x => {
          if (x.k === 'DesemnatIndex') this.eroare('Inițializarea [index]= nu e suportată', li);
          if (x.k === 'ListaInit') return this.initValoare(t.el, x);
          return this.conversie(t.el, this.expr(x), x).c;
        }).join(',') + ']';
      }
      return '[' + li.elemente.map(x => {
        if (x.k === 'ListaInit' || x.k === 'Str') return this.listaInitPentruTablou(x, { c: 'arr', el: t.el, dims: t.dims.slice(1) }, nivel - 1);
        return this.expr(x).c;
      }).join(',') + ']';
    }
    initValoare(t, li) {
      // inițializare cu {} pentru o valoare de tipul t
      if (t.c === 'obj' && t.user) {
        const info = this.clase.get(t.cls);
        if (li.elemente.length && li.elemente[0].k === 'Desemnat') {
          const parti = li.elemente.map(d => {
            const camp = info.campuri.get(d.nume);
            if (!camp) this.eroare('Structura ' + t.cls + ' nu are câmpul „' + d.nume + '”', li);
            return JSON.stringify(camp.js) + ':' + (d.val.k === 'ListaInit' ? this.initValoare(camp.t, d.val) : this.conversie(camp.t, this.expr(d.val), d.val).c);
          });
          return this.jsClasa(t.cls) + '.__dinD({' + parti.join(',') + '})';
        }
        if (info.ctoruri.length && !info.esteAgregat) {
          return this.construieste(t, li.elemente, li);
        }
        const campuri = [...info.campuri.values()].filter(c => !c.static);
        const val = li.elemente.map((x, i) => {
          const camp = campuri[i];
          if (!camp) this.eroare('Prea multe valori în inițializarea lui ' + t.cls, li);
          if (x.k === 'ListaInit') return this.initValoare(camp.t, x);
          if (camp.t.c === 'arr' && x.k === 'Str') return this.tablouNou(camp.t, x, li);
          return this.conversie(camp.t, this.expr(x), x).c;
        });
        return this.jsClasa(t.cls) + '.__din([' + val.join(',') + '])';
      }
      if (t.c === 'arr') return this.tablouNou(t, li, li);
      if (t.c === 'vector') {
        return 'R.vector([' + li.elemente.map(x => x.k === 'ListaInit' ? this.initValoare(t.el, x) : this.conversie(t.el, this.expr(x), x).c).join(',') + '])';
      }
      if (t.c === 'obj' && !t.user) {
        // structuri din API (ex. i2s_config_t): {.camp = valoare} sau valori în ordinea câmpurilor
        const cls = this.api.clase[t.cls];
        if (cls && (cls.ordine || li.elemente.some(x => x.k === 'Desemnat'))) {
          this.folosite.c.add(t.cls);
          const ord = cls.ordine || [];
          const parti = li.elemente.map((x, i) => {
            const nume = x.k === 'Desemnat' ? x.nume : ord[i];
            if (!nume) this.eroare('Prea multe valori în inițializarea lui ' + t.cls, li);
            if (cls.proprietati && !cls.proprietati[nume]) this.eroare('Structura ' + t.cls + ' nu are câmpul „' + nume + '”', li);
            const val = x.k === 'Desemnat' ? x.val : x;
            const tc = cls.proprietati && cls.proprietati[nume] ? this.tipDinText(cls.proprietati[nume]) : null;
            let v;
            if (val.k === 'ListaInit') v = tc ? this.initValoare(tc, val) : this.argumentApi(val);
            else v = tc ? this.conversie(tc, this.expr(val), val).c : this.argumentApi(val);
            return JSON.stringify(nume) + ':' + v;
          });
          return 'Object.assign(new C.' + t.cls + '(), {' + parti.join(',') + '})';
        }
        return this.construieste(t, li.elemente, li);
      }
      if (li.elemente.length === 0) return this.valoareImplicita(t);
      if (li.elemente.length === 1) return this.conversie(t, this.expr(li.elemente[0]), li).c;
      this.eroare('Prea multe valori între acolade pentru tipul ' + numeTip(t), li);
    }

    // ---------- simboluri ----------
    jsNume(n) { return 'u_' + n; }
    jsClasa(n) { return 'K_' + n.replace(/[^\w]/g, '_'); }
    intraScop() { this.scopuri.push(new Map()); }
    iesiScop() { this.scopuri.pop(); }
    declaraLocal(nume, sim, nod) {
      const s = this.scopuri[this.scopuri.length - 1];
      if (s.has(nume) && !s.get(nume).param) this.eroare('„' + nume + '” este deja declarat în acest bloc', nod);
      s.set(nume, sim);
      return sim;
    }
    cauta(nume) {
      for (let i = this.scopuri.length - 1; i >= 0; i--) {
        const s = this.scopuri[i].get(nume);
        if (s) return s;
      }
      if (this.clasaCurenta) {
        let cls = this.clasaCurenta;
        while (cls) {
          const info = this.clase.get(cls);
          if (!info) break;
          if (info.campuri.has(nume)) { const c = info.campuri.get(nume); return { tip: 'camp', t: c.t, js: c.js, static: c.static, cls }; }
          if (info.metode.has(nume)) return { tip: 'metoda', cls, supra: info.metode.get(nume) };
          if (info.enumConst && info.enumConst.has(nume)) return info.enumConst.get(nume);
          cls = info.baza;
        }
      }
      if (this.globale.has(nume)) return this.globale.get(nume);
      return null;
    }

    // ---------- program ----------
    genereaza() {
      const decl = this.ast.decl;
      // 1. tipuri: structuri, enumuri, typedef-uri
      for (const d of decl) this.preInregistreaza(d);
      for (const d of decl) if (d.k === 'Struct') this.inregistreazaStruct(d);
      for (const d of decl) if (d.k === 'StaticMembru') {
        const info = this.clase.get(d.cls);
        if (!info || !info.campuri.has(d.nume)) this.eroare('„' + d.cls + '::' + d.nume + '” nu e declarat în clasă', d);
        if (d.init) info.campuri.get(d.nume).init = d.init;
      }
      // 2. semnături de funcții
      for (const d of decl) {
        if (d.k === 'Functie' && !d.cls) this.inregistreazaFunctie(d);
        if (d.k === 'Functie' && d.cls) this.atasazaMetodaExterna(d);
      }
      // 3. variabile globale
      const cod = [];
      const init = [];
      for (const d of decl) {
        if (d.k === 'Var') {
          for (const dc of d.decl) {
            const t = this.tipDin(d.tip, dc.ptr, dc.dim, false);
            if (t.c === 'void') this.eroare('Variabila „' + dc.nume + '” nu poate fi de tip void', dc);
            let tt = t;
            if (t.c === 'auto') {
              if (!dc.init) this.eroare('auto are nevoie de o valoare inițială', dc);
            }
            const js = this.jsNume(dc.nume);
            if (this.globale.has(dc.nume) && this.globale.get(dc.nume).tip === 'var') this.eroare('„' + dc.nume + '” este deja declarat', dc);
            const sim = { tip: 'var', t: tt, js, global: true, const: d.tip.const, rtc: d.tip.rtc };
            this.globale.set(dc.nume, sim);
            cod.push('let ' + js + ';');
            this.hotLinie = dc.l;
            const v = this.initializare(sim, dc, d.tip);
            if (sim.t.c === 'auto') sim.t = v.t || T.unk;
            if (d.tip.rtc) init.push('R.L=' + dc.l + ';' + js + ' = R.rtc(' + JSON.stringify(dc.nume) + ', () => ' + v.c + ');');
            else init.push('R.L=' + dc.l + ';' + js + ' = ' + v.c + ';');
            // constante numerice cunoscute la compilare (pentru dimensiuni de tablouri)
            if (d.tip.const && dc.init && esteNumeric(tt)) {
              const cv = this.constanta(dc.init);
              if (cv !== null) sim.valConst = cv;
            }
          }
        }
      }
      // 4. clase
      for (const d of decl) if (d.k === 'Struct') cod.push(this.genClasa(d));
      // 5. enum-uri (constante)
      for (const d of decl) if (d.k === 'Enum') cod.push(this.genEnum(d));
      // 6. funcții
      for (const d of decl) {
        if (d.k === 'Functie' && !d.cls && d.corp) cod.push(this.genFunctie(d));
      }
      // statice locale (ridicate la nivel global)
      const statice = this.staticeLocale.map(s => 'let ' + s + ';').join('\n');
      const areSetup = this.functiiUser.has('setup') && this.functiiUser.get('setup').some(f => f.corp);
      const areLoop = this.functiiUser.has('loop') && this.functiiUser.get('loop').some(f => f.corp);
      if (!areSetup) this.eroare('Lipsește funcția void setup() — orice schiță Arduino trebuie să o aibă', { l: 1 });
      if (!areLoop) this.eroare('Lipsește funcția void loop() — orice schiță Arduino trebuie să o aibă', { l: 1 });
      const setupJs = this.functiiUser.get('setup').find(f => f.corp).js;
      const loopJs = this.functiiUser.get('loop').find(f => f.corp).js;
      const exportFunctii = [];
      for (const [n, lst] of this.functiiUser) for (const f of lst) if (f.corp) exportFunctii.push(JSON.stringify(n) + ':' + f.js);
      const text = [
        '"use strict";',
        'const F = A.f, O = A.o, C = A.c;',
        statice,
        cod.join('\n'),
        'function* __init() {',
        init.join('\n'),
        '}',
        'return { init: __init, setup: ' + setupJs + ', loop: ' + loopJs + ', functii: {' + exportFunctii.join(',') + '} };'
      ].join('\n');
      return text;
    }
    preInregistreaza(d) {
      if (d.k === 'Typedef') {
        if (d.tip.baza && this.clase.has(d.tip.baza)) { this.tipdef.set(d.nume, { t: { c: 'obj', cls: d.tip.baza, user: true } }); return; }
        let t;
        try { t = this.tipDin(d.tip, d.tip.ptr || 0); } catch (e) {
          if (this.tipuriParser && this.tipuriParser.has(d.tip.baza)) t = { c: 'obj', cls: d.tip.baza, user: true };
          else throw e;
        }
        this.tipdef.set(d.nume, { t, dim: d.dim });
      }
      if (d.k === 'Enum') {
        const nume = d.nume || ('__enum' + d.l);
        const info = { clasa: d.clasa, valori: new Map() };
        let v = 0;
        for (const el of d.elemente) {
          if (el.val) { const cv = this.constanta(el.val); if (cv === null) this.eroare('Valoarea din enum trebuie să fie constantă', el); v = cv; }
          info.valori.set(el.nume, v);
          if (!d.clasa) this.globale.set(el.nume, { tip: 'enumconst', val: v, t: { c: 'enum', nume } });
          v++;
        }
        this.enumuri.set(nume, info);
        if (d.nume) this.globale.set('__enumtip_' + d.nume, { tip: 'enumtip' });
      }
      if (d.k === 'Struct') {
        this.clase.set(d.nume, { campuri: new Map(), metode: new Map(), ctoruri: [], baza: d.baza, nod: d, enumConst: new Map(), esteAgregat: true });
        for (const m of d.membri) if (m.k === 'Struct') this.preInregistreaza(m);
        for (const m of d.membri) if (m.k === 'Enum') {
          this.preInregistreaza(m);
          const info = this.clase.get(d.nume);
          if (!m.clasa) for (const el of m.elemente) info.enumConst.set(el.nume, this.globale.get(el.nume));
        }
        for (const m of d.membri) if (m.k === 'Typedef') this.preInregistreaza(m);
      }
    }
    inregistreazaStruct(d) {
      const info = this.clase.get(d.nume);
      if (d.baza && !this.clase.has(d.baza)) {
        if (this.api.clase[d.baza]) this.eroare('Moștenirea din clase de bibliotecă (' + d.baza + ') nu e suportată în simulare', d);
        this.eroare('Clasa de bază „' + d.baza + '” nu este definită', d);
      }
      for (const m of d.membri) {
        if (m.k === 'Struct') this.inregistreazaStruct(m);
        if (m.k === 'Var') {
          for (const dc of m.decl) {
            const t = this.tipDin(m.tip, dc.ptr, dc.dim);
            info.campuri.set(dc.nume, { t, js: this.jsNume(dc.nume), init: dc.init || (dc.ctor ? { ctor: dc.ctor } : null), static: m.tip.static, dc, tipSpec: m.tip });
          }
        }
        if (m.k === 'Functie') {
          if (m.esteCtor) { info.ctoruri.push(m); info.esteAgregat = false; continue; }
          if (m.destructor) continue;
          info.esteAgregat = false;
          if (!info.metode.has(m.nume)) info.metode.set(m.nume, []);
          const lst = info.metode.get(m.nume);
          const semn = this.semnatura(m);
          const existent = lst.find(x => x.semn === semn);
          if (existent) { if (m.corp) existent.nod = m; continue; }
          lst.push({ nod: m, semn, js: this.jsNume(m.nume) + (lst.length ? '__' + lst.length : ''), ret: this.tipDin(m.tipRet, 0), params: m.params, static: m.tipRet.static });
        }
      }
    }
    atasazaMetodaExterna(d) {
      const info = this.clase.get(d.cls);
      if (!info) this.eroare('Clasa „' + d.cls + '” nu este definită', d);
      if (d.esteCtor) {
        const semn = this.semnatura(d);
        const idx = info.ctoruri.findIndex(c => this.semnatura(c) === semn);
        if (idx >= 0) info.ctoruri[idx] = Object.assign({}, info.ctoruri[idx], { corp: d.corp, initializari: d.initializari || info.ctoruri[idx].initializari, params: d.params });
        else info.ctoruri.push(d);
        info.esteAgregat = false;
        return;
      }
      if (d.destructor) return;
      const lst = info.metode.get(d.nume);
      if (!lst) this.eroare('Clasa ' + d.cls + ' nu declară metoda „' + d.nume + '”', d);
      const semn = this.semnatura(d);
      const m = lst.find(x => x.semn === semn) || (lst.length === 1 ? lst[0] : null);
      if (!m) this.eroare('Nicio declarație a metodei ' + d.cls + '::' + d.nume + ' nu se potrivește', d);
      m.nod = Object.assign({}, m.nod, { corp: d.corp, params: d.params });
    }
    semnatura(f) { return f.params.filter(p => !p.variadic).map(p => (p.tip.baza || '?') + '*'.repeat(p.ptr || 0) + (p.dim && p.dim.length ? '[]' : '')).join(','); }
    inregistreazaFunctie(d) {
      if (!this.functiiUser.has(d.nume)) this.functiiUser.set(d.nume, []);
      const lst = this.functiiUser.get(d.nume);
      const semn = this.semnatura(d);
      const exist = lst.find(x => x.semn === semn);
      if (exist) {
        if (d.corp) {
          if (exist.corp) this.eroare('Funcția „' + d.nume + '” este definită de două ori', d);
          exist.corp = d.corp; exist.nod = d;
          // parametrii din definiție au nume
          exist.params = d.params;
        }
        // valori implicite din prototip
        d.params.forEach((p, i) => { if (p.implicit && exist.params[i] && !exist.params[i].implicit) exist.params[i].implicit = p.implicit; });
        return;
      }
      const f = { nod: d, semn, corp: d.corp, js: this.jsNume(d.nume) + (lst.length ? '__' + lst.length : ''), ret: this.tipDin(d.tipRet, 0), params: d.params };
      if (['setup', 'loop'].includes(d.nume) && f.ret.c !== 'void') this.eroare(d.nume + '() trebuie să fie de tip void', d);
      lst.push(f);
      this.globale.set(d.nume, { tip: 'fn', nume: d.nume });
    }

    // valoarea constantă a unei expresii (pentru dimensiuni de tablouri, enum, case)
    constanta(e) {
      try {
        switch (e.k) {
          case 'Num': return e.v;
          case 'Chr': return e.v;
          case 'Bool': return e.v ? 1 : 0;
          case 'Paranteza': return this.constanta(e.e);
          case 'Unar': { const v = this.constanta(e.arg); if (v === null) return null; return e.op === '-' ? -v : e.op === '~' ? ~v : e.op === '!' ? (v ? 0 : 1) : v; }
          case 'Bin': {
            const a = this.constanta(e.st), b = this.constanta(e.dr);
            if (a === null || b === null) return null;
            const intreg = Number.isInteger(a) && Number.isInteger(b);
            switch (e.op) {
              case '+': return a + b; case '-': return a - b; case '*': return a * b;
              case '/': return b === 0 ? null : (intreg ? Math.trunc(a / b) : a / b); case '%': return b === 0 ? null : a % b;
              case '<<': return a << b; case '>>': return a >> b; case '&': return a & b; case '|': return a | b; case '^': return a ^ b;
              case '==': return +(a === b); case '!=': return +(a !== b); case '<': return +(a < b); case '>': return +(a > b);
              case '<=': return +(a <= b); case '>=': return +(a >= b);
            }
            return null;
          }
          case 'Cast': return this.constanta(e.arg);
          case 'Id': {
            const s = this.cauta(e.nume);
            if (s && s.tip === 'enumconst') return s.val;
            if (s && s.tip === 'var' && s.valConst !== undefined) return s.valConst;
            const k = this.constantaApi(e.nume);
            if (k !== undefined) return k;
            return null;
          }
          case 'SizeofTip': return this.marimeTip(this.tipDin(e.tip, e.tip.ptr));
          case 'Tern': { const c = this.constanta(e.cond); if (c === null) return null; return c ? this.constanta(e.a) : this.constanta(e.b); }
          case 'Scop': { const v = this.valoareScop(e); return v && v.cv !== undefined ? v.cv : null; }
        }
      } catch (x) { return null; }
      return null;
    }
    constantaApi(nume) {
      if (this.placa.constante && Object.prototype.hasOwnProperty.call(this.placa.constante, nume)) return this.placa.constante[nume];
      if (Object.prototype.hasOwnProperty.call(this.api.constante, nume)) return this.api.constante[nume];
      if (/^B[01]{1,8}$/.test(nume)) return parseInt(nume.slice(1), 2);
      return undefined;
    }
    marimeTip(t) {
      switch (t.c) {
        case 'bool': case 'char': return 1;
        case 'int': return t.b / 8;
        case 'enum': return 4;
        case 'float': return t.b / 8;
        case 'cstr': case 'ptr': case 'fn': return this.platforma === 'avr' ? 2 : 4;
        case 'String': return this.platforma === 'avr' ? 6 : 16;
        case 'obj': {
          if (t.user) {
            const info = this.clase.get(t.cls);
            let s = 0; for (const c of info.campuri.values()) if (!c.static) s += this.marimeTip(c.t);
            return s || 1;
          }
          return 4;
        }
        case 'arr': {
          let n = this.marimeTip(t.el);
          for (const d of t.dims) { const v = d === null ? null : this.constanta(d); n *= (v || 1); }
          return n;
        }
        default: return 4;
      }
    }

    // ---------- inițializări ----------
    initializare(sim, dc, spec) {
      const t = sim.t;
      if (t.c === 'arr') {
        // dimensiuni lipsă din inițializare: int a[] = {...}
        if (dc.init) {
          if (dc.init.k === 'ListaInit' || dc.init.k === 'Str') return { c: this.tablouNou(t, dc.init, dc), t };
          const e = this.expr(dc.init);
          return { c: e.c, t };
        }
        if (t.dims.some(d => d === null)) this.eroare('Tabloul „' + dc.nume + '” are nevoie de dimensiune sau de valori inițiale', dc);
        return { c: this.tablouNou(t, null, dc), t };
      }
      if (dc.ctor) {
        if (t.c === 'obj') return { c: this.construieste(t, dc.ctor, dc), t };
        if (dc.ctor.length === 1) { const e = this.expr(dc.ctor[0]); return this.conversie(t, e, dc); }
        if (t.c === 'String' && dc.ctor.length === 2) return { c: this.apelString(dc.ctor, dc).c, t };
        this.eroare('Inițializare invalidă pentru „' + dc.nume + '”', dc);
      }
      if (dc.init) {
        if (dc.init.k === 'ListaInit') return { c: this.initValoare(t.c === 'auto' ? T.unk : t, dc.init), t };
        const e = this.expr(dc.init);
        if (t.c === 'auto') { sim.t = e.t && e.t.c !== 'unk' ? Object.assign({}, e.t, { ref: false }) : T.unk; return { c: this.copiereDacaStruct(e), t: sim.t }; }
        if (t.c === 'obj' && e.t && e.t.c === 'obj') return { c: this.copiereDacaStruct(e), t };
        if (t.c === 'obj' && !t.user && !(e.t && (e.t.c === 'obj' || e.t.c === 'unk'))) {
          // Servo s = ...;  IPAddress ip = "..." etc.
          return { c: this.construieste(t, [dc.init], dc), t };
        }
        return this.conversie(t, e, dc.init);
      }
      return { c: this.valoareImplicita(t, dc), t };
    }
    copiereDacaStruct(e) {
      if (e.t && e.t.c === 'obj' && e.t.user && e.lv && !e.t.ptrObj && !e.adresa) return 'R.copie(' + e.c + ')';
      if (e.t && e.t.c === 'obj' && !e.t.user && e.lv && !e.t.ptrObj && !e.adresa && !e.apiIndex && this.api.clase[e.t.cls] && this.api.clase[e.t.cls].prototype.__copie) return 'R.copie(' + e.c + ')';
      return e.c;
    }
    construieste(t, args, nod) {
      if (t.user) {
        const info = this.clase.get(t.cls);
        if (!info.ctoruri.length) {
          if (args.length === 0) return 'R.nou(' + this.jsClasa(t.cls) + ', -1, [])';
          // agregat cu paranteze (C++20) sau struct simplu
          return this.initValoare(t, { k: 'ListaInit', elemente: args, l: nod.l });
        }
        const idx = this.alegeSupraincarcare(info.ctoruri.map(c => ({ params: c.params })), args, nod, t.cls);
        const params = info.ctoruri[idx].params;
        return 'R.nou(' + this.jsClasa(t.cls) + ', ' + idx + ', [' + this.argumente(params, args, nod).join(', ') + '])';
      }
      const cls = this.api.clase[t.cls];
      if (!cls) this.eroare('Clasă necunoscută: ' + t.cls, nod);
      this.folosite.c.add(t.cls);
      return this.cuSablon(t, 'new C.' + t.cls + '(' + args.map(a => this.argumentApi(a)).join(', ') + ')');
    }
    // clasele-șablon ale bibliotecilor primesc argumentele (ex. StaticJsonDocument<200> -> capacitatea 200)
    cuSablon(t, cod) {
      const cls = this.api.clase[t.cls];
      if (!t.sablonArgs || !cls || !cls.prototype || !cls.prototype.__laSablon) return cod;
      return '(' + cod + ').__laSablon([' + t.sablonArgs.map(x => x.numar !== undefined ? String(x.numar) : x.expr ? this.expr(x.expr).c : JSON.stringify(x.baza || '')).join(', ') + '])';
    }
    argumentApi(a) {
      if (a.k === 'ListaInit') return '[' + a.elemente.map(x => this.argumentApi(x)).join(',') + ']';
      if (a.k === 'Id') {
        const s = this.cauta(a.nume);
        if (s && s.tip === 'fn') return this.referintaFunctie(a.nume, a).c;
        if (s && s.tip === 'metoda') return 'this.' + s.supra[0].js + '.bind(this)';
      }
      const e = this.expr(a);
      if (e.fnRef) return e.c;
      return e.c;
    }

    // ---------- clase ----------
    genClasa(d) {
      const info = this.clase.get(d.nume);
      const nume = this.jsClasa(d.nume);
      const vechi = this.clasaCurenta;
      this.clasaCurenta = d.nume;
      const baza = d.baza ? this.jsClasa(d.baza) : null;
      const linii = [];
      linii.push('class ' + nume + (baza ? ' extends ' + baza : '') + ' {');
      linii.push('constructor() { ' + (baza ? 'super(); ' : '') + 'this.__f' + nume + '(); }');
      // valori implicite ale câmpurilor
      const campuri = [];
      const statice = [];
      for (const [n, c] of info.campuri) {
        this.hotLinie = c.dc.l;
        if (c.static) {
          let v;
          if (c.init && !c.init.ctor) v = c.init.k === 'ListaInit' ? this.initValoare(c.t, c.init) : this.conversie(c.t, this.expr(c.init), c.init).c;
          else v = this.valoareImplicita(c.t, c.dc);
          statice.push(nume + '.' + c.js + ' = ' + v + ';');
          continue;
        }
        let v;
        if (c.init && c.init.ctor) v = c.t.c === 'obj' ? this.construieste(c.t, c.init.ctor, c.dc) : this.conversie(c.t, this.expr(c.init.ctor[0]), c.dc).c;
        else if (c.init) {
          this.intraScop();
          if (c.init.k === 'ListaInit') v = this.initValoare(c.t, c.init);
          else if (c.t.c === 'arr') v = this.tablouNou(c.t, c.init, c.dc);
          else v = this.conversie(c.t, this.expr(c.init), c.init).c;
          this.iesiScop();
        } else v = this.valoareImplicita(c.t, c.dc);
        campuri.push('this.' + c.js + ' = ' + v + ';');
      }
      linii.push('__f' + nume + '() { ' + campuri.join(' ') + ' }');
      // copiere (semantica valorilor pentru structuri)
      const copii = [];
      for (const [n, c] of info.campuri) {
        if (c.static) continue;
        if (c.t.c === 'arr') copii.push('o.' + c.js + ' = R.copieTablou(this.' + c.js + ');');
        else if (c.t.c === 'obj' && c.t.user && !c.t.ptrObj) copii.push('o.' + c.js + ' = R.copie(this.' + c.js + ');');
        else copii.push('o.' + c.js + ' = this.' + c.js + ';');
      }
      linii.push('__copie() { const o = Object.create(Object.getPrototypeOf(this)); ' + (baza ? 'Object.assign(o, super.__copie());' : '') + copii.join(' ') + ' return o; }');
      const ordine = [...info.campuri.values()].filter(c => !c.static);
      linii.push('static __din(v) { const o = new ' + nume + '(); ' + ordine.map((c, i) => 'if (v.length > ' + i + ') o.' + c.js + ' = ' + (c.t.c === 'arr' ? 'R.tablouDin(o.' + c.js + ', v[' + i + '])' : 'v[' + i + ']') + ';').join(' ') + ' return o; }');
      linii.push('static __dinD(v) { const o = new ' + nume + '(); for (const k in v) o[k] = v[k]; return o; }');
      // constructori
      info.ctoruri.forEach((c, i) => {
        linii.push('*__c' + i + '(' + this.listaParametri(c.params) + ') {');
        this.functieCurenta = { ret: T.void, ctor: true };
        this.intraScop();
        const pre = this.declaraParametri(c.params);
        linii.push(pre);
        // listă de inițializare
        let aApelatBaza = false;
        for (const ini of (c.initializari || [])) {
          if (ini.nume === d.baza) {
            const infoB = this.clase.get(d.baza);
            if (infoB.ctoruri.length) {
              const idx = this.alegeSupraincarcare(infoB.ctoruri.map(x => ({ params: x.params })), ini.args, ini, d.baza);
              linii.push('yield* super.__c' + idx + '(' + this.argumente(infoB.ctoruri[idx].params, ini.args, ini).join(', ') + ');');
            }
            aApelatBaza = true;
            continue;
          }
          const camp = info.campuri.get(ini.nume);
          if (!camp) this.eroare('Clasa ' + d.nume + ' nu are membrul „' + ini.nume + '”', ini);
          let v;
          if (camp.t.c === 'obj') v = this.construieste(camp.t, ini.args, ini);
          else if (ini.args.length === 1) v = ini.args[0].k === 'ListaInit' ? this.initValoare(camp.t, ini.args[0]) : this.conversie(camp.t, this.expr(ini.args[0]), ini).c;
          else if (ini.args.length === 0) v = this.valoareImplicita(camp.t);
          else this.eroare('Inițializare invalidă pentru ' + ini.nume, ini);
          linii.push('this.' + camp.js + ' = ' + v + ';');
        }
        if (!aApelatBaza && d.baza) {
          const infoB = this.clase.get(d.baza);
          const idx = infoB.ctoruri.findIndex(x => x.params.filter(p => !p.implicit).length === 0);
          if (idx >= 0) linii.push('yield* super.__c' + idx + '();');
        }
        if (c.corp) linii.push(this.genCorp(c.corp));
        this.iesiScop();
        this.functieCurenta = null;
        linii.push('}');
      });
      // metode
      for (const [n, lst] of info.metode) {
        for (const m of lst) {
          if (!m.nod.corp) {
            if (!m.nod.pur) { /* metodă declarată fără corp */ }
            continue;
          }
          const statica = m.static;
          linii.push((statica ? 'static ' : '') + '*' + m.js + '(' + this.listaParametri(m.nod.params) + ') {');
          const vechiStatic = this.inMetodaStatica;
          this.inMetodaStatica = statica;
          this.functieCurenta = { ret: m.ret, nume: n };
          this.intraScop();
          linii.push(this.declaraParametri(m.nod.params));
          linii.push(this.genCorp(m.nod.corp));
          this.iesiScop();
          this.functieCurenta = null;
          this.inMetodaStatica = vechiStatic;
          linii.push('}');
        }
      }
      linii.push('}');
      linii.push(...statice);
      this.clasaCurenta = vechi;
      return linii.join('\n');
    }
    genEnum(d) {
      if (!d.nume) return '';
      const info = this.enumuri.get(d.nume);
      if (d.clasa) {
        const parti = [...info.valori].map(([k, v]) => JSON.stringify(k) + ':' + v);
        return 'const ' + this.jsNume(d.nume) + ' = {' + parti.join(',') + '};';
      }
      return '';
    }

    // ---------- funcții ----------
    listaParametri(params) {
      return params.filter(p => !p.variadic).map((p, i) => {
        const n = p.nume ? this.jsNume(p.nume) : '_p' + i;
        return n;
      }).join(', ');
    }
    declaraParametri(params) {
      const cod = [];
      params.forEach((p, i) => {
        if (p.variadic) { this.avertizeaza('Funcțiile cu număr variabil de argumente (...) nu sunt suportate complet'); return; }
        if (!p.nume) return;
        let t = this.tipDin(p.tip, p.ptr - (p.tip.ptr || 0), p.dim);
        const js = this.jsNume(p.nume);
        const refScalar = p.ref && !p.tip.const && (esteNumeric(t) || t.c === 'String' || t.c === 'bool' || t.c === 'cstr' || t.c === 'enum');
        const sim = { tip: 'var', t, js, param: true, refBox: refScalar };
        this.declaraLocal(p.nume, sim, p);
        if (p.implicit) {
          const e = this.conversie(t, this.expr(p.implicit), p.implicit);
          cod.push('if (' + js + ' === undefined) ' + js + ' = ' + e.c + ';');
        }
        if (!refScalar) {
          // conversia argumentului la tipul parametrului (ex. float -> int)
          if (t.c === 'int' || t.c === 'char') cod.push(js + ' = ' + inf(t, js) + ';');
          if (t.c === 'obj' && t.user && !p.ref && !(p.ptr > 0)) cod.push(js + ' = R.copie(' + js + ');');
          if (t.c === 'String' && !p.ref) cod.push('if (typeof ' + js + ' !== "string") ' + js + ' = R.S(' + js + ');');
        }
      });
      return cod.join('\n');
    }
    genFunctie(d) {
      const f = this.functiiUser.get(d.nume).find(x => x.nod === d || x.corp === d.corp);
      this.functieCurenta = { ret: f.ret, nume: d.nume };
      this.intraScop();
      const params = this.listaParametri(d.params);
      const pre = this.declaraParametri(d.params);
      const corp = this.genCorp(d.corp);
      this.iesiScop();
      this.functieCurenta = null;
      return 'function* ' + f.js + '(' + params + ') {\n' + pre + '\n' + corp + '\n}';
    }
    genCorp(bloc) {
      return bloc.corp.map(s => this.instr(s)).join('\n');
    }

    // ---------- instrucțiuni ----------
    instr(s) {
      if (!s) return '';
      this.hotLinie = s.l;
      const L = 'R.L=' + s.l + ';';
      switch (s.k) {
        case 'Bloc': { this.intraScop(); const c = s.corp.map(x => this.instr(x)).join('\n'); this.iesiScop(); return '{\n' + c + '\n}'; }
        case 'Var': return this.instrVar(s);
        case 'Expr': {
          const e = this.expr(s.e, true);
          return L + e.c + ';';
        }
        case 'If': {
          const c = this.conditie(s.cond);
          let r = L + 'if (' + c + ') ' + this.instrInBloc(s.atunci);
          if (s.altfel) r += ' else ' + this.instrInBloc(s.altfel);
          return r;
        }
        case 'While': return L + 'while (' + this.conditie(s.cond) + ') {\nif (--R.b < 0) yield R.P;\n' + this.instrInBloc(s.corp) + '\n}';
        case 'DoWhile': return L + 'do {\nif (--R.b < 0) yield R.P;\n' + this.instrInBloc(s.corp) + '\n} while (' + this.conditie(s.cond) + ');';
        case 'For': {
          this.intraScop();
          let init = '';
          if (s.init) {
            if (s.init.k === 'Var') init = this.instrVar(s.init, true);
            else init = this.expr(s.init.e, true).c;
          }
          const cond = s.cond ? this.conditie(s.cond) : '';
          const pas = s.pas ? this.expr(s.pas, true).c : '';
          const corp = this.instrInBloc(s.corp);
          this.iesiScop();
          return L + 'for (' + init + '; ' + cond + '; ' + pas + ') {\nif (--R.b < 0) yield R.P;\n' + corp + '\n}';
        }
        case 'ForIn': {
          const col = this.expr(s.colectie);
          this.intraScop();
          let tEl = T.unk;
          if (col.t.c === 'arr') tEl = col.t.dims.length > 1 ? { c: 'arr', el: col.t.el, dims: col.t.dims.slice(1) } : col.t.el;
          else if (col.t.c === 'vector') tEl = col.t.el;
          else if (col.t.c === 'String' || col.t.c === 'cstr') tEl = T.char;
          const clsCol = col.t.c === 'obj' && !col.t.user ? this.api.clase[col.t.cls] : null;
          if (clsCol && clsCol.prototype && clsCol.prototype.__elemente) {
            // colecțiile bibliotecilor (JsonArray, JsonObject) dau lista elementelor
            tEl = { c: 'obj', cls: clsCol.tipElement || col.t.cls, user: false };
            col.c = col.c + '.__elemente()';
          }
          const declarat = this.tipDin(s.tip, 0);
          const t = declarat.c === 'auto' ? tEl : declarat;
          const idx = this.tmp(), arr = this.tmp();
          let cod;
          if (s.ref) {
            this.declaraLocal(s.nume, { tip: 'var', t, js: arr + '[' + idx + ']', alias: true }, s);
            cod = 'for (let ' + idx + ' = 0, ' + arr + ' = ' + col.c + '; ' + idx + ' < ' + arr + '.length; ' + idx + '++) {\nif (--R.b < 0) yield R.P;\n' + this.instrInBloc(s.corp) + '\n}';
          } else {
            const js = this.jsNume(s.nume);
            this.declaraLocal(s.nume, { tip: 'var', t, js }, s);
            const citire = col.t.c === 'String' || col.t.c === 'cstr' ? 'R.ci(' + arr + ', ' + idx + ')' : arr + '[' + idx + ']';
            cod = 'for (let ' + idx + ' = 0, ' + arr + ' = ' + col.c + '; ' + idx + ' < R.lung(' + arr + '); ' + idx + '++) {\nlet ' + js + ' = ' + (t.c === 'obj' && t.user ? 'R.copie(' + citire + ')' : citire) + ';\nif (--R.b < 0) yield R.P;\n' + this.instrInBloc(s.corp) + '\n}';
          }
          this.iesiScop();
          return L + cod;
        }
        case 'Switch': {
          const d = this.expr(s.disc);
          const parti = [];
          this.intraScop();
          for (const c of s.cazuri) {
            if (c.test === null) parti.push('default:');
            else {
              const v = this.constanta(c.test);
              if (v === null) {
                const e = this.expr(c.test);
                parti.push('case ' + e.c + ':');
              } else if (c.pana) {
                const v2 = this.constanta(c.pana);
                if (v2 === null || v2 - v > 512) this.eroare('Interval case prea mare', c);
                for (let x = v; x <= v2; x++) parti.push('case ' + x + ':');
              } else parti.push('case ' + v + ':');
            }
            parti.push(c.corp.map(x => this.instr(x)).join('\n'));
          }
          this.iesiScop();
          return L + 'switch (' + (esteText(d.t) ? d.c : '+(' + d.c + ')') + ') {\n' + parti.join('\n') + '\n}';
        }
        case 'Break': return 'break;';
        case 'Continue': return 'continue;';
        case 'Return': {
          const f = this.functieCurenta;
          if (!f) this.eroare('return în afara unei funcții', s);
          if (!s.arg) return L + 'return;';
          if (f.ret.c === 'void') {
            const e = this.expr(s.arg, true);
            return L + e.c + '; return;';
          }
          if (s.arg.k === 'ListaInit') return L + 'return ' + this.initValoare(f.ret, s.arg) + ';';
          const e = this.expr(s.arg);
          const c = this.conversie(f.ret, e, s.arg);
          return L + 'return ' + (f.ret.c === 'obj' && f.ret.user ? 'R.copie(' + c.c + ')' : c.c) + ';';
        }
        case 'Struct': this.eroare('Definițiile de structuri în interiorul funcțiilor nu sunt suportate — mută-le în afara funcției', s);
        case 'Enum': {
          this.preInregistreaza(s);
          if (Array.isArray(s)) return '';
          return '';
        }
        case 'Typedef': this.preInregistreaza(s); return '';
      }
      if (Array.isArray(s)) return s.map(x => this.instr(x)).join('\n');
      this.eroare('Instrucțiune nesuportată: ' + s.k, s);
    }
    instrInBloc(s) {
      if (!s) return '{}';
      if (s.k === 'Bloc') return this.instr(s);
      this.intraScop();
      const c = this.instr(s);
      this.iesiScop();
      return '{\n' + c + '\n}';
    }
    instrVar(s, inFor) {
      const parti = [];
      for (const dc of s.decl) {
        this.hotLinie = dc.l;
        const t = this.tipDin(s.tip, dc.ptr, dc.dim, false);
        if (t.c === 'void') this.eroare('Variabila „' + dc.nume + '” nu poate fi de tip void', dc);
        if (s.tip.static && !inFor) {
          // variabilă statică locală: păstrează valoarea între apeluri
          const js = 's' + (this.contor++) + '_' + dc.nume;
          const flag = js + '_i';
          this.staticeLocale.push(js, flag);
          const sim = { tip: 'var', t, js };
          const v = this.initializare(sim, dc, s.tip);
          this.declaraLocal(dc.nume, sim, dc);
          parti.push('if (!' + flag + ') { ' + flag + ' = true; ' + js + ' = ' + v.c + '; }');
          continue;
        }
        const js = this.jsNume(dc.nume);
        const sim = { tip: 'var', t, js, const: s.tip.const };
        if (dc.ref && dc.init) {
          // referință locală: alias pentru expresia țintă
          const e = this.expr(dc.init);
          if (e.lv && !(esteNumeric(t) || t.c === 'String' || t.c === 'bool')) {
            this.declaraLocal(dc.nume, Object.assign(sim, { t: t.c === 'auto' ? e.t : t }), dc);
            parti.push((inFor ? '' : 'let ') + js + ' = ' + e.c + ';');
            continue;
          }
          if (e.lv && /^[\w.$]+(\[[\w.$]+\])?$/.test(e.c)) {
            this.declaraLocal(dc.nume, Object.assign(sim, { alias: true, js: e.c, t: t.c === 'auto' ? e.t : t }), dc);
            continue;
          }
        }
        // inițializarea se generează înainte de declarare (int x = x; e invalid oricum)
        const v = this.initializare(sim, dc, s.tip);
        this.declaraLocal(dc.nume, sim, dc);
        if (sim.const && dc.init && esteNumeric(sim.t)) { const cv = this.constanta(dc.init); if (cv !== null) sim.valConst = cv; }
        parti.push(js + ' = ' + v.c);
      }
      if (!parti.length) return '';
      if (inFor) return 'let ' + parti.join(', ');
      return parti.map(p => p.startsWith('if (') ? p : 'let ' + p + ';').join('\n');
    }
    conditie(e) {
      const r = this.expr(e);
      if (r.t && r.t.c === 'obj' && !r.t.user) return 'R.adev(' + r.c + ')';
      return r.c;
    }

    // ---------- conversii ----------
    conversie(tDest, e, nod) {
      const tS = e.t || T.unk;
      if (!tDest || tDest.c === 'unk' || tDest.c === 'auto') return e;
      switch (tDest.c) {
        case 'int': case 'char': case 'enum':
          if (tS.c === 'String') this.eroare('Nu pot converti String în număr — folosește .toInt()', nod);
          if (tS.c === 'cstr' && e.lit) this.eroare('Nu pot atribui un text („' + e.lit + '”) unei variabile numerice', nod);
          if (tS.c === 'bool') return { c: '(+(' + e.c + '))', t: tDest };
          if (tS.c === tDest.c && tS.b === tDest.b && tS.u === tDest.u) return { c: e.c, t: tDest };
          if (e.cv !== undefined && Number.isInteger(e.cv) && tDest.c === 'int' && tDest.b >= 32 && !tDest.u && e.cv >= -2147483648 && e.cv <= 2147483647) return { c: e.c, t: tDest };
          if (tS.c === 'int' && tDest.c === 'int' && tDest.b >= tS.b && (tDest.u === tS.u || (!tDest.u && tDest.b > tS.b))) return { c: e.c, t: tDest };
          return { c: inf(tDest, e.c), t: tDest };
        case 'float':
          if (tS.c === 'String') this.eroare('Nu pot converti String în număr — folosește .toFloat()', nod);
          if (tS.c === 'obj' && !tS.user) return { c: tDest.b === 32 ? 'Math.fround(' + e.c + ')' : '(+(' + e.c + '))', t: tDest };
          if (tS.c === 'bool') return { c: '(+(' + e.c + '))', t: tDest };
          if (tDest.b === 32 && !(tS.c === 'float' && tS.b === 32) && !(e.cv !== undefined && Math.fround(e.cv) === e.cv)) return { c: 'Math.fround(' + e.c + ')', t: tDest };
          return { c: e.c, t: tDest };
        case 'bool':
          if (tS.c === 'bool') return e;
          if (tS.c === 'obj' && !tS.user) return { c: 'R.adev(' + e.c + ')', t: T.bool };
          return { c: '!!(' + e.c + ')', t: T.bool };
        case 'String':
          if (tS.c === 'String') return e;
          if (tS.c === 'obj' && !tS.user && this.api.clase[tS.cls] && this.api.clase[tS.cls].prototype.__str) return { c: e.c + '.__str()', t: T.String };
          if (tS.c === 'cstr' || (tS.c === 'arr' && tS.el.c === 'char')) return { c: 'R.txt(' + e.c + ')', t: T.String };
          return { c: 'R.S(' + e.c + ', undefined, "' + tag(tS) + '")', t: T.String };
        case 'cstr':
          if (tS.c === 'String' && !e.permiteString) this.eroare('Nu pot converti String în const char* — folosește .c_str()', nod);
          if (tS.c === 'obj' && !tS.user && this.api.clase[tS.cls] && this.api.clase[tS.cls].prototype.__cstr) return { c: e.c + '.__cstr()', t: T.cstr };
          return { c: e.c, t: T.cstr };
        case 'obj':
          if (!tDest.user && !tDest.ptrObj && this.api.clase[tDest.cls] && this.api.clase[tDest.cls].__din && !e.adresa) return { c: 'C.' + tDest.cls + '.__din(' + e.c + ')', t: tDest };
          if (tDest.user && !tDest.ptrObj && tS.c === 'obj' && tS.cls === tDest.cls && e.lv && !e.adresa) return { c: 'R.copie(' + e.c + ')', t: tDest };
          if (!tDest.user && !tDest.ptrObj && tS.c === 'obj' && !tS.user && !tS.ptrObj && e.lv && !e.adresa && !e.apiIndex && this.api.clase[tS.cls] && this.api.clase[tS.cls].prototype.__copie) return { c: 'R.copie(' + e.c + ')', t: tDest };
          return { c: e.c, t: tDest };
        default:
          return { c: e.c, t: tDest };
      }
    }

    // ---------- expresii ----------
    // întoarce {c: cod, t: tip, lv: e l-valoare, cv: valoare constantă}
    expr(e, statement) {
      switch (e.k) {
        case 'Num': {
          let t;
          if (e.real) t = e.flt ? T.float : (this.platforma === 'avr' ? T.float : T.double);
          else if (e.lung >= 2) t = e.uns ? T.u64 : T.i64;
          else if (e.uns || e.v > 2147483647) t = e.v > 4294967295 ? T.i64 : T.u32;
          else if (e.lung === 1) t = T.i32;
          else t = this.platforma === 'avr' && Math.abs(e.v) <= 32767 ? T.i16 : (this.platforma === 'avr' ? T.i32 : T.i32);
          let txt = String(e.v);
          if (e.v === Infinity) txt = 'Infinity';
          if (t.c === 'float' && t.b === 32 && Math.fround(e.v) !== e.v) txt = String(Math.fround(e.v));
          return { c: txt, t, cv: e.v };
        }
        case 'Chr': return { c: String(e.v & 255), t: T.char, cv: e.v & 255 };
        case 'Str': return { c: JSON.stringify(e.v), t: T.cstr, lit: e.v, permiteString: false };
        case 'Bool': return { c: e.v ? 'true' : 'false', t: T.bool, cv: e.v ? 1 : 0 };
        case 'Null': return { c: 'null', t: { c: 'ptr', el: T.unk } };
        case 'Paranteza': { const r = this.expr(e.e, statement); return { c: '(' + r.c + ')', t: r.t, lv: false, cv: r.cv, lit: r.lit }; }
        case 'This': {
          if (!this.clasaCurenta) this.eroare('this se poate folosi doar în metodele unei clase', e);
          return { c: 'this', t: { c: 'obj', cls: this.clasaCurenta, user: true } };
        }
        case 'Id': return this.exprId(e);
        case 'Scop': return this.valoareScop(e, true);
        case 'Unar': return this.exprUnar(e);
        case 'Incr': return this.exprIncr(e);
        case 'Bin': return this.exprBin(e);
        case 'Logic': {
          const a = this.expr(e.st), b = this.expr(e.dr);
          const ca = a.t && a.t.c === 'obj' && !a.t.user ? 'R.adev(' + a.c + ')' : a.c;
          const cb = b.t && b.t.c === 'obj' && !b.t.user ? 'R.adev(' + b.c + ')' : b.c;
          return { c: '(!!(' + ca + ') ' + e.op + ' !!(' + cb + '))', t: T.bool };
        }
        case 'Tern': {
          const c = this.conditie(e.cond);
          const a = this.expr(e.a), b = this.expr(e.b);
          let t = a.t;
          if (esteNumeric(a.t) && esteNumeric(b.t)) t = tipAritmetic(a.t, b.t, this.platforma);
          if (a.t.c === 'String' || b.t.c === 'String') {
            return { c: '(' + c + ' ? ' + this.conversie(T.String, a, e).c + ' : ' + this.conversie(T.String, b, e).c + ')', t: T.String };
          }
          if (a.t.c === 'cstr' && b.t.c === 'cstr') t = T.cstr;
          return { c: '(' + c + ' ? ' + a.c + ' : ' + b.c + ')', t };
        }
        case 'Atrib': return this.exprAtrib(e);
        case 'Apel': return this.exprApel(e);
        case 'Membru': return this.exprMembru(e);
        case 'Index': return this.exprIndex(e);
        case 'Cast': return this.exprCast(e);
        case 'SizeofTip': { const n = this.marimeTip(this.tipDin(e.tip, e.tip.ptr)); return { c: String(n), t: T.u32, cv: n }; }
        case 'SizeofExpr': {
          const a = this.expr(e.arg);
          if (a.t.c === 'arr') {
            const el = this.marimeTip(a.t.el);
            let restul = 1;
            for (let i = 1; i < a.t.dims.length; i++) { const v = a.t.dims[i] ? this.constanta(a.t.dims[i]) : 1; restul *= v || 1; }
            return { c: '(R.lung(' + a.c + ') * ' + (el * restul) + ')', t: T.u32 };
          }
          if (a.t.c === 'cstr' && a.lit !== undefined) return { c: String(a.lit.length + 1), t: T.u32, cv: a.lit.length + 1 };
          const n = this.marimeTip(a.t);
          return { c: String(n), t: T.u32, cv: n };
        }
        case 'Virgula': {
          const parti = e.lista.map(x => this.expr(x, true));
          return { c: '(' + parti.map(p => p.c).join(', ') + ')', t: parti[parti.length - 1].t };
        }
        case 'Adresa': {
          const a = this.expr(e.arg);
          // adresa unui „handle” (pointer opac, ex. TaskHandle_t): funcția scrie în variabilă
          if (a.t.c === 'obj' && a.t.ptrObj && a.lv && !a.t.user) return { c: 'R.ref(() => ' + a.c + ', (_v) => ' + a.c + ' = _v)', t: { c: 'ptr', el: a.t, box: true }, adresa: true };
          if (a.t.c === 'obj' || a.t.c === 'arr' || a.t.c === 'vector' || a.t.c === 'fn' || a.fnRef || a.t.c === 'unk') return Object.assign({}, a, { lv: false, adresa: true });
          if (!a.lv) this.eroare('Nu pot lua adresa acestei expresii', e);
          // pointer la o variabilă simplă -> cutie cu get/set
          return { c: 'R.ref(() => ' + a.c + ', (_v) => ' + a.c + ' = _v)', t: { c: 'ptr', el: a.t, box: true }, adresa: true };
        }
        case 'Deref': {
          const a = this.expr(e.arg);
          if (a.t.c === 'ptr' && a.t.box) return { c: a.c + '.v', t: a.t.el, lv: true };
          if (a.t.c === 'cstr') return { c: 'R.ci(' + a.c + ', 0)', scrie: '(' + a.c + ')[0]', t: T.char, lv: true, inTablouTipizat: true, derefCstr: a.c };
          if (a.t.c === 'obj' || a.t.c === 'unk') return Object.assign({}, a, { lv: true });
          if (a.t.c === 'ptr' || a.t.c === 'arr') return { c: '(' + a.c + ')[0]', t: a.t.el, lv: true, inTablouTipizat: !!this.constructorTablou(a.t.el), derefArr: a.c };
          return { c: 'R.deref(' + a.c + ')', scrie: '(' + a.c + ')[0]', t: T.unk, lv: true, derefArr: a.c };
        }
        case 'Nou': {
          const t = this.tipDin(e.tip, 0);
          if (e.dim) {
            const dim = this.expr(e.dim);
            const ctor = this.constructorTablou(t);
            return { c: 'R.tablou([' + dim.c + '], ' + (ctor ? '"' + ctor + '"' : '() => ' + this.valoareImplicita(t)) + ', null)', t: { c: 'ptr', el: t } };
          }
          if (t.c === 'obj') return { c: this.construieste(t, e.args, e), t };
          if (e.args.length) return { c: 'R.ref0(' + this.conversie(t, this.expr(e.args[0]), e).c + ')', t: { c: 'ptr', el: t, box: true } };
          return { c: 'R.ref0(' + this.valoareImplicita(t) + ')', t: { c: 'ptr', el: t, box: true } };
        }
        case 'Sterge': { this.expr(e.arg); return { c: 'undefined', t: T.void }; }
        case 'Lambda': {
          const vechiF = this.functieCurenta;
          this.functieCurenta = { ret: T.unk, lambda: true };
          this.intraScop();
          const p = this.listaParametri(e.params);
          const pre = this.declaraParametri(e.params);
          const corp = this.genCorp(e.corp);
          this.iesiScop();
          this.functieCurenta = vechiF;
          return { c: '(function* (' + p + ') {\n' + pre + '\n' + corp + '\n}).bind(this)', t: { c: 'fn' }, fnRef: true };
        }
        case 'ListaInit': return { c: '[' + e.elemente.map(x => this.expr(x).c).join(', ') + ']', t: T.unk };
      }
      this.eroare('Expresie nesuportată: ' + e.k, e);
    }

    exprId(e) {
      const n = e.nume;
      const s = this.cauta(n);
      if (s) {
        switch (s.tip) {
          case 'var':
            if (s.refBox) return { c: s.js + '.v', t: s.t, lv: true, sim: s };
            return { c: s.js, t: s.t, lv: !s.alias || true, sim: s, cv: s.valConst };
          case 'camp':
            if (s.static) return { c: this.jsClasa(s.cls) + '.' + s.js, t: s.t, lv: true };
            if (this.inMetodaStatica) this.eroare('Membrul „' + n + '” nu poate fi folosit într-o metodă statică', e);
            return { c: 'this.' + s.js, t: s.t, lv: true };
          case 'enumconst': return { c: String(s.val), t: s.t || T.i32, cv: s.val };
          case 'fn': return this.referintaFunctie(n, e, true);
          case 'metoda': return { c: 'this.' + s.supra[0].js + '.bind(this)', t: { c: 'fn' }, fnRef: true };
        }
      }
      // API
      const k = this.constantaApi(n);
      if (k !== undefined) {
        if (typeof k === 'string') return { c: JSON.stringify(k), t: T.cstr, lit: k };
        const tk = this.api.tipConstante && this.api.tipConstante[n] ? this.tipDinText(this.api.tipConstante[n]) : (Number.isInteger(k) ? (k > 2147483647 ? T.u32 : T.i32) : T.double);
        let txt = String(k);
        if (k === Infinity) txt = 'Infinity'; else if (k === -Infinity) txt = '-Infinity'; else if (Number.isNaN(k)) txt = 'NaN';
        return { c: txt, t: tk, cv: k };
      }
      if (this.api.obiecte[n]) {
        this.folosite.o.add(n);
        return { c: 'O.' + n, t: { c: 'obj', cls: this.api.obiecte[n], user: false }, lv: false, apiObj: n };
      }
      if (this.api.functii[n]) return { c: 'F.' + n, t: { c: 'fn' }, fnRef: true, apiFn: n };
      if (this.api.clase[n]) return { c: 'C.' + n, t: { c: 'clasa', cls: n } };
      if (this.clase.has(n)) return { c: this.jsClasa(n), t: { c: 'clasa', cls: n, user: true } };
      if (this.api.rezolvaNecunoscut) { const r = this.api.rezolvaNecunoscut(n); if (r) return { c: r.c, t: this.tipDinText(r.t) }; }
      if (this.enumuri.has(n) && this.enumuri.get(n).clasa) return { c: this.jsNume(n), t: { c: 'enumclasa', nume: n } };
      this.eroare('„' + n + '” nu a fost declarat (' + n + ' was not declared in this scope)' + this.sugestie(n), e);
    }
    sugestie(n) {
      const nume = [];
      for (const s of this.scopuri) for (const k of s.keys()) nume.push(k);
      for (const k of this.globale.keys()) nume.push(k);
      for (const k of Object.keys(this.api.functii)) nume.push(k);
      for (const k of Object.keys(this.api.obiecte)) nume.push(k);
      let best = null, bd = 3;
      const lo = n.toLowerCase();
      for (const k of nume) {
        if (k.startsWith('__')) continue;
        if (k.toLowerCase() === lo) return ' — poate ai vrut „' + k + '”? (literele mari contează)';
        const d = distanta(lo, k.toLowerCase());
        if (d < bd) { bd = d; best = k; }
      }
      return best ? ' — poate ai vrut „' + best + '”?' : '';
    }
    referintaFunctie(n, nod) {
      const lst = this.functiiUser.get(n);
      if (!lst || !lst.length) this.eroare('Funcția „' + n + '” nu e definită', nod);
      return { c: lst[0].js, t: { c: 'fn', ret: lst[0].ret }, fnRef: true, userFn: n };
    }
    valoareScop(e, strict) {
      // A::B — enum class, membri statici, constante de bibliotecă
      const st = e.stanga;
      if (st.k === 'Id') {
        const nume = st.nume;
        if (this.enumuri.has(nume)) {
          const info = this.enumuri.get(nume);
          if (info.valori.has(e.nume)) { const v = info.valori.get(e.nume); return { c: String(v), t: { c: 'enum', nume }, cv: v }; }
        }
        if (this.clase.has(nume)) {
          const info = this.clase.get(nume);
          if (info.campuri.has(e.nume)) { const c = info.campuri.get(e.nume); return { c: this.jsClasa(nume) + '.' + c.js, t: c.t, lv: true }; }
          if (info.metode.has(e.nume)) { const m = info.metode.get(e.nume)[0]; return { c: this.jsClasa(nume) + '.' + m.js, t: { c: 'fn' }, fnRef: true, statica: m }; }
          if (info.enumConst.has(e.nume)) { const v = info.enumConst.get(e.nume); return { c: String(v.val), t: T.i32, cv: v.val }; }
          // enum class în interiorul clasei
          for (const [en, inf2] of this.enumuri) if (inf2.valori.has(e.nume) && en.startsWith(nume)) { const v = inf2.valori.get(e.nume); return { c: String(v), t: T.i32, cv: v }; }
        }
        // Clasă::enum din biblioteci (ex. ESP.getChipModel) sau constante
        const cheie = nume + '::' + e.nume;
        const k = this.constantaApi(cheie);
        if (k !== undefined) return { c: String(k), t: T.i32, cv: k };
        // constantele clasei au prioritate față de constantele globale cu același nume (ex. DHTesp::DHT11 vs DHT11)
        if (this.api.clase[nume] && this.api.clase[nume].constanteStatice && this.api.clase[nume].constanteStatice[e.nume] !== undefined) {
          const v = this.api.clase[nume].constanteStatice[e.nume];
          return { c: String(v), t: Number.isInteger(v) && v > 2147483647 ? T.u32 : T.i32, cv: v };
        }
        const kk = this.constantaApi(e.nume);
        if (kk !== undefined) return { c: String(kk), t: T.i32, cv: kk };
        if (this.api.clase[nume] && typeof this.api.clase[nume][e.nume] === 'function') {
          const f = this.api.clase[nume][e.nume];
          return { c: 'C.' + nume + '.' + e.nume, t: { c: 'fn' }, fnRef: true, apiStatic: { cls: nume, m: e.nume, gen: f.constructor && f.constructor.name === 'GeneratorFunction', ret: this.api.clase[nume].tipuriStatice && this.api.clase[nume].tipuriStatice[e.nume] } };
        }
        if (this.api.clase[nume] && this.api.clase[nume].constanteStatice && this.api.clase[nume].constanteStatice[e.nume] !== undefined) {
          const v = this.api.clase[nume].constanteStatice[e.nume];
          return { c: String(v), t: Number.isInteger(v) && v > 2147483647 ? T.u32 : T.i32, cv: v };
        }
        if (this.api.functii[e.nume]) return { c: 'F.' + e.nume, t: { c: 'fn' }, fnRef: true, apiFn: e.nume };
        if (this.api.clase[e.nume]) return { c: 'C.' + e.nume, t: { c: 'clasa', cls: e.nume } };
        for (const [en, inf2] of this.enumuri) if (inf2.valori.has(e.nume)) { const v = inf2.valori.get(e.nume); return { c: String(v), t: T.i32, cv: v }; }
      }
      if (strict) this.eroare('Nu recunosc „' + (st.nume || '?') + '::' + e.nume + '”', e);
      return null;
    }

    exprUnar(e) {
      const a = this.expr(e.arg);
      switch (e.op) {
        case '!':
          if (a.t.c === 'obj' && !a.t.user) return { c: '!R.adev(' + a.c + ')', t: T.bool };
          return { c: '!(' + a.c + ')', t: T.bool, cv: a.cv !== undefined ? (a.cv ? 0 : 1) : undefined };
        case '-': {
          if (a.cv !== undefined) return { c: '(' + (-a.cv) + ')', t: a.t.c === 'int' && a.t.u ? T.i64 : (esteReal(a.t) ? a.t : (a.t.c === 'int' ? a.t : T.i32)), cv: -a.cv };
          const t = esteReal(a.t) ? a.t : tipAritmetic(a.t, T.i32, this.platforma);
          return { c: inf(t, '-(' + a.c + ')'), t };
        }
        case '+': return { c: '(+(' + a.c + '))', t: esteReal(a.t) ? a.t : tipAritmetic(a.t, T.i32, this.platforma), cv: a.cv };
        case '~': {
          if (esteReal(a.t)) this.eroare('Operatorul ~ nu merge cu numere reale', e);
          const t = tipAritmetic(a.t, T.i32, this.platforma);
          if (t.b === 64) return { c: 'R.not64(' + a.c + ')', t };
          return { c: inf(t, '~(' + a.c + ')'), t, cv: a.cv !== undefined ? ~a.cv : undefined };
        }
      }
    }
    exprIncr(e) {
      const a0 = this.expr(e.arg);
      if (!a0.lv) this.eroare('++/-- se poate aplica doar unei variabile', e);
      if (a0.apiIndex) {
        const ai = a0.apiIndex, d = e.op === '++' ? '+ 1' : '- 1';
        return { c: (e.prefix ? '' : '(+' + a0.c + ', ') + ai.obj + '.__setIndex(' + ai.idx + ', +' + a0.c + ' ' + d + ')' + (e.prefix ? '' : ')'), t: T.i32 };
      }
      const a = a0.scrie ? Object.assign({}, a0, { c: a0.scrie }) : a0;
      const op = e.op === '++' ? '+' : '-';
      const t = a.t;
      if (t.c === 'ptr' && !t.box || t.c === 'cstr') {
        // p++ pe pointer (tablou/șir): avansăm vederea
        if (e.prefix) return { c: '(' + a.c + ' = R.padd(' + a.c + ', ' + op + '1))', t };
        const v = this.tmp();
        this.staticeLocale.push(v);
        return { c: '(' + v + ' = ' + a.c + ', ' + a.c + ' = R.padd(' + a.c + ', ' + op + '1), ' + v + ')', t };
      }
      if (esteReal(t) || t.c === 'unk' || (t.c === 'int' && t.b === 32 && !t.u) || a.inTablouTipizat) {
        return { c: e.prefix ? e.op + a.c : a.c + e.op, t: t.c === 'unk' ? T.i32 : t };
      }
      if (t.c === 'int' || t.c === 'char' || t.c === 'enum') {
        if (e.prefix) return { c: '(' + a.c + ' = ' + inf(t, a.c + ' ' + op + ' 1') + ')', t };
        return { c: '((' + a.c + ' = ' + inf(t, a.c + ' ' + op + ' 1') + '), ' + inf(t, a.c + (op === '+' ? ' - 1' : ' + 1')) + ')', t };
      }
      if (t.c === 'bool') return { c: '(' + a.c + ' = true)', t };
      this.eroare('++/-- nu se poate aplica tipului ' + numeTip(t), e);
    }
    exprBin(e) {
      const a = this.expr(e.st), b = this.expr(e.dr);
      const op = e.op;
      // șiruri
      if (op === '+' && (a.t.c === 'String' || b.t.c === 'String')) {
        const sa = this.conversie(T.String, a, e).c, sb = this.conversie(T.String, b, e).c;
        return { c: '(' + sa + ' + ' + sb + ')', t: T.String };
      }
      if ((op === '==' || op === '!=' || op === '<' || op === '>' || op === '<=' || op === '>=') && (a.t.c === 'String' || b.t.c === 'String')) {
        const sa = this.conversie(T.String, a, e).c, sb = this.conversie(T.String, b, e).c;
        const jsop = op === '==' ? '===' : op === '!=' ? '!==' : op;
        return { c: '(' + sa + ' ' + jsop + ' ' + sb + ')', t: T.bool };
      }
      if (op === '+' && a.t.c === 'cstr' && b.t.c === 'cstr') this.eroare('Nu poți aduna două texte între ghilimele în C++ — folosește String("...") + "..."', e);
      if ((op === '+' || op === '-') && (a.t.c === 'cstr' || (a.t.c === 'ptr' && !a.t.box) || (a.t.c === 'arr' && op === '+')) && esteInt(b.t)) {
        if (a.t.c === 'cstr' && a.lit !== undefined) this.avertizeaza('„"' + a.lit.slice(0, 20) + '" + număr” nu lipește textul în C++: mută începutul textului. Folosește String("...") + număr', e);
        return { c: 'R.padd(' + a.c + ', ' + (op === '-' ? '-' : '') + '(' + b.c + '))', t: a.t.c === 'arr' ? { c: 'ptr', el: a.t.el } : a.t };
      }
      if (op === '+' && esteInt(a.t) && b.t.c === 'cstr' && b.lit !== undefined) {
        this.avertizeaza('„număr + "text"” nu lipește textul în C++. Folosește String(număr) + "text"', e);
        return { c: 'R.padd(' + b.c + ', ' + a.c + ')', t: T.cstr };
      }
      // operatori definiți de clasele bibliotecilor (ex. CRGB + CRGB, CRGB * 2)
      if (!['==', '!=', '<', '>', '<=', '>=', '&&', '||'].includes(op)) {
        const clsOp = [a, b].map(x => x.t.c === 'obj' && !x.t.user ? this.api.clase[x.t.cls] : null).find(c => c && c.__op);
        if (clsOp) {
          const numeCls = a.t.c === 'obj' && !a.t.user && this.api.clase[a.t.cls] === clsOp ? a.t.cls : b.t.cls;
          // tipul rezultatului poate fi altă clasă (ex. DateTime − DateTime = TimeSpan)
          const rez = clsOp.__tipOp ? clsOp.__tipOp(op, a.t.cls, b.t.cls) || numeCls : numeCls;
          this.folosite.c.add(numeCls);
          return { c: 'C.' + numeCls + '.__op(' + JSON.stringify(op) + ', ' + a.c + ', ' + b.c + ')', t: { c: 'obj', cls: rez, user: false } };
        }
      }
      const cv = (a.cv !== undefined && b.cv !== undefined) ? this.constanta(e) : undefined;
      if (['==', '!=', '<', '>', '<=', '>='].includes(op)) {
        let jsop = op;
        if (op === '==' || op === '!=') {
          const clsEgal = (x) => x.t.c === 'obj' && !x.t.user && this.api.clase[x.t.cls] && this.api.clase[x.t.cls].prototype && typeof this.api.clase[x.t.cls].prototype.egal === 'function';
          if (clsEgal(a)) return { c: (op === '!=' ? '!' : '') + 'R.egal(' + a.c + ', ' + b.c + ')', t: T.bool };
          if (clsEgal(b)) return { c: (op === '!=' ? '!' : '') + 'R.egal(' + b.c + ', ' + a.c + ')', t: T.bool };
          const mix = a.t.c === 'bool' || b.t.c === 'bool';
          jsop = mix ? op : (op === '==' ? '===' : '!==');
          if ((a.t.c === 'cstr' || b.t.c === 'cstr') && (a.lit !== undefined || b.lit !== undefined) && a.t.c !== 'String' && b.t.c !== 'String') {
            this.avertizeaza('Compararea textelor cu == compară adrese în C++; folosește strcmp() sau String', e);
            return { c: '(R.txt(' + a.c + ') ' + jsop + ' R.txt(' + b.c + '))', t: T.bool };
          }
          if (a.t.c === 'obj' && !a.t.user && b.t.c === 'obj' && !b.t.user) return { c: (op === '!=' ? '!' : '') + 'R.egal(' + a.c + ', ' + b.c + ')', t: T.bool };
        }
        // comparație între semnat și nesemnat: în C, int negativ devine uriaș
        if (esteIntStrict(a.t) && esteIntStrict(b.t) && a.t.c === 'int' && b.t.c === 'int' && a.t.b === 32 && b.t.b === 32 && a.t.u !== b.t.u && (op !== '==' && op !== '!=')) {
          const ca = a.t.u ? a.c : '((' + a.c + ') >>> 0)', cb = b.t.u ? b.c : '((' + b.c + ') >>> 0)';
          if ((a.cv !== undefined && a.cv >= 0) || (b.cv !== undefined && b.cv >= 0)) return { c: '(' + a.c + ' ' + jsop + ' ' + b.c + ')', t: T.bool, cv };
          return { c: '(' + ca + ' ' + jsop + ' ' + cb + ')', t: T.bool, cv };
        }
        return { c: '(' + a.c + ' ' + jsop + ' ' + b.c + ')', t: T.bool, cv };
      }
      if (!esteNumeric(a.t) && a.t.c !== 'unk' || !esteNumeric(b.t) && b.t.c !== 'unk') {
        if (a.t.c === 'unk' || b.t.c === 'unk') { /* tip necunoscut: lăsăm JS să decidă */ }
        else this.eroare('Operatorul „' + op + '” nu se poate aplica între ' + numeTip(a.t) + ' și ' + numeTip(b.t), e);
      }
      const t = (a.t.c === 'unk' || b.t.c === 'unk') ? (esteReal(a.t) || esteReal(b.t) ? T.double : T.unk) : tipAritmetic(a.t, b.t, this.platforma);
      const real = esteReal(t);
      const cvr = cv !== undefined && cv !== null ? cv : undefined;
      const f32 = real && t.b === 32;
      switch (op) {
        case '+': case '-':
          if (f32) return { c: 'Math.fround(' + a.c + ' ' + op + ' ' + b.c + ')', t, cv: cvr };
          if (real || t.c === 'unk') return { c: '(' + a.c + ' ' + op + ' ' + b.c + ')', t, cv: cvr };
          return { c: inf(t, a.c + ' ' + op + ' ' + b.c), t, cv: cvr };
        case '*':
          if (f32) return { c: 'Math.fround(' + a.c + ' * ' + b.c + ')', t, cv: cvr };
          if (real || t.c === 'unk') return { c: '(' + a.c + ' * ' + b.c + ')', t, cv: cvr };
          if (t.b === 32) return { c: t.u ? '(Math.imul(' + a.c + ', ' + b.c + ') >>> 0)' : 'Math.imul(' + a.c + ', ' + b.c + ')', t, cv: cvr };
          return { c: inf(t, a.c + ' * ' + b.c), t, cv: cvr };
        case '/':
          if (f32) return { c: 'Math.fround(' + a.c + ' / ' + b.c + ')', t, cv: cvr };
          if (real) return { c: '(' + a.c + ' / ' + b.c + ')', t, cv: cvr };
          if (t.c === 'unk') return { c: 'R.impartire(' + a.c + ', ' + b.c + ')', t, cv: cvr };
          return { c: inf(t, 'R.div(' + a.c + ', ' + b.c + ')'), t, cv: cvr };
        case '%':
          if (real) this.eroare('Operatorul % nu merge cu numere reale (float/double) — folosește fmod()', e);
          return { c: inf(t, 'R.mod(' + a.c + ', ' + b.c + ')'), t: t.c === 'unk' ? T.i32 : t, cv: cvr };
        case '<<':
          if (real) this.eroare('Operatorul << nu merge cu numere reale', e);
          if (t.b === 64 || (a.t.b === 64)) return { c: 'R.shl64(' + a.c + ', ' + b.c + ')', t: a.t.b === 64 ? a.t : t };
          return { c: inf(tipAritmetic(a.t, T.i32, this.platforma), a.c + ' << ' + b.c), t: tipAritmetic(a.t, T.i32, this.platforma), cv: cvr };
        case '>>': {
          if (real) this.eroare('Operatorul >> nu merge cu numere reale', e);
          const ta = tipAritmetic(a.t, T.i32, this.platforma);
          if (ta.b === 64) return { c: 'R.shr64(' + a.c + ', ' + b.c + ')', t: ta };
          return { c: ta.u ? '((' + a.c + ') >>> ' + b.c + ')' : '((' + a.c + ') >> ' + b.c + ')', t: ta, cv: cvr };
        }
        case '&': case '|': case '^':
          if (real) this.eroare('Operatorul ' + op + ' nu merge cu numere reale', e);
          if (t.b === 64) return { c: 'R.bit64("' + op + '", ' + a.c + ', ' + b.c + ')', t };
          return { c: inf(t, a.c + ' ' + op + ' ' + b.c), t: t.c === 'unk' ? T.i32 : t, cv: cvr };
      }
      this.eroare('Operator necunoscut ' + op, e);
    }
    exprAtrib(e) {
      const tinta = e.tinta;
      const a0 = this.expr(tinta);
      const a = a0.scrie ? Object.assign({}, a0, { c: a0.scrie }) : a0;
      if (!a.lv) {
        if (a.fnRef || a.apiObj) this.eroare('Nu poți atribui o valoare acestui nume', e);
        if (!(a.t && a.t.c === 'unk')) this.eroare('Partea stângă a lui „' + e.op + '” trebuie să fie o variabilă', e);
      }
      if (a.sim && a.sim.const) this.eroare('„' + (tinta.nume || '') + '” este constantă și nu poate fi modificată', e);
      if (a0.apiIndex) {
        const ai = a0.apiIndex;
        if (e.op === '=') { const v = this.expr(e.val); return { c: ai.obj + '.__setIndex(' + ai.idx + ', ' + (v.t.c === 'char' ? 'String.fromCharCode(' + v.c + ')' : v.c) + ')', t: a0.t }; }
        const bin = this.exprBin({ k: 'Bin', op: e.op.slice(0, -1), st: tinta, dr: e.val, l: e.l, c: e.c });
        return { c: ai.obj + '.__setIndex(' + ai.idx + ', ' + bin.c + ')', t: a0.t };
      }
      const t = a.t;
      // s[i] = 'c' pe String
      if (a.stringIndex) {
        const v = this.expr(e.val);
        if (e.op !== '=') this.eroare('Doar = e suportat pe caracterele unui String', e);
        return { c: '(' + a.stringIndex.obj + ' = R.setChar(' + a.stringIndex.obj + ', ' + a.stringIndex.idx + ', ' + v.c + '))', t: T.char };
      }
      if (e.op === '=') {
        if (e.val.k === 'ListaInit') return { c: '(' + a.c + ' = ' + this.initValoare(t, e.val) + ')', t };
        const v = this.expr(e.val);
        if (a.inTablouTipizat && esteNumeric(v.t)) return { c: '(' + a.c + ' = ' + (v.t.c === 'bool' ? '+(' + v.c + ')' : v.c) + ')', t };
        if (t.c === 'arr') {
          if (t.el.c === 'char' && (v.t.c === 'cstr')) this.eroare('Nu poți atribui un text unui tablou char cu = — folosește strcpy()', e);
          this.eroare('Tablourile nu se pot atribui direct în C++', e);
        }
        const conv = this.conversie(t, v, e.val);
        return { c: '(' + a.c + ' = ' + conv.c + ')', t };
      }
      const opb = e.op.slice(0, -1);
      const v = this.expr(e.val);
      if (t.c === 'String') {
        if (opb !== '+') this.eroare('Pe String merge doar +=', e);
        return { c: '(' + a.c + ' += ' + this.conversie(T.String, v, e.val).c + ')', t };
      }
      if (t.c === 'ptr' || t.c === 'cstr') {
        if (opb === '+' || opb === '-') return { c: '(' + a.c + ' = R.padd(' + a.c + ', ' + (opb === '-' ? '-' : '') + '(' + v.c + ')))', t };
      }
      if (a.inTablouTipizat) {
        if (opb === '%' ) return { c: '(' + a.c + ' = R.mod(' + a.c + ', ' + v.c + '))', t };
        if (opb === '/' && esteInt(t) && esteInt(v.t)) return { c: '(' + a.c + ' = R.div(' + a.c + ', ' + v.c + '))', t };
        return { c: '(' + a.c + ' ' + e.op + ' ' + v.c + ')', t };
      }
      // x op= y  -> x = conv(x op y)
      const bin = this.exprBin({ k: 'Bin', op: opb, st: tinta, dr: e.val, l: e.l, c: e.c });
      const conv = this.conversie(t, bin, e);
      if (/[()[\]]/.test(a.c) && /\(/.test(a.c.replace(/^[\w.$]+/, ''))) {
        // ținta conține apeluri (efecte secundare) — acceptăm dubla evaluare doar pentru indecși simpli
      }
      return { c: '(' + a.c + ' = ' + conv.c + ')', t };
    }
    exprCast(e) {
      const t = this.tipDin(e.tip, e.tip.ptr);
      const a = this.expr(e.arg);
      if (t.c === 'void') return { c: '(' + a.c + ', undefined)', t: T.void };
      if (t.c === 'String') return this.conversie(T.String, a, e);
      if (t.c === 'cstr') {
        if (a.t.c === 'obj' && !a.t.user && this.api.clase[a.t.cls] && this.api.clase[a.t.cls].prototype.__cstr) return { c: a.c + '.__cstr()', t: T.cstr };
        return { c: a.c, t: T.cstr };
      }
      if (t.c === 'ptr') {
        // (uint8_t*)&struct — serializare; păstrăm referința
        return { c: a.adresa && a.t.c === 'obj' ? 'R.octeti(' + a.c + ')' : a.c, t: a.t.c === 'arr' ? { c: 'ptr', el: t.el } : t };
      }
      if (esteNumeric(t)) {
        if (a.t.c === 'String' || a.t.c === 'cstr') this.eroare('Conversie invalidă din text în ' + numeTip(t), e);
        if (a.t.c === 'unk' && t.c === 'int' && t.b === 32 && !t.u) return { c: '((' + a.c + ') | 0)', t };
        if (esteReal(t)) return { c: t.b === 32 && esteReal(a.t) && a.t.b === 64 ? 'Math.fround(' + a.c + ')' : '(+(' + a.c + '))', t, cv: a.cv };
        return { c: inf(t, a.c), t, cv: a.cv !== undefined ? Math.trunc(a.cv) : undefined };
      }
      if (t.c === 'bool') return a.t.c === 'obj' && !a.t.user ? { c: 'R.adev(' + a.c + ')', t } : { c: '!!(' + a.c + ')', t };
      return { c: a.c, t };
    }
    exprIndex(e) {
      const o = this.expr(e.obj);
      const i = this.expr(e.idx);
      if (i.t.c === 'String') this.eroare('Indexul unui tablou trebuie să fie număr', e);
      const t = o.t;
      if (t.c === 'String') {
        return { c: 'R.ci(' + o.c + ', ' + i.c + ')', t: T.char, lv: o.lv, stringIndex: { obj: o.c, idx: i.c } };
      }
      if (t.c === 'cstr') return { c: 'R.ci(' + o.c + ', ' + i.c + ')', scrie: o.c + '[' + i.c + ']', t: T.char, lv: true, inTablouTipizat: true, cstrIndex: true };
      if (t.c === 'arr') {
        const el = t.dims.length > 1 ? { c: 'arr', el: t.el, dims: t.dims.slice(1) } : t.el;
        const tipizat = t.dims.length === 1 && !!this.constructorTablou(t.el);
        return { c: o.c + '[' + i.c + ']', t: el, lv: true, inTablouTipizat: tipizat };
      }
      if (t.c === 'ptr') {
        if (t.box) return { c: o.c + '.v', t: t.el, lv: true };
        return { c: o.c + '[' + i.c + ']', t: t.el, lv: true, inTablouTipizat: !!this.constructorTablou(t.el) };
      }
      if (t.c === 'vector') return { c: o.c + '[' + i.c + ']', t: t.el, lv: true, inTablouTipizat: false };
      if (t.c === 'map') return { c: 'R.hartaCheie(' + o.c + ', ' + i.c + ')', t: t.v, lv: false };
      const clsApi = t.c === 'obj' && !t.user ? this.api.clase[t.cls] : null;
      if (clsApi && clsApi.prototype && clsApi.prototype.__index) {
        const tIdx = { c: 'obj', cls: clsApi.tipIndex || t.cls, user: false };
        return { c: o.c + '.__index(' + i.c + ')', t: tIdx, lv: true, apiIndex: { obj: o.c, idx: i.c } };
      }
      return { c: o.c + '[' + i.c + ']', t: T.unk, lv: true };
    }
    exprMembru(e) {
      const o = this.expr(e.obj);
      const t = o.t;
      const n = e.nume;
      if (t.c === 'obj' && t.user) {
        let cls = t.cls;
        while (cls) {
          const info = this.clase.get(cls);
          if (info.campuri.has(n)) {
            const c = info.campuri.get(n);
            if (c.static) return { c: this.jsClasa(cls) + '.' + c.js, t: c.t, lv: true };
            return { c: o.c + '.' + c.js, t: c.t, lv: true };
          }
          if (info.metode.has(n)) return { c: o.c + '.' + info.metode.get(n)[0].js + '.bind(' + o.c + ')', t: { c: 'fn' }, fnRef: true };
          cls = info.baza;
        }
        this.eroare('„' + t.cls + '” nu are membrul „' + n + '”', e);
      }
      if (t.c === 'String' || t.c === 'cstr') this.eroare('Pentru String folosește .' + n + '() cu paranteze', e);
      // proprietate pe obiect de bibliotecă sau necunoscut
      return { c: o.c + '.' + n, t: this.tipProprietateApi(t, n), lv: true };
    }
    tipProprietateApi(t, n) {
      if (t.c === 'obj' && !t.user) {
        const cls = this.api.clase[t.cls];
        if (cls && cls.proprietati && cls.proprietati[n]) return this.tipDinText(cls.proprietati[n]);
      }
      return T.unk;
    }
    tipDinText(s) {
      if (!s) return T.unk;
      if (typeof s !== 'string') return s;
      if (s.endsWith('[]')) return { c: 'arr', el: this.tipDinText(s.slice(0, -2)), dims: [null] };
      if (s === 'cstr') return T.cstr;
      if (s.startsWith('obj:')) return { c: 'obj', cls: s.slice(4), user: false };
      const fara = s.replace(/\s*\*$/, '');
      if (this.api.clase[fara]) return { c: 'obj', cls: fara, user: false, ptrObj: fara !== s || !!this.api.clase[fara].esteHandle };
      return tipBaza(s, this.platforma) || T.unk;
    }

    // ---------- apeluri ----------
    alegeSupraincarcare(variante, args, nod, nume) {
      if (variante.length === 1) return 0;
      const tipArg = args.map(a => a.k === 'ListaInit' ? T.unk : this.tipAproximativ(a));
      let best = -1, bestScor = -1;
      variante.forEach((v, i) => {
        const params = v.params.filter(p => !p.variadic);
        const necesare = params.filter(p => !p.implicit).length;
        if (args.length < necesare || args.length > params.length) return;
        let scor = 1;
        args.forEach((a, k) => {
          const tp = this.tipDin(params[k].tip, params[k].ptr - (params[k].tip.ptr || 0), params[k].dim);
          const ta = tipArg[k];
          if (!ta || ta.c === 'unk') { scor += 1; return; }
          if (tp.c === ta.c) scor += 4;
          else if (esteNumeric(tp) && esteNumeric(ta)) scor += esteReal(tp) === esteReal(ta) ? 3 : 2;
          else if (esteText(tp) && esteText(ta)) scor += 3;
          else if (tp.c === 'arr' && ta.c === 'arr') scor += 3;
          else if (tp.c === 'cstr' && ta.c === 'arr') scor += 3;
          else scor += 0;
        });
        if (scor > bestScor) { bestScor = scor; best = i; }
      });
      if (best < 0) this.eroare('Nicio variantă a lui „' + (nume || '?') + '” nu primește ' + args.length + ' argumente', nod);
      return best;
    }
    tipAproximativ(a) {
      try {
        // generăm expresia într-un context izolat doar pentru tip
        const salvare = this.avertismente.length, sc = this.contor, st = this.staticeLocale.length;
        const r = this.expr(a);
        this.avertismente.length = salvare; this.contor = sc; this.staticeLocale.length = st;
        return r.t;
      } catch (x) { return T.unk; }
    }
    argumente(params, args, nod) {
      const rez = [];
      const ps = params.filter(p => !p.variadic);
      args.forEach((a, i) => {
        const p = ps[i];
        if (!p) { rez.push(this.expr(a).c); return; }
        const t = this.tipDin(p.tip, p.ptr - (p.tip.ptr || 0), p.dim);
        const refScalar = p.ref && !p.tip.const && (esteNumeric(t) || t.c === 'String' || t.c === 'bool' || t.c === 'cstr' || t.c === 'enum');
        if (refScalar) {
          const e = this.expr(a);
          if (!e.lv) this.eroare('Argumentul ' + (i + 1) + ' trebuie să fie o variabilă (parametrul e transmis prin referință &)', a);
          if (e.sim && e.sim.refBox) { rez.push(e.c.replace(/\.v$/, '')); return; }
          rez.push('R.ref(() => ' + e.c + ', (_v) => ' + e.c + ' = _v)');
          return;
        }
        if (a.k === 'ListaInit') { rez.push(this.initValoare(t, a)); return; }
        const e = this.expr(a);
        if (t.c === 'fn') { rez.push(e.c); return; }
        if (t.c === 'arr' || t.c === 'ptr') {
          if (e.t.c === 'String') this.eroare('Argumentul ' + (i + 1) + ': String nu se poate transmite ca tablou — folosește .c_str()', a);
          rez.push(e.c); return;
        }
        if (t.c === 'obj' && p.ref) { rez.push(e.c); return; }
        rez.push(this.conversie(t, e, a).c);
      });
      return rez;
    }
    exprApel(e) {
      const fn = e.fn;
      // --- funcții ale utilizatorului / metode ale clasei curente
      if (fn.k === 'Id') {
        const n = fn.nume;
        const s = this.cauta(n);
        if (s && s.tip === 'fn') {
          const lst = this.functiiUser.get(n);
          const idx = this.alegeSupraincarcare(lst, e.args, e, n);
          const f = lst[idx];
          return { c: '(yield* ' + f.js + '(' + this.argumente(f.params, e.args, e).join(', ') + '))', t: f.ret, lv: f.ret.c === 'obj' };
        }
        if (s && s.tip === 'metoda') {
          const idx = this.alegeSupraincarcare(s.supra.map(m => ({ params: m.nod.params })), e.args, e, n);
          const m = s.supra[idx];
          const tinta = m.static ? this.jsClasa(s.cls) : 'this';
          return { c: '(yield* ' + tinta + '.' + m.js + '(' + this.argumente(m.nod.params, e.args, e).join(', ') + '))', t: m.ret };
        }
        if (s && (s.tip === 'var' || s.tip === 'camp')) {
          const v = this.expr(fn);
          if (v.t.c === 'obj' && !v.t.user) {
            // obiect apelabil (ex. std::function stocat) — rar
            return { c: '(yield* R.apeleaza(' + v.c + ', [' + e.args.map(x => this.expr(x).c).join(', ') + ']))', t: T.unk };
          }
          return { c: '(yield* R.apeleaza(' + v.c + ', [' + e.args.map(x => this.argumentApi(x)).join(', ') + ']))', t: v.t.ret || T.unk };
        }
        // conversii funcționale: int(x), float(x), String(x), byte(x)...
        const tb = tipBaza(n, this.platforma);
        if (tb && n !== 'auto') {
          if (n === 'String') return this.apelString(e.args, e);
          if (e.args.length !== 1) this.eroare(n + '() primește un singur argument', e);
          return this.exprCast({ k: 'Cast', tip: { baza: n, ptr: 0 }, arg: e.args[0], l: e.l });
        }
        if (this.tipdef.has(n) && e.args.length === 1 && esteNumeric(this.tipdef.get(n).t)) {
          return this.exprCast({ k: 'Cast', tip: { baza: n, ptr: 0 }, arg: e.args[0], l: e.l });
        }
        // tipuri numerice din biblioteci (enum-uri ca i2s_mode_t): i2s_mode_t(I2S_MODE_MASTER | I2S_MODE_TX)
        if (this.api.tipuriNumerice && this.api.tipuriNumerice[n] && e.args.length === 1 && !(s && s.tip === 'fn')) {
          return this.exprCast({ k: 'Cast', tip: { baza: n, ptr: 0 }, arg: e.args[0], l: e.l });
        }
        // constructor temporar: Punct(1,2)
        if (this.clase.has(n)) return { c: this.construieste({ c: 'obj', cls: n, user: true }, e.args, e), t: { c: 'obj', cls: n, user: true } };
        if (this.api.clase[n] && !this.api.functii[n]) return { c: this.construieste({ c: 'obj', cls: n, user: false }, e.args, e), t: { c: 'obj', cls: n, user: false } };
        // funcții speciale la compilare
        const special = this.apelSpecial(n, e);
        if (special) return special;
        // funcții de bibliotecă
        if (this.api.functii[n]) return this.apelApi(n, e);
        this.eroare('Funcția „' + n + '” nu a fost declarată' + this.sugestie(n), e);
      }
      if (fn.k === 'Scop') {
        const v = this.valoareScop(fn, false);
        if (v && v.statica) return { c: '(yield* ' + v.c + '(' + this.argumente(v.statica.nod.params, e.args, e).join(', ') + '))', t: v.statica.ret };
        if (v && v.apiStatic) {
          const cod = v.c + '(' + e.args.map(a => this.argumentApi(a)).join(', ') + ')';
          return { c: v.apiStatic.gen ? '(yield* ' + cod + ')' : cod, t: this.tipDinText(v.apiStatic.ret) };
        }
        if (v && v.apiFn) return this.apelApi(v.apiFn, e);
        if (fn.stanga.k === 'Id' && (fn.stanga.nume === 'std' || fn.stanga.nume === 'Serial')) {
          const special = this.apelSpecial(fn.nume, e);
          if (special) return special;
          if (this.api.functii[fn.nume]) return this.apelApi(fn.nume, e);
        }
        if (v && v.t && v.t.c === 'clasa') return { c: this.construieste({ c: 'obj', cls: v.t.cls, user: !!v.t.user }, e.args, e), t: { c: 'obj', cls: v.t.cls, user: !!v.t.user } };
        this.eroare('Nu recunosc funcția ' + (fn.stanga.nume || '') + '::' + fn.nume, e);
      }
      if (fn.k === 'Membru') return this.apelMetoda(fn, e);
      // apel prin pointer la funcție / lambda
      const f = this.expr(fn);
      return { c: '(yield* R.apeleaza(' + f.c + ', [' + e.args.map(x => this.argumentApi(x)).join(', ') + ']))', t: T.unk };
    }
    apelString(args, nod) {
      if (args.length === 0) return { c: '""', t: T.String };
      const a = this.expr(args[0]);
      if (args.length === 1) return this.conversie(T.String, a, nod);
      const b = this.expr(args[1]);
      return { c: 'R.S(' + a.c + ', ' + b.c + ', "' + tag(a.t) + '")', t: T.String };
    }
    apelSpecial(n, e) {
      const args = e.args;
      switch (n) {
        case 'F': case 'PSTR': case 'FPSTR': case 'PGM_P':
          if (args.length !== 1) this.eroare(n + '() primește un argument', e);
          return this.expr(args[0]);
        case 'min': case 'max': {
          if (args.length !== 2) this.eroare(n + '() primește două argumente', e);
          const a = this.expr(args[0]), b = this.expr(args[1]);
          const t = tipAritmetic(a.t, b.t, this.platforma);
          return { c: 'Math.' + n + '(' + a.c + ', ' + b.c + ')', t };
        }
        case 'abs': case 'fabs': case 'labs': {
          const a = this.expr(args[0]);
          return { c: 'Math.abs(' + a.c + ')', t: n === 'fabs' ? T.double : (esteReal(a.t) ? a.t : a.t.c === 'int' ? a.t : T.i32) };
        }
        case 'sizeof': return null;
        case 'swap': {
          const a = this.expr(args[0]), b = this.expr(args[1]);
          const tmp = this.tmp(); this.staticeLocale.push(tmp);
          return { c: '(' + tmp + ' = ' + a.c + ', ' + a.c + ' = ' + b.c + ', ' + b.c + ' = ' + tmp + ', undefined)', t: T.void };
        }
        case 'constrain': {
          const a = this.expr(args[0]), lo = this.expr(args[1]), hi = this.expr(args[2]);
          const t = tipAritmetic(tipAritmetic(a.t, lo.t, this.platforma), hi.t, this.platforma);
          return { c: 'R.constrain(' + a.c + ', ' + lo.c + ', ' + hi.c + ')', t };
        }
        case 'bitRead': return { c: '(((' + this.expr(args[0]).c + ') >>> (' + this.expr(args[1]).c + ')) & 1)', t: T.i32 };
        case 'bit': return { c: '(1 << (' + this.expr(args[0]).c + '))', t: T.u32 };
        case 'bitSet': case 'bitClear': case 'bitWrite': case 'bitToggle': {
          const a = this.expr(args[0]);
          const b = this.expr(args[1]);
          let v;
          if (n === 'bitSet') v = a.c + ' | (1 << ' + b.c + ')';
          else if (n === 'bitClear') v = a.c + ' & ~(1 << ' + b.c + ')';
          else if (n === 'bitToggle') v = a.c + ' ^ (1 << ' + b.c + ')';
          else v = '(' + this.expr(args[2]).c + ') ? (' + a.c + ' | (1 << ' + b.c + ')) : (' + a.c + ' & ~(1 << ' + b.c + '))';
          return { c: '(' + a.c + ' = ' + inf(a.t.c === 'unk' ? T.i32 : a.t, v) + ')', t: a.t };
        }
        case 'lowByte': return { c: '((' + this.expr(args[0]).c + ') & 255)', t: T.u8 };
        case 'highByte': return { c: '(((' + this.expr(args[0]).c + ') >> 8) & 255)', t: T.u8 };
        case 'makeWord': return { c: '((((' + this.expr(args[0]).c + ') & 255) << 8) | ((' + this.expr(args[1]).c + ') & 255))', t: T.u16 };
        case 'digitalPinToInterrupt': return this.expr(args[0]);
        case 'pdMS_TO_TICKS': return this.expr(args[0]);
        case 'ESP_LOGI': case 'ESP_LOGE': case 'ESP_LOGW': case 'ESP_LOGD': case 'ESP_LOGV': case 'log_i': case 'log_e': case 'log_w': case 'log_d':
          return { c: 'F.__log(' + JSON.stringify(n) + ', ' + args.map(a => this.expr(a).c).join(', ') + ')', t: T.void };
      }
      return null;
    }
    apelApi(n, e) {
      const f = this.api.functii[n];
      this.folosite.f.add(n);
      const args = e.args.map((a, i) => {
        if (f.refString && f.refString.includes(i)) {
          const x = this.expr(a);
          if (x.t.c === 'String' && x.lv) return 'R.ref(() => ' + x.c + ', (_v) => ' + x.c + ' = _v)';
        }
        return this.argumentApi(a);
      });
      let tRet = this.tipDinText(f.ret);
      if (f.tagArg) {
        // funcții care formatează după tip (String, print)
        const tipuri = e.args.map(a => this.tipAproximativ(a));
        args.push('"' + tipuri.map(tag).join('') + '"');
      }
      if (n === 'map' && e.args.length === 5) {
        const ts = e.args.map(a => this.tipAproximativ(a));
        if (ts.some(esteReal)) { tRet = T.double; args.push('true'); }
      }
      const gen = f.constructor && f.constructor.name === 'GeneratorFunction';
      const cod = 'F.' + n + '(' + args.join(', ') + ')';
      return { c: gen ? '(yield* ' + cod + ')' : cod, t: tRet };
    }
    apelMetoda(fn, e) {
      const o = this.expr(fn.obj);
      const t = o.t;
      const n = fn.nume;
      // String
      if (t.c === 'String' || (t.c === 'cstr' && n === 'c_str')) return this.metodaString(o, n, e);
      if (t.c === 'arr' && t.el.c === 'char' && ['length', 'c_str'].includes(n)) this.eroare('Tablourile char nu au metoda .' + n + '() — folosește strlen()', e);
      if (t.c === 'vector') return this.metodaVector(o, n, e);
      if (t.c === 'map') return this.metodaVector(o, n, e);
      // clase utilizator
      if (t.c === 'obj' && t.user) {
        let cls = t.cls;
        while (cls) {
          const info = this.clase.get(cls);
          if (info.metode.has(n)) {
            const lst = info.metode.get(n);
            const idx = this.alegeSupraincarcare(lst.map(m => ({ params: m.nod.params })), e.args, e, n);
            const m = lst[idx];
            if (!m.nod.corp && !lst.some(x => x.nod.corp)) {
              // metodă virtuală pură — se apelează implementarea din clasa derivată
            }
            return { c: '(yield* ' + o.c + '.' + m.js + '(' + this.argumente(m.nod.params, e.args, e).join(', ') + '))', t: m.ret };
          }
          if (info.campuri.has(n)) {
            const c = info.campuri.get(n);
            return { c: '(yield* R.apeleaza(' + o.c + '.' + c.js + ', [' + e.args.map(x => this.argumentApi(x)).join(', ') + ']))', t: T.unk };
          }
          cls = info.baza;
        }
        this.eroare('„' + t.cls + '” nu are metoda „' + n + '”', e);
      }
      if (t.c === 'obj' && !t.user) {
        const cls = this.api.clase[t.cls];
        if (!cls) this.eroare('Clasă necunoscută ' + t.cls, e);
        const metoda = cls.prototype[n];
        if (typeof metoda !== 'function' && !cls.dinamic) {
          this.eroare('„' + t.cls + '” nu are metoda „' + n + '”' + this.sugestieMetoda(cls, n), e);
        }
        return this.apelMetodaApi(o, cls, n, e, metoda);
      }
      if (t.c === 'int' || t.c === 'float' || t.c === 'bool' || t.c === 'char') this.eroare('Un număr (' + numeTip(t) + ') nu are metode — nu poți scrie .' + n + '()', e);
      if (t.c === 'arr') this.eroare('Tablourile nu au metoda .' + n + '()', e);
      // tip necunoscut: apel dinamic
      const args = e.args.map(a => this.argumentApi(a));
      if (n === 'print' || n === 'println') {
        const ta = e.args[0] ? this.tipAproximativ(e.args[0]) : null;
        while (args.length < 2) args.push('undefined');
        args.push('"' + tag(ta) + '"');
      }
      return { c: '(yield* R.metoda(' + o.c + ', ' + JSON.stringify(n) + ', [' + args.join(', ') + ']))', t: T.unk };
    }
    sugestieMetoda(cls, n) {
      const nume = [];
      let p = cls.prototype;
      while (p && p !== Object.prototype) { nume.push(...Object.getOwnPropertyNames(p)); p = Object.getPrototypeOf(p); }
      let best = null, bd = 3;
      for (const k of nume) {
        if (k === 'constructor' || k.startsWith('_')) continue;
        if (k.toLowerCase() === n.toLowerCase()) return ' — poate ai vrut „' + k + '”?';
        const d = distanta(n.toLowerCase(), k.toLowerCase());
        if (d < bd) { bd = d; best = k; }
      }
      return best ? ' — poate ai vrut „' + best + '”?' : '';
    }
    // argumentele de șablon (ex. addLeds<WS2812B, PIN, GRB>): numere, constante sau nume
    argumentSablon(x) {
      if (x.k === 'Num') return String(x.v);
      const k = this.constantaApi(x.nume);
      if (typeof k === 'number') return String(k);
      if (!x.nume.includes('::')) {
        const vizibil = this.scopuri.some(s => s.has(x.nume)) || this.globale.has(x.nume);
        if (vizibil) {
          try { const r = this.expr({ k: 'Id', nume: x.nume, l: x.l, c: 0 }); if (r.cv !== undefined) return String(r.cv); return r.c; } catch (err) { /* rămâne nume */ }
        }
      }
      return JSON.stringify(x.nume);
    }
    apelMetodaApi(o, cls, n, e, metoda) {
      const args = e.args.map(a => this.argumentApi(a));
      if (e.fn && e.fn.sablon) args.unshift('[' + e.fn.sablon.map(x => this.argumentSablon(x)).join(', ') + ']');
      if (n === 'print' || n === 'println') {
        const ta = e.args[0] ? this.tipAproximativ(e.args[0]) : null;
        while (args.length < 2) args.push('undefined');
        args.push('"' + tag(ta) + '"');
      } else if (cls.tagArgs && cls.tagArgs[n]) {
        const tipuri = e.args.map(a => this.tipAproximativ(a));
        args.push('"' + tipuri.map(tag).join('') + '"');
      }
      const gen = metoda && metoda.constructor && metoda.constructor.name === 'GeneratorFunction';
      const cod = o.c + '.' + n + '(' + args.join(', ') + ')';
      let tRet = cls.tipuri && cls.tipuri[n] ? this.tipDinText(cls.tipuri[n]) : T.unk;
      if (e.fn && e.fn.sablon && cls.tipSablon && cls.tipSablon[n]) tRet = this.tipDinText(cls.tipSablon[n](e.fn.sablon.map(x => x.nume !== undefined ? x.nume : String(x.v))));
      return { c: gen ? '(yield* ' + cod + ')' : cod, t: tRet };
    }
    metodaString(o, n, e) {
      const a = e.args.map(x => this.expr(x));
      const s = o.c;
      const arg = i => a[i] ? a[i].c : 'undefined';
      const argS = i => a[i] ? (a[i].t.c === 'char' ? 'String.fromCharCode(' + a[i].c + ')' : this.conversie(T.String, a[i], e).c) : '""';
      const mut = cod => {
        if (!o.lv) this.eroare('Metoda .' + n + '() modifică textul, dar aici nu e o variabilă', e);
        return { c: '(' + s + ' = ' + cod + ', undefined)', t: T.void };
      };
      switch (n) {
        case 'length': return { c: s + '.length', t: T.u32 };
        case 'c_str': return { c: s, t: T.cstr, permiteString: true };
        case 'charAt': return { c: 'R.ci(' + s + ', ' + arg(0) + ')', t: T.char };
        case 'substring': return { c: 'R.substring(' + s + ', ' + arg(0) + (a[1] ? ', ' + arg(1) : '') + ')', t: T.String };
        case 'indexOf': return { c: s + '.indexOf(' + argS(0) + (a[1] ? ', ' + arg(1) : '') + ')', t: T.i32 };
        case 'lastIndexOf': return { c: s + '.lastIndexOf(' + argS(0) + (a[1] ? ', ' + arg(1) : '') + ')', t: T.i32 };
        case 'toInt': return { c: 'R.toInt(' + s + ')', t: T.i32 };
        case 'toFloat': case 'toDouble': return { c: 'R.toFloat(' + s + ')', t: T.float };
        case 'equals': return { c: '(' + s + ' === ' + argS(0) + ')', t: T.bool };
        case 'equalsIgnoreCase': return { c: '(' + s + '.toLowerCase() === ' + argS(0) + '.toLowerCase())', t: T.bool };
        case 'startsWith': return { c: s + '.startsWith(' + argS(0) + (a[1] ? ', ' + arg(1) : '') + ')', t: T.bool };
        case 'endsWith': return { c: s + '.endsWith(' + argS(0) + ')', t: T.bool };
        case 'compareTo': return { c: 'R.compara(' + s + ', ' + argS(0) + ')', t: T.i32 };
        case 'isEmpty': return { c: '(' + s + '.length === 0)', t: T.bool };
        case 'concat': return { c: '(' + s + ' += ' + argS(0) + ', true)', t: T.bool };
        case 'reserve': return { c: 'true', t: T.bool };
        case 'trim': return mut(s + '.replace(/^[\\s]+|[\\s]+$/g, "")');
        case 'toUpperCase': return mut(s + '.toUpperCase()');
        case 'toLowerCase': return mut(s + '.toLowerCase()');
        case 'replace': return mut(s + '.split(' + argS(0) + ').join(' + argS(1) + ')');
        case 'remove': return mut('R.sterge(' + s + ', ' + arg(0) + (a[1] ? ', ' + arg(1) : '') + ')');
        case 'setCharAt': return mut('R.setChar(' + s + ', ' + arg(0) + ', ' + arg(1) + ')');
        case 'toCharArray': case 'getBytes': return { c: 'R.inTablou(' + s + ', ' + arg(0) + ', ' + arg(1) + ')', t: T.void };
        case 'isNumeric': return { c: '/^-?\\d+(\\.\\d+)?$/.test(' + s + ')', t: T.bool };
        case 'clear': return mut('""');
        case 'charCodeAt': this.eroare('String nu are metoda charCodeAt — folosește charAt()', e);
      }
      this.eroare('String nu are metoda „' + n + '”', e);
    }
    metodaVector(o, n, e) {
      const a = e.args.map(x => this.expr(x));
      const el = o.t.el || T.unk;
      const cv = i => el.c !== 'unk' && a[i] ? this.conversie(el, a[i], e).c : (a[i] ? a[i].c : 'undefined');
      switch (n) {
        case 'push_back': case 'emplace_back': return { c: o.c + '.push(' + cv(0) + ')', t: T.void };
        case 'pop_back': return { c: o.c + '.pop()', t: T.void };
        case 'size': return { c: o.c + '.length', t: T.u32 };
        case 'empty': return { c: '(' + o.c + '.length === 0)', t: T.bool };
        case 'clear': return { c: '(' + o.c + '.length = 0)', t: T.void };
        case 'at': return { c: 'R.la(' + o.c + ', ' + a[0].c + ')', t: el };
        case 'front': return { c: o.c + '[0]', t: el };
        case 'back': return { c: o.c + '[' + o.c + '.length - 1]', t: el };
        case 'resize': return { c: 'R.redim(' + o.c + ', ' + a[0].c + ', () => ' + this.valoareImplicita(el) + ')', t: T.void };
        case 'erase': return { c: 'R.stergeLa(' + o.c + ', ' + a[0].c + ')', t: T.void };
        case 'insert': return { c: 'R.insereaza(' + o.c + ', ' + a[0].c + ', ' + (a[1] ? a[1].c : 'undefined') + ')', t: T.void };
        case 'begin': return { c: '0', t: T.i32 };
        case 'end': return { c: o.c + '.length', t: T.i32 };
        case 'data': return { c: o.c, t: { c: 'ptr', el } };
        case 'count': return { c: '(R.hartaAre(' + o.c + ', ' + a[0].c + ') ? 1 : 0)', t: T.i32 };
        case 'find': return { c: 'R.hartaAre(' + o.c + ', ' + a[0].c + ')', t: T.bool };
      }
      this.eroare('std::vector nu are (încă) metoda „' + n + '” în simulare', e);
    }
  }

  function distanta(a, b) {
    if (Math.abs(a.length - b.length) > 3) return 99;
    const d = [];
    for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (let j = 0; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return d[a.length][b.length];
  }

  /* ---------- compilatorul complet ---------- */
  // Codul generat devine o funcție. Unele pagini interzic new Function (CSP fără 'unsafe-eval'):
  // atunci îl punem într-un <script> din pagină, care e permis acolo unde scripturile inline sunt permise.
  let evalBlocat = false, nrScript = 0;
  function creeazaFunctie(cod) {
    if (!evalBlocat) {
      try { return new Function('A', 'R', cod); }
      catch (x) { if (!(x instanceof EvalError) && !/unsafe-eval|Content Security|eval/i.test(String(x && x.message))) throw x; evalBlocat = true; }
    }
    if (typeof document === 'undefined') throw new Error('Pagina nu permite rularea codului generat.');
    const nume = '__mesterProgram' + (++nrScript);
    const s = document.createElement('script');
    s.textContent = 'window.' + nume + ' = function (A, R) {\n' + cod + '\n};';
    let eroare = null;
    const laEroare = (ev) => { eroare = ev.error || new Error(ev.message); };
    window.addEventListener('error', laEroare);
    document.head.appendChild(s);
    window.removeEventListener('error', laEroare);
    s.remove();
    const f = window[nume];
    delete window[nume];
    if (typeof f !== 'function') throw eroare || new Error('Pagina nu permite rularea codului generat (politica de securitate a paginii blochează scripturile).');
    return f;
  }

  M.compilator = {
    // placa: {platforma, constante, macrouri}
    compileaza(sursa, placa) {
      const api = M.api;
      const t0 = performance.now();
      const jet = M.lexer.tokenizeaza(sursa);
      const pre = M.lexer.preproceseaza(jet, Object.assign({}, api.macrouri || {}, (placa && placa.macrouri) || {}));
      const tipuriApi = new Set(Object.keys(api.clase));
      for (const [k, c] of Object.entries(api.clase)) if (c && c.sablon) tipuriApi.add(k + '<>');
      for (const k of Object.keys(api.tipuriNumerice || {})) tipuriApi.add(k);
      for (const k of Object.keys(api.tipuriTablou || {})) tipuriApi.add(k);
      const { ast, tipuri } = M.parser.analizeaza(pre.jetoane, tipuriApi);
      const g = new Generator(ast, { api, placa, tipuri });
      const cod = g.genereaza();
      let fabrica;
      try {
        fabrica = creeazaFunctie(cod);
      } catch (x) {
        const err = new E('Eroare internă la generarea codului: ' + x.message, 0, 0);
        err.codJs = cod;
        throw err;
      }
      // biblioteci incluse, pentru verificări
      const includeri = pre.includeri;
      const avertismente = pre.avertismente.concat(g.avertismente);
      for (const inc of includeri) {
        const n = inc.nume.replace(/\.h$/, '');
        if (api.includeri && !api.includeri.has(inc.nume) && !api.includeri.has(n)) {
          avertismente.push({ mesaj: 'Biblioteca <' + inc.nume + '> nu este simulată; funcțiile ei pot lipsi', linie: inc.linie });
        }
      }
      return { fabrica, cod, avertismente, includeri, durata: performance.now() - t0, folosite: g.folosite };
    }
  };
})(window.M = window.M || {});
