// Theme preference — localStorage + account sync via auth-sync
(function () {
  "use strict";

  var THEME_KEY = "enginuity_theme";

  function normalizeTheme(value) {
    return value === "dark" ? "dark" : "light";
  }

  function getStoredTheme() {
    return normalizeTheme(localStorage.getItem(THEME_KEY));
  }

  function applyTheme(theme) {
    var next = normalizeTheme(theme);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(THEME_KEY, next);
    document.dispatchEvent(
      new CustomEvent("enginuity:theme-changed", { detail: { theme: next } })
    );
    return next;
  }

  function setTheme(theme, options) {
    options = options || {};
    var next = applyTheme(theme);
    if (!options.skipSync && typeof window.syncSparkTheme === "function") {
      window.syncSparkTheme(next);
    }
    return next;
  }

  function initTheme() {
    applyTheme(getStoredTheme());
  }

  if (document.documentElement) {
    initTheme();
  } else {
    document.addEventListener("DOMContentLoaded", initTheme);
  }

  window.getEnginuityTheme = getStoredTheme;
  window.setEnginuityTheme = setTheme;
  window.applyEnginuityTheme = applyTheme;
})();
