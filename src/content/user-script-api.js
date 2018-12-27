
function doCheck(checks, url) {
  if (checks.excludes && _testExp(checks.excludes, url)) {
    return false;
  }
  if (checks.includes && _testExp(checks.includes, url)) {
    return true;
  }
  if (checks.matches && _testExp(checks.matches, url)) {
    return true;
  }
  return false;
}


function _testExp(expression, url) {
  let exp = new RegExp(expression, "i");
  return exp.test(url);
}


browser.userScripts.onBeforeScript.addListener(script => {
  console.log(script);
  const metaobj = script.metadata.internal;
  const grants = metaobj.grants;
  const uuid = metaobj.uuid;
  // Todo: remove the export functions for grant none when wrappers can be waived
  const exportObj = {
    'GM': {
      'info': script.metadata.external
    },
    exportFunction(fn, target, options) {
      return exportFunction(fn, target, options);
    },
    cloneInto(obj, target) {
      return cloneInto(obj, target);
    }
  };



  // Manual regex checks if they're necessary
  // TODO: canceling the event is not possible yet. Was suggested by Rob in https://bugzilla.mozilla.org/show_bug.cgi?id=1509339#c10
  if (window.location.href !== 'about:blank' && metaobj.regexChecks) {
    let toRun = doCheck(metaobj.checks, window.location.href);
    if (! toRun) {
      return false;
    }
  }



  // TODO: Is this still necessary?
  let origOpen = script.global.XMLHttpRequest.prototype.open;
  script.global.XMLHttpRequest.prototype.open = function open(method, url) {
    // only include method and url parameters so the function length is set properly
    if (arguments.length >= 2) {
      let newUrl = new URL(arguments[1], document.location.href);
      arguments[1] = newUrl.toString();
    }
    return origOpen.apply(this, arguments);
  };



  // Inject requires
  Object.values(metaobj.requires).forEach(content => {
    script.global.eval(content);
  });



  if (grants.includes('none')) {
    script.defineGlobals(exportObj);
    return true;
  }


  if (grants.includes('GM.deleteValue')) {
    exportObj.GM.deleteValue = function GM_deleteValue(key) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          'key': key,
          'name': 'ApiDeleteValue',
          'uuid': uuid,
        }, result => result ? resolve() : reject());
      });
    }
  }


  if (grants.includes('GM.getValue')) {
    exportObj.GM.getValue = function GM_getValue(key, defaultValue) {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({
          'key': key,
          'name': 'ApiGetValue',
          'uuid': uuid,
        }, result => {
          if (result !== undefined) {
            resolve(result)
          } else {
            resolve(defaultValue);
          }
        });
      });
    }
  }


  if (grants.includes('GM.listValues')) {
    exportObj.GM.listValues = function GM_listValues() {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({
          'name': 'ApiListValues',
          'uuid': uuid,
        }, result => resolve(result));
      });
    }
  }


  if (grants.includes('GM.setValue')) {
    exportObj.GM.setValue = function GM_setValue(key, value) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          'key': key,
          'name': 'ApiSetValue',
          'uuid': uuid,
          'value': value,
        }, result => {
          if (result !== undefined) {
            resolve(result);
          } else {
            console.warn('set value failed:', chrome.runtime.lastError);
            reject();
          }
        });
      });
    }
  }


  if (grants.includes('GM.getResourceUrl')) {
    exportObj.GM.getResourceUrl = function GM_getResourceUrl(name) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          'name': 'ApiGetResourceBlob',
          'resourceName': name,
          'uuid': uuid,
        }, result => {
          if (result) {
            resolve(URL.createObjectURL(result.blob))
          } else {
            reject(`No resource named "${name}"`);
          }
        });
      });
    }
  }


  if (grants.includes('GM.notification')) {
    exportObj.GM.notification = function GM_notification(text, title, image, onclick) {
      let opt;

      if (typeof text == 'object') {
        opt = text;
        if (typeof title == 'function') opt.ondone = title;
      } else {
        opt = { title, text, image, onclick };
      }

      if (typeof opt.text != 'string') {
        throw new Error(_('gm_notif_text_must_be_string'));
      }

      if (typeof opt.title != 'string') opt.title = _('extName');
      if (typeof opt.image != 'string') opt.image = 'skin/icon.svg';

      let port = chrome.runtime.connect({name: 'UserScriptNotification'});
      port.onMessage.addListener(msg => {
        const msgType = msg.type;
        if (typeof opt[msgType] == 'function') opt[msgType]();
      });
      port.postMessage({
        'details': {
          'title': opt.title,
          'text': opt.text,
          'image': opt.image
        },
        'name': 'create',
        'uuid': uuid,
      });
    }
  }


  if (grants.includes('GM.openInTab')) {
    exportObj.GM.openInTab = function GM_openInTab(url, openInBackground) {
      let objURL;

      try {
        objURL = new URL(url, location.href);
      } catch(e) {
        throw new Error(_('gm_opentab_bad_URL', url));
      }

      chrome.runtime.sendMessage({
        'active': (openInBackground === false),
        'name': 'ApiOpenInTab',
        'url': objURL.href,
        'uuid': uuid,
      });
    }
  }


  if (grants.includes('GM.setClipboard')) {
    exportObj.GM.setClipboard = function GM_setClipboard(text) {
      // TODO: This.  The check only works background side, but this implementation
      // relies on clipboardWrite permission leaking to the content script so we
      // couldn't block a script from doing this directly, anyway.
      //checkApiCallAllowed('GM.setClipboard', message.uuid);

      function onCopy(event) {
        document.removeEventListener('copy', onCopy, true);

        event.stopImmediatePropagation();
        event.preventDefault();

        event.clipboardData.setData('text/plain', text);
      }

      document.addEventListener('copy', onCopy, true);
      document.execCommand('copy');
    }
  }


  if (grants.includes('GM.xmlHttpRequest')) {
    exportObj.GM.xmlHttpRequest = function GM_xmlHttpRequest(d) {
      if (!d) throw new Error(_('xhr_no_details'));
      if (!d.url) throw new Error(_('xhr_no_url'));

      let url;
      try {
        url = new URL(d.url, location.href);
      } catch (e) {
        throw new Error(_('xhr_bad_url', d.url, e));
      }

      if (url.protocol != 'http:'
          && url.protocol != 'https:'
          && url.protocol != 'ftp:'
      ) {
        throw new Error(_('xhr_bad_url_scheme', d.url));
      }

      let port = chrome.runtime.connect({name: 'UserScriptXhr'});
      port.onMessage.addListener(function(msg) {
        if (msg.responseState.responseXML) {
          try {
            msg.responseState.responseXML = (new DOMParser()).parseFromString(
                msg.responseState.responseText,
                'application/xml');
          } catch (e) {
            console.warn('GM_xhr could not parse XML:', e);
            msg.responseState.responseXML = null;
          }
        }
        let o = msg.src == 'up' ? d.upload : d;
        let cb = o['on' + msg.type];
        if (cb) cb(msg.responseState);
      });

      let noCallbackDetails = {};
      Object.keys(d).forEach(k => {
        let v = d[k];
        noCallbackDetails[k] = v;
        if ('function' == typeof v) noCallbackDetails[k] = true;
      });
      noCallbackDetails.upload = {};
      d.upload && Object.keys(k => noCallbackDetails.upload[k] = true);
      noCallbackDetails.url = url.href;
      port.postMessage({
        'details': noCallbackDetails,
        'name': 'open',
        'uuid': _uuid,
      });

      // TODO: Return an object which can be `.abort()`ed.
    }
  }


  script.defineGlobals(exportObj);
  return true;
});
