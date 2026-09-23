/*
 * listen.js – alles rund um Listen:
 *   - "Meine Räder": mehrere Listen speichern, öffnen, löschen
 *   - Menü "⋯": Datei laden/speichern, Link teilen, Doppelte entfernen, Alle löschen
 *   - Geteilte Links (index.html#liste=…) beim Öffnen übernehmen
 *   - Übertragung/Sicherung: aktuelles Rad, gespeicherte Räder und Einstellungen
 *     per Link (index.html#sicherung=…) oder Datei – ohne Admin-Einstellungen
 */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const MAX_EINTRAEGE = 500;
  const { kodieren, dekodieren } = Paket;

  const datum = (zeit) =>
    new Date(zeit).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const menueSchliessen = () => ($('#eintraege-menue').open = false);

  /** Einträge absichern (z. B. aus Dateien oder Links): nur Text, begrenzte Länge/Anzahl. */
  const bereinigen = Paket.eintraegePruefen;

  // ---------- Meine Räder ----------

  const raederDialog = $('#raeder');

  function raederZeichnen() {
    const ul = $('#raeder-liste');
    ul.innerHTML = '';
    const gespeichert = App.daten.gespeichert;

    if (gespeichert.length === 0) {
      ul.innerHTML = '<li class="leer">Noch keine Räder gespeichert. Gib oben einen Namen ein und klicke auf „Speichern“.</li>';
      return;
    }

    gespeichert.forEach((rad, i) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="rad-info">
          <strong></strong>
          <span class="klein"></span>
        </div>
        <button type="button" class="btn btn-gold" data-aktion="oeffnen">Öffnen</button>
        <button type="button" class="icon-btn" data-aktion="loeschen" title="Löschen" aria-label="Löschen">🗑</button>`;
      li.dataset.index = i;
      li.querySelector('strong').textContent = rad.name;
      li.querySelector('.klein').textContent = `${rad.eintraege.length} Einträge · ${datum(rad.zeit)}`;
      ul.appendChild(li);
    });
  }

  raederDialog.addEventListener('vorOeffnen', () => {
    $('#rad-speichern-name').value = App.daten.titel || '';
    raederZeichnen();
  });

  $('#rad-speichern-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#rad-speichern-name').value.trim();
    if (!name) return;
    const daten = App.daten;
    const vorhanden = daten.gespeichert.findIndex((r) => r.name.toLowerCase() === name.toLowerCase());
    if (vorhanden >= 0 && !confirm(`„${daten.gespeichert[vorhanden].name}“ gibt es schon. Überschreiben?`)) return;

    const eintrag = { name, eintraege: daten.eintraege.slice(), zeit: Date.now() };
    if (vorhanden >= 0) daten.gespeichert.splice(vorhanden, 1);
    daten.gespeichert.unshift(eintrag); // zuletzt gespeichert steht oben
    App.titelSetzen(name); // speichert auch
    raederZeichnen();
    App.melden(`„${name}“ gespeichert`);
  });

  $('#raeder-liste').addEventListener('click', (e) => {
    const knopf = e.target.closest('[data-aktion]');
    if (!knopf) return;
    const i = Number(knopf.closest('li').dataset.index);
    const rad = App.daten.gespeichert[i];
    if (!rad) return;

    if (knopf.dataset.aktion === 'oeffnen') {
      App.radLaden(rad.name, rad.eintraege.slice());
      raederDialog.close();
      App.melden(`„${rad.name}“ geöffnet`);
    } else if (knopf.dataset.aktion === 'loeschen') {
      if (!confirm(`„${rad.name}“ wirklich löschen?`)) return;
      App.daten.gespeichert.splice(i, 1);
      App.speichern();
      raederZeichnen();
    }
  });

  $('#btn-neues-rad').addEventListener('click', () => {
    if (App.daten.eintraege.length > 0 && !confirm('Neues leeres Rad anlegen? Nicht gespeicherte Einträge gehen verloren.')) return;
    App.radLaden('', []);
    raederDialog.close();
    $('#eintraege').focus();
  });

  // ---------- Datei laden / speichern ----------

  /** Bei CSV nur die erste Spalte nehmen – auch wenn sie in Anführungszeichen steht. */
  function ersteSpalte(zeile) {
    const inAnfuehrung = zeile.match(/^\s*"((?:[^"]|"")*)"/);
    if (inAnfuehrung) return inAnfuehrung[1].replace(/""/g, '"');
    return zeile.split(/[;,\t]/)[0];
  }

  $('#btn-datei-laden').addEventListener('click', () => {
    menueSchliessen();
    $('#datei-eingabe').click();
  });

  $('#datei-eingabe').addEventListener('change', async (e) => {
    const datei = e.target.files[0];
    e.target.value = ''; // gleiche Datei nochmal auswählbar
    if (!datei) return;
    const text = (await datei.text()).replace(/^\uFEFF/, ''); // BOM entfernen
    const istCsv = /\.csv$/i.test(datei.name);
    const zeilen = text.split(/\r?\n/).map((z) => (istCsv ? ersteSpalte(z) : z));
    const liste = bereinigen(zeilen);
    if (liste.length === 0) {
      App.melden('Keine Einträge in der Datei gefunden');
      return;
    }
    App.radLaden(datei.name.replace(/\.(txt|csv)$/i, ''), liste);
    App.melden(`${liste.length} Einträge geladen`);
  });

  $('#btn-datei-speichern').addEventListener('click', () => {
    menueSchliessen();
    const name = (App.daten.titel || 'gluecksrad').replace(/[\\/:*?"<>|]+/g, '_');
    App.herunterladen(`${name}.txt`, App.daten.eintraege.join('\n') + '\n');
  });

  // ---------- Teilen per Link ----------

  $('#btn-teilen').addEventListener('click', async () => {
    menueSchliessen();
    const basis = location.href.split('#')[0];
    const link = `${basis}#liste=${kodieren({ t: App.daten.titel, e: App.daten.eintraege })}`;
    const ok = await App.kopieren(link);
    if (ok) App.melden('Link kopiert');
    else prompt('Link zum Kopieren:', link);
  });

  function geteilteListePruefen() {
    const treffer = location.hash.match(/^#liste=(.+)$/);
    if (!treffer) return;
    history.replaceState(null, '', location.pathname + location.search);
    try {
      const paket = dekodieren(treffer[1]);
      const liste = bereinigen(Array.isArray(paket.e) ? paket.e : []);
      const titel = typeof paket.t === 'string' ? paket.t.slice(0, 60) : '';
      if (liste.length === 0) return;
      const beschreibung = titel ? `„${titel}“ (${liste.length} Einträge)` : `${liste.length} Einträge`;
      if (confirm(`Geteilte Liste ${beschreibung} laden? Die aktuelle Liste wird ersetzt.`)) {
        App.radLaden(titel, liste);
        App.melden('Geteilte Liste geladen');
      }
    } catch (e) {
      App.melden('Der Link ist ungültig');
    }
  }

  window.addEventListener('hashchange', geteilteListePruefen);

  // ---------- Übertragung / Sicherung (ohne Admin-Einstellungen) ----------

  /** Rückfrage und Übernahme einer (noch ungeprüften) Sicherung aus Link oder Datei. */
  function sicherungAnbieten(roh) {
    let sicherung;
    try {
      sicherung = Paket.sicherungPruefen(roh, Speicher.STANDARD_EINSTELLUNGEN);
    } catch (e) {
      App.melden('Die Übertragung ist ungültig');
      return;
    }
    const frage =
      `${Paket.beschreiben(sicherung)} übernehmen?\n\n` +
      'Das aktuelle Rad und die Einstellungen werden ersetzt, gespeicherte Räder kommen dazu ' +
      '(Räder mit gleichem Namen werden überschrieben).';
    if (!confirm(frage)) return;
    App.sicherungEinspielen(sicherung);
    if (raederDialog.open) raederZeichnen();
    App.melden('Übertragung übernommen');
  }

  $('#btn-sicherung-link').addEventListener('click', async () => {
    const basis = location.href.split('#')[0];
    const link = `${basis}#sicherung=${kodieren(Paket.sicherungErstellen(App.daten))}`;
    const ok = await App.kopieren(link);
    if (ok) App.melden('Übertragungs-Link kopiert');
    else prompt('Übertragungs-Link zum Kopieren:', link);
  });

  $('#btn-sicherung-datei').addEventListener('click', () => {
    const datum = new Date().toISOString().slice(0, 10);
    App.herunterladen(`gluecksrad-sicherung-${datum}.json`, JSON.stringify(Paket.sicherungErstellen(App.daten), null, 2), 'application/json');
  });

  $('#btn-sicherung-laden').addEventListener('click', () => $('#sicherung-eingabe').click());

  $('#sicherung-eingabe').addEventListener('change', async (e) => {
    const datei = e.target.files[0];
    e.target.value = '';
    if (!datei) return;
    try {
      sicherungAnbieten(JSON.parse(await datei.text()));
    } catch (fehler) {
      App.melden('Die Datei ist keine gültige Sicherung');
    }
  });

  function sicherungsLinkPruefen() {
    const treffer = location.hash.match(/^#sicherung=(.+)$/);
    if (!treffer) return;
    history.replaceState(null, '', location.pathname + location.search);
    let roh;
    try {
      roh = dekodieren(treffer[1]);
    } catch (e) {
      App.melden('Der Übertragungs-Link ist ungültig');
      return;
    }
    sicherungAnbieten(roh);
  }

  window.addEventListener('hashchange', sicherungsLinkPruefen);

  // ---------- Schummel-Link (aus dem entsperrten Admin-Bereich) ----------

  function schummelLinkPruefen() {
    const treffer = location.hash.match(/^#schummel=(.+)$/);
    if (!treffer) return;
    history.replaceState(null, '', location.pathname + location.search);
    try {
      const paket = Paket.schummelLinkPruefen(Paket.dekodieren(treffer[1]));
      // Die Empfänger-PIN bleibt erhalten; nur die Regeln dieses Links gelten.
      const bisher = Speicher.ladeAdmin();
      App.radLaden(paket.titel, paket.eintraege);
      Speicher.speichereAdmin(Paket.adminRegelnUebernehmen(bisher, paket));
      Admin.aktualisieren();
      App.melden('Geteiltes Rad geladen');
    } catch (e) {
      App.melden('Der Link ist ungültig');
    }
  }

  window.addEventListener('hashchange', schummelLinkPruefen);

  // ---------- Zahlenreihe (z. B. Schülernummern) ----------

  $('#btn-zahlenreihe').addEventListener('click', () => {
    menueSchliessen();
    const antwort = prompt('Zahlenreihe einfügen – von bis (z. B. 1-30).\nDie aktuelle Liste wird ersetzt.', '1-30');
    if (antwort === null) return;
    // erlaubt: "1-30", "1 – 30", "1 bis 30" oder nur "30" (= 1 bis 30)
    const treffer = antwort.match(/^\s*(\d+)\s*(?:-|–|bis|\.\.)\s*(\d+)\s*$/i) || antwort.match(/^\s*()(\d+)\s*$/);
    if (!treffer) {
      App.melden('Bitte z. B. „1-30“ eingeben');
      return;
    }
    let von = treffer[1] === '' ? 1 : Number(treffer[1]);
    let bis = Number(treffer[2]);
    if (von > bis) [von, bis] = [bis, von];
    if (bis - von + 1 > MAX_EINTRAEGE) {
      App.melden(`Höchstens ${MAX_EINTRAEGE} Zahlen auf einmal`);
      return;
    }
    const liste = [];
    for (let z = von; z <= bis; z++) liste.push(String(z));
    App.radLaden(`Nummern ${von}–${bis}`, liste);
    App.melden(`${liste.length} Zahlen eingefügt`);
  });

  // ---------- Aufräumen ----------

  $('#btn-doppelte').addEventListener('click', () => {
    menueSchliessen();
    const gesehen = new Set();
    const vorher = App.daten.eintraege.length;
    const liste = App.daten.eintraege.filter((name) => {
      const k = Logik.schluessel(name);
      if (gesehen.has(k)) return false;
      gesehen.add(k);
      return true;
    });
    App.eintraegeSetzen(liste);
    const weg = vorher - liste.length;
    App.melden(weg === 0 ? 'Keine doppelten Einträge' : `${weg} doppelte entfernt`);
  });

  $('#btn-alle-loeschen').addEventListener('click', () => {
    menueSchliessen();
    if (App.daten.eintraege.length === 0) return;
    if (!confirm('Alle Einträge löschen?')) return;
    App.eintraegeSetzen([]);
  });

  geteilteListePruefen();
  sicherungsLinkPruefen();
  schummelLinkPruefen();
})();
