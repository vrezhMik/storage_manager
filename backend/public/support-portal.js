/*
 * Flexit support portal for flexit.am ("Խնդրի գրանցում"), replacing Fluent Support.
 * The page only holds <div id="flexit-support"></div> and this script; everything
 * else comes from admin.flexit.am, so changes need no WordPress edits.
 */
(function () {
  "use strict";

  var API = "https://admin.flexit.am/api/support";
  var TOKEN_KEY = "flexit_support_token";
  var root = document.getElementById("flexit-support");
  if (!root) return;

  var PRODUCTS = ["1C:Հաշվապահություն", "1C:Առևտրի կառավարում", "1C:Комплексная автоматизация / ERP", "1C:Աշխատավարձ և կադրեր", "1C:Մանրածախ", "Այլ / չգիտեմ"];
  var PRIORITIES = [["normal", "Սովորական"], ["medium", "Միջին"], ["critical", "Շտապ՝ աշխատանքը կանգնած է"]];
  var STATUS_COLORS = { new: "#dc2626", in_progress: "#d97706", solved: "#15803d", cancelled: "#6b7280" };
  var params = new URLSearchParams(location.search);
  var state = { token: read(TOKEN_KEY), customer: null };

  // ---------- helpers ----------
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function write(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* private mode */ } }

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    });
    (kids || []).forEach(function (c) { if (c) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return el;
  }

  function api(method, path, body) {
    var opts = { method: method, headers: { Accept: "application/json" } };
    if (state.token) opts.headers.Authorization = "Bearer " + state.token;
    if (body instanceof FormData) opts.body = body;
    else if (body) { opts.body = JSON.stringify(body); opts.headers["Content-Type"] = "application/json"; }
    return fetch(API + path, opts).then(function (r) {
      return r.text().then(function (t) {
        var data = null;
        try { data = t ? JSON.parse(t) : null; } catch (e) { /* not json */ }
        if (r.status === 401 && state.token) { signOut(true); }
        if (!r.ok) { var err = new Error("HTTP " + r.status); err.status = r.status; err.data = data; throw err; }
        return data;
      });
    });
  }

  function errorText(err, fallback) {
    if (err && err.status === 429) return "Շատ փորձեր կարճ ժամանակում։ Սպասեք մեկ րոպե։";
    var errors = err && err.data && err.data.errors;
    if (errors) {
      if (errors.email && /taken/.test(errors.email[0])) return "Այս email-ով արդեն կա հաշիվ։ Մուտք գործեք կամ վերականգնեք գաղտնաբառը։";
      if (errors.password) return "Գաղտնաբառը պետք է լինի առնվազն 8 նիշ։";
      if (errors.description || errors.body) return "Նկարագրությունը շատ կարճ է (առնվազն 10 նիշ)։";
      if (errors.phone) return "Հեռախոսահամարը սխալ է։";
      if (errors.email) return "Email-ը սխալ է։";
    }
    if (err && err.status === 422 && err.data && /Wrong email/.test(err.data.message || "")) return "Email-ը կամ գաղտնաբառը սխալ է։";
    return fallback || "Չհաջողվեց։ Փորձեք կրկին կամ զանգահարեք 033 88 81 89։";
  }

  function when(iso) {
    if (!iso) return "";
    var d = new Date(iso), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getDate()) + "." + p(d.getMonth() + 1) + "." + d.getFullYear() + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  function field(label, input, note) {
    return h("div", { class: "fxp-field" }, [h("label", { text: label }), input, note ? h("small", { text: note }) : null]);
  }
  function input(name, type, attrs) { return h("input", Object.assign({ name: name, type: type || "text" }, attrs || {})); }
  function select(name, options, value) {
    return h("select", { name: name }, options.map(function (o) {
      var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o;
      return h("option", { value: v, text: l, selected: v === value });
    }));
  }
  function fileInput() { return h("input", { type: "file", name: "files[]", multiple: true, accept: "image/jpeg,image/png,image/webp" }); }
  function filesOk(form, box) {
    var f = form.querySelector('input[type=file]');
    if (!f) return true;
    if (f.files.length > 3) { show(box, "Կարելի է կցել մինչև 3 նկար։"); return false; }
    for (var i = 0; i < f.files.length; i++) if (f.files[i].size > 5 * 1024 * 1024) { show(box, "Նկարը պետք է լինի 5 ՄԲ-ից փոքր։"); return false; }
    return true;
  }
  function show(box, text, ok) { box.textContent = text; box.className = "fxp-msg " + (ok ? "ok" : "err"); box.hidden = !text; }
  function busy(btn, on, text) { btn.disabled = on; if (text) btn.textContent = text; }
  function badge(t) { return h("span", { class: "fxp-badge", style: "background:" + (STATUS_COLORS[t.status] || "#6b7280"), text: t.statusLabel }); }
  function files(list) {
    if (!list || !list.length) return null;
    return h("div", { class: "fxp-files" }, ["📎 "].concat(list.map(function (f) { return h("a", { href: f.url, target: "_blank", rel: "noopener", text: f.name }); })));
  }

  function mount(node) { root.innerHTML = ""; root.appendChild(styles()); root.appendChild(node); }

  // ---------- guest views ----------
  function guest(tab) {
    tab = tab || "login";
    // Problems are registered only by signed-in customers.
    var tabs = [["login", "Մուտք"], ["register", "Գրանցում"]];
    var body = tab === "register" ? registerView() : loginView();
    mount(h("div", { class: "fxp" }, [
      h("div", { class: "fxp-tabs" }, tabs.map(function (t) {
        return h("button", { type: "button", class: t[0] === tab ? "on" : "", text: t[1], onclick: function () { guest(t[0]); } });
      })),
      body,
    ]));
  }

  function loginView() {
    var msg = h("div", { class: "fxp-msg", hidden: true });
    var btn = h("button", { type: "submit", class: "fxp-primary", text: "Մուտք" });
    var form = h("form", { class: "fxp-card", onsubmit: function (e) {
      e.preventDefault();
      busy(btn, true, "Մուտք…");
      api("POST", "/portal/login", { email: form.email.value, password: form.password.value })
        .then(signedIn)
        .catch(function (err) { show(msg, errorText(err)); busy(btn, false, "Մուտք"); });
    } }, [
      h("p", { class: "fxp-lead", text: "Մուտք գործեք՝ ձեր հայտերի պատմությունը տեսնելու և նոր հայտ գրանցելու համար։" }),
      field("Email", input("email", "email", { required: true, autocomplete: "email" })),
      field("Գաղտնաբառ", input("password", "password", { required: true, autocomplete: "current-password" })),
      msg, btn,
      h("button", { type: "button", class: "fxp-link", text: "Մոռացե՞լ եք գաղտնաբառը", onclick: forgotView }),
    ]);
    return form;
  }

  function registerView() {
    var msg = h("div", { class: "fxp-msg", hidden: true });
    var btn = h("button", { type: "submit", class: "fxp-primary", text: "Գրանցվել" });
    var form = h("form", { class: "fxp-card", onsubmit: function (e) {
      e.preventDefault();
      busy(btn, true, "Գրանցում…");
      api("POST", "/portal/register", {
        firstName: form.firstName.value, lastName: form.lastName.value, email: form.email.value,
        phone: form.phone.value, company: form.company.value, password: form.password.value,
      }).then(signedIn).catch(function (err) { show(msg, errorText(err)); busy(btn, false, "Գրանցվել"); });
    } }, [
      h("div", { class: "fxp-row" }, [field("Անուն *", input("firstName", "text", { required: true })), field("Ազգանուն", input("lastName"))]),
      h("div", { class: "fxp-row" }, [field("Email *", input("email", "email", { required: true, autocomplete: "email" })), field("Հեռախոս *", input("phone", "tel", { required: true, placeholder: "+374 ..." }))]),
      field("Ընկերություն", input("company")),
      field("Գաղտնաբառ *", input("password", "password", { required: true, minlength: 8, autocomplete: "new-password" }), "Առնվազն 8 նիշ"),
      msg, btn,
    ]);
    return form;
  }

  function forgotView() {
    var msg = h("div", { class: "fxp-msg", hidden: true });
    var btn = h("button", { type: "submit", class: "fxp-primary", text: "Ուղարկել հղումը" });
    var form = h("form", { class: "fxp-card", onsubmit: function (e) {
      e.preventDefault();
      busy(btn, true, "Ուղարկվում է…");
      api("POST", "/portal/password/forgot", { email: form.email.value })
        .then(function () { show(msg, "Եթե այս email-ով հաշիվ կա, նոր գաղտնաբառի հղումը ուղարկված է։ Ստուգեք նաև Spam թղթապանակը։", true); busy(btn, false, "Ուղարկել հղումը"); })
        .catch(function (err) { show(msg, errorText(err)); busy(btn, false, "Ուղարկել հղումը"); });
    } }, [
      h("p", { class: "fxp-lead", text: "Գրեք ձեր email-ը, և կուղարկենք նոր գաղտնաբառ սահմանելու հղում։" }),
      field("Email", input("email", "email", { required: true })),
      msg, btn,
      h("button", { type: "button", class: "fxp-link", text: "← Մուտք", onclick: function () { guest("login"); } }),
    ]);
    mount(h("div", { class: "fxp" }, [form]));
  }

  function resetView(email, token) {
    var msg = h("div", { class: "fxp-msg", hidden: true });
    var btn = h("button", { type: "submit", class: "fxp-primary", text: "Պահպանել" });
    var form = h("form", { class: "fxp-card", onsubmit: function (e) {
      e.preventDefault();
      busy(btn, true, "Պահպանում…");
      api("POST", "/portal/password/reset", { email: email, token: token, password: form.password.value })
        .then(function (res) { history.replaceState(null, "", location.pathname); signedIn(res); })
        .catch(function (err) { show(msg, err.status === 422 && !(err.data && err.data.errors) ? "Հղումը անվավեր է կամ ժամկետանց։ Խնդրեք նորը։" : errorText(err)); busy(btn, false, "Պահպանել"); });
    } }, [
      h("p", { class: "fxp-lead", text: "Նոր գաղտնաբառ՝ " + email }),
      field("Նոր գաղտնաբառ", input("password", "password", { required: true, minlength: 8, autocomplete: "new-password" }), "Առնվազն 8 նիշ"),
      msg, btn,
    ]);
    mount(h("div", { class: "fxp" }, [form]));
  }

  // ---------- signed-in views ----------
  function signedIn(res) {
    state.token = res.token;
    state.customer = res.customer;
    write(TOKEN_KEY, res.token);
    var id = params.get("ticket_id");
    id ? ticketView(id) : listView();
  }

  function signOut(silent) {
    if (state.token && !silent) api("POST", "/portal/logout").catch(function () {});
    state.token = null;
    state.customer = null;
    write(TOKEN_KEY, null);
    guest("login");
  }

  function header() {
    var c = state.customer || {};
    return h("div", { class: "fxp-head" }, [
      h("div", {}, [h("b", { text: "Բարև, " + (c.firstName || "") }), c.contract ? h("span", { class: "fxp-star", text: "⭐ Սպասարկման պայմանագիր" }) : null]),
      h("div", { class: "fxp-actions" }, [
        h("button", { type: "button", class: "fxp-primary", text: "+ Նոր հայտ", onclick: newTicketView }),
        h("button", { type: "button", text: "Իմ հայտերը", onclick: function () { listView(); } }),
        h("button", { type: "button", text: "Իմ տվյալները", onclick: profileView }),
        h("button", { type: "button", text: "Ելք", onclick: function () { signOut(false); } }),
      ]),
    ]);
  }

  function listView(filter) {
    filter = filter || "open";
    mount(h("div", { class: "fxp" }, [header(), h("p", { class: "fxp-lead", text: "Բեռնվում է…" })]));
    api("GET", "/portal/tickets").then(function (res) {
      var all = res.tickets || [];
      var open = all.filter(function (t) { return t.status === "new" || t.status === "in_progress"; });
      var shown = filter === "open" ? open : all;
      var filters = h("div", { class: "fxp-tabs small" }, [["open", "Բաց (" + open.length + ")"], ["all", "Բոլորը (" + all.length + ")"]].map(function (f) {
        return h("button", { type: "button", class: f[0] === filter ? "on" : "", text: f[1], onclick: function () { listView(f[0]); } });
      }));
      var list = shown.length ? h("div", { class: "fxp-list" }, shown.map(function (t) {
        return h("button", { type: "button", class: "fxp-item", onclick: function () { ticketView(t.id); } }, [
          h("div", { class: "fxp-item-top" }, [h("b", { text: "#" + t.id + " · " + t.title }), badge(t)]),
          h("small", { text: "Թարմացվել է " + when(t.updatedAt) + (t.priority === "critical" ? " · Շտապ" : "") }),
        ]);
      })) : h("p", { class: "fxp-lead", text: filter === "open" ? "Բաց հայտեր չկան։" : "Դեռ հայտ չունեք։" });
      mount(h("div", { class: "fxp" }, [header(), filters, list]));
    }).catch(function () { mount(h("div", { class: "fxp" }, [header(), h("div", { class: "fxp-msg err", text: "Չհաջողվեց բեռնել հայտերը։" })])); });
  }

  function newTicketView() {
    var msg = h("div", { class: "fxp-msg", hidden: true });
    var btn = h("button", { type: "submit", class: "fxp-primary", text: "Ուղարկել հայտը" });
    var form = h("form", { class: "fxp-card", onsubmit: function (e) {
      e.preventDefault();
      if (!filesOk(form, msg)) return;
      busy(btn, true, "Ուղարկվում է…");
      api("POST", "/portal/tickets", new FormData(form))
        .then(function (t) { renderTicket(t); })
        .catch(function (err) { show(msg, errorText(err)); busy(btn, false, "Ուղարկել հայտը"); });
    } }, [
      h("h3", { text: "Նոր հայտ" }),
      field("Թեմա *", input("title", "text", { required: true, maxlength: 190 })),
      h("div", { class: "fxp-row" }, [field("1C ծրագիրը *", select("product", PRODUCTS)), field("Կարևորություն", select("priority", PRIORITIES, "normal"))]),
      field("Նկարագրություն *", h("textarea", { name: "description", required: true, minlength: 10, placeholder: "Ինչ եք անում, ինչ է կատարվում, ինչ սխալ է գրում" })),
      field("Էկրանի նկար (մինչև 3)", fileInput()),
      msg, btn,
    ]);
    mount(h("div", { class: "fxp" }, [header(), form]));
  }

  function ticketView(id) {
    mount(h("div", { class: "fxp" }, [header(), h("p", { class: "fxp-lead", text: "Բեռնվում է…" })]));
    api("GET", "/portal/tickets/" + id).then(renderTicket).catch(function () { listView(); });
  }

  function renderTicket(t) {
    if (params.get("ticket_id")) history.replaceState(null, "", location.pathname);
    var thread = h("div", { class: "fxp-thread" }, [
      h("div", { class: "fxp-bubble me" }, [h("div", { class: "fxp-meta", text: (state.customer ? state.customer.firstName : "") + " · " + when(t.createdAt) }), h("div", { class: "fxp-text", text: t.description }), files(t.files)]),
    ].concat((t.responses || []).map(function (r) {
      var staff = r.author === "staff";
      return h("div", { class: "fxp-bubble " + (staff ? "staff" : "me") }, [
        h("div", { class: "fxp-meta", text: (staff ? "🛠 " + (r.authorName || "Flexit") : (r.authorName || "Դուք")) + " · " + when(r.createdAt) }),
        h("div", { class: "fxp-text", text: r.body }), files(r.files),
      ]);
    })));

    var msg = h("div", { class: "fxp-msg", hidden: true });
    var btn = h("button", { type: "submit", class: "fxp-primary", text: "Ուղարկել" });
    var form = h("form", { class: "fxp-card", onsubmit: function (e) {
      e.preventDefault();
      if (!filesOk(form, msg)) return;
      busy(btn, true, "Ուղարկվում է…");
      api("POST", "/portal/tickets/" + t.id + "/responses", new FormData(form)).then(renderTicket)
        .catch(function (err) { show(msg, errorText(err, "Չհաջողվեց ուղարկել։")); busy(btn, false, "Ուղարկել"); });
    } }, [
      field(t.status === "solved" ? "Գրեք, եթե խնդիրը կրկնվում է (հայտը նորից կբացվի)" : "Ձեր պատասխանը", h("textarea", { name: "body", required: true })),
      field("Նկար (մինչև 3)", fileInput()),
      msg,
      h("div", { class: "fxp-actions" }, [btn, (t.status === "new" || t.status === "in_progress") ? h("button", { type: "button", text: "Փակել հայտը", onclick: function () {
        if (!confirm("Փակե՞լ հայտը։")) return;
        api("POST", "/portal/tickets/" + t.id + "/close").then(renderTicket);
      } }) : null]),
    ]);

    mount(h("div", { class: "fxp" }, [
      header(),
      h("div", { class: "fxp-card" }, [
        h("div", { class: "fxp-item-top" }, [h("h3", { text: "#" + t.id + " · " + t.title }), badge(t)]),
        h("small", { text: t.product + (t.priority === "critical" ? " · Շտապ" : "") + " · " + when(t.createdAt) }),
        thread,
      ]),
      form,
    ]));
  }

  function profileView() {
    var c = state.customer || {};
    var msg = h("div", { class: "fxp-msg", hidden: true });
    var btn = h("button", { type: "submit", class: "fxp-primary", text: "Պահպանել" });
    var form = h("form", { class: "fxp-card", onsubmit: function (e) {
      e.preventDefault();
      busy(btn, true, "Պահպանում…");
      api("PUT", "/portal/me", { firstName: form.firstName.value, lastName: form.lastName.value, phone: form.phone.value, company: form.company.value, password: form.password.value || null })
        .then(function (me) { state.customer = me; show(msg, "Պահպանված է։", true); form.password.value = ""; busy(btn, false, "Պահպանել"); })
        .catch(function (err) { show(msg, errorText(err)); busy(btn, false, "Պահպանել"); });
    } }, [
      h("h3", { text: "Իմ տվյալները" }),
      h("p", { class: "fxp-lead", text: c.email || "" }),
      h("div", { class: "fxp-row" }, [field("Անուն", input("firstName", "text", { required: true, value: c.firstName || "" })), field("Ազգանուն", input("lastName", "text", { value: c.lastName || "" }))]),
      h("div", { class: "fxp-row" }, [field("Հեռախոս", input("phone", "tel", { value: c.phone || "" })), field("Ընկերություն", input("company", "text", { value: c.company || "" }))]),
      field("Նոր գաղտնաբառ", input("password", "password", { minlength: 8, autocomplete: "new-password" }), "Դատարկ՝ մնում է նախկինը"),
      msg, btn,
    ]);
    mount(h("div", { class: "fxp" }, [header(), form]));
  }

  // ---------- styles ----------
  function styles() {
    return h("style", { text: [
      ".fxp{max-width:820px;margin:0 auto;font-size:16px;color:#12372a;text-align:left}",
      ".fxp *{box-sizing:border-box}",
      ".fxp-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}",
      ".fxp-tabs button,.fxp-actions button{padding:10px 16px;border:1px solid #cfdcd5;border-radius:10px;background:#fff;color:#12372a;font:inherit;cursor:pointer}",
      ".fxp-tabs button.on{background:#0b6b45;border-color:#0b6b45;color:#fff;font-weight:700}",
      ".fxp-tabs.small button{padding:6px 12px;font-size:14px}",
      ".fxp-card{display:grid;gap:14px;padding:20px;border:1px solid #e3ebe6;border-radius:16px;background:#fff;margin-bottom:14px}",
      ".fxp-card h3{margin:0;font-size:20px}",
      ".fxp-fx-row,.fxp-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}",
      "@media(max-width:640px){.fxp-row{grid-template-columns:1fr}.fxp-head{flex-direction:column;align-items:flex-start}}",
      ".fxp-field label{display:block;font-weight:600;margin-bottom:6px}",
      ".fxp-field small{color:#6b7c74;font-size:13px}",
      ".fxp input[type=text],.fxp input[type=email],.fxp input[type=tel],.fxp input[type=password],.fxp select,.fxp textarea{width:100%;padding:12px 14px;border:1px solid #cfdcd5;border-radius:10px;font:inherit;background:#fff;color:#12372a}",
      ".fxp textarea{min-height:120px;resize:vertical}",
      ".fxp input:focus,.fxp select:focus,.fxp textarea:focus{outline:2px solid #9be15d;border-color:#0b6b45}",
      ".fxp-primary{padding:13px 22px!important;border:0!important;border-radius:12px!important;background:#0b6b45!important;color:#fff!important;font:inherit;font-weight:700!important;cursor:pointer}",
      ".fxp button:disabled{opacity:.6;cursor:wait}",
      ".fxp-link{background:none;border:0;color:#0b6b45;text-decoration:underline;cursor:pointer;font:inherit;justify-self:start;padding:0}",
      ".fxp-lead{margin:0;color:#4b5f56}",
      ".fxp-msg{padding:12px 14px;border-radius:10px}.fxp-msg.err{background:#fdecec;color:#8a1c1c}.fxp-msg.ok{background:#e8f8ee;color:#0b4f33}.fxp-msg.big{font-size:18px;line-height:1.6}",
      ".fxp-urgent{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:10px;background:#fff4f2;cursor:pointer}",
      ".fxp-hp{position:absolute;left:-9999px}",
      ".fxp-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap}",
      ".fxp-actions{display:flex;gap:8px;flex-wrap:wrap}",
      ".fxp-star{margin-left:10px;font-size:13px;background:#fef3c7;color:#92400e;padding:3px 10px;border-radius:999px}",
      ".fxp-list{display:grid;gap:8px}",
      ".fxp-item{display:grid;gap:4px;text-align:left;padding:14px 16px;border:1px solid #e3ebe6;border-radius:12px;background:#fff;cursor:pointer;font:inherit;color:inherit}",
      ".fxp-item:hover{border-color:#0b6b45}",
      ".fxp-item small{color:#6b7c74}",
      ".fxp-item-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}",
      ".fxp-badge{color:#fff;font-size:13px;padding:3px 10px;border-radius:999px;white-space:nowrap}",
      ".fxp-thread{display:grid;gap:10px;margin-top:6px}",
      ".fxp-bubble{padding:12px 14px;border-radius:12px;background:#f3f4f6;max-width:92%}",
      ".fxp-bubble.staff{background:#e8f8ee;justify-self:end}",
      ".fxp-meta{font-size:13px;color:#6b7c74;margin-bottom:4px}",
      ".fxp-text{white-space:pre-wrap;word-break:break-word}",
      ".fxp-files{margin-top:6px;font-size:14px}.fxp-files a{margin-right:10px}",
    ].join("") });
  }

  // ---------- start ----------
  if (params.get("reset") && params.get("email")) {
    resetView(params.get("email"), params.get("reset"));
  } else if (params.get("ticket")) {
    // The status link from the open form.
    fetch(API + "/tickets/" + encodeURIComponent(params.get("ticket"))).then(function (r) { return r.ok ? r.json() : null; }).then(function (t) {
      if (!t) return guest("login");
      mount(h("div", { class: "fxp" }, [h("div", { class: "fxp-card" }, [h("div", { class: "fxp-item-top" }, [h("b", { text: "Հայտ №" + t.id }), badge(t)]), h("small", { text: "Գրանցված է " + when(t.createdAt) })])]));
    });
  } else if (state.token) {
    api("GET", "/portal/me").then(function (me) { state.customer = me; params.get("ticket_id") ? ticketView(params.get("ticket_id")) : listView(); })
      .catch(function () { guest("login"); });
  } else {
    guest("login");
  }
})();
