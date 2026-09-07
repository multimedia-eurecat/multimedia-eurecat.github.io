(function () {
  "use strict";

  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  var groupDetails = document.querySelectorAll(".group-details");

  Array.prototype.forEach.call(groupDetails, function (details) {
    var summary = details.querySelector("summary");
    var hoverTrigger = details.querySelector(".details-label");

    if (!summary || !hoverTrigger) {
      return;
    }

    hoverTrigger.addEventListener("mouseenter", function () {
      if (!finePointer.matches) {
        return;
      }

      details.open = true;
      details.setAttribute("data-hover-open", "true");
    });

    details.addEventListener("mouseleave", function () {
      if (!finePointer.matches || !details.hasAttribute("data-hover-open")) {
        return;
      }

      details.open = false;
      details.removeAttribute("data-hover-open");
    });

    summary.addEventListener("click", function (event) {
      if (!finePointer.matches || event.detail === 0) {
        return;
      }

      event.preventDefault();

      if (event.target === hoverTrigger || hoverTrigger.contains(event.target)) {
        details.open = true;
        details.setAttribute("data-hover-open", "true");
      }
    });
  });
}());
