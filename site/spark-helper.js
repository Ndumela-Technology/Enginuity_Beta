// SparkHelper — floating chat widget (project-context Q&A)
(function () {
  "use strict";

  var API_BASE = "https://enginuity-cpl1.onrender.com";
  var CURRENT_PROJECT_KEY = "current_project";

  var chatHistory = [];
  var panelOpen = false;
  var sending = false;

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatMessageHtml(text) {
    if (!text) return "";
    var value = text;
    var trimmed = String(text).trim();
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        value = JSON.parse(trimmed);
      } catch (_) {}
    }
    if (window.ProjectOutput && typeof window.ProjectOutput.formatExplanationHtml === "function") {
      return window.ProjectOutput.formatExplanationHtml(value, { escapeHtml: escapeHtml });
    }
    value = typeof value === "string" ? value : trimmed;
    var escaped = escapeHtml(String(text));
    var withBold = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    return withBold
      .replace(/^#{1,6}\s*(.+)$/gm, "<strong>$1</strong>")
      .replace(/^\s*[-*]\s+/gm, "• ")
      .replace(/\n/g, "<br>");
  }

  function getCurrentProject() {
    try {
      var raw = localStorage.getItem(CURRENT_PROJECT_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function resolveHelperMode(project) {
    var mode = (window.MODE || "").trim();
    if (mode) return mode;
    if (project && project.mode) {
      mode = String(project.mode).trim();
      if (mode) return mode;
    }
    return (
      localStorage.getItem("enginuity_mode") ||
      localStorage.getItem("forge_mode") ||
      "Apprentice"
    );
  }

  function buildProjectContext(project) {
    if (!project) return "";
    var parts = [];
    if (project.title) parts.push("Project: " + project.title);
    if (project.description) parts.push("Description: " + project.description);
    if (Array.isArray(project.materials) && project.materials.length) {
      parts.push("Materials: " + project.materials.join(", "));
    }
    if (Array.isArray(project.materialsSuggested) && project.materialsSuggested.length) {
      parts.push("Suggested materials: " + project.materialsSuggested.join(", "));
    }
    if (Array.isArray(project.steps) && project.steps.length) {
      parts.push("Steps:\n" + project.steps.map(function (s, i) { return (i + 1) + ". " + s; }).join("\n"));
    }
    if (project.scienceExplanation) parts.push("Science: " + project.scienceExplanation);
    if (project.science_explanation) parts.push("Science: " + project.science_explanation);
    if (project.engineeringExplanation) parts.push("Engineering: " + project.engineeringExplanation);
    if (project.physicsExplanation) parts.push("Physics: " + project.physicsExplanation);
    return parts.join("\n\n");
  }

  function injectWidget() {
    if (document.getElementById("sparkHelperFab")) return;

    var fab = document.createElement("button");
    fab.type = "button";
    fab.id = "sparkHelperFab";
    fab.className = "spark-helper-fab";
    fab.setAttribute("aria-label", "Open SparkHelper");
    fab.innerHTML =
      '<svg class="spark-helper-fab__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
      '</svg>' +
      '<span class="spark-helper-fab__label">SparkHelper — Ask questions to deepen your curiosity</span>';
    fab.addEventListener("click", togglePanel);

    var panel = document.createElement("div");
    panel.id = "sparkHelperPanel";
    panel.className = "spark-helper-panel";
    panel.innerHTML =
      '<div class="spark-helper-panel__header">' +
        '<h3 class="spark-helper-panel__title">SparkHelper</h3>' +
        '<button type="button" class="spark-helper-panel__close" aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="spark-helper-panel__messages" id="sparkHelperMessages"></div>' +
      '<div class="spark-helper-panel__compose">' +
        '<textarea class="spark-helper-panel__input" id="sparkHelperInput" placeholder="Ask about your project..." rows="1"></textarea>' +
        '<button type="button" class="spark-helper-panel__send" id="sparkHelperSend">Send</button>' +
      '</div>';

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    panel.querySelector(".spark-helper-panel__close").addEventListener("click", closePanel);
    document.getElementById("sparkHelperSend").addEventListener("click", sendMessage);

    var input = document.getElementById("sparkHelperInput");
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  function togglePanel() {
    panelOpen ? closePanel() : openPanel();
  }

  var lastProjectTitle = null;

  function syncProjectContext() {
    lastProjectTitle = null;
    var project = getCurrentProject();
    if (project) {
      window.MODE = resolveHelperMode(project);
    }
  }

  function openPanel() {
    var panel = document.getElementById("sparkHelperPanel");
    if (!panel) return;
    panelOpen = true;
    panel.classList.add("is-open");

    var project = getCurrentProject();
    var currentTitle = project ? (project.title || "") : null;

    if (!project) {
      var messages = document.getElementById("sparkHelperMessages");
      if (messages && messages.children.length === 0) {
        appendMessage("system", "No project loaded. Open or generate a project first, then come back to ask questions.");
      }
      disableInput("Open a project first.");
    } else if (currentTitle !== lastProjectTitle) {
      lastProjectTitle = currentTitle;
      chatHistory = [];
      var messages = document.getElementById("sparkHelperMessages");
      if (messages) messages.innerHTML = "";
      appendMessage("system", 'Chatting about: "' + escapeHtml(project.title || "your project") + '"');
      enableInput();
      checkAndApplyLimit();
    }

    var input = document.getElementById("sparkHelperInput");
    if (input && !input.disabled) input.focus();
  }

  function closePanel() {
    var panel = document.getElementById("sparkHelperPanel");
    if (!panel) return;
    panelOpen = false;
    panel.classList.remove("is-open");
  }

  function appendMessage(role, text) {
    var messages = document.getElementById("sparkHelperMessages");
    if (!messages) return;
    var div = document.createElement("div");
    div.className = "spark-helper-msg spark-helper-msg--" + role;
    if (role === "assistant") {
      div.innerHTML = formatMessageHtml(text);
    } else {
      div.innerHTML = escapeHtml(text).replace(/\n/g, "<br>");
    }
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function disableInput(placeholder) {
    var input = document.getElementById("sparkHelperInput");
    var btn = document.getElementById("sparkHelperSend");
    if (input) {
      input.disabled = true;
      input.placeholder = placeholder || "";
    }
    if (btn) btn.disabled = true;
  }

  function enableInput() {
    var input = document.getElementById("sparkHelperInput");
    var btn = document.getElementById("sparkHelperSend");
    if (input) {
      input.disabled = false;
      input.placeholder = "Ask about your project...";
    }
    if (btn) btn.disabled = false;
  }

  function checkAndApplyLimit() {
    if (typeof window.canUseSparkHelper !== "function") return true;
    var check = window.canUseSparkHelper();
    if (!check.allowed) {
      appendMessage("system", "You've used your free questions. Upgrade for unlimited help.");
      disableInput("Limit reached — upgrade your plan.");
      return false;
    }
    return true;
  }

  function sendMessage() {
    if (sending) return;

    var input = document.getElementById("sparkHelperInput");
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;

    var project = getCurrentProject();
    if (!project) {
      appendMessage("system", "No project loaded. Open or generate a project first.");
      disableInput("Open a project first.");
      return;
    }

    if (!checkAndApplyLimit()) return;

    appendMessage("user", text);
    chatHistory.push({ role: "user", content: text });
    input.value = "";

    sending = true;
    var btn = document.getElementById("sparkHelperSend");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "...";
    }

    var context = buildProjectContext(project);

    fetch(API_BASE + "/chat-helper", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        context: context,
        history: chatHistory.slice(0, -1),
        mode: resolveHelperMode(project)
      })
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Server error " + res.status);
        return res.json();
      })
      .then(function (data) {
        var reply = (data && typeof data.reply === "string") ? data.reply.trim() : "";
        if (!reply) reply = "Sorry, I couldn't answer that. Try rephrasing.";

        appendMessage("assistant", reply);
        chatHistory.push({ role: "assistant", content: reply });

        if (typeof window.recordSparkHelperUse === "function") {
          window.recordSparkHelperUse();
        }
        checkAndApplyLimit();
      })
      .catch(function (err) {
        appendMessage("system", "Request failed: " + (err.message || String(err)));
      })
      .finally(function () {
        sending = false;
        if (btn) {
          btn.textContent = "Send";
          btn.disabled = false;
        }
        checkAndApplyLimit();
      });
  }

  function initSparkHelper() {
    injectWidget();
    syncProjectContext();
  }

  window.syncSparkHelperContext = syncProjectContext;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSparkHelper);
  } else {
    initSparkHelper();
  }
})();
