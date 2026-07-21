// Shared API base URL (override via <meta name="enginuity-api-base" content="...">).
(function () {
  "use strict";

  function resolveApiBase() {
    var meta = document.querySelector('meta[name="enginuity-api-base"]');
    if (meta && meta.content) {
      return String(meta.content).trim().replace(/\/$/, "");
    }
    var host = window.location.hostname;
    var protocol = window.location.protocol || "";
    if (
      !host ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      protocol === "file:"
    ) {
      return "http://127.0.0.1:8000";
    }
    return "https://enginuity-cpl1.onrender.com";
  }

  window.ENGINUITY_API_BASE = resolveApiBase();
})();
