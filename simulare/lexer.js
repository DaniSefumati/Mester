/* Meșter — analizor lexical și preprocesor pentru codul Arduino (C++).
   Transformă textul sursă în jetoane și aplică #define, #include, #if/#ifdef. */
(function (M) {
  'use strict';

  const OPERATORI = [
    '>>=', '<<=', '...', '->*',
    '->', '++', '--', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||',
    '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '::',
    '+', '-', '*', '/', '%', '&', '|', '^', '~', '!', '=', '<', '>',
    '?', ':', ';', ',', '.', '(', ')', '[', ']', '{', '}', '#'
  ];

  class EroareCompilare extends Error {
    constructor(mesaj, linie, coloana) {
      super(mesaj);
      this.linie = linie || 0;
      this.coloana = coloana || 0;
      this.esteCompilare = true;
    }
  }
  M.EroareCompilare = EroareCompilare;

  function esteLitera(c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$'; }
  function esteCifra(c) { return c >= '0' && c <= '9'; }

  // Citește o secvență de escape; întoarce [codCaracter, lungime]
  function citesteEscape(src, i) {
    const c = src[i];
    const simple = { n: 10, t: 9, r: 13, '0': 0, '\\': 92, '"': 34, "'": 39, a: 7, b: 8, f: 12, v: 11, '?': 63, e: 27 };
    if (c === 'x') {
      let j = i + 1, h = '';
      while (j < src.length && /[0-9a-fA-F]/.test(src[j]) && h.length < 2) h += src[j++];
      return [parseInt(h || '0', 16), j - i];
    }
    if (c >= '0' && c <= '7') {
      let j = i, o = '';
      while (j < src.length && src[j] >= '0' && src[j] <= '7' && o.length < 3) o += src[j++];
      return [parseInt(o, 8), j - i];
    }
    if (c === 'u') {
      const h = src.substr(i + 1, 4);
      return [parseInt(h, 16), 5];
    }
    if (c in simple) return [simple[c], 1];
    return [c.charCodeAt(0), 1];
  }

  // Codifică un șir JS (UTF-16) ca text în care fiecare caracter e un octet UTF-8,
  // așa cum îl vede un ESP32 (șirurile C sunt octeți).
  function utf8Octeti(s) {
    try { return unescape(encodeURIComponent(s)); } catch (e) { return s; }
  }
  M.utf8Octeti = utf8Octeti;

  function tokenizeaza(src) {
    const jet = [];
    let i = 0, linie = 1, inceputLinie = 0;
    const n = src.length;
    let laInceputDeLinie = true;

    function eroare(m) { throw new EroareCompilare(m, linie, i - inceputLinie + 1); }

    while (i < n) {
      const c = src[i];
      // spații
      if (c === '\n') { linie++; i++; inceputLinie = i; laInceputDeLinie = true; continue; }
      if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') { i++; continue; }
      // comentarii
      if (c === '/' && src[i + 1] === '/') {
        while (i < n && src[i] !== '\n') {
          if (src[i] === '\\' && src[i + 1] === '\n') { linie++; i += 2; inceputLinie = i; continue; }
          i++;
        }
        continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        const start = linie;
        i += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') { linie++; inceputLinie = i + 1; } i++; }
        if (i >= n) throw new EroareCompilare('Comentariu /* ... */ neînchis', start, 1);
        i += 2;
        continue;
      }
      // directive de preprocesor
      if (c === '#' && laInceputDeLinie) {
        const l0 = linie;
        let j = i + 1, text = '';
        while (j < n && src[j] !== '\n') {
          if (src[j] === '\\' && (src[j + 1] === '\n' || (src[j + 1] === '\r' && src[j + 2] === '\n'))) {
            j += src[j + 1] === '\r' ? 3 : 2; linie++; text += ' '; continue;
          }
          // comentarii în directive
          if (src[j] === '/' && src[j + 1] === '/') { while (j < n && src[j] !== '\n') j++; break; }
          if (src[j] === '/' && src[j + 1] === '*') {
            j += 2;
            while (j < n && !(src[j] === '*' && src[j + 1] === '/')) { if (src[j] === '\n') linie++; j++; }
            j += 2; text += ' '; continue;
          }
          text += src[j++];
        }
        i = j;
        const m = /^\s*(\w+)\s*([\s\S]*)$/.exec(text);
        jet.push({ t: 'pp', v: m ? m[1] : '', arg: m ? m[2].trim() : '', l: l0, c: 1 });
        continue;
      }
      laInceputDeLinie = false;
      const col = i - inceputLinie + 1;
      // șiruri brute R"delim(...)delim"
      if ((c === 'R' || ((c === 'u' || c === 'U' || c === 'L') && src[i + 1] === 'R')) && src[i + (c === 'R' ? 1 : 2)] === '"') {
        let j = i + (c === 'R' ? 2 : 3);
        let delim = '';
        while (j < n && src[j] !== '(') delim += src[j++];
        const final = ')' + delim + '"';
        const k = src.indexOf(final, j + 1);
        if (k < 0) eroare('Șir brut R"(...)" neînchis');
        const val = src.slice(j + 1, k);
        for (const ch of val) if (ch === '\n') linie++;
        jet.push({ t: 'str', v: utf8Octeti(val), l: linie, c: col });
        i = k + final.length;
        continue;
      }
      // identificatori
      if (esteLitera(c)) {
        let j = i + 1;
        while (j < n && (esteLitera(src[j]) || esteCifra(src[j]))) j++;
        const cuv = src.slice(i, j);
        // prefixe de șir: L"", u8"", u"", U""
        if ((cuv === 'L' || cuv === 'u8' || cuv === 'u' || cuv === 'U') && (src[j] === '"' || src[j] === "'")) { i = j; continue; }
        jet.push({ t: 'id', v: cuv, l: linie, c: col });
        i = j;
        continue;
      }
      // numere
      if (esteCifra(c) || (c === '.' && esteCifra(src[i + 1]))) {
        let j = i, text = '';
        let esteReal = false;
        if (c === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
          j = i + 2;
          while (j < n && /[0-9a-fA-F']/.test(src[j])) j++;
          text = src.slice(i, j).replace(/'/g, '');
        } else if (c === '0' && (src[i + 1] === 'b' || src[i + 1] === 'B')) {
          j = i + 2;
          while (j < n && /[01']/.test(src[j])) j++;
          text = src.slice(i, j).replace(/'/g, '');
        } else {
          while (j < n && (esteCifra(src[j]) || src[j] === "'")) j++;
          if (src[j] === '.' && src[j + 1] !== '.') { esteReal = true; j++; while (j < n && esteCifra(src[j])) j++; }
          if ((src[j] === 'e' || src[j] === 'E') && (esteCifra(src[j + 1]) || ((src[j + 1] === '-' || src[j + 1] === '+') && esteCifra(src[j + 2])))) {
            esteReal = true; j += 2; while (j < n && esteCifra(src[j])) j++;
          }
          text = src.slice(i, j).replace(/'/g, '');
        }
        let suf = '';
        while (j < n && /[uUlLfF]/.test(src[j])) suf += src[j++];
        if (j < n && esteLitera(src[j])) eroare('Număr scris greșit: ' + src.slice(i, j + 1));
        let v;
        const sufL = suf.toLowerCase();
        if (sufL.includes('f') && !text.startsWith('0x')) esteReal = true;
        if (text.startsWith('0x') || text.startsWith('0X')) v = parseInt(text.slice(2), 16);
        else if (text.startsWith('0b') || text.startsWith('0B')) v = parseInt(text.slice(2), 2);
        else if (!esteReal && text.length > 1 && text[0] === '0') v = parseInt(text, 8);
        else v = parseFloat(text);
        jet.push({
          t: 'num', v, real: esteReal, flt: sufL.includes('f'), uns: sufL.includes('u'),
          lung: (sufL.match(/l/g) || []).length, s: src.slice(i, j), l: linie, c: col
        });
        i = j;
        continue;
      }
      // șiruri
      if (c === '"') {
        let j = i + 1, val = '';
        while (j < n && src[j] !== '"') {
          if (src[j] === '\n') eroare('Șir de caractere neînchis (lipsește ")');
          if (src[j] === '\\') {
            if (src[j + 1] === '\n') { j += 2; linie++; continue; }
            const [cod, lg] = citesteEscape(src, j + 1);
            val += cod < 128 || src[j + 1] === 'x' || (src[j + 1] >= '0' && src[j + 1] <= '7') ? String.fromCharCode(cod) : utf8Octeti(String.fromCharCode(cod));
            j += 1 + lg;
          } else {
            // caractere non-ASCII -> octeți UTF-8
            const ch = src[j];
            if (ch.charCodeAt(0) > 127) {
              let k = j + 1;
              // perechi surogat
              if (ch.charCodeAt(0) >= 0xD800 && ch.charCodeAt(0) <= 0xDBFF) k++;
              val += utf8Octeti(src.slice(j, k));
              j = k;
            } else { val += ch; j++; }
          }
        }
        if (j >= n) eroare('Șir de caractere neînchis (lipsește ")');
        jet.push({ t: 'str', v: val, l: linie, c: col });
        i = j + 1;
        continue;
      }
      // caractere
      if (c === "'") {
        let j = i + 1, cod = 0, nr = 0;
        while (j < n && src[j] !== "'") {
          if (src[j] === '\n') eroare("Caracter neînchis (lipsește ')");
          if (src[j] === '\\') { const [cc, lg] = citesteEscape(src, j + 1); cod = (cod * 256 + cc); j += 1 + lg; }
          else {
            const cc = src.charCodeAt(j);
            if (cc > 127) { const b = utf8Octeti(src[j]); for (const x of b) cod = cod * 256 + x.charCodeAt(0); }
            else cod = cod * 256 + cc;
            j++;
          }
          nr++;
        }
        if (nr === 0) eroare("Caracter gol ''");
        jet.push({ t: 'chr', v: cod, multi: nr > 1, l: linie, c: col });
        i = j + 1;
        continue;
      }
      // operatori
      let gasit = null;
      for (const op of OPERATORI) {
        if (src.startsWith(op, i)) { gasit = op; break; }
      }
      if (!gasit) {
        if (c.charCodeAt(0) > 127) eroare('Caracter nepermis în cod: „' + c + '” (poate un diacritic în afara unui șir?)');
        eroare('Caracter necunoscut: „' + c + '”');
      }
      jet.push({ t: 'op', v: gasit, l: linie, c: col });
      i += gasit.length;
    }
    jet.push({ t: 'eof', v: '', l: linie, c: 1 });
    return jet;
  }

  /* ---------------- Preprocesor ---------------- */

  function copieJeton(t, linie) { const o = Object.assign({}, t); if (linie) { o.l = linie.l; o.c = linie.c; } return o; }

  function preproceseaza(jetoane, predefinite) {
    const definitii = new Map();
    for (const k in (predefinite || {})) {
      const v = predefinite[k];
      if (v && typeof v === 'object') definitii.set(k, { parametri: v.parametri || null, corp: tokenizeaza(String(v.corp)).filter(t => t.t !== 'eof') });
      else definitii.set(k, { parametri: null, corp: tokenizeaza(String(v)).filter(t => t.t !== 'eof') });
    }
    let contor = 0;
    const includeri = [];
    const avertismente = [];
    const iesire = [];
    const stiva = []; // {activ, luatDeja, parinteActiv}

    function activ() { return stiva.every(s => s.activ); }

    function evalueazaConditie(text, linie) {
      let jt = tokenizeaza(text).filter(t => t.t !== 'eof');
      // defined(X) / defined X
      const rez = [];
      for (let i = 0; i < jt.length; i++) {
        if (jt[i].t === 'id' && jt[i].v === 'defined') {
          let nume;
          if (jt[i + 1] && jt[i + 1].v === '(') { nume = jt[i + 2].v; i += 3; }
          else { nume = jt[i + 1].v; i += 1; }
          rez.push({ t: 'num', v: definitii.has(nume) ? 1 : 0, l: linie });
        } else rez.push(jt[i]);
      }
      jt = expandeaza(rez, new Set());
      let p = 0;
      const urm = () => jt[p];
      function primar() {
        const t = jt[p++];
        if (!t) return 0;
        if (t.t === 'num' || t.t === 'chr') return t.v;
        if (t.t === 'id') {
          if (t.v === 'true') return 1;
          if (jt[p] && jt[p].v === '(') { // apel de macro nedefinit
            let d = 0; do { if (jt[p].v === '(') d++; if (jt[p].v === ')') d--; p++; } while (d > 0 && p < jt.length);
          }
          return 0;
        }
        if (t.v === '(') { const v = ternar(); p++; return v; }
        if (t.v === '!') return primar() ? 0 : 1;
        if (t.v === '-') return -primar();
        if (t.v === '+') return +primar();
        if (t.v === '~') return ~primar();
        return 0;
      }
      const niveluri = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '>', '<=', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];
      function binar(nv) {
        if (nv >= niveluri.length) return primar();
        let a = binar(nv + 1);
        while (urm() && niveluri[nv].includes(urm().v)) {
          const op = jt[p++].v; const b = binar(nv + 1);
          switch (op) {
            case '||': a = (a || b) ? 1 : 0; break; case '&&': a = (a && b) ? 1 : 0; break;
            case '|': a = a | b; break; case '^': a = a ^ b; break; case '&': a = a & b; break;
            case '==': a = a === b ? 1 : 0; break; case '!=': a = a !== b ? 1 : 0; break;
            case '<': a = a < b ? 1 : 0; break; case '>': a = a > b ? 1 : 0; break;
            case '<=': a = a <= b ? 1 : 0; break; case '>=': a = a >= b ? 1 : 0; break;
            case '<<': a = a << b; break; case '>>': a = a >> b; break;
            case '+': a = a + b; break; case '-': a = a - b; break;
            case '*': a = a * b; break; case '/': a = b ? Math.trunc(a / b) : 0; break; case '%': a = b ? a % b : 0; break;
          }
        }
        return a;
      }
      function ternar() {
        const c = binar(0);
        if (urm() && urm().v === '?') { p++; const a = ternar(); p++; const b = ternar(); return c ? a : b; }
        return c;
      }
      try { return ternar() ? true : false; } catch (e) { return false; }
    }

    // Expandare de macrouri pe o listă de jetoane
    function expandeaza(lista, inCurs) {
      const rez = [];
      for (let i = 0; i < lista.length; i++) {
        const t = lista[i];
        if (t.t === 'id' && t.v === '__LINE__') { rez.push({ t: 'num', v: t.l, l: t.l, c: t.c, s: String(t.l) }); continue; }
        if (t.t === 'id' && t.v === '__COUNTER__') { rez.push({ t: 'num', v: contor, l: t.l, c: t.c, s: String(contor) }); contor++; continue; }
        // data și ora compilării, ca în GCC: "Sep 29 2026" și "14:05:09"
        if (t.t === 'id' && (t.v === '__DATE__' || t.v === '__TIME__')) {
          const d = new Date();
          const LUNI = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const v = t.v === '__DATE__' ? LUNI[d.getMonth()] + ' ' + String(d.getDate()).padStart(2, ' ') + ' ' + d.getFullYear() : [d.getHours(), d.getMinutes(), d.getSeconds()].map(x => String(x).padStart(2, '0')).join(':');
          rez.push({ t: 'str', v, l: t.l, c: t.c });
          continue;
        }
        if (t.t === 'id' && definitii.has(t.v) && !inCurs.has(t.v)) {
          const d = definitii.get(t.v);
          if (d.parametri) {
            // macro-funcție: are nevoie de (
            if (!lista[i + 1] || lista[i + 1].v !== '(') { rez.push(t); continue; }
            // colectează argumentele
            const argumente = []; let curent = []; let adancime = 0; let j = i + 1;
            for (; j < lista.length; j++) {
              const x = lista[j];
              if (x.v === '(' && x.t === 'op') { adancime++; if (adancime === 1) continue; }
              if (x.v === ')' && x.t === 'op') { adancime--; if (adancime === 0) break; }
              if (x.v === ',' && x.t === 'op' && adancime === 1) { argumente.push(curent); curent = []; continue; }
              curent.push(x);
            }
            if (curent.length || argumente.length) argumente.push(curent);
            const variadic = d.parametri.length && d.parametri[d.parametri.length - 1] === '...';
            const harta = new Map();
            d.parametri.forEach((p, k) => {
              if (p === '...') {
                const rest = [];
                argumente.slice(k).forEach((a, q) => { if (q) rest.push({ t: 'op', v: ',', l: t.l, c: t.c }); rest.push(...a); });
                harta.set('__VA_ARGS__', rest);
              } else harta.set(p, argumente[k] || []);
            });
            if (!variadic && argumente.length > d.parametri.length && !(d.parametri.length === 0 && argumente.length === 1 && argumente[0].length === 0)) {
              throw new EroareCompilare('Macroul ' + t.v + ' primește ' + d.parametri.length + ' argumente, nu ' + argumente.length, t.l, t.c);
            }
            let corp = [];
            for (let k = 0; k < d.corp.length; k++) {
              const b = d.corp[k];
              if (b.t === 'op' && b.v === '#' && d.corp[k + 1] && harta.has(d.corp[k + 1].v)) {
                const arg = harta.get(d.corp[k + 1].v);
                corp.push({ t: 'str', v: arg.map(a => a.s || (a.t === 'str' ? JSON.stringify(a.v) : String(a.v))).join(' '), l: t.l, c: t.c });
                k++; continue;
              }
              if (b.t === 'id' && harta.has(b.v)) {
                corp.push(...expandeaza(harta.get(b.v), inCurs).map(x => copieJeton(x, t)));
              } else corp.push(copieJeton(b, t));
            }
            // lipire ##
            const lipit = [];
            for (let k = 0; k < corp.length; k++) {
              if (corp[k].t === 'op' && corp[k].v === '#' && corp[k + 1] && corp[k + 1].v === '#') {
                const a = lipit.pop(); const b = corp[k + 2];
                if (a && b) { const txt = String(a.s || a.v) + String(b.s || b.v); lipit.push(...tokenizeaza(txt).filter(x => x.t !== 'eof').map(x => copieJeton(x, t))); }
                k += 2; continue;
              }
              lipit.push(corp[k]);
            }
            const nou = new Set(inCurs); nou.add(t.v);
            rez.push(...expandeaza(lipit, nou));
            i = j;
          } else {
            const nou = new Set(inCurs); nou.add(t.v);
            rez.push(...expandeaza(d.corp.map(x => copieJeton(x, t)), nou));
          }
        } else rez.push(t);
      }
      return rez;
    }

    // Parcurgem jetoanele; directivele controlează ce rămâne activ.
    let bufer = [];
    function goleste() { if (bufer.length) { iesire.push(...expandeazaFlux(bufer)); bufer = []; } }
    // expandarea trebuie să vadă argumentele macrourilor-funcție care pot trece peste linii
    function expandeazaFlux(b) { return expandeaza(b, new Set()); }

    for (let i = 0; i < jetoane.length; i++) {
      const t = jetoane[i];
      if (t.t === 'pp') {
        const dir = t.v;
        if (dir === 'ifdef' || dir === 'ifndef') {
          const nume = t.arg.split(/\s+/)[0];
          const def = definitii.has(nume);
          const cond = dir === 'ifdef' ? def : !def;
          stiva.push({ activ: cond, luatDeja: cond });
          continue;
        }
        if (dir === 'if') {
          const cond = activ() ? evalueazaConditie(t.arg, t.l) : false;
          stiva.push({ activ: cond, luatDeja: cond });
          continue;
        }
        if (dir === 'elif') {
          const s = stiva[stiva.length - 1];
          if (!s) throw new EroareCompilare('#elif fără #if', t.l, 1);
          if (s.luatDeja) s.activ = false;
          else {
            stiva.pop();
            const cond = activ() ? evalueazaConditie(t.arg, t.l) : false;
            stiva.push({ activ: cond, luatDeja: cond });
          }
          continue;
        }
        if (dir === 'else') {
          const s = stiva[stiva.length - 1];
          if (!s) throw new EroareCompilare('#else fără #if', t.l, 1);
          s.activ = !s.luatDeja; s.luatDeja = true;
          continue;
        }
        if (dir === 'endif') {
          if (!stiva.length) throw new EroareCompilare('#endif fără #if', t.l, 1);
          stiva.pop();
          continue;
        }
        if (!activ()) continue;
        // directivele active întrerup acumularea (macrourile se aplică de aici încolo)
        goleste();
        if (dir === 'include') {
          const m = /^[<"]([^>"]+)[>"]/.exec(t.arg);
          if (m) includeri.push({ nume: m[1], linie: t.l });
          continue;
        }
        if (dir === 'define') {
          const m = /^(\w+)(\(([^)]*)\))?\s*([\s\S]*)$/.exec(t.arg);
          if (!m) continue;
          const nume = m[1];
          const parametri = m[2] !== undefined ? m[3].split(',').map(s => s.trim()).filter(s => s.length) : null;
          let corp = [];
          try { corp = tokenizeaza(m[4] || '').filter(x => x.t !== 'eof').map(x => Object.assign(x, { l: t.l })); }
          catch (e) { throw new EroareCompilare('#define ' + nume + ': ' + e.message, t.l, 1); }
          definitii.set(nume, { parametri, corp });
          continue;
        }
        if (dir === 'undef') { definitii.delete(t.arg.split(/\s+/)[0]); continue; }
        if (dir === 'error') throw new EroareCompilare('#error ' + t.arg, t.l, 1);
        if (dir === 'warning') { avertismente.push({ mesaj: '#warning ' + t.arg, linie: t.l }); continue; }
        // #pragma, #line etc. se ignoră
        continue;
      }
      if (!activ()) continue;
      bufer.push(t);
    }
    if (stiva.length) throw new EroareCompilare('Lipsește #endif', jetoane[jetoane.length - 1].l, 1);
    goleste();
    iesire.push({ t: 'eof', v: '', l: (jetoane[jetoane.length - 1] || {}).l || 1, c: 1 });
    // concatenare șiruri adiacente "a" "b"
    const final = [];
    for (const t of iesire) {
      const ult = final[final.length - 1];
      if (t.t === 'str' && ult && ult.t === 'str') { ult.v += t.v; continue; }
      final.push(t);
    }
    return { jetoane: final, includeri, definitii, avertismente };
  }

  M.lexer = { tokenizeaza, preproceseaza, EroareCompilare };
})(window.M = window.M || {});
