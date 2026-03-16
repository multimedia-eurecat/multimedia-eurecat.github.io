---
title: "MTU - Publications"
layout: gridlay
excerpt: "MTU -- Publications."
sitemap: false
permalink: /publications/
---


<!-- # Publications -->

## Highlights

<div class="highlights-grid">
{% for publi in site.data.publist %}
{% if publi.highlight == 1 %}
<div>
 <div class="well">
  <pubtit><a href="{{ publi.url }}">{{ publi.title }}</a></pubtit>
  <p>{{ publi.authors }}</p>
  <img src="{{ site.url }}{{ site.baseurl }}/assets/publications/{{ publi.image }}" class="img-responsive" width="200em" style="float: left" />
  <p>{{ publi.description }}</p>
  <p><em>{{ publi.details }}</em></p>
  <p class="text-news"><strong> {{ publi.news1 }}</strong></p>
  <p> {{ publi.news2 }}</p>
 </div>
</div>
{% endif %}
{% endfor %}
</div>

<!-- <p> &nbsp; </p> -->

## Full List

{% assign grouped_pubs = site.data.publist | sort: "year" | reverse | group_by: "year" %}

{% for year_group in grouped_pubs %}
  <h3>{{ year_group.name }}</h3>
  <ul>
  {% for publi in year_group.items %}
    <li>
      <a href="{{ publi.url }}">{{ publi.title }}</a><br/>
      <em>{{ publi.authors }}</em><br/>
      {{ publi.details }}<br/>
      <strong>{{ publi.news1 }}</strong>
    </li>
  {% endfor %}
  </ul>
{% endfor %}


<br>
