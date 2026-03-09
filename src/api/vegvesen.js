/**
 * Vegvesen Parking Registry API Client
 * Uses the open Read API (Lese-API) to fetch parking area data and sign plans.
 */

// Use local proxy to avoid CORS issues
// The Python server.py proxies /api/* → Vegvesen API
const API_BASE = '/api';

let cachedAreas = null;

/**
 * Fetch all parking areas with lightweight 'kart' data (fast: ~3.5s).
 * Returns only search-relevant fields: id, navn, adresse, postnummer, poststed,
 * koordinater, tilbyder, versjonsnummer, aktiveringstidspunkt.
 * Results are cached after first fetch.
 */
export async function fetchAllParkingAreas() {
    if (cachedAreas) return cachedAreas;

    const url = `${API_BASE}/parkeringsomraade?datafelter=kart`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    cachedAreas = await response.json();
    return cachedAreas;
}

/**
 * Fetch a single parking area by ID.
 */
export async function fetchParkingArea(id) {
    const url = `${API_BASE}/parkeringsomraade/${id}`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
    }

    return response.json();
}

/**
 * Fetch sign plan PDF as a blob.
 */
export async function fetchSkiltplan(skiltplanId) {
    const url = `${API_BASE}/parkeringsomraade/skiltplan/${skiltplanId}`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Could not fetch sign plan: ${response.status}`);
    }

    return response.blob();
}

/**
 * Get the direct URL for a sign plan (used for pdf.js loading).
 */
export function getSkiltplanUrl(skiltplanId) {
    return `${API_BASE}/parkeringsomraade/skiltplan/${skiltplanId}`;
}

/**
 * Search parking areas by address string.
 * Filters the full cached list locally.
 */
export async function searchByAddress(query) {
    const areas = await fetchAllParkingAreas();
    const q = query.toLowerCase().trim();

    if (!q) return [];

    return areas.filter(area => {
        const version = area.aktivVersjon || area;
        const address = (version.adresse || area.adresse || '').toLowerCase();
        const poststed = (version.poststed || area.poststed || '').toLowerCase();
        const postnummer = (version.postnummer || area.postnummer || '').toString();
        const navn = (version.navn || area.navn || '').toLowerCase();

        return address.includes(q) || poststed.includes(q) ||
            postnummer.includes(q) || navn.includes(q);
    });
}

/**
 * Extract displayable info from a parking area object.
 * Works with both lightweight 'kart' objects and full-detail objects.
 */
export function extractAreaInfo(area) {
    const v = area.aktivVersjon || {};
    const isKart = !area.aktivVersjon;

    return {
        id: area.id,
        navn: v.navn || area.navn || 'Ukjent',
        adresse: v.adresse || area.adresse || 'Ukjent adresse',
        postnummer: v.postnummer || area.postnummer || '',
        poststed: v.poststed || area.poststed || '',
        tilbyderNavn: area.parkeringstilbyderNavn || v.parkeringstilbyderNavn || 'Ukjent tilbyder',
        tilbyderOrgnr: area.parkeringstilbyderOrganisasjonsnummer || '',
        antallAvgiftsbelagte: v.antallAvgiftsbelagtePlasser ?? (isKart ? '-' : '-'),
        antallAvgiftsfrie: v.antallAvgiftsfriePlasser ?? (isKart ? '-' : '-'),
        antallLadeplasser: v.antallLadeplasser ?? (isKart ? '-' : '-'),
        merknadLadeplasser: v.merknadLadeplasser || '',
        antallForflytningshemmede: v.antallForflytningshemmede ?? (isKart ? '-' : '-'),
        skiltplanId: v.skiltplanId || null,
        vurderingId: v.opplastetVurderingId || null,
        typeOmrade: v.typeParkeringsomrade || 'IKKE_VALGT',
        innfartsparkering: v.innfartsparkering || 'IKKE_VALGT',
        handhever: v.handhever || null,
        breddegrad: area.breddegrad,
        lengdegrad: area.lengdegrad,
        versjonsnummer: v.versjonsnummer || area.versjonsnummer,
        aktiveringstidspunkt: v.aktiveringstidspunkt || area.aktiveringstidspunkt,
        sistEndret: v.sistEndret,
        isKart: isKart
    };
}

