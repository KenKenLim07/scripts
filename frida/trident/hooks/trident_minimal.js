/**
 * Minimal attach test — no hooks, no module lookups.
 * Use: frida-trident.sh --minimal
 */
'use strict';
console.log('[trident:minimal] attached pid=' + Process.id + ' arch=' + Process.arch);
