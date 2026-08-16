// Shared API base URL (override via <meta name="enginuity-api-base" content="...">).
(function () {
  "use strict";

  var REMOTE_API_BASE = "https://enginuity-beta.onrender.com";

  function isLocalApiBase(base) {
    var b = String(base || "");
    return b.indexOf("127.0.0.1") !== -1 || b.indexOf("localhost") !== -1;
  }

  function formatFetchError(err) {
    var msg = err && err.message ? err.message : String(err);
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
      return new Error(
        "Could not reach the Enginuity API at https://enginuity-beta.onrender.com. Check your internet connection."
      );
    }
    return err instanceof Error ? err : new Error(msg);
  }

  function resolveApiBase() {
    var meta = document.querySelector('meta[name="enginuity-api-base"]');
    if (meta && meta.content) {
      return String(meta.content).trim().replace(/\/$/, "");
    }
    var host = window.location.hostname;
    var protocol = window.location.protocol || "";
    if (protocol === "file:") {
      return REMOTE_API_BASE;
    }
    if (!host || host === "localhost" || host === "127.0.0.1") {
      return REMOTE_API_BASE;
    }
    return REMOTE_API_BASE;
  }

  function postJson(base, path, body) {
    return fetch(String(base).replace(/\/$/, "") + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  function enginuityPostJson(path, body) {
    var primary = window.ENGINUITY_API_BASE || REMOTE_API_BASE;
    var usedFallback = false;

    function attempt(base) {
      return postJson(base, path, body);
    }

    return attempt(primary)
      .catch(function (err) {
        if (isLocalApiBase(primary) && primary !== REMOTE_API_BASE) {
          usedFallback = true;
          return attempt(REMOTE_API_BASE);
        }
        throw formatFetchError(err);
      })
      .then(function (res) {
        if (
          res &&
          res.status === 404 &&
          !usedFallback &&
          isLocalApiBase(primary) &&
          primary !== REMOTE_API_BASE
        ) {
          usedFallback = true;
          return attempt(REMOTE_API_BASE);
        }
        return res;
      })
      .then(function (res) {
        if (!res.ok) {
          return res
            .json()
            .catch(function () {
              return {};
            })
            .then(function (data) {
              var msg =
                (data && (data.error || data.detail)) ||
                "Server returned " + res.status;
              if (typeof msg !== "string") {
                msg = "Server returned " + res.status;
              }
              throw new Error(msg);
            });
        }
        return res.json();
      });
  }

  window.ENGINUITY_REMOTE_API_BASE = REMOTE_API_BASE;
  window.ENGINUITY_API_BASE = resolveApiBase();
  window.enginuityPostJson = enginuityPostJson;
  window.isEnginuityLocalApiBase = isLocalApiBase;
})();
