// Shared footer navigation for Spark / Enginuity Beta pages.
(function () {
  "use strict";

  function mountFooter() {
    if (document.querySelector(".site-footer")) return;

    var footer = document.createElement("footer");
    footer.className = "site-footer";
    footer.innerHTML =
      '<nav class="site-footer__nav" aria-label="Site footer">' +
      '<a class="site-footer__link" href="about.html">About</a>' +
      '<a class="site-footer__link" href="index.html">Home</a>' +
      '<a class="site-footer__link" href="profile.html">Account</a>' +
      "</nav>" +
      '<p class="site-footer__note">Spark on Enginuity Beta — intelligent AI tools for building and learning.</p>';

    document.body.appendChild(footer);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountFooter);
  } else {
    mountFooter();
  }
})();
