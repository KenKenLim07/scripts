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

