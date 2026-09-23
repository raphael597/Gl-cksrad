/*
 * pwa.js – meldet den Service Worker an (Offline-Betrieb, "Als App installieren").
 * Browser erlauben das nur über HTTPS oder localhost – sonst passiert einfach nichts.
 */
(function () {
  'use strict';

  if (!('serviceWorker' in navigator) || !window.isSecureContext || location.protocol === 'file:') return;

  // Die Version steht auch in der Script-URL und wird beim Docker-Build aus
  // den Asset-Inhalten gebildet. Eine neue Version lädt einen neuen Worker.
  const script = document.currentScript;
  const version = script ? new URL(script.src).searchParams.get('v') : '';
  const workerUrl = version ? `sw.js?v=${encodeURIComponent(version)}` : 'sw.js';

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(workerUrl).catch(() => {
      /* ohne Offline-Modus weiter */
    });
  });
})();
