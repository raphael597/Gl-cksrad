/*
 * admin.js – der versteckte Admin-Bereich.
 *
 * Alle Änderungen werden sofort gespeichert. Die Hauptseite liest die
 * Admin-Einstellungen bei jedem Dreh frisch aus dem Speicher – auch wenn der
 * Admin-Bereich in einem zweiten Fenster (index.html#admin) offen ist.
 */
(function (global) {
  'use strict';

  const { Logik, Speicher } = global;
  const $ = (sel) => document.querySelector(sel);
  const ENTSPERRT = 'gluecksrad.admin.entsperrt'; // sessionStorage: gilt bis Tab geschlossen

  let holeEintraege = () => [];
  let holeOptionen = () => ({}); // z. B. { ausschliessen: [letzter Gewinner] }
  let beiAenderung = () => {}; // app.js: z. B. laufende Drehung umlenken, Handy informieren
  let simulation = null; // { [schluessel]: Anteil } nach "1000× simulieren"

  const dialog = $('#admin');
  const login = $('#admin-login');
  const panel = $('#admin-panel');

  function istEntsperrt() {
    try {
      return sessionStorage.getItem(ENTSPERRT) === '1';
    } catch (e) {
      return false;
    }
  }

  function setzeEntsperrt(wert) {
    try {
      if (wert) sessionStorage.setItem(ENTSPERRT, '1');
      else sessionStorage.removeItem(ENTSPERRT);
    } catch (e) {
      /* egal */
    }
  }

  function aendern(veraenderung) {
    const admin = Speicher.ladeAdmin();
    veraenderung(admin);
    Speicher.speichereAdmin(admin);
    simulation = null;
    werteAktualisieren();
    beiAenderung();
  }

  const prozent = (x) => (x * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %';

  /** Einträge ohne Doppelte (nach Schlüssel), in Rad-Reihenfolge. */
  function eindeutigeEintraege() {
    const gesehen = new Set();
    return holeEintraege().filter((name) => {
      const k = Logik.schluessel(name);
      if (gesehen.has(k)) return false;
      gesehen.add(k);
      return true;
    });
  }

  // ---------- Aufbau ----------

  /** Baut Tabelle und Auswahlliste neu (wenn sich die Einträge ändern). */
  function aufbauen() {
    const tbody = $('#admin-tabelle');
    tbody.innerHTML = '';
    const namen = eindeutigeEintraege();

    if (namen.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="leer">Noch keine Einträge im Rad.</td></tr>';
    }

    for (const name of namen) {
      const zeile = document.createElement('tr');
      zeile.dataset.key = Logik.schluessel(name);
      zeile.innerHTML = `
        <td class="name"></td>
        <td class="gewicht">
          <input type="range" min="0" max="10" step="1" aria-label="Gewicht">
          <output></output>
          <button type="button" class="nie-btn" title="Nie ziehen an/aus">🚫</button>
        </td>
        <td class="zahl chance"></td>
        <td class="zahl sim"></td>`;
      zeile.querySelector('.name').textContent = name;
      tbody.appendChild(zeile);
    }

    werteAktualisieren();
  }

  /** Aktualisiert nur die Werte (Regler bleiben dabei bedienbar). */
  function werteAktualisieren() {
    const admin = Speicher.ladeAdmin();
    const eintraege = holeEintraege();
    const regeln = holeOptionen();
    const analyse = Logik.analyse(eintraege, admin, regeln);
    const { wahrscheinlichkeiten, modus } = analyse;

    // Chancen pro Name aufsummieren (falls ein Name mehrfach im Rad steht).
    const chance = {};
    eintraege.forEach((name, i) => {
      const k = Logik.schluessel(name);
      chance[k] = (chance[k] || 0) + wahrscheinlichkeiten[i];
    });

    $('#admin-aktiv').checked = !!admin.aktiv;
    panel.classList.toggle('inaktiv', !admin.aktiv);

    document.querySelectorAll('#admin-tabelle tr[data-key]').forEach((zeile) => {
      const k = zeile.dataset.key;
      const g = Logik.gewichtVon(k, admin);
      const regler = zeile.querySelector('input');
      if (document.activeElement !== regler) regler.value = g;
      zeile.querySelector('output').textContent = g === 0 ? 'nie' : g + '×';
      zeile.classList.toggle('gesperrt', g === 0);
      zeile.classList.toggle('erzwungen', modus === 'erzwungen' && chance[k] > 0);
      zeile.querySelector('.chance').textContent = prozent(chance[k] || 0);
      zeile.querySelector('.sim').textContent = simulation ? prozent(simulation[k] || 0) : '–';
    });

    // Auswahl "nächstes Ergebnis"
    const auswahl = $('#admin-naechster');
    const namen = eindeutigeEintraege();
    const optionen = [['', '— zufällig (nach Gewichtung) —']].concat(namen.map((n) => [n, n]));
    const imRad = namen.some((n) => Logik.schluessel(n) === Logik.schluessel(admin.naechster || ''));
    if (admin.naechster && !imRad) optionen.push([admin.naechster, admin.naechster + ' (nicht im Rad)']);
    auswahl.innerHTML = '';
    for (const [wert, text] of optionen) {
      const opt = document.createElement('option');
      opt.value = wert;
      opt.textContent = text;
      auswahl.appendChild(opt);
    }
    auswahl.value = optionen.find(([w]) => Logik.schluessel(w) === Logik.schluessel(admin.naechster || ''))[0];
    $('#admin-dauerhaft').checked = !!admin.naechsterDauerhaft;
    reihenfolgeZeichnen(admin, namen, analyse);

    const ausgelassen = modus !== 'erzwungen' && regeln.ausschliessen ? regeln.ausschliessen[0] : '';
    $('#admin-modus').textContent =
      modusText(analyse, admin, eintraege) +
      (ausgelassen ? ` Außerdem ist „${ausgelassen}“ diesmal ausgeschlossen („nicht zweimal hintereinander“).` : '');
    $('#admin-modus').dataset.modus = modus;
  }

  function modusText({ modus, quelle, reihenfolgePos }, admin, eintraege) {
    if (!admin.aktiv) return 'Aus – das Rad dreht fair, alle haben die gleiche Chance.';
    if (eintraege.length === 0) return 'Keine Einträge im Rad.';
    if (modus === 'erzwungen' && quelle === 'reihenfolge') {
      return `Der nächste Dreh landet auf „${admin.reihenfolge[reihenfolgePos]}“ (aus der Reihenfolge).`;
    }
    if (modus === 'erzwungen') {
      return `Der ${admin.naechsterDauerhaft ? 'Dreh landet immer' : 'nächste Dreh landet'} auf „${admin.naechster}“.`;
    }
    if (modus === 'notfall') return '⚠️ Alle Einträge stehen auf 0 – das Rad wählt deshalb fair aus.';
    const gesperrt = eindeutigeEintraege().filter((n) => Logik.gewichtVon(n, admin) === 0).length;
    if (modus === 'fair') return 'Aktiv, aber alle Gewichte sind gleich – das Rad ist gerade fair.';
    return gesperrt > 0
      ? `Aktiv – ${gesperrt} ${gesperrt === 1 ? 'Eintrag kommt' : 'Einträge kommen'} nie dran.`
      : 'Aktiv – die Gewichtung wird angewendet.';
  }

  /** Liste „Reihenfolge“ und Auswahl zum Anhängen. */
  function reihenfolgeZeichnen(admin, namen, analyse) {
    const liste = $('#admin-reihenfolge');
    const reihe = Array.isArray(admin.reihenfolge) ? admin.reihenfolge : [];
    const imRad = new Set(namen.map(Logik.schluessel));
    liste.textContent = '';
    if (reihe.length === 0) {
      const li = document.createElement('li');
      li.className = 'leer';
      li.textContent = 'Leer – gezogen wird nach der Gewichtung.';
      liste.appendChild(li);
    }
    reihe.forEach((name, pos) => {
      const li = document.createElement('li');
      li.dataset.pos = pos;
      li.dataset.name = name;
      const text = document.createElement('span');
      text.textContent = name || '🎲 Zufall';
      li.classList.toggle('fehlt', name !== '' && !imRad.has(Logik.schluessel(name)));
      li.classList.toggle('kopf', analyse.quelle === 'reihenfolge' && analyse.reihenfolgePos === pos);
      const weg = document.createElement('button');
      weg.type = 'button';
      weg.className = 'icon-btn klein-btn';
      weg.textContent = '✕';
      weg.setAttribute('aria-label', `${name || 'Zufall'} aus der Reihenfolge streichen`);
      li.append(text, weg);
      liste.appendChild(li);
    });

    const einmal = admin.reihenfolgeEinmal === true;
    $('#admin-reihe-einmal').checked = einmal;
    const drin = new Set(reihe.map(Logik.schluessel));
    const auswahl = $('#admin-reihe-name');
    const vorher = auswahl.value;
    auswahl.textContent = '';
    for (const [wert, beschriftung] of [['', '🎲 Zufall']].concat(namen.map((n) => [n, n]))) {
      const opt = document.createElement('option');
      opt.value = wert;
      opt.textContent = beschriftung;
      // „Nur einmal“: wer schon in der Reihenfolge steht, kann nicht nochmal gewählt werden
      if (einmal && wert && drin.has(Logik.schluessel(wert))) {
        opt.disabled = true;
        opt.textContent += ' ✓';
      }
      auswahl.appendChild(opt);
    }
    const erlaubt = [...auswahl.options].filter((o) => !o.disabled);
    if (erlaubt.some((o) => o.value === vorher)) auswahl.value = vorher;
    else if (erlaubt.length) auswahl.value = erlaubt[0].value;
  }

  function simulieren() {
    const admin = Speicher.ladeAdmin();
    const eintraege = holeEintraege();
    const runden = 1000;
    const zaehler = {};
    for (let i = 0; i < runden; i++) {
      const { index } = Logik.waehleGewinner(eintraege, admin, Math.random, holeOptionen());
      if (index < 0) break;
      const k = Logik.schluessel(eintraege[index]);
      zaehler[k] = (zaehler[k] || 0) + 1;
    }
    simulation = {};
    for (const k in zaehler) simulation[k] = zaehler[k] / runden;
    werteAktualisieren();
  }

  // ---------- Öffnen / Schließen ----------

  function oeffnen() {
    if (dialog.open) return;
    const entsperrt = istEntsperrt();
    login.hidden = entsperrt;
    panel.hidden = !entsperrt;
    if (entsperrt) aufbauen();
    dialog.showModal();
    if (!entsperrt) {
      $('#admin-pin').value = '';
      $('#admin-fehler').hidden = true;
      $('#admin-pin').focus();
    }
  }

  function schliessen() {
    if (dialog.open) dialog.close();
  }

  // ---------- Ereignisse ----------

  dialog.addEventListener('close', () => {
    if (dialog.contains(document.activeElement)) document.activeElement.blur();
    if (location.hash === '#admin') history.replaceState(null, '', location.pathname + location.search);
  });

  login.addEventListener('submit', (e) => {
    e.preventDefault();
    if ($('#admin-pin').value === String(Speicher.ladeAdmin().pin)) {
      setzeEntsperrt(true);
      login.hidden = true;
      panel.hidden = false;
      aufbauen();
    } else {
      $('#admin-fehler').hidden = false;
      login.classList.remove('wackeln');
      void login.offsetWidth; // Animation neu starten
      login.classList.add('wackeln');
      $('#admin-pin').select();
    }
  });

  $('#admin-abbrechen').addEventListener('click', schliessen);
  $('#admin-schliessen').addEventListener('click', schliessen);

  $('#admin-aktiv').addEventListener('change', (e) => aendern((a) => (a.aktiv = e.target.checked)));

  $('#admin-naechster').addEventListener('change', (e) => aendern((a) => (a.naechster = e.target.value)));
  $('#admin-dauerhaft').addEventListener('change', (e) => aendern((a) => (a.naechsterDauerhaft = e.target.checked)));

  function gewichtSetzen(key, wert) {
    aendern((a) => {
      a.gewichte = a.gewichte || {};
      if (wert === 1) delete a.gewichte[key];
      else a.gewichte[key] = wert;
    });
  }

  $('#admin-tabelle').addEventListener('input', (e) => {
    if (e.target.type !== 'range') return;
    gewichtSetzen(e.target.closest('tr').dataset.key, Number(e.target.value));
  });

  $('#admin-tabelle').addEventListener('click', (e) => {
    const knopf = e.target.closest('.nie-btn');
    if (!knopf) return;
    const key = knopf.closest('tr').dataset.key;
    const jetzt = Logik.gewichtVon(key, Speicher.ladeAdmin());
    gewichtSetzen(key, jetzt === 0 ? 1 : 0);
  });

  const reiheAendern = (schritte) => aendern((a) => Object.assign(a, Logik.reihenfolgeAendern(a, schritte)));
  $('#admin-reihe-einmal').addEventListener('change', (e) => reiheAendern([{ einmal: e.target.checked }]));
  $('#admin-reihe-plus').addEventListener('click', () => reiheAendern([{ plus: $('#admin-reihe-name').value }]));
  $('#admin-reihe-leeren').addEventListener('click', () => reiheAendern([{ leeren: true }]));
  $('#admin-reihenfolge').addEventListener('click', (e) => {
    const zeile = e.target.closest('button') && e.target.closest('li[data-pos]');
    if (zeile) reiheAendern([{ minus: Number(zeile.dataset.pos), name: zeile.dataset.name }]);
  });

  $('#admin-simulieren').addEventListener('click', simulieren);
  $('#admin-alle-normal').addEventListener('click', () => aendern((a) => (a.gewichte = {})));

  $('#admin-schummel-link').addEventListener('click', async () => {
    const info = $('#admin-link-info');
    const ausgabe = $('#admin-link-ausgabe');
    const feld = $('#admin-link-text');
    let link;
    try {
      const paket = Paket.schummelLinkErstellen(App.daten, Speicher.ladeAdmin());
      link = `${location.href.split('#')[0]}#r=${Paket.schummelKurzKodieren(paket)}`;
    } catch (e) {
      ausgabe.hidden = true;
      info.textContent = 'Link nicht erstellt. Bitte Einträge, Reihenfolge und Einstellungen prüfen.';
      return;
    }
    feld.value = link;
    ausgabe.hidden = false;
    let kopiert = false;
    // Das sichtbare Feld liegt im modalen Dialog und lässt sich in Safari
    // zuverlässiger kopieren als ein unsichtbares Feld außerhalb davon.
    feld.focus();
    feld.select();
    try {
      kopiert = document.execCommand('copy');
    } catch (e) {
      // Modernen Zwischenablage-Weg darunter versuchen.
    }
    if (!kopiert) {
      try {
        kopiert = await App.kopieren(link);
      } catch (e) {
        // Der Link bleibt im Dialog zum manuellen Kopieren verfügbar.
      }
    }
    info.textContent = kopiert ? 'Link kopiert.' : 'Automatisches Kopieren nicht möglich. Link unten markieren und kopieren.';
    if (!kopiert) {
      feld.focus();
      feld.select();
    }
  });

  $('#admin-pin-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const neu = $('#admin-neue-pin').value.trim();
    if (neu.length < 4) return;
    aendern((a) => (a.pin = neu));
    $('#admin-neue-pin').value = '';
    $('#admin-pin-info').hidden = false;
    setTimeout(() => ($('#admin-pin-info').hidden = true), 2500);
  });

  $('#admin-sperren').addEventListener('click', () => {
    setzeEntsperrt(false);
    schliessen();
  });

  $('#admin-reset').addEventListener('click', () => {
    if (!confirm('Alle Gewichte und den festgelegten Gewinner zurücksetzen? (Die PIN bleibt.)')) return;
    Speicher.adminZuruecksetzen();
    simulation = null;
    werteAktualisieren();
    beiAenderung();
  });

  global.Admin = {
    /** app.js gibt hier eine Funktion rein, die die aktuellen Einträge liefert. */
    init(optionen) {
      holeEintraege = optionen.holeEintraege;
      if (optionen.holeOptionen) holeOptionen = optionen.holeOptionen;
      if (optionen.beiAenderung) beiAenderung = optionen.beiAenderung;
    },
    oeffnen,
    /** Nach Änderungen an den Einträgen oder dem Speicher aufrufen. */
    aktualisieren() {
      if (dialog.open && !panel.hidden) {
        simulation = null;
        aufbauen();
      }
    },
  };
})(window);
