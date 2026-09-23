# 🎡 Glücksrad

Ein Glücksrad für den Browser, das du selbst mit Einträgen füllst (z. B. Klassen oder Namen).
Dazu gibt es einen **versteckten Admin-Bereich**, in dem du das Ergebnis beeinflussen kannst:
Einträge sperren, bevorzugen oder den nächsten Gewinner direkt festlegen.
Nach außen sieht das Rad dabei ganz normal aus.

Reines HTML/CSS/JavaScript: kein Build, keine Bibliotheken, keine Internetverbindung nötig.

## Starten

`index.html` doppelklicken, fertig.

Optional über einen lokalen Server (praktisch, wenn du Hauptseite und Admin in zwei Fenstern nutzt):

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Bedienung

| Was | Wie |
| --- | --- |
| Einträge bearbeiten | Rechts im Textfeld, ein Eintrag pro Zeile |
| Titel des Rads | Über dem Rad direkt hineinklicken und tippen |
| Drehen | „Rad drehen“, auf die Mitte klicken oder **Leertaste** |
| Gewinner entfernen | Im Ergebnis-Fenster „Aus dem Rad entfernen“ (oder automatisch, siehe Einstellungen) |
| Entfernte zurückholen | Knopf „↩ … zurückholen“ unter den Einträgen |
| Vollbild (z. B. für den Beamer) | ⛶ oben rechts oder **F** – zeigt dann nur das Rad |

Einträge, Verlauf und Einstellungen bleiben im Browser gespeichert (`localStorage`).

## Funktionen

- **📂 Meine Räder**: mehrere Listen unter eigenem Namen speichern (z. B. eine pro Klasse),
  mit einem Klick wechseln, löschen oder ein neues leeres Rad anlegen.
- **👥 Teams**: verteilt alle Einträge zufällig auf eine Anzahl Teams oder auf Teams mit
  fester Größe; Ergebnis als Text kopierbar.
- **📊 Statistik**: wie oft wurde wer gezogen (mit Balken), Anzahl Drehungen,
  Verlauf als CSV (für Excel) herunterladen.
- **⚙️ Einstellungen**:
  - Drehdauer kurz / normal / lang
  - fünf Farbschemen fürs Rad (Bunt, Pastell, Neon, Ozean, Herbst)
  - Darstellung Dunkel / Hell / wie das System
  - Gewinner automatisch entfernen, Konfetti und Töne an/aus
  - eigener Text über dem Ergebnis (z. B. „Dran ist:“)
- **⋯ Menü bei den Einträgen**:
  - Liste aus einer `.txt`- oder `.csv`-Datei laden (bei CSV zählt die erste Spalte)
  - Liste als `.txt` speichern
  - Link zum Teilen kopieren: die Liste steckt im Link, andere bekommen beim Öffnen dieselbe Liste
  - Doppelte entfernen, alle löschen
- **❔ Hilfe** mit Tastenkürzeln und **Datenschutz**-Hinweis (auch unten in der Fußzeile)

### Tastenkürzel

| Taste | Aktion |
| --- | --- |
| Leertaste / Enter | Rad drehen |
| F | Vollbild an/aus |
| S | Ton an/aus |
| H oder ? | Hilfe |
| Esc | Fenster schließen |

> Die Kürzel benutzen absichtlich keinen Buchstaben aus „admin“, damit das Geheimwort nichts auslöst.

### Online stellen (optional)

Damit geteilte Links auch auf anderen Geräten funktionieren, muss die Seite im Netz liegen –
am einfachsten mit **Coolify** (siehe [Deployment mit Coolify](#deployment-mit-coolify)).
Admin-Einstellungen werden dabei **nie** mitgeteilt – sie bleiben im jeweiligen Browser.

## Deployment mit Coolify

Das Repository enthält ein fertiges `Dockerfile`: nginx liefert nur `index.html`, `css/` und `js/` aus
(keine Tests, kein README). HTTPS übernimmt Coolify.

### Einrichten

1. In Coolify: Projekt öffnen → **+ New** → Resource hinzufügen:
   - Repository öffentlich → **Public Repository**, URL `https://github.com/raphael597/Gl-cksrad`
   - Repository privat → **Private Repository (with GitHub App)** oder **Deploy Key**
2. **Branch** wählen (der, auf dem das Glücksrad liegt, z. B. `main` nach dem Mergen).
3. **Build Pack** von *Nixpacks* auf **Dockerfile** umstellen.
   Base Directory `/`, Dockerfile `/Dockerfile`.
4. **Ports Exposes**: `3100` (darauf hört nginx im Container)
5. **Domains**: z. B. `https://gluecksrad.deine-domain.de`
   (vorher einen DNS-A-Record auf deinen Server setzen; das Zertifikat holt Coolify automatisch).
6. Optional unter **Health Checks**: Pfad `/healthz`, Port `3100`.
   Das Image bringt außerdem einen eigenen Docker-`HEALTHCHECK` mit.
7. **Deploy** klicken. Mit GitHub App bzw. Webhook wird bei jedem Push automatisch neu ausgerollt.

### Was der Container macht (`deploy/nginx.conf`)

- `Cache-Control: no-cache` + ETag: Browser fragen kurz nach (304), neue Versionen sind nach
  einem Deployment sofort da.
- gzip für HTML, CSS, JS und SVG
- Sicherheits-Header, u. a. eine strenge Content-Security-Policy (nur eigene Skripte und Styles)
- `/healthz` antwortet mit `ok`, versteckte Dateien (`.git` usw.) liefern 404

### Lokal testen

```bash
docker build -t gluecksrad .
docker run --rm -p 8080:3100 gluecksrad
# dann http://localhost:8080 öffnen
```

### Gut zu wissen

- **Neue Adresse = neuer Speicher.** Der Browser speichert pro Adresse. Einträge, gespeicherte
  Räder und Admin-Einstellungen (inkl. PIN) aus der lokalen `index.html` sind online also nicht da –
  PIN und Gewichte im Browser, mit dem du präsentierst, einmal neu setzen.
- **Der Admin-Bereich ist Teil der Seite.** Wer die Adresse kennt, kann ihn im *eigenen* Browser
  öffnen (Standard-PIN `1234`) und im Quelltext sehen, dass es ihn gibt. Deine Einstellungen
  sind dabei nicht erreichbar – sie liegen nur in deinem Browser.

## Admin-Bereich

### Öffnen (unauffällig)

- irgendwo auf der Seite **`admin` tippen** (nicht im Textfeld), oder
- **5× schnell auf die Überschrift** „Glücksrad“ klicken (gut fürs Tablet), oder
- **`index.html#admin`** aufrufen

Standard-PIN: **`1234`** – im Admin-Bereich unter „PIN ändern“ anpassen.
Nach dem Entsperren bleibt der Bereich bis zum Schließen des Tabs offen; „🔒 Sperren“ verriegelt ihn sofort.

### Was du einstellen kannst

- **Manipulation aktiv**: Hauptschalter. Aus = das Rad ist komplett fair.
- **Gewichtung** pro Eintrag (Regler 0–10):
  - `0` bzw. 🚫 = kommt **nie** dran
  - `1` = normal
  - höher = entsprechend häufiger (Gewicht 3 = dreimal so oft wie ein normaler Eintrag)
- **Nächstes Ergebnis festlegen**: Das Rad landet garantiert auf diesem Eintrag,
  entweder nur beim nächsten Dreh oder (mit „dauerhaft“) bei jedem Dreh.
  Das schlägt die Gewichtung.
- **Chance / Simuliert**: zeigt die echten Wahrscheinlichkeiten. „1000× simulieren“
  probiert sie aus, ohne dass das Rad sich dreht.

Die Regeln hängen am **Namen** des Eintrags (Groß-/Kleinschreibung egal). Wenn du also „7b“
sperrst, aus dem Rad löschst und später wieder einträgst, ist sie weiterhin gesperrt.

### Zweites Fenster (Beamer + Laptop)

Öffne die Hauptseite auf dem Beamer und `index.html#admin` in einem zweiten Fenster auf dem Laptop.
Beide greifen auf denselben Speicher zu: Änderungen im Admin gelten sofort für den nächsten Dreh,
ohne dass auf dem Beamer etwas zu sehen ist.

### Warum es echt aussieht

- Alle Felder sind **immer gleich groß**. Die Gewichte sieht man nirgends auf dem Rad.
- Das Rad dreht jedes Mal zufällig viele **volle Umdrehungen** (je nach Drehdauer 3–13)
  über 3–11,5 Sekunden und rollt mit einer natürlichen Bremskurve aus.
- Es bleibt an einer **zufälligen Stelle innerhalb** des Zielfeldes stehen (nie knapp am Rand).
- Zeiger-Klackern, blinkende Lämpchen, Konfetti: alles wie bei einem normalen Rad.
- Auf der Hauptseite gibt es keinen sichtbaren Hinweis auf den Admin-Bereich.

### Grenzfälle

- Stehen **alle** Einträge auf 0, zieht das Rad fair (irgendwo muss es ja stehen bleiben).
  Der Admin-Bereich warnt dann.
- Ein festgelegter Gewinner, der gar nicht im Rad steht, wird ignoriert.
- Die Regeln gelten für alle Räder: Ist „7b“ gesperrt, ist sie es auch in jedem gespeicherten Rad.
- Drehdauer, automatisches Entfernen und Teams funktionieren ganz normal weiter. Die Teams
  werden immer fair (zufällig) gebildet, die Admin-Gewichte gelten nur fürs Rad.
- Die **Statistik** zählt ehrlich den Verlauf. Ein gesperrter Eintrag steht dort nach vielen
  Drehungen also mit „0×“. Wenn dich das stört: Verlauf leeren.

> **Hinweis:** Die PIN ist nur ein Sichtschutz. Alles läuft im Browser, und wer sich mit den
> Entwicklertools auskennt, kann die Einstellungen im `localStorage` lesen.

## So funktioniert es (für Neugierige)

Der Trick steckt in zwei Schritten (`js/logik.js`):

1. **Gewinner auswählen**, *bevor* sich das Rad dreht: gewichteter Zufall
   (`waehleGewinner`). Jeder Eintrag bekommt einen Anteil entsprechend seinem Gewicht.
2. **Zielwinkel ausrechnen** (`zielRotation`): Wie weit muss das Rad drehen, damit
   der Zeiger am Ende auf genau diesem Feld steht? Dazu kommen ein paar zufällige
   volle Umdrehungen.

Das Rad selbst (`js/rad.js`) weiß von alldem nichts. Es bekommt nur einen Endwinkel und rollt dorthin aus.
Das angezeigte Ergebnis wird danach aus der tatsächlichen Radstellung abgelesen.

## Projektstruktur

```
index.html           Seite mit Rad, Einträgen und allen Dialogen
css/style.css        Aussehen (Dunkel/Hell über CSS-Variablen)
js/logik.js          Reine Rechenlogik (Gewichtung, Auswahl, Winkel), ohne DOM, getestet
js/speicher.js       Laden/Speichern im localStorage
js/rad.js            Zeichnen und Animieren des Rads (Canvas), Farbschemen
js/effekte.js        Ton (Web Audio) und Konfetti
js/admin.js          Admin-Bereich
js/app.js            Kern der Hauptseite: Drehen, Ergebnis, Verlauf, Dialoge, Tastatur
js/einstellungen.js  Dialog „Einstellungen“
js/listen.js         Meine Räder, Datei laden/speichern, Teilen-Link
js/teams.js          Teams bilden
js/statistik.js      Statistik und CSV-Export
tests/               Tests für js/logik.js
Dockerfile           Container-Image (nginx) für Coolify & Co.
deploy/nginx.conf    Webserver-Konfiguration (Caching, gzip, Sicherheits-Header, /healthz)
.dockerignore        hält Tests, README usw. aus dem Image heraus
```

## Tests

Benötigt Node.js ≥ 18 (keine Installation von Paketen nötig):

```bash
npm test
```
