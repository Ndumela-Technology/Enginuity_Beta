// SparkAI brand — inline SVG logo (no broken external image paths)
(function () {
  "use strict";

  var BOLT_RED_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
    '<path d="M35 5 L21 33 H29 L25 59 L47 27 H39 L53 5 Z" fill="#8b1a1a" stroke="#6d1212" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
    '<path d="M35 5 L21 33 H29 L25 59 L47 27 H39 L53 5 Z" fill="none" stroke="#fff" stroke-width="0.6" opacity="0.22" stroke-linejoin="round"/>' +
    "</svg>";

  var BOLT_WHITE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
    '<path d="M35 5 L21 33 H29 L25 59 L47 27 H39 L53 5 Z" fill="#ffffff" stroke="#ffe0e0" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
    "</svg>";

  var ASSET_RED = "assets/spark-ai-bolt.svg";
  var ASSET_WHITE = "assets/spark-ai-bolt-white.svg";

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function svgDataUri(svgMarkup) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgMarkup);
  }

  function resolveAssetPath(relativePath) {
    var path = String(relativePath || "").replace(/^\//, "");
    try {
      var scripts = document.getElementsByTagName("script");
      for (var i = scripts.length - 1; i >= 0; i--) {
        var src = scripts[i].getAttribute("src") || "";
        if (src.indexOf("spark-ai-brand.js") !== -1) {
          var base = src.replace(/[^/]+$/, "");
          return base + path;
        }
      }
    } catch (_) {}
    return path;
  }

  function boltSvgMarkup(variant) {
    return variant === "white" ? BOLT_WHITE_SVG : BOLT_RED_SVG;
  }

  function boltDataUri(variant) {
    return svgDataUri(boltSvgMarkup(variant));
  }

  function boltImg(sizePx, className, variant) {
    var cls = className || "spark-ai-bolt";
    var size = sizePx || 18;
    var v = variant === "white" ? "white" : "red";
    return (
      '<img src="' +
      boltDataUri(v) +
      '" class="' +
      escapeHtml(cls) +
      '" width="' +
      size +
      '" height="' +
      size +
      '" alt="" aria-hidden="true" decoding="async" />'
    );
  }

  function boltInline(sizePx, className, variant) {
    var cls = className || "spark-ai-bolt";
    var size = sizePx || 18;
    var v = variant === "white" ? "white" : "red";
    return (
      '<span class="spark-ai-bolt-wrap ' +
      escapeHtml(cls) +
      '" style="display:inline-flex;width:' +
      size +
      "px;height:" +
      size +
      'px;line-height:0;flex-shrink:0" aria-hidden="true">' +
      boltSvgMarkup(v) +
      "</span>"
    );
  }

  function poweredByHtml(extraClass, variant) {
    var cls = "spark-ai-powered" + (extraClass ? " " + extraClass : "");
    return (
      '<span class="' +
      escapeHtml(cls) +
      '">' +
      boltInline(16, "spark-ai-bolt", variant) +
      "<span>Powered by <strong>SparkAI</strong></span></span>"
    );
  }

  function upgradeBoltImages(root) {
    var scope = root || document;
    var imgs = scope.querySelectorAll(
      'img[src*="spark-ai-bolt"], img.spark-ai-bolt, img.spark-helper-fab__icon-img, img.spark-helper-panel__logo, img.thinking-box__bolt, img.about-hero__bolt, img.enginuity-loader__spark'
    );
    imgs.forEach(function (img) {
      var src = img.getAttribute("src") || "";
      var variant = src.indexOf("white") !== -1 ? "white" : "red";
      var w = parseInt(img.getAttribute("width"), 10) || 18;
      var h = parseInt(img.getAttribute("height"), 10) || w;
      var size = Math.max(w, h);
      var cls = img.getAttribute("class") || "spark-ai-bolt";
      var wrap = document.createElement("span");
      wrap.innerHTML = boltInline(size, cls, variant);
      var inline = wrap.firstElementChild;
      if (!inline || !img.parentNode) return;
      img.parentNode.replaceChild(inline, img);
    });
  }

  window.SPARK_AI_BOLT_SRC = resolveAssetPath(ASSET_RED);
  window.SPARK_AI_BOLT_WHITE_SRC = resolveAssetPath(ASSET_WHITE);
  window.sparkAiBoltDataUri = boltDataUri;
  window.sparkAiBoltImg = boltImg;
  window.sparkAiBoltInline = boltInline;
  window.sparkAiPoweredByHtml = poweredByHtml;
  window.upgradeSparkAiBoltImages = upgradeBoltImages;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      upgradeBoltImages();
    });
  } else {
    upgradeBoltImages();
  }
})();
