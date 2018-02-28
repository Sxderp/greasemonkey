// user-script-obj.js looks up the extension version from the manifest
chrome.runtime.getManifest.returns({'version': 1});

// See comment for details
// https://github.com/greasemonkey/greasemonkey/pull/2812#issuecomment-358776737
navigator.storage = {};
navigator.storage.persist = () => Promise.resolve(true);

// In tests, never complain about missing translations.
function _(str) {
  return str;
}

(function() {

const timers = {};

console.time = function(label) {
  timers[label] = performance.now();
  console.log(label + ': timer started');
}

console.timeEnd = function(label) {
  let f = (performance.now() - timers[label]).toString();
  let [d, l] = f.split('.');
  console.log(label + ': ' + d + '.' + l.substr(0,2) + 'ms');
}

})();
