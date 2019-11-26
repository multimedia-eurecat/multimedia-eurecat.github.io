---
title: "MTU - Blog"
excerpt: "MTU: blog"
layout: default
permalink: /blog/
sitemap: false
---

# Blog

<div class="blog">
  
  <ul class="posts">
    {% for post in site.posts %}
    <li>
      <span class="post-date">{{ post.date | date: "%b %-d, %Y" }}</span>
      <a class="post-link" href="{{ post.url | prepend: site.baseurl }}">{{ post.title }}</a>
      <br>
      {{ post.excerpt }}
      <div class="imgcap" style="padding-top:10px;">
        <img src= "/assets/posts/{{ post.img }}" height="180">
      </div>
    </li>
    {% endfor %}
  </ul>

</div>