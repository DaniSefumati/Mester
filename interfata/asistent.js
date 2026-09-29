/* Meșter — asistentul: o discuție despre proiectul deschis, cu Claude (în aplicația Claude) sau cu un AI gratuit
   ales de utilizator (Google Gemini, Groq sau alt serviciu compatibil OpenAI, pe cheia lui). Asistentul vede
   schema (piesele și legăturile), codul, erorile și ce a scris placa în monitorul serial, și poate lucra în
   proiect: scrie codul, adaugă și leagă piese, le schimbă proprietățile, rulează simularea și citește ce afișează
   placa (tot ce schimbă în schemă se poate anula). */
(function (M) {
  'use strict';
  const { $, el, esc } = M.u;

  const INSTRUCTIUNI = `Ești asistentul din Meșter, o aplicație în care oamenii montează circuite pe un breadboard virtual cu plăci ESP32 (și ESP8266, ESP32-S3, ESP32-C3, Arduino Nano) și le simulează cu codul lor Arduino.
Răspunde mereu în limba română, cu diacritice, prietenos și clar, ca un profesor bun de electronică. Mulți utilizatori sunt începători: explică pe scurt de ce, nu doar ce.
Reguli:
- Când scrii cod, e C++ Arduino pentru placa din proiect (pentru ESP32: nucleul Arduino-ESP32 3.x). Comentariile sunt în română; textele trimise pe Serial sunt fără diacritice.
- Un program complet îl pui într-un singur bloc \`\`\`cpp. Pentru modificări mici poți arăta doar bucata schimbată.
- Folosește numai bibliotecile pe care le simulează aplicația: DHT, OneWire/DallasTemperature, Adafruit SSD1306/SH110X/GFX/ILI9341/ST7789/NeoPixel/BME280/BMP280/MPU6050, U8g2, TFT_eSPI, LiquidCrystal(_I2C), TM1637Display, LedControl, FastLED, ESP32Servo, Stepper, AccelStepper, RTClib, MFRC522, IRremote, TinyGPS++, DFRobotDFPlayerMini, BH1750, HX711, NewPing, SD, LittleFS, Preferences, WiFi, WebServer, ESPAsyncWebServer, HTTPClient, ArduinoJson, BluetoothSerial, FreeRTOS, I2S.
- Pinii: pe ESP32, GPIO 34–39 sunt doar intrări; GPIO 6–11 sunt ai memoriei flash; ADC2 nu merge cu WiFi pornit; tensiunea maximă pe un pin e 3,3 V.
- Când îți lipsește o informație importantă, întreabă scurt. Nu inventa piese care nu sunt în schemă: spune ce ar trebui adăugat.`;

  const DESPRE_UNELTE = `
Ai unelte cu care lucrezi direct în proiect (tot ce schimbi în schemă se poate anula cu Ctrl+Z):
- adauga_piesa, leaga, sterge_piesa, schimba_proprietate construiesc schema. Leagă toți pinii de care e nevoie (alimentare, masă, semnal) și pune rezistor la LED-uri.
- scrie_codul pune programul complet în editor și îl compilează; dacă întoarce o eroare, repar-o și scrie din nou. citeste_codul arată liniile codului, cu numere.
- ruleaza_simularea pornește simularea câteva secunde și îți arată ce a scris placa pe Serial și problemele; opreste_simularea o oprește. Schema se schimbă doar cu simularea oprită.
- seteaza_valoare_simulata schimbă ce „simt” senzorii (temperatură, distanță, lumină...) ca să testezi codul.
- verifica_proiectul întoarce problemele din cod și din schemă.
Folosește uneltele doar când omul îți cere să construiești, să schimbi, să repari sau să testezi ceva; la întrebări obișnuite răspunde direct. După ce ai pus codul în editor cu scrie_codul, nu-l mai repeta întreg în răspuns: spune pe scurt ce face și ce ai schimbat. La final spune pe scurt ce ai făcut.`;

  // mesajele pentru codurile de eroare ale lui sample() (Claude)
  const ERORI = {
    rate_limited: 'Prea multe întrebări într-un timp scurt sau ai atins limita contului tău Claude. Încearcă din nou puțin mai târziu.',
    session_expired: 'Sesiunea a expirat: autentifică-te din nou în Claude, apoi reîncearcă.',
    refused: 'Claude nu a răspuns la această cerere. Reformulează întrebarea.',
    empty_completion: 'Nu a venit niciun răspuns. Încearcă o întrebare mai scurtă.',
    prompt_too_large: 'Proiectul e prea mare pentru o singură întrebare. Întreabă despre o parte anume a codului.',
    image_rejected: 'Imaginea nu a putut fi folosită.',
    upstream_error: 'Legătura cu Claude s-a întrerupt. Încearcă din nou.'
  };
  const OPRIT = ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'];
  const LA_SETARI = ['cheie', 'model', 'adresa', 'furnizor'];

  // Markdown simplu și sigur: blocuri de cod, cod în linie, îngroșat, liste, titluri, paragrafe
  function markdown(text, laCod) {
    const rad = document.createDocumentFragment();
    const parti = String(text).split(/```/);
    parti.forEach((p, i) => {
      if (i % 2 === 1) {
        const nl = p.indexOf('\n');
        const limbaj = nl >= 0 ? p.slice(0, nl).trim().toLowerCase() : '';
        const cod = (nl >= 0 ? p.slice(nl + 1) : p).replace(/\n$/, '');
        const pre = el('pre', {}, el('code', { text: cod }));
        const bloc = el('div', { class: 'bloc-cod' }, pre);
        if (laCod && i < parti.length - 1) laCod(bloc, cod, limbaj);
        rad.append(bloc);
        return;
      }
      const linii = p.split('\n');
      let lista = null, par = [];
      const golesteP = () => { if (par.length) { const e = el('p'); e.innerHTML = inline(par.join('\n')); rad.append(e); par = []; } };
      for (const l of linii) {
        const mTitlu = /^#{1,4}\s+(.*)$/.exec(l);
        const mLista = /^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/.exec(l);
        if (mTitlu) { golesteP(); lista = null; const h = el('h4'); h.innerHTML = inline(mTitlu[1]); rad.append(h); }
        else if (mLista) {
          golesteP();
          const tip = mLista[1] ? 'ol' : 'ul';
          if (!lista || lista.tagName.toLowerCase() !== tip) { lista = el(tip); rad.append(lista); }
          const li = el('li'); li.innerHTML = inline(mLista[2]); lista.append(li);
        } else if (!l.trim()) { golesteP(); lista = null; }
        else { lista = null; par.push(l); }
      }
      golesteP();
    });
    return rad;
  }
  function inline(t) {
    return esc(t)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>')
      .replace(/\n/g, '<br>');
  }

  const pauza = (ms, semnal) => new Promise((rez, resp) => {
    if (semnal && semnal.aborted) { resp(new Error('Oprit.')); return; }
    const laOprire = () => { clearTimeout(t); resp(new Error('Oprit.')); };
    const t = setTimeout(() => { if (semnal) semnal.removeEventListener('abort', laOprire); rez(); }, ms);
    if (semnal) semnal.addEventListener('abort', laOprire, { once: true });
  });

  M.Asistent = class {
    constructor(app) {
      this.app = app;
      this.ture = [];
      this.sample = undefined;   // undefined = încă nu știm, null = Claude indisponibil
      this.furnizor = null;      // 'claude' | 'gemini' | 'groq' | 'alt' | null (neales)
      this.inClaude = !!(window.claude && typeof window.claude.use === 'function');
      this.ocupat = false;
      this.conv = $('#conversatie');
      this.bara = $('#bara-asistent');
      this.text = $('#text-asistent');
      this.btn = $('#btn-trimite-asistent');
      $('#form-asistent').addEventListener('submit', (e) => { e.preventDefault(); if (this.ocupat) this.opreste(); else this.trimite(); });
      this.text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!this.ocupat) this.trimite(); } });
      this.text.addEventListener('input', () => this.redimensioneaza());
      this.construiesteBara();
      this.arataIntro();
      this.gata = this.init();
    }
    async init() {
      if (this.inClaude) {
        try { this.sample = await window.claude.use('sample'); } catch (e) { this.sample = null; }
        if (this.sample) { try { this.limite = await this.sample.limits(); } catch (e) { this.limite = null; } }
      } else this.sample = null;
      this.alegeFurnizor();
    }
    // Claude când aplicația e deschisă în Claude; altfel serviciul ales în setări (dacă are cheie)
    alegeFurnizor() {
      if (this.sample) this.furnizor = 'claude';
      else if (this.inClaude || !M.ai) this.furnizor = null;
      else {
        const s = M.ai.setari.citeste();
        this.furnizor = s.furnizor && M.ai.setari.gata(s.furnizor) ? s.furnizor : null;
      }
      this.actualizeazaBara();
      if (this.nota) { this.nota.remove(); this.nota = null; }
      const poate = !!this.furnizor || (!this.inClaude && !!M.ai);
      this.text.disabled = !poate;
      this.btn.disabled = !poate;
      this.text.placeholder = !poate ? 'Asistentul nu e disponibil aici' : 'Descrie ce vrei să construiești…';
      if (this.conv.querySelector('.intro-asistent')) this.arataIntro();
      if (!poate) this.indisponibil();
    }
    laArata() {
      this.conv.scrollTop = this.conv.scrollHeight;
      if (window.innerWidth > 760 && !this.text.disabled) setTimeout(() => this.text.focus({ preventScroll: true }), 30);
    }
    redimensioneaza() { this.text.style.height = 'auto'; this.text.style.height = Math.min(140, this.text.scrollHeight + 2) + 'px'; }
    indisponibil() {
      this.text.disabled = true;
      this.btn.disabled = true;
      this.text.placeholder = 'Asistentul nu e disponibil aici';
      if (this.nota) this.nota.remove();
      this.nota = el('p', { class: 'nota-asistent', text: 'Aici asistentul folosește Claude și are nevoie de permisiunea de a-l folosi. Pe site-ul Meșter (varianta de pe GitHub) poți folosi în schimb un AI gratuit, Gemini sau Groq, cu cheia ta. Restul aplicației funcționează normal.' });
      this.conv.append(this.nota);
    }

    // ---------- bara de sus: ce AI răspunde, discuție nouă ----------
    construiesteBara() {
      this.bara.innerHTML = '';
      this.btnAI = el('button', { class: 'btn alege-ai', type: 'button', on: { click: () => this.deschideSetari() } });
      this.chipAI = el('span', { class: 'chip-ai' });
      this.bara.append(this.btnAI, this.chipAI, el('div', { class: 'spatiator' }),
        el('button', { class: 'btn fantoma', type: 'button', title: 'Începe o discuție nouă (asistentul uită ce ați vorbit)', html: M.icon('nou') + '<span>Discuție nouă</span>', on: { click: () => this.discutieNoua() } }));
      this.actualizeazaBara();
    }
    actualizeazaBara() {
      if (!this.btnAI) return;
      const inClaude = this.furnizor === 'claude' || this.inClaude;
      this.btnAI.classList.toggle('ascuns', inClaude || !M.ai);
      this.chipAI.classList.toggle('ascuns', !inClaude);
      this.chipAI.textContent = 'Răspunde: Claude';
      if (!inClaude && M.ai) {
        const f = this.furnizor;
        const s = f ? M.ai.setari.pentru(f) : null;
        this.btnAI.innerHTML = M.icon('setari') + (f
          ? '<span class="nume-ai">' + esc(M.ai.FURNIZORI[f].scurt) + '</span><span class="model-ai">' + esc(s.model) + '</span>'
          : '<span class="nume-ai">Alege AI-ul</span>');
        this.btnAI.title = f ? 'Setările asistentului: ' + M.ai.FURNIZORI[f].nume + ', modelul ' + s.model : 'Alege serviciul de AI și pune cheia';
        this.btnAI.classList.toggle('principal', !f);
      }
    }
    discutieNoua() {
      if (this.ocupat) this.opreste();
      this.ture = [];
      this.arataIntro();
      if (this.furnizor === null && this.inClaude) this.indisponibil();
      this.laArata();
    }
    arataIntro() {
      this.conv.innerHTML = '';
      this.nota = null;
      const trebuieConfigurat = !this.furnizor && !this.inClaude && !!M.ai;
      const sug = el('div', { class: 'sugestii-asistent' });
      for (const [titlu, intrebare] of [
        ['De ce nu merge montajul meu?', 'Uită-te la schemă, la cod și la erori și spune-mi de ce nu merge proiectul și cum îl repar.'],
        ['Explică-mi codul pas cu pas', 'Explică-mi pe înțeles ce face codul meu, pas cu pas.'],
        ['Scrie codul pentru schema mea', 'Scrie un program complet pentru piesele din schema mea, pune-l în editor și verifică-l rulând simularea.'],
        ['Ce aș putea construi cu piesele astea?', 'Ce proiecte interesante aș putea face cu piesele pe care le am în schemă? Dă-mi 3 idei, de la simplu la greu.']
      ]) sug.append(el('button', { type: 'button', text: titlu, on: { click: () => { this.text.value = intrebare; this.trimite(); } } }));
      const intro = el('div', { class: 'intro-asistent' },
        el('h3', { text: 'Asistentul tău de electronică' }),
        el('p', { text: 'Vede schema, codul, erorile și ce scrie placa în monitorul serial. Întreabă-l orice sau cere-i să construiască ceva: poate scrie codul, adăuga și lega piese, rula simularea și citi ce afișează placa (tot ce schimbă în schemă se poate anula cu Ctrl+Z).' }));
      if (trebuieConfigurat) {
        const F = M.ai.FURNIZORI;
        intro.append(el('div', { class: 'card-config-ai' },
          el('b', { text: 'Alege AI-ul care te ajută' }),
          el('p', { text: 'Asistentul merge gratuit cu Google Gemini sau Groq, pe cheia ta. Durează un minut:' }),
          el('ol', {},
            el('li', { html: 'Fă-ți o cheie gratuită la <a href="' + esc(F.gemini.cheieLink) + '" target="_blank" rel="noopener noreferrer">Google AI Studio</a> (sau la <a href="' + esc(F.groq.cheieLink) + '" target="_blank" rel="noopener noreferrer">Groq</a>).' }),
            el('li', { text: 'Apasă butonul de mai jos și lipește cheia.' })),
          el('button', { class: 'btn principal', type: 'button', html: M.icon('cheie') + '<span>Configurează asistentul</span>', on: { click: () => this.deschideSetari() } })));
      }
      this.conv.append(intro, sug);
    }

    // ---------- setările AI-ului (cheia rămâne doar în acest browser) ----------
    deschideSetari() {
      if (!M.ai || this.inClaude) return;
      const F = M.ai.FURNIZORI;
      const toate = M.ai.setari.citeste();
      let ales = this.furnizor || toate.furnizor || 'gemini';
      const DESCRIERI = {
        gemini: ['Recomandat', 'Gratuit, cu o limită de întrebări pe zi. Înțelege bine codul și vede proiecte mari. În varianta gratuită, Google poate folosi întrebările ca să-și îmbunătățească serviciile.'],
        groq: ['Foarte rapid', 'Gratuit, fără card. Limita pe minut e mică, așa că la proiecte mari răspunsul poate aștepta câteva secunde.'],
        alt: ['Avansat', 'OpenRouter, Mistral, un model pe calculatorul tău… orice serviciu compatibil OpenAI, cu adresa lui.']
      };
      const alegeri = el('div', { class: 'alegeri-ai', role: 'radiogroup', 'aria-label': 'Serviciul de AI' });
      const campAdresa = el('input', { class: 'camp', type: 'url', placeholder: 'https://openrouter.ai/api/v1', autocomplete: 'off', spellcheck: false });
      const randAdresa = el('div', { class: 'rand-camp' }, el('label', { text: 'Adresa serviciului' }), campAdresa);
      const campCheie = el('input', { class: 'camp mono', type: 'password', autocomplete: 'off', spellcheck: false, placeholder: 'Lipește cheia aici' });
      const btnArata = el('button', { class: 'btn', type: 'button', text: 'Arată' });
      btnArata.addEventListener('click', () => { const a = campCheie.type === 'password'; campCheie.type = a ? 'text' : 'password'; btnArata.textContent = a ? 'Ascunde' : 'Arată'; });
      const undeCheie = el('p', { class: 'ajutor-camp' });
      const listaModele = el('datalist', { id: 'modele-ai' });
      const campModel = el('input', { class: 'camp mono', list: 'modele-ai', autocomplete: 'off', spellcheck: false });
      const btnModele = el('button', { class: 'btn', type: 'button', text: 'Verifică cheia' });
      const stare = el('p', { class: 'stare-setari-ai', role: 'status' });
      const btnSterge = el('button', { class: 'btn fantoma pericol-text', type: 'button', text: 'Șterge cheia din acest browser' });
      const arataStare = (t, fel) => { stare.textContent = t || ''; stare.className = 'stare-setari-ai' + (fel ? ' ' + fel : ''); };
      const eticheteCheie = el('label', { text: 'Cheia API' });

      const umple = () => {
        const s = M.ai.setari.pentru(ales);
        campCheie.value = s.cheie;
        campModel.value = s.model;
        campModel.placeholder = F[ales].implicit || 'numele modelului, ex. meta-llama/llama-3.3-70b-instruct:free';
        campAdresa.value = toate.adresaAlt || '';
        randAdresa.classList.toggle('ascuns', ales !== 'alt');
        undeCheie.innerHTML = F[ales].cheieLink
          ? 'O cheie gratuită găsești la <a href="' + esc(F[ales].cheieLink) + '" target="_blank" rel="noopener noreferrer">' + esc(F[ales].cheieUnde) + '</a>.'
          : 'Cheia o iei ' + esc(F[ales].cheieUnde) + '.';
        listaModele.innerHTML = '';
        btnSterge.classList.toggle('ascuns', !s.cheie);
        arataStare('');
        for (const b of alegeri.children) { const x = b.dataset.f === ales; b.classList.toggle('activ', x); b.setAttribute('aria-checked', x ? 'true' : 'false'); }
      };
      for (const f of ['gemini', 'groq', 'alt']) {
        alegeri.append(el('button', { type: 'button', class: 'alegere-ai', role: 'radio', dataset: { f }, on: { click: () => { ales = f; umple(); } } },
          el('span', { class: 'cap-alegere' }, el('b', { text: F[f].nume }), el('span', { class: 'eticheta-alegere', text: DESCRIERI[f][0] })),
          el('span', { class: 'desc-alegere', text: DESCRIERI[f][1] })));
      }
      const incarcaModele = async () => {
        const cheie = campCheie.value.trim();
        if (!cheie) { arataStare('Scrie întâi cheia.', 'eroare'); campCheie.focus(); return null; }
        arataStare('Verific cheia la ' + F[ales].nume + '…');
        btnModele.disabled = true;
        try {
          const l = await M.ai.modele(ales, { cheie, adresa: campAdresa.value });
          listaModele.innerHTML = '';
          for (const n of l.slice(0, 200)) listaModele.append(el('option', { value: n }));
          if (!campModel.value.trim() || (l.length && !l.includes(campModel.value.trim()) && F[ales].implicit === campModel.value.trim())) campModel.value = l[0] || campModel.value;
          arataStare(l.length ? 'Cheia merge. Am găsit ' + l.length + (l.length === 1 ? ' model' : ' modele') + '; am ales ' + campModel.value + '.' : 'Cheia merge, dar serviciul nu a trimis lista de modele. Scrie numele modelului.', 'ok');
          return l;
        } catch (e) {
          arataStare(e.message || String(e), 'eroare');
          return null;
        } finally { btnModele.disabled = false; }
      };
      btnModele.addEventListener('click', incarcaModele);
      btnSterge.addEventListener('click', () => {
        const s = M.ai.setari.citeste();
        delete s.chei[ales];
        if (s.furnizor === ales) s.furnizor = '';
        M.ai.setari.scrie(s);
        Object.assign(toate, s);
        umple();
        arataStare('Am șters cheia pentru ' + F[ales].nume + ' din acest browser.', 'ok');
        this.alegeFurnizor();
      });

      const continut = el('div', { class: 'setari-ai' },
        el('p', { class: 'intro-setari', text: 'Alege serviciul de AI care îți răspunde în asistent. Toate au o variantă gratuită; ai nevoie doar de o cheie (un cod secret) de la ele.' }),
        alegeri, randAdresa,
        el('div', { class: 'rand-camp' }, eticheteCheie, el('div', { class: 'grup-camp' }, campCheie, btnArata), undeCheie),
        el('div', { class: 'rand-camp' }, el('label', { text: 'Modelul' }), el('div', { class: 'grup-camp' }, campModel, btnModele), listaModele),
        stare,
        el('p', { class: 'nota-cheie', html: M.icon('cheie') + '<span>Cheia rămâne doar în acest browser și pleacă numai către serviciul ales, când întrebi ceva. Nu o pune în cod și nu o da nimănui; o poți șterge oricând de aici.</span>' }),
        btnSterge);
      const d = M.dialog.deschide({
        titlu: 'Setările asistentului',
        continut,
        butoane: [
          { text: 'Renunță' },
          { text: 'Salvează', clasa: 'principal', actiune: async () => {
            const cheie = campCheie.value.trim();
            const adresa = campAdresa.value.trim();
            if (ales === 'alt' && !/^https?:\/\//i.test(adresa)) { arataStare('Scrie adresa serviciului, care începe cu https://', 'eroare'); campAdresa.focus(); return false; }
            if (!cheie) { arataStare('Lipește cheia ca să poți folosi ' + F[ales].nume + '.', 'eroare'); campCheie.focus(); return false; }
            if (/\s/.test(cheie)) { arataStare('Cheia nu are spații; verifică dacă ai copiat-o întreagă.', 'eroare'); return false; }
            const l = await incarcaModele();
            if (!l && !(ales === 'alt' && campModel.value.trim())) return false;
            const model = campModel.value.trim();
            if (!model) { arataStare('Alege un model.', 'eroare'); campModel.focus(); return false; }
            const s = M.ai.setari.citeste();
            s.furnizor = ales;
            s.chei[ales] = cheie;
            s.modele[ales] = model;
            if (ales === 'alt') s.adresaAlt = adresa;
            if (!M.ai.setari.scrie(s)) { arataStare('Browserul nu mă lasă să păstrez setările (poate e o fereastră privată).', 'eroare'); return false; }
            this.alegeFurnizor();
            M.dialog.notifica('Asistentul folosește acum ' + F[ales].nume + '.');
            setTimeout(() => this.laArata(), 50);
            return true;
          } }
        ]
      });
      d.el.classList.add('dialog-setari-ai');
      umple();
      setTimeout(() => (campCheie.value ? campModel : campCheie).focus(), 40);
    }

    // ---------- starea proiectului, pentru AI ----------
    context(lim) {
      lim = Object.assign({ cod: 14000, piese: 60, serial: 3000, probleme: 25 }, lim || {});
      const app = this.app, p = app.proiect;
      const L = [];
      const placa = p.componente.find(c => { const d = M.componente.def(c.tip); return d && d.esteplaca; });
      L.push('Proiect: „' + p.nume + '”. Placă: ' + (placa ? M.componente.def(placa.tip).nume + ' (eticheta ' + placa.eticheta + ')' : 'nicio placă în schemă') + '.');
      const retea = M.retea.construieste(p);
      const piese = p.componente.filter(c => { const d = M.componente.def(c.tip); return d && !d.esteBreadboard && !d.esteplaca; });
      if (piese.length) {
        L.push('Piese și legături (pin → cu ce e legat; „liber” = neconectat):');
        for (const c of piese.slice(0, lim.piese)) {
          const def = M.componente.def(c.tip);
          const prop = Object.entries(c.prop || {}).map(([k, v]) => k + '=' + v).join(', ');
          const vazute = new Set();
          const pini = [];
          for (const pin of M.componente.pini(c)) {
            const nume = pin.eticheta || pin.id;
            if (vazute.has(nume)) continue;   // pinii legați intern (ex. cele două picioare ale unui buton)
            vazute.add(nume);
            const n = retea.net(c.id, pin.id);
            const altii = n < 0 ? [] : [...new Set(retea.piniReali(n).map(i => retea.pinInfo[i]).filter(pi => pi.comp !== c).map(pi => pi.comp.eticheta + '.' + (pi.def.esteplaca && pi.pin.gpio !== undefined ? pi.pin.id + '(GPIO' + pi.pin.gpio + ')' : (pi.pin.eticheta || pi.pin.id))))];
            pini.push(nume + '→' + (altii.length ? altii.slice(0, 4).join('/') + (altii.length > 4 ? '/…' : '') : 'liber'));
          }
          const ctl = (def.control || []).map(k => k.cheie + '=' + (c.control && c.control[k.cheie] !== undefined ? c.control[k.cheie] : k.implicit) + (k.unitate ? ' ' + k.unitate : ''));
          L.push('- ' + c.eticheta + ' (' + c.tip + '): ' + def.nume + (prop ? ' [' + prop + ']' : '') + (ctl.length ? ' {valori simulate: ' + ctl.join(', ') + '}' : '') + '; ' + pini.join('; '));
        }
        if (piese.length > lim.piese) L.push('(încă ' + (piese.length - lim.piese) + ' piese nu sunt listate)');
      } else L.push('Schema nu are încă piese în afară de placă.');
      const cod = String(p.cod || '');
      L.push('', 'Codul din editor' + (cod.length > lim.cod ? ' (primele ' + lim.cod + ' de caractere; restul îl vezi cu citeste_codul)' : '') + ':', '```cpp', cod.slice(0, lim.cod), '```');
      const pr = app.verificare ? app.verificare.toate().slice(0, lim.probleme) : [];
      if (pr.length) { L.push('Probleme găsite de aplicație:'); for (const x of pr) L.push('- [' + x.nivel + (x.sursa ? ', ' + x.sursa : '') + (x.linie ? ', linia ' + x.linie : '') + '] ' + x.mesaj); }
      else L.push('Aplicația nu a găsit probleme.');
      L.push('Simularea: ' + (app.simuleaza && app.sim ? 'pornită (' + app.sim.stare + ', ' + (app.sim.timp / 1e6).toFixed(1) + ' s)' : 'oprită') + '.');
      const txt = this.textSerial(lim.serial);
      if (txt) L.push('Ultimele linii din monitorul serial:', '```', txt, '```');
      return L.join('\n');
    }
    textSerial(max) {
      const s = this.app.serial && this.app.serial.canale ? this.app.serial.canale.usb : null;
      if (!s || !(s.linii.length || s.linieCurenta)) return '';
      const txt = s.linii.slice(-40).map(l => l.text).join('\n') + (s.linieCurenta ? '\n' + s.linieCurenta : '');
      return txt.slice(-(max || 3000));
    }
    catalog() {
      return M.componente.toate().filter(d => !d.esteBreadboard && d.categorie !== 'placi').map(d => d.tip + ' — ' + d.nume + ' (pini: ' + M.componente.pini({ tip: d.tip, prop: M.componente.propImplicite(d) }).map(p => p.id).join(', ') + ')').join('\n');
    }
    descriePiesa(d) {
      const pini = M.componente.pini({ tip: d.tip, prop: M.componente.propImplicite(d) }).map(p => p.id).join(', ');
      const prop = (d.prop || []).map(p => p.cheie + (p.optiuni ? '(' + p.optiuni.map(o => o[0]).join('/') + ')' : p.unitate ? '(' + p.unitate + ')' : '')).join(', ');
      const ctl = (d.control || []).map(k => k.cheie + ' ' + k.min + '…' + k.max + (k.unitate ? ' ' + k.unitate : '')).join(', ');
      return d.tip + ' — ' + d.nume + '; pini: ' + pini + (prop ? '; proprietăți: ' + prop : '') + (ctl ? '; valori simulate: ' + ctl : '');
    }

    // ---------- uneltele cu care AI-ul lucrează în proiect ----------
    unelte(jurnal, opt) {
      opt = opt || {};
      const app = this.app;
      const nuInSimulare = () => { if (app.simuleaza) throw new Error('Simularea e pornită; schema se poate schimba doar cu simularea oprită. Oprește-o întâi cu opreste_simularea.'); };
      const gasestePiesa = (et) => {
        const e = String(et || '').trim().toLowerCase();
        const c = app.proiect.componente.find(x => String(x.eticheta).toLowerCase() === e);
        if (!c) throw new Error('Nu există piesa „' + et + '” în schemă. Piese: ' + app.proiect.componente.filter(x => !M.componente.def(x.tip).esteBreadboard).map(x => x.eticheta).join(', '));
        return c;
      };
      const gasestePin = (c, id) => {
        const s = String(id || '').trim();
        const pini = M.componente.pini(c);
        let p = pini.find(x => x.id === s) || pini.find(x => x.id.toLowerCase() === s.toLowerCase()) || pini.find(x => String(x.eticheta || '').toLowerCase() === s.toLowerCase());
        const m = /^(?:gpio|io|d)?\s*(\d+)$/i.exec(s);
        if (!p && m && M.componente.def(c.tip).esteplaca) p = pini.find(x => x.gpio === +m[1]);
        if (!p && /^gnd$/i.test(s)) p = pini.find(x => x.tip === 'gnd');
        if (!p && /^(3v3|3\.3v)$/i.test(s)) p = pini.find(x => x.tip === '3v3');
        if (!p && /^(5v|vin|vbus)$/i.test(s)) p = pini.find(x => x.tip === '5v');
        return p || null;
      };
      const pozLibera = (tip) => {
        const def = M.componente.def(tip);
        const cut = def.cutie(M.componente.propImplicite(def));
        let maxX = 0, minY = 0;
        for (const c of app.proiect.componente) { const b = M.componente.cutie(c); maxX = Math.max(maxX, c.x + b.x + b.w); minY = Math.min(minY, c.y + b.y); }
        this.urmPoz = this.urmPoz && this.urmPoz.maxX === maxX ? this.urmPoz : { maxX, y: Math.max(0, minY) };
        const poz = { x: Math.round((maxX + 60 - cut.x) / 10) * 10, y: Math.round((this.urmPoz.y - cut.y) / 10) * 10 };
        this.urmPoz.y += cut.h + 40;
        return poz;
      };
      const inregistreaza = () => { if (!this.inregistrat) { app.istoric.inregistreaza(); this.inregistrat = true; } };
      const reface = () => { app.spatiu.randeazaTot(); app.schimbare('schema'); };
      const convertesteProp = (c, pr, v) => {
        if (pr.tip === 'valoare') {
          const x = typeof v === 'number' ? v : M.desen.parseValoare(String(v));
          if (isNaN(x) || x <= 0) throw new Error('Valoare greșită pentru ' + pr.cheie + ': „' + v + '”. Exemple: 220, 4.7k, 10k, 100n.');
          return x;
        }
        if (pr.tip === 'numar') {
          let x = +v;
          if (isNaN(x)) throw new Error(pr.cheie + ' trebuie să fie un număr.');
          if (pr.min !== undefined) x = Math.max(pr.min, x);
          if (pr.max !== undefined) x = Math.min(pr.max, x);
          return x;
        }
        if (pr.tip === 'bool') return v === true || /^(true|da|1|on|pornit|yes)$/i.test(String(v));
        if (pr.tip === 'alegere') {
          const o = pr.optiuni.find(([k, n]) => String(k) === String(v)) || pr.optiuni.find(([k, n]) => String(n).toLowerCase() === String(v).toLowerCase() || String(k).toLowerCase() === String(v).toLowerCase());
          if (!o) throw new Error('Pentru ' + pr.cheie + ' alege una din: ' + pr.optiuni.map(x => x[0] + ' (' + x[1] + ')').join(', '));
          return o[0];
        }
        return String(v);
      };
      const listaProp = (def) => (def.prop || []).map(p => p.cheie + ' — ' + p.eticheta + (p.optiuni ? ': ' + p.optiuni.map(o => o[0]).join('/') : p.unitate ? ' (' + p.unitate + ')' : '')).join('; ') || 'nu are proprietăți';
      const probleme = (max) => (app.verificare ? app.verificare.toate() : []).slice(0, max || 20).map(p => p.nivel + (p.sursa ? ' [' + p.sursa + ']' : '') + (p.linie ? ' (linia ' + p.linie + ')' : '') + ': ' + p.mesaj);

      const lista = [
        {
          name: 'scrie_codul',
          description: 'Înlocuiește tot codul din editor cu programul dat (C++ Arduino complet) și îl compilează. Întoarce {compileaza: true} sau eroarea cu linia, ca s-o poți repara.',
          inputSchema: { type: 'object', properties: { cod: { type: 'string', description: 'Programul complet' } }, required: ['cod'] },
          execute: (x) => {
            const cod = String(x.cod || '');
            if (cod.trim().length < 10) throw new Error('Codul e gol.');
            if (app.simuleaza) { app.opreste(); jurnal('Am oprit simularea ca să schimb codul.'); }
            app.editor.inlocuiesteCuIstoric(cod);
            const r = app.editor.verifica();
            jurnal(r ? 'Am scris codul în editor (se compilează).' : 'Am scris codul în editor, dar are o eroare la linia ' + (app.eroareCompilare && app.eroareCompilare.linie) + '.');
            return r ? { compileaza: true, avertismente: (r.avertismente || []).map(a => 'linia ' + a.linie + ': ' + a.mesaj).slice(0, 10) } : { compileaza: false, eroare: app.eroareCompilare };
          }
        },
        {
          name: 'citeste_codul',
          description: 'Întoarce liniile codului din editor, numerotate (cel mult 250 odată). Folosește-l ca să vezi exact o parte din cod.',
          inputSchema: { type: 'object', properties: { de_la: { type: 'number', description: 'Prima linie (de la 1)' }, pana_la: { type: 'number', description: 'Ultima linie' } } },
          execute: (x) => {
            const linii = String(app.proiect.cod || '').split('\n');
            const a = Math.max(1, Math.floor(+x.de_la || 1));
            const b = Math.min(linii.length, Math.floor(+x.pana_la || linii.length), a + 249);
            return { total_linii: linii.length, cod: linii.slice(a - 1, b).map((l, i) => (a + i) + '| ' + l).join('\n') };
          }
        },
        {
          name: 'adauga_piesa',
          description: 'Adaugă o piesă în schemă, lângă celelalte. „tip” e unul din catalog. Întoarce eticheta primită (ex. LED2) și pinii ei, ca s-o poți lega.',
          inputSchema: { type: 'object', properties: {
            tip: { type: 'string', description: 'Tipul piesei, din catalog' },
            proprietati: { type: 'string', description: 'Opțional, ca text JSON, ex. {"valoare": 220} la rezistor sau {"culoare": "verde"} la LED' }
          }, required: ['tip'] },
          execute: (x) => {
            nuInSimulare();
            const tip = String(x.tip || '').trim();
            const def = M.componente.def(tip);
            if (!def || def.esteBreadboard || def.esteplaca && app.proiect.componente.some(c => M.componente.def(c.tip).esteplaca)) {
              throw new Error(def && def.esteplaca ? 'Schema are deja o placă.' : 'Nu există piesa „' + tip + '”. Folosește un tip din catalog' + (opt.catalog ? ' (catalog_piese).' : '.'));
            }
            let dorite = x.proprietati;
            if (typeof dorite === 'string' && dorite.trim()) { try { dorite = JSON.parse(dorite); } catch (e) { throw new Error('„proprietati” nu e JSON valid, ex. {"valoare": 220}.'); } }
            const prop = {}, ignorate = [];
            if (dorite && typeof dorite === 'object') {
              for (const [k, v] of Object.entries(dorite)) {
                const pr = (def.prop || []).find(p => p.cheie === k) || (def.prop || []).find(p => p.cheie.toLowerCase() === k.toLowerCase() || p.eticheta.toLowerCase() === k.toLowerCase());
                if (!pr) { ignorate.push(k); continue; }
                prop[pr.cheie] = convertesteProp(null, pr, v);
              }
            }
            inregistreaza();
            const poz = pozLibera(tip);
            const c = M.proiect.adaugaComponenta(app.proiect, tip, poz.x, poz.y, prop);
            reface();
            jurnal('Am adăugat ' + c.eticheta + ' (' + def.nume + ').');
            const r = { eticheta: c.eticheta, pini: M.componente.pini(c).map(p => p.id + (p.descriere ? ' — ' + p.descriere : '')) };
            if (ignorate.length) r.proprietati_ignorate = ignorate.join(', ') + ' (proprietăți posibile: ' + listaProp(def) + ')';
            return r;
          }
        },
        {
          name: 'leaga',
          description: 'Leagă cu un fir doi pini: „de” și „la” au forma ETICHETĂ.PIN, ex. "LED1.A" și "ESP1.D27" (la placă merg și "ESP1.GPIO27", "ESP1.GND", "ESP1.3V3"). Firul merge direct între pini.',
          inputSchema: { type: 'object', properties: { de: { type: 'string' }, la: { type: 'string' } }, required: ['de', 'la'] },
          execute: (x) => {
            nuInSimulare();
            const parse = (s) => {
              const t = String(s || '');
              const i = t.lastIndexOf('.');
              if (i < 1) throw new Error('„' + t + '” trebuie să fie ETICHETĂ.PIN');
              const c = gasestePiesa(t.slice(0, i));
              const p = gasestePin(c, t.slice(i + 1));
              if (!p) throw new Error(c.eticheta + ' nu are pinul „' + t.slice(i + 1) + '”. Pini: ' + M.componente.pini(c).map(q => q.id).join(', '));
              return { c: c.id, p: p.id, et: c.eticheta + '.' + p.id };
            };
            const a = parse(x.de), b = parse(x.la);
            if (a.c === b.c && a.p === b.p) throw new Error('Nu poți lega un pin cu el însuși.');
            if (app.proiect.fire.some(f => (f.a.c === a.c && f.a.p === a.p && f.b.c === b.c && f.b.p === b.p) || (f.a.c === b.c && f.a.p === b.p && f.b.c === a.c && f.b.p === a.p))) return { ok: true, nota: 'Firul exista deja.' };
            inregistreaza();
            M.proiect.adaugaFir(app.proiect, { c: a.c, p: a.p }, { c: b.c, p: b.p }, app.spatiu.culoareFir ? app.spatiu.culoareFir({ c: a.c, p: a.p }, { c: b.c, p: b.p }) : undefined);
            reface();
            jurnal('Am legat ' + a.et + ' cu ' + b.et + '.');
            return { ok: true };
          }
        },
        {
          name: 'sterge_piesa',
          description: 'Scoate o piesă din schemă (cu firele ei), după etichetă.',
          inputSchema: { type: 'object', properties: { eticheta: { type: 'string' } }, required: ['eticheta'] },
          execute: (x) => {
            nuInSimulare();
            const c = gasestePiesa(x.eticheta);
            if (M.componente.def(c.tip).esteplaca) throw new Error('Placa nu se șterge.');
            inregistreaza();
            M.proiect.stergeComponenta(app.proiect, c.id);
            if (app.spatiu.selectie && app.spatiu.selectie.id === c.id) app.spatiu.selecteaza(null);
            reface();
            jurnal('Am scos ' + c.eticheta + '.');
            return { ok: true };
          }
        },
        {
          name: 'schimba_proprietate',
          description: 'Schimbă o proprietate a unei piese din schemă (ex. valoarea unui rezistor, culoarea unui LED, adresa I2C, numărul de LED-uri). Dacă nu știi cheia, trimite-o goală și primești lista.',
          inputSchema: { type: 'object', properties: { eticheta: { type: 'string' }, cheie: { type: 'string' }, valoare: { type: 'string' } }, required: ['eticheta', 'cheie', 'valoare'] },
          execute: (x) => {
            const c = gasestePiesa(x.eticheta);
            const def = M.componente.def(c.tip);
            const k = String(x.cheie || '').trim();
            const pr = (def.prop || []).find(p => p.cheie === k) || (def.prop || []).find(p => k && (p.cheie.toLowerCase() === k.toLowerCase() || p.eticheta.toLowerCase() === k.toLowerCase()));
            if (!pr) throw new Error(c.eticheta + ' nu are proprietatea „' + k + '”. Proprietăți: ' + listaProp(def));
            nuInSimulare();
            const v = convertesteProp(c, pr, x.valoare);
            inregistreaza();
            c.prop[pr.cheie] = v;
            if (def.laSchimbareProp) def.laSchimbareProp(c, pr.cheie, v);
            app.spatiu.randeazaComp(c);
            app.spatiu.actualizeazaFireComp(c.id);
            app.spatiu.reconstruiesteIndex();
            app.schimbare('schema');
            if (app.spatiu.selectie && app.spatiu.selectie.id === c.id) M.bus.emit('selectie', app.spatiu.selectie);
            const afisat = pr.tip === 'valoare' ? M.desen.formatValoare(v, pr.unitate) : pr.optiuni ? (pr.optiuni.find(o => o[0] === v) || [v, v])[1] : v;
            jurnal('Am pus ' + pr.eticheta.toLowerCase() + ' = ' + afisat + ' la ' + c.eticheta + '.');
            return { ok: true, valoare: v, pini: M.componente.pini(c).map(p => p.id) };
          }
        },
        {
          name: 'seteaza_valoare_simulata',
          description: 'Schimbă ce măsoară un senzor sau poziția unui potențiometru în simulare (ex. temperatura la DHT, distanța la HC-SR04, lumina la fotorezistor). Merge și cu simularea pornită.',
          inputSchema: { type: 'object', properties: { eticheta: { type: 'string' }, cheie: { type: 'string', description: 'Opțional dacă piesa are o singură valoare' }, valoare: { type: 'number' } }, required: ['eticheta', 'valoare'] },
          execute: (x) => {
            const c = gasestePiesa(x.eticheta);
            const def = M.componente.def(c.tip);
            if (!def.control || !def.control.length) throw new Error(c.eticheta + ' nu are valori de simulat.');
            const k0 = String(x.cheie || '').trim().toLowerCase();
            const k = k0 ? def.control.find(k => k.cheie.toLowerCase() === k0 || k.eticheta.toLowerCase() === k0) : def.control.length === 1 ? def.control[0] : null;
            if (!k) throw new Error('Alege cheia: ' + def.control.map(k => k.cheie + ' (' + k.eticheta + ', ' + k.min + '…' + k.max + (k.unitate ? ' ' + k.unitate : '') + ')').join(', '));
            let v = +x.valoare;
            if (isNaN(v)) throw new Error('Valoarea trebuie să fie un număr.');
            v = Math.min(k.max, Math.max(k.min, v));
            if (app.simuleaza && app.sim) app.sim.control(c, k.cheie, v);
            else { c.control = c.control || {}; c.control[k.cheie] = v; app.spatiu.actualizeazaVizualComp(c); app.salveazaIntarziat(); }
            if (app.inspector && app.inspector.actualizeazaControale) app.inspector.actualizeazaControale();
            jurnal('Am pus ' + k.eticheta.toLowerCase() + ' = ' + v + (k.unitate ? ' ' + k.unitate : '') + ' la ' + c.eticheta + '.');
            return { ok: true, valoare: v };
          }
        },
        {
          name: 'ruleaza_simularea',
          description: 'Pornește simularea (dacă e oprită), o lasă să meargă câteva secunde și întoarce ce a scris placa pe Serial, problemele și starea. Simularea rămâne pornită ca omul să vadă rezultatul.',
          inputSchema: { type: 'object', properties: { secunde: { type: 'number', description: 'Cât să ruleze înainte de citire, 1–10 (implicit 3)' } } },
          execute: async (x, ctx) => {
            const sec = Math.min(10, Math.max(1, +x.secunde || 3));
            if (!app.simuleaza) {
              const placa = app.proiect.componente.some(c => M.componente.def(c.tip).esteplaca);
              if (!placa) throw new Error('Nu există nicio placă în schemă.');
              if (!app.porneste({ ramaiPeLoc: true })) {
                const e = app.eroareCompilare;
                throw new Error('Codul nu se compilează' + (e ? ' (linia ' + e.linie + ': ' + e.mesaj + ')' : '') + '. Repară-l cu scrie_codul.');
              }
              jurnal('Am pornit simularea.');
            }
            const t0 = app.sim.timp;
            await pauza(sec * 1000, ctx && ctx.signal);
            if (!app.sim) return { stare: 'oprita' };
            const r = {
              stare: app.sim.stare === 'ruleaza' ? 'pornită' : app.sim.stare,
              timp_simulat_s: +(app.sim.timp / 1e6).toFixed(2),
              serial: this.textSerial(opt.compact ? 1500 : 3000) || '(placa nu a scris nimic pe Serial)',
              probleme: probleme(opt.compact ? 8 : 15)
            };
            if (app.sim.timp - t0 < 1e5) r.atentie = 'Simularea aproape nu a avansat (pagina poate fi în fundal).';
            return r;
          }
        },
        {
          name: 'opreste_simularea',
          description: 'Oprește simularea (de exemplu înainte să schimbi schema).',
          execute: () => {
            if (!app.simuleaza) return { ok: true, nota: 'Era deja oprită.' };
            app.opreste();
            jurnal('Am oprit simularea.');
            return { ok: true };
          }
        },
        {
          name: 'verifica_proiectul',
          description: 'Compilează codul și verifică schema. Întoarce lista de probleme (erori, avertismente) cu liniile lor.',
          execute: () => {
            app.editor.verifica();
            if (app.verificare) app.verificare.verificaSchema();
            return { probleme: probleme(20) };
          }
        }
      ];
      if (opt.catalog) {
        lista.splice(2, 0, {
          name: 'catalog_piese',
          description: 'Caută în catalogul de piese pe care le poți adăuga: întoarce tipul exact, pinii, proprietățile și valorile simulate. Caută după cuvinte (ex. "led", "temperatura", "oled", "motor") sau lasă gol pentru lista scurtă a tuturor.',
          inputSchema: { type: 'object', properties: { cauta: { type: 'string' } } },
          execute: (x) => {
            const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
            const toate = M.componente.toate().filter(d => !d.esteBreadboard && d.categorie !== 'placi');
            const cuv = norm(x.cauta).split(/[\s,]+/).filter(Boolean);
            if (!cuv.length) return { piese: toate.map(d => d.tip + ' — ' + d.nume).join('\n') };
            const gasite = toate.filter(d => { const t = norm(d.tip + ' ' + d.nume + ' ' + (d.categorie || '') + ' ' + (d.descriere || '') + ' ' + (d.cautare || '')); return cuv.some(w => t.includes(w)); });
            return gasite.length ? { piese: gasite.slice(0, 25).map(d => this.descriePiesa(d)).join('\n'), total: gasite.length } : { piese: '', nota: 'Nimic găsit; încearcă alt cuvânt sau lasă gol.' };
          }
        });
      }
      return lista;
    }

    // ---------- discuția ----------
    adaugaMesaj(rol, text) {
      const m = el('div', { class: 'mesaj ' + rol });
      if (rol === 'utilizator') m.textContent = text;
      this.conv.append(m);
      this.conv.scrollTop = this.conv.scrollHeight;
      return m;
    }
    randeazaRaspuns(m, text, jurnal, asteptare) {
      m.innerHTML = '';
      if (jurnal && jurnal.length) m.append(el('ul', { class: 'jurnal-asistent' }, ...jurnal.map(t => el('li', { text: t }))));
      if (!text) {
        if (asteptare) m.append(el('p', { class: 'asteptare-ai', text: asteptare }));
        m.append(el('span', { class: 'gandeste', 'aria-label': 'Se gândește', html: '<i></i><i></i><i></i>' }));
        return;
      }
      m.append(markdown(text, (bloc, cod, limbaj) => {
        const act = el('div', { class: 'actiuni-mesaj' });
        if (/^(cpp|c\+\+|c|ino|arduino)?$/.test(limbaj) && /\b(setup|loop)\s*\(/.test(cod)) {
          act.append(el('button', { class: 'btn', type: 'button', html: M.icon('cod') + '<span>Pune în editor</span>', on: { click: async () => {
            const actual = this.app.editor.valoare().trim();
            if (actual && actual !== cod.trim() && !(await M.dialog.confirma('Codul din editor va fi înlocuit cu cel propus de asistent. Poți reveni cu Anulează (Ctrl+Z în editor).', { titlu: 'Pune codul în editor', da: 'Înlocuiește' }))) return;
            if (this.app.simuleaza) this.app.opreste();
            this.app.editor.inlocuiesteCuIstoric(cod);
            this.app.editor.verifica();
            this.app.arataFila('cod');
            M.dialog.notifica('Am pus codul în editor.');
          } } }));
        }
        act.append(el('button', { class: 'btn', type: 'button', html: M.icon('copiaza') + '<span>Copiază</span>', on: { click: async () => { const ok = await M.u.copiaza(cod); M.dialog.notifica(ok ? 'Cod copiat.' : 'Nu am putut copia; selectează textul.'); } } }));
        bloc.append(act);
      }));
      if (asteptare) m.append(el('p', { class: 'asteptare-ai', text: asteptare }));
    }
    arataEroare(text, cuSetari) {
      const p = el('div', { class: 'nota-asistent eroare' }, el('p', { text }));
      if (cuSetari) p.append(el('button', { class: 'btn', type: 'button', html: M.icon('setari') + '<span>Deschide setările</span>', on: { click: () => this.deschideSetari() } }));
      this.conv.append(p);
    }
    async trimite() {
      const t = this.text.value.trim();
      if (!t || this.ocupat) return;
      if (this.sample === undefined) await this.gata;
      if (!this.furnizor) {
        if (this.inClaude || !M.ai) { this.indisponibil(); return; }
        this.deschideSetari();
        return;
      }
      const intro = this.conv.querySelector('.intro-asistent');
      if (intro) this.conv.innerHTML = '';
      this.text.value = '';
      this.redimensioneaza();
      this.adaugaMesaj('utilizator', t);
      const m = this.adaugaMesaj('asistent', '');
      const jurnal = [];
      let text = '', asteptare = '', ceas = null;
      const actualizeaza = () => { this.randeazaRaspuns(m, text, jurnal, asteptare); this.lipeste(); };
      const pas = (s) => { jurnal.push(s); actualizeaza(); };
      actualizeaza();
      this.ocupat = true;
      this.inregistrat = false;
      this.btn.textContent = 'Oprește';
      this.ctl = new AbortController();
      const furnizor = this.furnizor;
      try {
        let r;
        if (furnizor === 'claude') {
          const cuUnelte = !!(this.limite && this.limite.tools);
          const instr = INSTRUCTIUNI + (cuUnelte ? '\n' + DESPRE_UNELTE + '\n\nPiesele pe care le poți adăuga (tip — nume, pini):\n' + this.catalog() : '');
          const intrare = [{ role: 'user', content: instr }].concat(this.ture.slice(-12), [{ role: 'user', content: 'Starea proiectului acum:\n' + this.context() + '\n\nMesajul meu:\n' + t }]);
          const o = { signal: this.ctl.signal, onText: (u) => { text = u.text; actualizeaza(); } };
          if (cuUnelte) {
            const max = this.limite.tools.maxCount || 20;
            o.tools = this.unelte(pas).slice(0, max);
          } else o.cache = false;
          const x = await this.sample(intrare, o);
          r = { text: x.text, trunchiat: x.truncated };
        } else {
          const F = M.ai.FURNIZORI[furnizor];
          const s = M.ai.setari.pentru(furnizor);
          const compact = !!F.compact;
          const instr = INSTRUCTIUNI + '\n' + DESPRE_UNELTE + (furnizor === 'gemini'
            ? '\n\nPiesele pe care le poți adăuga (tip — nume, pini; detalii cu catalog_piese):\n' + this.catalog()
            : '\nTipurile exacte de piese, pinii și proprietățile lor le afli cu catalog_piese.');
          const ture = this.ture.slice(compact ? -6 : -12).map(x => compact && x.content.length > 1500 ? { role: x.role, content: x.content.slice(0, 1500) + '\n[…]' } : x);
          const mesaj = 'Starea proiectului acum:\n' + this.context(compact ? { cod: 5000, piese: 30, serial: 1200, probleme: 12 } : null) + '\n\nMesajul meu:\n' + t;
          r = await M.ai.intreaba({
            furnizor, cheie: s.cheie, model: s.model, adresa: s.adresa,
            instructiuni: instr, ture, mesaj,
            unelte: this.unelte(pas, { catalog: true, compact }),
            semnal: this.ctl.signal,
            laText: (x) => { text = x; actualizeaza(); },
            laAsteptare: (sec, motiv) => {
              clearInterval(ceas);
              if (!sec) { asteptare = ''; actualizeaza(); return; }
              const pana = Date.now() + sec * 1000;
              const scrie = () => {
                const rest = Math.max(0, Math.ceil((pana - Date.now()) / 1000));
                asteptare = (motiv === 'ocupat' ? F.scurt + ' e ocupat; reîncerc' : 'Aștept limita gratuită a lui ' + F.scurt) + ' în ' + rest + ' s…';
                actualizeaza();
              };
              scrie();
              ceas = setInterval(scrie, 1000);
            }
          });
        }
        clearInterval(ceas);
        asteptare = '';
        text = r.text;
        actualizeaza();
        if (r.trunchiat) m.append(el('p', { class: 'nota-asistent', text: 'Răspunsul s-a oprit la limita de lungime. Cere o bucată mai mică.' }));
        this.ture.push({ role: 'user', content: t }, { role: 'assistant', content: text });
      } catch (e) {
        clearInterval(ceas);
        asteptare = '';
        const cod = e && (e.code || e.cod);
        if (e && e.text) { text = e.text; actualizeaza(); } else if (!text && !jurnal.length) m.remove(); else actualizeaza();
        if (cod === 'cancelled' || cod === 'oprit') { if (text) this.ture.push({ role: 'user', content: t }, { role: 'assistant', content: text + '\n(oprit)' }); }
        else if (furnizor === 'claude') {
          if (OPRIT.includes(cod)) { this.sample = null; this.alegeFurnizor(); }
          else this.arataEroare(ERORI[cod] || ERORI.upstream_error);
        } else this.arataEroare(e && e.message ? e.message : 'Nu am primit răspuns. Încearcă din nou.', LA_SETARI.includes(cod));
      } finally {
        this.ocupat = false;
        this.btn.textContent = 'Trimite';
        this.ctl = null;
        // piesele noi pot fi în afara vederii: arătăm toată schema
        if (jurnal.some(j => /^Am adăugat/.test(j))) this.app.spatiu.arataTot();
        this.lipeste();
      }
    }
    lipeste() { const c = this.conv; if (c.scrollHeight - c.scrollTop - c.clientHeight < 160) c.scrollTop = c.scrollHeight; }
    opreste() { if (this.ctl) this.ctl.abort(); }
  };
})(window.M = window.M || {});
