/**
 * router.js — Client-side page router for Cloudflare Pages
 *
 * Route map:
 *   /                  → Home.mhtml
 *   /?page=author      → Author.mhtml
 *   /?page=review      → Review.mhtml
 *   /?page=submission  → Start New Submission (Author).mhtml
 *   /?page=email       → Recent Email (Author).mhtml
 *   /?page=editing     → English Editing (Author).mhtml
 */

(function () {
  "use strict";

  // ── Route definitions ──────────────────────────────────────────────────────
  const ROUTES = {
    "":           "Home.mhtml",
    "home":       "Home.mhtml",
    "author":     "Author.mhtml",
    "review":     "Review.mhtml",
    "submission": "Start New Submission (Author).mhtml",
    "email":      "Recent Email (Author).mhtml",
    "editing":    "English Editing (Author).mhtml",
  };

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const frame  = document.getElementById("page-frame");
  const splash = document.getElementById("splash");

  // ── Resolve which MHTML to load ────────────────────────────────────────────
  function getPage() {
    const params = new URLSearchParams(window.location.search);
    const key = (params.get("page") || "").toLowerCase().trim();
    return ROUTES[key] || ROUTES[""];   // fallback → Home
  }

  // ── Load a page into the iframe ────────────────────────────────────────────
  function navigate(mhtmlFile) {
    // Show splash while loading
    splash.classList.remove("hidden");
    frame.classList.remove("visible");

    // Encode spaces in filename for URL safety
    const encoded = encodeURIComponent(mhtmlFile).replace(/%20/g, "%20");
    frame.src = "/" + encoded;

    frame.onload = function () {
      splash.classList.add("hidden");
      frame.classList.add("visible");

      // ── Inject click interceptor into the loaded MHTML ──────────────────
      // This lets buttons/links inside the MHTML trigger our router
      try {
        injectNavigationHooks(frame.contentDocument || frame.contentWindow.document);
      } catch (e) {
        // Cross-origin or CSP block — navigation inside MHTML must use
        // direct href links (see README for button URL format)
        console.warn("router: could not inject hooks into frame —", e.message);
      }
    };

    frame.onerror = function () {
      splash.classList.add("hidden");
      console.error("router: failed to load", mhtmlFile);
    };
  }

  /**
   * Inject navigation hooks into a loaded MHTML document.
   * Converts any <a> or <button> whose data-route attribute is set
   * into a router push instead of a hard reload.
   *
   * MHTML button markup example:
   *   <a href="/?page=author" data-route="author">Author</a>
   */
  function injectNavigationHooks(doc) {
    if (!doc) return;

    // Intercept all <a> tags whose href points to /?page=…
    doc.querySelectorAll("a[href]").forEach(function (link) {
      const url = new URL(link.href, window.location.origin);
      if (url.pathname === "/" && url.searchParams.has("page")) {
        link.addEventListener("click", function (e) {
          e.preventDefault();
          const page = url.searchParams.get("page");
          pushRoute(page);
        });
      }
    });
  }

  // ── Push a new route (updates URL + loads page) ────────────────────────────
  function pushRoute(pageKey) {
    const query = pageKey ? "?page=" + encodeURIComponent(pageKey) : "/";
    window.history.pushState({ page: pageKey }, "", query);
    navigate(ROUTES[pageKey.toLowerCase()] || ROUTES[""]);
  }

  // Expose globally so MHTML pages can call: parent.router.go("author")
  window.router = { go: pushRoute };

  // ── Handle browser back/forward ────────────────────────────────────────────
  window.addEventListener("popstate", function () {
    navigate(getPage());
  });

  // ── Initial load ───────────────────────────────────────────────────────────
  navigate(getPage());
})();
