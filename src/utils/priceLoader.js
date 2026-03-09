/**
 * Price Loader – Parses Excel files with pricing data using SheetJS.
 * 
 * Expected Excel structure (flexible column matching):
 * | Produkt | Enhet | Pris uten rabatt | Rabatt % | Pris med rabatt | Kundepris |
 */

/**
 * Parse an Excel file and extract pricing data.
 * @param {File} file - The Excel file to parse
 * @returns {Promise<{rows: Array, columns: Array, priceModes: Array}>}
 */
export async function loadPriceList(file) {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });

    // Use first sheet
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convert to JSON (array of objects with header keys)
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rows.length === 0) {
        throw new Error('Excel-filen er tom eller har feil format.');
    }

    // Detect columns
    const headers = Object.keys(rows[0]);

    // Find the product name column (first text column)
    const productCol = findColumn(headers, ['produkt', 'beskrivelse', 'navn', 'type', 'vare', 'artikkel']);

    // Find unit column
    const unitCol = findColumn(headers, ['enhet', 'unit', 'enh']);

    // Find price columns
    const priceCol = findColumn(headers, ['pris uten rabatt', 'pris', 'listepris', 'standard', 'grunnpris']);
    const discountCol = findColumn(headers, ['rabatt', 'rabatt %', 'rabatt%', 'discount']);
    const discountPriceCol = findColumn(headers, ['pris med rabatt', 'rabattpris', 'nettopris']);
    const customerPriceCol = findColumn(headers, ['kundepris', 'avtale', 'avtalepris', 'kunde']);

    // Build normalized price list
    const priceList = rows.map(row => {
        const product = String(row[productCol] || '').trim();
        const unit = unitCol ? String(row[unitCol] || '').trim() : 'stk';
        const basePrice = parseNum(row[priceCol]);
        const discountPct = discountCol ? parseNum(row[discountCol]) : 0;
        const discountPrice = discountPriceCol
            ? parseNum(row[discountPriceCol])
            : (basePrice > 0 ? basePrice * (1 - discountPct / 100) : 0);
        const customerPrice = customerPriceCol ? parseNum(row[customerPriceCol]) : 0;

        return {
            product,
            unit,
            basePrice,
            discountPct,
            discountPrice,
            customerPrice,
            // Lowercase key for matching
            key: product.toLowerCase().replace(/[^a-zæøå0-9]/g, '')
        };
    }).filter(r => r.product.length > 0);

    // Determine which price modes are available
    const priceModes = [];
    if (priceCol && priceList.some(r => r.basePrice > 0)) {
        priceModes.push({ id: 'base', label: 'Pris uten rabatt' });
    }
    if (priceList.some(r => r.discountPrice > 0)) {
        priceModes.push({ id: 'discount', label: 'Pris med rabatt' });
    }
    if (customerPriceCol && priceList.some(r => r.customerPrice > 0)) {
        priceModes.push({ id: 'customer', label: 'Kundepris' });
    }

    return {
        priceList,
        priceModes,
        headers,
        sheetName,
        fileName: file.name
    };
}

/**
 * Match drawn element line items to products in the price list.
 * Returns enriched items with prices attached.
 */
export function matchPrices(lineItems, priceList, priceMode = 'base') {
    return lineItems.map(item => {
        // Try to find a matching product
        const match = findBestMatch(item, priceList);

        let unitPrice = 0;
        if (match) {
            switch (priceMode) {
                case 'base': unitPrice = match.basePrice; break;
                case 'discount': unitPrice = match.discountPrice; break;
                case 'customer': unitPrice = match.customerPrice; break;
            }
        }

        return {
            ...item,
            matchedProduct: match ? match.product : null,
            unit: match ? match.unit : 'stk',
            unitPrice,
            totalPrice: unitPrice * item.count,
            matched: !!match
        };
    });
}

// --- Helpers ---

function findColumn(headers, candidates) {
    for (const candidate of candidates) {
        const found = headers.find(h => h.toLowerCase().trim().includes(candidate));
        if (found) return found;
    }
    // Fallback: return first header if candidates don't match
    return null;
}

function parseNum(val) {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    // Handle Norwegian number format (comma as decimal separator)
    const cleaned = String(val).replace(/\s/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}

/**
 * Find the best matching product in the price list for a given line item.
 * Uses fuzzy matching on keys/labels.
 */
function findBestMatch(item, priceList) {
    const itemKey = item.key.toLowerCase().replace(/[^a-zæøå0-9]/g, '');
    const itemLabel = item.label.toLowerCase();

    // Exact key match
    let match = priceList.find(p => p.key === itemKey);
    if (match) return match;

    // Check if product name contains the item label or vice versa
    match = priceList.find(p =>
        p.key.includes(itemKey) || itemKey.includes(p.key) ||
        p.product.toLowerCase().includes(itemLabel) || itemLabel.includes(p.product.toLowerCase())
    );
    if (match) return match;

    // Keyword matching
    const keywords = itemLabel.split(/[\s():/,–-]+/).filter(w => w.length > 2);
    let bestScore = 0;
    let bestMatch = null;

    for (const p of priceList) {
        const prodLower = p.product.toLowerCase();
        let score = 0;
        for (const kw of keywords) {
            if (prodLower.includes(kw)) score++;
        }
        if (score > bestScore) {
            bestScore = score;
            bestMatch = p;
        }
    }

    return bestScore > 0 ? bestMatch : null;
}
