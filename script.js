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
            // Ensure orientation is applied when entering preview tab
            setOrientation(pdfOrientation);  // Re-apply current orientation
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
        if (type === 'M' && countMSymbols() >= 3) {
            // Use custom alert instead of browser alert
            showCustomAlert('Maximum of 3 "M" marks allowed', 'Limit Reached');
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
    
    // Map new fields
    const colour = document.getElementById('input-colour');
    if (colour) document.getElementById('disp-colour').innerText = colour.value || '';
    
    const sex = document.getElementById('input-sex');
    if (sex) document.getElementById('disp-sex').innerText = sex.value || '';
    
    const dob = document.getElementById('input-dob');
    if (dob) document.getElementById('disp-dob').innerText = formatDateToDDMMYYYY(dob.value) || '';
    
    const species = document.querySelector('input[name="species"]:checked');
    if (species) document.getElementById('disp-species').innerText = species.value || 'EQUINE';
    
    const location = document.getElementById('input-location');
    if (location) document.getElementById('disp-location').innerText = location.value || '';
    
    const vetAddress = document.getElementById('input-vet-address');
    if (vetAddress) document.getElementById('disp-vet-address').innerText = vetAddress.value || '';
    
    const vetRef = document.getElementById('input-vet-ref');
    if (vetRef) document.getElementById('disp-vet-ref').innerText = vetRef.value || '';
    
    const ueln = document.getElementById('input-ueln');
    if (ueln) document.getElementById('disp-ueln').innerText = ueln.value || 'N/A';
    
    // UPDATED: Map additional microchips
    const microchip2 = document.getElementById('input-microchip-2');
    const microchip3 = document.getElementById('input-microchip-3');
    const additionalDisplay = document.getElementById('disp-microchip-additional');

    if (additionalDisplay) {
        // Clear previous content
        additionalDisplay.innerHTML = '';
        
        if (microchip2 && microchip2.value.trim()) {
            const line1 = document.createElement('div');
            line1.className = 'pdf-microchip-additional-line';
            const label1 = document.createElement('strong');
            label1.textContent = 'Additional 1: ';
            line1.appendChild(label1);
            line1.appendChild(document.createTextNode(microchip2.value.trim()));
            additionalDisplay.appendChild(line1);
        }
        if (microchip3 && microchip3.value.trim()) {
            const line2 = document.createElement('div');
            line2.className = 'pdf-microchip-additional-line'; 
            const label2 = document.createElement('strong');
            label2.textContent = 'Additional 2: ';
            line2.appendChild(label2);
            line2.appendChild(document.createTextNode(microchip3.value.trim()));
            additionalDisplay.appendChild(line2);
        }
    }
    
    const dateEl = document.getElementById('exam-date');
    if(dateEl) document.getElementById('disp-date').innerText = formatDateToDDMMYYYY(dateEl.value) || '';

    // Display vet stamp
    const vetStampInput = document.getElementById('input-vet-stamp');
    const vetStampDisplay = document.getElementById('vet-stamp-display');
    if (vetStampInput && vetStampInput.files && vetStampInput.files[0] && vetStampDisplay) {
        const reader = new FileReader();
        reader.onload = function(e) {
            vetStampDisplay.innerHTML = '<img src="' + e.target.result + '" style="width:  100%; height: auto;">';
        };
        reader.readAsDataURL(vetStampInput.files[0]);
    } else if (vetStampDisplay) {
        vetStampDisplay.innerHTML = '';
    }

    // Display signature
    const sigImage = document.getElementById('disp-sig-image');
    const sigDate = document.getElementById('disp-sig-date');
    if (signatureDataURL && sigImage) {
        sigImage.src = signatureDataURL;
        sigImage.classList.add('active');
        if (sigDate) {
            const today = new Date().toLocaleDateString('en-GB');
            sigDate.innerText = today;
        }
    } else if (sigImage) {
        sigImage.classList.remove('active');
        if (sigDate) sigDate.innerText = '';
    }

    const isApproved = document.getElementById('approve-chk').checked;
    document.getElementById('disp-status').innerText = isApproved ? 'APPROVED' : 'DRAFT';
    document.getElementById('watermark').style.display = isApproved ?   'none' : 'block';
}

function generatePDF() {
    if (typeof html2pdf === 'undefined') return alert('PDF Lib missing');
    const element = document.getElementById('pdf-preview-container');
    const btn = document.getElementById('btn-download');
    const txt = btn.innerText;
    
    // Temporarily reset scale and remove box-shadow for PDF generation
    const currentScale = pdfScale;
    const currentShadow = element.style.boxShadow;
    element.style.transform = 'scale(1)';
    element.style.boxShadow = 'none';
    
    btn.innerText = "Generating...";
    btn.disabled = true;

    // Use a timeout to ensure DOM is settled
    setTimeout(() => {
        // Support both portrait and landscape orientations
        const orientation = getCurrentOrientation();
        
        // Get microchip number for filename
        const microchipInput = document.getElementById('input-microchip');
        const microchipNumber = microchipInput && microchipInput.value.trim() 
            ? microchipInput.value.trim().replace(/[^a-zA-Z0-9]/g, '_') // Sanitize filename
            : 'MarkingChart';

        const opt = {
            margin:  0,
            filename: `${microchipNumber}.pdf`, // CHANGED: Use microchip number
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { 
                scale: 2,
                useCORS: true,
                logging: true,
                letterRendering: true,
                allowTaint: false,
                backgroundColor: '#ffffff'
            },
            jsPDF: { 
                unit: 'mm', 
                format: 'a4',
                orientation: orientation  // Use dynamic orientation from state
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
            element.style.boxShadow = currentShadow;
        })
        .catch(e => { 
            alert(e.message); 
            btn.innerText = txt; 
            btn.disabled = false;
            element.style.transform = `scale(${currentScale})`;
            element.style.boxShadow = currentShadow;
        });
    }, 100);
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

// --- SIGNATURE CAPTURE ---
let signatureDataURL = null;
let signatureCanvas = null;
let signatureCtx = null;
let isSignatureDragging = false;

function initSignaturePad() {
    signatureCanvas = document.getElementById('signature-pad');
    if (!signatureCanvas) return;
    
    signatureCtx = signatureCanvas.getContext('2d');
    
    // Set high DPI for better quality
    const rect = signatureCanvas.getBoundingClientRect();
    signatureCanvas.width = rect.width * 2;
    signatureCanvas.height = rect.height * 2;
    signatureCtx.scale(2, 2);
    
    // White background
    signatureCtx.fillStyle = 'white';
    signatureCtx.fillRect(0, 0, signatureCanvas.width, signatureCanvas.height);
    
    // Drawing state
    let lastPos = null;
    
    function getSignaturePos(e) {
        const rect = signatureCanvas.getBoundingClientRect();
        let x, y;
        if (e.touches && e.touches.length > 0) {
            x = e.touches[0].clientX - rect.left;
            y = e.touches[0].clientY - rect.top;
        } else {
            x = e.clientX - rect.left;
            y = e.clientY - rect.top;
        }
        return { x, y };
    }
    
    function startSignature(e) {
        if (e.cancelable) e.preventDefault();
        isSignatureDragging = true;
        lastPos = getSignaturePos(e);
    }
    
    function drawSignature(e) {
        if (!isSignatureDragging) return;
        if (e.cancelable) e.preventDefault();
        
        const pos = getSignaturePos(e);
        
        signatureCtx.beginPath();
        signatureCtx.moveTo(lastPos.x, lastPos.y);
        signatureCtx.lineTo(pos.x, pos.y);
        signatureCtx.strokeStyle = '#000';
        signatureCtx.lineWidth = 2;
        signatureCtx.lineCap = 'round';
        signatureCtx.lineJoin = 'round';
        signatureCtx.stroke();
        
        lastPos = pos;
    }
    
    function endSignature(e) {
        if (e.cancelable) e.preventDefault();
        isSignatureDragging = false;
        lastPos = null;
    }
    
    // Mouse events
    signatureCanvas.addEventListener('mousedown', startSignature);
    signatureCanvas.addEventListener('mousemove', drawSignature);
    signatureCanvas.addEventListener('mouseup', endSignature);
    signatureCanvas.addEventListener('mouseout', endSignature);
    
    // Touch events
    signatureCanvas.addEventListener('touchstart', startSignature);
    signatureCanvas.addEventListener('touchmove', drawSignature);
    signatureCanvas.addEventListener('touchend', endSignature);
    signatureCanvas.addEventListener('touchcancel', endSignature);
}

function clearSignature() {
    if (!signatureCanvas || !signatureCtx) return;
    
    const rect = signatureCanvas.getBoundingClientRect();
    signatureCtx.fillStyle = 'white';
    signatureCtx.fillRect(0, 0, rect.width, rect.height);
    signatureDataURL = null;
}

function isSignatureBlank() {
    if (!signatureCanvas) return true;
    
    const pixelData = signatureCtx.getImageData(0, 0, signatureCanvas.width, signatureCanvas.height);
    const data = pixelData.data;
    
    // Check if any pixel is not white
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] !== 255 || data[i+1] !== 255 || data[i+2] !== 255) {
            return false;
        }
    }
    return true;
}

function acceptSignature() {
    if (isSignatureBlank()) {
        showCustomAlert('Please provide a signature before accepting.', 'Signature Required', '✍️');
        return;
    }
    
    // Capture signature as base64 PNG
    signatureDataURL = signatureCanvas.toDataURL('image/png');
    
    // Hide signature section
    document.getElementById('signature-section').style.display = 'none';
    
    // Show success message
    showCustomAlert('Signature captured successfully! Switching to Preview tab...', 'Success', '✅');
    
    // Switch to Preview tab after short delay
    setTimeout(() => {
        closeCustomAlert();
        switchTab('preview');
    }, 1500);
}

// --- FILE UPLOAD FUNCTIONS ---
function previewVetStamp(input) {
    const file = input.files[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.match('image/jpeg') && !file.type.match('image/png')) {
        showCustomAlert('Please upload a JPG or PNG image file.', 'Invalid File Type', '⚠️');
        input.value = '';
        return;
    }
    
    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
        showCustomAlert('File size must be less than 5MB. Please choose a smaller file.', 'File Too Large', '⚠️');
        input.value = '';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('stamp-img').src = e.target.result;
        document.getElementById('stamp-preview').classList.add('active');
    };
    reader.readAsDataURL(file);
}

function clearVetStamp() {
    document.getElementById('input-vet-stamp').value = '';
    document.getElementById('stamp-preview').classList.remove('active');
    document.getElementById('stamp-img').src = '';
}

function previewMicrochipImage(input) {
    const file = input.files[0];
    if (!file) return;
    
    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
        showCustomAlert('File size must be less than 5MB. Please choose a smaller file.', 'File Too Large', '⚠️');
        input.value = '';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('microchip-img').src = e.target.result;
        document.getElementById('microchip-image-preview').classList.add('active');
    };
    reader.readAsDataURL(file);
}

function clearMicrochipImage() {
    document.getElementById('input-microchip-image').value = '';
    document.getElementById('microchip-image-preview').classList.remove('active');
    document.getElementById('microchip-img').src = '';
}

// --- GEOLOCATION FUNCTION ---
function captureGeolocation() {
    if (!navigator.geolocation) {
        showCustomAlert('Geolocation is not supported by your browser.', 'Not Supported', '❌');
        return;
    }
    
    const locationInput = document.getElementById('input-location');
    const gpsCoords = document.getElementById('gps-coords');
    
    // Show loading state
    const originalValue = locationInput.value;
    locationInput.value = 'Acquiring GPS location...';
    locationInput.disabled = true;
    
    navigator.geolocation.getCurrentPosition(
        function(position) {
            const lat = position.coords.latitude.toFixed(6);
            const lng = position.coords.longitude.toFixed(6);
            const accuracy = position.coords.accuracy.toFixed(0);
            
            locationInput.value = `${lat}, ${lng}`;
            locationInput.disabled = false;
            gpsCoords.textContent = `Coordinates captured with ${accuracy}m accuracy`;
            
            showCustomAlert(`GPS location captured successfully!\nLat: ${lat}, Lng: ${lng}\nAccuracy: ${accuracy}m`, 'Location Captured', '📍');
        },
        function(error) {
            locationInput.value = originalValue;
            locationInput.disabled = false;
            
            let errorMsg = 'Unable to retrieve your location.';
            if (error.code === 1) {
                errorMsg = 'Location permission denied. Please enable location access in your browser settings.';
            } else if (error.code === 2) {
                errorMsg = 'Location information is unavailable.';
            } else if (error.code === 3) {
                errorMsg = 'Location request timed out. Please try again.';
            }
            
            showCustomAlert(errorMsg, 'Location Error', '❌');
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

// --- VALIDATION LOGIC ---
function validateMandatoryFields() {
    const missingFields = [];
    
    // Check canvas has markings
    if (shapes.length === 0) {
        missingFields.push('Canvas markings (at least one marking required)');
    }
    
    // Validate marking description fields (HEAD, NECK, etc.)
    const markingFields = [
        { id: 'input-head', label: 'Head' },
        { id: 'input-neck', label: 'Neck' },
        { id: 'input-lf', label: 'Foreleg L' },
        { id: 'input-rf', label: 'Foreleg R' },
        { id: 'input-lh', label: 'Hindleg L' },
        { id: 'input-rh', label: 'Hindleg R' },
        { id:  'input-body', label:  'Body' },
        { id: 'input-microchip', label: 'Microchip No.' }
    ];
    
    markingFields.forEach(field => {
        const el = document.getElementById(field.id);
        if (!el || !el.value.trim()) {
            missingFields.push(field.label);
            if (el) el.classList.add('validation-error');
        }
    });

    // Check colour
    const colour = document.getElementById('input-colour');
    if (!colour.value) {
        missingFields.push('Colour');
        colour.classList.add('validation-error');
    }
    
    // Check sex
    const sex = document.getElementById('input-sex');
    if (!sex.value) {
        missingFields.push('Sex');
        sex.classList.add('validation-error');
    }
    
    // Check date of birth
    const dob = document.getElementById('input-dob');
    if (!dob.value) {
        missingFields.push('Date of Birth');
        dob.classList.add('validation-error');
    }
    
    // Check species
    const species = document.querySelector('input[name="species"]:checked');
    if (!species) {
        missingFields.push('Species');
        // Highlight the radio group container
        const speciesGroup = document.querySelector('input[name="species"]').closest('.form-group');
        if (speciesGroup) {
            speciesGroup.classList.add('validation-error');
        }
    } else {
        // Clear any previous validation error
        const speciesGroup = document.querySelector('input[name="species"]').closest('.form-group');
        if (speciesGroup) {
            speciesGroup.classList.remove('validation-error');
        }
    }
    
    // Check vet reference (alphanumeric allowed)
    const vetRef = document.getElementById('input-vet-ref');
    if (!vetRef.value || !vetRef.value.trim()) {
        missingFields.push('Vet Reference No.');
        vetRef.classList.add('validation-error');
    }
    // Remove format validation - allow any alphanumeric format
    
    // Check location
    const location = document.getElementById('input-location');
    if (!location.value) {
        missingFields.push('Location Markings Taken');
        location.classList.add('validation-error');
    }
    
    // Check vet address
    const vetAddress = document.getElementById('input-vet-address');
    if (!vetAddress.value.trim()) {
        missingFields.push('Veterinary Surgeon Details');
        vetAddress.classList.add('validation-error');
    }

    const microchip = document.getElementById('input-microchip');
    if (!microchip.value.trim()) {
        missingFields.push('Microchip No.');
        microchip.classList.add('validation-error');
    }
    
    // Check vet stamp
    const vetStamp = document.getElementById('input-vet-stamp');
    if (!vetStamp.files || vetStamp.files.length === 0) {
        missingFields.push('Veterinary Stamp');
        vetStamp.classList.add('validation-error');
    }
    
    // Check microchip image (NOW MANDATORY)
    const microchipImage = document.getElementById('input-microchip-image');
    if (!microchipImage.files || microchipImage.files.length === 0) {
        missingFields.push('Microchip Reader Image (Required from Dec 1st 2024)');
        microchipImage.classList.add('validation-error');
    }
    
    return missingFields;
}

function scrollToFirstError() {
    const firstError = document.querySelector('.validation-error');
    if (firstError) {
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Add shake animation first
        firstError.style.animation = 'shake 0.5s';
        
        // After shake completes, add pulse animation
        setTimeout(() => {
            firstError.style.animation = 'pulse 1s';
            setTimeout(() => {
                firstError.style.animation = '';
            }, 1000);
        }, 500);
    }
}

// Attach change handler to approval checkbox
window.addEventListener('load', function() {
    const approveCheckbox = document.getElementById('approve-chk');
    if (approveCheckbox) {
        approveCheckbox.addEventListener('change', function() {
            // Clear any existing validation errors
            document.querySelectorAll('.validation-error').forEach(el => {
                el.classList.remove('validation-error');
            });
            
            if (this.checked) {
                // Validate all mandatory fields
                const missingFields = validateMandatoryFields();
                
                if (missingFields.length > 0) {
                    // Prevent checking
                    this.checked = false;
                    
                    // Show inline validation error box
                    showValidationErrors(missingFields);
                    
                    // Scroll to validation box
                    document.getElementById('validation-error-box').scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'start' 
                    });
                    
                    // Also scroll to first error after a delay
                    setTimeout(scrollToFirstError, 800);
                } else {
                    // All validation passed, hide any validation box
                    closeValidationBox();
                    
                    // Show signature pad
                    document.getElementById('signature-section').classList.add('active');
                    
                    // Initialize signature pad if not already done
                    if (!signatureCanvas) {
                        initSignaturePad();
                    } else {
                        // Clear existing signature
                        clearSignature();
                    }
                    
                    // Scroll to signature section
                    document.getElementById('signature-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            } else {
                // User is unchecking approval
                if (signatureDataURL) {
                    showCustomConfirm(
                        'Unchecking will clear your signature. Are you sure?',
                        'Clear Signature? ',
                        '⚠️',
                        function() {
                            document.getElementById('signature-section').classList.remove('active');
                            if (signatureCanvas) {
                                clearSignature();
                            }
                            signatureDataURL = null;
                        }
                    );
                    // If user cancels, re-check the box
                    setTimeout(() => {
                        if (! signatureDataURL) { // User confirmed
                            approveCheckbox.checked = false;
                        } else {
                            approveCheckbox.checked = true;
                        }
                    }, 100);
                } else {
                    // No signature yet, just hide
                    document.getElementById('signature-section').classList.remove('active');
                }
            }
        });
    }
    
    // Clear validation error on focus
    document.addEventListener('focus', function(e) {
        if (e.target.classList.contains('validation-error')) {
            e.target.classList.remove('validation-error');
        }
    }, true);
});

// Show validation errors in inline box
function showValidationErrors(missingFields) {
    const errorBox = document.getElementById('validation-error-box');
    const errorList = document.getElementById('validation-error-list');
    
    if (! errorBox || !errorList) return;
    
    // Clear previous errors
    errorList.innerHTML = '';
    
    // Add each missing field as a list item
    missingFields.forEach(field => {
        const li = document.createElement('li');
        li.textContent = field;
        errorList.appendChild(li);
    });
    
    // Show the box
    errorBox.style.display = 'block';
}

// Close validation error box
function closeValidationBox() {
    const errorBox = document.getElementById('validation-error-box');
    if (errorBox) {
        errorBox.style.display = 'none';
    }
}

// --- DATE FORMATTING HELPER ---
function formatDateToDDMMYYYY(dateString) {
    if (!dateString) return '';
    
    // dateString is in YYYY-MM-DD format from HTML date input
    const parts = dateString.split('-');
    if (parts.length !== 3) return dateString; // Return original if invalid
    
    const year = parts[0];
    const month = parts[1];
    const day = parts[2];
    
    return `${day}/${month}/${year}`;
}

// ======================================
// ORIENTATION MANAGEMENT
// ======================================

// Global variable to track current orientation
let pdfOrientation = 'portrait';  // Default

/**
 * Sets the PDF preview orientation and updates UI
 * @param {string} orientation - 'portrait' or 'landscape'
 */
function setOrientation(orientation) {
    // Validate input
    if (orientation !== 'portrait' && orientation !== 'landscape') {
        console.error('Invalid orientation:', orientation);
        return;
    }
    
    // Update global state
    pdfOrientation = orientation;
    
    // Update PDF container data attribute
    const pdfContainer = document.getElementById('pdf-preview-container');
    if (pdfContainer) {
        pdfContainer.setAttribute('data-orientation', orientation);
    }
    
    // Update button states
    const portraitBtn = document.getElementById('btn-portrait');
    const landscapeBtn = document.getElementById('btn-landscape');
    
    if (portraitBtn && landscapeBtn) {
        if (orientation === 'portrait') {
            portraitBtn.classList.add('active-orientation');
            landscapeBtn.classList.remove('active-orientation');
        } else {
            portraitBtn.classList.remove('active-orientation');
            landscapeBtn.classList.add('active-orientation');
        }
    }
    
    // Re-render preview to apply new layout
    renderPreview();
    
    // Reset PDF zoom to fit new orientation
    setTimeout(() => {
        resetPDFZoom();
    }, 100);
}

/**
 * Gets current PDF orientation
 * @returns {string} 'portrait' or 'landscape'
 */
function getCurrentOrientation() {
    return pdfOrientation;
}