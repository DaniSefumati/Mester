/* Meșter — FreeRTOS pe ESP32: sarcini pe cele două nuclee, cozi, semafoare și mutexuri, grupuri de
   evenimente, notificări, timere software, biblioteca Ticker și timerele hardware (API-ul nucleului 3.x,
   plus cel vechi 2.x). Un tic = 1 ms. Ca pe placă: o sarcină care se termină oprește placa („should not
   return”), o sarcină pe nucleul 0 care nu cedează procesorul declanșează watchdog-ul, iar o stivă prea
   mică produce „stack overflow”. */
(function (M) {
  'use strict';
  const api = M.api;
  const S = () => M.simCurenta;
  const f = api.functii;
  const txt = M.ajutoareR.txt;
  const linie = () => { const s = S(); return s && s.R ? s.R.L : 0; };
  const MAX = 4294967295;
  const tic = 1000; // µs
  const pana = (ticuri) => ticuri === undefined || ticuri >= MAX ? Infinity : S().timp + Math.max(0, ticuri) * tic;

  // rulează un callback al utilizatorului pe loc (timere, Ticker); delay() în el nu are voie să blocheze
  function ruleazaCallback(fn, args, context) {
    const sim = S();
    if (typeof fn !== 'function') return;
    const r = fn(...(args || []));
    if (r && typeof r.next === 'function') {
      let x = r.next();
      let n = 0;
      while (!x.done && n++ < 100000) {
        if (x.value && x.value.dorm > 0) sim.problema('cb-delay-' + context, 'avertisment', 'delay() în callback-ul ' + context + ' blochează toate celelalte timere. Setează doar o variabilă aici și fă treaba lungă în loop() sau într-o sarcină.', { linie: linie() });
        x = r.next();
      }
    }
  }
  // după un eveniment de timer, întreruperile rulează imediat
  function cuIsr(fn) { return () => { const sim = S(); sim.coadaIsr.push(fn); if (!sim.sarcinaCurenta) sim.ruleazaIsr(); }; }

  // ---------- sarcini ----------
  class Sarcina {
    constructor(nume, prioritate, nucleu, stiva) { this.nume = nume; this.prioritate = prioritate; this.nucleu = nucleu; this.stiva = stiva; this.notificare = 0; this.s = null; this.suspendata = false; }
    __bool() { return true; }
  }
  const curenta = () => {
    const sim = S(); const s = sim.sarcinaCurenta;
    if (!s) return null;
    if (!s.handle) { s.handle = new Sarcina(s.nume, s.prioritate, s.nucleu, 8192); s.handle.s = s; }
    return s.handle;
  };
  function creeaza(fn, nume, stiva, param, prioritate, handle, nucleu) {
    const sim = S();
    if (typeof fn !== 'function') { sim.problema('task-fn', 'eroare', 'xTaskCreate(): primul argument trebuie să fie o funcție void numeSarcina(void *parametru).', { linie: linie() }); return 0; }
    const n = txt(nume) || 'task';
    if (n.length > 16) sim.problema('task-nume', 'info', 'Numele sarcinii „' + n + '” are peste 16 caractere; FreeRTOS îl taie.', { linie: linie() });
    stiva = stiva | 0;
    if (nucleu !== undefined && nucleu !== 0 && nucleu !== 1 && nucleu !== 0x7FFFFFFF && nucleu !== -1) { sim.problema('task-nucleu', 'eroare', 'xTaskCreatePinnedToCore(): ESP32 are nucleele 0 și 1 (sau tskNO_AFFINITY).', { linie: linie() }); return 0; }
    if (sim.cip && (sim.cip.cip === 'ESP32-C3' || sim.cip.nuclee === 1) && nucleu === 1) { sim.problema('task-c3', 'eroare', sim.cip.cip + ' are un singur nucleu (0); o sarcină fixată pe nucleul 1 nu pornește.', { linie: linie() }); return 0; }
    const h = new Sarcina(n, prioritate | 0, nucleu === undefined || nucleu < 0 || nucleu > 1 ? 0 : nucleu, stiva);
    if (prioritate >= 25) sim.problema('task-prio', 'avertisment', 'Prioritatea ' + prioritate + ' e peste maximul configMAX_PRIORITIES - 1 = 24; FreeRTOS o coboară la 24.', { linie: linie() });
    const gen = (function* () {
      if (stiva < 1024) {
        throw new M.EroareRulare('Stack canary watchpoint triggered (' + n + ')', 'stack overflow', 'Sarcina „' + n + '” are doar ' + stiva + ' octeți de stivă. Pe ESP32 dă-i cel puțin 2048 (4096 dacă folosește Serial.printf sau String).');
      }
      h.laPornire = sim.timp;
      const r = fn(param === undefined ? null : param);
      if (r && typeof r.next === 'function') yield* r;
    })();
    const s = sim.sarcinaNoua(n, gen, { prioritate: Math.min(24, prioritate | 0), nucleu: h.nucleu, freertos: true });
    s.handle = h; h.s = s;
    s.laSfarsit = () => {
      if (h.sters) return;
      sim.cadere(new M.EroareRulare('abort()', 'Task should not return', 'Funcția sarcinii „' + n + '” s-a terminat. O sarcină FreeRTOS nu are voie să iasă: pune codul într-o buclă for(;;) { … } sau apelează vTaskDelete(NULL) la final.'));
    };
    if (handle && typeof handle === 'object' && 'v' in handle) handle.v = h;
    if (stiva > 0 && stiva < 2048) h.stivaMica = true;
    return 1;
  }
  api.functie('xTaskCreate', function xTaskCreate(fn, nume, stiva, param, prio, handle) { return creeaza(fn, nume, stiva, param, prio, handle, undefined); }, 'int');
  api.functie('xTaskCreatePinnedToCore', function xTaskCreatePinnedToCore(fn, nume, stiva, param, prio, handle, nucleu) { return creeaza(fn, nume, stiva, param, prio, handle, nucleu); }, 'int');
  api.functie('xTaskCreateUniversal', function xTaskCreateUniversal(fn, nume, stiva, param, prio, handle, nucleu) { return creeaza(fn, nume, stiva, param, prio, handle, nucleu); }, 'int');
  api.functie('vTaskDelete', function vTaskDelete(h) {
    const sim = S();
    const t = h && h.s ? h : curenta();
    if (!t || !t.s) return;
    t.sters = true; t.s.activa = false;
    if (t.s === sim.sarcinaCurenta) t.s.trezire = Infinity;
  }, 'void');
  api.functie('vTaskDelay', function* vTaskDelay(t) { yield { dorm: Math.max(1, (t >>> 0)) * tic }; }, 'void');
  api.functie('vTaskDelayUntil', function* vTaskDelayUntil(ultim, perioada) {
    const acum = Math.floor(S().timp / tic);
    const baza = ultim && typeof ultim === 'object' ? ultim.v >>> 0 : acum;
    const urm = baza + (perioada >>> 0);
    if (ultim && typeof ultim === 'object') ultim.v = urm;
    if (urm > acum) yield { dorm: (urm - acum) * tic - (S().timp % tic) };
  }, 'void');
  api.functie('xTaskDelayUntil', function* xTaskDelayUntil(ultim, perioada) { yield* f.vTaskDelayUntil(ultim, perioada); return 1; }, 'int');
  api.functie('xTaskGetTickCount', function xTaskGetTickCount() { return Math.floor(S().timp / tic) >>> 0; }, 'unsigned long');
  api.functie('xTaskGetTickCountFromISR', function xTaskGetTickCountFromISR() { return Math.floor(S().timp / tic) >>> 0; }, 'unsigned long');
  api.functie('xPortGetCoreID', function xPortGetCoreID() { const s = S().sarcinaCurenta; return s ? (s.nucleu === 0 ? 0 : 1) : 1; }, 'int');
  api.functie('xTaskGetCurrentTaskHandle', function xTaskGetCurrentTaskHandle() { return curenta(); }, 'TaskHandle_t');
  api.functie('pcTaskGetName', function pcTaskGetName(h) { const t = h || curenta(); return t ? t.nume : ''; }, 'cstr');
  api.functie('pcTaskGetTaskName', function pcTaskGetTaskName(h) { return f.pcTaskGetName(h); }, 'cstr');
  api.functie('uxTaskPriorityGet', function uxTaskPriorityGet(h) { const t = h || curenta(); return t ? t.prioritate : 1; }, 'unsigned int');
  api.functie('vTaskPrioritySet', function vTaskPrioritySet(h, p) { const t = h || curenta(); if (t) { t.prioritate = p; if (t.s) t.s.prioritate = p; } }, 'void');
  api.functie('uxTaskGetStackHighWaterMark', function uxTaskGetStackHighWaterMark(h) { const t = h || curenta(); if (!t) return 0; return Math.max(0, Math.round((t.stiva || 8192) - 1100 - (t.stivaMica ? 600 : 400))); }, 'unsigned int');
  api.functie('uxTaskGetNumberOfTasks', function uxTaskGetNumberOfTasks() { return S().sarcini.filter(s => s.activa).length + 6; }, 'unsigned int');
  api.functie('vTaskSuspend', function* vTaskSuspend(h) { const t = h || curenta(); if (t && t.s) { t.s.suspendata = true; if (t.s === S().sarcinaCurenta) yield { dorm: 1 }; } }, 'void');
  api.functie('vTaskResume', function vTaskResume(h) { if (h && h.s) h.s.suspendata = false; }, 'void');
  api.functie('xTaskResumeFromISR', function xTaskResumeFromISR(h) { if (h && h.s) h.s.suspendata = false; return 1; }, 'int');
  api.functie('eTaskGetState', function eTaskGetState(h) { if (!h || !h.s) return 4; if (h.sters) return 4; if (h.s.suspendata) return 3; if (h.s === S().sarcinaCurenta) return 0; return h.s.trezire > S().timp ? 2 : 1; }, 'int');
  api.functie('vTaskSuspendAll', function vTaskSuspendAll() { }, 'void');
  api.functie('xTaskResumeAll', function xTaskResumeAll() { return 0; }, 'int');
  api.functie('taskDISABLE_INTERRUPTS', function taskDISABLE_INTERRUPTS() { }, 'void');
  api.functie('taskENABLE_INTERRUPTS', function taskENABLE_INTERRUPTS() { }, 'void');
  api.functie('taskENTER_CRITICAL', function taskENTER_CRITICAL() { }, 'void');
  api.functie('taskEXIT_CRITICAL', function taskEXIT_CRITICAL() { }, 'void');
  api.functie('portYIELD_FROM_ISR', function portYIELD_FROM_ISR() { }, 'void');
  api.functie('vTaskStartScheduler', function vTaskStartScheduler() { S().problema('scheduler', 'info', 'Pe ESP32 FreeRTOS pornește singur înainte de setup(); nu apela vTaskStartScheduler().', { linie: linie() }); }, 'void');

  // notificări directe către o sarcină
  api.functie('xTaskNotifyGive', function xTaskNotifyGive(h) { if (h) h.notificare = (h.notificare >>> 0) + 1; return 1; }, 'int');
  api.functie('vTaskNotifyGiveFromISR', function vTaskNotifyGiveFromISR(h, trezit) { if (h) h.notificare = (h.notificare >>> 0) + 1; if (trezit && typeof trezit === 'object') trezit.v = 1; }, 'void');
  api.functie('ulTaskNotifyTake', function* ulTaskNotifyTake(goleste, ticuri) {
    const t = curenta();
    if (!t) return 0;
    if (!t.notificare) { const ok = yield { asteapta: () => t.notificare ? true : undefined, pana: pana(ticuri), laExpirare: false, pas: 200 }; if (!ok) return 0; }
    const v = t.notificare >>> 0;
    t.notificare = goleste ? 0 : v - 1;
    return v;
  }, 'unsigned long');
  api.functie('xTaskNotify', function xTaskNotify(h, v, act) {
    if (!h) return 0;
    switch (act) { case 1: h.notificare |= v; break; case 2: h.notificare = (h.notificare + 1) >>> 0; break; case 3: case 4: h.notificare = v >>> 0; break; default: break; }
    h.notificat = true;
    return 1;
  }, 'int');
  api.functie('xTaskNotifyFromISR', function xTaskNotifyFromISR(h, v, act, trezit) { if (trezit && typeof trezit === 'object') trezit.v = 1; return f.xTaskNotify(h, v, act); }, 'int');
  api.functie('xTaskNotifyWait', function* xTaskNotifyWait(curataIntrare, curataIesire, val, ticuri) {
    const t = curenta();
    if (!t) return 0;
    t.notificare &= ~curataIntrare;
    if (!t.notificat) { const ok = yield { asteapta: () => t.notificat ? true : undefined, pana: pana(ticuri), laExpirare: false, pas: 200 }; if (!ok) return 0; }
    if (val && typeof val === 'object') val.v = t.notificare >>> 0;
    t.notificare &= ~curataIesire; t.notificat = false;
    return 1;
  }, 'int');

  // ---------- cozi ----------
  // elementele se copiază ca valoare, ca în FreeRTOS
  const copieElement = (x) => x && typeof x === 'object' ? ('v' in x && !ArrayBuffer.isView(x) ? x.v : ArrayBuffer.isView(x) ? x.slice() : Array.isArray(x) ? x.slice() : M.ajutoareR.copie(x)) : x;
  function puneInDestinatie(dest, v) {
    if (!dest || typeof dest !== 'object') return;
    if ('v' in dest && !ArrayBuffer.isView(dest)) { dest.v = v; return; }
    if (ArrayBuffer.isView(dest) || Array.isArray(dest)) { for (let i = 0; i < dest.length && v && i < v.length; i++) dest[i] = v[i]; return; }
    if (v && typeof v === 'object') Object.assign(dest, M.ajutoareR.copie(v));
  }
  class Coada {
    constructor(lung, marime) { this.lung = lung; this.marime = marime; this.el = []; this.tip = 'coada'; }
    __bool() { return true; }
  }
  const verificaCoada = (q, op) => { if (!q || !(q instanceof Coada)) { S().problema('coada-null', 'eroare', op + '(): coada nu există (handle NULL). Creeaz-o cu xQueueCreate() în setup(), înainte de a porni sarcinile care o folosesc.', { linie: linie() }); throw new M.EroareRulare('LoadProhibited', 'coadă NULL', 'Ai folosit o coadă FreeRTOS nealocată (NULL).'); } };
  api.functie('xQueueCreate', function xQueueCreate(lung, marime) {
    if (!(lung > 0)) { S().problema('coada-lung', 'eroare', 'xQueueCreate(): lungimea cozii trebuie să fie cel puțin 1.', { linie: linie() }); return null; }
    return new Coada(lung, marime);
  }, 'QueueHandle_t');
  function* trimite(q, el, ticuri, laInceput, suprascrie) {
    verificaCoada(q, 'xQueueSend');
    if (suprascrie) { q.el = [copieElement(el)]; return 1; }
    if (q.el.length >= q.lung) {
      if (!ticuri) return 0;
      if (S().inIsr) return 0;
      const ok = yield { asteapta: () => q.el.length < q.lung ? true : undefined, pana: pana(ticuri), laExpirare: false, pas: 200 };
      if (!ok) return 0;
    }
    if (laInceput) q.el.unshift(copieElement(el)); else q.el.push(copieElement(el));
    S().consuma(3);
    return 1;
  }
  api.functie('xQueueSend', function* xQueueSend(q, el, t) { return yield* trimite(q, el, t, false); }, 'int');
  api.functie('xQueueSendToBack', function* xQueueSendToBack(q, el, t) { return yield* trimite(q, el, t, false); }, 'int');
  api.functie('xQueueSendToFront', function* xQueueSendToFront(q, el, t) { return yield* trimite(q, el, t, true); }, 'int');
  api.functie('xQueueOverwrite', function* xQueueOverwrite(q, el) { return yield* trimite(q, el, 0, false, true); }, 'int');
  api.functie('xQueueSendFromISR', function xQueueSendFromISR(q, el, trezit) { verificaCoada(q, 'xQueueSendFromISR'); if (q.el.length >= q.lung) return 0; q.el.push(copieElement(el)); if (trezit && typeof trezit === 'object') trezit.v = 1; return 1; }, 'int');
  api.functie('xQueueSendToBackFromISR', function xQueueSendToBackFromISR(q, el, trezit) { return f.xQueueSendFromISR(q, el, trezit); }, 'int');
  api.functie('xQueueOverwriteFromISR', function xQueueOverwriteFromISR(q, el, trezit) { verificaCoada(q, 'xQueueOverwriteFromISR'); q.el = [copieElement(el)]; if (trezit && typeof trezit === 'object') trezit.v = 1; return 1; }, 'int');
  api.functie('xQueueReceive', function* xQueueReceive(q, dest, ticuri) {
    verificaCoada(q, 'xQueueReceive');
    if (!q.el.length) {
      if (!ticuri || S().inIsr) return 0;
      const ok = yield { asteapta: () => q.el.length ? true : undefined, pana: pana(ticuri), laExpirare: false, pas: 200 };
      if (!ok) return 0;
    }
    puneInDestinatie(dest, q.el.shift());
    S().consuma(3);
    return 1;
  }, 'int');
  api.functie('xQueueReceiveFromISR', function xQueueReceiveFromISR(q, dest, trezit) { verificaCoada(q, 'xQueueReceiveFromISR'); if (!q.el.length) return 0; puneInDestinatie(dest, q.el.shift()); if (trezit && typeof trezit === 'object') trezit.v = 1; return 1; }, 'int');
  api.functie('xQueuePeek', function* xQueuePeek(q, dest, ticuri) {
    verificaCoada(q, 'xQueuePeek');
    if (!q.el.length) { if (!ticuri) return 0; const ok = yield { asteapta: () => q.el.length ? true : undefined, pana: pana(ticuri), laExpirare: false, pas: 200 }; if (!ok) return 0; }
    puneInDestinatie(dest, copieElement(q.el[0]));
    return 1;
  }, 'int');
  api.functie('uxQueueMessagesWaiting', function uxQueueMessagesWaiting(q) { verificaCoada(q, 'uxQueueMessagesWaiting'); return q.el.length; }, 'unsigned int');
  api.functie('uxQueueMessagesWaitingFromISR', function uxQueueMessagesWaitingFromISR(q) { return f.uxQueueMessagesWaiting(q); }, 'unsigned int');
  api.functie('uxQueueSpacesAvailable', function uxQueueSpacesAvailable(q) { verificaCoada(q, 'uxQueueSpacesAvailable'); return q.lung - q.el.length; }, 'unsigned int');
  api.functie('xQueueReset', function xQueueReset(q) { verificaCoada(q, 'xQueueReset'); q.el = []; return 1; }, 'int');
  api.functie('vQueueDelete', function vQueueDelete(q) { if (q) q.el = []; }, 'void');
  api.functie('xQueueIsQueueFullFromISR', function xQueueIsQueueFullFromISR(q) { return q.el.length >= q.lung ? 1 : 0; }, 'int');
  api.functie('xQueueIsQueueEmptyFromISR', function xQueueIsQueueEmptyFromISR(q) { return q.el.length ? 0 : 1; }, 'int');

  // ---------- semafoare și mutexuri ----------
  class Semafor {
    constructor(tip, max, init) { this.tip = tip; this.max = max; this.n = init; this.detinator = null; this.recursiv = 0; }
    __bool() { return true; }
  }
  const verificaSemafor = (s, op) => { if (!s || !(s instanceof Semafor)) { S().problema('sem-null', 'eroare', op + '(): semaforul nu există (NULL). Creează-l cu xSemaphoreCreateMutex() / xSemaphoreCreateBinary() în setup(), înainte să-l folosești.', { linie: linie() }); throw new M.EroareRulare('LoadProhibited', 'semafor NULL', 'Ai folosit un semafor FreeRTOS nealocat (NULL).'); } };
  api.functie('xSemaphoreCreateBinary', function xSemaphoreCreateBinary() { return new Semafor('binar', 1, 0); }, 'SemaphoreHandle_t');
  api.functie('vSemaphoreCreateBinary', function vSemaphoreCreateBinary(ref) { const s = new Semafor('binar', 1, 1); if (ref && typeof ref === 'object') ref.v = s; return s; }, 'void');
  api.functie('xSemaphoreCreateMutex', function xSemaphoreCreateMutex() { return new Semafor('mutex', 1, 1); }, 'SemaphoreHandle_t');
  api.functie('xSemaphoreCreateRecursiveMutex', function xSemaphoreCreateRecursiveMutex() { return new Semafor('recursiv', 1, 1); }, 'SemaphoreHandle_t');
  api.functie('xSemaphoreCreateCounting', function xSemaphoreCreateCounting(max, init) { return new Semafor('numarator', max, init); }, 'SemaphoreHandle_t');
  function* ia(s, ticuri, recursiv) {
    verificaSemafor(s, 'xSemaphoreTake');
    const sim = S();
    const eu = sim.sarcinaCurenta;
    if (recursiv && s.detinator === eu && s.recursiv > 0) { s.recursiv++; return 1; }
    if (s.tip === 'mutex' && s.detinator === eu && s.n === 0 && eu) {
      sim.problema('mutex-dublu', 'avertisment', 'O sarcină încearcă să ia un mutex pe care îl ține deja: se blochează singură (deadlock). Dă-l înapoi cu xSemaphoreGive() sau folosește un mutex recursiv.', { linie: linie() });
    }
    if (s.n <= 0) {
      if (!ticuri || sim.inIsr) return 0;
      const ok = yield { asteapta: () => s.n > 0 ? true : undefined, pana: pana(ticuri), laExpirare: false, pas: 100 };
      if (!ok) return 0;
    }
    s.n--; s.detinator = eu; if (recursiv) s.recursiv = 1;
    return 1;
  }
  function da(s, recursiv) {
    verificaSemafor(s, 'xSemaphoreGive');
    if (recursiv && s.recursiv > 1) { s.recursiv--; return 1; }
    if (s.n >= s.max) return 0;
    s.n++; s.detinator = null; s.recursiv = 0;
    return 1;
  }
  api.functie('xSemaphoreTake', function* xSemaphoreTake(s, t) { return yield* ia(s, t, false); }, 'int');
  api.functie('xSemaphoreTakeRecursive', function* xSemaphoreTakeRecursive(s, t) { return yield* ia(s, t, true); }, 'int');
  api.functie('xSemaphoreTakeFromISR', function xSemaphoreTakeFromISR(s, trezit) { verificaSemafor(s, 'xSemaphoreTakeFromISR'); if (s.n <= 0) return 0; s.n--; return 1; }, 'int');
  api.functie('xSemaphoreGive', function xSemaphoreGive(s) { return da(s, false); }, 'int');
  api.functie('xSemaphoreGiveRecursive', function xSemaphoreGiveRecursive(s) { return da(s, true); }, 'int');
  api.functie('xSemaphoreGiveFromISR', function xSemaphoreGiveFromISR(s, trezit) { const r = da(s, false); if (trezit && typeof trezit === 'object') trezit.v = 1; return r; }, 'int');
  api.functie('uxSemaphoreGetCount', function uxSemaphoreGetCount(s) { verificaSemafor(s, 'uxSemaphoreGetCount'); return s.n; }, 'unsigned int');
  api.functie('vSemaphoreDelete', function vSemaphoreDelete() { }, 'void');

  // ---------- grupuri de evenimente ----------
  class GrupEvenimente { constructor() { this.biti = 0; } __bool() { return true; } }
  api.functie('xEventGroupCreate', function xEventGroupCreate() { return new GrupEvenimente(); }, 'EventGroupHandle_t');
  api.functie('xEventGroupSetBits', function xEventGroupSetBits(g, b) { g.biti = (g.biti | b) >>> 0; return g.biti; }, 'unsigned long');
  api.functie('xEventGroupSetBitsFromISR', function xEventGroupSetBitsFromISR(g, b, trezit) { g.biti = (g.biti | b) >>> 0; if (trezit && typeof trezit === 'object') trezit.v = 1; return 1; }, 'int');
  api.functie('xEventGroupClearBits', function xEventGroupClearBits(g, b) { const v = g.biti; g.biti = (g.biti & ~b) >>> 0; return v; }, 'unsigned long');
  api.functie('xEventGroupGetBits', function xEventGroupGetBits(g) { return g.biti >>> 0; }, 'unsigned long');
  api.functie('xEventGroupWaitBits', function* xEventGroupWaitBits(g, b, curata, toate, ticuri) {
    const gata = () => toate ? (g.biti & b) === b : (g.biti & b) !== 0;
    if (!gata() && ticuri) yield { asteapta: () => gata() ? true : undefined, pana: pana(ticuri), laExpirare: false, pas: 200 };
    const v = g.biti >>> 0;
    if (gata() && curata) g.biti = (g.biti & ~b) >>> 0;
    return v;
  }, 'unsigned long');
  api.functie('vEventGroupDelete', function vEventGroupDelete() { }, 'void');

  // ---------- timere software ----------
  class TimerSoft {
    constructor(nume, perioada, repetare, id, cb) { this.nume = nume; this.perioada = perioada; this.repetare = !!repetare; this.id = id; this.cb = cb; this.activ = false; this.token = 0; }
    __bool() { return true; }
    porneste() {
      const sim = S(); const tk = ++this.token; this.activ = true;
      const pas = () => { if (tk !== this.token || !this.activ) return; if (!this.repetare) this.activ = false; ruleazaCallback(this.cb, [this], 'timerului „' + this.nume + '”'); if (this.repetare && this.activ && tk === this.token) sim.programeaza(this.perioada * tic, pas, 'mcu'); };
      sim.programeaza(Math.max(1, this.perioada) * tic, pas, 'mcu');
    }
  }
  api.functie('xTimerCreate', function xTimerCreate(nume, perioada, repetare, id, cb) {
    if (!(perioada > 0)) { S().problema('timer-0', 'eroare', 'xTimerCreate(): perioada trebuie să fie de cel puțin un tic (1 ms).', { linie: linie() }); return null; }
    return new TimerSoft(txt(nume), perioada >>> 0, repetare, id, cb);
  }, 'TimerHandle_t');
  api.functie('xTimerStart', function xTimerStart(t) { if (t) t.porneste(); return 1; }, 'int');
  api.functie('xTimerStartFromISR', function xTimerStartFromISR(t) { if (t) t.porneste(); return 1; }, 'int');
  api.functie('xTimerStop', function xTimerStop(t) { if (t) { t.activ = false; t.token++; } return 1; }, 'int');
  api.functie('xTimerReset', function xTimerReset(t) { if (t) t.porneste(); return 1; }, 'int');
  api.functie('xTimerChangePeriod', function xTimerChangePeriod(t, p) { if (t) { t.perioada = p >>> 0; t.porneste(); } return 1; }, 'int');
  api.functie('xTimerDelete', function xTimerDelete(t) { if (t) { t.activ = false; t.token++; } return 1; }, 'int');
  api.functie('xTimerIsTimerActive', function xTimerIsTimerActive(t) { return t && t.activ ? 1 : 0; }, 'int');
  api.functie('pvTimerGetTimerID', function pvTimerGetTimerID(t) { return t ? t.id : null; }, 'void*');
  api.functie('vTimerSetTimerID', function vTimerSetTimerID(t, id) { if (t) t.id = id; }, 'void');
  api.functie('pcTimerGetName', function pcTimerGetName(t) { return t ? t.nume : ''; }, 'cstr');
  api.functie('xTimerGetPeriod', function xTimerGetPeriod(t) { return t ? t.perioada : 0; }, 'unsigned long');

  // ---------- Ticker (esp_timer) ----------
  class Ticker {
    constructor() { this.token = 0; this.activ = false; }
    _porneste(us, repetare, cb, arg) {
      const sim = S();
      const tk = ++this.token; this.activ = true;
      const args = arg === undefined ? [] : [arg];
      const pas = () => { if (tk !== this.token) return; if (!repetare) this.activ = false; ruleazaCallback(cb, args, 'Ticker'); if (repetare && tk === this.token) sim.programeaza(us, pas, 'mcu'); };
      sim.programeaza(Math.max(1, us), pas, 'mcu');
    }
    attach(s, cb, arg) { this._porneste(s * 1e6, true, cb, arg); }
    attach_ms(ms, cb, arg) { this._porneste(ms * 1000, true, cb, arg); }
    attach_us(us, cb, arg) { this._porneste(us, true, cb, arg); }
    once(s, cb, arg) { this._porneste(s * 1e6, false, cb, arg); }
    once_ms(ms, cb, arg) { this._porneste(ms * 1000, false, cb, arg); }
    once_us(us, cb, arg) { this._porneste(us, false, cb, arg); }
    detach() { this.token++; this.activ = false; }
    active() { return this.activ; }
  }
  Ticker.tipuri = { active: 'bool' };
  api.clasa('Ticker', Ticker);

  // ---------- timere hardware ----------
  class TimerHw {
    constructor(frecventa) { this.frecventa = frecventa; this.baza = 0; this.t0 = S().timp; this.merge = true; this.isr = null; this.alarma = 0; this.repetare = false; this.token = 0; this.alarmaActiva = false; }
    __bool() { return true; }
    valoare() { return this.baza + (this.merge ? (S().timp - this.t0) * this.frecventa / 1e6 : 0); }
    scrie(v) { this.baza = v; this.t0 = S().timp; this.programeaza(); }
    programeaza() {
      const sim = S();
      const tk = ++this.token;
      if (!this.merge || !this.alarmaActiva || !this.isr) return;
      const v = this.valoare();
      const rest = this.alarma - v;
      if (rest < 0 && !this.repetare) return;
      const us = Math.max(1, (rest > 0 ? rest : this.alarma) * 1e6 / this.frecventa);
      sim.programeaza(us, () => {
        if (tk !== this.token) return;
        if (this.repetare) { this.baza = 0; this.t0 = sim.timp; }
        cuIsr(this.isr)();
        if (this.repetare) this.programeaza(); else this.alarmaActiva = false;
      }, 'mcu');
    }
  }
  const verificaTimer = (t, op) => { if (!t || !(t instanceof TimerHw)) { S().problema('timer-null', 'eroare', op + '(): timerul nu există (NULL). Creează-l întâi cu timerBegin().', { linie: linie() }); throw new M.EroareRulare('LoadProhibited', 'timer NULL', 'Ai folosit un timer hardware nealocat (NULL).'); } return t; };
  api.functie('timerBegin', function timerBegin(a, b, c) {
    const sim = S();
    if (b !== undefined) {
      // nucleul 2.x: timerBegin(numar, prescaler, crescator)
      sim.problema('timer-2x', 'info', 'timerBegin(număr, prescaler, sus) e din nucleul ESP32 2.x. În nucleul 3.x se scrie timerBegin(frecvență), de exemplu timerBegin(1000000) pentru un tic pe microsecundă, iar alarma cu timerAlarm(timer, valoare, repetare, 0).', { linie: linie() });
      return new TimerHw(80e6 / Math.max(1, b));
    }
    if (!(a > 0)) { sim.problema('timer-frecv', 'eroare', 'timerBegin(frecvență): frecvența trebuie să fie între 1 Hz și 80 MHz.', { linie: linie() }); return null; }
    return new TimerHw(a);
  }, 'hw_timer_t*');
  api.functie('timerEnd', function timerEnd(t) { if (t) { t.merge = false; t.token++; } }, 'void');
  api.functie('timerAttachInterrupt', function timerAttachInterrupt(t, fn) { verificaTimer(t, 'timerAttachInterrupt').isr = fn; t.programeaza(); }, 'void');
  api.functie('timerAttachInterruptArg', function timerAttachInterruptArg(t, fn, arg) { verificaTimer(t, 'timerAttachInterruptArg').isr = () => fn(arg); t.programeaza(); }, 'void');
  api.functie('timerDetachInterrupt', function timerDetachInterrupt(t) { if (t) { t.isr = null; t.token++; } }, 'void');
  api.functie('timerAlarm', function timerAlarm(t, v, repetare, nr) { verificaTimer(t, 'timerAlarm'); t.alarma = +v; t.repetare = !!repetare; t.alarmaActiva = true; t.programeaza(); }, 'void');
  api.functie('timerAlarmWrite', function timerAlarmWrite(t, v, repetare) { verificaTimer(t, 'timerAlarmWrite'); t.alarma = +v; t.repetare = !!repetare; t.programeaza(); }, 'void');
  api.functie('timerAlarmEnable', function timerAlarmEnable(t) { verificaTimer(t, 'timerAlarmEnable').alarmaActiva = true; t.programeaza(); }, 'void');
  api.functie('timerAlarmDisable', function timerAlarmDisable(t) { if (t) { t.alarmaActiva = false; t.token++; } }, 'void');
  api.functie('timerStart', function timerStart(t) { verificaTimer(t, 'timerStart'); if (!t.merge) { t.merge = true; t.t0 = S().timp; t.programeaza(); } }, 'void');
  api.functie('timerStop', function timerStop(t) { verificaTimer(t, 'timerStop'); if (t.merge) { t.baza = t.valoare(); t.merge = false; t.token++; } }, 'void');
  api.functie('timerRestart', function timerRestart(t) { verificaTimer(t, 'timerRestart').scrie(0); }, 'void');
  api.functie('timerWrite', function timerWrite(t, v) { verificaTimer(t, 'timerWrite').scrie(+v); }, 'void');
  api.functie('timerRead', function timerRead(t) { return Math.floor(verificaTimer(t, 'timerRead').valoare()); }, 'uint64_t');
  api.functie('timerReadMicros', function timerReadMicros(t) { const x = verificaTimer(t, 'timerReadMicros'); return Math.floor(x.valoare() * 1e6 / x.frecventa); }, 'uint64_t');
  api.functie('timerReadMillis', function timerReadMillis(t) { const x = verificaTimer(t, 'timerReadMillis'); return Math.floor(x.valoare() * 1e3 / x.frecventa); }, 'uint64_t');
  api.functie('timerReadSeconds', function timerReadSeconds(t) { const x = verificaTimer(t, 'timerReadSeconds'); return x.valoare() / x.frecventa; }, 'double');
  api.functie('timerGetFrequency', function timerGetFrequency(t) { return verificaTimer(t, 'timerGetFrequency').frecventa; }, 'uint32_t');

  Object.assign(api.constante, {
    tskNO_AFFINITY: 0x7FFFFFFF, APP_CPU_NUM: 1, PRO_CPU_NUM: 0, CONFIG_ARDUINO_RUNNING_CORE: 1, ARDUINO_RUNNING_CORE: 1,
    eNoAction: 0, eSetBits: 1, eIncrement: 2, eSetValueWithOverwrite: 3, eSetValueWithoutOverwrite: 4,
    eRunning: 0, eReady: 1, eBlocked: 2, eSuspended: 3, eDeleted: 4,
    queueSEND_TO_BACK: 0, queueSEND_TO_FRONT: 1, queueOVERWRITE: 2, configTICK_RATE_HZ: 1000, configMINIMAL_STACK_SIZE: 768, errQUEUE_EMPTY: 0
  });
  Object.assign(api.tipuriNumerice, { eNotifyAction: 'int', eTaskState: 'int' });
  api.include('freertos/FreeRTOS.h', 'freertos/task.h', 'freertos/queue.h', 'freertos/semphr.h', 'freertos/timers.h', 'freertos/event_groups.h', 'Ticker.h', 'esp_task_wdt.h');
  api.functie('esp_task_wdt_reset', function esp_task_wdt_reset() { const s = S().sarcinaCurenta; if (s) s.faraCedare = 0; return 0; }, 'int');
  api.functie('esp_task_wdt_add', function esp_task_wdt_add() { return 0; }, 'int');
  api.functie('esp_task_wdt_delete', function esp_task_wdt_delete() { return 0; }, 'int');
  // tipurile de „handle” (pointeri opaci în FreeRTOS)
  for (const [nume, cls] of [['TaskHandle_t', Sarcina], ['QueueHandle_t', Coada], ['SemaphoreHandle_t', Semafor], ['TimerHandle_t', TimerSoft], ['EventGroupHandle_t', GrupEvenimente], ['hw_timer_t', TimerHw], ['xTaskHandle', Sarcina], ['xQueueHandle', Coada], ['xSemaphoreHandle', Semafor], ['xTimerHandle', TimerSoft]]) {
    const C = class extends cls { };
    Object.defineProperty(C, 'name', { value: cls.name });
    C.esteHandle = true;
    api.clase[nume] = C;
  }
  M.freertos = { ruleazaCallback };
})(window.M = window.M || {});
