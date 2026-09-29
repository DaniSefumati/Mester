/* Meșter — fila „Web”: calculatorul din aceeași rețea cu placa. Are bară de adresă, deschide paginile servite
   de ESP32 (WebServer, WiFiServer, ESPAsyncWebServer) într-un cadru izolat, iar cererile paginii (fetch,
   XMLHttpRequest, WebSocket, EventSource, linkuri și formulare) ajung la placa simulată. Jurnalul arată
   cererile în ambele sensuri și permite scrierea răspunsurilor pentru serverele de pe internet. */
(function (M) {
  'use strict';
  const { $, el, esc } = M.u;

  // scriptul pus în fiecare pagină a plăcii: trimite cererile paginii către aplicație
  function SHIM(ACUM) {
    const ORIGINE = new URL(ACUM).origin;
    const P = (m) => parent.postMessage(Object.assign({ __mester: 1 }, m), '*');
    let urm = 1;
    const asteptari = new Map(), socluri = new Map();
    const absolut = (u) => {
      u = String(u == null ? '' : u);
      if (/^[a-z]+:\/\/\//i.test(u)) u = u.replace(/^[a-z]+:\/\//i, '');
      if (/^wss?:\/\//i.test(u)) u = u.replace(/^ws/i, 'http');
      try { return new URL(u, ACUM).href; } catch (e) { return u; }
    };
    window.addEventListener('message', (e) => {
      const d = e.data;
      if (!d || !d.__mester) return;
      if (d.tip === 'raspuns') { const a = asteptari.get(d.id); if (a) { asteptari.delete(d.id); a(d); } return; }
      const s = socluri.get(d.id);
      if (s) s.__primeste(d);
    });
    const cere = (url, metoda, corp, tip) => new Promise((rez) => { const id = urm++; asteptari.set(id, rez); P({ tip: 'cerere', id, url: absolut(url), metoda, corp, tipCorp: tip }); });
    const corpDin = (corp, tip) => {
      if (corp == null) return ['', tip || ''];
      if (corp instanceof URLSearchParams) return [corp.toString(), tip || 'application/x-www-form-urlencoded'];
      if (typeof FormData !== 'undefined' && corp instanceof FormData) return [new URLSearchParams(corp).toString(), tip || 'application/x-www-form-urlencoded'];
      return [String(corp), tip || 'text/plain;charset=UTF-8'];
    };
    window.fetch = function (intrare, opt) {
      opt = opt || {};
      const url = typeof intrare === 'string' ? intrare : (intrare && intrare.url) || String(intrare);
      const metoda = String(opt.method || (intrare && intrare.method) || 'GET').toUpperCase();
      let tip = '';
      try { tip = new Headers(opt.headers || {}).get('Content-Type') || ''; } catch (e) { /* antete ciudate */ }
      const [corp, tipCorp] = corpDin(opt.body, tip);
      return cere(url, metoda, corp, tipCorp).then((r) => {
        if (r.eroare) throw new TypeError('Failed to fetch');
        const faraCorp = r.cod === 204 || r.cod === 304 || metoda === 'HEAD';
        return new Response(faraCorp ? null : r.corp, { status: r.cod, headers: { 'Content-Type': r.tipR || 'text/plain' } });
      });
    };
    class XHR {
      constructor() { this.readyState = 0; this.status = 0; this.statusText = ''; this.responseText = ''; this.response = ''; this.responseType = ''; this.timeout = 0; this._asc = {}; this._ant = {}; }
      open(m, u) { this._m = String(m).toUpperCase(); this._u = u; this.readyState = 1; this._ev('readystatechange'); }
      setRequestHeader(k, v) { this._ant[String(k).toLowerCase()] = v; }
      getResponseHeader(k) { return String(k).toLowerCase() === 'content-type' ? this._tip || null : null; }
      getAllResponseHeaders() { return this._tip ? 'content-type: ' + this._tip + '\r\n' : ''; }
      overrideMimeType() { }
      abort() { this._anulat = true; }
      addEventListener(t, f) { (this._asc[t] = this._asc[t] || []).push(f); }
      removeEventListener(t, f) { this._asc[t] = (this._asc[t] || []).filter(x => x !== f); }
      _ev(t) { const e = { type: t, target: this, currentTarget: this }; const h = this['on' + t]; if (typeof h === 'function') h.call(this, e); for (const f of (this._asc[t] || [])) f.call(this, e); }
      send(corp) {
        const [c, tip] = corpDin(corp, this._ant['content-type']);
        cere(this._u, this._m || 'GET', c, tip).then((r) => {
          if (this._anulat) return;
          if (r.eroare) { this.readyState = 4; this.status = 0; this._ev('readystatechange'); this._ev('error'); this._ev('loadend'); return; }
          this.status = r.cod; this.statusText = r.cod === 200 ? 'OK' : ''; this._tip = r.tipR;
          this.responseText = r.corp;
          this.response = this.responseType === 'json' ? (() => { try { return JSON.parse(r.corp); } catch (e) { return null; } })() : r.corp;
          this.readyState = 2; this._ev('readystatechange');
          this.readyState = 3; this._ev('readystatechange');
          this.readyState = 4; this._ev('readystatechange');
          this._ev('load'); this._ev('loadend');
        });
      }
    }
    XHR.UNSENT = 0; XHR.OPENED = 1; XHR.HEADERS_RECEIVED = 2; XHR.LOADING = 3; XHR.DONE = 4;
    window.XMLHttpRequest = XHR;
    const cale = (u) => { try { const x = new URL(absolut(u)); return x.pathname + x.search; } catch (e) { return '/'; } };
    class Soclu extends EventTarget {
      constructor(u, tip) {
        super();
        this.url = String(u); this.readyState = 0; this._id = urm++; this._tip = tip;
        socluri.set(this._id, this);
        P({ tip: tip + '-deschide', id: this._id, cale: cale(u) });
      }
      _emite(t, extra) {
        const e = new Event(t);
        if (extra) for (const k in extra) Object.defineProperty(e, k, { value: extra[k] });
        const h = this['on' + t];
        if (typeof h === 'function') h.call(this, e);
        this.dispatchEvent(e);
      }
      close() { if (this.readyState >= 2) return; this.readyState = this._tip === 'sse' ? 2 : 3; P({ tip: this._tip + '-inchide', id: this._id }); if (this._tip === 'ws') this._emite('close', { code: 1000, reason: '', wasClean: true }); }
    }
    class WS extends Soclu {
      constructor(u) { super(u, 'ws'); this.protocol = ''; this.binaryType = 'blob'; this.bufferedAmount = 0; }
      send(t) { if (this.readyState !== 1) throw new DOMException('WebSocket is not open', 'InvalidStateError'); P({ tip: 'ws-trimite', id: this._id, text: String(t) }); }
      __primeste(d) {
        if (d.tip === 'ws-deschis') { this.readyState = 1; this._emite('open'); }
        else if (d.tip === 'ws-mesaj') this._emite('message', { data: d.mesaj });
        else if (d.tip === 'ws-inchis' || d.tip === 'ws-eroare') { const era = this.readyState; this.readyState = 3; if (d.tip === 'ws-eroare') this._emite('error'); if (era !== 3) this._emite('close', { code: d.tip === 'ws-eroare' ? 1006 : 1000, reason: '', wasClean: d.tip !== 'ws-eroare' }); }
      }
    }
    WS.CONNECTING = 0; WS.OPEN = 1; WS.CLOSING = 2; WS.CLOSED = 3;
    window.WebSocket = WS;
    class ES extends Soclu {
      constructor(u) { super(u, 'sse'); this.withCredentials = false; }
      __primeste(d) {
        if (d.tip === 'sse-deschis') { this.readyState = 1; this._emite('open'); }
        else if (d.tip === 'sse-mesaj') this._emite(d.eveniment || 'message', { data: d.mesaj, lastEventId: String(d.idMsg || '') });
        else if (d.tip === 'sse-eroare') { this._emite('error'); }
      }
    }
    ES.CONNECTING = 0; ES.OPEN = 1; ES.CLOSED = 2;
    window.EventSource = ES;
    // linkurile și formularele merg tot la placă
    document.addEventListener('click', (e) => {
      const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a || e.defaultPrevented) return;
      const h = a.getAttribute('href');
      if (!h || h[0] === '#' || /^javascript:/i.test(h)) return;
      e.preventDefault();
      if (/^(https?:)?\/\//i.test(h) && absolut(h).indexOf(ORIGINE) !== 0) { P({ tip: 'extern', url: h }); return; }
      P({ tip: 'navigheaza', url: absolut(h) });
    }, false);
    document.addEventListener('submit', (e) => {
      if (e.defaultPrevented) return;
      e.preventDefault();
      const f = e.target;
      const date = new FormData(f);
      if (e.submitter && e.submitter.name) date.append(e.submitter.name, e.submitter.value);
      const q = new URLSearchParams(date).toString();
      const metoda = String(f.getAttribute('method') || 'GET').toUpperCase();
      const act = absolut(f.getAttribute('action') || ACUM);
      if (metoda === 'GET') P({ tip: 'navigheaza', url: act.split('?')[0] + (q ? '?' + q : '') });
      else P({ tip: 'navigheaza', url: act, metoda, corp: q, tipCorp: 'application/x-www-form-urlencoded' });
    });
    // location.href = '/on', location.reload() (în browserele care au Navigation API)
    if (window.navigation && navigation.addEventListener) {
      navigation.addEventListener('navigate', (e) => {
        if (e.hashChange || e.downloadRequest || !e.cancelable) return;
        e.preventDefault();
        if (e.navigationType === 'reload') { P({ tip: 'reincarca' }); return; }
        const u = e.destination && e.destination.url;
        if (u && u !== 'about:srcdoc') P({ tip: 'navigheaza', url: absolut(u.replace(/^about:srcdoc/, '')) });
      });
    }
    window.alert = (m) => P({ tip: 'alerta', text: String(m) });
    window.confirm = (m) => { P({ tip: 'alerta', text: String(m) }); return true; };
    window.prompt = () => null;
    window.addEventListener('error', (ev) => P({ tip: 'eroare-js', text: String(ev.message || 'eroare'), linie: ev.lineno || 0 }));
    const err = console.error.bind(console);
    console.error = (...a) => { P({ tip: 'consola', text: a.map(String).join(' ') }); err(...a); };
    document.addEventListener('DOMContentLoaded', () => P({ tip: 'gata' }));
  }

  // placa lucrează cu octeți UTF-8; browserul cu litere
  const litere = (s) => { s = String(s == null ? '' : s); try { return /[\x80-\xff]/.test(s) ? decodeURIComponent(escape(s)) : s; } catch (e) { return s; } };
  const octeti = (s) => { try { return unescape(encodeURIComponent(String(s == null ? '' : s))); } catch (e) { return String(s); } };
  const TEXT_COD = { 200: 'OK', 201: 'Created', 204: 'No Content', 301: 'Moved Permanently', 302: 'Found', 303: 'See Other', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 500: 'Internal Server Error' };

  M.Browser = class {
    constructor(app) {
      this.app = app;
      this.cale = '/';
      this.istoric = [];
      this.vedere = 'pagina';
      this.jurnal = [];
      this.conexiuni = new Map();
      this.token = 0;
      this.construieste();
      window.addEventListener('message', (e) => this.laMesaj(e));
      this.arataMesaj('oprit');
    }
    construieste() {
      const b = $('#bara-web');
      b.innerHTML = '';
      this.btnInapoi = el('button', { class: 'btn icon', title: 'Înapoi', 'aria-label': 'Înapoi', html: M.icon('inapoi'), on: { click: () => this.inapoi() } });
      this.btnReincarca = el('button', { class: 'btn icon', title: 'Reîncarcă pagina', 'aria-label': 'Reîncarcă', html: M.icon('reincarca'), on: { click: () => this.reincarca() } });
      this.adresa = el('input', { class: 'camp mono adresa-web', id: 'adresa-web', type: 'text', spellcheck: false, autocomplete: 'off', 'aria-label': 'Adresa paginii', placeholder: 'http://adresa-plăcii/' });
      const form = el('form', { class: 'form-adresa', on: { submit: (e) => { e.preventDefault(); this.navigheazaDinBara(); } } }, this.adresa);
      this.btnJurnal = el('button', { class: 'btn', title: 'Cererile dintre browser, placă și internet', html: M.icon('lista') + '<span>Jurnal</span>', on: { click: () => this.comutaVedere() } });
      b.append(this.btnInapoi, this.btnReincarca, form, this.btnJurnal);
      this.stare = $('#stare-web');
      this.cadru = $('#cadru-web');
      this.mesaj = $('#mesaj-web');
      this.lista = $('#jurnal-web');
      this.actualizeazaButoane();
    }
    get sim() { return this.app.simuleaza ? this.app.sim : null; }

    // ---------- legătura cu simularea ----------
    laSimNoua(sim) {
      this.token++;
      this.inchideConexiuni();
      this.cale = '/';
      this.istoric = [];
      this.jurnal = [];
      this.deIncarcat = true;
      this.golesteCadru();
      sim.on('retea', (d) => this.laEveniment(d));
      this.arataMesaj('asteapta');
      this.actualizeazaStare();
      this.randeazaJurnal();
    }
    laOprire() {
      this.token++;
      this.inchideConexiuni();
      this.actualizeazaStare();
      if (!this.areContinut) this.arataMesaj('oprit');
      else this.stare.dataset.offline = '1';
    }
    laEveniment(d) {
      if (d.tip === 'jurnal') { this.adaugaJurnal(d); return; }
      if (d.tip === 'reset') { this.inchideConexiuni(); this.deIncarcat = true; }
      this.actualizeazaStare();
      if ((d.tip === 'server' || d.tip === 'conectat' || d.tip === 'ap') && this.deIncarcat) {
        const r = M.web.rezumat(this.app.sim);
        if ((r.ip || r.ap) && r.servere.length) {
          this.deIncarcat = false;
          const tk = this.token;
          setTimeout(() => { if (tk === this.token) this.navigheaza('/', { faraIstoric: true }); }, 350);
        }
      }
      if (d.tip === 'deconectat' || d.tip === 'router') this.inchideConexiuni(true);
    }
    laArata() {
      this.actualizeazaStare();
      if (this.vedere === 'jurnal') this.randeazaJurnal();
    }
    gazda() {
      const sim = this.app.sim;
      if (!sim) return '';
      const r = M.web.rezumat(sim);
      return r.ip || (r.ap && r.ap.ip) || '';
    }
    actualizeazaStare() {
      const sim = this.app.sim;
      const st = this.stare;
      st.innerHTML = '';
      delete st.dataset.offline;
      if (!sim || !this.app.simuleaza) {
        st.dataset.nivel = 'oprit';
        st.append(el('span', { class: 'punct-stare' }), el('span', { text: 'Simularea e oprită. Pornește-o ca placa să intre în rețea.' }));
        this.actualizeazaButoane();
        return;
      }
      const r = M.web.rezumat(sim);
      let text, nivel;
      if (r.ip) { text = 'În rețeaua „' + r.ssid + '” · ' + r.ip + (r.mdns ? ' · ' + r.mdns + '.local' : '') + ' · ' + r.rssi + ' dBm'; nivel = 'ok'; }
      else if (r.ap) { text = 'Punct de acces „' + r.ap.ssid + '” · ' + r.ap.ip + ' · calculatorul e conectat la el'; nivel = 'ok'; }
      else if (r.stare === 6 || r.stare === 1 || r.stare === 5) { text = r.routerOprit ? 'Routerul e oprit: placa încearcă să se reconecteze la „' + r.ssid + '”…' : 'Placa se conectează la „' + r.ssid + '”…'; nivel = 'asteapta'; }
      else if (r.stare === 4) { text = 'Conectarea la WiFi a eșuat (vezi Verificare).'; nivel = 'eroare'; }
      else { text = 'WiFi-ul plăcii e oprit. În cod: WiFi.begin("rețea", "parolă") sau WiFi.softAP("nume").'; nivel = 'oprit'; }
      st.dataset.nivel = nivel;
      st.append(el('span', { class: 'punct-stare' }), el('span', { class: 'text-stare', text }));
      if (r.ssid || r.ip) {
        st.append(el('button', { class: 'btn mic' + (r.routerOprit ? ' activ' : ''), title: 'Oprește sau pornește routerul, ca să vezi cum se descurcă placa fără rețea', text: r.routerOprit ? 'Pornește routerul' : 'Oprește routerul', on: { click: () => { M.web.router(sim, r.routerOprit); this.actualizeazaStare(); } } }));
      }
      if (!this.adresa.matches(':focus')) this.adresa.value = this.gazda() ? 'http://' + this.gazda() + this.cale : '';
      this.actualizeazaButoane();
    }
    actualizeazaButoane() {
      this.btnInapoi.disabled = !this.istoric.length;
      this.btnReincarca.disabled = !this.app.simuleaza;
      this.btnJurnal.classList.toggle('activ', this.vedere === 'jurnal');
    }

    // ---------- navigarea ----------
    navigheazaDinBara() {
      let v = this.adresa.value.trim();
      if (!v) return;
      if (!/^https?:\/\//i.test(v)) v = v.startsWith('/') ? v : (/^[\w.-]+(:\d+)?(\/|$)/.test(v) && /\./.test(v.split('/')[0]) ? 'http://' + v : '/' + v);
      this.adresa.blur();
      this.navigheaza(v);
    }
    inapoi() { const u = this.istoric.pop(); if (u) this.navigheaza(u, { faraIstoric: true }); this.actualizeazaButoane(); }
    reincarca() { this.navigheaza(this.url || '/', { faraIstoric: true }); }
    async navigheaza(url, opt) {
      opt = opt || {};
      if (this.vedere !== 'pagina') this.comutaVedere('pagina');
      const sim = this.sim;
      if (!sim) { this.arataMesaj('oprit'); return; }
      clearTimeout(this.timerRefresh);
      const tk = ++this.token;
      const gazda = this.gazda();
      let u = String(url);
      if (!/^https?:\/\//i.test(u)) u = 'http://' + (gazda || '0.0.0.0') + (u.startsWith('/') ? '' : '/') + u;
      if (!opt.faraIstoric && this.url && this.url !== u) this.istoric.push(this.url);
      this.url = u;
      try { const x = new URL(u); this.cale = x.pathname + x.search; this.adresa.value = x.href; } catch (e) { this.adresa.value = u; }
      this.stare.dataset.incarca = '1';
      this.actualizeazaButoane();
      let r;
      for (let salt = 0; ; salt++) {
        r = await this.cere(sim, { url: this.url, metoda: opt.metoda, corp: opt.corp, tip: opt.tipCorp });
        if (tk !== this.token) return;
        const loc = r && r.anteturi && (r.anteturi.Location || r.anteturi.location);
        if (!r.eroare && r.cod >= 300 && r.cod < 400 && loc && salt < 5) {
          this.url = new URL(loc, this.url).href;
          try { const x = new URL(this.url); this.cale = x.pathname + x.search; } catch (e) { /* rămâne */ }
          this.adresa.value = this.url;
          opt = { faraIstoric: true };
          continue;
        }
        break;
      }
      delete this.stare.dataset.incarca;
      if (r.eroare) { this.arataEroare(r.eroare); return; }
      this.afiseaza(r);
    }
    // cerere către placă, cu limită în timp real (simularea poate fi pe pauză)
    cere(sim, c) {
      return Promise.race([
        M.web.cerere(sim, c),
        new Promise(rez => setTimeout(() => rez({ eroare: 'Placa nu a răspuns în 15 secunde' + (sim.stare === 'pauza' ? ' (simularea e pe pauză).' : '.') }), 15000))
      ]);
    }
    afiseaza(r) {
      this.inchideConexiuni();
      const tip = String(r.tip || '').toLowerCase();
      this.ascundeMesaj();
      this.areContinut = true;
      if (/html/.test(tip)) {
        this.pregatesteHtml(litere(r.corp), this.url).then(html => { if (html) this.cadru.srcdoc = html; });
      } else {
        let text = litere(r.corp);
        let json = false;
        if (/json/.test(tip) || /^\s*[[{]/.test(text)) { try { text = JSON.stringify(JSON.parse(text), null, 2); json = true; } catch (e) { /* rămâne textul */ } }
        const cap = r.cod !== 200 ? '<p class="cod">HTTP ' + r.cod + ' ' + esc(TEXT_COD[r.cod] || '') + '</p>' : '';
        this.cadru.srcdoc = '<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:14px 16px;font:13px/1.5 ui-monospace,Consolas,monospace;color:#1d2622;background:#fff}pre{margin:0;white-space:pre-wrap;word-break:break-word}.cod{margin:0 0 10px;font:600 13px system-ui,sans-serif;color:#b3261e}.gol{color:#7a8a83;font-family:system-ui,sans-serif}@media (prefers-color-scheme:dark){body{background:#101714;color:#d7e6de}}</style>' + cap + (text ? '<pre' + (json ? ' class="json"' : '') + '>' + esc(text) + '</pre>' : '<p class="gol">(răspuns gol)</p>');
      }
    }
    // pregătește pagina plăcii: CSS/JS servite tot de placă se pun în pagină, meta refresh devine temporizator
    async pregatesteHtml(html, baza) {
      const sim = this.sim;
      const tk = this.token;
      const gazdaBaza = new URL(baza).host;
      const local = (h) => { if (!h || /^(data:|blob:|#)/i.test(h)) return false; try { const u = new URL(h, baza); return u.host === gazdaBaza; } catch (e) { return false; } };
      const inlocuiri = [];
      const reLink = /<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi, reScript = /<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi;
      for (const m of html.matchAll(reLink)) {
        const h = (/href=["']([^"']+)["']/i.exec(m[0]) || [])[1];
        if (local(h)) inlocuiri.push({ text: m[0], url: new URL(h, baza).href, fel: 'css' });
      }
      for (const m of html.matchAll(reScript)) if (local(m[2])) inlocuiri.push({ text: m[0], url: new URL(m[2], baza).href, fel: 'js' });
      for (const x of inlocuiri) {
        if (!sim) break;
        const r = await this.cere(sim, { url: x.url });
        if (tk !== this.token) return '';
        const corp = r.eroare || r.cod !== 200 ? '' : litere(r.corp);
        html = html.replace(x.text, x.fel === 'css' ? '<style>\n' + corp.replace(/<\/style/gi, '<\\/style') + '\n</style>' : '<script>\n' + corp.replace(/<\/script/gi, '<\\/script') + '\n</script>');
      }
      const refresh = /<meta\b[^>]*http-equiv=["']?refresh["']?[^>]*>/i.exec(html);
      if (refresh) {
        const c = (/content=["']([^"']*)["']/i.exec(refresh[0]) || [])[1] || '';
        const m = /^\s*(\d+(?:\.\d+)?)\s*(?:[;,]\s*url\s*=\s*['"]?([^'"]+))?/i.exec(c);
        html = html.replace(refresh[0], '');
        if (m) {
          const sec = Math.max(0.5, parseFloat(m[1]));
          const tinta = m[2] ? new URL(m[2].trim(), baza).href : null;
          this.timerRefresh = setTimeout(() => { if (tk === this.token && this.vedere === 'pagina') this.navigheaza(tinta || this.url, { faraIstoric: !tinta }); }, sec * 1000);
        }
      }
      const shim = '<base href="' + esc(baza) + '"><script>(' + SHIM.toString() + ')(' + JSON.stringify(baza) + ');<\/script>';
      if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (h) => h + shim);
      if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (h) => h + '<head>' + shim + '</head>');
      return '<!doctype html><head><meta charset="utf-8">' + shim + '</head>' + html;
    }
    golesteCadru() { this.cadru.srcdoc = ''; this.areContinut = false; }

    // ---------- mesajele din pagina plăcii ----------
    laMesaj(e) {
      if (!this.cadru || e.source !== this.cadru.contentWindow) return;
      const d = e.data;
      if (!d || !d.__mester) return;
      const trimite = (m) => { try { this.cadru.contentWindow.postMessage(Object.assign({ __mester: 1 }, m), '*'); } catch (x) { /* cadrul s-a schimbat */ } };
      const sim = this.sim;
      switch (d.tip) {
        case 'cerere': {
          // placa e oprită: ca un dispozitiv scos din priză, cererea rămâne fără răspuns (nu umplem consola cu erori)
          if (!sim) return;
          this.cere(sim, { url: d.url, metoda: d.metoda, corp: octeti(d.corp), tip: d.tipCorp }).then(r => trimite({ tip: 'raspuns', id: d.id, eroare: r.eroare, cod: r.cod, corp: litere(r.corp), tipR: r.tip }));
          return;
        }
        case 'navigheaza': this.navigheaza(d.url, { metoda: d.metoda, corp: d.corp, tipCorp: d.tipCorp }); return;
        case 'reincarca': this.reincarca(); return;
        case 'extern': M.dialog.notifica('Linkul duce în afara rețelei plăcii: ' + d.url, 3500); return;
        case 'alerta': M.dialog.notifica('Pagina plăcii: ' + d.text, 4000); return;
        case 'eroare-js': case 'consola': this.adaugaJurnal({ dir: 'js', text: d.text, linie: d.linie, t: sim ? sim.timp : 0 }); return;
        case 'ws-deschide': case 'sse-deschide': {
          const fel = d.tip.startsWith('ws') ? 'ws' : 'sse';
          const c = sim ? M.web.conecteaza(sim, d.cale, fel, (m) => {
            if (m.tip === 'ws') trimite({ tip: 'ws-mesaj', id: d.id, mesaj: litere(m.mesaj) });
            else if (m.tip === 'ws-inchis') { trimite({ tip: 'ws-inchis', id: d.id }); this.conexiuni.delete(d.id); }
            else if (m.tip === 'sse') trimite({ tip: 'sse-mesaj', id: d.id, mesaj: litere(m.mesaj), eveniment: m.eveniment, idMsg: m.id });
          }) : null;
          if (!c) {
            trimite({ tip: fel + '-eroare', id: d.id });
            this.adaugaJurnal({ dir: 'intrare', metoda: fel === 'ws' ? 'WS' : 'SSE', url: d.cale, cod: 404, t: sim ? sim.timp : 0 });
            return;
          }
          this.conexiuni.set(d.id, { c, fel, trimite });
          trimite({ tip: fel + '-deschis', id: d.id });
          this.adaugaJurnal({ dir: 'intrare', metoda: fel === 'ws' ? 'WS' : 'SSE', url: d.cale, cod: 101, t: sim.timp });
          return;
        }
        case 'ws-trimite': { const x = this.conexiuni.get(d.id); if (x && x.c.trimite) x.c.trimite(octeti(d.text)); return; }
        case 'ws-inchide': case 'sse-inchide': { const x = this.conexiuni.get(d.id); if (x) { x.c.inchide(); this.conexiuni.delete(d.id); } return; }
      }
    }
    inchideConexiuni(anunta) {
      for (const [id, x] of this.conexiuni) {
        try { x.c.inchide(); } catch (e) { /* simularea s-a oprit */ }
        if (anunta) x.trimite({ tip: x.fel + '-' + (x.fel === 'ws' ? 'inchis' : 'eroare'), id });
      }
      this.conexiuni.clear();
    }

    // ---------- mesaje în locul paginii ----------
    arataMesaj(fel) {
      const M2 = {
        oprit: ['Pagina plăcii', 'Când placa pornește un server web, pagina lui se deschide aici, ca pe un calculator din aceeași rețea. Pornește simularea.'],
        asteapta: ['Aștept placa', 'Pagina se deschide singură după ce placa intră în rețea și pornește serverul (server.begin()). Poți scrie și o adresă mai sus.']
      }[fel];
      this.areContinut = false;
      this.cadru.srcdoc = '';
      this.mesaj.innerHTML = '';
      this.mesaj.append(el('div', { class: 'icon-mesaj', html: M.icon('glob') }), el('h3', { text: M2[0] }), el('p', { text: M2[1] }));
      this.mesaj.classList.remove('ascuns');
      this.mesaj.dataset.fel = fel;
    }
    arataEroare(text) {
      this.areContinut = false;
      this.cadru.srcdoc = '';
      this.mesaj.innerHTML = '';
      this.mesaj.append(el('div', { class: 'icon-mesaj eroare', html: M.icon('glob') }), el('h3', { text: 'Pagina nu se poate deschide' }), el('p', { text }),
        el('button', { class: 'btn', text: 'Încearcă din nou', on: { click: () => this.reincarca() } }));
      this.mesaj.classList.remove('ascuns');
      this.mesaj.dataset.fel = 'eroare';
    }
    ascundeMesaj() { this.mesaj.classList.add('ascuns'); }

    // ---------- jurnalul ----------
    comutaVedere(v) {
      this.vedere = v || (this.vedere === 'pagina' ? 'jurnal' : 'pagina');
      $('#gazda-web').classList.toggle('ascuns', this.vedere !== 'pagina');
      this.lista.classList.toggle('ascuns', this.vedere !== 'jurnal');
      if (this.vedere === 'jurnal') this.randeazaJurnal();
      this.actualizeazaButoane();
    }
    adaugaJurnal(d) {
      this.jurnal.push(d);
      if (this.jurnal.length > 300) this.jurnal.shift();
      if (this.vedere === 'jurnal' && this.app.fila === 'web') {
        clearTimeout(this.timerJurnal);
        this.timerJurnal = setTimeout(() => this.randeazaJurnal(), 150);
      }
    }
    randeazaJurnal() {
      const L = this.lista;
      const jos = L.scrollHeight - L.scrollTop - L.clientHeight < 40;
      L.innerHTML = '';
      const salvate = this.app.proiect.internet || [];
      if (salvate.length) {
        const sec = el('div', { class: 'raspunsuri-salvate' }, el('h4', { text: 'Răspunsuri scrise de tine pentru internet' }));
        salvate.forEach((r, i) => sec.append(el('div', { class: 'raspuns-salvat' },
          el('span', { class: 'mono url-jurnal', text: (r.metoda ? r.metoda + ' ' : '') + r.url + '*' }),
          el('span', { class: 'cod-jurnal', text: String(r.cod || 200) }),
          el('button', { class: 'btn mic', text: 'Editează', on: { click: () => this.editeazaRaspuns({ url: r.url }, i) } }),
          el('button', { class: 'btn mic pericol', text: 'Șterge', on: { click: () => { salvate.splice(i, 1); this.app.schimbare('internet'); this.randeazaJurnal(); } } }))));
        L.append(sec);
      }
      if (!this.jurnal.length) {
        L.append(el('p', { class: 'gol-jurnal', text: 'Aici apar cererile: ↓ ce cere browserul de la placă, ↑ ce cere placa de pe internet (HTTPClient). Pentru un server care nu e cunoscut, poți scrie tu răspunsul.' }));
        return;
      }
      for (const d of this.jurnal) L.append(this.randJurnal(d));
      if (jos) L.scrollTop = L.scrollHeight;
    }
    randJurnal(d) {
      const t = (d.t / 1e6).toFixed(2) + ' s';
      if (d.dir === 'js') return el('div', { class: 'rand-jurnal js' }, el('span', { class: 'timp-jurnal', text: t }), el('span', { class: 'dir-jurnal', text: 'JS' }), el('span', { class: 'url-jurnal', text: d.text + (d.linie ? ' (linia ' + d.linie + ')' : '') }));
      const cls = d.eroare || d.cod < 0 ? 'eroare' : d.cod >= 400 ? 'avert' : 'ok';
      const sursa = d.sursa === 'exemplu' ? 'exemplu' : d.sursa === 'proiect' ? 'scris de tine' : d.sursa === 'internet' ? 'internet' : '';
      const r = el('details', { class: 'rand-jurnal ' + d.dir },
        el('summary', {},
          el('span', { class: 'timp-jurnal', text: t }),
          el('span', { class: 'dir-jurnal', title: d.dir === 'intrare' ? 'Browser → placă' : 'Placă → internet', text: d.dir === 'intrare' ? '↓' : '↑' }),
          el('span', { class: 'metoda-jurnal', text: d.metoda || 'GET' }),
          el('span', { class: 'mono url-jurnal', text: litere(d.url) }),
          sursa ? el('span', { class: 'sursa-jurnal', text: sursa }) : null,
          el('span', { class: 'cod-jurnal ' + cls, text: d.cod === -1 ? 'eșuat' : d.cod === -11 ? 'timeout' : String(d.cod) })));
      const corp = d.corp ? litere(d.corp) : '';
      if (corp) r.append(el('pre', { class: 'corp-jurnal', text: corp.length > 3000 ? corp.slice(0, 3000) + '\n…' : corp }));
      if (d.dir === 'iesire') r.append(el('div', { class: 'actiuni-jurnal' }, el('button', { class: 'btn mic', text: 'Scrie răspunsul serverului', on: { click: () => this.editeazaRaspuns(d) } })));
      return r;
    }
    // răspunsul pe care îl dă „internetul” pentru o adresă (se salvează în proiect)
    editeazaRaspuns(d, index) {
      const p = this.app.proiect;
      p.internet = p.internet || [];
      const vechi = index !== undefined ? p.internet[index] : null;
      const url = vechi ? vechi.url : String(d.url || '').split('?')[0];
      const campUrl = el('input', { class: 'camp mono', id: 'raspuns-url', value: url });
      const campCod = el('input', { class: 'camp', id: 'raspuns-cod', type: 'number', min: 100, max: 599, value: vechi ? vechi.cod : 200 });
      const campTip = el('select', { class: 'camp', id: 'raspuns-tip' });
      for (const x of ['application/json', 'text/plain', 'text/html']) campTip.append(el('option', { value: x, text: x, selected: vechi ? vechi.tip === x : x === 'application/json' }));
      const campCorp = el('textarea', { class: 'camp mono', id: 'raspuns-corp', rows: 8, spellcheck: false, value: vechi ? vechi.corp : (d.corp && d.sursa === 'exemplu' ? litere(d.corp) : '{\n  "temperatura": 21.5\n}') });
      const f = el('div', { class: 'form-raspuns' },
        el('p', { class: 'nota', text: 'Placa primește acest răspuns pentru orice adresă care începe așa (parametrii din ?… nu contează).' }),
        el('label', { text: 'Adresa' }), campUrl,
        el('div', { class: 'rand-campuri' }, el('label', {}, 'Cod HTTP', campCod), el('label', {}, 'Tip', campTip)),
        el('label', { text: 'Conținut' }), campCorp);
      M.dialog.deschide({
        titlu: 'Răspunsul serverului', continut: f, butoane: [
          { text: 'Renunță' },
          { text: 'Salvează', clasa: 'principal', actiune: () => {
            const r = { url: campUrl.value.trim(), cod: +campCod.value || 200, tip: campTip.value, corp: campCorp.value };
            if (!/^https?:\/\//i.test(r.url)) { M.dialog.notifica('Adresa trebuie să înceapă cu http:// sau https://'); return false; }
            if (vechi) p.internet[index] = r; else { const i = p.internet.findIndex(x => x.url === r.url); if (i >= 0) p.internet[i] = r; else p.internet.push(r); }
            this.app.schimbare('internet');
            this.randeazaJurnal();
            M.dialog.notifica('Salvat. Placa primește răspunsul la următoarea cerere.');
          } }
        ]
      });
    }
  };
})(window.M = window.M || {});
