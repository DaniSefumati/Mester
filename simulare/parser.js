/* Meșter — analizor sintactic pentru subsetul C++ folosit în schițele Arduino.
   Produce un arbore sintactic (AST) folosit de generatorul de JavaScript. */
(function (M) {
  'use strict';
  const E = M.lexer.EroareCompilare;

  const TIPURI_DE_BAZA = new Set([
    'void', 'bool', 'boolean', 'char', 'short', 'int', 'long', 'float', 'double', 'signed', 'unsigned',
    'byte', 'word', 'String', 'size_t', 'ssize_t', 'int8_t', 'uint8_t', 'int16_t', 'uint16_t', 'int32_t', 'uint32_t',
    'int64_t', 'uint64_t', 'auto', 'wchar_t', 'char16_t', 'char32_t', 'uint', 'u8', 'u16', 'u32', 'intptr_t', 'uintptr_t',
    'time_t', 'TickType_t', 'BaseType_t', 'UBaseType_t', 'TaskHandle_t', 'QueueHandle_t', 'SemaphoreHandle_t', 'esp_err_t',
    'TimerHandle_t', 'portMUX_TYPE', 'hw_timer_t', 'IPAddress', 'uint_least8_t', 'uint_fast8_t', 'int_fast16_t', 'std'
  ]);
  const CALIFICATIVE = new Set(['const', 'volatile', 'static', 'extern', 'inline', 'constexpr', 'register', 'mutable',
    'virtual', 'explicit', 'friend', 'PROGMEM', 'IRAM_ATTR', 'ICACHE_RAM_ATTR', 'DRAM_ATTR', 'RTC_DATA_ATTR', 'RTC_NOINIT_ATTR',
    'ARDUINO_ISR_ATTR', 'typename', 'struct', 'class', 'enum', 'unsigned', 'signed', 'long', 'short', '__attribute__', 'alignas', 'thread_local']);
  const ATRIBUTE_MEMORIE = new Set(['PROGMEM', 'DRAM_ATTR', 'IRAM_ATTR', 'RTC_DATA_ATTR', 'RTC_NOINIT_ATTR', 'EXT_RAM_ATTR', 'WORD_ALIGNED_ATTR', 'ICACHE_RAM_ATTR', 'ARDUINO_ISR_ATTR']);
  const CUVINTE_CHEIE = new Set(['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return',
    'goto', 'sizeof', 'new', 'delete', 'this', 'true', 'false', 'nullptr', 'NULL', 'typedef', 'using', 'namespace', 'template',
    'try', 'catch', 'throw', 'operator', 'public', 'private', 'protected']);

  class Parser {
    constructor(jetoane, tipuriApi) {
      // spațiile de nume ale bibliotecilor ESP32 (fs::FS, fs::File) nu schimbă nimic: le sărim
      const SPATII = new Set(['fs']);
      this.j = jetoane.filter((t, i) => !(t.t === 'id' && SPATII.has(t.v) && jetoane[i + 1] && jetoane[i + 1].t === 'op' && jetoane[i + 1].v === '::') && !(t.t === 'op' && t.v === '::' && jetoane[i - 1] && jetoane[i - 1].t === 'id' && SPATII.has(jetoane[i - 1].v)));
      this.p = 0;
      this.tipuri = new Set(tipuriApi || []); // tipuri cunoscute: API + definite de utilizator
      this.sabloane = new Set(['vector', 'array', 'deque', 'list', 'map', 'pair', 'function', 'unique_ptr', 'shared_ptr']);
    }
    get t() { return this.j[this.p]; }
    uita(k) { return this.j[this.p + (k || 0)] || this.j[this.j.length - 1]; }
    este(v, k) { const t = this.uita(k); return (t.t === 'op' || t.t === 'id') && t.v === v; }
    esteOp(v, k) { const t = this.uita(k); return t.t === 'op' && t.v === v; }
    avanseaza() { return this.j[this.p++]; }
    eroare(m, t) { t = t || this.t; throw new E(m, t.l, t.c); }
    asteapta(v, context) {
      const t = this.t;
      if ((t.t === 'op' || t.t === 'id') && t.v === v) { this.p++; return t; }
      const gasit = t.t === 'eof' ? 'sfârșitul fișierului' : '„' + (t.t === 'str' ? '"' + t.v + '"' : t.v) + '”';
      let mesaj = 'Lipsește „' + v + '”' + (context ? ' ' + context : '') + ', am găsit ' + gasit;
      if (v === ';') {
        // eroarea „lipsește ;” se raportează la sfârșitul liniei anterioare, ca în Arduino IDE
        const ant = this.j[this.p - 1];
        if (ant && ant.l < t.l) throw new E("Lipsește „;” la sfârșitul liniei", ant.l, ant.c + String(ant.v).length);
      }
      this.eroare(mesaj);
    }
    optional(v) { if (this.este(v)) { this.p++; return true; } return false; }

    // --- tipuri ---
    esteNumeTip(t) {
      if (!t || t.t !== 'id') return false;
      return TIPURI_DE_BAZA.has(t.v) || this.tipuri.has(t.v);
    }
    incepeTip(k) {
      const t = this.uita(k || 0);
      if (t.t !== 'id') return false;
      if (CALIFICATIVE.has(t.v) && t.v !== 'typename') return true;
      return this.esteNumeTip(t);
    }
    sariAtribut() {
      // atribute de memorie scrise după nume: const uint8_t imagine[] PROGMEM = {...};
      if (this.t.t === 'id' && ATRIBUTE_MEMORIE.has(this.t.v)) {
        while (this.t.t === 'id' && ATRIBUTE_MEMORIE.has(this.t.v)) this.p++;
        this.sariAtribut();
        return true;
      }
      // __attribute__((...)) sau [[...]]
      if (this.este('__attribute__')) {
        this.p++; let d = 0;
        do { if (this.esteOp('(')) d++; if (this.esteOp(')')) d--; this.p++; } while (d > 0 && this.t.t !== 'eof');
        return true;
      }
      if (this.esteOp('[') && this.esteOp('[', 1)) {
        let d = 0;
        do { if (this.esteOp('[')) d++; if (this.esteOp(']')) d--; this.p++; } while (d > 0 && this.t.t !== 'eof');
        return true;
      }
      if (this.este('alignas')) { this.p++; this.asteapta('('); let d = 1; while (d > 0) { if (this.esteOp('(')) d++; if (this.esteOp(')')) d--; this.p++; } return true; }
      return false;
    }

    // Citește specificatorul de tip: calificative + tipul de bază (+ argumente de șablon)
    parseTip(permiteFaraBaza) {
      const tip = { baza: null, unsigned: false, signed: false, long: 0, short: false, const: false, static: false, volatile: false,
        ptr: 0, ref: false, sablon: null, rtc: false, l: this.t.l, c: this.t.c };
      let gasit = false;
      for (;;) {
        const t = this.t;
        if (this.sariAtribut()) continue;
        if (t.t !== 'id') break;
        if (t.v === 'const' || t.v === 'constexpr') { tip.const = true; this.p++; continue; }
        if (t.v === 'static') { tip.static = true; this.p++; continue; }
        if (t.v === 'volatile') { tip.volatile = true; this.p++; continue; }
        if (t.v === 'RTC_DATA_ATTR' || t.v === 'RTC_NOINIT_ATTR') { tip.rtc = true; this.p++; continue; }
        if (['extern', 'inline', 'register', 'mutable', 'virtual', 'explicit', 'friend', 'PROGMEM', 'IRAM_ATTR', 'ICACHE_RAM_ATTR',
          'DRAM_ATTR', 'ARDUINO_ISR_ATTR', 'typename', 'thread_local'].includes(t.v)) { this.p++; continue; }
        if (t.v === 'unsigned') { tip.unsigned = true; this.p++; gasit = true; continue; }
        if (t.v === 'signed') { tip.signed = true; this.p++; gasit = true; continue; }
        if (t.v === 'long') { tip.long++; this.p++; gasit = true; continue; }
        if (t.v === 'short') { tip.short = true; this.p++; gasit = true; continue; }
        if ((t.v === 'struct' || t.v === 'class' || t.v === 'enum') && this.uita(1).t === 'id' && !this.esteOp('{', 2)) {
          this.p++; continue; // struct Punct p;
        }
        if (tip.baza) break;
        if (t.v === 'std' && this.esteOp('::', 1)) { this.p += 2; continue; }
        if (this.esteNumeTip(t) || (this.uita(1).t === 'op' && this.uita(1).v === '::' && this.tipuri.has(t.v))) {
          tip.baza = t.v; this.p++;
          // Tip::Interior (ex. enum class în clasă) — păstrăm ultimul nume
          while (this.esteOp('::') && this.uita(1).t === 'id') { this.p++; tip.baza = this.avanseaza().v; }
          if (this.esteOp('<') && (this.sabloane.has(tip.baza) || this.tipuri.has(tip.baza + '<>'))) {
            tip.sablon = this.parseArgumenteSablon();
          }
          gasit = true;
          continue;
        }
        if (this.sabloane.has(t.v) && this.esteOp('<', 1)) {
          tip.baza = t.v; this.p++; tip.sablon = this.parseArgumenteSablon(); gasit = true; continue;
        }
        break;
      }
      if (!tip.baza) {
        if (tip.unsigned || tip.signed || tip.long || tip.short) tip.baza = 'int';
        else if (!permiteFaraBaza) this.eroare('Aștept un tip de date (ex. int, float, String), am găsit „' + this.t.v + '”');
      }
      if (tip.baza === 'char' && tip.unsigned) { tip.baza = 'uint8_t'; tip.unsigned = false; }
      if (tip.baza === 'char' && tip.signed) { tip.baza = 'int8_t'; tip.signed = false; }
      if (tip.baza === 'int' && tip.unsigned && tip.long >= 2) { tip.baza = 'uint64_t'; }
      else if (tip.baza === 'int' && tip.long >= 2) { tip.baza = 'int64_t'; }
      else if (tip.baza === 'int' && tip.unsigned && tip.short) { tip.baza = 'uint16_t'; }
      else if (tip.baza === 'int' && tip.short) { tip.baza = 'int16_t'; }
      else if (tip.baza === 'int' && tip.unsigned && tip.long) { tip.baza = 'unsigned long'; }
      else if (tip.baza === 'int' && tip.long) { tip.baza = 'long'; }
      else if (tip.baza === 'int' && tip.unsigned) { tip.baza = 'unsigned int'; }
      else if (tip.baza === 'double' && tip.long) { tip.baza = 'double'; }
      // const după tip / pointeri
      for (;;) {
        if (this.este('const')) { this.p++; tip.const = true; continue; }
        if (this.este('volatile')) { this.p++; continue; }
        if (this.esteOp('*') && !this.declaratorUrmeazaFunctieCallback()) { tip.ptr++; this.p++; continue; }
        break;
      }
      return tip;
    }
    declaratorUrmeazaFunctieCallback() { return false; }
    // după „nume” vine <argumente>( ? (metodă-șablon, ex. doc["t"].as<float>()), nu o comparație „x.to < y”
    sablonMetodaUrmeaza() {
      let k = 1;
      for (;;) {
        const x = this.uita(k);
        if (!x || x.t === 'eof') return false;
        if (x.t === 'op' && x.v === '>') { const u = this.uita(k + 1); return !!u && u.t === 'op' && u.v === '('; }
        if (x.t === 'id' || x.t === 'num' || (x.t === 'op' && (x.v === '::' || x.v === '*' || x.v === ','))) { k++; continue; }
        return false;
      }
    }
    parseArgumenteSablon() {
      this.asteapta('<');
      const arg = [];
      while (!this.esteOp('>') && this.t.t !== 'eof') {
        if (this.esteOp('>>')) { // vector<vector<int>>
          this.j.splice(this.p, 1, { t: 'op', v: '>', l: this.t.l, c: this.t.c }, { t: 'op', v: '>', l: this.t.l, c: this.t.c + 1 });
          break;
        }
        if (this.t.t === 'num' && (this.esteOp(',', 1) || this.esteOp('>', 1) || this.esteOp('>>', 1))) { arg.push({ numar: this.avanseaza().v }); }
        else if (this.t.t === 'num' || (this.t.t === 'id' && !this.esteNumeTip(this.t) && !TIPURI_DE_BAZA.has(this.t.v) && !CALIFICATIVE.has(this.t.v) && !this.sabloane.has(this.t.v) && this.t.v !== 'std')) {
          // expresie constantă: StaticJsonDocument<JSON_OBJECT_SIZE(3) + 40>, StaticJsonDocument<CAPACITATE>
          arg.push({ expr: this.parseBinar(7) });
        }
        else arg.push(this.parseTip());
        if (!this.optional(',')) break;
      }
      if (this.esteOp('>>')) this.j.splice(this.p, 1, { t: 'op', v: '>', l: this.t.l, c: this.t.c }, { t: 'op', v: '>', l: this.t.l, c: this.t.c + 1 });
      this.asteapta('>', 'la sfârșitul argumentelor de șablon');
      return arg;
    }

    // --- program ---
    parseProgram() {
      const decl = [];
      while (this.t.t !== 'eof') {
        if (this.optional(';')) continue;
        const d = this.parseDeclaratieGlobala();
        if (Array.isArray(d)) decl.push(...d); else if (d) decl.push(d);
      }
      return { k: 'Program', decl };
    }

    parseDeclaratieGlobala(inClasa) {
      const t = this.t;
      if (t.t === 'id') {
        if (t.v === 'typedef') return this.parseTypedef();
        if (t.v === 'using') return this.parseUsing();
        if (t.v === 'namespace') {
          this.p++;
          if (this.t.t === 'id') this.p++;
          this.asteapta('{');
          const dd = [];
          while (!this.esteOp('}') && this.t.t !== 'eof') { if (this.optional(';')) continue; const d = this.parseDeclaratieGlobala(); if (Array.isArray(d)) dd.push(...d); else if (d) dd.push(d); }
          this.asteapta('}');
          return dd;
        }
        if (t.v === 'template') this.eroare('Șabloanele (template) nu sunt încă suportate în simulare');
        if ((t.v === 'struct' || t.v === 'class' || t.v === 'union') && this.uita(1).t === 'id' && (this.esteOp('{', 2) || this.esteOp(':', 2) || this.esteOp(';', 2))) {
          return this.parseStruct();
        }
        if ((t.v === 'struct' || t.v === 'class') && this.esteOp('{', 1)) {
          return this.parseStruct(); // struct anonim cu variabile: struct { int a; } x;
        }
        if (t.v === 'enum') return this.parseEnum();
        // Clasa::Clasa(...) — constructor definit în afara clasei
        if (this.tipuri.has(t.v) && this.esteOp('::', 1) && this.uita(2).t === 'id' && (this.uita(2).v === t.v) && this.esteOp('(', 3)) {
          const cls = this.avanseaza().v; this.p++; this.p++;
          return this.parseFunctie({ baza: 'void', ptr: 0 }, cls, cls, true);
        }
        if (this.tipuri.has(t.v) && this.esteOp('::', 1) && this.esteOp('~', 2)) {
          const cls = this.avanseaza().v; this.p += 3; this.p++;
          const f = this.parseFunctie({ baza: 'void', ptr: 0 }, '~' + cls, cls, false);
          f.destructor = true; return f;
        }
      }
      return this.parseDeclaratie(true, inClasa);
    }

    parseTypedef() {
      const t0 = this.avanseaza();
      if ((this.este('struct') || this.este('class') || this.este('union')) && (this.esteOp('{', 1) || (this.uita(1).t === 'id' && this.esteOp('{', 2)))) {
        const s = this.parseStruct(true);
        const nume = this.avanseaza().v;
        this.tipuri.add(nume);
        if (!s.nume) s.nume = nume;
        this.asteapta(';');
        return [s, { k: 'Typedef', nume, tip: { baza: s.nume, ptr: 0 }, l: t0.l }];
      }
      if (this.este('enum')) {
        const e = this.parseEnum(true);
        const nume = this.avanseaza().v;
        this.tipuri.add(nume);
        this.asteapta(';');
        return [e, { k: 'Typedef', nume, tip: { baza: 'int', ptr: 0, enumNume: e.nume }, l: t0.l }];
      }
      const tip = this.parseTip();
      // typedef void (*Callback)(int);
      if (this.esteOp('(') && this.esteOp('*', 1)) {
        this.p += 2; const nume = this.avanseaza().v; this.asteapta(')');
        this.sariParanteze();
        this.asteapta(';');
        this.tipuri.add(nume);
        return { k: 'Typedef', nume, tip: { baza: '__functie', ptr: 0 }, l: t0.l };
      }
      const nume = this.avanseaza().v;
      const dim = [];
      while (this.optional('[')) { dim.push(this.esteOp(']') ? null : this.parseExpresie()); this.asteapta(']'); }
      this.asteapta(';');
      this.tipuri.add(nume);
      return { k: 'Typedef', nume, tip, dim, l: t0.l };
    }
    parseUsing() {
      const t0 = this.avanseaza();
      if (this.este('namespace')) { while (!this.esteOp(';')) this.p++; this.p++; return null; }
      const nume = this.avanseaza().v;
      if (this.optional('=')) {
        const tip = this.parseTip();
        this.asteapta(';');
        this.tipuri.add(nume);
        return { k: 'Typedef', nume, tip, l: t0.l };
      }
      while (!this.esteOp(';')) this.p++; this.p++;
      return null;
    }
    sariParanteze() {
      this.asteapta('(');
      let d = 1;
      while (d > 0 && this.t.t !== 'eof') { if (this.esteOp('(')) d++; else if (this.esteOp(')')) d--; this.p++; }
    }

    parseEnum(dinTypedef) {
      const t0 = this.avanseaza(); // enum
      let esteClasa = false;
      if (this.este('class') || this.este('struct')) { this.p++; esteClasa = true; }
      let nume = null;
      if (this.t.t === 'id') { nume = this.avanseaza().v; this.tipuri.add(nume); }
      if (this.optional(':')) this.parseTip(); // tipul de bază al enum-ului
      if (!this.esteOp('{')) {
        // declarație de variabilă: enum Stare s;
        this.p--; if (esteClasa) this.p--; this.p--;
        return this.parseDeclaratie(true);
      }
      this.asteapta('{');
      const elemente = [];
      while (!this.esteOp('}')) {
        const n = this.avanseaza();
        if (n.t !== 'id') this.eroare('Aștept un nume în enum');
        let val = null;
        if (this.optional('=')) val = this.parseAtribuire();
        elemente.push({ nume: n.v, val, l: n.l });
        if (!this.optional(',')) break;
      }
      this.asteapta('}');
      const e = { k: 'Enum', nume, clasa: esteClasa, elemente, l: t0.l };
      if (dinTypedef) return e;
      // enum X {...} var;
      if (this.t.t === 'id' && !this.esteOp(';')) {
        const vars = this.parseDeclaratoriDupaTip({ baza: nume || 'int', ptr: 0, l: t0.l }, true);
        this.asteapta(';');
        return [e, vars];
      }
      this.asteapta(';');
      return e;
    }

    parseStruct(dinTypedef) {
      const t0 = this.avanseaza(); // struct/class
      const esteClasa = t0.v === 'class';
      let nume = null;
      if (this.t.t === 'id' && !this.esteOp('{')) { nume = this.avanseaza().v; this.tipuri.add(nume); }
      if (this.esteOp(';')) { this.p++; return null; } // declarație anticipată
      let baza = null;
      if (this.optional(':')) {
        do {
          while (['public', 'private', 'protected', 'virtual'].includes(this.t.v)) this.p++;
          const b = this.avanseaza().v;
          if (!baza) baza = b;
        } while (this.optional(','));
      }
      this.asteapta('{', 'la începutul corpului ' + (esteClasa ? 'clasei' : 'structurii'));
      const membri = [];
      while (!this.esteOp('}') && this.t.t !== 'eof') {
        if (this.optional(';')) continue;
        if ((this.este('public') || this.este('private') || this.este('protected')) && this.esteOp(':', 1)) { this.p += 2; continue; }
        if (this.este('friend')) { while (!this.esteOp(';') && !this.esteOp('{')) this.p++; if (this.esteOp('{')) this.sariBloc(); else this.p++; continue; }
        // constructor
        if (nume && this.este(nume) && this.esteOp('(', 1)) {
          this.p += 2;
          membri.push(this.parseFunctie({ baza: 'void', ptr: 0 }, nume, nume, true));
          continue;
        }
        if (this.este('explicit') && nume && this.este(nume, 1) && this.esteOp('(', 2)) {
          this.p += 3;
          membri.push(this.parseFunctie({ baza: 'void', ptr: 0 }, nume, nume, true));
          continue;
        }
        if ((this.esteOp('~') || (this.este('virtual') && this.esteOp('~', 1)))) {
          if (this.este('virtual')) this.p++;
          this.p += 2; this.asteapta('(');
          const f = this.parseFunctie({ baza: 'void', ptr: 0 }, '~' + nume, nume, false);
          f.destructor = true; membri.push(f); continue;
        }
        if (this.este('enum')) { const e = this.parseEnum(); if (Array.isArray(e)) membri.push(...e); else if (e) membri.push(e); continue; }
        if ((this.este('struct') || this.este('class')) && (this.esteOp('{', 2) || this.esteOp('{', 1))) { const s = this.parseStruct(); membri.push(s); continue; }
        if (this.este('typedef')) { const td = this.parseTypedef(); if (Array.isArray(td)) membri.push(...td); else membri.push(td); continue; }
        if (this.este('using')) { this.parseUsing(); continue; }
        const d = this.parseDeclaratie(true, nume || '__anonim');
        if (Array.isArray(d)) membri.push(...d); else if (d) membri.push(d);
      }
      this.asteapta('}');
      const s = { k: 'Struct', nume: nume || ('__anonim' + t0.l + '_' + t0.c), clasa: esteClasa, baza, membri, l: t0.l };
      if (!nume) this.tipuri.add(s.nume);
      if (dinTypedef) return s;
      if (this.t.t === 'id' || this.esteOp('*')) {
        const vars = this.parseDeclaratoriDupaTip({ baza: s.nume, ptr: 0, l: t0.l }, true);
        this.asteapta(';');
        return [s, vars];
      }
      this.asteapta(';', 'după definiția ' + (esteClasa ? 'clasei' : 'structurii'));
      return s;
    }
    sariBloc() {
      this.asteapta('{'); let d = 1;
      while (d > 0 && this.t.t !== 'eof') { if (this.esteOp('{')) d++; else if (this.esteOp('}')) d--; this.p++; }
    }

    // Declarație (variabilă sau funcție). global=true la nivel de fișier/clasă.
    parseDeclaratie(global, inClasa) {
      const t0 = this.t;
      const tip = this.parseTip();
      // operator overloading
      if (this.este('operator')) this.eroare('Supraîncărcarea operatorilor nu este încă suportată în simulare');
      // pointer la funcție: void (*f)(int) = ...
      if (this.esteOp('(') && this.esteOp('*', 1) && this.uita(2).t === 'id' && this.esteOp(')', 3)) {
        this.p += 2; const nume = this.avanseaza().v; this.p++;
        this.sariParanteze();
        let init = null;
        if (this.optional('=')) init = this.parseAtribuire();
        this.asteapta(';');
        return { k: 'Var', tip: { baza: '__functie', ptr: 0 }, decl: [{ nume, dim: [], init, l: t0.l }], global, l: t0.l };
      }
      // nume (posibil Clasa::metoda)
      let ptr = 0, ref = false;
      while (this.esteOp('*') || this.esteOp('&') || this.esteOp('&&')) { if (this.esteOp('*')) ptr++; else ref = true; this.p++; if (this.este('const')) this.p++; }
      if (this.t.t !== 'id') {
        if (this.esteOp(';') && (tip.baza && this.tipuri.has(tip.baza))) { this.p++; return null; }
        this.eroare('Aștept un nume de variabilă sau funcție după tipul „' + (tip.baza || '') + '”');
      }
      const tn = this.avanseaza();
      let nume = tn.v;
      let cls = null;
      if (this.esteOp('::')) {
        this.p++;
        cls = nume;
        if (this.esteOp('~')) { this.p++; nume = '~' + this.avanseaza().v; }
        else nume = this.avanseaza().v;
      }
      if (CUVINTE_CHEIE.has(nume) && !['this'].includes(nume)) this.eroare('„' + nume + '” este un cuvânt rezervat și nu poate fi nume', tn);
      if (this.esteOp('(')) {
        // funcție sau obiect construit cu argumente
        if (cls || this.parantezaEsteParametri()) {
          this.p++;
          const tipRet = Object.assign({}, tip, { ptr: tip.ptr + ptr, ref });
          return this.parseFunctie(tipRet, nume, cls, false, inClasa);
        }
      }
      // definiția unui membru static: int Clasa::membru = 0;
      if (cls) {
        let init = null;
        if (this.optional('=')) init = this.esteOp('{') ? this.parseListaInit() : this.parseAtribuire();
        else if (this.esteOp('{')) init = this.parseListaInit();
        else if (this.optional('(')) { const a = this.parseArgumente(); init = a[0] || null; }
        while (this.esteOp('[')) { this.p++; if (!this.esteOp(']')) this.parseExpresie(); this.asteapta(']'); }
        this.asteapta(';');
        return { k: 'StaticMembru', cls, nume, init, l: tn.l };
      }
      // variabile
      this.p--; // revenim la nume
      const vars = this.parseDeclaratoriDupaTip(tip, global, { ptr, ref, nume: null });
      this.asteapta(';', 'după declarația variabilei');
      return vars;
    }

    // Verifică dacă (…) de după un nume conține parametri de funcție (nu argumente de constructor)
    parantezaEsteParametri() {
      const t1 = this.uita(1);
      if (t1.t === 'op' && t1.v === ')') {
        // „Tip nume();” e declarație de funcție; „Tip nume() {” e definiție
        return true;
      }
      if (t1.t === 'id' && (this.incepeTipLa(this.p + 1))) return true;
      if (t1.t === 'op' && t1.v === '...') return true;
      return false;
    }
    incepeTipLa(poz) {
      const t = this.j[poz];
      if (!t || t.t !== 'id') return false;
      if (t.v === 'void' || CALIFICATIVE.has(t.v) || TIPURI_DE_BAZA.has(t.v)) {
        // „String(x)” poate fi apel; verificăm ce urmează
        if (t.v === 'String' || t.v === 'IPAddress') { const u = this.j[poz + 1]; return u && (u.t === 'id' || (u.t === 'op' && (u.v === '&' || u.v === '*' || u.v === ',' || u.v === ')'))); }
        return true;
      }
      if (this.tipuri.has(t.v)) {
        const u = this.j[poz + 1];
        // Clasa::CONSTANTA urmată de „,” sau „)” e o valoare (argument de constructor), nu un tip
        if (u && u.t === 'op' && u.v === '::') {
          const v = this.j[poz + 3];
          return !(v && v.t === 'op' && (v.v === ',' || v.v === ')' || v.v === '|' || v.v === '+'));
        }
        return u && (u.t === 'id' || (u.t === 'op' && (u.v === '&' || u.v === '*' || u.v === '<' || u.v === ',' || u.v === ')')));
      }
      // tip necunoscut urmat de nume -> parametru
      const u = this.j[poz + 1];
      return !!(u && u.t === 'id' && this.j[poz + 2] && this.j[poz + 2].t === 'op' && [',', ')', '=', '['].includes(this.j[poz + 2].v));
    }

    parseDeclaratoriDupaTip(tip, global, primul) {
      const decl = [];
      const t0 = this.t;
      for (;;) {
        let ptr = 0, ref = false;
        if (primul && primul.nume === null) { ptr = primul.ptr; ref = primul.ref; primul = null; }
        while (this.esteOp('*') || this.esteOp('&') || this.esteOp('&&')) { if (this.esteOp('*')) ptr++; else ref = true; this.p++; if (this.este('const')) this.p++; }
        const tn = this.avanseaza();
        if (tn.t !== 'id') this.eroare('Aștept un nume de variabilă', tn);
        if (CUVINTE_CHEIE.has(tn.v)) this.eroare('„' + tn.v + '” este un cuvânt rezervat', tn);
        const d = { nume: tn.v, dim: [], init: null, ctor: null, ptr, ref, l: tn.l, c: tn.c };
        while (this.esteOp('[')) {
          this.p++;
          d.dim.push(this.esteOp(']') ? null : this.parseExpresie());
          this.asteapta(']');
        }
        // câmpuri de biți: int a : 3;
        if (this.esteOp(':') && !global) { this.p++; this.parseTernar(); }
        else if (this.esteOp(':') && global === true && this.uita(1).t === 'num') { this.p++; this.p++; }
        this.sariAtribut();
        if (this.optional('=')) {
          d.init = this.esteOp('{') ? this.parseListaInit() : this.parseAtribuire();
        } else if (this.esteOp('(')) {
          this.p++;
          d.ctor = this.parseArgumente();
        } else if (this.esteOp('{')) {
          d.init = this.parseListaInit();
          d.acolade = true;
        }
        decl.push(d);
        if (!this.optional(',')) break;
      }
      return { k: 'Var', tip, decl, global: !!global, l: t0.l };
    }

    parseParametri() {
      const params = [];
      if (this.optional(')')) return params;
      if (this.este('void') && this.esteOp(')', 1)) { this.p += 2; return params; }
      for (;;) {
        if (this.optional('...')) { params.push({ variadic: true }); break; }
        const t0 = this.t;
        const tip = this.parseTip();
        let ptr = 0, ref = false;
        // pointer la funcție ca parametru: void (*cb)(int)
        if (this.esteOp('(') && this.esteOp('*', 1)) {
          this.p += 2; const n = this.t.t === 'id' ? this.avanseaza().v : ''; this.asteapta(')'); this.sariParanteze();
          params.push({ tip: { baza: '__functie', ptr: 0 }, nume: n, ptr: 0, ref: false, dim: [], implicit: null, l: t0.l });
          if (!this.optional(',')) break; continue;
        }
        while (this.esteOp('*') || this.esteOp('&') || this.esteOp('&&')) { if (this.esteOp('*')) ptr++; else ref = true; this.p++; if (this.este('const')) this.p++; }
        let nume = null;
        if (this.t.t === 'id' && !CUVINTE_CHEIE.has(this.t.v)) nume = this.avanseaza().v;
        const dim = [];
        while (this.optional('[')) { dim.push(this.esteOp(']') ? null : this.parseExpresie()); this.asteapta(']'); }
        let implicit = null;
        if (this.optional('=')) implicit = this.parseAtribuire();
        params.push({ tip, nume, ptr: tip.ptr + ptr, ref, dim, implicit, l: t0.l });
        if (!this.optional(',')) break;
      }
      this.asteapta(')', 'după lista de parametri');
      return params;
    }

    parseFunctie(tipRet, nume, cls, esteCtor, inClasa) {
      const t0 = this.j[this.p - 1];
      const params = this.parseParametri();
      // calificative după parametri
      for (;;) {
        if (this.este('const') || this.este('override') || this.este('noexcept') || this.este('final') || this.este('volatile')) { this.p++; continue; }
        if (this.esteOp('->')) { this.p++; this.parseTip(); continue; }
        if (this.sariAtribut()) continue;
        break;
      }
      let initializari = null;
      if (esteCtor && this.optional(':')) {
        initializari = [];
        do {
          const n = this.avanseaza();
          let args;
          if (this.optional('(')) args = this.parseArgumente();
          else if (this.esteOp('{')) { const li = this.parseListaInit(); args = [li]; }
          else this.eroare('Aștept ( în lista de inițializare a constructorului');
          initializari.push({ nume: n.v, args, l: n.l });
        } while (this.optional(','));
      }
      let corp = null, pur = false, sters = false;
      if (this.esteOp('{')) corp = this.parseBloc();
      else if (this.optional('=')) {
        if (this.este('0')) { } // nimic
        const v = this.avanseaza();
        if (v.v === 0 || v.v === '0') pur = true; else if (v.v === 'delete') sters = true; else if (v.v === 'default') { }
        this.asteapta(';');
      } else this.asteapta(';', 'după declarația funcției');
      return { k: 'Functie', nume, tipRet, params, corp, cls, esteCtor, initializari, pur, inClasa: inClasa || null, l: t0 ? t0.l : this.t.l };
    }

    // --- instrucțiuni ---
    parseBloc() {
      const t0 = this.asteapta('{');
      const corp = [];
      while (!this.esteOp('}')) {
        if (this.t.t === 'eof') this.eroare('Lipsește „}” — o acoladă deschisă la linia ' + t0.l + ' nu este închisă', t0);
        const s = this.parseInstructiune();
        if (s) corp.push(s);
      }
      this.p++;
      return { k: 'Bloc', corp, l: t0.l };
    }
    esteDeclaratieLocala() {
      const t = this.t;
      if (t.t !== 'id') return false;
      if (CUVINTE_CHEIE.has(t.v) && t.v !== 'using') return false;
      if (t.v === 'const' || t.v === 'static' || t.v === 'unsigned' || t.v === 'signed' || t.v === 'volatile' || t.v === 'constexpr' || t.v === 'auto' || t.v === 'register') return true;
      if (t.v === 'struct' || t.v === 'enum' || t.v === 'class') return true;
      const u = this.uita(1);
      if (TIPURI_DE_BAZA.has(t.v) && t.v !== 'std') {
        if (u.t === 'op' && (u.v === '(' || u.v === '.' || u.v === '::')) {
          // String(x) sau int(x) sunt expresii; std::... tipuri
          if (t.v === 'std') return true;
          return false;
        }
        return true;
      }
      if (t.v === 'std' && u.v === '::') return this.sabloane.has(this.uita(2).v) || TIPURI_DE_BAZA.has(this.uita(2).v);
      if (this.tipuri.has(t.v)) {
        if (u.t === 'id') return true;
        if (u.t === 'op' && (u.v === '*' || u.v === '&')) return this.uita(2).t === 'id' && (this.esteOp('=', 3) || this.esteOp(';', 3) || this.esteOp(',', 3) || this.esteOp('[', 3) || this.esteOp('(', 3));
        if (u.t === 'op' && u.v === '<') return true;
        if (u.t === 'op' && u.v === '::' && this.uita(2).t === 'id' && this.uita(3).t === 'id') return true;
        return false;
      }
      // Nume Nume -> declarație cu tip necunoscut
      if (u.t === 'id' && !CUVINTE_CHEIE.has(u.v) && (this.esteOp(';', 2) || this.esteOp('=', 2) || this.esteOp('(', 2) || this.esteOp('[', 2) || this.esteOp(',', 2) || this.esteOp('{', 2))) return true;
      return false;
    }
    parseInstructiune() {
      const t = this.t;
      if (t.t === 'op') {
        if (t.v === '{') return this.parseBloc();
        if (t.v === ';') { this.p++; return null; }
      }
      if (t.t === 'id') {
        switch (t.v) {
          case 'if': {
            this.p++; this.asteapta('(', 'după if');
            const cond = this.parseExpresie();
            this.asteapta(')', 'după condiția lui if');
            const atunci = this.parseInstructiune();
            let altfel = null;
            if (this.optional('else')) altfel = this.parseInstructiune();
            return { k: 'If', cond, atunci, altfel, l: t.l };
          }
          case 'while': {
            this.p++; this.asteapta('(', 'după while');
            const cond = this.parseExpresie();
            this.asteapta(')', 'după condiția lui while');
            const corp = this.parseInstructiune();
            return { k: 'While', cond, corp, l: t.l };
          }
          case 'do': {
            this.p++;
            const corp = this.parseInstructiune();
            this.asteapta('while', 'după corpul lui do');
            this.asteapta('(');
            const cond = this.parseExpresie();
            this.asteapta(')');
            this.asteapta(';');
            return { k: 'DoWhile', cond, corp, l: t.l };
          }
          case 'for': {
            this.p++; this.asteapta('(', 'după for');
            // for (tip x : colectie)
            const salvare = this.p;
            if (this.esteDeclaratieLocala() || this.este('auto')) {
              const tip = this.parseTip();
              let ref = false;
              while (this.esteOp('&') || this.esteOp('*') || this.esteOp('&&')) { ref = true; this.p++; }
              if (this.t.t === 'id' && this.esteOp(':', 1)) {
                const nume = this.avanseaza().v; this.p++;
                const colectie = this.parseExpresie();
                this.asteapta(')');
                const corp = this.parseInstructiune();
                return { k: 'ForIn', tip, nume, ref, colectie, corp, l: t.l };
              }
              this.p = salvare;
            }
            let init = null;
            if (!this.esteOp(';')) {
              if (this.esteDeclaratieLocala()) {
                const tip = this.parseTip();
                init = this.parseDeclaratoriDupaTip(tip, false);
              } else init = { k: 'Expr', e: this.parseExpresie(), l: t.l };
            }
            this.asteapta(';', 'în for (după inițializare)');
            const cond = this.esteOp(';') ? null : this.parseExpresie();
            this.asteapta(';', 'în for (după condiție)');
            const pas = this.esteOp(')') ? null : this.parseExpresie();
            this.asteapta(')', 'la sfârșitul lui for');
            const corp = this.parseInstructiune();
            return { k: 'For', init, cond, pas, corp, l: t.l };
          }
          case 'switch': {
            this.p++; this.asteapta('(');
            const disc = this.parseExpresie();
            this.asteapta(')');
            this.asteapta('{');
            const cazuri = [];
            let curent = null;
            while (!this.esteOp('}')) {
              if (this.t.t === 'eof') this.eroare('Lipsește „}” la sfârșitul lui switch');
              if (this.optional('case')) {
                const test = this.parseTernar();
                let pana = null;
                if (this.optional('...')) pana = this.parseTernar(); // extensie GCC: case 1 ... 5:
                this.asteapta(':', 'după case');
                curent = { test, pana, corp: [], l: this.t.l };
                cazuri.push(curent);
                continue;
              }
              if (this.este('default') && this.esteOp(':', 1)) {
                this.p += 2;
                curent = { test: null, corp: [], l: this.t.l };
                cazuri.push(curent);
                continue;
              }
              if (!curent) this.eroare('Instrucțiune înainte de primul case în switch');
              const s = this.parseInstructiune();
              if (s) curent.corp.push(s);
            }
            this.p++;
            return { k: 'Switch', disc, cazuri, l: t.l };
          }
          case 'break': this.p++; this.asteapta(';', 'după break'); return { k: 'Break', l: t.l };
          case 'continue': this.p++; this.asteapta(';', 'după continue'); return { k: 'Continue', l: t.l };
          case 'return': {
            this.p++;
            let arg = null;
            if (!this.esteOp(';')) arg = this.esteOp('{') ? this.parseListaInit() : this.parseExpresie();
            this.asteapta(';', 'după return');
            return { k: 'Return', arg, l: t.l };
          }
          case 'goto': this.eroare('goto nu este suportat în simulare');
          case 'try': this.eroare('Excepțiile (try/catch) nu sunt activate pe ESP32 în Arduino');
          case 'typedef': return this.parseTypedef();
          case 'using': this.parseUsing(); return null;
          case 'struct': case 'class': case 'union':
            if (this.uita(1).t === 'id' && (this.esteOp('{', 2) || this.esteOp(':', 2))) return this.parseStruct();
            break;
          case 'enum': return this.parseEnum();
          case 'delete': {
            this.p++; if (this.esteOp('[')) { this.p += 2; }
            const e = this.parseExpresie(); this.asteapta(';');
            return { k: 'Expr', e: { k: 'Sterge', arg: e, l: t.l }, l: t.l };
          }
        }
        // etichetă de salt „nume:” — nu e suportată
        if (this.esteOp(':', 1) && !this.esteOp('::', 1) && this.uita(1).v === ':' && !this.tipuri.has(t.v)) {
          this.eroare('Etichetele (pentru goto) nu sunt suportate');
        }
        if (this.esteDeclaratieLocala()) {
          const d = this.parseDeclaratie(false);
          return d;
        }
      }
      const e = this.parseExpresie();
      this.asteapta(';', 'la sfârșitul instrucțiunii');
      return { k: 'Expr', e, l: t.l };
    }

    // --- expresii ---
    parseExpresie() {
      const t0 = this.t;
      let e = this.parseAtribuire();
      if (this.esteOp(',')) {
        const lista = [e];
        while (this.optional(',')) lista.push(this.parseAtribuire());
        e = { k: 'Virgula', lista, l: t0.l };
      }
      return e;
    }
    parseAtribuire() {
      const t0 = this.t;
      const stanga = this.parseTernar();
      const t = this.t;
      if (t.t === 'op' && ['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>='].includes(t.v)) {
        this.p++;
        const dreapta = this.esteOp('{') ? this.parseListaInit() : this.parseAtribuire();
        return { k: 'Atrib', op: t.v, tinta: stanga, val: dreapta, l: t0.l, c: t.c };
      }
      return stanga;
    }
    parseTernar() {
      const t0 = this.t;
      const cond = this.parseBinar(0);
      if (this.esteOp('?')) {
        this.p++;
        const a = this.parseAtribuire();
        this.asteapta(':', 'în operatorul ?:');
        const b = this.parseAtribuire();
        return { k: 'Tern', cond, a, b, l: t0.l };
      }
      return cond;
    }
    parseBinar(nivel) {
      const NIV = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '>', '<=', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];
      if (nivel >= NIV.length) return this.parseUnar();
      let st = this.parseBinar(nivel + 1);
      for (;;) {
        const t = this.t;
        if (t.t === 'op' && NIV[nivel].includes(t.v)) {
          this.p++;
          const dr = this.parseBinar(nivel + 1);
          st = { k: nivel <= 1 ? 'Logic' : 'Bin', op: t.v, st, dr, l: t.l, c: t.c };
        } else if (t.t === 'id' && ((nivel === 0 && t.v === 'or') || (nivel === 1 && t.v === 'and'))) {
          this.p++;
          const dr = this.parseBinar(nivel + 1);
          st = { k: 'Logic', op: t.v === 'or' ? '||' : '&&', st, dr, l: t.l, c: t.c };
        } else break;
      }
      return st;
    }
    esteCast() {
      // ( tip ) expr
      if (!this.esteOp('(')) return false;
      const t1 = this.uita(1);
      if (t1.t !== 'id') return false;
      if (!(TIPURI_DE_BAZA.has(t1.v) || this.tipuri.has(t1.v) || ['const', 'unsigned', 'signed', 'long', 'short', 'volatile', 'struct'].includes(t1.v))) return false;
      // caută ) după tip
      let k = 1;
      while (this.uita(k).t === 'id' && (TIPURI_DE_BAZA.has(this.uita(k).v) || this.tipuri.has(this.uita(k).v) || CALIFICATIVE.has(this.uita(k).v))) k++;
      // (Clasa::TipInterior) expr — ex. (MFRC522::StatusCode) rfid.PCD_Authenticate(...)
      while (this.uita(k).t === 'op' && this.uita(k).v === '::' && this.uita(k + 1).t === 'id' && this.tipuri.has(this.uita(k + 1).v)) k += 2;
      while (this.uita(k).t === 'op' && (this.uita(k).v === '*' || this.uita(k).v === '&')) k++;
      if (this.uita(k).t === 'op' && this.uita(k).v === '::') return false;
      if (this.uita(k).t === 'op' && this.uita(k).v === '<') return true; // (std::vector<int>)
      if (!(this.uita(k).t === 'op' && this.uita(k).v === ')')) return false;
      // (String) urmat de ceva ce poate începe o expresie
      const dupa = this.uita(k + 1);
      if (dupa.t === 'op' && [')', ';', ',', ']', '}', '.', '->', '=', '+=', '==', '?', ':'].includes(dupa.v)) return false;
      if (dupa.t === 'op' && ['+', '-', '*', '&'].includes(dupa.v) && k === 2 && this.tipuri.has(t1.v) && !TIPURI_DE_BAZA.has(t1.v)) return false;
      return true;
    }
    parseUnar() {
      const t = this.t;
      if (t.t === 'op') {
        if (t.v === '!' || t.v === '-' || t.v === '+' || t.v === '~') {
          this.p++;
          return { k: 'Unar', op: t.v, arg: this.parseUnar(), l: t.l, c: t.c };
        }
        if (t.v === '++' || t.v === '--') {
          this.p++;
          return { k: 'Incr', op: t.v, prefix: true, arg: this.parseUnar(), l: t.l, c: t.c };
        }
        if (t.v === '*') { this.p++; return { k: 'Deref', arg: this.parseUnar(), l: t.l, c: t.c }; }
        if (t.v === '&') { this.p++; return { k: 'Adresa', arg: this.parseUnar(), l: t.l, c: t.c }; }
        if (this.esteCast()) {
          this.p++;
          const tip = this.parseTip();
          while (this.esteOp('*') || this.esteOp('&')) { if (this.esteOp('*')) tip.ptr++; this.p++; }
          this.asteapta(')');
          return { k: 'Cast', tip, arg: this.parseUnar(), l: t.l, c: t.c };
        }
      }
      if (t.t === 'id') {
        if (t.v === 'not') { this.p++; return { k: 'Unar', op: '!', arg: this.parseUnar(), l: t.l }; }
        if (t.v === 'sizeof') {
          this.p++;
          if (this.esteOp('(') && this.incepeTipLa(this.p + 1) && !this.esteOp('(', 2) && !this.esteOp('[', 2) && !this.esteOp('.', 2)) {
            this.p++;
            const tip = this.parseTip();
            while (this.esteOp('*')) { tip.ptr++; this.p++; }
            this.asteapta(')');
            return { k: 'SizeofTip', tip, l: t.l };
          }
          return { k: 'SizeofExpr', arg: this.parseUnar(), l: t.l };
        }
        if (t.v === 'new') {
          this.p++;
          const tip = this.parseTip();
          let args = [], dim = null;
          if (this.optional('(')) args = this.parseArgumente();
          else if (this.optional('[')) { dim = this.parseExpresie(); this.asteapta(']'); }
          else if (this.esteOp('{')) args = this.parseListaInit().elemente;
          return { k: 'Nou', tip, args, dim, l: t.l };
        }
        if (['static_cast', 'reinterpret_cast', 'const_cast', 'dynamic_cast'].includes(t.v)) {
          this.p++; this.asteapta('<');
          const tip = this.parseTip();
          while (this.esteOp('*') || this.esteOp('&')) { if (this.esteOp('*')) tip.ptr++; this.p++; }
          this.asteapta('>'); this.asteapta('(');
          const arg = this.parseExpresie();
          this.asteapta(')');
          return this.parsePostfix({ k: 'Cast', tip, arg, l: t.l });
        }
      }
      return this.parsePostfix(this.parsePrimar());
    }
    parsePostfix(e) {
      for (;;) {
        const t = this.t;
        if (t.t !== 'op') break;
        if (t.v === '(') {
          this.p++;
          const args = this.parseArgumente();
          e = { k: 'Apel', fn: e, args, l: t.l, c: t.c };
          continue;
        }
        if (t.v === '[') {
          this.p++;
          const idx = this.parseExpresie();
          this.asteapta(']');
          e = { k: 'Index', obj: e, idx, l: t.l, c: t.c };
          continue;
        }
        if (t.v === '.' || t.v === '->') {
          this.p++;
          const n = this.avanseaza();
          if (n.t !== 'id') this.eroare('Aștept numele unui membru după „' + t.v + '”', n);
          e = { k: 'Membru', obj: e, nume: n.v, sageata: t.v === '->', l: n.l, c: n.c };
          // metodă-șablon (ex. FastLED.addLeds<WS2812B, 5, GRB>(leds, 60))
          if (this.esteOp('<') && ['addLeds', 'get', 'as', 'is', 'to', 'add', 'set'].includes(n.v) && this.sablonMetodaUrmeaza()) {
            this.p++;
            const arg = [];
            while (!this.esteOp('>') && this.t.t !== 'eof') {
              const x = this.t;
              if (x.t === 'num') { arg.push({ k: 'Num', v: x.v, l: x.l }); this.p++; }
              else if (x.t === 'id') {
                let nume = x.v; this.p++;
                while (this.esteOp('::')) { this.p++; nume += '::' + this.avanseaza().v; }
                // tipuri din mai multe cuvinte: const char*, unsigned long
                while (this.t.t === 'id') nume += ' ' + this.avanseaza().v;
                while (this.esteOp('*')) { this.p++; nume += '*'; }
                arg.push({ k: 'SablonId', nume, l: x.l });
              } else this.eroare('Argument de șablon neașteptat: „' + x.v + '”');
              if (!this.optional(',')) break;
            }
            this.asteapta('>');
            e.sablon = arg;
          }
          continue;
        }
        if (t.v === '++' || t.v === '--') {
          this.p++;
          e = { k: 'Incr', op: t.v, prefix: false, arg: e, l: t.l, c: t.c };
          continue;
        }
        break;
      }
      return e;
    }
    parseArgumente() {
      const args = [];
      if (this.optional(')')) return args;
      for (;;) {
        args.push(this.esteOp('{') ? this.parseListaInit() : this.parseAtribuire());
        if (!this.optional(',')) break;
      }
      this.asteapta(')', 'la sfârșitul listei de argumente');
      return args;
    }
    parseListaInit() {
      const t0 = this.asteapta('{');
      const elemente = [];
      while (!this.esteOp('}')) {
        if (this.t.t === 'eof') this.eroare('Lipsește „}” în lista de inițializare', t0);
        if (this.esteOp('.') && this.uita(1).t === 'id' && this.esteOp('=', 2)) {
          this.p++; const n = this.avanseaza().v; this.p++;
          const v = this.esteOp('{') ? this.parseListaInit() : this.parseAtribuire();
          elemente.push({ k: 'Desemnat', nume: n, val: v });
        } else if (this.esteOp('[') ) {
          this.p++; const idx = this.parseTernar(); this.asteapta(']'); this.asteapta('=');
          const v = this.esteOp('{') ? this.parseListaInit() : this.parseAtribuire();
          elemente.push({ k: 'DesemnatIndex', idx, val: v });
        } else {
          elemente.push(this.esteOp('{') ? this.parseListaInit() : this.parseAtribuire());
        }
        if (!this.optional(',')) break;
      }
      this.asteapta('}');
      return { k: 'ListaInit', elemente, l: t0.l };
    }
    parseLambda() {
      const t0 = this.asteapta('[');
      let d = 1;
      while (d > 0 && this.t.t !== 'eof') { if (this.esteOp('[')) d++; else if (this.esteOp(']')) d--; this.p++; }
      let params = [];
      if (this.optional('(')) params = this.parseParametri();
      while (this.este('mutable') || this.este('noexcept')) this.p++;
      if (this.optional('->')) this.parseTip();
      const corp = this.parseBloc();
      return { k: 'Lambda', params, corp, l: t0.l };
    }
    parsePrimar() {
      const t = this.t;
      switch (t.t) {
        case 'num': this.p++; return { k: 'Num', v: t.v, real: t.real, flt: t.flt, uns: t.uns, lung: t.lung, l: t.l, c: t.c };
        case 'chr': this.p++; return { k: 'Chr', v: t.v, l: t.l, c: t.c };
        case 'str': this.p++; return { k: 'Str', v: t.v, l: t.l, c: t.c };
        case 'op':
          if (t.v === '(') {
            this.p++;
            const e = this.parseExpresie();
            this.asteapta(')', 'pentru a închide paranteza');
            return { k: 'Paranteza', e, l: t.l };
          }
          if (t.v === '[') return this.parseLambda();
          if (t.v === '{') return this.parseListaInit();
          if (t.v === '::') { this.p++; return this.parsePrimar(); }
          this.eroare('Expresie invalidă: nu mă așteptam la „' + t.v + '”');
          break;
        case 'id': {
          this.p++;
          if (t.v === 'true') return { k: 'Bool', v: true, l: t.l };
          if (t.v === 'false') return { k: 'Bool', v: false, l: t.l };
          if (t.v === 'nullptr' || t.v === 'NULL') return { k: 'Null', l: t.l };
          if (t.v === 'this') return { k: 'This', l: t.l };
          if (t.v === 'std' && this.esteOp('::')) { this.p++; return this.parsePostfix(this.parsePrimar()); }
          // tip(expr) — conversie funcțională sau constructor temporar
          let e = { k: 'Id', nume: t.v, l: t.l, c: t.c };
          // Nume::Membru (enum class, membri statici)
          while (this.esteOp('::') && this.uita(1).t === 'id') {
            this.p++;
            const n = this.avanseaza();
            e = { k: 'Scop', stanga: e, nume: n.v, l: n.l, c: n.c };
          }
          // vector<int>{...} sau funcție șablon min<int>(...)
          if (e.k === 'Id' && this.esteOp('<') && this.sabloane.has(t.v)) {
            const sablon = this.parseArgumenteSablon();
            e = { k: 'Id', nume: t.v, sablon, l: t.l, c: t.c };
          }
          if (e.k === 'Id' && this.esteOp('{') && this.tipuri.has(t.v)) {
            const li = this.parseListaInit();
            return { k: 'Apel', fn: e, args: li.elemente, acolade: true, l: t.l };
          }
          return e;
        }
        case 'eof': this.eroare('Codul se termină brusc — lipsește ceva (poate o acoladă sau un ;)');
      }
      this.eroare('Expresie invalidă');
    }
  }

  M.Parser = Parser;
  M.parser = {
    TIPURI_DE_BAZA,
    analizeaza(jetoane, tipuriApi) {
      const p = new Parser(jetoane, tipuriApi);
      // pre-scanare: înregistrează numele de clase/structuri/typedef-uri declarate oriunde
      for (let i = 0; i < jetoane.length - 1; i++) {
        const a = jetoane[i], b = jetoane[i + 1];
        if (a.t === 'id' && (a.v === 'struct' || a.v === 'class' || a.v === 'union') && b.t === 'id') p.tipuri.add(b.v);
        if (a.t === 'id' && a.v === 'enum' && b.t === 'id' && b.v !== 'class' && b.v !== 'struct') p.tipuri.add(b.v);
        if (a.t === 'id' && a.v === 'enum' && b.t === 'id' && (b.v === 'class' || b.v === 'struct') && jetoane[i + 2] && jetoane[i + 2].t === 'id') p.tipuri.add(jetoane[i + 2].v);
      }
      return { ast: p.parseProgram(), tipuri: p.tipuri };
    }
  };
})(window.M = window.M || {});
