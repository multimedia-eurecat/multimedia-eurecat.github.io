---
title: "MTU - Projects"
layout: textlay
excerpt: "MTU -- Projects"
sitemap: false
permalink: /projects/
---

<div class="projects-intro" markdown="0">
  <span>Collaborative R&amp;D</span>
  <p>The Multimedia Technologies Unit participates in research and innovation projects that advance multimedia technologies through collaborations with European partners and industry.</p>
</div>

<div class="projects-list" markdown="0">
{% for project in site.data.projects %}
  <article class="project-entry{% unless project.image %} project-entry-no-image{% endunless %}">
    {% if project.image %}
    <div class="project-logo">
      <img src="{{ site.url }}{{ site.baseurl }}/assets/projects/{{ project.image }}" alt="{{ project.name | escape }} logo" loading="lazy">
    </div>
    {% endif %}

    <div class="project-content">
      <header class="project-header">
        <div class="project-name-row">
          <h2 class="project-name">
            {% if project.url %}<a href="{{ project.url }}">{{ project.name }}</a>{% else %}{{ project.name }}{% endif %}
          </h2>
          <span class="project-date">{{ project.date }}</span>
        </div>
        {% if project.title %}<p class="project-title">{{ project.title }}</p>{% endif %}
      </header>

      <p class="project-description">{{ project.description }}</p>
      {% if project.ref %}<p class="project-reference">{{ project.ref }}</p>{% endif %}
    </div>
  </article>
{% endfor %}
</div>
