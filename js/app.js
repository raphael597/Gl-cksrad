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
  let letzteSerie = []; // Namen der letzten Serie – für "Alle zurück ins Rad"

  const eingabe = $('#eintraege');
  const titelFeld = $('#rad-titel');
  const zeiger = $('#zeiger');
  const rad = new Rad($('#rad'), { onTick: tick });

  /** Zusätzliche Regeln für die Auswahl, z. B. "nicht zweimal hintereinander". */
  function ziehOptionen() {
    const letzter = daten.verlauf[0];
    return daten.einstellungen.nichtDoppelt && letzter ? { ausschliessen: [letzter.name] } : {};
  }

  Admin.init({ holeEintraege: () => daten.eintraege, holeOptionen: ziehOptionen });

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
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const feld = document.createElement('textarea');
      feld.value = text;
      feld.style.position = 'fixed';
      feld.style.opacity = '0';
      document.body.appendChild(feld);
      feld.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (e2) {
        ok = false;
      }
      feld.remove();
      return ok;
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
    if (textfeld) eingabe.value = liste.join('\n');
    $('#anzahl').textContent = liste.length;
    Admin.aktualisieren();
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
    $('#btn-drehen').textContent = anzahl > 1 ? `${anzahl} Gewinner ziehen` : 'Rad drehen';
  }

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
    const elemente = [eingabe, titelFeld, $('#btn-mischen'), $('#btn-sortieren'), $('#btn-drehen'), $('#btn-mitte'), $('#btn-zurueckholen'), $('#anzahl-ziehen')];
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
    const auswahl = Logik.waehleGewinner(eintraege, admin, Math.random, ziehOptionen());
    const tempo = DREHDAUER[daten.einstellungen.dauer] || DREHDAUER.normal;
    const ziel = Logik.zielRotation(rad.rotation, auswahl.index, eintraege.length, Math.random, {
      minUmdrehungen: tempo.umdrehungen[0],
      maxUmdrehungen: tempo.umdrehungen[1],
    });

    await rad.drehenZu(ziel, zufallZwischen(tempo.ms[0], tempo.ms[1]));

    // Ergebnis immer aus der tatsächlichen Radstellung ablesen.
    const index = Logik.indexUnterZeiger(rad.rotation, eintraege.length);
    const name = eintraege[index];

    // Ein einmalig festgelegter Gewinner ist jetzt verbraucht.
    if (auswahl.modus === 'erzwungen' && !admin.naechsterDauerhaft) {
      const aktuell = Speicher.ladeAdmin();
      aktuell.naechster = '';
      Speicher.speichereAdmin(aktuell);
    }

    daten.verlauf.unshift({ name, zeit: Date.now() });
    daten.verlauf = daten.verlauf.slice(0, VERLAUF_MAX);
    speichern();
    verlaufZeichnen();
    return { name, index };
  }

  function kannDrehen() {
    if (rad.dreht || serieLaeuft || document.querySelector('dialog[open]')) return false;
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
    bedienungSperren(false);
    zurueckholenAnzeigen();
    nachDemDrehen();
    serieZeigen(serie);
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
    $('#ergebnis-label').textContent = daten.einstellungen.ergebnisText || Speicher.STANDARD_EINSTELLUNGEN.ergebnisText;
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
  }

  $('#btn-verlauf-leeren').addEventListener('click', verlaufLeeren);

  // ---------- Dialoge (Meine Räder, Teams, Statistik, Einstellungen, Hilfe) ----------

  /** Öffnet einen Dialog; Module hören auf das Ereignis "vorOeffnen", um Inhalte zu füllen. */
  function dialogOeffnen(id, abschnitt, reiter) {
    const dialog = document.getElementById(id);
    if (!dialog || dialog.open || rad.dreht || serieLaeuft) return;
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

    if (rad.dreht) return;
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
    if (e.key === Speicher.SCHLUESSEL_ADMIN) Admin.aktualisieren();
    if (e.key === Speicher.SCHLUESSEL_RAD) {
      if (rad.dreht || serieLaeuft) spaeterNeuLaden = true;
      else vonSpeicherLaden();
    }
  });

  // ---------- Schnittstelle für die Zusatzmodule ----------

  window.App = {
    get daten() {
      return daten;
    },
    get dreht() {
      return rad.dreht;
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
    titelSetzen(titel) {
      daten.titel = titel;
      speichern();
      titelAnzeigen();
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
    },
  };

  // ---------- Start ----------

  vonSpeicherLaden();
  hashPruefen();
})();
