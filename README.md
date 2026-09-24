# 🎡 Glücksrad

Ein Glücksrad für den Browser, das du selbst mit Einträgen füllst (z. B. Klassen oder Namen).
Dazu gibt es einen **versteckten Admin-Bereich**, in dem du das Ergebnis beeinflussen kannst:
Einträge sperren, bevorzugen oder den nächsten Gewinner direkt festlegen – auf Wunsch **live vom
Handy aus**, sogar noch während sich das Rad dreht.
Nach außen sieht das Rad dabei ganz normal aus.

Reines HTML/CSS/JavaScript: kein Build, keine Bibliotheken, keine Internetverbindung nötig.
Nur die Handy-Fernbedienung braucht zusätzlich einen kleinen Node-Server (ebenfalls ohne Pakete),
der im Docker-Image schon enthalten ist.

## Starten

`index.html` doppelklicken, fertig.

Optional über einen lokalen Server (praktisch, wenn du Hauptseite und Admin in zwei Fenstern nutzt):

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Mit Handy-Fernbedienung (Node.js ≥ 18, keine Pakete nötig):

```bash
npm start
# liefert die Seite und den Live-Server auf http://localhost:8000 aus
```

Damit das Handy den Rechner im WLAN erreicht, die Seite am Rechner über dessen IP-Adresse öffnen
(z. B. `http://192.168.1.20:8000` statt `localhost`) – der QR-Code übernimmt diese Adresse.
Oder gleich die Online-Version nehmen.

## Bedienung

| Was | Wie |
| --- | --- |
| Einträge bearbeiten | Rechts im Textfeld, ein Eintrag pro Zeile |
| Titel des Rads | Über dem Rad direkt hineinklicken und tippen |
| Ansicht wählen | Über der Bühne zwischen Rad, Slotmaschine und Roulette wechseln |
| Ziehen | Startknopf, beim Rad auch auf die Mitte klicken, oder **Leertaste** |
| Mehrere Gewinner | Neben dem Startknopf die Anzahl wählen (1–10) – niemand wird doppelt gezogen |
| Gewinner entfernen | Im Ergebnis-Fenster „Aus dem Rad entfernen“ (oder automatisch, siehe Einstellungen) |
| Entfernte zurückholen | Knopf „↩ … zurückholen“ unter den Einträgen |
| Vollbild (z. B. für den Beamer) | ⛶ oben rechts oder **F** – zeigt die gewählte Spielansicht groß |

Einträge, Verlauf und Einstellungen bleiben im Browser gespeichert (`localStorage`).

## Funktionen

- **📂 Meine Räder**: mehrere Listen unter eigenem Namen speichern (z. B. eine pro Klasse),
  mit einem Klick wechseln, löschen oder ein neues leeres Rad anlegen.
  Unter **„Auf ein anderes Gerät mitnehmen“** gibt es einen Übertragungs-Link bzw. eine
  Sicherungsdatei: aktuelles Rad, alle gespeicherten Räder und Einstellungen – vor dem Übernehmen
  wird nachgefragt, vorhandene Räder bleiben erhalten. Diese normale Übertragung enthält
  **keine Admin-Einstellungen**.
- **👥 Teams**: verteilt alle Einträge zufällig auf eine Anzahl Teams oder auf Teams mit
  fester Größe; Ergebnis als Text kopierbar.
- **🧰 Werkzeuge**:
  - **Timer** mit Vorgaben (30 s – 10 min) oder eigener Zeit, Pause, Signalton; läuft weiter,
    wenn das Fenster zu ist, und zeigt die Restzeit oben in der Kopfzeile
  - **Würfel** (1–6 Stück, mit Summe), **Münzwurf** (mit Bilanz),
    **Zufallszahl** von–bis (auch ohne Wiederholung)
  - aus dem Ergebnis-Fenster direkt per „⏱ Timer“ erreichbar (z. B. Redezeit für den Gewinner)
- **🎰 Slotmaschine und Roulette-Tisch**: dieselben Einträge als Walzen oder auf einem grünen
  Tisch anzeigen. Beide Ansichten verwenden dieselbe Gewinnerauswahl und dieselben Admin-Regeln
  wie das Rad. Die gewählte Ansicht bleibt in diesem Browser gespeichert.
- **🏆 Mehrere Gewinner**: z. B. 3 Referenten auf einmal ziehen; Gewinner verlassen die Liste,
  am Ende gibt es eine nummerierte Liste (kopierbar, „Alle zurück ins Rad“).
- **📊 Statistik**: wie oft wurde wer gezogen (mit Balken), Anzahl Drehungen,
  Verlauf als CSV (für Excel) herunterladen.
- **⚙️ Einstellungen**:
  - Drehdauer kurz / normal / lang
  - fünf Farbschemen fürs Rad (Bunt, Pastell, Neon, Ozean, Herbst)
  - Darstellung Dunkel / Hell / wie das System
  - Gewinner automatisch entfernen, Konfetti und Töne an/aus
  - eigener Text über dem Ergebnis (z. B. „Dran ist:“) und in der Radmitte (z. B. „LOS!“)
  - Gewinner vorlesen (Sprachausgabe des Browsers)
  - denselben Eintrag nicht zweimal hintereinander ziehen
- **⋯ Menü bei den Einträgen**:
  - Liste aus einer `.txt`- oder `.csv`-Datei laden (bei CSV zählt die erste Spalte)
  - Liste als `.txt` speichern
  - Link zum Teilen kopieren: die Liste steckt im Link, andere bekommen beim Öffnen dieselbe Liste
  - Zahlenreihe einfügen, z. B. `1-30` für Schülernummern
  - Doppelte entfernen, alle löschen
- **❔ Hilfe** mit Tastenkürzeln und **Datenschutz**-Hinweis (auch unten in der Fußzeile)
- **📱 Als App installierbar**: eigenes Icon auf dem Home-Bildschirm, startet ohne Browserleiste
  und funktioniert auch offline (siehe unten).

### Tastenkürzel

| Taste | Aktion |
| --- | --- |
| Leertaste / Enter | Gewählte Spielansicht starten |
| F | Vollbild an/aus |
| S | Ton an/aus |
| T | Werkzeuge (Timer, Würfel, Münze, Zahl) |
| H oder ? | Hilfe |
| Esc | Fenster schließen |

> Die Kürzel benutzen absichtlich keinen Buchstaben aus „admin“, damit das Geheimwort nichts auslöst.

### Online stellen (optional)

Damit geteilte Links auch auf anderen Geräten funktionieren, muss die Seite im Netz liegen –
am einfachsten mit **Coolify** (siehe [Deployment mit Coolify](#deployment-mit-coolify)).
Normale Listen- und Übertragungs-Links enthalten keine Admin-Einstellungen. Nur ein ausdrücklich
im Admin-Bereich erstellter Schummel-Link nimmt die Regeln mit.

### Als App installieren

- **iPad/iPhone (Safari):** Teilen-Knopf → „Zum Home-Bildschirm“
- **Android/Chrome/Edge:** Menü → „App installieren“ bzw. Symbol in der Adressleiste

Offline-Betrieb und Installation brauchen **HTTPS** (bei einer `http://`-Adresse funktioniert die
Seite normal, nur eben nicht offline). In Coolify also eine `https://`-Domain eintragen.
Der Service Worker (`sw.js`) holt zuerst die Version vom Server und greift nur ohne Netz auf die
gespeicherte Kopie zurück. Beim Docker-Build bekommen Skripte, Styles und der Service Worker
eine aus den Dateien berechnete Versionsnummer in der URL. So lädt der Browser nach einem
Deployment neue Dateien auch dann, wenn ein vorgeschalteter Cache ältere URLs noch aufbewahrt.

## Seriös veröffentlichen – Checkliste

Die Seite bringt alles mit, was ein ordentliches Webangebot ausmacht: Logo und Markenauftritt,
Erklärtexte und FAQ, Fußzeile mit **Impressum** (`impressum.html`) und **Datenschutzerklärung**
(`datenschutz.html`), eine Link-Vorschau für WhatsApp, Teams & Co. (`icons/vorschau.jpg`),
keine Cookies, kein Tracking, keine Drittanbieter und gekürzte IP-Adressen in den Server-Logs.

Vor dem Veröffentlichen erledigen:

1. **Eigene Domain mit HTTPS** in Coolify eintragen (z. B. `https://gluecksrad.deine-domain.de`)
   statt der `sslip.io`-Adresse. Erst dann gibt es das Schloss-Symbol, die App-Installation und
   Offline-Betrieb.
2. **Impressum ausfüllen:** alle rot gestrichelten `[Platzhalter]` in `impressum.html` durch deine
   echten Angaben ersetzen. Wer eine Seite öffentlich anbietet, braucht in Deutschland in der Regel
   ein Impressum (§ 5 DDG) – mit echten Daten.
3. **Datenschutzerklärung ausfüllen:** Platzhalter in `datenschutz.html` ersetzen (Verantwortlicher,
   Hoster, Löschfrist der Logs, Stand) und prüfen, ob alles zu deinem Betrieb passt.
   Die Vorlage beschreibt genau, was diese Seite tut – sie ersetzt aber keine Rechtsberatung.
4. Optional: Log-Aufbewahrung am Server passend zur Datenschutzerklärung begrenzen
   (Docker-Logrotation bzw. Coolify-Einstellungen).

**Bewusst nicht enthalten** sind Prüfsiegel, Zertifikate, „garantiert fair“-Aussagen, Bewertungen,
Nutzerzahlen oder ein fremder Anbietername. Solche Angaben wären erfunden – zumal sich das Rad über
den Admin-Bereich steuern lässt – und können als irreführende Werbung rechtlich Ärger machen.

Die Link-Vorschau braucht absolute Adressen: `index.html` enthält dafür den Platzhalter
`%BASIS_URL%`, den nginx beim Ausliefern automatisch durch die tatsächliche Adresse
(z. B. `https://gluecksrad.deine-domain.de`) ersetzt. Beim lokalen Öffnen der Datei bleibt er stehen –
das stört nicht.

## Deployment mit Coolify

Das Repository enthält ein fertiges `Dockerfile`: nginx liefert die Seiten, `css/`, `js/` und `icons/` aus
(keine Tests, kein README). Im selben Container läuft der Live-Server für die Handy-Fernbedienung
(`server/live.js`, Node.js, nur intern auf Port 3101). HTTPS übernimmt Coolify. Es muss nichts
zusätzlich eingerichtet werden – weiterhin nur Port `3100`.

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

- `Cache-Control: no-cache` + ETag für HTML. Skripte und Styles erhalten beim Build versionierte
  URLs, damit ein vorgeschalteter Cache alte Dateien nicht mit neuem HTML kombiniert.
- gzip für HTML, CSS, JS und SVG
- Server-Logs mit gekürzter IP-Adresse (`203.0.113.0` statt `203.0.113.42`) und ohne Referrer
- ersetzt `%BASIS_URL%` im HTML durch die echte Adresse (für Link-Vorschau und Canonical-Link)
- Sicherheits-Header, u. a. eine strenge Content-Security-Policy (nur eigene Skripte und Styles)
- `/healthz` antwortet mit `ok`, versteckte Dateien (`.git` usw.) liefern 404
- leitet `/api/live/` an den Live-Server weiter – ungepuffert (für Server-Sent Events), mit langen
  Zeitlimits und **ohne Log-Eintrag**, weil der Raum-Schlüssel in der Adresse steht
- startet den Live-Server vor nginx (`deploy/live-server.sh` → `/docker-entrypoint.d/`), als Benutzer
  `nginx`, und startet ihn bei einem Absturz neu. Der Docker-`HEALTHCHECK` prüft beide.

### Lokal testen

```bash
docker build -t gluecksrad .
docker run --rm -p 8080:3100 gluecksrad
# dann http://localhost:8080 öffnen
```

### Gut zu wissen

- **Neue Adresse = neuer Speicher.** Der Browser speichert pro Adresse. Einträge, gespeicherte
  Räder und Admin-Einstellungen (inkl. PIN) aus der lokalen `index.html` sind online also nicht da.
  Ein Schummel-Link kann das aktuelle Rad und die Admin-Regeln auf die neue Adresse übertragen;
  die PIN wird dabei nicht übertragen.
- **Der Admin-Bereich ist Teil der Seite.** Wer die Adresse kennt, kann ihn im *eigenen* Browser
  öffnen (Standard-PIN `1234`) und im Quelltext sehen, dass es ihn gibt. Deine Einstellungen
  sind dabei nicht erreichbar – sie liegen nur in deinem Browser. Deine Fernbedienung erreicht nur,
  wer deinen Handy-Link kennt.
- **Hinter Cloudflare o. Ä.** funktioniert die Fernbedienung ebenfalls: Der Live-Server schickt alle
  20 Sekunden ein Lebenszeichen, damit Proxys die Verbindung nicht schließen, und verbietet
  Zwischenspeichern und Umformen (`Cache-Control: no-cache, no-transform`).

## Admin-Bereich

### Öffnen (unauffällig)

- irgendwo auf der Seite **`admin` tippen** (nicht im Textfeld), oder
- **5× schnell auf „Glücksrad“** oben links tippen bzw. klicken (Titel oder Logo, innerhalb von 3 s), oder
- am Handy/Tablet den **Finger gut eine Sekunde auf „Glücksrad“ halten**, oder
- **`index.html#admin`** aufrufen

Damit das auf dem Handy zuverlässig klappt, zoomt die Seite bei schnellem Doppeltippen nicht mehr
heran (Zoomen mit zwei Fingern geht weiterhin), und Eingabefelder sind auf Touch-Geräten mindestens
16 px groß – sonst zoomt Safari auf dem iPhone beim Antippen heran.

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
- **Schummel-Link kopieren**: erstellt einen Link aus aktuellem Titel, Einträgen in ihrer Reihenfolge,
  allen Spiel-Einstellungen, Ton, Aktiv-Schalter, Gewichten, festgelegtem Gewinner und der
  geplanten Gewinner-Reihenfolge einschließlich „Nur einmal“. Wer ihn öffnet, bekommt das alles
  automatisch in seinen Browser übernommen. Die PIN, gespeicherte Räder und der Verlauf bleiben lokal. Die
  Regeln gelten beim Empfänger danach auch für weitere Drehungen. Ein einmalig festgelegter
  Gewinner wird dort nach dem ersten Dreh verbraucht.
- **Chance / Simuliert**: zeigt die echten Wahrscheinlichkeiten. „1000× simulieren“
  probiert sie aus, ohne dass das Rad sich dreht.

Neue Links verwenden die kurze, neutrale Form `#r=…`; bisherige `#schummel=…`-Links
funktionieren weiterhin. Schummel-Links funktionieren über verschiedene Geräte nur mit einer
online erreichbaren Webadresse. Die Regeln stehen weiterhin kodiert im Link und sind für technisch
versierte Empfänger lesbar und veränderbar. Der Server speichert keine Räder, kann den Link also nicht geheim halten,
signieren oder durch einen beliebig kurzen Code ersetzen.
Normale Listen- und Sicherungs-Links übernehmen weiterhin keine Admin-Regeln.

### 📱 Handy als Fernbedienung (live steuern)

Rechner (oder Beamer) zeigt das Rad, das Handy steuert es – über eine eigene Handy-Oberfläche:

1. Am Rechner den Admin-Bereich öffnen → **„📱 Handy verbinden“**.
2. Den angezeigten **QR-Code** mit der Handy-Kamera scannen (oder den Link aufs Handy schicken).
3. Admin-Bereich schließen. Das Handy zeigt oben **„● Live“**, sobald beide verbunden sind.

Auf dem Handy (`fernbedienung.html`):

| Bereich | Was er tut |
| --- | --- |
| **Live-Karte** | zeigt, was das Rad gerade tut: bereit, dreht (mit Fortschritt und Ziel „→ 7b“), Ergebnis. Knopf **„🎡 Rad drehen“** dreht das Rad am Rechner (ein offenes Ergebnis wird dabei geschlossen), „Ergebnis schließen“ schließt das Ergebnis-Fenster. |
| **Steuerung aktiv** | Hauptschalter (= „Manipulation aktiv“ im Admin-Bereich) |
| **🕶 Blind-Modus** | siehe unten – bedienbar, ohne aufs Handy zu schauen; gedreht wird nur am Rechner |
| **Nächstes Ergebnis** | Namen antippen = der nächste Dreh landet dort (mit „immer“ bei jedem Dreh). Nochmal antippen oder „🎲 Zufall“ hebt es auf. Mit **„⚡ sofort“** dreht derselbe Tipp auch gleich. |
| **Reihenfolge** | vorab festlegen, wer nacheinander drankommt (auch „🎲 Zufall“ dazwischen) – siehe unten |
| **Chancen** | − / + pro Eintrag (0–10×), 🚫 = nie, „alle normal“; daneben die echte Gewinnchance |
| **Zuletzt gezogen** | die letzten Ergebnisse |

**Reihenfolge – im Moment selbst nichts tippen:** Vorher in Ruhe z. B. „7b → 🎲 Zufall → 5a“
antippen. Jeder Dreh nimmt dann automatisch den nächsten Eintrag – egal, ob am Rechner (Knopf,
Leertaste) oder vom Handy gedreht wird; auch bei mehreren Gewinnern zählt jede Ziehung einzeln.
Ein festgelegtes „Nächstes Ergebnis“ hat Vorrang und verbraucht keinen Eintrag der Reihenfolge.
Steht ein Eintrag gerade nicht im Rad (z. B. schon gezogen und entfernt), wird er übersprungen.
Ist die Liste leer, gelten wieder die Chancen. Mit **„Jede Person nur einmal“** kann niemand
doppelt in die Reihenfolge (beim Einschalten fallen vorhandene Doppelte weg, „🎲 Zufall“ darf
mehrfach vorkommen); ausgeschaltet darf dieselbe Person mehrmals drankommen. Die Reihenfolge und
der Schalter lassen sich auch im Admin-Bereich am Rechner bearbeiten.

**🕶 Blind-Modus – ohne hinzusehen:** Ein fast schwarzer Vollbildschirm mit vier großen Feldern
in den Ecken, die man mit dem Daumen ertasten kann. Welcher Name in welcher Ecke liegt, stellst du
unter „Ecken belegen“ ein (Standard: die ersten vier Einträge; „🎲 Zufall“ = nach Reihenfolge bzw.
Chancen). Die Ecken passen sich an: Wird jemand aus dem Rad entfernt, rückt **nur in seiner Ecke**
der nächste freie Name nach – die anderen Ecken bleiben, wo sie sind, damit man weiter blind tippen
kann. Kommt die Person zurück ins Rad, bekommt sie ihre Ecke wieder. Im Auswahlfeld steht dann z. B.
„6b ↻ statt 5b“.

| Geste | Wirkung |
| --- | --- |
| Ecke antippen | festlegen, wo das Rad landet – dreht es schon, wird umgelenkt |
| nach oben wischen | Festlegung aufheben (dann gelten Reihenfolge bzw. Chancen) |
| nach unten wischen | Blind-Modus verlassen |

Der Blind-Modus **startet das Rad nie selbst**: Gedreht wird immer am Rechner (Knopf, Leertaste,
Mitte des Rads) – so sieht es für alle echt aus. Die festgelegte Ecke hat einen schwachen Rahmen;
nach dem Dreh ist die Festlegung verbraucht (außer „immer“ ist an).

Rückmeldung: Auf Android vibriert das Handy 1–4 Mal je nach Ecke, beim Aufheben zweimal etwas länger,
bei einem Fehler (Rechner nicht verbunden, zu spät zum Umlenken) einmal lang. Das iPhone lässt Webseiten nicht vibrieren; dort gibt
es ab iOS 18 nur ein kurzes Klacken als Bestätigung (ohne Muster). Der Punkt in der Mitte zeigt den
Zustand: grün = bereit, gelb = dreht, rot = keine Verbindung.

**Live umlenken:** Tippst du einen Namen an, *während* sich das Rad dreht, fährt es ohne Ruck dorthin –
es bremst nur etwas früher oder später. Das Handy zählt herunter, wie lange das noch sicher klappt
(„Live umlenken: noch 2,1 s sicher“). Kurz vor dem Stillstand gelingt es nur noch, wenn das Ziel nah
genug liegt; sonst meldet das Handy „Zu spät“ und die Festlegung gilt für den nächsten Dreh. Dasselbe
gilt für Änderungen im Admin-Bereich oder in einem zweiten Fenster: Wird das Ziel gerade gesperrt oder
ein anderer Gewinner festgelegt, lenkt das Rad um.

Das klappt in allen drei Ansichten: Bei der **Slotmaschine** bis kurz bevor die erste Walze stoppt
(vorher zeigen alle Walzen nur zufällige Namen), beim **Roulette** läuft die Kugel mit gleichem Tempo
ein paar Felder mehr oder weniger. Die Knöpfe am Handy heißen passend zur Ansicht am Rechner.

Gut zu wissen:

- Auf der Hauptseite ist nichts davon zu sehen – kein Symbol, keine Meldung.
- Der Handy-Link bleibt gültig (auch nach Neuladen oder Neustart von Rechner und Server), bis du im
  Admin-Bereich **„↻ Neuer Link“** oder **„Beenden“** wählst. Das Handy merkt sich den Link; es kann die
  Seite auch zum Home-Bildschirm hinzufügen.
- Sind am Rechner mehrere Tabs mit dem Rad offen, verbindet sich nur einer (die anderen übernehmen,
  wenn er geschlossen wird). So dreht ein Befehl nie zwei Räder.
- Es können mehrere Handys gleichzeitig verbunden sein.
- Der Handy-Link ist der Schlüssel: Wer ihn kennt, kann das Rad steuern. Nicht weitergeben – im Zweifel
  „↻ Neuer Link“.
- Funktioniert nur über eine Webadresse mit Live-Server (Docker-Image oder `npm start`), nicht beim
  direkten Öffnen von `index.html`. Das zeigt der Admin-Bereich dann auch an.

**Technik:** Rechner und Handy verbinden sich per Server-Sent Events mit dem Live-Server
(`server/live.js`) und treffen sich in einem „Raum“, dessen zufälliger Schlüssel (144 Bit) im Handy-Link
steckt. Das Handy schickt Befehle, der Rechner führt sie aus und meldet seinen Stand zurück. Der Server
reicht nur weiter, speichert nichts auf der Festplatte und vergisst einen Raum 10 Minuten nach dem
Trennen des letzten Geräts.

Die Regeln hängen am **Namen** des Eintrags (Groß-/Kleinschreibung egal). Wenn du also „7b“
sperrst, aus dem Rad löschst und später wieder einträgst, ist sie weiterhin gesperrt.

### Zweites Fenster (Beamer + Laptop)

Öffne die Hauptseite auf dem Beamer und `index.html#admin` in einem zweiten Fenster auf dem Laptop.
Beide greifen auf denselben Speicher zu: Änderungen im Admin gelten sofort – sogar für eine laufende
Drehung –, ohne dass auf dem Beamer etwas zu sehen ist. Bequemer geht es mit dem Handy als
Fernbedienung (siehe oben).

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
- **Mehrere Gewinner** halten sich an alle Regeln: Gesperrte kommen nie dran, ein einmalig
  festgelegter Gewinner wird als Erster gezogen, ein dauerhaft festgelegter ebenfalls
  (danach ist er aus dem Rad und die Gewichte gelten für den Rest).
- **„Nicht zweimal hintereinander“** (öffentliche Einstellung) wirkt zusätzlich zu den Gewichten.
  Ein festgelegter Gewinner und Admin-Sperren haben Vorrang. Die Chancen-Spalte im Admin-Bereich
  rechnet das mit ein.
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
index.html           Seite mit Rad, Einträgen, Info-Bereich/FAQ und allen Dialogen
fernbedienung.html   Handy-Fernbedienung (Link/QR-Code aus dem Admin-Bereich)
impressum.html       Impressum (Platzhalter ausfüllen!)
datenschutz.html     Datenschutzerklärung (Platzhalter ausfüllen!)
css/style.css        Aussehen (Dunkel/Hell über CSS-Variablen)
css/fernbedienung.css  zusätzliches Aussehen der Handy-Fernbedienung
js/design.js         setzt Hell/Dunkel vor dem ersten Zeichnen (alle Seiten)
js/paket.js          Übertragungs- und Schummel-Links verpacken und prüfen, ohne DOM, getestet
js/logik.js          Reine Rechenlogik (Gewichtung, Auswahl, Winkel, Umlenken), ohne DOM, getestet
js/qr.js             QR-Code-Erzeuger für den Handy-Link, ohne Bibliothek, getestet
js/speicher.js       Laden/Speichern im localStorage
js/rad.js            Zeichnen und Animieren des Rads (Canvas), Farbschemen, Umlenken
js/effekte.js        Ton (Web Audio) und Konfetti
js/admin.js          Admin-Bereich
js/app.js            Kern der Hauptseite: Drehen, Ergebnis, Verlauf, Dialoge, Tastatur
js/live.js           Fernbedienung, Seite am Rechner: Handy-Link, Befehle ausführen, Stand senden
js/fernbedienung.js  Fernbedienung, Seite am Handy
js/einstellungen.js  Dialog „Einstellungen“
js/listen.js         Meine Räder, Datei laden/speichern, Teilen-Link
js/teams.js          Teams bilden
js/statistik.js      Statistik und CSV-Export
js/werkzeuge.js      Timer, Würfel, Münzwurf, Zufallszahl
js/pwa.js            meldet den Service Worker an
sw.js                Service Worker (Offline-Betrieb)
manifest.webmanifest App-Manifest (Name, Farben, Icons)
icons/               App-Icons (SVG-Quellen + daraus erzeugte PNGs), Link-Vorschau vorschau.jpg
server/live.js       Live-Server für die Fernbedienung (Node.js, ohne Pakete); npm start
tests/               Tests für Logik, Links, QR-Code und Live-Server
Dockerfile           Container-Image (nginx + Live-Server) für Coolify & Co.
deploy/nginx.conf    Webserver-Konfiguration (Caching, gzip, Sicherheits-Header, /healthz, /api/live/)
deploy/live-server.sh  startet den Live-Server im Container vor nginx
.dockerignore        hält Tests, README usw. aus dem Image heraus
```

## Tests

Benötigt Node.js ≥ 18 (keine Installation von Paketen nötig):

```bash
npm test
```
