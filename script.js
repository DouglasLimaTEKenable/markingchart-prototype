// --- VARIABLES & STATE ---
const container = document.getElementById('horse-diagram-container'); // The Viewport
const wrapper = document.getElementById('zoom-wrapper'); // The Transformed Element
const canvas = document.getElementById('drawing-canvas');
const ctx = canvas.getContext('2d');
const horseImage = document.getElementById('horse-image');

// The "Shapes" array is the single source of truth
let shapes = []; 
let selectedShapeIndex = -1;

let currentTool = 'black-pen';

// Interaction State
let isDragging = false;
// dragStartPos now stores raw screen coordinates (clientX/Y) for delta calculations
let dragStartPos = {x:0, y:0}; 

// Zoom & Pan State
let scale = 1;
let panX = 0;
let panY = 0;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
// Helper to store pan offset at the start of a drag gesture
let panStart = { x: 0, y: 0 };

// For Drawing Paths
let currentPathPoints = [];

// --- SETUP ---
// ... (switchTab function remains exactly the same) ...
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
        // Load image into the DOM element
        horseImage.src = imgPath;
        // Important: Reset view on fresh load
        resetZoom();
        // Resize canvas to match the natural image dimensions once loaded
        setTimeout(resizeCanvas, 50);
    };
    img.onerror = () => {
        horseImage.style.background = "#eee";
        horseImage.alt = "Image not found (Section1.png)";
        // Ensure wrapper has size even if image fails, so pan works reasonably
        wrapper.style.width = "800px"; wrapper.style.height = "600px";
    }
}

function resizeCanvas() {
    // We now size the internal canvas resolution to match the image's natural size.
    // CSS scaling handles the display size.
    const w = horseImage.naturalWidth;
    const h = horseImage.naturalHeight;
    
    if (w > 0 && h > 0) {
        canvas.width = w;
        canvas.height = h;
        // Force the wrapper to explicitly match the natural image size
        // This ensures the CSS transform origin works predictably.
        wrapper.style.width = w + "px";
        wrapper.style.height = h + "px";
        redrawCanvas(); 
    }
}

initImage();
window.addEventListener('resize', resizeCanvas);

// --- ZOOM & PAN LOGIC (NEW) ---

function updateZoom(delta) {
    let newScale = scale + delta;
    // Clamp zoom levels
    if (newScale < MIN_ZOOM) newScale = MIN_ZOOM;
    if (newScale > MAX_ZOOM) newScale = MAX_ZOOM;
    
    scale = newScale;
    // Re-clamp pan to ensure we don't zoom the image out of view
    clampPan();
    applyTransform();
}

function resetZoom() {
    scale = 1;
    panX = 0;
    panY = 0;
    // Ensure transition is active for the reset
    wrapper.style.transition = "transform 0.2s ease-out";
    applyTransform();
}

function applyTransform() {
    // Apply the CSS transform to the wrapper element
    wrapper.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
}

function clampPan() {
    // Optional: Implement bounds to stop the user panning the image completely off-screen.
    // A simple approach is to ensure the center of the content cannot leave the viewport.
    const viewW = container.clientWidth;
    const viewH = container.clientHeight;
    const contentW = wrapper.offsetWidth * scale;
    const contentH = wrapper.offsetHeight * scale;

    // Calculate reasonable bounds based on viewport vs content size
    const maxPanX = viewW / 2;
    const minPanX = viewW / 2 - contentW;
    const maxPanY = viewH / 2;
    const minPanY = viewH / 2 - contentH;

    // Apply clamping if you want strict boundaries. For now, leaving flexible for better UX.
    // To enable strict bounds, uncomment below:
    // panX = Math.min(maxPanX, Math.max(minPanX, panX));
    // panY = Math.min(maxPanY, Math.max(minPanY, panY));
}


// --- TOOL SWITCHING (UPDATED) ---
function setTool(tool) {
    currentTool = tool;
    selectedShapeIndex = -1; // Deselect on tool change
    
    const helperText = document.getElementById('helper-text');

    // Update Cursor and UI based on tool
    if (tool === 'view-pan') {
        canvas.style.cursor = "grab";
        if(helperText) helperText.innerText = "Click and drag to Pan the view.";
    } else if (tool === 'select') {
        canvas.style.cursor = "default";
        document.getElementById('btn-delete').disabled = true;
        if(helperText) helperText.innerText = "Click to Select marks. Drag to move.";
    } else {
        // Drawing tools
        canvas.style.cursor = "crosshair";
        document.getElementById('btn-delete').disabled = true;
        if(helperText) helperText.innerText = "Draw on the chart.";
    }
    
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active-tool'));
    const btn = document.querySelector(`button[onclick="setTool('${tool}')"]`);
    if(btn) btn.classList.add('active-tool');
    
    redrawCanvas();
}

// --- COORDINATE MAPPING (CRITICAL REWRITE) ---
function getPos(e) {
    // 1. Get raw screen coordinates (clientX/Y)
    let cx, cy;
    if (e.changedTouches && e.changedTouches.length > 0) {
        cx = e.changedTouches[0].clientX;
        cy = e.changedTouches[0].clientY;
    } else {
        cx = e.clientX;
        cy = e.clientY;
    }

    // 2. Get Viewport Container Position
    const rect = container.getBoundingClientRect();

    // 3. Calculate coordinates relative to the top-left of the Viewport
    const viewportRelX = cx - rect.left;
    const viewportRelY = cy - rect.top;

    // 4. Map Viewport coordinates to Internal Canvas coordinates based on CSS Transform.
    // Formula: (ViewportCoord - TranslateOffset) / ScaleFactor
    // This assumes transform-origin is "0 0" (top-left).
    const canvasX = (viewportRelX - panX) / scale;
    const canvasY = (viewportRelY - panY) / scale;

    return { x: canvasX, y: canvasY };
}

// --- INPUT HANDLING (UPDATED) ---
function startAction(e) {
    if (e.cancelable) e.preventDefault();
    
    // Get raw screen coords for drag delta calculations
    let cx, cy;
    if (e.changedTouches && e.changedTouches.length > 0) {
        cx = e.changedTouches[0].clientX;
        cy = e.changedTouches[0].clientY;
    } else {
        cx = e.clientX;
        cy = e.clientY;
    }

    isDragging = true;
    dragStartPos = { x: cx, y: cy }; // Store screen coords

    // --- PANNING LOGIC ---
    if (currentTool === 'view-pan') {
        canvas.style.cursor = "grabbing";
        // Disable CSS transition for instant dragging response
        wrapper.style.transition = "none";
        panStart = { x: panX, y: panY };
        return; // Exit early, don't draw/select
    }

    // --- DRAWING/SELECTING LOGIC ---
    // Get the mapped canvas coordinates for drawing/selection
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
            type: 'symbol', text: type, x: pos.x, y: pos.y, color: color
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

    // Get raw screen coords
    let cx, cy;
    if (e.changedTouches && e.changedTouches.length > 0) {
        cx = e.changedTouches[0].clientX;
        cy = e.changedTouches[0].clientY;
    } else {
        cx = e.clientX;
        cy = e.clientY;
    }

    // --- PANNING LOGIC ---
    if (currentTool === 'view-pan') {
        // Calculate delta in screen pixels
        const dx = cx - dragStartPos.x;
        const dy = cy - dragStartPos.y;
        // Apply delta to initial pan position
        panX = panStart.x + dx;
        panY = panStart.y + dy;
        applyTransform();
        return; // Exit early
    }


    // --- DRAWING/MOVING LOGIC ---
    
    if (currentTool === 'select' && selectedShapeIndex !== -1) {
        // Calculate movement delta.
        // 1. Get delta in screen pixels.
        const screenDx = cx - dragStartPos.x;
        const screenDy = cy - dragStartPos.y;
        
        // 2. Convert screen delta to canvas coordinate delta by dividing by scale.
        const canvasDx = screenDx / scale;
        const canvasDy = screenDy / scale;

        const shape = shapes[selectedShapeIndex];
        if (shape.type === 'symbol') {
            shape.x += canvasDx;
            shape.y += canvasDy;
        } else if (shape.type === 'path') {
            shape.points.forEach(p => {
                p.x += canvasDx;
                p.y += canvasDy;
            });
        }
        // Important: Reset dragStartPos so next move event calculates delta relative to this one.
        dragStartPos = { x: cx, y: cy };
        redrawCanvas();
    } else if (currentTool.endsWith('pen')) {
        // For drawing, we need absolute canvas coordinates
        const pos = getPos(e);
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
        // Re-enable smooth transitions after dragging finishes
        wrapper.style.transition = "transform 0.1s ease-out";
        clampPan(); // Ensure it lands within bounds
        applyTransform();
        return;
    }

    // Finalize path drawing
    if (currentTool.endsWith('pen') && currentPathPoints.length > 1) {
        shapes.push({
            type: 'path',
            points: [...currentPathPoints],
            color: (currentTool === 'red-pen') ? 'red' : 'black'
        });
    }
    currentPathPoints = [];
    redrawCanvas();
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