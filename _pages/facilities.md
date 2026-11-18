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

  <section class="facilities-section" aria-labelledby="facilities-studio-title">
    <div class="section-heading facilities-section-heading">
      <h2 id="facilities-studio-title">3D Audio Laboratory</h2>
    </div>
    {% include facilities-carousel.html id="studio-carousel" directory="/assets/facilities/studio/" title="Studio" captions=site.data.facilities_captions.studio %}
    <p class="facilities-description">The Immersive Audio Lab brings together the capabilities of a specialized production studio and an environment for technological experimentation and validation. It is where we develop and produce the content that powers our immersive installations, XR experiences, audiovisual projects and multisensory applications. It also provides the space to design, test and refine each experience, ensuring it is fully optimized before final deployment.</p>
    <div class="lab-card">
      <span class="lab-card-mark" aria-hidden="true">)))</span>
      <div>
        <span class="home-eyebrow">Explore the laboratory</span>
        <h2><a href="https://labs.eurecat.org/en/laboratory/3d-audio-laboratory/">3D Audio Laboratory <span aria-hidden="true">↗</span></a></h2>
        <p>Facilities and services for spatial audio research, XR, media production and perceptual evaluation.</p>
      </div>
    </div>
  </section>

  <section class="facilities-section" aria-labelledby="facilities-installations-title">
    <div class="section-heading facilities-section-heading">
      <h2 id="facilities-installations-title">Installations</h2>
    </div>
    {% include facilities-carousel.html id="installations-carousel" directory="/assets/facilities/installations/" title="Installations" captions=site.data.facilities_captions.installations %}
    <p class="facilities-description">Eurecat’s multimedia group provides complete services for 3D and spatial audio installations, from concept development and system design to content production, installation, calibration and final testing. Services include immersive multichannel loudspeaker systems, spatial audio recording and mixing, binaural rendering, and software customization tailored to each installation or project. The group also offers acoustic capture of real spaces and acoustic modelling of real and virtual environments for immersive experiences and cultural heritage preservation. Drawing on 20 years of experience and expertise in spatial audio technologies such as Ambisonics and Dolby Atmos, Eurecat develops solutions for cultural spaces, theatres, exhibitions, retail, hospitality and interactive XR environments.</p>
  </section>

  <section class="facilities-section facilities-audio" aria-labelledby="facilities-audio-title">
    <div class="section-heading facilities-section-heading">
      <h2 id="facilities-audio-title">Spatial Audio Demos</h2>
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

  <section class="facilities-section facilities-spatial-audio" aria-labelledby="facilities-spatial-audio-title">
    <div class="section-heading facilities-section-heading">
      <h2 id="facilities-spatial-audio-title">Spatial Audio Playground</h2>
    </div>
    <p class="facilities-audio-note">Choose a WAV file, put on headphones, and move the sound source around the listener.</p>
    <spatial-audio-widget></spatial-audio-widget>
    <noscript>Enable JavaScript to use the interactive spatial audio widget.</noscript>
  </section>
</main>

<script src="{{ '/js/carousels.js' | relative_url }}" defer></script>
<script type="module" src="{{ '/assets/facilities/spatial-audio-widget/spatial-audio-widget.js' | relative_url }}"></script>
