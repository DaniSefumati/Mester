/* Meșter — exemple cu afișaje și LED-uri adresabile: OLED, LCD I2C, TFT color, TM1637 și inel NeoPixel.
   Modulele stau lângă breadboard și sunt legate cu fire, ca pe masa de lucru. */
(function (M) {
  'use strict';
  const E = M.exemple;
  const ROSU = '#e53935', NEGRU = '#1f1f1f', GALBEN = '#fdd835', ALBASTRU = '#1e88e5', VERDE = '#43a047', PORTOCALIU = '#fb8c00', MOV = '#8e24aa', ALB = '#eceff1', GRI = '#78909c';

  // placa pe breadboard, cu 3V3 și GND pe șine
  function baza(nume) {
    const k = E.constructor(nume);
    k.piesa('bb', 'breadboard', 0, 0, { marime: 'completa' });
    E.devkitPeBreadboard(k, 22);
    E.alimentareDevkit(k, 22);
    return k;
  }
  // 5 V de la pinul VIN pe șina + de sus
  function sina5V(k) { k.fir('bb:a8', 'bb:' + k.sina(1, 9), ROSU, [[90, 30], [100, 30]]); }
  // 3V3 și pe șina + de sus (punte între șinele de jos și cele de sus, în stânga)
  function punte3V3(k) { k.fir('bb:' + k.sina(3, 3), 'bb:' + k.sina(1, 3), ROSU); }
  // un fir de la un pin de jos al plăcii (rândul j) până la un modul din dreapta, pe o „bandă” orizontală
  function laDreapta(k, pinPlaca, pinModul, culoare, banda) {
    const x = { D23: 230, D22: 220, D21: 190, D19: 180, D18: 170, D5: 160, TX2: 150, RX2: 140, D4: 130, D2: 120, D15: 110 }[pinPlaca];
    const [c, p] = pinModul.split(':');
    const inst = k.ids[c];
    const pin = M.componente.pini(inst).find(q => q.id === p);
    const pos = M.retea.transforma(inst, pin.x, pin.y);
    k.fir('esp:' + pinPlaca, pinModul, culoare, [[x, banda], [pos.x, banda]]);
  }

  // ---------- OLED + potențiometru ----------
  E.exemplu({
    id: 'oled-potentiometru', nume: 'OLED: bară și valoare de la potențiometru', etichete: ['afișaje', 'I2C', 'analogRead'],
    descriere: 'Un OLED de 0,96" pe I2C (GPIO21 = SDA, GPIO22 = SCL) afișează poziția unui potențiometru ca procent, tensiune și bară. Rotește butonul potențiometrului în timpul simulării.',
    construieste() {
      const k = baza('OLED și potențiometru');
      punte3V3(k);
      // OLED sub breadboard, cu pinii în sus
      k.piesa('o1', 'oled-128x64', 300, 260, {});
      k.fir('o1:GND', 'bb:' + k.sina(4, 29), NEGRU);
      k.fir('o1:VCC', 'bb:' + k.sina(3, 31), ROSU, [[310, 236], [320, 236]]);
      k.fir('esp:D22', 'o1:SCL', GALBEN, [[220, 224], [320, 224], [320, 248]]);
      k.fir('esp:D21', 'o1:SDA', ALBASTRU, [[190, 230], [330, 230], [330, 248]]);
      // potențiometru deasupra breadboard-ului
      k.piesa('p1', 'potentiometru', 480, -40, { valoare: 10000 });
      k.fir('p1:1', 'bb:' + k.sina(2, 47), NEGRU);
      k.fir('p1:2', 'bb:' + k.sina(1, 49), ROSU);
      k.fir('p1:W', 'bb:a19', VERDE, [[490, -16], [200, -16]]);
      k.cod(`
// OLED 0,96" (SSD1306, I2C) + potențiometru pe GPIO34.
// Rotește potențiometrul: valoarea și bara se schimbă pe ecran.

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define LATIME 128
#define INALTIME 64
Adafruit_SSD1306 ecran(LATIME, INALTIME, &Wire, -1);

const int PIN_POT = 34;   // GPIO34 e pe ADC1 (merge și cu WiFi pornit)

void setup() {
  Serial.begin(115200);
  // adresa I2C a modulului: de obicei 0x3C
  if (!ecran.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED-ul nu raspunde!");
    while (true) delay(10);
  }
  ecran.clearDisplay();
  ecran.setTextColor(SSD1306_WHITE);   // fără culoare, textul nu apare
  ecran.setTextSize(2);
  ecran.setCursor(16, 24);
  ecran.println("Mester");
  ecran.display();                     // abia acum imaginea ajunge pe ecran
  delay(1000);
}

void loop() {
  int valoare = analogRead(PIN_POT);             // 0 ... 4095
  int procent = map(valoare, 0, 4095, 0, 100);
  float volti = analogReadMilliVolts(PIN_POT) / 1000.0;

  ecran.clearDisplay();
  ecran.setTextSize(1);
  ecran.setCursor(0, 0);
  ecran.print("Potentiometru");
  ecran.drawLine(0, 10, 127, 10, SSD1306_WHITE);

  ecran.setTextSize(2);
  ecran.setCursor(0, 18);
  ecran.print(procent);
  ecran.print("%");

  ecran.setTextSize(1);
  ecran.setCursor(76, 22);
  ecran.print(volti, 2);
  ecran.print(" V");

  // bara de progres
  ecran.drawRect(0, 44, 128, 14, SSD1306_WHITE);
  ecran.fillRect(2, 46, map(procent, 0, 100, 0, 124), 10, SSD1306_WHITE);
  ecran.display();

  Serial.printf("ADC=%d  %d%%  %.2f V\\n", valoare, procent, volti);
  delay(100);
}
`);
      return k.p;
    }
  });

  // ---------- inel NeoPixel cu efecte ----------
  E.exemplu({
    id: 'neopixel-efecte', nume: 'Inel NeoPixel cu efecte', etichete: ['LED-uri', 'WS2812B', 'Adafruit_NeoPixel'],
    descriere: 'Un inel cu 12 LED-uri WS2812B pe GPIO27, alimentat din 5 V (VIN). Butonul de pe GPIO4 schimbă efectul: curcubeu, lumină care aleargă și respirație.',
    construieste() {
      const k = baza('Inel NeoPixel cu efecte');
      sina5V(k);
      k.piesa('n1', 'ws2812', 440, -30, { forma: 'inel', numar: 12 });
      k.fir('n1:VCC', 'bb:' + k.sina(1, 43), ROSU);
      k.fir('n1:GND', 'bb:' + k.sina(2, 45), NEGRU);
      k.fir('n1:DIN', 'bb:a13', VERDE, [[450, -12], [140, -12]]);
      // buton peste șanț, la GND
      k.inGaura('b1', 'buton', 'e', 50, { culoare: 'albastru' });
      k.fir('esp:D4', 'bb:j50', ALBASTRU, [[130, 172], [500, 172]]);
      k.fir('bb:j52', 'bb:' + k.sina(4, 53), NEGRU);
      k.cod(`
// Inel cu 12 LED-uri WS2812B (NeoPixel) pe GPIO27.
// Butonul de pe GPIO4 schimbă efectul.

#include <Adafruit_NeoPixel.h>

#define PIN_LED 27
#define NR_LED 12
#define PIN_BUTON 4

// WS2812B primesc culorile în ordinea verde-roșu-albastru: NEO_GRB
Adafruit_NeoPixel inel(NR_LED, PIN_LED, NEO_GRB + NEO_KHZ800);

int efect = 0;
bool butonAnterior = HIGH;
long pas = 0;

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BUTON, INPUT_PULLUP);
  inel.begin();
  inel.setBrightness(80);   // 0...255 — la 255 un LED alb trage ~60 mA
  inel.show();
  Serial.println("Apasa butonul ca sa schimbi efectul.");
}

void curcubeu() {
  inel.rainbow(pas * 256);
  inel.show();
}

void aleargaLumina() {
  inel.clear();
  int i = pas % NR_LED;
  inel.setPixelColor(i, inel.Color(255, 40, 0));
  inel.setPixelColor((i + NR_LED - 1) % NR_LED, inel.Color(60, 10, 0));
  inel.setPixelColor((i + NR_LED - 2) % NR_LED, inel.Color(15, 2, 0));
  inel.show();
}

void respiratie() {
  // luminozitatea urcă și coboară lin (sinus)
  float unghi = pas * 0.08;
  int nivel = (sin(unghi) + 1.0) * 127;
  inel.fill(inel.Color(0, nivel / 2, nivel));
  inel.show();
}

void loop() {
  bool buton = digitalRead(PIN_BUTON);
  if (butonAnterior == HIGH && buton == LOW) {
    efect = (efect + 1) % 3;
    Serial.print("Efect: ");
    Serial.println(efect);
  }
  butonAnterior = buton;

  if (efect == 0) curcubeu();
  else if (efect == 1) aleargaLumina();
  else respiratie();

  pas++;
  delay(40);
}
`);
      return k.p;
    }
  });

  // ---------- termometru pe LCD I2C ----------
  E.exemplu({
    id: 'lcd-termometru', nume: 'Termometru cu LCD I2C și termistor', etichete: ['afișaje', 'LCD', 'I2C', 'analogRead'],
    descriere: 'Un termistor NTC de 10 kΩ într-un divizor cu un rezistor de 10 kΩ, citit pe GPIO34. Temperatura apare pe un LCD 16×2 cu modul I2C, alimentat din 5 V. Schimbă temperatura termistorului în simulare.',
    construieste() {
      const k = baza('Termometru LCD');
      sina5V(k);
      // divizor: 3V3 — 10 kΩ — nod (coloana 44) — NTC — GND
      k.inGaura('r1', 'rezistor', 'c', 40, { valoare: 10000, pas: '4' });
      k.inGaura('t1', 'ntc', 'd', 44, {});
      k.fir('bb:e40', 'bb:' + k.sina(3, 41), ROSU, [[410, 104], [420, 104]]);
      k.fir('bb:a45', 'bb:' + k.sina(2, 45), NEGRU);
      k.fir('bb:a44', 'bb:a19', VERDE, [[450, 36], [200, 36]]);
      // LCD în dreapta breadboard-ului
      k.piesa('l1', 'lcd-16x2-i2c', 740, 260, {});
      laDreapta(k, 'D21', 'l1:SDA', ALBASTRU, 240);
      laDreapta(k, 'D22', 'l1:SCL', GALBEN, 232);
      k.fir('l1:GND', 'bb:' + k.sina(4, 61), NEGRU, [[706, 248], [640, 248], [640, 200]]);
      k.fir('l1:VCC', 'bb:' + k.sina(1, 61), ROSU, [[716, 252], [680, 252], [680, 10]]);
      k.cod(`
// Termometru: termistor NTC 10k pe GPIO34, afișat pe un LCD 16x2 I2C.
// Schimbă temperatura termistorului din panoul lui (în simulare).

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <math.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);   // adresa, coloane, rânduri

const int PIN_NTC = 34;
const float R_FIX = 10000.0;    // rezistorul de sus din divizor
const float R_25 = 10000.0;     // NTC la 25 °C
const float BETA = 3950.0;

// simbolul de grad, desenat de noi (5x8 puncte)
byte grad[8] = { 0b01100, 0b10010, 0b10010, 0b01100, 0, 0, 0, 0 };

float citesteTemperatura() {
  // media a 16 citiri, ca să scăpăm de zgomot
  long suma = 0;
  for (int i = 0; i < 16; i++) suma += analogReadMilliVolts(PIN_NTC);
  float v = suma / 16.0 / 1000.0;              // volți pe NTC
  float rNtc = R_FIX * v / (3.3 - v);           // din divizorul de tensiune
  float kelvin = 1.0 / (1.0 / 298.15 + log(rNtc / R_25) / BETA);
  return kelvin - 273.15;
}

void setup() {
  Serial.begin(115200);
  lcd.init();
  lcd.backlight();          // fără ea, textul abia se vede
  lcd.createChar(0, grad);
  lcd.setCursor(0, 0);
  lcd.print("Termometru");
}

void loop() {
  float t = citesteTemperatura();
  lcd.setCursor(0, 1);
  lcd.print("T = ");
  lcd.print(t, 1);
  lcd.write(0);             // caracterul nostru: °
  lcd.print("C   ");        // spațiile șterg cifrele rămase
  Serial.printf("Temperatura: %.1f C\\n", t);
  delay(500);
}
`);
      return k.p;
    }
  });

  // ---------- panou pe TFT color ----------
  E.exemplu({
    id: 'tft-panou', nume: 'Panou color pe ecran TFT', etichete: ['afișaje', 'TFT', 'SPI', 'TFT_eSPI'],
    descriere: 'Un ecran TFT ILI9341 de 2,8" pe SPI desenează un indicator circular, cifre mari și un grafic care curge, după valoarea unui potențiometru de pe GPIO34.',
    construieste() {
      const k = baza('Panou TFT');
      punte3V3(k);
      // ecranul stă culcat în dreapta breadboard-ului (rotit 90°), cu pinii spre placă
      k.piesa('t1', 'tft', 700, 100, { model: 'ili9341' }, { rot: 90 });
      // pinii TFT, de sus în jos: VCC GND CS RST DC MOSI SCK LED MISO
      const semnal = (pinPlaca, xPlaca, pinTft, yTft, culoare, banda, xBanda) => k.fir('esp:' + pinPlaca, 't1:' + pinTft, culoare, [[xPlaca, banda], [xBanda, banda], [xBanda, yTft]]);
      semnal('D15', 110, 'CS', 120, PORTOCALIU, 222, 672);
      semnal('D4', 130, 'RST', 130, GRI, 228, 676);
      semnal('D2', 120, 'DC', 140, MOV, 234, 680);
      semnal('D23', 230, 'MOSI', 150, ALBASTRU, 240, 684);
      semnal('D18', 170, 'SCK', 160, GALBEN, 246, 688);
      k.fir('t1:VCC', 'bb:' + k.sina(1, 61), ROSU);
      k.fir('t1:GND', 'bb:' + k.sina(2, 60), NEGRU);
      k.fir('t1:LED', 'bb:' + k.sina(3, 61), ROSU);
      k.piesa('p1', 'potentiometru', 480, -40, { valoare: 10000 });
      k.fir('p1:1', 'bb:' + k.sina(2, 47), NEGRU);
      k.fir('p1:2', 'bb:' + k.sina(1, 49), ROSU);
      k.fir('p1:W', 'bb:a19', VERDE, [[490, -16], [200, -16]]);
      k.cod(`
// Panou color pe un TFT ILI9341 (240x320) cu biblioteca TFT_eSPI.
// Pe placa reală, pinii se aleg în User_Setup.h al bibliotecii:
//   TFT_MOSI 23, TFT_SCLK 18, TFT_CS 15, TFT_DC 2, TFT_RST 4
// Rotește potențiometrul de pe GPIO34.

#include <TFT_eSPI.h>

TFT_eSPI tft = TFT_eSPI();
const int PIN_POT = 34;

int grafic[100];
int nrPuncte = 0;
int ultimProcent = -1;

void desenCadru() {
  tft.fillScreen(TFT_BLACK);
  tft.setTextDatum(TC_DATUM);
  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.drawString("Panou Mester", 160, 6, 4);
  tft.drawRoundRect(170, 40, 144, 124, 8, TFT_DARKGREY);
  tft.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
  tft.drawString("Istoric", 242, 46, 2);
}

void desenIndicator(int procent) {
  // arc de fundal și arcul valorii (0° e jos, crește în sensul acelor de ceas)
  int unghi = 60 + procent * 240 / 100;
  tft.drawSmoothArc(84, 110, 64, 50, 60, 300, TFT_DARKGREY, TFT_BLACK);
  uint16_t culoare = procent < 50 ? TFT_GREEN : (procent < 80 ? TFT_YELLOW : TFT_RED);
  if (procent > 0) tft.drawSmoothArc(84, 110, 64, 50, 60, unghi, culoare, TFT_BLACK);
  tft.setTextDatum(MC_DATUM);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextPadding(tft.textWidth("100", 6));
  tft.drawNumber(procent, 84, 104, 6);
  tft.setTextPadding(0);
  tft.drawString("%", 84, 140, 4);
}

void desenGrafic() {
  tft.fillRect(174, 64, 136, 96, TFT_BLACK);
  for (int i = 1; i < nrPuncte; i++) {
    int x0 = 176 + (i - 1) * 132 / 99;
    int x1 = 176 + i * 132 / 99;
    tft.drawLine(x0, 158 - grafic[i - 1] * 90 / 100, x1, 158 - grafic[i] * 90 / 100, TFT_GREEN);
  }
}

void setup() {
  Serial.begin(115200);
  tft.init();
  tft.setRotation(3);          // orizontal (320x240), potrivit cu ecranul culcat
  desenCadru();
}

void loop() {
  int procent = map(analogRead(PIN_POT), 0, 4095, 0, 100);
  if (procent != ultimProcent) {
    desenIndicator(procent);
    ultimProcent = procent;
  }
  // graficul: ultimele 100 de valori
  if (nrPuncte < 100) grafic[nrPuncte++] = procent;
  else {
    for (int i = 1; i < 100; i++) grafic[i - 1] = grafic[i];
    grafic[99] = procent;
  }
  desenGrafic();

  tft.setTextDatum(BL_DATUM);
  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  tft.setTextPadding(200);
  tft.drawString("Timp: " + String(millis() / 1000) + " s", 10, 236, 2);
  tft.setTextPadding(0);
  delay(50);
}
`);
      return k.p;
    }
  });

  // ---------- cronometru pe TM1637 ----------
  E.exemplu({
    id: 'tm1637-cronometru', nume: 'Cronometru pe afișaj TM1637', etichete: ['afișaje', '7 segmente', 'millis'],
    descriere: 'Un afișaj cu 4 cifre TM1637 (CLK pe GPIO18, DIO pe GPIO19) arată minute:secunde. Butonul de pe GPIO4 pornește și oprește cronometrul; ținut apăsat o secundă îl readuce la zero.',
    construieste() {
      const k = baza('Cronometru TM1637');
      k.piesa('d1', 'tm1637', 700, 260, {});
      laDreapta(k, 'D18', 'd1:CLK', GALBEN, 238);
      laDreapta(k, 'D19', 'd1:DIO', ALBASTRU, 232);
      k.fir('d1:VCC', 'bb:' + k.sina(3, 61), ROSU, [[720, 222], [620, 222]]);
      k.fir('d1:GND', 'bb:' + k.sina(4, 60), NEGRU, [[730, 216], [610, 216]]);
      k.inGaura('b1', 'buton', 'e', 50, { culoare: 'verde' });
      k.fir('esp:D4', 'bb:j50', ALBASTRU, [[130, 172], [500, 172]]);
      k.fir('bb:j52', 'bb:' + k.sina(4, 53), NEGRU);
      k.cod(`
// Cronometru cu afișaj TM1637 (4 cifre, două puncte la mijloc).
// Apăsare scurtă: pornește / oprește. Apăsare de 1 secundă: zero.

#include <TM1637Display.h>

const int PIN_CLK = 18;
const int PIN_DIO = 19;
const int PIN_BUTON = 4;

TM1637Display afisaj(PIN_CLK, PIN_DIO);

bool merge = false;
unsigned long pornitLa = 0;     // momentul ultimei porniri
unsigned long acumulat = 0;     // timpul strâns până la ultima oprire
unsigned long apasatLa = 0;
bool butonAnterior = HIGH;
bool resetat = false;

unsigned long timpCurent() {
  return acumulat + (merge ? millis() - pornitLa : 0);
}

void setup() {
  pinMode(PIN_BUTON, INPUT_PULLUP);
  afisaj.setBrightness(5);      // 0...7 — fără ea afișajul rămâne stins
  afisaj.showNumberDecEx(0, 0b01000000, true);
}

void loop() {
  bool buton = digitalRead(PIN_BUTON);
  if (butonAnterior == HIGH && buton == LOW) { apasatLa = millis(); resetat = false; }
  if (buton == LOW && !resetat && millis() - apasatLa > 1000) {
    merge = false; acumulat = 0; resetat = true;
  }
  if (butonAnterior == LOW && buton == HIGH && !resetat) {
    if (merge) { acumulat += millis() - pornitLa; merge = false; }
    else { pornitLa = millis(); merge = true; }
  }
  butonAnterior = buton;

  unsigned long secunde = timpCurent() / 1000;
  int minute = (secunde / 60) % 100;
  int sec = secunde % 60;
  // punctele clipesc cât timp cronometrul merge
  bool puncte = !merge || (timpCurent() % 1000 < 500);
  afisaj.showNumberDecEx(minute * 100 + sec, puncte ? 0b01000000 : 0, true);
  delay(30);
}
`);
      return k.p;
    }
  });
})(window.M = window.M || {});
