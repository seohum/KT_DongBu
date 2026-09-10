/* Common copy-protection deterrent for public pages. */
(function () {
  "use strict";

  function isEditable(target) {
    return !!(target && target.closest &&
      target.closest("input, textarea, select, [contenteditable='true'], canvas"));
  }

  var style = document.createElement("style");
  style.textContent =
    "html,body{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}" +
    "input,textarea,select,[contenteditable='true']{-webkit-user-select:text!important;user-select:text!important;-webkit-touch-callout:default}";
  document.head.appendChild(style);

  document.addEventListener("contextmenu", function (event) {
    if (!isEditable(event.target)) event.preventDefault();
  }, { passive: false });

  document.addEventListener("selectstart", function (event) {
    if (!isEditable(event.target)) event.preventDefault();
  }, { passive: false });

  document.addEventListener("dragstart", function (event) {
    if (!isEditable(event.target)) event.preventDefault();
  }, { passive: false });

  document.addEventListener("copy", function (event) {
    if (!isEditable(event.target)) event.preventDefault();
  });

  document.addEventListener("cut", function (event) {
    if (!isEditable(event.target)) event.preventDefault();
  });

  document.addEventListener("keydown", function (event) {
    var key = String(event.key || "").toLowerCase();
    var command = event.ctrlKey || event.metaKey;
    var developerShortcut = event.ctrlKey && event.shiftKey && ["i", "j", "c"].includes(key);
    var blockedCommand = command && ["s", "u", "p"].includes(key);
    var blockedCopy = command && ["a", "c", "x"].includes(key) && !isEditable(event.target);

    if (event.key === "F12" || developerShortcut || blockedCommand || blockedCopy) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  function protectImages() {
    document.querySelectorAll("img").forEach(function (image) {
      image.draggable = false;
      image.setAttribute("draggable", "false");
    });
  }

  protectImages();
  document.addEventListener("DOMContentLoaded", protectImages);
  new MutationObserver(protectImages).observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  /* Electronic application navigation separated by entry source. */
  function setupApplicationNavigation() {
    var fileName = String(location.pathname || "").split("/").pop().toLowerCase();
    if (fileName !== "application.html") return;

    var params = new URLSearchParams(location.search);
    var site = params.get("site") || "";

    var dedicatedQrPages = {
      "mark-palace": "mark-palace-qr.html?v=3button-20260903",
      "samjeong-greencore-the-city": "samjeong-greencore-the-city-qr.html"
    };

    function safeReturnUrl(raw) {
      if (!raw) return "";
      try {
        var target = new URL(raw, location.href);
        if (target.origin !== location.origin) return "";
        if (/\/application\.html$/i.test(target.pathname)) return "";
        return target.pathname.replace(/^\//, "") + target.search + target.hash;
      } catch (error) {
        return "";
      }
    }

    var passedReturnUrl = safeReturnUrl(params.get("return"));
    var referrerReturnUrl = safeReturnUrl(document.referrer);
    var explicitSource = params.get("source");
    var legacyQrSource = !explicitSource && site && /-qr\.html(?:[?#]|$)/i.test(passedReturnUrl || referrerReturnUrl);
    var source = explicitSource === "qr" || legacyQrSource ? "qr" : "main";
    var qrReturnUrl = passedReturnUrl || (site && dedicatedQrPages[site] ? dedicatedQrPages[site] : "") || referrerReturnUrl || "./";
    var mainReturnUrl = "./?view=internet";

    function goBack() {
      /* replace prevents a back-button loop back into the application form. */
      location.replace(source === "qr" ? qrReturnUrl : mainReturnUrl);
    }

    function closeApplicationWindow() {
      window.close();
      window.setTimeout(function () {
        /* Browsers only allow scripted tab closing in some launch modes. */
        if (!window.closed) location.replace("about:blank");
      }, 250);
    }

    function installUi() {
      if (!document.body) return;
      document.body.classList.toggle("qr-application-mode", source === "qr");

      if (!document.getElementById("qrApplicationNavStyle")) {
        var navStyle = document.createElement("style");
        navStyle.id = "qrApplicationNavStyle";
        navStyle.textContent =
          "body.qr-application-mode .bottom{bottom:70px}" +
          "body.qr-application-mode .content{padding-bottom:190px}" +
          ".qr-close-bar{position:fixed;left:50%;bottom:0;z-index:9998;width:100%;max-width:430px;transform:translateX(-50%);padding:9px 18px calc(9px + env(safe-area-inset-bottom));background:rgba(255,255,255,.98);border-top:1px solid #eceef1;backdrop-filter:blur(10px)}" +
          ".qr-close-btn{width:100%;min-height:48px;border:1px solid #dfe2e8;border-radius:13px;background:#f2f3f5;color:#3f444d;font:inherit;font-size:14px;font-weight:900;cursor:pointer}" +
          ".qr-close-btn:active{background:#e8eaed}";
        document.head.appendChild(navStyle);
      }

      var backButton = document.querySelector(".back-btn");
      if (backButton) {
        backButton.removeAttribute("onclick");
        backButton.setAttribute("data-qr-return", "Y");
      }

      if (source === "qr" && !document.getElementById("qrCloseBar")) {
        var closeBar = document.createElement("div");
        closeBar.id = "qrCloseBar";
        closeBar.className = "qr-close-bar";
        closeBar.innerHTML = '<button type="button" class="qr-close-btn" id="qrCloseBtn">창 닫기</button>';
        document.body.appendChild(closeBar);
        document.getElementById("qrCloseBtn").addEventListener("click", closeApplicationWindow);
      }

      var successButton = document.querySelector(".content .next.full");
      var successTitle = document.querySelector(".content .step.on .title");
      if (source === "qr" && successButton && successTitle && /접수되었습니다/.test(successTitle.textContent || "")) {
        if (successButton.getAttribute("data-close-application") !== "Y") {
          successButton.textContent = "창 닫기";
          successButton.removeAttribute("onclick");
          successButton.setAttribute("data-close-application", "Y");
        }
      }
    }

    /* Capture phase: always win over the form's existing inline history.back(). */
    document.addEventListener("click", function (event) {
      var target = event.target && event.target.closest ? event.target.closest(".back-btn,[data-close-application='Y']") : null;
      if (!target) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (target.matches("[data-close-application='Y']")) closeApplicationWindow();
      else goBack();
    }, true);

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", installUi, { once: true });
    } else {
      installUi();
    }

    /* Re-apply after BFCache/page restoration or late DOM rewrites. */
    window.addEventListener("pageshow", installUi);
    new MutationObserver(function () {
      installUi();
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["onclick"] });
  }

  /* Tag every application link as QR or main-site traffic. */
  function setupApplicationEntryRouting() {
    var fileName = String(location.pathname || "").split("/").pop().toLowerCase();
    if (!/^(?:index|mark-palace|mark-palace-qr|samjeong-greencore-the-city-qr)\.html$/.test(fileName)) return;
    var source = /-qr\.html$/.test(fileName) ? "qr" : "main";

    function currentSiteCode() {
      var site = new URLSearchParams(location.search).get("site") || "";
      if (!site && typeof SPECIAL_SITE_LINKS !== "undefined" && typeof currentApartment !== "undefined") {
        var match = SPECIAL_SITE_LINKS.find(function (item) { return item.name === currentApartment; });
        if (match) site = match.slug;
      }
      return site;
    }

    function applicationUrl(product) {
      var site = currentSiteCode();
      var selected = String(product || "").replace(/\s/g, "").indexOf("TV") > -1 ? "인터넷+TV" : "인터넷";
      var query = new URLSearchParams({ product: selected, source: source, return: source === "qr" ? location.pathname.split("/").pop() + location.search : "./?view=internet", v: "20260910-route-source1" });
      if (site) query.set("site", site);
      if (product) query.set("details", String(product));
      return "application.html?" + query.toString();
    }

    window.openProductJoin = function (product) { location.href = applicationUrl(product); };
    window.joinApartment = function () {
      var site = currentSiteCode();
      if (!site) return location.href = applicationUrl("인터넷");
      var query = new URLSearchParams({ site: site, source: source });
      if (source === "main") query.set("return", "./?view=internet");
      location.href = "special-apply.html?" + query.toString();
    };
  }

  /* The same apartment can use independent flyer files on QR and main pages. */
  function setupFlyerImageContext() {
    var fileName = String(location.pathname || "").split("/").pop().toLowerCase();
    var context = /-qr\.html$/.test(fileName) ? "qr" : "main";
    var config = window.KT_CONSULT_CONFIG || {};
    var maps = config.FLYER_IMAGES || {};
    var map = maps[context] || {};
    if (!Object.keys(map).length) return;

    function applyConfiguredFlyer() {
      if (typeof currentFlyer === "undefined" || !currentFlyer || !map[currentFlyer]) return;
      var image = document.getElementById("flyerImage");
      if (!image || image.getAttribute("data-flyer-context") === context + ":" + currentFlyer) return;
      image.setAttribute("data-flyer-context", context + ":" + currentFlyer);
      image.src = map[currentFlyer];
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", applyConfiguredFlyer, { once: true });
    else applyConfiguredFlyer();
    window.addEventListener("pageshow", applyConfiguredFlyer);
  }

  setupApplicationNavigation();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setupApplicationEntryRouting, { once: true });
  else setupApplicationEntryRouting();
  setupFlyerImageContext();
})();
