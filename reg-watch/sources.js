(function () {
  "use strict";

  // Everything shown here comes from data/sources.json, which build_index.py
  // generates from config.yaml. Nothing about the regulators is hard-coded.
  var DATA_URL = "data/sources.json";

  var el = {
    summary: document.getElementById("dir-summary"),
    status: document.getElementById("status"),
    active: document.getElementById("active"),
    activeList: document.getElementById("active-list"),
    inactive: document.getElementById("inactive"),
    inactiveList: document.getElementById("inactive-list")
  };

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

  function isWebUrl(url) {
    return typeof url === "string" && /^https?:\/\//i.test(url);
  }

  function hostOf(url) {
    var match = /^https?:\/\/([^\/?#]+)/i.exec(url);
    return match ? match[1] : url;
  }

  function renderRegulator(reg) {
    var li = make("li", { className: "reg" + (reg.enabled ? "" : " is-inactive") });

    li.appendChild(make("span", { className: "reg-abbr" }, reg.abbreviation));

    var names = make("div", { className: "reg-names" });
    names.appendChild(make("span", { className: "reg-ja" }, reg.name_ja || reg.name));
    names.appendChild(make("span", { className: "reg-official", lang: "en" }, reg.name));
    if (reg.name_en && reg.name_en !== reg.name) {
      names.appendChild(make("span", { className: "reg-en", lang: "en" }, reg.name_en));
    }
    li.appendChild(names);

    var side = make("div", { className: "reg-side" });
    if (isWebUrl(reg.url)) {
      var link = make("a", { href: reg.url, rel: "noopener", target: "_blank" }, "公式サイト");
      side.appendChild(link);
      side.appendChild(make("span", { className: "reg-host" }, hostOf(reg.url)));
    }
    if (!reg.enabled) side.appendChild(make("span", { className: "badge-inactive" }, "収集対象外"));
    li.appendChild(side);
    return li;
  }

  // One block per country, holding only the regulators of the given status,
  // so a country with both collected and stopped regulators appears in both
  // sections with the matching regulators.
  function renderCountries(countries, enabled) {
    var frag = document.createDocumentFragment();
    var count = 0;
    countries.forEach(function (country) {
      var regs = (country.regulators || []).filter(function (r) { return !!r.enabled === enabled; });
      if (!regs.length) return;
      count += 1;
      var block = make("section", { className: "country-block" });
      var head = make("h3", { className: "country-head" });
      head.appendChild(make("span", { className: "country-ja" }, country.country_name_ja || country.country_name));
      head.appendChild(make("span", { className: "country-en", lang: "en" }, country.country_name));
      head.appendChild(make("span", { className: "country-n" }, regs.length + "当局"));
      block.appendChild(head);
      var list = make("ul", { className: "reg-list" });
      regs.forEach(function (reg) { list.appendChild(renderRegulator(reg)); });
      block.appendChild(list);
      frag.appendChild(block);
    });
    return { frag: frag, count: count };
  }

  function init(dir) {
    if (!dir || !Array.isArray(dir.countries)) throw new Error("unexpected data");
    el.summary.textContent = dir.country_count + "か国・地域／" + dir.regulator_count + "当局";

    var active = renderCountries(dir.countries, true);
    el.activeList.appendChild(active.frag);
    el.active.hidden = active.count === 0;

    var inactive = renderCountries(dir.countries, false);
    el.inactiveList.appendChild(inactive.frag);
    el.inactive.hidden = inactive.count === 0;

    el.status.textContent = "";
    el.status.hidden = true;
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
