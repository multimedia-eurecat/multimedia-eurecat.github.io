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
        <div class="well">
          <pubtit><a href="{{ publi.url }}">{{ publi.title }}</a></pubtit>
          <p>{{ publi.authors }}</p>
          <img src="{{ site.url }}{{ site.baseurl }}/assets/publications/{{ publi.image }}" class="img-responsive" width="200em" style="float: left" />
          <p>{{ publi.description }}</p>
          <p><em>{{ publi.details }}</em></p>
          {% if publi.website %} · <a class="pub-small-link" href="{{ publi.website }}">project page</a>{% endif %}
          {% if publi.code %} · <a class="pub-small-link"  href="{{ publi.code }}">code</a>{% endif %}
          {% if publi.website or publi.code %} · <br/> {% endif %}
          {% if publi.news %} <strong>{{ publi.news }}</strong>{% endif %}
        </div>
      </div>
    {% endif %}
    {% endfor %}
    </div>
  </section>

  <div class="publication-toolbar">
    <p class="publication-toolbar-copy">Browse the full list by topic.</p>
    <div id="publication-filters" class="publication-filters" aria-label="Filter publications by topic">
      <button type="button" class="publication-filter-button is-active" data-topic="all" aria-pressed="true">All Topics</button>
    </div>
    <p id="publication-filter-status" class="publication-filter-status">Showing all publications.</p>
  </div>

  <section id="publication-full-list-section">
    <h2>Full List</h2>

    {% assign grouped_pubs = site.data.publist | sort: "year" | reverse | group_by: "year" %}

    {% for year_group in grouped_pubs %}
      {% assign year_label = year_group.name | default: "Unspecified" %}
      <div class="publication-year-group">
        <h3>{{ year_label }}</h3>
        <ul class="publications-full-list">
        {% for publi in year_group.items %}
          <li class="publication-entry" data-topics="{{ publi.topics | join: '|' | escape }}">
            <a href="{{ publi.url }}">{{ publi.title }}</a><br/>
            <em>{{ publi.authors }}</em><br/>
            {{ publi.details }}<br/>
            {% if publi.website %} · <a class="pub-small-link" href="{{ publi.website }}">project page</a>{% endif %}
            {% if publi.code %} · <a class="pub-small-link"  href="{{ publi.code }}">code</a>{% endif %}
            {% if publi.website or publi.code %} · <br/>{% endif %}
            {% if publi.news %} <strong>{{ publi.news }}</strong>{% endif %}
            {% if publi.topics %}
            <div class="publication-topics">
              {% for topic in publi.topics %}
              <button type="button" class="publication-topic" data-topic-chip="{{ topic | escape }}">{{ topic }}</button>
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

  document.addEventListener("click", function (event) {
    const chip = event.target.closest(".publication-topic");
    if (!chip) {
      return;
    }
    applyFilter(chip.dataset.topicChip || "all");
  });
});
</script>

<br>
