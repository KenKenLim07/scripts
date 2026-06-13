function hookNativeSetChestMethods() {
  if (!setChestCheatActive()) {
    log('cheat', 'SetChest: disabled (MULT=' + SET_DROP_RATE_MULT + ', MIN=' + MIN_SET_CHANCE + ', FORCE=' + FORCE_SET_CHEST_ROOM + ')');
    return;
  }

  var mod = unityMod();
  if (!mod) {
    log('cheat', 'SetChest: UnityFramework not loaded');
    return;
  }

  log('cheat', 'SetChest: MULT=' + SET_DROP_RATE_MULT + ' min=' + MIN_SET_CHANCE + ' forceRoom=' + FORCE_SET_CHEST_ROOM);

  var getRewardType = rvaPtr(RVA.GetDungeonClearRewardType);
  if (getRewardType) {
    Interceptor.attach(getRewardType, {
      onEnter: function (args) {
        var depth = -1;
        try {
          depth = args[1].toInt32();
        } catch (e) {}
        pushHookState(this, { depth: depth });
      },
      onLeave: function (retval) {
        try {
          var st = popHookState(this);
          var roll = retval.toInt32();
          log('cheat', 'SetChest depth ' + depthLabel(st.depth) + ' roll -> ' + rewardTypeLabel(roll));
          if (FORCE_SET_CHEST_ROOM && roll !== DUNGEON_CLEAR_REWARD_SET) {
            retval.replace(ptr(DUNGEON_CLEAR_REWARD_SET));
            log('cheat', 'SetChest depth ' + depthLabel(st.depth) + ' forced -> Set (green)');
          }
        } catch (e) {}
      },
    });
    log('cheat', 'hook GetDungeonClearRewardType @ ' + getRewardType);
  }

  var getSetChance = rvaPtr(RVA.GetSetChance);
  if (getSetChance) {
    Interceptor.attach(getSetChance, {
      onEnter: function (args) {
        var depth = -1;
        try {
          depth = args[1].toInt32();
        } catch (e) {}
        pushHookState(this, { depth: depth });
      },
      onLeave: function (retval) {
        try {
          var st = popHookState(this);
          var chance = this.context.s0;
          if (!isFinite(chance)) return;
          log('cheat', 'SetChest GetSetChance depth ' + depthLabel(st.depth) + ' -> ' + pctLabel(chance));
          var boosted = chance;
          if (SET_DROP_RATE_MULT > 1) {
            boosted = Math.min(1.0, chance * SET_DROP_RATE_MULT);
          }
          if (MIN_SET_CHANCE > 0) {
            boosted = Math.max(boosted, Math.min(1.0, MIN_SET_CHANCE));
          }
          if (boosted !== chance) {
            this.context.s0 = boosted;
            log('cheat', 'SetChest GetSetChance boosted -> ' + pctLabel(boosted));
          }
        } catch (e) {}
      },
    });
    log('cheat', 'hook GetSetChance @ ' + getSetChance);
  }

  var getUpgradeValue = rvaPtr(RVA.PermanentUpgradeGetValue);
  if (getUpgradeValue) {
    Interceptor.attach(getUpgradeValue, {
      onEnter: function (args) {
        var upgrade = -1;
        var level = -1;
        try {
          upgrade = args[0].toInt32();
          level = args[1].toInt32();
        } catch (e) {}
        pushHookState(this, { upgrade: upgrade, level: level });
      },
      onLeave: function (retval) {
        var st = popHookState(this);
        if (st.upgrade !== DUNGEON_UPGRADE_SET_DROP_RATE) return;
        try {
          var value = this.context.s0;
          if (!isFinite(value)) return;
          log('cheat', 'SetChest meta SetDropRate L' + st.level + ' -> ' + pctLabel(value));
          if (SET_DROP_RATE_MULT > 1) {
            var boosted = Math.min(1.0, value * SET_DROP_RATE_MULT);
            if (boosted !== value) {
              this.context.s0 = boosted;
              log('cheat', 'SetChest meta SetDropRate boosted -> ' + pctLabel(boosted));
            }
          }
        } catch (e) {}
      },
    });
    log('cheat', 'hook PermanentUpgrade.GetValue @ ' + getUpgradeValue);
  }

  var openReward = rvaPtr(RVA.OpenRoomClearReward);
  if (openReward) {
    Interceptor.attach(openReward, {
      onEnter: function (args) {
        try {
          var reward = args[1].toInt32();
          if (reward === DUNGEON_CLEAR_REWARD_SET) {
            log('cheat', 'SetChest OPEN green chest room');
          } else {
            log('cheat', 'SetChest room reward -> ' + rewardTypeLabel(reward));
          }
        } catch (e) {}
      },
    });
    log('cheat', 'hook OpenRoomClearReward @ ' + openReward);
  }
}

function hookNativeEssenceMethods() {
  if (!essenceCheatActive()) {
    log('cheat', 'Essence: disabled (BONUS=' + MODIFIER_REWARD_BONUS + ', MULT=' + MODIFIER_REWARD_MULT + ', ESS=' + ESSENCE_REWARD_MULT + ')');
    return;
  }

  var mod = unityMod();
  if (!mod) {
    log('cheat', 'Essence: UnityFramework not loaded');
    return;
  }

  log('cheat', 'Essence: bonus=' + MODIFIER_REWARD_BONUS + ' modMult=' + MODIFIER_REWARD_MULT + ' essenceMult=' + ESSENCE_REWARD_MULT);

  var getModBonus = rvaPtr(RVA.GetRewardBonusFromModifiers);
  if (getModBonus) {
    Interceptor.attach(getModBonus, {
      onLeave: function (retval) {
        try {
          var bonus = this.context.s0;
          if (!isFinite(bonus)) return;
          log('cheat', 'Essence modifier bonus -> ' + pctLabel(bonus));
          var boosted = bonus;
          if (MODIFIER_REWARD_BONUS > 0) {
            boosted = MODIFIER_REWARD_BONUS;
          } else if (MODIFIER_REWARD_MULT > 1) {
            boosted = bonus * MODIFIER_REWARD_MULT;
          }
          if (boosted !== bonus) {
            this.context.s0 = boosted;
            log('cheat', 'Essence modifier bonus boosted -> ' + pctLabel(boosted));
          }
        } catch (e) {}
      },
    });
    log('cheat', 'hook GetRewardBonusFromModifiers @ ' + getModBonus);
  }

  var getEssenceReward = rvaPtr(RVA.GetEssenceReward);
  if (getEssenceReward) {
    Interceptor.attach(getEssenceReward, {
      onEnter: function (args) {
        var depth = -1;
        try {
          depth = args[1].toInt32();
        } catch (e) {}
        pushHookState(this, { depth: depth });
      },
      onLeave: function (retval) {
        try {
          var st = popHookState(this);
          var base = retval.toInt32();
          if (base <= 0 || ESSENCE_REWARD_MULT <= 1) {
            if (base > 0) {
              log('cheat', 'Essence depth ' + depthLabel(st.depth) + ' -> ' + base);
            }
            return;
          }
          var scaled = scaleEssence(base);
          if (scaled !== base) {
            retval.replace(ptr(scaled));
            log('cheat', 'Essence depth ' + depthLabel(st.depth) + ' ' + base + ' -> ' + scaled);
          }
        } catch (e) {}
      },
    });
    log('cheat', 'hook GetEssenceReward @ ' + getEssenceReward);
  }

  var depthGetEssence = rvaPtr(RVA.DepthGetEssence);
  if (depthGetEssence) {
    Interceptor.attach(depthGetEssence, {
      onEnter: function (args) {
        var depth = -1;
        try {
          depth = args[1].toInt32();
        } catch (e) {}
        pushHookState(this, { depth: depth });
      },
      onLeave: function (retval) {
        try {
          var st = popHookState(this);
          var base = retval.toInt32();
          if (base > 0) {
            log('cheat', 'Essence base depth ' + depthLabel(st.depth) + ' -> ' + base);
          }
        } catch (e) {}
      },
    });
    log('cheat', 'hook DepthGetEssence @ ' + depthGetEssence);
  }

  if (ESSENCE_REWARD_MULT > 1) {
    var addRes = rvaPtr(RVA.PlayerAddResource);
    if (addRes) {
      Interceptor.attach(addRes, {
        onEnter: function (args) {
          try {
            if (readResourceType(args[1]) !== RES_ESSENCE) return;
            var base = args[2].toInt32();
            if (base <= 0) return;
            var scaled = scaleEssence(base);
            if (scaled !== base) {
              args[2] = ptr(scaled);
              log('cheat', 'Essence AddResource ' + base + ' -> ' + scaled);
            }
          } catch (e) {}
        },
      });
      log('cheat', 'hook Player.AddResource (Essence) @ ' + addRes);
    }
  }
}

