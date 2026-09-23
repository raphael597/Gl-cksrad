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

  const eingabe = $('#eintraege');
  const titelFeld = $('#rad-titel');
  const zeiger = $('#zeiger');
  const rad = new Rad($('#rad'), { onTick: tick });

  Admin.init({ holeEintraege: () => daten.eintraege });

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
    const elemente = [eingabe, titelFeld, $('#btn-mischen'), $('#btn-sortieren'), $('#btn-drehen'), $('#btn-mitte'), $('#btn-zurueckholen')];
    for (const el of elemente) el.disabled = gesperrt;
    $('#eintraege-menue').open = false;
  }

  async function drehen() {
    const eintraege = daten.eintraege.slice();
    if (rad.dreht || document.querySelector('dialog[open]')) return;
    if (eintraege.length === 0) {
      eingabe.focus();
      melden('Erst Einträge hinzufügen');
      return;
    }

    Ton.bereit();
    const admin = Speicher.ladeAdmin(); // frisch lesen – evtl. in einem anderen Fenster geändert
    const auswahl = Logik.waehleGewinner(eintraege, admin);
    const tempo = DREHDAUER[daten.einstellungen.dauer] || DREHDAUER.normal;
    const ziel = Logik.zielRotation(rad.rotation, auswahl.index, eintraege.length, Math.random, {
      minUmdrehungen: tempo.umdrehungen[0],
      maxUmdrehungen: tempo.umdrehungen[1],
    });

    bedienungSperren(true);
    await rad.drehenZu(ziel, zufallZwischen(tempo.ms[0], tempo.ms[1]));
    bedienungSperren(false);

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

    if (spaeterNeuLaden) {
      spaeterNeuLaden = false;
      vonSpeicherLaden();
    }

    ergebnisZeigen(name, index);
  }

  $('#btn-drehen').addEventListener('click', drehen);
  $('#btn-mitte').addEventListener('click', drehen);

  // ---------- Ergebnis ----------

  const ergebnis = $('#ergebnis');

  function ergebnisZeigen(name, index) {
    const auto = daten.einstellungen.autoEntfernen;
    letzterGewinn = { name, index };
    entfernenBeimSchliessen = auto;
    $('#ergebnis-label').textContent = daten.einstellungen.ergebnisText || Speicher.STANDARD_EINSTELLUNGEN.ergebnisText;
    $('#ergebnis-name').textContent = name;
    $('#ergebnis-hinweis').hidden = !auto;
    $('#btn-entfernen').hidden = auto;
    ergebnis.showModal();
    Ton.gewinn();
    if (daten.einstellungen.konfetti) Konfetti.starten($('#konfetti'));
  }

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
  function dialogOeffnen(id, abschnitt) {
    const dialog = document.getElementById(id);
    if (!dialog || dialog.open || rad.dreht) return;
    if (document.querySelector('dialog[open]')) return;
    dialog.dispatchEvent(new CustomEvent('vorOeffnen'));
    dialog.showModal();
    const inhalt = dialog.querySelector('.fenster-inhalt');
    if (inhalt) inhalt.scrollTop = 0;
    // Zu einem Abschnitt springen – nur im Dialog scrollen, nicht die Seite dahinter.
    const ziel = abschnitt && dialog.querySelector('#' + abschnitt);
    if (inhalt && ziel) inhalt.scrollTop += ziel.getBoundingClientRect().top - inhalt.getBoundingClientRect().top - 12;
  }

  document.addEventListener('click', (e) => {
    const oeffner = e.target.closest('[data-oeffnen]');
    if (oeffner) dialogOeffnen(oeffner.dataset.oeffnen, oeffner.dataset.abschnitt);

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
      drehen();
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
      if (rad.dreht) spaeterNeuLaden = true;
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
    titelSetzen(titel) {
      daten.titel = titel;
      speichern();
      titelAnzeigen();
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
