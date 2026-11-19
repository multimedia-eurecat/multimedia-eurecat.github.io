---
title: "MTU - Projects"
layout: textlay
excerpt: "MTU -- Projects"
sitemap: false
permalink: /projects/
---

<header class="page-intro" markdown="0">
  <span class="page-intro-eyebrow">Collaborative R&amp;D</span>
  <h1>Projects</h1>
  <p>The Multimedia Technologies Unit participates in research and innovation projects that advance multimedia technologies through collaborations with European partners and industry.</p>
</header>

{% assign today = site.time | date: "%Y-%m-%d" %}
{% assign current_projects = "" | split: "|" %}
{% assign completed_projects = "" | split: "|" %}
{% for project in site.data.projects %}
  {% if project.end_date %}
    {% assign end_date = project.end_date | date: "%Y-%m-%d" %}
  {% else %}
    {% assign end_year = project.date | append: "" | replace: "–", "-" | replace: "—", "-" | split: "-" | last | strip %}
    {% assign end_date = end_year | append: "-12-31" %}
  {% endif %}
  {% if end_date >= today %}
    {% assign current_projects = current_projects | push: project %}
  {% else %}
    {% assign completed_projects = completed_projects | push: project %}
  {% endif %}
{% endfor %}

{% assign project_sections = "Current|Completed" | split: "|" %}
{% for section_title in project_sections %}
  {% if forloop.first %}
    {% assign projects = current_projects %}
  {% else %}
    {% assign projects = completed_projects %}
  {% endif %}
  {% assign section_id = section_title | downcase %}
<section class="projects-section" aria-labelledby="{{ section_id }}" markdown="0">
  <div class="section-heading">
    <h2 id="{{ section_id }}"><a href="#{{ section_id }}">{{ section_title }}</a></h2>
    <span>{{ projects.size }} project{% if projects.size != 1 %}s{% endif %}</span>
  </div>
  <div class="projects-list">
    {% for project in projects %}
      {% include project-entry.html project=project %}
    {% endfor %}
  </div>
</section>
{% endfor %}
