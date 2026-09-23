/*
 * einstellungen.js – der Dialog "Einstellungen".
 * Jede Änderung wird sofort gespeichert und angewendet.
 */
(function () {
  'use strict';

  const dialog = document.getElementById('einstellungen');
  const form = document.getElementById('einstellungen-form');
  const schemenBox = document.getElementById('farbschemen');

  // Farbschema-Auswahl mit kleiner Vorschau aufbauen
  for (const [schluessel, schema] of Object.entries(Rad.FARBSCHEMEN)) {
    const label = document.createElement('label');
    label.className = 'farbschema';
    label.innerHTML = `<input type="radio" name="farben" value="${schluessel}"><span class="vorschau"></span><span class="name"></span>`;
    label.querySelector('.name').textContent = schema.name;
    // Farben per element.style setzen (nicht als style="…" im HTML) – das erlaubt eine strenge CSP.
    for (const farbe of schema.farben.slice(0, 6)) {
      const streifen = document.createElement('i');
      streifen.style.background = farbe;
      label.querySelector('.vorschau').appendChild(streifen);
    }
    schemenBox.appendChild(label);
  }

  function formularFuellen() {
    const e = App.daten.einstellungen;
    form.elements.dauer.value = e.dauer;
    form.elements.farben.value = e.farben;
    form.elements.design.value = e.design;
    form.elements.autoEntfernen.checked = !!e.autoEntfernen;
    form.elements.konfetti.checked = !!e.konfetti;
    form.elements.ton.checked = App.daten.ton !== false;
    form.elements.ergebnisText.value = e.ergebnisText;
  }

  dialog.addEventListener('vorOeffnen', formularFuellen);

  // "input" für das Textfeld, "change" für Radio/Checkbox (ältere Safari-Versionen)
  const uebernehmen = (ereignis) => {
    const feld = ereignis.target;
    if (!feld.name) return;
    const daten = App.daten;
    if (feld.name === 'ton') daten.ton = feld.checked;
    else if (feld.type === 'checkbox') daten.einstellungen[feld.name] = feld.checked;
    else if (feld.name === 'ergebnisText') daten.einstellungen.ergebnisText = feld.value.trim();
    else daten.einstellungen[feld.name] = feld.value;
    App.speichern();
    App.einstellungenAnwenden();
  };
  form.addEventListener('input', uebernehmen);
  form.addEventListener('change', uebernehmen);

  form.addEventListener('submit', (e) => e.preventDefault());

  document.getElementById('btn-einstellungen-standard').addEventListener('click', () => {
    App.daten.einstellungen = Object.assign({}, Speicher.STANDARD_EINSTELLUNGEN);
    App.daten.ton = true;
    App.speichern();
    App.einstellungenAnwenden();
    formularFuellen();
    App.melden('Einstellungen zurückgesetzt');
  });
})();
