// User plan system (localStorage). Manual test: localStorage.setItem("user_plan", "free"|"builder"|"pro")
(function () {
  "use strict";

  var PLAN_KEY = "user_plan";
  var VALID_PLANS = ["free", "builder", "pro"];

  var USAGE_KEYS = {
    associate: "enginuity_usage_associate",
    apprenticeGen: "enginuity_usage_apprentice_gen",
    diagram: "enginuity_usage_diagram",
    sparkHelper: "enginuity_usage_sparkhelper"
  };

  var PLAN_LIMITS = {
    free: {
      associateUses: 3,
      maxSavedProjects: 5,
      maxDiagramUses: 2,
      sparkHelperUses: 5,
      apprenticeGenerations: 5
    },
    builder: {
      associateUses: null,
      maxSavedProjects: 15,
      maxDiagramUses: 10,
      sparkHelperUses: null,
      apprenticeGenerations: null
    },
    pro: {
      associateUses: null,
      maxSavedProjects: null,
      maxDiagramUses: null,
      sparkHelperUses: null,
      apprenticeGenerations: null
    }
  };

  function getUserPlan() {
    var plan = localStorage.getItem(PLAN_KEY);
    if (VALID_PLANS.indexOf(plan) === -1) {
      setUserPlan("free");
      return "free";
    }
    return plan;
  }

  function setUserPlan(plan) {
    var normalized = String(plan || "").toLowerCase();
    if (VALID_PLANS.indexOf(normalized) === -1) {
      return false;
    }
    localStorage.setItem(PLAN_KEY, normalized);
    return true;
  }

  function bypassAllLimits() {
    return getUserPlan() === "pro";
  }

  function getLimitsForPlan(plan) {
    return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  }

  function getCurrentLimits() {
    return getLimitsForPlan(getUserPlan());
  }

  function readUsageCount(key) {
    var raw = localStorage.getItem(key);
    var n = parseInt(raw, 10);
    return isNaN(n) || n < 0 ? 0 : n;
  }

  function writeUsageCount(key, value) {
    localStorage.setItem(key, String(Math.max(0, value)));
  }

  function isUnlimited(limitValue) {
    return limitValue == null || limitValue === Infinity;
  }

  function limitReachedMessage(featureLabel, plan) {
    if (plan === "free") {
      return (
        featureLabel +
        " limit reached on the Free plan. Upgrade to Builder or Pro for more access."
      );
    }
    if (plan === "builder") {
      return (
        featureLabel +
        " limit reached on the Builder plan. Upgrade to Pro for unlimited access."
      );
    }
    return featureLabel + " limit reached.";
  }

  function checkUsageLimit(usageKey, maxUses, featureLabel) {
    if (bypassAllLimits()) {
      return { allowed: true };
    }
    if (isUnlimited(maxUses)) {
      return { allowed: true };
    }
    var used = readUsageCount(usageKey);
    if (used >= maxUses) {
      return {
        allowed: false,
        message: limitReachedMessage(featureLabel, getUserPlan()),
        used: used,
        max: maxUses
      };
    }
    return { allowed: true, used: used, max: maxUses };
  }

  function recordUsage(usageKey) {
    if (bypassAllLimits()) return;
    writeUsageCount(usageKey, readUsageCount(usageKey) + 1);
  }

  function countSavedProjectsForEmail(email) {
    if (!email) return 0;
    try {
      var allSaved = JSON.parse(localStorage.getItem("saved_projects")) || {};
      var list = allSaved[email];
      return Array.isArray(list) ? list.length : 0;
    } catch {
      return 0;
    }
  }

  function canSaveProject(email) {
    if (bypassAllLimits()) {
      return { allowed: true };
    }
    var limits = getCurrentLimits();
    var max = limits.maxSavedProjects;
    if (isUnlimited(max)) {
      return { allowed: true };
    }
    var resolvedEmail =
      email ||
      (typeof localStorage !== "undefined"
        ? localStorage.getItem("user_email") || ""
        : "");
    var count = countSavedProjectsForEmail(resolvedEmail);
    if (count >= max) {
      return {
        allowed: false,
        message:
          "Save limit reached (" +
          max +
          " project" +
          (max === 1 ? "" : "s") +
          " on " +
          getUserPlan() +
          " plan). Upgrade for more saves.",
        used: count,
        max: max
      };
    }
    return { allowed: true, used: count, max: max };
  }

  function canUseAssociate() {
    var limits = getCurrentLimits();
    return checkUsageLimit(
      USAGE_KEYS.associate,
      limits.associateUses,
      "Associate mode"
    );
  }

  function recordAssociateUse() {
    recordUsage(USAGE_KEYS.associate);
  }

  function canUseApprenticeGeneration() {
    var limits = getCurrentLimits();
    return checkUsageLimit(
      USAGE_KEYS.apprenticeGen,
      limits.apprenticeGenerations,
      "Project generation"
    );
  }

  function recordApprenticeGeneration() {
    recordUsage(USAGE_KEYS.apprenticeGen);
  }

  function canUseDiagram() {
    var limits = getCurrentLimits();
    return checkUsageLimit(
      USAGE_KEYS.diagram,
      limits.maxDiagramUses,
      "Diagram generation"
    );
  }

  function recordDiagramUse() {
    recordUsage(USAGE_KEYS.diagram);
  }

  function canUseSparkHelper() {
    var limits = getCurrentLimits();
    return checkUsageLimit(
      USAGE_KEYS.sparkHelper,
      limits.sparkHelperUses,
      "SparkHelper"
    );
  }

  function recordSparkHelperUse() {
    recordUsage(USAGE_KEYS.sparkHelper);
  }

  function applyFreePlanDefaults() {
    getUserPlan();
  }

  applyFreePlanDefaults();

  window.getUserPlan = getUserPlan;
  window.setUserPlan = setUserPlan;
  window.bypassAllLimits = bypassAllLimits;
  window.getCurrentPlanLimits = getCurrentLimits;
  window.canSaveProject = canSaveProject;
  window.canUseAssociate = canUseAssociate;
  window.recordAssociateUse = recordAssociateUse;
  window.canUseApprenticeGeneration = canUseApprenticeGeneration;
  window.recordApprenticeGeneration = recordApprenticeGeneration;
  window.canUseDiagram = canUseDiagram;
  window.recordDiagramUse = recordDiagramUse;
  window.canUseSparkHelper = canUseSparkHelper;
  window.recordSparkHelperUse = recordSparkHelperUse;
})();
