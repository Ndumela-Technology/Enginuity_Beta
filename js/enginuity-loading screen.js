/**
 * Enginuity — full-screen red loader when navigating between local HTML pages.
 */
(function () {
  "use strict";

  var LOADER_ID = "enginuity-loader";

  var GEAR_SVG =
    '<svg class="enginuity-gear" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" aria-hidden="true">' +
    '<path stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" d="M24 4v5M24 39v5M4 24h5M39 24h5M9.9 9.9l3.5 3.5M34.6 34.6l3.5 3.5M9.9 38.1l3.5-3.5M34.6 13.4l3.5-3.5" />' +
    '<circle cx="24" cy="24" r="9" stroke="currentColor" stroke-width="2.2" />' +
    '<path stroke="currentColor" stroke-width="2" d="M24 19v10M19 24h10" />' +
    "</svg>";

  function ensureLoader() {
    var el = document.getElementById(LOADER_ID);
    if (el) return el;

    var wrap = document.createElement("div");
    wrap.id = LOADER_ID;
    wrap.className = "enginuity-loader";
    wrap.setAttribute("role", "status");
    wrap.setAttribute("aria-live", "polite");
    wrap.setAttribute("aria-busy", "false");
    wrap.innerHTML =
      '<img class="enginuity-loader__logo" src="assets/logo.svg" alt="" width="104" height="90" />' +
      '<p class="enginuity-loader__tagline">Turning dreams into a reality....</p>' +
      '<div class="enginuity-loader__bottom">' +
      GEAR_SVG +
      '<span class="enginuity-loader__dots">····</span>' +
      "</div>";

    document.body.appendChild(wrap);
    return wrap;
  }

  function showLoader() {
    var loader = ensureLoader();
    loader.classList.add("is-active");
    loader.setAttribute("aria-busy", "true");
    document.body.style.overflow = "hidden";
  }

  function shouldInterceptAnchor(a, e) {
    if (!a || !a.getAttribute) return false;
    if (a.getAttribute("data-no-loader") === "true") return false;
    if (e.defaultPrevented) return false;
    if (e.button !== 0) return false;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
    if (a.target === "_blank") return false;
    var href = a.getAttribute("href");
    if (!href || href === "#" || href.startsWith("javascript:")) return false;
    if (/^https?:\/\//i.test(href)) return false;
    if (href.startsWith("mailto:") || href.startsWith("tel:")) return false;
    if (!/\.html(\?|#|$)/i.test(href) && !/^[^/]+\.html$/i.test(href.split("?")[0].split("#")[0]))
      return false;
    return true;
  }

  document.addEventListener(
    "click",
    function (e) {
      var a = e.target.closest && e.target.closest("a[href]");
      if (!shouldInterceptAnchor(a, e)) return;
      e.preventDefault();
      showLoader();
      var url = a.href;
      window.setTimeout(function () {
        window.location.href = url;
      }, 420);
    },
    true
  );
})();
