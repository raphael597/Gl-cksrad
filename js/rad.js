/*
 * rad.js – zeichnet das Glücksrad auf ein <canvas> und animiert das Drehen.
 *
 * Das Rad weiß nichts von Manipulation: es bekommt nur einen Endwinkel und
 * rollt dorthin aus. Alle Felder sind immer gleich groß.
 */
(function (global) {
  'use strict';

  const { VOLLKREIS, indexUnterZeiger, ausrollen, mod } = global.Logik;

  // Je 8 Farben; benachbarte Farben sollen sich gut unterscheiden.
  const FARBSCHEMEN = {
    bunt: { name: 'Bunt', farben: ['#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#3a86ff', '#8338ec', '#ff5d8f', '#06d6a0'] },
    pastell: { name: 'Pastell', farben: ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff'] },
    neon: { name: 'Neon', farben: ['#ff006e', '#fb5607', '#ffbe0b', '#38b000', '#00bbf9', '#3a0ca3', '#f15bb5', '#00f5d4'] },
    ozean: { name: 'Ozean', farben: ['#03045e', '#0077b6', '#00b4d8', '#48cae4', '#023e8a', '#0096c7', '#90e0ef', '#2a6f97'] },
    herbst: { name: 'Herbst', farben: ['#9b2226', '#ca6702', '#ee9b00', '#94d2bd', '#005f73', '#bb3e03', '#e9d8a6', '#0a9396'] },
  };
  const LAEMPCHEN = 24;

  // Anteile vom halben Canvas: Außenrand, Lämpchenkreis, Felder
  const R_RAND = 0.985;
  const R_LICHT = 0.952;
  const R_FELDER = 0.92;

  function feldFarbe(farben, i, anzahl) {
    let f = i % farben.length;
    // Letztes und erstes Feld liegen nebeneinander – nicht dieselbe Farbe.
    if (anzahl > 1 && i === anzahl - 1 && f === 0) f = 3;
    return farben[f];
  }

  function textFarbe(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const helligkeit = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return helligkeit > 0.62 ? '#1f2330' : '#ffffff';
  }

  /** Text so kürzen, dass er in `maxBreite` passt (mit …). */
  function kuerzen(ctx, text, maxBreite) {
    if (ctx.measureText(text).width <= maxBreite) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxBreite) t = t.slice(0, -1);
    return t + '…';
  }

  class Rad {
    constructor(canvas, optionen = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.eintraege = [];
      this.farben = FARBSCHEMEN.bunt.farben;
      this.rotation = 0;
      this.dreht = false;
      this.onTick = optionen.onTick || function () {};
      this.felderBild = null; // vorgerenderte Felder, damit die Animation flüssig bleibt

      this.groesseAnpassen();
      if ('ResizeObserver' in window) {
        new ResizeObserver(() => this.groesseAnpassen()).observe(canvas);
      } else {
        window.addEventListener('resize', () => this.groesseAnpassen());
      }
    }

    groesseAnpassen() {
      const breite = this.canvas.getBoundingClientRect().width;
      const pixel = Math.max(1, Math.round(breite * (window.devicePixelRatio || 1)));
      if (this.canvas.width !== pixel) {
        this.canvas.width = pixel;
        this.canvas.height = pixel;
        this.felderBild = null;
      }
      this.zeichnen();
    }

    setFarbschema(name) {
      this.farben = (FARBSCHEMEN[name] || FARBSCHEMEN.bunt).farben;
      this.felderBild = null;
      this.zeichnen();
    }

    setEintraege(eintraege) {
      this.eintraege = eintraege.slice();
      this.felderBild = null;
      this.zeichnen();
    }

    felderRendern() {
      const groesse = this.canvas.width;
      const bild = document.createElement('canvas');
      bild.width = bild.height = groesse;
      const c = bild.getContext('2d');
      const m = groesse / 2;
      const radius = m * R_FELDER;
      const n = this.eintraege.length;

      if (n === 0) {
        c.beginPath();
        c.arc(m, m, radius, 0, VOLLKREIS);
        c.fillStyle = '#2b3350';
        c.fill();
        c.fillStyle = '#94a3b8';
        c.font = `600 ${Math.round(radius * 0.09)}px system-ui, sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('Einträge hinzufügen', m, m - radius * 0.45);
        return bild;
      }

      const feld = VOLLKREIS / n;
      // Canvas-Winkel 0 zeigt nach rechts, unsere Felder starten oben → -90°.
      const versatz = -Math.PI / 2;

      for (let i = 0; i < n; i++) {
        const start = versatz + i * feld;
        c.beginPath();
        c.moveTo(m, m);
        c.arc(m, m, radius, start, start + feld);
        c.closePath();
        c.fillStyle = feldFarbe(this.farben, i, n);
        c.fill();
        if (n > 1) {
          c.strokeStyle = 'rgba(255,255,255,0.45)';
          c.lineWidth = Math.max(1, groesse / 350);
          c.stroke();
        }
      }

      // Beschriftung: vom Rand zur Mitte hin, rechtsbündig am Rand.
      const textRadius = radius * 0.93;
      const maxBreite = radius * 0.66;
      const hoeheImFeld = 2 * radius * 0.6 * Math.sin(Math.min(feld, Math.PI) / 2);
      const schrift = Math.max(10, Math.min(radius * 0.11, hoeheImFeld * 0.62));

      const schriftart = (px) => `700 ${Math.round(px)}px system-ui, "Segoe UI", Roboto, sans-serif`;
      c.textAlign = 'right';
      c.textBaseline = 'middle';
      for (let i = 0; i < n; i++) {
        // Lange Namen: erst die Schrift verkleinern (bis 55 %), erst dann kürzen.
        c.font = schriftart(schrift);
        const breite = c.measureText(this.eintraege[i]).width;
        const groesse = breite > maxBreite ? Math.max(schrift * 0.55, (schrift * maxBreite) / breite) : schrift;
        c.font = schriftart(groesse);

        c.save();
        c.translate(m, m);
        c.rotate(versatz + (i + 0.5) * feld);
        c.fillStyle = textFarbe(feldFarbe(this.farben, i, n));
        c.shadowColor = 'rgba(0,0,0,0.25)';
        c.shadowBlur = groesse * 0.15;
        c.fillText(kuerzen(c, this.eintraege[i], maxBreite), textRadius, 0);
        c.restore();
      }
      return bild;
    }

    zeichnen() {
      const c = this.ctx;
      const g = this.canvas.width;
      const m = g / 2;
      if (!this.felderBild) this.felderBild = this.felderRendern();

      c.clearRect(0, 0, g, g);

      // Äußerer Rahmen
      const rahmen = c.createLinearGradient(0, 0, g, g);
      rahmen.addColorStop(0, '#3b4466');
      rahmen.addColorStop(1, '#161b2e');
      c.beginPath();
      c.arc(m, m, m * R_RAND, 0, VOLLKREIS);
      c.fillStyle = rahmen;
      c.fill();

      // Felder (gedreht)
      c.save();
      c.translate(m, m);
      c.rotate(this.rotation);
      c.drawImage(this.felderBild, -m, -m);
      c.restore();

      // Lämpchen im Rahmen – blinken abwechselnd, solange das Rad dreht.
      const phase = this.dreht ? Math.floor(performance.now() / 160) % 2 : -1;
      const lichtGroesse = g * 0.0095;
      for (let k = 0; k < LAEMPCHEN; k++) {
        const w = (k / LAEMPCHEN) * VOLLKREIS;
        const an = phase === -1 || k % 2 === phase;
        c.beginPath();
        c.arc(m + Math.cos(w) * m * R_LICHT, m + Math.sin(w) * m * R_LICHT, lichtGroesse, 0, VOLLKREIS);
        c.fillStyle = an ? '#fff4c2' : '#6b5d2e';
        c.shadowColor = an ? 'rgba(255, 214, 102, 0.9)' : 'transparent';
        c.shadowBlur = an ? lichtGroesse * 2.2 : 0;
        c.fill();
      }
      c.shadowBlur = 0;

      // Leichter Glanz obenauf
      const glanz = c.createRadialGradient(m * 0.7, m * 0.55, 0, m, m, m * R_FELDER);
      glanz.addColorStop(0, 'rgba(255,255,255,0.16)');
      glanz.addColorStop(0.6, 'rgba(255,255,255,0.02)');
      glanz.addColorStop(1, 'rgba(0,0,0,0.18)');
      c.beginPath();
      c.arc(m, m, m * R_FELDER, 0, VOLLKREIS);
      c.fillStyle = glanz;
      c.fill();
    }

    /** Dreht das Rad bis zum Winkel `ziel` (Radiant). Löst auf, wenn es steht. */
    drehenZu(ziel, dauerMs) {
      return new Promise((fertig) => {
        const start = this.rotation;
        const weg = ziel - start;
        const n = this.eintraege.length;
        const t0 = performance.now();
        let letztesFeld = indexUnterZeiger(start, n);
        this.dreht = true;

        const schritt = (jetzt) => {
          const t = Math.min(1, (jetzt - t0) / dauerMs);
          this.rotation = start + weg * ausrollen(t);

          const feld = indexUnterZeiger(this.rotation, n);
          if (feld !== letztesFeld) {
            letztesFeld = feld;
            this.onTick();
          }

          if (t < 1) {
            this.zeichnen();
            requestAnimationFrame(schritt);
          } else {
            // Winkel klein halten – optisch identisch.
            this.rotation = mod(ziel, VOLLKREIS);
            this.dreht = false;
            this.zeichnen();
            fertig();
          }
        };
        requestAnimationFrame(schritt);
      });
    }
  }

  Rad.FARBSCHEMEN = FARBSCHEMEN;
  global.Rad = Rad;
})(window);
