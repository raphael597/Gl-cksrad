/*
 * werkzeuge.js – kleine Helfer für den Unterricht:
 *   Timer (läuft auch bei geschlossenem Fenster weiter), Würfel, Münzwurf, Zufallszahl.
 * Alles hier ist ehrlich zufällig – die Admin-Einstellungen gelten nur fürs Rad.
 */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const dialog = $('#werkzeuge');

  /** Ganze Zufallszahl von min bis max (einschließlich), kryptografisch gezogen. */
  function zufallGanz(min, max) {
    const spanne = max - min + 1;
    const zahl = new Uint32Array(1);
    // Werte oberhalb des letzten vollen Blocks verwerfen, damit alle Zahlen gleich wahrscheinlich sind.
    const grenze = Math.floor(0x100000000 / spanne) * spanne;
    do crypto.getRandomValues(zahl);
    while (zahl[0] >= grenze);
    return min + (zahl[0] % spanne);
  }

  /** Kurze "Wackel"-Animation: ruft schritt() mehrmals auf, am Ende fertig(). */
  function animieren(schritte, abstand, schritt, fertig) {
    let i = 0;
    const weiter = () => {
      if (i++ < schritte) {
        schritt();
        setTimeout(weiter, abstand);
      } else {
        fertig();
      }
    };
    weiter();
  }

  // ---------- Reiter ----------

  function reiterZeigen(name) {
    document.querySelectorAll('#werkzeuge [data-reiter]').forEach((knopf) => {
      knopf.setAttribute('aria-selected', String(knopf.dataset.reiter === name));
    });
    document.querySelectorAll('#werkzeuge [data-reiter-inhalt]').forEach((bereich) => {
      bereich.hidden = bereich.dataset.reiterInhalt !== name;
    });
  }

  document.querySelector('#werkzeuge .reiter').addEventListener('click', (e) => {
    const knopf = e.target.closest('[data-reiter]');
    if (knopf) reiterZeigen(knopf.dataset.reiter);
  });

  dialog.addEventListener('vorOeffnen', (e) => {
    if (e.detail && e.detail.reiter) reiterZeigen(e.detail.reiter);
    timerAnzeigen();
  });

  // ---------- Timer ----------

  const timer = {
    gesamt: 60 * 1000, // eingestellte Dauer in ms
    rest: 60 * 1000,
    ende: 0, // Zeitpunkt, an dem der Timer abläuft (nur während er läuft)
    laeuft: false,
    abgelaufen: false,
    intervall: null,
  };

  function formatZeit(ms) {
    const sekunden = Math.ceil(ms / 1000);
    const m = Math.floor(sekunden / 60);
    const s = sekunden % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function timerAnzeigen() {
    if (timer.laeuft) timer.rest = Math.max(0, timer.ende - Date.now());
    const text = timer.abgelaufen ? '0:00' : formatZeit(timer.rest);
    $('#timer-anzeige').textContent = text;
    $('#timer-anzeige').classList.toggle('knapp', timer.laeuft && timer.rest <= 10000);
    $('#timer-anzeige').classList.toggle('abgelaufen', timer.abgelaufen);
    $('#timer-balken').style.width = (timer.gesamt ? (timer.rest / timer.gesamt) * 100 : 0) + '%';
    $('#timer-start').textContent = timer.laeuft ? '⏸ Pause' : timer.rest < timer.gesamt && !timer.abgelaufen ? '▶ Weiter' : '▶ Start';

    // Kleine Anzeige oben in der Kopfzeile, solange ein Timer aktiv ist
    const pille = $('#timer-pille');
    pille.hidden = !(timer.laeuft || timer.abgelaufen || timer.rest < timer.gesamt);
    pille.classList.toggle('abgelaufen', timer.abgelaufen);
    $('#timer-pille-zeit').textContent = timer.abgelaufen ? 'Zeit!' : text;
  }

  function timerStoppen() {
    clearInterval(timer.intervall);
    timer.intervall = null;
    timer.laeuft = false;
  }

  function timerTick() {
    timerAnzeigen();
    if (timer.laeuft && timer.rest <= 0) {
      timerStoppen();
      timer.rest = 0;
      timer.abgelaufen = true;
      timerAnzeigen();
      Ton.alarm();
      App.melden('⏰ Die Zeit ist um!');
    }
  }

  function timerSetzen(ms) {
    timerStoppen();
    timer.gesamt = Math.max(1000, ms);
    timer.rest = timer.gesamt;
    timer.abgelaufen = false;
    const sekunden = Math.round(timer.gesamt / 1000);
    $('#timer-minuten').value = Math.floor(sekunden / 60);
    $('#timer-sekunden').value = sekunden % 60;
    timerAnzeigen();
  }

  $('#timer-start').addEventListener('click', () => {
    Ton.bereit();
    if (timer.laeuft) {
      timerTick();
      timerStoppen(); // Pause
    } else {
      if (timer.abgelaufen || timer.rest <= 0) timerSetzen(timer.gesamt);
      timer.ende = Date.now() + timer.rest;
      timer.laeuft = true;
      timer.intervall = setInterval(timerTick, 200);
    }
    timerAnzeigen();
  });

  $('#timer-reset').addEventListener('click', () => timerSetzen(timer.gesamt));

  $('#timer-vorgaben').addEventListener('click', (e) => {
    const knopf = e.target.closest('[data-sekunden]');
    if (knopf) timerSetzen(Number(knopf.dataset.sekunden) * 1000);
  });

  $('#timer-eigene').addEventListener('submit', (e) => {
    e.preventDefault();
    const minuten = Math.min(180, Math.max(0, parseInt($('#timer-minuten').value, 10) || 0));
    const sekunden = Math.min(59, Math.max(0, parseInt($('#timer-sekunden').value, 10) || 0));
    timerSetzen((minuten * 60 + sekunden) * 1000);
  });

  // ---------- Würfel ----------

  // Punkte-Positionen im 3×3-Raster (0 = oben links … 8 = unten rechts)
  const AUGEN = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

  function wuerfelBauen(wert) {
    const w = document.createElement('div');
    w.className = 'wuerfel';
    w.setAttribute('role', 'img');
    w.setAttribute('aria-label', `Würfel zeigt ${wert}`);
    for (let i = 0; i < 9; i++) {
      const punkt = document.createElement('i');
      if (AUGEN[wert].includes(i)) punkt.className = 'auge';
      w.appendChild(punkt);
    }
    return w;
  }

  function wuerfelZeigen(werte, rollt) {
    const flaeche = $('#wuerfel-flaeche');
    flaeche.innerHTML = '';
    for (const wert of werte) {
      const w = wuerfelBauen(wert);
      if (rollt) w.classList.add('rollt');
      flaeche.appendChild(w);
    }
  }

  $('#wuerfel-los').addEventListener('click', () => {
    Ton.bereit();
    const anzahl = Number($('#wuerfel-anzahl').value) || 1;
    const wuerfeln = () => Array.from({ length: anzahl }, () => zufallGanz(1, 6));
    $('#wuerfel-los').disabled = true;
    $('#wuerfel-summe').textContent = '';
    animieren(
      9,
      70,
      () => {
        wuerfelZeigen(wuerfeln(), true);
        Ton.klick();
      },
      () => {
        const werte = wuerfeln();
        wuerfelZeigen(werte, false);
        const summe = werte.reduce((a, b) => a + b, 0);
        $('#wuerfel-summe').textContent = anzahl > 1 ? `Summe: ${summe}` : `Gewürfelt: ${summe}`;
        $('#wuerfel-los').disabled = false;
      }
    );
  });

  wuerfelZeigen([1, 1], false);

  // ---------- Münze ----------

  const bilanz = { Kopf: 0, Zahl: 0 };

  $('#muenze-los').addEventListener('click', () => {
    Ton.bereit();
    const muenze = $('#muenze');
    const seite = zufallGanz(0, 1) === 0 ? 'Kopf' : 'Zahl';
    $('#muenze-los').disabled = true;
    $('#muenze-text').textContent = '…';
    muenze.textContent = '';
    muenze.classList.remove('wirft');
    void muenze.offsetWidth; // Animation neu starten
    muenze.classList.add('wirft');
    animieren(6, 130, () => Ton.klick(), () => {
      muenze.classList.remove('wirft');
      muenze.textContent = seite === 'Kopf' ? '👑' : '1';
      muenze.dataset.seite = seite;
      bilanz[seite]++;
      $('#muenze-text').textContent = seite;
      $('#muenze-bilanz').textContent = `Bisher: Kopf ${bilanz.Kopf}× · Zahl ${bilanz.Zahl}×`;
      $('#muenze-los').disabled = false;
    });
  });

  // ---------- Zufallszahl ----------

  let schonGezogen = [];

  function zahlGrenzen() {
    let von = parseInt($('#zahl-von').value, 10);
    let bis = parseInt($('#zahl-bis').value, 10);
    if (!Number.isFinite(von) || !Number.isFinite(bis)) return null;
    if (von > bis) [von, bis] = [bis, von];
    if (bis - von > 1000000) return null;
    return { von, bis };
  }

  function gezogenAnzeigen() {
    const ohne = $('#zahl-ohne-wiederholung').checked;
    $('#zahl-gezogen').textContent = ohne && schonGezogen.length ? `Schon gezogen: ${schonGezogen.join(', ')}` : '';
  }

  $('#zahl-los').addEventListener('click', () => {
    const grenzen = zahlGrenzen();
    if (!grenzen) {
      App.melden('Bitte gültige Zahlen eingeben');
      return;
    }
    const { von, bis } = grenzen;
    const ohne = $('#zahl-ohne-wiederholung').checked;
    const frei = bis - von + 1 - schonGezogen.filter((z) => z >= von && z <= bis).length;
    if (ohne && frei <= 0) {
      App.melden('Alle Zahlen wurden schon gezogen');
      return;
    }

    let ergebnis;
    do ergebnis = zufallGanz(von, bis);
    while (ohne && schonGezogen.includes(ergebnis));

    Ton.bereit();
    $('#zahl-los').disabled = true;
    animieren(
      12,
      55,
      () => ($('#zahl-anzeige').textContent = zufallGanz(von, bis)),
      () => {
        $('#zahl-anzeige').textContent = ergebnis;
        if (ohne) schonGezogen.push(ergebnis);
        gezogenAnzeigen();
        Ton.gewinn();
        $('#zahl-los').disabled = false;
      }
    );
  });

  $('#zahl-reset').addEventListener('click', () => {
    schonGezogen = [];
    $('#zahl-anzeige').textContent = '–';
    gezogenAnzeigen();
  });

  $('#zahl-ohne-wiederholung').addEventListener('change', gezogenAnzeigen);

  timerAnzeigen();
})();
