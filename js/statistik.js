/*
 * statistik.js – wertet den Verlauf aus: wie oft wurde wer gezogen?
 */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  function kennzahl(wert, beschriftung) {
    const div = document.createElement('div');
    div.className = 'kennzahl';
    const b = document.createElement('strong');
    b.textContent = wert;
    const s = document.createElement('span');
    s.textContent = beschriftung;
    div.append(b, s);
    return div;
  }

  function zeichnen() {
    const { verlauf, eintraege } = App.daten;

    // Zählen – Einträge im Rad erscheinen auch mit 0.
    const zaehler = new Map();
    for (const name of eintraege) {
      const k = Logik.schluessel(name);
      if (!zaehler.has(k)) zaehler.set(k, { name, anzahl: 0 });
    }
    for (const { name } of verlauf) {
      const k = Logik.schluessel(name);
      if (!zaehler.has(k)) zaehler.set(k, { name, anzahl: 0 });
      zaehler.get(k).anzahl++;
    }
    const zeilen = [...zaehler.values()].sort((a, b) => b.anzahl - a.anzahl || a.name.localeCompare(b.name, 'de', { numeric: true }));

    // Kennzahlen
    const box = $('#statistik-kennzahlen');
    box.innerHTML = '';
    box.append(kennzahl(verlauf.length, verlauf.length === 1 ? 'Drehung' : 'Drehungen'));
    box.append(kennzahl(zeilen.filter((z) => z.anzahl > 0).length, 'verschiedene Gewinner'));
    if (verlauf.length > 0) {
      const erste = new Date(verlauf[verlauf.length - 1].zeit);
      box.append(kennzahl(erste.toLocaleDateString('de-DE'), 'erste Drehung'));
    }

    // Tabelle mit Balken
    const tbody = $('#statistik-tabelle');
    tbody.innerHTML = '';
    if (zeilen.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="leer">Noch keine Daten.</td></tr>';
      return;
    }
    const max = Math.max(1, ...zeilen.map((z) => z.anzahl));
    for (const z of zeilen) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td class="name"></td><td class="balken-spalte"><div class="balken"><i></i></div></td><td class="zahl"></td>';
      tr.querySelector('.name').textContent = z.name;
      tr.querySelector('.balken i').style.width = (z.anzahl / max) * 100 + '%';
      tr.querySelector('.zahl').textContent = verlauf.length
        ? `${z.anzahl}× (${Math.round((z.anzahl / verlauf.length) * 100)} %)`
        : '0×';
      tbody.appendChild(tr);
    }
  }

  $('#statistik').addEventListener('vorOeffnen', zeichnen);

  $('#btn-verlauf-csv').addEventListener('click', () => {
    const verlauf = App.daten.verlauf;
    if (verlauf.length === 0) {
      App.melden('Der Verlauf ist leer');
      return;
    }
    const zelle = (t) => `"${String(t).replace(/"/g, '""')}"`;
    const zeilen = ['Datum;Uhrzeit;Ergebnis'];
    for (const { name, zeit } of verlauf.slice().reverse()) {
      const d = new Date(zeit);
      zeilen.push([d.toLocaleDateString('de-DE'), d.toLocaleTimeString('de-DE'), zelle(name)].join(';'));
    }
    // BOM, damit Excel die Umlaute richtig erkennt
    App.herunterladen('gluecksrad-verlauf.csv', '\uFEFF' + zeilen.join('\r\n'), 'text/csv');
  });

  $('#btn-statistik-leeren').addEventListener('click', () => {
    if (!confirm('Den gesamten Verlauf löschen?')) return;
    App.verlaufLeeren();
    zeichnen();
  });
})();
