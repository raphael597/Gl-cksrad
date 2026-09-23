/*
 * effekte.js – Ton (Klackern + Gewinn-Fanfare) und Konfetti.
 * Alles selbst erzeugt, keine Dateien oder Bibliotheken nötig.
 */
(function (global) {
  'use strict';

  // ---------- Ton (Web Audio API) ----------

  const Ton = {
    an: true,
    ctx: null,
    letzterKlick: 0,

    /** Muss nach einem Klick/Tastendruck aufgerufen werden (Browser-Regel für Audio). */
    bereit() {
      if (!this.ctx) {
        const AudioKontext = window.AudioContext || window.webkitAudioContext;
        if (!AudioKontext) return;
        this.ctx = new AudioKontext();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },

    ton(frequenz, start, dauer, typ, lautstaerke) {
      const osz = this.ctx.createOscillator();
      const verstaerker = this.ctx.createGain();
      osz.type = typ;
      osz.frequency.value = frequenz;
      verstaerker.gain.setValueAtTime(lautstaerke, start);
      verstaerker.gain.exponentialRampToValueAtTime(0.0001, start + dauer);
      osz.connect(verstaerker).connect(this.ctx.destination);
      osz.start(start);
      osz.stop(start + dauer + 0.02);
    },

    klick() {
      if (!this.an || !this.ctx) return;
      const jetzt = this.ctx.currentTime;
      if (jetzt - this.letzterKlick < 0.035) return; // bei hoher Geschwindigkeit nicht brummen
      this.letzterKlick = jetzt;
      this.ton(1500 + Math.random() * 200, jetzt, 0.035, 'square', 0.05);
    },

    /** Drei kurze Pieptöne – z. B. wenn der Timer abgelaufen ist. */
    alarm() {
      if (!this.an || !this.ctx) return;
      const jetzt = this.ctx.currentTime;
      for (let i = 0; i < 3; i++) this.ton(880, jetzt + i * 0.28, 0.2, 'square', 0.12);
    },

    gewinn() {
      if (!this.an || !this.ctx) return;
      const jetzt = this.ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        this.ton(f, jetzt + i * 0.1, i === 3 ? 0.5 : 0.18, 'triangle', 0.18);
      });
    },
  };

  // ---------- Konfetti ----------

  const Konfetti = {
    teile: [],
    laeuft: false,

    starten(canvas) {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const farben = ['#fbbf24', '#f43f5e', '#22d3ee', '#a78bfa', '#34d399', '#fb923c', '#ffffff'];
      for (let i = 0; i < 180; i++) {
        const links = i % 2 === 0;
        this.teile.push({
          x: links ? -10 : innerWidth + 10,
          y: innerHeight * (0.55 + Math.random() * 0.25),
          vx: (links ? 1 : -1) * (6 + Math.random() * 9),
          vy: -(10 + Math.random() * 10),
          w: 6 + Math.random() * 6,
          h: 8 + Math.random() * 10,
          winkel: Math.random() * Math.PI,
          dreh: (Math.random() - 0.5) * 0.35,
          farbe: farben[i % farben.length],
          leben: 1,
        });
      }
      if (!this.laeuft) {
        this.laeuft = true;
        requestAnimationFrame(() => this.schritt());
      }
    },

    leeren() {
      const c = this.ctx;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, this.canvas.width, this.canvas.height);
      c.restore();
    },

    schritt() {
      const c = this.ctx;
      this.leeren();
      for (const t of this.teile) {
        t.vy += 0.35; // Schwerkraft
        t.vx *= 0.985; // Luftwiderstand
        t.x += t.vx;
        t.y += t.vy;
        t.winkel += t.dreh;
        if (t.vy > 0) t.leben -= 0.006;
        c.save();
        c.globalAlpha = Math.max(0, t.leben);
        c.translate(t.x, t.y);
        c.rotate(t.winkel);
        c.fillStyle = t.farbe;
        c.fillRect(-t.w / 2, -t.h / 2, t.w, t.h * Math.abs(Math.cos(t.winkel * 1.7)));
        c.restore();
      }
      this.teile = this.teile.filter((t) => t.leben > 0 && t.y < innerHeight + 40);
      if (this.teile.length > 0) {
        requestAnimationFrame(() => this.schritt());
      } else {
        this.laeuft = false;
        this.leeren();
      }
    },
  };

  global.Ton = Ton;
  global.Konfetti = Konfetti;
})(window);
