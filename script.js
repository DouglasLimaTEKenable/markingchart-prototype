// --- VARIABLES & STATE ---
const container = document.getElementById('horse-diagram-container'); // Viewport
const wrapper = document.getElementById('zoom-wrapper'); // Transformed Element
const canvas = document.getElementById('drawing-canvas');
const ctx = canvas.getContext('2d');
const horseImage = document.getElementById('horse-image');

// State
let shapes = []; 
let selectedShapeIndex = -1;
let currentTool = 'black-pen'; // Default

// Zoom & Pan State
let scale = 1;
let panX = 0;
let panY = 0;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

// Interaction State
let isDragging = false;
let dragStartPos = { x: 0, y: 0 }; // Mouse position on screen
let panStart = { x: 0, y: 0 };     // Saved Pan Offset at start of drag

// For Drawing Paths
let currentPathPoints = [];

// --- SETUP ---
function switchTab(tabId) {
    if (tabId === 'preview') renderPreview();
    
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`button[onclick="switchTab('${tabId}')"]`).classList.add('active');
    
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');

    if (tabId === 'markings') setTimeout(resizeCanvas, 50);
}

function initImage() {
    const imgPath = 'Section1.png'; 
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = imgPath;
    
    img.onload = function() {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(img, 0, 0);
        
        horseImage.src = tempCanvas.toDataURL('image/png');
        // Reset Zoom on Load
        resetZoom();
        setTimeout(resizeCanvas, 50);
    };
    img.onerror = () => {
        horseImage.style.background = "#eee";
        horseImage.alt = "Image not found";
    }
}

function resizeCanvas() {
    // We size the canvas based on the un-zoomed image size
    // horseImage.naturalWidth/Height or offsetWidth/Height when scale is 1
    // To ensure accuracy, we temporarily remove transform logic measurement if needed, 
    // but offsetWidth usually reports the layout width (unscaled).
    
    const w = horseImage.naturalWidth; 
    const h = horseImage.naturalHeight;

    if (w > 0 && h > 0) {
        // Set internal resolution
        canvas.width = w;
        canvas.height = h;
        
        // Force wrapper to match image size explicitly
        wrapper.style.width = w + "px";
        wrapper.style.height = h + "px";
        
        redrawCanvas(); 
    }
}

initImage();
window.addEventListener('resize', resizeCanvas);

// --- ZOOM & PAN LOGIC ---
function updateZoom(delta) {
    let newScale = scale + delta;
    if (newScale < MIN_ZOOM) newScale = MIN_ZOOM;
    if (newScale > MAX_ZOOM) newScale = MAX_ZOOM;
    
    // Optional: Zoom towards center (math omitted for brevity, keeping top-left default or simple zoom)
    scale = newScale;
    
    // Re-clamp pan with new scale to ensure image doesn't fly away
    clampPan(); 
    applyTransform();
}

function resetZoom() {
    scale = 1;
    panX = 0;
    panY = 0;
    applyTransform();
}

function applyTransform() {
    // Apply CSS Transform to the wrapper
    // We toggle transition on/off in JS if we want smooth zoom but instant pan.
    // CSS handles smooth zoom via transition property.
    wrapper.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
}

function clampPan() {
    // Prevent panning image completely out of view
    // Viewport: container.offsetWidth, container.offsetHeight
    // Content: wrapper.offsetWidth * scale, etc.
    
    const viewW = container.clientWidth;
    const viewH = container.clientHeight;
    const contentW = horseImage.naturalWidth * scale;
    const contentH = horseImage.naturalHeight * scale;

    // Simple bounds: Don't let the content edge go way past the viewport center
    // Or stricter: keep content covering viewport if content > viewport
    
    // Min X: (viewport width - content width) (if content > viewport)
    // Max X: 0
    
    const minX = viewW - contentW;
    const minY = viewH - contentH;

    if (minX < 0) {
        // Content is wider than view
        if (panX > 0) panX = 0;
        if (panX < minX) panX = minX;
    } else {
        // Content is narrower than view, center it or keep 0?
        // Let's keep 0 (left align) or center. 
        panX = (viewW - contentW) / 2;
    }

    if (minY < 0) {
        if (panY > 0) panY = 0;
        if (panY < minY) panY = minY;
    } else {
        panY = (viewH - contentH) / 2;
    }
}

// --- TOOL SWITCHING ---
function setTool(tool) {
    currentTool = tool;
    
    // Button States
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active-tool'));
    const btn = document.querySelector(`button[onclick="setTool('${tool}')"]`);
    if(btn) btn.classList.add('active-tool');

    // Cursor & Logic updates
    if (tool === 'view-pan') {
        selectedShapeIndex = -1;
        canvas.style.cursor = "grab";
        document.getElementById('helper-text').innerText = "Drag to Pan the View";
    } else if (tool === 'select') {
        canvas.style.cursor = "default";
        document.getElementById('helper-text').innerText = "Click to Select & Drag shapes";
    } else {
        selectedShapeIndex = -1;
        document.getElementById('btn-delete').disabled = true;
        canvas.style.cursor = "crosshair";
        document.getElementById('helper-text').innerText = "Draw on the chart";
    }
    
    redrawCanvas();
}

// --- COORDINATE MAPPING (CRITICAL) ---
function getPos(e) {
    // 1. Get raw client coordinates
    let cx, cy;
    if (e.changedTouches && e.changedTouches.length > 0) {
        cx = e.changedTouches[0].clientX;
        cy = e.changedTouches[0].clientY;
    } else {
        cx = e.clientX;
        cy = e.clientY;
    }

    // 2. Get Container (Viewport) Position
    const rect = container.getBoundingClientRect();
    
    // 3. Calculate position Relative to Viewport (0,0 is top-left of container)
    const viewportX = cx - rect.left;
    const viewportY = cy - rect.top;

    // 4. Adjust for Pan and Zoom
    // Formula: (ViewportCoord - Translate) / Scale
    const wrapperX = (viewportX - panX) / scale;
    const wrapperY = (viewportY - panY) / scale;

    // 5. Map Wrapper coordinate to Internal Canvas coordinate
    // Since wrapper size == canvas size (in layout pixels), 
    // and canvas.width matches horseImage.naturalWidth:
    // We just need to ensure we map layout pixels to internal pixels if they differ.
    // In this setup, canvas.width is set to horseImage.naturalWidth.
    // wrapper.style.width is also horseImage.naturalWidth.
    // So the ratio is 1:1.
    
    return { x: wrapperX, y: wrapperY };
}

function startAction(e) {
    if (e.cancelable) e.preventDefault();
    
    // Raw screen pos for dragging logic
    let cx, cy;
    if (e.changedTouches && e.changedTouches.length > 0) {
        cx = e.changedTouches[0].clientX;
        cy = e.changedTouches[0].clientY;
    } else {
        cx = e.clientX;
        cy = e.clientY;
    }

    isDragging = true;
    dragStartPos = { x: cx, y: cy }; // Global screen coordinates

    if (currentTool === 'view-pan') {
        canvas.style.cursor = "grabbing";
        wrapper.style.transition = "none"; // Disable smoothing while dragging
        panStart = { x: panX, y: panY };
        return;
    }

    // For other tools, we need the Canvas Coordinates
    const pos = getPos(e);

    if (currentTool === 'select') {
        const foundIndex = findShapeAt(pos);
        selectedShapeIndex = foundIndex;
        document.getElementById('btn-delete').disabled = (selectedShapeIndex === -1);
        redrawCanvas();
    } else if (currentTool.startsWith('symbol')) {
        const type = currentTool === 'symbol-m' ? 'M' : 'X';
        const color = currentTool === 'symbol-m' ? 'red' : 'black';
        shapes.push({
            type: 'symbol',
            text: type,
            x: pos.x,
            y: pos.y,
            color: color
        });
        isDragging = false; 
        redrawCanvas();
    } else {
        // Start Path
        currentPathPoints = [{x: pos.x, y: pos.y}];
        redrawCanvas();
    }
}

function moveAction(e) {
    if (!isDragging) return;
    if (e.cancelable) e.preventDefault();

    let cx, cy;
    if (e.changedTouches && e.changedTouches.length > 0) {
        cx = e.changedTouches[0].clientX;
        cy = e.changedTouches[0].clientY;
    } else {
        cx = e.clientX;
        cy = e.clientY;
    }

    if (currentTool === 'view-pan') {
        // Calculate Delta in Screen Pixels
        const dx = cx - dragStartPos.x;
        const dy = cy - dragStartPos.y;
        
        // Update Pan
        panX = panStart.x + dx;
        panY = panStart.y + dy;
        
        applyTransform();
        return;
    }

    // For drawing/moving, we need Canvas Coordinates
    const pos = getPos(e);

    // To calculate delta correctly for moving shapes, 
    // we need the PREVIOUS mouse position in Canvas Coordinates.
    // Or simpler: Calculate total delta from start (in canvas coords) 
    // BUT we didn't save start pos in canvas coords for moving.
    // Let's rely on re-calculating delta based on the object's original pos 
    // OR just update the "dragStart" variable to current every frame.
    
    // Let's use the incremental approach for 'select':
    // Convert dragStartPos (screen) to Canvas Coords? No, that changes as we move.
    
    // Better Moving Logic:
    // 1. Get previous pos (we need to store `lastPos` in canvas units)
    // 2. Diff = currentPos - lastPos
    // 3. Apply Diff
    
    // Refactoring move for stability:
    if (currentTool === 'select' && selectedShapeIndex !== -1) {
        // We need a robust delta. 
        // Let's just use the current pos vs the "start of this specific move event" logic?
        // Actually, the simplest way for 'select' without massive refactor:
        // dx/dy in screen pixels / scale = dx/dy in canvas units.
        
        const dxScreen = cx - dragStartPos.x;
        const dyScreen = cy - dragStartPos.y;
        
        const dxCanvas = dxScreen / scale;
        const dyCanvas = dyScreen / scale;

        const shape = shapes[selectedShapeIndex];
        if (shape.type === 'symbol') {
            shape.x += dxCanvas;
            shape.y += dyCanvas;
        } else if (shape.type === 'path') {
            shape.points.forEach(p => {
                p.x += dxCanvas;
                p.y += dyCanvas;
            });
        }
        
        // Update drag start so next move is relative to this one
        dragStartPos = { x: cx, y: cy };
        redrawCanvas();
    } else if (currentTool.endsWith('pen')) {
        currentPathPoints.push({x: pos.x, y: pos.y});
        redrawCanvas(); 
    }
}

function endAction(e) {
    if (!isDragging) return;
    if (e.cancelable) e.preventDefault();
    isDragging = false;

    if (currentTool === 'view-pan') {
        canvas.style.cursor = "grab";
        wrapper.style.transition = "transform 0.1s ease-out"; // Re-enable smoothing
        clampPan(); // Snap back if out of bounds
        applyTransform();
        return;
    }

    if (currentTool.endsWith('pen') && currentPathPoints.length > 1) {
        shapes.push({
            type: 'path',
            points: [...currentPathPoints],
            color: (currentTool === 'red-pen') ? 'red' : 'black'
        });
        currentPathPoints = [];
        redrawCanvas();
    }
    currentPathPoints = [];
}

// --- HIT DETECTION ---
function findShapeAt(pos) {
    for (let i = shapes.length - 1; i >= 0; i--) {
        const s = shapes[i];
        if (s.type === 'symbol') {
            const dist = Math.sqrt((pos.x - s.x)**2 + (pos.y - s.y)**2);
            if (dist < 20) return i;
        } else if (s.type === 'path') {
            for (let p of s.points) {
                const dist = Math.sqrt((pos.x - p.x)**2 + (pos.y - p.y)**2);
                if (dist < 10) return i;
            }
        }
    }
    return -1;
}

// --- RENDERING ENGINE (UPDATED) ---
function redrawCanvas() {
    // 1. Clear Screen
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 2. Draw Saved Shapes
    shapes.forEach((s, index) => {
        const isSelected = (index === selectedShapeIndex);
        
        ctx.shadowBlur = isSelected ? 10 : 0;
        ctx.shadowColor = 'gold';

        if (s.type === 'path') {
            if(s.points.length < 2) return;
            ctx.beginPath();
            ctx.moveTo(s.points[0].x, s.points[0].y);
            for(let i=1; i<s.points.length; i++) {
                ctx.lineTo(s.points[i].x, s.points[i].y);
            }
            ctx.lineCap = 'round';
            ctx.lineWidth = isSelected ? 5 : 3;
            ctx.strokeStyle = s.color;
            ctx.stroke();
        } else if (s.type === 'symbol') {
            ctx.font = isSelected ? 'bold 28px Arial' : 'bold 24px Arial';
            ctx.fillStyle = s.color;
            ctx.fillText(s.text, s.x - 8, s.y + 8);
        }
        
        ctx.shadowBlur = 0; 
    });

    // 3. Draw Active Line (The one you are currently dragging)
    if (currentPathPoints.length > 0) {
        ctx.beginPath();
        ctx.moveTo(currentPathPoints[0].x, currentPathPoints[0].y);
        for(let i=1; i<currentPathPoints.length; i++) {
            ctx.lineTo(currentPathPoints[i].x, currentPathPoints[i].y);
        }
        ctx.lineCap = 'round';
        ctx.lineWidth = 3;
        // Determine color based on active tool
        ctx.strokeStyle = (currentTool === 'red-pen') ? 'red' : 'black';
        ctx.stroke();
    }
}

// --- BUTTON ACTIONS ---
function deleteSelected() {
    if (selectedShapeIndex !== -1) {
        shapes.splice(selectedShapeIndex, 1);
        selectedShapeIndex = -1;
        document.getElementById('btn-delete').disabled = true;
        redrawCanvas();
    }
}

function undoLast() {
    if(shapes.length > 0) {
        shapes.pop();
        selectedShapeIndex = -1;
        redrawCanvas();
    }
}

function clearAll() {
    if(confirm("Clear the entire chart?")) {
        shapes = [];
        selectedShapeIndex = -1;
        redrawCanvas();
    }
}

// --- EVENT LISTENERS ---
canvas.addEventListener('mousedown', startAction);
canvas.addEventListener('mousemove', moveAction);
canvas.addEventListener('mouseup', endAction);
canvas.addEventListener('mouseout', endAction);

const touchOpt = { passive: false };
canvas.addEventListener('touchstart', startAction, touchOpt);
canvas.addEventListener('touchmove', moveAction, touchOpt);
canvas.addEventListener('touchend', endAction, touchOpt);
canvas.addEventListener('touchcancel', endAction, touchOpt);


// --- PREVIEW & PDF ---
function renderPreview() {
    // Reset canvas highlight for PDF
    const prevSelect = selectedShapeIndex;
    selectedShapeIndex = -1; 
    redrawCanvas();

    const container = document.getElementById('pdf-diagram-area');
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-diagram-wrapper';
    wrapper.appendChild(horseImage.cloneNode());

    const pCanvas = document.createElement('canvas');
    pCanvas.width = canvas.width;
    pCanvas.height = canvas.height;
    pCanvas.getContext('2d').drawImage(canvas, 0, 0);
    
    wrapper.appendChild(pCanvas);
    container.appendChild(wrapper);

    // Map inputs
    const ids = ['head','neck','lf','rf','lh','rh','body','microchip'];
    ids.forEach(id => {
        const el = document.getElementById('input-'+id);
        if(el) document.getElementById('disp-'+id).innerText = el.value || '';
    });
    document.getElementById('disp-date').innerText = document.getElementById('exam-date').value;

    const isApproved = document.getElementById('approve-chk').checked;
    document.getElementById('disp-status').innerText = isApproved ? 'APPROVED' : 'DRAFT';
    document.getElementById('watermark').style.display = isApproved ? 'none' : 'block';
    document.getElementById('disp-sig').innerText = isApproved ? "John Doe, DVM" : "";

    // Restore selection state in editor
    selectedShapeIndex = prevSelect;
    redrawCanvas();
}

function generatePDF() {
    if (typeof html2pdf === 'undefined') return alert('PDF Lib missing');
    const element = document.getElementById('pdf-preview-container');
    const btn = document.getElementById('btn-download');
    const txt = btn.innerText;
    
    btn.innerText = "Generating...";
    btn.disabled = true;

    html2pdf().set({
        margin: 0,
        filename: 'MarkingChart.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4' }
    }).from(element).save()
    .then(() => { btn.innerText = txt; btn.disabled = false; })
    .catch(e => { alert(e.message); btn.innerText = txt; btn.disabled = false; });
}