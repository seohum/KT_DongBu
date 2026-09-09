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

  /* QR landing -> electronic application common navigation. */
  function setupQrApplicationNavigation() {
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

    var dedicatedReturnUrl = site && dedicatedQrPages[site] ? dedicatedQrPages[site] : "";
    var passedReturnUrl = safeReturnUrl(params.get("return"));
    var referrerReturnUrl = safeReturnUrl(document.referrer);
    var returnUrl = dedicatedReturnUrl || passedReturnUrl || referrerReturnUrl || (site ? ("./?site=" + encodeURIComponent(site)) : "./");

    function goToQrLanding() {
      /* replace prevents a back-button loop back into the application form */
      location.replace(returnUrl);
    }

    function closeOrReturn() {
      window.close();
      window.setTimeout(function () {
        if (!document.hidden && !window.closed) goToQrLanding();
      }, 420);
    }

    function installUi() {
      if (!document.body) return;
      document.body.classList.add("qr-application-mode");

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

      if (!document.getElementById("qrCloseBar")) {
        var closeBar = document.createElement("div");
        closeBar.id = "qrCloseBar";
        closeBar.className = "qr-close-bar";
        closeBar.innerHTML = '<button type="button" class="qr-close-btn" id="qrCloseBtn">창 닫기</button>';
        document.body.appendChild(closeBar);
        document.getElementById("qrCloseBtn").addEventListener("click", closeOrReturn);
      }
    }

    /* Capture phase: always win over the form's existing inline history.back(). */
    document.addEventListener("click", function (event) {
      var target = event.target && event.target.closest ? event.target.closest(".back-btn") : null;
      if (!target) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      goToQrLanding();
    }, true);

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", installUi, { once: true });
    } else {
      installUi();
    }

    /* Re-apply after BFCache/page restoration or late DOM rewrites. */
    window.addEventListener("pageshow", installUi);
    new MutationObserver(function () {
      var backButton = document.querySelector(".back-btn");
      if (backButton && backButton.getAttribute("onclick")) installUi();
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["onclick"] });
  }

  setupQrApplicationNavigation();
})();