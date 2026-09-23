/*
 * spiele.js – zwei weitere Ansichten für die bestehende Gewinnerauswahl.
 * Der Gewinner wird ausschließlich in app.js durch Logik.waehleGewinner gewählt.
 * Hier erscheinen die Namen auf Walzen bzw. Feldern; Gewichte bleiben unsichtbar.
 *
 * Wie das Rad (rad.js) bieten beide Ansichten laufInfo() und umlenken(), damit die
 * Handy-Fernbedienung den Lauf verfolgen und das Ziel noch ändern kann.
 */
(function (global) {
  'use strict';

  const SLOT_STOPP = [0.58, 0.78, 1]; // Anteil der Dauer, bei dem die Walzen anhalten
  const SLOT_PUFFER_MS = 120; // so lange vor dem ersten Stopp wird nicht mehr umgelenkt

  class Spielansichten {
    constructor() {
      this.lauf = null; // laufende Ziehung (siehe spielen), sonst null
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
      const ablauf = this.modus === 'slot'
        ? this.slotSpielen(eintraege, ziel, dauer)
        : this.rouletteSpielen(eintraege, ziel, dauer);
      return ablauf.then(() => {
        this.lauf = null;
      });
    }

    slotSpielen(eintraege, ziel, dauer) {
      const kurz = global.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      const laenge = kurz ? 180 : dauer;
      const lauf = { art: 'slot', ziel, t0: performance.now(), dauer: laenge };
      this.lauf = lauf;
      let letzteAktualisierung = -Infinity;
      this.slot.classList.add('spielt');
      this.walzen.forEach((walze) => walze.classList.remove('fertig'));
      return new Promise((fertig) => {
        const bild = (zeit) => {
          const fortschritt = Math.min(1, Math.max(0, (zeit - lauf.t0) / laenge));
          if (zeit - letzteAktualisierung >= 65 || fortschritt === 1) {
            letzteAktualisierung = zeit;
            this.walzen.forEach((walze, i) => {
              const angehalten = fortschritt >= SLOT_STOPP[i];
              walze.classList.toggle('fertig', angehalten);
              walze.querySelector('.slot-name').textContent = angehalten
                ? eintraege[lauf.ziel]
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
      const n = eintraege.length;
      const schritte = Math.max(18, Math.min(64, n * 3));
      // Die Kugel läuft von `basis` aus `schritte` Felder weit (Bremskurve 1 − (1 − t)³).
      // umlenken() ersetzt basis, schritte, t0 und dauer mitten im Lauf.
      const t0 = performance.now();
      const lauf = { art: 'roulette', ziel, n, basis: ziel - schritte, schritte, t0, dauer: laenge, beginn: t0 };
      this.lauf = lauf;
      let letztesFeld = null;
      this.status.textContent = 'Die Kugel rollt …';
      return new Promise((fertig) => {
        const bild = (zeit) => {
          const fortschritt = Math.min(1, Math.max(0, (zeit - lauf.t0) / lauf.dauer));
          const position = Math.floor(lauf.basis + lauf.schritte * (1 - Math.pow(1 - fortschritt, 3)) + 1e-9);
          const feld = ((position % n) + n) % n;
          if (feld !== letztesFeld) {
            letztesFeld = feld;
            this.feldMarkieren(feld);
          }
          if (fortschritt < 1) requestAnimationFrame(bild);
          else {
            this.feldMarkieren(lauf.ziel);
            this.status.textContent = `Die Kugel liegt auf ${eintraege[lauf.ziel]}.`;
            fertig();
          }
        };
        requestAnimationFrame(bild);
      });
    }

    /** Stand der laufenden Ziehung (Zeiten in ms ab jetzt) oder null – wie Rad.laufInfo(). */
    laufInfo() {
      const lauf = this.lauf;
      if (!lauf) return null;
      const jetzt = performance.now();
      const ende = lauf.t0 + lauf.dauer;
      let sicherBis;
      if (lauf.art === 'slot') {
        sicherBis = lauf.t0 + lauf.dauer * SLOT_STOPP[0] - SLOT_PUFFER_MS;
      } else {
        // Restliche Felder: schritte · (1 − t)³ – sicher, solange genug davon übrig sind.
        const sicher = global.Logik.umlenkSchritteSicher(lauf.n);
        sicherBis = lauf.schritte > sicher
          ? lauf.t0 + lauf.dauer * (1 - Math.cbrt(sicher / lauf.schritte))
          : lauf.t0;
      }
      return {
        restMs: Math.max(0, ende - jetzt),
        gesamtMs: ende - (lauf.beginn ?? lauf.t0),
        umlenkbarMs: Math.max(0, sicherBis - jetzt),
      };
    }

    /** Lenkt die laufende Ziehung auf Eintrag `index` um. Liefert false, wenn es zu spät ist. */
    umlenken(index) {
      const lauf = this.lauf;
      if (!lauf) return false;
      const jetzt = performance.now();
      const t = Math.min(1, Math.max(0, (jetzt - lauf.t0) / lauf.dauer));

      if (lauf.art === 'slot') {
        // Bis die erste Walze stoppt, zeigen alle Walzen nur zufällige Namen.
        if (jetzt > lauf.t0 + lauf.dauer * SLOT_STOPP[0] - SLOT_PUFFER_MS) return false;
        lauf.ziel = index;
        return true;
      }

      const position = lauf.basis + lauf.schritte * (1 - Math.pow(1 - t, 3));
      const plan = global.Logik.umlenkSchritte({
        position,
        rest: lauf.schritte * Math.pow(1 - t, 3),
        restzeit: lauf.dauer * (1 - t),
        index,
        anzahl: lauf.n,
      });
      if (!plan) return false;
      Object.assign(lauf, { basis: position, schritte: plan.schritte, t0: jetzt, dauer: plan.dauer, ziel: index });
      return true;
    }
  }

  global.Spielansichten = Spielansichten;
})(window);
