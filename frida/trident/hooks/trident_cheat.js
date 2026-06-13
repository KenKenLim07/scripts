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

// --- Premium chest (PvE mob kills) ---
var FORCE_BEST_CHEST = true;
var FORCE_CHEST_EVERY_KILL = true;
var PREMIUM_MYTHIC = 5; // PremiumChestType.Mythic (3 = Unique)
var RARITY_MYTHIC = 5; // Rarity.Mythic (different enum from PremiumChestType)

// --- Mythic chest loot (paid shard open — target item / allow dupes) ---
var FORCE_MYTHIC_LOOT = false; // master switch — set true on dummy / alt account
var FORCE_MYTHIC_LOOT_ID = 1148; // Eye of Hold (pinned from live resolve)
var FORCE_MYTHIC_LOOT_NAME = 'Eye of Hold'; // display + fallback lookup when ID is 0
var MYTHIC_LOOT_CLEAR_EXCLUDED = true; // owned mythics are normally excluded — clear list
var MYTHIC_LOOT_REPLACE_FIRST = true; // replace first rolled item; false = all slots
var MYTHIC_LOOT_LOG = false; // log rolled item names on mythic open (enable to debug)

// --- XP ---
var XP_MULT = 1000; // 1 = off

// --- PvE combat stats (auto-disabled during PvP) ---
var PVE_COMBAT_ENABLED = true;
var DMG_MULT = 5; // player -> enemy damage; 1 = off
var COMBAT_CRIT_CHANCE_BONUS = 0.15; // absolute crit chance add (0 = off)
var COMBAT_CRIT_DAMAGE_MULT = 2; // 1 = off
var COMBAT_BLOCK_CHANCE_BONUS = 0.15;
var COMBAT_DODGE_CHANCE_BONUS = 0.10;
var COMBAT_RESIST_BONUS = 0.20; // all damage types (slash/pierce/blunt/arcane/dark/holy)
var COMBAT_RESIST_MULT = 1; // 1 = off
var COMBAT_FOCUS_REGEN_MULT = 2; // 1 = off; multiplies integer FP gained per turn
var COMBAT_FOCUS_REGEN_BONUS = 50; // flat +FP per turn (NOT 0-1 scale — use whole numbers)
var COMBAT_HOOKS_ONLY = true; // only during active battle (not stats screen)

// --- Abyssal Dungeon — green set chest ---
var SET_DROP_RATE_MULT = 50;
var MIN_SET_CHANCE = 0;
var FORCE_SET_CHEST_ROOM = true;

// --- Abyssal Dungeon — essence rewards ---
var MODIFIER_REWARD_BONUS = 2.0; // 0 = use MODIFIER_REWARD_MULT instead
var MODIFIER_REWARD_MULT = 1;
var ESSENCE_REWARD_MULT = 100;

// --- Bloodstone forge (Marid / item blood-level upgrade) ---
var FORGE_ALWAYS_SUCCESS = true; // force 100% forge success (UI + roll)
var FORGE_SUCCESS_RATE = 1.0; // target rate when FORGE_ALWAYS_SUCCESS (0-1)
var FORGE_HOOK_ROLL_CHANCE = true; // force RollChance true during forge activity
var FORGE_SKIP_FAILURE_PENALTY = true; // ignore pity/failure count (stops rate dropping)
var FORGE_ACTIVITY_MS = 30000; // RollChance window after forge UI / probability calls

var RVA = {
  SpawnLoot: 0x43D0FA0,
  CheckGivePremiumChest: 0x43D1C6C,
  SpawnLootBagContent: 0x44ED098,
  SpawnLootBagItems: 0x44EC294,
  OpenChest: 0x457DD1C,
  UpdateUI: 0x457DDD8,
  GetPremiumChestType: 0x44E8F7C,
  GetLoot: 0x457E460,
  RandomRangeInt: 0x73195C0, // UnityEngine.Random.Range(int,int)
  GiveXpReward: 0x43D0D28,
  ShowRewardsFloatingText: 0x43D0EF8,
  DoXPLoot: 0x43E5DE4, // DamageNumbersManager.DoXPLoot — floating "+XXX XP"
  AddXP: 0x423100C, // YarnBridge.AddXP(int) — quests/dialogue
  PlayerAddResource: 0x439A4F0, // Player.AddResource(ResourceType, int, string)
  ServicesInstance: 0x42163B8,
  ServicesUIManager: 0x421602C,
  TakeDamage: 0x4347284, // Character.TakeDamage(Damage)
  DoDamageNumber: 0x43ED828, // DamageNumbersManager.DoDamageNumber(float, ...)
  GetDungeonClearRewardType: 0x44EEAA0, // DungeonManager.GetDungeonClearRewardTypeForDungeonDepth
  GetSetChance: 0x44FB128, // DungeonDepthClearRewardData.GetSetChance
  PermanentUpgradeGetValue: 0x44FC724, // DungeonPermanentUpgradeExtensions.GetValue
  OpenRoomClearReward: 0x44F5934, // DungeonManager.OpenRoomClearReward
  GetEssenceReward: 0x44F3C48, // DungeonManager.GetEssenceReward(int dungeonDepth)
  GetRewardBonusFromModifiers: 0x44F5508, // DungeonManager.GetRewardBonusFromModifiers() — 5/15/25% cap
  DepthGetEssence: 0x44F3D94, // DungeonDepthEssenceReward.GetEssence(int dungeonDepth)
  GetCritChance: 0x451FB38, // Formulas.GetCritChance(Character source, Character target)
  GetCritDamageModifier: 0x451E154, // Formulas.GetCritDamageModifier
  GetBlockChance: 0x451F508, // Formulas.GetBlockChance(source, target, includeWeaken)
  GetDodgeChance: 0x451EE84, // Formulas.GetDodgeChance(source, target)
  BattleControllerInstance: 0x43CC51C, // BattleController.get_Instance()
  BattleControllerPVP: 0x43CC66C, // BattleController.get_PVPInstance()
  BattleControllerPVE: 0x43CC5C4, // BattleController.get_PVEInstance()
  GetFocusRegen: 0x452004C, // Formulas.GetFocusRegen(Character, bool isComboTurn)
  GetCharacterStat: 0x4342F38, // Character.GetCharacterStat(CharacterStat)
  FindItemsForItemRarity: 0x457EF14, // PremiumChestPopup.FindItemsForItemRarity (static)
  FindAndAddItemToLoot: 0x457ECB0, // PremiumChestPopup.FindAndAddItemToLoot (static)
  ItemRepositoryGetItemByName: 0x42224D0,
  ItemRepositoryGetItemById: 0x42223E8,
  PersistentItemLoadFromItemID: 0x4223B10,
  PersistentItemName: 0x4223B68,
  ForgeSuccessProbability: 0x4520FFC, // Formulas.GetSuccessProbabilityForBloodstoneItemUpgrade
  ForgeDisplayedSuccess: 0x45211D4, // Formulas.GetDisplayedSuccessProbabilityForBloodstoneItemUpgrade
  RollChance: 0x451F140, // HelperMethods.RollChance(float, string log)
  BloodstoneForge: 0x42BAB04, // BloodstoneCraftingView.Forge()
  ForgeFailureCount: 0x42BD0A4, // BloodstoneCraftingView.GetBloodstoneForgeFailureCount
  IncrementForgeFailure: 0x42BD12C, // BloodstoneCraftingView.IncrementBloodstoneForgeFailureCount
};

var RES_XP = 50; // ResourceType.XP
var RES_ESSENCE = 5; // ResourceType.Essence
var DUNGEON_UPGRADE_SET_DROP_RATE = 8; // DungeonPermanentUpgrade.SetDropRate
var DUNGEON_CLEAR_REWARD_SET = 2; // DungeonClearRewardType.Set (green chest)
var BATTLE_TYPE_PVP = 2;
var BATTLE_PHASE_SETUP = 1;
var BATTLE_PHASE_TURN_START = 2;
var BATTLE_PHASE_PERFORMING = 4;
var BATTLE_PHASE_TURN_END = 5;
var CHAR_STAT_SLASH_RES = 9;
var CHAR_STAT_PIERCE_RES = 10;
var CHAR_STAT_BLUNT_RES = 11;
var CHAR_STAT_ARCANE_RES = 12;
var CHAR_STAT_DARK_RES = 13;
var CHAR_STAT_HOLY_RES = 14;

var OFF = {
  LootBag_premiumChestType: 0x20,
  PremiumChestPopup_premiumChestType: 0x154,
  UIManager_premiumChestPopup: 0x98,
  Services_player: 0x58,
  Services_dungeonPlayer: 0x60,
  Services_currentPlayer: 0x68,
  Damage_value: 0x58,
  Damage_source: 0x60,
  Damage_attackResult_damage: 0x34,
  boxedEnumValue: 0x10,
  BattleController_battleType: 0x24,
  BattleController_pvpPlayer: 0x40,
  BattleController_player: 0x68,
  BattleController_battlePhase: 0xAC,
  Services_itemRepository: 0x28,
  LootBagContent_loot: 0x20,
  List_items: 0x10,
  List_size: 0x18,
  Player_inventory: 0x2D8,
  PersistentItem_itemId: 0x20,
  Item_id: 0x10,
  Item_name: 0x18,
};

var getServicesNative = null;
var getUiManagerNative = null;
var getBattleInstanceNative = null;
var getBattlePvpNative = null;
var getBattlePveNative = null;
var openChestNative = null;
var spawnLootNeedsChest = false;
var openChestCallDepth = 0;
var cachedPlayerPtr = null;
var cachedForceMythicItemId = 0;
var cachedForceMythicItemIdAt = 0;
var mythicLootNativesReady = false;
var getItemByNameNative = null;
var getItemByIdNative = null;
var loadItemFromItemIdNative = null;
var persistentItemNameNative = null;
var il2cppStringNewNative = null;
var cachedPlayerAt = 0;
var dmgPatchDepth = 0;
var lastPvpBlockLogAt = 0;

var CHEST_DROP_SWAP = {
  'PremiumChest/DroppedCommon': 'PremiumChest/DroppedMythic',
  'PremiumChest/DroppedRare': 'PremiumChest/DroppedMythic',
  'PremiumChest/DroppedUnique': 'PremiumChest/DroppedMythic',
  'You dropped a Common chest!': 'You dropped a Mythic chest!',
  'You dropped a Rare chest!': 'You dropped a Mythic chest!',
  'You dropped a Unique chest!': 'You dropped a Mythic chest!',
};

var DROP_METHOD_RE = /^LootBag\.|LootBagManager\.|BattleController\.(SpawnLoot|CheckGivePremiumChest)|PremiumChestPopup\./i;

var dropWindowUntil = 0;
var traceAttached = false;
var invokeSeen = {};
var il2cppApi = null;
var diagLootBagCount = 0;
var DIAG_MAX = 8;
var DIAG_METHOD_RE = /LootBag\.(\.ctor|Awake|Start|Init|Set|Create|Load|Configure|Premium|Chest|Drop|Tier|Rarity)/;

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

function readIl2CppStringSafe(strPtr) {
  if (typeof readIl2CppString === 'function') return readIl2CppString(strPtr);
  if (!strPtr || strPtr.isNull()) return null;
  try {
    var len = strPtr.add(0x10).readS32();
    if (len <= 0 || len > 4096) return null;
    return strPtr.add(0x14).readUtf16String(len);
  } catch (e) {}
  return null;
}

function mythicLootCheatActive() {
  if (!cheatActive() || !FORCE_MYTHIC_LOOT) return false;
  return (FORCE_MYTHIC_LOOT_NAME && FORCE_MYTHIC_LOOT_NAME.length) || FORCE_MYTHIC_LOOT_ID > 0;
}

function mythicLootTargetLabel() {
  if (FORCE_MYTHIC_LOOT_NAME) return FORCE_MYTHIC_LOOT_NAME;
  if (FORCE_MYTHIC_LOOT_ID > 0) return 'id=' + FORCE_MYTHIC_LOOT_ID;
  return 'off';
}

function getItemRepositoryPtr() {
  var services = getServicesPtr();
  if (!services) return null;
  try {
    var repo = services.add(OFF.Services_itemRepository).readPointer();
    if (repo && !repo.isNull()) return repo;
  } catch (e) {}
  return null;
}

function ensureMythicLootNatives() {
  if (mythicLootNativesReady) return true;
  var mod = unityMod();
  if (!mod) return false;
  try {
    if (!getItemByNameNative) {
      var byName = rvaPtr(RVA.ItemRepositoryGetItemByName);
      if (!byName) return false;
      getItemByNameNative = new NativeFunction(byName, 'pointer', ['pointer', 'pointer', 'pointer']);
    }
    if (!getItemByIdNative) {
      var byId = rvaPtr(RVA.ItemRepositoryGetItemById);
      if (!byId) return false;
      getItemByIdNative = new NativeFunction(byId, 'pointer', ['pointer', 'int', 'pointer']);
    }
    if (!loadItemFromItemIdNative) {
      var loadFn = rvaPtr(RVA.PersistentItemLoadFromItemID);
      if (!loadFn) return false;
      loadItemFromItemIdNative = new NativeFunction(loadFn, 'void', ['pointer', 'pointer', 'pointer']);
    }
    if (!persistentItemNameNative) {
      var nameFn = rvaPtr(RVA.PersistentItemName);
      if (!nameFn) return false;
      persistentItemNameNative = new NativeFunction(nameFn, 'pointer', ['pointer', 'pointer']);
    }
    if (!il2cppStringNewNative) {
      var strNew = mod.getExportByName('il2cpp_string_new');
      if (!strNew) return false;
      il2cppStringNewNative = new NativeFunction(strNew, 'pointer', ['pointer']);
    }
    mythicLootNativesReady = true;
    return true;
  } catch (e) {
    log('cheat', 'MythicLoot natives failed: ' + e);
  }
  return false;
}

function makeIl2CppStringUtf8(str) {
  if (!ensureMythicLootNatives()) return null;
  try {
    return il2cppStringNewNative(Memory.allocUtf8String(str));
  } catch (e) {}
  return null;
}

function readListSize(listPtr) {
  if (!listPtr || listPtr.isNull()) return 0;
  try {
    return listPtr.add(OFF.List_size).readS32();
  } catch (e) {}
  return 0;
}

function readListElementPtr(listPtr, index) {
  if (!listPtr || listPtr.isNull()) return null;
  try {
    var items = listPtr.add(OFF.List_items).readPointer();
    if (!items || items.isNull()) return null;
    return items.add(0x20 + index * Process.pointerSize).readPointer();
  } catch (e) {}
  return null;
}

function clearExcludedItemIds(listPtr, label) {
  if (!listPtr || listPtr.isNull()) return;
  try {
    var size = readListSize(listPtr);
    if (size <= 0) return;
    listPtr.add(OFF.List_size).writeS32(0);
    log('cheat', 'MythicLoot cleared excludedItems x' + size + ' (' + label + ')');
  } catch (e) {}
}

function readRarityArg(arg) {
  var boxed = readBoxedEnum(arg);
  if (boxed >= 0) return boxed;
  return readNativeEnumArg(arg);
}

function maybeClearMythicExcludedItems(args, label) {
  if (!mythicLootCheatActive() || !MYTHIC_LOOT_CLEAR_EXCLUDED) return;
  if (readRarityArg(args[0]) !== RARITY_MYTHIC) return;
  clearExcludedItemIds(args[3], label);
}

function readItemNameFromDef(itemPtr) {
  if (!itemPtr || itemPtr.isNull()) return null;
  try {
    return readIl2CppStringSafe(itemPtr.add(OFF.Item_name).readPointer());
  } catch (e) {}
  return null;
}

function readPersistentItemDisplayName(pitem) {
  if (!pitem || pitem.isNull()) return null;
  if (ensureMythicLootNatives()) {
    try {
      var nameStr = persistentItemNameNative(pitem, ptr(0));
      var name = readIl2CppStringSafe(nameStr);
      if (name) return name;
    } catch (e) {}
  }
  try {
    var itemId = pitem.add(OFF.PersistentItem_itemId).readS32();
    var repo = getItemRepositoryPtr();
    if (repo && itemId > 0 && ensureMythicLootNatives()) {
      var itemDef = getItemByIdNative(repo, itemId, ptr(0));
      return readItemNameFromDef(itemDef);
    }
  } catch (e) {}
  return null;
}

function namesMatchWanted(wanted, found) {
  if (!wanted || !found) return false;
  return found.toLowerCase().indexOf(wanted.toLowerCase()) >= 0 ||
      wanted.toLowerCase().indexOf(found.toLowerCase()) >= 0;
}

function scanInventoryForItemId(wantedName) {
  var player = getPlayerPtr();
  if (!player) return 0;
  try {
    var inv = player.add(OFF.Player_inventory).readPointer();
    var count = readListSize(inv);
    var i, pitem, name, itemId;
    for (i = 0; i < count; i++) {
      pitem = readListElementPtr(inv, i);
      if (!pitem || pitem.isNull()) continue;
      name = readPersistentItemDisplayName(pitem);
      if (namesMatchWanted(wantedName, name)) {
        itemId = pitem.add(OFF.PersistentItem_itemId).readS32();
        if (itemId > 0) {
          log('cheat', 'MythicLoot inventory match "' + name + '" itemId=' + itemId);
          return itemId;
        }
      }
    }
  } catch (e) {}
  return 0;
}

function resolveForceMythicItemId() {
  if (FORCE_MYTHIC_LOOT_ID > 0) return FORCE_MYTHIC_LOOT_ID;
  if (!FORCE_MYTHIC_LOOT_NAME) return 0;

  var now = Date.now();
  if (cachedForceMythicItemId > 0 && now - cachedForceMythicItemIdAt < 120000) {
    return cachedForceMythicItemId;
  }
  if (!ensureMythicLootNatives()) return 0;

  var repo = getItemRepositoryPtr();
  if (!repo) return 0;

  var variants = [FORCE_MYTHIC_LOOT_NAME];
  if (FORCE_MYTHIC_LOOT_NAME.indexOf(' of ') >= 0) {
    variants.push(FORCE_MYTHIC_LOOT_NAME.replace(/ of /i, ' Of '));
  }
  variants.push(FORCE_MYTHIC_LOOT_NAME.toUpperCase());

  var seen = {};
  var i, name, il2Str, itemDef, itemId;
  for (i = 0; i < variants.length; i++) {
    name = variants[i];
    if (!name || seen[name]) continue;
    seen[name] = true;
    il2Str = makeIl2CppStringUtf8(name);
    if (!il2Str) continue;
    try {
      itemDef = getItemByNameNative(repo, il2Str, ptr(0));
      if (itemDef && !itemDef.isNull()) {
        itemId = itemDef.add(OFF.Item_id).readS32();
        if (itemId > 0) {
          cachedForceMythicItemId = itemId;
          cachedForceMythicItemIdAt = now;
          log('cheat', 'MythicLoot resolved "' + name + '" -> itemId=' + itemId);
          return itemId;
        }
      }
    } catch (e) {}
  }

  itemId = scanInventoryForItemId(FORCE_MYTHIC_LOOT_NAME);
  if (itemId > 0) {
    cachedForceMythicItemId = itemId;
    cachedForceMythicItemIdAt = now;
    return itemId;
  }

  log('cheat', 'MythicLoot could not resolve "' + FORCE_MYTHIC_LOOT_NAME + '" — set FORCE_MYTHIC_LOOT_ID if needed');
  return 0;
}

function logMythicLootRoll(contentPtr) {
  if (!MYTHIC_LOOT_LOG || !contentPtr || contentPtr.isNull()) return;
  try {
    var loot = contentPtr.add(OFF.LootBagContent_loot).readPointer();
    var count = readListSize(loot);
    var i, pitem, name, parts = [];
    for (i = 0; i < count; i++) {
      pitem = readListElementPtr(loot, i);
      name = readPersistentItemDisplayName(pitem) || '?';
      parts.push(name);
    }
    log('cheat', 'MythicLoot rolled x' + count + ': ' + (parts.length ? parts.join(', ') : '(empty)'));
  } catch (e) {}
}

function patchPersistentItemToId(pitem, itemId, repo) {
  if (!pitem || pitem.isNull() || itemId <= 0 || !repo) return false;
  try {
    pitem.add(OFF.PersistentItem_itemId).writeS32(itemId);
    loadItemFromItemIdNative(pitem, repo, ptr(0));
    return true;
  } catch (e) {
    log('cheat', 'MythicLoot patch item failed: ' + e);
  }
  return false;
}

function patchMythicLootContent(contentPtr) {
  if (!contentPtr || contentPtr.isNull()) return false;
  var itemId = resolveForceMythicItemId();
  if (itemId <= 0) return false;
  var repo = getItemRepositoryPtr();
  if (!repo) return false;

  try {
    var loot = contentPtr.add(OFF.LootBagContent_loot).readPointer();
    var count = readListSize(loot);
    if (count <= 0) {
      log('cheat', 'MythicLoot: loot list empty — cannot patch');
      return false;
    }
    var limit = MYTHIC_LOOT_REPLACE_FIRST ? 1 : count;
    var i, pitem, ok = 0;
    for (i = 0; i < limit; i++) {
      pitem = readListElementPtr(loot, i);
      if (patchPersistentItemToId(pitem, itemId, repo)) ok++;
    }
    if (ok > 0) {
      log('cheat', 'MythicLoot forced "' + mythicLootTargetLabel() + '" (id=' + itemId + ') x' + ok);
      return true;
    }
  } catch (e) {
    log('cheat', 'MythicLoot patch failed: ' + e);
  }
  return false;
}

function hookNativeMythicLootMethods() {
  if (!mythicLootCheatActive() && !MYTHIC_LOOT_LOG) return;

  var mod = unityMod();
  if (!mod) {
    log('cheat', 'MythicLoot: UnityFramework not loaded');
    return;
  }

  if (mythicLootCheatActive()) {
    log('cheat', 'MythicLoot: force="' + mythicLootTargetLabel() + '" id=' + FORCE_MYTHIC_LOOT_ID + ' clearExcluded=' + MYTHIC_LOOT_CLEAR_EXCLUDED);
    resolveForceMythicItemId();
  }

  var findItems = rvaPtr(RVA.FindItemsForItemRarity);
  if (findItems) {
    Interceptor.attach(findItems, {
      onEnter: function (args) {
        maybeClearMythicExcludedItems(args, 'FindItemsForItemRarity');
      },
    });
    log('cheat', 'hook FindItemsForItemRarity @ ' + findItems);
  }

  var findAdd = rvaPtr(RVA.FindAndAddItemToLoot);
  if (findAdd) {
    Interceptor.attach(findAdd, {
      onEnter: function (args) {
        maybeClearMythicExcludedItems(args, 'FindAndAddItemToLoot');
      },
    });
    log('cheat', 'hook FindAndAddItemToLoot @ ' + findAdd);
  }
}

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
