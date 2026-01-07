// --- VARIABLES & STATE ---
const canvas = document.getElementById('drawing-canvas');
const ctx = canvas.getContext('2d');
const horseImage = document.getElementById('horse-image');

// The "Shapes" array is the single source of truth
let shapes = []; 
let selectedShapeIndex = -1; // -1 means nothing selected

let currentTool = 'black-pen';
let isDragging = false;
let dragStartPos = {x:0, y:0};

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
    // NOTE: This image file must be present in the root folder
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
        setTimeout(resizeCanvas, 50);
    };
    img.onerror = () => {
        horseImage.style.background = "#eee";
        horseImage.style.height = "300px";
        horseImage.alt = "Image not found (Section1.png)";
    }
}

function resizeCanvas() {
    const w = horseImage.naturalWidth > 0 ? horseImage.clientWidth : horseImage.offsetWidth;
    const h = horseImage.naturalHeight > 0 ? horseImage.clientHeight : horseImage.offsetHeight;
    
    if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
        redrawCanvas(); 
    }
}

initImage();
window.addEventListener('resize', resizeCanvas);

// --- TOOL SWITCHING ---
function setTool(tool) {
    currentTool = tool;
    if (tool !== 'select') {
        selectedShapeIndex = -1;
        document.getElementById('btn-delete').disabled = true;
        canvas.style.cursor = "crosshair";
    } else {
        canvas.style.cursor = "default";
    }
    
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active-tool'));
    const btn = document.querySelector(`button[onclick="setTool('${tool}')"]`);
    if(btn) btn.classList.add('active-tool');
    
    redrawCanvas();
}

// --- INPUT HANDLING ---
function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let cx, cy;
    if (e.changedTouches && e.changedTouches.length > 0) {
        cx = e.changedTouches[0].clientX;
        cy = e.changedTouches[0].clientY;
    } else {
        cx = e.clientX;
        cy = e.clientY;
    }
    return { x: (cx - rect.left) * scaleX, y: (cy - rect.top) * scaleY };
}

function startAction(e) {
    if (e.cancelable) e.preventDefault();
    const pos = getPos(e);
    isDragging = true;
    dragStartPos = pos;

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
        // Redraw immediately so we don't wait for first move
        redrawCanvas();
    }
}

function moveAction(e) {
    if (!isDragging) return;
    if (e.cancelable) e.preventDefault();
    const pos = getPos(e);

    if (currentTool === 'select' && selectedShapeIndex !== -1) {
        // Move Logic
        const dx = pos.x - dragStartPos.x;
        const dy = pos.y - dragStartPos.y;
        const shape = shapes[selectedShapeIndex];

        if (shape.type === 'symbol') {
            shape.x += dx;
            shape.y += dy;
        } else if (shape.type === 'path') {
            shape.points.forEach(p => {
                p.x += dx;
                p.y += dy;
            });
        }
        dragStartPos = pos;
        redrawCanvas();
    } else if (currentTool.endsWith('pen')) {
        // Draw Logic: Add point, then redraw the whole scene including the active line
        currentPathPoints.push({x: pos.x, y: pos.y});
        redrawCanvas(); 
    }
}

function endAction(e) {
    if (!isDragging) return;
    if (e.cancelable) e.preventDefault();
    isDragging = false;

    // Finalize the path
    if (currentTool.endsWith('pen') && currentPathPoints.length > 1) {
        shapes.push({
            type: 'path',
            points: [...currentPathPoints],
            color: (currentTool === 'red-pen') ? 'red' : 'black'
        });
        currentPathPoints = [];
        redrawCanvas();
    }
    // If it was just a dot (length 1), discard or handle as dot, 
    // here we simply discard to avoid single-pixel noise.
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