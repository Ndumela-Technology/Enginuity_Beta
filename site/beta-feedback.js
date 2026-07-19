// Enginuity Beta feedback modal (localStorage only — no backend).
(function () {
  "use strict";

  var COMPLETED_KEY = "beta_feedback_completed";
  var RESPONSES_KEY = "beta_feedback_responses";
  var DEFERRED_KEY = "beta_feedback_deferred";
  var modalEl = null;
  var selectedRating = 0;
  var showingThanks = false;

  function isBetaMode() {
    return typeof window.isBetaMode !== "function" || window.isBetaMode();
  }

  function alreadyCompleted() {
    return localStorage.getItem(COMPLETED_KEY) === "true";
  }

  function shouldShow() {
    if (!isBetaMode()) return false;
    if (alreadyCompleted()) return false;
    if (typeof window.shouldOfferBetaFeedback === "function") {
      return window.shouldOfferBetaFeedback();
    }
    return false;
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function buildModal() {
    if (modalEl) return modalEl;

    modalEl = document.createElement("div");
    modalEl.className = "eng-beta-feedback-modal";
    modalEl.setAttribute("role", "dialog");
    modalEl.setAttribute("aria-modal", "true");
    modalEl.setAttribute("aria-label", "Enginuity Beta feedback");
    modalEl.innerHTML =
      '<div class="eng-beta-feedback-modal__card" id="engBetaFeedbackCard"></div>';

    modalEl.addEventListener("click", function (e) {
      if (e.target === modalEl && !showingThanks) {
        deferFeedback();
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modalEl && modalEl.classList.contains("is-open")) {
        if (showingThanks) {
          closeModal();
        } else {
          deferFeedback();
        }
      }
    });

    document.body.appendChild(modalEl);
    return modalEl;
  }

  function renderForm() {
    selectedRating = 0;
    showingThanks = false;
    var card = document.getElementById("engBetaFeedbackCard");
    if (!card) return;

    card.innerHTML =
      '<h2 class="eng-beta-feedback-modal__title">🎉 Thank you for trying Enginuity Beta!</h2>' +
      '<p class="eng-beta-feedback-modal__lead">You\'ve completed the Enginuity Beta experience.</p>' +
      '<p class="eng-beta-feedback-modal__lead">Your feedback will directly influence the future of Enginuity before the commercial launch.</p>' +
      '<div class="eng-beta-feedback-stars" role="group" aria-label="Star rating">' +
      [1, 2, 3, 4, 5]
        .map(function (n) {
          return (
            '<button type="button" class="eng-beta-feedback-star" data-star="' +
            n +
            '" aria-label="' +
            n +
            ' star' +
            (n === 1 ? "" : "s") +
            '">★</button>'
          );
        })
        .join("") +
      "</div>" +
      '<div class="eng-beta-feedback-field">' +
      '<label for="engBetaEnjoy">1. What did you enjoy most?</label>' +
      '<textarea id="engBetaEnjoy" maxlength="2000"></textarea>' +
      "</div>" +
      '<div class="eng-beta-feedback-field">' +
      '<label for="engBetaImprove">2. What could be improved?</label>' +
      '<textarea id="engBetaImprove" maxlength="2000"></textarea>' +
      "</div>" +
      '<div class="eng-beta-feedback-field">' +
      '<label for="engBetaFeature">3. What feature would you most like to see added?</label>' +
      '<textarea id="engBetaFeature" maxlength="2000"></textarea>' +
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

  function submitFeedback() {
    var payload = {
      rating: selectedRating,
      enjoyMost: (document.getElementById("engBetaEnjoy") || {}).value || "",
      improve: (document.getElementById("engBetaImprove") || {}).value || "",
      featureWish: (document.getElementById("engBetaFeature") || {}).value || "",
      submittedAt: new Date().toISOString()
    };

    try {
      var existing = JSON.parse(localStorage.getItem(RESPONSES_KEY) || "[]");
      if (!Array.isArray(existing)) existing = [];
      existing.push(payload);
      localStorage.setItem(RESPONSES_KEY, JSON.stringify(existing));
    } catch (_) {
      localStorage.setItem(RESPONSES_KEY, JSON.stringify([payload]));
    }

    localStorage.setItem(COMPLETED_KEY, "true");
    localStorage.removeItem(DEFERRED_KEY);
    renderThanks();
  }

  function renderThanks() {
    showingThanks = true;
    var card = document.getElementById("engBetaFeedbackCard");
    if (!card) return;
    card.innerHTML =
      '<div class="eng-beta-feedback-thanks">' +
      "<h3>Thank you for helping shape Enginuity.</h3>" +
      "<p>Builder and Pro will launch after the Beta period with:</p>" +
      "<ul>" +
      "<li>Unlimited Associate</li>" +
      "<li>Unlimited Innovator</li>" +
      "<li>Unlimited Saved Projects</li>" +
      "<li>Early access to new features</li>" +
      "<li>Priority updates</li>" +
      "</ul>" +
      '<span class="eng-beta-feedback-coming" role="button" aria-disabled="true">Coming Soon</span>' +
      '<div class="eng-beta-feedback-actions" style="margin-top:1rem;">' +
      '<button type="button" class="eng-beta-feedback-later" id="engBetaCloseThanks">Close</button>' +
      "</div>" +
      "</div>";
    var closeBtn = document.getElementById("engBetaCloseThanks");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
  }

  function deferFeedback() {
    // "Only display once" — dismiss permanently without a written response.
    localStorage.setItem(COMPLETED_KEY, "true");
    localStorage.setItem(DEFERRED_KEY, String(Date.now()));
    try {
      var existing = JSON.parse(localStorage.getItem(RESPONSES_KEY) || "[]");
      if (!Array.isArray(existing)) existing = [];
      existing.push({ deferred: true, deferredAt: new Date().toISOString() });
      localStorage.setItem(RESPONSES_KEY, JSON.stringify(existing));
    } catch (_) {}
    closeModal();
  }

  function closeModal() {
    if (!modalEl) return;
    modalEl.classList.remove("is-open");
    document.body.style.overflow = "";
  }

  function openFeedbackModal(force) {
    if (!isBetaMode()) return false;
    if (alreadyCompleted()) return false;
    if (!force && !shouldShow()) return false;

    buildModal();
    renderForm();
    modalEl.classList.add("is-open");
    document.body.style.overflow = "hidden";
    return true;
  }

  function maybeShowFeedback() {
    if (!shouldShow()) return;
    // Avoid stacking over other open modals.
    if (document.querySelector(".eng-upgrade-modal.is-open, .onboarding-modal.is-open")) {
      return;
    }
    openFeedbackModal(false);
  }

  function init() {
    if (!isBetaMode()) return;

    document.addEventListener("enginuity:beta-milestone", function () {
      setTimeout(maybeShowFeedback, 400);
    });
    document.addEventListener("enginuity:usage-changed", function () {
      setTimeout(maybeShowFeedback, 400);
    });
    document.addEventListener("enginuity:project-saved", function () {
      setTimeout(maybeShowFeedback, 400);
    });

    setTimeout(maybeShowFeedback, 800);
  }

  window.openBetaFeedbackModal = openFeedbackModal;
  window.maybeShowBetaFeedback = maybeShowFeedback;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
