/* Meșter — motorul grafic pentru afișaje: API compatibil Adafruit_GFX (linii, cercuri, text, bitmap-uri,
   fonturi GFX), plus fonturile TFT_eSPI 2/4/6/7/8 și tampoane monocrome sau RGB565. */
(function (M) {
  'use strict';

  function dinBase64(s) { const b = atob(s); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  const F = M.fonturiDate;
  const GLCD = dinBase64(F.glcd);
  const fonturiGfx = {};
  for (const k in F.gfx) {
    const f = F.gfx[k];
    fonturiGfx[k] = { nume: k, bitmap: dinBase64(f.b), glife: f.g, first: f.f, last: f.l, yAdvance: f.y };
  }
  const fonturiTft = {};
  for (const k in F.tft) { const f = F.tft[k]; fonturiTft[k] = { h: f.h, base: f.base, rle: f.rle, w: f.w, o: f.o, d: dinBase64(f.d) }; }

  function swap(a) { return [a[1], a[0]]; }

  class GFX extends M.api.clase.Print {
    constructor(w, h) {
      super();
      this.WIDTH = w; this.HEIGHT = h;
      this._width = w; this._height = h;
      this.rotation = 0;
      this.cursor_x = 0; this.cursor_y = 0;
      this.textcolor = 0xFFFF; this.textbgcolor = 0xFFFF;
      this.textsize_x = 1; this.textsize_y = 1;
      this.wrap = true; this._cp437 = false;
      this.gfxFont = null;
    }
    // --- implementat de fiecare afișaj ---
    _px() { }
    drawPixel(x, y, c) {
      x = Math.trunc(x); y = Math.trunc(y);
      if (x < 0 || y < 0 || x >= this._width || y >= this._height) return;
      let t;
      switch (this.rotation) {
        case 1: t = x; x = this.WIDTH - 1 - y; y = t; break;
        case 2: x = this.WIDTH - 1 - x; y = this.HEIGHT - 1 - y; break;
        case 3: t = x; x = y; y = this.HEIGHT - 1 - t; break;
      }
      this._px(x, y, c);
    }
    writePixel(x, y, c) { this.drawPixel(x, y, c); }
    startWrite() { } endWrite() { }
    width() { return this._width; }
    height() { return this._height; }
    getRotation() { return this.rotation; }
    setRotation(r) {
      this.rotation = r & 3;
      if (this.rotation & 1) { this._width = this.HEIGHT; this._height = this.WIDTH; }
      else { this._width = this.WIDTH; this._height = this.HEIGHT; }
    }
    // --- primitive ---
    drawFastVLine(x, y, h, c) { this.writeLine(x, y, x, y + h - 1, c); }
    drawFastHLine(x, y, w, c) { this.writeLine(x, y, x + w - 1, y, c); }
    writeFastVLine(x, y, h, c) { this.drawFastVLine(x, y, h, c); }
    writeFastHLine(x, y, w, c) { this.drawFastHLine(x, y, w, c); }
    fillRect(x, y, w, h, c) {
      x = Math.trunc(x); y = Math.trunc(y); w = Math.trunc(w); h = Math.trunc(h);
      if (w < 0) { x += w + 1; w = -w; }
      if (h < 0) { y += h + 1; h = -h; }
      const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(this._width, x + w), y1 = Math.min(this._height, y + h);
      for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) this.drawPixel(i, j, c);
    }
    writeFillRect(x, y, w, h, c) { this.fillRect(x, y, w, h, c); }
    fillScreen(c) { this.fillRect(0, 0, this._width, this._height, c); }
    writeLine(x0, y0, x1, y1, c) {
      x0 = Math.trunc(x0); y0 = Math.trunc(y0); x1 = Math.trunc(x1); y1 = Math.trunc(y1);
      const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
      if (steep) { [x0, y0] = swap([x0, y0]); [x1, y1] = swap([x1, y1]); }
      if (x0 > x1) { [x0, x1] = [x1, x0]; [y0, y1] = [y1, y0]; }
      const dx = x1 - x0, dy = Math.abs(y1 - y0);
      let err = dx >> 1;
      const ystep = y0 < y1 ? 1 : -1;
      if (dx > 4000) return;
      for (; x0 <= x1; x0++) {
        if (steep) this.drawPixel(y0, x0, c); else this.drawPixel(x0, y0, c);
        err -= dy;
        if (err < 0) { y0 += ystep; err += dx; }
      }
    }
    drawLine(x0, y0, x1, y1, c) {
      if (x0 === x1) { if (y0 > y1) [y0, y1] = [y1, y0]; this.fillRect(x0, y0, 1, y1 - y0 + 1, c); }
      else if (y0 === y1) { if (x0 > x1) [x0, x1] = [x1, x0]; this.fillRect(x0, y0, x1 - x0 + 1, 1, c); }
      else this.writeLine(x0, y0, x1, y1, c);
    }
    drawRect(x, y, w, h, c) { this.drawFastHLine(x, y, w, c); this.drawFastHLine(x, y + h - 1, w, c); this.drawFastVLine(x, y, h, c); this.drawFastVLine(x + w - 1, y, h, c); }
    drawCircle(x0, y0, r, c) {
      let f = 1 - r, ddx = 1, ddy = -2 * r, x = 0, y = r;
      this.drawPixel(x0, y0 + r, c); this.drawPixel(x0, y0 - r, c); this.drawPixel(x0 + r, y0, c); this.drawPixel(x0 - r, y0, c);
      while (x < y) {
        if (f >= 0) { y--; ddy += 2; f += ddy; }
        x++; ddx += 2; f += ddx;
        this.drawPixel(x0 + x, y0 + y, c); this.drawPixel(x0 - x, y0 + y, c); this.drawPixel(x0 + x, y0 - y, c); this.drawPixel(x0 - x, y0 - y, c);
        this.drawPixel(x0 + y, y0 + x, c); this.drawPixel(x0 - y, y0 + x, c); this.drawPixel(x0 + y, y0 - x, c); this.drawPixel(x0 - y, y0 - x, c);
      }
    }
    drawCircleHelper(x0, y0, r, colturi, c) {
      let f = 1 - r, ddx = 1, ddy = -2 * r, x = 0, y = r;
      while (x < y) {
        if (f >= 0) { y--; ddy += 2; f += ddy; }
        x++; ddx += 2; f += ddx;
        if (colturi & 4) { this.drawPixel(x0 + x, y0 + y, c); this.drawPixel(x0 + y, y0 + x, c); }
        if (colturi & 2) { this.drawPixel(x0 + x, y0 - y, c); this.drawPixel(x0 + y, y0 - x, c); }
        if (colturi & 8) { this.drawPixel(x0 - y, y0 + x, c); this.drawPixel(x0 - x, y0 + y, c); }
        if (colturi & 1) { this.drawPixel(x0 - y, y0 - x, c); this.drawPixel(x0 - x, y0 - y, c); }
      }
    }
    fillCircle(x0, y0, r, c) { this.drawFastVLine(x0, y0 - r, 2 * r + 1, c); this.fillCircleHelper(x0, y0, r, 3, 0, c); }
    fillCircleHelper(x0, y0, r, colturi, delta, c) {
      let f = 1 - r, ddx = 1, ddy = -2 * r, x = 0, y = r, px = x, py = y;
      delta++;
      while (x < y) {
        if (f >= 0) { y--; ddy += 2; f += ddy; }
        x++; ddx += 2; f += ddx;
        if (x < (y + 1)) {
          if (colturi & 1) this.drawFastVLine(x0 + x, y0 - y, 2 * y + delta, c);
          if (colturi & 2) this.drawFastVLine(x0 - x, y0 - y, 2 * y + delta, c);
        }
        if (y !== py) {
          if (colturi & 1) this.drawFastVLine(x0 + py, y0 - px, 2 * px + delta, c);
          if (colturi & 2) this.drawFastVLine(x0 - py, y0 - px, 2 * px + delta, c);
          py = y;
        }
        px = x;
      }
    }
    drawTriangle(x0, y0, x1, y1, x2, y2, c) { this.drawLine(x0, y0, x1, y1, c); this.drawLine(x1, y1, x2, y2, c); this.drawLine(x2, y2, x0, y0, c); }
    fillTriangle(x0, y0, x1, y1, x2, y2, c) {
      let a, b, y, last;
      if (y0 > y1) { [y0, y1] = [y1, y0]; [x0, x1] = [x1, x0]; }
      if (y1 > y2) { [y2, y1] = [y1, y2]; [x2, x1] = [x1, x2]; }
      if (y0 > y1) { [y0, y1] = [y1, y0]; [x0, x1] = [x1, x0]; }
      if (y0 === y2) {
        a = b = x0;
        if (x1 < a) a = x1; else if (x1 > b) b = x1;
        if (x2 < a) a = x2; else if (x2 > b) b = x2;
        this.drawFastHLine(a, y0, b - a + 1, c);
        return;
      }
      const dx01 = x1 - x0, dy01 = y1 - y0, dx02 = x2 - x0, dy02 = y2 - y0, dx12 = x2 - x1, dy12 = y2 - y1;
      let sa = 0, sb = 0;
      last = y1 === y2 ? y1 : y1 - 1;
      for (y = y0; y <= last; y++) {
        a = x0 + Math.trunc(sa / dy01); b = x0 + Math.trunc(sb / dy02);
        sa += dx01; sb += dx02;
        if (a > b) [a, b] = [b, a];
        this.drawFastHLine(a, y, b - a + 1, c);
      }
      sa = dx12 * (y - y1); sb = dx02 * (y - y0);
      for (; y <= y2; y++) {
        a = x1 + Math.trunc(sa / dy12); b = x0 + Math.trunc(sb / dy02);
        sa += dx12; sb += dx02;
        if (a > b) [a, b] = [b, a];
        this.drawFastHLine(a, y, b - a + 1, c);
      }
    }
    drawRoundRect(x, y, w, h, r, c) {
      const max = Math.floor((w < h ? w : h) / 2); if (r > max) r = max;
      this.drawFastHLine(x + r, y, w - 2 * r, c); this.drawFastHLine(x + r, y + h - 1, w - 2 * r, c);
      this.drawFastVLine(x, y + r, h - 2 * r, c); this.drawFastVLine(x + w - 1, y + r, h - 2 * r, c);
      this.drawCircleHelper(x + r, y + r, r, 1, c); this.drawCircleHelper(x + w - r - 1, y + r, r, 2, c);
      this.drawCircleHelper(x + w - r - 1, y + h - r - 1, r, 4, c); this.drawCircleHelper(x + r, y + h - r - 1, r, 8, c);
    }
    fillRoundRect(x, y, w, h, r, c) {
      const max = Math.floor((w < h ? w : h) / 2); if (r > max) r = max;
      this.fillRect(x + r, y, w - 2 * r, h, c);
      this.fillCircleHelper(x + w - r - 1, y + r, r, 1, h - 2 * r - 1, c);
      this.fillCircleHelper(x + r, y + r, r, 2, h - 2 * r - 1, c);
    }
    _octet(bmp, i) { if (bmp === null || bmp === undefined) return 0; if (typeof bmp === 'string') return bmp.charCodeAt(i) & 255; const v = bmp[i]; return v === undefined ? 0 : v & 255; }
    drawBitmap(x, y, bmp, w, h, c, bg) {
      const bw = (w + 7) >> 3;
      let b = 0;
      for (let j = 0; j < h; j++, y++) for (let i = 0; i < w; i++) {
        if (i & 7) b <<= 1; else b = this._octet(bmp, j * bw + (i >> 3));
        if (b & 0x80) this.drawPixel(x + i, y, c); else if (bg !== undefined) this.drawPixel(x + i, y, bg);
      }
    }
    drawXBitmap(x, y, bmp, w, h, c) {
      const bw = (w + 7) >> 3;
      let b = 0;
      for (let j = 0; j < h; j++, y++) for (let i = 0; i < w; i++) {
        if (i & 7) b >>= 1; else b = this._octet(bmp, j * bw + (i >> 3));
        if (b & 0x01) this.drawPixel(x + i, y, c);
      }
    }
    drawGrayscaleBitmap(x, y, bmp, w, h) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.drawPixel(x + i, y + j, this._octet(bmp, j * w + i)); }
    drawRGBBitmap(x, y, bmp, w, h) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.drawPixel(x + i, y + j, bmp[j * w + i] & 0xFFFF); }
    // --- text ---
    setCursor(x, y) { this.cursor_x = x; this.cursor_y = y; }
    getCursorX() { return this.cursor_x; }
    getCursorY() { return this.cursor_y; }
    setTextSize(sx, sy) { this.textsize_x = sx > 0 ? sx : 1; this.textsize_y = sy !== undefined ? (sy > 0 ? sy : 1) : this.textsize_x; }
    setTextColor(c, bg) { this.textcolor = c; this.textbgcolor = bg === undefined ? c : bg; }
    setTextWrap(w) { this.wrap = !!w; }
    cp437(x) { this._cp437 = x === undefined ? true : !!x; }
    setFont(f) {
      if (f && f.glife) { if (!this.gfxFont) this.cursor_y += 6; }
      else if (this.gfxFont) this.cursor_y -= 6;
      this.gfxFont = f && f.glife ? f : null;
    }
    drawChar(x, y, c, color, bg, sx, sy) {
      if (sy === undefined) sy = sx;
      if (!this.gfxFont) {
        if (x >= this._width || y >= this._height || x + 6 * sx - 1 < 0 || y + 8 * sy - 1 < 0) return;
        if (!this._cp437 && c >= 176) c++;
        for (let i = 0; i < 5; i++) {
          let linie = GLCD[(c & 255) * 5 + i];
          for (let j = 0; j < 8; j++, linie >>= 1) {
            if (linie & 1) { if (sx === 1 && sy === 1) this.drawPixel(x + i, y + j, color); else this.fillRect(x + i * sx, y + j * sy, sx, sy, color); }
            else if (bg !== color) { if (sx === 1 && sy === 1) this.drawPixel(x + i, y + j, bg); else this.fillRect(x + i * sx, y + j * sy, sx, sy, bg); }
          }
        }
        if (bg !== color) { if (sx === 1 && sy === 1) this.drawFastVLine(x + 5, y, 8, bg); else this.fillRect(x + 5 * sx, y, sx, 8 * sy, bg); }
        return;
      }
      const f = this.gfxFont;
      c = c - f.first;
      const g = f.glife;
      const bo0 = g[c * 6], w = g[c * 6 + 1], h = g[c * 6 + 2], xo = g[c * 6 + 4], yo = g[c * 6 + 5];
      let bo = bo0, bits = 0, bit = 0;
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        if (!(bit++ & 7)) bits = f.bitmap[bo++];
        if (bits & 0x80) {
          if (sx === 1 && sy === 1) this.drawPixel(x + xo + xx, y + yo + yy, color);
          else this.fillRect(x + (xo + xx) * sx, y + (yo + yy) * sy, sx, sy, color);
        }
        bits <<= 1;
      }
    }
    _scrie(t) { for (let i = 0; i < t.length; i++) this.write(t.charCodeAt(i)); }
    write(c, n) {
      if (typeof c !== 'number') return super.write(c, n);
      c &= 255;
      if (!this.gfxFont) {
        if (c === 10) { this.cursor_x = 0; this.cursor_y += this.textsize_y * 8; }
        else if (c !== 13) {
          if (this.wrap && this.cursor_x + this.textsize_x * 6 > this._width) { this.cursor_x = 0; this.cursor_y += this.textsize_y * 8; }
          this.drawChar(this.cursor_x, this.cursor_y, c, this.textcolor, this.textbgcolor, this.textsize_x, this.textsize_y);
          this.cursor_x += this.textsize_x * 6;
        }
        return 1;
      }
      const f = this.gfxFont;
      if (c === 10) { this.cursor_x = 0; this.cursor_y += this.textsize_y * f.yAdvance; }
      else if (c !== 13) {
        if (c >= f.first && c <= f.last) {
          const i = c - f.first, g = f.glife;
          const w = g[i * 6 + 1], h = g[i * 6 + 2];
          if (w > 0 && h > 0) {
            const xo = g[i * 6 + 4];
            if (this.wrap && this.cursor_x + this.textsize_x * (xo + w) > this._width) { this.cursor_x = 0; this.cursor_y += this.textsize_y * f.yAdvance; }
            this.drawChar(this.cursor_x, this.cursor_y, c, this.textcolor, this.textbgcolor, this.textsize_x, this.textsize_y);
          }
          this.cursor_x += g[i * 6 + 3] * this.textsize_x;
        }
      }
      return 1;
    }
    _limiteText(str, x, y) {
      const s = M.ajutoareR.txt(str);
      let minx = 32767, miny = 32767, maxx = -32768, maxy = -32768;
      let cx = x, cy = y;
      for (let k = 0; k < s.length; k++) {
        const c = s.charCodeAt(k) & 255;
        if (!this.gfxFont) {
          if (c === 10) { cx = 0; cy += this.textsize_y * 8; continue; }
          if (c === 13) continue;
          if (this.wrap && cx + this.textsize_x * 6 > this._width) { cx = 0; cy += this.textsize_y * 8; }
          const x2 = cx + this.textsize_x * 6 - 1, y2 = cy + this.textsize_y * 8 - 1;
          if (x2 > maxx) maxx = x2; if (y2 > maxy) maxy = y2; if (cx < minx) minx = cx; if (cy < miny) miny = cy;
          cx += this.textsize_x * 6;
        } else {
          const f = this.gfxFont;
          if (c === 10) { cx = 0; cy += this.textsize_y * f.yAdvance; continue; }
          if (c < f.first || c > f.last) continue;
          const i = c - f.first, g = f.glife;
          const gw = g[i * 6 + 1], gh = g[i * 6 + 2], xa = g[i * 6 + 3], xo = g[i * 6 + 4], yo = g[i * 6 + 5];
          if (this.wrap && cx + (xo + gw) * this.textsize_x > this._width) { cx = 0; cy += this.textsize_y * f.yAdvance; }
          const x1 = cx + xo * this.textsize_x, y1 = cy + yo * this.textsize_y, x2 = x1 + gw * this.textsize_x - 1, y2 = y1 + gh * this.textsize_y - 1;
          if (x1 < minx) minx = x1; if (y1 < miny) miny = y1; if (x2 > maxx) maxx = x2; if (y2 > maxy) maxy = y2;
          cx += xa * this.textsize_x;
        }
      }
      if (maxx < minx) return { x: x, y: y, w: 0, h: 0 };
      return { x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1 };
    }
    getTextBounds(str, x, y, px1, py1, pw, ph) {
      const b = this._limiteText(str, x, y);
      if (px1) px1.v = b.x; if (py1) py1.v = b.y; if (pw) pw.v = b.w; if (ph) ph.v = b.h;
    }
    color565(r, g, b) { return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3); }
    invertDisplay() { }
  }
  GFX.tipuri = Object.assign({}, M.api.clase.Print.tipuri, { width: 'int16_t', height: 'int16_t', getCursorX: 'int16_t', getCursorY: 'int16_t', color565: 'uint16_t', getRotation: 'uint8_t' });

  // conversie RGB565 -> [r,g,b]
  function rgb565(c) { return [((c >> 11) & 31) * 255 / 31 | 0, ((c >> 5) & 63) * 255 / 63 | 0, (c & 31) * 255 / 31 | 0]; }
  // tabel rapid 565 -> RGBA pentru ImageData
  const TABEL565 = new Uint32Array(65536);
  (function () {
    const lil = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
    for (let c = 0; c < 65536; c++) {
      const [r, g, b] = rgb565(c);
      TABEL565[c] = lil ? ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0 : ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0;
    }
  })();

  // Tampon (framebuffer) pentru afișaje
  class Tampon {
    constructor(w, h, color) { this.w = w; this.h = h; this.color = !!color; this.date = color ? new Uint16Array(w * h) : new Uint8Array(w * h); this.versiune = 0; }
    px(x, y, c) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; this.date[y * this.w + x] = c; this.versiune++; }
    umple(c) { this.date.fill(c); this.versiune++; }
  }
  // desenează un tampon color pe canvas
  function deseneazaColor(ctx, tampon, lat, inalt, stralucire) {
    if (!tampon.img || tampon.img.width !== tampon.w) { tampon.img = ctx.createImageData(tampon.w, tampon.h); tampon.u32 = new Uint32Array(tampon.img.data.buffer); }
    const u = tampon.u32, d = tampon.date;
    for (let i = 0; i < d.length; i++) u[i] = TABEL565[d[i]];
    ctx.putImageData(tampon.img, 0, 0);
    if (stralucire !== undefined && stralucire < 1) { ctx.fillStyle = 'rgba(0,0,0,' + (1 - stralucire) + ')'; ctx.fillRect(0, 0, tampon.w, tampon.h); }
    void lat; void inalt;
  }
  // desenează un tampon monocrom (OLED) pe canvas cu culorile date
  function deseneazaMono(ctx, tampon, culoareAprins, culoareStins, invers, zone, stralucire) {
    if (!tampon.img || tampon.img.width !== tampon.w) { tampon.img = ctx.createImageData(tampon.w, tampon.h); tampon.u32 = new Uint32Array(tampon.img.data.buffer); }
    const lil = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
    const imp = (c) => { const r = c[0], g = c[1], b = c[2]; return lil ? ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0 : ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0; };
    const k = stralucire === undefined ? 1 : stralucire;
    const scal = (c) => [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k)];
    const stins = imp(culoareStins);
    const u = tampon.u32, d = tampon.date, w = tampon.w;
    const aprinsImplicit = imp(scal(culoareAprins));
    const aprinsZona = zone ? zone.map(z => ({ y1: z.pana, c: imp(scal(z.culoare)) })) : null;
    for (let y = 0; y < tampon.h; y++) {
      let ap = aprinsImplicit;
      if (aprinsZona) { for (const z of aprinsZona) if (y < z.y1) { ap = z.c; break; } }
      for (let x = 0; x < w; x++) { const v = d[y * w + x] ? 1 : 0; u[y * w + x] = (v ^ (invers ? 1 : 0)) ? ap : stins; }
    }
    ctx.putImageData(tampon.img, 0, 0);
  }

  M.grafica = { GFX, Tampon, fonturiGfx, fonturiTft, GLCD, rgb565, deseneazaColor, deseneazaMono, TABEL565 };
})(window.M = window.M || {});
