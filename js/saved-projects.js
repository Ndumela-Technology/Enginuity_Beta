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

    var allSaved = readAllSaved();
    if (!Array.isArray(allSaved[email])) allSaved[email] = [];

    allSaved[email].push(proj);
    writeAllSaved(allSaved);

    alert("Project saved!");
    if (typeof window.loadSavedProjects === "function") {
      window.loadSavedProjects();
    }
  }

  function viewSavedProject(index) {
    var list = Array.isArray(window.savedProjects) ? window.savedProjects : [];
    var proj = list[index];
    if (!proj) return;
    alert(proj.description || "No description available");
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
        ')">View</button>';
      container.appendChild(row);
    });

    window.savedProjects = projects;
  }

  window.saveProject = saveProject;
  window.loadSavedProjects = loadSavedProjects;
  window.viewSavedProject = viewSavedProject;
})();

