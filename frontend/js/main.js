
"use strict";

const $ = id => document.getElementById(id);
const qAll = selector => [...document.querySelectorAll(selector)];

const PROFILE_KEY = "moviematch-profile-v2";
const WATCHLIST_KEY = "moviematch-watchlist-v2";
const WATCHED_KEY = "moviematch-watched-v2";

let language = localStorage.getItem("moviematch-lang") || "he";
if (!["he", "en"].includes(language)) language = "he";

let movieKind = "both";
let watchlist = readSaved(WATCHLIST_KEY, []);
let watched = readSaved(WATCHED_KEY, []);

function readSaved(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function tr(key) {
  return window.I18N[language]?.[key] ||
         window.I18N.en[key] || key;
}

function translatePage() {
  document.documentElement.lang = language;
  document.documentElement.dir =
    language === "he" ? "rtl" : "ltr";

  $("language").value = language;

  qAll("[data-i18n]").forEach(element => {
    element.textContent = tr(element.dataset.i18n);
  });

  qAll("[data-placeholder]").forEach(element => {
    element.placeholder = tr(element.dataset.placeholder);
  });

  renderWatchlist();
}

function setupChips() {
  qAll("#kind button").forEach(button => {
    button.addEventListener("click", () => {
      movieKind = button.dataset.value;
      qAll("#kind button").forEach(item => {
        item.classList.toggle("active", item === button);
      });
    });
  });

  qAll(".chips.multi button").forEach(button => {
    button.addEventListener("click", () => {
      button.classList.toggle("active");
      button.setAttribute(
        "aria-pressed",
        button.classList.contains("active")
      );
    });
  });
}

function selected(id) {
  return qAll(`#${id} button.active`)
    .map(button => button.dataset.value);
}

function setSelection(id, values) {
  qAll(`#${id} button`).forEach(button => {
    const active = values.includes(button.dataset.value);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active);
  });
}

function getProfile() {
  return {
    name: $("profileName").value.trim(),
    age: Number($("age").value),
    region: $("region").value,
    kind: movieKind,
    taste: $("taste").value.trim(),
    services: selected("services"),
    themes: selected("themes"),
    avoid: selected("avoid")
  };
}

function saveProfile() {
  const profile = getProfile();
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  $("status").textContent = tr("profileSaved");
}

function restoreProfile() {
  const saved = readSaved(PROFILE_KEY, null);
  if (!saved) return;

  $("profileName").value = saved.name || "";
  $("age").value = saved.age || 14;
  $("region").value = saved.region || "IL";
  $("taste").value = saved.taste || "";

  movieKind = saved.kind || "both";
  qAll("#kind button").forEach(button => {
    button.classList.toggle(
      "active", button.dataset.value === movieKind
    );
  });

  setSelection("services", saved.services || []);
  setSelection("themes", saved.themes || []);
  setSelection("avoid", saved.avoid || []);
}

async function request(path, options = {}) {
  const response = await fetch(path, options);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || tr("error"));
  }

  return payload;
}

function element(tag, value, className = "") {
  const result = document.createElement(tag);
  result.textContent = value == null ? "" : String(value);
  if (className) result.className = className;
  return result;
}

function actionButton(label, fn) {
  const button = element("button", label);
  button.type = "button";
  button.addEventListener("click", fn);
  return button;
}

function titleKey(item) {
  return `${item.source || "demo"}:${item.kind}:${item.id}`;
}

function formatWarning(item) {
  if (!item.content_levels) return tr("noWarnings");

  const levels = item.content_levels;

  return [
    `${tr("violence")}: ${tr(levels.violence || "none")}`,
    `${tr("horror")}: ${tr(levels.horror || "none")}`,
    `${tr("romance")}: ${tr(levels.romance || "none")}`
  ].join(" · ");
}

function makeCard(item) {
  const card = element("article", "", "movie-card");

  let poster;
  if (item.poster) {
    poster = document.createElement("img");
    poster.className = "movie-poster";
    poster.src = item.poster;
    poster.alt = item.title;
    poster.loading = "lazy";
  } else {
    poster = element("div", "🎬", "movie-poster");
  }
  card.appendChild(poster);

  const info = element("div", "", "movie-info");
  info.appendChild(element("h3", item.title));

  const meta = [
    item.year,
    item.kind === "tv" ? tr("shows") : tr("movies"),
    item.rating ? `★ ${item.rating}` : ""
  ].filter(Boolean).join(" · ");

  info.appendChild(element("div", meta, "meta"));

  const tags = element("div", "", "tags");

  if (item.min_age != null) {
    tags.appendChild(element(
      "span", `${item.min_age}+ · ${tr("ageRating")}`, "tag green"
    ));
  } else {
    tags.appendChild(element(
      "span", tr("ratingUnknown"), "tag"
    ));
  }

  (item.themes || []).forEach(theme => {
    tags.appendChild(element("span", tr(theme), "tag"));
  });

  info.appendChild(tags);
  info.appendChild(element("p", item.summary || "", ""));

  if (item.why?.length) {
    info.appendChild(element(
      "p", `${tr("why")} ${item.why.join(" · ")}`
    ));
  }

  info.appendChild(element(
    "p", `${tr("warning")}: ${formatWarning(item)}`
  ));

  if (item.source === "tmdb") {
    info.appendChild(element("p", tr("externalInfo"), "meta"));
  }

  const actions = element("div", "", "movie-actions");

  actions.appendChild(actionButton(tr("addWatchlist"), () => {
    const key = titleKey(item);
    if (!watchlist.some(saved => titleKey(saved) === key)) {
      watchlist.push({
        id: item.id,
        kind: item.kind,
        title: item.title,
        source: item.source || "demo"
      });
      localStorage.setItem(
        WATCHLIST_KEY, JSON.stringify(watchlist)
      );
    }
    renderWatchlist();
  }));

  actions.appendChild(actionButton(tr("watched"), () => {
    const key = titleKey(item);
    if (!watched.includes(key)) {
      watched.push(key);
      localStorage.setItem(
        WATCHED_KEY, JSON.stringify(watched)
      );
    }
    card.style.opacity = "0.55";
  }));

  actions.appendChild(actionButton(tr("details"), () => {
    showDetails(item, info);
  }));

  info.appendChild(actions);
  card.appendChild(info);

  if (watched.includes(titleKey(item))) {
    card.style.opacity = "0.55";
  }

  return card;
}

async function showDetails(item, container) {
  container.querySelector(".detail-panel")?.remove();

  const panel = element("div", "", "detail-panel");
  panel.appendChild(element("h4", tr("about")));

  if (item.source === "tmdb") {
    try {
      const result = await request(
        `/api/details?kind=${encodeURIComponent(item.kind)}` +
        `&id=${encodeURIComponent(item.id)}` +
        `&region=${encodeURIComponent($("region").value)}` +
        `&language=${language === "he" ? "he-IL" : "en-US"}`
      );

      panel.appendChild(element(
        "p", result.summary || tr("noResults")
      ));

      panel.appendChild(element("h4", tr("whereToWatch")));

      const providerText = [
        result.flatrate.length
          ? `${tr("subscription")}: ${result.flatrate.join(", ")}`
          : "",
        result.rent.length
          ? `${tr("rent")}: ${result.rent.join(", ")}`
          : "",
        result.buy.length
          ? `${tr("buy")}: ${result.buy.join(", ")}`
          : ""
      ].filter(Boolean).join(" | ");

      panel.appendChild(element(
        "p", providerText || tr("streamingUnknown")
      ));

      if (result.watch_link) {
        const link = element("a", tr("whereToWatch"));
        link.href = result.watch_link;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className = "small-button";
        panel.appendChild(link);
      }

      if (result.collection.length) {
        panel.appendChild(element("h4", tr("releaseOrder")));
        result.collection.forEach((movie, index) => {
          panel.appendChild(element(
            "p",
            `${index + 1}. ${movie.title} (${movie.year || "?"})`
          ));
        });
      }

      if (result.seasons.length) {
        panel.appendChild(element("h4", tr("shows")));
        result.seasons.forEach(season => {
          panel.appendChild(element(
            "p", `${season.number}. ${season.name}`
          ));
        });
      }

      panel.appendChild(element(
        "p", tr("availabilityNote"), "meta"
      ));

    } catch (error) {
      panel.appendChild(element("p", error.message, "error"));
    }
  } else {
    panel.appendChild(element("p", item.summary || ""));

    const orders = item.watch_orders || {};

    for (const [type, order] of Object.entries(orders)) {
      if (!order.length) continue;

      panel.appendChild(element(
        "h4", type === "story" ? tr("storyOrder") : tr("releaseOrder")
      ));

      order.forEach((name, index) => {
        panel.appendChild(element("p", `${index + 1}. ${name}`));
      });
    }

    if (Object.keys(orders).length) {
      panel.appendChild(element(
        "p", tr("viewingOrderNote"), "meta"
      ));
    }

    panel.appendChild(element("h4", tr("whereToWatch")));
    panel.appendChild(element(
      "p", tr("streamingUnknown"), "meta"
    ));
  }

  container.appendChild(panel);
}

async function recommend() {
  const profile = getProfile();

  if (!Number.isInteger(profile.age) ||
      profile.age < 1 || profile.age > 100) {
    $("status").textContent = tr("invalidAge");
    return;
  }

  $("status").textContent = "";
  $("results").replaceChildren(
    element("div", tr("loading"), "empty")
  );

  try {
    const data = await request("/api/recommend", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({...profile, limit: 3})
    });

    $("results").replaceChildren();

    if (!data.items.length) {
      $("results").appendChild(
        element("div", tr("noResults"), "empty")
      );
    } else {
      data.items.forEach(item => {
        $("results").appendChild(makeCard(item));
      });
    }

  } catch (error) {
    $("results").replaceChildren(
      element("p", error.message, "error")
    );
  }
}

async function searchMovies() {
  const query = $("searchInput").value.trim();
  if (query.length < 2) return;

  const target = $("searchResults");
  target.replaceChildren(element("p", tr("loading")));

  try {
    const data = await request(
      `/api/search?q=${encodeURIComponent(query)}` +
      `&language=${language === "he" ? "he-IL" : "en-US"}`
    );

    target.replaceChildren();

    if (!data.items.length) {
      target.appendChild(element("p", tr("noResults")));
      return;
    }

    data.items.slice(0, 15).forEach(item => {
      const row = element("div", "", "search-item");

      row.appendChild(element(
        "span", `${item.title} (${item.year || "?"})`
      ));

      row.appendChild(actionButton(tr("details"), () => {
        $("results").replaceChildren(makeCard(item));
        $("results").scrollIntoView({behavior: "smooth"});
      }));

      target.appendChild(row);
    });

  } catch (error) {
    target.replaceChildren(
      element("p", error.message, "error")
    );
  }
}

function renderWatchlist() {
  const target = $("watchlistItems");
  target.replaceChildren();

  if (!watchlist.length) {
    target.appendChild(element(
      "p", tr("emptyWatchlist"), "meta"
    ));
    return;
  }

  watchlist.forEach(item => {
    const row = element("div", "", "watchlist-item");
    row.appendChild(element("span", item.title));

    row.appendChild(actionButton(tr("removeWatchlist"), () => {
      watchlist = watchlist.filter(
        saved => titleKey(saved) !== titleKey(item)
      );
      localStorage.setItem(
        WATCHLIST_KEY, JSON.stringify(watchlist)
      );
      renderWatchlist();
    }));

    target.appendChild(row);
  });
}

function init() {
  setupChips();
  restoreProfile();
  translatePage();

  $("language").addEventListener("change", event => {
    language = event.target.value;
    localStorage.setItem("moviematch-lang", language);
    translatePage();
    $("results").replaceChildren(
      element("div", tr("empty"), "empty")
    );
    $("searchResults").replaceChildren();
  });

  $("saveProfileBtn").addEventListener("click", saveProfile);
  $("recommendBtn").addEventListener("click", recommend);
  $("searchBtn").addEventListener("click", searchMovies);

  $("searchInput").addEventListener("keydown", event => {
    if (event.key === "Enter") searchMovies();
  });
}

document.addEventListener("DOMContentLoaded", init);
