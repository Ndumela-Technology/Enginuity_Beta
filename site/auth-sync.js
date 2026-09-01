// Sync signed-in users with the backend for admin analytics and roles.
(function () {
  "use strict";

  function apiBase() {
    var base = window.ENGINUITY_API_BASE || "https://enginuity-beta.onrender.com";
    return String(base).replace(/\/$/, "");
  }

  function currentEmail() {
    return (localStorage.getItem("user_email") || "").trim();
  }

  function ensureGuestId() {
    if (currentEmail()) return "";
    var existing = (localStorage.getItem("enginuity_guest_id") || "").trim();
    if (existing) return existing;
    var id = "guest-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    localStorage.setItem("enginuity_guest_id", id);
    return id;
  }

  function currentGuestId() {
    return ensureGuestId();
  }

  function currentPlan() {
    if (typeof window.getUserPlan === "function") {
      return window.getUserPlan() || "free";
    }
    return localStorage.getItem("user_plan") || "free";
  }

  function currentName() {
    return getDisplayName();
  }

  function getDisplayName() {
    return (
      localStorage.getItem("user_display_name") ||
      localStorage.getItem("user_name") ||
      ""
    ).trim();
  }

  function getGamertag() {
    return (localStorage.getItem("user_gamertag") || "").trim().replace(/^@+/, "");
  }

  function normalizeGamertag(value) {
    return String(value || "")
      .trim()
      .replace(/^@+/, "")
      .replace(/[^a-zA-Z0-9_]/g, "")
      .slice(0, 16);
  }

  function applyIdentityFromUser(user) {
    if (!user) return;
    var prefs = user.preferences || {};
    var displayName = String(prefs.display_name || user.name || "").trim();
    var gamertag = normalizeGamertag(prefs.gamertag || "");
    if (displayName) {
      localStorage.setItem("user_display_name", displayName);
    }
    if (gamertag) {
      localStorage.setItem("user_gamertag", gamertag);
    } else if (prefs.gamertag === "") {
      localStorage.removeItem("user_gamertag");
    }
    document.dispatchEvent(new CustomEvent("enginuity:identity-changed"));
  }

  function saveUserIdentity(displayName, gamertag) {
    var name = String(displayName || "").trim().slice(0, 40);
    var tag = normalizeGamertag(gamertag);
    if (name) localStorage.setItem("user_display_name", name);
    else localStorage.removeItem("user_display_name");
    if (tag) localStorage.setItem("user_gamertag", tag);
    else localStorage.removeItem("user_gamertag");
    document.dispatchEvent(new CustomEvent("enginuity:identity-changed"));
    return syncCurrentUser({ skipThemeApply: true });
  }

  function currentTheme() {
    if (typeof window.getEnginuityTheme === "function") {
      return window.getEnginuityTheme();
    }
    return localStorage.getItem("enginuity_theme") === "dark" ? "dark" : "light";
  }

  function postJson(path, payload) {
    var base = apiBase();
    if (!base) return Promise.resolve(null);
    return fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    }).catch(function (err) {
      console.warn("[Spark] Could not reach API:", err && err.message ? err.message : err);
      return null;
    });
  }

  function applyPreferencesFromUser(user) {
    if (!user) return;
    applyIdentityFromUser(user);
    if (
      user.preferences &&
      user.preferences.theme &&
      typeof window.applyEnginuityTheme === "function"
    ) {
      window.applyEnginuityTheme(user.preferences.theme);
    }
  }

  function syncCurrentUser(options) {
    options = options || {};
    var email = currentEmail();
    var guestId = email ? "" : currentGuestId();
    if (!email && !guestId) return Promise.resolve(null);

    return postJson("/users/sync", {
      email: email,
      guest_id: guestId,
      name: currentName(),
      plan: currentPlan(),
      preferences: {
        theme: currentTheme(),
        display_name: getDisplayName(),
        gamertag: getGamertag()
      }
    }).then(function (response) {
      if (response && response.ok && typeof response.json === "function") {
        return response.json();
      }
      return null;
    }).then(function (result) {
      if (result && result.user && !options.skipThemeApply) {
        applyPreferencesFromUser(result.user);
      }
      return result;
    });
  }

  function syncSparkTheme(theme) {
    var email = currentEmail();
    if (!email) return Promise.resolve(null);
    return postJson("/users/preferences", {
      email: email,
      preferences: { theme: theme === "dark" ? "dark" : "light" }
    });
  }

  function recordActivity(eventType, mode) {
    var email = currentEmail();
    var guestId = email ? "" : currentGuestId();
    if (!email && !guestId) return Promise.resolve(null);
    return postJson("/users/activity", {
      email: email,
      guest_id: guestId,
      event_type: eventType || "activity",
      mode: mode || ""
    });
  }

  function fetchUserRole(email) {
    var base = apiBase();
    var targetEmail = (email || currentEmail() || "").trim();
    if (!base || !targetEmail) {
      return Promise.resolve({ is_admin: false, role: "user" });
    }

    return fetch(
      base + "/auth/role?email=" + encodeURIComponent(targetEmail)
    )
      .then(function (response) {
        if (!response.ok) throw new Error("role check failed (" + response.status + ")");
        return response.json();
      })
      .catch(function (err) {
        console.warn("[Spark] Could not verify admin role:", err && err.message ? err.message : err);
        return { is_admin: false, role: "user" };
      });
  }

  function revealAdminFromSyncResult(result) {
    if (!result || !result.user) return null;
    var role = result.user.role || "user";
    return {
      role: role,
      is_admin: role === "admin",
      user: result.user
    };
  }

  function checkAdminAccess(email) {
    email = (email || currentEmail() || "").trim();
    if (!email) {
      return Promise.resolve({ is_admin: false, role: "user" });
    }
    return syncCurrentUser().then(function (syncResult) {
      var fromSync = revealAdminFromSyncResult(syncResult);
      if (fromSync && fromSync.is_admin) return fromSync;
      return fetchUserRole(email);
    });
  }

  window.syncSparkUser = syncCurrentUser;
  window.syncSparkTheme = syncSparkTheme;
  window.recordSparkActivity = recordActivity;
  window.fetchSparkUserRole = fetchUserRole;
  window.checkSparkAdminAccess = checkAdminAccess;
  window.getUserDisplayName = getDisplayName;
  window.getUserGamertag = getGamertag;
  window.saveUserIdentity = saveUserIdentity;

  document.addEventListener("DOMContentLoaded", function () {
    syncCurrentUser();
    recordActivity("page_view", window.MODE || "");
  });
})();
