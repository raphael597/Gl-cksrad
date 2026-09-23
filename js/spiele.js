/*
 * spiele.js – zwei weitere Ansichten für die bestehende Gewinnerauswahl.
 * Der Gewinner wird ausschließlich in app.js durch Logik.waehleGewinner gewählt.
 * Hier erscheinen die Namen auf Walzen bzw. Feldern; Gewichte bleiben unsichtbar.
 */
(function (global) {
  'use strict';

  class Spielansichten {
    constructor() {
      this.modus = 'rad';
      this.eintraege = [];
      this.slot = document.querySelector('#ansicht-slot');
      this.walzen = [...this.slot.querySelectorAll('.slot-walze')];
      this.roulette = document.querySelector('#ansicht-roulette');
      this.brett = document.querySelector('#roulette-felder');
      this.status = document.querySelector('#roulette-status');
      this.felder = [];
    }

    wechseln(modus) {
      this.modus = ['rad', 'slot', 'roulette'].includes(modus) ? modus : 'rad';
      for (const art of ['rad', 'slot', 'roulette']) {
        document.querySelector(`#ansicht-${art}`).hidden = art !== this.modus;
      }
      if (this.modus === 'roulette') this.brettZeichnen();
      if (this.modus === 'slot') this.walzenZeigen();
    }

    setEintraege(eintraege) {
      this.eintraege = eintraege.slice();
      if (this.modus === 'roulette') this.brettZeichnen();
      if (this.modus === 'slot') this.walzenZeigen();
    }

    walzenZeigen() {
      this.slot.classList.remove('spielt');
      this.walzen.forEach((walze, i) => {
        walze.classList.remove('fertig');
        walze.querySelector('.slot-name').textContent = this.eintraege[i % this.eintraege.length] || '?';
      });
    }

    brettZeichnen() {
      const fragment = document.createDocumentFragment();
      this.felder = this.eintraege.map((name, i) => {
        const feld = document.createElement('div');
        const nummer = document.createElement('span');
        const beschriftung = document.createElement('span');
        feld.className = 'roulette-feld';
        nummer.className = 'nummer';
        nummer.textContent = String(i + 1).padStart(2, '0');
        beschriftung.className = 'name';
        beschriftung.textContent = name;
        beschriftung.title = name;
        feld.append(nummer, beschriftung);
        fragment.appendChild(feld);
        return feld;
      });
      if (!this.felder.length) {
        const leer = document.createElement('p');
        leer.className = 'roulette-leer';
        leer.textContent = 'Erst Einträge hinzufügen';
        fragment.appendChild(leer);
      }
      this.brett.replaceChildren(fragment);
      this.brett.scrollTop = 0;
      this.status.textContent = this.felder.length ? `${this.felder.length} Felder bereit.` : 'Die Kugel wartet.';
    }

    feldMarkieren(index) {
      if (this.aktivesFeld) this.aktivesFeld.classList.remove('aktiv');
      const feld = this.felder[index];
      if (!feld) return;
      feld.classList.add('aktiv');
      this.aktivesFeld = feld;
      const oben = feld.offsetTop;
      if (oben < this.brett.scrollTop) this.brett.scrollTop = oben;
      else if (oben + feld.offsetHeight > this.brett.scrollTop + this.brett.clientHeight) {
        this.brett.scrollTop = oben + feld.offsetHeight - this.brett.clientHeight;
      }
    }

    spielen(eintraege, ziel, dauer) {
      return this.modus === 'slot'
        ? this.slotSpielen(eintraege, ziel, dauer)
        : this.rouletteSpielen(eintraege, ziel, dauer);
    }

    slotSpielen(eintraege, ziel, dauer) {
      const kurz = global.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      const laenge = kurz ? 180 : dauer;
      const ende = [0.58, 0.78, 1];
      let start;
      let letzteAktualisierung = -Infinity;
      this.slot.classList.add('spielt');
      this.walzen.forEach((walze) => walze.classList.remove('fertig'));
      return new Promise((fertig) => {
        const bild = (zeit) => {
          if (start === undefined) start = zeit;
          const fortschritt = Math.min(1, (zeit - start) / laenge);
          if (zeit - letzteAktualisierung >= 65 || fortschritt === 1) {
            letzteAktualisierung = zeit;
            this.walzen.forEach((walze, i) => {
              const angehalten = fortschritt >= ende[i];
              walze.classList.toggle('fertig', angehalten);
              walze.querySelector('.slot-name').textContent = angehalten
                ? eintraege[ziel]
                : eintraege[Math.floor(Math.random() * eintraege.length)];
            });
          }
          if (fortschritt < 1) requestAnimationFrame(bild);
          else {
            this.slot.classList.remove('spielt');
            fertig();
          }
        };
        requestAnimationFrame(bild);
      });
    }

    rouletteSpielen(eintraege, ziel, dauer) {
      if (this.felder.length !== eintraege.length) this.brettZeichnen();
      const kurz = global.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      const laenge = kurz ? 180 : dauer;
      const schritte = Math.max(18, Math.min(64, eintraege.length * 3));
      const startIndex = ((ziel - schritte) % eintraege.length + eintraege.length) % eintraege.length;
      let start;
      let letzterSchritt = -1;
      this.status.textContent = 'Die Kugel rollt …';
      return new Promise((fertig) => {
        const bild = (zeit) => {
          if (start === undefined) start = zeit;
          const fortschritt = Math.min(1, (zeit - start) / laenge);
          const schritt = Math.floor(schritte * (1 - Math.pow(1 - fortschritt, 3)));
          if (schritt !== letzterSchritt) {
            letzterSchritt = schritt;
            this.feldMarkieren((startIndex + schritt) % eintraege.length);
          }
          if (fortschritt < 1) requestAnimationFrame(bild);
          else {
            this.feldMarkieren(ziel);
            this.status.textContent = `Die Kugel liegt auf ${eintraege[ziel]}.`;
            fertig();
          }
        };
        requestAnimationFrame(bild);
      });
    }
  }

  global.Spielansichten = Spielansichten;
})(window);
