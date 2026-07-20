// Structured project output rendering (frontend only)
(function () {
  "use strict";
  var PROJECT_PROGRESS_KEY = "project_progress";

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

  function renderStepsSection(steps, escape, projectId, progress) {
    if (!steps.length) {
      return (
        '<section class="project-output__section">' +
        '<h3 class="project-output__label">Steps</h3>' +
        '<p class="project-output__muted">Not provided.</p>' +
        "</section>"
      );
    }
    var inner = steps
      .map(function (item, index) {
        var stepRaw = item == null ? "" : String(item);
        var content = formatStepItemHtml(stepRaw, escape);
        var encoded = encodeURIComponent(stepRaw);
        var checked = Boolean(progress[index]);
        return (
          '<li class="project-output__step' + (checked ? " is-complete" : "") + '">' +
          '<label class="project-output__step-main">' +
          '<input type="checkbox" class="project-output__step-check" data-project-id="' +
          escape(projectId) +
          '" data-step-index="' +
          index +
          '" data-total-steps="' +
          steps.length +
          '"' +
          (checked ? " checked" : "") +
          ">" +
          '<span class="project-output__step-text">' +
          content +
          "</span>" +
          "</label>" +
          '<button type="button" class="project-output__diagram-btn" data-step="' +
          encoded +
          '">Show Diagram</button>' +
          '<div class="project-output__diagram-slot" hidden aria-live="polite"></div>' +
          "</li>"
        );
      })
      .join("");
    return (
      '<section class="project-output__section">' +
      '<h3 class="project-output__label">Steps</h3>' +
      '<ol class="project-output__steps">' +
      inner +
      "</ol>" +
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
    var projectId = ensureProjectId(projData);
    var progress = getProjectProgress(projectId, steps.length);
    var completedCount = getCompletedCount(progress);
    var percent = steps.length ? Math.round((completedCount / steps.length) * 100) : 0;

    var html =
      '<article class="project-output" data-project-id="' + escape(projectId) + '" data-total-steps="' + steps.length + '">' +
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
      renderStepsSection(steps, escape, projectId, progress);

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
    renderStructuredProject: renderStructuredProject,
    renderProjectChoices: renderProjectChoices,
    formatStepItemHtml: formatStepItemHtml,
    formatExplanationHtml: formatExplanationHtml
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
  });
})();
