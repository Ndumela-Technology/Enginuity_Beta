// Global contact entry point
(function () {
  "use strict";

  var API_BASE = "https://enginuity-cpl1.onrender.com";

  function mountContactButton(email) {
    var safeEmail = String(email || "").trim();
    if (!safeEmail) return;
    if (document.querySelector(".eng-contact-btn")) return;
    var link = document.createElement("a");
    link.className = "eng-contact-btn";
    link.href = "mailto:" + safeEmail + "?subject=Enginuity%20Feedback";
    link.setAttribute("aria-label", "Contact support");
    link.textContent = "Contact";
    document.body.appendChild(link);
  }

  async function loadContactConfig() {
    try {
      var res = await fetch(API_BASE + "/public-config/contact", { method: "GET" });
      if (!res.ok) return null;
      var data = await res.json();
      return data && data.email ? String(data.email).trim() : "";
    } catch (_) {
      return null;
    }
  }

  async function initContactButton() {
    var email = await loadContactConfig();
    if (!email) return;
    mountContactButton(email);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initContactButton);
  } else {
    initContactButton();
  }
})();
