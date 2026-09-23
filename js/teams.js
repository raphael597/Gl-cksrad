/*
 * teams.js – teilt die aktuellen Einträge zufällig in Teams auf.
 */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  let letzteTeams = [];

  function mischen(liste) {
    const a = liste.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Verteilt reihum, damit die Teams höchstens um eine Person abweichen. */
  function aufteilen(eintraege, modus, zahl) {
    const n = eintraege.length;
    const anzahl = modus === 'groesse' ? Math.ceil(n / zahl) : zahl;
    const teams = Array.from({ length: Math.min(anzahl, n) }, () => []);
    mischen(eintraege).forEach((name, i) => teams[i % teams.length].push(name));
    return teams;
  }

  function zeichnen() {
    const box = $('#teams-ergebnis');
    box.innerHTML = '';
    letzteTeams.forEach((mitglieder, i) => {
      const karte = document.createElement('div');
      karte.className = 'team-karte';
      const titel = document.createElement('h4');
      titel.textContent = `Team ${i + 1}`;
      const liste = document.createElement('ul');
      for (const name of mitglieder) {
        const li = document.createElement('li');
        li.textContent = name;
        liste.appendChild(li);
      }
      karte.append(titel, liste);
      box.appendChild(karte);
    });
    $('#teams-aktionen').hidden = letzteTeams.length === 0;
  }

  $('#teams').addEventListener('vorOeffnen', () => {
    const n = App.daten.eintraege.length;
    $('#teams-zahl').max = Math.max(1, n);
    letzteTeams = [];
    zeichnen();
  });

  $('#teams-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const eintraege = App.daten.eintraege;
    if (eintraege.length < 2) {
      App.melden('Mindestens 2 Einträge nötig');
      return;
    }
    const zahl = Math.max(1, Math.min(eintraege.length, parseInt($('#teams-zahl').value, 10) || 2));
    $('#teams-zahl').value = zahl;
    letzteTeams = aufteilen(eintraege, $('#teams-modus').value, zahl);
    zeichnen();
  });

  $('#btn-teams-kopieren').addEventListener('click', async () => {
    const text = letzteTeams.map((t, i) => `Team ${i + 1}: ${t.join(', ')}`).join('\n');
    App.melden((await App.kopieren(text)) ? 'Teams kopiert' : 'Kopieren nicht möglich');
  });
})();
