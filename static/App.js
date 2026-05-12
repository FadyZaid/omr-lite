// Global variable to store current threshold
let currentThreshold = 0.6;

class BubbleSheetScanner {
    constructor() {
        this.bubblePositions = [];
        this.idDigitPositions = [];
        this.templateImage = null;
        this.templateId = null;
        this.scale = 1.0;
        this.currentROIs = [];
        this.scanResults = [];
        this.isDefiningROI = false;
        this.currentSelection = null;
        this.detectionTimeout = null;
        this.lastDetectionTime = 0;
        this.currentROI = null;
        this.currentBatchName = null;
        this.currentBatchId = null;
        this.answerKeyUpdateTimeout = null;
        this.submittedAnswerKey = null; // Store submitted answer key
        this.questionPaperFile = null; // Store question paper file
        this.questionPaperId = null; // Store question paper ID from backend
        this.pdfSaveFileName = 'aligned_pages.zip';
        this.desktopCapabilities = null;

        // Try common backend ports
        this.possibleUrls = [
            'http://localhost:5001',
            'http://localhost:5000',
            'http://127.0.0.1:5001',
            'http://127.0.0.1:5000'
        ];
        this.backendUrl = 'http://localhost:5001'; // Default

        this.initializeEventListeners();
        this.checkBackendHealth();
    }

    initializeEventListeners() {
        // Template upload
        document.getElementById('templateUpload').addEventListener('click', () => {
            document.getElementById('templateFile').click();
        });

        document.getElementById('templateFile').addEventListener('change', (e) => {
            this.handleTemplateUpload(e);
        });

        // Question paper upload
        document.getElementById('questionPaperUpload').addEventListener('click', () => {
            document.getElementById('questionPaperFile').click();
        });

        document.getElementById('questionPaperFile').addEventListener('change', (e) => {
            this.handleQuestionPaperUpload(e);
        });

        // Remove question paper
        const removeQPBtn = document.getElementById('removeQuestionPaperBtn');
        if (removeQPBtn) {
            removeQPBtn.addEventListener('click', () => {
                this.removeQuestionPaper();
            });
        }

        // Scan files upload
        document.getElementById('scanUpload').addEventListener('click', () => {
            document.getElementById('scanFiles').click();
        });

        document.getElementById('scanFiles').addEventListener('change', (e) => {
            this.handleScanFilesUpload(e);
        });

        // Drag and drop
        this.setupDragAndDrop('templateUpload', 'templateFile');
        this.setupDragAndDrop('questionPaperUpload', 'questionPaperFile');
        this.setupDragAndDrop('scanUpload', 'scanFiles');

        // ROI definition
        document.getElementById('defineROIBtn').addEventListener('click', () => {
            this.startROIDefinition();
        });

        document.getElementById('addROIBtn').addEventListener('click', () => {
            this.addROIConfiguration();
        });

        // Answer key
        document.getElementById('refreshAnswerKeyBtn').addEventListener('click', () => {
            this.generateAnswerKeyInputs();
        });
        
        document.getElementById('submitAnswerKeyBtn').addEventListener('click', () => {
            this.submitAnswerKey();
        });
        
        document.getElementById('answerKeyModeSelect').addEventListener('change', (e) => {
            this.switchAnswerKeyMode(e.target.value);
        });

        // Processing
        document.getElementById('startScanBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.startScanning();
        });

        // Download buttons
        document.getElementById('downloadExcel').addEventListener('click', () => {
            this.downloadResults('excel');
        });

        document.getElementById('downloadCSV').addEventListener('click', () => {
            this.downloadResults('csv');
        });

        document.getElementById('finalizeScanBtn').addEventListener('click', () => {
            this.submitFinalizedResults();
        });

        // Scale control
        document.getElementById('scalePercentage').addEventListener('input', (e) => {
            this.scale = parseFloat(e.target.value) / 100;
            document.getElementById('scaleValue').textContent = e.target.value + '%';
            if (this.templateImage) {
                this.updateCanvasScale();
            }
        });

        // Threshold control
        const thresholdSlider = document.getElementById('bubble-threshold-slider');
        if (thresholdSlider) {
            thresholdSlider.addEventListener('input', function(e) {
                updateThresholdDisplay(e.target.value);
            });
            updateThresholdDisplay(thresholdSlider.value);
        }

        // Listen for ROI changes to update answer key
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('roi-type') || 
                e.target.classList.contains('roi-questions') ||
                e.target.classList.contains('roi-digits')) {
                clearTimeout(this.answerKeyUpdateTimeout);
                this.answerKeyUpdateTimeout = setTimeout(() => {
                    this.generateAnswerKeyInputs();
                }, 500);
            }
        });

    }
    collectAnswerKeyDataFromRadio() {
        const answerKeyArray = [];
        const radioGroups = document.querySelectorAll('input[type="radio"][name^="answer_"]:checked');
        
        radioGroups.forEach((radio, index) => {
            const value = radio.value.trim().toUpperCase();
            answerKeyArray.push({
                question: index + 1,
                answer: value || "X"
            });
        });
        
        return JSON.stringify(answerKeyArray);
    }


    setupDragAndDrop(uploadId, fileInputId) {
        const uploadArea = document.getElementById(uploadId);
        const fileInput = document.getElementById(fileInputId);

        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            fileInput.files = e.dataTransfer.files;
            fileInput.dispatchEvent(new Event('change'));
        });
    }

    async checkBackendHealth() {
        let connected = false;

        for (const url of this.possibleUrls) {
            try {
                const response = await fetch(`${url}/health`, {
                    method: 'GET',
                    mode: 'cors'
                });

                if (response.ok) {
                    this.backendUrl = url;
    
                    connected = true;
                    break;
                }
            } catch (error) {
                continue;
            }
        }

        if (!connected) {
            this.updateStatus('Backend connection failed. Please ensure Flask server is running.', 'error');
        }
    }

    async getDesktopCapabilities(forceRefresh = false) {
        if (this.desktopCapabilities && !forceRefresh) {
            return this.desktopCapabilities;
        }

        try {
            const response = await fetch(`${this.backendUrl}/desktop_capabilities`);
            if (!response.ok) {
                this.desktopCapabilities = { desktop_mode: false, native_save_dialog: false };
                return this.desktopCapabilities;
            }

            const data = await response.json();
            this.desktopCapabilities = {
                desktop_mode: !!data.desktop_mode,
                native_save_dialog: !!data.native_save_dialog,
            };
            return this.desktopCapabilities;
        } catch (error) {
            this.desktopCapabilities = { desktop_mode: false, native_save_dialog: false };
            return this.desktopCapabilities;
        }
    }

    fallbackBrowserDownload(blob, suggestedFileName) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = suggestedFileName || 'download.bin';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }

    blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                try {
                    const result = reader.result || '';
                    const base64Part = String(result).split(',')[1] || '';
                    resolve(base64Part);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    async saveBlobWithSmartDialog(blob, suggestedFileName) {
        const caps = await this.getDesktopCapabilities();
        if (caps.desktop_mode && caps.native_save_dialog) {
            try {
                const contentBase64 = await this.blobToBase64(blob);
                const response = await fetch(`${this.backendUrl}/desktop_save_content`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        suggested_filename: suggestedFileName || 'download.bin',
                        content_base64: contentBase64,
                    }),
                });

                const data = await response.json();
                if (data.success) {
                    return { success: true, method: 'desktop-dialog' };
                }
                if (data.cancelled) {
                    return { success: false, cancelled: true, method: 'desktop-dialog' };
                }
            } catch (error) {
                console.warn('desktop_save_content failed, falling back to browser download', error);
            }
        }

        // Browser mode: rely on the browser's normal download behavior/settings.
        this.fallbackBrowserDownload(blob, suggestedFileName);
        return { success: true, method: 'browser-download' };
    }

    async saveFromUrlWithSmartDialog(sourceUrl, suggestedFileName) {
        const caps = await this.getDesktopCapabilities();
        if (caps.desktop_mode && caps.native_save_dialog) {
            try {
                const response = await fetch(`${this.backendUrl}/desktop_save_from_url`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        source_url: sourceUrl,
                        suggested_filename: suggestedFileName || 'download.bin',
                    }),
                });
                const data = await response.json();
                if (data.success) {
                    return { success: true, method: 'desktop-dialog' };
                }
                if (data.cancelled) {
                    return { success: false, cancelled: true, method: 'desktop-dialog' };
                }
            } catch (error) {
                console.warn('desktop_save_from_url failed, falling back to blob save', error);
            }
        }

        const response = await fetch(sourceUrl);
        if (!response.ok) {
            throw new Error(`Download failed with status ${response.status}`);
        }
        const blob = await response.blob();
        return this.saveBlobWithSmartDialog(blob, suggestedFileName);
    }

    async handleTemplateUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp'];
        if (!validTypes.includes(file.type)) {
            this.updateStatus('Please upload a valid image file (JPG, PNG, GIF, BMP)', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            const img = new Image();
            img.onload = async () => {
                this.templateImage = img;
                document.getElementById('templateImage').src = e.target.result;

                // Show success message
                const successDiv = document.getElementById('templateSuccess');
                const fileNameSpan = document.getElementById('templateFileName');
                if (successDiv && fileNameSpan) {
                    successDiv.style.display = 'block';
                    fileNameSpan.textContent = file.name;
                }

                // Show scale control
                document.getElementById('scaleControlStandalone').style.display = 'block';

                // Enable buttons
                this.updateButtonStates();

                // Upload template to backend
                await this.uploadTemplateToBackend(file);

                this.updateStatus('Template loaded successfully! Now define ROI areas.', 'info');
            };
            img.onerror = () => {
                this.updateStatus('Error loading image. Please try a different file.', 'error');
            };
            img.src = e.target.result;
        };
        reader.onerror = () => {
            this.updateStatus('Error reading file. Please try again.', 'error');
        };
        reader.readAsDataURL(file);
    }

    async uploadTemplateToBackend(file) {
        try {
            const formData = new FormData();
            formData.append('template_image', file);

            const response = await fetch(`${this.backendUrl}/process_template`, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const data = await response.json();
                this.templateId = data.template_id;
            }
        } catch (error) {
            console.error('Error uploading template:', error);
        }
    }

    async handleQuestionPaperUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'application/pdf'];
        if (!validTypes.includes(file.type)) {
            this.updateStatus('Please upload a valid image or PDF file', 'error');
            return;
        }

        try {
            // Upload to backend
            const formData = new FormData();
            formData.append('question_paper', file);
            
            const response = await fetch(`${this.backendUrl}/upload_question_paper`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            
            if (data.success) {
                this.questionPaperFile = file;
                this.questionPaperId = data.file_id;
                
                // Show success message
                document.getElementById('questionPaperSuccess').style.display = 'block';
                document.getElementById('questionPaperFileName').textContent = file.name;
                
                this.updateStatus(`Question paper uploaded: ${file.name}`, 'complete');
            } else {
                this.updateStatus('Failed to upload question paper', 'error');
            }
        } catch (error) {
            console.error('Question paper upload failed:', error);
            this.updateStatus('Error uploading question paper', 'error');
        }
    }

    removeQuestionPaper() {
        this.questionPaperFile = null;
        this.questionPaperId = null;
        document.getElementById('questionPaperSuccess').style.display = 'none';
        document.getElementById('questionPaperFile').value = '';
        this.updateStatus('Question paper removed', 'info');
    }

    handleScanFilesUpload(event) {
        const files = event.target.files;
        const fileListElement = document.getElementById('selectedFilesList');

        if (files && files.length > 0) {
            const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp'];
            const invalidFiles = Array.from(files).filter(file => !validTypes.includes(file.type));

            if (invalidFiles.length > 0) {
                this.updateStatus(`Invalid file types: ${invalidFiles.map(f => f.name).join(', ')}`, 'error');
                return;
            }

            fileListElement.innerHTML = '';

            Array.from(files).forEach(file => {
                const listItem = document.createElement('div');
                listItem.className = 'file-item';
                listItem.innerHTML = `
                    <span>${file.name}</span>
                    <span style="color: #666; font-size: 0.8em;">${this.formatFileSize(file.size)}</span>
                `;
                fileListElement.appendChild(listItem);
            });

            this.updateButtonStates();
            this.updateStatus(`${files.length} file(s) selected`, 'info');
        } else {
            fileListElement.innerHTML = '<div class="no-files">No files selected</div>';
            this.updateButtonStates();
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    updateButtonStates() {
        const hasTemplate = !!this.templateImage;
        const hasROIs = this.currentROIs.length > 0;
        const hasScanFiles = document.getElementById('scanFiles').files.length > 0;
        
        document.getElementById('defineROIBtn').disabled = !hasTemplate;
        document.getElementById('startScanBtn').disabled = !(hasTemplate && hasROIs && hasScanFiles);
        
        const refreshBtn = document.getElementById('refreshAnswerKeyBtn');
        if (refreshBtn) {
            refreshBtn.disabled = !hasROIs;
        }
    }

    startROIDefinition() {
        if (!this.templateImage) return;

        const canvas = document.getElementById('roiCanvas');
        const container = document.getElementById('canvasContainer');

        this.isDefiningROI = true;
        this.currentSelection = null;

        clearTimeout(this.detectionTimeout);

        this.updateCanvasScale();

        container.style.display = 'block';
        document.getElementById('roiContainer').style.display = 'block';

        this.redrawFullCanvas();
        this.setupCanvasSelection(canvas);

        this.updateStatus('Click and drag to define bubble areas', 'info');
    }

    setupCanvasSelection(canvas) {
        let isSelecting = false;
        let startX, startY;
        const ctx = canvas.getContext('2d');

        // Remove existing event listeners
        canvas.onmousedown = null;
        canvas.onmousemove = null;
        canvas.onmouseup = null;

        canvas.addEventListener('mousedown', (e) => {
            isSelecting = true;
            const rect = canvas.getBoundingClientRect();
            startX = e.clientX - rect.left;
            startY = e.clientY - rect.top;
        });

        canvas.addEventListener('mousemove', (e) => {
            if (!isSelecting) return;

            const rect = canvas.getBoundingClientRect();
            const currentX = e.clientX - rect.left;
            const currentY = e.clientY - rect.top;

            this.redrawFullCanvas();

            const selectionX = Math.min(startX, currentX);
            const selectionY = Math.min(startY, currentY);
            const selectionWidth = Math.abs(currentX - startX);
            const selectionHeight = Math.abs(currentY - startY);

            ctx.strokeStyle = '#667eea';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(selectionX, selectionY, selectionWidth, selectionHeight);
            ctx.setLineDash([]);
        });

        canvas.addEventListener('mouseup', async (e) => {
            if (!isSelecting) return;
            isSelecting = false;

            const rect = canvas.getBoundingClientRect();
            const endX = e.clientX - rect.left;
            const endY = e.clientY - rect.top;

            const width = Math.abs(endX - startX);
            const height = Math.abs(endY - startY);

            if (width > 10 && height > 10) {
                const roi = {
                    x: Math.min(startX, endX) / this.scale,
                    y: Math.min(startY, endY) / this.scale,
                    width: width / this.scale,
                    height: height / this.scale
                };

                this.currentROI = roi;

                try {
                    roi.bubbles = await this.detectBubblesInROI(roi);
                    this.currentROIs.push(roi);
                    this.addROIConfiguration(roi);
                    this.redrawFullCanvas();
                    this.generateAnswerKeyInputs();
                } catch (error) {
                    console.error('Bubble detection failed:', error);
                }

                this.updateStatus(`ROI ${this.currentROIs.length} defined`, 'info');
                this.updateButtonStates();
            }
        });
    }

    async detectBubblesInROI(roi, gridCols = null) {
        if (!this.templateId) return [];

        try {
            const response = await fetch(`${this.backendUrl}/detect_bubbles_realtime`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    template_id: this.templateId,
                    roi_coords: {
                        x: roi.x,
                        y: roi.y,
                        width: roi.width,
                        height: roi.height
                    },
                    threshold: currentThreshold,
                    grid_cols: gridCols || 5
                })
            });

            if (response.ok) {
                const data = await response.json();
                updateBubbleCountDisplay(data.bubble_count);
                return data.bubbles || [];
            }
            return [];
        } catch (error) {
            console.log('Detection error:', error);
            return [];
        }
    }

    drawBubbleCircles(ctx, bubbles) {
        bubbles.forEach(bubble => {
            ctx.save();

            const x = Math.round(bubble.x * this.scale);
            const y = Math.round(bubble.y * this.scale);
            const radius = Math.max(Math.round(bubble.radius * this.scale), 4);
            const color = bubble.is_filled ? '#28a745' : '#dc3545';

            ctx.beginPath();
            ctx.arc(x, y, radius, 0, 2 * Math.PI);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = bubble.is_filled ? 'rgba(40, 167, 69, 0.15)' : 'rgba(220, 53, 69, 0.1)';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(x, y, radius + 1, 0, 2 * Math.PI);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.restore();
        });
    }

    addROIConfiguration(roi = null) {
        const roiList = document.getElementById('roiList');
        const roiIndex = this.currentROIs.length;

        const roiItem = document.createElement('div');
        roiItem.className = 'roi-item';
        roiItem.innerHTML = `
            <h4>ROI ${roiIndex} Configuration</h4>
            <div class="roi-controls">
                <div class="form-group">
                    <label>Type:</label>
                    <select class="roi-type">
                        <option value="Q">Questions (Q)</option>
                        <option value="ID">ID Numbers (ID)</option>
                    </select>
                </div>
                <div class="form-group questions-config">
                    <label>Questions:</label>
                    <input type="number" class="roi-questions" value="5" min="1" max="100">
                </div>
                <div class="form-group questions-config">
                    <label>Choices per Question:</label>
                    <input type="number" class="roi-choices" value="5" min="2" max="10">
                </div>
                <div class="form-group questions-config">
                    <label>Orientation:</label>
                    <select class="roi-orientation">
                        <option value="horizontal">Horizontal (Rows)</option>
                        <option value="vertical">Vertical (Columns)</option>
                    </select>
                </div>
                <div class="form-group digits-config" style="display: none;">
                    <label>Digits:</label>
                    <input type="number" class="roi-digits" value="9" min="1" max="20">
                </div>
                <div class="form-group">
                    <button class="btn btn-secondary remove-roi">Remove ROI</button>
                </div>
                <div class="form-group">
                    <button class="btn btn-secondary auto-detect-btn">Auto Detect Grid</button>
                </div>
            </div>
        `;

        roiList.appendChild(roiItem);

        const typeSelect = roiItem.querySelector('.roi-type');
        typeSelect.addEventListener('change', (e) => {
            const questionsConfig = roiItem.querySelectorAll('.questions-config');
            const digitsConfig = roiItem.querySelectorAll('.digits-config');

            if (e.target.value === 'ID') {
                questionsConfig.forEach(el => el.style.display = 'none');
                digitsConfig.forEach(el => el.style.display = 'block');
            } else {
                questionsConfig.forEach(el => el.style.display = 'block');
                digitsConfig.forEach(el => el.style.display = 'none');
            }
        });

        const autoDetectBtn = roiItem.querySelector('.auto-detect-btn');
        autoDetectBtn.addEventListener('click', async () => {
            if (!roi) return;

            const bubbles = await this.detectBubblesInROI(roi);
            if (bubbles.length === 0) {
                this.updateStatus('No bubbles detected', 'error');
                return;
            }

            const type = roiItem.querySelector('.roi-type').value;
            if (type === 'Q') {
                const rows = new Set();
                const cols = new Set();

                bubbles.forEach(bubble => {
                    rows.add(bubble.row);
                    cols.add(bubble.col);
                });

                const questionsInput = roiItem.querySelector('.roi-questions');
                const choicesInput = roiItem.querySelector('.roi-choices');

                questionsInput.value = rows.size;
                choicesInput.value = cols.size;

            } else {
                const cols = new Set();
                bubbles.forEach(bubble => cols.add(bubble.col));
                const digitsInput = roiItem.querySelector('.roi-digits');
                digitsInput.value = cols.size;
            }
            
            this.generateAnswerKeyInputs();
        });

        const removeBtn = roiItem.querySelector('.remove-roi');
        removeBtn.addEventListener('click', () => {
            const index = Array.from(roiList.children).indexOf(roiItem);
            this.currentROIs.splice(index, 1);
            roiItem.remove();
            this.updateCanvasScale();
            this.updateStatus(`ROI ${index + 1} removed`, 'info');
            this.renumberROIs();
            this.generateAnswerKeyInputs();
            this.updateButtonStates();
        });

        this.generateAnswerKeyInputs();
    }

    generateAnswerKeyInputs() {
        const container = document.getElementById('answerKeyContainer');
        const refreshBtn = document.getElementById('refreshAnswerKeyBtn');
        const submitBtn = document.getElementById('submitAnswerKeyBtn');
        const modeSelect = document.getElementById('answerKeyModeSelect');
        
        if (!container) return;
        
        let totalQuestions = 0;
        const roiItems = document.querySelectorAll('.roi-item');
        
        roiItems.forEach(item => {
            const type = item.querySelector('.roi-type').value;
            if (type === 'Q') {
                const questionsInput = item.querySelector('.roi-questions');
                if (questionsInput) {
                    totalQuestions += parseInt(questionsInput.value) || 0;
                }
            }
        });
        
        if (totalQuestions === 0) {
            container.innerHTML = `
                <div class="no-questions-message">
                    <i class="fas fa-info-circle"></i> 
                    <p>No questions defined yet. Please add question ROIs first.</p>
                </div>
            `;
            if (refreshBtn) refreshBtn.disabled = true;
            if (submitBtn) submitBtn.disabled = true;
            return;
        }
        
        if (refreshBtn) refreshBtn.disabled = false;
        if (submitBtn) submitBtn.disabled = false;
        
        // Check which mode is selected
        const mode = modeSelect ? modeSelect.value : 'individual';
        
        if (mode === 'bulk') {
            this.generateBulkAnswerKeyInput(totalQuestions);
        } else {
            this.generateIndividualAnswerKeyInputs(totalQuestions);
        }
    }
    
    generateIndividualAnswerKeyInputs(totalQuestions) {
        const container = document.getElementById('answerKeyContainer');
        container.innerHTML = '';
        
        for (let i = 1; i <= totalQuestions; i++) {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'answer-key-item';
            itemDiv.innerHTML = `
                <label for="answer-${i}">Q${i}:</label>
                <input 
                    type="text" 
                    id="answer-${i}" 
                    class="answer-key-input" 
                    maxlength="1" 
                    placeholder="A-F or X"
                    oninput="this.value = this.value.toUpperCase().replace(/[^A-FX]/, '')"
                >
            `;
            container.appendChild(itemDiv);
        }
    }
    
    generateBulkAnswerKeyInput(totalQuestions) {
        const container = document.getElementById('answerKeyContainer');
        container.innerHTML = `
            <div class="bulk-answer-input-container">
                <div class="form-group">
                    <label style="font-weight: 600; margin-bottom: 10px; display: block;">
                        <i class="fas fa-paste"></i> Paste all ${totalQuestions} answers separated by commas:
                    </label>
                    <textarea 
                        id="bulkAnswerKeyInput" 
                        class="form-control" 
                        rows="5" 
                        placeholder="Example: A,B,C,D,A,B,C,D,A,B,C,D..."
                        style="font-family: monospace; font-size: 14px;"
                    ></textarea>
                    <small class="form-text text-muted">
                        Expected format: ${totalQuestions} answers separated by commas (e.g., A,B,C,D,A,B...). Use X for questions to skip.
                    </small>
                </div>
            </div>
        `;
    }
    
    switchAnswerKeyMode(mode) {
        // Get current total questions
        let totalQuestions = 0;
        const roiItems = document.querySelectorAll('.roi-item');
        
        roiItems.forEach(item => {
            const type = item.querySelector('.roi-type').value;
            if (type === 'Q') {
                const questionsInput = item.querySelector('.roi-questions');
                if (questionsInput) {
                    totalQuestions += parseInt(questionsInput.value) || 0;
                }
            }
        });
        
        if (totalQuestions > 0) {
            if (mode === 'bulk') {
                this.generateBulkAnswerKeyInput(totalQuestions);
            } else {
                this.generateIndividualAnswerKeyInputs(totalQuestions);
            }
        }
    }
    
    submitAnswerKey() {
        const modeSelect = document.getElementById('answerKeyModeSelect');
        const mode = modeSelect ? modeSelect.value : 'individual';
        
        let answerCount = 0;
        let validAnswers = 0;
        let answerText = '';
        let answerKeyData = [];
        
        if (mode === 'bulk') {
            const bulkInput = document.getElementById('bulkAnswerKeyInput');
            if (bulkInput) {
                const value = bulkInput.value.trim();
                if (value) {
                    const answers = value.split(',').map(a => a.trim().toUpperCase());
                    answerCount = answers.length;
                    validAnswers = answers.filter(a => a && a !== '' && a !== 'X').length;
                    answerText = answers.slice(0, 10).join(',') + (answers.length > 10 ? '...' : '');
                    // Build answer key data array
                    answerKeyData = answers.map((answer, index) => ({
                        question: index + 1,
                        answer: answer || "X"
                    }));
                }
            }
        } else {
            const inputs = document.querySelectorAll('.answer-key-input');
            answerCount = inputs.length;
            const answers = [];
            inputs.forEach(input => {
                const val = input.value.trim().toUpperCase();
                answers.push(val || 'X');
                if (val && val !== 'X') {
                    validAnswers++;
                }
            });
            answerText = answers.slice(0, 10).join(',') + (answers.length > 10 ? '...' : '');
            // Build answer key data array
            answerKeyData = answers.map((answer, index) => ({
                question: index + 1,
                answer: answer
            }));
        }
        
        if (validAnswers === 0) {
            this.updateStatus('Please enter at least one answer (A-F)', 'error');
            return;
        }
        
        // Store the answer key directly as JSON string
        this.submittedAnswerKey = JSON.stringify(answerKeyData);
        console.log('[DEBUG] Answer key submitted and stored:', this.submittedAnswerKey);
        
        // Show success message with details
        const message = `Answer key submitted successfully. ${validAnswers} of ${answerCount} questions answered. First answers: ${answerText}`;
        this.updateStatus(message, 'complete');
        
        // Show modern answer key alert
        const alertBox = document.getElementById('answerKeyAlert');
        const alertMsg = document.getElementById('alertMsg');
        if (alertBox && alertMsg) {
            alertMsg.textContent = `Answer key submitted. ${validAnswers} of ${answerCount} answered. First: ${answerText}`;
            alertBox.classList.add('show');
            setTimeout(() => alertBox.classList.remove('show'), 4000);
        }
    }

    collectAnswerKeyData() {
        // If answer key was already submitted, use that
        if (this.submittedAnswerKey) {
            console.log('[DEBUG] Using stored submitted answer key:', this.submittedAnswerKey);
            return this.submittedAnswerKey;
        }
        
        console.log('[DEBUG] Collecting answer key data from inputs...');
        const modeSelect = document.getElementById('answerKeyModeSelect');
        const mode = modeSelect ? modeSelect.value : 'individual';
        const answerKeyArray = [];
        
        if (mode === 'bulk') {
            // Bulk mode: get from textarea
            const bulkInput = document.getElementById('bulkAnswerKeyInput');
            console.log('[DEBUG] Bulk mode - textarea element:', bulkInput);
            console.log('[DEBUG] Bulk mode - textarea value:', bulkInput ? bulkInput.value : 'null');
            if (bulkInput && bulkInput.value.trim()) {
                const answers = bulkInput.value.trim().split(',').map(a => a.trim().toUpperCase());
                answers.forEach((answer, index) => {
                    answerKeyArray.push({
                        question: index + 1,
                        answer: answer || "X"
                    });
                });
            } else if (bulkInput) {
                // Bulk input exists but is empty - this is okay during scanning
                // Return empty array which will be caught by validation
                console.log('[DEBUG] Bulk input is empty');
                return JSON.stringify([]);
            }
        } else {
            // Individual mode: get from individual inputs
            const inputs = document.querySelectorAll('.answer-key-input');
            console.log('[DEBUG] Individual mode - found', inputs.length, 'inputs');
            if (inputs.length > 0) {
                inputs.forEach((input, index) => {
                    const value = input.value.trim().toUpperCase();
                    answerKeyArray.push({
                        question: index + 1,
                        answer: value || "X"
                    });
                });
            } else {
                // No inputs generated yet - return empty
                console.log('[DEBUG] No individual inputs found');
                return JSON.stringify([]);
            }
        }
        
        const result = JSON.stringify(answerKeyArray);
        console.log('[DEBUG] Collected answer key:', result);
        return result;
    }

    renumberROIs() {
        const roiItems = document.querySelectorAll('.roi-item');
        roiItems.forEach((item, index) => {
            const h4 = item.querySelector('h4');
            if (h4) {
                h4.textContent = `ROI ${index + 1} Configuration`;
            }
        });
    }

    groupedROIs() {
        const roiItems = document.querySelectorAll('.roi-item');
        let final = [];
        this.idDigitPositions = [];

        roiItems.forEach((item, roiIdx) => {
            const type = item.querySelector('.roi-type').value;
            const roi = this.currentROIs[roiIdx];
            if (!roi) return;

            if (type === 'Q') {
                const numQuestions = parseInt(item.querySelector('.roi-questions').value);
                const numChoices = parseInt(item.querySelector('.roi-choices').value);
                const orientation = item.querySelector('.roi-orientation').value;

                let questionBoxes = [];
                let x = roi.x, y = roi.y, w = roi.width, h = roi.height;

                if (orientation === 'horizontal') {
                    let cellH = h / numQuestions;
                    let cellW = w / numChoices;
                    for (let i = 0; i < numQuestions; i++) {
                        let row = [];
                        for (let j = 0; j < numChoices; j++) {
                            let boxX = Math.round(x + j * cellW);
                            let boxY = Math.round(y + i * cellH);
                            let boxW = Math.round(cellW);
                            let boxH = Math.round(cellH);
                            row.push([boxX, boxY, boxW, boxH]);
                        }
                        questionBoxes.push(row);
                    }
                } else {
                    let cellH = h / numChoices;
                    let cellW = w / numQuestions;
                    for (let i = 0; i < numQuestions; i++) {
                        let row = [];
                        for (let j = 0; j < numChoices; j++) {
                            let boxX = Math.round(x + i * cellW);
                            let boxY = Math.round(y + j * cellH);
                            let boxW = Math.round(cellW);
                            let boxH = Math.round(cellH);
                            row.push([boxX, boxY, boxW, boxH]);
                        }
                        questionBoxes.push(row);
                    }
                }
                final = final.concat(questionBoxes);
            } else if (type === 'ID') {
                const numDigits = parseInt(item.querySelector('.roi-digits').value);
                const numChoicesPerDigit = 10;

                let x = roi.x, y = roi.y, w = roi.width, h = roi.height;
                let digitWidth = w / numDigits;
                let digitHeight = h / numChoicesPerDigit;

                for (let d = 0; d < numDigits; d++) {
                    let digitColumn = [];
                    for (let digitVal = 0; digitVal < numChoicesPerDigit; digitVal++) {
                        let boxX = Math.round(x + d * digitWidth);
                        let boxY = Math.round(y + digitVal * digitHeight);
                        let boxW = Math.round(digitWidth);
                        let boxH = Math.round(digitHeight);
                        digitColumn.push([boxX, boxY, boxW, boxH]);
                    }
                    this.idDigitPositions.push(digitColumn);
                }
            }
        });

        return final;
    }

    validateInputs() {
        const files = document.getElementById("scanFiles").files;
        if (!files || files.length === 0) {
            throw new Error("Please select at least one scan file");
        }

        const answerKeyJSON = this.collectAnswerKeyData();
        const answerKeyData = JSON.parse(answerKeyJSON);
        
        // Check if any answers were provided
        if (!answerKeyData || answerKeyData.length === 0) {
            const modeSelect = document.getElementById('answerKeyModeSelect');
            const mode = modeSelect ? modeSelect.value : 'individual';
            
            if (mode === 'bulk') {
                throw new Error("Please enter answers in the bulk input box and click 'Submit Answers' button. Switch to 'One by One' mode if you prefer individual inputs.");
            } else {
                throw new Error("Please define ROI areas first to generate answer key inputs, enter your answers, and click 'Submit Answers'.");
            }
        }
        
        let hasValidAnswer = false;
        const invalidAnswers = [];
        
        answerKeyData.forEach(item => {
            const answer = item.answer;
            if (answer && answer !== 'X' && answer !== '') {
                hasValidAnswer = true;
                if (!/^[A-F]$/.test(answer)) {
                    invalidAnswers.push(`Q${item.question}: "${answer}"`);
                }
            }
        });
        
        if (!hasValidAnswer) {
            throw new Error("Please provide at least one answer (use A-F). Use X to skip questions.");
        }
        
        if (invalidAnswers.length > 0) {
            throw new Error(`Invalid answers: ${invalidAnswers.join(', ')}. Use only A-F or X`);
        }

        if (this.currentROIs.length === 0) {
            throw new Error("Please define at least one ROI area");
        }

        const rois = this.groupedROIs();
        if (rois.length === 0) {
            throw new Error("No valid question ROIs configured");
        }

        const totalQuestions = rois.length;
        const answerKeyCount = answerKeyData.length;
        
        if (answerKeyCount < totalQuestions) {
            this.updateStatus(`Warning: Answer key has ${answerKeyCount} answers but ${totalQuestions} questions configured. Missing questions will be marked as excluded (X).`, 'warning');
        } else if (answerKeyCount > totalQuestions) {
            this.updateStatus(`Warning: Answer key has ${answerKeyCount} answers but only ${totalQuestions} questions configured. Extra answers will be ignored.`, 'warning');
        }

        return { 
            files, 
            answerKey: answerKeyJSON,
            rois 
        };
    }

    updateCanvasScale() {
        const canvas = document.getElementById('roiCanvas');
        if (!canvas || !this.templateImage) return;

        const scaledWidth = this.templateImage.width * this.scale;
        const scaledHeight = this.templateImage.height * this.scale;

        canvas.width = scaledWidth;
        canvas.height = scaledHeight;
        canvas.style.width = scaledWidth + 'px';
        canvas.style.height = scaledHeight + 'px';

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(this.templateImage, 0, 0, scaledWidth, scaledHeight);

        this.redrawFullCanvas();
    }

    redrawFullCanvas() {
        const canvas = document.getElementById('roiCanvas');
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(this.templateImage, 0, 0, canvas.width, canvas.height);

        for (const roi of this.currentROIs) {
            const x = roi.x * this.scale;
            const y = roi.y * this.scale;
            const width = roi.width * this.scale;
            const height = roi.height * this.scale;

            ctx.strokeStyle = '#667eea';
            ctx.lineWidth = 2;
            ctx.fillStyle = 'rgba(102, 126, 234, 0.2)';
            ctx.fillRect(x, y, width, height);
            ctx.strokeRect(x, y, width, height);

            const index = this.currentROIs.indexOf(roi);
            ctx.fillStyle = '#667eea';
            ctx.font = 'bold 14px Arial';
            ctx.fillText(`ROI ${index + 1}`, x + 5, y - 5);

            if (roi.bubbles) {
                this.drawBubbleCircles(ctx, roi.bubbles);
            }
        }
    }

    async startScanning() {
        try {
            const { files, answerKey, rois } = this.validateInputs();
            const username = document.body.dataset.username || "local";

            const batchNameElement = document.getElementById("batchName");
            const batchName = batchNameElement ? batchNameElement.value.trim() : '';
            
            this.updateStatus(`Preparing to scan ${files.length} files...`, "processing");
            document.getElementById('startScanBtn').disabled = true;

            const formData = new FormData();
            formData.append("username", username);
            formData.append("batch_name", batchName);
            formData.append("roi_configs", JSON.stringify(rois));
            formData.append("id_digit_positions", JSON.stringify(this.idDigitPositions));
            formData.append("answer_key", answerKey);
            formData.append("min_pixel_threshold", currentThreshold);
            formData.append("uncertainty_ratio", 0.8);
            
            // Add question paper ID if uploaded
            if (this.questionPaperId) {
                formData.append('question_paper_id', this.questionPaperId);
            }
            
            for (let i = 0; i < files.length; i++) {
                formData.append("scan_images", files[i]);
            }
            
            const response = await fetch(`${this.backendUrl}/scan`, { 
                method: "POST", 
                body: formData 
            });
            const result = await response.json();

            if (!response.ok) throw new Error(result.error || `Server error: ${response.status}`);

            if (result.success) {
                this.currentBatchName = result.batch_name;
                this.currentBatchId = result.batch_id;
                
                this.updateStatus(`${result.message} (Batch: ${result.batch_name})`, "complete");

                if (result.uncertain_review_list && result.uncertain_review_list.length > 0) {
                    document.getElementById('resultsContainer').style.display = 'none';
                    document.getElementById('reviewContainer').style.display = 'block';
                    this.buildReviewUI(result.uncertain_review_list);
                } else {
                    document.getElementById('reviewContainer').style.display = 'none';
                    this.scanResults = result.results;
                    this.displayResults(this.scanResults);
                    document.getElementById('startScanBtn').disabled = false;
                }
            } else {
                throw new Error(result.error || "An unknown error occurred.");
            }
        } catch (error) {
            console.error("Scan failed:", error);
            this.updateStatus(`Error: ${error.message}`, "error");
            document.getElementById('startScanBtn').disabled = false;
        }
    }

    buildReviewUI(reviewList) {
        const reviewItemsContainer = document.getElementById('reviewItems');
        reviewItemsContainer.innerHTML = '';
    
        reviewList.forEach((item, index) => {
            const numChoices = item.fill_counts.length;
            let optionsHTML = '';
            for (let i = 0; i < numChoices; i++) {
                const choiceLetter = String.fromCharCode(65 + i);
                optionsHTML += `<label style="margin-right: 15px;"><input type="radio" name="review_q_${index}" value="${choiceLetter}"> ${choiceLetter}</label>`;
            }
            optionsHTML += `<label><input type="radio" name="review_q_${index}" value="?" checked> ? (Uncertain)</label>`;
    
            const snapshotSrc = `${this.backendUrl}${item.snapshot_url}`;

            
            const itemHTML = `
            <div class="review-item" data-question-idx="${item.question_idx}" data-image-name="${item.image_name}" style="border: 1px solid #ddd; padding: 15px; margin-bottom: 15px; border-radius: 5px; background: white;">
                <h4 style="margin-top: 0; color: #333;">Review: ${item.image_name} - Question ${item.question_idx + 1}</h4>
                <p style="color: #c0392b; font-weight: bold;">Reason: ${item.reason}</p>
                <p><strong>Fill Counts:</strong> ${JSON.stringify(item.fill_counts)}</p>
                
                <div style="margin: 15px 0; padding: 15px; background: #f8f9fa; border-radius: 5px; border: 1px solid #dee2e6;">
                    <h5 style="margin-top: 0;">Snapshot Preview:</h5>
                    <div style="margin-top: 10px; text-align: center; min-height: 150px;">
                        <img src="${snapshotSrc}" 
                             alt="Question Snapshot" 
                             style="max-width: 100%; max-height: 300px; border: 2px solid #667eea; border-radius: 5px;">
                    </div>
                </div>
                
                <div style="margin-top: 15px;">
                    <strong>Select Correct Answer:</strong><br>
                    <div class="review-choices" style="margin-top: 10px;">${optionsHTML}</div>
                </div>
            </div>
        `;
            reviewItemsContainer.innerHTML += itemHTML;
        });
    
        document.getElementById('finalizeScanBtn').onclick = () => this.submitFinalizedResults();
    }

    async submitFinalizedResults() {
        const corrections = [];
        document.querySelectorAll('.review-item').forEach(element => {
            const selectedChoice = element.querySelector('input[type="radio"]:checked');
            corrections.push({
                image_name: element.dataset.imageName,
                question_idx: parseInt(element.dataset.questionIdx),
                corrected_answer: selectedChoice.value,
            });
        });

       
        const answerKey = this.collectAnswerKeyData();

        const response = await fetch(`${this.backendUrl}/finalize_scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                batch_id: this.currentBatchId,
                corrections: corrections,
                answer_key: answerKey,
            }),
        });

        const finalResult = await response.json();
        if (finalResult.success) {
            this.updateStatus("Results finalized successfully!", "complete");
            document.getElementById('reviewContainer').style.display = 'none';
            this.scanResults = finalResult.final_results;
            this.displayResults(this.scanResults);
            document.getElementById('startScanBtn').disabled = false;
        } else {
            this.updateStatus(`Error finalizing: ${finalResult.error}`, "error");
        }
    }

    displayResults(results) {
        const resultsContent = document.getElementById('resultsContent');
        resultsContent.innerHTML = '';

        if (!results || results.length === 0) {
            resultsContent.innerHTML = '<div class="no-results">No results to display</div>';
            return;
        }
        
        if (this.currentBatchName) {
            const batchNameDiv = document.createElement('div');
            batchNameDiv.className = 'batch-name-display';
            batchNameDiv.innerHTML = `<h2>Batch: ${this.currentBatchName}</h2>`;
            resultsContent.appendChild(batchNameDiv);
        }

        let html = '<h3>Results Summary</h3><table class="results-table"><thead><tr>';
        html += '<th>File</th><th>Student ID</th><th>Score</th><th>Total</th><th>Percentage</th><th>Status</th></tr></thead><tbody>';

        results.forEach(result => {
            const hasError = result.error;
            const filename = result.image_name || 'Unknown';
            const studentId = result.student_id || '?';

            html += `<tr class="${hasError ? 'error-row' : ''}">`;
            html += `<td>${filename}</td>`;
            html += `<td>${studentId}</td>`;

            if (hasError) {
                html += `<td colspan="4" class="error-message">${result.error}</td>`;
            } else {
                const score = result.score !== undefined ? result.score : 'N/A';
                const total = result.total_questions !== undefined ? result.total_questions : 'N/A';
                const percentage = (score !== 'N/A' && total !== 'N/A' && total > 0) ?
                    `${Math.round((score / total) * 100)}%` : 'N/A';

                html += `<td>${score}</td>`;
                html += `<td>${total}</td>`;
                html += `<td>${percentage}</td>`;
                html += `<td>${result.uncertainties?.length ?
                    `<span style="color: #dd6b20;">Review needed</span>` :
                    '<span style="color: #38a169;">Completed</span>'}</td>`;
            }

            html += '</tr>';
        });

        html += '</tbody></table>';
        const tableDiv = document.createElement('div');
        tableDiv.innerHTML = html;
        resultsContent.appendChild(tableDiv);

        document.getElementById('resultsContainer').style.display = 'block';
    }

    async downloadResults(format) {
        if (!this.scanResults || this.scanResults.length === 0) {
            this.updateStatus("No results to download", "error");
            return;
        }

        const answerKey = this.collectAnswerKeyData();
        if (!answerKey || answerKey === '[]') {
            this.updateStatus("Answer key is required for download", "error");
            return;
        }

        if (this.currentBatchId) {
            const endpoint = format === 'excel' ? 'download_excel' : 'download_csv';
            const downloadUrl = `${this.backendUrl}/${endpoint}/${this.currentBatchId}?answer_key=${encodeURIComponent(answerKey)}`;
            const suggestedFileName = format === 'excel'
                ? `batch_${this.currentBatchId}_results.xlsx`
                : `batch_${this.currentBatchId}_results.csv`;

            try {
                const saveResult = await this.saveFromUrlWithSmartDialog(downloadUrl, suggestedFileName);
                if (saveResult.success) {
                    this.updateStatus(`${format.toUpperCase()} file saved`, "complete");
                } else if (saveResult.cancelled) {
                    this.updateStatus(`${format.toUpperCase()} save cancelled`, "info");
                }
            } catch (error) {
                this.updateStatus(`Failed to save ${format.toUpperCase()}: ${error.message}`, "error");
            }
        } else {
            this.updateStatus("Batch ID not found", "error");
        }
    }

    async downloadScoredPDF() {
        if (!this.currentBatchId) {
            this.updateStatus("No batch selected", "error");
            return;
        }

        this.updateStatus("Generating PDF...", "processing");
        const downloadUrl = `${this.backendUrl}/generate_scored_pdf/${this.currentBatchId}`;
        const suggestedFileName = `batch_${this.currentBatchId}_scored.pdf`;

        try {
            const saveResult = await this.saveFromUrlWithSmartDialog(downloadUrl, suggestedFileName);
            if (saveResult.success) {
                this.updateStatus("PDF saved", "complete");
            } else if (saveResult.cancelled) {
                this.updateStatus("PDF save cancelled", "info");
            }
        } catch (error) {
            this.updateStatus(`Failed to save PDF: ${error.message}`, "error");
        }
    }

    async extractStudentData() {
        if (!this.currentBatchId) {
            this.updateStatus("No batch selected", "error");
            return;
        }

        try {
            this.updateStatus("Extracting student data...", "processing");
            
            const response = await fetch(`${this.backendUrl}/extract_student_data/${this.currentBatchId}`);
            const data = await response.json();

            if (data.success) {
                this.displayStudentDataExtraction(data);
                this.updateStatus("Student data extracted successfully", "complete");
            } else {
                this.updateStatus(data.error || "Failed to extract student data", "error");
            }
        } catch (error) {
            console.error('Extract error:', error);
            this.updateStatus("Failed to extract student data: " + error.message, "error");
        }
    }

    displayStudentDataExtraction(data) {
        const resultsContent = document.getElementById('resultsContent');
        
        let html = `
            <div class="student-data-extraction">
                <h2>Student Data Extraction</h2>
                <div class="extraction-summary">
                    <p><strong>Batch:</strong> ${data.batch_name}</p>
                    <p><strong>Date:</strong> ${data.batch_date}</p>
                    <p><strong>Total Students:</strong> ${data.summary.total_students}</p>
                    <p><strong>Average Score:</strong> ${data.summary.average_score}%</p>
                    <p><strong>Students with Uncertainties:</strong> ${data.summary.students_with_uncertainties}</p>
                </div>
                <button class="btn btn-primary" onclick="scanner.copyStudentDataToClipboard()">
                    <i class="fas fa-copy"></i> Copy to Clipboard
                </button>
                <button class="btn btn-secondary" onclick="scanner.downloadStudentDataJSON()">
                    <i class="fas fa-download"></i> Download JSON
                </button>
                <table class="results-table">
                    <thead>
                        <tr>
                            <th>Student ID</th>
                            <th>Score</th>
                            <th>Total</th>
                            <th>Percentage</th>
                            <th>Grade</th>
                            <th>Uncertain Answers</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        data.student_data.forEach(student => {
            html += `
                <tr class="${student.has_uncertainties ? 'has-uncertainty' : ''}">
                    <td>${student.student_id}</td>
                    <td>${student.score}</td>
                    <td>${student.total_questions}</td>
                    <td>${student.percentage}%</td>
                    <td>${student.grade}</td>
                    <td>${student.uncertain_count > 0 ? `? ${student.uncertain_count}` : 'OK'}</td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        resultsContent.innerHTML = html;
        
        // Store data for clipboard/download
        this.currentStudentData = data;
    }

    copyStudentDataToClipboard() {
        if (!this.currentStudentData) {
            this.updateStatus("No student data available", "error");
            return;
        }

        // Create CSV format
        let csvContent = "Student ID,Score,Total Questions,Percentage,Grade,Uncertain Count\n";
        this.currentStudentData.student_data.forEach(student => {
            csvContent += `${student.student_id},${student.score},${student.total_questions},${student.percentage},${student.grade},${student.uncertain_count}\n`;
        });

        navigator.clipboard.writeText(csvContent).then(() => {
            this.updateStatus("Student data copied to clipboard", "complete");
        }).catch(err => {
            this.updateStatus("Failed to copy to clipboard", "error");
        });
    }

    async downloadStudentDataJSON() {
        if (!this.currentStudentData) {
            this.updateStatus("No student data available", "error");
            return;
        }

        const dataStr = JSON.stringify(this.currentStudentData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const suggestedFileName = `${this.currentStudentData.batch_name}_student_data.json`;

        try {
            const saveResult = await this.saveBlobWithSmartDialog(dataBlob, suggestedFileName);
            if (saveResult.success) {
                this.updateStatus("Student data JSON saved", "complete");
            } else if (saveResult.cancelled) {
                this.updateStatus("Student data JSON save cancelled", "info");
            }
        } catch (error) {
            this.updateStatus(`Failed to save student data JSON: ${error.message}`, "error");
        }
    }

    updateStatus(message, statusType = 'info', title = null) {
        // Map status types to toast types and icons
        const toastConfig = {
            'error': {
                title: title || 'Error',
                icon: 'X',
                class: 'toast-error'
            },
            'success': {
                title: title || 'Success',
                icon: 'OK',
                class: 'toast-success'
            },
            'warning': {
                title: title || 'Warning',
                icon: '!',
                class: 'toast-warning'
            },
            'info': {
                title: title || 'Info',
                icon: 'i',
                class: 'toast-info'
            },
            'processing': {
                title: title || 'Processing',
                icon: '...',
                class: 'toast-processing'
            },
            'complete': {
                title: title || 'Complete',
                icon: 'OK',
                class: 'toast-complete'
            }
        };
    
        const config = toastConfig[statusType] || toastConfig.info;
    
        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast ${config.class}`;
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');
        toast.setAttribute('aria-atomic', 'true');
    
        toast.innerHTML = `
            <div class="toast-icon">${config.icon}</div>
            <div class="toast-content">
                <div class="toast-title">${config.title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close" aria-label="Close">x</button>
        `;
    
        // Add to container
        const container = document.getElementById('toastContainer');
        container.appendChild(toast);
    
        // Trigger animation
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
    
        // Auto-remove after delay (longer for errors)
        const autoRemoveDelay = statusType === 'error' ? 10000 : 5000;
        let removeTimeout = setTimeout(() => {
            removeToast(toast);
        }, autoRemoveDelay);
    
        // Close button functionality
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            clearTimeout(removeTimeout);
            removeToast(toast);
        });
    
        // Function to remove toast with animation
        function removeToast(toastElement) {
            toastElement.classList.remove('show');
            toastElement.classList.add('hiding');
            
            setTimeout(() => {
                if (toastElement.parentNode === container) {
                    container.removeChild(toastElement);
                }
            }, 300);
        }
    
        // Also update the old status element for backward compatibility
        const statusElement = document.getElementById('statusMessage');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `status-message ${statusType}`;
            statusElement.style.display = 'flex';
    
            if (statusType === 'info') {
                setTimeout(() => {
                    if (statusElement.className.includes('info')) {
                        statusElement.style.display = 'none';
                    }
                }, 5000);
            }
        }
    }

    // ==================== BATCH MANAGEMENT ====================

    async renameBatch(batchId, newName) {
    try {
        const response = await fetch(`${this.backendUrl}/rename_batch/${batchId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_batch_name: newName })
        });
        
        const result = await response.json();
        
        if (result.success) {
            this.updateStatus(result.message, 'complete');
            
            // Update current batch name if this is the active batch
            if (this.currentBatchId === batchId) {
                this.currentBatchName = result.new_batch_name;
                
                // Reload the batch results with updated paths
                await this.viewBatchResults(batchId);
            }
            
            // Reload the batch list
            await this.loadBatches();
            
            return true;
        } else {
            this.updateStatus(`Error: ${result.error}`, 'error');
            return false;
        }
        } catch (error) {
            this.updateStatus(`Error renaming batch: ${error.message}`, 'error');
            return false;
        }
    }

    async deleteBatch(batchId) {
        if (!confirm('Are you sure you want to delete this batch? This action cannot be undone.')) {
            return false;
        }
        
        try {
            const response = await fetch(`${this.backendUrl}/delete_batch/${batchId}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.updateStatus(result.message, 'complete');
                this.loadBatches(); // Refresh the batch list
                return true;
            } else {
                this.updateStatus(`Error: ${result.error}`, 'error');
                return false;
            }
        } catch (error) {
            this.updateStatus(`Error deleting batch: ${error.message}`, 'error');
            return false;
        }
    }

    async loadBatches() {
        try {
            const response = await fetch(`${this.backendUrl}/get_batches`);
            const result = await response.json();
            
            if (result.success) {
                this.displayBatchList(result.batches);
            }
        } catch (error) {
            console.error('Error loading batches:', error);
        }
    }

    displayBatchList(batches) {
        const container = document.getElementById('batchListContainer');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!batches || batches.length === 0) {
            container.innerHTML = '<div class="no-batches">No batches found</div>';
            return;
        }
    
        batches.forEach(batch => {
            const batchItem = document.createElement('div');
            batchItem.className = 'batch-item';
            batchItem.innerHTML = `
                <div class="batch-info">
                    <h4 class="batch-name" data-batch-id="${batch.id}">${batch.name}</h4>
                    <p class="batch-meta">${batch.date} • ${batch.paper_count} papers</p>
                </div>
                <div class="batch-actions">
                    <button class="btn btn-sm btn-primary rename-batch-btn" data-batch-id="${batch.id}" data-batch-name="${batch.name}">
                        <i class="fas fa-edit"></i> Rename
                    </button>
                    <button class="btn btn-sm btn-secondary view-batch-btn" data-batch-id="${batch.id}">
                        <i class="fas fa-eye"></i> View
                    </button>
                    <button class="btn btn-sm btn-danger delete-batch-btn" data-batch-id="${batch.id}">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            `;
            container.appendChild(batchItem);
        });
        
        // Add event listeners using event delegation
        container.addEventListener('click', async (e) => {
            const renameBtn = e.target.closest('.rename-batch-btn');
            const viewBtn = e.target.closest('.view-batch-btn');
            const deleteBtn = e.target.closest('.delete-batch-btn');
            
            if (renameBtn) {
                const batchId = parseInt(renameBtn.dataset.batchId);
                const currentName = renameBtn.dataset.batchName;
                await this.editBatchName(batchId, currentName);
            } else if (viewBtn) {
                const batchId = parseInt(viewBtn.dataset.batchId);
                await this.viewBatchResults(batchId);
            } else if (deleteBtn) {
                const batchId = parseInt(deleteBtn.dataset.batchId);
                await this.deleteBatch(batchId);
            }
        });
    }
    async editBatchName(batchId, currentName) {
        const newName = prompt('Enter new batch name:', currentName);
        if (newName && newName.trim() !== '' && newName !== currentName) {
            await this.renameBatch(batchId, newName.trim());
        }
    }
    async viewBatchResults(batchId) {
        try {
            this.updateStatus('Loading batch results...', 'processing');
            
            const response = await fetch(`${this.backendUrl}/view_batch_results/${batchId}`);
            const result = await response.json();
            
            if (result.success) {
                this.currentBatchId = batchId;
                this.currentBatchName = result.batch_info.name;
                
                this.scanResults = result.results.map(r => ({
                    ...r,
                    image_name: r.student_id,
                    original_image_url: r.original_image_url,
                    visualization_url: r.visualization_url
                }));
                
                this.displayBatchResults(result.batch_info, result.results);
                this.updateStatus('Batch loaded successfully', 'complete');
                
                setTimeout(() => {
                    document.getElementById('resultsContainer').scrollIntoView({ 
                        behavior: 'smooth',
                        block: 'start'
                    });
                }, 100);
            } else {
                this.updateStatus(`Error: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Error loading batch:', error);
            this.updateStatus(`Error loading batch: ${error.message}`, 'error');
        }
    }   

    displayBatchResults(batchInfo, results) {
        const resultsContent = document.getElementById('resultsContent');
        resultsContent.innerHTML = '';
        
        const headerHTML = `
            <div class="batch-header">
                <div class="batch-title">
                    <h2>${batchInfo.name}</h2>
                    <p>Date: ${batchInfo.date} | Papers: ${batchInfo.paper_count}</p>
                </div>
                <div class="batch-actions">
                    <button class="btn btn-primary" onclick="scanner.downloadResults('excel')">
                        <i class="fas fa-download"></i> Download Excel
                    </button>
                    <button class="btn btn-secondary" onclick="scanner.downloadResults('csv')">
                        <i class="fas fa-download"></i> Download CSV
                    </button>
                    <button class="btn btn-success" onclick="scanner.downloadScoredPDF()">
                        <i class="fas fa-file-pdf"></i> Download PDF
                    </button>
                    <button class="btn btn-info" onclick="scanner.extractStudentData()">
                        <i class="fas fa-database"></i> Extract Data
                    </button>
                </div>
            </div>
        `;
        resultsContent.innerHTML += headerHTML;
        
        if (!results || results.length === 0) {
            resultsContent.innerHTML += '<div class="no-results">No results found for this batch</div>';
            return;
        }
        
        let tableHTML = '<table class="results-table"><thead><tr>';
        tableHTML += '<th>Student ID</th><th>Score</th><th>Total</th><th>Percentage</th><th>Actions</th></tr></thead><tbody>';
        
        results.forEach((result, index) => {
            const percentage = result.total_questions > 0 
                ? `${Math.round((result.score / result.total_questions) * 100)}%` 
                : 'N/A';
            
            const visualizationUrl = result.visualization_url || '';
            
            tableHTML += `
                <tr>
                    <td class="student-id-cell-editable" 
                        data-batch-id="${batchInfo.id}" 
                        data-result-index="${index}"
                        data-student-id="${result.student_id || 'Unknown'}"
                        title="Click to edit"
                        style="cursor: pointer; position: relative;"
                        onclick="scanner.editStudentIdInline(this)">
                        <i class="fas fa-user-circle" style="margin-right: 6px;"></i>
                        <span class="student-id-value">${result.student_id || 'Unknown'}</span>
                        <i class="fas fa-edit" style="margin-left: 6px; opacity: 0.5; font-size: 0.8rem;"></i>
                    </td>
                    <td>${result.score}</td>
                    <td>${result.total_questions}</td>
                    <td>${percentage}</td>
                    <td>
                        <button class="btn btn-sm btn-primary" 
                                onclick="scanner.viewImage('${visualizationUrl}', 'Graded - ${result.student_id}')"
                                ${!visualizationUrl ? 'disabled' : ''}>
                            <i class="fas fa-eye"></i> View Graded Sheet
                        </button>
                    </td>
                </tr>
            `;
        });
        
        tableHTML += '</tbody></table>';
        resultsContent.innerHTML += tableHTML;
        
        document.getElementById('resultsContainer').style.display = 'block';
    }

    viewImage(imageUrl, title) {
        if (!imageUrl || imageUrl === '') {
            this.updateStatus('Image not available', 'error');
            return;
        }
        
        let fullUrl = imageUrl;
        
        if (imageUrl.startsWith('http')) {
            fullUrl = imageUrl;
        } else if (imageUrl.startsWith('/uploads/')) {
            fullUrl = this.backendUrl + imageUrl;
        } else {
            fullUrl = this.backendUrl + '/uploads/' + imageUrl;
        }
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content image-modal">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="close-btn">x</button>
                </div>
                <div class="modal-body">
                    <div class="image-container">
                        <div class="loading-spinner">
                            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: #667eea;"></i>
                            <p>Loading image...</p>
                        </div>
                        <img src="${fullUrl}" 
                             alt="${title}" 
                             style="max-width: 100%; height: auto; display: none;">
                        <div class="image-error" style="display: none; color: red; padding: 20px; text-align: center;">
                            <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 10px;"></i>
                            <p><strong>Image failed to load</strong></p>
                            <p style="font-size: 0.9em; color: #666; word-break: break-all;">URL: ${fullUrl}</p>
                            <button class="btn btn-sm" style="margin-top: 10px;">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        const img = modal.querySelector('img');
        const loadingSpinner = modal.querySelector('.loading-spinner');
        const errorDiv = modal.querySelector('.image-error');
        const closeBtn = modal.querySelector('.close-btn');
        const errorCloseBtn = errorDiv.querySelector('.btn');
        
        img.addEventListener('load', () => {
            loadingSpinner.style.display = 'none';
            img.style.display = 'block';
        });
        
        img.addEventListener('error', () => {
            loadingSpinner.style.display = 'none';
            errorDiv.style.display = 'block';
        });
        
        const closeModal = () => modal.remove();
        closeBtn.addEventListener('click', closeModal);
        errorCloseBtn.addEventListener('click', closeModal);
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
        
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);
    }

    // ==================== PDF PROCESSING ====================

    async rotateAlignPDF() {
        console.log('rotateAlignPDF method called');
        
        const fileInput = document.getElementById('pdfFileInput');
        const rotationAngleInput = document.getElementById('rotationAngle');
        const autoDeskewCheckbox = document.getElementById('autoDeskew');
        
        console.log('File input found:', !!fileInput);
        console.log('Rotation angle input found:', !!rotationAngleInput);
        console.log('Auto deskew checkbox found:', !!autoDeskewCheckbox);
        
        if (!fileInput) {
            console.error('pdfFileInput element not found');
            return;
        }
        
        if (!fileInput.files || !fileInput.files[0]) {
            this.updateStatus('Please select a PDF file', 'error', 'PDF Required');
            return;
        }
        
        const rotationAngle = rotationAngleInput ? parseInt(rotationAngleInput.value) || 0 : 0;
        const autoDeskew = autoDeskewCheckbox ? autoDeskewCheckbox.checked : true;
        
        console.log('Rotation angle:', rotationAngle);
        console.log('Auto deskew:', autoDeskew);
        
        const processBtn = document.getElementById('processPdfButton') || 
                          document.querySelector('#pdfProcessing .btn-primary');
        
        if (!processBtn) {
            console.error('Process button not found');
            return;
        }
        
        const originalBtnContent = processBtn.innerHTML;
        
        const formData = new FormData();
        formData.append('pdf_file', fileInput.files[0]);
        formData.append('rotation_angle', rotationAngle.toString());
        formData.append('auto_deskew', autoDeskew ? 'true' : 'false');
        
        processBtn.disabled = true;
        processBtn.innerHTML = `<i class="fas fa-sync-alt fa-spin"></i> Processing...`;
        
        const statusDiv = document.getElementById('pdfProcessingStatus');
        if (statusDiv) {
            statusDiv.style.display = 'block';
            statusDiv.className = 'status-message processing';
        }
        
        const startTime = Date.now();
        let estimateInterval;
        
        const updateProcessingStatus = () => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
            
            if (statusDiv) {
                statusDiv.innerHTML = `
                    <i class="fas fa-sync-alt fa-spin"></i>
                    <strong>Processing PDF...</strong><br>
                    <span style="font-size: 0.9em;">Time elapsed: ${timeStr}</span><br>
                    <span style="font-size: 0.85em; opacity: 0.8;">Aligning pages and generating images...</span>
                `;
            }
        };
        
        updateProcessingStatus();
        estimateInterval = setInterval(updateProcessingStatus, 1000);
        
        this.updateStatus('Processing PDF - This may take a moment...', 'processing', 'PDF Processing');
        
        try {
            console.log('Sending request to backend:', this.backendUrl + '/rotate_align_pdf');
            const response = await fetch(`${this.backendUrl}/rotate_align_pdf`, {
                method: 'POST',
                body: formData
            });
            
            console.log('Response status:', response.status);
            
            clearInterval(estimateInterval);
            
            if (response.ok) {
                const blob = await response.blob();
                let saveMethod = 'browser-download';

                const saveResult = await this.saveBlobWithSmartDialog(
                    blob,
                    this.pdfSaveFileName || 'aligned_pages.zip'
                );
                if (saveResult.success) {
                    saveMethod = saveResult.method || saveMethod;
                } else if (saveResult.cancelled) {
                    if (statusDiv) {
                        statusDiv.className = 'status-message info';
                        statusDiv.innerHTML = `
                            <i class="fas fa-info-circle"></i>
                            <strong>Save cancelled</strong><br>
                            <span style="font-size: 0.9em;">The processed ZIP was not saved.</span>
                        `;
                    }
                    this.updateStatus('PDF processing completed, but save was cancelled.', 'info', 'Save Cancelled');
                    return;
                }

                const saveLocationText = (saveMethod === 'desktop-dialog')
                    ? `Saved to selected location: ${this.pdfSaveFileName || 'aligned_pages.zip'}`
                    : `Downloaded using browser settings: ${this.pdfSaveFileName || 'aligned_pages.zip'}`;
                
                const totalTime = Math.floor((Date.now() - startTime) / 1000);
                const minutes = Math.floor(totalTime / 60);
                const seconds = totalTime % 60;
                const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
                
                if (statusDiv) {
                    statusDiv.className = 'status-message complete';
                    statusDiv.innerHTML = `
                        <i class="fas fa-check-circle"></i>
                        <strong>PDF processed successfully!</strong><br>
                        <span style="font-size: 0.9em;">Total time: ${timeStr}</span><br>
                        <span style="font-size: 0.85em;">${saveLocationText}</span>
                    `;
                }
                
                this.updateStatus(
                    (saveMethod === 'desktop-dialog')
                        ? 'PDF processed and saved to selected location.'
                        : 'PDF processed successfully! Browser download started.',
                    'complete', 'Success');
                
                setTimeout(() => {
                    this.updateStatus('Extract images and use them in Step 1', 'info', 'Next Step');
                    if (statusDiv) {
                        statusDiv.style.display = 'none';
                    }
                }, 5000);
            } else {
                clearInterval(estimateInterval);
                const errorText = await response.text();
                console.error('Server error:', errorText);
                
                if (statusDiv) {
                    statusDiv.className = 'status-message error';
                    statusDiv.innerHTML = `
                        <i class="fas fa-exclamation-circle"></i>
                        <strong>Processing failed</strong><br>
                        <span style="font-size: 0.9em;">Please try again or check the PDF file</span>
                    `;
                }
                
                try {
                    const error = JSON.parse(errorText);
                    this.updateStatus(`Error: ${error.error || 'Failed to process'}`, 'error', 'Processing Failed');
                } catch {
                    this.updateStatus(`Error: Server returned ${response.status}`, 'error', 'Processing Failed');
                }
            }
        } catch (error) {
            clearInterval(estimateInterval);
            console.error('Fetch error:', error);
            
            if (statusDiv) {
                statusDiv.className = 'status-message error';
                statusDiv.innerHTML = `
                    <i class="fas fa-exclamation-circle"></i>
                    <strong>Connection error</strong><br>
                    <span style="font-size: 0.9em;">${error.message}</span>
                `;
            }
            
            this.updateStatus(`Connection Error: ${error.message}`, 'error', 'Connection Error');
        } finally {
            processBtn.disabled = false;
            processBtn.innerHTML = originalBtnContent;
        }
    }

    // ==================== ANSWER KEY ENHANCEMENTS ====================

    generateAnswerKeyInputsWithRadio() {
        const container = document.getElementById('answerKeyContainer');
        if (!container) return;
        
        let totalQuestions = 0;
        const roiItems = document.querySelectorAll('.roi-item');
        
        roiItems.forEach(item => {
            const type = item.querySelector('.roi-type').value;
            if (type === 'Q') {
                const questionsInput = item.querySelector('.roi-questions');
                if (questionsInput) {
                    totalQuestions += parseInt(questionsInput.value) || 0;
                }
            }
        });
        
        if (totalQuestions === 0) {
            container.innerHTML = `
                <div class="no-questions-message">
                    <i class="fas fa-info-circle"></i> 
                    <p>No questions defined yet. Please add question ROIs first.</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = `
            <div class="answer-key-controls">
                <button class="btn btn-secondary" onclick="scanner.showBulkPasteModal()">
                    <i class="fas fa-paste"></i> Bulk Paste Answers
                </button>
                <button class="btn btn-secondary" onclick="scanner.clearAllAnswers()">
                    <i class="fas fa-eraser"></i> Clear All
                </button>
            </div>
            <div id="answerKeyInputsList"></div>
        `;
        
        const inputsList = document.getElementById('answerKeyInputsList');
        
        for (let i = 1; i <= totalQuestions; i++) {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'answer-key-item-radio';
            itemDiv.innerHTML = `
                <label class="question-label">Q${i}:</label>
                <div class="radio-group">
                    ${['A', 'B', 'C', 'D', 'E', 'F'].map(letter => `
                        <label class="radio-label">
                            <input type="radio" name="answer_${i}" value="${letter}">
                            <span>${letter}</span>
                        </label>
                    `).join('')}
                    <label class="radio-label exclude">
                        <input type="radio" name="answer_${i}" value="X" checked>
                        <span>X</span>
                    </label>
                </div>
            `;
            inputsList.appendChild(itemDiv);
        }
    }

    showBulkPasteModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Bulk Paste Answers</h3>
                <p>Paste answers separated by commas (e.g., A,B,C,D,A,B...)</p>
                <textarea id="bulkAnswersInput" rows="5" placeholder="A,B,C,D,E,F,A,X..."></textarea>
                <div class="modal-actions">
                    <button class="btn btn-primary" onclick="scanner.applyBulkAnswers()">Apply</button>
                    <button class="btn btn-secondary" onclick="scanner.closeBulkPasteModal()">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    applyBulkAnswers() {
        const input = document.getElementById('bulkAnswersInput').value.trim();
        const answers = input.split(',').map(a => a.trim().toUpperCase());
        
        answers.forEach((answer, index) => {
            const radioInputs = document.querySelectorAll(`input[name="answer_${index + 1}"]`);
            radioInputs.forEach(radio => {
                if (radio.value === answer) {
                    radio.checked = true;
                }
            });
        });
        
        this.closeBulkPasteModal();
        this.updateStatus(`${answers.length} answers applied`, 'complete');
    }

    closeBulkPasteModal() {
        const modal = document.querySelector('.modal-overlay');
        if (modal) modal.remove();
    }

    clearAllAnswers() {
        const radios = document.querySelectorAll('input[type="radio"][value="X"]');
        radios.forEach(radio => radio.checked = true);
        this.updateStatus('All answers cleared', 'info');
    }
    
    // ==================== QUESTION ANALYSIS ====================

    async analyzeQuestions(batchId) {
        const answerKey = this.collectAnswerKeyData();
        
        try {
            const response = await fetch(
                `${this.backendUrl}/analyze_questions/${batchId}?answer_key=${encodeURIComponent(answerKey)}`
            );
            
            const result = await response.json();
            
            if (result.success) {
                this.displayQuestionAnalysis(result.analysis, result.total_students);
            } else {
                this.updateStatus(`Error: ${result.error}`, 'error');
            }
        } catch (error) {
            this.updateStatus(`Error analyzing questions: ${error.message}`, 'error');
        }
    }

    displayQuestionAnalysis(analysis, totalStudents) {
        const container = document.getElementById('analysisContainer');
        if (!container) return;
        
        let html = `
            <h3>Question Difficulty Analysis</h3>
            <p class="analysis-summary">Total Students: ${totalStudents}</p>
            <table class="analysis-table">
                <thead>
                    <tr>
                        <th>Question</th>
                        <th>Correct</th>
                        <th>Wrong</th>
                        <th>Uncertain</th>
                        <th>Success Rate</th>
                        <th>Difficulty</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        analysis.forEach(item => {
            const difficultyClass = item.difficulty.toLowerCase();
            html += `
                <tr class="difficulty-${difficultyClass}">
                    <td>Q${item.question_number}</td>
                    <td>${item.correct_count}</td>
                    <td>${item.wrong_count}</td>
                    <td>${item.uncertain_count}</td>
                    <td>${item.correct_percentage}%</td>
                    <td><span class="difficulty-badge ${difficultyClass}">${item.difficulty}</span></td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
        container.innerHTML = html;
        container.style.display = 'block';
    }

    // ==================== STUDENT ID EDITING ====================

    editStudentIdInline(cell) {
        const batchId = cell.dataset.batchId;
        const resultIndex = cell.dataset.resultIndex;
        const currentId = cell.dataset.studentId;
        const valueSpan = cell.querySelector('.student-id-value');
        
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentId === 'Unknown' ? '' : currentId;
        input.maxLength = 20;
        input.style.cssText = 'width: 100%; padding: 6px 10px; border: 2px solid #667eea; border-radius: 6px; font-size: 1rem; font-weight: 600; text-align: center;';
        
        const originalHTML = cell.innerHTML;
        
        cell.innerHTML = '';
        cell.appendChild(input);
        input.focus();
        input.select();
        
        const saveEdit = async () => {
            const newId = input.value.trim();
            
            if (newId && newId !== currentId) {
                try {
                    this.updateStatus('Updating student ID...', 'processing');
                    
                    const response = await fetch(`${this.backendUrl}/update_student_id`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            batch_id: parseInt(batchId),
                            result_index: parseInt(resultIndex),
                            new_student_id: newId
                        })
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        cell.dataset.studentId = newId;
                        valueSpan.textContent = newId;
                        cell.innerHTML = originalHTML.replace(currentId, newId);
                        this.updateStatus('Student ID updated successfully', 'complete');
                    } else {
                        cell.innerHTML = originalHTML;
                        this.updateStatus('Error: ' + result.error, 'error');
                    }
                } catch (error) {
                    cell.innerHTML = originalHTML;
                    this.updateStatus('Error updating Student ID: ' + error.message, 'error');
                }
            } else {
                cell.innerHTML = originalHTML;
            }
        };
        
        input.addEventListener('blur', saveEdit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            } else if (e.key === 'Escape') {
                cell.innerHTML = originalHTML;
            }
        });
    }

} // End of BubbleSheetScanner class

// ==================== GLOBAL FUNCTIONS ====================

// Global threshold functions
function updateThresholdDisplay(value) {
    const displayElement = document.getElementById('threshold-value-display');
    if (displayElement) {
        displayElement.textContent = parseFloat(value).toFixed(1);
    }
    currentThreshold = parseFloat(value);

    if (window.scanner && window.scanner.currentROI && window.scanner.templateId) {
        updateBubblesWithNewThreshold();
    }
}

async function updateBubblesWithNewThreshold() {
    try {
        if (!window.scanner) return;

        const response = await fetch(`${window.scanner.backendUrl}/update_bubble_threshold`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                template_id: window.scanner.templateId,
                roi_coords: window.scanner.currentROI,
                threshold: currentThreshold,
                grid_cols: 5
            })
        });

        const data = await response.json();

        if (data.success) {
            if (window.scanner.currentROI) {
                const roiIndex = window.scanner.currentROIs.length - 1;
                if (window.scanner.currentROIs[roiIndex]) {
                    window.scanner.currentROIs[roiIndex].bubbles = data.bubbles;
                }
            }

            window.scanner.redrawFullCanvas();
            updateBubbleCountDisplay(data.bubble_count);
        }
    } catch (error) {
        console.error('Error updating threshold:', error);
    }
}

function updateBubbleCountDisplay(count) {
    const countElement = document.getElementById('bubble-count-display');
    if (countElement) {
        countElement.textContent = `Bubbles detected: ${count}`;
    }
}
// In your DOMContentLoaded event listener:
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.scanner = new BubbleSheetScanner();
        
        // Load user's batches if on appropriate page
        const batchListContainer = document.getElementById('batchListContainer');
        if (batchListContainer) {
            window.scanner.loadBatches();
        }
        
        console.log("Bubble Sheet Scanner initialized");
    } catch (error) {
        console.error("Failed to initialize:", error);
    }
});
