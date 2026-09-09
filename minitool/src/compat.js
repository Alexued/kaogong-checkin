(function () {
  if (typeof globalThis === 'undefined') window.globalThis = window;
  if (!String.prototype.replaceAll) {
    Object.defineProperty(String.prototype, 'replaceAll', { value: function (search, replacement) {
      if (search instanceof RegExp) {
        if (!search.global) throw new TypeError('replaceAll requires a global expression');
        return this.replace(search, replacement);
      }
      return this.split(String(search)).join(String(replacement));
    } });
  }
  if (!Array.prototype.at) Object.defineProperty(Array.prototype, 'at', { value: function (index) {
    index = Math.trunc(Number(index)) || 0;
    return this[index < 0 ? this.length + index : index];
  } });
  if (!Array.prototype.flat) Object.defineProperty(Array.prototype, 'flat', { value: function (depth) {
    var remaining = depth === undefined ? 1 : Math.max(0, Math.trunc(Number(depth)) || 0);
    return this.reduce(function (result, value) { return result.concat(Array.isArray(value) && remaining > 0 ? value.flat(remaining - 1) : [value]); }, []);
  } });
  if (!Array.prototype.flatMap) Object.defineProperty(Array.prototype, 'flatMap', { value: function (callback, thisArg) { return this.map(callback, thisArg).flat(); } });
  if (!Object.hasOwn) Object.hasOwn = function (object, key) { return Object.prototype.hasOwnProperty.call(object, key); };
  if (!window.structuredClone) window.structuredClone = function (value) { return JSON.parse(JSON.stringify(value)); };
  if (window.crypto && !window.crypto.randomUUID && window.crypto.getRandomValues) {
    window.crypto.randomUUID = function () {
      var bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      var text = Array.from(bytes, function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
      return [text.slice(0, 8), text.slice(8, 12), text.slice(12, 16), text.slice(16, 20), text.slice(20)].join('-');
    };
  }
  if (window.matchMedia) {
    var matchMedia = window.matchMedia.bind(window);
    window.matchMedia = function (query) {
      var media = matchMedia(query);
      if (!media.addEventListener) {
        media.addEventListener = function (event, listener) { if (event === 'change') media.addListener(listener); };
        media.removeEventListener = function (event, listener) { if (event === 'change') media.removeListener(listener); };
      }
      return media;
    };
  }
  function updateHeight() {
    var height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--app-height', height + 'px');
  }
  window.addEventListener('resize', updateHeight);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', updateHeight);
  updateHeight();
  function legacyFlexLayout() {
    var probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;display:flex;flex-direction:column;row-gap:1px';
    probe.appendChild(document.createElement('div')); probe.appendChild(document.createElement('div')); document.body.appendChild(probe);
    var supported = probe.scrollHeight === 1; probe.remove();
    if (supported) return;
    document.documentElement.classList.add('no-flex-gap');
    function mark(element) {
      if (!element || element.nodeType !== 1) return;
      var style = window.getComputedStyle(element);
      if (style.display === 'flex' || style.display === 'inline-flex') {
        element.setAttribute('data-mini-flex', style.flexDirection.indexOf('column') === 0 ? 'column' : 'row');
        element.setAttribute('data-mini-wrap', style.flexWrap === 'wrap' ? 'true' : 'false');
      } else { element.removeAttribute('data-mini-flex'); element.removeAttribute('data-mini-wrap'); }
    }
    function scan(root) { mark(root); Array.from(root.querySelectorAll('*')).forEach(mark); }
    scan(document.body);
    if (window.MutationObserver) new MutationObserver(function (records) {
      var changed = new Set();
      records.forEach(function (record) { if (record.type === 'attributes') changed.add(record.target); else record.addedNodes.forEach(function (node) { if (node.nodeType === 1) scan(node); }); });
      changed.forEach(mark);
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', function () { scan(document.body); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', legacyFlexLayout, { once: true });
  else legacyFlexLayout();
}());
