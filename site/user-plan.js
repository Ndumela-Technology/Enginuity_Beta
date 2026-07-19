// User plan system (localStorage). Stripe-ready plan IDs.
// Enginuity Beta: public testing limits; paid tiers preserved for post-Beta launch.
(function () {
  "use strict";

  var PLAN_KEY = "user_plan";
  var ASSOCIATE_USES_KEY = "associate_uses";
  var ASSOCIATE_BETA_USES_KEY = "associate_beta_uses";
  var INNOVATOR_BETA_USES_KEY = "innovator_beta_uses";
  var INNOVATOR_BETA_COUNTED_KEY = "innovator_beta_counted_ids";
  var BETA_HAS_SAVED_KEY = "beta_has_saved";

  /** Public Beta period — paid purchases disabled in upgrade UI. */
  var BETA_MODE = true;
  var BETA_ASSOCIATE_MAX = 5;
  var BETA_INNOVATOR_LITE_MAX = 3;
  var BETA_SAVED_MAX = 2;

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

  // Free tier = Enginuity Beta experience limits.
  // Builder/Pro kept for post-Beta architecture (pricing UI still shows them).
  var TIER_LIMITS = {
    free: {
      associateUses: BETA_ASSOCIATE_MAX,
      maxSavedProjects: BETA_SAVED_MAX,
      maxDiagramUses: null,
      sparkHelperUses: null,
      apprenticeGenerations: null
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

  function isBetaMode() {
    return BETA_MODE;
  }

  function bypassAllLimits() {
    return isPro();
  }

  function getPlanTierDisplayName(plan) {
    var tier = getPlanTier(plan);
    if (tier === "builder") return "Builder";
    if (tier === "pro") return "Pro";
    return BETA_MODE ? "Beta" : "Free";
  }

  function getPlanDisplayName(plan) {
    var id = normalizePlanId(plan || getUserPlan());
    if (id === "free") return BETA_MODE ? "Enginuity Beta" : "Free";
    if (id === "builder_monthly") return "Builder (Monthly)";
    if (id === "builder_yearly") return "Builder (Yearly)";
    if (id === "pro_monthly") return "Pro (Monthly)";
    if (id === "pro_yearly") return "Pro (Yearly)";
    return BETA_MODE ? "Enginuity Beta" : "Free";
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

  function readAssociateBetaUses() {
    var count = readUsageCount(ASSOCIATE_BETA_USES_KEY);
    if (count === 0) {
      var legacyBeta = readUsageCount(ASSOCIATE_USES_KEY);
      if (legacyBeta === 0) {
        legacyBeta = readUsageCount(USAGE_KEYS.associate);
      }
      if (legacyBeta > 0) {
        writeUsageCount(ASSOCIATE_BETA_USES_KEY, legacyBeta);
        count = legacyBeta;
      }
    }
    return count;
  }

  function isUnlimited(limitValue) {
    return limitValue == null || limitValue === Infinity;
  }

  function limitReachedMessage(featureLabel, tier) {
    if (BETA_MODE && tier === "free") {
      return featureLabel + " limit reached during Enginuity Beta.";
    }
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

  function markBetaHasSaved() {
    localStorage.setItem(BETA_HAS_SAVED_KEY, "true");
  }

  function hasUsedSaveFeature() {
    return localStorage.getItem(BETA_HAS_SAVED_KEY) === "true";
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
        message: BETA_MODE
          ? "You've reached the Enginuity Beta save limit."
          : "Save limit reached (" +
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
    var used = readAssociateBetaUses();
    var max = BETA_MODE ? BETA_ASSOCIATE_MAX : TIER_LIMITS.free.associateUses;
    if (used >= max) {
      return {
        allowed: false,
        message: BETA_MODE
          ? "You've completed the Associate Beta experience."
          : "You've used your free builds. Upgrade to continue.",
        used: used,
        max: max
      };
    }
    return { allowed: true, used: used, max: max };
  }

  function recordAssociateUse() {
    if (bypassAllLimits()) return;
    if (!isFree()) return;
    var next = readAssociateBetaUses() + 1;
    writeUsageCount(ASSOCIATE_BETA_USES_KEY, next);
    writeUsageCount(ASSOCIATE_USES_KEY, next);
    writeUsageCount(USAGE_KEYS.associate, next);
    document.dispatchEvent(new CustomEvent("enginuity:usage-changed"));
    document.dispatchEvent(
      new CustomEvent("enginuity:beta-milestone", {
        detail: { type: "associate" }
      })
    );
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

  function readInnovatorBetaUses() {
    return readUsageCount(INNOVATOR_BETA_USES_KEY);
  }

  function readInnovatorBetaCountedIds() {
    try {
      var raw = JSON.parse(localStorage.getItem(INNOVATOR_BETA_COUNTED_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (_) {
      return [];
    }
  }

  function writeInnovatorBetaCountedIds(ids) {
    localStorage.setItem(INNOVATOR_BETA_COUNTED_KEY, JSON.stringify(ids || []));
  }

  function canUseInnovatorLite() {
    if (!BETA_MODE) {
      return { allowed: true };
    }
    if (bypassAllLimits()) {
      return { allowed: true };
    }
    var used = readInnovatorBetaUses();
    var max = BETA_INNOVATOR_LITE_MAX;
    if (used >= max) {
      return {
        allowed: false,
        message: "You've completed the Innovator Lite Beta experience.",
        used: used,
        max: max
      };
    }
    return { allowed: true, used: used, max: max };
  }

  function recordInnovatorLiteCompletion(projectId) {
    if (!BETA_MODE) return false;
    if (bypassAllLimits()) return false;
    var id = String(projectId || "").trim();
    if (!id) id = "anon-" + Date.now();
    var counted = readInnovatorBetaCountedIds();
    if (counted.indexOf(id) !== -1) {
      return false;
    }
    counted.push(id);
    writeInnovatorBetaCountedIds(counted);
    writeUsageCount(INNOVATOR_BETA_USES_KEY, readInnovatorBetaUses() + 1);
    document.dispatchEvent(new CustomEvent("enginuity:usage-changed"));
    document.dispatchEvent(
      new CustomEvent("enginuity:beta-milestone", {
        detail: { type: "innovator_lite" }
      })
    );
    return true;
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
          ? BETA_MODE
            ? "Full Innovator mode launches with Builder and Pro after Enginuity Beta. Try Innovator Lite meanwhile."
            : "Innovator mode requires Builder or Pro. Upgrade to unlock it."
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

  function shouldOfferBetaFeedback() {
    if (!BETA_MODE) return false;
    if (localStorage.getItem("beta_feedback_completed") === "true") return false;

    var associateBlocked =
      typeof canUseAssociate === "function" && !canUseAssociate().allowed;
    var liteBlocked =
      typeof canUseInnovatorLite === "function" && !canUseInnovatorLite().allowed;
    var saveBlocked = !canSaveProject().allowed;
    var hasSaved = hasUsedSaveFeature();

    return associateBlocked || liteBlocked || saveBlocked || hasSaved;
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
  window.isBetaMode = isBetaMode;
  window.bypassAllLimits = bypassAllLimits;
  window.getCurrentPlanLimits = getCurrentLimits;
  window.canSaveProject = canSaveProject;
  window.markBetaHasSaved = markBetaHasSaved;
  window.hasUsedSaveFeature = hasUsedSaveFeature;
  window.canUseAssociate = canUseAssociate;
  window.recordAssociateUse = recordAssociateUse;
  window.canUseApprenticeGeneration = canUseApprenticeGeneration;
  window.recordApprenticeGeneration = recordApprenticeGeneration;
  window.canUseDiagram = canUseDiagram;
  window.recordDiagramUse = recordDiagramUse;
  window.canUseSparkHelper = canUseSparkHelper;
  window.recordSparkHelperUse = recordSparkHelperUse;
  window.canUseInnovatorLite = canUseInnovatorLite;
  window.recordInnovatorLiteCompletion = recordInnovatorLiteCompletion;
  window.getInnovatorBetaUses = readInnovatorBetaUses;
  window.shouldOfferBetaFeedback = shouldOfferBetaFeedback;
  window.canAccessInnovator = canAccessInnovator;
  window.canUseInnovator = canUseInnovator;
  window.recordInnovatorUse = recordInnovatorUse;
  window.getInnovatorMonthlyStatus = getInnovatorMonthlyStatus;
})();
