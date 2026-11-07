
"use strict";

(() => {
  const $ = id => document.getElementById(id);
  const $$ = selector => [...document.querySelectorAll(selector)];

  const KEYS = {
    profile: "mm3-profile",
    list: "mm3-list",
    watched: "mm3-watched",
    language: "mm3-language"
  };

  const AVATARS = [
    { id:"spider", icon:"🕷️", name:"Spider", color:"#e63b57" },
    { id:"armor", icon:"🤖", name:"Armor", color:"#d99b2b" },
    { id:"thunder", icon:"⚡", name:"Thunder", color:"#2788ed" },
    { id:"shield", icon:"🛡️", name:"Shield", color:"#4775db" },
    { id:"panther", icon:"🐈‍⬛", name:"Panther", color:"#995de2" },
    { id:"wizard", icon:"🔮", name:"Wizard", color:"#d36cce" },
    { id:"dragon", icon:"🐉", name:"Dragon", color:"#169f89" },
    { id:"space", icon:"🚀", name:"Space", color:"#dc7854" },
    { id:"ninja", icon:"🥷", name:"Ninja", color:"#7378dd" },
    { id:"hero", icon:"🦸", name:"Hero", color:"#2da77d" }
  ];

  function saved(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  }

  let profile = saved(KEYS.profile, null);
  let watchlist = saved(KEYS.list, []);
  let watched = saved(KEYS.watched, []);
  let language = localStorage.getItem(KEYS.language) || "he";
  let selectedAvatar = profile?.avatar || "spider";
  let catalog = [];
  let currentPage = "home";
  let currentMovie = null;

  const text = key =>
    window.I18N[language]?.[key] || window.I18N.he[key] || key;

  function make(tag, content = "", className = "") {
    const node = document.createElement(tag);
    node.textContent = content == null ? "" : String(content);
    if (className) node.className = className;
    return node;
  }

  function button(label, action, className = "") {
    const node = make("button", label, className);
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  }

  async function api(path) {
    const response = await fetch(path);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "API error");
    return data;
  }

  function keyFor(item) {
    return `${item.source || "local"}:${item.kind}:${item.id}`;
  }

  function eligible(item) {
    if (!profile) return false;

    // Unknown ratings are excluded for children.
    if (item.min_age == null) {
      return profile.age >= 18;
    }

    return Number(item.min_age) <= profile.age;
  }

  function avatar() {
    return AVATARS.find(x => x.id === selectedAvatar) || AVATARS[0];
  }

  function setTheme() {
    const chosen = AVATARS.find(
      x => x.id === profile?.avatar
    ) || AVATARS[0];

    document.documentElement.style.setProperty(
      "--accent", chosen.color
    );

    $("profileAvatar").textContent = chosen.icon;
    $("heroSymbol").textContent = chosen.icon;
    $("profileUsername").textContent = profile?.username || "Profile";

    $("welcome").textContent = profile
      ? (language === "he"
          ? `היי ${profile.username}! מה נראה היום?`
          : `Hi ${profile.username}! What are we watching?`)
      : "MovieMatch";
  }

  function translate() {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "he" ? "rtl" : "ltr";
    $("language").value = language;

    $$("[data-i18n]").forEach(node => {
      node.textContent = text(node.dataset.i18n);
    });

    $$("[data-placeholder]").forEach(node => {
      node.placeholder = text(node.dataset.placeholder);
    });

    $("pageTitle").textContent = text(
      currentPage === "recommended" ? "recommended" : currentPage
    );

    setTheme();
    render();
  }

  function drawAvatars() {
    const target = $("avatarChoices");
    target.replaceChildren();

    AVATARS.forEach(choice => {
      const b = make("button", choice.icon, "avatar-choice");
      b.type = "button";
      b.title = choice.name;
      b.setAttribute("aria-label", choice.name);

      if (selectedAvatar === choice.id) {
        b.classList.add("selected");
      }

      b.addEventListener("click", () => {
        selectedAvatar = choice.id;

        document.documentElement.style.setProperty(
          "--accent", choice.color
        );

        drawAvatars();
      });

      target.appendChild(b);
    });
  }

  function openProfile() {
    $("profileDropdown").classList.add("hidden");

    $("username").value = profile?.username || "";
    $("age").value = profile?.age || 14;
    $("country").value = profile?.country || "IL";

    selectedAvatar = profile?.avatar || "spider";

    $("closeProfile").classList.toggle(
      "hidden", !profile
    );

    $("profileError").textContent = "";
    drawAvatars();

    $("profileModal").classList.remove("hidden");
  }

  function saveProfile() {
    const username = $("username").value.trim();
    const age = Number($("age").value);

    if (!username || !Number.isInteger(age) ||
        age < 1 || age > 100) {
      $("profileError").textContent = text("invalidProfile");
      return;
    }

    profile = {
      username: username.slice(0, 32),
      age,
      country: $("country").value,
      avatar: selectedAvatar
    };

    localStorage.setItem(
      KEYS.profile, JSON.stringify(profile)
    );

    $("profileModal").classList.add("hidden");

    setTheme();
    render();
    notify(text("saved"));
  }

  function notify(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.remove("hidden");

    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => {
      toast.classList.add("hidden");
    }, 2400);
  }

  function navigate(page) {
    currentPage = page;

    $$(".page").forEach(node => {
      node.classList.toggle("active", node.id === `page-${page}`);
    });

    $$(".nav").forEach(node => {
      node.classList.toggle("active", node.dataset.page === page);
    });

    $("pageTitle").textContent = text(page);
    $("sidebar").classList.remove("open");
    window.scrollTo(0, 0);

    render();
  }

  function toggleList(item) {
    const key = keyFor(item);

    watchlist = watchlist.includes(key)
      ? watchlist.filter(x => x !== key)
      : [...watchlist, key];

    localStorage.setItem(
      KEYS.list, JSON.stringify(watchlist)
    );

    render();

    if (!$("movieModal").classList.contains("hidden")) {
      showDetails(item);
    }
  }

  function toggleWatched(item) {
    const key = keyFor(item);

    watched = watched.includes(key)
      ? watched.filter(x => x !== key)
      : [...watched, key];

    localStorage.setItem(
      KEYS.watched, JSON.stringify(watched)
    );

    render();
    showDetails(item);
  }

  function makePoster(item) {
    const wrap = make("div", "", "poster");

    if (item.poster) {
      const img = document.createElement("img");
      img.src = item.poster;
      img.alt = item.title;
      img.loading = "lazy";

      img.onerror = () => {
        img.remove();
        wrap.prepend(make(
          "div", "🎬", "poster-placeholder"
        ));
      };

      wrap.append(img);
    } else {
      wrap.append(make(
        "div", item.kind === "tv" ? "📺" : "🎬",
        "poster-placeholder"
      ));
    }

    return wrap;
  }

  function makeCard(item) {
    const card = make("article", "", "movie-card");
    const poster = makePoster(item);

    poster.addEventListener("click", () => {
      showDetails(item);
    });

    const isSaved = watchlist.includes(keyFor(item));

    const add = button(
      isSaved ? "−" : "+",
      event => {
        event.stopPropagation();
        toggleList(item);
      },
      "add-button"
    );

    add.title = isSaved ? text("remove") : text("add");
    add.setAttribute("aria-label", add.title);
    poster.append(add);

    card.append(
      poster,
      make("div", item.title, "movie-title"),
      make(
        "div",
        `${item.year || "—"} · ${item.kind === "tv" ?
          text("shows") : text("movies")}`,
        "movie-subtitle"
      )
    );

    return card;
  }

  function showGrid(id, items, limit = 100) {
    const target = $(id);
    target.replaceChildren();

    const visible = items.filter(eligible).slice(0, limit);

    if (!visible.length) {
      target.append(make("p", text("noResults"), "muted"));
      return;
    }

    visible.forEach(item => {
      target.append(makeCard(item));
    });
  }

  function unique(items) {
    const keys = new Set();

    return items.filter(item => {
      const key = keyFor(item);
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    });
  }

  function render() {
    showGrid(
      "marvelGrid",
      catalog.filter(item => item.group === "marvel"),
      16
    );

    showGrid(
      "seriesGrid",
      catalog.filter(item => item.kind === "tv"),
      16
    );

    showGrid(
      "watchlistGrid",
      catalog.filter(item =>
        watchlist.includes(keyFor(item))
      )
    );

    showGrid(
      "watchedGrid",
      catalog.filter(item =>
        watched.includes(keyFor(item))
      )
    );
  }

  async function showDetails(item) {
    currentMovie = item;
    const target = $("movieDetails");
    target.replaceChildren();

    const title = make("h2", item.title);
    const layout = make("div", "", "movie-info");
    const poster = makePoster(item);
    const info = make("div");

    poster.className = "detail-poster";

    info.append(
      make("p", `${item.year || "—"} · ${item.kind === "tv" ?
        text("shows") : text("movies")}`, "muted"),
      make(
        "p",
        item.min_age == null
          ? text("ageUnknown")
          : `${item.min_age}+ · ${text("ageEstimate")}`,
        "muted"
      ),
      make("h3", text("synopsis")),
      make("p", item.summary || "—")
    );

    const actions = make("div", "", "detail-actions");

    const inList = watchlist.includes(keyFor(item));
    const hasWatched = watched.includes(keyFor(item));

    actions.append(
      button(
        inList ? `− ${text("remove")}` : `+ ${text("add")}`,
        () => toggleList(item)
      ),
      button(
        hasWatched
          ? text("removeWatched")
          : text("markWatched"),
        () => toggleWatched(item)
      )
    );

    info.append(actions);

    if (item.watch_orders?.release?.length) {
      info.append(make("h3", text("releaseOrder")));

      const list = document.createElement("ol");

      item.watch_orders.release.forEach(name => {
        list.append(make("li", name));
      });

      info.append(list);
    }

    info.append(make("h3", text("whereToWatch")));
    info.append(make("p", text("availabilityUnknown"), "muted"));

    layout.append(poster, info);
    target.append(title, layout);

    $("movieModal").classList.remove("hidden");

    if (item.source === "tmdb") {
      try {
        const query = new URLSearchParams({
          kind: item.kind,
          id: item.id,
          region: profile?.country || "IL",
          language: language === "he" ? "he-IL" : "en-US"
        });

        const details = await api(`/api/details?${query}`);

        if (currentMovie !== item) return;

        if (details.providers?.length) {
          info.append(make(
            "p", details.providers.join(", ")
          ));
        }

        if (details.link) {
          const link = make("a", text("whereToWatch"));
          link.href = details.link;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          info.append(link);
        }

        if (details.collection?.length) {
          info.append(make("h3", text("releaseOrder")));

          const ol = document.createElement("ol");

          details.collection.forEach(name => {
            ol.append(make("li", name));
          });

          info.append(ol);
        }

      } catch (error) {
        console.warn("TMDB details unavailable:", error);
      }
    }
  }

  function levenshtein(a, b) {
    const row = Array.from(
      {length:b.length + 1}, (_,i) => i
    );

    for (let i = 1; i <= a.length; i++) {
      let previous = row[0];
      row[0] = i;

      for (let j = 1; j <= b.length; j++) {
        const old = row[j];

        row[j] = Math.min(
          row[j] + 1,
          row[j - 1] + 1,
          previous + (a[i - 1] === b[j - 1] ? 0 : 1)
        );

        previous = old;
      }
    }

    return row[b.length];
  }

  function normalize(value) {
    return String(value)
      .toLowerCase()
      .replace(/[^a-z0-9\u0590-\u05ff]/g, "");
  }

  function localSearch(query) {
    const q = normalize(query);

    if (!q) return {items:[], correction:null};

    const results = [];

    catalog.forEach(item => {
      const candidates = [
        item.title,
        ...(item.aliases || []),
        ...(item.tags || [])
      ];

      let best = 0;
      let typo = false;

      candidates.forEach(candidate => {
        const name = normalize(candidate);

        if (!name) return;

        if (name.includes(q) || q.includes(name)) {
          best = Math.max(best, 100);
          return;
        }

        const distance = levenshtein(q, name);

        if (distance <= 2 && q.length >= 4) {
          best = Math.max(best, 70 - distance * 10);
          typo = true;
        }
      });

      if (best > 0) results.push({item, score:best, typo});
    });

    results.sort((a,b) => b.score - a.score);

    return {
      items: results.map(x => x.item),
      correction: results[0]?.typo
        ? results[0].item.title
        : null
    };
  }

  async function search() {
    const query = $("searchInput").value.trim();
    const kind = $("searchType").value;

    if (!query) {
      $("searchGrid").replaceChildren();
      $("correction").classList.add("hidden");
      return;
    }

    const result = localSearch(query);

    let items = result.items;

    try {
      const qs = new URLSearchParams({
        q: query,
        language: language === "he" ? "he-IL" : "en-US"
      });

      const online = await api(`/api/search?${qs}`);
      const existing = new Set(items.map(keyFor));

      (online.items || []).forEach(item => {
        if (!existing.has(keyFor(item))) {
          items.push(item);
          existing.add(keyFor(item));
        }
      });

      if (!result.correction && online.corrected) {
        result.correction = online.corrected;
      }
    } catch (error) {
      console.warn("Using local search:", error);
    }

    if (kind !== "both") {
      items = items.filter(item => item.kind === kind);
    }

    if (result.correction) {
      $("correction").textContent =
        `${text("correction")} ${result.correction}`;

      $("correction").classList.remove("hidden");
    } else {
      $("correction").classList.add("hidden");
    }

    showGrid("searchGrid", unique(items), 80);
  }

  function recommend() {
    const chosen = $$("#interests button.active")
      .map(b => b.dataset.theme);

    const free = normalize($("favoriteText").value);

    const scored = catalog
      .filter(eligible)
      .map(item => {
        const themes = item.themes || [];
        const haystack = normalize([
          item.title,
          ...(item.aliases || []),
          ...(item.tags || [])
        ].join(" "));

        let score = (item.popularity || 0) / 10;

        chosen.forEach(theme => {
          if (themes.includes(theme)) score += 50;
        });

        if (free && haystack.includes(free)) {
          score += 100;
        }

        return {item, score};
      })
      .sort((a,b) => b.score - a.score);

    showGrid(
      "recommendGrid",
      scored.map(x => x.item),
      24
    );
  }

  async function loadCatalog() {
    try {
      const data = await api("/api/catalog");
      catalog = data.items || [];
      render();
    } catch (error) {
      console.error(error);
      notify("Could not load catalog");
    }
  }

  function init() {
    $$("[data-page]").forEach(b => {
      b.addEventListener("click", () => {
        navigate(b.dataset.page);
      });
    });

    $("menuToggle").onclick = () => {
      $("sidebar").classList.toggle("open");
    };

    $("profileButton").onclick = () => {
      $("profileDropdown").classList.toggle("hidden");
    };

    $("editProfile").onclick = openProfile;
    $("switchProfile").onclick = openProfile;
    $("closeProfile").onclick = () => {
      if (profile) $("profileModal").classList.add("hidden");
    };

    $("saveProfile").onclick = saveProfile;

    $("discoverMarvel").onclick = () => {
      navigate("search");
      $("searchInput").value = "Marvel";
      search();
    };

    $("moreMarvel").onclick = $("discoverMarvel").onclick;

    $("searchButton").onclick = search;
    $("searchType").onchange = search;

    $("searchInput").onkeydown = event => {
      if (event.key === "Enter") search();
    };

    let searchDelay;
    $("searchInput").oninput = () => {
      clearTimeout(searchDelay);
      searchDelay = setTimeout(search, 350);
    };

    $$("#interests button").forEach(b => {
      b.onclick = () => b.classList.toggle("active");
    });

    $("recommendButton").onclick = recommend;

    $("closeMovie").onclick = () => {
      $("movieModal").classList.add("hidden");
      currentMovie = null;
    };

    $("language").onchange = event => {
      language = event.target.value;
      localStorage.setItem(KEYS.language, language);
      translate();
    };

    translate();
    loadCatalog();

    if (!profile) openProfile();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
