---
title: "MTU - Projects"
layout: textlay
excerpt: "MTU -- Projects"
sitemap: false
permalink: /projects/
---


# Projects


{% for project in site.data.projects %}

  <br/>
  {% if project.image %}
  <img src="{{ site.url }}{{ site.baseurl }}/assets/projects/{{ project.image }}" alt="{{ project.image }}" style="height:60px">
  {% endif %} 
  {% if project.url %}
  <a href="{{ project.url }}">
  {% endif %} {{ project.name }} {% if project.url %}  </a> {% endif %}  ({{ project.date }})<br/>
  {% if project.title %}<em>{{ project.title }}</em><br />{% endif %}
  {{ project.description }}<br />
  <em>{{ project.ref }}</em>

{% endfor %}



## Infrastructure & Equipment  

Eurecat counts within its premises with a fully equipped 3D audio studio with state of the art technology, including omnidirectional loudspeaker (dodecahedron), omnidirectional multi capsules microphone, binaural head microphone and Head & torso simulator. The Audio Lab provides 3D Audio solutions mainly for special events and installations, museums, theatre, music, advertising and broadcasting. 

 
In order to support its R&D activities, Eurecat counts with an infrastructure of more than 60 servers and Hitachi storage platform. The VMware vSphere platform has 5 hosts cluster with 44 processors with a total power of 121GHz and 140 GB of memory. Eurecat also has supercomputing platform based on Sun Grid Engine with 10 servers and a total of 80 processors with a power of 181 GHz and 192 GB of memory. The MTU owns a computer cluster equipped with four NVIDIA GPU (Graphics Processing Unit) GeForce GTX 1080 units, counting with 4x12GB of graphic card memory.

<br>