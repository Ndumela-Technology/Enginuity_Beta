// Shared Saved Projects helpers (localStorage-based)
(function () {
  "use strict";

  var STORAGE_KEY = "saved_projects";
  var CURRENT_PROJECT_KEY = "current_project";

  function getEmail() {
    return localStorage.getItem("user_email") || "";
  }

  function createProjectId() {
    return Date.now().toString();
  }

  function toStringList(value) {
    if (window.ProjectOutput && typeof window.ProjectOutput.toStringList === "function") {
      return window.ProjectOutput.toStringList(value);
    }
    if (!value) return [];
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    return [String(value)];
  }

  function readAllSaved() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function writeAllSaved(obj) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj || {}));
  }

  function isValidTimestamp(value) {
    return typeof value === "number" && !isNaN(value) && isFinite(value);
  }

  function resolveProjectTimestamp(project, source) {
    if (isValidTimestamp(project.timestamp)) return project.timestamp;
    if (isValidTimestamp(source.timestamp)) return source.timestamp;
    if (project.savedAt) {
      var fromProjectSavedAt = Date.parse(project.savedAt);
      if (isValidTimestamp(fromProjectSavedAt)) return fromProjectSavedAt;
    }
    if (source.savedAt) {
      var fromSourceSavedAt = Date.parse(source.savedAt);
      if (isValidTimestamp(fromSourceSavedAt)) return fromSourceSavedAt;
    }
    return Date.now();
  }

  function normalizeLegacyProject(project) {
    if (!project || typeof project !== "object") return null;
    var source = project.fullProject || project;
    return {
      id: project.id || source.id || createProjectId(),
      title: project.title || source.title || source.project_name || "Project",
      description: project.description || source.description || "",
      materials: toStringList(project.materials || source.materials || source.materials_needed),
      materialsSuggested: toStringList(
        project.materialsSuggested || source.materialsSuggested || source.materials_suggested
      ),
      steps: toStringList(project.steps || source.steps),
      engineeringExplanation:
        project.engineeringExplanation ||
        source.engineeringExplanation ||
        source.engineering_explanation ||
        source.engineering ||
        "",
      physicsExplanation:
        project.physicsExplanation ||
        source.physics_explanation ||
        source.physicsExplanation ||
        source.physics ||
        "",
      scienceExplanation:
        project.scienceExplanation ||
        source.scienceExplanation ||
        source.science_explanation ||
        "",
      timestamp: resolveProjectTimestamp(project, source),
      mode: project.mode || source.mode || "",
      page: project.page || source.page || ""
    };
  }

  function buildSavedProjectObject(project, meta) {
    if (!project || typeof project !== "object") return null;
    var base = normalizeLegacyProject(project);
    if (!base) return null;
    if (meta) {
      if (meta.mode) base.mode = meta.mode;
      if (meta.page) base.page = meta.page;
    }
    if (!base.id) base.id = createProjectId();
    if (!isValidTimestamp(base.timestamp)) base.timestamp = Date.now();
    return base;
  }

  function getSavedProjectsForUser(email) {
    var resolved = email || getEmail();
    if (!resolved) return [];
    var allSaved = readAllSaved();
    var list = Array.isArray(allSaved[resolved]) ? allSaved[resolved] : [];
    return list.map(normalizeLegacyProject).filter(Boolean);
  }

  function setCurrentProject(project) {
    var normalized = normalizeLegacyProject(project);
    if (!normalized) return false;
    localStorage.setItem(CURRENT_PROJECT_KEY, JSON.stringify(normalized));
    document.dispatchEvent(
      new CustomEvent("enginuity:project-changed", { detail: { project: normalized } })
    );
    return true;
  }

  function getCurrentProject() {
    try {
      var raw = localStorage.getItem(CURRENT_PROJECT_KEY);
      if (!raw) return null;
      return normalizeLegacyProject(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  function openSavedProject(project) {
    var normalized = normalizeLegacyProject(project);
    if (!normalized) return false;

    if (typeof window.renderSavedProject === "function") {
      setCurrentProject(normalized);
      window.renderSavedProject(normalized);
      return true;
    }

    if (!setCurrentProject(normalized)) return false;
    window.location.href = "project.html";
    return true;
  }

  function openSavedProjectByIndex(index) {
    var list = getSavedProjectsForUser();
    var proj = list[index];
    if (!proj) return false;
    return openSavedProject(proj);
  }

  function buildResumeKey(email) {
    return "enginuity_resume_project::" + email;
  }

  function showSavedToast(message) {
    var msg = document.createElement("div");
    msg.innerText = message || "✅ Project saved!";

    msg.style.position = "fixed";
    msg.style.bottom = "20px";
    msg.style.right = "20px";
    msg.style.background = "#111";
    msg.style.color = "#fff";
    msg.style.padding = "10px 14px";
    msg.style.borderRadius = "10px";
    msg.style.fontWeight = "600";
    msg.style.zIndex = "9999";

    document.body.appendChild(msg);
    setTimeout(function () { msg.remove(); }, 2000);
  }

  function startSavedProject(savedIndex) {
    openSavedProjectByIndex(savedIndex);
  }

  function consumeResumeProject() {
    var email = getEmail();
    if (!email) return null;
    var key = buildResumeKey(email);

    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      localStorage.removeItem(key);
      var parsed = JSON.parse(raw);
      var project = parsed && parsed.project ? parsed.project : null;
      if (project) setCurrentProject(project);
      return normalizeLegacyProject(project);
    } catch {
      return null;
    }
  }

  function saveProjectWithMeta(project, meta) {
    var email = getEmail();
    if (!email) {
      alert("Please sign in first.");
      return false;
    }

    var normalized = buildSavedProjectObject(project, meta);
    if (!normalized) {
      alert("No project found to save.");
      return false;
    }

    var allSaved = readAllSaved();
    if (!Array.isArray(allSaved[email])) allSaved[email] = [];

    var existingIndex = allSaved[email].findIndex(function (p) {
      return p && normalized.id && p.id === normalized.id;
    });

    if (existingIndex === -1) {
      existingIndex = allSaved[email].findIndex(function (p) {
        if (!p) return false;
        return (
          p.title === normalized.title &&
          (p.mode || "") === (normalized.mode || "")
        );
      });
    }

    if (existingIndex === -1) {
      if (typeof window.canSaveProject === "function") {
        var limitBeforePush = window.canSaveProject(email);
        if (!limitBeforePush.allowed) {
          alert(limitBeforePush.message || "Save limit reached.");
          return false;
        }
      }
      allSaved[email].push(normalized);
      writeAllSaved(allSaved);
    } else {
      var existing = allSaved[email][existingIndex];
      if (existing && existing.id) {
        normalized.id = existing.id;
      }
      normalized.timestamp = Date.now();
      allSaved[email][existingIndex] = normalized;
      writeAllSaved(allSaved);
    }

    if (typeof window.markBetaHasSaved === "function") {
      window.markBetaHasSaved();
    }
    document.dispatchEvent(new CustomEvent("enginuity:project-saved"));

    if (typeof window.loadSavedProjects === "function") {
      window.loadSavedProjects();
    }
    return true;
  }

  function saveProject(index) {
    var email = getEmail();
    if (!email) {
      alert("Please sign in first.");
      return;
    }

    var list = Array.isArray(window.allProjects) ? window.allProjects : [];
    var raw = list[index];
    if (!raw) {
      alert("No project found to save.");
      return;
    }

    var toSave = buildSavedProjectObject(raw, null);
    if (toSave && !toSave.id) toSave.id = createProjectId();

    var mode = (window.MODE || "").trim();
    var page = window.location.pathname.split("/").pop() || "";
    var saved = saveProjectWithMeta(toSave || raw, { mode: mode, page: page });

    if (saved) {
      showSavedToast("✅ Project saved!");
      if (typeof window.loadSavedProjects === "function") {
        window.loadSavedProjects();
      }
    }
  }

  function viewSavedProject(index) {
    openSavedProjectByIndex(index);
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#39;");
  }

  function loadSavedProjects() {
    var container = document.getElementById("savedProjects");
    if (!container) return;

    var email = getEmail();
    var previewOnly = container.dataset.previewOnly === "true";
    if (!email) {
      container.innerHTML =
        '<p class="saved-projects__hint">Please sign in to see your projects.</p>';
      return;
    }

    var projects = getSavedProjectsForUser(email);

    if (projects.length === 0) {
      container.innerHTML =
        '<p class="saved-projects__hint">No saved projects yet.</p>' +
        (previewOnly
          ? ""
          : '<a class="saved-projects__link" href="saved.html">Go to Saved Projects →</a>');
      return;
    }

    container.innerHTML = previewOnly
      ? ""
      : '<a class="saved-projects__link saved-projects__link--top" href="saved.html">View all saved projects →</a>';

    projects.slice(-2).reverse().forEach(function (proj) {
      var row = document.createElement("div");
      row.className = "saved-project-card";
      var safeTitle = escapeHtml(proj.title || "Project");
      var safeDesc = escapeHtml(proj.description || "");
      row.innerHTML =
        '<div class="saved-project-card__body">' +
        '<div class="saved-project-card__title">' + safeTitle + "</div>" +
        (safeDesc
          ? '<p class="saved-project-card__desc">' + safeDesc + "</p>"
          : "") +
        "</div>" +
        '<button type="button" class="saved-project-card__btn">Open Project</button>';
      row.querySelector("button").addEventListener("click", function () {
        openSavedProject(proj);
      });
      container.appendChild(row);
    });

    window.savedProjects = projects;
  }

  window.createProjectId = createProjectId;
  window.getSavedProjectsForUser = getSavedProjectsForUser;
  window.setCurrentProject = setCurrentProject;
  window.getCurrentProject = getCurrentProject;
  window.openSavedProject = openSavedProject;
  window.openSavedProjectByIndex = openSavedProjectByIndex;
  window.saveProject = saveProject;
  window.saveProjectWithMeta = saveProjectWithMeta;
  window.loadSavedProjects = loadSavedProjects;
  window.viewSavedProject = viewSavedProject;
  window.consumeResumeProject = consumeResumeProject;
  window.startSavedProject = startSavedProject;
  window.showSavedToast = showSavedToast;
  window.buildSavedProjectObject = buildSavedProjectObject;

  function initSavedProjectsPreview() {
    if (!document.getElementById("savedProjects")) return;
    loadSavedProjects();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSavedProjectsPreview);
  } else {
    initSavedProjectsPreview();
  }
})();
