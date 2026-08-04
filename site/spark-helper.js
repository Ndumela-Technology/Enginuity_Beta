// SparkHelper — floating chat widget (project-context Q&A)
(function () {
  "use strict";

  var API_BASE = window.ENGINUITY_API_BASE || "https://enginuity-cpl1.onrender.com";
  var SPARK_HELPER_PAGES = [
    "apprentice.html",
    "associate.html",
    "innovator.html",
    "innovator-lite.html"
  ];
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

  function projectFingerprint(project) {
    if (!project) return "";
    if (project.id) return String(project.id);
    var stepsLen = Array.isArray(project.steps) ? project.steps.length : 0;
    return (
      String(project.title || "") +
      "|" +
      stepsLen +
      "|" +
      String(project.description || "").slice(0, 48)
    );
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

  var MAX_CONTEXT_CHARS = 3200;

  function buildProjectContext(project) {
    if (!project) return "";
    var parts = [];
    if (project.title) parts.push("Project: " + project.title);
    if (project.description) parts.push("Description: " + project.description);
    if (Array.isArray(project.materials) && project.materials.length) {
      parts.push("Materials: " + project.materials.join(", "));
    }
    if (Array.isArray(project.materialsSuggested) && project.materialsSuggested.length) {
      parts.push("Suggested: " + project.materialsSuggested.join(", "));
    }
    if (Array.isArray(project.steps) && project.steps.length) {
      var stepLines = project.steps.slice(0, 12).map(function (s, i) {
        var line = (i + 1) + ". " + String(s);
        return line.length > 220 ? line.slice(0, 217) + "…" : line;
      });
      if (project.steps.length > 12) stepLines.push("…(" + (project.steps.length - 12) + " more steps)");
      parts.push("Steps:\n" + stepLines.join("\n"));
    }
    var science = project.scienceExplanation || project.science_explanation;
    if (science) parts.push("Science: " + String(science).slice(0, 500));
    if (project.engineeringExplanation) {
      parts.push("Engineering: " + String(project.engineeringExplanation).slice(0, 400));
    }
    if (project.physicsExplanation) {
      parts.push("Physics: " + String(project.physicsExplanation).slice(0, 400));
    }
    var text = parts.join("\n\n");
    if (text.length > MAX_CONTEXT_CHARS) {
      return text.slice(0, MAX_CONTEXT_CHARS - 16) + "\n…(truncated)";
    }
    return text;
  }

  function injectWidget() {
    if (document.getElementById("sparkHelperFab")) return;

    var fab = document.createElement("button");
    fab.type = "button";
    fab.id = "sparkHelperFab";
    fab.className = "spark-helper-fab";
    fab.setAttribute("aria-label", "Open SparkHelper");
    fab.innerHTML =
      (typeof window.sparkAiBoltInline === "function"
        ? window.sparkAiBoltInline(24, "spark-helper-fab__icon-img", "red")
        : '<img class="spark-helper-fab__icon-img" src="' + (window.sparkAiBoltDataUri ? window.sparkAiBoltDataUri("red") : "assets/spark-ai-bolt.svg") + '" width="24" height="24" alt="" aria-hidden="true" />') +
      '<span class="spark-helper-fab__label">SparkHelper — Ask questions to deepen your curiosity</span>';
    fab.addEventListener("click", togglePanel);

    var panel = document.createElement("div");
    panel.id = "sparkHelperPanel";
    panel.className = "spark-helper-panel";
    panel.innerHTML =
      '<div class="spark-helper-panel__header">' +
        '<div class="spark-helper-panel__brand">' +
          (typeof window.sparkAiBoltInline === "function"
            ? window.sparkAiBoltInline(28, "spark-helper-panel__logo", "red")
            : '<img class="spark-helper-panel__logo" src="assets/spark-ai-bolt.svg" width="28" height="28" alt="" aria-hidden="true" />') +
          '<div class="spark-helper-panel__titles">' +
            '<h3 class="spark-helper-panel__title">SparkHelper</h3>' +
            '<p class="spark-ai-powered spark-ai-powered--panel">Powered by <strong>SparkAI</strong></p>' +
          '</div>' +
        '</div>' +
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

  var lastProjectFingerprint = null;

  function readActiveProject() {
    if (typeof window.getCurrentProject === "function") {
      return window.getCurrentProject();
    }
    return getCurrentProject();
  }

  function applyActiveProject(project, options) {
    options = options || {};
    var fp = projectFingerprint(project);

    if (!project) {
      lastProjectFingerprint = null;
      chatHistory = [];
      var emptyMessages = document.getElementById("sparkHelperMessages");
      if (emptyMessages && options.updateUi !== false) {
        emptyMessages.innerHTML = "";
        appendMessage(
          "system",
          "No project loaded. Open or generate a project first, then come back to ask questions."
        );
      }
      disableInput("Open a project first.");
      return;
    }

    var projectChanged = fp !== lastProjectFingerprint;
    if (projectChanged) {
      lastProjectFingerprint = fp;
      chatHistory = [];
    } else if (!options.force && !options.updateUi) {
      return;
    }

    if (options.updateUi !== false) {
      var messages = document.getElementById("sparkHelperMessages");
      if (messages && projectChanged) {
        messages.innerHTML = "";
        appendMessage(
          "system",
          'Now chatting about: "' + escapeHtml(project.title || "your project") + '"'
        );
      }
      enableInput();
      checkAndApplyLimit();
    }
  }

  function syncProjectContext() {
    var project = readActiveProject();
    if (project) {
      window.MODE = resolveHelperMode(project);
    }
    applyActiveProject(project, { updateUi: panelOpen });
  }

  function openPanel() {
    var panel = document.getElementById("sparkHelperPanel");
    if (!panel) return;
    panelOpen = true;
    panel.classList.add("is-open");

    applyActiveProject(readActiveProject(), { updateUi: true, force: true });

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

  function showThinkingBubble() {
    var messages = document.getElementById("sparkHelperMessages");
    if (!messages) return null;
    var div = document.createElement("div");
    div.className = "spark-helper-msg spark-helper-msg--assistant spark-helper-msg--thinking";
    div.id = "sparkHelperThinking";
    div.innerHTML =
      '<span class="spark-thinking-label">SparkHelper is thinking...</span>' +
      '<span class="spark-thinking-shimmer" aria-hidden="true"></span>' +
      '<span class="spark-thinking-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>' +
      '<span class="spark-ai-powered spark-ai-powered--thinking">' +
        (typeof window.sparkAiBoltInline === "function"
        ? window.sparkAiBoltInline(14, "spark-ai-bolt", "red")
        : '<img class="spark-ai-bolt" src="assets/spark-ai-bolt.svg" width="14" height="14" alt="" aria-hidden="true" />') +
        '<span>Powered by <strong>SparkAI</strong></span>' +
      '</span>';
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  function removeThinkingBubble() {
    var el = document.getElementById("sparkHelperThinking");
    if (el) el.remove();
  }

  function ensureStreamingBubble() {
    removeThinkingBubble();
    var existing = document.getElementById("sparkHelperStream");
    if (existing) return existing;
    var messages = document.getElementById("sparkHelperMessages");
    if (!messages) return null;
    var div = document.createElement("div");
    div.className = "spark-helper-msg spark-helper-msg--assistant";
    div.id = "sparkHelperStream";
    messages.appendChild(div);
    return div;
  }

  function removeStreamingBubble() {
    var el = document.getElementById("sparkHelperStream");
    if (el) el.remove();
  }

  function readChatStream(response, onDelta) {
    if (!response.body || typeof response.body.getReader !== "function") {
      return Promise.reject(new Error("stream_unavailable"));
    }
    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var buffer = "";
    var full = "";

    function processBlock(block) {
      block.split("\n").forEach(function (line) {
        if (line.indexOf("data: ") !== 0) return;
        var payload = line.slice(6).trim();
        if (payload === "[DONE]") return;
        try {
          var parsed = JSON.parse(payload);
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.delta) {
            full += parsed.delta;
            onDelta(full);
          }
        } catch (e) {
          if (e.message && e.message !== "stream_unavailable") throw e;
        }
      });
    }

    function pump() {
      return reader.read().then(function (result) {
        if (result.done) return full;
        buffer += decoder.decode(result.value, { stream: true });
        var parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        parts.forEach(processBlock);
        return pump();
      });
    }

    return pump();
  }

  function requestHelperReply(payload) {
    return fetch(API_BASE + "/chat-helper", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({}, payload, { stream: true }))
    }).then(function (res) {
      if (!res.ok) throw new Error("Server error " + res.status);
      removeThinkingBubble();
      var streamEl = ensureStreamingBubble();
      return readChatStream(res, function (partial) {
        if (streamEl) streamEl.innerHTML = formatMessageHtml(partial);
        var messages = document.getElementById("sparkHelperMessages");
        if (messages) messages.scrollTop = messages.scrollHeight;
      }).catch(function () {
        removeStreamingBubble();
        showThinkingBubble();
        return fetch(API_BASE + "/chat-helper", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }).then(function (res2) {
          if (!res2.ok) throw new Error("Server error " + res2.status);
          return res2.json();
        }).then(function (data) {
          var reply = (data && typeof data.reply === "string") ? data.reply.trim() : "";
          return reply;
        });
      });
    }).then(function (reply) {
      if (typeof reply === "string") return reply;
      return "";
    });
  }

  function sendMessage() {
    if (sending) return;

    var input = document.getElementById("sparkHelperInput");
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;

    syncProjectContext();
    var project = readActiveProject();
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
      btn.textContent = "…";
    }

    showThinkingBubble();

    var payload = {
      message: text,
      context: buildProjectContext(project),
      history: chatHistory.slice(0, -1),
      mode: resolveHelperMode(project)
    };

    requestHelperReply(payload)
      .then(function (reply) {
        removeThinkingBubble();
        var streamEl = document.getElementById("sparkHelperStream");
        if (streamEl) {
          streamEl.id = "";
          if (!reply) {
            streamEl.remove();
            reply = "Sorry, I couldn't answer that. Try rephrasing.";
            appendMessage("assistant", reply);
          } else {
            streamEl.innerHTML = formatMessageHtml(reply);
          }
        } else {
          if (!reply) reply = "Sorry, I couldn't answer that. Try rephrasing.";
          appendMessage("assistant", reply);
        }

        chatHistory.push({ role: "assistant", content: reply });

        if (typeof window.recordSparkHelperUse === "function") {
          window.recordSparkHelperUse();
        }
        checkAndApplyLimit();
      })
      .catch(function (err) {
        removeThinkingBubble();
        removeStreamingBubble();
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

  function isSparkHelperPage() {
    var path = window.location.pathname || "";
    var page = path.split("/").pop() || "";
    if (!page) page = "index.html";
    return SPARK_HELPER_PAGES.indexOf(page) !== -1;
  }

  function initSparkHelper() {
    if (!isSparkHelperPage()) return;
    injectWidget();
    syncProjectContext();
  }

  window.syncSparkHelperContext = syncProjectContext;
  window.buildSparkProjectContext = buildProjectContext;

  document.addEventListener("enginuity:project-changed", function (e) {
    var project = (e && e.detail && e.detail.project) || readActiveProject();
    if (project) {
      window.MODE = resolveHelperMode(project);
    }
    applyActiveProject(project, { updateUi: panelOpen });
  });

  window.addEventListener("storage", function (e) {
    if (e.key === CURRENT_PROJECT_KEY) {
      syncProjectContext();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSparkHelper);
  } else {
    initSparkHelper();
  }
})();
