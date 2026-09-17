/**
 * PerpArc Seamless Page Transition Engine
 * 
 * Provides smooth directional slide transitions between pages (Index <-> Explore <-> Pair)
 * without hard browser reloading, plus drop-in physics animations on arrival.
 */

(() => {
  // Ordered route hierarchy to determine slide direction
  const ROUTES = ["/index.html", "/explore.html", "/pair.html"];
  
  function getRouteIndex(path) {
    const clean = (path.split("?")[0].split("#")[0] || "/index.html").replace(/\/$/, "/index.html");
    const name = clean.endsWith("/") ? clean + "index.html" : clean;
    for (let i = 0; i < ROUTES.length; i++) {
      if (name.endsWith(ROUTES[i])) return i;
    }
    return 0;
  }

  let isTransitioning = false;

  async function navigateTo(targetUrl, isPopState = false) {
    if (isTransitioning) return;
    
    const currentPath = window.location.pathname;
    const targetPath = new URL(targetUrl, window.location.origin).pathname;
    
    const currentIndex = getRouteIndex(currentPath);
    const targetIndex = getRouteIndex(targetPath);

    // If clicking current page without anchor, scroll to top
    if (currentIndex === targetIndex && targetUrl.indexOf("#") === -1 && !isPopState) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // If anchor on same page, let browser handle smooth scroll
    if (targetPath === currentPath && targetUrl.includes("#")) {
      const hash = targetUrl.substring(targetUrl.indexOf("#"));
      const el = document.querySelector(hash);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        return;
      }
    }

    isTransitioning = true;
    const isForward = targetIndex >= currentIndex;

    try {
      // 1. Pre-fetch target HTML
      const response = await fetch(targetUrl);
      if (!response.ok) {
        window.location.href = targetUrl;
        return;
      }
      const htmlText = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, "text/html");

      const newMain = doc.querySelector("main");
      const currentMain = document.querySelector("main");

      if (!newMain || !currentMain) {
        window.location.href = targetUrl;
        return;
      }

      // 2. Play slide exit animation on current page
      const exitClass = isForward ? "slide-exit-to-left" : "slide-exit-to-right";
      const enterClass = isForward ? "slide-enter-from-right" : "slide-enter-from-left";

      currentMain.classList.remove("slide-enter-from-right", "slide-enter-from-left", "slide-exit-to-left", "slide-exit-to-right");
      currentMain.classList.add(exitClass);

      await new Promise((r) => setTimeout(r, 340));

      // 3. Swap main content and document metadata
      currentMain.innerHTML = newMain.innerHTML;
      currentMain.className = newMain.className;
      document.title = doc.title;

      // Update URL in browser history if not popstate
      if (!isPopState) {
        window.history.pushState({ url: targetUrl }, doc.title, targetUrl);
      }

      window.scrollTo(0, 0);

      // 4. Update Nav Links active indicator
      updateNavHighlight(targetPath);

      // 5. Play slide enter animation
      currentMain.classList.remove(exitClass);
      currentMain.classList.add(enterClass);

      // 6. Execute scripts from the new page
      executeNewScripts(doc);

      // 7. Trigger drop-in physics staggers
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

  function updateNavHighlight(path) {
    const navLinks = document.querySelectorAll(".topbar nav a, .top nav a");
    navLinks.forEach((link) => {
      const href = link.getAttribute("href");
      if (!href) return;
      if (href.startsWith("#")) return;

      const linkPath = new URL(href, window.location.origin).pathname;
      if (linkPath === path || (path === "/" && linkPath.endsWith("/index.html"))) {
        if (!link.classList.contains("nav-cta")) {
          link.style.color = "var(--sodium)";
        }
      } else {
        if (!link.classList.contains("nav-cta")) {
          link.style.color = "";
        }
      }
    });
  }

  function executeNewScripts(doc) {
    const scripts = doc.querySelectorAll("main script, body > script");
    scripts.forEach((oldScript) => {
      // Don't re-run this transition script itself
      if (oldScript.src && oldScript.src.includes("transitions.js")) return;
      
      const newScript = document.createElement("script");
      Array.from(oldScript.attributes).forEach((attr) => {
        newScript.setAttribute(attr.name, attr.value);
      });
      newScript.textContent = oldScript.textContent;
      document.body.appendChild(newScript);
      // Clean up inline script element after execution
      if (!oldScript.src) {
        newScript.remove();
      }
    });
  }

  function triggerDropIns() {
    const dropEls = document.querySelectorAll(".drop-in");
    dropEls.forEach((el) => {
      el.style.animation = "none";
      void el.offsetHeight; // trigger reflow
      el.style.animation = "";
    });

    // Re-observe scroll elements
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
        }
      });
    }, { threshold: 0.12 });

    document.querySelectorAll(".reveal-item").forEach((el) => observer.observe(el));
  }

  // Intercept all internal clicks
  document.addEventListener("click", (e) => {
    const link = e.target.closest("a");
    if (!link) return;

    const href = link.getAttribute("href");
    if (!href) return;

    // Ignore mailto, tel, external links
    if (href.startsWith("http://") || href.startsWith("https://")) {
      const url = new URL(href);
      if (url.origin !== window.location.origin) return;
    }

    // Ignore raw hash anchors
    if (href.startsWith("#")) return;

    e.preventDefault();
    navigateTo(href);
  });

  // Browser back/forward button support
  window.addEventListener("popstate", (e) => {
    navigateTo(window.location.href, true);
  });

  // Initial setup on first page load
  document.addEventListener("DOMContentLoaded", () => {
    updateNavHighlight(window.location.pathname);
    triggerDropIns();
  });
})();
