/*
 * pwa.js – meldet den Service Worker an (Offline-Betrieb, "Als App installieren").
 * Browser erlauben das nur über HTTPS oder localhost – sonst passiert einfach nichts.
 */
(function () {
  'use strict';

  if (!('serviceWorker' in navigator) || !window.isSecureContext || location.protocol === 'file:') return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* ohne Offline-Modus weiter */
    });
  });
})();
