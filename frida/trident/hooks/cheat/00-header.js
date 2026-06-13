/**
 * Trident cheat module
 *   frida-trident.sh --cheat           all cheats on
 *   frida-trident.sh --cheat --diag    LootBag ctor/Awake/Start only
 *   frida-trident.sh --cheat --trace   broader invoke log during drop window
 *
 * PvP note: combat stat/damage hooks are PvE-only. PvP turns are server-validated
 * (takeTurnInActiveMatch) — any client combat modification causes forfeitActiveMatch.
 */
'use strict';

/*TRIDENT_CHEAT_TRACE*/
/*TRIDENT_CHEAT_DIAG*/

