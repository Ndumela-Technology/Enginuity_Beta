// Shared footer navigation for Spark / Enginuity Beta pages.
(function () {
  "use strict";

  function mountFooter() {
    if (document.querySelector(".site-footer")) return;

    var footer = document.createElement("footer");
    footer.className = "site-footer";
    footer.innerHTML =
      '<nav class="site-footer__nav" aria-label="Site footer">' +
      '<a class="site-footer__link" href="index.html">Home</a>' +
      '<a class="site-footer__link" href="about.html">About</a>' +
      '<a class="site-footer__link" href="profile.html">Account</a>' +
      '<a class="site-footer__link" href="contact.html">Contact</a>' +
      "</nav>" +
      '<p class="site-footer__note">Spark on Enginuity Beta — intelligent AI tools for building and learning.</p>' +
      '<p class="site-footer__powered">' +
      (typeof window.sparkAiPoweredByHtml === "function"
        ? window.sparkAiPoweredByHtml("spark-ai-powered--footer", "red")
        : '<span class="spark-ai-powered spark-ai-powered--footer"><img class="spark-ai-bolt" src="assets/spark-ai-bolt.svg" width="16" height="16" alt="" aria-hidden="true" /><span>Powered by <strong>SparkAI</strong></span></span>') +
      "</p>";

    document.body.appendChild(footer);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountFooter);
  } else {
    mountFooter();
  }
})();
