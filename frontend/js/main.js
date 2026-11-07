
"use strict";

(() => {
  // ========================================
  // MovieMatch v0.4 - Main Application
  // ========================================

  const $ = id => document.getElementById(id);
  const $$ = selector =>
    [...document.querySelectorAll(selector)];

  const KEYS = {
    profile: "mm3-profile",
    list: "mm3-list",
    watched: "mm3-watched",
    language: "mm3-language"
  };

  // ========================================
  // Profile avatars and theme colors
  // ========================================

  const AVATARS = [
    {
      id: "spider",
      icon: "🕷️",
      name: "Spider Hero",
      color: "#e63b57"
    },
    {
      id: "armor",
      icon: "🤖",
      name: "Armor Hero",
      color: "#d99b2b"
    },
    {
      id: "thunder",
      icon: "⚡",
      name: "Thunder Hero",
      color: "#2788ed"
    },
    {
      id: "shield",
      icon: "🛡️",
      name: "Shield Hero",
      color: "#4775db"
    },
    {
      id: "panther",
      icon: "🐈‍⬛",
      name: "Panther Hero",
      color: "#995de2"
    },
    {
      id: "wizard",
      icon: "🔮",
      name: "Magic Hero",
      color: "#d36cce"
    },
    {
      id: "dragon",
      icon: "🐉",
      name: "Dragon Hero",
      color: "#169f89"
    },
    {
      id: "space",
      icon: "🚀",
      name: "Space Hero",
      color: "#dc7854"
    },
    {
      id: "ninja",
      icon: "🥷",
      name: "Ninja Hero",
      color: "#7378dd"
    },
    {
      id: "hero",
      icon: "🦸",
      name: "Super Hero",
      color: "#2da77d"
    }
  ];

  // ========================================
  // Saved application data
  // ========================================

  function readStorage(key, fallback) {
    try {
      const value = localStorage.getItem(key);

      if (!value) return fallback;

      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function saveStorage(key, value) {
    localStorage.setItem(
      key,
      JSON.stringify(value)
    );
  }

  let profile = readStorage(KEYS.profile, null);
  let watchlist = readStorage(KEYS.list, []);
  let watched = readStorage(KEYS.watched, []);

  if (!Array.isArray(watchlist)) watchlist = [];
  if (!Array.isArray(watched)) watched = [];

  let language =
    localStorage.getItem(KEYS.language) || "he";

  let selectedAvatar =
    profile?.avatar || "spider";

  let catalog = [];
  let currentPage = "home";
  let currentMovie = null;
  let currentSearch = [];
  let currentCorrection = null;
  let currentRecommendations = [];
  let searchRequestId = 0;

  // ========================================
  // Helpers
  // ========================================

  function t(key) {
    return window.I18N?.[language]?.[key]
      || window.I18N?.he?.[key]
      || key;
  }

  function textElement(
    tag,
    value = "",
    className = ""
  ) {
    const element =
      document.createElement(tag);

    element.textContent =
      value == null ? "" : String(value);

    if (className) {
      element.className = className;
    }

    return element;
  }

  function createButton(
    label,
    action,
    className = ""
  ) {
    const button = textElement(
      "button",
      label,
      className
    );

    button.type = "button";
    button.addEventListener(
      "click",
      action
    );

    return button;
  }

  function titleKey(item) {
    return [
      item.source || "local",
      item.kind,
      item.id
    ].join(":");
  }

  function uniqueItems(items) {
    const seen = new Set();

    return items.filter(item => {
      const key = titleKey(item);

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });
  }

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(
        /[^a-z0-9\u0590-\u05ff]/g,
        ""
      );
  }

  function escapeAge(item) {
    if (!profile) return false;

    const age = Number(profile.age);

    if (!Number.isFinite(age)) {
      return false;
    }

    if (item.min_age == null) {
      return age >= 18;
    }

    return Number(item.min_age) <= age;
  }

  function showToast(message) {
    const toast = $("toast");

    if (!toast) return;

    toast.textContent = message;
    toast.classList.remove("hidden");

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(() => {
      toast.classList.add("hidden");
    }, 2400);
  }

  async function getAPI(url) {
    const response = await fetch(url);

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "API error"
      );
    }

    return data;
  }

  // ========================================
  // Profile
  // ========================================

  function applyProfileTheme() {
    const avatar =
      AVATARS.find(
        x => x.id === profile?.avatar
      ) || AVATARS[0];

    document.documentElement.style
      .setProperty(
        "--accent",
        avatar.color
      );

    if ($("profileAvatar")) {
      $("profileAvatar").textContent =
        avatar.icon;
    }

    if ($("heroSymbol")) {
      $("heroSymbol").textContent =
        avatar.icon;
    }

    if ($("profileUsername")) {
      $("profileUsername").textContent =
        profile?.username || "Profile";
    }

    if ($("welcome")) {
      $("welcome").textContent = profile
        ? (
            language === "he"
              ? `היי ${profile.username}! מה נראה היום?`
              : `Hi ${profile.username}! What should we watch?`
          )
        : "MovieMatch";
    }
  }

  function renderAvatars() {
    const target = $("avatarChoices");

    if (!target) return;

    target.replaceChildren();

    AVATARS.forEach(avatar => {
      const button = createButton(
        avatar.icon,
        () => {
          selectedAvatar = avatar.id;

          document.documentElement.style
            .setProperty(
              "--accent",
              avatar.color
            );

          renderAvatars();
        },
        "avatar-choice"
      );

      button.title = avatar.name;
      button.setAttribute(
        "aria-label",
        avatar.name
      );

      if (selectedAvatar === avatar.id) {
        button.classList.add("selected");
      }

      target.append(button);
    });
  }

  function openProfile() {
    $("profileDropdown")
      ?.classList.add("hidden");

    $("username").value =
      profile?.username || "";

    $("age").value =
      profile?.age || 14;

    $("country").value =
      profile?.country || "IL";

    selectedAvatar =
      profile?.avatar || "spider";

    $("profileError").textContent = "";

    $("closeProfile").classList.toggle(
      "hidden",
      !profile
    );

    renderAvatars();

    $("profileModal")
      .classList.remove("hidden");
  }

  function closeProfile() {
    if (!profile) return;

    $("profileModal")
      .classList.add("hidden");

    applyProfileTheme();
  }

  function saveProfile() {
    const username =
      $("username").value.trim();

    const age = Number(
      $("age").value
    );

    if (
      !username ||
      !Number.isInteger(age) ||
      age < 1 ||
      age > 100
    ) {
      $("profileError").textContent =
        t("invalidProfile");

      return;
    }

    profile = {
      username: username.slice(0, 32),
      age,
      country: $("country").value,
      avatar: selectedAvatar
    };

    saveStorage(
      KEYS.profile,
      profile
    );

    $("profileModal")
      .classList.add("hidden");

    applyProfileTheme();
    renderEverything();

    showToast(t("saved"));
  }

  // ========================================
  // Language
  // ========================================

  function translateInterface() {
    document.documentElement.lang =
      language;

    document.documentElement.dir =
      language === "he"
        ? "rtl"
        : "ltr";

    $("language").value = language;

    $$("[data-i18n]").forEach(element => {
      element.textContent =
        t(element.dataset.i18n);
    });

    $$("[data-placeholder]").forEach(
      element => {
        element.placeholder =
          t(element.dataset.placeholder);
      }
    );

    if ($("pageTitle")) {
      $("pageTitle").textContent =
        t(currentPage);
    }

    applyProfileTheme();
    renderEverything();
  }

  // ========================================
  // Navigation
  // ========================================

  function navigate(page) {
    currentPage = page;

    $$(".page").forEach(element => {
      element.classList.toggle(
        "active",
        element.id === `page-${page}`
      );
    });

    $$("[data-page]").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.page === page
      );
    });

    if ($("pageTitle")) {
      $("pageTitle").textContent =
        t(page);
    }

    $("sidebar")
      ?.classList.remove("open");

    window.scrollTo(0, 0);

    renderEverything();
  }

  // ========================================
  // Watchlist and watched movies
  // ========================================

  function toggleWatchlist(item) {
    const key = titleKey(item);

    if (watchlist.includes(key)) {
      watchlist = watchlist.filter(
        x => x !== key
      );

      showToast(t("remove"));
    } else {
      watchlist.push(key);
      showToast(t("add"));
    }

    saveStorage(
      KEYS.list,
      watchlist
    );

    renderEverything();

    if (
      currentMovie &&
      titleKey(currentMovie) === key
    ) {
      showDetails(item);
    }
  }

  function toggleWatched(item) {
    const key = titleKey(item);

    if (watched.includes(key)) {
      watched = watched.filter(
        x => x !== key
      );
    } else {
      watched.push(key);
    }

    saveStorage(
      KEYS.watched,
      watched
    );

    renderEverything();
    showDetails(item);
  }

  // ========================================
  // Movie posters and cards
  // ========================================

  function makePoster(item) {
    const poster = textElement(
      "div",
      "",
      "poster"
    );

    if (item.poster) {
      const image =
        document.createElement("img");

      image.src = item.poster;
      image.alt = item.title;
      image.loading = "lazy";

      image.onerror = () => {
        image.remove();

        poster.prepend(
          textElement(
            "div",
            item.kind === "tv"
              ? "📺"
              : "🎬",
            "poster-placeholder"
          )
        );
      };

      poster.append(image);
    } else {
      poster.append(
        textElement(
          "div",
          item.kind === "tv"
            ? "📺"
            : "🎬",
          "poster-placeholder"
        )
      );
    }

    return poster;
  }

  function makeMovieCard(item) {
    const card = textElement(
      "article",
      "",
      "movie-card"
    );

    const poster = makePoster(item);

    poster.addEventListener(
      "click",
      () => showDetails(item)
    );

    const saved = watchlist.includes(
      titleKey(item)
    );

    const addButton = createButton(
      saved ? "−" : "+",
      event => {
        event.stopPropagation();
        toggleWatchlist(item);
      },
      "add-button"
    );

    addButton.title = saved
      ? t("remove")
      : t("add");

    addButton.setAttribute(
      "aria-label",
      addButton.title
    );

    poster.append(addButton);

    const title = textElement(
      "div",
      item.title,
      "movie-title"
    );

    const subtitle = textElement(
      "div",
      `${item.year || "—"} · ${
        item.kind === "tv"
          ? t("shows")
          : t("movies")
      }`,
      "movie-subtitle"
    );

    card.append(
      poster,
      title,
      subtitle
    );

    return card;
  }

  function renderGrid(
    id,
    items,
    limit = 120
  ) {
    const target = $(id);

    if (!target) return;

    target.replaceChildren();

    const visible = uniqueItems(items)
      .filter(escapeAge)
      .slice(0, limit);

    if (!visible.length) {
      const key =
        id === "watchlistGrid"
          ? "noList"
          : id === "watchedGrid"
            ? "noWatched"
            : "noResults";

      target.append(
        textElement(
          "p",
          t(key),
          "muted"
        )
      );

      return;
    }

    visible.forEach(item => {
      target.append(
        makeMovieCard(item)
      );
    });
  }

  // ========================================
  // Details modal
  // ========================================

  function showDetails(item) {
    currentMovie = item;

    const target = $("movieDetails");
    target.replaceChildren();

    const title = textElement(
      "h2",
      item.title
    );

    const layout = textElement(
      "div",
      "",
      "movie-info"
    );

    const poster = makePoster(item);

    poster.className =
      "detail-poster";

    const info = textElement("div");

    info.append(
      textElement(
        "p",
        `${item.year || "—"} · ${
          item.kind === "tv"
            ? t("shows")
            : t("movies")
        }`,
        "muted"
      )
    );

    info.append(
      textElement(
        "p",
        item.min_age == null
          ? t("ageUnknown")
          : `${item.min_age}+ · ${t("ageEstimate")}`,
        "muted"
      )
    );

    info.append(
      textElement(
        "h3",
        t("synopsis")
      )
    );

    info.append(
      textElement(
        "p",
        item.summary || "—"
      )
    );

    const actions = textElement(
      "div",
      "",
      "detail-actions"
    );

    const inList = watchlist.includes(
      titleKey(item)
    );

    const seen = watched.includes(
      titleKey(item)
    );

    actions.append(
      createButton(
        inList
          ? `− ${t("remove")}`
          : `+ ${t("add")}`,
        () => toggleWatchlist(item)
      )
    );

    actions.append(
      createButton(
        seen
          ? t("removeWatched")
          : t("markWatched"),
        () => toggleWatched(item)
      )
    );

    info.append(actions);

    if (
      item.watch_orders?.release?.length
    ) {
      info.append(
        textElement(
          "h3",
          t("releaseOrder")
        )
      );

      const order =
        document.createElement("ol");

      item.watch_orders.release
        .forEach(name => {
          order.append(
            textElement("li", name)
          );
        });

      info.append(order);
    }

    info.append(
      textElement(
        "h3",
        t("whereToWatch")
      )
    );

    info.append(
      textElement(
        "p",
        t("availabilityUnknown"),
        "muted"
      )
    );

    layout.append(poster, info);
    target.append(title, layout);

    $("movieModal")
      .classList.remove("hidden");

    // Additional TMDB information and posters
    // are loaded by upgrade.js.

    if (item.source === "tmdb") {
      loadExternalDetails(item, info);
    }
  }

  async function loadExternalDetails(
    item,
    container
  ) {
    try {
      const query = new URLSearchParams({
        kind: item.kind,
        id: item.id,
        region: profile?.country || "IL",
        language:
          language === "he"
            ? "he-IL"
            : "en-US"
      });

      const data = await getAPI(
        `/api/details?${query}`
      );

      if (
        !currentMovie ||
        titleKey(currentMovie) !==
          titleKey(item)
      ) {
        return;
      }

      if (data.providers?.length) {
        container.append(
          textElement(
            "p",
            data.providers.join(", ")
          )
        );
      }

      if (data.link) {
        const link =
          document.createElement("a");

        link.textContent =
          t("whereToWatch");

        link.href = data.link;
        link.target = "_blank";
        link.rel =
          "noopener noreferrer";

        container.append(link);
      }

    } catch (error) {
      console.warn(
        "Details unavailable:",
        error
      );
    }
  }

  // ========================================
  // Smart search with typo correction
  // ========================================

  function levenshtein(a, b) {
    const row = Array.from(
      {length: b.length + 1},
      (_, i) => i
    );

    for (let i = 1; i <= a.length; i++) {
      let previous = row[0];
      row[0] = i;

      for (let j = 1; j <= b.length; j++) {
        const original = row[j];

        row[j] = Math.min(
          row[j] + 1,
          row[j - 1] + 1,
          previous +
            (a[i - 1] === b[j - 1]
              ? 0
              : 1)
        );

        previous = original;
      }
    }

    return row[b.length];
  }

  function searchLocally(query) {
    const q = normalize(query);

    if (!q) {
      return {
        items: [],
        correction: null
      };
    }

    const matches = [];

    catalog.forEach(item => {
      const names = [
        item.title,
        ...(item.aliases || []),
        ...(item.tags || [])
      ];

      let best = 0;
      let corrected = false;

      for (const candidate of names) {
        const value =
          normalize(candidate);

        if (!value) continue;

        if (
          value.includes(q) ||
          q.includes(value)
        ) {
          best = 100;
          corrected = false;
          break;
        }

        if (q.length >= 4) {
          const distance =
            levenshtein(q, value);

          if (
            distance <= 2 &&
            best < 80
          ) {
            best =
              80 - distance * 10;

            corrected = true;
          }
        }
      }

      if (best > 0) {
        matches.push({
          item,
          score: best,
          corrected
        });
      }
    });

    matches.sort(
      (a, b) => b.score - a.score
    );

    return {
      items: matches.map(x => x.item),
      correction:
        matches[0]?.corrected
          ? matches[0].item.title
          : null
    };
  }

  async function search() {
    const query =
      $("searchInput").value.trim();

    const kind =
      $("searchType").value;

    const thisRequest =
      ++searchRequestId;

    if (!query) {
      currentSearch = [];
      currentCorrection = null;
      renderSearch();
      return;
    }

    const local =
      searchLocally(query);

    let items = [...local.items];
    let correction = local.correction;

    try {
      const params =
        new URLSearchParams({
          q: query,
          language:
            language === "he"
              ? "he-IL"
              : "en-US"
        });

      const data = await getAPI(
        `/api/search?${params}`
      );

      if (
        thisRequest !== searchRequestId
      ) {
        return;
      }

      items = uniqueItems([
        ...items,
        ...(data.items || [])
      ]);

      if (
        !correction &&
        data.corrected
      ) {
        correction = data.corrected;
      }

    } catch (error) {
      console.warn(
        "Online search unavailable:",
        error
      );
    }

    if (
      thisRequest !== searchRequestId
    ) {
      return;
    }

    if (kind !== "both") {
      items = items.filter(
        item => item.kind === kind
      );
    }

    currentSearch = items;
    currentCorrection = correction;

    renderSearch();
  }

  function renderSearch() {
    const correction =
      $("correction");

    if (currentCorrection) {
      correction.textContent =
        `${t("correction")} ${currentCorrection}`;

      correction.classList.remove(
        "hidden"
      );
    } else {
      correction.classList.add(
        "hidden"
      );
    }

    renderGrid(
      "searchGrid",
      currentSearch,
      120
    );
  }

  // ========================================
  // Personalized recommendations
  // ========================================

  function recommend() {
    const selected =
      $$("#interests button.active")
        .map(button =>
          button.dataset.theme
        );

    const description =
      normalize(
        $("favoriteText").value
      );

    const ranked = catalog
      .filter(escapeAge)
      .map(item => {
        const themes =
          item.themes || [];

        let score =
          Number(item.popularity || 0)
          / 10;

        selected.forEach(theme => {
          if (themes.includes(theme)) {
            score += 50;
          }
        });

        const combined = normalize([
          item.title,
          ...(item.aliases || []),
          ...(item.tags || [])
        ].join(" "));

        if (
          description &&
          (
            combined.includes(description) ||
            description.includes(
              normalize(item.title)
            )
          )
        ) {
          score += 100;
        }

        return {item, score};
      })
      .sort(
        (a, b) =>
          b.score - a.score
      );

    currentRecommendations =
      ranked.map(x => x.item);

    navigate("recommended");
  }

  // ========================================
  // Netflix and Marvel lists
  // ========================================

  function marvelTitles() {
    return catalog.filter(
      item => item.group === "marvel"
    );
  }

  function netflixTitles() {
    return catalog.filter(
      item => item.group === "netflix"
    );
  }

  function seriesTitles() {
    return catalog.filter(
      item => item.kind === "tv"
    );
  }

  function watchedTitles() {
    return catalog.filter(
      item =>
        watched.includes(
          titleKey(item)
        )
    );
  }

  function savedTitles() {
    return catalog.filter(
      item =>
        watchlist.includes(
          titleKey(item)
        )
    );
  }

  function showNetflix() {
    navigate("search");

    $("searchInput").value =
      "Netflix";

    $("searchType").value =
      "both";

    search();
  }

  function showMarvel() {
    navigate("search");

    $("searchInput").value =
      "Marvel";

    $("searchType").value =
      "both";

    search();
  }

  // ========================================
  // Render all pages
  // ========================================

  function renderEverything() {
    if (!profile) return;

    renderGrid(
      "marvelGrid",
      marvelTitles(),
      16
    );

    renderGrid(
      "seriesGrid",
      seriesTitles(),
      16
    );

    renderGrid(
      "watchlistGrid",
      savedTitles()
    );

    renderGrid(
      "watchedGrid",
      watchedTitles()
    );

    renderSearch();

    renderGrid(
      "recommendGrid",
      currentRecommendations,
      36
    );
  }

  // ========================================
  // Load catalog from Python server
  // ========================================

  async function loadCatalog() {
    try {
      const data = await getAPI(
        "/api/catalog"
      );

      catalog =
        data.items || [];

      console.log(
        "MovieMatch titles loaded:",
        catalog.length
      );

      renderEverything();

    } catch (error) {
      console.error(
        "Catalog loading failed:",
        error
      );

      showToast(
        "Could not load the catalog"
      );
    }
  }

  // ========================================
  // Start application
  // ========================================

  function init() {
    // Navigation
    $$("[data-page]").forEach(
      button => {
        button.addEventListener(
          "click",
          () => navigate(
            button.dataset.page
          )
        );
      }
    );

    // Mobile menu
    $("menuToggle").onclick = () => {
      $("sidebar")
        .classList.toggle("open");
    };

    // Profile dropdown
    $("profileButton").onclick = () => {
      $("profileDropdown")
        .classList.toggle("hidden");
    };

    $("editProfile").onclick =
      openProfile;

    $("switchProfile").onclick =
      openProfile;

    $("closeProfile").onclick =
      closeProfile;

    $("saveProfile").onclick =
      saveProfile;

    // Explore Marvel
    $("discoverMarvel").onclick =
      showMarvel;

    $("moreMarvel").onclick =
      showMarvel;

    // Search
    $("searchButton").onclick =
      search;

    $("searchType").onchange =
      search;

    $("searchInput").onkeydown =
      event => {
        if (event.key === "Enter") {
          search();
        }
      };

    let searchDelay;

    $("searchInput").oninput = () => {
      clearTimeout(searchDelay);

      searchDelay = setTimeout(
        search,
        350
      );
    };

    // Interests
    $$("#interests button").forEach(
      button => {
        button.onclick = () => {
          button.classList.toggle(
            "active"
          );
        };
      }
    );

    $("recommendButton").onclick =
      recommend;

    // Close movie details
    $("closeMovie").onclick = () => {
      $("movieModal")
        .classList.add("hidden");

      currentMovie = null;
    };

    // Language
    $("language").onchange =
      event => {
        language =
          event.target.value;

        localStorage.setItem(
          KEYS.language,
          language
        );

        translateInterface();
      };

    // Close profile dropdown when
    // clicking outside it
    document.addEventListener(
      "click",
      event => {
        const area =
          document.querySelector(
            ".profile-area"
          );

        if (
          area &&
          !area.contains(event.target)
        ) {
          $("profileDropdown")
            .classList.add("hidden");
        }
      }
    );

    translateInterface();

    loadCatalog();

    // Profile setup on first entry
    if (!profile) {
      openProfile();
    }
  }

  document.addEventListener(
    "DOMContentLoaded",
    init
  );
})();
