/*
 * app.js – verbindet alles auf der Hauptseite: Einträge, Drehen, Ergebnis,
 * Verlauf und die versteckten Zugänge zum Admin-Bereich.
 */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  let daten = Speicher.ladeRad();
  let letzterGewinn = null; // { name, index } für "Aus dem Rad entfernen"
  let spaeterNeuLaden = false; // Speicheränderung aus anderem Tab während des Drehens

  const eingabe = $('#eintraege');
  const zeiger = $('#zeiger');
  const rad = new Rad($('#rad'), { onTick: tick });

  Admin.init({ holeEintraege: () => daten.eintraege });

  // ---------- Einträge ----------

  function textZuEintraegen(text) {
    return text
      .split('\n')
      .map((zeile) => zeile.trim())
      .filter(Boolean);
  }

  function eintraegeSetzen(liste, { textfeld = true, speichern = true } = {}) {
    daten.eintraege = liste;
    if (speichern) Speicher.speichereRad(daten);
    rad.setEintraege(liste);
    if (textfeld) eingabe.value = liste.join('\n');
    $('#anzahl').textContent = liste.length;
    Admin.aktualisieren();
  }

  eingabe.addEventListener('input', () => {
    eintraegeSetzen(textZuEintraegen(eingabe.value), { textfeld: false });
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
    for (const el of [eingabe, $('#btn-mischen'), $('#btn-sortieren'), $('#btn-drehen'), $('#btn-mitte')]) {
      el.disabled = gesperrt;
    }
  }

  async function drehen() {
    const eintraege = daten.eintraege.slice();
    if (rad.dreht || document.querySelector('dialog[open]')) return;
    if (eintraege.length === 0) {
      eingabe.focus();
      return;
    }

    Ton.bereit();
    const admin = Speicher.ladeAdmin(); // frisch lesen – evtl. in einem anderen Fenster geändert
    const auswahl = Logik.waehleGewinner(eintraege, admin);
    const ziel = Logik.zielRotation(rad.rotation, auswahl.index, eintraege.length);
    const dauer = 5200 + Math.random() * 2300;

    bedienungSperren(true);
    await rad.drehenZu(ziel, dauer);
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
    daten.verlauf = daten.verlauf.slice(0, 50);
    Speicher.speichereRad(daten);
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
    letzterGewinn = { name, index };
    $('#ergebnis-name').textContent = name;
    ergebnis.showModal();
    Ton.gewinn();
    Konfetti.starten($('#konfetti'));
  }

  $('#btn-weiter').addEventListener('click', () => ergebnis.close());

  $('#btn-entfernen').addEventListener('click', () => {
    if (letzterGewinn) {
      const liste = daten.eintraege.slice();
      // Normalerweise steht der Gewinner noch am selben Platz; sonst nach Namen suchen.
      let i = liste[letzterGewinn.index] === letzterGewinn.name ? letzterGewinn.index : liste.indexOf(letzterGewinn.name);
      if (i >= 0) {
        liste.splice(i, 1);
        eintraegeSetzen(liste);
      }
    }
    ergebnis.close();
  });

  // Klick auf den abgedunkelten Hintergrund schließt das Ergebnis.
  ergebnis.addEventListener('click', (e) => {
    if (e.target === ergebnis) ergebnis.close();
  });

  // Fokus nicht im geschlossenen Dialog hängen lassen – sonst dreht die Leertaste nicht.
  ergebnis.addEventListener('close', () => {
    if (ergebnis.contains(document.activeElement)) document.activeElement.blur();
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
    for (const eintrag of daten.verlauf) {
      const li = document.createElement('li');
      const name = document.createElement('span');
      const zeit = document.createElement('time');
      name.textContent = eintrag.name;
      zeit.textContent = new Date(eintrag.zeit).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      li.append(name, zeit);
      liste.appendChild(li);
    }
  }

  $('#btn-verlauf-leeren').addEventListener('click', () => {
    daten.verlauf = [];
    Speicher.speichereRad(daten);
    verlaufZeichnen();
  });

  // ---------- Ton & Vollbild ----------

  function tonAnzeigen() {
    Ton.an = daten.ton !== false;
    $('#btn-ton').textContent = Ton.an ? '🔊' : '🔇';
  }

  $('#btn-ton').addEventListener('click', () => {
    daten.ton = !Ton.an;
    Speicher.speichereRad(daten);
    tonAnzeigen();
  });

  $('#btn-vollbild').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
  });

  // ---------- Tastatur & versteckte Admin-Zugänge ----------

  let tippPuffer = '';

  document.addEventListener('keydown', (e) => {
    const inFeld = e.target.closest('input, textarea, select, [contenteditable]');
    if (inFeld || document.querySelector('dialog[open]')) return;

    if (e.code === 'Space' || e.key === 'Enter') {
      // Ein fokussierter Knopf reagiert selbst – außer er steckt in einem geschlossenen Dialog.
      const knopf = e.target.closest('button');
      if (knopf && !knopf.closest('dialog:not([open])')) return;
      e.preventDefault();
      drehen();
      return;
    }

    // Geheimwort "admin" irgendwo auf der Seite tippen.
    if (e.key.length === 1) {
      tippPuffer = (tippPuffer + e.key.toLowerCase()).slice(-5);
      if (tippPuffer === 'admin') {
        tippPuffer = '';
        Admin.oeffnen();
      }
    }
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
    verlaufZeichnen();
    tonAnzeigen();
  }

  window.addEventListener('storage', (e) => {
    if (e.key === Speicher.SCHLUESSEL_ADMIN) Admin.aktualisieren();
    if (e.key === Speicher.SCHLUESSEL_RAD) {
      if (rad.dreht) spaeterNeuLaden = true;
      else vonSpeicherLaden();
    }
  });

  // ---------- Start ----------

  vonSpeicherLaden();
  hashPruefen();
})();
