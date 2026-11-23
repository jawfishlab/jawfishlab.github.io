(function () {
  "use strict";

  var DATA_URL = "data/updates.json";
  var PAGE_SIZE = 30;
  var DAY_MS = 24 * 60 * 60 * 1000;
  var MONTHS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

  // Display labels only. Classification lives entirely in the JSON.
  var TOPIC_LABELS = {
    cyber_security: "サイバーセキュリティ",
    ai: "AI",
    privacy_data_protection: "個人情報保護"
  };
  var STAGE_LABELS = {
    consultation: "意見募集",
    final_rule: "規則確定",
    guidance: "ガイダンス",
    enforcement: "処分・執行",
    announcement: "発表",
    unknown: "不明"
  };
  var COUNTRY_LABELS = {
    SG: "シンガポール",
    HK: "香港",
    JP: "日本",
    AU: "オーストラリア"
  };

  var state = {
    items: [],
    generatedAt: null,
    sortKey: "date",
    sortDir: "desc",
    shown: PAGE_SIZE
  };

  var el = {
    q: document.getElementById("q"),
    country: document.getElementById("f-country"),
    topic: document.getElementById("f-topic"),
    stage: document.getElementById("f-stage"),
    year: document.getElementById("f-year"),
    month: document.getElementById("f-month"),
    recent: document.getElementById("f-recent"),
    reset: document.getElementById("reset"),
    rows: document.getElementById("rows"),
    status: document.getElementById("status"),
    more: document.getElementById("more"),
    range: document.getElementById("meta-range"),
    count: document.getElementById("meta-count"),
    generated: document.getElementById("meta-generated"),
    sortButtons: document.querySelectorAll("th button[data-sort]")
  };

  function countryLabel(code, fallback) {
    return COUNTRY_LABELS[code] || fallback || code;
  }

  function formatJst(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    var jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    function pad(n) { return (n < 10 ? "0" : "") + n; }
    return jst.getUTCFullYear() + "-" + pad(jst.getUTCMonth() + 1) + "-" + pad(jst.getUTCDate()) +
      " " + pad(jst.getUTCHours()) + ":" + pad(jst.getUTCMinutes()) + " JST";
  }

  function make(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (key === "className") node.className = attrs[key];
        else node.setAttribute(key, attrs[key]);
      });
    }
    if (text != null) node.textContent = text;
    return node;
  }

  function fillSelect(select, values, labeler) {
    values.forEach(function (value) {
      select.appendChild(make("option", { value: value }, labeler(value)));
    });
  }

  function uniq(list) {
    var seen = {};
    return list.filter(function (v) {
      if (seen[v]) return false;
      seen[v] = true;
      return true;
    });
  }

  // Returns { year: "YYYY", month: "MM" } for a YYYY-MM-DD published_at, or null
  // when it is missing or cannot be read as a real calendar date.
  function publishedYearMonth(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var date = new Date(Date.UTC(y, mo - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
    return { year: m[1], month: m[2] };
  }

  function searchText(item) {
    return [item.title, item.title_ja || "", item.summary_ja, item.regulator,
      item.country_name, countryLabel(item.country_code)].join("\n").toLowerCase();
  }

  function readFilters() {
    return {
      q: el.q.value.trim().toLowerCase(),
      country: el.country.value,
      topic: el.topic.value,
      stage: el.stage.value,
      year: el.year.value,
      month: el.month.value,
      recent: el.recent.checked
    };
  }

  function applyFilters(items, f) {
    var terms = f.q ? f.q.split(/\s+/) : [];
    var cutoff = Date.now() - DAY_MS;
    return items.filter(function (item) {
      if (f.country && item.country_code !== f.country) return false;
      if (f.topic && item.topics.indexOf(f.topic) === -1) return false;
      if (f.stage && item.stage !== f.stage) return false;
      if (f.year || f.month) {
        // Undated or unparseable items only drop out once a year or month is chosen.
        var ym = item._ym;
        if (!ym) return false;
        if (f.year && ym.year !== f.year) return false;
        if (f.month && ym.month !== f.month) return false;
      }
      if (f.recent) {
        var touched = Date.parse(item.updated_at || item.collected_at);
        if (!(touched >= cutoff)) return false;
      }
      if (terms.length) {
        var hay = item._search;
        for (var i = 0; i < terms.length; i++) {
          if (hay.indexOf(terms[i]) === -1) return false;
        }
      }
      return true;
    });
  }

  function sortValue(item, key) {
    switch (key) {
      case "date": return item.published_at || "";
      case "title": return item.title.toLowerCase();
      case "country": return item.country_code + " " + item.regulator;
      case "topic": return item.topics.map(function (t) { return TOPIC_LABELS[t] || t; }).join(",");
      case "stage": return STAGE_LABELS[item.stage] || item.stage;
      default: return "";
    }
  }

  function applySort(items) {
    var key = state.sortKey;
    var dir = state.sortDir === "asc" ? 1 : -1;
    return items.slice().sort(function (a, b) {
      var va = sortValue(a, key);
      var vb = sortValue(b, key);
      // Undated items always go last, whichever direction.
      if (key === "date" && (!va || !vb) && va !== vb) return va ? -1 : 1;
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

  function renderRow(item) {
    var tr = make("tr");

    tr.appendChild(make("td", { className: "c-date" }, item.published_at || "日付不明"));

    var titleCell = make("td", { className: "c-title" });
    var link = make("a", { href: item.url, rel: "noopener", target: "_blank", lang: item.country_code === "JP" ? "ja" : "en" }, item.title);
    titleCell.appendChild(make("div", { className: "title" })).appendChild(link);
    if (item.summary_ja) {
      // summary_ja holds an extractive excerpt in the source language (English for
      // non-JP sources), so it is labelled as an excerpt, not a Japanese summary.
      var excerpt = make("p", { className: "summary" });
      excerpt.appendChild(make("span", { className: "excerpt-label" }, "原文抜粋"));
      excerpt.appendChild(make("span", { lang: item.country_code === "JP" ? "ja" : "en" }, item.summary_ja));
      titleCell.appendChild(excerpt);
    }
    tr.appendChild(titleCell);

    var src = make("td", { className: "c-src" });
    src.appendChild(make("span", { className: "country" }, countryLabel(item.country_code, item.country_name)));
    src.appendChild(make("span", { className: "regulator" }, item.regulator));
    tr.appendChild(src);

    var topics = make("td", { className: "c-topic" });
    item.topics.forEach(function (t) {
      topics.appendChild(make("span", { className: "tag topic-" + t }, TOPIC_LABELS[t] || t));
    });
    tr.appendChild(topics);

    tr.appendChild(make("td", { className: "c-stage stage-" + item.stage }, STAGE_LABELS[item.stage] || item.stage));

    var linkCell = make("td", { className: "c-link" });
    linkCell.appendChild(make("a", { href: item.url, rel: "noopener", target: "_blank", "aria-label": "出典を開く: " + item.title }, "公式公表"));
    tr.appendChild(linkCell);
    return tr;
  }

  function render() {
    var filtered = applySort(applyFilters(state.items, readFilters()));
    var visible = filtered.slice(0, state.shown);

    el.rows.textContent = "";
    var frag = document.createDocumentFragment();
    visible.forEach(function (item) { frag.appendChild(renderRow(item)); });
    if (!visible.length) {
      var tr = make("tr", { className: "empty" });
      tr.appendChild(make("td", { colspan: "6" }, "条件に一致する公表はありません。"));
      frag.appendChild(tr);
    }
    el.rows.appendChild(frag);

    el.status.textContent = state.items.length + "件中 " + filtered.length + "件" +
      (filtered.length > visible.length ? "（" + visible.length + "件を表示）" : "");
    el.more.hidden = filtered.length <= visible.length;

    el.sortButtons.forEach(function (btn) {
      var th = btn.parentNode;
      if (btn.getAttribute("data-sort") === state.sortKey) {
        th.setAttribute("aria-sort", state.sortDir === "asc" ? "ascending" : "descending");
      } else {
        th.removeAttribute("aria-sort");
      }
    });
  }

  function resetPaging() {
    state.shown = PAGE_SIZE;
    render();
  }

  function setHeader(data) {
    var dates = data.items.map(function (i) { return i.published_at; }).filter(Boolean).sort();
    el.range.textContent = dates.length ? dates[0] + " 〜 " + dates[dates.length - 1] : "—";
    el.count.textContent = data.items.length + "件";
    el.generated.textContent = formatJst(data.generated_at);
  }

  function init(data) {
    state.items = data.items.map(function (item) {
      item._search = searchText(item);
      item._ym = publishedYearMonth(item.published_at);
      return item;
    });
    setHeader(data);

    fillSelect(el.country, uniq(data.sources.map(function (s) { return s.country_code; })), function (code) {
      var src = data.sources.filter(function (s) { return s.country_code === code; });
      var regs = uniq(src.map(function (s) { return s.regulator; })).join("・");
      return countryLabel(code, src[0] && src[0].country_name) + "（" + regs + "）";
    });
    fillSelect(el.topic, Object.keys(TOPIC_LABELS), function (t) { return TOPIC_LABELS[t]; });
    fillSelect(el.stage, Object.keys(STAGE_LABELS), function (s) { return STAGE_LABELS[s]; });
    fillSelect(el.year, uniq(state.items.map(function (i) { return i._ym && i._ym.year; }).filter(Boolean)).sort().reverse(),
      function (y) { return y + "年"; });
    fillSelect(el.month, MONTHS, function (m) { return (+m) + "月"; });

    var timer = null;
    el.q.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(resetPaging, 120);
    });
    [el.country, el.topic, el.stage, el.year, el.month, el.recent].forEach(function (control) {
      control.addEventListener("change", resetPaging);
    });
    el.reset.addEventListener("click", function () {
      el.q.value = "";
      el.country.value = "";
      el.topic.value = "";
      el.stage.value = "";
      el.year.value = "";
      el.month.value = "";
      el.recent.checked = false;
      resetPaging();
    });
    el.more.addEventListener("click", function () {
      state.shown += PAGE_SIZE;
      render();
    });
    el.sortButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.getAttribute("data-sort");
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        } else {
          state.sortKey = key;
          state.sortDir = key === "date" ? "desc" : "asc";
        }
        render();
      });
    });

    render();
  }

  fetch(DATA_URL, { cache: "no-cache" })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(init)
    .catch(function (err) {
      el.status.textContent = "データを読み込めませんでした（" + err.message + "）。";
      el.status.className = "status error";
    });
})();
