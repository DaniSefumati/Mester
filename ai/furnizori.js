/* Meșter — legătura asistentului cu alte servicii de AI, pe cheia utilizatorului: Google Gemini, Groq și orice
   serviciu compatibil OpenAI (OpenRouter, Mistral, un model local etc.). Aceleași unelte ca la Claude (vede și
   modifică schema, scrie codul, rulează simularea) sunt traduse în formatul fiecărui serviciu, iar discuția se
   face în runde: modelul cere o unealtă, pagina o rulează, rezultatul se trimite înapoi, până vine răspunsul.
   Cheia stă doar în browserul utilizatorului și pleacă numai către serviciul ales. */
(function (M) {
  'use strict';

  const FURNIZORI = {
    gemini: {
      nume: 'Google Gemini', scurt: 'Gemini', fel: 'gemini',
      cheieUnde: 'aistudio.google.com/apikey → „Create API key”', cheieLink: 'https://aistudio.google.com/apikey',
      adresa: 'https://generativelanguage.googleapis.com/v1beta',
      implicit: 'gemini-flash-latest',
      preferate: [/^gemini-flash-latest$/, /^gemini-[\d.]+-flash$/, /flash(?!-lite)/, /flash/],
      compact: false
    },
    groq: {
      nume: 'Groq', scurt: 'Groq', fel: 'openai',
      cheieUnde: 'console.groq.com/keys → „Create API Key”', cheieLink: 'https://console.groq.com/keys',
      adresa: 'https://api.groq.com/openai/v1',
      implicit: 'openai/gpt-oss-120b',
      preferate: [/^openai\/gpt-oss-120b$/, /gpt-oss-120b/, /qwen/, /llama-3\.3-70b/, /70b/, /gpt-oss/],
      compact: true   // limita gratuită pe minut e mică: trimitem un context mai scurt
    },
    alt: {
      nume: 'Alt serviciu (compatibil OpenAI)', scurt: 'AI', fel: 'openai',
      cheieUnde: 'din contul serviciului ales (de ex. openrouter.ai/keys)', cheieLink: '',
      adresa: '', implicit: '', preferate: [], compact: false
    }
  };

  class EroareAI extends Error {
    constructor(cod, mesaj) { super(mesaj); this.cod = cod; }
  }

  const dormi = (ms, semnal) => new Promise((rez, resp) => {
    if (semnal && semnal.aborted) { resp(new EroareAI('oprit', 'Oprit.')); return; }
    const laOprire = () => { clearTimeout(t); resp(new EroareAI('oprit', 'Oprit.')); };
    const t = setTimeout(() => { if (semnal) semnal.removeEventListener('abort', laOprire); rez(); }, ms);
    if (semnal) semnal.addEventListener('abort', laOprire, { once: true });
  });

  // cât cere serviciul să așteptăm, în secunde (din antet sau din textul erorii)
  function secundeDeAsteptat(r, corp, text) {
    const antet = r && r.headers && r.headers.get && r.headers.get('retry-after');
    if (antet && !isNaN(+antet)) return +antet;
    const detalii = corp && corp.error && corp.error.details || [];
    for (const d of detalii) if (d && d.retryDelay) { const s = parseFloat(d.retryDelay); if (!isNaN(s)) return s; }
    const m = /(?:try again|retry) in\s+((?:\d+h)?(?:\d+m(?!s))?(?:[\d.]+s)?(?:[\d.]+ms)?)/i.exec(text || '');
    if (m && m[1]) {
      const t = m[1];
      let s = 0;
      const h = /(\d+)h/.exec(t), mi = /(\d+)m(?!s)/.exec(t), ms = /([\d.]+)ms/.exec(t), se = /([\d.]+)s/.exec(t.replace(/[\d.]+ms/, ''));
      if (h) s += 3600 * h[1];
      if (mi) s += 60 * mi[1];
      if (se) s += +se[1];
      if (ms) s += ms[1] / 1000;
      return s;
    }
    return null;
  }

  // o cerere HTTP cu reîncercări la limită și explicații în română pentru greșelile obișnuite
  async function cere(url, optiuni, numeServiciu, ctx) {
    ctx = ctx || {};
    for (let incercare = 0; ; incercare++) {
      let r;
      try { r = await fetch(url, Object.assign({}, optiuni, { signal: ctx.semnal })); }
      catch (e) {
        if (e && e.name === 'AbortError' || ctx.semnal && ctx.semnal.aborted) throw new EroareAI('oprit', 'Oprit.');
        const inClaude = typeof window !== 'undefined' && window.claude && typeof window.claude.use === 'function';
        throw new EroareAI('retea', inClaude
          ? 'În versiunea din Claude, pagina nu are voie să contacteze alte servicii. Aici folosește Claude, sau deschide site-ul Meșter de pe GitHub.'
          : 'Nu am putut contacta ' + numeServiciu + '. Verifică internetul; dacă persistă, serviciul poate refuza cererile făcute direct din pagini web.');
      }
      const text = await r.text();
      let corp = null;
      try { corp = text ? JSON.parse(text) : null; } catch (e) { corp = null; }
      if (r.ok) return corp;
      const eroare = corp && corp.error;
      const mesajApi = String(eroare && (eroare.message || (typeof eroare === 'string' ? eroare : '')) || corp && corp.message || text || '').slice(0, 400);
      if (r.status === 413 || /request too large|reduce your message size|context.{0,20}(length|window)|too many tokens/i.test(mesajApi)) {
        throw new EroareAI('mare', 'Cererea e prea mare pentru limita gratuită a modelului. Începe o discuție nouă, întreabă despre o parte mai mică din proiect sau alege alt model.');
      }
      if (r.status === 429 || r.status === 503 || (r.status === 500 && incercare === 0)) {
        const pePzi = /per ?day|PerDay|RPD|daily/i.test(mesajApi + ' ' + text);
        let s = r.status === 429 ? secundeDeAsteptat(r, corp, mesajApi) : 3;
        if (s === null) s = 10;
        if (!pePzi && incercare < 3 && s <= 45) {
          const asteapta = Math.ceil(s + 0.5);
          if (ctx.laAsteptare) ctx.laAsteptare(asteapta, r.status === 429 ? 'limita' : 'ocupat');
          await dormi(asteapta * 1000, ctx.semnal);
          if (ctx.laAsteptare) ctx.laAsteptare(0);
          continue;
        }
        if (r.status === 429) {
          throw new EroareAI('limita', pePzi
            ? 'Ai folosit toate cererile gratuite de azi la ' + numeServiciu + ' pentru acest model. Alege alt model (sau alt serviciu) din setări, ori revino mâine.'
            : 'Ai atins limita gratuită la ' + numeServiciu + ' (prea multe cereri într-un minut). Mai încearcă peste un minut.');
        }
        throw new EroareAI('ocupat', numeServiciu + ' e supraîncărcat acum. Încearcă din nou peste puțin timp sau alege alt model.');
      }
      if (r.status === 400 && /tool_use_failed|failed to call a function/i.test(mesajApi) && incercare < 1) continue;
      if (r.status === 401 || r.status === 403 || /api key not valid|invalid api key|API_KEY_INVALID/i.test(mesajApi)) {
        throw new EroareAI('cheie', 'Cheia nu e bună sau nu are acces la modelul ales. ' + numeServiciu + ' a răspuns: ' + mesajApi.slice(0, 200));
      }
      if (r.status === 404) throw new EroareAI('model', 'Modelul ales nu există (sau nu e disponibil pentru cheia ta) la ' + numeServiciu + '. Alege altul din setări.');
      throw new EroareAI('api', numeServiciu + ' a răspuns cu eroarea ' + r.status + ': ' + mesajApi.slice(0, 300));
    }
  }

  const adresaDe = (f, setari) => (f === 'alt' ? String(setari.adresa || '').trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '') : FURNIZORI[f].adresa);

  // lista modelelor pe care cheia le poate folosi, cu cele recomandate primele (verifică și cheia)
  async function modele(f, setari, semnal) {
    const F = FURNIZORI[f];
    if (!setari.cheie) throw new EroareAI('cheie', 'Scrie întâi cheia.');
    let lista = [];
    if (F.fel === 'gemini') {
      const d = await cere(adresaDe(f, setari) + '/models?pageSize=1000', { headers: { 'x-goog-api-key': setari.cheie } }, F.nume, { semnal });
      lista = (d && d.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => String(m.name).replace(/^models\//, ''))
        .filter(n => /gemini/.test(n) && !/embed|tts|image|live|audio|native|transcri|robotics|computer|exp-\d{4}/.test(n));
    } else {
      if (!adresaDe(f, setari)) throw new EroareAI('adresa', 'Scrie adresa serviciului (de ex. https://openrouter.ai/api/v1).');
      const d = await cere(adresaDe(f, setari) + '/models', { headers: { Authorization: 'Bearer ' + setari.cheie } }, F.nume, { semnal });
      lista = (d && (d.data || d.models) || []).map(m => m.id || m.name).filter(n => n && !/whisper|tts|guard|embed|playai|orpheus|transcri|moderation|image|dall-e/i.test(n));
    }
    const scor = (n) => { const i = F.preferate.findIndex(r => r.test(n)); return i < 0 ? 99 : i; };
    return [...new Set(lista)].sort((a, b) => scor(a) - scor(b) || a.localeCompare(b));
  }

  // schemele uneltelor: Gemini nu primește „parameters” goale, OpenAI vrea mereu un obiect
  const schema = (s) => (s && s.type ? JSON.parse(JSON.stringify(s)) : { type: 'object', properties: {} });
  async function ruleazaUnealta(unelte, nume, argumente, semnal) {
    const u = unelte.find(x => x.name === nume);
    if (!u) return { eroare: 'Unealta „' + nume + '” nu există.' };
    try {
      const r = await u.execute(argumente || {}, { signal: semnal });
      return r === undefined ? { ok: true } : r;
    } catch (e) {
      if (semnal && semnal.aborted) throw new EroareAI('oprit', 'Oprit.');
      return { eroare: e && e.message ? e.message : String(e) };
    }
  }
  const MAX_RUNDE = 12;
  const PREA_MULTI_PASI = 'Am făcut mulți pași fără să termin. Spune-mi dacă să continui.';

  // ---------- Gemini ----------
  async function intreabaGemini(o) {
    const F = FURNIZORI.gemini;
    const continut = o.ture.map(t => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] }));
    continut.push({ role: 'user', parts: [{ text: o.mesaj }] });
    const unelte = o.unelte && o.unelte.length ? [{ functionDeclarations: o.unelte.map(u => Object.assign({ name: u.name, description: u.description }, u.inputSchema ? { parameters: schema(u.inputSchema) } : {})) }] : undefined;
    let text = '', stricat = 0;
    for (let runda = 0; runda < MAX_RUNDE; runda++) {
      const corp = { systemInstruction: { parts: [{ text: o.instructiuni }] }, contents: continut, generationConfig: { temperature: 0.4, maxOutputTokens: 8192 } };
      if (unelte) corp.tools = unelte;
      const d = await cere(adresaDe('gemini', o) + '/models/' + encodeURIComponent(o.model) + ':generateContent', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': o.cheie }, body: JSON.stringify(corp)
      }, F.nume, o);
      const c = d && d.candidates && d.candidates[0];
      if (!c || !c.content || !c.content.parts) {
        const motiv = (d && d.promptFeedback && d.promptFeedback.blockReason) || (c && c.finishReason) || 'fără răspuns';
        if (/MALFORMED_FUNCTION_CALL|UNEXPECTED_TOOL_CALL/.test(motiv) && stricat++ < 2) { runda--; continue; }
        if (text) return { text };
        throw new EroareAI('gol', 'Gemini nu a dat niciun răspuns (' + motiv + '). Reformulează întrebarea.');
      }
      continut.push(c.content);   // păstrăm răspunsul întocmai, cu tot cu „semnăturile” gândirii
      const parti = c.content.parts;
      const bucata = parti.filter(p => p.text && !p.thought).map(p => p.text).join('');
      if (bucata.trim()) { text += (text ? '\n\n' : '') + bucata.trim(); if (o.laText) o.laText(text); }
      const apeluri = parti.filter(p => p.functionCall);
      if (!apeluri.length) {
        if (!text) throw new EroareAI('gol', 'Gemini nu a scris niciun răspuns. Încearcă din nou.');
        return { text, trunchiat: c.finishReason === 'MAX_TOKENS' };
      }
      const raspunsuri = [];
      for (const p of apeluri) {
        const r = await ruleazaUnealta(o.unelte, p.functionCall.name, p.functionCall.args, o.semnal);
        raspunsuri.push({ functionResponse: Object.assign({ name: p.functionCall.name, response: r && typeof r === 'object' && !Array.isArray(r) ? r : { rezultat: r } }, p.functionCall.id ? { id: p.functionCall.id } : {}) });
      }
      continut.push({ role: 'user', parts: raspunsuri });
    }
    return { text: text ? text + '\n\n' + PREA_MULTI_PASI : PREA_MULTI_PASI };
  }

  // ---------- servicii compatibile OpenAI (Groq, OpenRouter...) ----------
  async function intreabaOpenAI(o) {
    const F = FURNIZORI[o.furnizor];
    const adresa = adresaDe(o.furnizor, o);
    if (!adresa) throw new EroareAI('adresa', 'Scrie adresa serviciului în setările asistentului.');
    const mesaje = [{ role: 'system', content: o.instructiuni }].concat(o.ture.map(t => ({ role: t.role, content: t.content })), [{ role: 'user', content: o.mesaj }]);
    const unelte = o.unelte && o.unelte.length ? o.unelte.map(u => ({ type: 'function', function: { name: u.name, description: u.description, parameters: schema(u.inputSchema) } })) : undefined;
    const esteGroq = o.furnizor === 'groq';
    let text = '';
    for (let runda = 0; runda < MAX_RUNDE; runda++) {
      const corp = { model: o.model, messages: mesaje, temperature: 0.4 };
      if (unelte) { corp.tools = unelte; corp.tool_choice = 'auto'; }
      if (esteGroq) {
        // la Groq, întrebarea plus răspunsul maxim intră în limita pe minut: lăsăm loc cât se poate
        const estimare = Math.ceil(JSON.stringify(corp).length / 3.3);
        corp.max_tokens = Math.max(1500, Math.min(6000, 7800 - estimare));
        if (/gpt-oss/.test(o.model)) corp.reasoning_effort = 'low';
      } else corp.max_tokens = 8000;
      const d = await cere(adresa + '/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + o.cheie }, body: JSON.stringify(corp)
      }, F.nume, o);
      const alegere = d && d.choices && d.choices[0];
      const m = alegere && alegere.message;
      if (!m) throw new EroareAI('gol', F.nume + ' nu a dat niciun răspuns. Încearcă din nou.');
      const apeluri = (m.tool_calls || []).filter(a => a && a.function);
      const mesajAsistent = { role: 'assistant', content: m.content || '' };
      if (apeluri.length) mesajAsistent.tool_calls = apeluri.map(a => ({ id: a.id, type: 'function', function: { name: a.function.name, arguments: typeof a.function.arguments === 'string' ? a.function.arguments : JSON.stringify(a.function.arguments || {}) } }));
      mesaje.push(mesajAsistent);
      if (m.content && m.content.trim()) { text += (text ? '\n\n' : '') + m.content.trim(); if (o.laText) o.laText(text); }
      if (!apeluri.length) {
        if (!text) throw new EroareAI('gol', F.nume + ' nu a scris niciun răspuns. Încearcă din nou.');
        return { text, trunchiat: alegere.finish_reason === 'length' };
      }
      for (const a of apeluri) {
        let arg = {};
        try { arg = a.function.arguments ? (typeof a.function.arguments === 'string' ? JSON.parse(a.function.arguments) : a.function.arguments) : {}; } catch (e) { arg = null; }
        const r = arg === null ? { eroare: 'Argumentele nu sunt JSON valid. Trimite-le din nou, corect.' } : await ruleazaUnealta(o.unelte, a.function.name, arg, o.semnal);
        mesaje.push({ role: 'tool', tool_call_id: a.id, content: JSON.stringify(r).slice(0, esteGroq ? 5000 : 15000) });
      }
    }
    return { text: text ? text + '\n\n' + PREA_MULTI_PASI : PREA_MULTI_PASI };
  }

  // o = {furnizor, cheie, model, adresa, instructiuni, ture:[{role, content}], mesaj, unelte, semnal, laText, laAsteptare}
  async function intreaba(o) {
    const F = FURNIZORI[o.furnizor];
    if (!F) throw new EroareAI('furnizor', 'Alege un serviciu de AI în setările asistentului.');
    if (!o.cheie) throw new EroareAI('cheie', 'Lipsește cheia pentru ' + F.nume + '. Deschide setările asistentului.');
    if (!o.model) throw new EroareAI('model', 'Alege un model în setările asistentului.');
    return F.fel === 'gemini' ? intreabaGemini(o) : intreabaOpenAI(o);
  }

  // setările, păstrate doar în acest browser
  const setari = {
    citeste() {
      const s = M.u.memorie.citeste('ai', null) || {};
      return { furnizor: s.furnizor || '', chei: s.chei || {}, modele: s.modele || {}, adresaAlt: s.adresaAlt || '' };
    },
    scrie(s) { return M.u.memorie.scrie('ai', s); },
    pentru(f) {
      const s = setari.citeste();
      return { furnizor: f, cheie: s.chei[f] || '', model: s.modele[f] || (FURNIZORI[f] && FURNIZORI[f].implicit) || '', adresa: f === 'alt' ? s.adresaAlt : '' };
    },
    gata(f) { const x = setari.pentru(f); return !!(FURNIZORI[f] && x.cheie && x.model && (f !== 'alt' || x.adresa)); }
  };

  M.ai = { FURNIZORI, EroareAI, modele, intreaba, setari, secundeDeAsteptat };
})(window.M = window.M || {});
