function log(tag, msg) {
  console.log('[trident:' + tag + '] ' + msg);
}

function traceEnabled() {
  return typeof TRIDENT_CHEAT_TRACE !== 'undefined' && TRIDENT_CHEAT_TRACE;
}

function diagEnabled() {
  return typeof TRIDENT_CHEAT_DIAG !== 'undefined' && TRIDENT_CHEAT_DIAG;
}

function cheatActive() {
  return FORCE_BEST_CHEST && !diagEnabled();
}

function xpCheatActive() {
  return XP_MULT > 1 && !diagEnabled();
}

function dmgCheatActive() {
  return DMG_MULT > 1 && !diagEnabled();
}

function pveCombatCheatActive() {
  if (!PVE_COMBAT_ENABLED || diagEnabled()) return false;
  return COMBAT_CRIT_CHANCE_BONUS > 0 || COMBAT_CRIT_DAMAGE_MULT > 1 ||
    COMBAT_BLOCK_CHANCE_BONUS > 0 || COMBAT_DODGE_CHANCE_BONUS > 0 ||
    COMBAT_RESIST_BONUS > 0 || COMBAT_RESIST_MULT > 1 ||
    COMBAT_FOCUS_REGEN_MULT > 1 || COMBAT_FOCUS_REGEN_BONUS > 0;
}

function setChestCheatActive() {
  return (SET_DROP_RATE_MULT > 1 || MIN_SET_CHANCE > 0 || FORCE_SET_CHEST_ROOM) && !diagEnabled();
}

function essenceCheatActive() {
  return (MODIFIER_REWARD_BONUS > 0 || MODIFIER_REWARD_MULT > 1 || ESSENCE_REWARD_MULT > 1) && !diagEnabled();
}

function rewardTypeLabel(v) {
  if (v === DUNGEON_CLEAR_REWARD_SET) return 'Set (green)';
  if (v === 1) return 'Normal';
  return 'None';
}

function pctLabel(chance) {
  return (chance * 100).toFixed(2) + '%';
}

var hookCallStacks = {};

function hookCallKey(ctx) {
  return Process.getCurrentThreadId();
}

function pushHookState(ctx, data) {
  var key = hookCallKey(ctx);
  if (!hookCallStacks[key]) hookCallStacks[key] = [];
  hookCallStacks[key].push(data);
}

function popHookState(ctx) {
  var key = hookCallKey(ctx);
  var stack = hookCallStacks[key];
  if (!stack || !stack.length) return {};
  var data = stack.pop();
  if (!stack.length) delete hookCallStacks[key];
  return data;
}

function depthLabel(depth) {
  if (depth === undefined || depth === null || depth < 0) return '?';
  // Game uses 0-indexed dungeonDepth; UI floor is usually depth + 1.
  return depth + ' (floor ~' + (depth + 1) + ')';
}

function scaleXp(amount) {
  if (amount <= 0 || XP_MULT <= 1) return amount;
  return Math.floor(amount * XP_MULT);
}

function scaleEssence(amount) {
  if (amount <= 0 || ESSENCE_REWARD_MULT <= 1) return amount;
  return Math.floor(amount * ESSENCE_REWARD_MULT);
}

function scaleDamage(amount) {
  if (amount <= 0 || DMG_MULT <= 1) return amount;
  return Math.floor(amount * DMG_MULT);
}

function readFloatArg(arg) {
  try {
    var bits = arg.toUInt32();
    var buf = Memory.alloc(4);
    buf.writeU32(bits);
    return buf.readFloat();
  } catch (e) {}
  return 0;
}

function writeFloatArg(argPtr, value) {
  try {
    var buf = Memory.alloc(4);
    buf.writeFloat(value);
    argPtr.writeU32(buf.readU32());
  } catch (e) {}
}

function getServicesPtr() {
  try {
    if (!getServicesNative) {
      var svc = rvaPtr(RVA.ServicesInstance);
      if (!svc) return null;
      getServicesNative = new NativeFunction(svc, 'pointer', []);
    }
    var services = getServicesNative();
    if (!services || services.isNull()) return null;
    return services;
  } catch (e) {}
  return null;
}

function readServicesPlayerPtr(services, offset) {
  if (!services || services.isNull()) return null;
  try {
    var player = services.add(offset).readPointer();
    if (player && !player.isNull()) return player;
  } catch (e) {}
  return null;
}

function getPlayerPtr() {
  var services = getServicesPtr();
  if (!services) return null;
  var now = Date.now();
  var battlePlayer = isActiveBattle() ? getBattlePlayerPtr() : null;
  if (battlePlayer && !battlePlayer.isNull()) {
    if (cachedPlayerPtr && cachedPlayerPtr.equals(battlePlayer) && now - cachedPlayerAt < 5000) {
      return cachedPlayerPtr;
    }
    cachedPlayerPtr = battlePlayer;
    cachedPlayerAt = now;
    return battlePlayer;
  }
  var current = readServicesPlayerPtr(services, OFF.Services_currentPlayer);
  var dungeon = readServicesPlayerPtr(services, OFF.Services_dungeonPlayer);
  var surface = readServicesPlayerPtr(services, OFF.Services_player);
  var resolved = current || dungeon || surface;
  if (!resolved) return null;
  if (cachedPlayerPtr && !cachedPlayerPtr.isNull() && cachedPlayerPtr.equals(resolved) &&
      now - cachedPlayerAt < 5000) {
    return cachedPlayerPtr;
  }
  cachedPlayerPtr = resolved;
  cachedPlayerAt = now;
  return resolved;
}

function getLocalPlayerCandidates() {
  var out = [];
  var seen = {};
  function add(ptr) {
    if (!ptr || ptr.isNull()) return;
    var key = ptr.toString();
    if (seen[key]) return;
    seen[key] = true;
    out.push(ptr);
  }
  var battlePlayer = getBattlePlayerPtr();
  add(battlePlayer);
  var services = getServicesPtr();
  if (services) {
    add(readServicesPlayerPtr(services, OFF.Services_currentPlayer));
    add(readServicesPlayerPtr(services, OFF.Services_dungeonPlayer));
    add(readServicesPlayerPtr(services, OFF.Services_player));
  }
  add(getPlayerPtr());
  return out;
}

function getBattleControllerPtr(getterRva) {
  try {
    var fn;
    if (getterRva === RVA.BattleControllerInstance) {
      if (!getBattleInstanceNative) {
        var p = rvaPtr(getterRva);
        if (!p) return null;
        getBattleInstanceNative = new NativeFunction(p, 'pointer', []);
      }
      fn = getBattleInstanceNative;
    } else if (getterRva === RVA.BattleControllerPVP) {
      if (!getBattlePvpNative) {
        var p2 = rvaPtr(getterRva);
        if (!p2) return null;
        getBattlePvpNative = new NativeFunction(p2, 'pointer', []);
      }
      fn = getBattlePvpNative;
    } else if (getterRva === RVA.BattleControllerPVE) {
      if (!getBattlePveNative) {
        var p3 = rvaPtr(getterRva);
        if (!p3) return null;
        getBattlePveNative = new NativeFunction(p3, 'pointer', []);
      }
      fn = getBattlePveNative;
    } else {
      return null;
    }
    var bc = fn();
    if (!bc || bc.isNull()) return null;
    return bc;
  } catch (e) {}
  return null;
}

function readBattlePlayerFromController(bc) {
  if (!bc || bc.isNull()) return null;
  try {
    var player = bc.add(OFF.BattleController_player).readPointer();
    if (player && !player.isNull()) return player;
    return bc.add(OFF.BattleController_pvpPlayer).readPointer();
  } catch (e) {}
  return null;
}

function getBattlePlayerPtr() {
  var getters = [RVA.BattleControllerInstance, RVA.BattleControllerPVP, RVA.BattleControllerPVE];
  for (var i = 0; i < getters.length; i++) {
    var bc = getBattleControllerPtr(getters[i]);
    var player = readBattlePlayerFromController(bc);
    if (player && !player.isNull()) return player;
  }
  return null;
}

function getAnyBattleController() {
  var getters = [RVA.BattleControllerInstance, RVA.BattleControllerPVP, RVA.BattleControllerPVE];
  for (var i = 0; i < getters.length; i++) {
    var bc = getBattleControllerPtr(getters[i]);
    if (bc && !bc.isNull()) return bc;
  }
  return null;
}

function enumerateBattleControllers() {
  var getters = [RVA.BattleControllerPVP, RVA.BattleControllerInstance, RVA.BattleControllerPVE];
  var out = [];
  var seen = {};
  for (var i = 0; i < getters.length; i++) {
    var bc = getBattleControllerPtr(getters[i]);
    if (!bc || bc.isNull()) continue;
    var key = bc.toString();
    if (seen[key]) continue;
    seen[key] = true;
    out.push(bc);
  }
  return out;
}

function readBattlePhase(bc) {
  if (!bc || bc.isNull()) return -1;
  try {
    return bc.add(OFF.BattleController_battlePhase).readS32();
  } catch (e) {}
  return -1;
}

function readBattleType(bc) {
  if (!bc || bc.isNull()) return -1;
  try {
    return bc.add(OFF.BattleController_battleType).readS32();
  } catch (e) {}
  return -1;
}

function isCombatBattlePhase(phase) {
  return phase >= BATTLE_PHASE_TURN_START && phase <= BATTLE_PHASE_PERFORMING;
}

function isPvpMatchPhase(phase) {
  return phase >= BATTLE_PHASE_SETUP && phase <= BATTLE_PHASE_TURN_END;
}

function logPvpBlockOnce(msg) {
  var now = Date.now();
  if (now - lastPvpBlockLogAt < 5000) return;
  lastPvpBlockLogAt = now;
  log('cheat', msg);
}

function getActiveBattleController() {
  var controllers = enumerateBattleControllers();
  var fallback = null;
  for (var i = 0; i < controllers.length; i++) {
    var bc = controllers[i];
    var phase = readBattlePhase(bc);
    if (!isCombatBattlePhase(phase)) continue;
    if (readBattleType(bc) === BATTLE_TYPE_PVP) return bc;
    if (!fallback) fallback = bc;
  }
  return fallback;
}

function isActiveBattle() {
  return getActiveBattleController() !== null;
}

function isPvpBattleActive() {
  var controllers = enumerateBattleControllers();
  for (var i = 0; i < controllers.length; i++) {
    var bc = controllers[i];
    if (readBattleType(bc) !== BATTLE_TYPE_PVP) continue;
    if (isPvpMatchPhase(readBattlePhase(bc))) return true;
  }
  return false;
}

function isDungeonBattleActive() {
  var bc = getActiveBattleController();
  if (!bc) return false;
  try {
    var services = getServicesPtr();
    if (!services) return false;
    var dungeonPlayer = readServicesPlayerPtr(services, OFF.Services_dungeonPlayer);
    var battlePlayer = readBattlePlayerFromController(bc);
    return dungeonPlayer && battlePlayer && dungeonPlayer.equals(battlePlayer);
  } catch (e) {}
  return false;
}

function shouldApplyPveCombat() {
  if (!pveCombatCheatActive()) return false;
  if (isPvpBattleActive()) {
    logPvpBlockOnce('PvE combat blocked (PvP match active)');
    return false;
  }
  if (COMBAT_HOOKS_ONLY && !isActiveBattle()) return false;
  return true;
}

function shouldApplyPveDamageCheat(source) {
  if (!dmgCheatActive()) return false;
  if (isPvpBattleActive()) {
    logPvpBlockOnce('DMG blocked (PvP match active)');
    return false;
  }
  return isLocalPlayerCharacter(source);
}

function isLocalPlayerCharacter(ch) {
  if (!ch || ch.isNull()) return false;
  var candidates = getLocalPlayerCandidates();
  for (var i = 0; i < candidates.length; i++) {
    if (ch.equals(candidates[i])) return true;
  }
  return false;
}

function boostChanceStat(base, bonus) {
  if (bonus <= 0 || !isFinite(base)) return base;
  return Math.min(1.0, base + bonus);
}

function boostCritDamageModifier(base) {
  if (COMBAT_CRIT_DAMAGE_MULT <= 1 || !isFinite(base) || base <= 0) return base;
  return base * COMBAT_CRIT_DAMAGE_MULT;
}

function boostResistanceValue(base) {
  if (!isFinite(base)) return base;
  var boosted = base;
  if (COMBAT_RESIST_BONUS > 0) boosted += COMBAT_RESIST_BONUS;
  if (COMBAT_RESIST_MULT > 1) boosted *= COMBAT_RESIST_MULT;
  return Math.min(0.95, boosted);
}

function boostFocusRegenValue(base) {
  if (!isFinite(base) || base <= 0) return base;
  var boosted = base;
  if (COMBAT_FOCUS_REGEN_BONUS > 0) boosted += COMBAT_FOCUS_REGEN_BONUS;
  if (COMBAT_FOCUS_REGEN_MULT > 1) boosted = Math.floor(boosted * COMBAT_FOCUS_REGEN_MULT);
  return boosted;
}

var CHAR_STAT_LABELS = {
  9: 'SlashRes',
  10: 'PierceRes',
  11: 'BluntRes',
  12: 'ArcaneRes',
  13: 'DarkRes',
  14: 'HolyRes',
};

function isResistanceStat(stat) {
  return stat >= CHAR_STAT_SLASH_RES && stat <= CHAR_STAT_HOLY_RES;
}

function applyCharacterStatBoost(stat, base) {
  if (isResistanceStat(stat) && (COMBAT_RESIST_BONUS > 0 || COMBAT_RESIST_MULT > 1)) {
    return boostResistanceValue(base);
  }
  return base;
}

function characterStatLabel(stat) {
  return CHAR_STAT_LABELS[stat] || ('Stat' + stat);
}

function patchDamageStruct(damagePtr, label) {
  if (!damagePtr || damagePtr.isNull()) return false;
  try {
    var value = damagePtr.add(OFF.Damage_value).readS32();
    if (value <= 0) return false;
    var scaled = scaleDamage(value);
    if (scaled === value) return false;
    damagePtr.add(OFF.Damage_value).writeS32(scaled);
    damagePtr.add(OFF.Damage_attackResult_damage).writeS32(scaled);
    log('cheat', 'DMG ' + label + ' ' + value + ' -> ' + scaled);
    return true;
  } catch (e) {}
  return false;
}

function readBoxedInt(boxed) {
  if (!boxed || boxed.isNull()) return -1;
  try {
    return boxed.add(OFF.boxedEnumValue).readS32();
  } catch (e) {}
  return -1;
}

function readResourceType(arg) {
  try {
    var raw = arg.toInt32();
    if (raw >= 0 && raw <= 5) return raw;
  } catch (e) {}
  return readBoxedInt(arg);
}

function readCharacterStat(arg) {
  try {
    var raw = arg.toInt32();
    if (raw >= 0 && raw < 100) return raw;
  } catch (e) {}
  return readBoxedInt(arg);
}

var addXpNative = null;
var xpGrantDepth = 0;
function grantBonusXp(base) {
  if (base <= 0 || XP_MULT <= 1) return 0;
  var bonus = scaleXp(base) - base;
  if (bonus <= 0) return 0;
  try {
    if (!addXpNative) {
      var p = rvaPtr(RVA.AddXP);
      if (!p) return 0;
      addXpNative = new NativeFunction(p, 'void', ['int', 'pointer']);
    }
    xpGrantDepth++;
    addXpNative(bonus, ptr(0));
    xpGrantDepth--;
    return bonus;
  } catch (e) {
    xpGrantDepth = 0;
  }
  return 0;
}

function openDropWindow(reason) {
  dropWindowUntil = Date.now() + 25000;
  log('cheat', 'drop window: ' + reason);
  if (traceEnabled()) armInvokeTrace(25000);
}

function inDropWindow() {
  return Date.now() < dropWindowUntil;
}

function unityMod() {
  return Process.findModuleByName('UnityFramework');
}

function rvaPtr(offset) {
  var mod = unityMod();
  if (!mod) return null;
  return mod.base.add(offset);
}

function getIl2cppApi() {
  if (il2cppApi) return il2cppApi;
  var mod = unityMod();
  if (!mod) return null;
  try {
    il2cppApi = {
      methodGetName: new NativeFunction(mod.getExportByName('il2cpp_method_get_name'), 'pointer', ['pointer']),
      methodGetClass: new NativeFunction(mod.getExportByName('il2cpp_method_get_class'), 'pointer', ['pointer']),
      classGetName: new NativeFunction(mod.getExportByName('il2cpp_class_get_name'), 'pointer', ['pointer']),
    };
  } catch (e) {
    il2cppApi = null;
  }
  return il2cppApi;
}

function methodLabel(method) {
  var api = getIl2cppApi();
  if (!api || !method || method.isNull()) return '';
  try {
    var m = api.methodGetName(method).readUtf8String();
    var cls = api.methodGetClass(method);
    var c = cls && !cls.isNull() ? api.classGetName(cls).readUtf8String() : '?';
    return c + '.' + m;
  } catch (e) {
    return '';
  }
}

function readBoxedEnum(boxed) {
  if (!boxed || boxed.isNull()) return -1;
  try {
    var v = boxed.add(OFF.boxedEnumValue).readS32();
    if (v >= 0 && v <= 5) return v;
  } catch (e) {}
  return -1;
}

function writeBoxedEnum(boxed, tier, label) {
  if (!boxed || boxed.isNull()) return false;
  var before = readBoxedEnum(boxed);
  if (before < 0 || before === tier) return false;
  try {
    boxed.add(OFF.boxedEnumValue).writeS32(tier);
    log('cheat', label + ' boxed ' + before + ' -> ' + tier);
    return true;
  } catch (e) {
    return false;
  }
}

function patchEnumField(host, fieldOffset, tier, label) {
  if (!host || host.isNull()) return;
  try {
    // C# enum instance fields are inline int32 — small values must not be read as pointers.
    var inline = host.add(fieldOffset).readS32();
    if (inline >= 0 && inline <= 8) {
      if (inline >= 1 && inline <= 3 && inline !== tier) {
        host.add(fieldOffset).writeS32(tier);
        log('cheat', label + ' inline ' + inline + ' -> ' + tier);
      }
      return;
    }
    var boxed = host.add(fieldOffset).readPointer();
    if (boxed && !boxed.isNull()) {
      writeBoxedEnum(boxed, tier, label);
    }
  } catch (e) {}
}

function readNativeEnumArg(arg) {
  try {
    var raw = arg.toInt32();
    if (raw >= 0 && raw <= 5) return raw;
  } catch (e) {}
  return readBoxedInt(arg);
}

function isRawEnumArg(arg) {
  try {
    var v = arg.toUInt32();
    return v <= 8;
  } catch (e) {}
  return false;
}

// Patch IL2CPP enum args: raw int (0-8) OR boxed Il2CppObject* — never ptr(4) on a real pointer.
function getPremiumChestPopup() {
  try {
    if (!getServicesNative) {
      var svc = rvaPtr(RVA.ServicesInstance);
      if (!svc) return null;
      getServicesNative = new NativeFunction(svc, 'pointer', []);
    }
    var services = getServicesNative();
    if (!services || services.isNull()) return null;

    if (!getUiManagerNative) {
      var ui = rvaPtr(RVA.ServicesUIManager);
      if (!ui) return null;
      getUiManagerNative = new NativeFunction(ui, 'pointer', ['pointer']);
    }
    var uiMgr = getUiManagerNative(services);
    if (!uiMgr || uiMgr.isNull()) return null;

    var popup = uiMgr.add(OFF.UIManager_premiumChestPopup).readPointer();
    if (!popup || popup.isNull()) return null;
    return popup;
  } catch (e) {}
  return null;
}

function forceOpenMythicChest(reason) {
  if (!cheatActive() || !FORCE_CHEST_EVERY_KILL) return false;
  if (openChestCallDepth > 0) return false;
  try {
    var popup = getPremiumChestPopup();
    if (!popup) {
      log('cheat', 'forceOpenChest: PremiumChestPopup missing (' + reason + ')');
      return false;
    }
    if (!openChestNative) {
      var fn = rvaPtr(RVA.OpenChest);
      if (!fn) return false;
      openChestNative = new NativeFunction(fn, 'void', ['pointer', 'int']);
    }
    openChestCallDepth++;
    openChestNative(popup, PREMIUM_MYTHIC);
    log('cheat', 'forceOpenChest mythic (' + reason + ')');
    return true;
  } catch (e) {
    log('cheat', 'forceOpenChest failed (' + reason + '): ' + e);
  } finally {
    if (openChestCallDepth > 0) openChestCallDepth--;
  }
  return false;
}

function patchEnumArg(args, index, tier, label) {
  var arg = args[index];
  if (!arg || arg.isNull()) return false;
  if (isRawEnumArg(arg)) {
    var raw = arg.toInt32();
    if (raw >= 1 && raw <= 3 && raw !== tier) {
      args[index] = ptr(tier);
      log('cheat', label + ' raw enum ' + raw + ' -> ' + tier);
      return true;
    }
    return false;
  }
  var before = readBoxedInt(arg);
  if (before >= 1 && before <= 3 && before !== tier) {
    return writeBoxedEnum(arg, tier, label);
  }
  return false;
}

