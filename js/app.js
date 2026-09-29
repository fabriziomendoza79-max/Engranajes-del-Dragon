/* =========================================
   STREAMVERSE — LÓGICA (juegos de llaves SV)
========================================= */
const SV = (function () {
  const K = {
    users: "sv_users",
    codes: "sv_codes",
    products: "sv_products",
    providers: "sv_providers",
    orders: "sv_orders",
    session: "sv_session",
    balance: "sv_balance",
  };

  const CODE_TYPES = ["cliente", "proveedor", "dueno"];

  function createCodes(qty, type) {
    let cd = codes();
    const codeType = CODE_TYPES.indexOf(type) > -1 ? type : "cliente";
    for (let i = 0; i < qty; i++) {
      cd.push({ code: newCode(), type: codeType, used: false, createdAt: new Date().toISOString() });
    }
    saveCodes(cd);
  }

  function clearCodes(type, qty) {
    const codeType = CODE_TYPES.indexOf(type) > -1 ? type : "cliente";
    const rest = codes().filter(c => (c.type || "cliente") !== codeType);
    saveCodes(rest);
    const def = codeType === "cliente" ? 10 : 3;
    const n = Math.max(1, Math.min(500, Number(qty) || def));
    createCodes(n, codeType);
    return n;
  }

  // ---------- utilidades ----------
  function get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      if (window.SVSYNC) SVSYNC.push(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }

  function ready() {
    return window.SVSYNC ? SVSYNC.ready() : Promise.resolve(true);
  }

  function isReady() {
    return !window.SVSYNC || SVSYNC.isReady();
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    }
    return String(h);
  }

  function newCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 10; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(n) {
    return Number(n || 0).toFixed(2) + " créditos";
  }

  // ---------- monedas ----------
  const RATES = { PEN: 1, USD: 3.36, MXN: 4.2 }; // 1 USD = 3.36 créditos (soles)

  function symbolOf(cur) {
    return cur === "USD" ? "US$" : cur === "MXN" ? "MX$" : "S/";
  }

  function moneyIn(n, cur) {
    return symbolOf(cur) + " " + Number(n || 0).toFixed(2);
  }

  // convierte una cantidad de cualquier moneda a créditos (1 crédito = 1 sol)
  function creditosDe(cur, val) {
    return Number(val || 0) * (RATES[cur] || 1);
  }

  // saldo total convertido a soles
  function saldoPEN(u) {
    const b = getBalance(u);
    return (Number(b.PEN) || 0) +
      (Number(b.USD) || 0) * RATES.USD +
      (Number(b.MXN) || 0) * RATES.MXN;
  }

  // descuenta en soles usando PEN primero y luego USD/MXN. Devuelve true si pudo
  function gastarPEN(u, penAmount) {
    let resto = Number(penAmount || 0);
    if (resto <= 0) return true;
    const bal = getBalance(u);
    ["PEN", "USD", "MXN"].forEach(cur => {
      if (resto <= 0) return;
      const disp = Number(bal[cur]) || 0;
      if (disp <= 0) return;
      const enMoneda = cur === "PEN" ? resto : resto / RATES[cur];
      const usar = Math.min(disp, enMoneda);
      bal[cur] = disp - usar;
      resto -= usar * RATES[cur];
    });
    if (resto > 0.00001) return false;
    setBalance(u, bal);
    return true;
  }

  function cleanPhone(phone) {
    return String(phone || "").replace(/[^0-9]/g, "");
  }

  // ---------- acceso a datos ----------
  function users() { return get(K.users, {}); }
  function saveUsers(u) { return set(K.users, u); }
  function codes() { return get(K.codes, []); }
  function saveCodes(c) { return set(K.codes, c); }
  function products() { return get(K.products, []); }
  function saveProducts(p) { return set(K.products, p); }
  function providers() { return get(K.providers, []); }
  function saveProviders(p) { return set(K.providers, p); }
  function orders() { return get(K.orders, []); }
  function saveOrders(o) { return set(K.orders, o); }
  function session() {
    // Primero la sesión de ESTA pestaña (así al actualizar no cambia de usuario)
    try {
      const tab = sessionStorage.getItem(K.session);
      if (tab) return tab;
    } catch (e) {}
    return localStorage.getItem(K.session) || "";
  }
  function setSession(u) {
    try { sessionStorage.setItem(K.session, u); } catch (e) {}
    localStorage.setItem(K.session, u);
  }
  function logout() {
    try { sessionStorage.removeItem(K.session); } catch (e) {}
    localStorage.removeItem(K.session);
  }

  // Página de inicio según el rol del usuario
  function homeFor(u) {
    const name = u || session();
    if (!name) return "index.html";
    const row = users()[name];
    if (!row) return "index.html";
    return (row.role === "admin" || row.role === "dueno" || row.role === "proveedor")
      ? "admin.html"
      : "tienda.html";
  }
  function requireRole(roles) {
    const u = currentUser();
    if (!u || !session()) { location.href = "index.html"; return false; }
    if (u.suspended) { logout(); location.href = "index.html"; return false; }
    if (roles.indexOf(u.role) === -1) { location.replace(homeFor()); return false; }
    return true;
  }
  function getBalance(u) {
    const raw = get(K.balance + "_" + u, 0);
    if (typeof raw === "object" && raw !== null) return raw;
    return { PEN: Number(raw || 0), MXN: 0, USD: 0 };
  }
  function setBalance(u, b) { return set(K.balance + "_" + u, b); }
  function addCredits(u, amount, currency) {
    const bal = getBalance(u);
    const cur = currency || "PEN";
    bal[cur] = (Number(bal[cur]) || 0) + Number(amount || 0);
    setBalance(u, bal);
  }

  function currentUser() {
    return users()[session()] || null;
  }

  function providerName(id) {
    const p = providers().find(x => x.id === id);
    return p ? p.name : "Sin proveedor";
  }

  function providerWhatsApp(id) {
    const p = providers().find(x => x.id === id);
    return p ? (p.contact || "") : "";
  }

  // ---------- recargas ----------
  function recharges() {
    return get("sv_recharges", []);
  }

  function saveRecharges(r) {
    return set("sv_recharges", r);
  }

  // recarga mínima en USD: por debajo de esto la solicitud queda "en revisión"
  const MIN_USD_RECHARGE = 3;

  function createRecharge(username, amount, method, orderId, phone, currency) {
    const list = recharges();
    const cur = currency || (method === "Binance" ? "USD" : "PEN");
    const usdEq = cur === "USD" ? Number(amount || 0) : Number(amount || 0) / RATES.USD;
    const recharge = {
      id: uid(),
      username: username,
      amount: Number(amount || 0),
      currency: cur,
      needsReview: usdEq < MIN_USD_RECHARGE,
      method: method || "",
      orderId: orderId || "",
      phone: phone || "",
      status: "Pendiente",
      createdAt: new Date().toISOString(),
    };
    list.unshift(recharge);
    saveRecharges(list);
    return recharge;
  }

  function getCredits(u) {
    return getBalance(u);
  }

  function approveRecharge(id) {
    const list = recharges();
    const r = list.find(x => x.id === id);
    if (!r || r.status !== "Pendiente") return;
    addCredits(r.username, r.amount, r.currency || "PEN");
    r.status = "Aprobado";
    r.approvedAt = new Date().toISOString();
    saveRecharges(list);

    const cur = r.currency || "PEN";
    const cred = creditosDe(cur, r.amount).toFixed(2);
    const msg = "✅ Recarga aprobada\n\n👤 " + r.username + "\n💵 Monto: " + cred + " créditos" + (cur === "USD" ? " (US$ " + Number(r.amount).toFixed(2) + ")" : "") + "\n📱 Método: " + r.method + (r.orderId ? "\n🔑 ID orden: " + r.orderId : "") + "\n📅 Aprobada: " + new Date().toLocaleString() + "\n\nTus créditos fueron agregados correctamente.\n\nEngranajes del Dragón";
    const phone = cleanPhone(r.phone);
    if (phone) {
      window.open("https://wa.me/" + phone + "?text=" + encodeURIComponent(msg), "_blank");
    } else {
      window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank");
    }
  }

  function rejectRecharge(id) {
    const list = recharges();
    const r = list.find(x => x.id === id);
    if (!r || r.status !== "Pendiente") return;
    r.status = "Rechazado";
    r.rejectedAt = new Date().toISOString();
    saveRecharges(list);

    const msg = "❌ Recarga rechazada\n\n👤 Usuario: " + r.username + "\n💵 Monto: " + creditosDe(r.currency || "PEN", r.amount).toFixed(2) + " créditos" + "\n📱 Método: " + r.method + "\n📅 Fecha: " + new Date().toLocaleString() + "\n\nSi crees que es un error, contáctanos.\n\nEngranajes del Dragón";
    const phone = cleanPhone(r.phone);
    if (phone) {
      window.open("https://wa.me/" + phone + "?text=" + encodeURIComponent(msg), "_blank");
    } else {
      window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank");
    }
  }

  // ---------- datos de ejemplo (solo en el PRIMER arranque de un navegador nuevo) ----------
  function seed() {
    /* no sembrar nada local hasta tener los datos de la nube */
    if (window.SVSYNC && !SVSYNC.isReady()) {
      SVSYNC.ready().then(function () {
        try { seed(); } catch (e) {}
      });
      return;
    }
    const u = users();
    // Instalación nueva = sin usuarios y sin productos. Si ya existen datos,
    // NUNCA se vuelven a crear los productos/proveedores de ejemplo
    // (así lo que el dueño elimina no reaparece al recargar).
    const freshInstall = Object.keys(u).length === 0 && products().length === 0;
    if (Object.keys(u).length === 0) {
      u["admin"] = {
        pass: hash("admin123"),
        email: "admin@streamverse.com",
        role: "admin",
        createdAt: new Date().toISOString(),
      };
      u["cliente"] = {
        pass: hash("cliente123"),
        email: "cliente@streamverse.com",
        role: "cliente",
        createdAt: new Date().toISOString(),
      };
      u["proveedor"] = {
        pass: hash("proveedor123"),
        email: "proveedor@streamverse.com",
        role: "proveedor",
        createdAt: new Date().toISOString(),
      };
      saveUsers(u);
    }

    let prov = providers();
    if (freshInstall && prov.length === 0) {
      prov = [
        { id: uid(), name: "Proveedor Demo", contact: "51999888777" },
        { id: uid(), name: "NetflixMax", contact: "525551234567" },
      ];
      saveProviders(prov);
    }

    let prod = products();
    if (freshInstall && prod.length === 0) {
      prod = prov.slice(0, 2).map((p, i) => ({
        id: uid(),
        name: i === 0 ? "Acceso Netflix Premium" : "Acceso Disney+ 4K",
        price: i === 0 ? 25 : 20,
        stock: i === 0 ? 10 : 5,
        image: "",
        description: i === 0
          ? "Cuenta Premium compartida, 4 perfiles."
          : "Cuenta 4K UHD con subtítulos en español.",
        providerId: p.id,
        createdAt: new Date().toISOString(),
      }));
      saveProducts(prod);
    }

    let cd = codes();
    let cdChanged = false;
    cd.forEach(c => { if (!c.type) { c.type = "cliente"; cdChanged = true; } });
    const freeClientes = cd.filter(c => c.type === "cliente" && !c.used).length;
    const freeProveedores = cd.filter(c => c.type === "proveedor" && !c.used).length;
    if (freeClientes < 8) {
      for (let i = freeClientes; i < 8; i++) {
        cd.push({ code: newCode(), type: "cliente", used: false, createdAt: new Date().toISOString() });
        cdChanged = true;
      }
    }
    if (freeProveedores < 3) {
      for (let i = freeProveedores; i < 3; i++) {
        cd.push({ code: newCode(), type: "proveedor", used: false, createdAt: new Date().toISOString() });
        cdChanged = true;
      }
    }
    if (cdChanged) saveCodes(cd);
  }

  // ---------- seguridad de rutas ----------
  function requireClient() {
    if (!session()) { location.href = "index.html"; return; }
    if (isSuspended(session())) { logout(); location.href = "index.html"; }
  }

  function requireAdmin() {
    const u = currentUser();
    if (!u || (u.role !== "admin" && u.role !== "proveedor" && u.role !== "dueno")) { location.href = "index.html"; return; }
    if (u.suspended) { logout(); location.href = "index.html"; }
  }

  // ---------- suspensión / baja de usuarios ----------
  function isSuspended(username) {
    if (!username) return false;
    const u = users();
    return !!(u[username] && u[username].suspended);
  }

  function setUserSuspended(username, state) {
    const u = users();
    if (!u[username]) return false;
    u[username].suspended = !!state;
    saveUsers(u);
    return true;
  }

  function providerOfUser(username) {
    return providers().find(p => p.userId === username) || null;
  }

  function deleteUser(username) {
    const u = users();
    if (!u[username]) return false;
    if (u[username].role === "admin") return false;
    const prov = providerOfUser(username);
    if (prov) {
      saveProducts(products().filter(p => p.providerId !== prov.id));
      saveProviders(providers().filter(p => p.id !== prov.id));
    }
    delete u[username];
    saveUsers(u);
    if (session() === username) logout();
    return true;
  }

  function providerIsActive(providerId) {
    const prov = providers().find(p => p.id === providerId);
    if (!prov || !prov.userId) return true;
    return !isSuspended(prov.userId);
  }

  // ---------- render público (index) ----------
  function renderPublicProducts(el) {
    if (!el) return;
    el.innerHTML = "";
    const list = products().filter(p => providerIsActive(p.providerId));
    if (list.length === 0) {
      el.innerHTML = '<p class="muted">Pronto habrá productos disponibles.</p>';
      return;
    }
    list.forEach(p => {
      const card = document.createElement("div");
      card.className = "product-card";
      const stock = Number(p.stock || 0);
      const prov = providerName(p.providerId);
      let badgeClass = "agotado";
      let badgeText = "AGOTADO";
      if (stock > 5) { badgeClass = "disponible"; badgeText = "DISPONIBLE"; }
      else if (stock > 0) { badgeClass = "bajo"; badgeText = "ÚLTIMAS " + stock; }

      let stockCircleClass = "empty";
      if (stock > 5) stockCircleClass = "ok";
      else if (stock > 0) stockCircleClass = "low";

      const hasImage = p.image && p.image.trim() !== "";
      const thumbContent = hasImage
        ? '<img src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.name) + '">'
        : '<i class="fa-solid fa-tv" style="font-size:40px;color:#1a3a4a;"></i>';

      card.innerHTML =
        '<div class="thumb">' +
          thumbContent +
          '<span class="thumb-badge ' + badgeClass + '">' + badgeText + '</span>' +
          '<span class="thumb-price">' + money(p.price) + '</span>' +
          (stock > 0 ? '<span class="thumb-oferta">OFERTA</span>' : '') +
        '</div>' +
        '<div class="p-info">' +
          '<div class="p-name">' + escapeHtml(p.name) + '</div>' +
          '<div class="p-online">ONLINE</div>' +
           '<div class="p-provider" data-provwa="' + escapeHtml(p.providerId) + '" data-prod="' + escapeHtml(p.name) + '" data-provname="' + escapeHtml(prov) + '" title="Escríbele a la tienda por WhatsApp" style="cursor:pointer;"><i class="fa-solid fa-store"></i> ' + escapeHtml(prov) + ' <i class="fa-brands fa-whatsapp" style="color:#25d366;margin-left:2px;"></i></div>' +
        '</div>' +
        (p.description ? '<div class="p-desc">' + escapeHtml(p.description) + '</div>' : '') +
        '<div class="p-price-section">' +
          '<div class="p-price-box">' +
            '<span class="p-price-label">PRECIO</span>' +
            '<span class="p-price">' + money(p.price) + '</span>' +
          '</div>' +
          '<div class="p-stock-box">' +
            '<span class="p-stock-label">STOCK</span>' +
            '<div class="p-stock-circle ' + stockCircleClass + '">' + stock + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="p-actions">' +
          (stock > 0
            ? '<button class="btn-comprar active" data-buy="' + escapeHtml(p.id) + '"><i class="fa-solid fa-cart-shopping"></i> Comprar ahora</button>'
            : '<button class="btn-comprar disabled" disabled><i class="fa-solid fa-ban"></i> Agotado</button>') +
          '<button class="btn-detalles" data-details="' + escapeHtml(p.details || p.description || "") + '" data-name="' + escapeHtml(p.name) + '" data-image="' + escapeHtml(p.image || "") + '"><i class="fa-solid fa-file-lines"></i> Detalles</button>' +
        '</div>';
      el.appendChild(card);
    });

    el.querySelectorAll("[data-provwa]").forEach(box => {
      box.onclick = function() {
        const wa = providerWhatsApp(box.dataset.provwa);
        if (!wa || !cleanPhone(wa)) {
          alert("Esta tienda no tiene WhatsApp registrado.");
          return;
        }
        const msg = "🏪 *Consulta de producto*\n\n" +
          "Hola " + box.dataset.provname + ",\n" +
          "Me interesa: " + box.dataset.prod + "\n" +
          "¿Está disponible?\n\n" +
          "Engranajes del Dragón";
        window.open("https://wa.me/" + cleanPhone(wa) + "?text=" + encodeURIComponent(msg), "_blank");
      };
    });

    el.querySelectorAll("[data-buy]").forEach(btn => {
      btn.onclick = function() {
        const user = session();
        if (!user || user.trim() === "") {
          location.href = "index.html";
          return;
        }
        if (isSuspended(user)) {
          alert("Tu cuenta está suspendida. Contacta al administrador.");
          logout();
          location.href = "index.html";
          return;
        }
        const pid = btn.dataset.buy;
        const list = products();
        const p = list.find(x => x.id === pid);
        if (!p) return;
        const stock = Number(p.stock || 0);
        if (stock <= 0) return;

        const bal = getBalance(user);
        const price = Number(p.price || 0);

        let modal = document.getElementById("svBuyModal");
        if (!modal) {
          modal = document.createElement("div");
          modal.id = "svBuyModal";
          modal.className = "sv-modal-overlay";
          document.body.appendChild(modal);
        }

        modal.innerHTML =
          '<div class="sv-modal-box" style="max-width:420px;">' +
            '<div class="sv-modal-header">' +
              '<h3><i class="fa-solid fa-cart-shopping"></i> Comprar producto</h3>' +
              '<button class="sv-modal-close" id="svBuyClose">&times;</button>' +
            '</div>' +
            '<div class="sv-modal-body">' +
              '<div style="margin-bottom:16px;padding:14px;border-radius:12px;background:rgba(0,217,255,0.06);border:1px solid rgba(0,217,255,0.12);">' +
                '<div style="font-size:14px;font-weight:800;color:#fff;margin-bottom:4px;">' + escapeHtml(p.name) + '</div>' +
                '<div style="font-size:20px;font-weight:900;color:#4ade80;">' + money(price) + '</div>' +
              '</div>' +
              '<div style="margin-bottom:16px;">' +
                '<label style="display:block;font-size:12px;font-weight:700;color:#7d8b96;margin-bottom:6px;text-transform:uppercase;letter-spacing:1px;">Nombre del cliente</label>' +
                '<input type="text" id="svBuyClient" value="" ' +
                  'style="width:100%;padding:12px 14px;border-radius:10px;border:1px solid #0a2a3a;background:#020a10;color:#ffffff;font-size:14px;outline:none;box-sizing:border-box;" ' +
                  'placeholder="Nombre del cliente">' +
              '</div>' +
              '<div style="margin-bottom:16px;">' +
                '<label style="display:block;font-size:12px;font-weight:700;color:#7d8b96;margin-bottom:6px;text-transform:uppercase;letter-spacing:1px;">Créditos disponibles</label>' +
                '<div style="padding:12px 14px;border-radius:10px;border:1px solid rgba(16,185,129,0.2);background:rgba(16,185,129,0.06);font-size:16px;font-weight:800;color:#4ade80;">' + saldoPEN(user).toFixed(2) + ' créditos</div>' +
                '<div style="font-size:11.5px;color:#7d8b96;margin-top:4px;">Carteras: PEN ' + (bal.PEN || 0).toFixed(2) + ' · USD ' + (bal.USD || 0).toFixed(2) + ' (=' + ((bal.USD || 0) * RATES.USD).toFixed(2) + ') · MXN ' + (bal.MXN || 0).toFixed(2) + '</div>' +
              '</div>' +
              '<button id="svBuyConfirm" style="width:100%;padding:14px;border:none;border-radius:12px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-size:15px;font-weight:800;cursor:pointer;text-transform:uppercase;letter-spacing:0.5px;box-shadow:0 6px 20px rgba(16,185,129,0.3);">' +
                '<i class="fa-solid fa-check"></i> Confirmar compra' +
              '</button>' +
               '<div style="margin-top:10px;font-size:11.5px;color:#7d8b96;text-align:center;line-height:1.5;">Al confirmar se abrirá WhatsApp con tu solicitud a la tienda</div>' +
            '</div>' +
          '</div>';

        modal.classList.add("sv-modal-open");

        document.getElementById("svBuyClose").onclick = function() {
          modal.classList.remove("sv-modal-open");
        };
        modal.onclick = function(e) {
          if (e.target === modal) modal.classList.remove("sv-modal-open");
        };

        document.getElementById("svBuyConfirm").onclick = function() {
          const clientName = document.getElementById("svBuyClient").value.trim();
          if (!clientName) {
            alert("Ingresa el nombre del cliente");
            return;
          }

          const totalPEN = saldoPEN(user);
          const enough = totalPEN >= price;
          const provWa = providerWhatsApp(p.providerId);
          const clean = provWa ? cleanPhone(provWa) : "";

          if (!enough) {
            modal.classList.remove("sv-modal-open");
            alert("No puedes comprar todavía.\n\nCréditos: " + totalPEN.toFixed(2) + " · Precio: " + price.toFixed(2) + " créditos\n\nRecarga tus créditos para poder comprar.");
            return;
          }

          if (!gastarPEN(user, price)) {
            modal.classList.remove("sv-modal-open");
            alert("No se pudo descontar el saldo. Recarga tus créditos para poder comprar.");
            return;
          }
          p.stock = stock - 1;
          saveProducts(list);
          const order = {
            id: uid(),
            client: clientName,
            buyer: user,
            productId: p.id,
            providerId: p.providerId,
            product: p.name,
            total: price,
            status: "completado",
            createdAt: new Date().toISOString()
          };
          const orderList = orders();
          orderList.unshift(order);
          saveOrders(orderList);
          modal.classList.remove("sv-modal-open");
          const msg = "✅ Compra realizada\n\n🛒 Producto: " + p.name + "\n👤 Cliente: " + clientName + "\n👤 Usuario: " + user + "\n💰 Total: " + money(price) + "\n📅 Fecha: " + new Date().toLocaleString() + "\n\nGracias por su compra - Engranajes del Dragón";
          if (clean) {
            window.open("https://wa.me/" + clean + "?text=" + encodeURIComponent(msg), "_blank");
          }
          alert("Compra realizada para " + clientName + ". Se descontaron " + price.toFixed(2) + " créditos de tu cuenta." +
            (clean ? "" : "\n\nAviso: la tienda no tiene WhatsApp configurado, no se pudo enviar la confirmación."));
          renderPublicProducts(el);
          const summaryEl = document.getElementById("summary");
          if (summaryEl) {
            summaryEl.textContent = products().filter(x => Number(x.stock || 0) > 0).length + " productos con stock";
          }
          const balEl = document.getElementById("ubBalAmount");
          if (balEl) {
            const curSel = document.getElementById("ubCurrency");
            const cur = curSel ? curSel.value : "PEN";
            balEl.textContent = creditosDe(cur, getBalance(user)[cur] || 0).toFixed(2) + " créditos";
          }
        };
      };
    });

    el.querySelectorAll("[data-details]").forEach(btn => {
      btn.onclick = function() {
        openDetailsModal(
          btn.dataset.name,
          btn.dataset.image,
          btn.dataset.details
        );
      };
    });
  }

  // ---------- modal de detalles ----------
  function openDetailsModal(name, image, details) {
    let modal = document.getElementById("svDetailsModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "svDetailsModal";
      modal.className = "sv-modal-overlay";
      modal.innerHTML =
        '<div class="sv-modal-box">' +
          '<div class="sv-modal-header">' +
            '<h3 id="svModalTitle"></h3>' +
            '<button class="sv-modal-close" id="svModalClose"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +
          '<div class="sv-modal-body" id="svModalBody"></div>' +
        '</div>';
      document.body.appendChild(modal);
      document.getElementById("svModalClose").onclick = closeDetailsModal;
      modal.onclick = function(e) {
        if (e.target === modal) closeDetailsModal();
      };
    }
    document.getElementById("svModalTitle").textContent = name || "Detalles del producto";
    const body = document.getElementById("svModalBody");
    let html = "";
    if (image && image.trim()) {
      html += '<img src="' + escapeHtml(image) + '" alt="" style="width:100%;max-height:250px;object-fit:cover;border-radius:12px;margin-bottom:16px;">';
    }
    if (details && details.trim()) {
      html += '<p style="color:#b0c0c8;font-size:14px;line-height:1.7;white-space:pre-line;">' + escapeHtml(details) + '</p>';
    } else {
      html += '<p style="color:#4a6070;font-size:14px;text-align:center;padding:20px 0;">No hay detalles disponibles para este producto.</p>';
    }
    body.innerHTML = html;
    modal.classList.add("sv-modal-open");
  }

  function closeDetailsModal() {
    const modal = document.getElementById("svDetailsModal");
    if (modal) modal.classList.remove("sv-modal-open");
  }

  // ---------- render catálogo cliente (home) ----------
  let currentOrderId = null;

  function renderClientProducts(el) {
    if (!el) return;
    el.innerHTML = "";
    const list = products().filter(p => providerIsActive(p.providerId));
    if (list.length === 0) {
      el.innerHTML = '<p class="muted">Todavía no hay productos disponibles.</p>';
      return;
    }
    list.forEach(p => {
      const prov = providers().find(x => x.id === p.providerId);
      const card = document.createElement("div");
      card.className = "product-card";
      const stockChip = p.stock > 0
        ? '<span class="stock-chip ok">' + p.stock + " en stock</span>"
        : '<span class="stock-chip no">Sin stock</span>';
      const buy = p.stock > 0
        ? '<button class="btn btn-primary full" data-buy="' + p.id + '">Comprar</button>'
        : '<button class="btn btn-ghost full" disabled>Agotado</button>';
      card.innerHTML = `
        <div class="thumb">${p.image ? '<img src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.name) + '">' : "🖼️"}</div>
        <div class="p-name">${escapeHtml(p.name)}</div>
        <div class="p-price">${money(p.price)}</div>
        ${p.description ? `<div class="p-desc">${escapeHtml(p.description)}</div>` : ""}
        <div class="p-meta">
          <span class="provider-chip">${escapeHtml(prov ? prov.name : "Sin proveedor")}</span>
          ${stockChip}
        </div>
        ${buy}`;
      el.appendChild(card);
    });

    el.querySelectorAll("[data-buy]").forEach(btn => {
      btn.onclick = () => openOrder(btn.dataset.buy);
    });
  }

  function openOrder(productId) {
    const p = products().find(x => x.id === productId);
    if (!p) return;
    currentOrderId = productId;
    const prov = providers().find(x => x.id === p.providerId);
    const body = document.getElementById("modalBody");
    let wa = "";
    if (prov && cleanPhone(prov.contact)) {
      const text = encodeURIComponent(
        "🛒 *Solicitud de compra*\n\n" +
        "Hola " + prov.name + ", soy " + session() + " y quiero comprar:\n" +
        "Producto: *" + p.name + "*\n" +
        "Precio: *" + money(p.price) + "*\n" +
        "Fecha: " + new Date().toLocaleString() + "\n\n" +
        "Engranajes del Dragón"
      );
      wa = '<a class="btn btn-primary full" target="_blank" rel="noopener" href="https://wa.me/' + cleanPhone(prov.contact) + "?text=" + text + '" style="margin-top:8px;">📲 Enviar solicitud a la tienda</a>';
    } else {
      wa = '<p class="muted">Este producto no tiene contacto de WhatsApp.</p>';
    }
    body.innerHTML = `
      ${p.image ? '<div class="thumb" style="height:130px;border-radius:10px;overflow:hidden;margin-bottom:12px;"><img src="' + escapeHtml(p.image) + '" style="width:100%;height:100%;object-fit:cover;"></div>' : ""}
      <div class="p-name">${escapeHtml(p.name)}</div>
      <div class="p-price" style="color:#4ade80;font-size:20px;font-weight:800;margin:6px 0;">${money(p.price)}</div>
      ${p.description ? `<div class="p-desc" style="color:#8b7fa8;font-size:13px;margin-bottom:10px;">${escapeHtml(p.description)}</div>` : ""}
      <div class="p-meta" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
        <span class="provider-chip">${escapeHtml(prov ? prov.name : "Sin proveedor")}</span>
        <span class="stock-chip ${p.stock > 0 ? "ok" : "no"}">${p.stock} en stock</span>
      </div>
      <button class="btn btn-ghost full" id="confirmOrder" style="margin-bottom:8px;">Registrar pedido</button>
      ${wa}`;
    document.getElementById("modal").classList.remove("hidden");

    const confirm = document.getElementById("confirmOrder");
    confirm.onclick = () => {
      const list = products();
      const idx = list.findIndex(x => x.id === productId);
      if (idx === -1) return;
      if (list[idx].stock <= 0) {
        alert("No hay stock.");
        return;
      }
      list[idx].stock -= 1;
      saveProducts(list);

      const o = orders();
      o.push({
        id: uid(),
        client: session(),
        product: list[idx].name,
        total: list[idx].price,
        status: "pendiente",
        createdAt: new Date().toISOString(),
      });
      saveOrders(o);

      confirm.textContent = "✓ Pedido registrado";
      confirm.disabled = true;
      renderClientProducts(document.getElementById("products"));
    };
  }

  function closeModal() {
    document.getElementById("modal").classList.add("hidden");
    currentOrderId = null;
  }

  // ---------- render admin ----------
  function adminRender() {
    renderAdminStats();
    renderAdminCodes();
    renderAdminProductForm();
    renderAdminProducts();
    renderAdminProviders();
    renderAdminOrders();
    renderAdminClients();
  }

  function renderAdminStats() {
    const el = (id) => document.getElementById(id);
    if (!el("sProducts")) return;
    el("sProducts").textContent = products().length;
    el("sStock").textContent = products().reduce((s, p) => s + (Number(p.stock) || 0), 0);
    el("sCodes").textContent = codes().filter(c => !c.used).length;
    el("sOrders").textContent = orders().length;
  }

  function renderCodeRows(tbody, type) {
    if (!tbody) return;
    tbody.innerHTML = "";
    const all = codes();
    const list = all.map((c, i) => ({ c, i })).filter(x => (x.c.type || "cliente") === type);
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#4a6070;">No hay códigos de este tipo.</td></tr>';
      return;
    }
    list.forEach(({ c, i }) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><b>${escapeHtml(c.code)}</b></td>
        <td class="${c.used ? "estado-completado" : "estado-pendiente"}">${c.used ? "Usado" : "Libre"}</td>
        <td>${escapeHtml(c.usedBy || "—")}</td>
        <td>${escapeHtml(c.usedAt ? new Date(c.usedAt).toLocaleString() : (c.createdAt ? new Date(c.createdAt).toLocaleString() : "—"))}</td>
        <td style="white-space:nowrap;">
          <button class="btn-link" data-copy="${escapeHtml(c.code)}">Copiar</button>
          <button class="btn-link" data-del-code="${i}" style="color:#f87171;margin-left:6px;">Eliminar</button>
        </td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll("[data-copy]").forEach(btn => {
      btn.onclick = () => copyText(btn.dataset.copy);
    });
    tbody.querySelectorAll("[data-del-code]").forEach(btn => {
      btn.onclick = () => deleteCodeByIndex(Number(btn.dataset.delCode));
    });
  }

  function deleteCodeByIndex(idx) {
    const cd = codes();
    if (!cd[idx]) return;
    if (!confirm("¿Eliminar el código " + cd[idx].code + "?")) return;
    cd.splice(idx, 1);
    saveCodes(cd);
    renderAdminCodes();
  }

  function renderAdminCodes() {
    renderCodeRows(document.getElementById("codesTableClients"), "cliente");
    renderCodeRows(document.getElementById("codesTableProviders"), "proveedor");
    renderCodeRows(document.getElementById("codesTableOwners"), "dueno");
  }

  function renderAdminProductForm() {
    const select = document.getElementById("pProvider");
    if (!select) return;
    select.innerHTML = "";
    const list = providers();
    if (list.length === 0) {
      select.innerHTML = '<option value="">Primero crea un proveedor</option>';
      select.disabled = true;
    } else {
      select.disabled = false;
      list.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        select.appendChild(opt);
      });
    }
  }

  function renderAdminProducts() {
    const box = document.getElementById("adminProducts");
    if (!box) return;
    if (typeof window !== "undefined" && typeof window.renderAdminProducts === "function") {
      window.renderAdminProducts();
      return;
    }
    box.innerHTML = "";
    let list = products();
    const me = currentUser();
    if (me && me.role === "proveedor" && me.providerId) {
      list = list.filter(p => p.providerId === me.providerId);
    }
    if (list.length === 0) {
      box.innerHTML = '<p class="muted">Aún no hay productos.</p>';
      return;
    }
    list.forEach(p => {
      const card = document.createElement("div");
      card.className = "admin-card";
      card.innerHTML = `
        <div class="ac-thumb">${p.image ? '<img src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.name) + '">' : "🖼️"}</div>
        <div class="ac-name">${escapeHtml(p.name)}</div>
        <div class="ac-price" style="color:#4ade80;font-weight:700;">${money(p.price)}</div>
        <div class="ac-row"><span>Stock</span><span>${p.stock}</span></div>
        <div class="ac-row"><span>Proveedor</span><span>${escapeHtml(providerName(p.providerId))}</span></div>
        <div class="ac-actions">
          <button class="btn btn-ghost" data-stock-inc="${p.id}">＋ Stock</button>
          <button class="btn btn-danger" data-del="${p.id}">Eliminar</button>
        </div>`;
      box.appendChild(card);
    });

    box.querySelectorAll("[data-del]").forEach(btn => {
      btn.onclick = () => {
        const list = products();
        const idx = list.findIndex(x => x.id === btn.dataset.del);
        if (idx > -1) {
          list.splice(idx, 1);
          saveProducts(list);
        }
        adminRender();
      };
    });

    box.querySelectorAll("[data-stock-inc]").forEach(btn => {
      btn.onclick = () => {
        const amount = prompt("¿Cuánto stock agregar a este producto?", "1");
        const n = parseInt(amount, 10);
        if (isNaN(n) || n <= 0) return;
        const list = products();
        const p = list.find(x => x.id === btn.dataset.stockInc);
        if (!p) return;
        p.stock = (Number(p.stock) || 0) + n;
        saveProducts(list);
        renderAdminStats();
        renderAdminProducts();
      };
    });
  }

  function renderAdminProviders() {
    const tbody = document.getElementById("providersTable");
    if (!tbody) return;
    tbody.innerHTML = "";
    providers().forEach(p => {
      const count = products().filter(x => x.providerId === p.id).length;
      const linkedUser = p.userId && users()[p.userId] ? p.userId : "";
      const suspended = linkedUser ? isSuspended(linkedUser) : false;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><b>${escapeHtml(p.name)}</b></td>
        <td>${escapeHtml(p.contact || "—")}</td>
        <td>${count}</td>
        <td>${linkedUser
          ? `<span class="badge ${suspended ? "badge-used" : "badge-approved"}">${suspended ? "Suspendido" : "Activo"}</span>`
          : '<span style="color:#4a6070;font-size:12px;">Sin cuenta</span>'}</td>
        <td style="white-space:nowrap;">
          ${linkedUser ? `<button class="btn-link" data-ptoggle="${p.id}">${suspended ? "Reactivar" : "Suspender"}</button>` : ""}
          <button class="btn btn-danger btn-sm" data-pdel="${p.id}" style="${linkedUser ? "margin-left:8px;" : ""}">Eliminar</button>
        </td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll("[data-ptoggle]").forEach(btn => {
      btn.onclick = () => {
        const prov = providers().find(x => x.id === btn.dataset.ptoggle);
        if (!prov || !prov.userId) return;
        const name = prov.userId;
        const currently = isSuspended(name);
        if (!currently && !confirm("¿Suspender al proveedor " + name + "?\n\nNo podrá iniciar sesión y sus productos dejarán de mostrarse en la tienda.")) return;
        if (currently && !confirm("¿Reactivar al proveedor " + name + "?\n\nVolverá a vender y sus productos se mostrarán de nuevo.")) return;
        setUserSuspended(name, !currently);
        adminRender();
        if (typeof svToast === "function") {
          svToast(currently ? "success" : "error", currently ? "Proveedor reactivado" : "Proveedor suspendido", name + (currently ? " ya puede volver a vender." : " dejó de tener acceso."));
        }
      };
    });
    tbody.querySelectorAll("[data-pdel]").forEach(btn => {
      btn.onclick = () => {
        if (products().some(x => x.providerId === btn.dataset.pdel)) {
          alert("Elimina primero sus productos.");
          return;
        }
        const list = providers();
        const idx = list.findIndex(x => x.id === btn.dataset.pdel);
        if (idx > -1) {
          list.splice(idx, 1);
          saveProviders(list);
        }
        adminRender();
      };
    });
  }

  function refundOrder(id) {
    const list = orders();
    const o = list.find(x => x.id === id);
    if (!o) return { ok: false, msg: "Pedido no encontrado." };
    if (o.status === "reembolsado") return { ok: false, msg: "Este pedido ya fue reembolsado." };
    if (!o.buyer) return { ok: false, msg: "Este pedido no tiene comprador registrado." };
    const u = users();
    if (!u[o.buyer]) return { ok: false, msg: "El usuario @" + o.buyer + " ya no existe." };

    const amount = Number(o.total || 0);
    const bal = getBalance(o.buyer);
    bal.PEN = (Number(bal.PEN) || 0) + amount;
    setBalance(o.buyer, bal);

    if (o.productId) {
      const ps = products();
      const p = ps.find(x => x.id === o.productId);
      if (p) {
        p.stock = (Number(p.stock) || 0) + 1;
        saveProducts(ps);
      }
    }

    o.status = "reembolsado";
    o.refundedAt = new Date().toISOString();
    saveOrders(list);
    return { ok: true, buyer: o.buyer, amount: amount };
  }

  function renderAdminOrders() {
    const tbody = document.getElementById("ordersTable");
    if (!tbody) return;
    tbody.innerHTML = "";
    const me = currentUser();
    const soloMios = !!(me && me.role === "proveedor" && me.providerId);
    let list = orders();
    if (soloMios) list = list.filter(o => o.providerId === me.providerId);
    if (list.length === 0) {
      tbody.innerHTML = soloMios
        ? '<tr><td colspan="6" class="muted">Aún no tienes ventas. Cuando compren tus productos aparecerán aquí.</td></tr>'
        : '<tr><td colspan="6" class="muted">No hay pedidos todavía.</td></tr>';
      return;
    }
    list.slice().reverse().forEach(o => {
      const refunded = o.status === "reembolsado";
      const statusHtml = refunded
        ? '<span class="badge badge-used">Reembolsado</span>'
        : '<span class="' + (o.status === "completado" ? "estado-completado" : "estado-pendiente") + '">' + (o.status === "completado" ? "Completado" : "Pendiente") + '</span>';
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(new Date(o.createdAt).toLocaleString())}</td>
        <td>${escapeHtml(o.client)}${o.buyer ? '<div style="font-size:11px;color:#4a6070;">@' + escapeHtml(o.buyer) + '</div>' : ""}</td>
        <td>${escapeHtml(o.product)}</td>
        <td class="price">${money(o.total)}</td>
        <td>${statusHtml}</td>
        <td>
          ${!refunded && o.status !== "completado" ? '<button class="btn-link" data-done="' + o.id + '">Completar</button>' : ""}
          ${!refunded && o.buyer ? '<button class="btn-link" data-refund="' + o.id + '" style="color:#fbbf24;">Reembolsar</button>' : ""}
          <button class="btn-link" data-odel="${o.id}">Eliminar</button>
        </td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll("[data-refund]").forEach(btn => {
      btn.onclick = () => {
        const o = orders().find(x => x.id === btn.dataset.refund);
        if (!o) return;
        if (soloMios && o.providerId !== me.providerId) {
          if (typeof svToast === "function") svToast("error", "No permitido", "Solo puedes reembolsar ventas de tus productos.");
          return;
        }
        if (!confirm("¿Reembolsar " + o.total.toFixed(2) + " créditos a @" + o.buyer + "?\n\nSe le devolverán " + o.total.toFixed(2) + " créditos a su cuenta y el stock del producto volverá a sumarse.")) return;
        const res = refundOrder(btn.dataset.refund);
        adminRender();
        if (res.ok) {
          if (typeof svToast === "function") svToast("success", "Reembolso realizado", "Se devolvieron " + res.amount.toFixed(2) + " créditos a @" + res.buyer + ".");
        } else if (typeof svToast === "function") {
          svToast("error", "No se pudo reembolsar", res.msg);
        }
      };
    });
    tbody.querySelectorAll("[data-done]").forEach(btn => {
      btn.onclick = () => {
        const list = orders();
        const o = list.find(x => x.id === btn.dataset.done);
        if (o) {
          o.status = "completado";
          saveOrders(list);
        }
        adminRender();
      };
    });
    tbody.querySelectorAll("[data-odel]").forEach(btn => {
      btn.onclick = () => {
        const list = orders();
        const idx = list.findIndex(x => x.id === btn.dataset.odel);
        if (idx > -1) {
          list.splice(idx, 1);
          saveOrders(list);
        }
        adminRender();
      };
    });
  }

  function renderAdminClients() {
    const tbody = document.getElementById("clientsTable");
    if (!tbody) return;
    tbody.innerHTML = "";
    const list = users();
    const me = session();
    Object.keys(list).forEach(u => {
      const row = list[u];
      const suspended = !!row.suspended;
      const roleLabel = row.role === "admin" ? "Administrador" : row.role === "proveedor" ? "Proveedor" : row.role === "dueno" ? "Dueño" : "Cliente";
      const isMe = u === me;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><b>${escapeHtml(u)}</b></td>
        <td>${escapeHtml(row.email || "—")}</td>
        <td>${
          row.phone
            ? '<a href="https://wa.me/' + escapeHtml(row.phone) + '" target="_blank" rel="noopener" style="color:#25d366;text-decoration:none;font-weight:700;" title="Escribir por WhatsApp">+' + escapeHtml(row.phone) + '</a>'
            : '<span style="color:#4a6070;">—</span>'
        }${row.country ? '<div style="font-size:11px;color:#4a6070;">' + escapeHtml(row.country) + '</div>' : ''}</td>
        <td>${escapeHtml(row.createdAt ? new Date(row.createdAt).toLocaleString() : "—")}</td>
        <td>${roleLabel}</td>
        <td><span class="badge ${suspended ? "badge-used" : "badge-approved"}">${suspended ? "Suspendido" : "Activo"}</span></td>
        <td style="white-space:nowrap;">${
          row.role === "admin"
            ? '<span style="color:#4a6070;font-size:12px;">—</span>'
            : (isMe
                ? '<span style="color:#4a6070;font-size:12px;">Tu cuenta</span>'
                : `<button class="btn-link" data-toggle-user="${escapeHtml(u)}">${suspended ? "Reactivar" : "Suspender"}</button>
                   <button class="btn-link" data-del-user="${escapeHtml(u)}" style="color:#f87171;margin-left:8px;">Eliminar</button>`)
        }</td>`;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("[data-toggle-user]").forEach(btn => {
      btn.onclick = () => {
        const u = btn.dataset.toggleUser;
        const row = users()[u];
        const esCliente = !row || !row.role || row.role === "cliente";
        const accion = esCliente ? "comprar" : "vender";
        const actualmente = isSuspended(u);
        if (!actualmente && !confirm("¿Suspender a " + u + "? No podrá iniciar sesión ni " + accion + ".")) return;
        if (actualmente && !confirm("¿Reactivar la cuenta de " + u + "?")) return;
        setUserSuspended(u, !actualmente);
        adminRender();
        if (typeof svToast === "function") {
          svToast(actualmente ? "success" : "error", actualmente ? "Cuenta reactivada" : "Cuenta suspendida", u + (actualmente ? " ya puede volver a entrar." : " ya no puede iniciar sesión ni " + accion + "."));
        }
      };
    });

    tbody.querySelectorAll("[data-del-user]").forEach(btn => {
      btn.onclick = () => {
        const u = btn.dataset.delUser;
        const row = users()[u];
        const prov = row && row.role === "proveedor" ? providerOfUser(u) : null;
        const msg = prov
          ? "¿Eliminar a " + u + "? Se borrará su cuenta, su ficha de proveedor y TODOS sus productos. Esta acción no se puede deshacer."
          : "¿Eliminar al usuario " + u + "? Esta acción no se puede deshacer.";
        if (!confirm(msg)) return;
        deleteUser(u);
        adminRender();
        if (typeof svToast === "function") svToast("success", "Usuario eliminado", u + " fue eliminado del sistema.");
      };
    });
  }

  // ---------- pestañas admin ----------
  function tab(name) {
    document.querySelectorAll(".nav-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.tab === name);
    });
    document.querySelectorAll(".tab").forEach(t => {
      t.classList.toggle("active", t.id === name);
    });
  }

  // ---------- copiar ----------
  function copyText(text) {
    try {
      navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  }

  // ---------- imágenes ligeras (para no llenar la memoria del navegador) ----------
  function shrinkDataUrl(dataUrl, maxSide, quality) {
    return new Promise(function (resolve) {
      if (!dataUrl || dataUrl.indexOf("data:image") !== 0 || typeof Image === "undefined") {
        resolve(null);
        return;
      }
      const img = new Image();
      img.onload = function () {
        try {
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          if (!w || !h) { resolve(null); return; }
          const scale = Math.min(1, maxSide / Math.max(w, h));
          const nw = Math.max(1, Math.round(w * scale));
          const nh = Math.max(1, Math.round(h * scale));
          const c = document.createElement("canvas");
          c.width = nw;
          c.height = nh;
          const ctx = c.getContext("2d");
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, nw, nh);
          ctx.drawImage(img, 0, 0, nw, nh);
          resolve(c.toDataURL("image/jpeg", quality));
        } catch (e) {
          resolve(null);
        }
      };
      img.onerror = function () { resolve(null); };
      img.src = dataUrl;
    });
  }

  function shrinkImageList(list) {
    if (!Array.isArray(list)) return Promise.resolve({ list: list, changed: false });
    let changed = false;
    const tasks = list.map(function (item) {
      if (!item || typeof item !== "object") return Promise.resolve();
      if (!item.image || item.image.indexOf("data:image") !== 0) return Promise.resolve();
      if (item.image.length < 200000) return Promise.resolve();
      return shrinkDataUrl(item.image, 900, 0.72).then(function (small) {
        if (small && small.length < item.image.length) {
          item.image = small;
          changed = true;
        }
      });
    });
    return Promise.all(tasks).then(function () {
      return { list: list, changed: changed };
    });
  }

  /* aligerar el catálogo local si tiene fotos enormes */
  function shrinkProducts() {
    try {
      const list = products();
      if (!list || !list.length) return Promise.resolve(false);
      return shrinkImageList(list).then(function (res) {
        if (!res.changed) return false;
        saveProducts(res.list);
        return true;
      });
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  /* aligerar un valor recién bajado de la nube antes de guardarlo */
  function shrinkValue(key, value) {
    if (key !== K.products) return Promise.resolve(value);
    return shrinkImageList(value).then(function (res) { return res.list; });
  }

  // ---------- API pública ----------
  return {
    seed,
    ready,
    isReady,
    shrinkProducts,
    shrinkValue,
    shrinkDataUrl,
    hash,
    id: uid,
    newCode,
    users,
    saveUsers,
    codes,
    saveCodes,
    products,
    saveProducts,
    providers,
    saveProviders,
    orders,
    saveOrders,
    session,
    setSession,
    logout,
    homeFor,
    requireRole,
    getBalance,
    setBalance,
    currentUser,
    requireClient,
    requireAdmin,
    renderPublicProducts,
    renderClientProducts,
    openOrder,
    closeModal,
    adminRender,
    tab,
    id2: uid,
    providerName,
    escapeHtml,
    createCodes,
    clearCodes,
    deleteCodeByIndex,
    refundOrder,
    recharges,
    saveRecharges,
    createRecharge,
    getCredits,
    addCredits,
    approveRecharge,
    rejectRecharge,
    cleanPhone,
    money,
    moneyIn,
    symbolOf,
    creditosDe,
    saldoPEN,
    gastarPEN,
    RATES,
    currentUser,
    providerWhatsApp,
    providers,
    saveProviders,
    isSuspended,
    setUserSuspended,
    deleteUser,
    providerOfUser,
    providerIsActive,
  };
})();