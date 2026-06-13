/**
 * Vampire's Fall 2 (com.earlymorningstudio.trident)
 * Unity IL2CPP — network, loot, XP, local storage
 *
 * Hooks install AFTER attach (setTimeout) to avoid libSystem.B.dylib attach failures.
 */

'use strict';

var TRIDENT_VERBOSE_NET = false;  // true = log all HTTP (no ad/telemetry filter)
var TRIDENT_NET_FILTER_ADS = true; // false = only applies when TRIDENT_VERBOSE_NET is false
var TRIDENT_MAX_BODY = 16384;
var TRIDENT_LOG_FILES = false;
var TRIDENT_LOG_SQL = false;
var TRIDENT_BAN_PROBE = true; // cloud save / init / fingerprint status ([trident:probe])
var TRIDENT_PLAYTIME_PROBE = true; // playTime field + profile/settings display ([trident:probe])
var TRIDENT_SAVE_PROBE = true; // SaveData / local write / cloud upload DTO snapshots ([trident:save])
var TRIDENT_PLAYTIME_WRITE = true; // true = allow tridentSetPlaytime() memory patch (research/dummy only)
var TRIDENT_PLAYTIME_AUTO_PATCH = false; // false = no reset every attach; patch once via tridentSetPlaytime() then save in-game
var TRIDENT_PLAYTIME_PATCH_HOURS = 300; // target hours when auto-patch or manual tridentSetPlaytime(hours)
var TRIDENT_PLAYTIME_PATCH_SAVE = false; // auto-patch only: Frida SaveData crashes — use in-game save
var TRIDENT_PLAYTIME_PATCH_UPLOAD = false; // auto-patch only: let game upload on normal save

var LOOT_RE = /mythic|legendary|common|epic|rare|chest|loot|rarity|premium|shard|unique|gold|coin|currency/i;
var XP_RE = /xp|experience|exp\b|level|playerlevel|player_level|skill/i;
var BAN_RE = /ban|banned|sanction|suspended|moderation|chat_enabled|pvp_enabled|no.*match|failed to send|invalid|cheat|suspicious/i;

var banStatus = {
  uid: null,
  deviceId: null,
  remoteChatEnabled: null,
  remotePvpEnabled: null,
  lastCloudFn: null,
  chat: { state: 'unknown', error: null, at: 0 },
  pvp: { state: 'unknown', error: null, at: 0 },
  cloudSave: { state: 'unknown', error: null, at: 0 },
  clientInit: { state: 'unknown', error: null, at: 0 },
  playtime: { seconds: 0, hours: 0, level: 0, xp: 0, profileLabel: null },
  suspicion: [],
};

var BACKEND_RVA = {
  CallCloudFunction: 0x44301C0,
  SendChatMessage: 0x4430654,
  RequestPVPMatch: 0x4433620,
  ClientInitChatAndPVP: 0x4432E64,
  ChatSendFailure: 0x42AB268,      // ChatView.<>c__DisplayClass124_0.<SendChatMessage>b__1
  PvpFindMatchFailure: 0x45876E4,  // PvpPanel.<>c.<FindMatch>b__113_1
  PvpRequestFailure: 0x45877E0,    // PvpPanel.<>c__DisplayClass109_0.<RequestPVPMatchAsync>b__1
  IsChatEnabled: 0x443F940,
  IsPvpEnabled: 0x443F8D0,
  ServicesInstance: 0x42163B8,
  ServicesSaveManager: 0x4212270,   // Services.get_SaveManager
  SaveManagerInstance: 0x431D4F8,   // SaveManager.get_Instance (static)
  OnUploadCloudSuccess: 0x43232BC,
  OnUploadCloudFailure: 0x43232C4,
  UploadSaveDataToCloud: 0x4323168, // was wrongly 0x43232C4+4 (Failure callback tail)
  SaveData: 0x431BCE4,              // SaveManager.SaveData(force, uploadToCloud)
  TryToSaveLocalSaveData: 0x43202EC, // static SaveDataDTO + slot → encrypted local file
  AutoSave: 0x4322A78,              // SaveManager.AutoSave()
  SaveCharacterBackup: 0x44327C4,   // FirebaseWrapper.SaveCharacterBackup(SaveDataDTO)
  SaveBackupOk: 0x4432A20,          // SaveCharacterBackup success callback
  ClientInitOk: 0x4432F8C,
  GetUserIdOrDeviceId: 0x442F620,
  UniqueDeviceID: 0x431D458,
  GetPlaytime: 0x4230094,           // YarnBridge.get_playtime → SaveDataDTO.playTime
  UpdatePlaytime: 0x4250EFC,        // SettingsView profile hours label
};

var SAVE_DTO = {
  saveCount: 0x14,
  saveTime: 0x18,
  playTime: 0x30,
  guid: 0x38,
  name: 0x50,
  appsFlyerID: 0x48,
  inventory: 0x168,
  characterCreatedAt: 0x1C0,
  lastUpdatedAtServer: 0x1C8,
  playerHealth: 0x1D0,
  playerFocus: 0x1D4,
  playerPrimaryCurrency: 0x1D8,
  playerPremiumCurrency: 0x1DC,
  playerTotalShardsSpent: 0x1E0,
  playerBloodStones: 0x1E4,
  playerEssence: 0x1EC,
  playerTotalXP: 0x208,
  playerLevel: 0x20C,
  playerDeaths: 0x210,
  wonPveFights: 0x298,
  pvpWins: 0x348,
};

var IL2CPP_LIST_SIZE = 0x18;

var OFF_SAVE_MGR = { saveDataDto: 0x20 };

function log(tag, msg) {
  console.log('[trident:' + tag + '] ' + msg);
}

function logBlock(title, lines) {
  log('info', '======== ' + title + ' ========');
  lines.forEach(function (line) {
    log('info', '  ' + line);
  });
}

function nsDataToString(dataPtr, maxLen) {
  maxLen = maxLen || TRIDENT_MAX_BODY;
  if (!dataPtr || dataPtr.isNull()) return null;
  try {
    var d = new ObjC.Object(dataPtr);
    var len = d.length();
    if (typeof len === 'object' && len.valueOf) len = len.valueOf();
    if (len <= 0) return '';
    if (len > maxLen) return '(data ' + len + ' bytes, truncated)';
    var str = ObjC.classes.NSString.alloc().initWithData_encoding_(d, 4);
    if (str && !str.isNull()) return str.toString();
    var bytes = d.bytes();
    if (bytes && !bytes.isNull()) return Memory.readUtf8String(bytes, Math.min(len, maxLen));
  } catch (e) {}
  return null;
}

function safeExport(moduleNames, symbol) {
  var names = Array.isArray(moduleNames) ? moduleNames : [moduleNames];
  var i, mod, p;
  for (i = 0; i < names.length; i++) {
    try {
      mod = Process.findModuleByName(names[i]);
      if (mod) {
        p = mod.getExportByName(symbol);
        if (p) return p;
      }
    } catch (e) {}
  }
  return null;
}

// Ad / attribution / batch telemetry — not useful for ban or save research
var NET_NOISE_RE = new RegExp(
  'appsflyersdk\\.com|' +
  'app-ads-services\\.com|' +
  'skadsdkless|' +
  'pangle|byteoversea|snssdk|tiktokv\\.com|' +
  'firebaselogging-pa\\.googleapis\\.com|' +
  'crashlyticsreports-pa\\.googleapis\\.com|' +
  'securetoken\\.googleapis\\.com|' +
  'app-measurement\\.com|google-analytics\\.com|' +
  'applovin|unityads|ironsource|adcolony|chartboost|tapjoy|' +
  'mintegral|vungle|inmobi|fyber|adsmoloco|moloco|' +
  'doubleclick\\.net|googlesyndication\\.com|' +
  'graph\\.facebook\\.com|facebook\\.com/tr',
  'i'
);

// Game / account paths worth logging when not in verbose mode
var NET_GAME_RE = new RegExp(
  'gameanalytics\\.com|' +
  'cloudfunctions\\.net|' +
  'firebaseio\\.com|firestore\\.googleapis\\.com|' +
  'identitytoolkit\\.googleapis\\.com|' +
  'earlymorning|trident|vampire|vampiresfall',
  'i'
);

function isNoisyNetUrl(url) {
  return NET_NOISE_RE.test(url || '');
}

function isGameNetUrl(url) {
  return NET_GAME_RE.test(url || '');
}

function shouldLogUrl(url) {
  if (!url || url === 'about:blank') return false;
  if (TRIDENT_VERBOSE_NET) return /^https?:\/\//i.test(url);
  if (TRIDENT_NET_FILTER_ADS && isNoisyNetUrl(url)) return false;
  return isGameNetUrl(url);
}

function isGameAnalyticsUrl(url) {
  return /gameanalytics\.com/i.test(url || '');
}

function dumpHeaders(req) {
  var lines = [];
  try {
    var fields = req.allHTTPHeaderFields();
    if (!fields || fields.isNull()) return lines;
    var dict = new ObjC.Object(fields);
    var keys = dict.allKeys();
    var n = keys.count().valueOf();
    for (var i = 0; i < n; i++) {
      var k = keys.objectAtIndex_(i).toString();
      var v = dict.objectForKey_(keys.objectAtIndex_(i)).toString();
      lines.push(k + ': ' + v);
    }
  } catch (e) {}
  return lines;
}

function hookNSURLSession() {
  if (!ObjC.available) return;
  var Task = ObjC.classes.NSURLSessionTask;
  if (!Task || !Task['- resume']) return;

  Interceptor.attach(Task['- resume'].implementation, {
    onEnter: function (args) {
      try {
        var task = new ObjC.Object(args[0]);
        var req = task.currentRequest() || task.originalRequest();
        if (!req || req.isNull()) return;
        req = new ObjC.Object(req);
        var url = req.URL().absoluteString().toString();
        if (!shouldLogUrl(url)) return;

        var method = req.HTTPMethod() ? req.HTTPMethod().toString() : 'GET';
        var lines = ['method: ' + method, 'url: ' + url];
        var hdrs = dumpHeaders(req);
        if (hdrs.length) {
          lines.push('headers:');
          hdrs.forEach(function (h) {
            lines.push('  ' + h);
          });
        }
        var body = req.HTTPBody();
        if (body && !body.isNull()) {
          var bs = nsDataToString(body);
          if (bs) {
            lines.push('body: ' + bs);
            if (isGameAnalyticsUrl(url) && /progression|PlayerLevel|xp|level/i.test(bs)) {
              log('xp', '[GA request] ' + bs.substring(0, TRIDENT_MAX_BODY));
            }
          }
        }
        logBlock('HTTP REQUEST', lines);
      } catch (e) {}
    },
  });
  log('net', 'Hooked NSURLSessionTask.resume' +
    (TRIDENT_NET_FILTER_ADS && !TRIDENT_VERBOSE_NET ? ' (ads/telemetry filtered)' : ''));
}

function summarizeGameAnalytics(raw) {
  try {
    var o = JSON.parse(raw);
    if (!o || !o.event_id) return;
    var eid = o.event_id;
    var amt = o.amount != null ? (' amount=' + o.amount) : '';
    var sc = o.score != null ? (' score=' + o.score) : '';

    if (/Chest|Shard|Gold|Resource|Loot/i.test(eid) || o.category === 'resource') {
      log('loot', 'GA: ' + eid + amt);
      return;
    }
    if (/PvE|Battle|PlayerLevel|progression/i.test(eid) || o.category === 'progression') {
      log('xp', 'GA: ' + eid + sc);
      if (/Start:PvE/i.test(eid) && typeof globalThis.tridentOnPvEStart === 'function') {
        try { globalThis.tridentOnPvEStart(eid); } catch (e) {}
      }
      if (/Complete:PvE/i.test(eid) && typeof globalThis.tridentOnPvEComplete === 'function') {
        try { globalThis.tridentOnPvEComplete(eid + sc); } catch (e) {}
      }
      return;
    }
  } catch (e) {}
}

function classifyJson(raw) {
  if (!raw) return null;
  if (BAN_RE.test(raw)) return 'ban';
  // Firebase JWT first — "exp" claim matches XP_RE falsely
  if (/securetoken\.google\.com|"firebase":|sign_in_provider|id_token/i.test(raw)) return 'auth';
  if (LOOT_RE.test(raw) || /event_id.*[Cc]hest/i.test(raw)) return 'loot';
  if (/PlayerLevel|progression|Gain.*XP|Add.*XP|Complete:PvE|experience/i.test(raw)) return 'xp';
  if (/firebase|gameanalytics/i.test(raw)) return 'auth';
  return TRIDENT_VERBOSE_NET ? 'json' : null;
}

function unityMod() {
  return Process.findModuleByName('UnityFramework');
}

function rvaPtr(offset) {
  var mod = unityMod();
  if (!mod) return null;
  return mod.base.add(offset);
}

function readIl2CppString(strPtr) {
  if (!strPtr || strPtr.isNull()) return null;
  try {
    var len = strPtr.add(0x10).readS32();
    if (len <= 0 || len > 4096) return null;
    return strPtr.add(0x14).readUtf16String(len);
  } catch (e) {}
  return null;
}

function hookBackendFailure(label, offset, slotKey) {
  var p = rvaPtr(offset);
  if (!p) return false;
  Interceptor.attach(p, {
    onEnter: function (args) {
      try {
        var err = readIl2CppString(args[2]);
        var ft = readFailureTypeArg(args[1]);
        if (err) log('ban', label + ' failureType=' + ft + ' error="' + err + '"');
        else log('ban', label + ' failureType=' + ft);
        if (slotKey && banStatus[slotKey]) {
          recordBanSlot(banStatus[slotKey], false, err, ft);
          printBanStatusPanel(label);
        }
      } catch (e) {}
    },
  });
  return true;
}

function readFailureTypeArg(arg) {
  if (!arg || arg.isNull()) return -1;
  try {
    var raw = arg.toInt32();
    if (raw === 0 || raw === 1) return raw;
  } catch (e) {}
  try {
    var boxed = arg.add(0x10).readS32();
    if (boxed === 0 || boxed === 1) return boxed;
  } catch (e2) {}
  return -1;
}

function failureTypeLabel(ft) {
  if (ft === 0) return 'Hard';
  if (ft === 1) return 'Soft';
  return String(ft);
}

function formatPlaytimeSeconds(sec) {
  if (!isFinite(sec)) return '?';
  var h = Math.floor(sec / 3600);
  var m = Math.floor((sec % 3600) / 60);
  return h + 'h' + m + 'm (' + sec.toFixed(0) + 's)';
}

function playtimeHours(sec) {
  if (!isFinite(sec) || sec < 0) return 0;
  return sec / 3600;
}

function statusLine(label, slot) {
  var s = slot.state || 'unknown';
  var extra = slot.error ? (' — "' + slot.error + '"') : '';
  return label + ': ' + s + extra;
}

function classifyBanError(err) {
  if (!err) return null;
  var low = err.toLowerCase();
  if (/banned|sanction|suspended|moderation/.test(low)) return 'banned';
  if (/invalid|cheat|suspicious|not allowed|forbidden/.test(low)) return 'flagged';
  if (/cloud function call failed|network|timeout|unavailable/.test(low)) return 'network';
  return 'error';
}

function recordBanSlot(slot, ok, err, ft) {
  slot.at = Date.now();
  if (ok) {
    slot.state = 'ok';
    slot.error = null;
    return;
  }
  slot.error = err || ('failureType=' + ft);
  var kind = classifyBanError(err);
  if (kind === 'banned') slot.state = 'BANNED';
  else if (kind === 'flagged') slot.state = 'FLAGGED';
  else if (kind === 'network') slot.state = 'network-fail';
  else slot.state = failureTypeLabel(ft) + '-fail';
}

function analyzeSuspicion(fp) {
  var flags = [];
  if (!fp || fp.playSec <= 0) return flags;
  var hours = fp.playSec / 3600;
  if (fp.level >= 50 && hours < 24) flags.push('max-level-under-24h');
  if (fp.level >= 40 && hours < 10) flags.push('high-level-under-10h');
  if (fp.xpPerHour > 50000) flags.push('xp-per-hour-' + Math.round(fp.xpPerHour));
  if (fp.fights > 0 && fp.playSec > 0) {
    var fightsPerHour = fp.fights / hours;
    if (fightsPerHour > 120) flags.push('fights-per-hour-' + Math.round(fightsPerHour));
  }
  if (fp.shardsSpent > 5000 && hours < 20) flags.push('heavy-shard-spend-low-time');
  return flags;
}

function readIl2CppListSize(listPtr) {
  if (!listPtr || listPtr.isNull()) return 0;
  try {
    return listPtr.add(IL2CPP_LIST_SIZE).readS32();
  } catch (e) {}
  return 0;
}

function readSaveDtoFingerprint(dto) {
  if (!dto || dto.isNull()) return null;
  try {
    var playSec = dto.add(SAVE_DTO.playTime).readDouble();
    var level = dto.add(SAVE_DTO.playerLevel).readS32();
    var xp = dto.add(SAVE_DTO.playerTotalXP).readS32();
    var fights = dto.add(SAVE_DTO.wonPveFights).readS32();
    var saves = dto.add(SAVE_DTO.saveCount).readS32();
    var shardsSpent = dto.add(SAVE_DTO.playerTotalShardsSpent).readS32();
    var created = dto.add(SAVE_DTO.characterCreatedAt).readS64();
    var updated = dto.add(SAVE_DTO.lastUpdatedAtServer).readS64();
    var af = readSaveDtoString(dto, SAVE_DTO.appsFlyerID) || '?';
    var xpPerHour = playSec > 0 ? xp / (playSec / 3600) : 0;
    return {
      playSec: playSec,
      level: level,
      xp: xp,
      fights: fights,
      saves: saves,
      shardsSpent: shardsSpent,
      created: created,
      updated: updated,
      appsFlyer: af,
      xpPerHour: xpPerHour,
    };
  } catch (e) {}
  return null;
}

function readSaveDtoSnapshot(dto) {
  var fp = readSaveDtoFingerprint(dto);
  if (!fp) return null;
  try {
    fp.saveTime = dto.add(SAVE_DTO.saveTime).readS64();
    fp.guid = readSaveDtoString(dto, SAVE_DTO.guid) || '?';
    fp.name = readSaveDtoString(dto, SAVE_DTO.name) || '?';
    fp.gold = dto.add(SAVE_DTO.playerPrimaryCurrency).readS32();
    fp.shards = dto.add(SAVE_DTO.playerPremiumCurrency).readS32();
    fp.bloodstones = dto.add(SAVE_DTO.playerBloodStones).readS32();
    fp.essence = dto.add(SAVE_DTO.playerEssence).readS32();
    fp.health = dto.add(SAVE_DTO.playerHealth).readS32();
    fp.focus = dto.add(SAVE_DTO.playerFocus).readS32();
    fp.deaths = dto.add(SAVE_DTO.playerDeaths).readS32();
    fp.pvpWins = dto.add(SAVE_DTO.pvpWins).readS32();
    fp.inventoryCount = readIl2CppListSize(dto.add(SAVE_DTO.inventory).readPointer());
    fp.dtoPtr = dto.toString();
  } catch (e) {}
  return fp;
}

function logSaveDtoSnapshot(dto, label, meta) {
  var snap = readSaveDtoSnapshot(dto);
  if (!snap) {
    log('save', label + ' — no SaveDataDTO');
    return;
  }
  var head = label + ' L' + snap.level + ' xp=' + snap.xp + ' play=' + formatPlaytimeSeconds(snap.playSec) +
      ' wins=' + snap.fights + ' saves=' + snap.saves;
  if (meta) head += ' [' + meta + ']';
  log('save', head);
  log('save', '  guid=' + snap.guid + ' name="' + snap.name + '" dto=' + snap.dtoPtr);
  log('save', '  gold=' + snap.gold + ' shards=' + snap.shards + ' bloodstones=' + snap.bloodstones +
      ' essence=' + snap.essence + ' inv=' + snap.inventoryCount);
  log('save', '  health=' + snap.health + ' focus=' + snap.focus + ' deaths=' + snap.deaths +
      ' pvpWins=' + snap.pvpWins + ' shardsSpent=' + snap.shardsSpent);
  log('save', '  saveTime=' + snap.saveTime + ' createdAt=' + snap.created +
      ' updatedAt=' + snap.updated + ' appsFlyer=' + snap.appsFlyer);
  if (snap.playSec > 0 && snap.level > 0) {
    log('save', '  xp/hour=' + snap.xpPerHour.toFixed(0) + (snap.xpPerHour > 50000 ? ' (HIGH)' : '') +
        ' level/hour=' + (snap.level / playtimeHours(snap.playSec)).toFixed(2));
  }
  return snap;
}

function printBanStatusPanel(reason) {
  if (!TRIDENT_BAN_PROBE) return;
  var lines = [];
  if (reason) lines.push('trigger: ' + reason);
  if (banStatus.uid) lines.push('uid/device: ' + banStatus.uid);
  if (banStatus.deviceId) lines.push('deviceId: ' + banStatus.deviceId);
  lines.push('remote chat enabled (global): ' + banStatus.remoteChatEnabled);
  lines.push('remote pvp enabled (global): ' + banStatus.remotePvpEnabled);
  if (banStatus.lastCloudFn) lines.push('last cloud fn: ' + banStatus.lastCloudFn);
  lines.push(statusLine('chat', banStatus.chat));
  lines.push(statusLine('pvp', banStatus.pvp));
  lines.push(statusLine('cloud save', banStatus.cloudSave));
  lines.push(statusLine('clientInit chat/pvp', banStatus.clientInit));
  var pt = banStatus.playtime;
  if (pt.seconds > 0 || pt.level > 0) {
    lines.push('playtime save: ' + formatPlaytimeSeconds(pt.seconds) +
      ' | L' + pt.level + ' xp=' + pt.xp +
      (pt.profileLabel ? (' | profile="' + pt.profileLabel + '"') : ''));
  }
  if (banStatus.suspicion.length) {
    lines.push('suspicion flags: ' + banStatus.suspicion.join(', '));
  } else if (pt.level > 0) {
    lines.push('suspicion flags: (none)');
  }
  logBlock('BAN / ACCOUNT STATUS', lines);
}

function readSaveDtoString(dto, offset) {
  if (!dto || dto.isNull()) return null;
  try {
    return readIl2CppString(dto.add(offset).readPointer());
  } catch (e) {}
  return null;
}

function logSaveDtoFingerprint(dto, label) {
  if (TRIDENT_SAVE_PROBE && /save|cloud|local|backup|autosave/i.test(label)) {
    var snap = logSaveDtoSnapshot(dto, label);
    if (!snap) return;
    banStatus.playtime.seconds = snap.playSec;
    banStatus.playtime.hours = playtimeHours(snap.playSec);
    banStatus.playtime.level = snap.level;
    banStatus.playtime.xp = snap.xp;
    banStatus.suspicion = analyzeSuspicion(snap);
    if (banStatus.suspicion.length) {
      log('probe', '  suspicion: ' + banStatus.suspicion.join(', '));
    }
    return;
  }
  var fp = readSaveDtoFingerprint(dto);
  if (!fp) {
    log('probe', label + ' — no SaveDataDTO');
    return;
  }
  log('probe', label + ' L' + fp.level + ' xp=' + fp.xp + ' play=' + formatPlaytimeSeconds(fp.playSec) +
      ' wins=' + fp.fights + ' saves=' + fp.saves + ' shardsSpent=' + fp.shardsSpent);
  log('probe', '  createdAt=' + fp.created + ' updatedAt=' + fp.updated + ' appsFlyer=' + fp.appsFlyer);
  if (fp.playSec > 0 && fp.level > 0) {
    log('probe', '  xp/hour=' + fp.xpPerHour.toFixed(0) + (fp.xpPerHour > 50000 ? ' (HIGH)' : ''));
    log('probe', '  level/hour=' + (fp.level / playtimeHours(fp.playSec)).toFixed(2));
  }
  banStatus.playtime.seconds = fp.playSec;
  banStatus.playtime.hours = playtimeHours(fp.playSec);
  banStatus.playtime.level = fp.level;
  banStatus.playtime.xp = fp.xp;
  banStatus.suspicion = analyzeSuspicion(fp);
  if (banStatus.suspicion.length) {
    log('probe', '  suspicion: ' + banStatus.suspicion.join(', '));
  }
}

function readSaveDtoFromManager(mgr) {
  if (!mgr || mgr.isNull()) return null;
  try {
    var dto = mgr.add(OFF_SAVE_MGR.saveDataDto).readPointer();
    return dto && !dto.isNull() ? dto : null;
  } catch (e) {}
  return null;
}

function hookSavePathProbe() {
  if (!TRIDENT_SAVE_PROBE) return;

  safeAttachProbe('SaveManager.SaveData', rvaPtr(BACKEND_RVA.SaveData), {
    onEnter: function (args) {
      try {
        var force = args[1].toInt32() !== 0;
        var upload = args[2].toInt32() !== 0;
        this._saveFlags = 'force=' + force + ' upload=' + upload;
        var dto = readSaveDtoFromManager(args[0]);
        logSaveDtoSnapshot(dto, 'save-entry', this._saveFlags);
      } catch (e) {
        log('save', 'SaveData onEnter error: ' + e);
      }
    },
    onLeave: function (retval) {
      try {
        var ok = retval.toInt32() !== 0;
        log('save', 'SaveData done ok=' + ok + ' ' + (this._saveFlags || ''));
      } catch (e) {}
    },
  });

  safeAttachProbe('TryToSaveLocalSaveData', rvaPtr(BACKEND_RVA.TryToSaveLocalSaveData), {
    onEnter: function (args) {
      try {
        var slot = args[1].toInt32();
        logSaveDtoSnapshot(args[0], 'local-write', 'slot=' + slot);
      } catch (e) {
        log('save', 'TryToSaveLocalSaveData onEnter error: ' + e);
      }
    },
    onLeave: function (retval) {
      try {
        log('save', 'TryToSaveLocalSaveData ok=' + (retval.toInt32() !== 0));
      } catch (e) {}
    },
  });

  safeAttachProbe('SaveManager.AutoSave', rvaPtr(BACKEND_RVA.AutoSave), {
    onEnter: function (args) {
      try {
        logSaveDtoSnapshot(readSaveDtoFromManager(args[0]), 'autosave-entry', 'AutoSave()');
      } catch (e) {}
    },
  });

  safeAttachProbe('SaveCharacterBackup (cloud payload)', rvaPtr(BACKEND_RVA.SaveCharacterBackup), {
    onEnter: function (args) {
      try {
        logSaveDtoSnapshot(args[1], 'cloud-backup', 'SaveCharacterBackup');
      } catch (e) {
        log('save', 'SaveCharacterBackup onEnter error: ' + e);
      }
    },
  });

  globalThis.tridentLogSaveDto = function (label) {
    logSaveDtoSnapshot(getCurrentSaveDtoPtr(), label || 'manual');
  };
}

var probeServicesNative = null;
var probeSaveMgrNative = null;
var probeSaveMgrStaticNative = null;
var probeUserIdNative = null;
var probeDeviceIdNative = null;

function getServicesPtrProbe() {
  try {
    if (!probeServicesNative) {
      var svc = rvaPtr(BACKEND_RVA.ServicesInstance);
      if (!svc) return null;
      probeServicesNative = new NativeFunction(svc, 'pointer', []);
    }
    var p = probeServicesNative();
    return p && !p.isNull() ? p : null;
  } catch (e) {}
  return null;
}

function getSaveManagerPtrProbe() {
  try {
    if (!probeSaveMgrStaticNative) {
      var inst = rvaPtr(BACKEND_RVA.SaveManagerInstance);
      if (inst) probeSaveMgrStaticNative = new NativeFunction(inst, 'pointer', []);
    }
    if (probeSaveMgrStaticNative) {
      var direct = probeSaveMgrStaticNative();
      if (direct && !direct.isNull()) return direct;
    }
  } catch (e) {}

  var services = getServicesPtrProbe();
  if (!services) return null;
  try {
    if (!probeSaveMgrNative) {
      var fn = rvaPtr(BACKEND_RVA.ServicesSaveManager);
      if (!fn) return null;
      probeSaveMgrNative = new NativeFunction(fn, 'pointer', ['pointer']);
    }
    var mgr = probeSaveMgrNative(services);
    return mgr && !mgr.isNull() ? mgr : null;
  } catch (e) {}
  return null;
}

function getCurrentSaveDtoPtr() {
  var mgr = getSaveManagerPtrProbe();
  if (!mgr) return null;
  try {
    var dto = mgr.add(OFF_SAVE_MGR.saveDataDto).readPointer();
    return dto && !dto.isNull() ? dto : null;
  } catch (e) {}
  return null;
}

function safeAttachProbe(label, ptr, hooks) {
  if (!ptr) {
    log('probe', 'skip ' + label + ' — no RVA');
    return false;
  }
  try {
    Interceptor.attach(ptr, hooks);
    log('probe', 'hook ' + label + ' @ ' + ptr);
    return true;
  } catch (e) {
    log('probe', 'hook FAILED ' + label + ' @ ' + ptr + ': ' + e);
    return false;
  }
}

function writePlaytimeSeconds(sec) {
  if (!isFinite(sec) || sec < 0) {
    log('probe', 'setPlaytime — invalid seconds: ' + sec);
    return false;
  }
  var dto = getCurrentSaveDtoPtr();
  if (!dto) {
    log('probe', 'setPlaytime — no SaveDataDTO (in game with a loaded save?)');
    return false;
  }
  try {
    dto.add(SAVE_DTO.playTime).writeDouble(sec);
    banStatus.playtime.seconds = sec;
    banStatus.playtime.hours = playtimeHours(sec);
    log('probe', 'playTime patched -> ' + formatPlaytimeSeconds(sec));
    logSaveDtoFingerprint(dto, 'after playtime patch');
    return true;
  } catch (e) {
    log('probe', 'setPlaytime failed: ' + e);
    return false;
  }
}

function persistSaveAfterPlaytimePatch(uploadToCloud) {
  var mgr = getSaveManagerPtrProbe();
  if (!mgr) {
    log('probe', 'SaveData — no SaveManager');
    return false;
  }
  var dto = getCurrentSaveDtoPtr();
  if (!dto) {
    log('probe', 'SaveData — no SaveDataDTO');
    return false;
  }
  var ok = false;
  var saveFn = rvaPtr(BACKEND_RVA.SaveData);
  if (saveFn) {
    try {
      // IL2CPP on iOS: bool params as int; omit MethodInfo (NULL deref on this build).
      var save = new NativeFunction(saveFn, 'int', ['pointer', 'int', 'int']);
      ok = save(mgr, 1, 0) !== 0;
      log('probe', 'SaveData(force=true, upload=false) -> ' + ok);
    } catch (e) {
      log('probe', 'SaveData call failed: ' + e);
    }
  }
  if (uploadToCloud) {
    var uploadFn = rvaPtr(BACKEND_RVA.UploadSaveDataToCloud);
    if (uploadFn) {
      try {
        var upload = new NativeFunction(uploadFn, 'void', ['pointer', 'pointer']);
        upload(mgr, dto);
        log('probe', 'UploadSaveDataToCloud(dto) invoked — watch cloud-upload / cloud save hooks');
        ok = true;
      } catch (e) {
        log('probe', 'UploadSaveDataToCloud failed: ' + e);
      }
    }
  }
  return ok;
}

function exposePlaytimeApi() {
  globalThis.tridentSetPlaytimeSeconds = function (sec, opts) {
    if (!TRIDENT_PLAYTIME_WRITE) {
      log('probe', 'tridentSetPlaytimeSeconds blocked — set TRIDENT_PLAYTIME_WRITE=true');
      return false;
    }
    opts = opts || {};
    if (!writePlaytimeSeconds(sec)) return false;
    if (opts.save) return persistSaveAfterPlaytimePatch(!!opts.upload);
    return true;
  };
  globalThis.tridentSetPlaytime = function (hours, opts) {
    return globalThis.tridentSetPlaytimeSeconds(hours * 3600, opts);
  };
  rpc.exports = {
    setPlaytime: function (hours, save, upload) {
      return globalThis.tridentSetPlaytime(hours, { save: !!save, upload: !!upload });
    },
    fingerprint: function () {
      logAccountFingerprint('rpc');
      return banStatus;
    },
  };
}

function schedulePlaytimeAutoPatch() {
  if (!TRIDENT_PLAYTIME_WRITE || !TRIDENT_PLAYTIME_AUTO_PATCH || !(TRIDENT_PLAYTIME_PATCH_HOURS > 0)) return;
  setTimeout(function () {
    var dto = getCurrentSaveDtoPtr();
    if (!dto) {
      log('probe', 'auto-patch playtime skipped — no SaveDataDTO');
      return;
    }
    var current = 0;
    try {
      current = dto.add(SAVE_DTO.playTime).readDouble();
    } catch (e) {}
    var target = TRIDENT_PLAYTIME_PATCH_HOURS * 3600;
    if (current >= target - 60) {
      log('probe', 'auto-patch playtime skipped — already ' + formatPlaytimeSeconds(current) +
          ' (clock will tick naturally)');
      return;
    }
    log('probe', 'auto-patch playtime ' + formatPlaytimeSeconds(current) + ' -> ' + TRIDENT_PLAYTIME_PATCH_HOURS + 'h');
    globalThis.tridentSetPlaytime(TRIDENT_PLAYTIME_PATCH_HOURS, {
      save: TRIDENT_PLAYTIME_PATCH_SAVE,
      upload: TRIDENT_PLAYTIME_PATCH_UPLOAD,
    });
  }, 7000);
}

function logAccountFingerprint(reason) {
  if (!TRIDENT_BAN_PROBE) return;
  log('probe', '=== fingerprint' + (reason ? ' (' + reason + ')' : '') + ' ===');
  try {
    if (!probeUserIdNative) {
      var uidFn = rvaPtr(BACKEND_RVA.GetUserIdOrDeviceId);
      if (uidFn) probeUserIdNative = new NativeFunction(uidFn, 'pointer', []);
    }
    if (!probeDeviceIdNative) {
      var devFn = rvaPtr(BACKEND_RVA.UniqueDeviceID);
      if (devFn) probeDeviceIdNative = new NativeFunction(devFn, 'pointer', []);
    }
    if (probeUserIdNative) {
      var uid = readIl2CppString(probeUserIdNative());
      if (uid) {
        banStatus.uid = uid;
        log('probe', 'uid/device=' + uid);
      }
    }
    if (probeDeviceIdNative) {
      var dev = readIl2CppString(probeDeviceIdNative());
      if (dev) {
        banStatus.deviceId = dev;
        log('probe', 'deviceId=' + dev);
      }
    }
  } catch (e) {}
  logSaveDtoFingerprint(getCurrentSaveDtoPtr(), 'save');
  printBanStatusPanel(reason || 'fingerprint');
}

function hookBanProbeCallbacks() {
  if (!TRIDENT_BAN_PROBE) return;

  safeAttachProbe('OnUploadSaveDataToCloudSuccess', rvaPtr(BACKEND_RVA.OnUploadCloudSuccess), {
    onEnter: function (args) {
      try {
        var msg = readIl2CppString(args[1]) || 'ok';
        log('probe', 'cloud save OK: ' + msg);
        recordBanSlot(banStatus.cloudSave, true);
      } catch (e) {
        log('probe', 'cloud save OK');
        recordBanSlot(banStatus.cloudSave, true);
      }
    },
  });

  safeAttachProbe('OnUploadSaveDataToCloudFailure', rvaPtr(BACKEND_RVA.OnUploadCloudFailure), {
    onEnter: function (args) {
      try {
        var err = readIl2CppString(args[2]) || '?';
        var ft = readFailureTypeArg(args[1]);
        log('probe', 'cloud save FAIL ' + failureTypeLabel(ft) + ': ' + err);
        recordBanSlot(banStatus.cloudSave, false, err, ft);
        printBanStatusPanel('cloud save');
      } catch (e) {}
    },
  });

  if (TRIDENT_PLAYTIME_PROBE) {
    safeAttachProbe('UploadSaveDataToCloud (playtime fingerprint)', rvaPtr(BACKEND_RVA.UploadSaveDataToCloud), {
      onEnter: function (args) {
        try {
          if (TRIDENT_SAVE_PROBE) {
            logSaveDtoSnapshot(args[1], 'cloud-upload', 'UploadSaveDataToCloud');
          } else {
            logSaveDtoFingerprint(args[1], 'cloud-upload');
          }
        } catch (e) {}
      },
    });
  }

  safeAttachProbe('SaveCharacterBackup success', rvaPtr(BACKEND_RVA.SaveBackupOk), {
    onEnter: function () {
      log('probe', 'saveCharacterBackupFunction OK');
      recordBanSlot(banStatus.cloudSave, true);
    },
  });

  safeAttachProbe('ClientInitChatAndPVP success', rvaPtr(BACKEND_RVA.ClientInitOk), {
    onEnter: function () {
      log('probe', 'clientInitChatAndPVP OK');
      recordBanSlot(banStatus.clientInit, true);
      logAccountFingerprint('after init');
    },
  });

  globalThis.tridentLogFingerprint = logAccountFingerprint;
  globalThis.tridentBanStatusPanel = printBanStatusPanel;
  exposePlaytimeApi();
}

function hookPlaytimeProbe() {
  if (!TRIDENT_PLAYTIME_PROBE) return;

  safeAttachProbe('YarnBridge.GetPlaytime', rvaPtr(BACKEND_RVA.GetPlaytime), {
    onLeave: function () {
      try {
        var sec = this.context.s0;
        if (!isFinite(sec)) return;
        log('probe', 'GetPlaytime() -> ' + formatPlaytimeSeconds(sec));
        banStatus.playtime.seconds = sec;
        banStatus.playtime.hours = playtimeHours(sec);
      } catch (e) {}
    },
  });

  safeAttachProbe('SettingsView.UpdatePlaytime', rvaPtr(BACKEND_RVA.UpdatePlaytime), {
    onLeave: function () {
      try {
        log('probe', 'SettingsView.UpdatePlaytime (profile hours refreshed)');
        logSaveDtoFingerprint(getCurrentSaveDtoPtr(), 'settings-playtime');
        printBanStatusPanel('profile playtime');
      } catch (e) {}
    },
  });
}

function hookBackendBanDiagnostics() {
  var mod = unityMod();
  if (!mod) {
    log('ban', 'UnityFramework not loaded — backend hooks skipped');
    return;
  }

  var cf = rvaPtr(BACKEND_RVA.CallCloudFunction);
  if (cf) {
    Interceptor.attach(cf, {
      onEnter: function (args) {
        try {
          var fn = readIl2CppString(args[1]);
          if (fn) {
            banStatus.lastCloudFn = fn;
            log('ban', 'CallCloudFunction("' + fn + '")');
            this._cf = fn;
          }
        } catch (e) {}
      },
    });
    log('ban', 'hook CallCloudFunction @ ' + cf);
  }

  [
    ['chat SendChatMessage', BACKEND_RVA.ChatSendFailure, 'chat'],
    ['pvp FindMatch', BACKEND_RVA.PvpFindMatchFailure, 'pvp'],
    ['pvp RequestPVPMatch', BACKEND_RVA.PvpRequestFailure, 'pvp'],
  ].forEach(function (pair) {
    if (hookBackendFailure(pair[0], pair[1], pair[2])) {
      log('ban', 'hook ' + pair[0] + ' failure callback');
    }
  });

  var chatOn = rvaPtr(BACKEND_RVA.IsChatEnabled);
  if (chatOn) {
    Interceptor.attach(chatOn, {
      onLeave: function (retval) {
        var on = retval.toInt32() !== 0;
        banStatus.remoteChatEnabled = on;
        log('ban', 'RemoteConfig IsChatEnabled=' + on);
      },
    });
  }
  var pvpOn = rvaPtr(BACKEND_RVA.IsPvpEnabled);
  if (pvpOn) {
    Interceptor.attach(pvpOn, {
      onLeave: function (retval) {
        var on = retval.toInt32() !== 0;
        banStatus.remotePvpEnabled = on;
        log('ban', 'RemoteConfig IsPvpEnabled=' + on);
      },
    });
  }
}

function hookJSON() {
  if (!ObjC.available) return;
  var Cls = ObjC.classes.NSJSONSerialization;
  if (!Cls || !Cls['+ JSONObjectWithData:options:error:']) return;

  Interceptor.attach(Cls['+ JSONObjectWithData:options:error:'].implementation, {
    onEnter: function (args) {
      this._raw = nsDataToString(args[2], 8192);
    },
    onLeave: function (retval) {
      try {
        if (!retval || retval.isNull() || !this._raw) return;
        if (this._raw.length < 8 || this._raw.length > TRIDENT_MAX_BODY) return;
        var kind = classifyJson(this._raw);
        if (kind) {
          if (/\"event_id\":/.test(this._raw) && /Chest|Shard|PvE|PlayerLevel|progression|resource/i.test(this._raw)) {
            summarizeGameAnalytics(this._raw);
          } else if (kind === 'ban') {
            log('ban', '[JSON] ' + this._raw.substring(0, TRIDENT_MAX_BODY));
          } else if (kind === 'auth' && !TRIDENT_VERBOSE_NET) {
            log('auth', '(firebase token refreshed — not a ban; set TRIDENT_VERBOSE_NET=true for full JWT)');
          } else {
            log(kind, this._raw.substring(0, TRIDENT_MAX_BODY));
          }
        }
      } catch (e) {}
    },
  });
  log('json', 'Hooked NSJSONSerialization (loot + xp filters)');
}

function hookSQLite() {
  if (!TRIDENT_LOG_SQL) return;
  var openPtr = safeExport(['libsqlite3.dylib', 'libsqlite3.0.dylib'], 'sqlite3_open');
  var preparePtr = safeExport(['libsqlite3.dylib', 'libsqlite3.0.dylib'], 'sqlite3_prepare_v2');

  if (openPtr) {
    Interceptor.attach(openPtr, {
      onEnter: function (args) {
        try {
          this.path = Memory.readUtf8String(args[0]);
        } catch (e) {}
      },
      onLeave: function (retval) {
        if (this.path && retval.toInt32() === 0) log('sqlite', 'open ' + this.path);
      },
    });
  }
  if (preparePtr) {
    Interceptor.attach(preparePtr, {
      onEnter: function (args) {
        try {
          var sql = Memory.readUtf8String(args[1]);
          if (sql && sql.length < 500 && /INSERT|UPDATE|DELETE|SELECT/i.test(sql)) {
            if (/xp|level|experience|player|chest|loot/i.test(sql)) {
              log('sqlite', sql.replace(/\s+/g, ' ').trim());
            }
          }
        } catch (e) {}
      },
    });
  }
  if (openPtr || preparePtr) log('sqlite', 'SQLite hooks active');
}

function snapshotUserDefaults() {
  if (!ObjC.available) return;
  try {
    var ud = ObjC.classes.NSUserDefaults.standardUserDefaults();
    var dict = ud.dictionaryRepresentation();
    if (!dict || dict.isNull()) return;
    var keys = dict.allKeys();
    var n = keys.count().valueOf();
    var hits = [];
    for (var i = 0; i < n; i++) {
      var k = keys.objectAtIndex_(i).toString();
      if (/xp|level|experience|exp|player|progression|skill/i.test(k)) {
        var v = dict.objectForKey_(keys.objectAtIndex_(i)).toString();
        if (v.length > 200) v = v.substring(0, 200) + '…';
        hits.push(k + ' = ' + v);
      }
    }
    if (hits.length) {
      logBlock('XP / player defaults snapshot', hits);
    } else {
      log('xp', 'No xp/level keys in NSUserDefaults snapshot (may be in save file)');
    }
  } catch (e) {
    log('xp', 'defaults snapshot failed: ' + e);
  }
}

function hookNSLogFiltered() {
  var NSLogPtr = safeExport(['Foundation'], 'NSLog');
  if (!NSLogPtr) return;

  Interceptor.attach(NSLogPtr, {
    onEnter: function (args) {
      try {
        var fmt = Memory.readUtf8String(args[0]);
        if (!fmt || (!LOOT_RE.test(fmt) && !XP_RE.test(fmt))) return;
        var tag = XP_RE.test(fmt) ? 'xp' : 'loot';
        log(tag, 'NSLog: ' + fmt.substring(0, 500));
      } catch (e) {}
    },
  });
  log('unity', 'NSLog filter active (loot + xp)');
}

function hookUserDefaults() {
  if (!ObjC.available) return;
  var UD = ObjC.classes.NSUserDefaults;
  if (!UD || !UD['- setObject:forKey:']) return;

  Interceptor.attach(UD['- setObject:forKey:'].implementation, {
    onEnter: function (args) {
      try {
        var key = new ObjC.Object(args[3]).toString();
        if (/token|auth|user|save|sync|pvp|session|player|xp|level|experience|exp/i.test(key)) {
          var val = new ObjC.Object(args[2]).toString();
          if (val.length > 400) val = val.substring(0, 400) + '…';
          var tag = /xp|level|experience|exp/i.test(key) ? 'xp' : 'defaults';
          log(tag, key + ' = ' + val);
        }
      } catch (e) {}
    },
  });
  log('defaults', 'NSUserDefaults hooks active');
}

function detectEngine() {
  try {
    var mods = Process.enumerateModules();
    var hits = mods.filter(function (m) {
      return /Unity|il2cpp/i.test(m.name + m.path);
    });
    hits.slice(0, 5).forEach(function (m) {
      log('engine', m.name + ' @ ' + m.path);
    });
  } catch (e) {
    log('engine', 'enumerateModules failed: ' + e);
  }
}

function hookUnityStrings() {
  var mod = Process.findModuleByName('UnityFramework');
  if (!mod) {
    log('unity', 'UnityFramework not loaded yet');
    return;
  }

  var STR_RE = new RegExp(LOOT_RE.source + '|' + XP_RE.source + '|' + BAN_RE.source, 'i');

  ['il2cpp_string_new', 'il2cpp_string_new_utf16'].forEach(function (sym) {
    var p = null;
    try {
      p = mod.getExportByName(sym);
    } catch (e) {}
    if (!p) return;

    Interceptor.attach(p, {
      onEnter: function (args) {
        try {
          var s = Memory.readUtf8String(args[0]);
          if (!s || !STR_RE.test(s)) return;
          var tag = BAN_RE.test(s) ? 'ban' : (XP_RE.test(s) ? 'xp' : 'loot');
          log(tag, 'il2cpp str: ' + s);
        } catch (e) {}
      },
    });
    log('unity', 'Hooked ' + sym);
  });
}

function installHooks() {
  log('info', 'Installing hooks (deferred)...');
  detectEngine();

  if (ObjC.available) {
    hookNSURLSession();
    hookJSON();
    hookUserDefaults();
    hookNSLogFiltered();
    setTimeout(snapshotUserDefaults, 500);
  }

  hookUnityStrings();
  hookBackendBanDiagnostics();
  hookBanProbeCallbacks();
  hookSavePathProbe();
  hookPlaytimeProbe();

  if (TRIDENT_BAN_PROBE) {
    setTimeout(function () { logAccountFingerprint('startup'); }, 6000);
    schedulePlaytimeAutoPatch();
  }

  if (TRIDENT_LOG_SQL) hookSQLite();

  log('info', 'Ready — chest opens + XP gains will log as [trident:loot] / [trident:xp]');
  if (TRIDENT_BAN_PROBE) {
    log('info', 'Ban probe on — watch [trident:probe] + BAN / ACCOUNT STATUS blocks');
  }
  if (TRIDENT_PLAYTIME_PROBE) {
    log('info', 'Playtime probe on — open Settings to refresh profile hours');
  }
  if (TRIDENT_SAVE_PROBE) {
    log('info', 'Save probe on — [trident:save] logs save-entry / local-write / cloud-upload / cloud-backup');
  }
  if (TRIDENT_PLAYTIME_WRITE) {
    log('info', 'Playtime WRITE on — tridentSetPlaytime(hours) / tridentSetPlaytimeSeconds(sec, {save, upload})');
    if (TRIDENT_PLAYTIME_AUTO_PATCH && TRIDENT_PLAYTIME_PATCH_HOURS > 0) {
      log('info', 'Playtime auto-patch @ 7s if below ' + TRIDENT_PLAYTIME_PATCH_HOURS + 'h save=' +
          TRIDENT_PLAYTIME_PATCH_SAVE + ' upload=' + TRIDENT_PLAYTIME_PATCH_UPLOAD);
    }
  }

  recv('eval', function (msg) {
    try {
      var code = msg.payload;
      log('probe', 'eval: ' + code);
      eval(code);
    } catch (e) {
      log('probe', 'eval failed: ' + e);
    }
  });
  log('info', 'Cheat: use frida-trident.sh --cheat (loads after attach)');
  log('info', 'Try: fight a battle or open profile to trigger XP events');
}

// ─── attach-safe startup ───
log('info', "Vampire's Fall 2 hooks loaded (pid=" + Process.id + ')');
log('info', 'Deferring hook install 1s to avoid attach crash...');

setTimeout(installHooks, 1000);
