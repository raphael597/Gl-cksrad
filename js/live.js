/*
 * live.js – Handy als Fernbedienung, Seite am Rechner/Beamer (die „Anzeige“).
 *
 * Im Admin-Bereich wird ein Handy-Link mit QR-Code erzeugt. Das Handy öffnet damit
 * fernbedienung.html und schickt über den Live-Server (server/live.js) Befehle:
 * Regeln ändern, Rad drehen, Ergebnis schließen. Diese Seite führt sie aus und
 * meldet ihren Stand zurück. Auf der Hauptseite ist davon nichts zu sehen.
 *
 * Der Raum-Schlüssel liegt im localStorage (gluecksrad.live), damit der Handy-Link
 * nach dem Neuladen weiter funktioniert. Sind mehrere Tabs offen, verbindet sich nur
 * einer (Web Locks) – sonst würde ein Dreh-Befehl zwei Räder drehen.
 */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const SCHLUESSEL = 'gluecksrad.live';
  const SPERRE = 'gluecksrad-live-anzeige';
  const MAX_NAME = 100;
  const GERAET_MUSTER = /^[A-Za-z0-9_-]{1,40}$/;

  let raum = raumLesen();
  let quelle = null; // EventSource
  let status = 'aus'; // aus | verbinde | online | fehler | datei | anderer-tab
  let praesenz = { anzeigen: 0, steuerungen: 0 };
  let wiederTimer = null;
  let wiederVersuch = 0;
  let sendeTimer = null;
  let sendetGerade = false;
  let nochmalSenden = false;
  let sperreAbbrechen = null; // AbortController für die wartende Web-Lock-Anfrage
  let sperreFreigeben = null; // beendet die gehaltene Web-Lock-Anfrage
  const quittungen = {}; // Gerät → höchste ausgeführte Befehlsnummer
  let antwort = null; // { geraet, nr, text, art } – Rückmeldung an ein Handy

  const istObjekt = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

  // ---------- Raum-Schlüssel ----------

  function raumLesen() {
    try {
      const roh = JSON.parse(localStorage.getItem(SCHLUESSEL) || 'null');
      return roh && typeof roh.raum === 'string' && /^[A-Za-z0-9_-]{22,64}$/.test(roh.raum) ? roh.raum : '';
    } catch (e) {
      return '';
    }
  }

  function raumSpeichern(wert) {
    try {
      if (wert) localStorage.setItem(SCHLUESSEL, JSON.stringify({ raum: wert }));
      else localStorage.removeItem(SCHLUESSEL);
    } catch (e) {
      /* privater Modus: gilt dann nur bis zum Neuladen */
    }
  }

  /** 144 Bit Zufall, linktauglich (24 Zeichen). */
  function neuerRaum() {
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
  }

  const handyLink = () => new URL(`fernbedienung.html#k=${raum}`, location.href).href;

  // ---------- Verbindung ----------

  /** Nur ein Tab pro Browser verbindet sich; die anderen warten im Hintergrund. */
  function uebernehmen() {
    if (!raum) return;
    if (location.protocol === 'file:') {
      statusSetzen('datei');
      return;
    }
    if (!navigator.locks || typeof AbortController === 'undefined') {
      verbinden();
      return;
    }
    if (sperreFreigeben) {
      verbinden(); // Sperre schon da, z. B. neuer Link
      return;
    }
    if (sperreAbbrechen) return; // Anfrage läuft schon
    sperreAbbrechen = new AbortController();
    statusSetzen('verbinde');
    const warten = setTimeout(() => sperreAbbrechen && statusSetzen('anderer-tab'), 600);
    navigator.locks
      .request(SPERRE, { signal: sperreAbbrechen.signal }, () => {
        clearTimeout(warten);
        sperreAbbrechen = null;
        if (!raum) return undefined; // inzwischen beendet
        return new Promise((los) => {
          sperreFreigeben = los;
          verbinden();
        });
      })
      .catch(() => {
        clearTimeout(warten);
        sperreAbbrechen = null;
      });
  }

  function verbinden() {
    trennen();
    if (!raum) return;
    statusSetzen('verbinde');
    const es = new EventSource(`api/live/${raum}/ereignisse?rolle=anzeige`);
    quelle = es;

    es.addEventListener('hallo', (e) => {
      wiederVersuch = 0;
      praesenz = lesen(e.data)?.praesenz || praesenz;
      statusSetzen('online');
      zustandSenden();
    });
    es.addEventListener('praesenz', (e) => {
      const neu = lesen(e.data);
      if (!neu) return;
      const neuesHandy = neu.steuerungen > praesenz.steuerungen;
      praesenz = neu;
      oberflaeche();
      // Ein neues Handy bekommt sofort einen frischen Stand (z. B. Restzeit der Drehung).
      if (neuesHandy) zustandSenden();
    });
    es.addEventListener('befehl', (e) => {
      const befehl = lesen(e.data);
      if (befehl) befehlAusfuehren(befehl);
    });
    es.onerror = () => {
      if (quelle !== es) return;
      if (es.readyState === EventSource.CLOSED) {
        // Server antwortet mit Fehler oder fehlt ganz – später selbst neu versuchen.
        statusSetzen('fehler');
        clearTimeout(wiederTimer);
        wiederTimer = setTimeout(verbinden, Math.min(60000, 2000 * 2 ** wiederVersuch++));
      } else {
        statusSetzen('verbinde'); // der Browser verbindet sich selbst neu
      }
    };
  }

  function trennen() {
    clearTimeout(wiederTimer);
    if (quelle) quelle.close();
    quelle = null;
    praesenz = { anzeigen: 0, steuerungen: 0 };
  }

  function beenden() {
    raum = '';
    raumSpeichern('');
    trennen();
    if (sperreAbbrechen) sperreAbbrechen.abort();
    if (sperreFreigeben) sperreFreigeben();
    sperreAbbrechen = null;
    sperreFreigeben = null;
    statusSetzen('aus');
  }

  function lesen(text) {
    try {
      const wert = JSON.parse(text);
      return istObjekt(wert) ? wert : null;
    } catch (e) {
      return null;
    }
  }

  // ---------- Stand an die Handys senden ----------

  function stand() {
    const daten = App.daten;
    const admin = Speicher.ladeAdmin();
    // Nur Regeln für Einträge im Rad – wie beim Schummel-Link. Die PIN nie.
    const namen = new Set(daten.eintraege.map(Logik.schluessel));
    const gewichte = Object.fromEntries(Object.entries(admin.gewichte || {}).filter(([k]) => namen.has(k)));
    return {
      v: 1,
      titel: daten.titel || '',
      eintraege: daten.eintraege,
      admin: {
        aktiv: !!admin.aktiv,
        gewichte,
        naechster: typeof admin.naechster === 'string' ? admin.naechster : '',
        naechsterDauerhaft: !!admin.naechsterDauerhaft,
      },
      ...App.liveStand(), // dreh, serie, ergebnis, optionen
      anzahlZiehen: Number(daten.einstellungen.anzahlZiehen) || 1,
      verlauf: daten.verlauf.slice(0, 8),
      quittungen,
      antwort,
    };
  }

  /** Stand bündeln: viele Änderungen kurz hintereinander = eine Nachricht. */
  function zustandPlanen() {
    if (status !== 'online') return;
    clearTimeout(sendeTimer);
    sendeTimer = setTimeout(zustandSenden, 60);
  }

  /** Nacheinander senden, damit beim Handy nie ein älterer Stand einen neueren überholt. */
  async function zustandSenden() {
    clearTimeout(sendeTimer);
    if (!raum || status !== 'online') return;
    if (sendetGerade) {
      nochmalSenden = true;
      return;
    }
    sendetGerade = true;
    try {
      const antwort = await fetch(`api/live/${raum}/zustand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stand()),
        cache: 'no-store',
      });
      // Gebremst (zu viele Nachrichten): gleich nochmal, damit das Handy den letzten Stand bekommt.
      if (antwort.status === 429) setTimeout(zustandPlanen, 1000);
    } catch (e) {
      /* beim nächsten Ereignis neu */
    }
    sendetGerade = false;
    if (nochmalSenden) {
      nochmalSenden = false;
      zustandSenden();
    }
  }

  document.addEventListener('radzustand', zustandPlanen);

  // ---------- Befehle vom Handy ----------

  async function befehlAusfuehren(befehl) {
    const geraet = typeof befehl.geraet === 'string' && GERAET_MUSTER.test(befehl.geraet) ? befehl.geraet : '';
    const nr = Number.isSafeInteger(befehl.nr) && befehl.nr > 0 ? befehl.nr : 0;
    let meldung = null;

    if (befehl.typ === 'regeln') {
      meldung = regelnAnwenden(befehl.aenderung);
    } else if (befehl.typ === 'drehen') {
      const text = await App.fernDrehen();
      if (text) meldung = { text, art: 'fehler' };
    } else if (befehl.typ === 'weiter') {
      App.ergebnisSchliessen();
    } else {
      return;
    }

    if (geraet && nr) {
      quittungen[geraet] = Math.max(quittungen[geraet] || 0, nr);
      const geraete = Object.keys(quittungen);
      if (geraete.length > 8) delete quittungen[geraete[0]];
      if (meldung) antwort = { geraet, nr, ...meldung };
    }
    zustandSenden();
  }

  /** Geänderte Regeln streng prüfen und wie im Admin-Bereich speichern. */
  function regelnAnwenden(aenderung) {
    if (!istObjekt(aenderung)) return null;
    const admin = Speicher.ladeAdmin();
    if (typeof aenderung.aktiv === 'boolean') admin.aktiv = aenderung.aktiv;
    if (typeof aenderung.naechster === 'string') admin.naechster = aenderung.naechster.trim().slice(0, MAX_NAME);
    if (typeof aenderung.naechsterDauerhaft === 'boolean') admin.naechsterDauerhaft = aenderung.naechsterDauerhaft;
    if (aenderung.alleNormal === true) admin.gewichte = {};
    if (istObjekt(aenderung.gewichte)) {
      const gewichte = Object.assign({}, admin.gewichte);
      for (const [name, wert] of Object.entries(aenderung.gewichte).slice(0, 500)) {
        const k = Logik.schluessel(name);
        if (!k || k.length > MAX_NAME || k === '__proto__' || !Number.isInteger(wert) || wert < 0 || wert > 10) continue;
        if (wert === 1) delete gewichte[k];
        else gewichte[k] = wert;
      }
      admin.gewichte = gewichte;
    }
    Speicher.speichereAdmin(admin);
    Admin.aktualisieren();

    const ergebnis = App.regelnGeaendert(); // lenkt eine laufende Drehung um
    if (ergebnis === 'umgelenkt') return { text: 'Umgelenkt ✓', art: 'ok' };
    if (ergebnis === 'zu-spaet') return { text: 'Zu spät für diesen Dreh – gilt ab dem nächsten.', art: 'hinweis' };
    return null;
  }

  // ---------- Oberfläche im Admin-Bereich ----------

  function statusSetzen(neu) {
    status = neu;
    oberflaeche();
  }

  function statusText() {
    switch (status) {
      case 'online': {
        const n = praesenz.steuerungen;
        if (n === 0) return ['warten', 'Bereit – warte auf das Handy …'];
        return ['verbunden', n === 1 ? 'Handy verbunden' : `${n} Handys verbunden`];
      }
      case 'fehler':
        return ['fehler', 'Live-Server nicht erreichbar. Die Fernbedienung braucht die Online-Version mit Live-Server (Docker bzw. npm start). Neuer Versuch läuft …'];
      case 'datei':
        return ['fehler', 'Funktioniert nur über die Webadresse, nicht beim direkten Öffnen der Datei.'];
      case 'anderer-tab':
        return ['warten', 'Die Verbindung läuft in einem anderen Tab dieses Browsers.'];
      default:
        return ['warten', 'Verbinde …'];
    }
  }

  let gezeichneterLink = '';

  function oberflaeche() {
    $('#live-aus').hidden = !!raum;
    $('#live-an').hidden = !raum;
    if (!raum) return;
    const [art, text] = statusText();
    const statusEl = $('#live-status');
    statusEl.textContent = text;
    statusEl.dataset.status = art;

    const link = handyLink();
    if (link === gezeichneterLink) return;
    gezeichneterLink = link;
    $('#live-link').value = link;
    qrZeichnen(link);
  }

  function qrZeichnen(text) {
    const huelle = $('#live-qr');
    huelle.textContent = '';
    let qr;
    try {
      qr = QR.erzeugen(text);
    } catch (e) {
      return; // sehr lange Adresse: dann eben nur der Link
    }
    const ns = 'http://www.w3.org/2000/svg';
    const groesse = qr.groesse + 8; // 4 Module Ruhezone rundum
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${groesse} ${groesse}`);
    svg.setAttribute('shape-rendering', 'crispEdges');
    const pfad = document.createElementNS(ns, 'path');
    pfad.setAttribute('d', QR.svgPfad(qr, 4));
    svg.appendChild(pfad);
    huelle.appendChild(svg);
  }

  $('#live-starten').addEventListener('click', () => {
    raum = neuerRaum();
    raumSpeichern(raum);
    uebernehmen();
    oberflaeche();
  });

  $('#live-neu').addEventListener('click', () => {
    if (!confirm('Neuen Handy-Link erzeugen? Der bisherige Link funktioniert dann nicht mehr.')) return;
    raum = neuerRaum();
    raumSpeichern(raum);
    uebernehmen();
    oberflaeche();
  });

  $('#live-beenden').addEventListener('click', () => {
    if (!confirm('Fernbedienung beenden? Der Handy-Link funktioniert dann nicht mehr.')) return;
    beenden();
  });

  $('#live-kopieren').addEventListener('click', async () => {
    const feld = $('#live-link');
    feld.focus();
    feld.select();
    let kopiert = false;
    try {
      kopiert = document.execCommand('copy');
    } catch (e) {
      /* unten weiter */
    }
    if (!kopiert) kopiert = await App.kopieren(feld.value);
    App.melden(kopiert ? 'Handy-Link kopiert' : 'Link oben markieren und kopieren');
  });

  // Anderer Tab hat den Link erzeugt, erneuert oder beendet.
  window.addEventListener('storage', (e) => {
    if (e.key !== SCHLUESSEL && e.key !== null) return;
    const neu = raumLesen();
    if (neu === raum) return;
    if (!neu) {
      beenden();
      return;
    }
    raum = neu;
    uebernehmen();
    oberflaeche();
  });

  // ---------- Start ----------

  oberflaeche();
  if (raum) uebernehmen();
})();
