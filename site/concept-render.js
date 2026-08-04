// Concept Render — phased engineering assembly visualization
(function () {
  "use strict";

  var REMOTE_API_BASE = "https://enginuity-cpl1.onrender.com";
  var renderCache = {};

  function getApiBase() {
    return window.ENGINUITY_API_BASE || REMOTE_API_BASE;
  }

  function isLocalApiBase(base) {
    var b = String(base || "");
    return b.indexOf("127.0.0.1") !== -1 || b.indexOf("localhost") !== -1;
  }

  function cacheKey(projectId, phaseIndex) {
    return String(projectId || "anon") + "::phase-" + String(phaseIndex);
  }

  function getActivePhaseIndex(article) {
    return parseInt(article.getAttribute("data-active-phase") || "0", 10) || 0;
  }

  function setActivePhase(article, phaseIndex) {
    var phases = parseInt(article.getAttribute("data-phases-count") || "1", 10) || 1;
    var idx = Math.max(0, Math.min(phaseIndex, phases - 1));
    article.setAttribute("data-active-phase", String(idx));

    article.querySelectorAll(".build-phase").forEach(function (el) {
      var pIdx = parseInt(el.getAttribute("data-phase-index") || "0", 10);
      el.hidden = pIdx !== idx;
    });

    var label = article.querySelector(".concept-render__phase-label");
    var phaseEl = article.querySelector('.build-phase[data-phase-index="' + idx + '"]');
    if (label && phaseEl) {
      var heading = phaseEl.querySelector(".build-phase__title");
      label.textContent = heading ? heading.textContent : "Part " + (idx + 1);
    }

    var prevBtn = article.querySelector('.concept-render__nav-btn[data-action="prev"]');
    var nextBtn = article.querySelector('.concept-render__nav-btn[data-action="next"]');
    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) nextBtn.disabled = idx >= phases - 1;

    var slot = article.querySelector(".concept-render__slot");
    var genBtn = article.querySelector(".concept-render__generate-btn");
    var projectId = article.getAttribute("data-project-id") || "";
    var cached = renderCache[cacheKey(projectId, idx)];
    if (slot) {
      slot.innerHTML = "";
      slot.className = "concept-render__slot";
      if (cached && cached.imageUrl) {
        setSlotImage(slot, cached.imageUrl, cached.alt);
        if (genBtn) genBtn.textContent = "Hide Concept Render";
      } else {
        slot.hidden = true;
        if (genBtn) genBtn.textContent = "Generate Concept Render";
      }
    }
  }

  function setSlotMessage(slot, text, className) {
    slot.hidden = false;
    slot.className = "concept-render__slot" + (className ? " " + className : "");
    slot.textContent = text;
  }

  function setSlotImage(slot, imageUrl, altText) {
    slot.hidden = false;
    slot.className = "concept-render__slot";
    slot.innerHTML = "";
    var img = document.createElement("img");
    img.className = "concept-render__img";
    img.alt = altText || "Concept Render assembly view";
    img.src = imageUrl;
    slot.appendChild(img);
  }

  function getProjectFromArticle(article) {
    if (typeof window.getCurrentProject === "function") {
      var proj = window.getCurrentProject();
      if (proj) return proj;
    }
    try {
      var raw = article.getAttribute("data-project-json");
      if (raw) return JSON.parse(decodeURIComponent(raw));
    } catch (_) {
      /* ignore */
    }
    return {};
  }

  function buildPayload(article, phaseIndex) {
    var project = getProjectFromArticle(article);
    var phases =
      typeof window.ProjectOutput.computeBuildPhases === "function"
        ? window.ProjectOutput.computeBuildPhases(
            window.ProjectOutput.normalizeSteps(project.steps),
            project
          )
        : [];
    var phase = phases[phaseIndex] || { name: "Build", steps: [], stepStartIndex: 0 };
    var materials =
      typeof window.ProjectOutput.toStringList === "function"
        ? window.ProjectOutput.toStringList(project.materials || project.materials_needed)
        : [];

    return {
      title: project.title || project.project_name || "",
      description: project.description || "",
      materials: materials,
      phase_name: phase.name,
      phase_title: phase.title,
      phase_index: phaseIndex,
      total_phases: phases.length,
      phase_steps: phase.steps,
      all_steps: window.ProjectOutput.normalizeSteps(project.steps),
      step_start_index: phase.stepStartIndex
    };
  }

  function requestConceptRender(base, payload) {
    return fetch(base + "/generate-concept-render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            throw new Error(
              (data && data.error) || "Server returned " + res.status
            );
          });
      }
      return res.json();
    });
  }

  function generateForPhase(article, phaseIndex) {
    var slot = article.querySelector(".concept-render__slot");
    var genBtn = article.querySelector(".concept-render__generate-btn");
    if (!slot || !genBtn) return;

    var projectId = article.getAttribute("data-project-id") || "";
    var key = cacheKey(projectId, phaseIndex);
    if (renderCache[key] && renderCache[key].imageUrl && !slot.hidden) {
      slot.hidden = true;
      genBtn.textContent = "Generate Concept Render";
      return;
    }
    if (renderCache[key] && renderCache[key].imageUrl) {
      setSlotImage(slot, renderCache[key].imageUrl, renderCache[key].alt);
      genBtn.textContent = "Hide Concept Render";
      return;
    }

    if (typeof window.canUseConceptRender === "function") {
      var limitCheck = window.canUseConceptRender();
      if (!limitCheck.allowed) {
        alert(limitCheck.message || "Concept Render limit reached.");
        return;
      }
    } else if (typeof window.canUseDiagram === "function") {
      var legacyCheck = window.canUseDiagram();
      if (!legacyCheck.allowed) {
        alert(legacyCheck.message || "Concept Render limit reached.");
        return;
      }
    }

    var payload = buildPayload(article, phaseIndex);
    if (!payload.phase_steps || !payload.phase_steps.length) {
      setSlotMessage(slot, "No steps in this phase to illustrate.", "concept-render__slot--error");
      return;
    }

    genBtn.disabled = true;
    genBtn.textContent = "Generating Concept Render…";
    setSlotMessage(slot, "Generating Concept Render…", "concept-render__slot--loading");

    var primaryBase = getApiBase();
    requestConceptRender(primaryBase, payload)
      .catch(function (err) {
        if (isLocalApiBase(primaryBase) && primaryBase !== REMOTE_API_BASE) {
          return requestConceptRender(REMOTE_API_BASE, payload);
        }
        throw err;
      })
      .then(function (data) {
        var imageUrl =
          data && typeof data.image_url === "string" ? data.image_url.trim() : "";
        if (!imageUrl) throw new Error("No image returned");
        var alt =
          (payload.title ? payload.title + " — " : "") + payload.phase_title;
        renderCache[key] = { imageUrl: imageUrl, alt: alt };
        setSlotImage(slot, imageUrl, alt);
        genBtn.textContent = "Hide Concept Render";
        if (typeof window.recordConceptRenderUse === "function") {
          window.recordConceptRenderUse();
        } else if (typeof window.recordDiagramUse === "function") {
          window.recordDiagramUse();
        }
      })
      .catch(function (err) {
        var msg = err && err.message ? err.message : "Try again.";
        if (/Failed to fetch|NetworkError|Load failed/i.test(String(msg))) {
          msg =
            "Could not reach the API. Start the backend on http://127.0.0.1:8000 " +
            "(or check your internet if using the hosted API).";
        } else {
          msg = "Could not generate Concept Render. " + msg;
        }
        setSlotMessage(slot, msg, "concept-render__slot--error");
        genBtn.textContent = "Generate Concept Render";
      })
      .finally(function () {
        genBtn.disabled = false;
      });
  }

  function bindArticle(article) {
    if (!article || article.getAttribute("data-concept-render-bound") === "true") {
      return;
    }
    article.setAttribute("data-concept-render-bound", "true");
    setActivePhase(article, 0);
  }

  function initConceptRender(root) {
    var scope = root || document;
    scope.querySelectorAll(".project-output[data-project-id]").forEach(bindArticle);
  }

  document.addEventListener("click", function (e) {
    var navBtn = e.target.closest(".concept-render__nav-btn");
    if (navBtn) {
      var article = navBtn.closest(".project-output");
      if (!article) return;
      var action = navBtn.getAttribute("data-action");
      var current = getActivePhaseIndex(article);
      if (action === "prev") setActivePhase(article, current - 1);
      if (action === "next") setActivePhase(article, current + 1);
      return;
    }

    var genBtn = e.target.closest(".concept-render__generate-btn");
    if (genBtn) {
      var container = genBtn.closest(".project-output");
      if (!container) return;
      generateForPhase(container, getActivePhaseIndex(container));
    }
  });

  document.addEventListener("DOMContentLoaded", function () {
    initConceptRender(document);
  });

  var originalAfter = window.ProjectOutput && window.ProjectOutput.afterStructuredRender;
  if (window.ProjectOutput) {
    window.ProjectOutput.afterStructuredRender = function (proj) {
      if (typeof originalAfter === "function") originalAfter(proj);
      initConceptRender(document);
    };
  }

  window.ConceptRender = {
    init: initConceptRender,
    setActivePhase: setActivePhase
  };
})();
