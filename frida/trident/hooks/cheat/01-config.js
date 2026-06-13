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

