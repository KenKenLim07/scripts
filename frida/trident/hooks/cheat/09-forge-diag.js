function safeDiagLootBag(label, args) {
  if (diagLootBagCount >= DIAG_MAX) return;
  diagLootBagCount++;
  log('diag', '--- ' + label + ' ---');
  try { log('diag', '  obj=' + args[1]); } catch (e) {}

  var params = args[2];
  if (!params || params.isNull()) {
    log('diag', '  no params');
    return;
  }
  var i, p, tier;
  for (i = 0; i < 6; i++) {
    try {
      p = Memory.readPointer(params.add(i * Process.pointerSize));
      if (p && !p.isNull()) {
        tier = readBoxedEnum(p);
        if (tier < 0) tier = p.toInt32();
        log('diag', '  p' + i + '=' + p + (tier >= 0 && tier <= 5 ? ' tier=' + tier : ''));
      }
    } catch (e2) {}
  }
}

function hookLootBagInvoke() {
  var mod = unityMod();
  if (!mod) return;
  var invoke;
  try { invoke = mod.getExportByName('il2cpp_runtime_invoke'); } catch (e) { return; }
  if (!invoke) return;

  Interceptor.attach(invoke, {
    onEnter: function (args) {
      if (!inDropWindow()) return;
      try {
        var label = methodLabel(args[0]);
        if (!label || label.indexOf('LootBag.') !== 0) return;
        if (diagEnabled() && DIAG_METHOD_RE.test(label)) safeDiagLootBag(label, args);
        if (!invokeSeen[label]) {
          invokeSeen[label] = 1;
          log('invoke', label);
        }
      } catch (e) {}
    },
  });
  log('cheat', 'LootBag invoke watch' + (diagEnabled() ? ' (DIAG)' : ''));
}

function armInvokeTrace(ms) {
  if (traceAttached) return;
  var mod = unityMod();
  if (!mod) return;
  var invoke;
  try { invoke = mod.getExportByName('il2cpp_runtime_invoke'); } catch (e) { return; }
  if (!invoke) return;

  traceAttached = true;
  var seen = {};
  var listener = Interceptor.attach(invoke, {
    onEnter: function (args) {
      if (!inDropWindow()) return;
      try {
        var label = methodLabel(args[0]);
        if (!label || !DROP_METHOD_RE.test(label) || /\.Update$/.test(label)) return;
        if (seen[label]) return;
        seen[label] = 1;
        log('invoke', label);
      } catch (e) {}
    },
  });
  setTimeout(function () {
    try { listener.detach(); } catch (e) {}
    traceAttached = false;
  }, ms);
}

function tryChestSwap(s, args) {
  if (!FORCE_BEST_CHEST || diagEnabled() || !s) return false;
  var dest = CHEST_DROP_SWAP[s];
  if (!dest) return false;
  Memory.writeUtf8String(args[0], dest);
  log('cheat', 'DROP SWAP ' + s + ' -> ' + dest);
  return true;
}

var lastForgeLogAt = 0;
var forgeActivityUntil = 0;

function forgeCheatActive() {
  return FORGE_ALWAYS_SUCCESS && FORGE_SUCCESS_RATE >= 1 && !diagEnabled();
}

function touchForgeActivity(reason) {
  forgeActivityUntil = Date.now() + FORGE_ACTIVITY_MS;
  if (reason === 'Forge()') {
    log('cheat', 'Forge activity window ' + (FORGE_ACTIVITY_MS / 1000) + 's (forge started)');
  }
}

function forgeActivityOpen() {
  return Date.now() < forgeActivityUntil;
}

function logForgeRateOnce(label, base, boosted) {
  var now = Date.now();
  if (now - lastForgeLogAt < 1500) return;
  lastForgeLogAt = now;
  log('cheat', 'Forge ' + label + ' ' + pctLabel(base) + ' -> ' + pctLabel(boosted));
}

function hookNativeForgeMethods() {
  if (!FORGE_ALWAYS_SUCCESS) {
    log('cheat', 'Forge: disabled (FORGE_ALWAYS_SUCCESS=false)');
    return;
  }

  var target = Math.min(1, Math.max(0, FORGE_SUCCESS_RATE));
  var prob = rvaPtr(RVA.ForgeSuccessProbability);
  if (prob) {
    Interceptor.attach(prob, {
      onEnter: function () {
        touchForgeActivity('GetSuccessProbability');
      },
      onLeave: function () {
        if (!forgeCheatActive()) return;
        try {
          var base = this.context.s0;
          if (!isFinite(base) || base >= target) return;
          this.context.s0 = target;
          logForgeRateOnce('roll', base, target);
        } catch (e) {}
      },
    });
    log('cheat', 'hook GetSuccessProbabilityForBloodstoneItemUpgrade @ ' + prob);
  }

  var display = rvaPtr(RVA.ForgeDisplayedSuccess);
  if (display) {
    Interceptor.attach(display, {
      onEnter: function () {
        touchForgeActivity('GetDisplayedSuccess');
      },
      onLeave: function () {
        if (!forgeCheatActive()) return;
        try {
          var base = this.context.s0;
          if (!isFinite(base) || base >= target) return;
          this.context.s0 = target;
          logForgeRateOnce('display', base, target);
        } catch (e) {}
      },
    });
    log('cheat', 'hook GetDisplayedSuccessProbabilityForBloodstoneItemUpgrade @ ' + display);
  }

  if (FORGE_SKIP_FAILURE_PENALTY) {
    var getFail = rvaPtr(RVA.ForgeFailureCount);
    if (getFail) {
      var getFailOrig = new NativeFunction(getFail, 'int', ['int']);
      Interceptor.replace(getFail, new NativeCallback(function (itemId) {
        if (forgeCheatActive()) return 0;
        return getFailOrig(itemId);
      }, 'int', ['int']));
      log('cheat', 'hook GetBloodstoneForgeFailureCount -> 0 @ ' + getFail);
    }

    var incFail = rvaPtr(RVA.IncrementForgeFailure);
    if (incFail) {
      var incFailOrig = new NativeFunction(incFail, 'void', ['int']);
      Interceptor.replace(incFail, new NativeCallback(function (itemId) {
        if (forgeCheatActive()) return;
        incFailOrig(itemId);
      }, 'void', ['int']));
      log('cheat', 'hook IncrementBloodstoneForgeFailureCount (no-op) @ ' + incFail);
    }
  }

  if (FORGE_HOOK_ROLL_CHANCE) {
    var forgeBtn = rvaPtr(RVA.BloodstoneForge);
    if (forgeBtn) {
      Interceptor.attach(forgeBtn, {
        onEnter: function () {
          touchForgeActivity('Forge()');
        },
      });
      log('cheat', 'hook BloodstoneCraftingView.Forge @ ' + forgeBtn);
    }

    var roll = rvaPtr(RVA.RollChance);
    if (roll) {
      Interceptor.attach(roll, {
        onEnter: function () {
          if (!forgeCheatActive() || !forgeActivityOpen()) return;
          try {
            this.context.s0 = target;
          } catch (e) {}
        },
        onLeave: function (retval) {
          if (!forgeCheatActive() || !forgeActivityOpen()) return;
          try {
            retval.replace(ptr(1));
            logForgeRateOnce('RollChance', 0, 1);
          } catch (e) {}
        },
      });
      log('cheat', 'hook RollChance (forge activity window) @ ' + roll);
    }
  }

  log('cheat', 'Forge: always success @ ' + pctLabel(target) +
      ' failPenalty=' + (FORGE_SKIP_FAILURE_PENALTY ? 'off' : 'on') +
      ' window=' + (FORGE_ACTIVITY_MS / 1000) + 's');
}

function hookDropStrings() {
  var mod = unityMod();
  if (!mod) return;

  ['il2cpp_string_new', 'il2cpp_string_new_utf16'].forEach(function (sym) {
    var p;
    try { p = mod.getExportByName(sym); } catch (e) { return; }
    if (!p) return;

    Interceptor.attach(p, {
      onEnter: function (args) {
        try {
          var s = Memory.readUtf8String(args[0]);
          if (!s || s.length > 96) return;

          if (tryChestSwap(s, args)) {
            openDropWindow('swap');
            return;
          }

          if (/PremiumChest\/Dropped|You dropped a/i.test(s)) {
            log('cheat', 'chest str: ' + s.replace(/<[^>]+>/g, ''));
            openDropWindow('chest str');
          }
        } catch (e) {}
      },
    });
  });
}

