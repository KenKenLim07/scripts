function hookNativeChestMethods() {
  var mod = unityMod();
  if (!mod) {
    log('cheat', 'UnityFramework not loaded — native hooks skipped');
    return;
  }

  var spawnLoot = rvaPtr(RVA.SpawnLoot);
  if (spawnLoot) {
    Interceptor.attach(spawnLoot, {
      onEnter: function () {
        if (!cheatActive()) return;
        openDropWindow('SpawnLoot');
        this.offerChest = FORCE_CHEST_EVERY_KILL;
        if (FORCE_CHEST_EVERY_KILL) spawnLootNeedsChest = true;
      },
      onLeave: function () {
        if (!this.offerChest || !spawnLootNeedsChest) return;
        // Same thread as Unity — never setTimeout (off-main-thread OpenChest crashes).
        forceOpenMythicChest('SpawnLoot');
        spawnLootNeedsChest = false;
      },
    });
    log('cheat', 'hook SpawnLoot (force chest=' + FORCE_CHEST_EVERY_KILL + ') @ ' + spawnLoot);
  }

  var check = rvaPtr(RVA.CheckGivePremiumChest);
  if (check) {
    Interceptor.attach(check, {
      onLeave: function (retval) {
        if (!cheatActive()) return;
        var roll = retval.toInt32();
        if (FORCE_CHEST_EVERY_KILL && roll === 0) {
          retval.replace(1);
          log('cheat', 'CheckGivePremiumChest forced -> true');
        } else if (roll !== 0) {
          log('cheat', 'CheckGivePremiumChest = true');
        }
      },
    });
    log('cheat', 'hook CheckGivePremiumChest (force=' + FORCE_CHEST_EVERY_KILL + ') @ ' + check);
  }

  var updateUi = rvaPtr(RVA.UpdateUI);
  if (updateUi) {
    Interceptor.attach(updateUi, {
      onEnter: function (args) {
        if (!cheatActive()) return;
        patchEnumField(args[0], OFF.PremiumChestPopup_premiumChestType, PREMIUM_MYTHIC, 'UpdateUI');
      },
    });
    log('cheat', 'hook PremiumChestPopup.UpdateUI @ ' + updateUi);
  }

  var openChest = rvaPtr(RVA.OpenChest);
  if (openChest) {
    Interceptor.attach(openChest, {
      onEnter: function (args) {
        if (!cheatActive()) return;
        spawnLootNeedsChest = false;
        openDropWindow('OpenChest');
        patchEnumArg(args, 1, PREMIUM_MYTHIC, 'OpenChest');
        patchEnumField(args[0], OFF.PremiumChestPopup_premiumChestType, PREMIUM_MYTHIC, 'OpenChest field');
      },
    });
    log('cheat', 'hook OpenChest (safe enum patch) @ ' + openChest);
  }

  var getType = rvaPtr(RVA.GetPremiumChestType);
  if (getType) {
    Interceptor.attach(getType, {
      onEnter: function (args) {
        if (!cheatActive()) return;
        patchEnumField(args[0], OFF.LootBag_premiumChestType, PREMIUM_MYTHIC, 'LootBag');
      },
      onLeave: function (retval) {
        if (!cheatActive()) return;
        writeBoxedEnum(retval, PREMIUM_MYTHIC, 'get_PremiumChestType ret');
      },
    });
    log('cheat', 'hook get_PremiumChestType @ ' + getType);
  }

  var getLoot = rvaPtr(RVA.GetLoot);
  if (getLoot) {
    Interceptor.attach(getLoot, {
      onEnter: function (args) {
        if (!cheatActive()) return;
        this.chestTier = readNativeEnumArg(args[1]);
        patchEnumArg(args, 1, PREMIUM_MYTHIC, 'GetLoot');
      },
      onLeave: function (retval) {
        if (!retval || retval.isNull()) return;
        var isMythicOpen = this.chestTier === PREMIUM_MYTHIC;
        if (MYTHIC_LOOT_LOG && isMythicOpen) logMythicLootRoll(retval);
        if (!mythicLootCheatActive() || !isMythicOpen) return;
        patchMythicLootContent(retval);
      },
    });
    log('cheat', 'hook GetLoot @ ' + getLoot);
  }

  [RVA.SpawnLootBagContent, RVA.SpawnLootBagItems].forEach(function (rva, idx) {
    var addr = rvaPtr(rva);
    if (!addr) return;
    Interceptor.attach(addr, {
      onLeave: function (retval) {
        if (!cheatActive()) return;
        patchEnumField(retval, OFF.LootBag_premiumChestType, PREMIUM_MYTHIC, 'SpawnLootBag ret');
      },
    });
    log('cheat', 'hook SpawnLootBag @ ' + addr);
  });

  var rng = rvaPtr(RVA.RandomRangeInt);
  if (rng) {
    try {
      Interceptor.attach(rng, {
        onEnter: function (args) {
          if (!cheatActive() || !inDropWindow()) return;
          try {
            this.min = args[0].toInt32();
            this.max = args[1].toInt32();
            this.bias = (this.min >= 0 && this.min <= 1 && this.max >= 4 && this.max <= 6);
          } catch (e) {
            this.bias = false;
          }
        },
        onLeave: function (retval) {
          if (!this.bias) return;
          var v = retval.toInt32();
          if (v >= 1 && v <= 4 && v !== PREMIUM_MYTHIC) {
            retval.replace(ptr(PREMIUM_MYTHIC));
            log('cheat', 'Random.Range(' + this.min + ',' + this.max + ') ' + v + ' -> ' + PREMIUM_MYTHIC);
          }
        },
      });
      log('cheat', 'hook Random.Range(int) @ ' + rng);
    } catch (e) {
      log('cheat', 'Random.Range hook skipped: ' + e);
    }
  }
}

