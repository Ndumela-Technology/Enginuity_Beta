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

  function setSlotMessage(slot, text, className) {
    slot.hidden = false;
    slot.className = "project-output__diagram-slot" + (className ? " " + className : "");
    slot.textContent = text;
  }

  function setSlotImage(slot, imageUrl) {
    slot.hidden = false;
    slot.className = "project-output__diagram-slot";
    slot.innerHTML = "";
    var img = document.createElement("img");
    img.className = "project-output__diagram-img";
    img.alt = "Step diagram";
    img.src = imageUrl;
    slot.appendChild(img);
  }

  function handleDiagramClick(btn) {
    var li = btn.closest(".project-output__step");
    if (!li) return;

    var slot = li.querySelector(".project-output__diagram-slot");
    if (!slot) return;

    var stepText = decodeStepText(btn).trim();
    if (!stepText) {
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

    fetch(getApiBase() + "/generate-diagram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: stepText })
    })
      .then(function (res) {
        if (!res.ok) {
          throw new Error("Server returned " + res.status);
        }
        return res.json();
      })
      .then(function (data) {
        var imageUrl =
          data && typeof data.image_url === "string" ? data.image_url.trim() : "";
        if (!imageUrl) {
          throw new Error("No image returned");
        }
        setSlotImage(slot, imageUrl);
        btn.textContent = "Hide Diagram";
        if (typeof window.recordDiagramUse === "function") {
          window.recordDiagramUse();
        }
      })
      .catch(function (err) {
        setSlotMessage(
          slot,
          "Could not generate diagram. " + (err && err.message ? err.message : "Try again."),
          "project-output__diagram-slot--error"
        );
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
