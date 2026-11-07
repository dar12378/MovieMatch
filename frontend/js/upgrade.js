
"use strict";

(() => {
  const $ = id => document.getElementById(id);

  const catalogMap = new Map();
  const infoCache = new Map();
  const pending = new Set();

  const css = document.createElement("style");

  css.textContent = `
    .ai-launch {
      position: fixed;
      bottom: 25px;
      right: 25px;
      z-index: 80;
      padding: 15px 20px;
      border: 0;
      border-radius: 35px;
      background: var(--accent);
      color: white;
      font-weight: bold;
      cursor: pointer;
      box-shadow: 0 10px 35px #0009;
    }

    .ai-panel {
      position: fixed;
      bottom: 85px;
      right: 25px;
      width: min(400px, calc(100vw - 35px));
      height: min(560px, calc(100vh - 110px));
      display: flex;
      flex-direction: column;
      background: #182035;
      border: 1px solid #42516a;
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 20px 60px #000a;
      z-index: 90;
    }

    .ai-hidden { display: none !important; }

    .ai-header {
      padding: 17px;
      background: #263149;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .ai-header button {
      background: transparent;
      border: 0;
      color: white;
      font-size: 22px;
      cursor: pointer;
    }

    .ai-messages {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 15px;
    }

    .ai-message {
      padding: 12px 15px;
      max-width: 90%;
      border-radius: 14px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      line-height: 1.6;
    }

    .ai-user {
      background: var(--accent);
      align-self: flex-end;
    }

    .ai-bot {
      background: #34415d;
      align-self: flex-start;
    }

    .ai-compose {
      padding: 12px;
      display: flex;
      gap: 8px;
      border-top: 1px solid #45506a;
    }

    .ai-compose input {
      flex: 1;
      min-width: 0;
      padding: 11px;
    }

    .ai-compose button {
      padding: 10px 14px;
      color: white;
      border: none;
      border-radius: 9px;
      background: var(--accent);
    }

    .netflix-notice {
      margin: 15px 0;
      background: #222b40;
      border-inline-start: 4px solid #e50914;
      padding: 12px 16px;
      border-radius: 8px;
      color: #d2d8e8;
    }

    .extra-info {
      margin-top: 22px;
      padding: 15px;
      background: #26314a;
      border-radius: 13px;
    }

    .extra-info p {
      line-height: 1.7;
    }

    .extra-info a {
      color: #9fc2ff;
    }
  `;

  document.head.append(css);

  function language() {
    return document.documentElement.lang === "en"
      ? "en" : "he";
  }

  function label(he, en) {
    return language() === "he" ? he : en;
  }

  function create(tag, value, className) {
    const el = document.createElement(tag);
    if (value != null) el.textContent = value;
    if (className) el.className = className;
    return el;
  }

  async function getJSON(url) {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("Request failed");
    }

    return response.json();
  }

  async function loadCatalog() {
    try {
      const data = await getJSON("/api/catalog");

      for (const item of data.items || []) {
        const key = item.title.toLowerCase();

        if (!catalogMap.has(key)) {
          catalogMap.set(key, []);
        }

        catalogMap.get(key).push(item);
      }

      scanCards();
    } catch (error) {
      console.error("Catalog loading error", error);
    }
  }

  function matchItem(title, subtitle = "") {
    const matches = catalogMap.get(
      title.trim().toLowerCase()
    ) || [];

    if (!matches.length) return null;

    const year = subtitle.match(/\b(?:19|20)\d{2}\b/);

    if (year) {
      const byYear = matches.find(
        item => String(item.year) === year[0]
      );

      if (byYear) return byYear;
    }

    return matches[0];
  }

  async function fetchInfo(item) {
    const key = [
      item.title,
      item.kind,
      item.year || ""
    ].join("|");

    if (infoCache.has(key)) {
      return infoCache.get(key);
    }

    if (pending.has(key)) {
      return null;
    }

    pending.add(key);

    try {
      const qs = new URLSearchParams({
        title: item.title,
        kind: item.kind,
        year: item.year || ""
      });

      const result = await getJSON(
        "/api/enrich?" + qs.toString()
      );

      infoCache.set(key, result);
      return result;

    } catch (error) {
      console.warn("Metadata not available", error);
      return null;
    } finally {
      pending.delete(key);
    }
  }

  function updatePoster(card, posterURL, title) {
    if (!posterURL) return;

    const poster = card.querySelector(".poster");

    if (!poster) return;

    let image = poster.querySelector("img");

    if (!image) {
      image = document.createElement("img");
      image.alt = title;
      image.loading = "lazy";

      image.onerror = () => {
        image.remove();
      };

      poster.prepend(image);
    }

    if (image.getAttribute("src") !== posterURL) {
      image.src = posterURL;
    }

    const placeholder = poster.querySelector(
      ".poster-placeholder"
    );

    if (placeholder) placeholder.remove();
  }

  const queue = [];
  const queued = new WeakSet();
  let active = 0;
  const MAX_ACTIVE = 3;

  function scanCards() {
    document.querySelectorAll(".movie-card").forEach(
      card => {
        if (queued.has(card)) return;

        const titleNode = card.querySelector(
          ".movie-title"
        );

        if (!titleNode) return;

        const subtitle = card.querySelector(
          ".movie-subtitle"
        )?.textContent || "";

        const item = matchItem(
          titleNode.textContent, subtitle
        );

        if (!item) return;

        queued.add(card);
        queue.push({card, item});
      }
    );

    processQueue();
  }

  async function processQueue() {
    while (active < MAX_ACTIVE && queue.length) {
      const {card, item} = queue.shift();
      active++;

      fetchInfo(item)
        .then(info => {
          if (info?.poster && card.isConnected) {
            updatePoster(
              card, info.poster, item.title
            );
          }
        })
        .finally(() => {
          active--;
          processQueue();
        });
    }
  }

  function addExtraInfo() {
    const modal = $("movieModal");

    if (!modal ||
        modal.classList.contains("hidden")) {
      return;
    }

    const heading = $("movieDetails")
      ?.querySelector("h2");

    if (!heading) return;

    const title = heading.textContent;
    const item = matchItem(title);

    if (!item) return;

    const container = $("movieDetails");

    if (container.dataset.enrichedTitle === title) {
      return;
    }

    container.dataset.enrichedTitle = title;

    fetchInfo(item).then(info => {
      if (!info || !info.connected) return;

      if (container.dataset.enrichedTitle !== title) {
        return;
      }

      const details = container.querySelector(
        ".movie-info"
      );

      if (!details) return;

      const existing = container.querySelector(
        ".extra-info"
      );

      if (existing) existing.remove();

      const content = create(
        "section", "", "extra-info"
      );

      const titleText = create(
        "h3",
        label("מידע מורחב", "More Information")
      );

      content.append(titleText);

      if (info.overview) {
        content.append(
          create("p", info.overview)
        );
      }

      if (info.genres?.length) {
        content.append(
          create(
            "p",
            label("ז'אנרים: ", "Genres: ")
              + info.genres.join(", ")
          )
        );
      }

      if (info.runtime) {
        content.append(
          create(
            "p",
            label("משך הסרט: ", "Runtime: ")
              + info.runtime
              + label(" דקות", " minutes")
          )
        );
      }

      if (info.seasons) {
        content.append(
          create(
            "p",
            label("עונות: ", "Seasons: ")
              + info.seasons
          )
        );
      }

      if (info.episodes) {
        content.append(
          create(
            "p",
            label("פרקים: ", "Episodes: ")
              + info.episodes
          )
        );
      }

      if (info.votes >= 10) {
        content.append(
          create(
            "p",
            "TMDB: "
              + Number(info.rating).toFixed(1)
              + "/10"
          )
        );
      }

      if (info.tmdb_url) {
        const link = create(
          "a",
          label(
            "עוד מידע ב־TMDB",
            "More on TMDB"
          )
        );

        link.href = info.tmdb_url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        content.append(link);
      }

      details.append(content);

      if (info.poster) {
        const posterArea = details.querySelector(
          ".detail-poster"
        );

        if (posterArea) {
          posterArea.replaceChildren();

          const image = document.createElement("img");
          image.src = info.poster;
          image.alt = item.title;
          image.style.width = "100%";
          image.style.borderRadius = "12px";

          posterArea.append(image);
        }
      }
    });
  }

  function addNetflixNavigation() {
    const navigation = $("navigation");

    if (!navigation) return;

    const netflix = create(
      "button", "", "nav"
    );

    netflix.type = "button";
    netflix.id = "netflixNav";

    const icon = create("span", "N");
    icon.style.color = "#e50914";
    icon.style.fontWeight = "900";

    const title = create(
      "b", "Netflix Top 100"
    );

    netflix.append(icon, title);
    navigation.append(netflix);

    netflix.onclick = () => {
      const searchNav = navigation.querySelector(
        '[data-page="search"]'
      );

      if (!searchNav) return;

      searchNav.click();

      $("searchInput").value = "Netflix";
      $("searchType").value = "both";
      $("searchButton").click();

      $("pageTitle").textContent =
        "Netflix Top 100";

      const heading = $("page-search")
        ?.querySelector("h1");

      if (heading) {
        heading.textContent = "Netflix Top 100";
      }

      netflix.classList.add("active");
      searchNav.classList.remove("active");

      let notice = $("netflixNotice");

      if (!notice) {
        notice = create(
          "div", "", "netflix-notice"
        );

        notice.id = "netflixNotice";

        $("searchGrid").before(notice);
      }

      notice.textContent = label(
        "50 סדרות ו־50 סרטים בולטים. " +
        "זו בחירה מומלצת ולא דירוג רשמי. " +
        "מוצגים רק תכנים שעוברים את " +
        "סינון הגיל של הפרופיל.",
        "50 notable shows and 50 films. " +
        "Curated, not an official ranking. " +
        "Your age filter is applied."
      );
    };

    navigation.querySelectorAll(
      "[data-page]"
    ).forEach(button => {
      button.addEventListener("click", () => {
        netflix.classList.remove("active");

        const notice = $("netflixNotice");
        if (notice) notice.remove();

        const heading = $("page-search")
          ?.querySelector("h1");

        if (heading) {
          heading.textContent = label(
            "חיפוש חכם", "Smart Search"
          );
        }
      });
    });
  }

  function createChat() {
    const launcher = create(
      "button", "✦ MovieMatch AI", "ai-launch"
    );

    const panel = create(
      "section", "", "ai-panel ai-hidden"
    );

    const header = create(
      "div", "", "ai-header"
    );

    const heading = create(
      "strong", "🤖 MovieMatch AI"
    );

    const close = create("button", "✕");

    header.append(heading, close);

    const messages = create(
      "div", "", "ai-messages"
    );

    const form = create(
      "form", "", "ai-compose"
    );

    const input = create("input");

    input.placeholder = label(
      "איזה סרט אתה מחפש?",
      "What would you like to watch?"
    );

    input.maxLength = 1200;

    const send = create(
      "button", label("שלח", "Send")
    );

    send.type = "submit";

    form.append(input, send);
    panel.append(header, messages, form);

    document.body.append(launcher, panel);

    function addMessage(content, type) {
      const node = create(
        "div",
        content,
        "ai-message ai-" + type
      );

      node.dir = "auto";
      messages.append(node);
      messages.scrollTop = messages.scrollHeight;

      return node;
    }

    addMessage(
      label(
        "היי! 🎬 אני העוזר שלך. " +
        "איזה סרטים או סדרות אהבת?",
        "Hi! 🎬 I'm your movie assistant. " +
        "What shows or movies did you enjoy?"
      ),
      "bot"
    );

    launcher.onclick = () => {
      panel.classList.toggle("ai-hidden");
      input.focus();
    };

    close.onclick = () => {
      panel.classList.add("ai-hidden");
    };

    form.onsubmit = async event => {
      event.preventDefault();

      const question = input.value.trim();

      if (!question) return;

      input.value = "";
      addMessage(question, "user");

      const reply = addMessage(
        label("חושב...", "Thinking..."),
        "bot"
      );

      send.disabled = true;

      let profile = {};

      try {
        profile = JSON.parse(
          localStorage.getItem("mm3-profile")
          || "{}"
        );
      } catch {}

      let watchedKeys = [];

      try {
        watchedKeys = JSON.parse(
          localStorage.getItem("mm3-watched")
          || "[]"
        );
      } catch {}

      const watchedTitles = [];

      for (const records of catalogMap.values()) {
        for (const item of records) {
          const key =
            `${item.source || "local"}:`
            + `${item.kind}:${item.id}`;

          if (watchedKeys.includes(key)) {
            watchedTitles.push(item.title);
          }
        }
      }

      try {
        const response = await fetch(
          "/api/ai",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              message: question,
              age: profile.age || 18,
              language: language(),
              watched: watchedTitles
            })
          }
        );

        const result = await response.json();

        reply.textContent = response.ok
          ? (result.answer || "No answer")
          : (result.error || "AI error");

      } catch {
        reply.textContent = label(
          "לא ניתן להתחבר לעוזר כרגע.",
          "Unable to connect to AI."
        );
      } finally {
        send.disabled = false;
      }
    };
  }

  function startObserver() {
    let timer;

    const observer = new MutationObserver(() => {
      clearTimeout(timer);

      timer = setTimeout(() => {
        scanCards();
        addExtraInfo();
      }, 150);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  document.addEventListener(
    "DOMContentLoaded",
    async () => {
      addNetflixNavigation();
      createChat();
      await loadCatalog();
      startObserver();
      scanCards();
    }
  );
})();
