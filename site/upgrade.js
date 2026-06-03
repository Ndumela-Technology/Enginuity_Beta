// Global Upgrade button + pricing modal (localStorage only; Stripe-ready).
(function () {
  "use strict";

  var EXCLUDED_PAGES = ["tutorial.html", "sign-in.html"];

  var PLAN_FEATURES = {
    free: [
      "Limited Apprentice & Associate builds",
      "Up to 5 saved projects",
      "Basic SparkHelper access",
      "2 visual diagrams"
    ],
    builder: [
      "Unlimited Apprentice",
      "Unlimited Associate",
      "5 Innovator uses per month (resets monthly)",
      "5 saved projects",
      "10 visual diagrams",
      "Unlimited SparkHelper"
    ],
    pro: [
      "Unlimited everything",
      "Unlimited Innovator access",
      "Unlimited diagrams",
      "15 saved projects",
      "Beta access & early updates"
    ]
  };

  var PRICES = {
    builder: { monthly: "€5.99/month", yearly: "€59.99/year" },
    pro: { monthly: "€7.99/month", yearly: "€79.99/year" }
  };

  var billingCycle = "monthly";
  var modalEl = null;

  function currentPageName() {
    var path = window.location.pathname || "";
    var parts = path.split("/");
    return parts[parts.length - 1] || "index.html";
  }

  function shouldShowUpgrade() {
    return EXCLUDED_PAGES.indexOf(currentPageName()) === -1;
  }

  function planIdForTier(tier, cycle) {
    if (tier === "free") return "free";
    return tier + "_" + (cycle === "yearly" ? "yearly" : "monthly");
  }

  function mountButton() {
    if (document.querySelector(".eng-upgrade-btn")) return;

    var mount = document.querySelector(".eng-upgrade-mount");
    if (!mount) {
      mount = document.createElement("div");
      mount.className = "eng-upgrade-mount";
      var headerRight = document.querySelector(".site-header .header-right");
      if (headerRight) {
        headerRight.insertBefore(mount, headerRight.firstChild);
      } else {
        var container = document.querySelector(".container, .saved-page, .profile-page");
        if (container) {
          var back = container.querySelector(".back, .saved-page__back, .profile-page__back");
          if (back && back.parentNode) {
            back.parentNode.insertBefore(mount, back.nextSibling);
          } else {
            container.insertBefore(mount, container.firstChild);
          }
        } else {
          mount.style.cssText = "position:fixed;top:12px;right:12px;z-index:9000;";
          document.body.appendChild(mount);
          return finishMount(mount);
        }
      }
    }

    finishMount(mount);
  }

  function finishMount(mount) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "eng-upgrade-btn";
    btn.textContent = "Upgrade";
    btn.setAttribute("aria-haspopup", "dialog");
    btn.addEventListener("click", openUpgradeModal);
    mount.appendChild(btn);
  }

  function buildModal() {
    if (modalEl) return modalEl;

    modalEl = document.createElement("div");
    modalEl.className = "eng-upgrade-modal";
    modalEl.setAttribute("role", "dialog");
    modalEl.setAttribute("aria-modal", "true");
    modalEl.setAttribute("aria-label", "Choose your plan");
    modalEl.innerHTML =
      '<div class="eng-upgrade-modal__card">' +
      '<div class="eng-upgrade-modal__head">' +
      '<div><h2>Choose your plan</h2><p class="eng-upgrade-modal__sub">Switch anytime. Payments coming soon.</p></div>' +
      '<button type="button" class="eng-upgrade-modal__close" aria-label="Close">&times;</button>' +
      "</div>" +
      '<div class="eng-upgrade-billing-toggle" role="tablist" aria-label="Billing period">' +
      '<button type="button" data-cycle="monthly" class="is-active">Monthly</button>' +
      '<button type="button" data-cycle="yearly">Yearly</button>' +
      "</div>" +
      '<div class="eng-upgrade-plans" id="engUpgradePlans"></div>' +
      "</div>";

    modalEl.querySelector(".eng-upgrade-modal__close").addEventListener("click", closeUpgradeModal);
    modalEl.addEventListener("click", function (e) {
      if (e.target === modalEl) closeUpgradeModal();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modalEl && modalEl.classList.contains("is-open")) {
        closeUpgradeModal();
      }
    });

    var toggle = modalEl.querySelector(".eng-upgrade-billing-toggle");
    toggle.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        billingCycle = btn.getAttribute("data-cycle") || "monthly";
        toggle.querySelectorAll("button").forEach(function (b) {
          b.classList.toggle("is-active", b === btn);
        });
        renderPlanCards();
      });
    });

    document.body.appendChild(modalEl);
    return modalEl;
  }

  function renderPlanCards() {
    var root = document.getElementById("engUpgradePlans");
    if (!root) return;

    var currentPlan =
      typeof window.getUserPlan === "function" ? window.getUserPlan() : "free";

    var tiers = [
      { tier: "free", title: "Free", price: "€0" },
      { tier: "builder", title: "Builder", price: PRICES.builder[billingCycle], recommended: true },
      { tier: "pro", title: "Pro", price: PRICES.pro[billingCycle] }
    ];

    root.innerHTML = tiers
      .map(function (item) {
        var planId = planIdForTier(item.tier, billingCycle);
        var isCurrent = currentPlan === planId;

        var badge = "";
        if (item.recommended) {
          badge += '<span class="eng-upgrade-plan__badge">Recommended</span>';
        }
        if (isCurrent) {
          badge += '<span class="eng-upgrade-plan__badge eng-upgrade-plan__badge--current">Current</span>';
        }

        var features = (PLAN_FEATURES[item.tier] || [])
          .map(function (f) {
            return "<li>" + f + "</li>";
          })
          .join("");

        var selectLabel = isCurrent ? "Current plan" : "Select plan";
        var disabled = isCurrent ? " disabled" : "";

        return (
          '<article class="eng-upgrade-plan' +
          (isCurrent ? " is-current" : "") +
          (item.recommended ? " is-recommended" : "") +
          '" data-plan-id="' +
          planId +
          '">' +
          badge +
          "<h3>" +
          item.title +
          "</h3>" +
          '<p class="eng-upgrade-plan__price">' +
          item.price +
          "</p>" +
          "<ul>" +
          features +
          "</ul>" +
          '<button type="button" class="eng-upgrade-plan__select"' +
          disabled +
          ">" +
          selectLabel +
          "</button>" +
          "</article>"
        );
      })
      .join("");

    root.querySelectorAll(".eng-upgrade-plan__select").forEach(function (btn) {
      if (btn.disabled) return;
      btn.addEventListener("click", function () {
        var card = btn.closest(".eng-upgrade-plan");
        var planId = card && card.getAttribute("data-plan-id");
        if (!planId) return;
        if (typeof window.setUserPlan === "function") {
          window.setUserPlan(planId);
        } else {
          localStorage.setItem("user_plan", planId);
        }
        document.dispatchEvent(
          new CustomEvent("enginuity:plan-changed", { detail: { plan: planId } })
        );
        renderPlanCards();
        closeUpgradeModal();
      });
    });
  }

  function syncBillingToggleFromPlan() {
    var current =
      typeof window.getUserPlan === "function" ? window.getUserPlan() : "free";
    if (current.indexOf("_yearly") !== -1) {
      billingCycle = "yearly";
    } else if (current.indexOf("_monthly") !== -1) {
      billingCycle = "monthly";
    } else {
      billingCycle = "monthly";
    }
    if (!modalEl) return;
    var toggle = modalEl.querySelector(".eng-upgrade-billing-toggle");
    if (!toggle) return;
    toggle.querySelectorAll("button").forEach(function (btn) {
      var cycle = btn.getAttribute("data-cycle") || "monthly";
      btn.classList.toggle("is-active", cycle === billingCycle);
    });
  }

  function openUpgradeModal() {
    buildModal();
    syncBillingToggleFromPlan();
    renderPlanCards();
    modalEl.classList.add("is-open");
    document.body.style.overflow = "hidden";
  }

  function closeUpgradeModal() {
    if (!modalEl) return;
    modalEl.classList.remove("is-open");
    document.body.style.overflow = "";
  }

  function init() {
    if (!shouldShowUpgrade()) return;
    mountButton();
  }

  window.openUpgradeModal = openUpgradeModal;
  window.closeUpgradeModal = closeUpgradeModal;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
