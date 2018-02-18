/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Page Modifications code.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   David Dahl <ddahl@mozilla.com>
 *   Drew Willcoxon <adw@mozilla.com>
 *   Erik Vold <erikvvold@gmail.com>
 *   Nils Maier <maierman@web.de>
 *   Anthony Lieuallen <arantius@gmail.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

(function() {

var validProtocols = ['http:', 'https:', 'ftp:', 'file:'];
var REG_HOST = /^(?:\*\.)?[^*\/]+$|^\*$|^$/;
var REG_PARTS = new RegExp('^([a-z*]+:|\\*:)//([^/]+)?(/.*)$');


// For the format of "pattern", see:
//   http://code.google.com/chrome/extensions/match_patterns.html
function MatchPattern(pattern) {
  this._pattern = pattern;

  // Special case "<all_urls>".
  if (pattern == "<all_urls>") {
    this._all = true;
    this._protocol = "all_urls";
    return;
  } else {
    this._all = false;
  }

  var m = pattern.match(REG_PARTS);
  if (!m) {
    throw new Error("@match: Could not parse the pattern.");
  }
  this.protocol = m[1];
  this.host = m[2];
  this.path = m[3];

  if (this.protocol != "*:" && validProtocols.indexOf(this.protocol) == -1) {
    throw new Error(`@match: Invalid protocol (${this.protocol}) specified.`);
  }

  if (!this.host && this.protocol != "file:") {
    throw new Error(`@match: No host specified for (${this.protocol}).`)
  } else if (this.host && this.protocol == "file:") {
    throw new Error("@match: Invalid (file:) URI, missing prefix \"/\"?");
  }

  if (!REG_HOST.test(this.host)) {
    throw new Error("@match: Invalid host specified.");
  }

  if (this.path[0] !== "/") {
    throw new Error("@match: Invalid path specified.");
  }

  this.expression = new RegExp(this.createExpression(), "i");
}


MatchPattern.prototype.createExpression = function() {
  let regex = '^';

  if ('*:' == this.protocol) {
    regex += 'https?:';
  } else {
    regex += this.protocol;
  }

  regex += '//';

  // No host indicates this is a file: match
  if (this.host) {
    let host = this.host;

    if ('*' == host) {
      // Wildcard host name. Match on any character until the path separator
      // is found.
      regex += '[^/]+?';
    } else {
      if (host.match(/^\*\./)) {
        // Special cased any or no subdomain token. Add a non-greed match for
        // zero or more of ".*\."
        regex += '(.*\\.)*?';
        // Trim the special case token from the host name.
        host = host.substring(2);
      }
      // Treat the rest of the hostname as standard characters that need
      // escaping.
      regex += escapeRegExpCharacters(host);
      // Append a zero or one match for a port string
      regex += '(:\\d+)?';
    }
  }
  // File protocol does not have a host

  // Treat the path as standard characters that need escaping.
  regex += escapeRegExpCharacters(this.path);

  return regex + '$';
};


MatchPattern.prototype.__defineGetter__('pattern',
function MatchPattern_getPattern() { return '' + this._pattern; });


MatchPattern.prototype.doMatch = function(url) {
  if (this._all) return true;
  return this.expression.test(url.href);
};


function escapeRegExpCharacters(pattern) {
  let res = "";

  for (let i = 0; i < pattern.length; ++i) {
    switch(pattern[i]) {
      case '*':
        res += '.*?';
        break;

      case '.':
      case '?':
      case '^':
      case '$':
      case '+':
      case '{':
      case '}':
      case '[':
      case ']':
      case '|':
      case '(':
      case ')':
      case '\\':
        res += '\\' + pattern[i];
        break;

      case ' ':
        break;

      default:
        res += pattern[i];
        break;
    }
  }
  return res;
}

window.MatchPattern = MatchPattern;
})();
