// Structured project output rendering (frontend only)
(function () {
  "use strict";
  var PROJECT_PROGRESS_KEY = "project_progress";
  var CATEGORY_DONE_KEY = "enginuity_category_build_done";
  var DONE_BAR_ID = "enginuityDoneBar";
  var DONE_BAR_EXTRA_CLEARANCE = 24;
  var doneBarResizeObserver = null;
  var activeDoneProjectId = "";
  var activeDoneTotalSteps = 0;

  function defaultEscapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#39;");
  }

  function nlToBr(escaped) {
    return escaped.replace(/\n/g, "<br>");
  }

  function extractBalancedJsonSubstring(s) {
    var t = String(s).trim();
    if (!t.length) return null;
    var firstObj = t.indexOf("{");
    var firstArr = t.indexOf("[");
    var i0 = -1;
    if (firstObj === -1) i0 = firstArr;
    else if (firstArr === -1) i0 = firstObj;
    else i0 = Math.min(firstObj, firstArr);
    if (i0 === -1) return null;

    var stack = [];
    var inString = false;
    var escape = false;
    for (var i = i0; i < t.length; i++) {
      var ch = t[i];
      if (inString) {
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === "\\") {
          escape = true;
          continue;
        }
        if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{") {
        stack.push("}");
        continue;
      }
      if (ch === "[") {
        stack.push("]");
        continue;
      }
      if (ch === "}" || ch === "]") {
        if (!stack.length || ch !== stack[stack.length - 1]) continue;
        stack.pop();
        if (!stack.length) return t.slice(i0, i + 1);
      }
    }
    return null;
  }

  function explanationToText(value) {
    if (value == null || value === "") return "";

    if (typeof value === "string") {
      var trimmed = value.trim();
      var withoutFence = trimmed
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```$/i, "")
        .trim();
      var jsonLike = null;
      if (
        (withoutFence.startsWith("{") && withoutFence.endsWith("}")) ||
        (withoutFence.startsWith("[") && withoutFence.endsWith("]"))
      ) {
        jsonLike = withoutFence;
      } else {
        jsonLike = extractBalancedJsonSubstring(withoutFence);
      }

      if (jsonLike) {
        try {
          return explanationToText(JSON.parse(jsonLike));
        } catch (_) {
          return withoutFence || value;
        }
      }
      return withoutFence || value;
    }

    if (Array.isArray(value)) {
      return value.map(function (item) {
        return explanationToText(item);
      }).join("\n");
    }

    if (typeof value === "object") {
      var preferredKeys = [
        "explanation",
        "physics_explanation",
        "physicsExplanation",
        "content",
        "message",
        "engineering_explanation",
        "engineeringExplanation",
        "text",
        "summary"
      ];
      var k;
      for (k = 0; k < preferredKeys.length; k++) {
        if (
          Object.prototype.hasOwnProperty.call(value, preferredKeys[k]) &&
          value[preferredKeys[k]]
        ) {
          return explanationToText(value[preferredKeys[k]]);
        }
      }
      var lines = [];
      Object.entries(value).forEach(function (entry) {
        var key = entry[0];
        var val = entry[1];
        if (val == null || val === "") return;
        var label = key
          .replace(/_/g, " ")
          .replace(/([a-z])([A-Z])/g, "$1 $2")
          .replace(/\s+/g, " ")
          .trim()
          .replace(/^./, function (c) {
            return c.toUpperCase();
          });
        var text = explanationToText(val).trim();
        lines.push(label + ": " + text);
      });
      if (lines.length) return lines.join("\n\n");
      try {
        return JSON.stringify(value, null, 2);
      } catch (_) {
        return String(value);
      }
    }

    return String(value);
  }

  function stripDisplayMathDelimiters(text) {
    var t = String(text);
    t = t.replace(/([0-9A-Za-z]+)\$\$\$\$+([0-9A-Za-z]+)/g, "$1 $2");
    while (t.indexOf("$$$$") !== -1) {
      t = t.replace(/\$\$\$\$/g, "$$");
    }
    t = t.replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, "\n$1\n");
    t = t.replace(/(?<=[0-9A-Za-z])\$\$(?=[0-9A-Za-z])/g, " ");
    t = t.replace(/\$\$/g, "");
    return t;
  }

  function formatExplanationHtml(value, options) {
    options = options || {};
    var escape = options.escapeHtml || defaultEscapeHtml;
    var text = stripDisplayMathDelimiters(explanationToText(value));
    if (!text) return "";
    var escaped = escape(text);
    var withBold = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    var normalizedMarkdown = withBold
      .replace(/^#{1,6}\s*(.+)$/gm, "<strong>$1</strong>")
      .replace(/^\s*[-*]\s+/gm, "• ")
      .replace(/^\s*>\s?/gm, "");
    return nlToBr(normalizedMarkdown);
  }

  function normalizeStepString(text) {
    var s = String(text == null ? "" : text).trim();
    if (!s) return "";
    s = s.replace(/^\s*[-*•]\s+/, "");
    s = s.replace(/^(Step\s+\d+)\s*[—–-]\s*/i, "$1: ");
    s = s.replace(/\s*\n+\s*/g, " ");
    s = s.replace(/\s+[-*•]\s+/g, ". ");
    s = s.replace(/\.\s*\./g, ".");
    s = s.replace(/\s{2,}/g, " ").trim();
    return s;
  }

  function normalizeSteps(value) {
    if (value == null || value === "") return [];
    var rawItems = [];
    if (Array.isArray(value)) {
      rawItems = value;
    } else if (typeof value === "string") {
      var trimmed = value.trim();
      if (!trimmed) return [];
      if (trimmed.charAt(0) === "[" && trimmed.charAt(trimmed.length - 1) === "]") {
        try {
          var parsedArr = JSON.parse(trimmed);
          if (Array.isArray(parsedArr)) rawItems = parsedArr;
          else rawItems = [trimmed];
        } catch (_) {
          rawItems = trimmed.split(/(?=Step\s+\d+\s*[:.)—-])/i);
        }
      } else {
        rawItems = trimmed.split(/(?=Step\s+\d+\s*[:.)—-])/i);
      }
    } else if (typeof value === "object") {
      rawItems = Object.values(value);
    } else {
      rawItems = [value];
    }

    var out = [];
    rawItems.forEach(function (item) {
      if (item == null || item === "") return;
      if (typeof item === "object") {
        var text =
          item.text || item.step || item.instruction || item.title || "";
        var sub = item.substeps || item.bullets;
        if (Array.isArray(sub)) {
          text = (String(text) + " " + sub.join(" ")).trim();
        }
        if (!text) {
          try {
            text = JSON.stringify(item);
          } catch (_) {
            text = String(item);
          }
        }
        item = text;
      }
      var normalized = normalizeStepString(item);
      if (normalized) out.push(normalized);
    });
    return out;
  }

  function toStringList(value) {
    if (!value && value !== 0) return [];
    if (Array.isArray(value)) {
      return value
        .map(function (item) {
          if (item == null || item === "") return "";
          if (typeof item === "object") {
            return (
              item.name ||
              item.item ||
              item.text ||
              item.label ||
              JSON.stringify(item)
            );
          }
          return String(item);
        })
        .filter(Boolean);
    }
    if (typeof value === "string") {
      var trimmed = value.trim();
      if (!trimmed) return [];
      if (
        (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
        (trimmed.startsWith("{") && trimmed.endsWith("}"))
      ) {
        try {
          var parsed = JSON.parse(trimmed);
          return toStringList(parsed);
        } catch (_) {
          /* fall through */
        }
      }
      return trimmed
        .split(/\n|;|•/)
        .map(function (s) {
          return s.replace(/^\s*[-*]\s+/, "").trim();
        })
        .filter(Boolean);
    }
    if (typeof value === "object") {
      return Object.values(value)
        .map(String)
        .filter(Boolean);
    }
    return [String(value)];
  }

  function formatStepItemHtml(stepValue, escape) {
    var normalized = normalizeStepString(stepValue);
    var escaped = escape(normalized);
    var boldPrefix = escaped.replace(
      /^(\s*Step\s+\d+\s*:)/i,
      "<strong>$1</strong>"
    );
    return nlToBr(boldPrefix);
  }

  var PHASE_NAME_POOL = [
    "Foundation",
    "Structure",
    "Electronics",
    "Programming",
    "Testing & Final Assembly"
  ];

  function parseEstimatedMinutes(project) {
    var raw = String(
      (project && (project.estimatedTime || project.estimated_time)) || ""
    ).toLowerCase();
    if (!raw && project && project.difficulty) {
      raw = String(project.difficulty).toLowerCase();
    }
    var rangeDays = raw.match(/(\d+)\s*(?:-|–|to)\s*(\d+)\s*days?/);
    if (rangeDays) {
      return ((parseInt(rangeDays[1], 10) + parseInt(rangeDays[2], 10)) / 2) * 24 * 60;
    }
    var singleDay = raw.match(/(\d+(?:\.\d+)?)\s*days?/);
    if (singleDay) return parseFloat(singleDay[1]) * 24 * 60;
    var hourMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/);
    if (hourMatch) return parseFloat(hourMatch[1]) * 60;
    var rangeHour = raw.match(/(\d+)\s*(?:-|–|to)\s*(\d+)\s*(?:hours?|hrs?)\b/);
    if (rangeHour) {
      return ((parseInt(rangeHour[1], 10) + parseInt(rangeHour[2], 10)) / 2) * 60;
    }
    var rangeMin = raw.match(/(\d+)\s*(?:-|–|to)\s*(\d+)\s*min/);
    if (rangeMin) {
      return (parseInt(rangeMin[1], 10) + parseInt(rangeMin[2], 10)) / 2;
    }
    var singleMin = raw.match(/(\d+)\s*min/);
    if (singleMin) return parseInt(singleMin[1], 10);
    return null;
  }

  function phasesFromExplicit(project, list) {
    var explicit = project.buildPhases || project.build_phases;
    if (!Array.isArray(explicit) || !explicit.length) return null;
    var phases = [];
    var offset = 0;
    var p;
    for (p = 0; p < explicit.length; p++) {
      var phase = explicit[p] || {};
      var phaseSteps = normalizeSteps(phase.steps || []);
      if (!phaseSteps.length) continue;
      var name = String(phase.name || phase.title || PHASE_NAME_POOL[p] || "Phase " + (p + 1)).trim();
      phases.push({
        index: phases.length,
        name: name,
        title: "Part " + (phases.length + 1) + " — " + name,
        steps: phaseSteps,
        stepStartIndex: offset
      });
      offset += phaseSteps.length;
    }
    if (!phases.length) return null;
    if (list.length && offset !== list.length) {
      return null;
    }
    return phases;
  }

  function computeBuildPhases(steps, project) {
    project = project || {};
    var list = Array.isArray(steps) ? steps : normalizeSteps(steps);
    var explicitPhases = phasesFromExplicit(project, list);
    if (explicitPhases && explicitPhases.length > 0) {
      return explicitPhases;
    }

    var minutes = parseEstimatedMinutes(project);
    var count = list.length;
    var isMultiDay = minutes != null && minutes >= 20 * 60;
    var isLongSession = minutes != null && minutes > 90;
    var needsPhases = isMultiDay || isLongSession || count > 14;

    if (!needsPhases) {
      return [
        {
          index: 0,
          name: "Build",
          title: "Part 1 — Build",
          steps: list.slice(),
          stepStartIndex: 0
        }
      ];
    }

    var maxStepsPerPhase = isMultiDay ? 10 : 7;
    var phaseCount = Math.ceil(count / maxStepsPerPhase);
    if (isMultiDay) {
      phaseCount = Math.max(phaseCount, Math.min(5, Math.ceil(minutes / (8 * 60))));
      phaseCount = Math.max(phaseCount, 3);
    } else if (minutes != null && minutes > 60) {
      phaseCount = Math.max(phaseCount, Math.min(5, Math.ceil(minutes / 45)));
    }
    phaseCount = Math.min(Math.max(phaseCount, 2), 5);
    var perPhase = Math.ceil(count / phaseCount);
    var phases = [];
    var p;
    for (p = 0; p < phaseCount; p++) {
      var start = p * perPhase;
      if (start >= count) break;
      var end = Math.min(start + perPhase, count);
      var name = PHASE_NAME_POOL[p] || "Phase " + (p + 1);
      phases.push({
        index: p,
        name: name,
        title: "Part " + (p + 1) + " — " + name,
        steps: list.slice(start, end),
        stepStartIndex: start
      });
    }
    return phases;
  }

  function renderConceptRenderSection(phases, escape) {
    var firstTitle = phases[0] ? phases[0].title : "Part 1 — Build";
    var showNav = phases.length > 1;
    return (
      '<section class="project-output__section project-output__section--concept-render">' +
      '<h3 class="project-output__label">Concept Render</h3>' +
      '<p class="concept-render__hint">Guided assembly visualization — understand how parts fit together. Your final design stays yours to create.</p>' +
      (showNav
        ? '<div class="concept-render__nav">' +
          '<button type="button" class="concept-render__nav-btn" data-action="prev" disabled aria-label="Previous build phase">Previous</button>' +
          '<span class="concept-render__phase-label">' +
          escape(firstTitle) +
          "</span>" +
          '<button type="button" class="concept-render__nav-btn" data-action="next"' +
          (phases.length <= 1 ? " disabled" : "") +
          ' aria-label="Next build phase">Next</button>' +
          "</div>"
        : '<p class="concept-render__phase-label concept-render__phase-label--solo">' +
          escape(firstTitle) +
          "</p>") +
      '<div class="concept-render__panel">' +
      '<button type="button" class="concept-render__generate-btn" title="Generate an exploded assembly view for this build phase">Generate Concept Render</button>' +
      '<div class="concept-render__slot" hidden aria-live="polite"></div>' +
      "</div>" +
      "</section>"
    );
  }

  function renderPhasedStepsSection(phases, escape, projectId, progress) {
    if (!phases.length) {
      return (
        '<section class="project-output__section">' +
        '<h3 class="project-output__label">Build instructions</h3>' +
        '<p class="project-output__muted">Not provided.</p>' +
        "</section>"
      );
    }

    var phaseBlocks = phases
      .map(function (phase) {
        var inner = phase.steps
          .map(function (item, localIndex) {
            var globalIndex = phase.stepStartIndex + localIndex;
            var stepRaw = item == null ? "" : String(item);
            var content = formatStepItemHtml(stepRaw, escape);
            var checked = Boolean(progress[globalIndex]);
            return (
              '<li class="project-output__step' +
              (checked ? " is-complete" : "") +
              '">' +
              '<label class="project-output__step-main">' +
              '<input type="checkbox" class="project-output__step-check" data-project-id="' +
              escape(projectId) +
              '" data-step-index="' +
              globalIndex +
              '" data-total-steps="' +
              progress.length +
              '"' +
              (checked ? " checked" : "") +
              ">" +
              '<span class="project-output__step-text">' +
              content +
              "</span>" +
              "</label>" +
              "</li>"
            );
          })
          .join("");

        return (
          '<div class="build-phase" data-phase-index="' +
          phase.index +
          '"' +
          (phase.index === 0 ? "" : " hidden") +
          ">" +
          '<h4 class="build-phase__title">' +
          escape(phase.title) +
          "</h4>" +
          '<ol class="project-output__steps">' +
          inner +
          "</ol>" +
          "</div>"
        );
      })
      .join("");

    return (
      '<section class="project-output__section project-output__section--phases">' +
      '<h3 class="project-output__label">Build instructions</h3>' +
      phaseBlocks +
      "</section>"
    );
  }

  function stableProjectIdFromContent(projData) {
    var raw = [
      projData.title || "",
      projData.description || "",
      toStringList(projData.steps).join("|")
    ].join("::");
    var hash = 0;
    for (var i = 0; i < raw.length; i++) {
      hash = (hash << 5) - hash + raw.charCodeAt(i);
      hash |= 0;
    }
    return "project_" + String(Math.abs(hash));
  }

  function ensureProjectId(projData) {
    if (!projData || typeof projData !== "object") return "project_unknown";
    var existing = String(projData.id || "").trim();
    if (existing) return existing;
    var generated = stableProjectIdFromContent(projData);
    projData.id = generated;
    return generated;
  }

  function getModeCategory() {
    return String(
      window.MODE || localStorage.getItem("enginuity_mode") || localStorage.getItem("forge_mode") || ""
    ).trim();
  }

  function readCategoryDoneMap() {
    try {
      return JSON.parse(localStorage.getItem(CATEGORY_DONE_KEY)) || {};
    } catch (_) {
      return {};
    }
  }

  function hasCompletedCategory(category) {
    var key = String(category || "").trim();
    if (!key) return false;
    return readCategoryDoneMap()[key] === true;
  }

  function markCategoryComplete(category) {
    var key = String(category || "").trim();
    if (!key) return;
    var map = readCategoryDoneMap();
    map[key] = true;
    localStorage.setItem(CATEGORY_DONE_KEY, JSON.stringify(map));
  }

  function allStepsComplete(projectId, totalSteps) {
    if (!totalSteps) return false;
    var progress = getProjectProgress(projectId, totalSteps);
    return getCompletedCount(progress) >= totalSteps;
  }

  function syncDoneBarInset() {
    var bar = document.getElementById(DONE_BAR_ID);
    var root = document.documentElement;
    var hint = document.getElementById("enginuityDoneHint");
    var visible = bar && bar.classList.contains("is-visible");

    if (!visible) {
      root.style.removeProperty("--enginuity-done-bar-offset");
      document.documentElement.classList.remove("has-enginuity-done-bar-scroll");
      document.body.classList.remove("has-enginuity-done-bar-hint");
      return;
    }

    if (hint && !hint.hidden && String(hint.textContent || "").trim()) {
      document.body.classList.add("has-enginuity-done-bar-hint");
    } else {
      document.body.classList.remove("has-enginuity-done-bar-hint");
    }

    var offset = bar.offsetHeight + DONE_BAR_EXTRA_CLEARANCE;
    root.style.setProperty("--enginuity-done-bar-offset", offset + "px");
    document.documentElement.classList.add("has-enginuity-done-bar-scroll");
  }

  function ensureDoneBar() {
    var bar = document.getElementById(DONE_BAR_ID);
    if (bar) return bar;

    bar = document.createElement("div");
    bar.id = DONE_BAR_ID;
    bar.className = "enginuity-done-bar";
    bar.innerHTML =
      '<div class="enginuity-done-bar__inner">' +
      '<button type="button" class="enginuity-done-bar__btn" id="enginuityDoneBtn" disabled>Done — back to home</button>' +
      '<p class="enginuity-done-bar__hint" id="enginuityDoneHint" hidden></p>' +
      "</div>";
    document.body.appendChild(bar);

    if (typeof window.ResizeObserver === "function") {
      doneBarResizeObserver = new ResizeObserver(function () {
        syncDoneBarInset();
      });
      doneBarResizeObserver.observe(bar);
    }
    window.addEventListener("resize", syncDoneBarInset);

    bar.querySelector("#enginuityDoneBtn").onclick = function () {
      if (this.disabled) return;
      var category = getModeCategory();
      if (category) markCategoryComplete(category);
      var target = window.ENGINUITY_DONE_REDIRECT || "index.html";
      window.location.href = target;
    };

    return bar;
  }

  function updateDoneBarState() {
    var bar = ensureDoneBar();
    var btn = document.getElementById("enginuityDoneBtn");
    var hint = document.getElementById("enginuityDoneHint");
    var hasOutput = document.querySelector(".project-output[data-project-id]");
    var category = getModeCategory();

    if (!activeDoneProjectId || !activeDoneTotalSteps) {
      bar.classList.remove("is-visible");
      document.body.classList.remove("has-enginuity-done-bar");
      syncDoneBarInset();
      return;
    }

    if (activeDoneProjectId !== "__always__" && !hasOutput) {
      bar.classList.remove("is-visible");
      document.body.classList.remove("has-enginuity-done-bar");
      syncDoneBarInset();
      return;
    }

    bar.classList.add("is-visible");
    document.body.classList.add("has-enginuity-done-bar");

    if (activeDoneProjectId === "__always__") {
      if (btn) btn.disabled = false;
      if (hint) {
        if (hasCompletedCategory(category)) {
          hint.hidden = true;
          hint.textContent = "";
        } else {
          hint.hidden = true;
        }
      }
      requestAnimationFrame(syncDoneBarInset);
      return;
    }

    var complete = allStepsComplete(activeDoneProjectId, activeDoneTotalSteps);
    var gateOk =
      typeof window.enginuityDoneGate === "function"
        ? window.enginuityDoneGate()
        : complete;
    if (btn) btn.disabled = !gateOk;

    if (hint) {
      if (hasCompletedCategory(category)) {
        hint.hidden = true;
        hint.textContent = "";
      } else if (complete) {
        hint.hidden = false;
        hint.textContent = "Tap Done to return home.";
      } else {
        hint.hidden = false;
        hint.textContent = "Complete all steps to unlock Done.";
      }
    }
    requestAnimationFrame(syncDoneBarInset);
  }

  function bindDoneBarForProject(projectId, totalSteps) {
    activeDoneProjectId = projectId || "";
    activeDoneTotalSteps = totalSteps || 0;
    updateDoneBarState();
  }

  function showDoneBarAlways(options) {
    options = options || {};
    activeDoneProjectId = "__always__";
    activeDoneTotalSteps = 1;
    var bar = ensureDoneBar();
    bar.classList.add("is-visible");
    document.body.classList.add("has-enginuity-done-bar");
    var btn = document.getElementById("enginuityDoneBtn");
    if (btn) {
      btn.disabled = false;
      if (options.label) btn.textContent = options.label;
    }
    var hint = document.getElementById("enginuityDoneHint");
    if (hint) {
      if (options.hint) {
        hint.hidden = false;
        hint.textContent = options.hint;
      } else {
        hint.hidden = true;
      }
    }
    if (typeof options.onDone === "function") {
      btn.onclick = function () {
        options.onDone();
      };
    }
    requestAnimationFrame(syncDoneBarInset);
  }

  function hideDoneBar() {
    activeDoneProjectId = "";
    activeDoneTotalSteps = 0;
    var bar = document.getElementById(DONE_BAR_ID);
    if (bar) bar.classList.remove("is-visible");
    document.body.classList.remove("has-enginuity-done-bar");
    document.body.classList.remove("has-enginuity-done-bar-hint");
    syncDoneBarInset();
  }

  function readProgressMap() {
    try {
      return JSON.parse(localStorage.getItem(PROJECT_PROGRESS_KEY)) || {};
    } catch (_) {
      return {};
    }
  }

  function writeProgressMap(progress) {
    localStorage.setItem(PROJECT_PROGRESS_KEY, JSON.stringify(progress || {}));
  }

  function getProjectProgress(projectId, totalSteps) {
    var map = readProgressMap();
    var existing = Array.isArray(map[projectId]) ? map[projectId] : [];
    var normalized = [];
    for (var i = 0; i < totalSteps; i++) {
      normalized.push(Boolean(existing[i]));
    }
    return normalized;
  }

  function setProjectStepProgress(projectId, stepIndex, checked, totalSteps) {
    var map = readProgressMap();
    var progress = getProjectProgress(projectId, totalSteps);
    progress[stepIndex] = Boolean(checked);
    map[projectId] = progress;
    writeProgressMap(map);
    return progress;
  }

  function getCompletedCount(progress) {
    return progress.filter(Boolean).length;
  }

  function renderListSection(label, items, escape, listTag) {
    if (!items.length) {
      return (
        '<section class="project-output__section">' +
        '<h3 class="project-output__label">' +
        escape(label) +
        "</h3>" +
        '<p class="project-output__muted">Not provided.</p>' +
        "</section>"
      );
    }
    var tag = listTag === "ol" ? "ol" : "ul";
    var listClass =
      listTag === "ol" ? "project-output__steps" : "project-output__list";
    var inner = items
      .map(function (item) {
        var content =
          listTag === "ol"
            ? formatStepItemHtml(item, escape)
            : escape(String(item));
        return "<li>" + content + "</li>";
      })
      .join("");
    return (
      '<section class="project-output__section">' +
      '<h3 class="project-output__label">' +
      escape(label) +
      "</h3>" +
      "<" +
      tag +
      ' class="' +
      listClass +
      '">' +
      inner +
      "</" +
      tag +
      ">" +
      "</section>"
    );
  }

  function renderStructuredProject(proj, options) {
    options = options || {};
    var escape = options.escapeHtml || defaultEscapeHtml;
    var projData = proj || {};

    var title = escape(projData.title || "Untitled Project");
    var description = escape(projData.description || "Not provided.");
    var materials = toStringList(
      projData.materials || projData.materials_needed
    );
    var materialsSuggested = toStringList(
      projData.materialsSuggested || projData.materials_suggested
    );
    var steps = normalizeSteps(projData.steps);
    var phases = computeBuildPhases(steps, projData);
    var projectId = ensureProjectId(projData);
    var progress = getProjectProgress(projectId, steps.length);
    var completedCount = getCompletedCount(progress);
    var percent = steps.length ? Math.round((completedCount / steps.length) * 100) : 0;
    var projectJson = encodeURIComponent(JSON.stringify(projData));

    var html =
      '<article class="project-output" data-project-id="' +
      escape(projectId) +
      '" data-total-steps="' +
      steps.length +
      '" data-phases-count="' +
      phases.length +
      '" data-active-phase="0" data-project-json="' +
      projectJson +
      '">' +
      '<header class="project-output__header">' +
      '<h2 class="project-output__title">' +
      title +
      "</h2>" +
      "</header>" +
      '<section class="project-output__section project-output__section--progress">' +
      '<h3 class="project-output__label">Build progress</h3>' +
      '<p class="project-output__progress-text"><span class="project-output__completed-count">' +
      completedCount +
      "</span> of <span>" +
      steps.length +
      '</span> steps completed</p>' +
      '<div class="project-output__progress" role="progressbar" aria-valuemin="0" aria-valuemax="' +
      steps.length +
      '" aria-valuenow="' +
      completedCount +
      '">' +
      '<div class="project-output__progress-fill" style="width:' +
      percent +
      '%"></div>' +
      "</div>" +
      "</section>" +
      '<section class="project-output__section">' +
      '<h3 class="project-output__label">Description</h3>' +
      '<p class="project-output__text">' +
      description +
      "</p>" +
      "</section>" +
      renderListSection("Materials", materials, escape, "ul") +
      renderConceptRenderSection(phases, escape) +
      renderPhasedStepsSection(phases, escape, projectId, progress);

    if (materialsSuggested.length) {
      html += renderListSection(
        "Suggested materials",
        materialsSuggested,
        escape,
        "ul"
      );
    }

    if (typeof options.extraSectionsHtml === "string") {
      html += options.extraSectionsHtml;
    }

    if (typeof options.actionsHtml === "string") {
      html +=
        '<div class="project-output__actions">' + options.actionsHtml + "</div>";
    }

    html += "</article>";
    return html;
  }

  function afterStructuredRender(proj) {
    var projData = proj || {};
    var steps = normalizeSteps(projData.steps);
    var projectId = ensureProjectId(projData);
    bindDoneBarForProject(projectId, steps.length);
  }

  function renderProjectChoices(projects, options) {
    options = options || {};
    var escape = options.escapeHtml || defaultEscapeHtml;
    var onSelectAttr = options.onSelectAttr || "showProject";
    var list = Array.isArray(projects) ? projects : [];

    var cards = list
      .map(function (proj, index) {
        var title = escape(proj.title || "Project " + (index + 1));
        var descRaw = String(proj.description || "").trim();
        var desc =
          descRaw.length > 140 ? descRaw.slice(0, 137) + "…" : descRaw;
        var descHtml = desc
          ? '<span class="project-choice-card__desc">' + escape(desc) + "</span>"
          : "";
        return (
          '<button type="button" class="project-choice-card" onclick="' +
          onSelectAttr +
          "(" +
          index +
          ')">' +
          '<span class="project-choice-card__name">' +
          title +
          "</span>" +
          descHtml +
          "</button>"
        );
      })
      .join("");

    return (
      '<div class="project-output-choices">' +
      '<h2 class="project-output-choices__title">Choose a project</h2>' +
      '<div class="project-output-choices__list">' +
      cards +
      "</div>" +
      '<p class="project-output-choices__hint">Pick one project to view full instructions.</p>' +
      "</div>"
    );
  }

  window.ProjectOutput = {
    toStringList: toStringList,
    normalizeStepString: normalizeStepString,
    normalizeSteps: normalizeSteps,
    computeBuildPhases: computeBuildPhases,
    parseEstimatedMinutes: parseEstimatedMinutes,
    renderStructuredProject: renderStructuredProject,
    renderProjectChoices: renderProjectChoices,
    formatStepItemHtml: formatStepItemHtml,
    formatExplanationHtml: formatExplanationHtml,
    afterStructuredRender: afterStructuredRender,
    hideDoneBar: hideDoneBar,
    showDoneBarAlways: showDoneBarAlways,
    hasCompletedCategory: hasCompletedCategory,
    markCategoryComplete: markCategoryComplete,
    allStepsComplete: allStepsComplete,
    updateDoneBarState: updateDoneBarState
  };

  function refreshProgressUi(projectId) {
    var containers = document.querySelectorAll(
      '.project-output[data-project-id="' + projectId + '"]'
    );
    containers.forEach(function (container) {
      var totalSteps = parseInt(container.getAttribute("data-total-steps") || "0", 10);
      var progress = getProjectProgress(projectId, totalSteps);
      var completed = getCompletedCount(progress);
      var percent = totalSteps ? Math.round((completed / totalSteps) * 100) : 0;

      container.querySelectorAll(".project-output__step-check").forEach(function (input) {
        var idx = parseInt(input.getAttribute("data-step-index") || "0", 10);
        var checked = Boolean(progress[idx]);
        input.checked = checked;
        var li = input.closest(".project-output__step");
        if (li) li.classList.toggle("is-complete", checked);
      });

      var progressText = container.querySelector(".project-output__completed-count");
      if (progressText) progressText.textContent = String(completed);
      var progressbar = container.querySelector(".project-output__progress");
      if (progressbar) progressbar.setAttribute("aria-valuenow", String(completed));
      var fill = container.querySelector(".project-output__progress-fill");
      if (fill) fill.style.width = percent + "%";
    });
    updateDoneBarState();
  }

  function maybeDispatchStepsComplete(projectId, totalSteps) {
    if (!allStepsComplete(projectId, totalSteps)) return;
    document.dispatchEvent(
      new CustomEvent("enginuity:project-steps-complete", {
        detail: { projectId: projectId, totalSteps: totalSteps }
      })
    );
  }

  document.addEventListener("change", function (e) {
    var input = e.target;
    if (!input || !input.classList || !input.classList.contains("project-output__step-check")) {
      return;
    }
    var projectId = input.getAttribute("data-project-id") || "";
    var stepIndex = parseInt(input.getAttribute("data-step-index") || "-1", 10);
    var totalSteps = parseInt(input.getAttribute("data-total-steps") || "0", 10);
    if (!projectId || stepIndex < 0) return;
    setProjectStepProgress(projectId, stepIndex, input.checked, totalSteps);
    refreshProgressUi(projectId);
    maybeDispatchStepsComplete(projectId, totalSteps);
  });
})();
