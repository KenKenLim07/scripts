/**
 * Smart / GigaLife — MASTER instrumentation (v3)
 * See ../README.md
 */

'use strict';

var SMART_VERBOSE = false;
var SMART_SSL_BYPASS = true;
var SMART_MAX_BODY = 32768;
var SMART_HOST_RE = /smart\.com\.ph/i;
var AUTH_URL_RE = /\/(sso|oauth|token|refresh|login|auth)\b/i;

var requestUrlById = {};
var taskBuffers = {};

function log(msg) {
  console.log('[smart_hook] ' + msg);
}

function logBlock(title, lines) {
  log('════════ ' + title + ' ════════');
  lines.forEach(function (line) {
    log('  ' + line);
  });
}

function ptrKey(ptr) {
  return ptr ? ptr.toString() : '';
}

function urlString(obj) {
  try {
    if (!obj || obj.isNull()) return '';
    return obj.toString();
  } catch (e) {
    return '';
  }
}

function isInterestingUrl(urlStr) {
  if (!urlStr || urlStr === 'about:blank') return false;
  if (SMART_VERBOSE) return true;
  return SMART_HOST_RE.test(urlStr);
}

function isAuthUrl(urlStr) {
  return AUTH_URL_RE.test(urlStr) || /refresh/i.test(urlStr);
}

function nsDataLength(d) {
  try {
    var len = d.length();
    if (typeof len === 'object' && len.valueOf) return len.valueOf();
    return Number(len);
  } catch (e) {
    return -1;
  }
}

function nsDataToString(dataPtr) {
  if (!dataPtr || dataPtr.isNull()) return null;
  try {
    var d = new ObjC.Object(dataPtr);
    var len = nsDataLength(d);
    if (len < 0) return '(unknown NSData length)';
    if (len === 0) return '';
    if (len > SMART_MAX_BODY) return '(body ' + len + ' bytes, truncated in log)';

    var str = ObjC.classes.NSString.alloc().initWithData_encoding_(d, 4);
    if (str && !str.isNull()) {
      var s = str.toString();
      if (s.length > SMART_MAX_BODY) return s.substring(0, SMART_MAX_BODY) + '…';
      return s;
    }
    var bytes = d.bytes();
    if (bytes && !bytes.isNull()) {
      return Memory.readUtf8String(bytes, Math.min(len, SMART_MAX_BODY));
    }
  } catch (e) {
    return '(decode error: ' + e + ')';
  }
  return null;
}

function mergeDataParts(parts) {
  if (!parts || !parts.length) return null;
  try {
    var out = ObjC.classes.NSMutableData.data();
    for (var i = 0; i < parts.length; i++) {
      out.appendData_(parts[i]);
    }
    return out;
  } catch (e) {
    if (parts.length === 1) return parts[0];
    return null;
  }
}

function decodeJwtPayload(token) {
  try {
    if (!token || token.indexOf('.') < 0) return null;
    var payload = token.split('.')[1];
    payload = payload.replace(/-/g, '+').replace(/_/g, '/');
    while (payload.length % 4) payload += '=';
    var data = ObjC.classes.NSData.alloc().initWithBase64EncodedString_options_(payload, 0);
    return nsDataToString(data);
  } catch (e) {
    return null;
  }
}

function trackRequestUrl(reqPtr, urlStr) {
  if (reqPtr && urlStr) requestUrlById[ptrKey(reqPtr)] = urlStr;
}

function getTrackedUrl(reqPtr) {
  return requestUrlById[ptrKey(reqPtr)] || '';
}

function taskIdFromTask(taskObj) {
  try {
    return taskObj.taskIdentifier().toString();
  } catch (e) {
    return ptrKey(taskObj.handle);
  }
}

function urlFromTask(taskObj) {
  try {
    var req = taskObj.currentRequest();
    if (!req || req.isNull()) req = taskObj.originalRequest();
    if (!req || req.isNull()) return '';
    return urlString(req.URL().absoluteString());
  } catch (e) {
    return '';
  }
}

function dumpHeadersFromDict(fields) {
  var lines = [];
  if (!fields || fields.isNull()) return lines;
  try {
    var dict = new ObjC.Object(fields);
    var keys = dict.allKeys();
    var n = keys.count().valueOf();
    for (var i = 0; i < n; i++) {
      var k = keys.objectAtIndex_(i).toString();
      var v = dict.objectForKey_(keys.objectAtIndex_(i)).toString();
      lines.push(k + ': ' + v);
      if (k === 'Authorization' && v.indexOf('Bearer ') === 0) {
        var jwt = decodeJwtPayload(v.substring(7));
        if (jwt) lines.push('  (JWT payload) ' + jwt);
      }
    }
  } catch (e) {
    lines.push('(header error: ' + e + ')');
  }
  return lines;
}

function dumpRequest(req, tag) {
  var url = urlString(req.URL().absoluteString());
  if (!isInterestingUrl(url) && !isAuthUrl(url)) return;

  var method = 'GET';
  try {
    if (req.HTTPMethod()) method = req.HTTPMethod().toString();
  } catch (e) {}

  var lines = ['tag: ' + tag, 'method: ' + method, 'url: ' + url];
  var hdrs = dumpHeadersFromDict(req.allHTTPHeaderFields());
  if (hdrs.length) {
    lines.push('headers:');
    hdrs.forEach(function (h) {
      lines.push('  ' + h);
    });
  }
  try {
    var body = req.HTTPBody();
    if (body && !body.isNull()) {
      var bodyStr = nsDataToString(body);
      if (bodyStr) lines.push('request_body: ' + bodyStr);
    }
  } catch (e) {}

  logBlock('REQUEST', lines);
  if (isAuthUrl(url)) log('>>> AUTH ENDPOINT <<<');
}

function flushTaskResponse(taskObj, errorPtr) {
  var tid = taskIdFromTask(taskObj);
  var buf = taskBuffers[tid];
  if (!buf) return;
  delete taskBuffers[tid];

  var lines = ['url: ' + buf.url];
  try {
    if (errorPtr && !errorPtr.isNull()) {
      lines.push('error: ' + new ObjC.Object(errorPtr).toString());
    }
  } catch (e) {}

  var merged = mergeDataParts(buf.parts);
  if (merged) {
    var bodyStr = nsDataToString(merged);
    if (bodyStr) lines.push('response_body: ' + bodyStr);
  } else {
    lines.push('response_body: (empty)');
  }
  logBlock('RESPONSE', lines);
}

function dumpResponseSimple(url, response, data, error) {
  if (!isInterestingUrl(url) && !isAuthUrl(url) && !SMART_VERBOSE) return;
  var lines = ['url: ' + url];
  try {
    if (error && !error.isNull()) lines.push('error: ' + new ObjC.Object(error).toString());
  } catch (e) {}
  try {
    if (response && !response.isNull()) {
      var resp = new ObjC.Object(response);
      if (resp.isKindOfClass_(ObjC.classes.NSHTTPURLResponse)) {
        lines.push('status: ' + resp.statusCode().toString());
        var rh = dumpHeadersFromDict(resp.allHeaderFields());
        if (rh.length) {
          lines.push('response_headers:');
          rh.forEach(function (h) {
            lines.push('  ' + h);
          });
        }
      }
    }
  } catch (e) {}
  var bodyStr = nsDataToString(data);
  if (bodyStr) lines.push('response_body: ' + bodyStr);
  logBlock('RESPONSE', lines);
}

function hookNSMutableURLRequest() {
  if (!ObjC.available) return;
  var Cls = ObjC.classes.NSMutableURLRequest;
  if (!Cls) return;

  if (Cls['- setURL:']) {
    Interceptor.attach(Cls['- setURL:'].implementation, {
      onEnter: function (args) {
        try {
          var url = urlString(new ObjC.Object(args[2]));
          trackRequestUrl(args[0], url);
          if (isInterestingUrl(url) || isAuthUrl(url)) log('[setURL] ' + url);
        } catch (e) {}
      },
    });
  }

  function onHeader(args) {
    try {
      var url = getTrackedUrl(args[0]);
      if (!isInterestingUrl(url) && !isAuthUrl(url)) return;
      var field = new ObjC.Object(args[3]).toString();
      var val = new ObjC.Object(args[2]).toString();
      if (/auth|token|gla|cookie|session|bearer|x-application/i.test(field)) {
        log('[header] ' + url + ' → ' + field + ': ' + val);
      }
    } catch (e) {}
  }

  if (Cls['- setValue:forHTTPHeaderField:']) {
    Interceptor.attach(Cls['- setValue:forHTTPHeaderField:'].implementation, { onEnter: onHeader });
  }
  if (Cls['- setHTTPHeaderValue:forHTTPHeaderField:']) {
    Interceptor.attach(Cls['- setHTTPHeaderValue:forHTTPHeaderField:'].implementation, { onEnter: onHeader });
  }
  if (Cls['- setHTTPBody:']) {
    Interceptor.attach(Cls['- setHTTPBody:'].implementation, {
      onEnter: function (args) {
        try {
          var url = getTrackedUrl(args[0]);
          if (!isInterestingUrl(url) && !isAuthUrl(url)) return;
          var s = nsDataToString(args[2]);
          if (s) log('[setHTTPBody] ' + url + '\n' + s);
        } catch (e) {}
      },
    });
  }
  log('Hooked NSMutableURLRequest');
}

function hookNSURLSessionTaskResume() {
  if (!ObjC.available) return;
  var Task = ObjC.classes.NSURLSessionTask;
  if (!Task || !Task['- resume']) return;

  Interceptor.attach(Task['- resume'].implementation, {
    onEnter: function (args) {
      try {
        var task = new ObjC.Object(args[0]);
        var req = task.currentRequest();
        if (!req || req.isNull()) req = task.originalRequest();
        if (!req || req.isNull()) return;
        dumpRequest(req, 'task.resume');
      } catch (e) {}
    },
  });
  log('Hooked NSURLSessionTask.resume');
}

function hookUrlSessionDelegates() {
  if (!ObjC.available) return;
  var resolver = new ApiResolver('objc');
  var hooked = {};

  function attach(match, handler) {
    var key = match.name + match.address;
    if (hooked[key]) return;
    hooked[key] = true;
    try {
      Interceptor.attach(match.address, handler);
      log('Delegate hook: ' + match.name);
    } catch (e) {
      log('Delegate hook failed ' + match.name + ': ' + e);
    }
  }

  resolver.enumerateMatches('-[* URLSession:dataTask:didReceiveData:]', {
    onMatch: function (match) {
      attach(match, {
        onEnter: function (args) {
          try {
            var task = new ObjC.Object(args[3]);
            var data = new ObjC.Object(args[4]);
            var url = urlFromTask(task);
            if (!isInterestingUrl(url) && !isAuthUrl(url)) return;
            var tid = taskIdFromTask(task);
            if (!taskBuffers[tid]) taskBuffers[tid] = { url: url, parts: [] };
            taskBuffers[tid].parts.push(data);
          } catch (e) {}
        },
      });
    },
    onComplete: function () {},
  });

  resolver.enumerateMatches('-[* URLSession:task:didCompleteWithError:]', {
    onMatch: function (match) {
      attach(match, {
        onEnter: function (args) {
          try {
            var task = new ObjC.Object(args[3]);
            flushTaskResponse(task, args[4]);
          } catch (e) {}
        },
      });
    },
    onComplete: function () {},
  });

  log('URLSession delegate hooks installed');
}

function hookNSURLSession() {
  if (!ObjC.available) return;
  var NSURLSession = ObjC.classes.NSURLSession;
  if (!NSURLSession) return;

  function wrapBlock(blockPtr, url) {
    if (!blockPtr || blockPtr.isNull()) return;
    try {
      var block = new ObjC.Block(blockPtr);
      var impl = block.implementation;
      if (!impl) return;
      Interceptor.attach(impl, {
        onEnter: function (ba) {
          try {
            var data = ba[2];
            var response = ba[3];
            var error = ba[4];
            if (!data || data.isNull()) {
              data = ba[1];
              response = ba[2];
              error = ba[3];
            }
            dumpResponseSimple(url, response, data, error);
          } catch (e) {}
        },
      });
    } catch (e) {}
  }

  var sel = '- dataTaskWithRequest:completionHandler:';
  if (NSURLSession[sel]) {
    Interceptor.attach(NSURLSession[sel].implementation, {
      onEnter: function (args) {
        try {
          var req = new ObjC.Object(args[2]);
          var url = urlString(req.URL().absoluteString());
          if (!isInterestingUrl(url) && !isAuthUrl(url)) return;
          dumpRequest(req, 'dataTask');
          wrapBlock(args[3], url);
        } catch (e) {}
      },
    });
  }
  log('Hooked NSURLSession dataTask');
}

function hookAlamofire() {
  if (!ObjC.available) return;
  var found = [];
  Object.keys(ObjC.classes).forEach(function (name) {
    if (/Alamofire|DataRequest|SessionDelegate|Request$/i.test(name) && name.length < 80) {
      found.push(name);
    }
  });
  if (found.length) log('Alamofire-related classes: ' + found.slice(0, 15).join(', '));
}

function hookJSONSerialization() {
  if (!ObjC.available) return;
  var Cls = ObjC.classes.NSJSONSerialization;
  if (!Cls || !Cls['+ JSONObjectWithData:options:error:']) return;

  Interceptor.attach(Cls['+ JSONObjectWithData:options:error:'].implementation, {
    onEnter: function (args) {
      this._raw = nsDataToString(args[2]);
    },
    onLeave: function (retval) {
      try {
        if (!retval || retval.isNull() || !this._raw) return;
        if (!SMART_VERBOSE && !/giga|smart|balance|wallet|promo|dashboard|token|points/i.test(this._raw)) {
          return;
        }
        if (this._raw.length > SMART_MAX_BODY) return;
        log('[JSON parsed] ' + this._raw.substring(0, SMART_MAX_BODY));
      } catch (e) {}
    },
  });
  log('Hooked NSJSONSerialization');
}

function hookSSLPinningBypass() {
  if (!SMART_SSL_BYPASS) return;

  var SecTrustEvaluateWithError = Module.getGlobalExportByName('SecTrustEvaluateWithError');
  if (SecTrustEvaluateWithError) {
    Interceptor.attach(SecTrustEvaluateWithError, {
      onLeave: function (retval) {
        retval.replace(1);
      },
    });
    log('Hooked SecTrustEvaluateWithError (trust OK)');
  }

  if (!ObjC.available) return;
  var resolver = new ApiResolver('objc');
  resolver.enumerateMatches('-[* URLSession:didReceiveChallenge:completionHandler:]', {
    onMatch: function (match) {
      try {
        Interceptor.attach(match.address, {
          onEnter: function (args) {
            try {
              var challenge = new ObjC.Object(args[3]);
              var ps = challenge.protectionSpace();
              if (ps.authenticationMethod().toString() !== 'NSURLAuthenticationMethodServerTrust') return;
              var trust = ps.serverTrust();
              var cred = ObjC.classes.NSURLCredential.credentialForTrust_(trust);
              var block = new ObjC.Block(args[4]);
              block.implementation(block, 0, cred, ptr(0));
              log('[SSL] credentialForTrust → ' + ps.host().toString());
            } catch (e) {}
          },
        });
      } catch (e) {}
    },
    onComplete: function () {},
  });
}

function hookKeychain() {
  var SecItemCopyMatching = Module.getGlobalExportByName('SecItemCopyMatching');
  if (!SecItemCopyMatching) return;

  Interceptor.attach(SecItemCopyMatching, {
    onEnter: function (args) {
      this.query = args[0];
    },
    onLeave: function (retval) {
      try {
        if (retval.toInt32() !== 0) return;
        if (!ObjC.available) return;
        var query = new ObjC.Object(this.query);
        var service = query.objectForKey_('acct') || query.objectForKey_('svce');
        var generic = query.objectForKey_('gena');
        var label = '';
        if (service && !service.isNull()) label += 'acct=' + service.toString() + ' ';
        if (generic && !generic.isNull()) {
          var g = nsDataToString(generic);
          if (g && /token|auth|jwt|bearer|smart|giga/i.test(g)) {
            log('[Keychain] ' + label + 'data=' + g.substring(0, 500));
          }
        }
      } catch (e) {}
    },
  });
  log('Hooked SecItemCopyMatching');
}

log('═══ Smart/GigaLife MASTER hook v3 ═══');
log('Filter: *.smart.com.ph | SSL_BYPASS=' + SMART_SSL_BYPASS);

var main = Process.enumerateModules().filter(function (m) {
  return m.path && m.path.indexOf('.app/') !== -1;
})[0];
if (main) log('Binary: ' + main.name + ' @ ' + main.path);

if (ObjC.available) {
  hookNSMutableURLRequest();
  hookNSURLSessionTaskResume();
  hookUrlSessionDelegates();
  hookNSURLSession();
  hookAlamofire();
  hookJSONSerialization();
  hookSSLPinningBypass();
  hookKeychain();
  log('Ready — use Smart; watch logs/smart_log.txt');
} else {
  log('ObjC not available');
}
