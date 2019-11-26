---
title: "News"
layout: textlay
excerpt: "The Multimedia Technologies Unit at Eurecat."
sitemap: false
permalink: /news.html
---

# News

{% for article in site.data.news %}
<p>{{ article.date }} <br>
<em>{{ article.headline }}</em></p>
{% endfor %}
