// Visual diagram generator — POST /generate-diagram per project step
(function () {
  "use strict";

  function getApiBase() {
    return window.ENGINUITY_API_BASE || "https://enginuity-cpl1.onrender.com";
  }

  function decodeStepText(btn) {
    var raw = btn.getAttribute("data-step");
    if (!raw) return "";
    try {
      return decodeURIComponent(raw);
    } catch (_) {
      return raw;
    }
  }

  function toStringList(value) {
    if (!value && value !== 0) return [];
    if (Array.isArray(value)) {
      return value
        .map(function (item) {
          if (item == null || item === "") return "";
          if (typeof item === "object") {
            return item.name || item.item || item.text || item.label || "";
          }
          return String(item);
        })
        .filter(Boolean);
    }
    if (typeof value === "string") {
      return value
        .split(/\n|;|•|,/)
        .map(function (s) {
          return s.replace(/^\s*[-*]\s+/, "").trim();
        })
        .filter(Boolean);
    }
    return [String(value)];
  }

  function normalizeSteps(value) {
    if (window.ProjectOutput && typeof window.ProjectOutput.normalizeSteps === "function") {
      return window.ProjectOutput.normalizeSteps(value);
    }
    return toStringList(value);
  }

  function getProjectContext(btn) {
    var project =
      typeof window.getCurrentProject === "function" ? window.getCurrentProject() : null;
    project = project || {};

    var stepText = decodeStepText(btn).trim();
    var allSteps = normalizeSteps(project.steps);
    var stepIndex = parseInt(btn.getAttribute("data-step-index") || "-1", 10);
    if (isNaN(stepIndex) || stepIndex < 0) {
      stepIndex = allSteps.findIndex(function (s) {
        return String(s).trim() === stepText;
      });
      if (stepIndex < 0) stepIndex = 0;
    }

    var totalSteps = parseInt(btn.getAttribute("data-total-steps") || "0", 10);
    if (!totalSteps) totalSteps = allSteps.length || 1;

    var materials = toStringList(project.materials || project.materials_needed);
    if (!materials.length) {
      materials = toStringList(project.materialsSuggested || project.materials_suggested);
    }

    return {
      step: stepText,
      step_index: stepIndex,
      total_steps: totalSteps,
      title: project.title || project.project_name || "",
      description: project.description || "",
      materials: materials,
      all_steps: allSteps
    };
  }

  function setSlotMessage(slot, text, className) {
    slot.hidden = false;
    slot.className = "project-output__diagram-slot" + (className ? " " + className : "");
    slot.textContent = text;
  }

  function setSlotImage(slot, imageUrl, altText) {
    slot.hidden = false;
    slot.className = "project-output__diagram-slot";
    slot.innerHTML = "";
    var img = document.createElement("img");
    img.className = "project-output__diagram-img";
    img.alt = altText || "Step diagram";
    img.src = imageUrl;
    slot.appendChild(img);
  }

  function isLocalApiBase(base) {
    var b = String(base || "");
    return b.indexOf("127.0.0.1") !== -1 || b.indexOf("localhost") !== -1;
  }

  function requestDiagram(base, payload) {
    return fetch(base + "/generate-diagram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) {
        throw new Error("Server returned " + res.status);
      }
      return res.json();
    });
  }

  function handleDiagramClick(btn) {
    var li = btn.closest(".project-output__step");
    if (!li) return;

    var slot = li.querySelector(".project-output__diagram-slot");
    if (!slot) return;

    var payload = getProjectContext(btn);
    if (!payload.step) {
      setSlotMessage(slot, "No step text to illustrate.", "project-output__diagram-slot--error");
      return;
    }

    if (slot.querySelector(".project-output__diagram-img")) {
      slot.hidden = !slot.hidden;
      btn.textContent = slot.hidden ? "Show Diagram" : "Hide Diagram";
      return;
    }

    if (typeof window.canUseDiagram === "function") {
      var limitCheck = window.canUseDiagram();
      if (!limitCheck.allowed) {
        alert(limitCheck.message || "Diagram limit reached.");
        return;
      }
    }

    btn.disabled = true;
    btn.textContent = "Generating diagram...";
    setSlotMessage(slot, "Generating diagram...", "project-output__diagram-slot--loading");

    var primaryBase = getApiBase();
    var remoteBase = "https://enginuity-cpl1.onrender.com";

    requestDiagram(primaryBase, payload)
      .catch(function (err) {
        // Local backend down / unreachable → try hosted API.
        if (isLocalApiBase(primaryBase) && primaryBase !== remoteBase) {
          return requestDiagram(remoteBase, payload);
        }
        throw err;
      })
      .then(function (data) {
        var imageUrl =
          data && typeof data.image_url === "string" ? data.image_url.trim() : "";
        if (!imageUrl) {
          throw new Error("No image returned");
        }
        var alt =
          (payload.title ? payload.title + " — " : "") +
          "Step " +
          (payload.step_index + 1);
        setSlotImage(slot, imageUrl, alt);
        btn.textContent = "Hide Diagram";
        if (typeof window.recordDiagramUse === "function") {
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
          msg = "Could not generate diagram. " + msg;
        }
        setSlotMessage(slot, msg, "project-output__diagram-slot--error");
        btn.textContent = "Show Diagram";
      })
      .finally(function () {
        btn.disabled = false;
      });
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".project-output__diagram-btn");
    if (!btn) return;
    handleDiagramClick(btn);
  });

  function bindDiagramButtons() {
    /* Steps use event delegation; kept for optional explicit re-bind. */
  }

  window.DiagramGenerator = {
    bindDiagramButtons: bindDiagramButtons
  };
})();
