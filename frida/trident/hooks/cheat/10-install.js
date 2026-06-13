function installCheat() {
  globalThis.tridentOnPvEStart = function (detail) {
    invokeSeen = {};
    openDropWindow('PvE start ' + (detail || ''));
  };
  globalThis.tridentOnPvEComplete = function (detail) {
    openDropWindow('PvE complete ' + (detail || ''));
  };

  if (diagEnabled()) {
    log('cheat', '=== CHEAT DIAG — LootBag ctor/Awake/Start ===');
    hookLootBagInvoke();
  } else {
    log('cheat', '=== CHEAT ON — Mythic every kill=' + FORCE_CHEST_EVERY_KILL + ' + mythicLoot=' + (FORCE_MYTHIC_LOOT ? mythicLootTargetLabel() : 'off') + ' + XP x' + XP_MULT + ' + DMG x' + DMG_MULT + ' + Set x' + SET_DROP_RATE_MULT + ' min=' + MIN_SET_CHANCE + ' + Essence bonus ' + (MODIFIER_REWARD_BONUS > 0 ? pctLabel(MODIFIER_REWARD_BONUS) : 'x' + MODIFIER_REWARD_MULT) + ' + Forge 100%=' + FORGE_ALWAYS_SUCCESS + ' ===');
    hookNativeXpMethods();
    hookNativeDamageMethods();
    hookNativePveCombatStats();
    hookNativeSetChestMethods();
    hookNativeEssenceMethods();
    hookNativeChestMethods();
    hookNativeMythicLootMethods();
    hookNativeForgeMethods();
    hookDropStrings();
  }
}

log('cheat', 'Cheat module queued (3s defer)...');
setTimeout(installCheat, 3000);
