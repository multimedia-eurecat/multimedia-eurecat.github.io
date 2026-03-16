---
title: "MTU - Projects"
layout: textlay
excerpt: "MTU -- Projects"
sitemap: false
permalink: /projects/
---

<!-- # Projects -->

<div class="project-entry">
<br />
The Multimedia Technologies Unit participates in diverse research and innovation projects that advance multimedia technologies through collaborations with European partners and industry leaders.
</div>

{% for project in site.data.projects %}

<div class="project-entry">
  {% if project.image %}
  <img src="{{ site.url }}{{ site.baseurl }}/assets/projects/{{ project.image }}" alt="{{ project.image }}" style="height:60px">
  {% endif %} 
  {% if project.url %} <a href="{{ project.url }}">{% endif %}
  <b>{{ project.name }}</b> {% if project.url %}  </a> {% endif %} ({{ project.date }}) <br />
  {% if project.title %}<em>{{ project.title }}</em>{% endif %}<br />
  
  {{ project.description }}<br />

  <em>{{ project.ref }}</em>
</div>

{% endfor %}


<br>
