(function () {
  "use strict";

  var state = {
    overview: {},
    users: [],
    feedback: [],
    analytics: {},
    payments: {},
    settings: {}
  };

  function el(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatDate(value) {
    if (!value) return "—";
    var date = new Date(value);
    if (isNaN(date.getTime())) return escapeHtml(value);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  function stars(n) {
    var rating = Math.max(0, Math.min(5, parseInt(n, 10) || 0));
    return "★★★★★".slice(0, rating) + "☆☆☆☆☆".slice(0, 5 - rating);
  }

  function readLocalFeedback() {
    try {
      var raw = localStorage.getItem("beta_feedback_responses") || "[]";
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function apiBase() {
    return window.ENGINUITY_API_BASE || "http://127.0.0.1:8000";
  }

  function userEmail() {
    return (localStorage.getItem("user_email") || "").trim();
  }

  function setMeta(text) {
    var meta = el("adminMeta");
    if (meta) meta.textContent = text;
  }

  function switchPanel(panelId) {
    document.querySelectorAll(".admin-panel").forEach(function (panel) {
      panel.classList.toggle("is-active", panel.id === panelId);
    });
    document.querySelectorAll(".admin-nav__btn[data-panel]").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-panel") === panelId);
    });
  }

  function bindNav() {
    document.querySelectorAll(".admin-nav__btn[data-panel]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        switchPanel(btn.getAttribute("data-panel"));
      });
    });
    switchPanel("adminPanelOverview");
  }

  function fetchJson(path) {
    return fetch(apiBase() + path, {
      headers: {
        "X-User-Email": userEmail()
      }
    }).then(function (res) {
      if (!res.ok) throw new Error(path + " -> " + res.status);
      return res.json();
    });
  }

  function renderOverview() {
    var root = el("adminOverviewStats");
    if (!root) return;
    var overview = state.overview || {};
    var cards = [
      ["Total users", overview.total_users || 0],
      ["Active beta users", overview.active_beta_users || 0],
      ["Feedback submissions", overview.total_feedback || 0],
      ["Average feedback rating", overview.average_feedback_rating || 0],
      ["Total sessions completed", overview.total_sessions_completed || 0],
      ["Upgrade conversions", overview.upgrade_conversions || 0]
    ];
    root.innerHTML = cards
      .map(function (item) {
        return (
          '<article class="admin-stat">' +
          '<p class="admin-stat__label">' + escapeHtml(item[0]) + "</p>" +
          '<p class="admin-stat__value">' + escapeHtml(item[1]) + "</p>" +
          "</article>"
        );
      })
      .join("");
  }

  function renderUsers() {
    var tbody = el("adminUsersBody");
    if (!tbody) return;

    var query = ((el("adminUserSearch") && el("adminUserSearch").value) || "").trim().toLowerCase();
    var plan = ((el("adminUserPlanFilter") && el("adminUserPlanFilter").value) || "all").toLowerCase();

    var list = (state.users || []).filter(function (u) {
      var name = String(u.name || "").toLowerCase();
      var email = String(u.email || "").toLowerCase();
      var uPlan = String(u.plan || "free").toLowerCase();
      var matchesQuery = !query || name.indexOf(query) !== -1 || email.indexOf(query) !== -1;
      var matchesPlan = plan === "all" || uPlan === plan;
      return matchesQuery && matchesPlan;
    });

    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="8"><p class="admin-empty">No users found.</p></td></tr>';
      return;
    }

    tbody.innerHTML = list
      .map(function (u) {
        return (
          "<tr>" +
          "<td>" + escapeHtml(u.name || "—") + "</td>" +
          "<td>" + escapeHtml(u.email || "—") + "</td>" +
          "<td>" + escapeHtml(u.plan || "free") + "</td>" +
          "<td>" + formatDate(u.created_at) + "</td>" +
          "<td>" + formatDate(u.last_activity) + "</td>" +
          "<td>Synced on sign-in</td>" +
          "<td>" + escapeHtml((u.plan || "free") === "free" ? "Free" : "Active") + "</td>" +
          "<td>" + escapeHtml(u.role || "user") + "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function renderFeedback() {
    var root = el("adminFeedbackList");
    if (!root) return;

    var query = ((el("adminFeedbackSearch") && el("adminFeedbackSearch").value) || "").trim().toLowerCase();
    var rating = ((el("adminFeedbackRating") && el("adminFeedbackRating").value) || "all");
    var type = ((el("adminFeedbackType") && el("adminFeedbackType").value) || "all").toLowerCase();

    var list = (state.feedback || []).filter(function (item) {
      var text = String(item.feedback || "").toLowerCase();
      var user = String(item.user_id || "").toLowerCase();
      var matchesQuery = !query || text.indexOf(query) !== -1 || user.indexOf(query) !== -1;
      var matchesRating = rating === "all" || String(item.rating || 0) === rating;
      var matchesType = type === "all" || String(item.session_type || "").toLowerCase() === type;
      return matchesQuery && matchesRating && matchesType;
    });

    if (!list.length) {
      root.innerHTML = '<p class="admin-empty">No feedback submissions yet.</p>';
      return;
    }

    root.innerHTML = list
      .map(function (item) {
        return (
          '<article class="admin-feedback-card">' +
          '<p class="admin-feedback-card__stars">' + stars(item.rating) + "</p>" +
          '<p class="admin-feedback-card__meta"><strong>' + escapeHtml(item.user_id || "Anonymous") + "</strong> · " +
          escapeHtml(item.session_type || "Associate") + " · " + formatDate(item.timestamp) + "</p>" +
          '<p class="admin-feedback-card__text">"' + escapeHtml(item.feedback || "") + '"</p>' +
          "</article>"
        );
      })
      .join("");
  }

  function renderAnalytics() {
    var root = el("adminAnalyticsContent");
    if (!root) return;
    var analytics = state.analytics || {};
    var features = Array.isArray(analytics.most_used_features) ? analytics.most_used_features : [];
    root.innerHTML =
      '<div class="admin-grid">' +
      '<article class="admin-stat"><p class="admin-stat__label">Daily active users</p><p class="admin-stat__value">' + escapeHtml(analytics.daily_active_users || 0) + "</p></article>" +
      '<article class="admin-stat"><p class="admin-stat__label">Session completion rate</p><p class="admin-stat__value">' + escapeHtml(analytics.session_completion_rate || 0) + "%</p></article>" +
      '<article class="admin-stat"><p class="admin-stat__label">User retention</p><p class="admin-stat__value">' + escapeHtml(analytics.user_retention || 0) + "%</p></article>" +
      "</div>" +
      '<div class="admin-detail"><strong>Most used features</strong><ul>' +
      (features.length
        ? features.map(function (f) { return "<li>" + escapeHtml(f.feature) + ": " + escapeHtml(f.count) + "</li>"; }).join("")
        : "<li>No usage data yet</li>") +
      "</ul></div>";
  }

  function renderPayments() {
    var root = el("adminPaymentsContent");
    if (!root) return;
    var payments = state.payments || {};
    var subs = Array.isArray(payments.active_subscriptions) ? payments.active_subscriptions : [];
    root.innerHTML =
      '<div class="admin-grid">' +
      '<article class="admin-stat"><p class="admin-stat__label">Active subscriptions</p><p class="admin-stat__value">' + escapeHtml(subs.length) + "</p></article>" +
      '<article class="admin-stat"><p class="admin-stat__label">Upgrade conversions</p><p class="admin-stat__value">' + escapeHtml(payments.upgrade_conversions || 0) + "</p></article>" +
      "</div>" +
      '<div class="admin-detail"><strong>Revenue tracking</strong><p style="margin:0;">' +
      escapeHtml((payments.revenue_tracking && payments.revenue_tracking.message) || "Pending integration.") +
      "</p></div>";
  }

  function renderSettings() {
    var root = el("adminSettingsContent");
    if (!root) return;
    var settings = state.settings || {};
    root.innerHTML =
      '<div class="admin-detail">' +
      "<p><strong>Platform:</strong> " + escapeHtml(settings.platform_name || "Spark") + "</p>" +
      "<p><strong>Beta mode:</strong> " + escapeHtml(settings.beta_mode ? "Enabled" : "Disabled") + "</p>" +
      "<p><strong>Admin accounts configured:</strong> " + escapeHtml(settings.admin_accounts_configured || 0) + "</p>" +
      "</div>";
  }

  function bindFilters() {
    ["adminUserSearch", "adminUserPlanFilter"].forEach(function (id) {
      var input = el(id);
      if (!input) return;
      input.addEventListener("input", renderUsers);
      input.addEventListener("change", renderUsers);
    });
    ["adminFeedbackSearch", "adminFeedbackRating", "adminFeedbackType"].forEach(function (id) {
      var input = el(id);
      if (!input) return;
      input.addEventListener("input", renderFeedback);
      input.addEventListener("change", renderFeedback);
    });
  }

  function verifyAdmin() {
    var email = userEmail();
    if (!email) return Promise.resolve(false);

    if (typeof window.checkSparkAdminAccess === "function") {
      return window.checkSparkAdminAccess(email).then(function (info) {
        return Boolean(info && info.is_admin);
      });
    }

    return fetchJson("/auth/role?email=" + encodeURIComponent(email)).then(function (res) {
      return Boolean(res && res.is_admin);
    });
  }

  function loadData() {
    return Promise.allSettled([
      fetchJson("/admin/overview"),
      fetchJson("/admin/users"),
      fetchJson("/admin/feedback"),
      fetchJson("/admin/analytics"),
      fetchJson("/admin/payments"),
      fetchJson("/admin/settings")
    ]).then(function (results) {
      state.overview = results[0].status === "fulfilled" ? (results[0].value.overview || {}) : {};
      state.users = results[1].status === "fulfilled" ? (results[1].value.users || []) : [];
      state.feedback = results[2].status === "fulfilled"
        ? (results[2].value.feedback || [])
        : readLocalFeedback();
      state.analytics = results[3].status === "fulfilled" ? (results[3].value.analytics || {}) : {};
      state.payments = results[4].status === "fulfilled" ? (results[4].value.payments || {}) : {};
      state.settings = results[5].status === "fulfilled" ? (results[5].value.settings || {}) : {};

      renderOverview();
      renderUsers();
      renderFeedback();
      renderAnalytics();
      renderPayments();
      renderSettings();

      var failed = results.filter(function (r) { return r.status === "rejected"; }).length;
      if (failed > 0) {
        setMeta("Signed in as " + userEmail() + " · partial data loaded");
      } else {
        setMeta("Signed in as " + userEmail());
      }
    });
  }

  function showDenied(message) {
    document.body.innerHTML =
      '<div class="admin-denied">' +
      "<h1>Access denied</h1>" +
      "<p>" + escapeHtml(message) + "</p>" +
      '<p><a href="index.html">← Back to Home</a></p>' +
      "</div>";
  }

  function boot() {
    bindNav();
    bindFilters();
    setMeta("Checking admin access…");

    verifyAdmin()
      .then(function (ok) {
        if (!ok) {
          showDenied("Sign in with an admin account to access this dashboard.");
          return;
        }
        setMeta("Loading dashboard data…");
        return loadData();
      })
      .catch(function (err) {
        console.error("[Spark Admin] Boot failed:", err);
        setMeta("Unable to load dashboard");
      });
  }

  boot();
})();
