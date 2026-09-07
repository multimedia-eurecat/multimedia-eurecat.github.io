---
title: "MTU - Publications"
layout: gridlay
excerpt: "MTU -- Publications."
sitemap: false
permalink: /publications/
---

<div markdown="0">
  <section id="publication-highlights-section">
    <h2>Highlights</h2>
    <div class="highlights-grid">
    {% for publi in site.data.publist %}
    {% if publi.highlight == 1 %}
      <div class="publication-entry publication-highlight" data-topics="{{ publi.topics | join: '|' | escape }}">
        <article class="publication-highlight-card">
          <div class="publication-highlight-aside">
            <a class="publication-highlight-media" href="{{ publi.url }}" aria-label="Read {{ publi.title | escape }}">
              <img src="{{ site.url }}{{ site.baseurl }}/assets/publications/{{ publi.image }}" alt="" loading="lazy" />
            </a>
            {% if publi.website or publi.code or publi.presentation %}
            <div class="publication-highlight-links">
              {% if publi.website %}<a href="{{ publi.website }}">Project page</a>{% endif %}
              {% if publi.code %}<a href="{{ publi.code }}">Code</a>{% endif %}
              {% if publi.presentation %}<a href="{{ publi.presentation }}">Presentation</a>{% endif %}
            </div>
            {% endif %}
          </div>
          <div class="publication-highlight-content">
            <span class="publication-highlight-year">{{ publi.year }}</span>
            <h3><a href="{{ publi.url }}">{{ publi.title }}</a></h3>
            <p class="publication-highlight-authors">{{ publi.authors }}</p>
            <p class="publication-highlight-description">{{ publi.description }}</p>
            <p class="publication-highlight-details">{{ publi.details }}</p>
            {% if publi.news %}<div class="publication-highlight-news">{{ publi.news }}</div>{% endif %}
          </div>
        </article>
      </div>
    {% endif %}
    {% endfor %}
    </div>
  </section>

  <section id="publication-full-list-section">
    <h2>Full List</h2>

    <div class="publication-toolbar">
      <div class="publication-toolbar-intro">
        <span>Publication browser</span>
        <p class="publication-toolbar-copy">Filter the full list by topic.</p>
      </div>
      <div class="publication-toolbar-controls">
        <div id="publication-filters" class="publication-filters" aria-label="Filter publications by topic">
          <button type="button" class="publication-filter-button is-active" data-topic="all" aria-pressed="true">All topics</button>
        </div>
        <p id="publication-filter-status" class="publication-filter-status" aria-live="polite">Showing all publications.</p>
      </div>
    </div>

    {% assign grouped_pubs = site.data.publist | sort: "year" | reverse | group_by: "year" %}

    {% for year_group in grouped_pubs %}
      {% assign year_label = year_group.name | default: "Unspecified" %}
      <div class="publication-year-group">
        <h3>{{ year_label }}</h3>
        <ul class="publications-full-list">
        {% for publi in year_group.items %}
          <li class="publication-entry" data-topics="{{ publi.topics | join: '|' | escape }}">
            <h4 class="publication-list-title"><a href="{{ publi.url }}">{{ publi.title }}</a></h4>
            <p class="publication-list-authors">{{ publi.authors }}</p>
            <p class="publication-list-details">{{ publi.details }}</p>
            {% if publi.website or publi.code or publi.presentation %}
            <div class="publication-list-resources" aria-label="Publication resources">
              {% if publi.website %}<a class="pub-small-link" href="{{ publi.website }}">Project page</a>{% endif %}
              {% if publi.code %}<a class="pub-small-link" href="{{ publi.code }}">Code</a>{% endif %}
              {% if publi.presentation %}<a class="pub-small-link" href="{{ publi.presentation }}">Presentation</a>{% endif %}
            </div>
            {% endif %}
            {% if publi.news %}<div class="publication-list-news">{{ publi.news }}</div>{% endif %}
            {% if publi.topics %}
            <div class="publication-topics">
              {% for topic in publi.topics %}
              <span class="publication-topic">{{ topic }}</span>
              {% endfor %}
            </div>
            {% endif %}
          </li>
        {% endfor %}
        </ul>
      </div>
    {% endfor %}
  </section>
</div>

<script>
document.addEventListener("DOMContentLoaded", function () {
  const entries = Array.from(document.querySelectorAll("#publication-full-list-section .publication-entry"));
  const filterContainer = document.getElementById("publication-filters");
  const status = document.getElementById("publication-filter-status");
  const yearGroups = Array.from(document.querySelectorAll(".publication-year-group"));

  const allTopics = Array.from(
    new Set(
      entries.flatMap((entry) =>
        (entry.dataset.topics || "")
          .split("|")
          .map((topic) => topic.trim())
          .filter(Boolean)
      )
    )
  ).sort((a, b) => a.localeCompare(b));

  allTopics.forEach((topic) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "publication-filter-button";
    button.dataset.topic = topic;
    button.setAttribute("aria-pressed", "false");
    button.textContent = topic;
    filterContainer.appendChild(button);
  });

  const setActiveButton = (topic) => {
    const buttons = filterContainer.querySelectorAll(".publication-filter-button");
    buttons.forEach((button) => {
      const isActive = button.dataset.topic === topic;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  };

  const applyFilter = (topic) => {
    let visibleCount = 0;

    entries.forEach((entry) => {
      const topics = (entry.dataset.topics || "")
        .split("|")
        .map((value) => value.trim())
        .filter(Boolean);
      const matches = topic === "all" || topics.includes(topic);
      entry.classList.toggle("is-hidden", !matches);
      visibleCount += matches ? 1 : 0;
    });

    yearGroups.forEach((group) => {
      const hasVisibleEntries = Array.from(group.querySelectorAll(".publication-entry")).some(
        (entry) => !entry.classList.contains("is-hidden")
      );
      group.classList.toggle("is-hidden", !hasVisibleEntries);
    });

    setActiveButton(topic);

    if (topic === "all") {
      status.textContent = "Showing all publications.";
    } else if (visibleCount === 0) {
      status.textContent = 'No publications found for "' + topic + '".';
    } else {
      status.textContent = 'Showing ' + visibleCount + ' publication' + (visibleCount === 1 ? "" : "s") + ' for "' + topic + '".';
    }
  };

  filterContainer.addEventListener("click", function (event) {
    const button = event.target.closest(".publication-filter-button");
    if (!button) {
      return;
    }
    applyFilter(button.dataset.topic || "all");
  });

});
</script>

<br>
