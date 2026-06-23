(function () {
  "use strict";

  var CFG = window.SDL_BG_SCROLL_CONFIG || {};
  var transitionStart = CFG.transitionStart != null ? CFG.transitionStart : 0.35;
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

  function parseHSLA(str) {
    if (!str) return null;
    var m = str.match(
      /hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+))?\s*\)/
    );
    if (m) return { h: +m[1], s: +m[2], l: +m[3], a: m[4] != null ? +m[4] : 1 };

    var r = str.match(
      /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/
    );
    if (r) return rgbToHSLA(+r[1], +r[2], +r[3], r[4] != null ? +r[4] : 1);

    var hex = str.match(/^#([0-9a-f]{3,8})$/i);
    if (hex) {
      var h = hex[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      if (h.length === 4) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
      var ri = parseInt(h.substring(0, 2), 16);
      var gi = parseInt(h.substring(2, 4), 16);
      var bi = parseInt(h.substring(4, 6), 16);
      var ai = h.length === 8 ? parseInt(h.substring(6, 8), 16) / 255 : 1;
      return rgbToHSLA(ri, gi, bi, ai);
    }
    return null;
  }

  function rgbToHSLA(r, g, b, a) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
      h *= 360;
    }
    return { h: h, s: s * 100, l: l * 100, a: a };
  }

  function lerpHSLA(a, b, t) {
    if (!a || !b) return b || a;
    var dh = b.h - a.h;
    if (dh > 180) dh -= 360;
    if (dh < -180) dh += 360;
    return {
      h: a.h + dh * t,
      s: a.s + (b.s - a.s) * t,
      l: a.l + (b.l - a.l) * t,
      a: a.a + (b.a - a.a) * t
    };
  }

  function hslaToString(c) {
    return (
      "hsla(" +
      c.h.toFixed(2) + "," +
      c.s.toFixed(2) + "%," +
      c.l.toFixed(2) + "%," +
      c.a.toFixed(3) +
      ")"
    );
  }

  function easeInOut(t) {
    return t * t * (3 - 2 * t);
  }

  function easeIn(t) {
    return t * t;
  }

  function easeOut(t) {
    return t * (2 - t);
  }

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
        if (val) vars[v] = parseHSLA(val);
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
      var scrollTop =
        window.pageYOffset || document.documentElement.scrollTop;

      for (var i = 0; i < sections.length; i++) {
        var sec = sections[i];
        var rect = sec.getBoundingClientRect();
        var theme = sec.getAttribute("data-section-theme");
        var vars = themeCache[theme];
        if (!vars) continue;

        var nextSec = sections[i + 1];
        var prevSec = i > 0 ? sections[i - 1] : null;

        var nextTheme = nextSec
          ? nextSec.getAttribute("data-section-theme")
          : null;
        var prevTheme = prevSec
          ? prevSec.getAttribute("data-section-theme")
          : null;
        var nextVars = nextTheme ? themeCache[nextTheme] : null;
        var prevVars = prevTheme ? themeCache[prevTheme] : null;

        var sectionTop = rect.top + scrollTop;
        var sectionH = rect.height;
        var viewportCenter = scrollTop + vh / 2;
        var progress = (viewportCenter - sectionTop) / sectionH;
        progress = Math.max(0, Math.min(1, progress));

        var blendVars = null;

        if (progress <= transitionStart && prevVars) {
          var t = 1 - progress / transitionStart;
          t = applyEasing(Math.max(0, Math.min(1, t)));
          blendVars = blendThemeVars(vars, prevVars, t);
        } else if (progress >= transitionEnd && nextVars) {
          var t2 = (progress - transitionEnd) / (1 - transitionEnd);
          t2 = applyEasing(Math.max(0, Math.min(1, t2)));
          blendVars = blendThemeVars(vars, nextVars, t2);
        } else {
          blendVars = vars;
        }

        applyVarsToSection(sec, blendVars);

        if (transitionNav && header && isTopSection(sec, scrollTop, vh)) {
          applyVarsToNav(header, blendVars);
        }
      }
    }

    function isTopSection(sec, scrollTop, vh) {
      var rect = sec.getBoundingClientRect();
      return rect.top <= vh * 0.15 && rect.bottom > vh * 0.15;
    }

    function blendThemeVars(base, target, t) {
      var result = {};
      activeVars.forEach(function (v) {
        var a = base[v];
        var b = target[v];
        if (a && b) {
          result[v] = lerpHSLA(a, b, t);
        } else {
          result[v] = a || b || null;
        }
      });
      return result;
    }

    function applyVarsToSection(sec, vars) {
      activeVars.forEach(function (v) {
        if (NAV_VARS.indexOf(v) !== -1) return;
        var val = vars[v];
        if (val) {
          if (typeof val === "object") {
            sec.style.setProperty(v, hslaToString(val));
          }
        }
      });
    }

    function applyVarsToNav(nav, vars) {
      NAV_VARS.forEach(function (v) {
        var val = vars[v];
        if (val && typeof val === "object") {
          nav.style.setProperty(v, hslaToString(val));
        }
      });
    }

    function clearOverrides() {
      sections.forEach(function (sec) {
        activeVars.forEach(function (v) {
          sec.style.removeProperty(v);
        });
      });
      if (header) {
        NAV_VARS.forEach(function (v) {
          header.style.removeProperty(v);
        });
      }
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", function () {
      requestAnimationFrame(update);
    });
    window.addEventListener("orientationchange", function () {
      setTimeout(update, 300);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
