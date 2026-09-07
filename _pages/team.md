---
title: "MTU - Team"
layout: gridlay
excerpt: "MTU: Team members"
sitemap: false
permalink: /team/
---

<div class="team-page" markdown="0">
  <header class="team-page-header">
    <span class="team-page-eyebrow">STAFF</span>
    <h1>Research & innovation team</h1>
    <p>Our multidisciplinary team brings together researchers, engineers, and creative technologists working across audio, image, and visualization.</p>
    <p class="team-recruitment">We welcome Master's and PhD candidates interested in applied multimedia research. See our <a href="https://eurecat.org/eurecat/treballa-amb-nosaltres/">open positions</a> or contact us directly.</p>
  </header>

  <section class="team-section" aria-labelledby="current-members-title">
    <div class="team-section-heading">
      <h2 id="current-members-title">Current members</h2>
      <p>Research, technical, and group leadership staff.</p>
    </div>

    <div class="team-grid">
    {% for member in site.data.team_members %}
      <article class="team-member">
        <img class="team-member-photo" src="{{ site.url }}{{ site.baseurl }}/assets/team/{{ member.photo }}" alt="Portrait of {{ member.name }}" loading="lazy" />
        <div class="team-member-content">
          <h3>{{ member.name }}</h3>
          <p class="team-member-role">{{ member.role }}</p>
          <p class="team-member-meta">{{ member.info }}</p>
          <a class="team-member-email" href="mailto:{{ member.email | encode_email }}" title="Email {{ member.name }}">Email</a>

          {% if member.number_educ %}
          <ul class="team-member-education" aria-label="Education">
            {% if member.number_educ >= 1 %}<li>{{ member.education1 }}</li>{% endif %}
            {% if member.number_educ >= 2 %}<li>{{ member.education2 }}</li>{% endif %}
            {% if member.number_educ >= 3 %}<li>{{ member.education3 }}</li>{% endif %}
            {% if member.number_educ >= 4 %}<li>{{ member.education4 }}</li>{% endif %}
            {% if member.number_educ >= 5 %}<li>{{ member.education5 }}</li>{% endif %}
          </ul>
          {% endif %}
        </div>
      </article>
    {% endfor %}
    </div>
  </section>

  <section class="team-section" aria-labelledby="students-title">
    <div class="team-section-heading">
      <h2 id="students-title">PhD and Master's students</h2>
      <p>Researchers completing advanced studies within the unit.</p>
    </div>

    <div class="team-grid">
    {% for member in site.data.team_students %}
      <article class="team-member">
        <img class="team-member-photo" src="{{ site.url }}{{ site.baseurl }}/assets/team/{{ member.photo }}" alt="Portrait of {{ member.name }}" loading="lazy" />
        <div class="team-member-content">
          <h3>{{ member.name }}</h3>
          <p class="team-member-role">{{ member.role }}</p>
          <p class="team-member-meta">{{ member.info }}</p>
          <a class="team-member-email" href="mailto:{{ member.email | encode_email }}" title="Email {{ member.name }}">Email</a>

          {% if member.number_educ %}
          <ul class="team-member-education" aria-label="Education">
            {% if member.number_educ >= 1 %}<li>{{ member.education1 }}</li>{% endif %}
            {% if member.number_educ >= 2 %}<li>{{ member.education2 }}</li>{% endif %}
            {% if member.number_educ >= 3 %}<li>{{ member.education3 }}</li>{% endif %}
            {% if member.number_educ >= 4 %}<li>{{ member.education4 }}</li>{% endif %}
          </ul>
          {% endif %}
        </div>
      </article>
    {% endfor %}
    </div>
  </section>

  <section class="team-section team-alumni-section" aria-labelledby="former-staff-title">
    <div class="team-section-heading">
      <h2 id="former-staff-title">Former staff and students</h2>
      <p>Previous members of the unit and visiting researchers.</p>
    </div>

    <div class="team-alumni-grid">
      <section class="team-alumni-group">
        <h3>Members</h3>
        <ul>
        {% for member in site.data.former_members %}
          <li>{{ member.name }}</li>
        {% endfor %}
        </ul>
      </section>

      <section class="team-alumni-group">
        <h3>Master's and PhD students</h3>
        <ul>
        {% for member in site.data.former_phd_msc %}
          <li>{{ member.name }}</li>
        {% endfor %}
        </ul>
      </section>

      <section class="team-alumni-group">
        <h3>Visitors</h3>
        <ul>
        {% for member in site.data.former_visitors %}
          <li>{{ member.name }}</li>
        {% endfor %}
        </ul>
      </section>
    </div>
  </section>
</div>
