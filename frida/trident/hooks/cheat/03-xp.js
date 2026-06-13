function hookNativeXpMethods() {
  if (!xpCheatActive()) {
    log('cheat', 'XP: disabled (XP_MULT=' + XP_MULT + ')');
    return;
  }

  var mod = unityMod();
  if (!mod) {
    log('cheat', 'XP: UnityFramework not loaded');
    return;
  }

  log('cheat', 'XP: MULT=' + XP_MULT + ' (DoXPLoot + AddResource + AddXP)');

  var doXpLoot = rvaPtr(RVA.DoXPLoot);
  if (doXpLoot) {
    Interceptor.attach(doXpLoot, {
      onEnter: function (args) {
        try {
          var base = args[1].toInt32();
          if (base <= 0) return;
          var scaled = scaleXp(base);
          if (scaled === base) return;
          args[1] = ptr(scaled);
          var bonus = grantBonusXp(base);
          log('cheat', 'XP DoXPLoot ' + base + ' -> ' + scaled + (bonus ? (' (+' + bonus + ' bonus)') : ''));
        } catch (e) {}
      },
    });
    log('cheat', 'hook DoXPLoot @ ' + doXpLoot);
  }

  var addRes = rvaPtr(RVA.PlayerAddResource);
  if (addRes) {
    Interceptor.attach(addRes, {
      onEnter: function (args) {
        try {
          if (readResourceType(args[1]) !== RES_XP) return;
          var base = args[2].toInt32();
          if (base <= 0) return;
          var scaled = scaleXp(base);
          if (scaled !== base) {
            args[2] = ptr(scaled);
            log('cheat', 'XP AddResource ' + base + ' -> ' + scaled);
          }
        } catch (e) {}
      },
    });
    log('cheat', 'hook Player.AddResource @ ' + addRes);
  }

  var addXp = rvaPtr(RVA.AddXP);
  if (addXp) {
    Interceptor.attach(addXp, {
      onEnter: function (args) {
        try {
          if (xpGrantDepth > 0) return;
          var base = args[0].toInt32();
          if (base <= 0) return;
          var scaled = scaleXp(base);
          if (scaled !== base) {
            args[0] = ptr(scaled);
            log('cheat', 'XP yarn ' + base + ' -> ' + scaled);
          }
        } catch (e) {}
      },
    });
    log('cheat', 'hook YarnBridge.AddXP @ ' + addXp);
  }

  var showRewards = rvaPtr(RVA.ShowRewardsFloatingText);
  if (showRewards) {
    Interceptor.attach(showRewards, {
      onEnter: function (args) {
        try {
          var xp = args[4].toInt32();
          if (xp <= 0) return;
          var scaled = scaleXp(xp);
          if (scaled !== xp) {
            args[4] = ptr(scaled);
            log('cheat', 'XP float text ' + xp + ' -> ' + scaled);
          }
        } catch (e) {}
      },
    });
    log('cheat', 'hook ShowRewardsFloatingText @ ' + showRewards);
  }

  var giveXp = rvaPtr(RVA.GiveXpReward);
  if (giveXp) {
    Interceptor.attach(giveXp, {
      onEnter: function () {
        log('cheat', 'GiveXpReward');
      },
    });
    log('cheat', 'hook GiveXpReward @ ' + giveXp);
  }
}

