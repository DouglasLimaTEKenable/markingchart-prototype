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
let dragStartPos = {x: 0, y:0}; 

// Zoom & Pan State
let scale = 1;
let panX = 0;
let panY = 0;
// Adjusted Min zoom to allow fitting smaller screens if necessary
const MIN_ZOOM = 0.2; 
const MAX_ZOOM = 4;
let panStart = { x:  0, y: 0 };

// For Drawing Paths
let currentPathPoints = [];

let confirmCallback = null;

// PDF zoom state
let pdfScale = 1;
const MIN_PDF_ZOOM = 0.3;
const MAX_PDF_ZOOM = 2;

// --- SETUP ---
function switchTab(tabId) {
    if (tabId === 'preview') {
        renderPreview();
        // Reset PDF zoom when entering preview
        setTimeout(() => {
            resetPDFZoom();
        }, 100);
    }
    
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`button[onclick="switchTab('${tabId}')"]`).classList.add('active');
    
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');

    // Important: When switching back to markings, ensure it fits correctly again
    if (tabId === 'markings') {
         setTimeout(() => {
             resizeCanvas();
             resetZoom();
             // Set Pan as default tool when entering Markings tab
             setTool('view-pan');
         }, 50);
    }
}

function initImage() {
    const imgPath = 'Section1.png'; 
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = imgPath;
    
    img.onload = function() {
        horseImage.src = imgPath;
        // 1. Set internal resolution to match natural image size first
        resizeCanvas();
        // 2. Calculate the fit scale and center it
        setTimeout(resetZoom, 10);
    };
    img.onerror = () => {
        horseImage.style.background = "#eee";
        horseImage.alt = "Image not found (Section1.png)";
        wrapper.style.width = "800px"; wrapper.style.height = "600px";
    }
}

function resizeCanvas() {
    const w = horseImage.naturalWidth;
    const h = horseImage.naturalHeight;
    
    if (w > 0 && h > 0) {
        canvas.width = w;
        canvas.height = h;
        wrapper.style.width = w + "px";
        wrapper.style.height = h + "px";
        redrawCanvas(); 
    }
}

initImage();
// If window resizes, re-calculate the "fit"
window.addEventListener('resize', () => {
    resizeCanvas();
    resetZoom();
});

// --- ZOOM & PAN LOGIC ---

function updateZoom(delta) {
    let newScale = scale + delta;
    if (newScale < MIN_ZOOM) newScale = MIN_ZOOM;
    if (newScale > MAX_ZOOM) newScale = MAX_ZOOM;
    
    scale = newScale;
    clampPan();
    applyTransform();
    
    // Auto-activate Pan tool after zooming
    autoActivatePan();
}

// --- REWRITTEN RESETZOOM TO "FIT" IMAGE ---
function resetZoom() {
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    const imageW = horseImage.naturalWidth;
    const imageH = horseImage.naturalHeight;

    // Safety check to prevent division by zero if image hasn't loaded
    if (imageW === 0 || imageH === 0 || containerW === 0 || containerH === 0) {
        scale = 1; panX = 0; panY = 0; applyTransform(); return;
    }

    // 1. Calculate ratio needed to fit width vs height
    const scaleX = containerW / imageW;
    const scaleY = containerH / imageH;

    // 2. Use the smaller ratio to ensure the whole image fits ("contain")
    // Optional: Math.min(scaleX, scaleY, 1) if you never want it to upscale initially.
    scale = Math.min(scaleX, scaleY);

    // 3. Calculate centering offsets
    const scaledWidth = imageW * scale;
    const scaledHeight = imageH * scale;
    panX = (containerW - scaledWidth) / 2;
    panY = (containerH - scaledHeight) / 2;

    // Ensure smooth transition for the reset action
    wrapper.style.transition = "transform 0.3s ease-out";
    applyTransform();
    
    // Auto-activate Pan tool after reset
    autoActivatePan();
}

function applyTransform() {
    wrapper.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
}

function clampPan() {
    // (Optional bounds logic can go here if desired later)
}

function autoActivatePan() {
    if (currentTool !== 'view-pan') {
        setTool('view-pan');
    }
}

// --- TOOL SWITCHING ---
function setTool(tool) {
    currentTool = tool;
    selectedShapeIndex = -1; 
    
    const helperText = document.getElementById('helper-text');

    if (tool === 'view-pan') {
        canvas.style.cursor = "grab";
        if(helperText) helperText.innerText = "Click and drag to Pan the view.";
    } else if (tool === 'select') {
        canvas.style.cursor = "default";
        document.getElementById('btn-delete').disabled = true;
        if(helperText) helperText.innerText = "Click to Select marks. Drag to move.";
    } else {
        canvas.style.cursor = "crosshair";
        document.getElementById('btn-delete').disabled = true;
        if(helperText) helperText.innerText = "Draw on the chart.";
    }
    
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active-tool'));
    const btn = document.querySelector(`button[onclick="setTool('${tool}')"]`);
    if(btn) btn.classList.add('active-tool');
    
    redrawCanvas();
}

// --- COORDINATE MAPPING ---
function getPos(e) {
    let cx, cy;
    if (e.changedTouches && e.changedTouches.length > 0) {
        cx = e.changedTouches[0].clientX;
        cy = e.changedTouches[0].clientY;
    } else {
        cx = e.clientX;
        cy = e.clientY;
    }

    const rect = container.getBoundingClientRect();
    const viewportRelX = cx - rect.left;
    const viewportRelY = cy - rect.top;

    // Map Viewport coordinates back to canvas coordinates accounting for scale and pan
    const canvasX = (viewportRelX - panX) / scale;
    const canvasY = (viewportRelY - panY) / scale;

    return { x: canvasX, y: canvasY };
}

// --- HELPER FUNCTIONS ---
function countMSymbols() {
    return shapes.filter(s => s.type === 'symbol' && s.text === 'M').length;
}

// Custom alert functions
function showCustomAlert(message, title = 'Notice', icon = '⚠️') {
    const overlay = document.getElementById('custom-alert-overlay');
    const titleEl = document.getElementById('alert-title');
    const messageEl = document.getElementById('alert-message');
    const iconEl = document.getElementById('alert-icon');
    const alertButtons = document.getElementById('alert-buttons');
    const confirmButtons = document.getElementById('confirm-buttons');
    
    // Check if elements exist
    if (!overlay || !titleEl || !messageEl || !iconEl) {
        console.error('Alert elements not found');
        alert(message); // Fallback to browser alert
        return;
    }
    
    // Set content
    titleEl.textContent = title;
    messageEl.textContent = message;
    iconEl.textContent = icon;
    
    // Show alert mode (single OK button)
    alertButtons.style.display = 'flex';
    confirmButtons.style.display = 'none';
    
    overlay.classList.add('active');
    
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
}

function showCustomConfirm(message, title = 'Confirm', icon = '❓', onConfirm) {
    const overlay = document.getElementById('custom-alert-overlay');
    const titleEl = document.getElementById('alert-title');
    const messageEl = document.getElementById('alert-message');
    const iconEl = document.getElementById('alert-icon');
    const alertButtons = document.getElementById('alert-buttons');
    const confirmButtons = document.getElementById('confirm-buttons');
    
    // Check if elements exist
    if (!overlay || !titleEl || !messageEl || !iconEl) {
        console.error('Confirm elements not found');
        if (confirm(message)) onConfirm(); // Fallback to browser confirm
        return;
    }
    
    // Set content
    titleEl.textContent = title;
    messageEl.textContent = message;
    iconEl.textContent = icon;
    
    // Show confirm mode (Cancel + Action buttons)
    alertButtons.style.display = 'none';
    confirmButtons.style.display = 'flex';
    
    // Store callback
    confirmCallback = onConfirm;
    
    overlay.classList.add('active');
    
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
}

function closeCustomAlert() {
    const overlay = document.getElementById('custom-alert-overlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
    
    // Clear callback
    confirmCallback = null;
    
    // Restore body scroll
    document.body.style.overflow = '';
}

function cancelConfirm() {
    closeCustomAlert();
}

function confirmAction() {
    if (confirmCallback && typeof confirmCallback === 'function') {
        confirmCallback();
    }
    closeCustomAlert();
}

// Initialize modal click handler
window.addEventListener('load', function() {
    const overlay = document.getElementById('custom-alert-overlay');
    if (overlay) {
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                closeCustomAlert();
            }
        });
    }
});

// Update the clearAll function to use custom confirm
function clearAll() {
    showCustomConfirm(
        'Are you sure you want to clear the entire chart?  This action cannot be undone.',
        'Clear Chart',
        '🗑️',
        function() {
            shapes = [];
            selectedShapeIndex = -1;
            redrawCanvas();
        }
    );
}

// --- INPUT HANDLING ---
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
    dragStartPos = { x: cx, y: cy }; 

    // --- PANNING LOGIC ---
    if (currentTool === 'view-pan') {
        canvas.style.cursor = "grabbing";
        wrapper.style.transition = "none";
        panStart = { x: panX, y: panY };
        return; 
    }

    // --- DRAWING/SELECTING LOGIC ---
    const pos = getPos(e);

    if (currentTool === 'select') {
        const foundIndex = findShapeAt(pos);
        selectedShapeIndex = foundIndex;
        document.getElementById('btn-delete').disabled = (selectedShapeIndex === -1);
        redrawCanvas();
    } else if (currentTool.startsWith('symbol')) {
        const type = currentTool === 'symbol-m' ? 'M' : 'X';
        const color = currentTool === 'symbol-m' ? 'red' : 'black';
        
        // Check if trying to add M symbol and limit is reached
        if (type === 'M' && countMSymbols() >= 2) {
            // Use custom alert instead of browser alert
            showCustomAlert('Maximum of 2 "M" marks allowed', 'Limit Reached');
            isDragging = false;
            return;
        }
        
        shapes.push({
            type: 'symbol', text: type, x: pos.x, y: pos.y, color: color
        });
        isDragging = false; 
        redrawCanvas();
    } else {
        currentPathPoints = [{x: pos.x, y: pos.y}];
        redrawCanvas();
    }
}

function moveAction(e) {
    if (! isDragging) return;
    if (e.cancelable) e.preventDefault();

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
        const dx = cx - dragStartPos.x;
        const dy = cy - dragStartPos.y;
        panX = panStart.x + dx;
        panY = panStart.y + dy;
        applyTransform();
        return; 
    }

    // --- DRAWING/MOVING LOGIC ---
    if (currentTool === 'select' && selectedShapeIndex !== -1) {
        // Calculate movement delta in canvas units
        const screenDx = cx - dragStartPos.x;
        const screenDy = cy - dragStartPos.y;
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
        dragStartPos = { x: cx, y: cy }; // Reset for next incremental move
        redrawCanvas();
    } else if (currentTool.endsWith('pen')) {
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
        wrapper.style.transition = "transform 0.1s ease-out"; // Re-enable smoothing
        clampPan(); 
        applyTransform();
        return;
    }

    if (currentTool.endsWith('pen') && currentPathPoints.length > 1) {
        shapes.push({
            type: 'path',
            points: [...currentPathPoints],
            color:  (currentTool === 'red-pen') ? 'red' : 'black'
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

// --- RENDERING ENGINE ---
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
    // 1. Clear previous preview
    const container = document.getElementById('pdf-diagram-area');
    container.innerHTML = '';

    // 2. Create a wrapper that forces 100% width of the PDF area
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-diagram-wrapper';
    wrapper.style.position = 'relative';
    wrapper.style.width = '100%';
    wrapper.style.lineHeight = '0'; // Removes vertical gap under image

    // 3. Clone the horse image
    const imgClone = horseImage.cloneNode();
    imgClone.style.width = '100%';
    imgClone.style.height = 'auto';
    imgClone.style.transform = 'none';
    imgClone.style.maxWidth = 'none';   
    imgClone.style.maxHeight = 'none';
    wrapper.appendChild(imgClone);

    // 4. Create a Preview Canvas overlay
    const pCanvas = document.createElement('canvas');
    pCanvas.width = canvas.width;
    pCanvas.height = canvas.height;
    
    const pCtx = pCanvas.getContext('2d');
    pCtx.drawImage(canvas, 0, 0);

    pCanvas.style.position = 'absolute';
    pCanvas.style.top = '0';
    pCanvas.style.left = '0';
    pCanvas.style.width = '100%';
    pCanvas.style.height = '100%';

    wrapper.appendChild(pCanvas);
    container.appendChild(wrapper);

    // 5. Map Form Inputs to Text
    const ids = ['head','neck','lf','rf','lh','rh','body','microchip'];
    ids.forEach(id => {
        const el = document.getElementById('input-'+id);
        const disp = document.getElementById('disp-'+id);
        if(el && disp) disp.innerText = el.value || '';
    });
    
    const dateEl = document.getElementById('exam-date');
    if(dateEl) document.getElementById('disp-date').innerText = dateEl.value;

    const isApproved = document.getElementById('approve-chk').checked;
    document.getElementById('disp-status').innerText = isApproved ? 'APPROVED' : 'DRAFT';
    document.getElementById('watermark').style.display = isApproved ?  'none' : 'block';
    document.getElementById('disp-sig').innerText = isApproved ? "John Doe, DVM" : "";
}

function generatePDF() {
    if (typeof html2pdf === 'undefined') return alert('PDF Lib missing');
    const element = document. getElementById('pdf-preview-container');
    const btn = document.getElementById('btn-download');
    const txt = btn.innerText;
    
    // Temporarily reset scale for PDF generation
    const currentScale = pdfScale;
    element.style.transform = 'scale(1)';
    
    btn.innerText = "Generating...";
    btn.disabled = true;

    const opt = {
        margin: [5, 5, 5, 5], // [top, left, bottom, right] in mm
        filename: 'MarkingChart.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas:  { 
            scale: 2,
            useCORS: true,
            logging: false,
            scrollY: -window.scrollY,
            scrollX: -window. scrollX,
            windowWidth: 794, // A4 width in pixels at 96 DPI (210mm)
            windowHeight: 1123, // A4 height in pixels at 96 DPI (297mm)
            width: element.offsetWidth,
            height: element.offsetHeight
        },
        jsPDF:  { 
            unit: 'mm', 
            format: [210, 297], // Explicit A4 dimensions
            orientation: 'portrait',
            compress: true
        },
        pagebreak:  { 
            mode: 'avoid-all'
        }
    };

    html2pdf().set(opt).from(element).save()
    .then(() => { 
        btn.innerText = txt; 
        btn.disabled = false;
        element.style.transform = `scale(${currentScale})`;
    })
    .catch(e => { 
        alert(e.message); 
        btn.innerText = txt; 
        btn.disabled = false;
        element.style.transform = `scale(${currentScale})`;
    });
}

// PDF zoom functions
function updatePDFZoom(delta) {
    let newScale = pdfScale + delta;
    if (newScale < MIN_PDF_ZOOM) newScale = MIN_PDF_ZOOM;
    if (newScale > MAX_PDF_ZOOM) newScale = MAX_PDF_ZOOM;
    
    pdfScale = newScale;
    applyPDFZoom();
}

function resetPDFZoom() {
    pdfScale = 1;
    applyPDFZoom();
}

function applyPDFZoom() {
    const pdfContainer = document.getElementById('pdf-preview-container');
    const zoomIndicator = document.getElementById('pdf-zoom-level');
    
    if (pdfContainer) {
        pdfContainer.style.transform = `scale(${pdfScale})`;
    }
    
    if (zoomIndicator) {
        zoomIndicator.textContent = Math.round(pdfScale * 100) + '%';
    }
}
