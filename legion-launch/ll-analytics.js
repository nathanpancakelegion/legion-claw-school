// legion-launch/ll-analytics.js
// PostHog instrumentation for legionclawschool.com/legion-launch + /legion-launch/terms.
// Loaded AFTER /config.js so window.posthog is already initialized.
// Project 356914 (US Cloud). Token loaded by /config.js.
// See vault: 05-Platform-Build/Legion-Launch-Site/POSTHOG-PATCH.md

(function () {
  "use strict";
  if (typeof window === "undefined") return;
  if (!window.posthog) { console.warn("[ll-analytics] window.posthog missing"); return; }
  var ph = window.posthog;
  var path = (window.location.pathname || "").replace(/\/$/, "") || "/";
  var isTerms = /\/legion-launch\/terms$/i.test(path);
  var isLL = !isTerms && /\/legion-launch$/i.test(path);
  if (!isLL && !isTerms) return;

  function parseUtm() {
    var p = new URLSearchParams(window.location.search), out = {};
    ["utm_source","utm_medium","utm_campaign","utm_term","utm_content"].forEach(function (k) {
      var v = p.get(k); if (v) out[k] = v;
    });
    return out;
  }
  function scrollPct() {
    var d = document.documentElement, s = window.pageYOffset || d.scrollTop;
    var h = d.scrollHeight - d.clientHeight;
    return h <= 0 ? 0 : Math.min(100, Math.round((s / h) * 100));
  }
  function safeCapture(event, props) {
    try { ph.capture(event, Object.assign({ ll_page: isTerms ? "terms" : "landing" }, props || {})); }
    catch (e) { console.warn("[ll-analytics] capture failed", event, e); }
  }
  function throttle(fn, wait) {
    var last = 0, timer = null;
    return function () {
      var now = Date.now(), args = arguments, ctx = this, rem = wait - (now - last);
      if (rem <= 0) { if (timer) { clearTimeout(timer); timer = null; } last = now; fn.apply(ctx, args); }
      else if (!timer) { timer = setTimeout(function () { last = Date.now(); timer = null; fn.apply(ctx, args); }, rem); }
    };
  }

  var loadedAt = Date.now();
  safeCapture(isTerms ? "ll_terms_view" : "ll_view", Object.assign({
    referrer: document.referrer || null, ll_cohort: "june_2026"
  }, parseUtm()));

  var thresholds = [25, 50, 75, 100], fired = {};
  window.addEventListener("scroll", throttle(function () {
    var pct = scrollPct();
    thresholds.forEach(function (t) {
      if (pct >= t && !fired[t]) { fired[t] = true; safeCapture("ll_scroll_depth", { threshold: t }); }
    });
  }, 250), { passive: true });

  if ("IntersectionObserver" in window) {
    var seen = {}, sections = document.querySelectorAll("section[id], [data-ll-section]");
    if (sections.length) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          var n = e.target.getAttribute("data-ll-section") || e.target.id || "unknown";
          if (seen[n]) return; seen[n] = true;
          safeCapture("ll_section_view", { section: n });
        });
      }, { threshold: 0.45 });
      sections.forEach(function (s) { io.observe(s); });
    }
  }

  document.addEventListener("click", function (ev) {
    var el = ev.target;
    while (el && el !== document.body) {
      if (el.tagName === "A" || el.tagName === "BUTTON") break;
      el = el.parentElement;
    }
    if (!el || el === document.body) return;
    var label = (el.getAttribute("data-ll-cta") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80);
    var href = el.getAttribute("href") || null;
    if (el.tagName === "A" && href && /^https?:\/\//i.test(href)) {
      try { var u = new URL(href);
        if (!/legionclawschool\.com$/i.test(u.hostname)) safeCapture("ll_outbound_click", { href: href, label: label });
      } catch (e) {}
    }
    if (el.tagName === "A" && (href === "/" || href === "/index.html")) safeCapture("ll_back_to_homepage", { label: label });
    if (/apply/i.test(label) || el.hasAttribute("data-ll-cta")) {
      safeCapture("ll_cta_click", { cta_label: label, scroll_pct: scrollPct(), href: href });
    }
  }, true);

  if (isLL) {
    var form = document.querySelector("form[data-ll-form='apply']") ||
               document.querySelector("form#apply-form") ||
               document.querySelector("form[action*='learn-form']") ||
               document.querySelector("form");
    if (form) {
      var started = false, submitted = false, touched = {};
      function start() { if (started) return; started = true; safeCapture("ll_form_start", {}); }
      form.addEventListener("focusin", function (ev) {
        var n = (ev.target && ev.target.name) || (ev.target && ev.target.id) || "unknown";
        start(); safeCapture("ll_form_field_focus", { field: n });
      });
      form.addEventListener("focusout", function (ev) {
        var t = ev.target; if (!t || !("value" in t)) return;
        var n = t.name || t.id || "unknown", v = String(t.value || "");
        touched[n] = true;
        safeCapture("ll_form_field_blur", { field: n, filled: v.length > 0, char_count: v.length });
      });
      form.addEventListener("submit", function () {
        submitted = true;
        var fd = new FormData(form);
        var email = String(fd.get("email") || "").trim().toLowerCase();
        var fn = String(fd.get("first_name") || fd.get("firstname") || "").trim();
        var ln = String(fd.get("last_name") || "").trim();
        var loc = String(fd.get("location") || "").trim();
        var stage = String(fd.get("business_stage") || "").trim();
        var ftc = String(fd.get("full_time_commit") || "").trim();
        var bd = String(fd.get("business_description") || "");
        if (email) {
          try {
            ph.identify(email, { $email: email, ll_cohort: "june_2026", ll_business_stage: stage, ll_location: loc, ll_full_time_commit: ftc });
            ph.people && ph.people.set && ph.people.set({ $first_name: fn, $last_name: ln });
          } catch (e) { console.warn("[ll-analytics] identify failed", e); }
        }
        safeCapture("ll_form_submit", {
          has_email: !!email, has_first_name: !!fn, has_last_name: !!ln, has_location: !!loc,
          has_business_stage: !!stage, has_full_time_commit: !!ftc,
          business_description_len: bd.length, time_to_submit_ms: Date.now() - loadedAt
        });
      });
      (function () {
        var orig = window.fetch; if (!orig) return;
        window.fetch = function (input) {
          var url = typeof input === "string" ? input : (input && input.url) || "";
          var p = orig.apply(this, arguments);
          if (/\/api\/learn-form/i.test(url)) {
            p.then(function (r) {
              if (r && r.ok) safeCapture("ll_form_submit_success", { status: r.status });
              else safeCapture("ll_form_submit_error", { status: (r && r.status) || 0 });
            }).catch(function (err) {
              safeCapture("ll_form_submit_error", { status: 0, error: String(err && err.message || err) });
            });
          }
          return p;
        };
      })();
      window.addEventListener("beforeunload", function () {
        if (started && !submitted) {
          safeCapture("ll_form_abandon", {
            fields_touched: Object.keys(touched),
            scroll_pct: scrollPct(),
            time_on_page_ms: Date.now() - loadedAt
          });
        }
      });
    }
  }

  [30, 60, 120, 300].forEach(function (sec) {
    setTimeout(function () {
      if (document.visibilityState !== "hidden") safeCapture("ll_time_on_page", { bucket_seconds: sec });
    }, sec * 1000);
  });
})();
