---
title: "MTU - Blog"
excerpt: "Research notes and technical articles from the Multimedia Technologies Unit"
layout: default
permalink: /blog/
sitemap: false
---

<main class="blog-index" markdown="0">
  <header class="blog-index-header">
    <span class="blog-index-eyebrow">Research notes</span>
    <h1>From the lab</h1>
    <p>Technical articles, research results, and resources from the Multimedia Technologies Unit.</p>
  </header>

  <section class="blog-index-feed" aria-labelledby="blog-articles-title">
    <div class="blog-index-section-heading">
      <h2 id="blog-articles-title">Latest articles</h2>
      <span>{{ site.posts | size }} articles</span>
    </div>

    <ol class="blog-post-list">
    {% for post in site.posts %}
      <li>
        <article class="blog-post-card">
          <a class="blog-post-media" href="{{ post.url | prepend: site.baseurl }}" tabindex="-1" aria-hidden="true">
            <img src="{{ site.baseurl }}/assets/posts/{{ post.img }}" alt="" loading="lazy" />
          </a>

          <div class="blog-post-summary">
            <div class="blog-post-meta">
              <time datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: "%B %-d, %Y" }}</time>
              {% if forloop.first %}<span class="blog-latest-label">Latest</span>{% endif %}
            </div>

            <h3><a href="{{ post.url | prepend: site.baseurl }}">{{ post.title }}</a></h3>
            <p class="blog-post-excerpt">{{ post.excerpt }}</p>

            {% if post.tags %}
            <ul class="blog-post-topics" aria-label="Topics">
              {% for tag in post.tags limit: 3 %}<li>{{ tag }}</li>{% endfor %}
            </ul>
            {% endif %}

            <a class="blog-read-link" href="{{ post.url | prepend: site.baseurl }}">Read article <span aria-hidden="true">→</span></a>
          </div>
        </article>
      </li>
    {% endfor %}
    </ol>
  </section>
</main>
