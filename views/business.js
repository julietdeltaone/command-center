/* views/business.js — Luna. The whole Business page. See views/CONTRACT.md.
   Three columns: Business Pulse (left), Leads (middle), Marketing + Money (right).
   Everything renders from api.data.items with tab "Business". Counts only, no private data. */
CC.views.Business = function (api) {
  var h = api.h;
  var PULSE_URL = "https://julietdeltaone.github.io/business-pulse/";
  var all = (api.data.items || []).filter(function (i) { return i.tab === "Business"; });

  function mod(name) {
    return all.filter(function (i) { return i.module === name; })
      .sort(function (a, b) { return new Date(b.time) - new Date(a.time); });
  }
  function clock(iso) {
    if (!iso) return null;
    var d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  function readLine(it, label) {
    var c = it && clock(it.time);
    return h("div", { class: "biz-read" }, c ? (label || "read") + " " + c : "No reading");
  }
  function head(title, status) {
    return h("div", { class: "mhead" }, h("h3", null, title),
      status ? h("div", { class: "status" }, h("span", { class: "dot " + status.state }), status.text) : null);
  }
  function seg(text, from, to) {
    var a = text.indexOf(from);
    if (a < 0) return null;
    a += from.length;
    var b = to ? text.indexOf(to, a) : -1;
    return text.slice(a, b < 0 ? text.length : b).replace(/^\s+|\s+$/g, "").replace(/\.$/, "");
  }

  /* ---------- LEFT: Business Pulse ---------- */
  function rankBlock(title, rows, it) {
    if (!rows || !rows.length) return null;
    return h("div", { class: "biz-rank" },
      h("div", { class: "biz-rank-t" }, title),
      rows.map(function (r, ix) {
        return h("div", { class: "biz-rank-r" },
          h("span", { class: "biz-rank-n" }, String(ix + 1)),
          h("span", { class: "biz-rank-h" }, r[0]),
          h("span", { class: "biz-rank-v" }, r[1]));
      }),
      readLine(it));
  }
  function pulseCol() {
    var comp = mod("Competitors");
    var card = h("section", { class: "card mod biz-card biz-click" });
    card.addEventListener("click", function () { window.open(PULSE_URL, "_blank", "noopener"); });
    card.appendChild(h("div", { class: "mhead" },
      h("h3", null, "Business Pulse"),
      h("a", { class: "biz-open", href: PULSE_URL, target: "_blank", rel: "noopener" }, "Open")));
    var it = comp.filter(function (i) { return i.text && i.text.indexOf("Most new followers") > -1; })[0] || null;
    if (it) {
      var fol = [], m, re = /([a-z0-9._]+) \+(\d+) \(([\d,]+)\)/gi;
      var folSeg = seg(it.text, "Most new followers, last 7 days:", "Most new posts");
      while (folSeg && (m = re.exec(folSeg))) fol.push([m[1], "+" + m[2] + " · " + m[3] + " total"]);
      var posts = [], re2 = /([a-z0-9._]+) (\d+)/gi;
      var postSeg = seg(it.text, "Most new posts, last 7 days:", "Pricing moves");
      while (postSeg && (m = re2.exec(postSeg))) posts.push([m[1], m[2] + (m[2] === "1" ? " post" : " posts")]);
      var price = seg(it.text, "Pricing moves in the last 2 days:", "JD Meyers Productions");
      var jd = seg(it.text, "JD Meyers Productions:", null);
      var jdRow = null;
      if (jd) {
        var jm = /(\d[\d,]*) followers, (down|up) (\d+)/.exec(jd);
        if (jm) jdRow = h("div", { class: "biz-jd" },
          h("span", null, "JD Meyers Productions: " + jm[1] + " followers"),
          h("span", { class: "biz-jd-d " + (jm[2] === "down" ? "dn" : "up") },
            (jm[2] === "down" ? "down " : "up ") + jm[3] + " in 7 days"));
      }
      card.appendChild(rankBlock("Most new followers, last 7 days", fol.slice(0, 3), it));
      card.appendChild(rankBlock("Most new posts, last 7 days", posts.slice(0, 3), it));
      if (price != null) card.appendChild(h("div", { class: "biz-rank" },
        h("div", { class: "biz-rank-t" }, "Pricing moves, last 2 days"),
        h("div", { class: "biz-price" }, price === "none read" ? "None read" : price),
        readLine(it)));
      if (jdRow) card.appendChild(h("div", { class: "biz-rank" }, jdRow, readLine(it)));
    } else if (comp.length) {
      comp.slice(0, 3).forEach(function (i2) {
        card.appendChild(h("div", { class: "biz-line" }, i2.text));
        card.appendChild(readLine(i2));
      });
    } else {
      card.appendChild(h("div", { class: "biz-empty" }, "No reading yet"));
    }
    return h("div", { class: "biz-col" }, card);
  }

  /* ---------- MIDDLE: Leads ---------- */
  function leadsCol() {
    var leads = mod("Leads");
    var card = h("section", { class: "card mod biz-card" });
    card.appendChild(head("Leads", api.moduleStatus("Leads")));
    if (!leads.length) {
      card.appendChild(h("div", { class: "biz-empty" }, "No leads read"));
      return h("div", { class: "biz-col" }, card);
    }
    leads.slice(0, 6).forEach(function (it) {
      var parts = String(it.text || "").split("Recommended action:");
      var row = h("div", { class: "biz-lead" },
        h("div", { class: "biz-lead-t" }, parts[0].replace(/\s+$/, "")));
      if (parts.length > 1) row.appendChild(h("div", { class: "biz-act" },
        h("b", null, "Recommended action:"), " " + parts.slice(1).join("Recommended action:").replace(/^\s+/, "")));
      row.appendChild(h("div", { class: "biz-meta" },
        h("span", null, it.source || ""), h("span", null, api.ago(it.time)), readLine(it, "logged")));
      card.appendChild(row);
    });
    return h("div", { class: "biz-col" }, card);
  }

  /* ---------- RIGHT: Marketing + Money ---------- */
  function rightCol() {
    var wrap = h("div", { class: "biz-col" });
    var mk = mod("Marketing");
    var mcard = h("section", { class: "card mod biz-card" });
    mcard.appendChild(head("Marketing moves", api.moduleStatus("Marketing")));
    if (!mk.length) mcard.appendChild(h("div", { class: "biz-empty" }, "No reading yet"));
    mk.slice(0, 5).forEach(function (it) {
      mcard.appendChild(h("div", { class: "biz-line" }, it.text));
      mcard.appendChild(h("div", { class: "biz-meta" },
        h("span", null, it.source || ""), h("span", null, api.ago(it.time)), readLine(it)));
    });
    wrap.appendChild(mcard);
    var money = mod("Money");
    var kcard = h("section", { class: "card mod biz-card" });
    kcard.appendChild(head("Money", null));
    if (!money.length) kcard.appendChild(h("div", { class: "biz-empty" }, "No reading yet"));
    money.slice(0, 3).forEach(function (it) {
      kcard.appendChild(h("div", { class: "biz-line" }, it.text));
      kcard.appendChild(h("div", { class: "biz-meta" },
        h("span", null, it.source || ""), readLine(it)));
    });
    wrap.appendChild(kcard);
    return wrap;
  }

  return h("div", { class: "biz3" }, pulseCol(), leadsCol(), rightCol());
};
