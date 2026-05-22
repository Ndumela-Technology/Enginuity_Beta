// Structured project output rendering (frontend only)
(function () {
  "use strict";

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

  function toStringList(value) {
    if (value == null || value === "") return [];
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
    var escaped = escape(stepValue == null ? "" : String(stepValue));
    var boldPrefix = escaped.replace(
      /^(\s*Step\s*\d+\s*[:.)-]?)/i,
      "<strong>$1</strong>"
    );
    return nlToBr(boldPrefix);
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
    var steps = toStringList(projData.steps);

    var html =
      '<article class="project-output">' +
      '<header class="project-output__header">' +
      '<h2 class="project-output__title">' +
      title +
      "</h2>" +
      "</header>" +
      '<section class="project-output__section">' +
      '<h3 class="project-output__label">Description</h3>' +
      '<p class="project-output__text">' +
      description +
      "</p>" +
      "</section>" +
      renderListSection("Materials", materials, escape, "ul") +
      renderListSection("Steps", steps, escape, "ol");

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
    renderStructuredProject: renderStructuredProject,
    renderProjectChoices: renderProjectChoices,
    formatStepItemHtml: formatStepItemHtml
  };
})();
