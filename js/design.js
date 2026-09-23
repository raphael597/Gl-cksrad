/*
 * design.js – wird im <head> aller Seiten geladen.
 * Setzt Hell/Dunkel schon vor dem ersten Zeichnen (kein Aufblitzen) und das
 * aktuelle Jahr in der Fußzeile. Auch für Impressum und Datenschutz.
 */
(function () {
  'use strict';

  try {
    const daten = JSON.parse(localStorage.getItem('gluecksrad.daten') || '{}');
    const wahl = (daten.einstellungen && daten.einstellungen.design) || 'dunkel';
    const hell = wahl === 'hell' || (wahl === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches);
    document.documentElement.dataset.design = hell ? 'hell' : 'dunkel';
  } catch (e) {
    /* Standard: dunkel */
  }

  document.addEventListener('DOMContentLoaded', () => {
    const jahr = document.getElementById('jahr');
    if (jahr) jahr.textContent = new Date().getFullYear();
  });
})();
