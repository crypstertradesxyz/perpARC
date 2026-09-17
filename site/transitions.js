/**
 * PerpArc Seamless Navigation & Slide Transition Engine
 * 
 * Provides unified directional slide transitions between all tabs & routes:
 * - Index (#keeper, #how, #risk) <-> Explore <-> Pair (Get your wallet)
 * - Directional awareness (left/right sliding based on tab order)
 * - Automatic smooth-scroll targeting when arriving with a hash (#keeper, #how, #risk)
 * - In-page smooth gliding with active indicator tracking
 * - Synchronized drop-in physics animations
 */

(() => {
  // Navigation tab order: Index (0) -> Explore (1) -> Pair (2)
  const ROUTE_ORDER = {
    "index": 0,
    "keeper": 0,
    "how": 0,
    "risk": 0,
    "explore": 1,
    "pair": 2
  };

  function getRouteKey(urlStr) {
    try {
      const url = new URL(urlStr, window.location.origin);
      const path = url.pathname.replace(/\/$/, "/index.html");
      const hash = url.hash.replace("#", "");

      if (path.endsWith("explore.html")) return "explore";
      if (path.endsWith("pair.html")) return "pair";
      if (hash === "keeper" || hash === "how" || hash === "risk") return hash;
      return "index";
    } catch {
      return "index";
    }
  }

  function getOrder(urlStr) {
    const key = getRouteKey(urlStr);
    return ROUTE_ORDER[key] ?? 0;
  }

  let isTransitioning = false;

  async function navigateTo(targetUrl, isPopState = false) {
    if (isTransitioning) return;

    const currentUrl = window.location.href;
    const targetObj = new URL(targetUrl, window.location.origin);
    const currentObj = new URL(currentUrl, window.location.origin);

    const currentPath = currentObj.pathname.replace(/\/$/, "/index.html");
    const targetPath = targetObj.pathname.replace(/\/$/, "/index.html");
    const targetHash = targetObj.hash;

    const currentKey = getRouteKey(currentUrl);
    const targetKey = getRouteKey(targetUrl);

    // Case 1: Same page anchor navigation (e.g. within index.html to #keeper, #how, #risk)
    if (currentPath === targetPath && targetHash) {
      const el = document.querySelector(targetHash);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        if (!isPopState) {
          window.history.pushState({ url: targetUrl }, document.title, targetUrl);
        }
        updateNavHighlight(targetKey);
        pulseSection(el);
        return;
      }
    }

    // Case 2: Clicking active page without hash -> scroll top
    if (currentPath === targetPath && !targetHash && !isPopState) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      updateNavHighlight(targetKey);
      return;
    }

    // Case 3: Page-to-page transition (e.g. Index <-> Explore <-> Pair)
    isTransitioning = true;
    const isForward = getOrder(targetUrl) >= getOrder(currentUrl);

    // Stop active canvas animation on index if leaving
    if (typeof window.__stopArcCanvas === "function") {
      window.__stopArcCanvas();
    }

    const currentMain = document.querySelector("main");
    if (!currentMain) {
      window.location.href = targetUrl;
      return;
    }

    try {
      // 1. Fetch destination document
      const res = await fetch(targetPath);
      if (!res.ok) {
        window.location.href = targetUrl;
        return;
      }
      const htmlText = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, "text/html");

      const newMain = doc.querySelector("main");
      if (!newMain) {
        window.location.href = targetUrl;
        return;
      }

      // 2. Play slide exit animation
      const exitClass = isForward ? "slide-exit-to-left" : "slide-exit-to-right";
      const enterClass = isForward ? "slide-enter-from-right" : "slide-enter-from-left";

      currentMain.classList.remove("slide-enter-from-right", "slide-enter-from-left", "slide-exit-to-left", "slide-exit-to-right");
      currentMain.classList.add(exitClass);

      await new Promise(r => setTimeout(r, 340));

      // 3. Swap main content and document title
      currentMain.innerHTML = newMain.innerHTML;
      currentMain.className = newMain.className;
      document.title = doc.title;

      if (!isPopState) {
        window.history.pushState({ url: targetUrl }, doc.title, targetUrl);
      }

      // Handle scrolling: if target has hash, scroll to it, otherwise scroll to top
      if (targetHash) {
        setTimeout(() => {
          const el = document.querySelector(targetHash);
          if (el) {
            el.scrollIntoView({ behavior: "smooth" });
            pulseSection(el);
          } else {
            window.scrollTo(0, 0);
          }
        }, 120);
      } else {
        window.scrollTo(0, 0);
      }

      // 4. Update tab active highlight
      updateNavHighlight(targetKey);

      // 5. Play enter animation
      currentMain.classList.remove(exitClass);
      currentMain.classList.add(enterClass);

      // 6. Execute scripts from the incoming page
      executeNewScripts(doc);

      // 7. Re-trigger drop-in physics animations
      triggerDropIns();

      setTimeout(() => {
        currentMain.classList.remove(enterClass);
        isTransitioning = false;
      }, 480);

    } catch (err) {
      console.error("[transitions] Navigation error", err);
      window.location.href = targetUrl;
      isTransitioning = false;
    }
  }

  function pulseSection(el) {
    if (!el) return;
    el.classList.remove("section-target-pulse");
    void el.offsetWidth;
    el.classList.add("section-target-pulse");
  }

  function updateNavHighlight(activeKey) {
    const navLinks = document.querySelectorAll(".topbar nav a, .top nav a");
    navLinks.forEach((link) => {
      const dataNav = link.dataset.nav;
      if (dataNav === activeKey) {
        link.classList.add("active");
        if (!link.classList.contains("nav-cta")) {
          link.style.color = "var(--sodium)";
        }
      } else {
        link.classList.remove("active");
        if (!link.classList.contains("nav-cta")) {
          link.style.color = "";
        }
      }
    });
  }

  function executeNewScripts(doc) {
    const scripts = doc.querySelectorAll("script:not([src*='transitions.js'])");
    scripts.forEach((oldScript) => {
      const newScript = document.createElement("script");
      Array.from(oldScript.attributes).forEach((attr) => {
        newScript.setAttribute(attr.name, attr.value);
      });
      newScript.textContent = oldScript.textContent;
      document.body.appendChild(newScript);
      if (!oldScript.src) {
        newScript.remove();
      }
    });
  }

  function triggerDropIns() {
    const dropEls = document.querySelectorAll(".drop-in");
    dropEls.forEach((el) => {
      el.style.animation = "none";
      void el.offsetHeight;
      el.style.animation = "";
    });

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
        }
      });
    }, { threshold: 0.12 });

    document.querySelectorAll(".reveal-item").forEach((el) => observer.observe(el));
  }

  // Intercept click on links
  document.addEventListener("click", (e) => {
    const link = e.target.closest("a");
    if (!link) return;

    const href = link.getAttribute("href");
    if (!href) return;

    // Ignore external links
    if (href.startsWith("http://") || href.startsWith("https://")) {
      const url = new URL(href);
      if (url.origin !== window.location.origin) return;
    }

    e.preventDefault();
    navigateTo(href);
  });

  // Browser back/forward button support
  window.addEventListener("popstate", () => {
    navigateTo(window.location.href, true);
  });

  // ScrollSpy for in-page sections on index.html
  function initScrollSpy() {
    const sections = ["keeper", "how", "risk"];
    const observer = new IntersectionObserver((entries) => {
      const path = window.location.pathname.replace(/\/$/, "/index.html");
      if (!path.endsWith("/index.html")) return;

      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          if (sections.includes(id)) {
            updateNavHighlight(id);
          }
        }
      });
    }, { threshold: 0.35 });

    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    updateNavHighlight(getRouteKey(window.location.href));
    triggerDropIns();
    initScrollSpy();
  });
})();
