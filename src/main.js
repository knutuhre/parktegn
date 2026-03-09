/**
 * ParkTegn – Main Application
 * Ties together search, result display, PDF loading, and the drawing canvas.
 */

import { fetchAllParkingAreas, fetchParkingArea, searchByAddress, extractAreaInfo, getSkiltplanUrl } from './api/vegvesen.js?v=17';
import { loadPdf } from './utils/pdfLoader.js';
import { CanvasManager } from './canvas/canvasManager.js?v=19';
import { loadPriceList, matchPrices } from './utils/priceLoader.js';

// ===== State =====
let allAreas = [];
let selectedArea = null;
let selectedAreaInfo = null;
let pdfDoc = null;
let selectedSheets = new Set();
let sheetImages = {};  // pageNum -> canvas image
let canvasManager = null;
window.canvasManager = null; // for debugging
let currentSheetIndex = 0;
let selectedSheetsArray = [];

// Pricing state
let priceData = null;   // Loaded price list from Excel
let priceMode = 'base'; // 'base', 'discount', 'customer'
let manualMatches = {};  // User-overridden product matches: lineItemKey -> priceListIndex

// ===== DOM Elements =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Phases
const searchPhase = $('#search-phase');
const resultPhase = $('#result-phase');
const drawingPhase = $('#drawing-phase');

// Search
const searchInput = $('#search-input');
const searchResults = $('#search-results');
const searchSpinner = $('#search-spinner');
const loadingOverlay = $('#loading-overlay');

// Result
const resultTitle = $('#result-title');
const infoGrid = $('#info-grid');
const sheetsContainer = $('#sheets-container');
const sheetsLoading = $('#sheets-loading');
const noSkiltplan = $('#no-skiltplan');
const startDrawingBtn = $('#start-drawing');

// Drawing
const drawingCanvas = $('#drawing-canvas');
const canvasContainer = $('#canvas-container');
const sheetTabs = $('#sheet-tabs');

// ===== Phase Navigation =====

function showPhase(phase) {
    [searchPhase, resultPhase, drawingPhase].forEach(p => p.classList.remove('active'));
    phase.classList.add('active');

    if (phase === drawingPhase && canvasManager) {
        setTimeout(() => canvasManager._resize(), 50);
    }
}

// ===== Initialize =====

async function init() {
    // Setup file import button (always available, even without server)
    const openFileBtn = $('#open-file-btn');
    const fileInput = $('#file-input');
    openFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            startDrawingWithFile(e.target.files[0]);
            // Reset so re-selecting the same file still triggers change
            fileInput.value = '';
        }
    });

    // Setup navigation buttons
    $('#back-to-search').addEventListener('click', () => {
        showPhase(searchPhase);
    });

    $('#back-to-result').addEventListener('click', () => {
        showPhase(resultPhase);
    });

    startDrawingBtn.addEventListener('click', () => {
        startDrawing();
    });

    // Setup drawing toolbar
    setupToolbar();

    // Street View Visualization
    const vizModal = $('#viz-modal');
    const vizCanvas = $('#viz-canvas');
    const vizOpacity = $('#viz-opacity');
    const vizSize = $('#viz-size');
    const vizHeading = $('#viz-heading');
    const vizHeadingLabel = $('#viz-heading-label');
    const vizImg = $('#viz-streetview-img');
    const vizOverlay = $('#viz-overlay-wrapper');
    const vizLoading = $('#viz-loading');
    let vizLat = 0, vizLng = 0;

    function updateVizOverlay() {
        const opacity = vizOpacity.value / 100;
        const size = vizSize.value;
        vizCanvas.style.opacity = opacity;
        vizOverlay.style.width = size + '%';
        vizCanvas.style.width = '100%';
    }

    function loadStreetView(heading) {
        vizLoading.style.display = 'flex';
        vizHeadingLabel.textContent = heading + '°';
        const url = `/streetview/?lat=${vizLat}&lng=${vizLng}&heading=${heading}&pitch=0&fov=90`;
        vizImg.onload = () => { vizLoading.style.display = 'none'; };
        vizImg.onerror = () => { vizLoading.textContent = 'Kunne ikke laste Street View'; };
        vizImg.src = url;
    }

    $('#street-view-btn').addEventListener('click', () => {
        if (!canvasManager) return;

        // Render the plan with cars
        const carCanvas = canvasManager.exportWithCars();
        vizCanvas.width = carCanvas.width;
        vizCanvas.height = carCanvas.height;
        const ctx = vizCanvas.getContext('2d');
        ctx.drawImage(carCanvas, 0, 0);

        // Set up Street View
        if (selectedAreaInfo && selectedAreaInfo.breddegrad && selectedAreaInfo.lengdegrad) {
            vizLat = selectedAreaInfo.breddegrad;
            vizLng = selectedAreaInfo.lengdegrad;

            // Google Maps link button
            $('#viz-gmaps').onclick = () => {
                window.open(`https://www.google.com/maps/@${vizLat},${vizLng},3a,75y,${vizHeading.value}h,90t/data=!3m4!1e1!3m2!1s!2e0`, '_blank');
            };
        }

        // Show modal and load Street View
        vizModal.classList.remove('hidden');
        vizHeading.value = 0;
        updateVizOverlay();
        loadStreetView(0);
    });

    vizHeading.addEventListener('input', () => {
        loadStreetView(vizHeading.value);
    });

    $('#viz-close').addEventListener('click', () => {
        vizModal.classList.add('hidden');
    });

    vizOpacity.addEventListener('input', updateVizOverlay);
    vizSize.addEventListener('input', updateVizOverlay);

    // ESC to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !vizModal.classList.contains('hidden')) {
            vizModal.classList.add('hidden');
        }
    });

    // Load all parking areas on startup
    loadingOverlay.classList.remove('hidden');

    try {
        allAreas = await fetchAllParkingAreas();
        console.log(`Loaded ${allAreas.length} parking areas`);
    } catch (err) {
        console.error('Failed to load parking areas:', err);
        loadingOverlay.querySelector('p').textContent =
            'Kunne ikke laste parkeringsområder. Sjekk nettverkstilkobling.';
        // Allow retry
        setTimeout(() => {
            loadingOverlay.classList.add('hidden');
        }, 3000);
        return;
    }

    loadingOverlay.classList.add('hidden');

    // Setup search
    setupSearch();
}

// ===== Search =====

function setupSearch() {
    let debounceTimer;

    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value.trim();

        if (query.length < 2) {
            searchResults.classList.add('hidden');
            searchSpinner.classList.add('hidden');
            return;
        }

        searchSpinner.classList.remove('hidden');

        debounceTimer = setTimeout(async () => {
            try {
                const results = await searchByAddress(query);
                displaySearchResults(results);
            } catch (err) {
                console.error('Search error:', err);
            }
            searchSpinner.classList.add('hidden');
        }, 300);
    });

    // Close results on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            searchResults.classList.add('hidden');
        }
    });

    searchInput.addEventListener('focus', () => {
        if (searchResults.children.length > 0) {
            searchResults.classList.remove('hidden');
        }
    });
}

function displaySearchResults(results) {
    searchResults.innerHTML = '';

    if (results.length === 0) {
        searchResults.innerHTML = `
            <div class="search-result-item" style="cursor:default; opacity:0.6">
                <span class="result-address">Ingen resultater funnet</span>
            </div>
        `;
        searchResults.classList.remove('hidden');
        return;
    }

    // Limit to 20 results
    const limited = results.slice(0, 20);

    for (const area of limited) {
        const info = extractAreaInfo(area);
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.innerHTML = `
            <span class="result-address">${info.adresse}, ${info.postnummer} ${info.poststed}</span>
            <span class="result-provider">${info.tilbyderNavn}</span>
            <span class="result-meta">
                <span>Betalingsplasser: ${info.antallAvgiftsbelagte}</span>
                <span>Gratis: ${info.antallAvgiftsfrie}</span>
            </span>
        `;

        item.addEventListener('click', () => {
            selectArea(area);
        });

        searchResults.appendChild(item);
    }

    searchResults.classList.remove('hidden');
}

// ===== Area Selection =====

async function selectArea(area) {
    selectedArea = area;
    // Use kart-mode info for immediate display
    selectedAreaInfo = extractAreaInfo(area);

    searchResults.classList.add('hidden');

    // Show result phase with loading indicator while fetching full details
    resultTitle.textContent = selectedAreaInfo.navn || selectedAreaInfo.adresse;
    infoGrid.innerHTML = '<div class="info-card accent" style="grid-column:1/-1;text-align:center;"><div class="loading-spinner" style="margin:0 auto;"></div><div class="info-label" style="margin-top:8px;">Henter detaljer...</div></div>';
    showPhase(resultPhase);

    // Fetch full details for this specific area
    try {
        const fullArea = await fetchParkingArea(area.id);
        selectedArea = fullArea;
        selectedAreaInfo = extractAreaInfo(fullArea);
    } catch (err) {
        console.warn('Could not fetch full details, using kart data:', err);
    }

    // Show result phase
    resultTitle.textContent = selectedAreaInfo.navn || selectedAreaInfo.adresse;

    // Build info cards
    const typeLabels = {
        'PARKERINGSHUS': 'Parkeringshus',
        'LANGS_KJOREBANE': 'Langs kjørebane',
        'AVGRENSET_OMRADE': 'Avgrenset område',
        'IKKE_VALGT': 'Ikke spesifisert'
    };

    infoGrid.innerHTML = `
        <div class="info-card accent">
            <div class="info-label">Adresse</div>
            <div class="info-value text-value">${selectedAreaInfo.adresse}<br>${selectedAreaInfo.postnummer} ${selectedAreaInfo.poststed}</div>
        </div>
        <div class="info-card">
            <div class="info-label">Parkeringsselskap</div>
            <div class="info-value text-value">${selectedAreaInfo.tilbyderNavn}</div>
        </div>
        <div class="info-card">
            <div class="info-label">Type område</div>
            <div class="info-value text-value">${typeLabels[selectedAreaInfo.typeOmrade] || selectedAreaInfo.typeOmrade}</div>
        </div>
        <div class="info-card">
            <div class="info-label">Avgiftsbelagte plasser</div>
            <div class="info-value">${selectedAreaInfo.antallAvgiftsbelagte}</div>
        </div>
        <div class="info-card">
            <div class="info-label">Avgiftsfrie plasser</div>
            <div class="info-value">${selectedAreaInfo.antallAvgiftsfrie}</div>
        </div>
        <div class="info-card">
            <div class="info-label">Ladeplasser</div>
            <div class="info-value">${selectedAreaInfo.antallLadeplasser}</div>
        </div>
        <div class="info-card">
            <div class="info-label">HC-plasser</div>
            <div class="info-value">${selectedAreaInfo.antallForflytningshemmede}</div>
        </div>
        ${selectedAreaInfo.handhever ? `
        <div class="info-card">
            <div class="info-label">Håndheving</div>
            <div class="info-value text-value">${selectedAreaInfo.handhever.navn || 'Ukjent'}</div>
        </div>
        ` : ''}
    `;

    showPhase(resultPhase);

    // Reset state
    selectedSheets.clear();
    sheetsContainer.innerHTML = '';
    startDrawingBtn.disabled = true;

    // Hide sheets section initially (shown when "Skiltplan" is chosen)
    const sheetsSection = $('#sheets-section');
    sheetsSection.classList.add('hidden');
    startDrawingBtn.classList.add('hidden');

    // Show source chooser
    const sourceChooser = $('#source-chooser');
    sourceChooser.classList.remove('hidden');

    // Wire up source chooser buttons
    const skiltplanBtn = $('#source-skiltplan');
    const satelliteBtn = $('#source-satellite');

    // Remove old handlers by cloning
    const newSkiltplanBtn = skiltplanBtn.cloneNode(true);
    const newSatelliteBtn = satelliteBtn.cloneNode(true);
    skiltplanBtn.parentNode.replaceChild(newSkiltplanBtn, skiltplanBtn);
    satelliteBtn.parentNode.replaceChild(newSatelliteBtn, satelliteBtn);

    // Skiltplan: reveal sheets section and load PDF
    newSkiltplanBtn.addEventListener('click', async () => {
        sourceChooser.classList.add('hidden');
        sheetsSection.classList.remove('hidden');
        startDrawingBtn.classList.remove('hidden');

        if (selectedAreaInfo.skiltplanId) {
            sheetsLoading.classList.remove('hidden');
            noSkiltplan.classList.add('hidden');

            try {
                const pdfUrl = getSkiltplanUrl(selectedAreaInfo.skiltplanId);
                pdfDoc = await loadPdf(pdfUrl);

                sheetsLoading.classList.add('hidden');

                for (let i = 1; i <= pdfDoc.numPages; i++) {
                    const thumbCanvas = await pdfDoc.renderThumbnail(i, 280);
                    const thumbDataUrl = thumbCanvas.toDataURL('image/png');

                    const card = document.createElement('div');
                    card.className = 'sheet-card';
                    card.dataset.page = i;
                    card.innerHTML = `
                        <img class="sheet-thumbnail" src="${thumbDataUrl}" alt="Ark ${i}">
                        <div class="sheet-label">Ark ${i} av ${pdfDoc.numPages}</div>
                    `;

                    card.addEventListener('click', () => {
                        card.classList.toggle('selected');
                        if (card.classList.contains('selected')) {
                            selectedSheets.add(i);
                        } else {
                            selectedSheets.delete(i);
                        }
                        startDrawingBtn.disabled = selectedSheets.size === 0;
                    });

                    sheetsContainer.appendChild(card);
                }
            } catch (err) {
                console.error('Failed to load sign plan:', err);
                sheetsLoading.classList.add('hidden');
                noSkiltplan.classList.remove('hidden');
                noSkiltplan.querySelector('p').textContent =
                    'Kunne ikke laste skiltplan. Prøv igjen senere.';
            }
        } else {
            noSkiltplan.classList.remove('hidden');
        }
    });

    // Satellite: fetch satellite image and start drawing
    newSatelliteBtn.addEventListener('click', () => {
        startDrawingWithMap();
    });
}

// ===== Drawing Phase =====

function initCanvasManager() {
    if (!canvasManager) {
        canvasManager = new CanvasManager(drawingCanvas, canvasContainer);
        window.canvasManager = canvasManager;

        canvasManager.onCalibrated = (ppm) => {
            const scaleValue = $('#scale-value');
            scaleValue.textContent = `${ppm.toFixed(1)} px/m`;

            const calText = $('#calibration-text');
            calText.textContent = 'Kalibrering fullført! ✓';
            setTimeout(() => {
                calText.textContent = 'Klikk på to ender av en parkeringsplass for å kalibrere (= 5 meter)';
            }, 2000);
        };

        canvasManager.onHistoryChange = (canUndo, canRedo) => {
            $('#undo-btn').disabled = !canUndo;
            $('#redo-btn').disabled = !canRedo;
        };

        canvasManager.onSelectionChange = (el) => {
            $('#delete-btn').disabled = !el;
            $('#rotate-btn').disabled = !el;
        };
    }
}

async function startDrawing() {
    if (selectedSheets.size === 0) return;

    selectedSheetsArray = [...selectedSheets].sort((a, b) => a - b);
    currentSheetIndex = 0;
    sheetImages = {};

    showPhase(drawingPhase);
    initCanvasManager();

    // Build sheet tabs
    buildSheetTabs();

    // Load first sheet
    await loadSheet(selectedSheetsArray[0]);
}

async function startDrawingWithMap() {
    const lat = selectedAreaInfo.breddegrad;
    const lng = selectedAreaInfo.lengdegrad;

    if (!lat || !lng) {
        alert('Ingen koordinater tilgjengelig for dette parkeringsområdet.');
        return;
    }

    showPhase(drawingPhase);
    initCanvasManager();

    // Hide sheet tabs (single satellite image, no tabs)
    sheetTabs.innerHTML = '<button class="sheet-tab active">🛰️ Satellittbilde</button>';

    // Show loading state
    canvasManager.setBackground(null);
    canvasManager.render();

    const url = `/maps/satellite?lat=${lat}&lng=${lng}&zoom=19`;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Satellite image: attempt ${attempt}/${maxRetries}`);
            const response = await fetch(url);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const blob = await response.blob();
            if (blob.size < 500) {
                throw new Error('Response too small, likely an error');
            }
            const imgUrl = URL.createObjectURL(blob);

            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = imgUrl;
            });

            canvasManager.setBackground(img);
            URL.revokeObjectURL(imgUrl);
            return; // Success - exit

        } catch (err) {
            console.warn(`Satellite image attempt ${attempt} failed:`, err);
            if (attempt < maxRetries) {
                // Wait before retrying
                await new Promise(r => setTimeout(r, 1000));
            } else {
                console.error('All satellite image attempts failed');
                alert('Kunne ikke hente satellittbilde etter flere forsøk. Prøv igjen senere.');
            }
        }
    }
}

async function startDrawingWithFile(file) {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    showPhase(drawingPhase);
    initCanvasManager();

    if (isPdf) {
        // Load PDF using existing pdfLoader
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdfData = new Uint8Array(arrayBuffer);
            const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

            if (pdf.numPages === 1) {
                // Single page – render directly
                sheetTabs.innerHTML = `<button class="sheet-tab active">📄 ${file.name}</button>`;
                const page = await pdf.getPage(1);
                const scale = 3.0;
                const viewport = page.getViewport({ scale });
                const offCanvas = document.createElement('canvas');
                offCanvas.width = viewport.width;
                offCanvas.height = viewport.height;
                const offCtx = offCanvas.getContext('2d');
                await page.render({ canvasContext: offCtx, viewport }).promise;
                canvasManager.setBackground(offCanvas);
            } else {
                // Multi-page – build tabs
                pdfDoc = { _pdf: pdf, numPages: pdf.numPages };
                selectedSheetsArray = [];
                sheetImages = {};

                for (let i = 1; i <= pdf.numPages; i++) {
                    selectedSheetsArray.push(i);
                }
                currentSheetIndex = 0;

                // Build sheet tabs
                sheetTabs.innerHTML = '';
                for (let i = 0; i < selectedSheetsArray.length; i++) {
                    const pageNum = selectedSheetsArray[i];
                    const tab = document.createElement('button');
                    tab.className = `sheet-tab ${i === 0 ? 'active' : ''}`;
                    tab.textContent = `Ark ${pageNum}`;
                    tab.addEventListener('click', async () => {
                        currentSheetIndex = i;
                        $$('.sheet-tab').forEach(t => t.classList.remove('active'));
                        tab.classList.add('active');
                        await loadFilePdfPage(pdf, pageNum);
                    });
                    sheetTabs.appendChild(tab);
                }

                // Load first page
                await loadFilePdfPage(pdf, 1);
            }
        } catch (err) {
            console.error('Failed to load PDF file:', err);
            alert('Kunne ikke laste PDF-filen. Sjekk at filen er gyldig.');
            showPhase(searchPhase);
        }
    } else {
        // Image file
        sheetTabs.innerHTML = `<button class="sheet-tab active">🖼️ ${file.name}</button>`;

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                canvasManager.setBackground(img);
            };
            img.onerror = () => {
                alert('Kunne ikke laste bildefilen.');
                showPhase(searchPhase);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

async function loadFilePdfPage(pdf, pageNum) {
    if (!sheetImages[pageNum]) {
        const page = await pdf.getPage(pageNum);
        const scale = 3.0;
        const viewport = page.getViewport({ scale });
        const offCanvas = document.createElement('canvas');
        offCanvas.width = viewport.width;
        offCanvas.height = viewport.height;
        const offCtx = offCanvas.getContext('2d');
        await page.render({ canvasContext: offCtx, viewport }).promise;
        sheetImages[pageNum] = offCanvas;
    }
    canvasManager.setBackground(sheetImages[pageNum]);
}

function buildSheetTabs() {
    sheetTabs.innerHTML = '';

    for (let i = 0; i < selectedSheetsArray.length; i++) {
        const pageNum = selectedSheetsArray[i];
        const tab = document.createElement('button');
        tab.className = `sheet-tab ${i === 0 ? 'active' : ''}`;
        tab.textContent = `Ark ${pageNum}`;
        tab.addEventListener('click', async () => {
            currentSheetIndex = i;
            $$('.sheet-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            await loadSheet(pageNum);
        });
        sheetTabs.appendChild(tab);
    }
}

async function loadSheet(pageNum) {
    if (!sheetImages[pageNum]) {
        const result = await pdfDoc.renderPage(pageNum, 3.0);
        sheetImages[pageNum] = result.canvas;
    }

    canvasManager.setBackground(sheetImages[pageNum]);
}

// ===== Toolbar Setup =====

function setupToolbar() {
    // Tool buttons
    $$('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tool = btn.dataset.tool;
            if (!tool || !canvasManager) return;

            // Handle symbol subtypes
            if (tool === 'symbol') {
                canvasManager.setSymbolType(btn.dataset.symbol);
            }

            canvasManager.setTool(tool);
        });
    });

    // Color swatches
    $$('.color-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
            $$('.color-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            if (canvasManager) {
                canvasManager.setColor(swatch.dataset.color);
            }
        });
    });

    // Undo/Redo
    $('#undo-btn').addEventListener('click', () => canvasManager?.undo());
    $('#redo-btn').addEventListener('click', () => canvasManager?.redo());

    // Zoom
    $('#zoom-in-btn').addEventListener('click', () => canvasManager?.zoomIn());
    $('#zoom-out-btn').addEventListener('click', () => canvasManager?.zoomOut());
    $('#zoom-fit-btn').addEventListener('click', () => canvasManager?.fitToView());

    // Cancel calibration
    $('#cancel-calibration').addEventListener('click', () => {
        if (canvasManager) {
            canvasManager.calibrationPoints = [];
            canvasManager.setTool('select');
        }
    });

    // Export
    $('#export-btn').addEventListener('click', () => {
        canvasManager?.exportAsPNG();
    });

    // Price quote
    $('#price-quote-btn').addEventListener('click', () => {
        openPriceQuote();
    });

    // Rotate selected element 90°
    $('#rotate-btn').addEventListener('click', () => {
        if (canvasManager && canvasManager.selectedElement) {
            canvasManager.selectedElement.rotation = (canvasManager.selectedElement.rotation || 0) + Math.PI / 2;
            canvasManager._saveHistory();
            canvasManager.render();
        }
    });

    // Delete selected element
    $('#delete-btn').addEventListener('click', () => {
        if (canvasManager && canvasManager.selectedElement) {
            canvasManager.removeElement(canvasManager.selectedElement);
            canvasManager.selectedElement = null;
            if (canvasManager.onSelectionChange) canvasManager.onSelectionChange(null);
            canvasManager.render();
        }
    });

    // Toggle helper lines
    $('#helperline-btn').addEventListener('click', () => {
        if (canvasManager) {
            canvasManager.showHelperLines = !canvasManager.showHelperLines;
            $('#helperline-btn').classList.toggle('active', canvasManager.showHelperLines);
            canvasManager.render();
        }
    });

    // Prevent toolbar clicks from stealing canvas focus 
    // (which would deselect the element before delete/rotate buttons fire)
    document.getElementById('toolbar').addEventListener('mousedown', (e) => {
        if (e.target.closest('#delete-btn') || e.target.closest('#rotate-btn')) {
            e.preventDefault();
        }
    });
}

// ===== Price Quote =====

function openPriceQuote() {
    if (!canvasManager) return;

    const priceModal = $('#price-modal');
    priceModal.classList.remove('hidden');

    // Render the table with current element counts
    renderPriceTable();

    // Setup file upload
    setupPriceUpload();

    // Close button
    $('#price-close').onclick = () => priceModal.classList.add('hidden');

    // ESC to close
    const escHandler = (e) => {
        if (e.key === 'Escape' && !priceModal.classList.contains('hidden')) {
            priceModal.classList.add('hidden');
        }
    };
    document.removeEventListener('keydown', escHandler);
    document.addEventListener('keydown', escHandler);

    // Print button
    $('#price-print-btn').onclick = () => window.print();
}

function setupPriceUpload() {
    const uploadBox = $('#price-upload-box');
    const fileInput = $('#price-file-input');
    const fileNameEl = $('#price-file-name');

    // Click to upload
    uploadBox.onclick = () => fileInput.click();

    // Drag and drop
    uploadBox.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadBox.classList.add('drag-over');
    });
    uploadBox.addEventListener('dragleave', () => {
        uploadBox.classList.remove('drag-over');
    });
    uploadBox.addEventListener('drop', async (e) => {
        e.preventDefault();
        uploadBox.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) await handlePriceFile(file);
    });

    // File input change
    fileInput.onchange = async (e) => {
        if (e.target.files.length > 0) {
            await handlePriceFile(e.target.files[0]);
            fileInput.value = '';
        }
    };
}

async function handlePriceFile(file) {
    const fileNameEl = $('#price-file-name');

    try {
        priceData = await loadPriceList(file);

        // Show file name
        fileNameEl.textContent = `✅ ${priceData.fileName} (${priceData.priceList.length} produkter)`;
        fileNameEl.classList.remove('hidden');

        // Setup price mode buttons
        const modeSec = $('#price-mode-section');
        const modeOptions = $('#price-mode-options');
        modeSec.classList.remove('hidden');
        modeOptions.innerHTML = '';

        for (const mode of priceData.priceModes) {
            const label = document.createElement('label');
            label.className = `price-mode-option ${mode.id === priceMode ? 'active' : ''}`;
            label.innerHTML = `
                <input type="radio" name="price-mode" value="${mode.id}" ${mode.id === priceMode ? 'checked' : ''}>
                ${mode.label}
            `;
            label.querySelector('input').addEventListener('change', () => {
                priceMode = mode.id;
                $$('.price-mode-option').forEach(l => l.classList.remove('active'));
                label.classList.add('active');
                renderPriceTable();
            });
            modeOptions.appendChild(label);
        }

        // Select first available mode if current isn't available
        if (priceData.priceModes.length > 0 && !priceData.priceModes.find(m => m.id === priceMode)) {
            priceMode = priceData.priceModes[0].id;
        }

        // Re-render table with prices
        renderPriceTable();

    } catch (err) {
        console.error('Failed to load price file:', err);
        fileNameEl.textContent = `❌ Feil: ${err.message}`;
        fileNameEl.classList.remove('hidden');
        fileNameEl.style.color = 'var(--danger)';
    }
}

function renderPriceTable() {
    if (!canvasManager) return;

    const lineItems = canvasManager.getPriceLineItems();
    const tbody = $('#price-table-body');
    tbody.innerHTML = '';

    if (lineItems.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:24px;">
                Ingen elementer tegnet ennå. Tegn parkeringsplasser, piler, linjer etc. for å se oppsummeringen.
            </td></tr>
        `;
        $('#price-total-amount').innerHTML = '<strong>kr 0,-</strong>';
        return;
    }

    // Match prices if we have a price list
    let enrichedItems;
    if (priceData) {
        enrichedItems = matchPrices(lineItems, priceData.priceList, priceMode);

        // Apply manual overrides
        for (const item of enrichedItems) {
            if (manualMatches[item.key] !== undefined) {
                const idx = manualMatches[item.key];
                if (idx >= 0 && idx < priceData.priceList.length) {
                    const p = priceData.priceList[idx];
                    item.matchedProduct = p.product;
                    item.unit = p.unit;
                    switch (priceMode) {
                        case 'base': item.unitPrice = p.basePrice; break;
                        case 'discount': item.unitPrice = p.discountPrice; break;
                        case 'customer': item.unitPrice = p.customerPrice; break;
                    }
                    item.totalPrice = item.unitPrice * item.count;
                    item.matched = true;
                } else {
                    item.matched = false;
                    item.unitPrice = 0;
                    item.totalPrice = 0;
                }
            }
        }
    } else {
        enrichedItems = lineItems.map(item => ({
            ...item,
            matchedProduct: null,
            unit: 'stk',
            unitPrice: 0,
            totalPrice: 0,
            matched: false
        }));
    }

    let total = 0;
    let hasUnmatched = false;

    for (const item of enrichedItems) {
        total += item.totalPrice;
        if (priceData && !item.matched) hasUnmatched = true;

        const tr = document.createElement('tr');
        if (!item.matched && priceData) tr.classList.add('unmatched');

        // Build match dropdown
        let matchCell = '';
        if (priceData) {
            const currentMatch = manualMatches[item.key] !== undefined
                ? manualMatches[item.key]
                : (item.matched ? priceData.priceList.findIndex(p => p.product === item.matchedProduct) : -1);

            matchCell = `
                <select data-item-key="${item.key}">
                    <option value="-1" ${currentMatch === -1 ? 'selected' : ''}>— Ikke koblet —</option>
                    ${priceData.priceList.map((p, i) =>
                `<option value="${i}" ${i === currentMatch ? 'selected' : ''}>${p.product}</option>`
            ).join('')}
                </select>
            `;
        } else {
            matchCell = '<span style="color:var(--text-muted); font-size:0.8rem;">Last opp prisliste</span>';
        }

        tr.innerHTML = `
            <td>${item.label}</td>
            <td><strong>${item.count}</strong> ${item.unit}</td>
            <td>${item.unitPrice > 0 ? formatPrice(item.unitPrice) : '—'}</td>
            <td>${item.totalPrice > 0 ? formatPrice(item.totalPrice) : '—'}</td>
            <td>${matchCell}</td>
        `;

        tbody.appendChild(tr);
    }

    // Wire up dropdown changes
    tbody.querySelectorAll('select').forEach(sel => {
        sel.addEventListener('change', () => {
            manualMatches[sel.dataset.itemKey] = parseInt(sel.value);
            renderPriceTable();
        });
    });

    // Update total
    $('#price-total-amount').innerHTML = `<strong>${formatPrice(total)}</strong>`;

    // Matching hint
    const hint = $('#price-matching-hint');
    hint.classList.toggle('hidden', !hasUnmatched);
}

function formatPrice(amount) {
    return `kr ${amount.toLocaleString('nb-NO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })},-`;
}

// ===== Start App =====
init();

