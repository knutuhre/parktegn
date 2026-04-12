/**
 * Canvas Manager – Handles layers, zoom, pan, and element management.
 */

export class CanvasManager {
    constructor(canvasElement, container) {
        this.canvas = canvasElement;
        this.container = container;
        this.ctx = canvasElement.getContext('2d');

        // Transform state
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.minScale = 0.1;
        this.maxScale = 10;

        // Background image (PDF page)
        this.backgroundImage = null;
        this.bgWidth = 0;
        this.bgHeight = 0;

        // Drawing elements
        this.elements = [];

        // History for undo/redo
        this.history = [[]];  // Start with empty state so first element can be undone
        this.historyIndex = 0;
        this.maxHistory = 50;
        this.showHelperLines = true;

        // Calibration
        this.pixelsPerMeter = null;

        // Current tool state
        this.currentTool = 'select';
        this.currentColor = '#FFFFFF';
        this.isDragging = false;
        this.isPanning = false;
        this.dragStart = { x: 0, y: 0 };
        this.panStart = { x: 0, y: 0 };

        // Calibration points
        this.calibrationPoints = [];

        // Selected element
        this.selectedElement = null;
        this.dragOffset = { x: 0, y: 0 };

        // Preview state for drawing
        this.previewElement = null;

        // Tool-specific temp state
        this.toolState = {};

        // Callbacks
        this.onScaleChange = null;
        this.onCalibrated = null;
        this.onHistoryChange = null;
        this.onSelectionChange = null;

        this._setupCanvas();
        this._bindEvents();
    }

    _setupCanvas() {
        this._resize();
        window.addEventListener('resize', () => this._resize());
    }

    _resize() {
        const rect = this.container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';

        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.displayWidth = rect.width;
        this.displayHeight = rect.height;

        this.render();
    }

    _bindEvents() {
        this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));
        this.canvas.addEventListener('mouseleave', (e) => this._onMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this._onWheel(e));
        this.canvas.addEventListener('dblclick', (e) => this._onDoubleClick(e));

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this._onKeyDown(e));
    }

    /**
     * Double-click handler: split a parking row by removing the clicked spot.
     */
    _onDoubleClick(e) {
        if (this.currentTool !== 'select') return;

        const rect = this.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const world = this.screenToWorld(screenX, screenY);

        // Find clicked parking element
        const hit = this._hitTest(world);
        if (!hit || hit.type !== 'parking' || (hit.spotCount || 1) < 2) return;

        // Don't split curved rows (too complex for now)
        if (hit.curveControlPoints && hit.curveControlPoints.length > 0) return;

        const el = hit;
        const ppm = this.pixelsPerMeter || 20;
        const count = el.spotCount || 1;
        const twoFiveM = ppm * 2.5;
        const skewAngle = Math.atan2(el.skewOffset || 0, el.height);
        const cosA = Math.cos(skewAngle);
        const baseSpacing = twoFiveM / cosA;

        // Un-rotate the click point to local coordinates
        const rot = el.rotation || 0;
        const pivotX = el.pivotX != null ? el.pivotX : el.x + el.width / 2;
        const pivotY = el.pivotY != null ? el.pivotY : el.y + el.height / 2;
        const local = this._rotatePoint(world.x, world.y, pivotX, pivotY, -rot);

        // Determine which spot index was clicked
        const spotIdx = Math.floor((local.x - el.x) / baseSpacing);
        if (spotIdx < 0 || spotIdx >= count) return;

        // Remove the original element
        this.removeElement(el);

        // Create left row (spots before the removed one)
        if (spotIdx > 0) {
            const leftRow = {
                ...JSON.parse(JSON.stringify(el)),
                id: Date.now() + Math.random(),
                spotCount: spotIdx,
                width: spotIdx * baseSpacing
            };
            this.elements.push(leftRow);
        }

        // Create right row (spots after the removed one)
        if (spotIdx < count - 1) {
            const rightCount = count - spotIdx - 1;
            // Offset position along the row direction
            const offsetX = (spotIdx + 1) * baseSpacing;
            const rightRow = {
                ...JSON.parse(JSON.stringify(el)),
                id: Date.now() + Math.random() + 0.1,
                spotCount: rightCount,
                width: rightCount * baseSpacing,
                x: el.x + offsetX,
                pivotX: el.x + offsetX
            };
            this.elements.push(rightRow);
        }

        this.selectedElement = null;
        if (this.onSelectionChange) this.onSelectionChange(null);
        this._saveHistory();
        this.render();
    }

    /**
     * Convert screen coordinates to world coordinates.
     */
    screenToWorld(screenX, screenY) {
        return {
            x: (screenX - this.offsetX) / this.scale,
            y: (screenY - this.offsetY) / this.scale
        };
    }

    /**
     * Convert world coordinates to screen coordinates.
     */
    worldToScreen(worldX, worldY) {
        return {
            x: worldX * this.scale + this.offsetX,
            y: worldY * this.scale + this.offsetY
        };
    }

    // ===== Mouse Events =====

    _onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const world = this.screenToWorld(screenX, screenY);
        const screen = { x: screenX, y: screenY };

        // Middle mouse button or space+click for panning
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            this.isPanning = true;
            this.panStart = { x: e.clientX, y: e.clientY };
            this.panOffsetStart = { x: this.offsetX, y: this.offsetY };
            this.canvas.style.cursor = 'grabbing';
            e.preventDefault();
            return;
        }

        if (e.button !== 0) return;

        switch (this.currentTool) {
            case 'select':
                this._handleSelectDown(world, screen, e);
                break;
            case 'parking':
                this._handleParkingDown(world);
                break;
            case 'crosswalk':
                this._handleCrosswalkDown(world);
                break;
            case 'arrow':
                this._handleArrowDown(world);
                break;
            case 'arrow-left':
            case 'arrow-right':
                this._handleTurnArrowDown(world);
                break;
            case 'lane-single':
            case 'lane-double':
                this._handleLaneDown(world);
                break;
            case 'symbol':
                this._handleSymbolDown(world);
                break;
            case 'eraser':
                this._handleEraserDown(world);
                break;
            case 'calibrate':
                this._handleCalibrateDown(world);
                break;
        }
    }

    _onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const world = this.screenToWorld(screenX, screenY);

        if (this.isPanning) {
            this.offsetX = this.panOffsetStart.x + (e.clientX - this.panStart.x);
            this.offsetY = this.panOffsetStart.y + (e.clientY - this.panStart.y);
            this.render();
            return;
        }

        switch (this.currentTool) {
            case 'select':
                this._handleSelectMove(world, e);
                break;
            case 'parking':
                this._handleParkingMove(world);
                break;
            case 'crosswalk':
                this._handleCrosswalkMove(world);
                break;
            case 'arrow':
                this._handleArrowMove(world);
                break;
            case 'arrow-left':
            case 'arrow-right':
                this._handleTurnArrowMove(world);
                break;
            case 'lane-single':
            case 'lane-double':
                this._handleLaneMove(world);
                break;
            case 'eraser':
                this._handleEraserMove(world);
                break;
            case 'calibrate':
                this._handleCalibrateMove(world);
                break;
        }
    }

    _onMouseUp(e) {
        if (this.isPanning) {
            this.isPanning = false;
            this.canvas.style.cursor = this._getCursorForTool();
            return;
        }

        const rect = this.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const world = this.screenToWorld(screenX, screenY);

        switch (this.currentTool) {
            case 'select':
                this._handleSelectUp(world);
                break;
            case 'parking':
                this._handleParkingUp(world);
                break;
            case 'crosswalk':
                this._handleCrosswalkUp(world);
                break;
            case 'arrow':
                this._handleArrowUp(world);
                break;
            case 'arrow-left':
            case 'arrow-right':
                this._handleTurnArrowUp(world);
                break;
            case 'lane-single':
            case 'lane-double':
                this._handleLaneUp(world);
                break;
        }

        this.isDragging = false;
    }

    _onWheel(e) {
        e.preventDefault();

        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
        const newScale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * zoomFactor));

        // Zoom toward mouse position
        const worldBefore = this.screenToWorld(mouseX, mouseY);
        this.scale = newScale;
        const screenAfter = this.worldToScreen(worldBefore.x, worldBefore.y);

        this.offsetX += mouseX - screenAfter.x;
        this.offsetY += mouseY - screenAfter.y;

        if (this.onScaleChange) this.onScaleChange(this.scale);
        this.render();
    }

    _onKeyDown(e) {
        // Only process if drawing phase is active
        if (!document.getElementById('drawing-phase').classList.contains('active')) return;

        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) this.redo();
                else this.undo();
            } else if (e.key === 'y') {
                e.preventDefault();
                this.redo();
            }
        }

        // Tool shortcuts
        switch (e.key.toLowerCase()) {
            case 'v': this.setTool('select'); break;
            case 'p': this.setTool('parking'); break;
            case 'f': this.setTool('crosswalk'); break;
            case 'a': this.setTool('arrow'); break;
            case 'e': this.setTool('eraser'); break;
            case 'k': this.setTool('calibrate'); break;
            case 'r':
                if (this.selectedElement) {
                    this.selectedElement.rotation = (this.selectedElement.rotation || 0) + Math.PI / 2;
                    this._saveHistory();
                    this.render();
                }
                break;
            case 'c':
                // Cycle curve mode: straight → arc (1 CP) → S-shape (2 CPs) → straight
                if (this.selectedElement && this.selectedElement.type === 'parking') {
                    const el = this.selectedElement;
                    const ppm = this.pixelsPerMeter || 20;
                    const count = el.spotCount || 1;
                    const twoFiveM = ppm * 2.5;
                    const skewAngle = Math.atan2(el.skewOffset || 0, el.height);
                    const cosA = Math.cos(skewAngle);
                    const baseSpacing = twoFiveM / cosA;
                    const side = el.skewSide || 'top';
                    const baseY = side === 'top' ? el.y + el.height : el.y;
                    const perpOffset = ppm * 3 * (side === 'top' ? 1 : -1);

                    if (!el.curveControlPoints || el.curveControlPoints.length === 0) {
                        // Straight → Arc (1 control point)
                        const midX = el.x + (count / 2) * baseSpacing;
                        el.curveControlPoints = [{
                            x: midX,
                            y: baseY - perpOffset
                        }];
                    } else if (el.curveControlPoints.length === 1) {
                        // Arc → S-shape (2 control points)
                        const thirdX = el.x + (count / 3) * baseSpacing;
                        const twoThirdX = el.x + (2 * count / 3) * baseSpacing;
                        el.curveControlPoints = [
                            { x: thirdX, y: baseY - perpOffset },
                            { x: twoThirdX, y: baseY + perpOffset }
                        ];
                    } else {
                        // S-shape → Straight (remove all)
                        delete el.curveControlPoints;
                    }
                    this._saveHistory();
                    this.render();
                }
                break;
            case '+':
            case '=':
            case 'arrowup':
                e.preventDefault();
                if (this.selectedElement && this.selectedElement.type === 'parking') {
                    const el = this.selectedElement;
                    const ppm = this.pixelsPerMeter || 20;
                    el.spotCount = (el.spotCount || 1) + 1;
                    const twoFiveM = ppm * 2.5;
                    const skewAngle = Math.atan2(el.skewOffset || 0, el.height);
                    const baseSpacing = twoFiveM / Math.cos(skewAngle);
                    el.width = el.spotCount * baseSpacing;
                    this._saveHistory();
                    this.render();
                } else if (this.selectedElement && this.selectedElement.type === 'crosswalk') {
                    this._adjustCrosswalkStripes(this.selectedElement, 1);
                }
                break;
            case '-':
            case 'arrowdown':
                e.preventDefault();
                if (this.selectedElement && this.selectedElement.type === 'parking' && (this.selectedElement.spotCount || 1) > 1) {
                    const el = this.selectedElement;
                    const ppm = this.pixelsPerMeter || 20;
                    el.spotCount = (el.spotCount || 1) - 1;
                    const twoFiveM = ppm * 2.5;
                    const skewAngle = Math.atan2(el.skewOffset || 0, el.height);
                    const baseSpacing = twoFiveM / Math.cos(skewAngle);
                    el.width = el.spotCount * baseSpacing;
                    this._saveHistory();
                    this.render();
                } else if (this.selectedElement && this.selectedElement.type === 'crosswalk') {
                    this._adjustCrosswalkStripes(this.selectedElement, -1);
                }
                break;
            case 'escape':
                this.previewElement = null;
                this.toolState = {};
                this.calibrationPoints = [];
                this.render();
                break;
            case 'delete':
            case 'backspace':
                if (this.selectedElement) {
                    this.removeElement(this.selectedElement);
                    this.selectedElement = null;
                    if (this.onSelectionChange) this.onSelectionChange(null);
                    this.render();
                }
                break;
        }
    }

    // ===== Tool Handlers =====

    // --- Select Tool ---
    _handleSelectDown(world, screen, event) {
        // Check curve control point handles FIRST (parking only)
        if (this.selectedElement && this.selectedElement.type === 'parking' && this.selectedElement.curveControlPoints) {
            const cpIdx = this._isCurveHandle(screen, this.selectedElement);
            if (cpIdx >= 0) {
                this.isDragging = true;
                this.toolState.curveDragging = true;
                this.toolState.curvePointIndex = cpIdx;
                this.render();
                return;
            }
        }

        // Check skew handle FIRST (parking only) — before rotation and hit-test
        if (this.selectedElement && this.selectedElement.type === 'parking') {
            if (this._isSkewHandle(screen, this.selectedElement)) {
                this.isDragging = true;
                this.toolState.skewing = true;
                this.toolState.skewStartWorld = { x: world.x, y: world.y };
                this.toolState.skewStartOffset = this.selectedElement.skewOffset || 0;
                this.render();
                return;
            }
        }

        // Check rotation handle (skip for parking — parking uses skew handle instead)
        if (this.selectedElement && this.selectedElement.type !== 'parking' && this._isRotationHandle(screen, this.selectedElement)) {
            this.isDragging = true;
            this.toolState.rotating = true;
            this.toolState.rotationStart = Math.atan2(
                world.y - (this.selectedElement.y + this.selectedElement.height / 2),
                world.x - (this.selectedElement.x + this.selectedElement.width / 2)
            );
            this.toolState.startAngle = this.selectedElement.rotation || 0;
            this.render();
            return;
        }

        const hit = this._hitTest(world);
        if (hit) {
            this.selectedElement = hit;
            this.isDragging = true;
            this.dragStart = { x: world.x, y: world.y };

            // Compute drag offset properly accounting for rotation
            // The click is in world space (post-rotation), but el.x/y is pre-rotation.
            // We need to compute the rotated origin to get a correct offset.
            const rot = hit.rotation || 0;
            const pivotX = hit.pivotX != null ? hit.pivotX : hit.x + hit.width / 2;
            const pivotY = hit.pivotY != null ? hit.pivotY : hit.y + hit.height / 2;
            const rotatedOrigin = this._rotatePoint(hit.x, hit.y, pivotX, pivotY, rot);
            this.dragOffset = {
                x: world.x - rotatedOrigin.x,
                y: world.y - rotatedOrigin.y
            };
            this._dragRotatedOriginOffset = {
                x: rotatedOrigin.x - hit.x,
                y: rotatedOrigin.y - hit.y
            };

            // For parking: detect which side was clicked (front/back)
            if (hit.type === 'parking') {
                const local = this._rotatePoint(world.x, world.y, pivotX, pivotY, -rot);
                const midY = hit.y + hit.height / 2;
                hit.skewSide = (local.y < midY) ? 'top' : 'bottom';
            }
        } else {
            this.selectedElement = null;
            // Start panning when clicking empty space
            this.isPanning = true;
            this.panStart = { x: event.clientX, y: event.clientY };
            this.panOffsetStart = { x: this.offsetX, y: this.offsetY };
            this.canvas.style.cursor = 'grabbing';
        }
        if (this.onSelectionChange) this.onSelectionChange(this.selectedElement);
        this.render();
    }

    _handleSelectMove(world, event) {
        if (this.isDragging && this.selectedElement) {
            if (this.toolState.curveDragging) {
                // Move curve control point in world coordinates
                const el = this.selectedElement;
                const rot = el.rotation || 0;
                const pivotX = el.pivotX != null ? el.pivotX : el.x + el.width / 2;
                const pivotY = el.pivotY != null ? el.pivotY : el.y + el.height / 2;
                // Un-rotate the world point to get local coordinates
                const local = this._rotatePoint(world.x, world.y, pivotX, pivotY, -rot);
                el.curveControlPoints[this.toolState.curvePointIndex] = { x: local.x, y: local.y };
            } else if (this.toolState.rotating) {
                const cx = this.selectedElement.x + this.selectedElement.width / 2;
                const cy = this.selectedElement.y + this.selectedElement.height / 2;
                const angle = Math.atan2(world.y - cy, world.x - cx);
                this.selectedElement.rotation = this.toolState.startAngle + (angle - this.toolState.rotationStart);
            } else if (this.toolState.skewing) {
                // Skew: compute how far the cursor moved along the element's width axis
                const el = this.selectedElement;
                const rot = el.rotation || 0;
                const dxWorld = world.x - this.toolState.skewStartWorld.x;
                const dyWorld = world.y - this.toolState.skewStartWorld.y;
                // Local X direction after rotation
                const localXdx = Math.cos(rot);
                const localXdy = Math.sin(rot);
                const projection = dxWorld * localXdx + dyWorld * localXdy;
                el.skewOffset = this.toolState.skewStartOffset + projection;
            } else {
                // Move: reverse the rotation-aware offset to get the new un-rotated position
                const newRotatedOriginX = world.x - this.dragOffset.x;
                const newRotatedOriginY = world.y - this.dragOffset.y;
                const newX = newRotatedOriginX - this._dragRotatedOriginOffset.x;
                const newY = newRotatedOriginY - this._dragRotatedOriginOffset.y;
                const dx = newX - this.selectedElement.x;
                const dy = newY - this.selectedElement.y;
                this.selectedElement.x = newX;
                this.selectedElement.y = newY;
                // Keep pivot in sync with position
                if (this.selectedElement.pivotX != null) {
                    this.selectedElement.pivotX = this.selectedElement.x;
                    this.selectedElement.pivotY = this.selectedElement.y;
                }
                // Move crosswalk path coordinates
                if (this.selectedElement.pathStartX != null) {
                    this.selectedElement.pathStartX += dx;
                    this.selectedElement.pathStartY += dy;
                    this.selectedElement.pathEndX += dx;
                    this.selectedElement.pathEndY += dy;
                }
                // Move arrow / lane-line endpoint
                if (this.selectedElement.endX != null) {
                    this.selectedElement.endX += dx;
                    this.selectedElement.endY += dy;
                }
            }
            this.render();
        } else {
            const hit = this._hitTest(world);
            this.canvas.style.cursor = hit ? 'move' : 'default';
        }
    }

    _handleSelectUp(world) {
        if (this.isDragging && this.selectedElement) {
            this._saveHistory();
        }
        this.isDragging = false;
        this.toolState.rotating = false;
        this.toolState.skewing = false;
        this.toolState.curveDragging = false;
    }

    // --- Parking Spot Tool ---
    _handleParkingDown(world) {
        this.isDragging = true;
        this.dragStart = { x: world.x, y: world.y };
        const ppm = this.pixelsPerMeter || 20;
        this.previewElement = {
            type: 'parking',
            x: world.x,
            y: world.y,
            pivotX: world.x,
            pivotY: world.y,
            width: 0,
            height: ppm * 5,
            color: this.currentColor,
            rotation: 0,
            spotCount: 0,
            horizontal: true,
            skewOffset: 0
        };
    }

    _handleParkingMove(world) {
        if (this.isDragging && this.previewElement) {
            const ppm = this.pixelsPerMeter || 20;
            const dx = world.x - this.dragStart.x;
            const dy = world.y - this.dragStart.y;
            const dragDist = Math.sqrt(dx * dx + dy * dy);

            // Each spot is 2.5m along the drag direction
            const spotSize = ppm * 2.5;
            const depth = ppm * 5;  // 5m perpendicular
            const count = Math.max(1, Math.round(dragDist / spotSize));
            const totalLen = count * spotSize;

            // Drag angle determines rotation
            const angle = Math.atan2(dy, dx);

            // Position: click point = top-left corner of the bounding box
            // The row extends from the click point in the drag direction
            // Width = total row length, Height = 5m depth
            this.previewElement.x = this.dragStart.x;
            this.previewElement.y = this.dragStart.y;
            this.previewElement.width = totalLen;
            this.previewElement.height = depth;
            this.previewElement.rotation = angle;
            this.previewElement.spotCount = count;

            this.render();
        }
    }

    _handleParkingUp(world) {
        if (this.previewElement && this.isDragging) {
            const el = { ...this.previewElement };

            if (el.spotCount > 0 && el.width > 5) {
                this.addElement(el);
            }

            this.previewElement = null;
            this.isDragging = false;
            this.render();
        }
    }

    // --- Crosswalk Tool (two-step: road direction, then crosswalk path) ---
    _handleCrosswalkDown(world) {
        if (!this.crosswalkStep || this.crosswalkStep === 0) {
            // Step 1: Start defining road direction
            this.crosswalkStep = 1;
            this.isDragging = true;
            this.dragStart = { x: world.x, y: world.y };
            this._showCrosswalkHint('Dra i veiretningen (stiperetning)...');
        } else if (this.crosswalkStep === 2) {
            // Step 2: Start defining crosswalk path
            this.crosswalkStep = 3;
            this.isDragging = true;
            this.dragStart = { x: world.x, y: world.y };
            // Read stripe length and width from inputs
            const stripeLenInput = document.getElementById('stripe-length-input');
            const stripeWidthInput = document.getElementById('stripe-width-input');
            const stripeLength = stripeLenInput ? parseFloat(stripeLenInput.value) || 3 : 3;
            const stripeWidth = stripeWidthInput ? parseFloat(stripeWidthInput.value) || 0.3 : 0.3;
            this.previewElement = {
                type: 'crosswalk',
                stripeAngle: this._crosswalkRoadAngle,
                stripeLength: stripeLength,
                stripeWidth: stripeWidth,
                pathStartX: world.x,
                pathStartY: world.y,
                pathEndX: world.x,
                pathEndY: world.y,
                x: world.x,
                y: world.y,
                width: 0,
                height: 0,
                color: this.currentColor,
                rotation: 0
            };
            this._showCrosswalkHint('Dra over veien for fotgjengerfeltet...');
        }
    }

    _handleCrosswalkMove(world) {
        if (this.isDragging && this.crosswalkStep === 1) {
            // Step 1: Show road direction preview line
            this.render();
            const ctx = this.ctx;
            ctx.save();
            ctx.strokeStyle = '#6C63FF';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(this.dragStart.x, this.dragStart.y);
            ctx.lineTo(world.x, world.y);
            ctx.stroke();
            ctx.restore();
        } else if (this.isDragging && this.crosswalkStep === 3 && this.previewElement) {
            // Step 2: Update crosswalk path
            this.previewElement.pathEndX = world.x;
            this.previewElement.pathEndY = world.y;
            this._updateCrosswalkBounds(this.previewElement);
            this.render();
        }
    }

    _handleCrosswalkUp(world) {
        if (this.crosswalkStep === 1) {
            // Step 1 done: save road direction angle
            const dx = world.x - this.dragStart.x;
            const dy = world.y - this.dragStart.y;
            if (Math.sqrt(dx * dx + dy * dy) > 5) {
                this._crosswalkRoadAngle = Math.atan2(dy, dx);
                this.crosswalkStep = 2;
                this.isDragging = false;
                this._showCrosswalkHint('Klikk og dra over veien for fotgjengerfeltet');
            } else {
                // Too short, reset
                this.crosswalkStep = 0;
                this.isDragging = false;
                this._hideCrosswalkHint();
            }
        } else if (this.crosswalkStep === 3) {
            // Step 2 done: finalize crosswalk
            if (this.previewElement) {
                const dx = world.x - this.previewElement.pathStartX;
                const dy = world.y - this.previewElement.pathStartY;
                if (Math.sqrt(dx * dx + dy * dy) > 5) {
                    this.previewElement.pathEndX = world.x;
                    this.previewElement.pathEndY = world.y;
                    this._updateCrosswalkBounds(this.previewElement);
                    const el = { ...this.previewElement };
                    this.addElement(el);
                }
                this.previewElement = null;
            }
            this.crosswalkStep = 0;
            this.isDragging = false;
            this._hideCrosswalkHint();
            this.render();
        }
    }

    _updateCrosswalkBounds(el) {
        const ppm = this.pixelsPerMeter || 20;
        const stripeLen = (el.stripeLength || 2.5) * ppm; // use stored length
        const sa = el.stripeAngle;
        const perpX = Math.cos(sa) * stripeLen;
        const perpY = Math.sin(sa) * stripeLen;

        const xs = [
            el.pathStartX - perpX, el.pathStartX + perpX,
            el.pathEndX - perpX, el.pathEndX + perpX
        ];
        const ys = [
            el.pathStartY - perpY, el.pathStartY + perpY,
            el.pathEndY - perpY, el.pathEndY + perpY
        ];
        el.x = Math.min(...xs);
        el.y = Math.min(...ys);
        el.width = Math.max(...xs) - el.x;
        el.height = Math.max(...ys) - el.y;
    }

    _showCrosswalkHint(text) {
        let hint = document.getElementById('crosswalk-hint');
        if (!hint) {
            hint = document.createElement('div');
            hint.id = 'crosswalk-hint';
            hint.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:rgba(108,99,255,0.9);color:#fff;padding:8px 18px;border-radius:8px;font-size:14px;z-index:999;display:flex;align-items:center;gap:10px;';
            document.body.appendChild(hint);
        }
        // Show stripe length input on step 2 hint
        if (text.includes('over veien')) {
            hint.innerHTML = `<span>${text}</span>
                <label style="display:flex;align-items:center;gap:4px;">Lengde: <input id="stripe-length-input" type="number" value="3" min="0.5" step="0.1" style="width:50px;padding:2px 4px;border-radius:4px;border:none;font-size:14px;text-align:center;"> m</label>
                <label style="display:flex;align-items:center;gap:4px;">Bredde: <input id="stripe-width-input" type="number" value="0.3" min="0.05" step="0.05" style="width:50px;padding:2px 4px;border-radius:4px;border:none;font-size:14px;text-align:center;"> m</label>`;
        } else {
            hint.innerHTML = `<span>${text}</span>`;
        }
        hint.style.display = 'flex';
    }

    _hideCrosswalkHint() {
        const hint = document.getElementById('crosswalk-hint');
        if (hint) hint.style.display = 'none';
    }

    // --- Symbol Tool ---
    _handleSymbolDown(world) {
        const symbolType = this.toolState.symbolType || 'MC';
        const ppm = this.pixelsPerMeter || 20;

        const size = ppm * 2;

        const el = {
            type: 'symbol',
            symbolType: symbolType,
            x: world.x - size / 2,
            y: world.y - size / 2,
            width: size,
            height: size,
            color: this.currentColor,
            rotation: 0
        };

        this.addElement(el);
        this.render();
    }

    // --- Lane Line Tool ---
    _handleLaneDown(world) {
        this.isDragging = true;
        this.dragStart = { x: world.x, y: world.y };
        const isDouble = this.currentTool === 'lane-double';
        const ppm = this.pixelsPerMeter || 20;
        this.previewElement = {
            type: 'lane-line',
            lineStyle: isDouble ? 'double' : 'single',
            x: world.x,
            y: world.y,
            endX: world.x,
            endY: world.y,
            lineWidth: ppm * 0.10,  // 10cm default width
            width: 1,
            height: 1,
            color: this.currentColor,
            rotation: 0
        };
    }

    _handleLaneMove(world) {
        if (this.isDragging && this.previewElement) {
            this.previewElement.endX = world.x;
            this.previewElement.endY = world.y;
            const dx = world.x - this.previewElement.x;
            const dy = world.y - this.previewElement.y;
            this.previewElement.width = Math.abs(dx) || 1;
            this.previewElement.height = Math.abs(dy) || 1;
            this.render();
        }
    }

    _handleLaneUp(world) {
        if (this.previewElement && this.isDragging) {
            const el = { ...this.previewElement };
            const dx = el.endX - el.x;
            const dy = el.endY - el.y;
            if (Math.sqrt(dx * dx + dy * dy) > 5) {
                this.addElement(el);
            }
            this.previewElement = null;
            this.isDragging = false;
            this.render();
        }
    }

    // --- Eraser Tool ---
    // --- Arrow Tool ---
    _handleArrowDown(world) {
        this.isDragging = true;
        this.dragStart = { x: world.x, y: world.y };
        const ppm = this.pixelsPerMeter || 20;
        this.previewElement = {
            type: 'arrow',
            x: world.x,
            y: world.y,
            // Arrow points from (x,y) toward (endX, endY)
            endX: world.x + ppm * 5, // default 5m to the right
            endY: world.y,
            color: this.currentColor,
            rotation: 0,
            // Dimensions used for hit-testing bounding box
            width: ppm * 5,
            height: ppm * 0.75
        };
    }

    _handleArrowMove(world) {
        if (this.isDragging && this.previewElement) {
            this.previewElement.endX = world.x;
            this.previewElement.endY = world.y;
            // Update bounding box for hit testing
            const dx = world.x - this.previewElement.x;
            const dy = world.y - this.previewElement.y;
            this.previewElement.width = Math.abs(dx) || 1;
            this.previewElement.height = Math.abs(dy) || 1;
            this.render();
        }
    }

    _handleArrowUp(world) {
        if (this.previewElement && this.isDragging) {
            const el = { ...this.previewElement };
            const dx = el.endX - el.x;
            const dy = el.endY - el.y;
            const len = Math.sqrt(dx * dx + dy * dy);

            // Only add if it has meaningful length
            if (len > 5) {
                // Normalize to exactly 5 meters if calibrated
                if (this.pixelsPerMeter) {
                    const targetLen = this.pixelsPerMeter * 5;
                    const angle = Math.atan2(dy, dx);
                    el.endX = el.x + Math.cos(angle) * targetLen;
                    el.endY = el.y + Math.sin(angle) * targetLen;
                    el.width = targetLen;
                    el.height = this.pixelsPerMeter * 0.75;
                }
                this.addElement(el);
            }

            this.previewElement = null;
            this.isDragging = false;
            this.render();
        }
    }

    // --- Turn Arrow Tool (drag to set direction) ---
    _handleTurnArrowDown(world) {
        this.isDragging = true;
        this.dragStart = { x: world.x, y: world.y };
        const ppm = this.pixelsPerMeter || 20;
        const totalSize = ppm * 5;
        const direction = this.currentTool === 'arrow-right' ? 'right' : 'left';

        this.previewElement = {
            type: 'turn-arrow',
            direction: direction,
            x: world.x - totalSize / 2,
            y: world.y - totalSize / 2,
            width: totalSize,
            height: totalSize,
            color: this.currentColor,
            rotation: 0
        };
    }

    _handleTurnArrowMove(world) {
        if (this.isDragging && this.previewElement) {
            const dx = world.x - this.dragStart.x;
            const dy = world.y - this.dragStart.y;
            const len = Math.sqrt(dx * dx + dy * dy);

            if (len > 5) {
                // The drag angle sets the rotation of the entire arrow.
                // Default orientation: straight segment goes UP (angle = -π/2)
                // So rotation = dragAngle - (-π/2) = dragAngle + π/2
                const dragAngle = Math.atan2(dy, dx);
                this.previewElement.rotation = dragAngle + Math.PI / 2;
            }

            this.render();
        }
    }

    _handleTurnArrowUp(world) {
        if (this.previewElement && this.isDragging) {
            const dx = world.x - this.dragStart.x;
            const dy = world.y - this.dragStart.y;
            const len = Math.sqrt(dx * dx + dy * dy);

            if (len > 5) {
                const el = { ...this.previewElement };
                this.addElement(el);
            }

            this.previewElement = null;
            this.isDragging = false;
            this.render();
        }
    }

    // --- Eraser Tool ---
    _handleEraserDown(world) {
        const hit = this._hitTest(world);
        if (hit) {
            this.removeElement(hit);
            this.render();
        }
    }

    _handleEraserMove(world) {
        const hit = this._hitTest(world);
        this.canvas.style.cursor = hit ? 'pointer' : 'crosshair';
    }

    // --- Calibrate Tool ---
    _handleCalibrateDown(world) {
        this.calibrationPoints.push({ x: world.x, y: world.y });

        if (this.calibrationPoints.length === 2) {
            const [p1, p2] = this.calibrationPoints;
            const distPx = Math.sqrt(
                Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)
            );

            // One parking spot = 5 meters
            this.pixelsPerMeter = distPx / 5;
            this.calibrationPoints = [];

            if (this.onCalibrated) {
                this.onCalibrated(this.pixelsPerMeter);
            }

            this.setTool('select');
        }

        this.render();
    }

    _handleCalibrateMove(world) {
        if (this.calibrationPoints.length === 1) {
            this.toolState.calibratePreview = { x: world.x, y: world.y };
            this.render();
        }
    }

    // ===== Hit Testing =====

    _hitTest(world) {
        // Test in reverse order (top-most first)
        for (let i = this.elements.length - 1; i >= 0; i--) {
            const el = this.elements[i];
            if (this._pointInElement(world, el)) {
                return el;
            }
        }
        return null;
    }

    _pointInElement(point, el) {
        if (el.type === 'arrow' || el.type === 'lane-line') {
            const endX = el.endX || (el.x + el.width);
            const endY = el.endY || (el.y + el.height);
            return this._pointNearLine(point, el.x, el.y, endX, endY, 15);
        }

        // For rotated elements, un-rotate the test point around the pivot
        let px = point.x, py = point.y;
        const rot = el.rotation || 0;
        if (rot) {
            const cx = el.pivotX != null ? el.pivotX : el.x + el.width / 2;
            const cy = el.pivotY != null ? el.pivotY : el.y + el.height / 2;
            const cos = Math.cos(-rot);
            const sin = Math.sin(-rot);
            const dx = point.x - cx;
            const dy = point.y - cy;
            px = cx + dx * cos - dy * sin;
            py = cy + dx * sin + dy * cos;
        }

        // Parking: point-in-polygon test using staircase geometry
        if (el.type === 'parking') {
            const geo = this._getParkingGeometry(el);
            return this._pointInPolygon(px, py, geo.corners);
        }

        // Bounding box test in local (un-rotated) coordinates
        return px >= el.x && px <= el.x + el.width &&
            py >= el.y && py <= el.y + el.height;
    }

    _pointInPolygon(px, py, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;
            if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
                inside = !inside;
            }
        }
        return inside;
    }

    _pointNearLine(point, x1, y1, x2, y2, threshold) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return false;
        let t = ((point.x - x1) * dx + (point.y - y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const nearX = x1 + t * dx;
        const nearY = y1 + t * dy;
        const dist = Math.sqrt(Math.pow(point.x - nearX, 2) + Math.pow(point.y - nearY, 2));
        return dist < threshold;
    }

    _isRotationHandle(screenPoint, el) {
        const rot = el.rotation || 0;
        const pivotX = el.pivotX != null ? el.pivotX : el.x + el.width / 2;
        const pivotY = el.pivotY != null ? el.pivotY : el.y + el.height / 2;

        // Rotated corners for top edge
        const c0 = this.worldToScreen(...Object.values(this._rotatePoint(el.x, el.y, pivotX, pivotY, rot)));
        const c1 = this.worldToScreen(...Object.values(this._rotatePoint(el.x + el.width, el.y, pivotX, pivotY, rot)));

        const midTopWorld = this._rotatePoint(el.x + el.width / 2, el.y, pivotX, pivotY, rot);
        const midTopScreen = this.worldToScreen(midTopWorld.x, midTopWorld.y);

        const edgeDx = c1.x - c0.x;
        const edgeDy = c1.y - c0.y;
        const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy) || 1;
        const handleX = midTopScreen.x + (-edgeDy / edgeLen * 24);
        const handleY = midTopScreen.y + (edgeDx / edgeLen * 24);

        const dist = Math.sqrt(Math.pow(screenPoint.x - handleX, 2) + Math.pow(screenPoint.y - handleY, 2));
        return dist < 14;
    }

    _isSkewHandle(screenPoint, el) {
        if (el.type !== 'parking') return false;
        // Skip skew handle for curved rows (use curve handles instead)
        if (el.curveControlPoints && el.curveControlPoints.length > 0) return false;
        const geo = this._getParkingGeometry(el);
        const rot = el.rotation || 0;
        const pivotX = el.pivotX != null ? el.pivotX : el.x + el.width / 2;
        const pivotY = el.pivotY != null ? el.pivotY : el.y + el.height / 2;
        // Handle at midpoint of all skewed tips
        const midWorld = this._rotatePoint(geo.tipMidX, geo.tipMidY, pivotX, pivotY, rot);
        const mid = this.worldToScreen(midWorld.x, midWorld.y);
        const dist = Math.sqrt(Math.pow(screenPoint.x - mid.x, 2) + Math.pow(screenPoint.y - mid.y, 2));
        return dist < 25;
    }

    /**
     * Check if a screen point hits a curve control point handle.
     * Returns the index of the hit control point, or -1.
     */
    _isCurveHandle(screenPoint, el) {
        if (!el.curveControlPoints) return -1;
        const rot = el.rotation || 0;
        const pivotX = el.pivotX != null ? el.pivotX : el.x + el.width / 2;
        const pivotY = el.pivotY != null ? el.pivotY : el.y + el.height / 2;
        for (let i = 0; i < el.curveControlPoints.length; i++) {
            const cp = el.curveControlPoints[i];
            const cpWorld = this._rotatePoint(cp.x, cp.y, pivotX, pivotY, rot);
            const cpScreen = this.worldToScreen(cpWorld.x, cpWorld.y);
            const dist = Math.sqrt(Math.pow(screenPoint.x - cpScreen.x, 2) + Math.pow(screenPoint.y - cpScreen.y, 2));
            if (dist < 20) return i;
        }
        return -1;
    }

    // Compute parking geometry (matches perpendicular-edge rectangle renderer)
    _getParkingGeometry(el) {
        const ppm = this.pixelsPerMeter || 20;
        const count = el.spotCount || 1;
        const skew = el.skewOffset || 0;
        const side = el.skewSide || 'top';
        const h = el.height;
        const fiveM = ppm * 5;
        const twoFiveM = ppm * 2.5;

        // Curved row geometry (1 CP = arc, 2 CPs = S-shape)
        if (el.curveControlPoints && el.curveControlPoints.length > 0) {
            const skewAngle = Math.atan2(skew, h);
            const cosA = Math.cos(skewAngle);
            const baseSpacing = twoFiveM / cosA;
            const sideSign = side === 'top' ? 1 : -1;

            // Start and end points of the base edge
            const baseY = side === 'top' ? el.y + h : el.y;
            const p0 = { x: el.x, y: baseY };
            const pEnd = { x: el.x + count * baseSpacing, y: baseY };
            const cps = el.curveControlPoints;

            // Sample all spot corners along the curve
            const totalLen = this._curveLength(p0, cps, pEnd);
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

            for (let i = 0; i < count; i++) {
                const centerLen = (i + 0.5) * (totalLen / count);
                const t = this._curveTForLength(p0, cps, pEnd, centerLen);
                const pt = this._curvePoint(p0, cps, pEnd, t);
                const tan = this._curveTangent(p0, cps, pEnd, t);
                const tanLen = Math.sqrt(tan.x * tan.x + tan.y * tan.y) || 1;
                const tx = tan.x / tanLen;
                const ty = tan.y / tanLen;
                const nx = -ty * sideSign;
                const ny = tx * sideSign;

                const halfW = twoFiveM / 2;
                const pts = [
                    { x: pt.x - tx * halfW, y: pt.y - ty * halfW },
                    { x: pt.x + tx * halfW, y: pt.y + ty * halfW },
                    { x: pt.x + tx * halfW + nx * fiveM, y: pt.y + ty * halfW + ny * fiveM },
                    { x: pt.x - tx * halfW + nx * fiveM, y: pt.y - ty * halfW + ny * fiveM }
                ];
                for (const p of pts) {
                    minX = Math.min(minX, p.x);
                    minY = Math.min(minY, p.y);
                    maxX = Math.max(maxX, p.x);
                    maxY = Math.max(maxY, p.y);
                }
            }

            // Tip midpoint
            const midPt = this._curvePoint(p0, cps, pEnd, 0.5);
            const midTan = this._curveTangent(p0, cps, pEnd, 0.5);
            const midTanLen = Math.sqrt(midTan.x * midTan.x + midTan.y * midTan.y) || 1;
            const mnx = (-midTan.y / midTanLen) * sideSign;
            const mny = (midTan.x / midTanLen) * sideSign;
            const tipMidX = midPt.x + mnx * fiveM;
            const tipMidY = midPt.y + mny * fiveM;

            return {
                baseY, skewAngle, count, baseSpacing: totalLen / count,
                divDx: 0, divDy: 0,
                tipMidX, tipMidY,
                curved: true,
                corners: [
                    { x: minX, y: maxY },
                    { x: maxX, y: maxY },
                    { x: maxX, y: minY },
                    { x: minX, y: minY }
                ]
            };
        }

        // Straight row geometry (original)
        const skewAngle = Math.atan2(skew, h);
        const cosA = Math.cos(skewAngle);
        const sinA = Math.sin(skewAngle);
        const baseY = side === 'top' ? el.y + h : el.y;

        const sideSign = side === 'top' ? 1 : -1;
        const divDx = sideSign * fiveM * sinA;
        const divDy = -sideSign * fiveM * cosA;

        const perpDx = cosA * twoFiveM;
        const perpDy = sinA * twoFiveM;
        const halfPerpDx = perpDx / 2;
        const halfPerpDy = perpDy / 2;
        const baseSpacing = twoFiveM / cosA;

        // Compute bounding box from all spot corners
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i < count; i++) {
            const cx = el.x + (i + 0.5) * baseSpacing;
            const pts = [
                { x: cx - halfPerpDx, y: baseY - halfPerpDy },
                { x: cx + halfPerpDx, y: baseY + halfPerpDy },
                { x: cx + halfPerpDx + divDx, y: baseY + halfPerpDy + divDy },
                { x: cx - halfPerpDx + divDx, y: baseY - halfPerpDy + divDy }
            ];
            for (const p of pts) {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
            }
        }

        // Tip midpoint (center of the tip edge of the middle of the row)
        const tipMidX = el.x + (count / 2) * baseSpacing + divDx;
        const tipMidY = baseY + divDy;

        return {
            baseY, skewAngle, count, baseSpacing, divDx, divDy,
            tipMidX, tipMidY,
            corners: [
                { x: minX, y: maxY },
                { x: maxX, y: maxY },
                { x: maxX, y: minY },
                { x: minX, y: minY }
            ]
        };
    }

    _rotatePoint(px, py, cx, cy, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return {
            x: cx + (px - cx) * cos - (py - cy) * sin,
            y: cy + (px - cx) * sin + (py - cy) * cos
        };
    }

    // ===== Bézier Curve Helpers =====

    // --- Quadratic (1 control point) ---

    _bezierQuadPoint(p0, p1, p2, t) {
        const mt = 1 - t;
        return {
            x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
            y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y
        };
    }

    _bezierQuadTangent(p0, p1, p2, t) {
        const mt = 1 - t;
        return {
            x: 2 * mt * (p1.x - p0.x) + 2 * t * (p2.x - p1.x),
            y: 2 * mt * (p1.y - p0.y) + 2 * t * (p2.y - p1.y)
        };
    }

    // --- Cubic (2 control points) ---

    _bezierCubicPoint(p0, p1, p2, p3, t) {
        const mt = 1 - t;
        const mt2 = mt * mt;
        const t2 = t * t;
        return {
            x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
            y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y
        };
    }

    _bezierCubicTangent(p0, p1, p2, p3, t) {
        const mt = 1 - t;
        return {
            x: 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
            y: 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y)
        };
    }

    // --- Generic dispatchers (work with 1 or 2 control points) ---

    /**
     * Evaluate curve at parameter t.
     * @param {Object} p0 - start point
     * @param {Array} cps - array of 1 or 2 control points
     * @param {Object} pEnd - end point
     */
    _curvePoint(p0, cps, pEnd, t) {
        if (cps.length === 1) return this._bezierQuadPoint(p0, cps[0], pEnd, t);
        return this._bezierCubicPoint(p0, cps[0], cps[1], pEnd, t);
    }

    _curveTangent(p0, cps, pEnd, t) {
        if (cps.length === 1) return this._bezierQuadTangent(p0, cps[0], pEnd, t);
        return this._bezierCubicTangent(p0, cps[0], cps[1], pEnd, t);
    }

    _curveLength(p0, cps, pEnd, segments = 50) {
        let length = 0;
        let prev = p0;
        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const pt = this._curvePoint(p0, cps, pEnd, t);
            const dx = pt.x - prev.x;
            const dy = pt.y - prev.y;
            length += Math.sqrt(dx * dx + dy * dy);
            prev = pt;
        }
        return length;
    }

    _curveTForLength(p0, cps, pEnd, targetLen, segments = 50) {
        let length = 0;
        let prev = p0;
        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const pt = this._curvePoint(p0, cps, pEnd, t);
            const dx = pt.x - prev.x;
            const dy = pt.y - prev.y;
            const segLen = Math.sqrt(dx * dx + dy * dy);
            if (length + segLen >= targetLen) {
                const frac = (targetLen - length) / segLen;
                return (i - 1 + frac) / segments;
            }
            length += segLen;
            prev = pt;
        }
        return 1;
    }

    /**
     * Add or remove stripes from a crosswalk.
     * @param {Object} el - crosswalk element
     * @param {number} delta - +1 to add a stripe, -1 to remove
     */
    _adjustCrosswalkStripes(el, delta) {
        const ppm = this.pixelsPerMeter || 20;
        const stripeWidthM = el.stripeWidth || 0.3;
        const stripeWidthPx = Math.max(2, ppm * stripeWidthM);
        const stepPx = stripeWidthPx * 2; // stripe + gap

        if (el.stripeAngle != null) {
            // Path-based crosswalk: extend/shrink path end
            const pdx = el.pathEndX - el.pathStartX;
            const pdy = el.pathEndY - el.pathStartY;
            const pathLen = Math.sqrt(pdx * pdx + pdy * pdy);

            // Current stripe count
            const sa = el.stripeAngle;
            const roadPerpX = -Math.sin(sa);
            const roadPerpY = Math.cos(sa);
            const pux = pdx / pathLen;
            const puy = pdy / pathLen;
            const perpPerPath = Math.abs(pux * roadPerpX + puy * roadPerpY);
            const pathStep = perpPerPath > 0.01 ? stepPx / perpPerPath : stepPx;
            const currentCount = Math.floor(pathLen / pathStep);
            const newCount = Math.max(1, currentCount + delta);

            // Extend/shrink path end
            const newPathLen = (newCount + 0.5) * pathStep;
            const scale = newPathLen / pathLen;
            el.pathEndX = el.pathStartX + pdx * scale;
            el.pathEndY = el.pathStartY + pdy * scale;

            // Update bounding box
            el.width = Math.abs(el.pathEndX - el.pathStartX);
            el.height = Math.abs(el.pathEndY - el.pathStartY);
        } else {
            // Legacy crosswalk: adjust width or height
            const isHorizontal = Math.abs(el.width) > Math.abs(el.height);
            if (isHorizontal) {
                el.width += delta * stepPx;
                el.width = Math.max(stepPx, el.width);
            } else {
                el.height += delta * stepPx;
                el.height = Math.max(stepPx, el.height);
            }
        }

        this._saveHistory();
        this.render();
    }

    // ===== Element Management =====

    addElement(el) {
        el.id = Date.now() + Math.random();
        this.elements.push(el);
        this._saveHistory();
    }

    removeElement(el) {
        const idx = this.elements.indexOf(el);
        if (idx !== -1) {
            this.elements.splice(idx, 1);
            this._saveHistory();
        }
    }

    // ===== History =====

    _saveHistory() {
        // Remove future history if we're in the middle
        this.history = this.history.slice(0, this.historyIndex + 1);

        // Save current state
        this.history.push(JSON.parse(JSON.stringify(this.elements)));

        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }

        this.historyIndex = this.history.length - 1;

        if (this.onHistoryChange) {
            this.onHistoryChange(this.historyIndex > 0, this.historyIndex < this.history.length - 1);
        }
    }

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.elements = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
            this.selectedElement = null;
            this.render();

            if (this.onHistoryChange) {
                this.onHistoryChange(this.historyIndex > 0, this.historyIndex < this.history.length - 1);
            }
        }
    }

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.elements = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
            this.selectedElement = null;
            this.render();

            if (this.onHistoryChange) {
                this.onHistoryChange(this.historyIndex > 0, this.historyIndex < this.history.length - 1);
            }
        }
    }

    // ===== Tool & State setters =====

    setTool(tool) {
        this.currentTool = tool;
        this.previewElement = null;
        // Preserve symbolType when switching tools
        const savedSymbolType = this.toolState.symbolType;
        this.toolState = {};
        if (tool === 'symbol' && savedSymbolType) {
            this.toolState.symbolType = savedSymbolType;
        }
        this.calibrationPoints = [];
        // Reset crosswalk two-step state
        this.crosswalkStep = 0;
        this._hideCrosswalkHint();
        this.canvas.style.cursor = this._getCursorForTool();

        // Update toolbar UI
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });

        // Toggle calibration overlay
        const calOverlay = document.getElementById('calibration-overlay');
        if (calOverlay) {
            calOverlay.classList.toggle('hidden', tool !== 'calibrate');
        }
    }

    setColor(color) {
        this.currentColor = color;
    }

    setSymbolType(type) {
        this.toolState.symbolType = type;
    }

    _getCursorForTool() {
        switch (this.currentTool) {
            case 'select': return 'default';
            case 'parking': return 'crosshair';
            case 'crosswalk': return 'crosshair';
            case 'arrow': return 'crosshair';
            case 'arrow-left': return 'crosshair';
            case 'arrow-right': return 'crosshair';
            case 'lane-single': return 'crosshair';
            case 'lane-double': return 'crosshair';
            case 'symbol': return 'copy';
            case 'eraser': return 'pointer';
            case 'calibrate': return 'crosshair';
            default: return 'default';
        }
    }

    // ===== Background =====

    setBackground(imageOrCanvas) {
        this.backgroundImage = imageOrCanvas;
        if (imageOrCanvas) {
            this.bgWidth = imageOrCanvas.width;
            this.bgHeight = imageOrCanvas.height;
            this.fitToView();
        }
    }

    // ===== View =====

    fitToView() {
        if (!this.bgWidth || !this.bgHeight) return;

        const padding = 40;
        const scaleX = (this.displayWidth - padding * 2) / this.bgWidth;
        const scaleY = (this.displayHeight - padding * 2) / this.bgHeight;

        this.scale = Math.min(scaleX, scaleY);
        this.offsetX = (this.displayWidth - this.bgWidth * this.scale) / 2;
        this.offsetY = (this.displayHeight - this.bgHeight * this.scale) / 2;

        if (this.onScaleChange) this.onScaleChange(this.scale);
        this.render();
    }

    zoomIn() {
        const center = { x: this.displayWidth / 2, y: this.displayHeight / 2 };
        const worldBefore = this.screenToWorld(center.x, center.y);
        this.scale = Math.min(this.maxScale, this.scale * 1.25);
        const screenAfter = this.worldToScreen(worldBefore.x, worldBefore.y);
        this.offsetX += center.x - screenAfter.x;
        this.offsetY += center.y - screenAfter.y;
        if (this.onScaleChange) this.onScaleChange(this.scale);
        this.render();
    }

    zoomOut() {
        const center = { x: this.displayWidth / 2, y: this.displayHeight / 2 };
        const worldBefore = this.screenToWorld(center.x, center.y);
        this.scale = Math.max(this.minScale, this.scale * 0.8);
        const screenAfter = this.worldToScreen(worldBefore.x, worldBefore.y);
        this.offsetX += center.x - screenAfter.x;
        this.offsetY += center.y - screenAfter.y;
        if (this.onScaleChange) this.onScaleChange(this.scale);
        this.render();
    }

    // ===== Rendering =====

    render() {
        const ctx = this.ctx;
        const w = this.displayWidth;
        const h = this.displayHeight;

        // Clear
        ctx.clearRect(0, 0, w, h);

        // Apply transform
        ctx.save();
        ctx.translate(this.offsetX, this.offsetY);
        ctx.scale(this.scale, this.scale);

        // Draw background
        if (this.backgroundImage) {
            ctx.drawImage(this.backgroundImage, 0, 0, this.bgWidth, this.bgHeight);
        }

        // Draw all elements
        for (const el of this.elements) {
            this._renderElement(ctx, el, el === this.selectedElement);
        }

        // Draw preview element
        if (this.previewElement) {
            this._renderElement(ctx, this.previewElement, false, true);
        }

        // Draw calibration points and line
        this._renderCalibration(ctx);

        ctx.restore();

        // Draw selection handles (in screen coords)
        if (this.selectedElement) {
            this._renderSelectionHandles(ctx);
        }
    }

    _renderElement(ctx, el, selected = false, preview = false) {
        ctx.save();

        // Apply rotation (skip for path-based crosswalks which handle rotation internally)
        if (el.rotation && !(el.type === 'crosswalk' && el.stripeAngle != null)) {
            // Use custom pivot if set, otherwise center
            const cx = el.pivotX != null ? el.pivotX : el.x + el.width / 2;
            const cy = el.pivotY != null ? el.pivotY : el.y + el.height / 2;
            ctx.translate(cx, cy);
            ctx.rotate(el.rotation);
            ctx.translate(-cx, -cy);
        }

        if (preview) ctx.globalAlpha = 0.5;

        switch (el.type) {
            case 'parking':
                this._drawParkingSpot(ctx, el);
                break;
            case 'crosswalk':
                this._drawCrosswalk(ctx, el);
                break;
            case 'arrow':
                this._drawArrow(ctx, el);
                break;
            case 'turn-arrow':
                this._drawTurnArrow(ctx, el);
                break;
            case 'lane-line':
                this._drawLaneLine(ctx, el);
                break;
            case 'symbol':
                this._drawSymbol(ctx, el);
                break;
        }

        ctx.restore();
    }

    _drawParkingSpot(ctx, el) {
        const ppm = this.pixelsPerMeter || 20;
        const lineWidth = Math.max(2, ppm * 0.08);
        const count = el.spotCount || 1;
        const skew = el.skewOffset || 0;
        const side = el.skewSide || 'top';
        const h = el.height;
        const fiveM = ppm * 5;
        const twoFiveM = ppm * 2.5;

        ctx.strokeStyle = el.color;
        ctx.lineWidth = lineWidth;
        ctx.setLineDash([]);

        // ---- Curved row rendering (arc or S-shape) ----
        if (el.curveControlPoints && el.curveControlPoints.length > 0) {
            const skewAngle = Math.atan2(skew, h);
            const cosA = Math.cos(skewAngle);
            const baseSpacing = twoFiveM / cosA;
            const sideSign = side === 'top' ? 1 : -1;
            const baseY = side === 'top' ? el.y + h : el.y;

            // Curve endpoints and control points
            const p0 = { x: el.x, y: baseY };
            const pEnd = { x: el.x + count * baseSpacing, y: baseY };
            const cps = el.curveControlPoints;

            const totalLen = this._curveLength(p0, cps, pEnd);
            const spotLen = totalLen / count;

            for (let i = 0; i < count; i++) {
                const centerLen = (i + 0.5) * spotLen;
                const t = this._curveTForLength(p0, cps, pEnd, centerLen);
                const pt = this._curvePoint(p0, cps, pEnd, t);
                const tan = this._curveTangent(p0, cps, pEnd, t);
                const tanLen = Math.sqrt(tan.x * tan.x + tan.y * tan.y) || 1;
                const tx = tan.x / tanLen;
                const ty = tan.y / tanLen;
                // Normal perpendicular to tangent (toward tip side)
                const nx = -ty * sideSign;
                const ny = tx * sideSign;

                const halfW = twoFiveM / 2;
                // Four corners of the spot
                const blX = pt.x - tx * halfW;
                const blY = pt.y - ty * halfW;
                const brX = pt.x + tx * halfW;
                const brY = pt.y + ty * halfW;
                const trX = brX + nx * fiveM;
                const trY = brY + ny * fiveM;
                const tlX = blX + nx * fiveM;
                const tlY = blY + ny * fiveM;

                ctx.beginPath();
                ctx.moveTo(blX, blY);
                ctx.lineTo(brX, brY);
                ctx.lineTo(trX, trY);
                ctx.lineTo(tlX, tlY);
                ctx.closePath();

                ctx.fillStyle = el.color + '15';
                ctx.fill();
                ctx.stroke();

                // Helper lines for curved spots
                if (this.showHelperLines) {
                    const helperExtra = ppm * 6.5;
                    ctx.save();
                    ctx.strokeStyle = el.color;
                    ctx.lineWidth = lineWidth;
                    ctx.setLineDash([6, 6]);
                    // Left edge tip
                    ctx.beginPath();
                    ctx.moveTo(tlX, tlY);
                    ctx.lineTo(tlX + nx * helperExtra, tlY + ny * helperExtra);
                    ctx.stroke();
                    // Right edge tip
                    ctx.beginPath();
                    ctx.moveTo(trX, trY);
                    ctx.lineTo(trX + nx * helperExtra, trY + ny * helperExtra);
                    ctx.stroke();
                    ctx.restore();
                }
            }

            // Draw the Bézier curve base line (dashed, for visual reference)
            ctx.save();
            ctx.strokeStyle = el.color + '60';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            if (cps.length === 1) {
                ctx.quadraticCurveTo(cps[0].x, cps[0].y, pEnd.x, pEnd.y);
            } else {
                ctx.bezierCurveTo(cps[0].x, cps[0].y, cps[1].x, cps[1].y, pEnd.x, pEnd.y);
            }
            ctx.stroke();
            ctx.restore();

            ctx.setLineDash([]);
            return;
        }

        // ---- Straight row rendering (original) ----
        const skewAngle = Math.atan2(skew, h);
        const cosA = Math.cos(skewAngle);
        const sinA = Math.sin(skewAngle);
        const baseY = side === 'top' ? el.y + h : el.y;

        // Dividing line vector (5m, tilted by skew)
        const sideSign = side === 'top' ? 1 : -1;
        const divDx = sideSign * fiveM * sinA;
        const divDy = -sideSign * fiveM * cosA;

        // Perpendicular direction (always rightward along row, 2.5m)
        const perpDx = cosA * twoFiveM;
        const perpDy = sinA * twoFiveM;
        const halfPerpDx = perpDx / 2;
        const halfPerpDy = perpDy / 2;

        // Base spacing: ensures 2.5m perpendicular distance between dividing lines
        const baseSpacing = twoFiveM / cosA;

        // Draw each spot as a 2.5m × 5m rectangle (perpendicular edges at both front and back)
        for (let i = 0; i < count; i++) {
            // Center of this spot's base edge
            const cx = el.x + (i + 0.5) * baseSpacing;

            // Four corners (true rectangle in the rotated frame)
            const blX = cx - halfPerpDx;                   // base-left
            const blY = baseY - halfPerpDy;
            const brX = cx + halfPerpDx;                   // base-right
            const brY = baseY + halfPerpDy;
            const trX = brX + divDx;                       // tip-right
            const trY = brY + divDy;
            const tlX = blX + divDx;                       // tip-left
            const tlY = blY + divDy;

            ctx.beginPath();
            ctx.moveTo(blX, blY);
            ctx.lineTo(brX, brY);
            ctx.lineTo(trX, trY);
            ctx.lineTo(tlX, tlY);
            ctx.closePath();

            ctx.fillStyle = el.color + '15';
            ctx.fill();
            ctx.stroke();
        }

        // Draw 6.5m helper lines extending from each spot's left and right tip edges
        if (this.showHelperLines) {
            const helperExtra = ppm * 6.5;
            const hux = divDx / fiveM;
            const huy = divDy / fiveM;

            ctx.strokeStyle = el.color;
            ctx.lineWidth = lineWidth;
            ctx.setLineDash([6, 6]);

            for (let i = 0; i < count; i++) {
                const cx = el.x + (i + 0.5) * baseSpacing;

                // Left edge tip
                const ltX = cx - halfPerpDx + divDx;
                const ltY = baseY - halfPerpDy + divDy;
                ctx.beginPath();
                ctx.moveTo(ltX, ltY);
                ctx.lineTo(ltX + hux * helperExtra, ltY + huy * helperExtra);
                ctx.stroke();

                // Right edge tip
                const rtX = cx + halfPerpDx + divDx;
                const rtY = baseY + halfPerpDy + divDy;
                ctx.beginPath();
                ctx.moveTo(rtX, rtY);
                ctx.lineTo(rtX + hux * helperExtra, rtY + huy * helperExtra);
                ctx.stroke();
            }
            ctx.setLineDash([]);
        }
    }

    _drawCrosswalk(ctx, el) {
        const ppm = this.pixelsPerMeter || 20;
        // Use stored values or defaults
        const stripeWidthM = el.stripeWidth || 0.3;
        const stripeWidth = Math.max(2, ppm * stripeWidthM);
        const gap = stripeWidth; // gap = same as stripe width
        // Use stored stripeLength or default 3m
        const stripeLen = el.stripeLength ? ppm * el.stripeLength : ppm * 3;

        ctx.fillStyle = el.color;

        // New path-based crosswalk (has stripeAngle)
        if (el.stripeAngle != null) {
            const sa = el.stripeAngle;
            // Path direction
            const pdx = el.pathEndX - el.pathStartX;
            const pdy = el.pathEndY - el.pathStartY;
            const pathLen = Math.sqrt(pdx * pdx + pdy * pdy);
            if (pathLen < 1) return;

            // Path unit vector
            const pux = pdx / pathLen;
            const puy = pdy / pathLen;

            // Road perpendicular direction
            const roadPerpX = -Math.sin(sa);
            const roadPerpY = Math.cos(sa);

            // Perpendicular spacing between stripes = stripeWidth (gap = stripe width)
            const perpStep = stripeWidth + gap;  // = 2 * stripeWidth

            // How much perpendicular distance each unit of path covers
            const perpPerPath = Math.abs(pux * roadPerpX + puy * roadPerpY);

            // Step along the path to achieve perpStep perpendicular spacing
            const pathStep = perpPerPath > 0.01 ? perpStep / perpPerPath : perpStep;
            const count = Math.floor(pathLen / pathStep);

            for (let i = 0; i <= count; i++) {
                const t = i * pathStep;
                const cx = el.pathStartX + pux * t;
                const cy = el.pathStartY + puy * t;

                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(sa);
                ctx.fillRect(-stripeLen / 2, -stripeWidth / 2, stripeLen, stripeWidth);
                ctx.restore();
            }
        } else {
            // Legacy: simple horizontal/vertical crosswalk
            const isHorizontal = Math.abs(el.width) > Math.abs(el.height);
            if (isHorizontal) {
                let x = el.x;
                while (x < el.x + el.width) {
                    ctx.fillRect(x, el.y, stripeWidth, el.height);
                    x += stripeWidth + gap;
                }
            } else {
                let y = el.y;
                while (y < el.y + el.height) {
                    ctx.fillRect(el.x, y, el.width, stripeWidth);
                    y += stripeWidth + gap;
                }
            }
        }
    }

    _drawLaneLine(ctx, el) {
        const ppm = this.pixelsPerMeter || 20;
        const lw = el.lineWidth || Math.max(2, ppm * 0.10);
        const gapSize = ppm * 0.10; // 10cm gap for double lines

        const dx = el.endX - el.x;
        const dy = el.endY - el.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) return;

        const angle = Math.atan2(dy, dx);
        const perpX = Math.cos(angle + Math.PI / 2);
        const perpY = Math.sin(angle + Math.PI / 2);

        ctx.save();
        ctx.lineCap = 'round';
        ctx.setLineDash([]);

        if (el.lineStyle === 'double') {
            // Two parallel lines with gap between
            const offset = (lw + gapSize) / 2;

            // Outline
            ctx.strokeStyle = '#333';
            ctx.lineWidth = lw + 3;
            ctx.beginPath();
            ctx.moveTo(el.x + perpX * offset, el.y + perpY * offset);
            ctx.lineTo(el.endX + perpX * offset, el.endY + perpY * offset);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(el.x - perpX * offset, el.y - perpY * offset);
            ctx.lineTo(el.endX - perpX * offset, el.endY - perpY * offset);
            ctx.stroke();

            // Colored lines
            ctx.strokeStyle = el.color;
            ctx.lineWidth = lw;
            ctx.beginPath();
            ctx.moveTo(el.x + perpX * offset, el.y + perpY * offset);
            ctx.lineTo(el.endX + perpX * offset, el.endY + perpY * offset);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(el.x - perpX * offset, el.y - perpY * offset);
            ctx.lineTo(el.endX - perpX * offset, el.endY - perpY * offset);
            ctx.stroke();
        } else {
            // Single line with outline
            ctx.strokeStyle = '#333';
            ctx.lineWidth = lw + 3;
            ctx.beginPath();
            ctx.moveTo(el.x, el.y);
            ctx.lineTo(el.endX, el.endY);
            ctx.stroke();

            ctx.strokeStyle = el.color;
            ctx.lineWidth = lw;
            ctx.beginPath();
            ctx.moveTo(el.x, el.y);
            ctx.lineTo(el.endX, el.endY);
            ctx.stroke();
        }

        ctx.restore();
    }

    _drawArrow(ctx, el) {
        const ppm = this.pixelsPerMeter || 20;
        const dx = el.endX - el.x;
        const dy = el.endY - el.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) return;

        const angle = Math.atan2(dy, dx);

        // Arrow dimensions in pixels (based on calibration)
        const headLength = ppm * 2;    // 2 meter arrowhead length
        const headWidth = ppm * 0.75;  // 75 cm arrowhead width (half on each side)
        const shaftWidth = Math.max(2, ppm * 0.12); // shaft thickness

        ctx.save();
        ctx.lineCap = 'round';
        ctx.setLineDash([]);

        // Calculate key points
        const shaftEndX = el.endX - Math.cos(angle) * headLength;
        const shaftEndY = el.endY - Math.sin(angle) * headLength;
        const perpAngle = angle + Math.PI / 2;
        const halfWidth = headWidth / 2;

        // Draw dark outline first for visibility on light backgrounds
        ctx.strokeStyle = '#333';
        ctx.lineWidth = shaftWidth + 4;
        ctx.beginPath();
        ctx.moveTo(el.x, el.y);
        ctx.lineTo(shaftEndX, shaftEndY);
        ctx.stroke();

        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.moveTo(el.endX, el.endY);
        ctx.lineTo(shaftEndX + Math.cos(perpAngle) * (halfWidth + 2), shaftEndY + Math.sin(perpAngle) * (halfWidth + 2));
        ctx.lineTo(shaftEndX - Math.cos(perpAngle) * (halfWidth + 2), shaftEndY - Math.sin(perpAngle) * (halfWidth + 2));
        ctx.closePath();
        ctx.fill();

        // Draw colored shaft
        ctx.strokeStyle = el.color;
        ctx.lineWidth = shaftWidth;
        ctx.beginPath();
        ctx.moveTo(el.x, el.y);
        ctx.lineTo(shaftEndX, shaftEndY);
        ctx.stroke();

        // Draw colored arrowhead
        ctx.fillStyle = el.color;
        ctx.beginPath();
        ctx.moveTo(el.endX, el.endY);
        ctx.lineTo(shaftEndX + Math.cos(perpAngle) * halfWidth, shaftEndY + Math.sin(perpAngle) * halfWidth);
        ctx.lineTo(shaftEndX - Math.cos(perpAngle) * halfWidth, shaftEndY - Math.sin(perpAngle) * halfWidth);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }
    _drawTurnArrow(ctx, el) {
        const ppm = this.pixelsPerMeter || 20;
        const shaftWidth = Math.max(2, ppm * 0.12);
        const headLength = ppm * 2;     // 2m arrowhead
        const headWidth = ppm * 0.75;   // 75cm arrowhead width
        const straightLen = ppm * 3;    // 3m straight segment
        const turnLen = ppm * 2;        // 2m turn segment (including arrowhead)

        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const isRight = el.direction === 'right';

        // Arrow goes from bottom-center upward, then turns left or right
        const startX = cx;
        const startY = cy + straightLen / 2;
        const cornerX = cx;
        const cornerY = cy - straightLen / 2;
        const turnDir = isRight ? 1 : -1;
        const endX = cx + turnDir * turnLen;
        const endY = cornerY;
        const shaftEndX = endX - turnDir * headLength;
        const shaftEndY = cornerY;
        const halfHead = headWidth / 2;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([]);

        // Draw dark outline first for visibility on light backgrounds
        ctx.strokeStyle = '#333';
        ctx.lineWidth = shaftWidth + 4;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(cornerX, cornerY);
        ctx.lineTo(shaftEndX, shaftEndY);
        ctx.stroke();

        // Arrowhead outline
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(shaftEndX, shaftEndY - halfHead - 2);
        ctx.lineTo(shaftEndX, shaftEndY + halfHead + 2);
        ctx.closePath();
        ctx.fill();

        // Draw colored shaft on top
        ctx.strokeStyle = el.color;
        ctx.lineWidth = shaftWidth;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(cornerX, cornerY);
        ctx.lineTo(shaftEndX, shaftEndY);
        ctx.stroke();

        // Draw colored arrowhead
        ctx.fillStyle = el.color;
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(shaftEndX, shaftEndY - halfHead);
        ctx.lineTo(shaftEndX, shaftEndY + halfHead);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    _drawSymbol(ctx, el) {
        const size = Math.min(el.width, el.height);
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;

        // Circle background
        ctx.beginPath();
        ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
        ctx.fillStyle = el.color + '20';
        ctx.fill();
        ctx.strokeStyle = el.color;
        ctx.lineWidth = Math.max(1.5, size * 0.04);
        ctx.stroke();

        // Symbol text
        ctx.fillStyle = el.color;
        ctx.font = `bold ${size * 0.35}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        let label = el.symbolType;
        if (el.symbolType === 'El-bil') label = '⚡';
        if (el.symbolType === 'HC') label = '♿';
        if (el.symbolType === 'Sykkel') label = '🚲';
        if (el.symbolType === 'MC') label = 'MC';

        ctx.fillText(label, cx, cy);
    }

    _renderCalibration(ctx) {
        if (this.calibrationPoints.length === 0) return;

        const p1 = this.calibrationPoints[0];

        // Draw first point
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw line preview
        if (this.toolState.calibratePreview) {
            const p2 = this.toolState.calibratePreview;

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Show distance
            const distPx = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;

            ctx.fillStyle = '#ef4444';
            ctx.font = 'bold 14px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`${distPx.toFixed(0)} px = 5 m`, midX, midY - 12);

            // Draw second endpoint preview
            ctx.beginPath();
            ctx.arc(p2.x, p2.y, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#ef4444';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    _renderSelectionHandles(ctx) {
        const el = this.selectedElement;
        if (!el) return;

        const rot = el.rotation || 0;
        const pivotX = el.pivotX != null ? el.pivotX : el.x + el.width / 2;
        const pivotY = el.pivotY != null ? el.pivotY : el.y + el.height / 2;

        let corners;

        if (el.type === 'parking') {
            // Use actual staircase geometry for selection outline
            const geo = this._getParkingGeometry(el);
            const corners_world = geo.corners.map(c =>
                this._rotatePoint(c.x, c.y, pivotX, pivotY, rot)
            );
            corners = corners_world.map(c => this.worldToScreen(c.x, c.y));
        } else {
            const corners_world = [
                this._rotatePoint(el.x, el.y, pivotX, pivotY, rot),
                this._rotatePoint(el.x + el.width, el.y, pivotX, pivotY, rot),
                this._rotatePoint(el.x + el.width, el.y + el.height, pivotX, pivotY, rot),
                this._rotatePoint(el.x, el.y + el.height, pivotX, pivotY, rot)
            ];
            corners = corners_world.map(c => this.worldToScreen(c.x, c.y));
        }

        // Selection border
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);

        // Corner handles
        const handleSize = 8;
        ctx.fillStyle = '#6366f1';
        for (const c of corners) {
            ctx.fillRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
        }

        // Rotation handle (above midpoint of top edge)
        const midTopWorld = this._rotatePoint(el.x + el.width / 2, el.y, pivotX, pivotY, rot);
        const midTopScreen = this.worldToScreen(midTopWorld.x, midTopWorld.y);
        const topEdgeDx = corners[1].x - corners[0].x;
        const topEdgeDy = corners[1].y - corners[0].y;
        const topEdgeLen = Math.sqrt(topEdgeDx * topEdgeDx + topEdgeDy * topEdgeDy) || 1;
        const perpX = -topEdgeDy / topEdgeLen * 24;
        const perpY = topEdgeDx / topEdgeLen * 24;
        const rotHandle = { x: midTopScreen.x + perpX, y: midTopScreen.y + perpY };

        ctx.beginPath();
        ctx.arc(rotHandle.x, rotHandle.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#22c55e';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(midTopScreen.x, midTopScreen.y);
        ctx.lineTo(rotHandle.x, rotHandle.y);
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Skew handle for parking (orange diamond at tip midpoint) — only for straight rows
        if (el.type === 'parking' && !(el.curveControlPoints && el.curveControlPoints.length > 0)) {
            const geo = this._getParkingGeometry(el);
            const tipWorld = this._rotatePoint(geo.tipMidX, geo.tipMidY, pivotX, pivotY, rot);
            const tipScreen = this.worldToScreen(tipWorld.x, tipWorld.y);
            ctx.save();
            ctx.translate(tipScreen.x, tipScreen.y);
            ctx.rotate(Math.PI / 4);
            ctx.fillStyle = '#f97316';
            ctx.fillRect(-6, -6, 12, 12);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.strokeRect(-6, -6, 12, 12);
            ctx.restore();
        }

        // Curve control point handles for parking (blue circles)
        if (el.type === 'parking' && el.curveControlPoints && el.curveControlPoints.length > 0) {
            for (const cp of el.curveControlPoints) {
                const cpWorld = this._rotatePoint(cp.x, cp.y, pivotX, pivotY, rot);
                const cpScreen = this.worldToScreen(cpWorld.x, cpWorld.y);

                // Draw line from start/end to control point
                const ppm = this.pixelsPerMeter || 20;
                const twoFiveM = ppm * 2.5;
                const count = el.spotCount || 1;
                const skewAngle = Math.atan2(el.skewOffset || 0, el.height);
                const baseSpacing = twoFiveM / Math.cos(skewAngle);
                const side = el.skewSide || 'top';
                const baseY = side === 'top' ? el.y + el.height : el.y;
                const p0World = this._rotatePoint(el.x, baseY, pivotX, pivotY, rot);
                const p2World = this._rotatePoint(el.x + count * baseSpacing, baseY, pivotX, pivotY, rot);
                const p0Screen = this.worldToScreen(p0World.x, p0World.y);
                const p2Screen = this.worldToScreen(p2World.x, p2World.y);

                ctx.save();
                ctx.strokeStyle = '#3b82f680';
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(p0Screen.x, p0Screen.y);
                ctx.lineTo(cpScreen.x, cpScreen.y);
                ctx.lineTo(p2Screen.x, p2Screen.y);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();

                // Draw handle
                ctx.beginPath();
                ctx.arc(cpScreen.x, cpScreen.y, 8, 0, Math.PI * 2);
                ctx.fillStyle = '#3b82f6';
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            // Spot count badge
            const geo = this._getParkingGeometry(el);
            const tipWorld = this._rotatePoint(geo.tipMidX, geo.tipMidY, pivotX, pivotY, rot);
            const tipScreen = this.worldToScreen(tipWorld.x, tipWorld.y);
            ctx.save();
            ctx.font = 'bold 12px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const badgeText = `×${el.spotCount || 1}`;
            const textWidth = ctx.measureText(badgeText).width;
            ctx.fillStyle = 'rgba(99,102,241,0.9)';
            ctx.beginPath();
            ctx.roundRect(tipScreen.x - textWidth / 2 - 6, tipScreen.y - 10, textWidth + 12, 20, 4);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.fillText(badgeText, tipScreen.x, tipScreen.y);
            ctx.restore();
        }

        // Spot count badge for straight parking rows too
        if (el.type === 'parking' && !(el.curveControlPoints && el.curveControlPoints.length > 0)) {
            const geo = this._getParkingGeometry(el);
            const tipWorld = this._rotatePoint(geo.tipMidX, geo.tipMidY, pivotX, pivotY, rot);
            const tipScreen = this.worldToScreen(tipWorld.x, tipWorld.y);
            ctx.save();
            ctx.font = 'bold 12px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const badgeText = `×${el.spotCount || 1}`;
            const textWidth = ctx.measureText(badgeText).width;
            ctx.fillStyle = 'rgba(99,102,241,0.9)';
            ctx.beginPath();
            ctx.roundRect(tipScreen.x - textWidth / 2 - 6, tipScreen.y - 26, textWidth + 12, 20, 4);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.fillText(badgeText, tipScreen.x, tipScreen.y - 16);
            ctx.restore();
        }
    }

    // ===== Element Counting =====

    /**
     * Count all drawn elements by type.
     * Returns a structured summary for the pricing module.
     */
    getElementCounts() {
        const counts = {
            parking: { count: 0, totalSpots: 0 },
            crosswalk: { count: 0 },
            arrow: { count: 0 },
            turnArrow: { count: 0, left: 0, right: 0 },
            laneLine: { count: 0, single: 0, double: 0 },
            symbol: { count: 0 }
        };

        // Track symbol subtypes dynamically
        const symbolTypes = {};

        for (const el of this.elements) {
            switch (el.type) {
                case 'parking':
                    counts.parking.count++;
                    counts.parking.totalSpots += (el.spotCount || 1);
                    break;
                case 'crosswalk':
                    counts.crosswalk.count++;
                    break;
                case 'arrow':
                    counts.arrow.count++;
                    break;
                case 'turn-arrow':
                    counts.turnArrow.count++;
                    if (el.direction === 'left') counts.turnArrow.left++;
                    else counts.turnArrow.right++;
                    break;
                case 'lane-line':
                    counts.laneLine.count++;
                    if (el.lineStyle === 'double') counts.laneLine.double++;
                    else counts.laneLine.single++;
                    break;
                case 'symbol':
                    counts.symbol.count++;
                    const st = el.symbolType || 'Ukjent';
                    symbolTypes[st] = (symbolTypes[st] || 0) + 1;
                    break;
            }
        }

        counts.symbol.types = symbolTypes;
        return counts;
    }

    /**
     * Get a flat list of line items for pricing.
     * Each item has: { key, label, count }
     */
    getPriceLineItems() {
        const c = this.getElementCounts();
        const items = [];

        if (c.parking.totalSpots > 0) {
            items.push({ key: 'parkeringsplass', label: 'Parkeringsplasser', count: c.parking.totalSpots });
        }
        if (c.crosswalk.count > 0) {
            items.push({ key: 'fotgjengerfelt', label: 'Fotgjengerfelt', count: c.crosswalk.count });
        }
        if (c.arrow.count > 0) {
            items.push({ key: 'pil', label: 'Piler (rett)', count: c.arrow.count });
        }
        if (c.turnArrow.left > 0) {
            items.push({ key: 'svingpil_venstre', label: 'Svingpil venstre', count: c.turnArrow.left });
        }
        if (c.turnArrow.right > 0) {
            items.push({ key: 'svingpil_hoyre', label: 'Svingpil høyre', count: c.turnArrow.right });
        }
        if (c.laneLine.single > 0) {
            items.push({ key: 'linje_enkel', label: 'Kjørelinje (enkel)', count: c.laneLine.single });
        }
        if (c.laneLine.double > 0) {
            items.push({ key: 'linje_dobbel', label: 'Kjørelinje (dobbel)', count: c.laneLine.double });
        }

        // Symbol subtypes
        if (c.symbol.types) {
            for (const [type, count] of Object.entries(c.symbol.types)) {
                items.push({ key: `symbol_${type.toLowerCase()}`, label: `Symbol: ${type}`, count });
            }
        }

        return items;
    }

    // ===== Export =====

    exportAsPNG() {
        // Create an offscreen canvas at full resolution
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = this.bgWidth || 1920;
        exportCanvas.height = this.bgHeight || 1080;
        const ctx = exportCanvas.getContext('2d');

        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

        // Draw background image
        if (this.backgroundImage) {
            ctx.drawImage(this.backgroundImage, 0, 0);
        }

        // Draw elements without transform
        for (const el of this.elements) {
            this._renderElement(ctx, el);
        }

        // Download
        const link = document.createElement('a');
        link.download = 'parkeringsforslag.png';
        link.href = exportCanvas.toDataURL('image/png');
        link.click();
    }

    /**
     * Export canvas with fictional cars drawn on parking spots.
     * Returns a canvas element with the visualization.
     */
    exportWithCars() {
        const w = this.bgWidth || this.displayWidth;
        const h = this.bgHeight || this.displayHeight;

        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');

        // Draw background
        if (this.backgroundImage) {
            ctx.drawImage(this.backgroundImage, 0, 0);
        } else {
            ctx.fillStyle = '#2a2d3a';
            ctx.fillRect(0, 0, w, h);
        }

        // Draw all elements
        for (const el of this.elements) {
            this._renderElement(ctx, el);
        }

        // Draw cars on parking spots
        const carColors = [
            '#1a1a1a', '#f5f5f5', '#808080', '#c0c0c0',
            '#2563eb', '#dc2626', '#16a34a', '#854d0e',
            '#334155', '#1e3a5f'
        ];

        for (const el of this.elements) {
            if (el.type !== 'parking') continue;

            const ppm = this.pixelsPerMeter || 20;
            const count = el.spotCount || 1;
            const skew = el.skewOffset || 0;
            const side = el.skewSide || 'top';
            const elH = el.height;
            const rot = el.rotation || 0;

            const skewAngle = Math.atan2(skew, elH);
            const fiveM = ppm * 5;
            const twoFiveM = ppm * 2.5;
            const cosA = Math.cos(skewAngle);
            const sinA = Math.sin(skewAngle);
            const baseY = side === 'top' ? el.y + elH : el.y;
            const sideSign = side === 'top' ? 1 : -1;

            const divDx = sideSign * fiveM * sinA;
            const divDy = -sideSign * fiveM * cosA;
            const halfPerpDx = cosA * twoFiveM / 2;
            const halfPerpDy = sinA * twoFiveM / 2;
            const baseSpacing = twoFiveM / cosA;

            for (let i = 0; i < count; i++) {
                const cx = el.x + (i + 0.5) * baseSpacing;

                // Compute center of this spot
                const spotCenterX = cx + divDx / 2;
                const spotCenterY = baseY + divDy / 2;

                // Spot angle: the dividing line direction + element rotation
                const spotAngle = Math.atan2(divDy, divDx) + rot;

                // Random car color (seeded by position)
                const colorIdx = (Math.floor(cx * 7 + baseY * 3 + i * 11) % carColors.length + carColors.length) % carColors.length;

                ctx.save();

                // Apply element rotation first
                if (rot) {
                    const px = el.pivotX != null ? el.pivotX : el.x + el.width / 2;
                    const py = el.pivotY != null ? el.pivotY : el.y + el.height / 2;
                    ctx.translate(px, py);
                    ctx.rotate(rot);
                    ctx.translate(-px, -py);
                }

                // Move to spot center, rotate to spot direction
                ctx.translate(spotCenterX, spotCenterY);
                const localAngle = Math.atan2(divDy, divDx);
                ctx.rotate(localAngle);

                // Car dimensions relative to parking spot (2.5m x 5m)
                const carW = twoFiveM * 0.75; // car is 75% of spot width
                const carH = fiveM * 0.85;     // car is 85% of spot depth

                // Draw car body (top-down view)
                const halfW = carW / 2;
                const halfH = carH / 2;
                const r = carW * 0.15; // corner radius

                // Car body
                ctx.beginPath();
                ctx.roundRect(-halfW, -halfH, carW, carH, r);
                ctx.fillStyle = carColors[colorIdx];
                ctx.fill();
                ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Windshield (front)
                ctx.beginPath();
                ctx.roundRect(-halfW * 0.7, -halfH * 0.55, carW * 0.7, carH * 0.18, r * 0.6);
                ctx.fillStyle = 'rgba(120,160,200,0.7)';
                ctx.fill();

                // Rear window
                ctx.beginPath();
                ctx.roundRect(-halfW * 0.6, halfH * 0.35, carW * 0.6, carH * 0.12, r * 0.5);
                ctx.fillStyle = 'rgba(120,160,200,0.5)';
                ctx.fill();

                // Side lines (body contour)
                ctx.strokeStyle = 'rgba(255,255,255,0.08)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(-halfW * 0.9, -halfH * 0.2);
                ctx.lineTo(-halfW * 0.9, halfH * 0.2);
                ctx.moveTo(halfW * 0.9, -halfH * 0.2);
                ctx.lineTo(halfW * 0.9, halfH * 0.2);
                ctx.stroke();

                ctx.restore();
            }
        }

        return c;
    }
}
