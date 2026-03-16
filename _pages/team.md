---
title: "MTU - Team"
layout: gridlay
excerpt: "MTU: Team members"
sitemap: false
permalink: /team/
---


 We are always looking for talented Master's and PhD students to join our research teams. Interested in multimedia technologies and innovative research? Check out our [open positions](https://eurecat.org/eurecat/treballa-amb-nosaltres/) or contact us directly!

<!-- Jump to [staff](#staff), [master and bachelor students](#master-and-bachelor-students), [alumni](#alumni), [administrative support](#administrative-support), [lab visitors](#lab-visitors). -->


## Unit Members

<!-- In alphabetical order. -->

<!-- ## Staff -->
{% assign number_printed = 0 %}
{% for member in site.data.team_members %}

{% assign even_odd = number_printed | modulo: 2 %}

{% if even_odd == 0 %}
<div class="row">
{% endif %}

<div class="col-lg-6 clearfix">
  <img src="{{ site.url }}{{ site.baseurl }}/assets/team/{{ member.photo }}" class="img-responsive" width="95em" style="float: left" />
  <h4>{{ member.name }}</h4>
  <!-- <i>{{ member.info }}<br>email: <{{ member.email | encode_email }}></i> -->
  {{ member.role }}<br><i>{{ member.info }}.<br><a href="mailto:{{ member.email | encode_email }}" title="e-mail">e-mail</a></i>  
  <ul style="overflow: hidden">

  {% if member.number_educ == 1 %}
  <li> {{ member.education1 }} </li>
  {% endif %}

  {% if member.number_educ == 2 %}
  <li> {{ member.education1 }} </li>
  <li> {{ member.education2 }} </li>
  {% endif %}

  {% if member.number_educ == 3 %}
  <li> {{ member.education1 }} </li>
  <li> {{ member.education2 }} </li>
  <li> {{ member.education3 }} </li>
  {% endif %}

  {% if member.number_educ == 4 %}
  <li> {{ member.education1 }} </li>
  <li> {{ member.education2 }} </li>
  <li> {{ member.education3 }} </li>
  <li> {{ member.education4 }} </li>
  {% endif %}

  {% if member.number_educ == 5 %}
  <li> {{ member.education1 }} </li>
  <li> {{ member.education2 }} </li>
  <li> {{ member.education3 }} </li>
  <li> {{ member.education4 }} </li>
  <li> {{ member.education5 }} </li>
  {% endif %}

  </ul>
</div>

{% assign number_printed = number_printed | plus: 1 %}

{% if even_odd == 1 %}
</div>
{% endif %}

{% endfor %}

{% assign even_odd = number_printed | modulo: 2 %}
{% if even_odd == 1 %}
</div>
{% endif %}

<br>
## PhD and Master Students
{% assign number_printed = 0 %}
{% for member in site.data.team_students %}

{% assign even_odd = number_printed | modulo: 2 %}

{% if even_odd == 0 %}
<div class="row">
{% endif %}

<div class="col-lg-6 clearfix">
  <img src="{{ site.url }}{{ site.baseurl }}/assets/team/{{ member.photo }}" class="img-responsive" width="95em" style="float: left" />
  <h4>{{ member.name }}</h4>
  {{ member.role }}<br><i>{{ member.info }}.<br><a href="mailto:{{ member.email | encode_email }}" title="e-mail">e-mail</a></i>  
  <ul style="overflow: hidden">

  {% if member.number_educ == 1 %}
  <li> {{ member.education1 }} </li>
  {% endif %}

  {% if member.number_educ == 2 %}
  <li> {{ member.education1 }} </li>
  <li> {{ member.education2 }} </li>
  {% endif %}

  {% if member.number_educ == 3 %}
  <li> {{ member.education1 }} </li>
  <li> {{ member.education2 }} </li>
  <li> {{ member.education3 }} </li>
  {% endif %}

  {% if member.number_educ == 4 %}
  <li> {{ member.education1 }} </li>
  <li> {{ member.education2 }} </li>
  <li> {{ member.education3 }} </li>
  <li> {{ member.education4 }} </li>
  {% endif %}

  </ul>
</div>

{% assign number_printed = number_printed | plus: 1 %}

{% if even_odd == 1 %}
</div>
{% endif %}

{% endfor %}

{% assign even_odd = number_printed | modulo: 2 %}
{% if even_odd == 1 %}
</div>
{% endif %}

<br>
## Former Staff
<div class="row">

<div class="col-sm-4 clearfix">
<h4>Members</h4>
{% for member in site.data.former_members %}
{{ member.name }}
{% endfor %}
</div>

<div class="col-sm-4 clearfix">
<h4>Master and PhD students</h4>
{% for member in site.data.former_phd_msc %}
{{ member.name }}
{% endfor %}
</div>

<div class="col-sm-4 clearfix">
<h4>Visitors</h4>
{% for member in site.data.former_visitors %}
{{ member.name }}
{% endfor %}
</div>

</div>
