/*
 * app.js – der Kern der Hauptseite: Einträge, Drehen, Ergebnis, Verlauf,
 * Einstellungen anwenden, Dialoge und die versteckten Zugänge zum Admin-Bereich.
 *
 * Stellt `window.App` bereit, damit die Zusatzmodule (Einstellungen, Listen,
 * Teams, Statistik) auf dieselben Daten zugreifen können.
 */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  // Drehdauer: Millisekunden [min, max] und volle Umdrehungen [min, max]
  const DREHDAUER = {
    kurz: { ms: [2800, 3600], umdrehungen: [3, 5] },
    normal: { ms: [5200, 7500], umdrehungen: [5, 8] },
    lang: { ms: [9000, 11500], umdrehungen: [9, 13] },
  };
  const VERLAUF_MAX = 500;

  let daten = Speicher.ladeRad();
  let letzterGewinn = null; // { name, index }
  let entfernenBeimSchliessen = false;
  let spaeterNeuLaden = false; // Speicheränderung aus anderem Tab während des Drehens
  let serieLaeuft = false; // mehrere Gewinner werden gerade nacheinander gezogen
  let serieStand = null; // { gesamt, gezogen } während einer Serie
  let letzteSerie = []; // Namen der letzten Serie – für "Alle zurück ins Rad"
  let aktuellerDreh = null; // { eintraege, index, optionen, erzwungen, verbraucht, animation } – solange das Rad dreht
  let ergebnisStand = null; // { name } oder { liste } – solange das Ergebnis-Fenster offen ist

  const eingabe = $('#eintraege');
  const titelFeld = $('#rad-titel');
  const zeiger = $('#zeiger');
  const rad = new Rad($('#rad'), { onTick: tick });
  const spielansichten = new Spielansichten();

  /** Zusätzliche Regeln für die Auswahl, z. B. "nicht zweimal hintereinander". */
  function ziehOptionen() {
    const letzter = daten.verlauf[0];
    return daten.einstellungen.nichtDoppelt && letzter ? { ausschliessen: [letzter.name] } : {};
  }

  Admin.init({ holeEintraege: () => daten.eintraege, holeOptionen: ziehOptionen, beiAenderung: () => regelnGeaendert() });

  /**
   * Was ein Dreh nach dieser Auswahl verbraucht: den einmalig festgelegten Gewinner
   * ({ art: 'naechster', name }), einen Eintrag der Reihenfolge ({ art: 'reihenfolge',
   * pos, name }) oder nichts (null).
   */
  function verbrauchVon(auswahl, admin) {
    if (auswahl.quelle === 'naechster') return admin.naechsterDauerhaft ? null : { art: 'naechster', name: admin.naechster };
    if (auswahl.quelle === 'reihenfolge') {
      return { art: 'reihenfolge', pos: auswahl.reihenfolgePos, name: admin.reihenfolge[auswahl.reihenfolgePos] };
    }
    return null;
  }

  /** Andere Module (z. B. die Live-Fernbedienung) über Änderungen am Rad informieren. */
  function zustandMelden() {
    document.dispatchEvent(new CustomEvent('radzustand'));
  }

  const zufallZwischen = (min, max) => min + Math.random() * (max - min);

  function speichern() {
    Speicher.speichereRad(daten);
  }

  // ---------- Meldungen ("Toast") ----------

  // Die Meldung ist ein Popover: so liegt sie auch über offenen Dialogen.
  // Ältere Browser ohne Popover-Unterstützung zeigen sie einfach normal an.
  let meldungTimer = null;
  function melden(text) {
    const el = $('#meldung');
    const popover = typeof el.showPopover === 'function';
    el.textContent = text;
    clearTimeout(meldungTimer);
    if (popover) {
      if (el.matches(':popover-open')) el.hidePopover(); // neu öffnen = wieder ganz nach oben
      el.showPopover();
    }
    requestAnimationFrame(() => el.classList.add('sichtbar'));
    meldungTimer = setTimeout(() => {
      el.classList.remove('sichtbar');
      meldungTimer = setTimeout(() => popover && el.matches(':popover-open') && el.hidePopover(), 250);
    }, 2400);
  }

  /** Text in die Zwischenablage – mit Rückfall für ältere Browser. */
  async function kopieren(text) {
    // execCommand muss synchron zum Klick laufen. In einem modalen Dialog muss
    // das Kopierfeld außerdem innerhalb des Dialogs liegen (Safari/iOS).
    const feld = document.createElement('textarea');
    feld.value = text;
    feld.setAttribute('readonly', '');
    feld.style.position = 'fixed';
    feld.style.top = '0';
    feld.style.left = '0';
    feld.style.width = '1px';
    feld.style.height = '1px';
    feld.style.opacity = '0';
    const dialog = document.querySelector('dialog[open]');
    const fokusVorher = document.activeElement;
    (dialog || document.body).appendChild(feld);
    feld.focus();
    feld.select();
    feld.setSelectionRange(0, text.length);
    try {
      if (document.execCommand('copy')) return true;
    } catch (e) {
      // Einige Browser unterstützen execCommand nicht mehr.
    } finally {
      feld.remove();
      if (fokusVorher && typeof fokusVorher.focus === 'function') fokusVorher.focus();
    }
    try {
      if (!navigator.clipboard?.writeText) return false;
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Datei zum Herunterladen anbieten. */
  function herunterladen(dateiname, inhalt, typ = 'text/plain') {
    const url = URL.createObjectURL(new Blob([inhalt], { type: typ + ';charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = dateiname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- Einträge & Titel ----------

  function textZuEintraegen(text) {
    return text
      .split('\n')
      .map((zeile) => zeile.trim())
      .filter(Boolean);
  }

  function eintraegeSetzen(liste, { textfeld = true, speichern: sichern = true } = {}) {
    daten.eintraege = liste;
    if (sichern) speichern();
    rad.setEintraege(liste);
    spielansichten.setEintraege(liste);
    if (textfeld) eingabe.value = liste.join('\n');
    $('#anzahl').textContent = liste.length;
    Admin.aktualisieren();
    zustandMelden();
  }

  function titelAnzeigen() {
    if (document.activeElement !== titelFeld) titelFeld.value = daten.titel || '';
    document.title = daten.titel ? `${daten.titel} – Glücksrad` : 'Glücksrad';
  }

  function zurueckholenAnzeigen() {
    const knopf = $('#btn-zurueckholen');
    const n = daten.entfernt.length;
    knopf.hidden = n === 0;
    knopf.textContent = `↩ ${n} ${n === 1 ? 'entfernten Eintrag' : 'entfernte Einträge'} zurückholen`;
  }

  eingabe.addEventListener('input', () => {
    eintraegeSetzen(textZuEintraegen(eingabe.value), { textfeld: false });
  });

  titelFeld.addEventListener('input', () => {
    daten.titel = titelFeld.value.trim();
    speichern();
    titelAnzeigen();
    zustandMelden();
  });

  titelFeld.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') titelFeld.blur();
  });

  $('#btn-mischen').addEventListener('click', () => {
    const liste = daten.eintraege.slice();
    for (let i = liste.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [liste[i], liste[j]] = [liste[j], liste[i]];
    }
    eintraegeSetzen(liste);
  });

  $('#btn-sortieren').addEventListener('click', () => {
    const liste = daten.eintraege.slice().sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
    eintraegeSetzen(liste);
  });

  $('#btn-zurueckholen').addEventListener('click', () => {
    const n = daten.entfernt.length;
    const liste = daten.eintraege.concat(daten.entfernt);
    daten.entfernt = [];
    eintraegeSetzen(liste);
    zurueckholenAnzeigen();
    melden(`${n} ${n === 1 ? 'Eintrag' : 'Einträge'} zurückgeholt`);
  });

  // ---------- Einstellungen anwenden ----------

  const systemHell = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

  function einstellungenAnwenden() {
    const e = daten.einstellungen;
    const design = e.design === 'system' ? (systemHell && systemHell.matches ? 'hell' : 'dunkel') : e.design;
    document.documentElement.dataset.design = design;
    rad.setFarbschema(e.farben);
    Ton.an = daten.ton !== false;
    $('#btn-ton').textContent = Ton.an ? '🔊' : '🔇';
    $('#btn-mitte').textContent = (e.nabeText || '').trim() || Speicher.STANDARD_EINSTELLUNGEN.nabeText;
    const anzahl = Number(e.anzahlZiehen) || 1;
    $('#anzahl-ziehen').value = String(anzahl);
    const spielart = ['rad', 'slot', 'roulette'].includes(e.spielart) ? e.spielart : 'rad';
    spielansichten.wechseln(spielart);
    document.querySelectorAll('[data-spielart]').forEach((knopf) => {
      knopf.setAttribute('aria-pressed', String(knopf.dataset.spielart === spielart));
    });
    if (spielart === 'rad') rad.groesseAnpassen();
    const beschriftungen = { rad: 'Rad drehen', slot: 'Slotmaschine starten', roulette: 'Roulette starten' };
    $('#btn-drehen').textContent = anzahl > 1 ? `${anzahl} Gewinner ziehen` : beschriftungen[spielart];
    $('#spiel-hinweis').textContent = spielart === 'rad' ? 'Leertaste dreht das Rad' : 'Leertaste startet die Ziehung';
    zustandMelden();
  }

  document.querySelectorAll('[data-spielart]').forEach((knopf) => knopf.addEventListener('click', () => {
    if (document.body.classList.contains('dreht')) return;
    daten.einstellungen.spielart = knopf.dataset.spielart;
    speichern();
    einstellungenAnwenden();
  }));

  $('#anzahl-ziehen').addEventListener('change', (e) => {
    daten.einstellungen.anzahlZiehen = Number(e.target.value) || 1;
    speichern();
    einstellungenAnwenden();
  });

  /** Gewinner per Sprachausgabe ansagen (wenn in den Einstellungen aktiviert). */
  function vorlesen(text) {
    if (!daten.einstellungen.vorlesen || !('speechSynthesis' in window)) return;
    try {
      const ansage = new SpeechSynthesisUtterance(text);
      ansage.lang = 'de-DE';
      ansage.rate = 0.95;
      // Lokale Stimme bevorzugen – dann verlässt der Text das Gerät nicht (siehe Datenschutz).
      const lokal = speechSynthesis.getVoices().find((s) => s.localService && s.lang.toLowerCase().startsWith('de'));
      if (lokal) ansage.voice = lokal;
      speechSynthesis.speak(ansage);
    } catch (e) {
      /* ohne Sprachausgabe weiter */
    }
  }

  if (systemHell && systemHell.addEventListener) systemHell.addEventListener('change', einstellungenAnwenden);

  function tonUmschalten() {
    daten.ton = !Ton.an;
    speichern();
    einstellungenAnwenden();
    melden(Ton.an ? 'Ton an' : 'Ton aus');
  }

  $('#btn-ton').addEventListener('click', tonUmschalten);

  function vollbildUmschalten() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
  }

  $('#btn-vollbild').addEventListener('click', vollbildUmschalten);

  // ---------- Drehen ----------

  function tick() {
    Ton.klick();
    // Zeiger kurz anschlagen lassen, dann zurückfedern.
    zeiger.style.transition = 'none';
    zeiger.style.transform = 'rotate(-16deg)';
    requestAnimationFrame(() => {
      zeiger.style.transition = 'transform 140ms ease-out';
      zeiger.style.transform = 'rotate(0deg)';
    });
  }

  function bedienungSperren(gesperrt) {
    document.body.classList.toggle('dreht', gesperrt);
    const elemente = [eingabe, titelFeld, $('#btn-mischen'), $('#btn-sortieren'), $('#btn-drehen'), $('#btn-mitte'), $('#btn-zurueckholen'), $('#anzahl-ziehen'), ...document.querySelectorAll('[data-spielart]')];
    for (const el of elemente) el.disabled = gesperrt;
    $('#eintraege-menue').open = false;
  }

  const pause = (ms) => new Promise((weiter) => setTimeout(weiter, ms));

  /**
   * Ein einzelner Dreh: Gewinner auswählen, Rad hinrollen lassen, im Verlauf festhalten.
   * Liefert { name, index } – die Anzeige übernehmen drehen() bzw. mehrereZiehen().
   */
  async function drehVorgang(eintraege) {
    const admin = Speicher.ladeAdmin(); // frisch lesen – evtl. in einem anderen Fenster geändert
    const optionen = ziehOptionen();
    const auswahl = Logik.waehleGewinner(eintraege, admin, Math.random, optionen);
    const tempo = DREHDAUER[daten.einstellungen.dauer] || DREHDAUER.normal;
    const dauer = zufallZwischen(tempo.ms[0], tempo.ms[1]);
    const ansicht = spielansichten.modus;

    const erzwungen = auswahl.modus === 'erzwungen';
    aktuellerDreh = {
      eintraege,
      index: auswahl.index,
      optionen,
      erzwungen,
      verbraucht: verbrauchVon(auswahl, admin),
      // Rad oder Slotmaschine/Roulette – beide können laufInfo() und umlenken()
      animation: ansicht === 'rad' ? rad : spielansichten,
    };
    let fahrt;
    if (ansicht === 'rad') {
      const ziel = Logik.zielRotation(rad.rotation, auswahl.index, eintraege.length, Math.random, {
        minUmdrehungen: tempo.umdrehungen[0],
        maxUmdrehungen: tempo.umdrehungen[1],
      });
      fahrt = rad.drehenZu(ziel, dauer);
    } else {
      fahrt = spielansichten.spielen(eintraege, auswahl.index, dauer);
    }
    zustandMelden();
    await fahrt;
    const dreh = aktuellerDreh;
    aktuellerDreh = null;

    // Beim Rad das sichtbare Feld als Ergebnis ablesen, sonst das (evtl. umgelenkte) Ziel.
    const index = ansicht === 'rad' ? Logik.indexUnterZeiger(rad.rotation, eintraege.length) : dreh.index;
    const name = eintraege[index];

    // Festgelegter Gewinner bzw. Eintrag der Reihenfolge ist jetzt verbraucht – außer
    // er wurde während der Drehung geändert und kam nicht mehr rechtzeitig zum Zug.
    const v = dreh.verbraucht;
    if (v) {
      const aktuell = Speicher.ladeAdmin();
      if (v.art === 'naechster' && !aktuell.naechsterDauerhaft && Logik.schluessel(aktuell.naechster || '') === Logik.schluessel(v.name)) {
        aktuell.naechster = '';
        Speicher.speichereAdmin(aktuell);
      } else if (v.art === 'reihenfolge') {
        aktuell.reihenfolge = Logik.reihenfolgeVerbrauchen(aktuell.reihenfolge, v.pos, v.name);
        Speicher.speichereAdmin(aktuell);
      }
      Admin.aktualisieren();
    }

    daten.verlauf.unshift({ name, zeit: Date.now() });
    daten.verlauf = daten.verlauf.slice(0, VERLAUF_MAX);
    speichern();
    verlaufZeichnen();
    zustandMelden();
    return { name, index };
  }

  /**
   * Die Admin-Regeln haben sich während der Drehung geändert (Handy, Admin-Bereich,
   * zweites Fenster): wenn nötig ohne Ruck auf ein neues Ziel umlenken.
   * Rückgabe: 'umgelenkt', 'zu-spaet' oder '' (nichts zu tun).
   */
  function umlenkenPruefen() {
    const dreh = aktuellerDreh;
    if (!dreh) return '';
    // Die Reihenfolge plant künftige Drehungen: Änderungen daran lenken nur um,
    // wenn diese Drehung selbst aus der Reihenfolge stammt.
    const gespeichert = Speicher.ladeAdmin();
    const ausReihe = dreh.verbraucht && dreh.verbraucht.art === 'reihenfolge';
    const admin = ausReihe ? gespeichert : Object.assign({}, gespeichert, { reihenfolge: [] });
    const analyse = Logik.analyse(dreh.eintraege, admin, dreh.optionen);
    const { wahrscheinlichkeiten } = analyse;
    const erzwungen = analyse.modus === 'erzwungen';
    const verbraucht = verbrauchVon(analyse, admin);

    // Das bisherige Ziel bleibt, solange es erlaubt ist – es sei denn, es war nur
    // festgelegt und die Festlegung ist jetzt aufgehoben: dann neu auslosen.
    if (wahrscheinlichkeiten[dreh.index] > 0 && (erzwungen || !dreh.erzwungen)) {
      if (erzwungen) Object.assign(dreh, { erzwungen, verbraucht });
      return '';
    }
    const { index } = Logik.waehleGewinner(dreh.eintraege, admin, Math.random, dreh.optionen);
    if (index !== dreh.index && !dreh.animation.umlenken(index)) return 'zu-spaet';
    const umgelenkt = index !== dreh.index;
    Object.assign(dreh, { index, erzwungen, verbraucht });
    return umgelenkt ? 'umgelenkt' : '';
  }

  /** Admin-Regeln wurden geändert. Liefert das Ergebnis von umlenkenPruefen(). */
  function regelnGeaendert() {
    const ergebnis = umlenkenPruefen();
    zustandMelden();
    return ergebnis;
  }

  function kannDrehen() {
    if (document.body.classList.contains('dreht') || serieLaeuft || document.querySelector('dialog[open]')) return false;
    if (daten.eintraege.length === 0) {
      eingabe.focus();
      melden('Erst Einträge hinzufügen');
      return false;
    }
    return true;
  }

  function nachDemDrehen() {
    if (spaeterNeuLaden) {
      spaeterNeuLaden = false;
      vonSpeicherLaden();
    }
  }

  /** Startet je nach Einstellung einen Dreh oder eine Serie mit mehreren Gewinnern. */
  function starten() {
    const anzahl = Number(daten.einstellungen.anzahlZiehen) || 1;
    return anzahl > 1 ? mehrereZiehen(anzahl) : drehen();
  }

  async function drehen() {
    if (!kannDrehen()) return;
    Ton.bereit();
    serieAnzeigen([], 0);
    bedienungSperren(true);
    const { name, index } = await drehVorgang(daten.eintraege.slice());
    bedienungSperren(false);
    nachDemDrehen();
    ergebnisZeigen(name, index);
  }

  /** Mehrere Gewinner nacheinander – jeder Gewinner verlässt das Rad, damit keiner doppelt drankommt. */
  async function mehrereZiehen(anzahl) {
    if (!kannDrehen()) return;
    const gesamt = Math.min(anzahl, daten.eintraege.length);
    const serie = [];
    Ton.bereit();
    serieLaeuft = true;
    serieStand = { gesamt, gezogen: serie };
    bedienungSperren(true);
    serieAnzeigen(serie, gesamt);

    for (let runde = 0; runde < gesamt && daten.eintraege.length > 0; runde++) {
      const eintraege = daten.eintraege.slice();
      const { name, index } = await drehVorgang(eintraege);
      serie.push(name);
      eintraege.splice(index, 1);
      daten.entfernt.push(name);
      eintraegeSetzen(eintraege);
      serieAnzeigen(serie, gesamt);
      Ton.gewinn();
      vorlesen(name);
      if (runde < gesamt - 1) await pause(1200);
    }

    serieLaeuft = false;
    serieStand = null;
    bedienungSperren(false);
    zurueckholenAnzeigen();
    nachDemDrehen();
    serieZeigen(serie);
    zustandMelden();
  }

  /** Kleine Leiste über dem Rad: "1. 7a · 2. 5b · …" */
  function serieAnzeigen(serie, gesamt) {
    const leiste = $('#serie');
    leiste.innerHTML = '';
    leiste.hidden = gesamt <= 1;
    for (let i = 0; i < gesamt; i++) {
      const li = document.createElement('li');
      li.textContent = serie[i] || '…';
      li.classList.toggle('offen', !serie[i]);
      leiste.appendChild(li);
    }
  }

  $('#btn-drehen').addEventListener('click', starten);
  $('#btn-mitte').addEventListener('click', starten);

  // ---------- Ergebnis ----------

  const ergebnis = $('#ergebnis');

  function ergebnisModus(serie) {
    $('#ergebnis-name').hidden = serie;
    $('#ergebnis-liste').hidden = !serie;
    $('#btn-serie-zurueck').hidden = !serie;
    $('#btn-serie-kopieren').hidden = !serie;
    const vorgabe = Speicher.STANDARD_EINSTELLUNGEN.ergebnisText;
    const eigenerText = daten.einstellungen.ergebnisText;
    const texte = { rad: vorgabe, slot: 'Die Slotmaschine hat entschieden:', roulette: 'Die Kugel ist gefallen:' };
    $('#ergebnis-label').textContent = eigenerText && eigenerText !== vorgabe ? eigenerText : texte[spielansichten.modus];
  }

  function ergebnisZeigen(name, index) {
    const auto = daten.einstellungen.autoEntfernen;
    letzterGewinn = { name, index };
    entfernenBeimSchliessen = auto;
    ergebnisModus(false);
    $('#ergebnis-name').textContent = name;
    $('#ergebnis-hinweis').hidden = !auto;
    $('#btn-entfernen').hidden = auto;
    ergebnis.showModal();
    ergebnisStand = { name };
    zustandMelden();
    Ton.gewinn();
    vorlesen(name);
    if (daten.einstellungen.konfetti) Konfetti.starten($('#konfetti'));
  }

  function serieZeigen(serie) {
    if (serie.length === 0) return;
    letzteSerie = serie.slice();
    letzterGewinn = null;
    entfernenBeimSchliessen = false;
    ergebnisModus(true);
    const liste = $('#ergebnis-liste');
    liste.innerHTML = '';
    for (const name of serie) {
      const li = document.createElement('li');
      li.textContent = name;
      liste.appendChild(li);
    }
    $('#ergebnis-hinweis').hidden = true;
    $('#btn-entfernen').hidden = true;
    ergebnis.showModal();
    ergebnisStand = { liste: serie.slice() };
    if (daten.einstellungen.konfetti) Konfetti.starten($('#konfetti'));
  }

  $('#btn-serie-zurueck').addEventListener('click', () => {
    for (const name of letzteSerie) {
      const i = daten.entfernt.lastIndexOf(name);
      if (i >= 0) daten.entfernt.splice(i, 1);
    }
    eintraegeSetzen(daten.eintraege.concat(letzteSerie));
    zurueckholenAnzeigen();
    melden(`${letzteSerie.length} Einträge zurück im Rad`);
    letzteSerie = [];
    ergebnis.close();
  });

  $('#btn-serie-kopieren').addEventListener('click', async () => {
    const text = letzteSerie.map((name, i) => `${i + 1}. ${name}`).join('\n');
    melden((await kopieren(text)) ? 'Liste kopiert' : 'Kopieren nicht möglich');
  });

  $('#btn-ergebnis-timer').addEventListener('click', () => {
    ergebnis.close();
    dialogOeffnen('werkzeuge', null, 'timer');
  });

  function gewinnerEntfernen() {
    if (!letzterGewinn) return;
    const liste = daten.eintraege.slice();
    // Normalerweise steht der Gewinner noch am selben Platz; sonst nach Namen suchen.
    const i = liste[letzterGewinn.index] === letzterGewinn.name ? letzterGewinn.index : liste.indexOf(letzterGewinn.name);
    if (i < 0) return;
    liste.splice(i, 1);
    daten.entfernt.push(letzterGewinn.name);
    eintraegeSetzen(liste);
    zurueckholenAnzeigen();
  }

  $('#btn-weiter').addEventListener('click', () => ergebnis.close());

  $('#btn-entfernen').addEventListener('click', () => {
    entfernenBeimSchliessen = true;
    ergebnis.close();
  });

  ergebnis.addEventListener('close', () => {
    if (entfernenBeimSchliessen) gewinnerEntfernen();
    entfernenBeimSchliessen = false;
    letzterGewinn = null;
    ergebnisStand = null;
    zustandMelden();
  });

  // ---------- Verlauf ----------

  function verlaufZeichnen() {
    const liste = $('#verlauf');
    liste.innerHTML = '';
    if (daten.verlauf.length === 0) {
      const li = document.createElement('li');
      li.className = 'leer';
      li.textContent = 'Noch nicht gedreht.';
      liste.appendChild(li);
      return;
    }
    for (const eintrag of daten.verlauf.slice(0, 50)) {
      const li = document.createElement('li');
      const name = document.createElement('span');
      const zeit = document.createElement('time');
      name.textContent = eintrag.name;
      zeit.textContent = new Date(eintrag.zeit).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      li.append(name, zeit);
      liste.appendChild(li);
    }
  }

  function verlaufLeeren() {
    daten.verlauf = [];
    speichern();
    verlaufZeichnen();
    zustandMelden();
  }

  $('#btn-verlauf-leeren').addEventListener('click', verlaufLeeren);

  // ---------- Dialoge (Meine Räder, Teams, Statistik, Einstellungen, Hilfe) ----------

  /** Öffnet einen Dialog; Module hören auf das Ereignis "vorOeffnen", um Inhalte zu füllen. */
  function dialogOeffnen(id, abschnitt, reiter) {
    const dialog = document.getElementById(id);
    if (!dialog || dialog.open || document.body.classList.contains('dreht') || serieLaeuft) return;
    if (document.querySelector('dialog[open]')) return;
    dialog.dispatchEvent(new CustomEvent('vorOeffnen', { detail: { reiter } }));
    dialog.showModal();
    const inhalt = dialog.querySelector('.fenster-inhalt');
    if (inhalt) inhalt.scrollTop = 0;
    // Zu einem Abschnitt springen – nur im Dialog scrollen, nicht die Seite dahinter.
    const ziel = abschnitt && dialog.querySelector('#' + abschnitt);
    if (inhalt && ziel) inhalt.scrollTop += ziel.getBoundingClientRect().top - inhalt.getBoundingClientRect().top - 12;
  }

  document.addEventListener('click', (e) => {
    const oeffner = e.target.closest('[data-oeffnen]');
    if (oeffner) dialogOeffnen(oeffner.dataset.oeffnen, oeffner.dataset.abschnitt, oeffner.dataset.tab);

    const schliesser = e.target.closest('[data-schliessen]');
    if (schliesser) schliesser.closest('dialog').close();

    // Menü "⋯" schließen, wenn woanders hingeklickt wird
    const menue = $('#eintraege-menue');
    if (menue.open && !e.target.closest('#eintraege-menue')) menue.open = false;
  });

  document.querySelectorAll('dialog.fenster, dialog.ergebnis').forEach((dialog) => {
    // Klick auf den abgedunkelten Hintergrund schließt.
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
    // Fokus nicht im geschlossenen Dialog hängen lassen – sonst dreht die Leertaste nicht.
    dialog.addEventListener('close', () => {
      if (dialog.contains(document.activeElement)) document.activeElement.blur();
    });
  });

  // ---------- Tastatur & versteckte Admin-Zugänge ----------

  let tippPuffer = '';

  document.addEventListener('keydown', (e) => {
    const inFeld = e.target.closest('input, textarea, select, [contenteditable]');
    if (inFeld || document.querySelector('dialog[open]')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.code === 'Space' || e.key === 'Enter') {
      // Ein fokussierter Knopf reagiert selbst – außer er steckt in einem geschlossenen Dialog.
      const knopf = e.target.closest('button, summary');
      if (knopf && !knopf.closest('dialog:not([open])')) return;
      e.preventDefault();
      starten();
      return;
    }

    if (e.key.length !== 1) return;
    const taste = e.key.toLowerCase();

    // Geheimwort "admin" irgendwo auf der Seite tippen.
    // (Die Kürzel unten nutzen bewusst keine Buchstaben aus "admin".)
    tippPuffer = (tippPuffer + taste).slice(-5);
    if (tippPuffer === 'admin') {
      tippPuffer = '';
      Admin.oeffnen();
      return;
    }

    if (document.body.classList.contains('dreht')) return;
    if (taste === 'f') vollbildUmschalten();
    else if (taste === 's') tonUmschalten();
    else if (taste === 'h' || taste === '?') dialogOeffnen('hilfe');
    else if (taste === 't') dialogOeffnen('werkzeuge');
  });

  // 5× schnell auf die Überschrift klicken/tippen (für Tablets ohne Tastatur).
  let titelKlicks = [];
  $('#titel').addEventListener('click', () => {
    const jetzt = Date.now();
    titelKlicks = titelKlicks.filter((t) => jetzt - t < 2000).concat(jetzt);
    if (titelKlicks.length >= 5) {
      titelKlicks = [];
      Admin.oeffnen();
    }
  });

  // index.html#admin öffnet den Admin-Bereich direkt (z. B. in einem zweiten Fenster).
  function hashPruefen() {
    if (location.hash === '#admin') Admin.oeffnen();
  }
  window.addEventListener('hashchange', hashPruefen);

  // ---------- Synchronisation zwischen Fenstern ----------

  function vonSpeicherLaden() {
    daten = Speicher.ladeRad();
    eintraegeSetzen(daten.eintraege, { speichern: false });
    titelAnzeigen();
    verlaufZeichnen();
    zurueckholenAnzeigen();
    einstellungenAnwenden();
  }

  window.addEventListener('storage', (e) => {
    if (e.key === Speicher.SCHLUESSEL_ADMIN) {
      Admin.aktualisieren();
      regelnGeaendert();
    }
    if (e.key === Speicher.SCHLUESSEL_RAD) {
      if (document.body.classList.contains('dreht') || serieLaeuft) spaeterNeuLaden = true;
      else vonSpeicherLaden();
    }
  });

  // ---------- Fernbedienung (siehe live.js) ----------

  /** Dreh vom Handy aus. Liefert eine Meldung, wenn es gerade nicht geht, sonst ''. */
  async function fernDrehen() {
    if (document.body.classList.contains('dreht') || serieLaeuft) return 'Das Rad dreht gerade.';
    if (daten.eintraege.length === 0) return 'Im Rad stehen keine Einträge.';
    // Offene Fenster (z. B. das letzte Ergebnis) erst schließen – wie mit „Weiter“.
    // Das close-Ereignis kommt verzögert; erst danach ist z. B. ein Gewinner entfernt.
    const offen = [...document.querySelectorAll('dialog[open]')];
    await Promise.all(
      offen.map((dialog) => new Promise((weiter) => {
        dialog.addEventListener('close', weiter, { once: true });
        setTimeout(weiter, 500);
        dialog.close();
      }))
    );
    if (document.body.classList.contains('dreht') || serieLaeuft) return 'Das Rad dreht gerade.';
    if (daten.eintraege.length === 0) return 'Im Rad stehen keine Einträge.';
    starten();
    return '';
  }

  /** Was die Fernbedienung über den Dreh wissen muss (ohne Admin-Regeln). */
  function liveStand() {
    const lauf = aktuellerDreh && aktuellerDreh.animation.laufInfo();
    return {
      dreh: lauf
        ? {
            ziel: aktuellerDreh.eintraege[aktuellerDreh.index],
            restMs: Math.round(lauf.restMs),
            gesamtMs: Math.round(lauf.gesamtMs),
            umlenkbarMs: Math.round(lauf.umlenkbarMs),
          }
        : null,
      serie: serieStand ? { gesamt: serieStand.gesamt, gezogen: serieStand.gezogen.slice() } : null,
      ergebnis: ergebnis.open ? ergebnisStand : null,
      optionen: aktuellerDreh ? aktuellerDreh.optionen : ziehOptionen(),
    };
  }

  // ---------- Schnittstelle für die Zusatzmodule ----------

  window.App = {
    get daten() {
      return daten;
    },
    get dreht() {
      return document.body.classList.contains('dreht');
    },
    speichern,
    melden,
    kopieren,
    herunterladen,
    textZuEintraegen,
    eintraegeSetzen,
    verlaufLeeren,
    einstellungenAnwenden,
    dialogOeffnen,
    fernDrehen,
    liveStand,
    regelnGeaendert,
    ergebnisSchliessen() {
      if (ergebnis.open) ergebnis.close();
    },
    titelSetzen(titel) {
      daten.titel = titel;
      speichern();
      titelAnzeigen();
      zustandMelden();
    },
    /**
     * Geprüfte Sicherung übernehmen (siehe Paket.sicherungPruefen): aktuelles Rad und
     * Einstellungen ersetzen, gespeicherte Räder zusammenführen (gleicher Name = ersetzt).
     */
    sicherungEinspielen(sicherung) {
      const neueNamen = new Set(sicherung.gespeichert.map((r) => r.name.toLowerCase()));
      daten.gespeichert = sicherung.gespeichert.concat(daten.gespeichert.filter((r) => !neueNamen.has(r.name.toLowerCase())));
      daten.titel = sicherung.titel;
      daten.eintraege = sicherung.eintraege;
      daten.entfernt = [];
      daten.einstellungen = Object.assign({}, Speicher.STANDARD_EINSTELLUNGEN, sicherung.einstellungen);
      daten.ton = sicherung.ton;
      speichern();
      vonSpeicherLaden();
    },
    /** Ganzes Rad ersetzen (Titel + Einträge), z. B. beim Öffnen eines gespeicherten Rads. */
    radLaden(titel, eintraege) {
      daten.titel = titel;
      daten.entfernt = [];
      eintraegeSetzen(eintraege);
      titelAnzeigen();
      zurueckholenAnzeigen();
      zustandMelden();
    },
  };

  // ---------- Start ----------

  vonSpeicherLaden();
  hashPruefen();
})();
