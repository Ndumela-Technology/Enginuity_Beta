// Sync signed-in users with the backend for admin analytics and roles.
(function () {
  "use strict";

  function apiBase() {
    return window.ENGINUITY_API_BASE || "";
  }

  function currentEmail() {
    return (localStorage.getItem("user_email") || "").trim();
  }

  function currentPlan() {
    if (typeof window.getUserPlan === "function") {
      return window.getUserPlan() || "free";
    }
    return localStorage.getItem("user_plan") || "free";
  }

  function currentName() {
    return (localStorage.getItem("user_name") || "").trim();
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
    }).catch(function () {
      return null;
    });
  }

  function applyPreferencesFromUser(user) {
    if (!user || !user.preferences) return;
    if (
      user.preferences.theme &&
      typeof window.applyEnginuityTheme === "function"
    ) {
      window.applyEnginuityTheme(user.preferences.theme);
    }
  }

  function syncCurrentUser(options) {
    options = options || {};
    var email = currentEmail();
    if (!email) return Promise.resolve(null);

    return postJson("/users/sync", {
      email: email,
      name: currentName(),
      plan: currentPlan(),
      preferences: { theme: currentTheme() }
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
    if (!email) return Promise.resolve(null);
    return postJson("/users/activity", {
      email: email,
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

  document.addEventListener("DOMContentLoaded", function () {
    if (currentEmail()) {
      syncCurrentUser();
      recordActivity("page_view", window.MODE || "");
    }
  });
})();
