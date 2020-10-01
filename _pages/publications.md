---
title: "MTU - Publications"
layout: gridlay
excerpt: "MTU -- Publications."
sitemap: false
permalink: /publications/
---


# Publications

## Highlights

{% assign number_printed = 0 %}
{% for publi in site.data.publist %}

{% assign even_odd = number_printed | modulo: 2 %}
{% if publi.highlight == 1 %}

{% if even_odd == 0 %}
<div class="row">
{% endif %}

<div class="col-sm-6 clearfix">
 <div class="well">
  <pubtit><a href="{{ publi.url }}">{{ publi.title }}</a></pubtit>
  <img src="{{ site.url }}{{ site.baseurl }}/assets/publications/{{ publi.image }}" class="img-responsive" width="50%" style="float: left" />
  <p>{{ publi.description }}</p>
  <br>
  <p><em>{{ publi.authors }}</em></p>
  <p>{{ publi.details }}</p>
  <p class="text-danger"><strong> {{ publi.news1 }}</strong></p>
  <p> {{ publi.news2 }}</p>
 </div>
</div>

{% assign number_printed = number_printed | plus: 1 %}

{% if even_odd == 1 %}
</div>
{% endif %}

{% endif %}
{% endfor %}

{% assign even_odd = number_printed | modulo: 2 %}
{% if even_odd == 1 %}
</div>
{% endif %}

<p> &nbsp; </p>


## Full List

{% for publi in site.data.publist %}

  <a href="{{ publi.url }}">{{ publi.title }}</a> <br />
  <em>{{ publi.authors }} </em><br />
  {{ publi.details }}

{% endfor %}

<br>
