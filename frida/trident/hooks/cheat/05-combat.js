function hookNativePveCombatStats() {
  if (!pveCombatCheatActive()) {
    log('cheat', 'PvE combat: disabled');
    return;
  }

  var mod = unityMod();
  if (!mod) {
    log('cheat', 'PvE combat: UnityFramework not loaded');
    return;
  }

  log('cheat', 'PvE combat: crit+' + pctLabel(COMBAT_CRIT_CHANCE_BONUS) +
    ' block+' + pctLabel(COMBAT_BLOCK_CHANCE_BONUS) +
    ' dodge+' + pctLabel(COMBAT_DODGE_CHANCE_BONUS) +
    ' resist+' + pctLabel(COMBAT_RESIST_BONUS) +
    ' focusMult=' + COMBAT_FOCUS_REGEN_MULT +
    ' battleOnly=' + COMBAT_HOOKS_ONLY);

  var getCritChance = rvaPtr(RVA.GetCritChance);
  if (getCritChance) {
    Interceptor.attach(getCritChance, {
      onEnter: function (args) {
        pushHookState(this, { source: args[0], target: args[1] });
      },
      onLeave: function () {
        var st = popHookState(this);
        if (!shouldApplyPveCombat() || COMBAT_CRIT_CHANCE_BONUS <= 0) return;
        if (!isLocalPlayerCharacter(st.source)) return;
        try {
          var base = this.context.s0;
          if (!isFinite(base)) return;
          var boosted = boostChanceStat(base, COMBAT_CRIT_CHANCE_BONUS);
          if (boosted !== base) {
            this.context.s0 = boosted;
            log('cheat', 'PvE crit ' + pctLabel(base) + ' -> ' + pctLabel(boosted));
          }
        } catch (e) {}
      },
    });
    log('cheat', 'hook GetCritChance @ ' + getCritChance);
  }

  var getCritDmg = rvaPtr(RVA.GetCritDamageModifier);
  if (getCritDmg) {
    Interceptor.attach(getCritDmg, {
      onEnter: function (args) {
        pushHookState(this, { source: args[0], target: args[1] });
      },
      onLeave: function () {
        var st = popHookState(this);
        if (!shouldApplyPveCombat() || COMBAT_CRIT_DAMAGE_MULT <= 1) return;
        if (!isLocalPlayerCharacter(st.source)) return;
        try {
          var base = this.context.s0;
          if (!isFinite(base) || base <= 0) return;
          var boosted = boostCritDamageModifier(base);
          if (boosted !== base) {
            this.context.s0 = boosted;
            log('cheat', 'PvE crit dmg x' + base.toFixed(2) + ' -> x' + boosted.toFixed(2));
          }
        } catch (e) {}
      },
    });
    log('cheat', 'hook GetCritDamageModifier @ ' + getCritDmg);
  }

  var getBlockChance = rvaPtr(RVA.GetBlockChance);
  if (getBlockChance) {
    Interceptor.attach(getBlockChance, {
      onEnter: function (args) {
        pushHookState(this, { source: args[0], target: args[1] });
      },
      onLeave: function () {
        var st = popHookState(this);
        if (!shouldApplyPveCombat() || COMBAT_BLOCK_CHANCE_BONUS <= 0) return;
        if (!isLocalPlayerCharacter(st.target)) return;
        try {
          var base = this.context.s0;
          if (!isFinite(base)) return;
          var boosted = boostChanceStat(base, COMBAT_BLOCK_CHANCE_BONUS);
          if (boosted !== base) {
            this.context.s0 = boosted;
            log('cheat', 'PvE block ' + pctLabel(base) + ' -> ' + pctLabel(boosted));
          }
        } catch (e) {}
      },
    });
    log('cheat', 'hook GetBlockChance @ ' + getBlockChance);
  }

  var getDodgeChance = rvaPtr(RVA.GetDodgeChance);
  if (getDodgeChance) {
    Interceptor.attach(getDodgeChance, {
      onEnter: function (args) {
        pushHookState(this, { source: args[0], target: args[1] });
      },
      onLeave: function () {
        var st = popHookState(this);
        if (!shouldApplyPveCombat() || COMBAT_DODGE_CHANCE_BONUS <= 0) return;
        if (!isLocalPlayerCharacter(st.target)) return;
        try {
          var base = this.context.s0;
          if (!isFinite(base)) return;
          var boosted = boostChanceStat(base, COMBAT_DODGE_CHANCE_BONUS);
          if (boosted !== base) {
            this.context.s0 = boosted;
            log('cheat', 'PvE dodge ' + pctLabel(base) + ' -> ' + pctLabel(boosted));
          }
        } catch (e) {}
      },
    });
    log('cheat', 'hook GetDodgeChance @ ' + getDodgeChance);
  }

  var getFocusRegen = rvaPtr(RVA.GetFocusRegen);
  if (getFocusRegen) {
    Interceptor.attach(getFocusRegen, {
      onEnter: function (args) {
        pushHookState(this, { character: args[0] });
      },
      onLeave: function (retval) {
        var st = popHookState(this);
        if (!shouldApplyPveCombat()) return;
        if (COMBAT_FOCUS_REGEN_MULT <= 1 && COMBAT_FOCUS_REGEN_BONUS <= 0) return;
        if (!isLocalPlayerCharacter(st.character)) return;
        try {
          var base = retval.toInt32();
          if (base <= 0) return;
          var boosted = boostFocusRegenValue(base);
          if (boosted !== base) {
            retval.replace(ptr(boosted));
            log('cheat', 'PvE focus regen ' + base + ' -> ' + boosted +
              (isDungeonBattleActive() ? ' [abyss]' : ''));
          }
        } catch (e) {}
      },
    });
    log('cheat', 'hook GetFocusRegen @ ' + getFocusRegen);
  }

  var getCharacterStat = rvaPtr(RVA.GetCharacterStat);
  if (getCharacterStat) {
    Interceptor.attach(getCharacterStat, {
      onEnter: function (args) {
        pushHookState(this, {
          character: args[0],
          stat: readCharacterStat(args[1]),
        });
      },
      onLeave: function () {
        var st = popHookState(this);
        if (!shouldApplyPveCombat()) return;
        if (!isLocalPlayerCharacter(st.character)) return;
        if (!isResistanceStat(st.stat)) return;
        try {
          var base = this.context.s0;
          if (!isFinite(base)) return;
          var boosted = applyCharacterStatBoost(st.stat, base);
          if (boosted !== base) {
            this.context.s0 = boosted;
            log('cheat', 'PvE ' + characterStatLabel(st.stat) + ' ' + pctLabel(base) + ' -> ' + pctLabel(boosted));
          }
        } catch (e) {}
      },
    });
    log('cheat', 'hook GetCharacterStat (resist) @ ' + getCharacterStat);
  }
}

