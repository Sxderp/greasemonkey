'use strict';
/*
The UserScript object represents a user script, and all content and behaviors.

Content scripts can and should use `RemoteUserScript`, for display during
the install process.  Nothing else besides `UserScriptRegistry` should ever
reference any other objects from this file.
*/

// Increment this number when updating `calculateEvalContent()`.  If it
// is higher than it was when eval content was last calculated, it will
// be re-calculated.
const EVAL_CONTENT_VERSION = 14;


// Private implementation.
(function() {

const extensionVersion = chrome.runtime.getManifest().version;
const aboutBlankRegexp = /^about:blank/;

const SCRIPT_ENV_EXTRA = `
{
  let origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function open(method, url) {
    // only include method and url parameters so the function length is set properly
    if (arguments.length >= 2) {
      let newUrl = new URL(arguments[1], document.location.href);
      arguments[1] = newUrl.toString();
    }
    return origOpen.apply(this, arguments);
  };
}
`;


function _testExp(expression, url) {
  let exp = new RegExp(expression, "i");
  return exp.test(url.href);
}


/// Safely copies selected input values to another object.
function _loadValuesInto(dest, vals, keys) {
  keys.forEach(k => {
    if (vals.hasOwnProperty(k)) {
      // TODO: This without nasty digging into other object's privates?
      dest['_' + k] = _safeCopy(vals[k]);
    }
  });
}


function _randomUuid() {
  const randomInts = new Uint8Array(16);
  window.crypto.getRandomValues(randomInts);
  const randomChars = [];
  for (let i = 0; i<16; i++) {
    let s = randomInts[i].toString(16).padStart(2, '0');
    randomChars.push(s.substr(0, 1));
    randomChars.push(s.substr(1, 1));
  }

  let uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  uuid = uuid.replace(/[xy]/g, function(c) {
    let r = randomChars.shift();
    if (c == 'y') {
      r = (parseInt(r, 16)&0x3|0x8).toString(16);
    }
    return r;
  });

  return uuid;
}


/// Returns v unless v is an array or object, then a (shallow) copy of v.
function _safeCopy(v) {
  if (!v) return v;
  if (v.constructor == Array) return v.slice();
  if (v.constructor == Object) return Object.assign({}, v);
  return v;
}


const userScriptKeys = [
    'description', 'downloadUrl', 'excludes', 'grants', 'homePageUrl',
    'includes', 'matches', 'name', 'namespace', 'noFrames', 'runAt', 'version'];
/// Base class, fields and methods common to all kinds of UserScript objects.
window.RemoteUserScript = class RemoteUserScript {
  constructor(vals) {
    // Fixed details parsed from the ==UserScript== section.
    this._description = null;
    this._downloadUrl = null;
    this._excludes = [];
    this._excludesExpression = null;
    this._grants = ['none'];
    this._homePageUrl = null;
    this._includes = [];
    this._includesExpression = null;
    this._matches = [];
    this._matchesExpression = null;
    this._matchAboutBlank = false;
    this._name = 'user-script';
    this._namespace = null;
    this._noFrames = false;
    this._runAt = 'end';
    this._version = null;

    _loadValuesInto(this, vals, userScriptKeys);
  }

  get details() {
    const d = {};
    userScriptKeys.forEach(k => {
      d[k] = _safeCopy(this['_' + k]);
    });
    d.id = this.id;
    return d;
  }

  get description() { return this._description; }
  get downloadUrl() { return this._downloadUrl; }
  get excludes() { return _safeCopy(this._excludes); }
  get grants() { return _safeCopy(this._grants); }
  get homePageUrl() { return _safeCopy(this._homePageUrl); }
  get includes() { return _safeCopy(this._includes); }
  get matches() { return _safeCopy(this._matches); }
  get name() { return this._name; }
  get namespace() { return this._namespace; }
  get noFrames() { return this._noFrames; }
  get runAt() { return this._runAt; }
  get version() { return this._version; }

  get id() { return this.namespace + '/' + this.name; }

  _generateCludes(cludes, checkBlank) {
    if (checkBlank) this._matchAboutBlank = false;
    if (cludes.length === 0) return false;
    let regex = "";

    for (let glob of cludes) {
      if (checkBlank && aboutBlankRegexp.test(glob)) {
        this._matchAboutBlank = true;
        continue;
      }
      regex += "|(" + GM_convert2RegExp(glob).source + ")";
    }
    return regex ? regex.substring(1) : false;
  }

  _generateMatches(matches) {
    if (matches.length === 0) return false;
    let regex = "";

    for (let pattern of matches) {
      if ('string' === typeof pattern) {
        pattern = new MatchPattern(pattern);
      } else if (! (pattern instanceof MatchPattern)) {
        continue;
      }
      regex += "|(" + pattern.expression.source + ")";
    }
    return regex ? regex.substring(1) : false;
  }

  _actuallyRefreshExp(excludes, includes, matches) {
    this._excludesExpression = this._generateCludes(excludes, false);
    this._includesExpression = this._generateCludes(includes, true);
    this._matchesExpression = this._generateMatches(matches);
  }

  _refreshExpressions() {
    // TODO: Global includes / matches
    let excludes = getGlobalExcludes().concat(this._excludes);
    this._actuallyRefreshExp(excludes, this._includes, this._matches);
  }

  runsOn(url) {
    if (!(url instanceof URL)) {
      throw new Error('runsOn() got non-url parameter: ' + url);
    }

    if (url
        && url.protocol != 'http:'
        && url.protocol != 'https:'
        && url.protocol != 'file:'
        && !url.href.startsWith('about:blank')
    ) {
      return false;
    }

    if (
        this._excludesExpression === null ||
        this._matchesExpression === null ||
        this._includesExpression === null
    ) {
        this._refreshExpressions();
    }

    if (this._excludesExpression && _testExp(this._excludesExpression, url)) {
      return false;
    }
    if (this._matchAboutBlank && aboutBlankRegexp.test(url.href)) {
      return true;
    }
    if (this._includesExpression && _testExp(this._includesExpression, url)) {
      return true;
    }
    if (this._matchesExpression && _testExp(this._matchesExpression, url)) {
      return true;
    }
    return false;
  }

  toString() {
    return this.version
        ? _('gm_script_id_ver', this.id, this.version)
        : _('gm_script_id', this.id);
  }
};


const runnableUserScriptKeys = [
    'autoUpdate', 'enabled', 'evalContent', 'evalContentVersion', 'iconBlob',
    'resources', 'uuid',
    'userExcludes', 'userExcludesExclusive',
    'userIncludes', 'userIncludesExclusive',
    'userMatches', 'userMatchesExclusive'];
/// A _UserScript, plus user settings, plus (eval'able) contents.  Should
/// never be called except by `UserScriptRegistry.`
window.RunnableUserScript = class RunnableUserScript
    extends window.RemoteUserScript {
  constructor(details) {
    super(details);

    this._autoUpdate = true;
    this._enabled = true;
    this._evalContent = null;  // TODO: Calculated final eval string.  Blob?
    this._evalContentVersion = -1;
    this._iconBlob = null;
    this._resources = {};  // Name to object with keys: name, mimetype, blob.
    this._userExcludes = [];
    this._userExcludesExclusive = false;
    this._userIncludes = [];
    this._userIncludesExclusive = false;
    this._userMatches = [];
    this._userMatchesExclusive = false;
    this._uuid = null;

    _loadValuesInto(this, details, runnableUserScriptKeys);

    if (!this._uuid) this._uuid = _randomUuid();
  }

  _refreshExpressions() {
    // TODO: Global includes / matches

    let excludes = getGlobalExcludes().concat(this._userExcludes);
    if (!this._userExcludesExclusive) excludes.push(...this._excludes);

    let includes = [].concat(this._userIncludes);
    if (!this._userIncludesExclusive) includes.push(...this._includes);

    let matches = [].concat(this._userMatches);
    if (!this._userMatchesExclusive) matches.push(...this._matches);

    this._actuallyRefreshExp(excludes, includes, matches);
  }

  get details() {
    let d = super.details;
    runnableUserScriptKeys.forEach(k => {
      d[k] = _safeCopy(this['_' + k]);
    });
    return d;
  }

  get autoUpdate() { return this._autoUpdate; }
  set autoUpdate(v) { this._autoUpdate = !!v; }
  get enabled() { return this._enabled; }
  set enabled(v) { this._enabled = !!v; }

  get userExcludes() { return _safeCopy(this._userExcludes); }
  set userExcludes(v) { this._userExcludes = _safeCopy(v); }
  get userExcludesExclusive() { return _safeCopy(this._userExcludesExclusive); }
  set userExcludesExclusive(v) { this._userExcludesExclusive = !!v; }
  get userIncludes() { return _safeCopy(this._userIncludes); }
  set userIncludes(v) { this._userIncludes = _safeCopy(v); }
  get userIncludesExclusive() { return _safeCopy(this._userIncludesExclusive); }
  set userIncludesExclusive(v) { this._userIncludesExclusive = !!v; }
  get userMatches() { return _safeCopy(this._userMatches); }
  set userMatches(v) { this._userMatches = _safeCopy(v); }
  set userMatchesExclusive(v) { this._userMatchesExclusive = !!v; }

  get evalContent() { return this._evalContent; }
  get evalContentVersion() { return this._evalContentVersion; }
  get iconBlob() { return this._iconBlob; }
  get resources() { return _safeCopy(this._resources); }
  get uuid() { return this._uuid; }
};


const editableUserScriptKeys = [
    'content', 'editTime', 'installTime', 'requiresContent'];
/// A _UserScript, plus user settings, plus all requires' contents.  Should
/// never be called except by `UserScriptRegistry.`
window.EditableUserScript = class EditableUserScript
    extends window.RunnableUserScript {
  constructor(details) {
    super(details);

    this._content = null;
    this._editTime = null;
    this._installTime = null;
    this._requiresContent = {};  // Map of download URL to content.

    _loadValuesInto(this, details, editableUserScriptKeys);
  }

  get details() {
    const d = super.details;
    editableUserScriptKeys.forEach(k => {
      d[k] = _safeCopy(this['_' + k]);
    });
    d.hasBeenEdited = this.hasBeenEdited;
    return d;
  }

  get content() { return this._content; }
  get editTime() { return this._editTime; }
  get installTime() { return this._installTime; }
  get requiresContent() { return _safeCopy(this._requiresContent); }

  get hasBeenEdited() {
    if (!this._editTime) return false;
    return this._installTime < this._editTime;
  }

  calculateEvalContent() {
    // Put the first line of the script content on line one of the
    // generated content -- wrapped in a function.  Then add the rest
    // of the generated parts.
    this._evalContent
        // Note intentional lack of line breaks before the script content.
        = `try { (function scopeWrapper(){ function userScript() { ${this._content}
        /* Line break to catch comments on the final line of scripts. */ }
        const unsafeWindow = window.wrappedJSObject;
        ${this.calculateGmInfo()}
        ${apiProviderSource(this)}
        ${Object.values(this._requiresContent).join('\n\n')}
        ${SCRIPT_ENV_EXTRA}
        userScript();
        })();
        } catch (e) { console.error("Script error: ", e); }
        //# sourceURL=user-script:${escape(this.id)}`;
    this._evalContentVersion = EVAL_CONTENT_VERSION;
  }

  calculateGmInfo() {
    let gmInfo = {
      'script': {
        'description': this.description,
        'excludes': this.excludes,
        'includes': this.includes,
        'matches': this.matches,
        'name': this.name,
        'namespace': this.namespace,
        'resources': {},
        'runAt': this.runAt,
        'uuid': this.uuid,
        'version': this.version,
      },
      'scriptMetaStr': extractMeta(this.content),
      'scriptHandler': 'Greasemonkey',
      'version': extensionVersion,
    };
    Object.keys(this.resources).forEach(n => {
      let r = this.resources[n];
      gmInfo.script.resources[n] = {
        'name': r.name,
        'mimetype': r.mimetype,
        'url': r.url || "",
      };
    });
    return 'const GM = {};\n'
        + 'GM.info=' + JSON.stringify(gmInfo) + ';'
        + 'const GM_info = GM.info;';
  }

  // Given a successful `Downloader` object, update this script from it.
  updateFromDownloaderDetails(userScriptDetails, downloaderDetails) {
    _loadValuesInto(this, userScriptDetails, userScriptKeys);
    _loadValuesInto(this, userScriptDetails, runnableUserScriptKeys);
    _loadValuesInto(this, userScriptDetails, editableUserScriptKeys);

    this._content = downloaderDetails.content;
    this._iconBlob = downloaderDetails.icon || null;
    if (downloaderDetails.installTime) {
      this._installTime = downloaderDetails.installTime;
    }

    this._requiresContent = {};
    Object.assign(this._requiresContent, downloaderDetails.requires);

    this._resources = {};
    Object.assign(this._resources, downloaderDetails.resources);

    this._refreshExpressions();
  }
}

})();
