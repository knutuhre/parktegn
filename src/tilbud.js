/**
 * Tilbud (Price Quote) – Christiania Oppmerking AS
 * Product data from "Prisliste 2025 - NCC", toggle logic, discount, annual price adjustment, and print.
 */

// ===== Configuration =====
const PRICE_BASE_YEAR = 2025;           // Satt til 2025 slik at de nye prisene får 1 års KPI-justering lagt på i år
const ANNUAL_ADJUSTMENT_PCT = 3.5;      // Konsumprisindeks / Annual price increase percentage
const CURRENT_YEAR = new Date().getFullYear();

// Calculate cumulative adjustment factor
const yearsDiff = CURRENT_YEAR - PRICE_BASE_YEAR;
const ADJUSTMENT_FACTOR = Math.pow(1 + ANNUAL_ADJUSTMENT_PCT / 100, yearsDiff);

// ===== Product Data (Prisliste 2026 - Formatert) =====
// Prices are 2026 eks. MVA — adjusted to current year automatically
const PRODUCTS_RAW = [
    // --- Termoplast ---
    { id: 3202, cat: 'Termoplast',     name: 'Termoplast, 10cm linje, HVIT',                    unit: 'lm',       price: 43 },
    { id: 3203, cat: 'Termoplast',     name: 'Termoplast, 10cm linje, HVIT, per plass',          unit: 'plass',    price: 310 },
    { id: 3204, cat: 'Termoplast',     name: 'Termoplast, Pil, Rett',                            unit: 'stk',      price: 1320 },
    { id: 3205, cat: 'Termoplast',     name: 'Termoplast, Pil, Sving',                           unit: 'stk',      price: 1430 },
    { id: 3206, cat: 'Termoplast',     name: 'Termoplast, Symbol, HC',                           unit: 'stk',      price: 1370 },
    { id: 3207, cat: 'Termoplast',     name: 'Termoplast, 50cm, Gangfelt',                       unit: 'lm',       price: 182 },
    { id: 3208, cat: 'Termoplast',     name: 'Termoplast, 50x50cm, Fartshump',                   unit: 'stk',      price: 100 },
    { id: 3209, cat: 'Termoplast',     name: 'Termoplast, Symbol, Vikelinje',                    unit: 'stk',      price: 248 },
    { id: 3210, cat: 'Termoplast',     name: 'Termoplast, per kvm',                              unit: 'kvm',      price: 345 },
    { id: 3211, cat: 'Termoplast',     name: 'Termoplast, BUSS/TAXI',                            unit: 'stk',      price: 2950 },
    { id: 3212, cat: 'Termoplast',     name: 'Termoplast, 20cm linje, HVIT',                     unit: 'lm',       price: 84 },
    { id: 3213, cat: 'Termoplast',     name: 'Termoplast, 25cm linje, HVIT',                     unit: 'lm',       price: 126 },
    { id: 3214, cat: 'Termoplast',     name: 'Termoplast, Nummer / Bokstaver (På gulv)',          unit: 'stk',      price: 460 },
    { id: 3281, cat: 'Termoplast',     name: 'Termoplast, Formerking',                           unit: 'time',     price: 1850 },
    { id: 3291, cat: 'Termoplast',     name: 'Termoplast, Rigg, maskiner og utstyr',             unit: 'oppmøte',  price: 7050 },

    // --- Prefabrikert ---
    { id: 3301, cat: 'Prefabrikert',   name: 'Prefabrikert, 10cm linje, HVIT',                   unit: 'lm',       price: 130 },
    { id: 3302, cat: 'Prefabrikert',   name: 'Prefabrikert, 10cm linje, GUL',                    unit: 'lm',       price: 135 },
    { id: 3303, cat: 'Prefabrikert',   name: 'Prefabrikert, Pil, Rett',                          unit: 'stk',      price: 1320 },
    { id: 3304, cat: 'Prefabrikert',   name: 'Prefabrikert, Pil, Sving',                         unit: 'stk',      price: 1430 },
    { id: 3305, cat: 'Prefabrikert',   name: 'Prefabrikert, 50cm, Gangfelt',                     unit: 'lm',       price: 172 },
    { id: 3306, cat: 'Prefabrikert',   name: 'Prefabrikert, Symbol, HC/elbil/MC/sykkel',         unit: 'stk',      price: 1420 },
    { id: 3307, cat: 'Prefabrikert',   name: 'Prefabrikert, Symbol, Vikelinje 1022',             unit: 'stk',      price: 248 },
    { id: 3391, cat: 'Prefabrikert',   name: 'Prefabrikert, Rigg, maskiner og utstyr',           unit: 'oppmøte',  price: 3000 },

    // --- Maling ---
    { id: 4202, cat: 'Maling',        name: 'Maling, 10cm linje, HVIT, remerking',               unit: 'lm',       price: 19 },
    { id: 4203, cat: 'Maling',        name: 'Maling, 10cm linje, HVIT, nymerking (inkl. oppmåling)', unit: 'lm',   price: 27 },
    { id: 4204, cat: 'Maling',        name: 'Maling, 10cm linje, HVIT, per plass, remerking',    unit: 'plass',    price: 137 },
    { id: 4205, cat: 'Maling',        name: 'Maling, 10cm linje, HVIT, per plass, nymerking',    unit: 'plass',    price: 184 },
    { id: 4206, cat: 'Maling',        name: 'Maling, 10cm linje, GUL, remerking',                unit: 'lm',       price: 22 },
    { id: 4207, cat: 'Maling',        name: 'Maling, 10cm linje, GUL, nymerking (inkl. oppmåling)', unit: 'lm',    price: 26 },
    { id: 4208, cat: 'Maling',        name: 'Maling, symboler, HC/elbil/MC/sykkel',              unit: 'stk',      price: 578 },
    { id: 4209, cat: 'Maling',        name: 'Maling, Pil, Rett, opp til 1,6m',                   unit: 'stk',      price: 645 },
    { id: 4210, cat: 'Maling',        name: 'Maling, Pil, Sving, opp til 1,6m',                  unit: 'stk',      price: 760 },
    { id: 4211, cat: 'Maling',        name: 'Maling, 50cm, Gangfelt',                            unit: 'lm',       price: 185 },
    { id: 4212, cat: 'Maling',        name: 'Maling, Symbol, Vikelinje',                         unit: 'stk',      price: 135 },
    { id: 4213, cat: 'Maling',        name: 'Maling, Symbol, farget bakgrunn',                   unit: 'stk',      price: 1890 },
    { id: 4214, cat: 'Maling',        name: 'Maling, Nummer / Bokstaver (På gulv)',               unit: 'stk',      price: 155 },
    { id: 4215, cat: 'Maling',        name: 'Maling, Pr. kvm, Alle farger',                      unit: 'kvm',      price: 320 },
    { id: 4216, cat: 'Maling',        name: 'Maling, 10cm linje, HVIT, 4 siders plass, nymerking', unit: 'lm',     price: 27 },
    { id: 4217, cat: 'Maling',        name: 'Maling, 10cm linje, HVIT, 4 siders plass, nymerking', unit: 'lm',     price: 27 },
    { id: 4230, cat: 'Maling',        name: 'Maling, 10cm linje, Sverting linjer (male sort)',    unit: 'lm',       price: 23 },
    { id: 4291, cat: 'Maling',        name: 'Maling, Rigg, maskiner og utstyr',                  unit: 'oppmøte',  price: 2400 },
    { id: 4292, cat: 'Maling',        name: 'Maling, Rigg, tillegg for annen farge',             unit: 'oppmøte',  price: 700 },

    // --- Demarkering ---
    { id: 2501, cat: 'Demarkering',   name: 'Demarkering av termoplast, Fjerning 10cm linje',    unit: 'lm',       price: 170 },
    { id: 2502, cat: 'Demarkering',   name: 'Demarkering av termoplast, Fjerning symboler',      unit: 'stk',      price: 675 },
    { id: 2503, cat: 'Demarkering',   name: 'Demarkering av maling, Fjerning 10cm linje',        unit: 'lm',       price: 111 },
    { id: 2504, cat: 'Demarkering',   name: 'Demarkering av maling, Fjerning symboler',          unit: 'stk',      price: 611 },
    { id: 2591, cat: 'Demarkering',   name: 'Demarkering, Rigg, slipemaskin, inkl. fjerning',    unit: 'oppmøte',  price: 2300 },
    { id: 2592, cat: 'Demarkering',   name: 'Demarkering, Rigg, fresemaskin, inkl. fjerning',    unit: 'oppmøte',  price: 2300 },

    // --- Kaldplast ---
    { id: 4301, cat: 'Kaldplast',     name: 'Kaldplast, Pr. kvm, Alle farger',                   unit: 'kvm',      price: 780 },
    { id: 4391, cat: 'Kaldplast',     name: 'Kaldplast, Rigg, maskiner og utstyr',               unit: 'oppmøte',  price: 3900 },

    // --- Tillegg og kjøring ---
    { id: 8801, cat: 'Tillegg',       name: 'Kjøring per km, utenfor Oslo',                      unit: 'km',       price: 7 },
    { id: 8802, cat: 'Tillegg',       name: 'Kjøretid operatører, utenfor Oslo (2 pers)',         unit: 'time',     price: 640 },
    { id: 8804, cat: 'Tillegg',       name: 'Aimo, Minstepris på ett oppdrag innenbys',          unit: 'stk',      price: 1607 },
    { id: 8807, cat: 'Tillegg',       name: 'Tillegg for lite oppdrag under 3100 kr, Oslo',       unit: 'stk',      price: 1600 },
    { id: 8808, cat: 'Tillegg',       name: 'Tillegg for lite oppdrag under 3100 kr, utenfor Oslo', unit: 'stk',    price: 1700 },
    { id: 8809, cat: 'Tillegg',       name: 'Tørk, tørking før merking høst/vinter/vår',         unit: 'time',     price: 2200 },
    { id: 8811, cat: 'Tillegg',       name: 'Bompasseringer, Oslo',                              unit: 'oppmøte',  price: 74 },
    { id: 8893, cat: 'Tillegg',       name: 'Teiping av p-plasser',                              unit: 'stk',      price: 990 },
];

// Apply annual price adjustment
let PRODUCTS = PRODUCTS_RAW.map(p => ({
    ...p,
    basePrice: p.price,  // Original 2025 price
    price: Math.round(p.price * ADJUSTMENT_FACTOR),  // Adjusted price
}));

// ===== State =====
let selectedProducts = {};  // { id: { qty: number } }
let discountPercent = 0;
let activeCategory = 'Alle';  // Current category filter

// ===== Frequency Tracking (localStorage) =====
const FREQ_STORAGE_KEY = 'tilbud_product_freq';
const FREQ_TOP_COUNT = 8;

function loadFrequencies() {
    try {
        return JSON.parse(localStorage.getItem(FREQ_STORAGE_KEY)) || {};
    } catch { return {}; }
}

function saveFrequencies(freq) {
    try {
        localStorage.setItem(FREQ_STORAGE_KEY, JSON.stringify(freq));
    } catch { /* ignore */ }
}

function bumpFrequency(id) {
    const freq = loadFrequencies();
    freq[id] = (freq[id] || 0) + 1;
    saveFrequencies(freq);
}

function getTopProducts(category) {
    const freq = loadFrequencies();
    return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => PRODUCTS.find(p => p.id === parseInt(id)))
        .filter(p => {
            if (!p) return false;
            if (category === 'Alle') return true;
            return p.cat === category;
        })
        .slice(0, FREQ_TOP_COUNT);
}

// ===== DOM =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ===== Drawing data (from tegneprogram) =====
let drawingData = null;
let drawingMappings = {};  // { itemKey: productId }
let quoteSourceEmail = null;  // Tracks the email a quote was created from

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    // Show price year info
    const yearInfo = $('#price-year-info');
    if (yearInfo) {
        if (yearsDiff > 0) {
            yearInfo.textContent = `Priser justert fra ${PRICE_BASE_YEAR} til ${CURRENT_YEAR} (+${ANNUAL_ADJUSTMENT_PCT}% per år, totalt +${((ADJUSTMENT_FACTOR - 1) * 100).toFixed(1)}%)`;
        } else {
            yearInfo.textContent = `Priser fra ${PRICE_BASE_YEAR}`;
        }
    }

    // Load drawing data if coming from tegneprogram
    loadDrawingData();

    // Setup category selection
    setupCategorySelector();

    // Setup email panel
    setupEmailPanel();

    renderProducts();
    setupDiscountInput();
    setupActions();
    updateSummary();
});

// ===== Category Selection =====
function setupCategorySelector() {
    // Dropdown
    const select = $('#category-select');
    if (select) {
        select.addEventListener('change', (e) => {
            activeCategory = e.target.value;
            syncCategoryUI();
            renderProducts();
        });
    }

    // Pills
    const pills = $$('.cat-pill');
    pills.forEach(pill => {
        pill.addEventListener('click', () => {
            activeCategory = pill.dataset.cat;
            syncCategoryUI();
            renderProducts();
        });
    });
}

function syncCategoryUI() {
    // Sync dropdown
    const select = $('#category-select');
    if (select) select.value = activeCategory;

    // Sync pills
    $$('.cat-pill').forEach(pill => {
        pill.classList.toggle('active', pill.dataset.cat === activeCategory);
    });
}

// ===== Drawing Integration =====

// Default mapping suggestions: drawing key -> best matching product ID
const DEFAULT_MAPPINGS = {
    'parkeringsplass':    3203,  // Termoplast per plass
    'fotgjengerfelt':     3207,  // Termoplast gangfelt
    'pil':                3204,  // Termoplast pil rett
    'svingpil_venstre':   3205,  // Termoplast pil sving
    'svingpil_hoyre':     3205,  // Termoplast pil sving
    'linje_enkel':        3202,  // Termoplast 10cm linje
    'linje_dobbel':       3212,  // Termoplast 20cm linje
    'symbol_hc':          3206,  // Termoplast symbol HC
    'symbol_mc':          3206,
    'symbol_el-bil':      3206,
    'symbol_elbil':       3206,
    'symbol_sykkel':      3206,
};

function loadDrawingData() {
    try {
        const raw = sessionStorage.getItem('tilbud_drawing');
        if (!raw) return;

        drawingData = JSON.parse(raw);

        // Check data is recent (within last 5 minutes)
        if (Date.now() - drawingData.timestamp > 5 * 60 * 1000) {
            drawingData = null;
            sessionStorage.removeItem('tilbud_drawing');
            return;
        }

        // Show drawing section
        const section = $('#drawing-section');
        if (section) section.classList.remove('hidden');

        // Set image
        const img = $('#drawing-image');
        if (img && drawingData.image) {
            img.src = drawingData.image;
        }

        // Render element mapping list
        renderDrawingItems();

        // Auto-select mapped products
        applyDrawingMappings();

        // Clean up sessionStorage (keep for back button)
    } catch (e) {
        console.warn('Could not load drawing data:', e);
    }
}

function renderDrawingItems() {
    const container = $('#drawing-items-list');
    if (!container || !drawingData?.lineItems) return;

    container.innerHTML = '';

    for (const item of drawingData.lineItems) {
        const div = document.createElement('div');
        div.className = 'drawing-item';

        // Default mapping
        const defaultProductId = DEFAULT_MAPPINGS[item.key] || '';
        drawingMappings[item.key] = defaultProductId;

        // Build product options grouped by category
        let optionsHtml = '<option value="">— Velg produkt —</option>';
        let currentCat = '';
        for (const p of PRODUCTS) {
            if (p.cat !== currentCat) {
                if (currentCat) optionsHtml += '</optgroup>';
                currentCat = p.cat;
                optionsHtml += `<optgroup label="${currentCat}">`;
            }
            const selected = p.id === defaultProductId ? 'selected' : '';
            optionsHtml += `<option value="${p.id}" ${selected}>${p.name} (${formatKr(p.price)}/${p.unit})</option>`;
        }
        if (currentCat) optionsHtml += '</optgroup>';

        div.innerHTML = `
            <span class="drawing-item-label">${item.label}</span>
            <span class="drawing-item-count">${item.count} stk</span>
            <select data-key="${item.key}" data-count="${item.count}">${optionsHtml}</select>
        `;

        // Handle dropdown change
        div.querySelector('select').addEventListener('change', (e) => {
            const productId = parseInt(e.target.value) || null;
            const key = e.target.dataset.key;
            const count = parseInt(e.target.dataset.count);
            drawingMappings[key] = productId;
            applyDrawingMappings();
        });

        container.appendChild(div);
    }
}

function applyDrawingMappings() {
    if (!drawingData?.lineItems) return;

    // Clear only drawing-sourced selections, keep manual selections
    // First pass: remove old drawing-based selections
    for (const item of drawingData.lineItems) {
        const oldId = item._prevMappedId;
        if (oldId && !item._manuallyAdded) {
            delete selectedProducts[oldId];
        }
    }

    // Second pass: add new mapping selections
    for (const item of drawingData.lineItems) {
        const productId = drawingMappings[item.key];
        if (productId) {
            selectedProducts[productId] = { qty: item.count };
            bumpFrequency(productId);
            item._prevMappedId = productId;
        } else {
            item._prevMappedId = null;
        }
    }

    renderProducts();
    updateSummary();
}

// ===== Render Products =====
function renderProducts() {
    const container = $('#product-list');
    container.innerHTML = '';

    // Filter products by active category
    const filteredProducts = activeCategory === 'Alle'
        ? PRODUCTS
        : PRODUCTS.filter(p => p.cat === activeCategory);

    // --- Mest brukte section (filtered by category) ---
    const topProducts = getTopProducts(activeCategory);
    const topIds = new Set();
    if (topProducts.length > 0) {
        const topCat = document.createElement('div');
        topCat.className = 'category-header category-header-top';
        topCat.textContent = activeCategory === 'Alle'
            ? '⭐ Mest brukte'
            : `⭐ Mest brukte – ${activeCategory}`;
        container.appendChild(topCat);

        for (const p of topProducts) {
            topIds.add(p.id);
            container.appendChild(createProductRow(p));
        }
    }

    // --- Regular categorized list ---
    let currentCategory = '';

    for (const p of filteredProducts) {
        // Category header (only show when "Alle" or when switching categories)
        if (p.cat !== currentCategory) {
            currentCategory = p.cat;
            const cat = document.createElement('div');
            cat.className = 'category-header';
            cat.textContent = currentCategory;
            container.appendChild(cat);
        }

        // Show all products in normal list (even if in top), but dim duplicates
        const row = createProductRow(p);
        if (topIds.has(p.id)) {
            row.classList.add('in-top-list');
        }
        container.appendChild(row);
    }

    // Show empty state if filtered and no products
    if (filteredProducts.length === 0 && activeCategory !== 'Alle') {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = `<p>Ingen produkter i kategorien "${activeCategory}"</p>`;
        container.appendChild(empty);
    }
}

function createProductRow(p) {
    const row = document.createElement('div');
    row.className = 'product-row';
    row.dataset.id = p.id;

    const isSelected = !!selectedProducts[p.id];
    if (isSelected) row.classList.add('selected');

    const qty = isSelected ? selectedProducts[p.id].qty : 1;
    const customName = (isSelected && selectedProducts[p.id].customName) || p.name;
    const unitPrice = p.price;
    const discPrice = Math.round(unitPrice * (1 - discountPercent / 100));
    const totalPrice = discPrice * qty;

    row.innerHTML = `
        <button class="product-toggle" title="Velg produkt">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        </button>
        <div class="product-info">
            <input type="text" class="product-name-input" value="${customName.replace(/"/g, '&quot;')}" data-id="${p.id}" data-default="${p.name.replace(/"/g, '&quot;')}" title="Klikk for å endre varetekst">
            <span class="product-unit">${p.unit} · Varenr. ${p.id}</span>
        </div>
        <div class="qty-controls">
            <button class="qty-btn qty-minus" data-id="${p.id}">−</button>
            <input type="number" class="qty-input" value="${qty}" min="0" max="9999" data-id="${p.id}">
            <button class="qty-btn qty-plus" data-id="${p.id}">+</button>
        </div>
        <span class="product-price">${formatKr(unitPrice)}</span>
        <span class="product-discount-price">${discountPercent > 0 ? formatKr(discPrice) : '—'}</span>
        <span class="product-total">${isSelected ? formatKr(totalPrice) : '—'}</span>
    `;

    // Toggle on row click (but not on qty controls or name input)
    row.addEventListener('click', (e) => {
        if (e.target.closest('.qty-controls')) return;
        if (e.target.closest('.product-name-input')) return;
        toggleProduct(p.id);
    });

    // Product name editing – save custom name without re-rendering
    const nameInput = row.querySelector('.product-name-input');
    nameInput.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    nameInput.addEventListener('change', (e) => {
        e.stopPropagation();
        const newName = e.target.value.trim();
        if (selectedProducts[p.id]) {
            selectedProducts[p.id].customName = newName || p.name;
        }
    });
    nameInput.addEventListener('blur', (e) => {
        const newName = e.target.value.trim();
        if (!newName) {
            e.target.value = p.name;  // Reset to default if empty
        }
        if (selectedProducts[p.id]) {
            selectedProducts[p.id].customName = newName || p.name;
        }
    });

    // Qty controls
    row.querySelector('.qty-minus').addEventListener('click', (e) => {
        e.stopPropagation();
        changeQty(p.id, -1);
    });
    row.querySelector('.qty-plus').addEventListener('click', (e) => {
        e.stopPropagation();
        changeQty(p.id, 1);
    });
    row.querySelector('.qty-input').addEventListener('change', (e) => {
        e.stopPropagation();
        const val = parseInt(e.target.value) || 0;
        setQty(p.id, val);
    });
    row.querySelector('.qty-input').addEventListener('click', (e) => {
        e.stopPropagation();
    });

    return row;
}

function toggleProduct(id) {
    if (selectedProducts[id]) {
        delete selectedProducts[id];
    } else {
        selectedProducts[id] = { qty: 1 };
        bumpFrequency(id);
    }
    renderProducts();
    updateSummary();
}

function changeQty(id, delta) {
    if (!selectedProducts[id]) {
        selectedProducts[id] = { qty: 1 };
    }
    const newQty = selectedProducts[id].qty + delta;
    if (newQty <= 0) {
        delete selectedProducts[id];
    } else {
        selectedProducts[id].qty = newQty;
    }
    renderProducts();
    updateSummary();
}

function setQty(id, qty) {
    if (qty <= 0) {
        delete selectedProducts[id];
    } else {
        if (!selectedProducts[id]) {
            selectedProducts[id] = { qty: 1 };
        }
        selectedProducts[id].qty = qty;
    }
    renderProducts();
    updateSummary();
}

// ===== Discount =====
function setupDiscountInput() {
    const input = $('#discount-input');
    if (!input) return;

    input.addEventListener('input', () => {
        let val = parseFloat(input.value) || 0;
        if (val < 0) val = 0;
        if (val > 100) val = 100;
        discountPercent = val;
        renderProducts();
        updateSummary();
    });
}

// ===== Summary =====
function updateSummary() {
    const selected = Object.keys(selectedProducts).length;
    let totalBefore = 0;
    let totalAfter = 0;

    for (const [idStr, data] of Object.entries(selectedProducts)) {
        const product = PRODUCTS.find(p => p.id === parseInt(idStr));
        if (!product) continue;
        const lineTotal = product.price * data.qty;
        totalBefore += lineTotal;
        totalAfter += Math.round(product.price * (1 - discountPercent / 100)) * data.qty;
    }

    const mva = totalAfter * 0.25;

    // Stats cards
    const countEl = $('#stat-count');
    const beforeEl = $('#stat-before');

    if (countEl) countEl.textContent = selected;
    if (beforeEl) beforeEl.textContent = formatKr(totalBefore);

    // Discount display
    const discountValEl = $('#stat-discount-val');
    if (discountValEl) {
        discountValEl.textContent = discountPercent > 0 ? `−${formatKr(totalBefore - totalAfter)}` : '—';
    }

    // Footer summary
    const footerBefore = $('#footer-before');
    const footerDiscount = $('#footer-discount');
    const footerTotal = $('#footer-total');
    const footerMva = $('#footer-mva');

    if (footerBefore) footerBefore.textContent = formatKr(totalBefore);
    if (footerDiscount) {
        if (discountPercent > 0) {
            footerDiscount.textContent = `−${formatKr(totalBefore - totalAfter)}`;
            footerDiscount.parentElement.style.display = '';
        } else {
            footerDiscount.parentElement.style.display = 'none';
        }
    }
    if (footerTotal) footerTotal.textContent = formatKr(totalAfter);
    if (footerMva) footerMva.textContent = `inkl. MVA: ${formatKr(totalAfter + mva)}`;

    // Print summary update
    updatePrintSummary(totalBefore, totalAfter, mva);

    // Product count badge
    const badge = $('.product-count-badge');
    if (badge) badge.textContent = `${selected} valgt`;
}

function updatePrintSummary(totalBefore, totalAfter, mva) {
    const tbody = $('#print-summary-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    addPrintRow(tbody, 'Sum produkter eks. MVA', formatKr(totalBefore));

    if (discountPercent > 0) {
        addPrintRow(tbody, `Rabatt (${discountPercent}%)`, `−${formatKr(totalBefore - totalAfter)}`);
    }

    addPrintRow(tbody, 'Sum eks. MVA', formatKr(totalAfter), 'total-row');
    addPrintRow(tbody, 'MVA (25%)', formatKr(mva), 'mva-row');
    addPrintRow(tbody, 'Totalt inkl. MVA', formatKr(totalAfter + mva), 'total-row');
}

function addPrintRow(tbody, label, value, className) {
    const tr = document.createElement('tr');
    if (className) tr.className = className;
    tr.innerHTML = `<td>${label}</td><td>${value}</td>`;
    tbody.appendChild(tr);
}

// ===== Actions =====
function setupActions() {
    // Select all (only visible / filtered products)
    const selectAllBtn = $('#select-all-btn');
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            const filtered = activeCategory === 'Alle'
                ? PRODUCTS
                : PRODUCTS.filter(p => p.cat === activeCategory);
            for (const p of filtered) {
                if (!selectedProducts[p.id]) {
                    selectedProducts[p.id] = { qty: 1 };
                }
            }
            renderProducts();
            updateSummary();
        });
    }

    // Excel Price List upload
    const btnUploadPrices = $('#btn-upload-prices');
    const priceExcelInput = $('#price-excel-input');
    const priceSourceLabel = $('#price-source-label');

    if (btnUploadPrices && priceExcelInput) {
        btnUploadPrices.addEventListener('click', () => {
            priceExcelInput.click();
        });

        priceExcelInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const oldText = btnUploadPrices.innerHTML;
            btnUploadPrices.innerHTML = '⏳ Leser fil...';
            btnUploadPrices.disabled = true;

            try {
                if (typeof XLSX === 'undefined') {
                    await new Promise((resolve, reject) => {
                        const script = document.createElement('script');
                        script.src = 'https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js';
                        script.onload = resolve;
                        script.onerror = reject;
                        document.head.appendChild(script);
                    });
                }

                const loader = await import('./utils/priceLoader.js?v=2');
                const result = await loader.loadPriceList(file);
                const excelList = result.priceList;

                if (excelList.length === 0) {
                    alert('Fant ingen priser i Excel-filen.');
                    return;
                }

                // Ask if they want to bind this to a specific customer
                const custName = prompt("Hvilken kunde gjelder denne prislisten for?\n(La stå blank for å bare bruke den midlertidig her og nå)", "Park Nordic");
                
                if (custName && custName.trim() !== "") {
                    // Save to local storage for future automatic loads
                    const cleanName = custName.trim().toLowerCase();
                    localStorage.setItem('tilbud_custom_prices_' + cleanName, JSON.stringify(excelList));
                    alert(`✅ Prislisten ble lagret for kunden "${custName}". Prisene vil automatisk bli tatt i bruk hver gang dette kundenavnet blir fylt inn i "Kundenavn"-feltet.`);
                }

                // Apply it now
                let matchCount = applyCustomPricesToProducts(excelList);

                renderProducts();
                updateSummary();
                
                const showName = (custName && custName.trim() !== "") ? custName : file.name;
                if (priceSourceLabel) {
                    priceSourceLabel.textContent = `Priser: ${showName}`;
                    priceSourceLabel.style.color = '#059669';
                }

            } catch (err) {
                console.error(err);
                alert('Feil ved innlesing av Excel: ' + err.message);
            } finally {
                btnUploadPrices.innerHTML = oldText;
                btnUploadPrices.disabled = false;
                priceExcelInput.value = '';
            }
        });
    }

    // Customer Name Listener for Auto-pricing
    const customerNameInput = $('#customer-name');
    if (customerNameInput) {
        customerNameInput.addEventListener('input', (e) => {
            handleCustomerNameChange(e.target.value);
        });
        customerNameInput.addEventListener('change', (e) => {
            handleCustomerNameChange(e.target.value);
        });
    }

    // Deselect all
    const deselectAllBtn = $('#deselect-all-btn');
    if (deselectAllBtn) {
        deselectAllBtn.addEventListener('click', () => {
            selectedProducts = {};
            renderProducts();
            updateSummary();
        });
    }

    // Print
    const printBtn = $('#print-btn');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            preparePrintFields();
            window.print();
        });
    }

    // Send email button
    const sendBtn = $('#send-email-btn');
    if (sendBtn) {
        sendBtn.addEventListener('click', () => {
            handleSendEmail();
        });
    }

    // P-register search button
    const pRegisterBtn = $('#search-pregister-btn');
    if (pRegisterBtn) {
        pRegisterBtn.addEventListener('click', async () => {
            await handlePRegisterSearch();
        });
    }

    // Attachments input listener
    const attachmentsInput = $('#quote-attachments');
    if (attachmentsInput) {
        attachmentsInput.addEventListener('change', (e) => {
            const count = e.target.files.length;
            const countSpan = $('#quote-attachments-count');
            if (countSpan) {
                if (count === 0) {
                    countSpan.textContent = '(Ingen valgt)';
                    countSpan.style.color = '#64748b';
                } else if (count === 1) {
                    countSpan.textContent = `(1 fil valg: ${e.target.files[0].name})`;
                    countSpan.style.color = '#059669'; // Green success
                } else {
                    countSpan.textContent = `(${count} filer valgt)`;
                    countSpan.style.color = '#059669';
                }
            }
        });
    }
}

function applyCustomPricesToProducts(excelList) {
    let matchCount = 0;
    for (const p of PRODUCTS) {
        const pNameLower = p.name.toLowerCase();
        const match = excelList.find(x => {
            const xName = x.product.toLowerCase();
            if (xName.length < 3) return false;
            return xName === pNameLower || pNameLower.includes(xName) || xName.includes(pNameLower.replace('maling, ', '').replace('termoplast, ', ''));
        });
        
        if (match) {
            const newPrice = match.customerPrice > 0 ? match.customerPrice : 
                            (match.discountPrice > 0 ? match.discountPrice : match.basePrice);
            if (newPrice > 0) {
                p.price = newPrice;
                matchCount++;
            }
        }
    }
    return matchCount;
}

// ===== Hardcoded Customer Price Maps (from Unimicro "prisliste 2026.xltx") =====
// Kundepris +3.5% KPI for 2026. Tabs: "Aimo Park 2025", "Park Nordic", "Aimo utenbys"
const CUSTOMER_PRICES = {
    'aimo': {
        label: 'Aimo Park (innenbys)',
        prices: {
            4202: 13, 4203: 17, 4204: 106, 4205: 131, 4206: 14, 4207: 19,
            4208: 459, 4209: 630, 4210: 715, 4211: 149, 4213: 1956,
            3291: 5992, 3202: 43, 3204: 1018, 3205: 1096, 3206: 1451, 3207: 154,
            3303: 1491, 3304: 1630, 3306: 1342,
            2501: 121, 8804: 1663, 4216: 22, 4217: 255, 8811: 76
        }
    },
    'aimo park': {
        label: 'Aimo Park (innenbys)',
        prices: {
            4202: 13, 4203: 17, 4204: 106, 4205: 131, 4206: 14, 4207: 19,
            4208: 459, 4209: 630, 4210: 715, 4211: 149, 4213: 1956,
            3291: 5992, 3202: 43, 3204: 1018, 3205: 1096, 3206: 1451, 3207: 154,
            3303: 1491, 3304: 1630, 3306: 1342,
            2501: 121, 8804: 1663, 4216: 22, 4217: 255, 8811: 76
        }
    },
    'aimo utenbys': {
        label: 'Aimo Park (utenbys)',
        prices: {
            4202: 14, 4203: 19, 4204: 120, 4205: 150, 4206: 16, 4207: 22,
            4208: 491, 4209: 720, 4210: 851, 4211: 169, 4213: 2236,
            3291: 5706, 3202: 41, 3204: 970, 3205: 1044, 3206: 1382, 3207: 147,
            3391: 2182, 3303: 1705, 3304: 1863, 3306: 1534,
            2501: 115, 8803: 1998, 4216: 25
        }
    },
    'park nordic': {
        label: 'Park Nordic',
        prices: {
            4291: 2413, 4202: 18, 4203: 24, 4204: 126, 4205: 181,
            4208: 515, 4209: 630, 4210: 744,
            8802: 1055, 8807: 1663, 8811: 89, 8812: 90
        }
    }
};

function handleCustomerNameChange(name) {
    const cleanName = name.trim().toLowerCase();
    const priceSourceLabel = $('#price-source-label');

    // 1. Check hardcoded customer prices first
    const builtIn = CUSTOMER_PRICES[cleanName];
    if (builtIn) {
        for (const p of PRODUCTS) {
            if (builtIn.prices[p.id] !== undefined) {
                p.price = builtIn.prices[p.id];
            }
        }
        renderProducts();
        updateSummary();
        if (priceSourceLabel) {
            priceSourceLabel.textContent = `Priser: ${builtIn.label}`;
            priceSourceLabel.style.color = '#059669';
        }
        return;
    }

    // 2. Check localStorage for uploaded Excel prices
    const stored = localStorage.getItem('tilbud_custom_prices_' + cleanName);
    if (stored) {
        try {
            const excelList = JSON.parse(stored);
            applyCustomPricesToProducts(excelList);
            renderProducts();
            updateSummary();
            if (priceSourceLabel) {
                priceSourceLabel.textContent = `Priser: ${name.trim()}`;
                priceSourceLabel.style.color = '#059669';
            }
        } catch(e) {
            console.error('Kunne ikke laste lagrede kundepriser', e);
        }
        return;
    }

    // 3. Reset to standard prices
    let changed = false;
    for (const p of PRODUCTS) {
        const raw = PRODUCTS_RAW.find(r => r.id === p.id);
        if (raw) {
            const stdPrice = Math.round(raw.price * ADJUSTMENT_FACTOR);
            if (p.price !== stdPrice) {
                p.price = stdPrice;
                changed = true;
            }
        }
    }
    if (changed) {
        renderProducts();
        updateSummary();
        if (priceSourceLabel) {
            priceSourceLabel.textContent = 'Standard Priser';
            priceSourceLabel.style.color = '#475569';
        }
    }
}

async function handlePRegisterSearch() {
    const projInput = $('#customer-project')?.value?.trim() || '';
    const addrInput = $('#customer-address')?.value?.trim() || '';
    
    // Combine them, and if empty, warn user.
    const query = `${addrInput} ${projInput}`.trim();

    if (!query) {
        alert('Skriv inn en adresse eller et prosjektnavn i adresse(r) for å søke i P-registeret.');
        return;
    }

    try {
        const btn = $('#search-pregister-btn');
        const oldText = btn.innerHTML;
        btn.innerHTML = '⏳';
        
        const vegvesen = await import('./api/vegvesen.js?v=test13');
        const hits = await vegvesen.searchByAddress(query);

        btn.innerHTML = oldText;

        if (hits.length === 0) {
            alert('Fant ingen treff i Parkeringsregisteret på denne adressen.');
            return;
        }

        let areaInfo = null;
        if (hits.length === 1) {
            areaInfo = vegvesen.extractAreaInfo(hits[0]);
        } else {
            // Multiple hits prompt
            let promptText = `Fant ${hits.length} treff. Velg nummeret for anlegget du vil bruke:\n\n`;
            hits.slice(0, 9).forEach((h, i) => {
                const v = h.aktivVersjon || h;
                const navn = v.navn || 'Ukjent';
                promptText += `${i + 1}: ${navn} (${v.adresse || 'ingen adr'})\n`;
            });
            const valgStr = prompt(promptText + '\nSkriv inn nummeret (1-' + Math.min(hits.length, 9) + '):');
            if (!valgStr) return;
            const valgNum = parseInt(valgStr) - 1;
            if (valgNum >= 0 && valgNum < hits.length) {
                areaInfo = vegvesen.extractAreaInfo(hits[valgNum]);
            }
        }

        if (areaInfo) {
            applyParkingAreaToQuote(areaInfo);
        }

    } catch (e) {
        console.error(e);
        alert('Feil ved P-register søk: ' + e.message);
        $('#search-pregister-btn').innerHTML = '🚗';
    }
}

function applyParkingAreaToQuote(areaInfo) {
    if (!areaInfo) return;
    
    let avgiftsbelagte = 0;
    let avgiftsfrie = 0;
    let hc = 0;
    
    if (typeof areaInfo.antallAvgiftsbelagte === 'number') avgiftsbelagte = areaInfo.antallAvgiftsbelagte;
    if (typeof areaInfo.antallAvgiftsfrie === 'number') avgiftsfrie = areaInfo.antallAvgiftsfrie;
    if (typeof areaInfo.antallForflytningshemmede === 'number') hc = areaInfo.antallForflytningshemmede;

    const totP = avgiftsbelagte + avgiftsfrie;
    let changesMade = false;

    // By default Maling, unless swapped to Termoplast
    const mapString = localStorage.getItem('ai_product_mapping');
    const isTermoplast = (mapString && mapString.includes('TERMOPLAST'));
    
    // IDs matching the selected material
    const pPlassID = isTermoplast ? 3203 : 3404; // 10cm linje, per plass
    const hcSymbolID = isTermoplast ? 3206 : 3406; // Symbol, HC

    if (totP > 0) {
        selectedProducts[pPlassID] = { qty: (selectedProducts[pPlassID]?.qty || 0) + totP };
        changesMade = true;
    }
    
    if (hc > 0) {
        selectedProducts[hcSymbolID] = { qty: (selectedProducts[hcSymbolID]?.qty || 0) + hc };
        changesMade = true;
    }

    if (changesMade) {
        renderProducts();
        updateSummary();
        alert(`La til ${totP} P-plasser og ${hc} HC-plasser hentet automatisk fra parkeringsregisteret: "${areaInfo.navn}"`);
        
        const projInput = $('#customer-project');
        if (projInput && (!projInput.value || projInput.value.length < 5)) {
            projInput.value = areaInfo.navn;
        }
    } else {
        alert(`Fant registeret "${areaInfo.navn}", men det stod foreløpig 0 P-plasser og 0 HC-plasser i Vegvesenets database.`);
    }
}

// ===== Email Panel =====
let emailAccounts = [];
let currentEmailAccount = '';
let cachedEmails = [];  // Cache last fetched emails for re-rendering

// Dismissed/handled emails stored in localStorage
const DISMISSED_STORAGE_KEY = 'tilbud_dismissed_emails';
// Now stores objects: { key: { status: 'not_job'|'priced', reason?: string, date: iso } }

function loadDismissedMap() {
    try {
        const raw = localStorage.getItem(DISMISSED_STORAGE_KEY);
        if (!raw) return {};
        // Migrate from old array format
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            const map = {};
            for (const id of parsed) map[id] = { status: 'dismissed', date: new Date().toISOString() };
            localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(map));
            return map;
        }
        return parsed;
    } catch { return {}; }
}

function saveDismissedMap(map) {
    try {
        localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(map));
    } catch { /* ignore */ }
}

function markEmail(emailId, accountKey, status, reason) {
    const key = `${accountKey}:${emailId}`;
    const map = loadDismissedMap();
    map[key] = { status, reason: reason || '', date: new Date().toISOString() };
    saveDismissedMap(map);
    // Re-render
    renderEmailList(cachedEmails);
    updateEmailBadge(cachedEmails.filter(m => !isEmailHandled(m)).length);
}

function isEmailHandled(mail) {
    const map = loadDismissedMap();
    const accKey = mail._accountKey || currentEmailAccount;
    const key = `${accKey}:${mail.id}`;
    return !!map[key];
}

function getEmailStatus(mail) {
    const map = loadDismissedMap();
    const accKey = mail._accountKey || currentEmailAccount;
    const key = `${accKey}:${mail.id}`;
    return map[key] || null;
}

function filterDismissed(emails, accountKey) {
    // For multi-account, emails already have _accountKey set
    const map = loadDismissedMap();
    return emails.filter(m => {
        const accKey = m._accountKey || accountKey;
        const key = `${accKey}:${m.id}`;
        return !map[key];
    });
}

function setupEmailPanel() {
    const btn = $('#email-btn');
    const overlay = $('#email-overlay');
    const closeBtn = $('#email-close-btn');
    const refreshBtn = $('#email-refresh-btn');

    if (!btn || !overlay) return;

    // Open panel
    btn.addEventListener('click', () => {
        overlay.classList.add('open');
        if (emailAccounts.length === 0) {
            fetchEmailAccounts();
        }
    });

    // Close panel
    closeBtn?.addEventListener('click', closeEmailPanel);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeEmailPanel();
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('open')) {
            closeEmailPanel();
        }
    });

    // Refresh – fetch from all checked accounts
    refreshBtn?.addEventListener('click', () => {
        fetchFromCheckedAccounts();
    });
}

function closeEmailPanel() {
    $('#email-overlay')?.classList.remove('open');
}

async function fetchEmailAccounts() {
    try {
        const resp = await fetch('/mail/accounts');
        const data = await resp.json();

        if (data.error) {
            showEmailError(data.error);
            return;
        }

        emailAccounts = data;
        const container = $('#email-account-checkboxes');
        if (!container) return;

        container.innerHTML = '';
        for (const acc of emailAccounts) {
            const label = document.createElement('label');
            label.style.cssText = 'display:flex; align-items:center; gap:4px; font-size:13px; cursor:pointer; padding:4px 8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:6px;';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = acc.key;
            cb.checked = true; // All checked by default
            cb.style.cssText = 'accent-color:#6366f1; cursor:pointer;';
            cb.addEventListener('change', () => {
                fetchFromCheckedAccounts();
            });
            label.appendChild(cb);
            label.appendChild(document.createTextNode(acc.email));
            container.appendChild(label);
        }

        // Auto-fetch all accounts
        if (emailAccounts.length > 0) {
            fetchFromCheckedAccounts();
        }
    } catch (e) {
        showEmailError('Kunne ikke koble til serveren. Kjører du server.py?');
    }
}

function getCheckedAccounts() {
    const container = $('#email-account-checkboxes');
    if (!container) return [];
    return [...container.querySelectorAll('input[type="checkbox"]:checked')].map(cb => cb.value);
}

async function fetchFromCheckedAccounts() {
    const accounts = getCheckedAccounts();
    if (accounts.length === 0) {
        cachedEmails = [];
        renderEmailList([]);
        updateEmailBadge(0);
        return;
    }

    const loading = $('#email-loading');
    const list = $('#email-list');
    const empty = $('#email-empty');
    const error = $('#email-error');

    if (loading) loading.style.display = '';
    if (list) list.innerHTML = '';
    if (empty) empty.style.display = 'none';
    if (error) error.style.display = 'none';

    // Check if any accounts need passwords
    const needsPwd = [];
    for (const accKey of accounts) {
        if (!sessionStorage.getItem(`mail_pwd_${accKey}`)) {
            needsPwd.push(accKey);
        }
    }

    if (needsPwd.length > 0) {
        // Show password input for the first account that needs one
        const accKey = needsPwd[0];
        if (loading) loading.style.display = 'none';
        if (list) {
            list.innerHTML = `
                <div style="text-align: center; padding: 30px 20px; background: #fffcfc; border: 1px solid #ffd6d6; border-radius: 8px; margin-top: 10px;">
                    <p style="margin-bottom: 15px; font-weight: 500; color:var(--text-color);">Passord kreves for <b>${accKey}</b></p>
                    <input type="password" id="temp-pwd-input" placeholder="Passord for e-post..." style="padding: 10px; width: 80%; border: 1px solid #ddd; border-radius: 5px; margin-bottom: 15px;">
                    <br>
                    <button class="primary-btn" onclick="
                        const pwd = document.getElementById('temp-pwd-input').value;
                        if(pwd) {
                            // Save for all accounts (same password)
                            ${accounts.map(a => `sessionStorage.setItem('mail_pwd_${a}', pwd);`).join('\n                            ')}
                            sessionStorage.setItem('mail_pwd_post', pwd);
                            fetchFromCheckedAccounts();
                        }
                    ">Logg inn for denne økten</button>
                </div>
            `;
        }
        return;
    }

    try {
        // Fetch from all checked accounts in parallel
        const results = await Promise.allSettled(
            accounts.map(accKey => fetchSingleAccount(accKey))
        );

        if (loading) loading.style.display = 'none';

        // Merge all emails, tag each with its source account
        let allEmails = [];
        for (let i = 0; i < results.length; i++) {
            if (results[i].status === 'fulfilled' && Array.isArray(results[i].value)) {
                const accKey = accounts[i];
                for (const m of results[i].value) {
                    m._accountKey = accKey;
                    allEmails.push(m);
                }
            }
        }

        // Sort by date (newest first)
        allEmails.sort((a, b) => {
            const da = new Date(a.date || 0);
            const db = new Date(b.date || 0);
            return db - da;
        });

        // Deduplicate by subject+from (same email might arrive on both accounts)
        const seen = new Set();
        allEmails = allEmails.filter(m => {
            const key = `${m.from_email}:${m.subject}:${m.date?.substring(0,10)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        cachedEmails = allEmails;
        currentEmailAccount = accounts.join(',');
        const unhandledCount = allEmails.filter(m => !isEmailHandled(m)).length;
        updateEmailBadge(unhandledCount);

        if (allEmails.length === 0) {
            if (empty) empty.style.display = '';
            return;
        }

        renderEmailList(allEmails);
    } catch (e) {
        if (loading) loading.style.display = 'none';
        showEmailError('Kunne ikke hente e-poster. Sjekk at server.py kjører.');
    }
}

async function fetchSingleAccount(accountKey) {
    const reqHeaders = {};
    const storedPwd = sessionStorage.getItem(`mail_pwd_${accountKey}`);
    if (storedPwd) {
        reqHeaders['X-Mail-Password'] = storedPwd;
    }
    const resp = await fetch(`/mail/flagged?account=${encodeURIComponent(accountKey)}`, {
        headers: reqHeaders
    });
    if (resp.status === 401) {
        throw new Error('auth');
    }
    const data = await resp.json();
    if (resp.status !== 200 || data.error) {
        throw new Error(data.error || 'Feil');
    }
    return data;
}

function renderEmailList(emails) {
    const container = $('#email-list');
    const empty = $('#email-empty');
    if (!container) return;

    container.innerHTML = '';

    if (emails.length === 0) {
        if (empty) empty.style.display = '';
        return;
    }
    if (empty) empty.style.display = 'none';

    // Group emails by sender address
    const groups = new Map();
    for (const mail of emails) {
        const key = mail.from_email.toLowerCase();
        if (!groups.has(key)) {
            groups.set(key, {
                from_name: mail.from_name,
                from_email: mail.from_email,
                emails: [],
            });
        }
        groups.get(key).emails.push(mail);
    }

    // Render groups sorted by most recent email first
    const sortedGroups = [...groups.values()].sort((a, b) => {
        const aDate = a.emails[0]?.date || '';
        const bDate = b.emails[0]?.date || '';
        return bDate.localeCompare(aDate);
    });

    for (const group of sortedGroups) {
        const groupEl = document.createElement('div');
        groupEl.className = 'email-group';

        const emailCount = group.emails.length;
        const countBadge = emailCount > 1 ? `<span class="email-group-count">${emailCount} e-poster</span>` : '';

        groupEl.innerHTML = `
            <div class="email-group-header">
                <div class="email-group-sender">
                    <span class="email-group-name">${escapeHtml(group.from_name)}</span>
                    <span class="email-group-addr">${escapeHtml(group.from_email)}</span>
                </div>
                ${countBadge}
                ${emailCount > 1 ? '<button class="email-group-toggle" title="Vis/skjul">▼</button>' : ''}
            </div>
            <div class="email-group-body ${emailCount > 1 ? 'collapsed' : ''}"></div>
        `;

        // Toggle collapse for multi-email groups
        const toggleBtn = groupEl.querySelector('.email-group-toggle');
        const groupBody = groupEl.querySelector('.email-group-body');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                groupBody.classList.toggle('collapsed');
                toggleBtn.textContent = groupBody.classList.contains('collapsed') ? '▼' : '▲';
            });
        }

        // Render individual email cards in the group
        for (let i = 0; i < group.emails.length; i++) {
            const mail = group.emails[i];
            const card = createEmailCard(mail);
            groupBody.appendChild(card);
        }

        container.appendChild(groupEl);
    }
}

function createEmailCard(mail) {
    const card = document.createElement('div');
    card.className = 'email-card';
    if (mail.is_quote_request) card.classList.add('is-quote');

    const status = getEmailStatus(mail);
    if (status) {
        card.classList.add('email-handled');
    }

    // Format date nicely
    let dateStr = '';
    try {
        const d = new Date(mail.date);
        dateStr = d.toLocaleDateString('nb-NO', {
            day: 'numeric', month: 'short', year: 'numeric'
        }) + ' kl. ' + d.toLocaleTimeString('nb-NO', {
            hour: '2-digit', minute: '2-digit'
        });
    } catch { dateStr = mail.date; }

    // Truncate body preview
    const preview = (mail.body_preview || '').substring(0, 200);

    // Status badge
    let statusBadge = '';
    if (status) {
        if (status.status === 'priced') {
            statusBadge = '<span style="background:#059669; color:#fff; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600;">✅ Priset</span>';
        } else if (status.status === 'not_job') {
            const reasonText = status.reason ? ` – ${escapeHtml(status.reason)}` : '';
            statusBadge = `<span style="background:#ef4444; color:#fff; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600;">❌ Ikke oppdrag${reasonText}</span>`;
        } else {
            statusBadge = '<span style="background:#94a3b8; color:#fff; padding:2px 8px; border-radius:4px; font-size:11px;">Fjernet</span>';
        }
    }

    card.innerHTML = `
        <div class="email-card-header">
            <div class="email-card-subject-line">${escapeHtml(mail.subject)}</div>
            <div class="email-card-header-right">
                <span class="email-card-date">${dateStr}</span>
                ${statusBadge}
            </div>
        </div>
        <div class="email-card-preview">${escapeHtml(preview)}</div>
        ${mail.images && mail.images.length > 0 ? `
            <div class="email-card-thumbs">
                ${mail.images.map(img => `<img src="${img.data_url}" alt="${escapeHtml(img.filename)}" class="email-thumb">`).join('')}
                <span class="email-thumb-count">📎 ${mail.images.length} bilde${mail.images.length > 1 ? 'r' : ''}</span>
            </div>
        ` : ''}
        <div class="email-card-actions">
            ${!status ? `
                <button class="email-not-job-btn" style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); color:#ef4444; padding:6px 12px; border-radius:6px; font-size:12px; cursor:pointer; font-weight:500;">❌ Ikke oppdrag</button>
                <button class="email-quote-btn">📝 Lag tilbud</button>
                <button class="email-priced-btn" style="background:rgba(5,150,105,0.1); border:1px solid rgba(5,150,105,0.3); color:#059669; padding:6px 12px; border-radius:6px; font-size:12px; cursor:pointer; font-weight:500;">✅ Priset</button>
            ` : `
                <button class="email-undo-btn" style="background:rgba(148,163,184,0.1); border:1px solid rgba(148,163,184,0.3); color:#64748b; padding:6px 12px; border-radius:6px; font-size:12px; cursor:pointer;">↩ Angre</button>
                ${status.status !== 'priced' ? '<button class="email-quote-btn">📝 Lag tilbud</button>' : ''}
            `}
        </div>
    `;

    // "Lag tilbud" button
    const quoteBtn = card.querySelector('.email-quote-btn');
    if (quoteBtn) {
        quoteBtn.addEventListener('click', () => {
            createQuoteFromEmail(mail);
        });
    }

    // "Ikke oppdrag" button
    const notJobBtn = card.querySelector('.email-not-job-btn');
    if (notJobBtn) {
        notJobBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const reason = prompt('Hvorfor er dette ikke et oppdrag? (valgfritt)');
            if (reason === null) return; // Cancelled
            const accKey = mail._accountKey || currentEmailAccount;
            card.style.transition = 'all 0.3s ease';
            card.style.opacity = '0.5';
            setTimeout(() => {
                markEmail(mail.id, accKey, 'not_job', reason);
            }, 200);
        });
    }

    // "Priset" button
    const pricedBtn = card.querySelector('.email-priced-btn');
    if (pricedBtn) {
        pricedBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const accKey = mail._accountKey || currentEmailAccount;
            card.style.transition = 'all 0.3s ease';
            card.style.opacity = '0.5';
            setTimeout(() => {
                markEmail(mail.id, accKey, 'priced');
            }, 200);
        });
    }

    // "Angre" button
    const undoBtn = card.querySelector('.email-undo-btn');
    if (undoBtn) {
        undoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const accKey = mail._accountKey || currentEmailAccount;
            const map = loadDismissedMap();
            delete map[`${accKey}:${mail.id}`];
            saveDismissedMap(map);
            renderEmailList(cachedEmails);
            updateEmailBadge(cachedEmails.filter(m => !isEmailHandled(m)).length);
        });
    }

    return card;
}

function createQuoteFromEmail(mail) {
    // Fill customer info from email
    const nameInput = $('#customer-name');
    const projectInput = $('#customer-project');

    if (nameInput) {
        nameInput.value = mail.from_name || mail.from_email || '';
    }
    if (projectInput) {
        // Use subject as project name
        projectInput.value = mail.subject || '';
    }

    // Show email disclaimer
    const disclaimer = $('#email-disclaimer-section');
    if (disclaimer) disclaimer.classList.remove('hidden');

    // Store source email for sending
    quoteSourceEmail = mail;

    // Show "Send tilbud" button
    const sendBtn = $('#send-email-btn');
    if (sendBtn) sendBtn.classList.remove('hidden');

    // Setup original email viewer
    const toggleBtn = $('#toggle-email-btn');
    const contentBox = $('#email-original-content');
    const textBox = $('#email-original-text');
    if (toggleBtn && contentBox && textBox) {
        // Reset state
        contentBox.classList.add('hidden');
        toggleBtn.textContent = '👀 Vis opprinnelig forespørsel';
        
        // Populate text (use full_body if present, else body_preview)
        textBox.textContent = mail.full_body || mail.body_preview || 'Ingen tekst tilgjengelig.';

        // Ensure we don't attach multiple listeners if called multiple times
        const newToggleBtn = toggleBtn.cloneNode(true);
        toggleBtn.parentNode.replaceChild(newToggleBtn, toggleBtn);
        
        newToggleBtn.addEventListener('click', () => {
            contentBox.classList.toggle('hidden');
            if (contentBox.classList.contains('hidden')) {
                newToggleBtn.textContent = '👀 Vis opprinnelig forespørsel';
            } else {
                newToggleBtn.textContent = '🙈 Skjul forespørsel';
            }
        });
    }

    // Populate email images gallery
    const imagesSection = $('#email-images-section');
    const imagesGrid = $('#email-images-grid');
    const clearBtn = $('#email-images-clear');

    if (imagesSection && imagesGrid) {
        imagesGrid.innerHTML = '';
        if (mail.images && mail.images.length > 0) {
            imagesSection.classList.remove('hidden');
            for (const img of mail.images) {
                const wrapper = document.createElement('div');
                wrapper.className = 'email-image-item';
                wrapper.innerHTML = `
                    <img src="${img.data_url}" alt="${escapeHtml(img.filename)}">
                    <span class="email-image-name">${escapeHtml(img.filename)}</span>
                `;
                imagesGrid.appendChild(wrapper);
            }
        } else {
            imagesSection.classList.add('hidden');
        }
    }

    // Clear images button
    if (clearBtn) {
        clearBtn.onclick = () => {
            imagesSection?.classList.add('hidden');
            if (imagesGrid) imagesGrid.innerHTML = '';
        };
    }

    // Load and select products based on email text
    parseEmailTextToProducts(mail.full_body || mail.body_preview || '');

    // Close panel
    closeEmailPanel();

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Brief highlight effect on customer card
    const customerCard = $('.customer-card');
    if (customerCard) {
        customerCard.classList.add('highlight-pulse');
        setTimeout(() => customerCard.classList.remove('highlight-pulse'), 2000);
    }
}

function parseEmailTextToProducts(text) {
    if (!text) return;
    const lowerText = text.toLowerCase();
    let hasChanged = false;

    // 1. Guess Material
    let defaultMaterial = '';
    if (lowerText.includes('termoplast')) {
        defaultMaterial = 'termoplast';
    } else if (lowerText.includes('maling')) {
        defaultMaterial = 'maling';
    } else {
        // Fallback or prompt
        const choice = confirm("Finner ikke materialtype (Maling/Termoplast) i forespørselen.\n\nKlikk OK for Termoplast.\nKlikk Avbryt for Maling.");
        defaultMaterial = choice ? 'termoplast' : 'maling';
    }

    // 2. Extract quantities
    const plassRegex = /(\d+)\s*(?:p-plass|plass|parkering|stk(?!\s*hc|sykkel|symbol))/gi;
    let plassCount = 0;
    let match;
    while ((match = plassRegex.exec(text)) !== null) {
        plassCount += parseInt(match[1]);
    }

    const hcRegex = /(\d+)\s*(?:hc|handicap|rullestol|elbil)/gi;
    let hcCount = 0;
    while ((match = hcRegex.exec(text)) !== null) {
        hcCount += parseInt(match[1]);
    }

    const riggCount = 1;

    // 3. Extract Addresses (Heuristic)
    // Match common street formats: Capitalized word + Number (e.g. Storgata 1, Nydalsveien 22)
    const addressRegex = /\b[A-ZÆØÅ][a-zæøå]+\s+\d+[a-zA-Z]?\b/g;
    let foundAddresses = [];
    let matchAddr;
    while ((matchAddr = addressRegex.exec(text)) !== null) {
        if (!foundAddresses.includes(matchAddr[0])) {
            foundAddresses.push(matchAddr[0]);
        }
    }
    
    // Attempt to extract zip codes nearby
    // If we have just 1 address, put it in project address. If 2+, assume last is office (signature), first is project
    if (foundAddresses.length > 0) {
        const projInput = document.getElementById('customer-project');
        const addrInput = document.getElementById('customer-address');
        
        if (foundAddresses.length === 1) {
            if (projInput) projInput.value = foundAddresses[0];
        } else {
            if (projInput) projInput.value = foundAddresses[0];
            if (addrInput) addrInput.value = foundAddresses[foundAddresses.length - 1];
        }
    }

    // Use learning map if user has corrected these choices before
    const learningMap = JSON.parse(localStorage.getItem('ai_product_mapping') || '{}');

    function addProductByBestGuess(keywords, qty) {
        if (qty <= 0) return;
        
        let foundId = null;
        // Try to find matching product
        for (const p of PRODUCTS) {
            const pLower = p.name.toLowerCase();
            const allWordsMatch = keywords.every(kw => pLower.includes(kw));
            if (allWordsMatch) {
                foundId = p.id;
                break;
            }
        }

        if (foundId) {
            // Apply learned correction
            const actualId = learningMap[foundId] || foundId;
            if (!selectedProducts[actualId]) selectedProducts[actualId] = { qty: 0 };
            selectedProducts[actualId].qty += qty;
            hasChanged = true;
        }
    }

    // Add plasser
    if (defaultMaterial === 'maling') {
        addProductByBestGuess(['maling', 'per plass', 'nymerking'], plassCount);
        addProductByBestGuess(['maling', 'hc'], hcCount);
        addProductByBestGuess(['maling', 'rigg', 'maskiner'], riggCount);
    } else {
        addProductByBestGuess(['termoplast', 'per plass'], plassCount);
        addProductByBestGuess(['termoplast', 'symbol', 'hc'], hcCount);
        addProductByBestGuess(['termoplast', 'rigg', 'maskiner'], riggCount);
    }

    if (hasChanged) {
        renderProducts();
        updateSummary();
        alert(`🎉 AI Tolkning fullført:\n\nMateriale: ${defaultMaterial}\nPlasser funnet: ${plassCount}\nHC-symboler funnet: ${hcCount}\nRigg lagt til.`);
        
        // Show swap button and setup logic
        const swapBtn = document.getElementById('ai-swap-material-btn');
        if (swapBtn) {
            swapBtn.style.display = 'inline-block';
            
            // Remove old listeners
            const newSwapBtn = swapBtn.cloneNode(true);
            swapBtn.parentNode.replaceChild(newSwapBtn, swapBtn);
            
            newSwapBtn.addEventListener('click', () => {
                const targetMaterial = defaultMaterial === 'maling' ? 'termoplast' : 'maling';
                let swapCount = 0;
                
                // For each selected product, try to find inverse in target material
                for (const [id, data] of Object.entries(selectedProducts)) {
                    const idNum = parseInt(id);
                    const prod = PRODUCTS.find(p => p.id === idNum);
                    if (!prod) continue;
                    
                    const prodNameLower = prod.name.toLowerCase();
                    if (prodNameLower.includes(defaultMaterial)) {
                        // We need to swap this one
                        const searchWords = prodNameLower
                            .replace(defaultMaterial, '')
                            .replace('nymerking', '')
                            .replace('remerking', '')
                            .split(',')
                            .map(w => w.trim())
                            .filter(w => w.length > 2);
                            
                        // Find equivalent in target material
                        let bestMatch = null;
                        for (const p2 of PRODUCTS) {
                            const p2Lower = p2.name.toLowerCase();
                            if (p2Lower.includes(targetMaterial)) {
                                if (searchWords.every(w => p2Lower.includes(w))) {
                                    bestMatch = p2.id;
                                    break; // Found perfect match
                                }
                            }
                        }
                        
                        if (bestMatch) {
                            // Perform swap
                            selectedProducts[bestMatch] = { qty: data.qty };
                            delete selectedProducts[idNum];
                            
                            // LEARN: Save this mapping for next time
                            learningMap[idNum] = bestMatch;
                            swapCount++;
                        }
                    }
                }
                
                if (swapCount > 0) {
                    localStorage.setItem('ai_product_mapping', JSON.stringify(learningMap));
                    defaultMaterial = targetMaterial; // Update state
                    renderProducts();
                    updateSummary();
                    alert(`🔄 Byttet ${swapCount} produkter til ${targetMaterial}. (Systemet husker dette til neste gang).`);
                } else {
                    alert("Kunne ikke finne matchende produkter å bytte til.");
                }
            });
        }
    }
}

function showEmailError(msg) {
    const loading = $('#email-loading');
    const errorEl = $('#email-error');
    const errorMsg = $('#email-error-msg');

    if (loading) loading.style.display = 'none';
    if (errorEl) errorEl.style.display = '';
    if (errorMsg) errorMsg.textContent = msg;
}

function updateEmailBadge(count) {
    const badge = $('#email-badge');
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count;
        badge.style.display = '';
    } else {
        badge.style.display = 'none';
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

// ===== Print & PDF helpers =====

function preparePrintFields() {
    // Populate print date
    const dateEl = $('#print-date');
    if (dateEl) {
        dateEl.textContent = new Date().toLocaleDateString('nb-NO', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
    }

    // Populate print customer fields
    const printCustomerEl = $('#print-customer-name');
    if (printCustomerEl) {
        printCustomerEl.textContent = $('#customer-name')?.value || '';
    }
    const printCustomerAddressEl = $('#print-customer-address');
    if (printCustomerAddressEl) {
        printCustomerAddressEl.textContent = $('#customer-address')?.value || '';
    }
    const printProjectEl = $('#print-project-name');
    if (printProjectEl) {
        printProjectEl.textContent = $('#customer-project')?.value || '';
    }

    // Set print year info
    const printYear = $('#print-price-year');
    if (printYear) {
        printYear.textContent = `Priser ${CURRENT_YEAR} (eks. MVA)`;
    }
}

async function generateQuotePDF() {
    // Prepare print fields
    preparePrintFields();

    // Temporarily add print class to body for styling
    document.body.classList.add('generating-pdf');

    const element = document.body;

    const opt = {
        margin: [10, 10, 10, 10],
        filename: getQuoteFilename(),
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            logging: false,
            onclone: (clonedDoc) => {
                // Apply print styles to clone
                clonedDoc.body.classList.add('print-mode');
                // Hide non-print elements
                const hideSelectors = [
                    '.tilbud-header', '.controls-bar', '.summary-footer',
                    '.product-actions', '.product-toggle', '.qty-btn',
                    '.category-header', '.category-selector-section',
                    '.btn-outline', '.btn-primary', '.btn-secondary',
                    '.btn-email', '.email-overlay', '.email-images-clear',
                    '.company-footer', '.btn-send-email'
                ];
                hideSelectors.forEach(sel => {
                    clonedDoc.querySelectorAll(sel).forEach(el => el.style.display = 'none');
                });
                // Show print-only elements
                const showSelectors = ['.print-letterhead', '.print-company-footer'];
                showSelectors.forEach(sel => {
                    clonedDoc.querySelectorAll(sel).forEach(el => el.style.display = 'block');
                });
                // Hide products with 0 quantity
                clonedDoc.querySelectorAll('.product-row').forEach(row => {
                    const qtyInput = row.querySelector('.qty-input');
                    if (qtyInput && parseInt(qtyInput.value) === 0) {
                        row.style.display = 'none';
                    }
                });
                // Make inputs look like text
                clonedDoc.querySelectorAll('input').forEach(input => {
                    const span = clonedDoc.createElement('span');
                    span.textContent = input.value;
                    span.style.cssText = input.style.cssText;
                    input.parentNode.replaceChild(span, input);
                });
            }
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    const pdfBlob = await html2pdf().set(opt).from(element).outputPdf('blob');
    document.body.classList.remove('generating-pdf');
    return pdfBlob;
}

function getQuoteFilename() {
    const customer = $('#customer-name')?.value || 'Kunde';
    const date = new Date().toISOString().slice(0, 10);
    const safeName = customer.replace(/[^a-zA-ZæøåÆØÅ0-9 ]/g, '').trim().replace(/\s+/g, '_');
    return `Tilbud_${safeName}_${date}.pdf`;
}

async function handleSendEmail() {
    let toEmail = '';
    let customerName = $('#customer-name')?.value || 'Kunde';

    if (!quoteSourceEmail) {
        toEmail = prompt('Skriv inn kundens e-postadresse for å sende tilbudet direkte:');
        if (!toEmail) return; // User cancelled
    } else {
        toEmail = quoteSourceEmail.from_email;
        customerName = quoteSourceEmail.from_name || toEmail;
    }

    const subject = `Pristilbud – ${$('#customer-project')?.value || 'Oppmerking'}`;

    // Confirm before sending
    const ok = confirm(
        `Sender tilbud til:\n${customerName} <${toEmail}>\n\nEmne: ${subject}\n\nVil du fortsette?`
    );
    if (!ok) return;

    // Ask if they want a copy
    const sendCopy = confirm('Ønsker du at det sendes en usynlig blindkopi (BCC) av tilbudet til post@christianiaoppmerking.no for arkivering?');

    const sendBtn = $('#send-email-btn');
    const originalText = sendBtn?.textContent;
    if (sendBtn) {
        sendBtn.textContent = '⏳ Genererer PDF...';
        sendBtn.disabled = true;
    }

    try {
        // Generate PDF
        const pdfBlob = await generateQuotePDF();

        // Convert to base64
        const reader = new FileReader();
        const pdfBase64 = await new Promise((resolve) => {
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(pdfBlob);
        });

        if (sendBtn) sendBtn.textContent = '⏳ Sender...';

        // Read extra custom attachments
        const fileInput = $('#quote-attachments');
        let customAttachments = [];
        if (fileInput && fileInput.files.length > 0) {
            if (sendBtn) sendBtn.textContent = '⏳ Laster vedlegg...';
            // Convert all to base64
            for (let i = 0; i < fileInput.files.length; i++) {
                const f = fileInput.files[i];
                const r = new FileReader();
                const b64 = await new Promise((resolve) => {
                    r.onload = () => resolve(r.result.split(',')[1]);
                    r.readAsDataURL(f);
                });
                customAttachments.push({
                    filename: f.name,
                    base64: b64,
                    contentType: f.type
                });
            }
        }

        // Send via backend
        const bodyText = `Hei ${customerName},\n\nTakk for din henvendelse.\n\nVedlagt finner du vårt pristilbud for det forespurte oppmerkingsarbeidet.\n\nDette tilbudet er basert på en maskinell behandling av din forespørsel. Dersom det er mangler eller feil, gi oss beskjed så korrigerer vi tilbudet.\n\nTilbudet er gyldig i 30 dager.\n\nMed vennlig hilsen\nChristiania Oppmerking AS\nTlf: +47 40 00 42 54\npost@christianiaoppmerking.no`;

        const storedPwd = sessionStorage.getItem('mail_pwd_post');
        const reqHeaders = { 'Content-Type': 'application/json' };
        if (storedPwd) {
            reqHeaders['X-Mail-Password'] = storedPwd;
        }

        if (sendBtn) sendBtn.textContent = '⏳ Sender e-post...';

        const resp = await fetch('/mail/send', {
            method: 'POST',
            headers: reqHeaders,
            body: JSON.stringify({
                to_email: toEmail,
                subject: subject,
                body_text: bodyText,
                pdf_base64: pdfBase64,
                pdf_filename: getQuoteFilename(),
                bcc_email: sendCopy ? 'post@christianiaoppmerking.no' : '',
                custom_attachments: customAttachments
            })
        });

        if (resp.status === 401) {
            const pwd = prompt("Passord kreves for å sende e-post fra post@christianiaoppmerking.no.\n\nSkriv inn passordet ditt:");
            if (pwd) {
                sessionStorage.setItem('mail_pwd_post', pwd);
                // Retry
                if (sendBtn) {
                    sendBtn.textContent = originalText;
                    sendBtn.disabled = false;
                }
                return handleSendEmail(); 
            } else {
                alert("Sendeavbrutt. Passord kreves.");
                return;
            }
        }

        const result = await resp.json();

        if (result.error) {
            alert(`Feil: ${result.error}`);
        } else {
            alert(`✅ Tilbud sendt til ${toEmail}!`);
        }

    } catch (e) {
        alert(`Feil ved sending: ${e.message}`);
    } finally {
        if (sendBtn) {
            sendBtn.textContent = originalText;
            sendBtn.disabled = false;
        }
    }
}

// ===== Helpers =====
function formatKr(amount) {
    if (amount === 0) return 'kr 0,-';
    return `kr ${Math.round(amount).toLocaleString('nb-NO')},-`;
}
