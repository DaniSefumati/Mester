/* Meșter — bibliotecile audio: magistrala I2S a ESP32 (driverul vechi <driver/i2s.h> și clasa I2SClass
   din <ESP_I2S.h>, nucleul 3.x) și DFRobotDFPlayerMini.
   I2S e modelat ca pe cip: după pornire, DMA-ul trimite/primește cadre în ritmul frecvenței de eșantionare.
   i2s_write() se blochează când bufferele DMA sunt pline, i2s_read() așteaptă până sosesc cadrele cerute.
   Amplificatoarele I2S (MAX98357A) redau cadrele trimise, iar microfoanele I2S (INMP441) produc cadrele
   citite, pe canalul ales de pinul lor L/R. */
(function (M) {
  'use strict';
  const api = M.api;
  const S = () => M.simCurenta;
  const f = api.functii;
  const linie = () => { const s = S(); return s && s.R ? s.R.L : 0; };
  const txt = M.ajutoareR.txt;

  // ---------- portul I2S ----------
  const CAP = 1 << 17; // cadre păstrate pentru redare (~3 s la 44,1 kHz)
  class PortI2S {
    constructor(sim, nr) {
      this.sim = sim; this.nr = nr;
      this.pini = { mclk: -1, bclk: -1, ws: -1, dout: -1, din: -1 };
      this.tx = false; this.rx = false; this.master = true; this.pornit = false;
      this.rata = 44100; this.biti = 16; this.format = 'stereo'; // stereo | mono-L | mono-R | tot-L | tot-R
      this.dmaCadre = 512;
      this.t0 = 0; this.scrisIdx = 0; this.citIdx = 0;
      this.buf = null; this.marca = null;
      this.octetiPartiali = [];
      this.ultimaScriere = -1e12;
      this.pauze = 0;
    }
    porneste() {
      const sim = this.sim;
      this.pornit = true; this.t0 = sim.timp; this.scrisIdx = 0; this.citIdx = 0;
      if (this.tx && !this.buf) { this.buf = new Float32Array(CAP * 2); this.marca = new Float64Array(CAP).fill(-1); }
      if (this.tx && this.buf) this.marca.fill(-1);
      this.octetiPartiali = [];
      this.verificaPini();
    }
    opreste() { this.pornit = false; }
    idx(t) { return Math.floor((t - this.t0) * this.rata / 1e6); }
    octetiPeEsantion() { return this.biti <= 8 ? 1 : this.biti <= 16 ? 2 : 4; }
    // formate: stereo [L,R] · tot-L / tot-R (două eșantioane pe cadru, se folosește unul, pe ambele canale)
    //          mono-L / mono-R (un eșantion pe cadru, pe un singur canal) · mono (un eșantion, pe ambele canale)
    esantioanePeCadru() { return this.format === 'stereo' || this.format === 'tot-L' || this.format === 'tot-R' ? 2 : 1; }
    // octeți -> cadre stereo [L, R, L, R, …] cu valori între −1 și 1
    decodeaza(oct) {
      const b = this.octetiPeEsantion(), k = this.esantioanePeCadru();
      const n = Math.floor(oct.length / (b * k));
      const out = new Float32Array(n * 2);
      const citeste = (p) => {
        if (b === 1) return ((oct[p] & 255) - 128) / 128;
        if (b === 2) { let v = (oct[p] & 255) | ((oct[p + 1] & 255) << 8); if (v & 0x8000) v -= 0x10000; return v / 32768; }
        const v = ((oct[p] & 255) | ((oct[p + 1] & 255) << 8) | ((oct[p + 2] & 255) << 16) | ((oct[p + 3] & 255) << 24));
        return v / 2147483648;
      };
      const fmt = this.format;
      for (let i = 0; i < n; i++) {
        const p = i * b * k;
        const a = citeste(p), c = k === 2 ? citeste(p + b) : a;
        let L = a, R = c;
        if (fmt === 'mono-L') R = 0; else if (fmt === 'mono-R') L = 0;
        else if (fmt === 'tot-L') R = a; else if (fmt === 'tot-R') L = c;
        out[2 * i] = L; out[2 * i + 1] = R;
      }
      return out;
    }
    // cadre stereo -> octeți în formatul portului (la recepție)
    codifica(cadre, oct, deLa) {
      const b = this.octetiPeEsantion(), k = this.esantioanePeCadru();
      const n = cadre.length / 2;
      let p = deLa || 0;
      const scrie = (x) => {
        x = Math.max(-1, Math.min(0.9999999, x));
        if (b === 1) { oct[p++] = (Math.round(x * 127) + 128) & 255; return; }
        if (b === 2) { const v = Math.round(x * 32767) & 0xFFFF; oct[p++] = v & 255; oct[p++] = v >> 8; return; }
        // 24 de biți aliniați la stânga într-un cuvânt de 32 (ca INMP441)
        const v = (Math.round(x * 8388607) << 8) | 0;
        oct[p++] = v & 255; oct[p++] = (v >> 8) & 255; oct[p++] = (v >> 16) & 255; oct[p++] = (v >>> 24) & 255;
      };
      const fmt = this.format;
      for (let i = 0; i < n; i++) {
        const L = cadre[2 * i], R = cadre[2 * i + 1];
        if (fmt === 'stereo') { scrie(L); scrie(R); }
        else if (fmt === 'tot-L') { scrie(L); scrie(L); }
        else if (fmt === 'tot-R') { scrie(R); scrie(R); }
        else scrie(fmt === 'mono-R' ? R : L);
      }
      return p;
    }
    // ---------- emisie ----------
    *scrieOcteti(src, n, asteptareUs) {
      if (!this.tx || !this.pornit) return 0;
      const vechi = this.octetiPartiali.length;
      const oct = this.octetiPartiali.concat(Array.from(src.subarray ? src.subarray(0, n) : src.slice(0, n)));
      const marime = this.octetiPeEsantion() * this.esantioanePeCadru();
      const complet = Math.floor(oct.length / marime) * marime;
      const cadre = this.decodeaza(oct.slice(0, complet));
      const nrCadre = cadre.length / 2;
      const scrise = yield* this.scrieCadre(cadre, nrCadre, asteptareUs);
      if (scrise === nrCadre) { this.octetiPartiali = oct.slice(complet); return n; }
      this.octetiPartiali = [];
      return Math.max(0, Math.min(n, scrise * marime - vechi));
    }
    *scrieCadre(cadre, nr, asteptareUs) {
      const sim = this.sim;
      const lim = asteptareUs === undefined || asteptareUs >= 4e9 ? Infinity : sim.timp + asteptareUs;
      let i = 0;
      while (i < nr) {
        const acum = this.idx(sim.timp);
        if (this.scrisIdx < acum) {
          // DMA-ul a rămas fără date: pe difuzor se aude o pauză / un pocnet
          if (this.scrisIdx > 0 && acum - this.scrisIdx > 4 && sim.timp - this.ultimaScriere < 150000) {
            this.pauze++;
            if (this.pauze > 3) sim.problema('i2s-gol-' + this.nr, 'avertisment', 'I2S: bufferul DMA se golește între scrieri, așa că sunetul are pauze și pocnituri. Trimite datele mai des (i2s_write() într-o buclă fără delay() lung) sau mărește dma_buf_count / dma_buf_len.', { linie: linie() });
          }
          this.scrisIdx = acum;
        }
        const liber = this.dmaCadre - (this.scrisIdx - acum);
        if (liber <= 0) {
          if (sim.timp >= lim) break;
          const us = Math.max(40, Math.ceil((1 - liber) * 1e6 / this.rata));
          yield { dorm: Math.min(us, lim === Infinity ? us : Math.max(1, lim - sim.timp)) };
          continue;
        }
        const k = Math.min(liber, nr - i);
        const mask = CAP - 1;
        for (let j = 0; j < k; j++) {
          const fr = this.scrisIdx + j, p = fr & mask;
          this.buf[2 * p] = cadre[2 * (i + j)]; this.buf[2 * p + 1] = cadre[2 * (i + j) + 1]; this.marca[p] = fr;
        }
        this.scrisIdx += k; i += k;
        this.ultimaScriere = sim.timp;
      }
      sim.consuma(nr * 0.02);
      return i;
    }
    // eșantioanele redate în [t0, t1): { L, R }
    randeaza(t0, t1, n) {
      const L = new Float32Array(n), R = new Float32Array(n);
      if (!this.pornit || !this.tx || !this.buf) return { L, R };
      const dt = (t1 - t0) / n, mask = CAP - 1;
      for (let s = 0; s < n; s++) {
        const fa = (t0 + s * dt - this.t0) * this.rata / 1e6, fb = fa + dt * this.rata / 1e6;
        const i0 = Math.floor(fa), i1 = Math.max(i0 + 1, Math.floor(fb));
        let sl = 0, sr = 0, c = 0;
        for (let fr = i0; fr < i1; fr++) {
          c++;
          if (fr < 0) continue;
          const p = fr & mask;
          if (this.marca[p] === fr) { sl += this.buf[2 * p]; sr += this.buf[2 * p + 1]; }
        }
        if (c) { L[s] = sl / c; R[s] = sr / c; }
      }
      return { L, R };
    }
    // ---------- recepție ----------
    surseRx() {
      const sim = this.sim;
      const nBclk = sim.netGPIO(this.pini.bclk), nWs = sim.netGPIO(this.pini.ws), nDin = sim.netGPIO(this.pini.din);
      const r = [];
      for (const d of sim.disp.values()) {
        if (!d.microfonI2S) continue;
        const pe = (p) => sim.netPin(d.inst, p);
        if (pe(d.microfonI2S.sd) !== nDin || nDin < 0) continue;
        if (pe(d.microfonI2S.sck) !== nBclk || pe(d.microfonI2S.ws) !== nWs) continue;
        r.push(d);
      }
      return r;
    }
    *citesteCadre(nr, asteptareUs) {
      const sim = this.sim;
      if (!this.rx || !this.pornit) return new Float32Array(0);
      const lim = asteptareUs === undefined || asteptareUs >= 4e9 ? Infinity : sim.timp + asteptareUs;
      let acum = this.idx(sim.timp);
      // bufferele DMA s-au umplut și cadrele vechi s-au pierdut
      if (acum - this.citIdx > this.dmaCadre) this.citIdx = acum - this.dmaCadre;
      while (acum < this.citIdx + nr) {
        if (sim.timp >= lim) break;
        const us = Math.ceil((this.citIdx + nr - acum) * 1e6 / this.rata) + 1;
        yield { dorm: lim === Infinity ? us : Math.max(1, Math.min(us, lim - sim.timp)) };
        acum = this.idx(sim.timp);
      }
      const n = Math.max(0, Math.min(nr, acum - this.citIdx));
      const out = new Float32Array(n * 2);
      const surse = this.surseRx();
      for (const d of surse) {
        const canal = d.canalI2S ? d.canalI2S() : 'L';
        if (!canal) continue;
        const o = canal === 'R' ? 1 : 0;
        for (let i = 0; i < n; i++) {
          const t = this.t0 + (this.citIdx + i) * 1e6 / this.rata;
          out[2 * i + o] += d.esantionI2S(t);
        }
      }
      this.citIdx += n;
      return out;
    }
    *citesteOcteti(dest, n, asteptareUs) {
      if (!this.rx || !this.pornit) return 0;
      const marime = this.octetiPeEsantion() * this.esantioanePeCadru();
      const nrCadre = Math.floor(n / marime);
      const cadre = yield* this.citesteCadre(nrCadre, asteptareUs);
      const oct = new Uint8Array(cadre.length / 2 * marime);
      this.codifica(cadre, oct, 0);
      const tinta = ArrayBuffer.isView(dest) ? new Uint8Array(dest.buffer, dest.byteOffset, dest.byteLength) : null;
      if (tinta) tinta.set(oct.subarray(0, Math.min(oct.length, tinta.length)));
      else if (Array.isArray(dest)) for (let i = 0; i < oct.length && i < dest.length; i++) dest[i] = oct[i];
      this.sim.consuma(oct.length * 0.01);
      return oct.length;
    }
    // ---------- verificarea legăturilor ----------
    verificaPini() {
      const sim = this.sim;
      const cip = sim.cip || {};
      for (const [k, g] of Object.entries(this.pini)) {
        if (g < 0 || k === 'mclk') continue;
        if ((k === 'dout' || k === 'bclk' || k === 'ws') && cip.doarIntrare && cip.doarIntrare.includes(g) && (k === 'dout' || this.master)) {
          sim.problema('i2s-pin-' + g, 'eroare', 'I2S: GPIO' + g + ' e doar intrare, deci nu poate fi ' + ({ dout: 'ieșirea de date (DOUT)', bclk: 'ceasul BCLK', ws: 'semnalul WS/LRC' })[k] + '.', { linie: linie() });
        }
      }
      if (this.rx && this.pini.din >= 0) {
        const surse = this.surseRx();
        const mic = [...sim.disp.values()].filter(d => d.microfonI2S);
        if (!surse.length && mic.length) {
          const d = mic[0], pe = (p) => sim.netPin(d.inst, p);
          const g = (p) => { const n = pe(p); const x = sim.gpioDinNet(n); return x >= 0 ? 'GPIO' + x : 'nelegat'; };
          sim.problema('i2s-mic-' + d.inst.id, 'eroare', 'I2S ascultă pe BCLK=GPIO' + this.pini.bclk + ', WS=GPIO' + this.pini.ws + ', DIN=GPIO' + this.pini.din + ', dar ' + d.inst.eticheta + ' are SCK pe ' + g(d.microfonI2S.sck) + ', WS pe ' + g(d.microfonI2S.ws) + ' și SD pe ' + g(d.microfonI2S.sd) + '. Pinii din cod trebuie să fie cei din schemă; altfel citești doar zerouri.', { linie: linie(), comp: d.inst.id });
        }
        for (const d of surse) {
          const c = d.canalI2S ? d.canalI2S() : 'L';
          if (c === 'L' && this.format === 'mono-R') sim.problema('i2s-canal-' + d.inst.id, 'avertisment', d.inst.eticheta + ' are L/R la GND, deci trimite pe canalul STÂNG, dar codul citește doar canalul drept (ONLY_RIGHT). Citești doar zerouri: folosește I2S_CHANNEL_FMT_ONLY_LEFT sau leagă L/R la 3,3 V.', { linie: linie(), comp: d.inst.id });
          if (c === 'R' && this.format === 'mono-L') sim.problema('i2s-canal-' + d.inst.id, 'avertisment', d.inst.eticheta + ' are L/R la 3,3 V, deci trimite pe canalul DREPT, dar codul citește doar canalul stâng. Citești doar zerouri: folosește canalul drept sau leagă L/R la GND.', { linie: linie(), comp: d.inst.id });
        }
      }
    }
  }
  // porturile I2S ale simulării curente
  function port(nr, operatie) {
    const sim = S();
    const max = sim.cip && sim.cip.cip === 'ESP32-C3' ? 1 : 2;
    nr = nr | 0;
    if (nr < 0 || nr >= max) { sim.problema('i2s-port-' + nr, 'eroare', (operatie || 'I2S') + ': ' + (sim.cip ? sim.cip.cip : 'placa') + ' are ' + (max === 1 ? 'un singur port I2S (I2S_NUM_0)' : 'doar porturile I2S_NUM_0 și I2S_NUM_1') + '.', { linie: linie() }); return null; }
    sim.__i2s = sim.__i2s || [];
    if (!sim.__i2s[nr]) sim.__i2s[nr] = new PortI2S(sim, nr);
    return sim.__i2s[nr];
  }
  // pentru amplificatoarele I2S: portul care emite pe pinii lor
  M.i2s = {
    PortI2S,
    emitator(sim, nBclk, nWs, nDin) {
      for (const p of (sim.__i2s || [])) {
        if (!p || !p.tx || !p.pornit) continue;
        if (sim.netGPIO(p.pini.dout) === nDin && nDin >= 0) return { port: p, bclk: sim.netGPIO(p.pini.bclk) === nBclk, ws: sim.netGPIO(p.pini.ws) === nWs, inversat: sim.netGPIO(p.pini.bclk) === nWs && sim.netGPIO(p.pini.ws) === nBclk };
      }
      return null;
    },
    porturi(sim) { return (sim.__i2s || []).filter(Boolean); }
  };
  api.creatoriObiecte.push((sim) => { if (sim) sim.__i2s = []; return {}; });

  // ---------- driverul vechi (ESP-IDF, <driver/i2s.h>) ----------
  class i2s_config_t {
    constructor() { this.mode = 0; this.sample_rate = 0; this.bits_per_sample = 0; this.channel_format = 0; this.communication_format = 0; this.intr_alloc_flags = 0; this.dma_buf_count = 0; this.dma_buf_len = 0; this.use_apll = false; this.tx_desc_auto_clear = false; this.fixed_mclk = 0; this.mclk_multiple = 0; this.bits_per_chan = 0; this.dma_desc_num = 0; this.dma_frame_num = 0; }
    __copie() { return Object.assign(new i2s_config_t(), this); }
  }
  i2s_config_t.proprietati = { mode: 'int', sample_rate: 'int', bits_per_sample: 'int', channel_format: 'int', communication_format: 'int', intr_alloc_flags: 'int', dma_buf_count: 'int', dma_buf_len: 'int', use_apll: 'bool', tx_desc_auto_clear: 'bool', fixed_mclk: 'int', mclk_multiple: 'int', bits_per_chan: 'int', dma_desc_num: 'int', dma_frame_num: 'int' };
  i2s_config_t.ordine = ['mode', 'sample_rate', 'bits_per_sample', 'channel_format', 'communication_format', 'intr_alloc_flags', 'dma_buf_count', 'dma_buf_len', 'use_apll', 'tx_desc_auto_clear', 'fixed_mclk'];
  api.clasa('i2s_config_t', i2s_config_t);
  class i2s_pin_config_t {
    constructor() { this.mck_io_num = -1; this.bck_io_num = -1; this.ws_io_num = -1; this.data_out_num = -1; this.data_in_num = -1; this.__pozitional = false; }
    __copie() { return Object.assign(new i2s_pin_config_t(), this); }
  }
  i2s_pin_config_t.proprietati = { mck_io_num: 'int', bck_io_num: 'int', ws_io_num: 'int', data_out_num: 'int', data_in_num: 'int' };
  // din ESP-IDF 4.4 primul câmp e mck_io_num — inițializarea pe poziții {BCK, WS, OUT, IN} din tutorialele vechi îl nimerește greșit
  i2s_pin_config_t.ordine = ['mck_io_num', 'bck_io_num', 'ws_io_num', 'data_out_num', 'data_in_num'];
  api.clasa('i2s_pin_config_t', i2s_pin_config_t);
  Object.assign(api.tipuriNumerice, {
    i2s_port_t: 'int', i2s_mode_t: 'int', i2s_bits_per_sample_t: 'int', i2s_channel_fmt_t: 'int', i2s_comm_format_t: 'int', i2s_bits_per_chan_t: 'int',
    i2s_mclk_multiple_t: 'int', i2s_channel_t: 'int', i2s_dac_mode_t: 'int', i2s_data_bit_width_t: 'int', i2s_slot_mode_t: 'int', i2s_std_slot_mask_t: 'int', i2s_role_t: 'int', i2s_rx_transform_t: 'int'
  });
  Object.assign(api.constante, {
    I2S_NUM_0: 0, I2S_NUM_1: 1, I2S_NUM_MAX: 2, I2S_NUM_AUTO: -1,
    I2S_MODE_MASTER: 1, I2S_MODE_SLAVE: 2, I2S_MODE_TX: 4, I2S_MODE_RX: 8, I2S_MODE_DAC_BUILT_IN: 16, I2S_MODE_ADC_BUILT_IN: 32, I2S_MODE_PDM: 64,
    I2S_BITS_PER_SAMPLE_8BIT: 8, I2S_BITS_PER_SAMPLE_16BIT: 16, I2S_BITS_PER_SAMPLE_24BIT: 24, I2S_BITS_PER_SAMPLE_32BIT: 32,
    I2S_BITS_PER_CHAN_DEFAULT: 0, I2S_BITS_PER_CHAN_8BIT: 8, I2S_BITS_PER_CHAN_16BIT: 16, I2S_BITS_PER_CHAN_24BIT: 24, I2S_BITS_PER_CHAN_32BIT: 32,
    I2S_CHANNEL_FMT_RIGHT_LEFT: 0, I2S_CHANNEL_FMT_ALL_RIGHT: 1, I2S_CHANNEL_FMT_ALL_LEFT: 2, I2S_CHANNEL_FMT_ONLY_RIGHT: 3, I2S_CHANNEL_FMT_ONLY_LEFT: 4,
    I2S_COMM_FORMAT_STAND_I2S: 1, I2S_COMM_FORMAT_STAND_MSB: 3, I2S_COMM_FORMAT_STAND_PCM_SHORT: 4, I2S_COMM_FORMAT_STAND_PCM_LONG: 12, I2S_COMM_FORMAT_STAND_MAX: 16,
    I2S_COMM_FORMAT_I2S: 1, I2S_COMM_FORMAT_I2S_MSB: 1, I2S_COMM_FORMAT_I2S_LSB: 2, I2S_COMM_FORMAT_PCM: 4, I2S_COMM_FORMAT_PCM_SHORT: 4, I2S_COMM_FORMAT_PCM_LONG: 8,
    I2S_CHANNEL_MONO: 1, I2S_CHANNEL_STEREO: 2, I2S_PIN_NO_CHANGE: -1,
    I2S_DAC_CHANNEL_DISABLE: 0, I2S_DAC_CHANNEL_RIGHT_EN: 1, I2S_DAC_CHANNEL_LEFT_EN: 2, I2S_DAC_CHANNEL_BOTH_EN: 3,
    I2S_MCLK_MULTIPLE_DEFAULT: 0, I2S_MCLK_MULTIPLE_128: 128, I2S_MCLK_MULTIPLE_256: 256, I2S_MCLK_MULTIPLE_384: 384,
    ESP_INTR_FLAG_DEFAULT: 0, ESP_INTR_FLAG_LEVEL1: 2, ESP_INTR_FLAG_LEVEL2: 4, ESP_INTR_FLAG_LEVEL3: 8, ESP_INTR_FLAG_IRAM: 1024,
    ESP_ERR_INVALID_STATE: 259, ESP_ERR_NO_MEM: 257, ESP_ERR_NOT_FOUND: 261,
    // <ESP_I2S.h> (nucleul 3.x)
    I2S_MODE_STD: 0, I2S_MODE_TDM: 1, I2S_MODE_PDM_TX: 2, I2S_MODE_PDM_RX: 3,
    I2S_DATA_BIT_WIDTH_8BIT: 8, I2S_DATA_BIT_WIDTH_16BIT: 16, I2S_DATA_BIT_WIDTH_24BIT: 24, I2S_DATA_BIT_WIDTH_32BIT: 32,
    I2S_SLOT_MODE_MONO: 1, I2S_SLOT_MODE_STEREO: 2, I2S_STD_SLOT_LEFT: 1, I2S_STD_SLOT_RIGHT: 2, I2S_STD_SLOT_BOTH: 3,
    I2S_ROLE_MASTER: 0, I2S_ROLE_SLAVE: 1,
    I2S_RX_TRANSFORM_NONE: 0, I2S_RX_TRANSFORM_32_TO_16: 1, I2S_RX_TRANSFORM_16_STEREO_TO_MONO: 2, I2S_RX_TRANSFORM_8_UNPACK: 3
  });
  const FORMATE = { 0: 'stereo', 1: 'tot-R', 2: 'tot-L', 3: 'mono-R', 4: 'mono-L' };
  const asteptareDinTicuri = (x) => (x === undefined || x >= 4294967295 || x < 0) ? Infinity : x * 1000; // 1 tic = 1 ms
  const instalate = (sim) => (sim.__i2sLegacy = sim.__i2sLegacy || {});

  api.functie('i2s_driver_install', function i2s_driver_install(nr, cfg) {
    const sim = S();
    const p = port(nr, 'i2s_driver_install');
    if (!p) return 258;
    if (!cfg) { sim.problema('i2s-cfg', 'eroare', 'i2s_driver_install(): lipsește configurația (&i2s_config).', { linie: linie() }); return 258; }
    if (instalate(sim)[nr]) { sim.problema('i2s-dublu-' + nr, 'avertisment', 'i2s_driver_install() a fost apelat de două ori pentru I2S_NUM_' + nr + '; a doua oară întoarce ESP_ERR_INVALID_STATE. Apelează i2s_driver_uninstall() înainte.', { linie: linie() }); return 259; }
    const mod = cfg.mode | 0;
    p.master = !(mod & 2);
    p.tx = !!(mod & 4); p.rx = !!(mod & 8);
    p.rata = cfg.sample_rate > 0 ? cfg.sample_rate : 44100;
    p.biti = cfg.bits_per_sample || 16;
    p.format = FORMATE[cfg.channel_format | 0] || 'stereo';
    const nrBuf = cfg.dma_buf_count || cfg.dma_desc_num || 2, lung = cfg.dma_buf_len || cfg.dma_frame_num || 64;
    p.dmaCadre = Math.max(8, nrBuf * lung);
    if (lung > 1024) sim.problema('i2s-dma', 'avertisment', 'dma_buf_len = ' + lung + ': ESP-IDF acceptă cel mult 1024 de cadre pe buffer.', { linie: linie() });
    if (mod & 16) sim.problema('i2s-dac', 'info', 'Modul I2S_MODE_DAC_BUILT_IN (sunet pe DAC-ul intern, GPIO25/26) nu e simulat. Pentru sunet prin DAC folosește dacWrite(), sau un amplificator I2S ca MAX98357A.', { linie: linie() });
    if (!p.tx && !p.rx) sim.problema('i2s-mod', 'avertisment', 'I2S: în .mode lipsește I2S_MODE_TX sau I2S_MODE_RX, deci portul nici nu trimite, nici nu primește.', { linie: linie() });
    if (!p.master) sim.problema('i2s-slave', 'avertisment', 'I2S în modul SLAVE așteaptă ceasul (BCLK/WS) de la alt dispozitiv. Microfoanele și amplificatoarele obișnuite nu generează ceas: folosește I2S_MODE_MASTER.', { linie: linie() });
    instalate(sim)[nr] = true;
    p.porneste();
    sim.consuma(300);
    return 0;
  }, 'int');
  api.functie('i2s_driver_uninstall', function i2s_driver_uninstall(nr) { const p = port(nr); if (!p) return 258; p.opreste(); p.tx = p.rx = false; delete instalate(S())[nr]; return 0; }, 'int');
  api.functie('i2s_set_pin', function i2s_set_pin(nr, pc) {
    const sim = S();
    const p = port(nr, 'i2s_set_pin');
    if (!p) return 258;
    if (!instalate(sim)[nr]) { sim.problema('i2s-ordine', 'eroare', 'i2s_set_pin() înainte de i2s_driver_install(): întâi instalezi driverul, apoi setezi pinii.', { linie: linie() }); return 259; }
    if (!pc) { sim.problema('i2s-dac-pin', 'info', 'i2s_set_pin(port, NULL) înseamnă DAC-ul intern (GPIO25/26), care nu e simulat.', { linie: linie() }); return 0; }
    const mck = pc.mck_io_num;
    const valideMck = sim.cip && sim.cip.cip === 'ESP32' ? [-1, 0, 1, 3] : null;
    if (valideMck && !valideMck.includes(mck)) {
      sim.problema('i2s-mck', 'eroare', 'i2s_set_pin(): mck_io_num = ' + mck + ', dar pe ESP32 MCLK poate ieși doar pe GPIO0, 1 sau 3, deci funcția întoarce ESP_ERR_INVALID_ARG și pinii nu se setează. Cauza obișnuită: structura i2s_pin_config_t are primul câmp mck_io_num (din ESP-IDF 4.4), iar inițializarea pe poziții {' + [pc.mck_io_num, pc.bck_io_num, pc.ws_io_num, pc.data_out_num].join(', ') + '} mută toate valorile cu un loc. Scrie câmpurile cu nume: .bck_io_num = …, .ws_io_num = …, .data_out_num = …, .data_in_num = … .', { linie: linie() });
      return 258;
    }
    const nou = (v, vechi) => v === -1 ? (vechi === undefined ? -1 : vechi) : v;
    p.pini = { mclk: mck, bclk: nou(pc.bck_io_num, p.pini.bclk), ws: nou(pc.ws_io_num, p.pini.ws), dout: nou(pc.data_out_num, p.pini.dout), din: nou(pc.data_in_num, p.pini.din) };
    for (const [k, g] of Object.entries(p.pini)) if (g >= 0 && k !== 'mclk' && !sim.pin(g, 'I2S')) return 258;
    if (p.tx && p.pini.dout < 0) sim.problema('i2s-dout', 'avertisment', 'I2S e configurat pentru emisie (I2S_MODE_TX), dar data_out_num = -1: datele nu ies pe niciun pin.', { linie: linie() });
    if (p.rx && p.pini.din < 0) sim.problema('i2s-din', 'avertisment', 'I2S e configurat pentru recepție (I2S_MODE_RX), dar data_in_num = -1: nu intră date de nicăieri.', { linie: linie() });
    p.verificaPini();
    return 0;
  }, 'int');
  api.functie('i2s_start', function i2s_start(nr) { const p = port(nr); if (!p) return 258; if (!p.pornit) p.porneste(); return 0; }, 'int');
  api.functie('i2s_stop', function i2s_stop(nr) { const p = port(nr); if (!p) return 258; p.opreste(); return 0; }, 'int');
  api.functie('i2s_zero_dma_buffer', function i2s_zero_dma_buffer(nr) { const p = port(nr); if (!p) return 258; if (p.marca) p.marca.fill(-1); return 0; }, 'int');
  api.functie('i2s_set_clk', function i2s_set_clk(nr, rata, biti, canale) {
    const p = port(nr); if (!p) return 258;
    const eraPornit = p.pornit;
    p.rata = rata > 0 ? rata : p.rata; p.biti = biti || p.biti;
    if (canale === 1) p.format = p.format === 'stereo' ? 'mono' : p.format; else if (canale === 2) p.format = 'stereo';
    if (eraPornit) p.porneste();
    return 0;
  }, 'int');
  api.functie('i2s_set_sample_rates', function i2s_set_sample_rates(nr, rata) { const p = port(nr); if (!p) return 258; p.rata = rata > 0 ? rata : p.rata; if (p.pornit) p.porneste(); return 0; }, 'int');
  api.functie('i2s_set_dac_mode', function i2s_set_dac_mode() { return 0; }, 'int');
  api.functie('i2s_write', function* i2s_write(nr, src, n, scrisi, ticuri) {
    const sim = S();
    const p = port(nr, 'i2s_write');
    if (!p) return 258;
    if (!instalate(sim)[nr] || !p.tx) { sim.problema('i2s-write', 'eroare', 'i2s_write(): portul I2S_NUM_' + nr + ' nu e instalat pentru emisie (lipsește i2s_driver_install cu I2S_MODE_TX).', { linie: linie() }); if (scrisi) scrisi.v = 0; return 259; }
    const oct = octeti(src, n);
    const k = yield* p.scrieOcteti(oct, oct.length, asteptareDinTicuri(ticuri));
    if (scrisi && typeof scrisi === 'object') scrisi.v = k;
    return k < oct.length && ticuri !== undefined && ticuri < 4294967295 ? 263 : 0;
  }, 'int');
  api.functie('i2s_read', function* i2s_read(nr, dest, n, cititi, ticuri) {
    const sim = S();
    const p = port(nr, 'i2s_read');
    if (!p) return 258;
    if (!instalate(sim)[nr] || !p.rx) { sim.problema('i2s-read', 'eroare', 'i2s_read(): portul I2S_NUM_' + nr + ' nu e instalat pentru recepție (lipsește i2s_driver_install cu I2S_MODE_RX).', { linie: linie() }); if (cititi) cititi.v = 0; return 259; }
    const k = yield* p.citesteOcteti(dest, Math.min(n, marimeOcteti(dest)), asteptareDinTicuri(ticuri));
    if (cititi && typeof cititi === 'object') cititi.v = k;
    return 0;
  }, 'int');
  // conținutul unui tablou (orice tip) ca octeți
  function octeti(src, n) {
    if (ArrayBuffer.isView(src)) { const u = new Uint8Array(src.buffer, src.byteOffset, src.byteLength); return u.subarray(0, Math.min(n, u.length)); }
    if (typeof src === 'string') { const u = new Uint8Array(Math.min(n, src.length)); for (let i = 0; i < u.length; i++) u[i] = src.charCodeAt(i) & 255; return u; }
    if (Array.isArray(src)) return Uint8Array.from(src.slice(0, n), x => x & 255);
    if (src && typeof src === 'object' && 'v' in src) { const u = new Uint8Array(4); new DataView(u.buffer).setInt32(0, src.v | 0, true); return u.subarray(0, Math.min(n, 4)); }
    return new Uint8Array(0);
  }
  const marimeOcteti = (d) => ArrayBuffer.isView(d) ? d.byteLength : Array.isArray(d) ? d.length : 0;
  api.include('driver/i2s.h', 'driver/i2s_std.h', 'I2S.h', 'ESP_I2S.h');

  // ---------- I2SClass (<ESP_I2S.h>, nucleul Arduino-ESP32 3.x) ----------
  class I2SClass extends api.clase.Stream {
    constructor(nr) { super(); this.nr = nr === undefined || nr < 0 ? -1 : nr; this.pini = { bclk: -1, ws: -1, dout: -1, din: -1, mclk: -1 }; this.eroare = 0; this.p = null; }
    setPort(nr) { this.nr = nr; return true; }
    getPort() { return this.p ? this.p.nr : this.nr; }
    setPins(bclk, ws, dout, din, mclk) { this.pini = { bclk, ws, dout: dout === undefined ? -1 : dout, din: din === undefined ? -1 : din, mclk: mclk === undefined ? -1 : mclk }; }
    setInverted() { }
    setPinsPdmTx(clk, d0) { this.pini = { bclk: -1, ws: clk, dout: d0, din: -1, mclk: -1 }; }
    setPinsPdmRx(clk, d0) { this.pini = { bclk: -1, ws: clk, dout: -1, din: d0, mclk: -1 }; }
    setInvertedPdm() { }
    begin(mod, rata, biti, sloturi, masca) {
      const sim = S();
      if (this.pini.bclk < 0 && this.pini.ws < 0) { sim.problema('i2sc-pini', 'eroare', 'I2SClass.begin(): nu ai setat pinii. Apelează întâi i2s.setPins(BCLK, WS, DOUT, DIN).', { linie: linie() }); this.eroare = 258; return false; }
      if (mod === 2 || mod === 3) sim.problema('i2sc-pdm', 'info', 'Modul PDM nu e simulat exact; îl tratez ca I2S standard.', { linie: linie() });
      let nr = this.nr;
      if (nr < 0) { const ocup = sim.__i2s || []; nr = ocup[0] && ocup[0].pornit ? 1 : 0; }
      const p = port(nr, 'I2SClass.begin');
      if (!p) return false;
      this.p = p;
      p.pini = Object.assign({}, this.pini);
      p.tx = this.pini.dout >= 0; p.rx = this.pini.din >= 0;
      p.master = true;
      p.rata = rata > 0 ? rata : 16000;
      p.biti = biti || 16;
      const m = masca === undefined ? -1 : masca;
      p.format = sloturi === 2 ? 'stereo' : (m === 2 ? 'mono-R' : m === 1 ? 'mono-L' : 'mono');
      p.dmaCadre = 6 * 240;
      for (const g of [this.pini.bclk, this.pini.ws, this.pini.dout, this.pini.din]) if (g >= 0 && !sim.pin(g, 'I2S')) return false;
      p.porneste();
      sim.consuma(400);
      return true;
    }
    configureTX(rata, biti, sloturi) { if (!this.p) return false; this.p.rata = rata; this.p.biti = biti; this.p.format = sloturi === 2 ? 'stereo' : 'mono'; this.p.porneste(); return true; }
    configureRX(rata, biti, sloturi) { return this.configureTX(rata, biti, sloturi); }
    end() { if (this.p) { this.p.opreste(); this.p = null; } return true; }
    *write(a, n) {
      if (!this.p || !this.p.tx) { this.eroare = 259; return 0; }
      if (typeof a === 'number' && n === undefined) return yield* this.p.scrieOcteti([a & 255], 1);
      const oct = octeti(a, n);
      return yield* this.p.scrieOcteti(oct, oct.length);
    }
    *readBytes(buf, n) {
      if (!this.p || !this.p.rx) { this.eroare = 259; return 0; }
      return yield* this.p.citesteOcteti(buf, Math.min(n, marimeOcteti(buf)), this._timeout * 1000);
    }
    *read() {
      if (!this.p || !this.p.rx) return -1;
      const b = Math.max(1, this.p.biti / 8 | 0);
      const u = new Uint8Array(b);
      const k = yield* this.p.citesteOcteti(u, b, this._timeout * 1000);
      if (k !== b) return -1;
      let v = 0; for (let i = b - 1; i >= 0; i--) v = (v << 8) | u[i];
      return b >= 4 ? v | 0 : v;
    }
    available() { return this.p && this.p.rx ? 4092 : -1; }
    peek() { return -1; }
    lastError() { return this.eroare; }
    txSampleRate() { return this.p ? this.p.rata : 0; }
    rxSampleRate() { return this.p ? this.p.rata : 0; }
    txDataWidth() { return this.p ? this.p.biti : 0; }
    rxDataWidth() { return this.p ? this.p.biti : 0; }
    txSlotMode() { return this.p && this.p.format === 'stereo' ? 2 : 1; }
    rxSlotMode() { return this.txSlotMode(); }
    // redă un fișier WAV aflat în memorie (antet RIFF de 44 de octeți)
    *playWAV(date, n) {
      const sim = S();
      const u = octeti(date, n);
      if (u.length < 44 || String.fromCharCode(u[0], u[1], u[2], u[3]) !== 'RIFF') { sim.problema('wav', 'eroare', 'playWAV(): datele nu încep cu un antet WAV („RIFF”).', { linie: linie() }); return; }
      const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
      const canale = dv.getUint16(22, true), rata = dv.getUint32(24, true), biti = dv.getUint16(34, true);
      if (this.p) { this.p.rata = rata; this.p.biti = biti; this.p.format = canale === 2 ? 'stereo' : 'mono'; this.p.porneste(); }
      yield* this.write(u.subarray(44), u.length - 44);
    }
    *playMP3() { S().problema('mp3', 'info', 'playMP3(): decodarea MP3 nu e simulată. Folosește playWAV() cu un WAV sau un DFPlayer Mini.', { linie: linie() }); return false; }
    // înregistrează `sec` secunde și întoarce un WAV complet în memorie
    *recordWAV(sec, marime) {
      const p = this.p;
      if (!p || !p.rx) { if (marime && typeof marime === 'object') marime.v = 0; return null; }
      const b = p.octetiPeEsantion(), k = p.esantioanePeCadru();
      const nrCadre = Math.round(sec * p.rata);
      const date = new Uint8Array(44 + nrCadre * b * k);
      let poz = 44;
      for (let rest = nrCadre; rest > 0;) {
        const bucata = Math.min(rest, 1024);
        const cadre = yield* p.citesteCadre(bucata);
        poz = p.codifica(cadre, date, poz);
        rest -= bucata;
      }
      const dv = new DataView(date.buffer);
      const scrie = (o, t) => { for (let i = 0; i < t.length; i++) date[o + i] = t.charCodeAt(i); };
      scrie(0, 'RIFF'); dv.setUint32(4, date.length - 8, true); scrie(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, k, true);
      dv.setUint32(24, p.rata, true); dv.setUint32(28, p.rata * b * k, true); dv.setUint16(32, b * k, true); dv.setUint16(34, b * 8, true); scrie(36, 'data'); dv.setUint32(40, date.length - 44, true);
      if (marime && typeof marime === 'object') marime.v = date.length;
      return date;
    }
  }
  I2SClass.tipuri = Object.assign({}, api.clase.Stream.tipuri, { setPort: 'bool', getPort: 'int', begin: 'bool', configureTX: 'bool', configureRX: 'bool', end: 'bool', readBytes: 'size_t', write: 'size_t', read: 'int', available: 'int', peek: 'int', lastError: 'int', txSampleRate: 'uint32_t', rxSampleRate: 'uint32_t', txDataWidth: 'int', rxDataWidth: 'int', txSlotMode: 'int', rxSlotMode: 'int', playMP3: 'bool', recordWAV: 'uint8_t[]' });
  api.clasa('I2SClass', I2SClass);

  // ---------- DFRobotDFPlayerMini ----------
  // Portare fidelă a bibliotecii DFRobot: cadre de 10 octeți pe serial (7E FF 06 CMD ACK PH PL CH CL EF),
  // așteptarea confirmării (ACK) înainte de comanda următoare și mesajele primite de la modul.
  const DF = { TimeOut: 0, WrongStack: 1, DFPlayerCardInserted: 2, DFPlayerCardRemoved: 3, DFPlayerCardOnline: 4, DFPlayerPlayFinished: 5, DFPlayerError: 6, DFPlayerUSBInserted: 7, DFPlayerUSBRemoved: 8, DFPlayerUSBOnline: 9, DFPlayerCardUSBOnline: 10, DFPlayerFeedBack: 11 };
  Object.assign(api.constante, DF, {
    Busy: 1, Sleeping: 2, SerialWrongStack: 3, CheckSumNotMatch: 4, FileIndexOut: 5, FileMismatch: 6, Advertise: 7,
    DFPLAYER_EQ_NORMAL: 0, DFPLAYER_EQ_POP: 1, DFPLAYER_EQ_ROCK: 2, DFPLAYER_EQ_JAZZ: 3, DFPLAYER_EQ_CLASSIC: 4, DFPLAYER_EQ_BASS: 5,
    DFPLAYER_DEVICE_U_DISK: 1, DFPLAYER_DEVICE_SD: 2, DFPLAYER_DEVICE_AUX: 3, DFPLAYER_DEVICE_SLEEP: 4, DFPLAYER_DEVICE_FLASH: 5,
    DFPLAYER_RECEIVED_LENGTH: 10, DFPLAYER_SEND_LENGTH: 10
  });
  const cadruDf = (cmd, param, ack) => {
    const b = [0x7E, 0xFF, 0x06, cmd & 255, ack ? 1 : 0, (param >> 8) & 255, param & 255, 0, 0, 0xEF];
    let s = 0; for (let i = 1; i < 7; i++) s += b[i];
    const c = (-s) & 0xFFFF; b[7] = c >> 8; b[8] = c & 255;
    return b;
  };
  M.dfplayer = { cadru: cadruDf };
  class DFRobotDFPlayerMini {
    constructor() {
      this._serial = null; this._timeOutDuration = 500; this._timeOutTimer = 0;
      this._received = new Uint8Array(10); this._receivedIndex = 0;
      this._handleType = 0; this._handleCommand = 0; this._handleParameter = 0;
      this._isAvailable = false; this._isSending = false; this._ack = true;
    }
    *begin(stream, isACK, doReset) {
      this._serial = stream;
      this._ack = isACK === undefined ? true : !!isACK;
      if (doReset === undefined || doReset) {
        yield* this.reset();
        yield* this.waitAvailable(2000);
        yield { dorm: 200000 };
      } else this._handleType = DF.DFPlayerCardOnline;
      return this.readType() === DF.DFPlayerCardOnline || this.readType() === DF.DFPlayerUSBOnline || !this._ack;
    }
    setTimeOut(ms) { this._timeOutDuration = ms; }
    *sendStack(cmd, arg1, arg2) {
      const param = arg2 === undefined ? (arg1 || 0) : ((arg1 & 255) << 8) | (arg2 & 255);
      if (this._ack) {
        while (this._isSending) { yield { dorm: 100 }; yield* this.waitAvailable(); }
      }
      if (!this._serial) return;
      const b = cadruDf(cmd, param, this._ack);
      yield* scrieStream(this._serial, b);
      this._timeOutTimer = S().timp / 1000;
      this._isSending = this._ack;
      if (!this._ack) yield { dorm: 10000 };
    }
    *waitAvailable(durata) {
      const sim = S();
      const start = sim.timp / 1000;
      if (!durata) durata = this._timeOutDuration;
      for (;;) {
        if (this.available()) return true;
        if (sim.timp / 1000 - start > durata) return this.handleError(DF.TimeOut);
        const lim = (start + durata) * 1000 + 1000;
        yield { asteapta: () => (this._serial && this._serial.available() > 0) ? true : undefined, pana: lim, laExpirare: false, pas: 500 };
      }
    }
    available() {
      const ser = this._serial;
      if (!ser) return false;
      while (ser.available() > 0) {
        if (this._receivedIndex === 0) {
          this._received[0] = ser.read();
          if (this._received[0] === 0x7E) this._receivedIndex++;
        } else {
          this._received[this._receivedIndex] = ser.read();
          switch (this._receivedIndex) {
            case 1: if (this._received[1] !== 0xFF) return this.handleError(DF.WrongStack); break;
            case 2: if (this._received[2] !== 0x06) return this.handleError(DF.WrongStack); break;
            case 9:
              if (this._received[9] !== 0xEF) return this.handleError(DF.WrongStack);
              if (this.validateStack()) { this._receivedIndex = 0; this.parseStack(); return this._isAvailable; }
              return this.handleError(DF.WrongStack);
            default: break;
          }
          this._receivedIndex++;
        }
      }
      if (this._isSending && (S().timp / 1000 - this._timeOutTimer >= this._timeOutDuration)) return this.handleError(DF.TimeOut);
      return this._isAvailable;
    }
    validateStack() {
      let s = 0; for (let i = 1; i < 7; i++) s += this._received[i];
      const c = (-s) & 0xFFFF;
      return c === ((this._received[7] << 8) | this._received[8]);
    }
    parseStack() {
      const cmd = this._received[3];
      if (cmd === 0x41) { this._isSending = false; return; }
      this._handleCommand = cmd;
      this._handleParameter = (this._received[5] << 8) | this._received[6];
      switch (cmd) {
        case 0x3D: this.handleMessage(DF.DFPlayerPlayFinished, this._handleParameter); break;
        case 0x3F:
          if (this._handleParameter & 0x01) this.handleMessage(DF.DFPlayerUSBOnline, this._handleParameter);
          else if (this._handleParameter & 0x02) this.handleMessage(DF.DFPlayerCardOnline, this._handleParameter);
          else if (this._handleParameter & 0x03) this.handleMessage(DF.DFPlayerCardUSBOnline, this._handleParameter);
          break;
        case 0x3A: this.handleMessage(this._handleParameter & 0x01 ? DF.DFPlayerUSBInserted : DF.DFPlayerCardInserted, this._handleParameter); break;
        case 0x3B: this.handleMessage(this._handleParameter & 0x01 ? DF.DFPlayerUSBRemoved : DF.DFPlayerCardRemoved, this._handleParameter); break;
        case 0x40: this.handleMessage(DF.DFPlayerError, this._handleParameter); break;
        case 0x3C: case 0x3E: case 0x42: case 0x43: case 0x44: case 0x45: case 0x46: case 0x47: case 0x48: case 0x49: case 0x4B: case 0x4C: case 0x4D: case 0x4E: case 0x4F:
          this.handleMessage(DF.DFPlayerFeedBack, this._handleParameter); break;
        default: this.handleError(DF.WrongStack); break;
      }
    }
    handleMessage(tip, param) { this._receivedIndex = 0; this._handleType = tip; this._handleParameter = param || 0; this._isAvailable = true; return this._isAvailable; }
    handleError(tip, param) { this.handleMessage(tip, param); this._isSending = false; return false; }
    readCommand() { this._isAvailable = false; return this._handleCommand; }
    readType() { this._isAvailable = false; return this._handleType; }
    read() { this._isAvailable = false; return this._handleParameter; }
    *_intreaba(cmd, param) {
      yield* this.sendStack(cmd, param || 0);
      if (yield* this.waitAvailable()) { if (this.readType() === DF.DFPlayerFeedBack) return this.read(); return -1; }
      return -1;
    }
    *next() { yield* this.sendStack(0x01); }
    *previous() { yield* this.sendStack(0x02); }
    *play(n) { yield* this.sendStack(0x03, n === undefined ? 1 : n); }
    *volumeUp() { yield* this.sendStack(0x04); }
    *volumeDown() { yield* this.sendStack(0x05); }
    *volume(v) { yield* this.sendStack(0x06, v); }
    *EQ(eq) { yield* this.sendStack(0x07, eq); }
    *loop(n) { yield* this.sendStack(0x08, n); }
    *outputDevice(d) { yield* this.sendStack(0x09, d); yield { dorm: 200000 }; }
    *sleep() { yield* this.sendStack(0x0A); }
    *reset() { yield* this.sendStack(0x0C); }
    *start() { yield* this.sendStack(0x0D); }
    *pause() { yield* this.sendStack(0x0E); }
    *playFolder(dosar, fis) { yield* this.sendStack(0x0F, dosar, fis); }
    *outputSetting(en, gain) { yield* this.sendStack(0x10, en, gain); }
    *enableLoopAll() { yield* this.sendStack(0x11, 0x01); }
    *disableLoopAll() { yield* this.sendStack(0x11, 0x00); }
    *playMp3Folder(n) { yield* this.sendStack(0x12, n); }
    *advertise(n) { yield* this.sendStack(0x13, n); }
    *playLargeFolder(dosar, fis) { yield* this.sendStack(0x14, ((dosar & 0x0F) << 12) | (fis & 0x0FFF)); }
    *stopAdvertise() { yield* this.sendStack(0x15); }
    *stop() { yield* this.sendStack(0x16); }
    *loopFolder(d) { yield* this.sendStack(0x17, d); }
    *randomAll() { yield* this.sendStack(0x18); }
    *enableLoop() { yield* this.sendStack(0x19, 0x00); }
    *disableLoop() { yield* this.sendStack(0x19, 0x01); }
    *enableDAC() { yield* this.sendStack(0x1A, 0x00); }
    *disableDAC() { yield* this.sendStack(0x1A, 0x01); }
    *readState() { return yield* this._intreaba(0x42); }
    *readVolume() { return yield* this._intreaba(0x43); }
    *readEQ() { return yield* this._intreaba(0x44); }
    *readFileCounts(d) { return yield* this._intreaba(d === 1 ? 0x47 : 0x48); }
    *readCurrentFileNumber(d) { return yield* this._intreaba(d === 1 ? 0x4B : 0x4C); }
    *readFileCountsInFolder(dosar) { return yield* this._intreaba(0x4E, dosar); }
    *readFolderCounts() { return yield* this._intreaba(0x4F); }
    *readFirmwareVersion() { return yield* this._intreaba(0x46); }
  }
  // scrie octeți pe un port serial (HardwareSerial / SoftwareSerial)
  function* scrieStream(ser, b) {
    if (!ser) return;
    if (ser.write && ser.write.constructor && ser.write.constructor.name === 'GeneratorFunction') { yield* ser.write(Uint8Array.from(b), b.length); return; }
    ser.write(Uint8Array.from(b), b.length);
  }
  DFRobotDFPlayerMini.tipuri = { begin: 'bool', available: 'bool', waitAvailable: 'bool', readType: 'uint8_t', read: 'uint16_t', readCommand: 'uint8_t', readState: 'int', readVolume: 'int', readEQ: 'int', readFileCounts: 'int', readCurrentFileNumber: 'int', readFileCountsInFolder: 'int', readFolderCounts: 'int', readFirmwareVersion: 'int', validateStack: 'bool' };
  api.clasa('DFRobotDFPlayerMini', DFRobotDFPlayerMini);
  api.include('DFRobotDFPlayerMini.h');
})(window.M = window.M || {});
