function hookNativeDamageMethods() {
  if (!dmgCheatActive()) {
    log('cheat', 'DMG: disabled (DMG_MULT=' + DMG_MULT + ')');
    return;
  }

  var mod = unityMod();
  if (!mod) {
    log('cheat', 'DMG: UnityFramework not loaded');
    return;
  }

  log('cheat', 'DMG: MULT=' + DMG_MULT + ' (PvE only — TakeDamage + DoDamageNumber)');

  var takeDamage = rvaPtr(RVA.TakeDamage);
  if (takeDamage) {
    Interceptor.attach(takeDamage, {
      onEnter: function (args) {
        if (!dmgCheatActive()) return;
        try {
          var damagePtr = args[1];
          if (!damagePtr || damagePtr.isNull()) return;
          var source = damagePtr.add(OFF.Damage_source).readPointer();
          if (!shouldApplyPveDamageCheat(source)) return;
          dmgPatchDepth++;
          patchDamageStruct(damagePtr, 'TakeDamage');
        } catch (e) {}
      },
      onLeave: function () {
        if (dmgPatchDepth > 0) dmgPatchDepth--;
      },
    });
    log('cheat', 'hook Character.TakeDamage @ ' + takeDamage);
  }

  var doDmgNum = rvaPtr(RVA.DoDamageNumber);
  if (doDmgNum) {
    Interceptor.attach(doDmgNum, {
      onEnter: function (args) {
        if (!dmgCheatActive() || dmgPatchDepth <= 0) return;
        try {
          var base = this.context.s0;
          if (base <= 0 || !isFinite(base)) return;
          var scaled = scaleDamage(base);
          if (scaled !== base) {
            this.context.s0 = scaled;
            log('cheat', 'DMG float ' + Math.round(base) + ' -> ' + scaled);
          }
        } catch (e) {}
      },
    });
    log('cheat', 'hook DoDamageNumber @ ' + doDmgNum);
  }
}

