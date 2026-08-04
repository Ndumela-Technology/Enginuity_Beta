/**
 * Enginuity — page transition loader (clean version)
 */
(function () {
  "use strict";

  const LOADER_ID = "enginuity-loader";

  // =========================
  // SVG GEAR (your original)
  // =========================
  const GEAR_SVG = `
    <svg class="enginuity-gear" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"
        d="M24 4v5M24 39v5M4 24h5M39 24h5M9.9 9.9l3.5 3.5M34.6 34.6l3.5 3.5M9.9 38.1l3.5-3.5M34.6 13.4l3.5-3.5" />
      <circle cx="24" cy="24" r="9" stroke="currentColor" stroke-width="2.2" />
      <path stroke="currentColor" stroke-width="2" d="M24 19v10M19 24h10" />
    </svg>
  `;

  // =========================
  // CREATE LOADER (once)
  // =========================
  function getLoader() {
    let loader = document.getElementById(LOADER_ID);

    if (loader) return loader;

    loader = document.createElement("div");
    loader.id = LOADER_ID;
    loader.className = "enginuity-loader";

    loader.innerHTML = `
      <img class="enginuity-loader__logo" src="assets/logo-white.svg" alt="Enginuity" />

      <p class="enginuity-loader__tagline">
        Turning dreams into a reality...
      </p>

      <span class="spark-ai-powered enginuity-loader__powered" id="loaderPoweredBy"></span>

      <div class="enginuity-loader__bottom">
        ${GEAR_SVG}
        <span class="enginuity-loader__dots">····</span>
      </div>
    `;

    document.body.appendChild(loader);

    var powered = loader.querySelector("#loaderPoweredBy");
    if (powered) {
      if (typeof window.sparkAiBoltInline === "function") {
        powered.outerHTML =
          '<span class="spark-ai-powered enginuity-loader__powered">' +
          window.sparkAiBoltInline(52, "enginuity-loader__spark", "white") +
          "<span>Powered by <strong>SparkAI</strong></span></span>";
      } else {
        powered.innerHTML =
          '<span class="spark-ai-bolt-wrap enginuity-loader__spark" style="display:inline-flex;width:52px;height:52px">' +
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true">' +
          '<path d="M35 5 L21 33 H29 L25 59 L47 27 H39 L53 5 Z" fill="#ffffff" stroke="#ffe0e0" stroke-width="2" stroke-linejoin="round"/></svg></span>' +
          "<span>Powered by <strong>SparkAI</strong></span>";
      }
    }

    return loader;
  }

  // =========================
  // SHOW LOADER
  // =========================
  function showLoader() {
    const loader = getLoader();
    loader.classList.add("is-active"); // IMPORTANT: matches your CSS
  }

  // =========================
  // NAVIGATION HANDLER
  // =========================
  function handleClick(e) {
    const link = e.target.closest("a[href]");
    if (!link) return;

    const href = link.getAttribute("href");

    // ignore external links
    if (
      !href ||
      href.startsWith("http") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:")
    ) {
      return;
    }

    // allow normal behavior for safety
    e.preventDefault();

    showLoader();

    setTimeout(() => {
      window.location.href = href;
    }, 400);
  }

  // =========================
  // INIT
  // =========================
  document.addEventListener("DOMContentLoaded", function () {
    document.addEventListener("click", handleClick);
  });
})();
