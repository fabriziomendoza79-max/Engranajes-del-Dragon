// ============================================================
// ENGRANAJES DEL DRAGÓN
// SISTEMA PRINCIPAL
// ============================================================

const SV = {

    // ========================================================
    // UTILIDADES
    // ========================================================

    id() {
        return (
            Date.now().toString(36) +
            Math.random().toString(36).substring(2, 9)
        );
    },


    hash(text) {

        let hash = 0;

        text = String(text || "");

        for (let i = 0; i < text.length; i++) {

            hash =
                ((hash << 5) - hash) +
                text.charCodeAt(i);

            hash |= 0;
        }

        return String(hash);
    },


    money(value) {

        return (
            "S/ " +
            Number(value || 0).toFixed(2)
        );
    },


    escapeHtml(value) {

        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },


    cleanPhone(phone) {

        return String(phone || "")
            .replace(/\D/g, "");
    },


    // ========================================================
    // USUARIOS
    // ========================================================

    users() {

        try {

            return JSON.parse(
                localStorage.getItem("usuarios")
            ) || {};

        } catch (error) {

            return {};

        }
    },


    saveUsers(users) {

        localStorage.setItem(
            "usuarios",
            JSON.stringify(users)
        );
    },


    // ========================================================
    // SESIÓN
    // ========================================================

    session() {

        return (
            localStorage.getItem("sesion") ||
            localStorage.getItem("sv_session") ||
            ""
        );
    },


    setSession(username) {

        localStorage.setItem(
            "sesion",
            username
        );

        localStorage.setItem(
            "sv_session",
            username
        );
    },


    logout() {

        localStorage.removeItem(
            "sesion"
        );

        localStorage.removeItem(
            "sv_session"
        );
    },


    // ========================================================
    // CÓDIGOS
    // ========================================================

    codes() {

        try {

            const raw =
                JSON.parse(
                    localStorage.getItem("codigos")
                ) || [];


            return raw.map(item => {

                return {

                    code:
                        item.code ||
                        item.codigo ||
                        "",

                    used:
                        typeof item.used === "boolean"
                            ? item.used
                            : Boolean(item.usado),

                    usedBy:
                        item.usedBy ||
                        "",

                    usedAt:
                        item.usedAt ||
                        item.fechaUso ||
                        "",

                    createdAt:
                        item.createdAt ||
                        item.fecha ||
                        new Date().toISOString()

                };

            });

        } catch (error) {

            return [];

        }
    },


    saveCodes(codes) {

        localStorage.setItem(
            "codigos",
            JSON.stringify(codes)
        );
    },


    newCode() {

        const characters =
            "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

        let code = "";

        for (let i = 0; i < 10; i++) {

            code += characters.charAt(
                Math.floor(
                    Math.random() *
                    characters.length
                )
            );

        }

        return code;
    },


    createCodes(quantity) {

        const codes =
            this.codes();


        for (
            let i = 0;
            i < Number(quantity);
            i++
        ) {

            let code =
                this.newCode();


            while (
                codes.some(
                    item =>
                        item.code === code
                )
            ) {

                code =
                    this.newCode();

            }


            codes.push({

                code: code,

                used: false,

                usedBy: "",

                usedAt: "",

                createdAt:
                    new Date().toISOString()

            });

        }


        this.saveCodes(
            codes
        );


        return codes;
    },


    // ========================================================
    // PRODUCTOS
    // ========================================================

    products() {

        try {

            return JSON.parse(
                localStorage.getItem("productos")
            ) || [];

        } catch (error) {

            return [];

        }
    },


    saveProducts(products) {

        localStorage.setItem(
            "productos",
            JSON.stringify(products)
        );
    },


    // ========================================================
    // PROVEEDORES
    // ========================================================

    providers() {

        try {

            return JSON.parse(
                localStorage.getItem("proveedores")
            ) || [];

        } catch (error) {

            return [];

        }
    },


    saveProviders(providers) {

        localStorage.setItem(
            "proveedores",
            JSON.stringify(providers)
        );
    },


    // ========================================================
    // PEDIDOS
    // ========================================================

    orders() {

        try {

            return JSON.parse(
                localStorage.getItem("pedidos")
            ) || [];

        } catch (error) {

            return [];

        }
    },


    saveOrders(orders) {

        localStorage.setItem(
            "pedidos",
            JSON.stringify(orders)
        );
    },


    // ========================================================
    // SALDOS / CRÉDITOS
    // ========================================================

    balances() {

        try {

            return JSON.parse(
                localStorage.getItem("saldos")
            ) || {};

        } catch (error) {

            return {};

        }
    },


    saveBalances(balances) {

        localStorage.setItem(
            "saldos",
            JSON.stringify(balances)
        );
    },


    getBalance(username) {

        const balances =
            this.balances();

        const users =
            this.users();


        if (
            balances[username] !== undefined
        ) {

            return Number(
                balances[username]
            );
        }


        if (
            users[username] &&
            users[username].creditos !== undefined
        ) {

            return Number(
                users[username].creditos
            );
        }


        return 0;
    },


    setBalance(username, amount) {

        const balances =
            this.balances();

        const users =
            this.users();


        const value =
            Math.max(
                0,
                Number(amount || 0)
            );


        balances[username] =
            value;


        this.saveBalances(
            balances
        );


        if (users[username]) {

            users[username].creditos =
                value;


            this.saveUsers(
                users
            );
        }
    },


    addBalance(username, amount) {

        const current =
            this.getBalance(
                username
            );


        this.setBalance(
            username,
            current +
            Number(amount || 0)
        );
    },


    removeBalance(username, amount) {

        const current =
            this.getBalance(
                username
            );

        const value =
            Number(amount || 0);


        if (
            value <= 0 ||
            current < value
        ) {

            return false;
        }


        this.setBalance(
            username,
            current - value
        );


        return true;
    },


    // ========================================================
    // RECARGAS
    // ========================================================

    recharges() {

        try {

            return JSON.parse(
                localStorage.getItem("recargas")
            ) || [];

        } catch (error) {

            return [];

        }
    },


    saveRecharges(recharges) {

        localStorage.setItem(
            "recargas",
            JSON.stringify(recharges)
        );
    },


    createRecharge(data) {

        const recharges =
            this.recharges();


        const recharge = {

            id:
                data.id ||
                this.id(),

            username:
                data.username ||
                this.session(),

            amount:
                Number(
                    data.amount || 0
                ),

            method:
                data.method ||
                "",

            manager:
                data.manager ||
                "",

            account:
                data.account ||
                "",

            proof:
                data.proof ||
                "",

            status:
                "Pendiente",

            createdAt:
                new Date().toISOString(),

            phone:
                data.phone ||
                ""

        };


        recharges.unshift(
            recharge
        );


        this.saveRecharges(
            recharges
        );


        return recharge;
    },


    requestRecharge() {

        const modal =
            document.getElementById(
                "rechargeModal"
            );


        if (!modal) {

            alert(
                "No se encontró el sistema de recargas."
            );

            return;
        }


        modal.classList.remove(
            "hidden"
        );


        if (
            typeof window.showRechargeStep ===
            "function"
        ) {

            window.showRechargeStep(1);

        }

    },


    approveRecharge(id) {

        const recharges =
            this.recharges();


        const recharge =
            recharges.find(
                item =>
                    item.id === id
            );


        if (!recharge) {

            alert(
                "No se encontró la solicitud."
            );

            return;
        }


        if (
            recharge.status !==
            "Pendiente"
        ) {

            alert(
                "Esta solicitud ya fue procesada."
            );

            return;
        }


        const users =
            this.users();


        if (
            !users[recharge.username]
        ) {

            alert(
                "El cliente ya no existe."
            );

            return;
        }


        // AGREGAR CRÉDITOS

        this.addBalance(
            recharge.username,
            recharge.amount
        );


        // CAMBIAR ESTADO

        recharge.status =
            "Aprobado";


        recharge.approvedAt =
            new Date().toISOString();


        this.saveRecharges(
            recharges
        );


        if (
            typeof window.renderRecharges ===
            "function"
        ) {

            window.renderRecharges();

        }


        alert(
            "Recarga aprobada correctamente.\n\n" +
            "Cliente: " +
            recharge.username +
            "\n" +
            "Créditos agregados: " +
            recharge.amount
        );
    },


    rejectRecharge(id) {

        const recharges =
            this.recharges();


        const recharge =
            recharges.find(
                item =>
                    item.id === id
            );


        if (!recharge) {
            return;
        }


        if (
            recharge.status !==
            "Pendiente"
        ) {

            alert(
                "Esta solicitud ya fue procesada."
            );

            return;
        }


        if (
            !confirm(
                "¿Quieres rechazar esta recarga?"
            )
        ) {

            return;
        }


        recharge.status =
            "Rechazado";


        recharge.rejectedAt =
            new Date().toISOString();


        this.saveRecharges(
            recharges
        );


        if (
            typeof window.renderRecharges ===
            "function"
        ) {

            window.renderRecharges();

        }


        alert(
            "Solicitud rechazada."
        );
    },


    // ========================================================
    // ADMIN
    // ========================================================

    requireAdmin() {

        const username =
            this.session();


        const users =
            this.users();


        if (
            !username ||
            !users[username] ||
            users[username].role !==
            "admin"
        ) {

            location.href =
                "login.html";


            return false;
        }


        return true;
    },


    // ========================================================
    // CLIENTE
    // ========================================================

    requireClient() {

        const username =
            this.session();


        const users =
            this.users();


        if (
            !username ||
            !users[username]
        ) {

            location.href =
                "login.html";


            return false;
        }


        return true;
    },


    // ========================================================
    // TABS ADMIN
    // ========================================================

    tab(tabName) {

        document
            .querySelectorAll(".tab")
            .forEach(tab => {

                tab.classList.remove(
                    "active"
                );

            });


        document
            .querySelectorAll(".nav-btn")
            .forEach(button => {

                button.classList.remove(
                    "active"
                );

            });


        const tab =
            document.getElementById(
                tabName
            );


        const button =
            document.querySelector(
                `[data-tab="${tabName}"]`
            );


        if (tab) {

            tab.classList.add(
                "active"
            );

        }


        if (button) {

            button.classList.add(
                "active"
            );

        }
    },


    // ========================================================
    // ADMIN RENDER
    // ========================================================

    adminRender() {

        this.renderStats();

        this.renderCodes();

        this.renderProducts();

        this.renderProviders();

        this.renderOrders();

        this.renderClients();

        this.renderProviderSelect();

    },


    // ========================================================
    // ESTADÍSTICAS
    // ========================================================

    renderStats() {

        const products =
            this.products();


        const codes =
            this.codes();


        const orders =
            this.orders();


        const stock =
            products.reduce(
                (
                    total,
                    product
                ) => {

                    return total +
                        Number(
                            product.stock || 0
                        );

                },
                0
            );


        const productsElement =
            document.getElementById(
                "sProducts"
            );


        const stockElement =
            document.getElementById(
                "sStock"
            );


        const codesElement =
            document.getElementById(
                "sCodes"
            );


        const ordersElement =
            document.getElementById(
                "sOrders"
            );


        if (productsElement) {

            productsElement.textContent =
                products.length;

        }


        if (stockElement) {

            stockElement.textContent =
                stock;

        }


        if (codesElement) {

            codesElement.textContent =
                codes.filter(
                    item =>
                        !item.used
                ).length;

        }


        if (ordersElement) {

            ordersElement.textContent =
                orders.length;

        }
    },


    // ========================================================
    // CÓDIGOS
    // ========================================================

    renderCodes() {

        const table =
            document.getElementById(
                "codesTable"
            );


        if (!table) {
            return;
        }


        const codes =
            this.codes();


        table.innerHTML = "";


        if (codes.length === 0) {

            table.innerHTML = `
                <tr>
                    <td colspan="5">
                        No hay códigos generados.
                    </td>
                </tr>
            `;

            return;
        }


        codes.forEach(
            (item, index) => {

                const tr =
                    document.createElement(
                        "tr"
                    );


                tr.innerHTML = `

                    <td>

                        <strong
                            class="code-text"
                        >
                            ${this.escapeHtml(
                                item.code
                            )}
                        </strong>

                    </td>


                    <td>

                        ${
                            item.used

                            ?

                            `
                            <span
                                class="status used"
                            >
                                USADO
                            </span>
                            `

                            :

                            `
                            <span
                                class="status free"
                            >
                                LIBRE
                            </span>
                            `
                        }

                    </td>


                    <td>

                        ${
                            item.usedBy
                            ?
                            this.escapeHtml(
                                item.usedBy
                            )
                            :
                            "-"
                        }

                    </td>


                    <td>

                        ${
                            item.usedAt

                            ?

                            new Date(
                                item.usedAt
                            ).toLocaleString()

                            :

                            new Date(
                                item.createdAt
                            ).toLocaleString()
                        }

                    </td>


                    <td>

                        ${
                            !item.used

                            ?

                            `
                            <button
                                class="btn btn-danger btn-sm"
                                onclick="SV.deleteCode(${index})"
                            >
                                Eliminar
                            </button>
                            `

                            :

                            ""
                        }

                    </td>

                `;


                table.appendChild(
                    tr
                );

            }
        );
    },


    deleteCode(index) {

        const codes =
            this.codes();


        if (!codes[index]) {
            return;
        }


        if (
            !confirm(
                "¿Eliminar este código?"
            )
        ) {

            return;
        }


        codes.splice(
            index,
            1
        );


        this.saveCodes(
            codes
        );


        this.adminRender();
    },


    // ========================================================
    // PRODUCTOS ADMIN
    // ========================================================

    renderProducts() {

        const container =
            document.getElementById(
                "adminProducts"
            );


        if (!container) {
            return;
        }


        const products =
            this.products();


        const providers =
            this.providers();


        container.innerHTML = "";


        if (products.length === 0) {

            container.innerHTML = `
                <p class="muted">
                    No hay productos.
                </p>
            `;

            return;
        }


        products.forEach(
            product => {

                const provider =
                    providers.find(
                        item =>
                            item.id ===
                            product.providerId
                    );


                const card =
                    document.createElement(
                        "div"
                    );


                card.className =
                    "admin-product";


                card.innerHTML = `

                    <div
                        class="admin-product-info"
                    >

                        <h3>
                            ${this.escapeHtml(
                                product.name
                            )}
                        </h3>

                        <p>
                            ${this.escapeHtml(
                                product.description ||
                                ""
                            )}
                        </p>

                        <strong>
                            ${this.money(
                                product.price
                            )}
                        </strong>

                        <span>
                            Stock:
                            ${Number(
                                product.stock || 0
                            )}
                        </span>

                        <small>
                            ${
                                provider
                                ?
                                this.escapeHtml(
                                    provider.name
                                )
                                :
                                "Sin proveedor"
                            }
                        </small>

                    </div>


                    <div
                        class="admin-product-actions"
                    >

                        <button
                            class="btn btn-danger btn-sm"
                            onclick="SV.deleteProduct('${product.id}')"
                        >
                            Eliminar
                        </button>

                    </div>

                `;


                container.appendChild(
                    card
                );

            }
        );
    },


    deleteProduct(id) {

        if (
            !confirm(
                "¿Eliminar este producto?"
            )
        ) {

            return;
        }


        const products =
            this.products()
                .filter(
                    product =>
                        product.id !== id
                );


        this.saveProducts(
            products
        );


        this.adminRender();
    },


    // ========================================================
    // PROVEEDORES
    // ========================================================

    renderProviderSelect() {

        const select =
            document.getElementById(
                "pProvider"
            );


        if (!select) {
            return;
        }


        const providers =
            this.providers();


        select.innerHTML = `
            <option value="">
                Sin proveedor
            </option>
        `;


        providers.forEach(
            provider => {

                const option =
                    document.createElement(
                        "option"
                    );


                option.value =
                    provider.id;


                option.textContent =
                    provider.name;


                select.appendChild(
                    option
                );

            }
        );
    },


    renderProviders() {

        const table =
            document.getElementById(
                "providersTable"
            );


        if (!table) {
            return;
        }


        const providers =
            this.providers();


        const products =
            this.products();


        table.innerHTML = "";


        providers.forEach(
            provider => {

                const count =
                    products.filter(
                        product =>
                            product.providerId ===
                            provider.id
                    ).length;


                const tr =
                    document.createElement(
                        "tr"
                    );


                tr.innerHTML = `

                    <td>
                        ${this.escapeHtml(
                            provider.name
                        )}
                    </td>

                    <td>
                        ${this.escapeHtml(
                            provider.contact ||
                            "-"
                        )}
                    </td>

                    <td>
                        ${count}
                    </td>

                    <td>

                        <button
                            class="btn btn-danger btn-sm"
                            onclick="SV.deleteProvider('${provider.id}')"
                        >
                            Eliminar
                        </button>

                    </td>

                `;


                table.appendChild(
                    tr
                );

            }
        );
    },


    deleteProvider(id) {

        if (
            !confirm(
                "¿Eliminar este proveedor?"
            )
        ) {

            return;
        }


        const providers =
            this.providers()
                .filter(
                    provider =>
                        provider.id !== id
                );


        this.saveProviders(
            providers
        );


        this.adminRender();
    },


    // ========================================================
    // PEDIDOS
    // ========================================================

    renderOrders() {

        const table =
            document.getElementById(
                "ordersTable"
            );


        if (!table) {
            return;
        }


        const orders =
            this.orders();


        table.innerHTML = "";


        if (orders.length === 0) {

            table.innerHTML = `
                <tr>
                    <td colspan="6">
                        No hay pedidos todavía.
                    </td>
                </tr>
            `;

            return;
        }


        orders
            .slice()
            .reverse()
            .forEach(
                order => {

                    const tr =
                        document.createElement(
                            "tr"
                        );


                    tr.innerHTML = `

                        <td>
                            ${
                                order.createdAt
                                ?
                                new Date(
                                    order.createdAt
                                ).toLocaleString()
                                :
                                "-"
                            }
                        </td>

                        <td>
                            ${this.escapeHtml(
                                order.username ||
                                "-"
                            )}
                        </td>

                        <td>
                            ${this.escapeHtml(
                                order.productName ||
                                "-"
                            )}
                        </td>

                        <td>
                            ${this.money(
                                order.total
                            )}
                        </td>

                        <td>

                            <span class="status free">
                                ${this.escapeHtml(
                                    order.status ||
                                    "Pendiente"
                                )}
                            </span>

                        </td>

                        <td></td>

                    `;


                    table.appendChild(
                        tr
                    );

                }
            );
    },


    // ========================================================
    // CLIENTES
    // ========================================================

    renderClients() {

        const table =
            document.getElementById(
                "clientsTable"
            );


        if (!table) {
            return;
        }


        const users =
            this.users();


        table.innerHTML = "";


        Object.entries(users)
            .forEach(
                ([username, user]) => {

                    const tr =
                        document.createElement(
                            "tr"
                        );


                    tr.innerHTML = `

                        <td>
                            ${this.escapeHtml(
                                username
                            )}
                        </td>

                        <td>
                            ${this.escapeHtml(
                                user.email ||
                                "-"
                            )}
                        </td>

                        <td>
                            ${
                                user.createdAt
                                ?
                                new Date(
                                    user.createdAt
                                ).toLocaleString()
                                :
                                "-"
                            }
                        </td>

                        <td>
                            ${this.escapeHtml(
                                user.role ||
                                "cliente"
                            )}
                        </td>

                    `;


                    table.appendChild(
                        tr
                    );

                }
            );
    },


    // ========================================================
    // PRODUCTOS CLIENTE
    // ========================================================

    renderClientProducts(container) {

        if (!container) {
            return;
        }


        const products =
            this.products()
                .filter(
                    product =>
                        Number(
                            product.stock || 0
                        ) > 0
                );


        const providers =
            this.providers();


        container.innerHTML = "";


        if (products.length === 0) {

            container.innerHTML = `
                <p class="muted">
                    No hay productos disponibles.
                </p>
            `;

            return;
        }


        products.forEach(
            product => {

                const provider =
                    providers.find(
                        item =>
                            item.id ===
                            product.providerId
                    );


                const card =
                    document.createElement(
                        "div"
                    );


                card.className =
                    "product-card";


                card.innerHTML = `

                    <div class="thumb">

                        ${
                            product.image

                            ?

                            `
                            <img
                                src="${this.escapeHtml(
                                    product.image
                                )}"
                                alt="${this.escapeHtml(
                                    product.name
                                )}"
                            >
                            `

                            :

                            "🎬"
                        }

                    </div>


                    <div class="p-name">
                        ${this.escapeHtml(
                            product.name
                        )}
                    </div>


                    <div class="p-price">
                        ${this.money(
                            product.price
                        )}
                    </div>


                    ${
                        product.description
                        ?

                        `
                        <div class="p-desc">
                            ${this.escapeHtml(
                                product.description
                            )}
                        </div>
                        `

                        :

                        ""
                    }


                    <div class="p-meta">

                        <span class="stock-chip ok">
                            ${Number(
                                product.stock
                            )}
                            en stock
                        </span>


                        <span class="provider-chip">

                            ${
                                provider
                                ?
                                this.escapeHtml(
                                    provider.name
                                )
                                :
                                "Sin proveedor"
                            }

                        </span>

                    </div>


                    <button
                        class="btn btn-primary full"
                        onclick="SV.buyProduct('${product.id}')"
                    >
                        💳 Comprar con créditos
                    </button>

                `;


                container.appendChild(
                    card
                );

            }
        );
    },


    // ========================================================
    // COMPRAR
    // ========================================================

    buyProduct(productId) {

        const username =
            this.session();


        if (!username) {

            location.href =
                "login.html";

            return;
        }


        const products =
            this.products();


        const product =
            products.find(
                item =>
                    item.id === productId
            );


        if (!product) {

            alert(
                "Producto no encontrado."
            );

            return;
        }


        if (
            Number(product.stock || 0) <= 0
        ) {

            alert(
                "Este producto no tiene stock."
            );

            return;
        }


        const price =
            Number(
                product.price || 0
            );


        const balance =
            this.getBalance(
                username
            );


        if (
            balance < price
        ) {

            alert(
                "No tienes suficientes créditos.\n\n" +
                "Precio: " +
                this.money(price) +
                "\n" +
                "Saldo: " +
                this.money(balance)
            );

            return;
        }


        if (
            !confirm(
                "¿Quieres comprar " +
                product.name +
                " por " +
                this.money(price) +
                "?"
            )
        ) {

            return;
        }


        const removed =
            this.removeBalance(
                username,
                price
            );


        if (!removed) {

            alert(
                "No fue posible descontar el saldo."
            );

            return;
        }


        product.stock =
            Number(product.stock) - 1;


        this.saveProducts(
            products
        );


        const orders =
            this.orders();


        orders.unshift({

            id:
                this.id(),

            username:
                username,

            productId:
                product.id,

            productName:
                product.name,

            total:
                price,

            status:
                "Pagado",

            createdAt:
                new Date().toISOString()

        });


        this.saveOrders(
            orders
        );


        alert(
            "Compra realizada correctamente.\n\n" +
            "Producto: " +
            product.name +
            "\n" +
            "Descontado: " +
            this.money(price)
        );


        location.reload();
    },


    // ========================================================
    // MODAL ANTIGUO
    // ========================================================

    closeModal() {

        const modal =
            document.getElementById(
                "modal"
            );


        if (modal) {

            modal.classList.add(
                "hidden"
            );

        }
    },


    // ========================================================
    // INICIALIZACIÓN
    // ========================================================

    seed() {

        const users =
            this.users();


        // ADMINISTRADOR

        if (!users.admin) {

            users.admin = {

                pass:
                    this.hash("admin123"),

                email:
                    "admin@engranajesdragon.com",

                role:
                    "admin",

                createdAt:
                    new Date().toISOString()

            };


            this.saveUsers(
                users
            );
        }


        // ESTRUCTURAS

        if (
            !localStorage.getItem(
                "productos"
            )
        ) {

            this.saveProducts([]);

        }


        if (
            !localStorage.getItem(
                "proveedores"
            )
        ) {

            this.saveProviders([]);

        }


        if (
            !localStorage.getItem(
                "pedidos"
            )
        ) {

            this.saveOrders([]);

        }


        if (
            !localStorage.getItem(
                "codigos"
            )
        ) {

            this.saveCodes([]);

        }


        if (
            !localStorage.getItem(
                "saldos"
            )
        ) {

            this.saveBalances({});

        }


        if (
            !localStorage.getItem(
                "recargas"
            )
        ) {

            this.saveRecharges([]);

        }

    }

};


// ============================================================
// INICIAR
// ============================================================

SV.seed();