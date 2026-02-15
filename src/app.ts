interface AppConfig {
  BACKEND_URL: string;
  MAX_FILE_SIZE: number;
  REQUEST_TIMEOUT: number;
  SUPPORTED_FORMATS: string[];
  QUALITY_THRESHOLDS: {
    MIN_CLAIM_CONFIDENCE: number;
    MIN_EXPLANATION_LENGTH: number;
    MAX_CLAIMS_DISPLAY: number;
    MAX_ENTITIES_DISPLAY: number;
  };
}

interface AppState {
  currentState: 'idle' | 'uploading' | 'ready' | 'analyzing' | 'done' | 'error';
  selectedFile: File | null;
  uploadProgress: number;
  analysisStartTime: number | null;
  analysisResults: AnalysisResults | null;
}

interface AnalysisResults {
  // Common fields
  metadata?: {
    format?: string;
    duration?: string;
    encoder?: string;
    c2pa_data?: any;
  };
  
  // Fact-check analysis fields
  final?: {
    verdict: string;
    confidence_percent: number;
    one_line_label: string;
    misinformation_risk_score: number;
    splice_risk_score: number;
    timeline_mismatch_risk_score: number;
    avg_factcheck_confidence: number;
  };
  structured?: {
    combined_summary: string;
    key_entities: Record<string, any>;
  };
  claims?: {
    claims: Array<{
      claim: string;
      confidence: number;
      evidence: Array<{ source: string; timestamp: string; text: string }>;
    }>;
  };
  factcheck?: {
    results: Array<{
      verdict: string;
      confidence: number;
      explanation: string;
      correct_information: string;
      what_to_verify_manually?: string;
    }>;
  };
  timing?: any;
  splice?: any;
  raw_analysis?: string;
  
  // AI detection fields
  is_ai_generated?: boolean;
  trust_score?: number;
  confidence?: number;
  detection_methods?: {
    c2pa_metadata?: {
      detected: boolean;
      data: any;
    };
    synthid_analysis?: {
      is_ai: boolean;
      trust_score: number;
      confidence: number;
      note: string;
    };
  };
  
  // Legacy synthid field (for backward compatibility)
  synthid?: {
    is_ai: boolean;
    trust_score: number;
    confidence: number;
    note: string;
  };
  signals?: {
    c2pa_ai_detected?: boolean;
    synthid_ai_detected?: boolean;
    synthid_trust_score?: number;
  };
}

interface Elements {
  navItems: NodeListOf<Element>;
  statusPill: HTMLElement | null;
  statusText: HTMLElement | null;
  dropzone: HTMLElement | null;
  fileInput: HTMLInputElement | null;
  chooseFileBtn: HTMLElement | null;
  fileInfo: HTMLElement | null;
  fileName: HTMLElement | null;
  fileMeta: HTMLElement | null;
  videoPreview: HTMLVideoElement | null;
  uploadProgress: HTMLElement | null;
  uploadProgressFill: HTMLElement | null;
  uploadPercent: HTMLElement | null;
  progressLabel: HTMLElement | null;
  progressStatus: HTMLElement | null;
  statusLine: HTMLElement | null;
  errorMessage: HTMLElement | null;
  captionInput: HTMLTextAreaElement | null;
  captionCounter: HTMLElement | null;
  analyzeFactCheckBtn: HTMLButtonElement | null;
  analyzeAIBtn: HTMLButtonElement | null;
  analyzeButtonContainer: HTMLElement | null;
  outputChips: HTMLElement | null;
  resultsSection: HTMLElement | null;
  newAnalysisBtn: HTMLElement | null;
  downloadBtn: HTMLElement | null;
  processingStatus: HTMLElement | null;
}

const CONFIG: AppConfig = {
  BACKEND_URL: 'http://localhost:5000',
  MAX_FILE_SIZE: 500 * 1024 * 1024,
  REQUEST_TIMEOUT: 5 * 60 * 1000,
  SUPPORTED_FORMATS: ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv'],
  QUALITY_THRESHOLDS: {
    MIN_CLAIM_CONFIDENCE: 60,
    MIN_EXPLANATION_LENGTH: 10,
    MAX_CLAIMS_DISPLAY: 10,
    MAX_ENTITIES_DISPLAY: 8
  }
};

let appState: AppState = {
  currentState: 'idle',
  selectedFile: null,
  uploadProgress: 0,
  analysisStartTime: null,
  analysisResults: null
};

let elements: Elements = {} as Elements;

document.addEventListener('DOMContentLoaded', (): void => {
  initializeElements();
  setupEventListeners();
  updateUI();
  addLoadingAnimations();
});

function initializeElements(): void {
  elements = {
    navItems: document.querySelectorAll('.nav-item'),
    statusPill: document.getElementById('statusPill'),
    statusText: document.getElementById('statusText'),
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('fileInput') as HTMLInputElement,
    chooseFileBtn: document.getElementById('chooseFileBtn'),
    fileInfo: document.getElementById('fileInfo'),
    fileName: document.getElementById('fileName'),
    fileMeta: document.getElementById('fileMeta'),
    videoPreview: document.getElementById('videoPreview') as HTMLVideoElement,
    uploadProgress: document.getElementById('uploadProgress'),
    uploadProgressFill: document.getElementById('uploadProgressFill'),
    uploadPercent: document.getElementById('uploadPercent'),
    progressLabel: document.getElementById('progressLabel'),
    progressStatus: document.getElementById('progressStatus'),
    statusLine: document.getElementById('statusLine'),
    errorMessage: document.getElementById('errorMessage'),
    captionInput: document.getElementById('captionInput') as HTMLTextAreaElement,
    captionCounter: document.getElementById('captionCounter'),
    analyzeFactCheckBtn: document.getElementById('analyzeFactCheckBtn') as HTMLButtonElement,
    analyzeAIBtn: document.getElementById('analyzeAIBtn') as HTMLButtonElement,
    analyzeButtonContainer: document.getElementById('analyzeButtonContainer'),
    outputChips: document.getElementById('outputChips'),
    resultsSection: document.getElementById('resultsSection'),
    newAnalysisBtn: document.getElementById('newAnalysisBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    processingStatus: document.getElementById('processingStatus')
  };
  
  if (elements.fileInput) {
    elements.fileInput.accept = CONFIG.SUPPORTED_FORMATS.join(',');
  }
  
  const criticalElements = [
    { name: 'dropzone', element: elements.dropzone },
    { name: 'chooseFileBtn', element: elements.chooseFileBtn },
    { name: 'fileInput', element: elements.fileInput }
  ];
  
  criticalElements.forEach(({ name, element }) => {
    if (!element) {
      console.error(`Critical element missing: ${name}`);
    }
  });
}

function setupEventListeners(): void {
  // Set up dropzone for drag and drop
  if (elements.dropzone) {
    elements.dropzone.addEventListener('dragover', handleDragOver);
    elements.dropzone.addEventListener('dragleave', handleDragLeave);
    elements.dropzone.addEventListener('drop', handleDrop);
    
    // Dropzone click - but not when clicking the button
    elements.dropzone.addEventListener('click', (event: Event): void => {
      const target = event.target as HTMLElement;
      
      if (elements.chooseFileBtn && (target === elements.chooseFileBtn || elements.chooseFileBtn.contains(target))) {
        return;
      }
      
      if (target === elements.fileInput) {
        return;
      }
      
      event.preventDefault();
      event.stopPropagation();
      
      if (elements.fileInput) {
        try {
          elements.fileInput.click();
        } catch (error) {
          console.error('Error triggering file input:', error);
          showError('Unable to open file picker. Please try again.');
        }
      } else {
        showError('Upload button not properly configured. Please refresh the page.');
      }
    });
  } else {
    console.error('Dropzone element not found! Make sure there is an element with id="dropzone"');
  }

  if (elements.fileInput) {
    elements.fileInput.addEventListener('change', (event: Event): void => {
      const target = event.target as HTMLInputElement;
      if (target.files && target.files[0]) {
        processFile(target.files[0]);
      }
    });
  }

  if (elements.chooseFileBtn) {
    elements.chooseFileBtn.addEventListener('click', (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
      
      if (elements.fileInput) {
        try {
          elements.fileInput.click();
        } catch (error) {
          console.error('Error triggering file input:', error);
          showError('Unable to open file picker. Please try refreshing the page.');
        }
      } else {
        showError('Upload button not properly configured. Please refresh the page.');
      }
    });
  }

  if (elements.analyzeFactCheckBtn) {
    elements.analyzeFactCheckBtn.addEventListener('click', () => handleAnalyzeClick('factcheck'));
  }

  if (elements.analyzeAIBtn) {
    elements.analyzeAIBtn.addEventListener('click', () => handleAnalyzeClick('ai'));
  }

  if (elements.captionInput) {
    elements.captionInput.addEventListener('input', updateCaptionCounter);
  }

  if (elements.newAnalysisBtn) {
    elements.newAnalysisBtn.addEventListener('click', resetApplication);
  }

  if (elements.downloadBtn) {
    elements.downloadBtn.addEventListener('click', downloadReport);
  }

  elements.navItems.forEach((item: Element): void => {
    item.addEventListener('click', (event: Event): void => {
      const target = event.currentTarget as HTMLElement;
      const page = target.dataset.page;
      
      elements.navItems.forEach((navItem: Element): void => {
        navItem.classList.remove('nav-item-active');
        navItem.classList.add('nav-item-inactive');
      });
      
      target.classList.remove('nav-item-inactive');
      target.classList.add('nav-item-active');
      
      if (page === 'results' && appState.analysisResults) {
        showResults();
      } else {
        hideResults();
      }
    });
  });
}

function processFile(file: File): void {
  if (!isValidFileType(file)) {
    showError(`Unsupported file type. Please select: ${CONFIG.SUPPORTED_FORMATS.join(', ')}`);
    return;
  }
  
  if (file.size > CONFIG.MAX_FILE_SIZE) {
    showError(`File too large. Maximum size: ${CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB`);
    return;
  }
  
  appState.selectedFile = file;
  displayFileInfo(file);
  setState('ready');
  hideError();
}

function isValidFileType(file: File): boolean {
  const fileNameParts = file.name.split('.');
  if (fileNameParts.length < 2) {
    return false;
  }
  
  const extension = '.' + fileNameParts.pop()?.toLowerCase();
  return CONFIG.SUPPORTED_FORMATS.includes(extension);
}

function displayFileInfo(file: File): void {
  if (elements.fileName && elements.fileMeta && elements.fileInfo) {
    elements.fileName.textContent = file.name;
    elements.fileMeta.textContent = `${formatFileSize(file.size)} • ${file.type}`;
    elements.fileInfo.classList.remove('hidden');
  }
  
  if (elements.analyzeButtonContainer) {
    elements.analyzeButtonContainer.classList.remove('hidden');
  }
  
  if (elements.videoPreview && file.type.startsWith('video/')) {
    const url = URL.createObjectURL(file);
    elements.videoPreview.src = url;
    elements.videoPreview.classList.remove('hidden');
    elements.videoPreview.load();
  }
}

function updateCaptionCounter(): void {
  if (elements.captionInput && elements.captionCounter) {
    const length = elements.captionInput.value.length;
    elements.captionCounter.textContent = `${length}/500`;
    
    if (length > 500) {
      elements.captionCounter.classList.add('text-red-500');
    } else {
      elements.captionCounter.classList.remove('text-red-500');
    }
  }
}

async function handleAnalyzeClick(analysisType: 'factcheck' | 'ai'): Promise<void> {
  if (!appState.selectedFile) {
    showError('Please select a video file first.');
    return;
  }
  
  const isFactCheck = analysisType === 'factcheck';
  const targetBtn = isFactCheck ? elements.analyzeFactCheckBtn : elements.analyzeAIBtn;
  const otherBtn = isFactCheck ? elements.analyzeAIBtn : elements.analyzeFactCheckBtn;
  
  if (targetBtn) {
    targetBtn.disabled = true;
    targetBtn.innerHTML = '<i class="fas fa-spinner animate-spin mr-2"></i>Analyzing...';
  }
  if (otherBtn) {
    otherBtn.disabled = true;
  }
  
  setState('analyzing');
  showProgressBar();
  startProgressSimulation();
  
  if (elements.processingStatus) {
    elements.processingStatus.textContent = 'Processing';
    elements.processingStatus.className = 'text-xs px-2 py-1 bg-orange-100 text-orange-800 rounded-full';
  }
  
  try {
    appState.analysisStartTime = Date.now();
    
    const results = await analyzeVideoWithBackend(appState.selectedFile, analysisType);
    appState.analysisResults = results;
    
    completeProgress();
    setState('done');
    showResults();
    
    if (elements.processingStatus) {
      elements.processingStatus.textContent = 'Complete';
      elements.processingStatus.className = 'text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full';
    }
    
  } catch (error) {
    console.error('Analysis failed:', error);
    showError(error instanceof Error ? error.message : 'Analysis failed. Please try again.');
    stopProgress();
    
    if (elements.processingStatus) {
      elements.processingStatus.textContent = 'Error';
      elements.processingStatus.className = 'text-xs px-2 py-1 bg-red-100 text-red-800 rounded-full';
    }
  } finally {
    if (elements.analyzeFactCheckBtn) {
      elements.analyzeFactCheckBtn.disabled = false;
      elements.analyzeFactCheckBtn.innerHTML = '<i class="fas fa-shield-check mr-2"></i>Fact-Check Analysis';
    }
    if (elements.analyzeAIBtn) {
      elements.analyzeAIBtn.disabled = false;
      elements.analyzeAIBtn.innerHTML = '<i class="fas fa-robot mr-2"></i>AI Detection';
    }
  }
}

let progressInterval: number | null = null;

function showProgressBar(): void {
  if (elements.uploadProgress) {
    elements.uploadProgress.classList.remove('hidden');
  }
}

function hideProgressBar(): void {
  if (elements.uploadProgress) {
    elements.uploadProgress.classList.add('hidden');
  }
}

function updateProgress(percent: number, status?: string): void {
  if (elements.uploadProgressFill) {
    elements.uploadProgressFill.style.width = `${percent}%`;
  }
  
  if (elements.uploadPercent) {
    elements.uploadPercent.textContent = `${Math.round(percent)}%`;
  }
  
  if (status && elements.progressStatus) {
    elements.progressStatus.textContent = status;
  }
  
  if (elements.progressLabel) {
    if (percent === 0) {
      elements.progressLabel.textContent = 'Initializing...';
    } else if (percent < 30) {
      elements.progressLabel.textContent = 'Uploading video...';
    } else if (percent < 60) {
      elements.progressLabel.textContent = 'Processing with AI...';
    } else if (percent < 90) {
      elements.progressLabel.textContent = 'Analyzing content...';
    } else if (percent < 100) {
      elements.progressLabel.textContent = 'Finalizing results...';
    } else {
      elements.progressLabel.textContent = 'Analysis complete!';
    }
  }
}

function startProgressSimulation(): void {
  let progress = 0;
  updateProgress(0, 'Starting video analysis...');
  
  progressInterval = window.setInterval(() => {
    progress += Math.random() * 12 + 3;
    if (progress >= 85) {
      progress = 85;
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }
      updateProgress(progress, 'Processing final results...');
    } else {
      updateProgress(progress);
    }
  }, 1200);
}

function completeProgress(): void {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  updateProgress(100, 'Analysis completed successfully!');
  
  setTimeout(() => {
    hideProgressBar();
  }, 2000);
}

function stopProgress(): void {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  updateProgress(0, 'Analysis stopped');
  hideProgressBar();
}

function resetApplication(): void {
  appState.currentState = 'idle';
  appState.selectedFile = null;
  appState.uploadProgress = 0;
  appState.analysisResults = null;
  
  stopProgress();
  hideResults();
  hideError();
  
  if (elements.fileInfo) elements.fileInfo.classList.add('hidden');
  if (elements.analyzeButtonContainer) elements.analyzeButtonContainer.classList.add('hidden');
  if (elements.videoPreview) elements.videoPreview.classList.add('hidden');
  if (elements.processingStatus) {
    elements.processingStatus.textContent = 'Standby';
    elements.processingStatus.className = 'text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full';
  }
  
  updateUI();
}

function addLoadingAnimations(): void {
  const style = document.createElement('style');
  style.textContent = `
    .loading-pulse {
      animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: .5; }
    }
    
    .loading-spinner {
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-5px); }
      75% { transform: translateX(5px); }
    }
    
    .dropzone-dragover {
      border-color: #3B82F6 !important;
      background-color: rgba(59, 130, 246, 0.05) !important;
    }
    
    .nav-item-active {
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(147, 51, 234, 0.1) 100%);
      border-left: 3px solid #3B82F6;
    }
    
    .nav-item-inactive {
      opacity: 0.7;
    }
    
    .status-badge {
      display: inline-flex;
      align-items: center;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.025em;
    }
    
    .status-idle { background: #F3F4F6; color: #6B7280; }
    .status-uploading { background: #DBEAFE; color: #2563EB; }
    .status-ready { background: #D1FAE5; color: #059669; }
    .status-analyzing { background: #FEF3C7; color: #D97706; }
    .status-done { background: #D1FAE5; color: #059669; }
    .status-error { background: #FEE2E2; color: #DC2626; }
  `;
  document.head.appendChild(style);
}

function handleDragOver(event: DragEvent): void {
  event.preventDefault();
  event.stopPropagation();
  elements.dropzone?.classList.add('dropzone-dragover');
}

function handleDragLeave(event: DragEvent): void {
  event.preventDefault();
  event.stopPropagation();
  elements.dropzone?.classList.remove('dropzone-dragover');
}

function handleDrop(event: DragEvent): void {
  event.preventDefault();
  event.stopPropagation();
  elements.dropzone?.classList.remove('dropzone-dragover');
  
  const files = event.dataTransfer?.files;
  if (files && files.length > 0) {
    processFile(files[0]);
  }
}

async function analyzeVideoWithBackend(videoFile: File, analysisType: 'factcheck' | 'ai'): Promise<AnalysisResults> {
  if (!videoFile) {
    throw new Error('No video file provided');
  }

  const endpoint = analysisType === 'factcheck' ? '/api/analyze-factcheck' : '/api/analyze-ai';

  const formData = new FormData();
  formData.append('video', videoFile);
  
  if (analysisType === 'factcheck') {
    const today = new Date().toISOString().split('T')[0];
    formData.append('posted_date', today);
    
    const captionText = elements.captionInput?.value.trim() || '';
    formData.append('caption_text', captionText);
  }

  try {
    const response = await fetch(CONFIG.BACKEND_URL + endpoint, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(CONFIG.REQUEST_TIMEOUT)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend analysis failed (${response.status}): ${errorText}`);
    }

    return await response.json() as AnalysisResults;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('Analysis timed out. Please try with a shorter video.');
      }
      
      if (error.message.includes('NetworkError') || error.message.includes('fetch')) {
        throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:5000');
      }
    }
    
    throw error;
  }
}

function showResults(): void {
  elements.navItems.forEach((item: Element): void => {
    item.classList.remove('nav-item-active');
    item.classList.add('nav-item-inactive');
  });
  const resultsTab = document.querySelector('[data-page="results"]');
  if (resultsTab) {
    resultsTab.classList.remove('nav-item-inactive');
    resultsTab.classList.add('nav-item-active');
  }
  
  // Hide upload content
  const contentContainer = document.getElementById('contentContainer');
  if (contentContainer) {
    contentContainer.classList.add('hidden');
  }
  
  if (elements.resultsSection) {
    elements.resultsSection.classList.remove('hidden');
    elements.resultsSection.style.display = 'block';
  }
  
  populateResults();
}

function hideResults(): void {
  if (elements.resultsSection) {
    elements.resultsSection.classList.add('hidden');
    elements.resultsSection.style.display = 'none';
  }
  
  // Show upload content
  const contentContainer = document.getElementById('contentContainer');
  if (contentContainer) {
    contentContainer.classList.remove('hidden');
  }
  
  elements.navItems.forEach((item: Element): void => {
    item.classList.remove('nav-item-active');
    item.classList.add('nav-item-inactive');
  });
  const uploadTab = document.querySelector('[data-page="upload"]');
  if (uploadTab) {
    uploadTab.classList.remove('nav-item-inactive');
    uploadTab.classList.add('nav-item-active');
  }
}

function populateResults(): void {
  const results = appState.analysisResults;
  if (!results) {
    return;
  }
  
  if (elements.resultsSection) {
    elements.resultsSection.innerHTML = createModernResultsHTML(results);
    
    // Attach event listeners to buttons
    const backBtn = document.getElementById('backToUploadBtn');
    if (backBtn) {
      backBtn.addEventListener('click', hideResults);
    }
    
    const downloadBtn = document.getElementById('downloadReportBtn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', downloadReport);
    }
    
    const shareBtn = document.getElementById('shareResultsBtn');
    if (shareBtn) {
      shareBtn.addEventListener('click', shareResults);
    }
    
    const reportBtn = document.getElementById('reportIssueBtn');
    if (reportBtn) {
      reportBtn.addEventListener('click', reportIssue);
    }
    
    const newAnalysisBtn2 = document.getElementById('newAnalysisBtn2');
    if (newAnalysisBtn2) {
      newAnalysisBtn2.addEventListener('click', resetApplication);
    }
  }
}

function createModernResultsHTML(results: AnalysisResults): string {
  // Detect which type of analysis was performed
  const isAIDetection = results.is_ai_generated !== undefined;
  const isFactCheck = results.final !== undefined;
  
  if (isAIDetection) {
    return createAIDetectionResultsHTML(results);
  } else if (isFactCheck) {
    return createFactCheckResultsHTML(results);
  } else {
    return '<div class="p-6 text-center text-gray-500">Unknown analysis type</div>';
  }
}

function createAIDetectionResultsHTML(results: AnalysisResults): string {
  const metadata = results.metadata;
  const detection = results.detection_methods;
  const c2pa = detection?.c2pa_metadata;
  const synthid = detection?.synthid_analysis;
  
  return `
    <div class="max-w-7xl mx-auto">
      <div class="mb-6">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-4xl font-bold text-gray-900 mb-2">AI Detection Results</h1>
            <p class="text-gray-600">Analysis of AI generation markers and authenticity</p>
          </div>
          <div class="flex gap-4">
            <button class="btn-secondary" id="backToUploadBtn">
              <i class="fas fa-arrow-left mr-2"></i>
              Back to Upload
            </button>
            <button class="btn-primary" id="downloadReportBtn">
              <i class="fas fa-download mr-2"></i>
              Download Report
            </button>
          </div>
        </div>
      </div>

      <div class="grid lg:grid-cols-3 gap-8">
        <div class="lg:col-span-2 space-y-6">
          <div class="card p-8">
            <div class="text-center">
              <div class="w-24 h-24 mx-auto mb-6 rounded-full ${results.is_ai_generated ? 'bg-yellow-500' : 'bg-green-500'} flex items-center justify-center">
                <i class="fas ${results.is_ai_generated ? 'fa-robot' : 'fa-user'} text-3xl text-white"></i>
              </div>
              <h2 class="text-3xl font-bold text-gray-900 mb-2">${results.is_ai_generated ? 'AI-Generated Content Detected' : 'Likely Human-Created Content'}</h2>
              <p class="text-gray-600 mb-6">Confidence: ${results.confidence || 0}%</p>
              
              <div class="grid grid-cols-2 gap-6 text-center">
                <div class="p-4 bg-blue-50 rounded-xl">
                  <div class="text-2xl font-bold text-blue-600">${results.trust_score || 0}</div>
                  <div class="text-sm text-gray-600">Trust Score</div>
                </div>
                <div class="p-4 bg-purple-50 rounded-xl">
                  <div class="text-2xl font-bold text-purple-600">${results.confidence || 0}%</div>
                  <div class="text-sm text-gray-600">Confidence</div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="card p-6">
            <h3 class="text-xl font-bold text-gray-900 mb-4">Detection Methods</h3>
            
            ${c2pa ? `
              <div class="mb-6">
                <h4 class="font-semibold text-gray-900 mb-3 flex items-center">
                  <i class="fas fa-certificate text-blue-600 mr-2"></i>
                  C2PA Metadata Analysis
                </h4>
                <div class="p-4 rounded-lg ${c2pa.detected ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}">
                  <div class="flex items-center justify-between mb-2">
                    <span class="font-medium text-gray-900">${c2pa.detected ? 'AI Markers Found' : 'No AI Markers Found'}</span>
                    <span class="text-xs px-3 py-1 rounded-full ${c2pa.detected ? 'bg-yellow-200 text-yellow-800' : 'bg-green-200 text-green-800'}">
                      ${c2pa.detected ? 'Detected' : 'Not Detected'}
                    </span>
                  </div>
                  ${c2pa.data && Object.keys(c2pa.data).length > 0 && c2pa.data.status !== 'No C2PA Manifest Found' ? `
                    <div class="mt-3 p-3 bg-white rounded border border-gray-200">
                      <div class="text-sm text-gray-700 font-medium mb-2">Detected Metadata:</div>
                      <pre class="text-xs text-gray-700 whitespace-pre-wrap">${JSON.stringify(c2pa.data, null, 2)}</pre>
                    </div>
                  ` : '<p class="text-sm text-gray-600">This video does not contain C2PA provenance information. C2PA is a digital signature system that tracks content authenticity and origin.</p>'}
                </div>
              </div>
            ` : ''}
            
            ${synthid ? `
              <div class="mb-6">
                <h4 class="font-semibold text-gray-900 mb-3 flex items-center">
                  <i class="fas fa-fingerprint text-purple-600 mr-2"></i>
                  SynthID Visual Analysis
                </h4>
                <div class="p-4 rounded-lg ${synthid.is_ai ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}">
                  <div class="flex items-center justify-between mb-3">
                    <span class="font-medium text-gray-900">${synthid.is_ai ? 'AI Patterns Detected' : 'No AI Patterns Detected'}</span>
                    <span class="text-xs px-3 py-1 rounded-full ${synthid.is_ai ? 'bg-yellow-200 text-yellow-800' : 'bg-green-200 text-green-800'}">
                      ${synthid.confidence}% confidence
                    </span>
                  </div>
                  <div class="grid grid-cols-2 gap-4 mb-3">
                    <div class="text-center p-3 bg-white rounded border border-gray-200">
                      <div class="text-lg font-bold text-gray-900">${synthid.trust_score}</div>
                      <div class="text-xs text-gray-600">Trust Score</div>
                    </div>
                    <div class="text-center p-3 bg-white rounded border border-gray-200">
                      <div class="text-lg font-bold text-gray-900">${synthid.confidence}%</div>
                      <div class="text-xs text-gray-600">Confidence</div>
                    </div>
                  </div>
                  <p class="text-sm text-gray-700 leading-relaxed">${synthid.note}</p>
                </div>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="space-y-6">
          <div class="card p-6">
            <h3 class="font-bold text-gray-900 mb-4">Video Metadata</h3>
            <div class="space-y-3 text-sm">
              ${metadata?.format ? `
                <div class="flex justify-between">
                  <span class="text-gray-600">Format:</span>
                  <span class="font-medium text-gray-900">${metadata.format}</span>
                </div>
              ` : ''}
              ${metadata?.duration ? (() => {
                const duration = parseFloat(metadata.duration);
                return !isNaN(duration) ? `
                  <div class="flex justify-between">
                    <span class="text-gray-600">Duration:</span>
                    <span class="font-medium text-gray-900">${Math.round(duration)}s</span>
                  </div>
                ` : '';
              })() : ''}
              ${metadata?.encoder && metadata.encoder !== 'unknown' && metadata.encoder !== 'Unknown' ? `
                <div class="flex justify-between">
                  <span class="text-gray-600">Encoder:</span>
                  <span class="font-medium text-gray-900">${metadata.encoder}</span>
                </div>
              ` : ''}
            </div>
          </div>
          
          <div class="card p-6">
            <h3 class="font-bold text-gray-900 mb-4">Quick Actions</h3>
            <div class="space-y-3">
              <button class="w-full btn-secondary text-left" id="shareResultsBtn">
                <i class="fas fa-share mr-3"></i>
                Share Results
              </button>
              <button class="w-full btn-secondary text-left" id="reportIssueBtn">
                <i class="fas fa-flag mr-3"></i>
                Report Issue
              </button>
              <button class="w-full btn-secondary text-left" id="newAnalysisBtn2">
                <i class="fas fa-redo mr-3"></i>
                New Analysis
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function createFactCheckResultsHTML(results: AnalysisResults): string {
  const final = results.final;
  const structured = results.structured;
  const claims = results.claims?.claims || [];
  const factcheck = results.factcheck?.results || [];
  const metadata = results.metadata;
  const synthid = results.synthid;
  const signals = results.signals;
  const timing = results.timing || {};
  const splice = results.splice || {};
  
  return `
    <div class="max-w-7xl mx-auto">
      <div class="mb-6">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-4xl font-bold text-gray-900 mb-2">Analysis Results</h1>
            <p class="text-gray-600">Comprehensive AI-powered video forensics analysis</p>
          </div>
          <div class="flex gap-4">
            <button class="btn-secondary" id="backToUploadBtn">
              <i class="fas fa-arrow-left mr-2"></i>
              Back to Upload
            </button>
            <button class="btn-primary" id="downloadReportBtn">
              <i class="fas fa-download mr-2"></i>
              Download Report
            </button>
          </div>
        </div>
      </div>

        <div class="grid lg:grid-cols-3 gap-8">
          <div class="lg:col-span-2 space-y-6">
            <div class="card p-8">
              <div class="text-center">
                <div class="w-24 h-24 mx-auto mb-6 rounded-full ${getVerdictColorClass(final?.verdict || '')} flex items-center justify-center">
                  <i class="fas ${getVerdictIcon(final?.verdict || '')} text-3xl text-white"></i>
                </div>
                <h2 class="text-3xl font-bold text-gray-900 mb-2">${final?.one_line_label || 'Analysis Complete'}</h2>
                ${final?.confidence_percent !== undefined && final?.confidence_percent !== null ? `
                  <p class="text-gray-600 mb-6">Confidence: ${Math.round(final.confidence_percent)}%</p>
                ` : ''}
                ${signals?.c2pa_ai_detected || signals?.synthid_ai_detected ? `
                  <div class="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div class="flex items-center justify-center gap-2 text-yellow-800">
                      <i class="fas fa-robot"></i>
                      <span class="font-semibold">AI Generation Detected</span>
                    </div>
                    <p class="text-sm text-yellow-700 mt-1">
                      ${signals?.c2pa_ai_detected ? 'C2PA metadata indicates AI content. ' : ''}
                      ${signals?.synthid_ai_detected ? 'SynthID analysis detected AI patterns. ' : ''}
                    </p>
                  </div>
                ` : ''}
                <div class="grid grid-cols-3 gap-6 text-center">
                  <div class="p-4 bg-red-50 rounded-xl">
                    <div class="text-2xl font-bold text-red-600">${Math.abs(final?.splice_risk_score || 0)}</div>
                    <div class="text-sm text-gray-600">Splice Risk</div>
                  </div>
                  <div class="p-4 bg-blue-50 rounded-xl">
                    <div class="text-2xl font-bold text-blue-600">${final?.misinformation_risk_score || 0}</div>
                    <div class="text-sm text-gray-600">Misinfo Risk</div>
                  </div>
                  <div class="p-4 bg-green-50 rounded-xl">
                    <div class="text-2xl font-bold text-green-600">${Math.round(final?.avg_factcheck_confidence || 0)}%</div>
                    <div class="text-sm text-gray-600">Fact Check</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="card p-6">
              <h3 class="text-xl font-bold text-gray-900 mb-4">Executive Summary</h3>
              <p class="text-gray-700 leading-relaxed">${structured?.combined_summary || 'No summary available'}</p>
            </div>
            
            <div class="card p-6">
              <h3 class="text-xl font-bold text-gray-900 mb-4">Detailed Analysis</h3>
              
              ${claims.length > 0 ? `
                <div class="mb-6">
                  <h4 class="font-semibold text-gray-900 mb-3 flex items-center">
                    <i class="fas fa-search text-blue-600 mr-2"></i>
                    Identified Claims (${claims.length})
                  </h4>
                  <div class="space-y-3">
                    ${claims.map((claim, idx) => `
                      <div class="p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div class="flex items-start justify-between mb-2">
                          <span class="text-xs font-semibold text-blue-600 bg-blue-100 px-2 py-1 rounded">Claim ${idx + 1}</span>
                        </div>
                        <p class="text-gray-800 mb-3 font-medium">${claim.claim}</p>
                        ${claim.evidence && claim.evidence.length > 0 ? `
                          <div class="mt-3 pt-3 border-t border-gray-300">
                            <h5 class="text-xs font-semibold text-gray-600 mb-2">Evidence:</h5>
                            <div class="space-y-2">
                              ${claim.evidence.map(ev => `
                                <div class="text-xs bg-white p-2 rounded border border-gray-200">
                                  <div class="font-medium text-gray-700 mb-1">${ev.source}</div>
                                  <div class="text-gray-600">${ev.text}</div>
                                  ${ev.timestamp ? `<div class="text-gray-400 mt-1">${ev.timestamp}</div>` : ''}
                                </div>
                              `).join('')}
                            </div>
                          </div>
                        ` : ''}
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : '<p class="text-gray-500 mb-6">No claims were identified in this video.</p>'}
              
              ${factcheck.length > 0 ? `
                <div class="mb-6">
                  <h4 class="font-semibold text-gray-900 mb-3 flex items-center">
                    <i class="fas fa-check-circle text-green-600 mr-2"></i>
                    Fact Check Results (${factcheck.length})
                  </h4>
                  <div class="space-y-3">
                    ${factcheck.map((fact, idx) => `
                      <div class="p-4 bg-white border-2 rounded-lg ${fact.verdict.toLowerCase().includes('false') ? 'border-red-300' : fact.verdict.toLowerCase().includes('true') ? 'border-green-300' : 'border-yellow-300'}">
                        <div class="flex items-center justify-between mb-2">
                          <span class="font-bold text-gray-900 text-lg">Check ${idx + 1}: ${fact.verdict}</span>
                          ${fact.confidence && fact.confidence > 0 ? `
                            <span class="text-sm px-3 py-1 rounded-full ${fact.confidence >= 80 ? 'bg-green-100 text-green-700' : fact.confidence >= 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}">${fact.confidence}% confidence</span>
                          ` : `
                            <span class="text-sm px-3 py-1 rounded-full ${fact.verdict.toLowerCase().includes('false') ? 'bg-red-100 text-red-700' : fact.verdict.toLowerCase().includes('true') ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}">${fact.verdict.toUpperCase()}</span>
                          `}
                        </div>
                        <p class="text-gray-700 mb-3 leading-relaxed">${fact.explanation}</p>
                        ${fact.correct_information ? `
                          <div class="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
                            <div class="font-semibold text-blue-900 text-sm mb-1">Correct Information:</div>
                            <p class="text-blue-800 text-sm">${fact.correct_information}</p>
                          </div>
                        ` : ''}
                        ${fact.what_to_verify_manually ? `
                          <div class="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                            <div class="font-semibold text-yellow-900 text-sm mb-1">Manual Verification Needed:</div>
                            <p class="text-yellow-800 text-sm">${fact.what_to_verify_manually}</p>
                          </div>
                        ` : ''}
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : '<p class="text-gray-500 mb-6">No fact-check results available.</p>'}
              
              ${timing && Object.keys(timing).length > 0 ? `
                <div class="mb-6">
                  <h4 class="font-semibold text-gray-900 mb-3 flex items-center">
                    <i class="fas fa-clock text-orange-600 mr-2"></i>
                    Timeline Analysis
                  </h4>
                  <div class="p-4 bg-orange-50 rounded-lg border border-orange-200">
                    <pre class="text-sm text-gray-800 whitespace-pre-wrap">${JSON.stringify(timing, null, 2)}</pre>
                  </div>
                </div>
              ` : ''}
              
              ${splice && Object.keys(splice).length > 0 ? `
                <div class="mb-6">
                  <h4 class="font-semibold text-gray-900 mb-3 flex items-center">
                    <i class="fas fa-cut text-purple-600 mr-2"></i>
                    Splice Detection
                  </h4>
                  <div class="p-4 bg-purple-50 rounded-lg border border-purple-200">
                    <pre class="text-sm text-gray-800 whitespace-pre-wrap">${JSON.stringify(splice, null, 2)}</pre>
                  </div>
                </div>
              ` : ''}
              
              ${results.raw_analysis ? `
                <div class="mb-6">
                  <h4 class="font-semibold text-gray-900 mb-3 flex items-center">
                    <i class="fas fa-file-alt text-gray-600 mr-2"></i>
                    Raw Analysis Data
                  </h4>
                  <div class="p-4 bg-gray-50 rounded-lg border border-gray-200 max-h-96 overflow-y-auto">
                    <pre class="text-xs text-gray-700 whitespace-pre-wrap font-mono">${results.raw_analysis}</pre>
                  </div>
                </div>
              ` : ''}
            </div>
          </div>

          <div class="space-y-6">
            <div class="card p-6">
              <h3 class="font-bold text-gray-900 mb-4">Video Metadata</h3>
              <div class="space-y-3 text-sm">
                ${metadata?.format ? `
                  <div class="flex justify-between">
                    <span class="text-gray-600">Format:</span>
                    <span class="font-medium text-gray-900">${metadata.format}</span>
                  </div>
                ` : ''}
                ${metadata?.duration ? (() => {
                  const duration = parseFloat(metadata.duration);
                  return !isNaN(duration) ? `
                    <div class="flex justify-between">
                      <span class="text-gray-600">Duration:</span>
                      <span class="font-medium text-gray-900">${Math.round(duration)}s</span>
                    </div>
                  ` : '';
                })() : ''}
                ${metadata?.encoder && metadata.encoder !== 'unknown' && metadata.encoder !== 'Unknown' ? `
                  <div class="flex justify-between">
                    <span class="text-gray-600">Encoder:</span>
                    <span class="font-medium text-gray-900">${metadata.encoder}</span>
                  </div>
                ` : ''}
                ${synthid?.is_ai !== undefined ? `
                  <div class="flex justify-between">
                    <span class="text-gray-600">AI Detection:</span>
                    <span class="font-medium ${synthid.is_ai ? 'text-yellow-600' : 'text-green-600'}">
                      ${synthid.is_ai ? 'AI Generated' : 'Human Created'}
                    </span>
                  </div>
                ` : ''}
                ${synthid?.trust_score !== undefined ? `
                  <div class="flex justify-between">
                    <span class="text-gray-600">Trust Score:</span>
                    <span class="font-medium text-gray-900">${synthid.trust_score}/100</span>
                  </div>
                ` : ''}
              </div>
            </div>
            
            <div class="card p-6">
              <h3 class="font-bold text-gray-900 mb-4">Quick Actions</h3>
              <div class="space-y-3">
                <button class="w-full btn-secondary text-left" id="shareResultsBtn">
                  <i class="fas fa-share mr-3"></i>
                  Share Results
                </button>
                <button class="w-full btn-secondary text-left" id="reportIssueBtn">
                  <i class="fas fa-flag mr-3"></i>
                  Report Issue
                </button>
                <button class="w-full btn-secondary text-left" id="newAnalysisBtn2">
                  <i class="fas fa-redo mr-3"></i>
                  New Analysis
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function getVerdictColorClass(verdict: string): string {
  switch (verdict?.toLowerCase()) {
    case 'real': return 'bg-green-500';
    case 'fake': return 'bg-red-500';
    case 'misleading': return 'bg-orange-500';
    default: return 'bg-gray-500';
  }
}

function getVerdictIcon(verdict: string): string {
  switch (verdict?.toLowerCase()) {
    case 'real': return 'fa-shield-check';
    case 'fake': return 'fa-exclamation-triangle';
    case 'misleading': return 'fa-question-circle';
    default: return 'fa-info-circle';
  }
}

function updateUI(): void {
  if (elements.statusPill && elements.statusText) {
    elements.statusPill.className = `status-badge status-${appState.currentState}`;
    
    const statusTexts: Record<string, string> = {
      idle: 'Ready',
      uploading: 'Preparing',
      ready: 'Ready',
      analyzing: 'Analyzing',
      done: 'Complete',
      error: 'Error'
    };
    
    elements.statusText.textContent = statusTexts[appState.currentState] || 'Unknown';
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function setState(newState: AppState['currentState']): void {
  appState.currentState = newState;
  updateUI();
}

function showError(message: string): void {
  if (elements.errorMessage) {
    elements.errorMessage.classList.remove('hidden');
    const errorText = elements.errorMessage.querySelector('#errorText') || elements.errorMessage;
    errorText.textContent = message;
    
    elements.errorMessage.style.animation = 'shake 0.5s ease-in-out';
  }
  setState('error');
}

function hideError(): void {
  elements.errorMessage?.classList.add('hidden');
}

function downloadReport(): void {
  if (!appState.analysisResults) {
    showError('No analysis results to download');
    return;
  }
  
  const data = JSON.stringify(appState.analysisResults, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `video-analysis-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function shareResults(): void {
  if (!appState.analysisResults) {
    showError('No analysis results to share');
    return;
  }
  
  const shareData = {
    title: 'Video Analysis Results',
    text: `Analysis Result: ${appState.analysisResults.final?.verdict || 'Unknown'} (${appState.analysisResults.final?.confidence_percent || 0}% confidence)`,
    url: window.location.href
  };
  
  if (navigator.share) {
    navigator.share(shareData);
  } else {
    navigator.clipboard.writeText(shareData.text + ' ' + shareData.url);
    showError('Results copied to clipboard');
  }
}

function reportIssue(): void {
  const issueText = encodeURIComponent('Issue with video analysis results');
  const mailtoUrl = `mailto:support@example.com?subject=Video%20Analysis%20Issue&body=${issueText}`;
  window.open(mailtoUrl, '_blank');
}