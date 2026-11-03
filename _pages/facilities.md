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
    <div class="facilities-section-heading">
      <h2 id="facilities-studio-title">3D Audio Laboratory</h2>
      <p>A space for acoustic experimentation.</p>
    </div>
    {% include facilities-carousel.html id="studio-carousel" directory="/assets/facilities/studio/" title="Studio" image_alt="Eurecat audio studio" contain_images="3.png|4.png" %}
    <div class="lab-card">
      <span class="lab-card-mark" aria-hidden="true">)))</span>
      <div>
        <span class="home-eyebrow">Featured facility</span>
        <h2><a href="https://labs.eurecat.org/en/laboratory/3d-audio-laboratory/">3D Audio Laboratory <span aria-hidden="true">↗</span></a></h2>
        <p>Facilities and services for spatial audio research, XR, media production and perceptual evaluation.</p>
      </div>
    </div>
  </section>

  <section class="facilities-section" aria-labelledby="facilities-installations-title">
    <div class="facilities-section-heading">
      <h2 id="facilities-installations-title">Installations</h2>
      <p>Spatial audio in the wild.</p>
    </div>
    {% include facilities-carousel.html id="installations-carousel" directory="/assets/facilities/installations/" title="Installations" image_alt="Multimedia installation by Eurecat" first_images="3 sonar 2.png|2 Ovnew 1.jpg|9 Metrica 1.jpg|2 ovnew 2.png|3 sonar 1.png|7 sfear sonar.png|8 teatre.png|2 ovnew 4.png|9 Metrica 0.png|2 ovnew 3.png|9 Metrica facebook.jpeg|4 carpa 2.png" last_images="6 Postals.png|4 Carpa 1.JPEG|5 Museu cera.png" contain_images="2 ovnew 3.png|9 Metrica facebook.jpeg|6 Postals.png|5 Museu cera.png" %}
    <p class="facilities-description">Eurecat’s multimedia group provides complete services for 3D and spatial audio installations, from concept development and system design to content production, installation, calibration and final testing. Services include immersive multichannel loudspeaker systems, spatial audio recording and mixing, binaural rendering, and software customization tailored to each installation or project. The group also offers acoustic capture of real spaces and acoustic modelling of real and virtual environments for immersive experiences and cultural heritage preservation. Drawing on 20 years of experience and expertise in spatial audio technologies such as Ambisonics and Dolby Atmos, Eurecat develops solutions for cultural spaces, theatres, exhibitions, retail, hospitality and interactive XR environments.</p>
  </section>

  <section class="facilities-section facilities-audio" aria-labelledby="facilities-audio-title">
    <div class="facilities-section-heading">
      <h2 id="facilities-audio-title">Spatial Binaural Audio Experiences</h2>
      <p>Binaural demos.</p>
    </div>
    <p class="facilities-audio-note">Use headphones for all 3D audio listening experiences.</p>
    <div class="facilities-audio-grid">
      <section class="facilities-audio-player" aria-label="Eurecat Wellness">
        <iframe width="100%" height="450" scrolling="no" allow="autoplay; encrypted-media" loading="lazy" title="Eurecat Wellness (Use Headphones) on SoundCloud" src="https://w.soundcloud.com/player/?visual=true&amp;url=https%3A%2F%2Fapi.soundcloud.com%2Fplaylists%2F2282946516&amp;show_artwork=true&amp;auto_play=false"></iframe>
        <p class="facilities-audio-credit"><a href="https://soundcloud.com/user-284259920" target="_blank" rel="noopener noreferrer">Eurecat Audio</a> · <a href="https://soundcloud.com/user-284259920/sets/eurecat-wellmess-use" target="_blank" rel="noopener noreferrer">Eurecat Wellness (Use Headphones)</a></p>
      </section>
      <section class="facilities-audio-player" aria-label="Eurecat 3D Audiobooks">
        <iframe width="100%" height="450" scrolling="no" allow="autoplay; encrypted-media" loading="lazy" title="Eurecat 3D Audio (Use Headphones) on SoundCloud" src="https://w.soundcloud.com/player/?visual=true&amp;url=https%3A%2F%2Fapi.soundcloud.com%2Fplaylists%2F1764451239&amp;show_artwork=true&amp;secret_token=s-fKasSdFcIL7&amp;auto_play=false"></iframe>
        <p class="facilities-audio-credit"><a href="https://soundcloud.com/user-284259920" target="_blank" rel="noopener noreferrer">Eurecat Audio</a> · <a href="https://soundcloud.com/user-284259920/sets/eurecat-3d-audio-use-headphones/s-fKasSdFcIL7" target="_blank" rel="noopener noreferrer">Eurecat 3D Audio (Use Headphones)</a></p>
      </section>
    </div>
  </section>

  <!-- Future facilities widget: add the next section here, after the SoundCloud players. -->
</main>

<script src="{{ '/js/facilities.js' | relative_url }}" defer></script>
