// User plan system (localStorage). Stripe-ready plan IDs.
(function () {
  "use strict";

  var PLAN_KEY = "user_plan";
  var ASSOCIATE_USES_KEY = "associate_uses";

  var VALID_PLAN_IDS = [
    "free",
    "builder_monthly",
    "builder_yearly",
    "pro_monthly",
    "pro_yearly"
  ];

  var LEGACY_PLAN_MAP = {
    builder: "builder_monthly",
    pro: "pro_monthly"
  };

  var USAGE_KEYS = {
    associate: "enginuity_usage_associate",
    apprenticeGen: "enginuity_usage_apprentice_gen",
    diagram: "enginuity_usage_diagram",
    sparkHelper: "enginuity_usage_sparkhelper"
  };

  var INNOVATOR_MONTHLY_KEY = "enginuity_innovator_monthly";

  var TIER_LIMITS = {
    free: {
      associateUses: 5,
      maxSavedProjects: 5,
      maxDiagramUses: 2,
      sparkHelperUses: 10,
      apprenticeGenerations: 5
    },
    builder: {
      associateUses: null,
      maxSavedProjects: 5,
      maxDiagramUses: 10,
      sparkHelperUses: null,
      apprenticeGenerations: null,
      innovatorUsesPerMonth: 5
    },
    pro: {
      associateUses: null,
      maxSavedProjects: 15,
      maxDiagramUses: null,
      sparkHelperUses: null,
      apprenticeGenerations: null
    }
  };

  function normalizePlanId(plan) {
    var normalized = String(plan || "").toLowerCase().trim();
    if (LEGACY_PLAN_MAP[normalized]) {
      normalized = LEGACY_PLAN_MAP[normalized];
    }
    if (VALID_PLAN_IDS.indexOf(normalized) === -1) {
      return "free";
    }
    return normalized;
  }

  function getUserPlan() {
    return normalizePlanId(localStorage.getItem(PLAN_KEY));
  }

  function setUserPlan(plan) {
    var normalized = normalizePlanId(plan);
    localStorage.setItem(PLAN_KEY, normalized);
    return normalized;
  }

  function getPlanTier(plan) {
    var id = normalizePlanId(plan || getUserPlan());
    if (id === "free") return "free";
    if (id.indexOf("builder_") === 0) return "builder";
    if (id.indexOf("pro_") === 0) return "pro";
    return "free";
  }

  function isFree() {
    return getPlanTier() === "free";
  }

  function isBuilder() {
    return getPlanTier() === "builder";
  }

  function isPro() {
    return getPlanTier() === "pro";
  }

  function bypassAllLimits() {
    return isPro();
  }

  function getPlanTierDisplayName(plan) {
    var tier = getPlanTier(plan);
    if (tier === "builder") return "Builder";
    if (tier === "pro") return "Pro";
    return "Free";
  }

  function getPlanDisplayName(plan) {
    var id = normalizePlanId(plan || getUserPlan());
    if (id === "free") return "Free";
    if (id === "builder_monthly") return "Builder (Monthly)";
    if (id === "builder_yearly") return "Builder (Yearly)";
    if (id === "pro_monthly") return "Pro (Monthly)";
    if (id === "pro_yearly") return "Pro (Yearly)";
    return "Free";
  }

  function getLimitsForTier(tier) {
    return TIER_LIMITS[tier] || TIER_LIMITS.free;
  }

  function getCurrentLimits() {
    return getLimitsForTier(getPlanTier());
  }

  function readUsageCount(key) {
    var raw = localStorage.getItem(key);
    var n = parseInt(raw, 10);
    return isNaN(n) || n < 0 ? 0 : n;
  }

  function writeUsageCount(key, value) {
    localStorage.setItem(key, String(Math.max(0, value)));
  }

  function readAssociateUses() {
    var count = readUsageCount(ASSOCIATE_USES_KEY);
    if (count === 0) {
      var legacy = readUsageCount(USAGE_KEYS.associate);
      if (legacy > 0) {
        writeUsageCount(ASSOCIATE_USES_KEY, legacy);
        count = legacy;
      }
    }
    return count;
  }

  function isUnlimited(limitValue) {
    return limitValue == null || limitValue === Infinity;
  }

  function limitReachedMessage(featureLabel, tier) {
    if (tier === "free") {
      return (
        featureLabel +
        " limit reached on the Free plan. Upgrade to Builder or Pro for more access."
      );
    }
    if (tier === "builder") {
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
        message: limitReachedMessage(featureLabel, getPlanTier()),
        used: used,
        max: maxUses
      };
    }
    return { allowed: true, used: used, max: maxUses };
  }

  function recordUsage(usageKey) {
    if (bypassAllLimits()) return;
    writeUsageCount(usageKey, readUsageCount(usageKey) + 1);
    document.dispatchEvent(new CustomEvent("enginuity:usage-changed"));
  }

  function countSavedProjectsForEmail(email) {
    if (!email) return 0;
    try {
      var allSaved = JSON.parse(localStorage.getItem("saved_projects")) || {};
      var list = allSaved[email];
      return Array.isArray(list) ? list.length : 0;
    } catch (_) {
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
          getPlanDisplayName() +
          "). Upgrade for more saves.",
        used: count,
        max: max
      };
    }
    return { allowed: true, used: count, max: max };
  }

  function canUseAssociate() {
    if (!isFree()) {
      return { allowed: true };
    }
    var used = readAssociateUses();
    var max = TIER_LIMITS.free.associateUses;
    if (used >= max) {
      return {
        allowed: false,
        message: "You've used your free builds. Upgrade to continue.",
        used: used,
        max: max
      };
    }
    return { allowed: true, used: used, max: max };
  }

  function recordAssociateUse() {
    if (bypassAllLimits()) return;
    if (!isFree()) return;
    writeUsageCount(ASSOCIATE_USES_KEY, readAssociateUses() + 1);
    writeUsageCount(USAGE_KEYS.associate, readAssociateUses());
    document.dispatchEvent(new CustomEvent("enginuity:usage-changed"));
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
    if (!bypassAllLimits()) {
      localStorage.setItem("diagram_uses", String(readUsageCount(USAGE_KEYS.diagram)));
    }
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

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function currentBillingPeriod() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1);
  }

  function nextMonthResetLabel() {
    var d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    var names = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December"
    ];
    return "Resets " + names[d.getMonth()] + " 1";
  }

  function readInnovatorMonthlyUsed() {
    if (!isBuilder()) {
      return 0;
    }
    try {
      var raw = JSON.parse(localStorage.getItem(INNOVATOR_MONTHLY_KEY) || "{}");
      if (raw.period !== currentBillingPeriod()) {
        return 0;
      }
      var used = parseInt(raw.used, 10);
      return isNaN(used) || used < 0 ? 0 : used;
    } catch (_) {
      return 0;
    }
  }

  function writeInnovatorMonthlyUsed(used) {
    localStorage.setItem(
      INNOVATOR_MONTHLY_KEY,
      JSON.stringify({
        period: currentBillingPeriod(),
        used: Math.max(0, used)
      })
    );
  }

  function getInnovatorMonthlyLimit() {
    if (isPro()) {
      return null;
    }
    if (isBuilder()) {
      return TIER_LIMITS.builder.innovatorUsesPerMonth;
    }
    return 0;
  }

  function getInnovatorMonthlyStatus() {
    if (isPro()) {
      return { allowed: true, unlimited: true, used: 0, max: null, remaining: null };
    }
    var max = getInnovatorMonthlyLimit();
    if (max === 0) {
      return {
        allowed: false,
        unlimited: false,
        used: 0,
        max: 0,
        remaining: 0,
        resetLabel: nextMonthResetLabel()
      };
    }
    var used = readInnovatorMonthlyUsed();
    var remaining = Math.max(0, max - used);
    return {
      allowed: remaining > 0,
      unlimited: false,
      used: used,
      max: max,
      remaining: remaining,
      resetLabel: nextMonthResetLabel()
    };
  }

  function canUseInnovator() {
    if (isPro()) {
      return { allowed: true };
    }
    var status = getInnovatorMonthlyStatus();
    if (!status.allowed) {
      var tier = getPlanTier();
      var message =
        tier === "free"
          ? "Innovator mode requires Builder or Pro. Upgrade to unlock it."
          : "You've used all " +
            status.max +
            " Innovator uses this month. " +
            status.resetLabel +
            ". Upgrade to Pro for unlimited Innovator access.";
      return {
        allowed: false,
        message: message,
        used: status.used,
        max: status.max,
        remaining: status.remaining,
        resetLabel: status.resetLabel
      };
    }
    return {
      allowed: true,
      used: status.used,
      max: status.max,
      remaining: status.remaining,
      resetLabel: status.resetLabel
    };
  }

  function recordInnovatorUse() {
    if (isPro()) {
      return;
    }
    if (!isBuilder()) {
      return;
    }
    var max = getInnovatorMonthlyLimit();
    if (max == null) {
      return;
    }
    writeInnovatorMonthlyUsed(readInnovatorMonthlyUsed() + 1);
    document.dispatchEvent(new CustomEvent("enginuity:usage-changed"));
  }

  function applyFreePlanDefaults() {
    getUserPlan();
  }

  function canAccessInnovator() {
    return canUseInnovator().allowed;
  }

  applyFreePlanDefaults();

  window.getUserPlan = getUserPlan;
  window.setUserPlan = setUserPlan;
  window.getPlanTier = getPlanTier;
  window.getPlanDisplayName = getPlanDisplayName;
  window.getPlanTierDisplayName = getPlanTierDisplayName;
  window.isFree = isFree;
  window.isBuilder = isBuilder;
  window.isPro = isPro;
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
  window.canAccessInnovator = canAccessInnovator;
  window.canUseInnovator = canUseInnovator;
  window.recordInnovatorUse = recordInnovatorUse;
  window.getInnovatorMonthlyStatus = getInnovatorMonthlyStatus;
})();
