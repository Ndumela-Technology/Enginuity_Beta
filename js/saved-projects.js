// Shared Saved Projects helpers (localStorage-based)
(function () {
  "use strict";

  function getEmail() {
    return localStorage.getItem("user_email") || "";
  }

  function readAllSaved() {
    try {
      return JSON.parse(localStorage.getItem("saved_projects")) || {};
    } catch {
      return {};
    }
  }

  function writeAllSaved(obj) {
    localStorage.setItem("saved_projects", JSON.stringify(obj || {}));
  }

  function normalizeProjectForSave(project) {
    if (!project || typeof project !== "object") return null;
    return {
      title: project.title || project.project_name || "Project",
      description: project.description || "",
      materials: project.materials || project.materials_needed || [],
      materialsSuggested: project.materialsSuggested || project.materials_suggested || [],
      steps: project.steps || [],
      engineeringExplanation: project.engineeringExplanation || project.engineering_explanation || "",
      physicsExplanation: project.physicsExplanation || project.physics_explanation || ""
    };
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

    document.body.appendChild(msg);
    setTimeout(function () { msg.remove(); }, 2000);
  }

  function startSavedProject(savedIndex) {
    var list = Array.isArray(window.savedProjects) ? window.savedProjects : [];
    var proj = list[savedIndex];
    if (!proj || !proj.page) return;

    var email = getEmail();
    if (!email) return;

    localStorage.setItem(buildResumeKey(email), JSON.stringify({
      savedIndex: savedIndex,
      project: proj
    }));

    window.location.href = proj.page;
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
      return parsed && parsed.project ? parsed.project : null;
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

    var normalized = normalizeProjectForSave(project);
    if (!normalized) {
      alert("No project found to save.");
      return false;
    }

    var mode = (meta && meta.mode) || "";
    var page = (meta && meta.page) || "";
    normalized.mode = mode;
    normalized.page = page;
    normalized.savedAt = new Date().toISOString();

    var allSaved = readAllSaved();
    if (!Array.isArray(allSaved[email])) allSaved[email] = [];

    var alreadyExists = allSaved[email].some(function (p) {
      return p.title === normalized.title && p.mode === normalized.mode;
    });

    if (!alreadyExists) {
      allSaved[email].push(normalized);
      writeAllSaved(allSaved);
    }

    if (typeof window.loadSavedProjects === "function") {
      window.loadSavedProjects();
    }
    return true;
  }

  // Save by index into window.allProjects (used by mode pages)
  function saveProject(index) {
    var email = getEmail();
    if (!email) {
      alert("Please sign in first.");
      return;
    }

    var list = Array.isArray(window.allProjects) ? window.allProjects : [];
    var proj = normalizeProjectForSave(list[index]);
    if (!proj) {
      alert("No project found to save.");
      return;
    }

    var mode = (window.MODE || "").trim();
    var page = window.location.pathname.split("/").pop() || "";
    saveProjectWithMeta(proj, { mode: mode, page: page });

    showSavedToast("✅ Project saved!");
    if (typeof window.loadSavedProjects === "function") {
      window.loadSavedProjects();
    }
  }

  function viewSavedProject(index) {
    startSavedProject(index);
  }

  function loadSavedProjects() {
    var container = document.getElementById("savedProjects");
    if (!container) return;

    var email = getEmail();
    if (!email) {
      container.innerHTML = '<p class="saved-projects__hint">Please sign in to see your projects.</p>';
      return;
    }

    var allSaved = readAllSaved();
    var projects = Array.isArray(allSaved[email]) ? allSaved[email] : [];

    if (projects.length === 0) {
      container.innerHTML = '<p class="saved-projects__hint">No saved projects yet.</p>';
      return;
    }

    container.innerHTML = "";

    projects.forEach(function (proj, index) {
      var row = document.createElement("div");
      row.className = "project";
      var safeTitle = String(proj.title || "Project").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      row.innerHTML =
        "<strong>" +
        safeTitle +
        "</strong>" +
        '<button type="button" onclick="viewSavedProject(' +
        index +
        ')">Resume</button>';
      container.appendChild(row);
    });

    window.savedProjects = projects;
  }

  window.saveProject = saveProject;
  window.saveProjectWithMeta = saveProjectWithMeta;
  window.loadSavedProjects = loadSavedProjects;
  window.viewSavedProject = viewSavedProject;
  window.consumeResumeProject = consumeResumeProject;
  window.startSavedProject = startSavedProject;
  window.showSavedToast = showSavedToast;
})();

