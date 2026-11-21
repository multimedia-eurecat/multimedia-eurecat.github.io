---
title: "MTU - Facilities"
layout: default
excerpt: "Explore our studio, installations and immersive audio at Eurecat's Multimedia Technologies Unit."
sitemap: false
permalink: /facilities/
---

<main class="facilities-page" markdown="0">
  <header class="facilities-header">
    <span class="facilities-eyebrow">Spaces &amp; experiences</span>
    <h1>Facilities</h1>
    <p>Explore our studio and a selection of installations and demos created by the Multimedia Technologies Unit.</p>
  </header>

  <section class="facilities-section" aria-labelledby="studio">
    <div class="section-heading facilities-section-heading">
      <h2 id="studio"><a href="#studio">3D Audio Laboratory</a></h2>
    </div>
    {% include facilities-carousel.html id="studio-carousel" directory="/assets/facilities/studio/" title="Studio" captions=site.data.facilities_captions.studio %}
    <p class="facilities-description">The Immersive Audio Lab brings together the capabilities of a specialized production studio and an environment for technological experimentation and validation. It is where we develop and produce the content that powers our immersive installations, XR experiences, audiovisual projects and multisensory applications. It also provides the space to design, test and refine each experience, ensuring it is fully optimized before final deployment.</p>
  </section>

  <section class="facilities-section" aria-labelledby="installations">
    <div class="section-heading facilities-section-heading">
      <h2 id="installations"><a href="#installations">Installations</a></h2>
    </div>
    {% include facilities-carousel.html id="installations-carousel" directory="/assets/facilities/installations/" title="Installations" captions=site.data.facilities_captions.installations %}
    <p class="facilities-description">Eurecat’s multimedia group provides complete services for 3D and spatial audio installations, from concept development and system design to content production, installation, calibration and final testing. Services include immersive multichannel loudspeaker systems, spatial audio recording and mixing, binaural rendering, and software customization tailored to each installation or project. The group also offers acoustic capture of real spaces and acoustic modelling of real and virtual environments for immersive experiences and cultural heritage preservation. Drawing on 20 years of experience and expertise in spatial audio technologies such as Ambisonics and Dolby Atmos, Eurecat develops solutions for cultural spaces, theatres, exhibitions, retail, hospitality and interactive XR environments.</p>
  </section>

  <section class="facilities-section facilities-audio" aria-labelledby="demos">
    <div class="section-heading facilities-section-heading">
      <h2 id="demos"><a href="#demos">Spatial Audio Demos</a></h2>
    </div>
    <p class="facilities-audio-note">Use headphones for all 3D audio listening experiences.</p>
    <div id="facilities-audio-widgets" class="facilities-audio-grid">
      {% for playlist in site.data.facilities_audio.playlists %}
      <section class="facilities-audio-player" aria-label="{{ playlist.title | escape }}">
        <iframe width="100%" height="{{ site.data.facilities_audio.height }}" scrolling="no" allow="autoplay; encrypted-media" loading="lazy" title="{{ playlist.title | escape }} on SoundCloud" src="https://w.soundcloud.com/player/?visual=true&amp;url=https%3A%2F%2Fapi.soundcloud.com%2Fplaylists%2F{{ playlist.playlist_id }}&amp;show_artwork=true&amp;auto_play=false"></iframe>
        <p class="facilities-audio-credit"><a href="https://soundcloud.com/user-284259920" target="_blank" rel="noopener noreferrer">Eurecat Audio</a> · <a href="{{ playlist.permalink | escape }}" target="_blank" rel="noopener noreferrer">{{ playlist.title | escape }}</a></p>
      </section>
      {% endfor %}
    </div>
  </section>

  <section class="facilities-section facilities-spatial-audio" aria-labelledby="playground">
    <div class="section-heading facilities-section-heading">
      <h2 id="playground"><a href="#playground">Spatial Audio Playground</a></h2>
    </div>
    <p class="facilities-audio-note">Put on headphones and press <strong><span aria-hidden="true">▶</span> Play Loop</strong> to explore the drum loop. To use your own recording, choose a WAV file or drop it into the upload area.</p>
    <p class="facilities-audio-note">Choose <strong>Spherical</strong> or <strong>Cartesian</strong> at the top left. In Spherical mode, the curved handles adjust <strong>azimuth</strong> (horizontal) and <strong>elevation</strong> (vertical), while the straight radial arrow adjusts <strong>distance</strong>. Drag the sphere itself left/right and up/down to change its angles while keeping its distance from the listener fixed. In Cartesian mode, drag an axis arrow, drag the orange sphere to move it in the viewing plane, or use the <strong>Y, Z and X sliders</strong>.</p>
    <p class="facilities-audio-note">Drag the background to orbit the listener and scroll to zoom. <strong>Reset view</strong> restores the camera; <strong>Reset</strong> under Source position restores the sound source. Use <strong>Volume</strong> to adjust the level and <strong>Pause Loop</strong> / <strong>Play Loop</strong> to pause or resume. With the 3D view focused, arrow keys move the source in the selected coordinates. <strong>Shift + ↑/↓</strong> changes distance in Spherical mode or height in Cartesian mode; <strong>Alt</strong> gives finer steps.</p>
    <spatial-audio-widget></spatial-audio-widget>
    <noscript>Enable JavaScript to use the interactive spatial audio widget.</noscript>
  </section>

  <section class="facilities-section" aria-labelledby="capabilities">
    <div class="section-heading facilities-section-heading">
      <h2 id="capabilities"><a href="#capabilities">Explore our capabilities</a></h2>
    </div>
    <p class="facilities-description">For a closer look at our facilities, equipment and immersive audio services, visit the <a href="https://labs.eurecat.org/en/laboratory/3d-audio-laboratory/" target="_blank" rel="noopener noreferrer">3D Audio Laboratory on Eurecat’s official website<span aria-hidden="true">&nbsp;↗</span><span class="sr-only"> (external website, opens in a new tab)</span></a>.</p>
  </section>
</main>

<script src="{{ '/js/carousels.js' | relative_url }}" defer></script>
<script type="module" src="{{ '/assets/facilities/spatial-audio-widget/spatial-audio-widget.js' | relative_url }}"></script>
