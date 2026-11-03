(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  document.querySelectorAll(".facilities-carousel, #homeid #carousel").forEach(function (carousel) {
    if (carousel.getAttribute("data-shuffle") === "true") {
      var inner = carousel.querySelector(".carousel-inner");
      var slides = Array.from(inner.children);
      var shuffled = slides.filter(function (slide) { return !slide.hasAttribute("data-fixed-slide"); });
      var first = slides.filter(function (slide) { return slide.getAttribute("data-fixed-slide") === "first"; });
      var last = slides.filter(function (slide) { return slide.getAttribute("data-fixed-slide") === "last"; });

      for (var i = shuffled.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temporary = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = temporary;
      }

      first.concat(shuffled, last).forEach(function (slide, index) {
        inner.appendChild(slide);
        slide.classList.toggle("active", index === 0);
        slide.setAttribute("aria-label", (index + 1) + " of " + slides.length);
        slide.querySelector("img").loading = index === 0 ? "eager" : "lazy";
      });
    }

    var player = window.jQuery(carousel);
    var pauseButton = carousel.querySelector(".facilities-carousel-pause");
    var title = (carousel.getAttribute("aria-label") || "Highlights").replace(" photos", "").toLowerCase();
    var paused = reducedMotion.matches;
    var hasFocus = carousel.contains(document.activeElement);
    var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    var hovered = finePointer.matches && carousel.matches(":hover");
    var isVisible = false;
    var slideDuration = 5000;
    var elapsed = 0;
    var previousTimestamp = null;
    var progressFrame = null;

    function resetProgress() {
      elapsed = 0;
      previousTimestamp = null;
      carousel.style.setProperty("--slide-progress", "0");
    }

    function advanceProgress(timestamp) {
      if (previousTimestamp !== null) {
        elapsed += timestamp - previousTimestamp;
      }
      previousTimestamp = timestamp;

      if (elapsed >= slideDuration && !player.data("bs.carousel").sliding) {
        player.carousel("next");
      }

      carousel.style.setProperty("--slide-progress", String(Math.min(elapsed / slideDuration, 1)));
      progressFrame = window.requestAnimationFrame(advanceProgress);
    }

    function updatePlayback() {
      var shouldPause = paused || hasFocus || hovered || !isVisible || document.hidden;
      // One clock drives both the progress fill and automatic slide changes.
      player.carousel("pause");
      if (shouldPause) {
        window.cancelAnimationFrame(progressFrame);
        progressFrame = null;
        previousTimestamp = null;
      } else if (progressFrame === null) {
        progressFrame = window.requestAnimationFrame(advanceProgress);
      }
      if (pauseButton) {
        pauseButton.setAttribute("aria-pressed", String(paused));
        pauseButton.setAttribute("aria-label", (paused ? "Play " : "Pause ") + title + " slideshow");
        pauseButton.firstElementChild.textContent = paused ? "▶" : "Ⅱ";
      }
    }

    player.carousel({ interval: false });
    player.on("slide.bs.carousel", resetProgress);
    updatePlayback();

    var visibilityObserver = new IntersectionObserver(function (entries) {
      isVisible = entries[0].isIntersecting && entries[0].intersectionRatio >= 0.25;
      updatePlayback();
    }, { threshold: 0.25, rootMargin: "-74px 0px 0px 0px" });
    visibilityObserver.observe(carousel.querySelector(".carousel-inner"));

    document.addEventListener("visibilitychange", updatePlayback);

    carousel.addEventListener("mouseenter", function () {
      hovered = finePointer.matches;
      updatePlayback();
    });

    carousel.addEventListener("mouseleave", function () {
      hovered = false;
      updatePlayback();
    });

    if (pauseButton) {
      pauseButton.addEventListener("click", function () {
        paused = !paused;
        updatePlayback();
      });
    }

    carousel.addEventListener("focusin", function () {
      hasFocus = true;
      updatePlayback();
    });

    carousel.addEventListener("focusout", function (event) {
      if (!carousel.contains(event.relatedTarget)) {
        hasFocus = false;
        updatePlayback();
      }
    });

    reducedMotion.addEventListener("change", function (event) {
      paused = event.matches;
      updatePlayback();
    });
  });
}());
