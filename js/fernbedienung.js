/*
 * fernbedienung.js – das Handy als Fernbedienung (fernbedienung.html).
 *
 * Verbindet sich über den Live-Server (server/live.js) mit dem Rad am Rechner
 * (js/live.js). Zeigt live, was das Rad tut, und schickt Befehle: nächstes Ergebnis
 * festlegen, Chancen ändern, drehen. Während sich das Rad dreht, lenkt ein Tipp auf
 * einen Namen es noch um – ohne Ruck (siehe Logik.umlenkPlan).
 *
 * Änderungen erscheinen sofort auf dem Handy und werden gebündelt gesendet; der
 * Stand vom Rad bestätigt sie. Alles vom Server wird geprüft und nur als Text angezeigt.
 */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const { schluessel } = Logik;
  const SPEICHER = 'gluecksrad.fernbedienung';
  const RAUM_MUSTER = /^[A-Za-z0-9_-]{22,64}$/;
  const MAX_EINTRAEGE = 500;

  const istObjekt = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

  // Beschriftungen je nach Ansicht am Rechner (Rad, Slotmaschine, Roulette)
  const ANSICHT = {
    rad: { start: '🎡 Rad drehen', nochmal: '🎡 Nochmal drehen', laeuft: 'Rad dreht …', knopf: 'Dreht …' },
    slot: { start: '🎰 Slotmaschine starten', nochmal: '🎰 Nochmal starten', laeuft: 'Walzen laufen …', knopf: 'Läuft …' },
    roulette: { start: '🔴 Roulette starten', nochmal: '🔴 Nochmal starten', laeuft: 'Kugel rollt …', knopf: 'Rollt …' },
  };
  const prozent = (x) => (x * 100).toLocaleString('de-DE', { maximumFractionDigits: x < 0.1 ? 1 : 0 }) + ' %';

  let raum = '';
  const geraet = geraetLesen();
  let nr = Date.now(); // Befehlsnummern steigen auch über ein Neuladen hinweg
  let quelle = null; // EventSource
  let verbindung = 'verbinde'; // verbinde | online | getrennt
  let praesenz = { anzeigen: 0, steuerungen: 0 };
  let stand = null; // letzter geprüfter Stand vom Rad
  let lokal = null; // Regeln mit eigenen, noch unbestätigten Änderungen
  let gesendetBis = 0; // Nummer der letzten gesendeten Regeländerung
  let letzteAntwort = nr; // ältere Rückmeldungen (vor dem Laden) nicht nochmal zeigen
  let warteschlange = null; // gebündelte Regeländerung, die noch raus muss
  let sendetGerade = false;
  let drehUhr = null; // { ende, gesamt, umlenkbarBis } in performance.now()-Zeit
  let uhrLaeuft = false;
  let wiederTimer = null;
  let wiederVersuch = 0;
  let bildschirmSperre = null;

  // ---------- Speicher (nur auf diesem Handy) ----------

  function speicherLesen() {
    try {
      const roh = JSON.parse(localStorage.getItem(SPEICHER) || '{}');
      return istObjekt(roh) ? roh : {};
    } catch (e) {
      return {};
    }
  }

  function speicherSchreiben(werte) {
    try {
      localStorage.setItem(SPEICHER, JSON.stringify(Object.assign(speicherLesen(), werte)));
    } catch (e) {
      /* privater Modus */
    }
  }

  function geraetLesen() {
    const vorhanden = speicherLesen().geraet;
    if (typeof vorhanden === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(vorhanden)) return vorhanden;
    const bytes = crypto.getRandomValues(new Uint8Array(9));
    const neu = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
    speicherSchreiben({ geraet: neu });
    return neu;
  }

  /** Raum-Schlüssel aus einem Link („…#k=…“) oder direkt eingegeben. */
  function raumAus(text) {
    const treffer = String(text || '').match(/#k=([A-Za-z0-9_-]{22,64})(?:$|[&\s])/);
    if (treffer) return treffer[1];
    const roh = String(text || '').trim();
    return RAUM_MUSTER.test(roh) ? roh : '';
  }

  // ---------- Kleinigkeiten ----------

  let meldungTimer = null;
  function melden(text) {
    const el = $('#meldung');
    const popover = typeof el.showPopover === 'function';
    el.textContent = text;
    clearTimeout(meldungTimer);
    if (popover) {
      if (el.matches(':popover-open')) el.hidePopover();
      el.showPopover();
    }
    requestAnimationFrame(() => el.classList.add('sichtbar'));
    meldungTimer = setTimeout(() => {
      el.classList.remove('sichtbar');
      meldungTimer = setTimeout(() => popover && el.matches(':popover-open') && el.hidePopover(), 250);
    }, 2600);
  }

  // Safari auf dem iPhone kann nicht vibrieren. Ein Schalter-Element (<input switch>)
  // löst beim Umschalten aber ein kurzes Klacken aus (iOS 18+) – nur ein Klacken, kein Muster.
  const haptik = document.createElement('label');
  haptik.className = 'fb-haptik';
  haptik.setAttribute('aria-hidden', 'true');
  haptik.innerHTML = '<input type="checkbox" switch tabindex="-1">';
  document.body.appendChild(haptik);

  /** Kurzes Signal: Zahl = Millisekunden, Liste = Muster (an, aus, an …). */
  function vibrieren(ms) {
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
      else haptik.click();
    } catch (e) {
      /* egal */
    }
  }

  /** Etwas hat nicht geklappt: ein langes Brummen, deutlich anders als die kurzen. */
  const fehlerSignal = () => vibrieren(350);

  /** Bildschirm anlassen, solange die Fernbedienung offen ist. */
  async function wachHalten() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible' || bildschirmSperre) return;
    try {
      bildschirmSperre = await navigator.wakeLock.request('screen');
      bildschirmSperre.addEventListener('release', () => (bildschirmSperre = null));
    } catch (e) {
      /* nicht erlaubt – dann eben nicht */
    }
  }

  // ---------- Stand vom Rad prüfen ----------

  const texte = (liste, max, laenge = 100) =>
    Array.isArray(liste) ? liste.filter((x) => typeof x === 'string').slice(0, max).map((x) => x.slice(0, laenge)) : [];
  const zahl = (x) => (Number.isFinite(x) && x >= 0 ? x : 0);

  function standPruefen(roh, ausZwischenspeicher) {
    if (!istObjekt(roh) || !Array.isArray(roh.eintraege)) return null;
    const a = istObjekt(roh.admin) ? roh.admin : {};
    const gewichte = {};
    if (istObjekt(a.gewichte)) {
      for (const [k, w] of Object.entries(a.gewichte)) if (Number.isInteger(w) && w >= 0 && w <= 10) gewichte[k] = w;
    }
    const d = roh.dreh;
    const e = roh.ergebnis;
    const antwort = roh.antwort;
    return {
      titel: typeof roh.titel === 'string' ? roh.titel.slice(0, 60) : '',
      eintraege: texte(roh.eintraege, MAX_EINTRAEGE),
      admin: {
        aktiv: a.aktiv === true,
        gewichte,
        naechster: typeof a.naechster === 'string' ? a.naechster.slice(0, 100) : '',
        naechsterDauerhaft: a.naechsterDauerhaft === true,
        reihenfolge: texte(a.reihenfolge, Logik.MAX_REIHENFOLGE),
      },
      // Ein zwischengespeicherter Stand kann alt sein – die Drehung darin nicht anzeigen.
      dreh: !ausZwischenspeicher && istObjekt(d) && typeof d.ziel === 'string'
        ? { ziel: d.ziel.slice(0, 100), restMs: zahl(d.restMs), gesamtMs: zahl(d.gesamtMs), umlenkbarMs: zahl(d.umlenkbarMs) }
        : null,
      serie: istObjekt(roh.serie) ? { gesamt: Math.min(10, zahl(roh.serie.gesamt)), gezogen: texte(roh.serie.gezogen, 10) } : null,
      ergebnis: istObjekt(e)
        ? typeof e.name === 'string' ? { name: e.name.slice(0, 100) } : { liste: texte(e.liste, 10) }
        : null,
      optionen: istObjekt(roh.optionen) ? { ausschliessen: texte(roh.optionen.ausschliessen, 5) } : {},
      anzahlZiehen: Math.min(10, zahl(roh.anzahlZiehen)) || 1,
      spielart: Object.prototype.hasOwnProperty.call(ANSICHT, roh.spielart) ? roh.spielart : 'rad',
      verlauf: Array.isArray(roh.verlauf)
        ? roh.verlauf.filter((v) => istObjekt(v) && typeof v.name === 'string' && Number.isFinite(v.zeit)).slice(0, 8)
        : [],
      quittung: istObjekt(roh.quittungen) && Object.prototype.hasOwnProperty.call(roh.quittungen, geraet) ? zahl(roh.quittungen[geraet]) : 0,
      antwort: istObjekt(antwort) && antwort.geraet === geraet && Number.isFinite(antwort.nr) && typeof antwort.text === 'string'
        ? { nr: antwort.nr, text: antwort.text.slice(0, 120), ok: antwort.art === 'ok' }
        : null,
    };
  }

  function standEmpfangen(roh, ausZwischenspeicher = false) {
    const neu = standPruefen(roh, ausZwischenspeicher);
    if (!neu) return;
    const vorher = stand;
    stand = neu;
    // Eigene Änderungen sind angekommen → ab jetzt gilt wieder der Stand vom Rad.
    if (neu.quittung >= gesendetBis && !warteschlange && !sendetGerade) lokal = null;
    if (neu.antwort && neu.antwort.nr > letzteAntwort) {
      letzteAntwort = neu.antwort.nr;
      melden(neu.antwort.text);
      if (!neu.antwort.ok) fehlerSignal();
    }
    if (neu.dreh) {
      const jetzt = performance.now();
      drehUhr = { ende: jetzt + neu.dreh.restMs, gesamt: Math.max(1, neu.dreh.gesamtMs), umlenkbarBis: jetzt + neu.dreh.umlenkbarMs };
      uhrStarten();
    } else {
      drehUhr = null;
    }
    if (neu.ergebnis && !(vorher && vorher.ergebnis)) vibrieren([40, 60, 40]);
    zeichnen();
  }

  // ---------- Verbindung ----------

  function lesen(text) {
    try {
      const wert = JSON.parse(text);
      return istObjekt(wert) ? wert : null;
    } catch (e) {
      return null;
    }
  }

  const praesenzPruefen = (p) => ({ anzeigen: zahl(p && p.anzeigen), steuerungen: zahl(p && p.steuerungen) });

  function verbinden() {
    clearTimeout(wiederTimer);
    if (quelle) quelle.close();
    verbindung = 'verbinde';
    zeichnen();
    const es = new EventSource(`api/live/${raum}/ereignisse?rolle=steuerung`);
    quelle = es;

    es.addEventListener('hallo', (e) => {
      const daten = lesen(e.data) || {};
      wiederVersuch = 0;
      verbindung = 'online';
      praesenz = praesenzPruefen(daten.praesenz);
      if (daten.zustand) standEmpfangen(daten.zustand, true);
      else zeichnen();
      wachHalten();
    });
    es.addEventListener('praesenz', (e) => {
      const daten = lesen(e.data);
      if (!daten) return;
      praesenz = praesenzPruefen(daten);
      if (praesenz.anzeigen === 0) drehUhr = null;
      zeichnen();
    });
    es.addEventListener('zustand', (e) => {
      const daten = lesen(e.data);
      if (daten) standEmpfangen(daten);
    });
    es.onerror = () => {
      if (quelle !== es) return;
      if (es.readyState === EventSource.CLOSED) {
        verbindung = 'getrennt';
        wiederTimer = setTimeout(verbinden, Math.min(30000, 1000 * 2 ** wiederVersuch++));
      } else {
        verbindung = 'verbinde';
      }
      zeichnen();
    };
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !raum) return;
    if (!quelle || quelle.readyState === EventSource.CLOSED) verbinden();
    wachHalten();
  });

  // ---------- Befehle senden ----------

  async function befehlSenden(befehl, meineNr = ++nr) {
    try {
      const antwort = await fetch(`api/live/${raum}/befehl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({}, befehl, { nr: meineNr, geraet })),
        cache: 'no-store',
      });
      if (antwort.ok) return true;
      melden(
        antwort.status === 409 ? 'Der Rechner ist nicht verbunden – ist das Glücksrad dort geöffnet?'
          : antwort.status === 429 ? 'Etwas langsamer, bitte.'
            : 'Befehl ist nicht angekommen.'
      );
    } catch (e) {
      melden('Keine Verbindung zum Server.');
    }
    return false;
  }

  /** Regeländerung wie am Rechner anwenden (für die sofortige Anzeige). */
  function regelnAnwenden(admin, a) {
    const neu = Object.assign({}, admin, { gewichte: Object.assign({}, admin.gewichte) });
    if (typeof a.aktiv === 'boolean') neu.aktiv = a.aktiv;
    if (typeof a.naechster === 'string') neu.naechster = a.naechster;
    if (typeof a.naechsterDauerhaft === 'boolean') neu.naechsterDauerhaft = a.naechsterDauerhaft;
    if (a.alleNormal) neu.gewichte = {};
    if (Array.isArray(a.reihenfolge)) neu.reihenfolge = Logik.reihenfolgeAendern(admin.reihenfolge, a.reihenfolge);
    if (a.gewichte) {
      for (const [k, w] of Object.entries(a.gewichte)) {
        if (w === 1) delete neu.gewichte[k];
        else neu.gewichte[k] = w;
      }
    }
    return neu;
  }

  /** Zwei Änderungen zu einer zusammenfassen (die spätere gewinnt). */
  function zusammenfuehren(alt, neu) {
    if (!alt) return Object.assign({}, neu);
    const ergebnis = Object.assign({}, alt, neu);
    if (neu.alleNormal) ergebnis.gewichte = neu.gewichte;
    else if (alt.gewichte || neu.gewichte) ergebnis.gewichte = Object.assign({}, alt.gewichte, neu.gewichte);
    if (!ergebnis.gewichte) delete ergebnis.gewichte;
    // Schritte der Reihenfolge hintereinander ausführen
    if (alt.reihenfolge || neu.reihenfolge) ergebnis.reihenfolge = (alt.reihenfolge || []).concat(neu.reihenfolge || []);
    return ergebnis;
  }

  function regelnAendern(aenderung) {
    if (!stand) return;
    lokal = regelnAnwenden(lokal || stand.admin, aenderung);
    zeichnen();
    warteschlange = zusammenfuehren(warteschlange, aenderung);
    abschicken();
  }

  /** Immer nur eine Änderung unterwegs; was dazwischen kommt, wird gebündelt. */
  async function abschicken() {
    if (sendetGerade || !warteschlange) return;
    const aenderung = warteschlange;
    warteschlange = null;
    sendetGerade = true;
    const meineNr = ++nr;
    gesendetBis = meineNr;
    const ok = await befehlSenden({ typ: 'regeln', aenderung }, meineNr);
    sendetGerade = false;
    if (!ok) {
      // Nicht angekommen: wieder den echten Stand vom Rad zeigen.
      warteschlange = null;
      lokal = null;
      zeichnen();
      return;
    }
    abschicken();
  }

  // ---------- Anzeige ----------

  const regeln = () => lokal || (stand && stand.admin) || { aktiv: false, gewichte: {}, naechster: '', naechsterDauerhaft: false, reihenfolge: [] };

  /** Einträge ohne Doppelte, in Rad-Reihenfolge. */
  function eindeutig(eintraege) {
    const gesehen = new Set();
    return eintraege.filter((name) => {
      const k = schluessel(name);
      if (gesehen.has(k)) return false;
      gesehen.add(k);
      return true;
    });
  }

  function chancenBerechnen(a) {
    const analyse = Logik.analyse(stand.eintraege, a, stand.optionen);
    const chance = {};
    stand.eintraege.forEach((name, i) => {
      const k = schluessel(name);
      chance[k] = (chance[k] || 0) + analyse.wahrscheinlichkeiten[i];
    });
    return { chance, analyse };
  }

  function zeichnen() {
    const mitLink = !!raum;
    $('#fb-ohne-link').hidden = mitLink;
    $('#fb-steuerung').hidden = !mitLink;
    verbindungZeichnen();
    if (!mitLink) return;

    const a = regeln();
    const namen = stand ? eindeutig(stand.eintraege) : [];
    const { chance, analyse } = stand
      ? chancenBerechnen(a)
      : { chance: {}, analyse: { modus: 'fair', quelle: '', reihenfolgePos: -1 } };
    const { modus } = analyse;

    $('#fb-rad-titel').textContent = stand && stand.titel ? stand.titel : 'Glücksrad';
    document.title = stand && stand.titel ? `Fernbedienung – ${stand.titel}` : 'Fernbedienung – Glücksrad';

    liveZeichnen(a, analyse);
    $('#fb-aktiv').checked = a.aktiv;
    $('#fb-dauerhaft').checked = a.naechsterDauerhaft;
    $('#fb-steuerung').classList.toggle('fb-inaktiv', !a.aktiv);
    const modusEl = $('#fb-modus');
    modusEl.textContent = modusText(analyse, a, namen);
    modusEl.dataset.modus = a.aktiv ? modus : 'fair';
    chipsZeichnen(namen, chance, a, analyse);
    reiheZeichnen(namen, a, analyse);
    gewichteZeichnen(namen, chance, a);
    verlaufZeichnen();
    eckenWahlZeichnen(namen);
    blindZeichnen(namen);
  }

  function verbindungZeichnen() {
    const el = $('#fb-verbindung');
    let art = 'verbinde';
    let text = 'Verbinde …';
    if (!raum) {
      art = 'fehler';
      text = 'Nicht verbunden';
    } else if (verbindung === 'getrennt') {
      art = 'fehler';
      text = 'Offline';
    } else if (verbindung === 'online') {
      art = praesenz.anzeigen > 0 ? 'online' : 'warnung';
      text = praesenz.anzeigen > 0 ? 'Live' : 'Rechner offline';
    }
    el.dataset.status = art;
    el.textContent = text;
  }

  const radDa = () => verbindung === 'online' && praesenz.anzeigen > 0 && stand;

  function liveZeichnen(a, analyse) {
    const karte = $('#fb-live');
    const label = $('#fb-live-label');
    const name = $('#fb-live-name');
    const info = $('#fb-live-info');
    const serieEl = $('#fb-serie');
    const drehen = $('#fb-drehen');
    const weiter = $('#fb-weiter');
    let phase = 'bereit';
    let serieNamen = null;
    const texte = ANSICHT[(stand && stand.spielart) || 'rad'];
    name.classList.remove('fb-zufall');
    info.textContent = '';
    weiter.hidden = true;

    if (!radDa()) {
      phase = 'offline';
      label.textContent = verbindung === 'online' ? 'Rechner nicht verbunden' : 'Keine Verbindung';
      name.textContent = 'Warte auf das Rad …';
      info.textContent = verbindung === 'online'
        ? 'Öffne das Glücksrad am Rechner – die Verbindung startet dort von selbst.'
        : 'Verbindung zum Server wird aufgebaut …';
      drehen.disabled = true;
      drehen.textContent = texte.start;
    } else if (stand.dreh) {
      phase = 'dreht';
      label.textContent = stand.serie ? `Ziehung ${stand.serie.gezogen.length + 1} von ${stand.serie.gesamt} – ${texte.laeuft}` : texte.laeuft;
      name.textContent = `→ ${stand.dreh.ziel}`;
      drehen.disabled = true;
      drehen.textContent = texte.knopf;
      serieNamen = stand.serie && stand.serie.gezogen.length ? stand.serie.gezogen : null;
      uhrZeichnen();
    } else if (stand.serie) {
      phase = 'dreht';
      const gezogen = stand.serie.gezogen;
      label.textContent = `Ziehung ${gezogen.length} von ${stand.serie.gesamt}`;
      name.textContent = gezogen[gezogen.length - 1] || '…';
      serieNamen = gezogen;
      drehen.disabled = true;
      drehen.textContent = 'Zieht …';
    } else if (stand.ergebnis) {
      phase = 'ergebnis';
      label.textContent = stand.ergebnis.liste ? 'Gezogen' : 'Ergebnis';
      if (stand.ergebnis.liste) {
        name.textContent = `${stand.ergebnis.liste.length} Gewinner`;
        serieNamen = stand.ergebnis.liste;
      } else {
        name.textContent = stand.ergebnis.name;
      }
      drehen.disabled = false;
      drehen.textContent = texte.nochmal;
      weiter.hidden = false;
    } else {
      label.textContent = stand.anzahlZiehen > 1 ? `Bereit · ${stand.anzahlZiehen} Gewinner` : 'Bereit';
      const fest = a.aktiv && a.naechster && stand.eintraege.some((n) => schluessel(n) === schluessel(a.naechster));
      const ausReihe = analyse.modus === 'erzwungen' && analyse.quelle === 'reihenfolge';
      if (fest) {
        name.textContent = a.naechster;
        info.textContent = a.naechsterDauerhaft ? 'Jeder Dreh landet hier.' : 'Der nächste Dreh landet hier.';
      } else if (ausReihe) {
        const danach = a.reihenfolge.length - analyse.reihenfolgePos - 1;
        name.textContent = a.reihenfolge[analyse.reihenfolgePos];
        info.textContent = `Aus deiner Reihenfolge${danach > 0 ? ` – danach noch ${danach}` : ' – der letzte Eintrag'}.`;
      } else {
        name.textContent = '🎲 Zufall';
        name.classList.add('fb-zufall');
        info.textContent = a.aktiv ? 'Gezogen wird nach deinen Chancen.' : 'Steuerung aus – alle haben die gleiche Chance.';
      }
      drehen.disabled = stand.eintraege.length === 0;
      drehen.textContent = stand.eintraege.length === 0 ? 'Keine Einträge im Rad' : texte.start;
    }

    karte.dataset.phase = phase;
    $('#fb-fortschritt').hidden = !(radDa() && stand.dreh);
    serieEl.hidden = !serieNamen;
    serieEl.textContent = '';
    for (const n of serieNamen || []) {
      const li = document.createElement('li');
      li.textContent = n;
      serieEl.appendChild(li);
    }
    $('#fb-ziel-hinweis').textContent = phase === 'dreht' && stand.dreh
      ? 'Es läuft! Tippe jetzt auf einen Namen, um das Ergebnis live dorthin umzulenken.'
      : 'Antippen – das Rad landet beim nächsten Dreh dort. Während es sich dreht, lenkst du es damit live um.';
  }

  /** Fortschritt und „noch umlenkbar“ während der Drehung – läuft pro Bildschirmbild. */
  function uhrZeichnen() {
    if (!drehUhr) return;
    const jetzt = performance.now();
    const rest = Math.max(0, drehUhr.ende - jetzt);
    $('#fb-fortschritt-balken').style.width = `${Math.min(100, (1 - rest / drehUhr.gesamt) * 100)}%`;
    const info = $('#fb-live-info');
    const sicher = drehUhr.umlenkbarBis - jetzt;
    info.textContent = '';
    if (sicher > 0) {
      info.append('Live umlenken: noch ');
      const zeit = document.createElement('strong');
      zeit.textContent = `${(sicher / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
      info.append(zeit, ' sicher');
    } else if (rest > 0) {
      info.textContent = 'Gleich steht es – umlenken klappt nur noch mit Glück.';
    } else {
      info.textContent = 'Steht gleich …';
    }
  }

  function uhrStarten() {
    if (uhrLaeuft) return;
    uhrLaeuft = true;
    const schritt = () => {
      if (!drehUhr || !stand || !stand.dreh) {
        uhrLaeuft = false;
        return;
      }
      uhrZeichnen();
      requestAnimationFrame(schritt);
    };
    requestAnimationFrame(schritt);
  }

  function modusText({ modus, quelle, reihenfolgePos }, a, namen) {
    if (!stand) return '';
    if (!a.aktiv) return 'Aus – das Rad dreht fair, alle haben die gleiche Chance.';
    if (namen.length === 0) return 'Keine Einträge im Rad.';
    if (a.naechster && !namen.some((n) => schluessel(n) === schluessel(a.naechster))) {
      return `„${a.naechster}“ steht nicht im Rad und wird ignoriert.`;
    }
    if (modus === 'erzwungen' && quelle === 'reihenfolge') return `Der nächste Dreh landet auf „${a.reihenfolge[reihenfolgePos]}“ (Reihenfolge).`;
    if (modus === 'erzwungen') return `${a.naechsterDauerhaft ? 'Jeder Dreh landet' : 'Der nächste Dreh landet'} auf „${a.naechster}“.`;
    if (modus === 'notfall') return '⚠️ Alle stehen auf „nie“ – das Rad wählt deshalb fair aus.';
    const gesperrt = namen.filter((n) => Logik.gewichtVon(n, a) === 0).length;
    if (modus === 'fair') return 'An – alle Chancen sind gerade gleich.';
    return gesperrt > 0
      ? `An – ${gesperrt} ${gesperrt === 1 ? 'Eintrag kommt' : 'Einträge kommen'} nie dran.`
      : 'An – deine Chancen gelten.';
  }

  function chipsZeichnen(namen, chance, a, analyse) {
    const huelle = $('#fb-chips');
    const signatur = JSON.stringify(namen);
    if (huelle.dataset.signatur !== signatur) {
      huelle.dataset.signatur = signatur;
      huelle.textContent = '';
      huelle.appendChild(chipBauen('', '🎲 Zufall'));
      namen.forEach((n) => huelle.appendChild(chipBauen(n, n)));
    }
    const imRad = a.naechster && namen.some((n) => schluessel(n) === schluessel(a.naechster));
    const gewaehlt = a.aktiv && imRad ? schluessel(a.naechster) : '';
    const ziel = radDa() && stand.dreh ? schluessel(stand.dreh.ziel) : null;
    const ausReihe = !gewaehlt && analyse.quelle === 'reihenfolge';
    const reihenKopf = ausReihe && analyse.modus === 'erzwungen' ? schluessel(a.reihenfolge[analyse.reihenfolgePos]) : null;

    huelle.querySelectorAll('.fb-chip').forEach((chip) => {
      const k = chip.dataset.key;
      const info = chip.querySelector('.fb-chip-info');
      const an = k === '' ? !gewaehlt : k === gewaehlt;
      chip.classList.toggle('gewaehlt', an);
      chip.setAttribute('aria-pressed', String(an));
      if (k === '') {
        info.textContent = !a.aktiv ? 'fair' : ausReihe ? 'Reihenfolge' : 'nach Chancen';
        return;
      }
      chip.classList.toggle('ziel', k === ziel);
      chip.classList.toggle('als-naechstes', k === reihenKopf);
      chip.classList.toggle('gesperrt', a.aktiv && Logik.gewichtVon(k, a) === 0);
      info.textContent = prozent(chance[k] || 0);
    });
  }

  function chipBauen(name, text) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'fb-chip' + (name ? '' : ' fb-zufall');
    chip.dataset.key = name ? schluessel(name) : '';
    chip.dataset.name = name;
    const n = document.createElement('span');
    n.className = 'fb-chip-name';
    n.textContent = text;
    const info = document.createElement('span');
    info.className = 'fb-chip-info';
    chip.append(n, info);
    return chip;
  }

  function gewichteZeichnen(namen, chance, a) {
    const liste = $('#fb-gewichte');
    const signatur = JSON.stringify(namen);
    if (liste.dataset.signatur !== signatur) {
      liste.dataset.signatur = signatur;
      liste.textContent = '';
      if (namen.length === 0) {
        const li = document.createElement('li');
        li.className = 'leer';
        li.textContent = stand ? 'Noch keine Einträge im Rad.' : 'Warte auf das Rad …';
        liste.appendChild(li);
      }
      namen.forEach((name) => liste.appendChild(gewichtZeileBauen(name)));
    }
    const hoechste = Math.max(0, ...Object.values(chance));
    liste.querySelectorAll('li[data-key]').forEach((zeile) => {
      const k = zeile.dataset.key;
      const g = Logik.gewichtVon(k, a);
      const c = chance[k] || 0;
      zeile.classList.toggle('gesperrt', g === 0);
      zeile.querySelector('.fb-gewicht-name span').textContent = prozent(c);
      zeile.querySelector('output').textContent = g === 0 ? 'nie' : `${g}×`;
      zeile.querySelector('[data-schritt="-1"]').disabled = g <= 0;
      zeile.querySelector('[data-schritt="1"]').disabled = g >= 10;
      zeile.querySelector('.fb-balken i').style.width = `${hoechste > 0 ? (c / hoechste) * 100 : 0}%`;
    });
  }

  function gewichtZeileBauen(name) {
    const li = document.createElement('li');
    li.dataset.key = schluessel(name);

    const kopf = document.createElement('div');
    kopf.className = 'fb-gewicht-name';
    const strong = document.createElement('strong');
    strong.textContent = name;
    kopf.append(strong, document.createElement('span'));

    const regler = document.createElement('div');
    regler.className = 'fb-regler';
    const minus = document.createElement('button');
    minus.type = 'button';
    minus.dataset.schritt = '-1';
    minus.textContent = '−';
    minus.setAttribute('aria-label', `${name}: seltener`);
    const plus = document.createElement('button');
    plus.type = 'button';
    plus.dataset.schritt = '1';
    plus.textContent = '+';
    plus.setAttribute('aria-label', `${name}: häufiger`);
    regler.append(minus, document.createElement('output'), plus);

    const nie = document.createElement('button');
    nie.type = 'button';
    nie.className = 'fb-nie';
    nie.textContent = '🚫';
    nie.title = 'Nie ziehen an/aus';
    nie.setAttribute('aria-label', `${name}: nie ziehen an/aus`);

    const balken = document.createElement('div');
    balken.className = 'fb-balken';
    balken.appendChild(document.createElement('i'));

    li.append(kopf, regler, nie, balken);
    return li;
  }

  function verlaufZeichnen() {
    const liste = $('#fb-verlauf');
    liste.textContent = '';
    const verlauf = stand ? stand.verlauf : [];
    if (verlauf.length === 0) {
      const li = document.createElement('li');
      li.className = 'leer';
      li.textContent = 'Noch nicht gedreht.';
      liste.appendChild(li);
      return;
    }
    for (const eintrag of verlauf) {
      const li = document.createElement('li');
      const name = document.createElement('span');
      const zeit = document.createElement('time');
      name.textContent = eintrag.name.slice(0, 100);
      zeit.textContent = new Date(eintrag.zeit).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      li.append(name, zeit);
      liste.appendChild(li);
    }
  }

  // ---------- Bedienung ----------

  /** Wer bei ausgeschalteter Steuerung etwas festlegt, will sie offenbar an haben. */
  function mitAktiv(aenderung) {
    if (!regeln().aktiv) {
      aenderung.aktiv = true;
      melden('Steuerung eingeschaltet');
    }
    return aenderung;
  }

  /**
   * Ein Tipp: Ergebnis festlegen und sofort drehen ('' = ohne Festlegung, also
   * Reihenfolge bzw. Chancen). Läuft schon eine Drehung, wird sie umgelenkt.
   */
  function festlegenUndDrehen(name) {
    if (!radDa()) {
      melden('Der Rechner ist nicht verbunden.');
      fehlerSignal();
      return;
    }
    const aenderung = name ? mitAktiv({ naechster: name }) : { naechster: '' };
    if (stand.dreh || stand.serie) {
      regelnAendern(aenderung);
      return;
    }
    lokal = regelnAnwenden(lokal || stand.admin, aenderung);
    zeichnen();
    const meineNr = ++nr;
    gesendetBis = meineNr;
    befehlSenden({ typ: 'drehen', aenderung }, meineNr).then((ok) => {
      if (ok) return;
      lokal = null;
      zeichnen();
      fehlerSignal();
    });
  }

  const sofortAn = () => speicherLesen().sofort === true;

  $('#fb-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.fb-chip');
    if (!chip || !stand) return;
    vibrieren(12);
    const a = regeln();
    const name = chip.dataset.name;
    if (sofortAn()) {
      festlegenUndDrehen(name);
      return;
    }
    const schonGewaehlt = a.aktiv && a.naechster && schluessel(a.naechster) === schluessel(name);
    if (!name || schonGewaehlt) regelnAendern({ naechster: '' });
    else regelnAendern(mitAktiv({ naechster: name }));
  });

  $('#fb-sofort').checked = sofortAn();
  $('#fb-sofort').addEventListener('change', (e) => {
    speicherSchreiben({ sofort: e.target.checked });
    melden(e.target.checked ? 'Antippen dreht jetzt sofort' : 'Antippen legt nur fest');
  });

  // ---------- Reihenfolge ----------

  function reiheZeichnen(namen, a, analyse) {
    const liste = $('#fb-reihe');
    const imRad = new Set(namen.map(schluessel));
    const kopf = analyse.quelle === 'reihenfolge' ? analyse.reihenfolgePos : -1;
    liste.textContent = '';
    if (a.reihenfolge.length === 0) {
      const li = document.createElement('li');
      li.className = 'leer';
      li.textContent = 'Leer – gezogen wird nach deinen Chancen.';
      liste.appendChild(li);
    }
    a.reihenfolge.forEach((name, pos) => {
      const li = document.createElement('li');
      li.dataset.pos = pos;
      li.dataset.name = name;
      li.classList.toggle('kopf', pos === kopf);
      li.classList.toggle('fehlt', name !== '' && !imRad.has(schluessel(name)));
      const text = document.createElement('span');
      text.textContent = name || '🎲 Zufall';
      const weg = document.createElement('button');
      weg.type = 'button';
      weg.textContent = '✕';
      weg.setAttribute('aria-label', `${name || 'Zufall'} streichen`);
      li.append(text, weg);
      liste.appendChild(li);
    });
    $('#fb-reihe-leeren').hidden = a.reihenfolge.length === 0;

    const huelle = $('#fb-reihe-namen');
    const signatur = JSON.stringify(namen);
    if (huelle.dataset.signatur === signatur) return;
    huelle.dataset.signatur = signatur;
    huelle.textContent = '';
    for (const name of [''].concat(namen)) {
      const knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.className = 'fb-mini-chip';
      knopf.dataset.name = name;
      knopf.textContent = name || '🎲 Zufall';
      huelle.appendChild(knopf);
    }
  }

  const reiheAendern = (schritte, aktivieren = false) => {
    if (!stand) return;
    const aenderung = { reihenfolge: schritte };
    regelnAendern(aktivieren ? mitAktiv(aenderung) : aenderung);
  };

  $('#fb-reihe-namen').addEventListener('click', (e) => {
    const knopf = e.target.closest('.fb-mini-chip');
    if (!knopf) return;
    vibrieren(8);
    if (regeln().reihenfolge.length >= Logik.MAX_REIHENFOLGE) {
      melden(`Höchstens ${Logik.MAX_REIHENFOLGE} Einträge`);
      return;
    }
    reiheAendern([{ plus: knopf.dataset.name }], true);
  });

  $('#fb-reihe').addEventListener('click', (e) => {
    const zeile = e.target.closest('button') && e.target.closest('li[data-pos]');
    if (zeile) reiheAendern([{ minus: Number(zeile.dataset.pos), name: zeile.dataset.name }]);
  });

  $('#fb-reihe-leeren').addEventListener('click', () => reiheAendern([{ leeren: true }]));

  // ---------- Blind-Modus ----------

  const ECKEN = 4;

  /** Belegung der vier Ecken: gespeichert oder – noch frei – die ersten Einträge des Rads. */
  function ecken(namen) {
    const gespeichert = speicherLesen().ecken;
    const liste = Array.isArray(gespeichert) ? gespeichert.slice(0, ECKEN) : [];
    const frei = namen.filter((n) => !liste.some((x) => typeof x === 'string' && schluessel(x) === schluessel(n)));
    return Array.from({ length: ECKEN }, (_, i) => (typeof liste[i] === 'string' ? liste[i] : frei.shift() || ''));
  }

  function eckenWahlZeichnen(namen) {
    const belegt = ecken(namen);
    document.querySelectorAll('#fb-blind-wahl select').forEach((auswahl) => {
      const i = Number(auswahl.dataset.ecke);
      if (document.activeElement === auswahl) return;
      const optionen = [['', '🎲 Zufall (Reihenfolge / Chancen)']].concat(namen.map((n) => [n, n]));
      const wert = belegt[i];
      if (wert && !namen.some((n) => schluessel(n) === schluessel(wert))) optionen.push([wert, `${wert} (nicht im Rad)`]);
      auswahl.textContent = '';
      for (const [w, t] of optionen) {
        const opt = document.createElement('option');
        opt.value = w;
        opt.textContent = t;
        auswahl.appendChild(opt);
      }
      auswahl.value = optionen.find(([w]) => schluessel(w) === schluessel(wert))[0];
    });
  }

  $('#fb-blind-wahl').addEventListener('change', (e) => {
    const auswahl = e.target.closest('select[data-ecke]');
    if (!auswahl) return;
    const belegt = ecken(stand ? eindeutig(stand.eintraege) : []);
    belegt[Number(auswahl.dataset.ecke)] = auswahl.value;
    speicherSchreiben({ ecken: belegt });
    zeichnen();
  });

  const blind = $('#fb-blind');

  function blindZeichnen(namen) {
    if (blind.hidden) return;
    const belegt = ecken(namen);
    blind.querySelectorAll('.fb-blind-feld').forEach((feld) => {
      feld.querySelector('span').textContent = belegt[Number(feld.dataset.ecke)] || '🎲';
    });
    $('#fb-blind-punkt').dataset.status = !radDa() ? 'aus' : stand.dreh || stand.serie ? 'dreht' : 'bereit';
  }

  let hilfeTimer = null;
  function blindStarten() {
    blind.hidden = false;
    const hilfe = $('#fb-blind-hilfe');
    hilfe.classList.remove('weg');
    clearTimeout(hilfeTimer);
    hilfeTimer = setTimeout(() => hilfe.classList.add('weg'), 3500);
    try {
      const vollbild = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      if (vollbild && vollbild.catch) vollbild.catch(() => {});
    } catch (e) {
      /* iPhone: kein Vollbild für Webseiten – der schwarze Bildschirm reicht */
    }
    wachHalten();
    zeichnen();
  }

  function blindBeenden() {
    blind.hidden = true;
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }

  $('#fb-blind-start').addEventListener('click', blindStarten);

  // Gesten: Tippen auf eine Ecke, nach oben wischen = drehen, nach unten = zurück.
  let beruehrung = null;
  blind.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) return;
    const feld = e.target.closest('.fb-blind-feld');
    beruehrung = { x: e.clientX, y: e.clientY, ecke: feld ? Number(feld.dataset.ecke) : -1 };
    if (blind.setPointerCapture) blind.setPointerCapture(e.pointerId);
  });
  blind.addEventListener('pointercancel', () => (beruehrung = null));
  blind.addEventListener('pointerup', (e) => {
    const b = beruehrung;
    beruehrung = null;
    if (!b || !e.isPrimary) return;
    const dx = e.clientX - b.x;
    const dy = e.clientY - b.y;
    if (Math.abs(dy) > 70 && Math.abs(dy) > Math.abs(dx) * 1.5) {
      if (dy > 0) {
        blindBeenden();
      } else {
        vibrieren([20, 60, 20, 60, 20]);
        befehlSenden({ typ: 'drehen' }).then((ok) => ok || fehlerSignal());
      }
      return;
    }
    if (Math.hypot(dx, dy) > 30 || b.ecke < 0) return;
    // Ecke 1–4 = 1–4 kurze Stöße (Android), damit man ohne Hinsehen merkt, welche es war.
    vibrieren(Array.from({ length: b.ecke * 2 + 1 }, (_, i) => (i % 2 ? 90 : 35)));
    const feld = blind.querySelector(`[data-ecke="${b.ecke}"]`);
    feld.classList.remove('blitz');
    void feld.offsetWidth;
    feld.classList.add('blitz');
    festlegenUndDrehen(ecken(stand ? eindeutig(stand.eintraege) : [])[b.ecke]);
  });

  $('#fb-gewichte').addEventListener('click', (e) => {
    const knopf = e.target.closest('button');
    const zeile = knopf && knopf.closest('li[data-key]');
    if (!zeile || !stand) return;
    vibrieren(8);
    const k = zeile.dataset.key;
    const g = Logik.gewichtVon(k, regeln());
    const neu = knopf.classList.contains('fb-nie') ? (g === 0 ? 1 : 0) : Math.min(10, Math.max(0, g + Number(knopf.dataset.schritt)));
    if (neu !== g) regelnAendern(mitAktiv({ gewichte: { [k]: neu } }));
  });

  $('#fb-aktiv').addEventListener('change', (e) => regelnAendern({ aktiv: e.target.checked }));
  $('#fb-dauerhaft').addEventListener('change', (e) => regelnAendern({ naechsterDauerhaft: e.target.checked }));
  $('#fb-alle-normal').addEventListener('click', () => regelnAendern({ alleNormal: true }));

  $('#fb-drehen').addEventListener('click', () => {
    vibrieren(20);
    befehlSenden({ typ: 'drehen' });
  });
  $('#fb-weiter').addEventListener('click', () => befehlSenden({ typ: 'weiter' }));

  $('#fb-trennen').addEventListener('click', () => {
    if (!confirm('Dieses Handy abmelden? Zum erneuten Verbinden den QR-Code nochmal scannen.')) return;
    speicherSchreiben({ raum: '' });
    history.replaceState(null, '', location.pathname + location.search);
    raum = '';
    stand = null;
    lokal = null;
    if (quelle) quelle.close();
    quelle = null;
    zeichnen();
  });

  $('#fb-link-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const neu = raumAus($('#fb-link-eingabe').value);
    if (!neu) {
      melden('Das ist kein gültiger Handy-Link.');
      return;
    }
    starten(neu);
  });

  window.addEventListener('hashchange', () => {
    const neu = raumAus(location.hash);
    if (neu && neu !== raum) starten(neu);
  });

  // ---------- Start ----------

  function starten(neuerRaum) {
    raum = neuerRaum;
    speicherSchreiben({ raum });
    stand = null;
    lokal = null;
    zeichnen();
    verbinden();
  }

  // Der Link bleibt in der Adresse, damit „Zum Home-Bildschirm“ ihn mitnimmt.
  const ausLink = raumAus(location.hash);
  const gespeichert = typeof speicherLesen().raum === 'string' && RAUM_MUSTER.test(speicherLesen().raum) ? speicherLesen().raum : '';
  if (ausLink || gespeichert) starten(ausLink || gespeichert);
  else zeichnen();
})();
