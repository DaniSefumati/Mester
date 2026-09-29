/* Meșter — exemple cu WiFi: server web care comandă LED-uri și arată temperatura, telecomandă prin WebSocket
   cu potențiometru și LED cu PWM, stație meteo cu OpenWeatherMap și ora din NTP pe OLED, punct de acces
   propriu cu formular care scrie pe un LCD. Paginile plăcii se deschid în fila Web. */
(function (M) {
  'use strict';
  const E = M.exemple;
  const ROSU = '#e53935', NEGRU = '#1f1f1f', GALBEN = '#fdd835', ALBASTRU = '#1e88e5', VERDE = '#43a047';

  function baza(nume) {
    const k = E.constructor(nume);
    k.piesa('bb', 'breadboard', 0, 0, { marime: 'completa' });
    E.devkitPeBreadboard(k, 22);
    E.alimentareDevkit(k, 22);
    return k;
  }
  const sina5V = (k) => k.fir('bb:a8', 'bb:' + k.sina(1, 9), ROSU, [[90, 30], [100, 30]]);
  const punte3V3 = (k) => k.fir('bb:' + k.sina(3, 3), 'bb:' + k.sina(1, 3), ROSU);
  function poz(k, ref) {
    const [c, p] = ref.split(':');
    const inst = k.ids[c];
    const pin = M.componente.pini(inst).find(q => q.id === p);
    return M.retea.transforma(inst, pin.x, pin.y);
  }
  const prinBanda = (k, a, b, culoare, y) => { const A = poz(k, a), B = poz(k, b); return k.fir(a, b, culoare, [[A.x, y], [B.x, y]]); };
  function ledCuRezistor(k, id, col, culoare) {
    k.inGaura('r' + id, 'rezistor', 'c', col, { valoare: 220, pas: '4' });
    k.inGaura('led' + id, 'led', 'e', col + 4, { culoare });
    k.fir('bb:a' + (col + 5), 'bb:' + k.sina(2, col + 5), NEGRU);
  }

  // ---------- server web: LED-uri și temperatură ----------
  E.exemplu({
    id: 'server-web-led', nume: 'Pagină web: LED-uri și temperatură', etichete: ['WiFi', 'WebServer', 'ArduinoJson', 'DHT22'],
    descriere: 'ESP32 se conectează la WiFi și pornește un server web. Deschide fila Web: pagina arată temperatura și umiditatea de la DHT22 (GPIO25) și are câte un buton pentru LED-ul roșu (GPIO27) și cel verde (GPIO26). Pagina cere datele cu fetch() la fiecare 2 secunde, iar placa răspunde în JSON.',
    construieste() {
      const k = baza('Pagină web cu LED-uri');
      punte3V3(k);
      ledCuRezistor(k, '1', 26, 'rosu');
      ledCuRezistor(k, '2', 33, 'verde');
      prinBanda(k, 'bb:a13', 'bb:a26', ROSU, 42);                          // GPIO27
      prinBanda(k, 'bb:a14', 'bb:a33', VERDE, 38);                         // GPIO26
      const d = k.piesa('d1', 'dht', 500, -20, { model: 'dht22', forma: 'modul' });
      d.control.temperatura = 23.4;
      d.control.umiditate = 48;
      k.fir('d1:VCC', 'bb:' + k.sina(1, 49), ROSU);
      k.fir('d1:GND', 'bb:' + k.sina(2, 53), NEGRU);
      prinBanda(k, 'd1:DATA', 'bb:a15', GALBEN, 34);                       // GPIO25
      k.cod(`
// Server web pe ESP32: pagina din fila „Web” aprinde LED-urile și arată temperatura.
// LED roșu = GPIO27, LED verde = GPIO26, DHT22 = GPIO25.

#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <DHT.h>

const char* RETEA = "Acasa";
const char* PAROLA = "parola123";

WebServer server(80);
DHT dht(25, DHT22);
const int LEDURI[2] = {27, 26};
bool aprins[2] = {false, false};

// pagina e păstrată în memoria flash (PROGMEM) și trimisă la fiecare vizită
const char PAGINA[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="ro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Camera mea</title>
<style>
  body { margin: 0; font-family: system-ui, sans-serif; background: #eef2f0; color: #1d2622; }
  main { max-width: 420px; margin: 0 auto; padding: 22px 16px; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  .sub { margin: 0 0 18px; color: #66756e; font-size: 13px; }
  .masuri { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 18px; }
  .masura { background: #fff; border-radius: 12px; padding: 14px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  .masura b { display: block; font-size: 30px; font-variant-numeric: tabular-nums; }
  .masura span { color: #66756e; font-size: 13px; }
  button { display: flex; justify-content: space-between; width: 100%; padding: 15px 16px; margin-bottom: 10px;
           border: 0; border-radius: 12px; font-size: 16px; background: #fff; color: #1d2622; cursor: pointer;
           box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  button::after { content: "stins"; color: #8a9891; }
  button.aprins.rosu { background: #e53935; color: #fff; }
  button.aprins.verde { background: #2e9d52; color: #fff; }
  button.aprins::after { content: "aprins"; color: #fff; }
</style>
</head>
<body>
<main>
  <h1>Camera mea</h1>
  <p class="sub">ESP32 · se actualizează la 2 secunde</p>
  <div class="masuri">
    <div class="masura"><b id="temp">--</b><span>temperatură (°C)</span></div>
    <div class="masura"><b id="umid">--</b><span>umiditate (%)</span></div>
  </div>
  <button id="b0" class="rosu" onclick="comuta(0)">LED roșu</button>
  <button id="b1" class="verde" onclick="comuta(1)">LED verde</button>
</main>
<script>
let leduri = [0, 0];
function arata(d) {
  document.getElementById('temp').textContent = d.temp.toFixed(1);
  document.getElementById('umid').textContent = d.umid.toFixed(0);
  leduri = d.leduri;
  for (let i = 0; i < 2; i++) document.getElementById('b' + i).classList.toggle('aprins', leduri[i] == 1);
}
function actualizeaza() { fetch('/stare').then(r => r.json()).then(arata); }
function comuta(i) {
  const date = new URLSearchParams({ nr: i, stare: leduri[i] ? 0 : 1 });
  fetch('/led', { method: 'POST', body: date }).then(r => r.json()).then(arata);
}
actualizeaza();
setInterval(actualizeaza, 2000);
</script>
</body>
</html>
)rawliteral";

// starea plăcii ca text JSON: {"temp":23.4,"umid":48,"leduri":[1,0]}
String stareJson() {
  JsonDocument doc;
  doc["temp"] = dht.readTemperature();
  doc["umid"] = dht.readHumidity();
  JsonArray l = doc["leduri"].to<JsonArray>();
  for (int i = 0; i < 2; i++) l.add(aprins[i] ? 1 : 0);
  String text;
  serializeJson(doc, text);
  return text;
}

void paginaPrincipala() { server.send(200, "text/html", PAGINA); }
void stare() { server.send(200, "application/json", stareJson()); }
void led() {
  int nr = server.arg("nr").toInt();
  if (nr < 0 || nr > 1 || !server.hasArg("stare")) { server.send(400, "text/plain", "Cerere gresita"); return; }
  aprins[nr] = server.arg("stare") == "1";
  digitalWrite(LEDURI[nr], aprins[nr] ? HIGH : LOW);
  Serial.printf("LED %d %s\\n", nr, aprins[nr] ? "aprins" : "stins");
  server.send(200, "application/json", stareJson());
}

void setup() {
  Serial.begin(115200);
  for (int i = 0; i < 2; i++) pinMode(LEDURI[i], OUTPUT);
  dht.begin();
  WiFi.mode(WIFI_STA);
  WiFi.begin(RETEA, PAROLA);
  Serial.print("Ma conectez la WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Deschide in browser: http://");
  Serial.println(WiFi.localIP());

  server.on("/", paginaPrincipala);
  server.on("/stare", stare);
  server.on("/led", HTTP_POST, led);
  server.onNotFound([]() { server.send(404, "text/plain", "Pagina nu exista"); });
  server.begin();
}

void loop() {
  server.handleClient();   // fără asta, serverul nu răspunde
  delay(2);
}
`);
      return k.p;
    }
  });

  // ---------- WebSocket: potențiometru și LED cu PWM ----------
  E.exemplu({
    id: 'websocket-pwm', nume: 'WebSocket: glisor pentru LED și potențiometru live', etichete: ['WiFi', 'ESPAsyncWebServer', 'WebSocket', 'PWM'],
    descriere: 'Server asincron (ESPAsyncWebServer) cu WebSocket. În fila Web, glisorul schimbă luminozitatea LED-ului de pe GPIO27 (PWM), iar placa trimite imediat poziția potențiometrului de pe GPIO34 către toate paginile deschise. Rotește potențiometrul din schemă și urmărește bara din pagină.',
    construieste() {
      const k = baza('WebSocket: LED și potențiometru');
      punte3V3(k);
      ledCuRezistor(k, '1', 26, 'albastru');
      prinBanda(k, 'bb:a13', 'bb:a26', ALBASTRU, 42);                      // GPIO27
      k.piesa('p1', 'potentiometru', 480, -40, { valoare: 10000 });
      k.fir('p1:1', 'bb:' + k.sina(2, 47), NEGRU);
      k.fir('p1:2', 'bb:' + k.sina(1, 49), ROSU);
      k.fir('p1:W', 'bb:a19', VERDE, [[490, -16], [200, -16]]);            // GPIO34
      k.cod(`
// WebSocket cu ESPAsyncWebServer: pagina din fila „Web” comandă LED-ul (PWM pe GPIO27)
// și primește în timp real poziția potențiometrului (GPIO34).

#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>

const char* RETEA = "Acasa";
const char* PAROLA = "parola123";
const int PIN_LED = 27;
const int PIN_POT = 34;

AsyncWebServer server(80);
AsyncWebSocket ws("/ws");
int luminozitate = 40;       // 0..255
int potTrimis = -100;

// %LUMINA% e înlocuit de funcția processor; semnul procent din CSS se scrie %%
const char PAGINA[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="ro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lumina</title>
<style>
  body { margin: 0; font-family: system-ui, sans-serif; background: #10161b; color: #e6edf2; }
  main { max-width: 420px; margin: 0 auto; padding: 24px 16px; }
  h1 { margin: 0 0 20px; font-size: 22px; }
  .card { background: #1a232b; border-radius: 14px; padding: 16px; margin-bottom: 14px; }
  .eticheta { display: flex; justify-content: space-between; color: #9fb0bd; font-size: 14px; margin-bottom: 10px; }
  .eticheta b { color: #e6edf2; font-variant-numeric: tabular-nums; }
  input[type=range] { width: 100%%; accent-color: #4aa3ff; }
  .bara { height: 14px; border-radius: 7px; background: #26323c; overflow: hidden; }
  .bara div { height: 100%%; width: 0; background: linear-gradient(90deg, #3ecf8e, #4aa3ff); transition: width .15s; }
  .stare { font-size: 12px; color: #6f8290; }
</style>
</head>
<body>
<main>
  <h1>Lumina din birou</h1>
  <div class="card">
    <div class="eticheta">Luminozitate LED <b id="valLed">%LUMINA%</b></div>
    <input type="range" id="glisor" min="0" max="255" value="%LUMINA%">
  </div>
  <div class="card">
    <div class="eticheta">Potențiometru <b id="valPot">--</b></div>
    <div class="bara"><div id="bara"></div></div>
  </div>
  <p class="stare" id="stare">Mă conectez…</p>
</main>
<script>
const ws = new WebSocket('ws://' + location.hostname + '/ws');
const glisor = document.getElementById('glisor');
ws.onopen = () => document.getElementById('stare').textContent = 'Conectat la placă prin WebSocket';
ws.onclose = () => document.getElementById('stare').textContent = 'Legătura s-a întrerupt';
ws.onmessage = (e) => {
  const d = JSON.parse(e.data);
  if (d.pot !== undefined) {
    document.getElementById('valPot').textContent = d.pot;
    document.getElementById('bara').style.width = (d.pot / 4095 * 100) + '%';
  }
  if (d.led !== undefined) {
    document.getElementById('valLed').textContent = d.led;
    if (document.activeElement !== glisor) glisor.value = d.led;
  }
};
glisor.oninput = () => {
  document.getElementById('valLed').textContent = glisor.value;
  ws.send(JSON.stringify({ led: Number(glisor.value) }));
};
</script>
</body>
</html>
)rawliteral";

String processor(const String& var) {
  if (var == "LUMINA") return String(luminozitate);
  return String();
}

void trimiteLuminozitatea() { ws.textAll("{\\"led\\":" + String(luminozitate) + "}"); }

void laMesaj(AsyncWebSocketClient *client, uint8_t *data, size_t len) {
  JsonDocument doc;
  if (deserializeJson(doc, (char*)data, len)) return;
  if (doc["led"].is<int>()) {
    luminozitate = constrain(doc["led"].as<int>(), 0, 255);
    analogWrite(PIN_LED, luminozitate);
    trimiteLuminozitatea();       // și celelalte pagini deschise văd schimbarea
  }
}

void laEveniment(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len) {
  if (type == WS_EVT_CONNECT) {
    Serial.printf("Pagina #%u s-a conectat\\n", client->id());
    client->text("{\\"pot\\":" + String(analogRead(PIN_POT)) + ",\\"led\\":" + String(luminozitate) + "}");
  } else if (type == WS_EVT_DISCONNECT) {
    Serial.printf("Pagina #%u a plecat\\n", client->id());
  } else if (type == WS_EVT_DATA) {
    AwsFrameInfo *info = (AwsFrameInfo*)arg;
    if (info->final && info->index == 0 && info->len == len && info->opcode == WS_TEXT) laMesaj(client, data, len);
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED, OUTPUT);
  analogWrite(PIN_LED, luminozitate);
  WiFi.begin(RETEA, PAROLA);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  Serial.print("Pagina: http://");
  Serial.println(WiFi.localIP());

  ws.onEvent(laEveniment);
  server.addHandler(&ws);
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send_P(200, "text/html", PAGINA, processor);
  });
  server.begin();
}

void loop() {
  // trimite poziția potențiometrului doar când se schimbă vizibil
  int pot = analogRead(PIN_POT);
  if (abs(pot - potTrimis) > 20) {
    potTrimis = pot;
    ws.textAll("{\\"pot\\":" + String(pot) + "}");
  }
  ws.cleanupClients();
  delay(50);
}
`);
      return k.p;
    }
  });

  // ---------- stație meteo: OpenWeatherMap + NTP pe OLED ----------
  E.exemplu({
    id: 'meteo-oled', nume: 'Stație meteo de pe internet pe OLED', etichete: ['WiFi', 'HTTPClient', 'ArduinoJson', 'NTP', 'OLED'],
    descriere: 'ESP32 cere vremea de la OpenWeatherMap (HTTPClient + ArduinoJson) și ora exactă de la un server NTP, apoi le afișează pe OLED-ul de pe I2C (SDA = GPIO21, SCL = GPIO22). În simulare, OpenWeatherMap răspunde cu date de exemplu; cererile se văd în fila Web → Jurnal.',
    construieste() {
      const k = baza('Stație meteo pe OLED');
      punte3V3(k);
      k.piesa('o1', 'oled-128x64', 300, 260, {});
      k.fir('o1:GND', 'bb:' + k.sina(4, 29), NEGRU);
      k.fir('o1:VCC', 'bb:' + k.sina(3, 31), ROSU, [[310, 236], [320, 236]]);
      k.fir('esp:D22', 'o1:SCL', GALBEN, [[220, 224], [320, 224], [320, 248]]);
      k.fir('esp:D21', 'o1:SDA', ALBASTRU, [[190, 230], [330, 230], [330, 248]]);
      k.cod(`
// Stație meteo: vremea de la OpenWeatherMap și ora de la NTP, pe un OLED SSD1306.
// Pe placa reală, pune cheia ta de la openweathermap.org în CHEIE.

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "time.h"

const char* RETEA = "Acasa";
const char* PAROLA = "parola123";
const String CHEIE = "cheia-ta-openweathermap";
const String ORAS = "Iasi,RO";

Adafruit_SSD1306 ecran(128, 64, &Wire, -1);
float temperatura = NAN;
int umiditate = 0;
String descriere = "...";
unsigned long ultimaCerere = 0;

bool citesteVremea() {
  HTTPClient http;
  String url = "http://api.openweathermap.org/data/2.5/weather?q=" + ORAS + "&units=metric&lang=ro&appid=" + CHEIE;
  http.begin(url);
  int cod = http.GET();
  if (cod != 200) {
    Serial.printf("Eroare HTTP: %d\\n", cod);
    http.end();
    return false;
  }
  JsonDocument doc;
  DeserializationError e = deserializeJson(doc, http.getStream());
  http.end();
  if (e) {
    Serial.print("JSON gresit: ");
    Serial.println(e.c_str());
    return false;
  }
  temperatura = doc["main"]["temp"];
  umiditate = doc["main"]["humidity"];
  descriere = doc["weather"][0]["description"].as<String>();
  Serial.printf("%s: %.1f C, %d%%, %s\\n", doc["name"].as<const char*>(), temperatura, umiditate, descriere.c_str());
  return true;
}

void deseneaza() {
  struct tm t;
  ecran.clearDisplay();
  ecran.setTextColor(SSD1306_WHITE);
  ecran.setTextSize(2);
  ecran.setCursor(16, 0);
  if (getLocalTime(&t, 10)) ecran.printf("%02d:%02d:%02d", t.tm_hour, t.tm_min, t.tm_sec);
  else ecran.print("--:--:--");
  ecran.drawFastHLine(0, 20, 128, SSD1306_WHITE);
  ecran.setTextSize(3);
  ecran.setCursor(0, 26);
  if (isnan(temperatura)) ecran.print("--");
  else ecran.print(temperatura, 1);
  ecran.setTextSize(1);
  ecran.print(" C");
  ecran.setCursor(0, 56);
  ecran.printf("%d%% %s", umiditate, descriere.c_str());
  ecran.display();
}

void setup() {
  Serial.begin(115200);
  if (!ecran.begin(SSD1306_SWITCHCAPVCC, 0x3C)) Serial.println("OLED negasit");
  ecran.clearDisplay();
  ecran.setTextColor(SSD1306_WHITE);
  ecran.setCursor(0, 0);
  ecran.println("Conectare WiFi...");
  ecran.display();

  WiFi.begin(RETEA, PAROLA);
  while (WiFi.status() != WL_CONNECTED) delay(250);
  Serial.println("WiFi conectat: " + WiFi.localIP().toString());
  configTime(2 * 3600, 3600, "pool.ntp.org");   // ora României, cu ora de vară
  citesteVremea();
  ultimaCerere = millis();
}

void loop() {
  if (millis() - ultimaCerere > 10UL * 60 * 1000) {   // o dată la 10 minute
    ultimaCerere = millis();
    citesteVremea();
  }
  deseneaza();
  delay(200);
}
`);
      return k.p;
    }
  });

  // ---------- punct de acces propriu cu formular ----------
  E.exemplu({
    id: 'punct-acces-lcd', nume: 'Punct de acces WiFi: mesaj pe LCD', etichete: ['WiFi', 'softAP', 'formular', 'LCD'],
    descriere: 'ESP32 își face propria rețea („Mester-AP”, parola parola123) la adresa 192.168.4.1. În fila Web apare un formular: textul trimis se scrie pe LCD-ul 16×2 I2C (SDA = GPIO21, SCL = GPIO22). Merge fără router, ca la o jucărie sau la un aparat pe care îl configurezi de pe telefon.',
    construieste() {
      const k = baza('Punct de acces și LCD');
      sina5V(k);
      k.piesa('l1', 'lcd-16x2-i2c', 740, 260, {});
      prinBanda(k, 'esp:D21', 'l1:SDA', ALBASTRU, 240);
      prinBanda(k, 'esp:D22', 'l1:SCL', GALBEN, 232);
      k.fir('l1:GND', 'bb:' + k.sina(4, 61), NEGRU, [[706, 248], [640, 248], [640, 200]]);
      k.fir('l1:VCC', 'bb:' + k.sina(1, 61), ROSU, [[716, 252], [680, 252], [680, 10]]);
      k.cod(`
// Punct de acces WiFi propriu: telefonul (fila „Web”) se conectează direct la ESP32,
// iar textul trimis din formular apare pe LCD.

#include <WiFi.h>
#include <WebServer.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

WebServer server(80);
LiquidCrystal_I2C lcd(0x27, 16, 2);
String mesaj = "Salut!";
int mesajeNr = 0;

String pagina() {
  String p = "<!DOCTYPE html><html lang='ro'><head><meta charset='utf-8'>";
  p += "<meta name='viewport' content='width=device-width, initial-scale=1'><title>Mesaj pe LCD</title>";
  p += "<style>body{margin:0;font-family:system-ui,sans-serif;background:#f6f1e7;color:#2a2418}";
  p += "main{max-width:400px;margin:0 auto;padding:24px 16px}h1{font-size:21px;margin:0 0 6px}";
  p += ".lcd{font-family:monospace;font-size:18px;background:#1d4ed8;color:#e0f2fe;padding:12px 14px;border-radius:8px;margin:14px 0 18px;letter-spacing:.06em}";
  p += "input{width:100%;box-sizing:border-box;font-size:17px;padding:12px;border:1px solid #cdbfa3;border-radius:8px}";
  p += "button{margin-top:10px;width:100%;padding:13px;font-size:16px;border:0;border-radius:8px;background:#c2641c;color:#fff}";
  p += "small{color:#7a6d55}</style></head><body><main>";
  p += "<h1>Mesaj pe LCD</h1><small>Mesaje primite: " + String(mesajeNr) + "</small>";
  p += "<div class='lcd'>" + mesaj + "</div>";
  p += "<form action='/trimite' method='POST'><input name='text' maxlength='16' placeholder='Cel mult 16 caractere' required>";
  p += "<button>Trimite pe LCD</button></form></main></body></html>";
  return p;
}

void arataPeLcd() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Mesaj #" + String(mesajeNr));
  lcd.setCursor(0, 1);
  lcd.print(mesaj.substring(0, 16));
}

void setup() {
  Serial.begin(115200);
  lcd.init();
  lcd.backlight();
  WiFi.softAP("Mester-AP", "parola123");
  Serial.print("Retea: Mester-AP, adresa: http://");
  Serial.println(WiFi.softAPIP());
  lcd.print("Mester-AP");
  lcd.setCursor(0, 1);
  lcd.print(WiFi.softAPIP());

  server.on("/", []() { server.send(200, "text/html", pagina()); });
  server.on("/trimite", HTTP_POST, []() {
    mesaj = server.arg("text");
    mesaj.trim();
    mesajeNr++;
    Serial.println("Mesaj nou: " + mesaj);
    arataPeLcd();
    server.sendHeader("Location", "/");   // înapoi la pagina principală
    server.send(303);
  });
  server.begin();
}

void loop() {
  server.handleClient();
  delay(2);
}
`);
      return k.p;
    }
  });
})(window.M = window.M || {});
