// Enginuity Beta feedback popup — after first Associate or Innovator session.
(function () {
  "use strict";

  var COMPLETED_KEY = "beta_feedback_completed";
  var RESPONSES_KEY = "beta_feedback_responses";
  var SNOOZE_AT_KEY = "beta_feedback_snooze_at_count";
  var LAST_SESSION_TYPE_KEY = "beta_feedback_last_session_type";
  var ASSOCIATE_SESSIONS_KEY = "beta_feedback_associate_sessions";
  var INNOVATOR_SESSIONS_KEY = "beta_feedback_innovator_sessions";

  var modalEl = null;
  var selectedRating = 0;
  var pendingSessionType = "Associate";
  var openTimer = null;

  function isBetaMode() {
    return typeof window.isBetaMode !== "function" || window.isBetaMode();
  }

  function alreadySubmitted() {
    return localStorage.getItem(COMPLETED_KEY) === "true";
  }

  function readCount(key) {
    var n = parseInt(localStorage.getItem(key), 10);
    return isNaN(n) || n < 0 ? 0 : n;
  }

  function writeCount(key, value) {
    localStorage.setItem(key, String(Math.max(0, value)));
  }

  function totalSessions() {
    return readCount(ASSOCIATE_SESSIONS_KEY) + readCount(INNOVATOR_SESSIONS_KEY);
  }

  function syncLegacySessionCounts() {
    if (typeof window.getAssociateBetaUses === "function") {
      var associateUses = window.getAssociateBetaUses();
      if (associateUses > readCount(ASSOCIATE_SESSIONS_KEY)) {
        writeCount(ASSOCIATE_SESSIONS_KEY, associateUses);
      }
    } else {
      var legacyAssociate = parseInt(localStorage.getItem("associate_beta_uses"), 10) || 0;
      if (legacyAssociate > readCount(ASSOCIATE_SESSIONS_KEY)) {
        writeCount(ASSOCIATE_SESSIONS_KEY, legacyAssociate);
      }
    }
    if (typeof window.getInnovatorBetaUses === "function") {
      var innovatorUses = window.getInnovatorBetaUses();
      if (innovatorUses > readCount(INNOVATOR_SESSIONS_KEY)) {
        writeCount(INNOVATOR_SESSIONS_KEY, innovatorUses);
      }
    }
  }

  function shouldOfferAfterSession() {
    if (!isBetaMode()) return false;
    if (alreadySubmitted()) return false;
    syncLegacySessionCounts();
    if (totalSessions() < 1) return false;

    var snoozeAt = parseInt(localStorage.getItem(SNOOZE_AT_KEY), 10);
    if (!isNaN(snoozeAt) && totalSessions() <= snoozeAt) {
      return false;
    }
    return true;
  }

  function getUserId() {
    return (
      localStorage.getItem("user_email") ||
      localStorage.getItem("enginuity_guest_id") ||
      ""
    );
  }

  function ensureGuestId() {
    if (localStorage.getItem("user_email")) return;
    if (localStorage.getItem("enginuity_guest_id")) return;
    localStorage.setItem(
      "enginuity_guest_id",
      "guest-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8)
    );
  }

  function buildModal() {
    if (modalEl) return modalEl;

    modalEl = document.createElement("div");
    modalEl.className = "eng-beta-feedback-modal";
    modalEl.setAttribute("role", "dialog");
    modalEl.setAttribute("aria-modal", "true");
    modalEl.setAttribute("aria-label", "Help us improve Enginuity");
    modalEl.innerHTML =
      '<div class="eng-beta-feedback-modal__card" id="engBetaFeedbackCard"></div>';

    modalEl.addEventListener("click", function (e) {
      if (e.target === modalEl) {
        deferFeedback();
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modalEl && modalEl.classList.contains("is-open")) {
        deferFeedback();
      }
    });

    document.body.appendChild(modalEl);
    return modalEl;
  }

  function renderForm() {
    selectedRating = 0;
    var card = document.getElementById("engBetaFeedbackCard");
    if (!card) return;

    card.innerHTML =
      '<h2 class="eng-beta-feedback-modal__title">Help us improve Enginuity</h2>' +
      '<p class="eng-beta-feedback-modal__lead">Thank you for trying Enginuity Beta. We\'d love to hear about your experience. Your feedback helps us improve the platform before launch.</p>' +
      '<div class="eng-beta-feedback-stars" role="group" aria-label="Star rating">' +
      [1, 2, 3, 4, 5]
        .map(function (n) {
          return (
            '<button type="button" class="eng-beta-feedback-star" data-star="' +
            n +
            '" aria-label="' +
            n +
            " star" +
            (n === 1 ? "" : "s") +
            '">★</button>'
          );
        })
        .join("") +
      "</div>" +
      '<div class="eng-beta-feedback-field">' +
      '<label class="eng-beta-feedback-sr" for="engBetaComment">Feedback</label>' +
      '<textarea id="engBetaComment" maxlength="4000" placeholder="Tell us what worked well or what we could improve..."></textarea>' +
      "</div>" +
      '<div class="eng-beta-feedback-actions">' +
      '<button type="button" class="eng-beta-feedback-submit" id="engBetaSubmit">Submit Feedback</button>' +
      '<button type="button" class="eng-beta-feedback-later" id="engBetaLater">Maybe Later</button>' +
      "</div>";

    wireStars();
    var submit = document.getElementById("engBetaSubmit");
    var later = document.getElementById("engBetaLater");
    if (submit) submit.addEventListener("click", submitFeedback);
    if (later) later.addEventListener("click", deferFeedback);
  }

  function wireStars() {
    var stars = modalEl.querySelectorAll(".eng-beta-feedback-star");
    stars.forEach(function (btn) {
      btn.addEventListener("mouseenter", function () {
        paintStars(parseInt(btn.getAttribute("data-star"), 10), true);
      });
      btn.addEventListener("mouseleave", function () {
        paintStars(selectedRating, false);
      });
      btn.addEventListener("click", function () {
        selectedRating = parseInt(btn.getAttribute("data-star"), 10) || 0;
        paintStars(selectedRating, false);
      });
    });
  }

  function paintStars(n, hover) {
    modalEl.querySelectorAll(".eng-beta-feedback-star").forEach(function (btn) {
      var value = parseInt(btn.getAttribute("data-star"), 10);
      btn.classList.toggle("is-active", value <= selectedRating);
      btn.classList.toggle("is-hover", hover && value <= n);
    });
  }

  function buildFeedbackRecord(comment) {
    ensureGuestId();
    return {
      user_id: getUserId() || "anonymous",
      session_type: pendingSessionType || "Associate",
      rating: selectedRating,
      feedback: String(comment || "").trim(),
      timestamp: new Date().toISOString()
    };
  }

  function saveFeedbackLocally(record) {
    try {
      var existing = JSON.parse(localStorage.getItem(RESPONSES_KEY) || "[]");
      if (!Array.isArray(existing)) existing = [];
      existing.push(record);
      localStorage.setItem(RESPONSES_KEY, JSON.stringify(existing));
    } catch (_) {
      localStorage.setItem(RESPONSES_KEY, JSON.stringify([record]));
    }
  }

  function postFeedbackToBackend(record) {
    var apiBase = window.ENGINUITY_API_BASE || "";
    if (!apiBase) return;
    try {
      fetch(apiBase + "/beta-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record)
      }).catch(function () {});
    } catch (_) {}
  }

  function submitFeedback() {
    var commentEl = document.getElementById("engBetaComment");
    var record = buildFeedbackRecord(commentEl ? commentEl.value : "");
    saveFeedbackLocally(record);
    postFeedbackToBackend(record);
    localStorage.setItem(COMPLETED_KEY, "true");
    localStorage.removeItem(SNOOZE_AT_KEY);
    closeModal();
  }

  function deferFeedback() {
    // Close for now; show again after the next completed Associate/Innovator session.
    localStorage.setItem(SNOOZE_AT_KEY, String(totalSessions()));
    closeModal();
  }

  function closeModal() {
    if (!modalEl) return;
    modalEl.classList.remove("is-open");
    document.body.style.overflow = "";
  }

  function openFeedbackModal(force) {
    if (!force && !isBetaMode()) return false;
    if (!force && alreadySubmitted()) return false;
    if (!force && !shouldOfferAfterSession()) return false;

    pendingSessionType =
      localStorage.getItem(LAST_SESSION_TYPE_KEY) || pendingSessionType || "Associate";

    buildModal();
    renderForm();
    // Force reflow so CSS enter animation runs.
    void modalEl.offsetWidth;
    modalEl.classList.add("is-open");
    document.body.style.overflow = "hidden";
    return true;
  }

  function maybeShowFeedback() {
    if (!shouldOfferAfterSession()) return;
    if (
      document.querySelector(
        ".eng-upgrade-modal.is-open, .onboarding-modal.is-open, .eng-beta-feedback-modal.is-open"
      )
    ) {
      return;
    }
    openFeedbackModal(false);
  }

  function scheduleFeedbackPrompt(sessionType) {
    pendingSessionType = sessionType || "Associate";
    localStorage.setItem(LAST_SESSION_TYPE_KEY, pendingSessionType);
    if (openTimer) clearTimeout(openTimer);
    // After the session UI has settled — never mid-generation.
    openTimer = setTimeout(maybeShowFeedback, 700);
  }

  function recordBetaSessionCompleted(sessionType) {
    if (!isBetaMode()) return;
    if (alreadySubmitted()) return;

    var type = String(sessionType || "").toLowerCase();
    var normalized = type.indexOf("innovator") !== -1 ? "Innovator" : "Associate";

    if (normalized === "Innovator") {
      writeCount(INNOVATOR_SESSIONS_KEY, readCount(INNOVATOR_SESSIONS_KEY) + 1);
    } else {
      writeCount(ASSOCIATE_SESSIONS_KEY, readCount(ASSOCIATE_SESSIONS_KEY) + 1);
    }

    localStorage.setItem(LAST_SESSION_TYPE_KEY, normalized);
    scheduleFeedbackPrompt(normalized);
  }

  function isSignedIn() {
    return !!(localStorage.getItem("user_email") || "").trim();
  }

  function mountFeedbackButton() {
    var existing = document.querySelector(".eng-beta-feedback-btn");
    if (existing) return existing;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "eng-beta-feedback-btn";
    btn.setAttribute("aria-label", "Give feedback");
    btn.textContent = "Feedback";
    btn.hidden = true;
    btn.addEventListener("click", function () {
      openFeedbackModal(true);
    });
    document.body.appendChild(btn);
    return btn;
  }

  function syncFeedbackButton() {
    var btn = document.querySelector(".eng-beta-feedback-btn");
    if (!isSignedIn()) {
      if (btn) btn.hidden = true;
      return;
    }
    btn = mountFeedbackButton();
    if (btn) btn.hidden = false;
  }

  function watchAuthChanges() {
    document.addEventListener("enginuity:auth-changed", syncFeedbackButton);
    document.addEventListener("enginuity:identity-changed", syncFeedbackButton);
    window.addEventListener("storage", function (e) {
      if (!e.key || e.key === "user_email") syncFeedbackButton();
    });

    var originalSetItem = localStorage.setItem.bind(localStorage);
    var originalRemoveItem = localStorage.removeItem.bind(localStorage);
    localStorage.setItem = function (key, value) {
      originalSetItem(key, value);
      if (key === "user_email") syncFeedbackButton();
    };
    localStorage.removeItem = function (key) {
      originalRemoveItem(key);
      if (key === "user_email") syncFeedbackButton();
    };
  }

  function init() {
    syncFeedbackButton();
    watchAuthChanges();
  }

  window.openBetaFeedbackModal = openFeedbackModal;
  window.maybeShowBetaFeedback = maybeShowFeedback;
  window.recordBetaSessionCompleted = recordBetaSessionCompleted;
  window.shouldOfferBetaFeedback = shouldOfferAfterSession;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
