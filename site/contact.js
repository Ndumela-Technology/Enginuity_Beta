// Contact page helpers — floating Contact button removed in favor of contact.html
(function () {
  "use strict";

  var FALLBACK_EMAIL = "ndumela.bonolo@gmail.com";

  function getApiBase() {
    return window.ENGINUITY_API_BASE || "https://enginuity-beta.onrender.com";
  }

  async function loadContactConfig() {
    try {
      var res = await fetch(getApiBase() + "/public-config/contact", { method: "GET" });
      if (!res.ok) return FALLBACK_EMAIL;
      var data = await res.json();
      return data && data.email ? String(data.email).trim() : FALLBACK_EMAIL;
    } catch (_) {
      return FALLBACK_EMAIL;
    }
  }

  function fillContactPage(email) {
    var safeEmail = String(email || FALLBACK_EMAIL).trim() || FALLBACK_EMAIL;
    var mailLink = document.getElementById("contactEmailLink");
    var mailText = document.getElementById("contactEmailText");
    if (mailLink) {
      mailLink.href = "mailto:" + safeEmail + "?subject=Enginuity%20Beta";
    }
    if (mailText) {
      mailText.textContent = safeEmail;
    }
  }

  async function initContactPage() {
    if (!document.getElementById("contactEmailLink")) return;
    var email = await loadContactConfig();
    fillContactPage(email || FALLBACK_EMAIL);
  }

  window.ENGINUITY_CONTACT_EMAIL = FALLBACK_EMAIL;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initContactPage);
  } else {
    initContactPage();
  }
})();
