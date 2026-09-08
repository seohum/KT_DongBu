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
})();