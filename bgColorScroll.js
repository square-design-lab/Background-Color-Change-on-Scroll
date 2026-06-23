(function () {
  "use strict";

  var CFG = window.SDL_BG_SCROLL_CONFIG || {};
  var transitionEnd = CFG.transitionEnd != null ? CFG.transitionEnd : 0.65;
  var easingMode = CFG.easing || "ease";
  var excludeIds = CFG.excludeSections || [];
  var includeOnly = CFG.includeSections || [];
  var transitionNav = CFG.transitionNav !== false;
  var skipGroups = CFG.skipProperties || [];

  var THEME_VARS = [
    "--siteBackgroundColor",
    "--headingExtraLargeColor",
    "--headingLargeColor",
    "--headingMediumColor",
    "--headingSmallColor",
    "--paragraphLargeColor",
    "--paragraphMediumColor",
    "--paragraphSmallColor",
    "--paragraphLinkColor",
    "--primaryButtonBackgroundColor",
    "--primaryButtonTextColor",
    "--secondaryButtonBackgroundColor",
    "--secondaryButtonTextColor"
  ];

  var NAV_VARS = [
    "--siteTitleColor",
    "--navigationLinkColor"
  ];

  var GROUP_MAP = {
    background: ["--siteBackgroundColor"],
    headings: [
      "--headingExtraLargeColor",
      "--headingLargeColor",
      "--headingMediumColor",
      "--headingSmallColor"
    ],
    body: [
      "--paragraphLargeColor",
      "--paragraphMediumColor",
      "--paragraphSmallColor"
    ],
    links: ["--paragraphLinkColor"],
    buttons: [
      "--primaryButtonBackgroundColor",
      "--primaryButtonTextColor",
      "--secondaryButtonBackgroundColor",
      "--secondaryButtonTextColor"
    ],
    nav: ["--siteTitleColor", "--navigationLinkColor"]
  };

  var activeVars = THEME_VARS.slice();
  if (transitionNav) activeVars = activeVars.concat(NAV_VARS);

  if (skipGroups.length) {
    var skippedVars = {};
    skipGroups.forEach(function (g) {
      if (GROUP_MAP[g]) GROUP_MAP[g].forEach(function (v) { skippedVars[v] = true; });
    });
    activeVars = activeVars.filter(function (v) { return !skippedVars[v]; });
  }

  // Parse any CSS color string to {r,g,b,a} for RGB-space interpolation.
  // RGB lerp never produces out-of-theme hues the way HSL lerp does.
  function parseColor(str) {
    if (!str) return null;

    var m = str.match(
      /hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+))?\s*\)/
    );
    if (m) {
      return hslToRgb(+m[1] / 360, +m[2] / 100, +m[3] / 100, m[4] != null ? +m[4] : 1);
    }

    var r = str.match(
      /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/
    );
    if (r) return { r: +r[1], g: +r[2], b: +r[3], a: r[4] != null ? +r[4] : 1 };

    var hex = str.match(/^#([0-9a-f]{3,8})$/i);
    if (hex) {
      var h = hex[1];
      if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      if (h.length === 4) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]+h[3]+h[3];
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
      };
    }
    return null;
  }

  function hslToRgb(h, s, l, a) {
    var r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return { r: r * 255, g: g * 255, b: b * 255, a: a };
  }

  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }

  function lerpRGB(a, b, t) {
    if (!a || !b) return b || a;
    return {
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t,
      a: a.a + (b.a - a.a) * t
    };
  }

  function rgbToString(c) {
    return (
      "rgba(" +
      Math.round(c.r) + "," +
      Math.round(c.g) + "," +
      Math.round(c.b) + "," +
      c.a.toFixed(3) +
      ")"
    );
  }

  function easeInOut(t) { return t * t * (3 - 2 * t); }
  function easeIn(t) { return t * t; }
  function easeOut(t) { return t * (2 - t); }

  function applyEasing(t) {
    if (easingMode === "linear") return t;
    if (easingMode === "ease-in") return easeIn(t);
    if (easingMode === "ease-out") return easeOut(t);
    return easeInOut(t);
  }

  function init() {
    var allSections = Array.prototype.slice.call(
      document.querySelectorAll("#sections .page-section")
    );
    if (!allSections.length) return;

    var sections = allSections.filter(function (sec) {
      var id = sec.getAttribute("data-section-id") || sec.id;
      if (includeOnly.length) return includeOnly.indexOf(id) !== -1;
      return excludeIds.indexOf(id) === -1;
    });

    if (sections.length < 2) return;

    var themeCache = {};
    var allThemes = [
      "white", "white-bold", "light", "light-bold",
      "bright", "bright-inverse", "dark", "dark-bold",
      "black", "black-bold"
    ];

    function cacheTheme(el, theme) {
      if (themeCache[theme]) return;
      var cs = getComputedStyle(el);
      var vars = {};
      activeVars.forEach(function (v) {
        var val = cs.getPropertyValue(v).trim();
        if (val) vars[v] = parseColor(val);
      });
      themeCache[theme] = vars;
    }

    sections.forEach(function (sec) {
      var theme = sec.getAttribute("data-section-theme");
      if (theme) cacheTheme(sec, theme);
    });

    allThemes.forEach(function (theme) {
      if (themeCache[theme]) return;
      var probe = document.querySelector('[data-section-theme="' + theme + '"]');
      if (probe) cacheTheme(probe, theme);
    });

    var header = document.querySelector("#header");
    var ticking = false;

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    function update() {
      ticking = false;
      var vh = window.innerHeight;
      var scrollTop = window.pageYOffset || document.documentElement.scrollTop;

      for (var i = 0; i < sections.length; i++) {
        var sec = sections[i];
        var rect = sec.getBoundingClientRect();
        var theme = sec.getAttribute("data-section-theme");
        var vars = themeCache[theme];
        if (!vars) continue;

        var prevSec = i > 0 ? sections[i - 1] : null;
        var prevTheme = prevSec ? prevSec.getAttribute("data-section-theme") : null;
        var prevVars = prevTheme ? themeCache[prevTheme] : null;

        var sectionTop = rect.top + scrollTop;
        var sectionH = rect.height;
        var viewportCenter = scrollTop + vh / 2;
        var progress = (viewportCenter - sectionTop) / sectionH;
        progress = Math.max(0, Math.min(1, progress));

        var blendVars;
        if (progress <= transitionEnd && prevVars) {
          var t = applyEasing(Math.max(0, Math.min(1, 1 - progress / transitionEnd)));
          blendVars = blendThemeVars(vars, prevVars, t);
        } else {
          blendVars = vars;
        }

        applyVarsToSection(sec, blendVars);

        if (transitionNav && header && isTopSection(rect, vh)) {
          applyVarsToNav(header, blendVars);
        }
      }
    }

    function isTopSection(rect, vh) {
      return rect.top <= vh * 0.15 && rect.bottom > vh * 0.15;
    }

    function blendThemeVars(base, target, t) {
      var result = {};
      activeVars.forEach(function (v) {
        var a = base[v];
        var b = target[v];
        result[v] = (a && b) ? lerpRGB(a, b, t) : (a || b || null);
      });
      return result;
    }

    function applyVarsToSection(sec, vars) {
      activeVars.forEach(function (v) {
        if (NAV_VARS.indexOf(v) !== -1) return;
        var val = vars[v];
        if (val && typeof val === "object") {
          sec.style.setProperty(v, rgbToString(val));
        }
      });
    }

    function applyVarsToNav(nav, vars) {
      NAV_VARS.forEach(function (v) {
        var val = vars[v];
        if (val && typeof val === "object") {
          nav.style.setProperty(v, rgbToString(val));
        }
      });
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", function () { requestAnimationFrame(update); });
    window.addEventListener("orientationchange", function () { setTimeout(update, 300); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
