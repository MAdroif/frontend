// ==================== CONSTANTS ====================
// Ide to Carousel Webhooks
const IDE_SUBMIT_WEBHOOK = 'https://n8n-vogmx0uye8x5.arman.sumopod.my.id/webhook/v6';
const IDE_STATUS_WEBHOOK = 'https://n8n-vogmx0uye8x5.arman.sumopod.my.id/webhook/polling-v6';

// Skrip to Carousel Webhooks  
const SKRIP_SUBMIT_WEBHOOK = 'https://n8n-vogmx0uye8x5.arman.sumopod.my.id/webhook/skrip-submit';
const SKRIP_STATUS_WEBHOOK = 'https://n8n-vogmx0uye8x5.arman.sumopod.my.id/webhook/skrip-status';

const MAX_RETRIES = 3;
const INITIAL_POLL_INTERVAL = 5000;
const MAX_POLL_ATTEMPTS = 60;
const MAX_CONSECUTIVE_ERRORS = 3;
const MAX_HISTORY_ITEMS = 50;

// ==================== APP STATE ====================
class AppState {
  constructor() {
    this.isGenerating = false;
    this.currentJobId = null;
    this.pollingInterval = null;
    this.pollAttempts = 0;
    this.consecutiveErrors = 0;
    this.pollingStartTime = null;
    this.sidebarOpen = false;
    this.darkMode = this.loadDarkMode();
    this.history = this.loadHistory();
    this.currentView = 'home';
    this.currentSlides = [];
    this.previousView = 'home';
    this.currentMode = 'ide'; // 'ide' or 'skrip'
    
    window.addEventListener('beforeunload', () => this.cleanup());
  }
  
  loadDarkMode() {
    const stored = localStorage.getItem('darkMode');
    if (stored !== null) {
      return stored === 'true';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  loadHistory() {
    try {
      const stored = localStorage.getItem('slideHistory');
      const parsed = JSON.parse(stored || '[]');
      
      if (!Array.isArray(parsed)) {
        console.warn('Invalid history format, resetting');
        return [];
      }
      
      return parsed.slice(0, MAX_HISTORY_ITEMS);
    } catch (e) {
      console.error('Failed to load history:', e);
      return [];
    }
  }
  
  saveHistory() {
    try {
      localStorage.setItem('slideHistory', JSON.stringify(this.history));
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        console.warn('LocalStorage quota exceeded, trimming history');
        this.history = this.history.slice(0, 20);
        try {
          localStorage.setItem('slideHistory', JSON.stringify(this.history));
        } catch (retryError) {
          console.error('Failed to save even after trimming:', retryError);
        }
      } else {
        console.error('Failed to save history:', e);
      }
    }
  }
  
  startGeneration(jobId) {
    if (this.isGenerating) {
      throw new Error('Generation already in progress');
    }
    this.isGenerating = true;
    this.currentJobId = jobId;
    this.pollAttempts = 0;
    this.consecutiveErrors = 0;
    this.pollingStartTime = Date.now();
  }
  
  stopGeneration() {
    this.isGenerating = false;
    this.currentJobId = null;
    this.pollAttempts = 0;
    this.consecutiveErrors = 0;
    this.pollingStartTime = null;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
  
  addToHistory(newItem) {
    const existingIndex = this.history.findIndex(
      item => item.jobId === newItem.jobId
    );
    
    if (existingIndex !== -1) {
      this.history[existingIndex] = newItem;
    } else {
      this.history.unshift(newItem);
    }
    
    if (this.history.length > MAX_HISTORY_ITEMS) {
      this.history = this.history.slice(0, MAX_HISTORY_ITEMS);
    }
    
    this.saveHistory();
  }
  
  cleanup() {
    this.stopGeneration();
  }

  setMode(mode) {
    this.currentMode = mode;
  }
}

const appState = new AppState();

// ==================== PREVIEW FUNCTIONS ====================
let currentPreviewSlides = [];
let currentPreviewIndex = 0;

function openPreview(slides, index) {
  currentPreviewSlides = slides;
  currentPreviewIndex = index;
  
  const modal = document.getElementById('preview-modal');
  const image = document.getElementById('preview-image');
  const counter = document.getElementById('slide-counter');
  
  if (slides && slides[index]) {
    image.src = slides[index].download_url || slides[index].url;
    counter.textContent = `${index + 1} / ${slides.length}`;
    modal.classList.remove('hidden');
    
    // Add keyboard event listeners
    document.addEventListener('keydown', handlePreviewKeyboard);
  }
}

function closePreview() {
  const modal = document.getElementById('preview-modal');
  modal.classList.add('hidden');
  
  // Remove event listeners
  document.removeEventListener('keydown', handlePreviewKeyboard);
  
  currentPreviewSlides = [];
  currentPreviewIndex = 0;
}

function navigateSlide(direction) {
  if (currentPreviewSlides.length === 0) return;
  
  currentPreviewIndex += direction;
  
  // Loop around if at ends
  if (currentPreviewIndex < 0) {
    currentPreviewIndex = currentPreviewSlides.length - 1;
  } else if (currentPreviewIndex >= currentPreviewSlides.length) {
    currentPreviewIndex = 0;
  }
  
  const image = document.getElementById('preview-image');
  const counter = document.getElementById('slide-counter');
  
  image.src = currentPreviewSlides[currentPreviewIndex].download_url || currentPreviewSlides[currentPreviewIndex].url;
  counter.textContent = `${currentPreviewIndex + 1} / ${currentPreviewSlides.length}`;
}

function handlePreviewKeyboard(event) {
  switch(event.key) {
    case 'Escape':
      closePreview();
      break;
    case 'ArrowLeft':
      navigateSlide(-1);
      break;
    case 'ArrowRight':
      navigateSlide(1);
      break;
  }
}

function downloadCurrentSlide() {
  if (currentPreviewSlides.length === 0 || !currentPreviewSlides[currentPreviewIndex]) return;
  
  const slide = currentPreviewSlides[currentPreviewIndex];
  const filename = `slide-${currentPreviewIndex + 1}.jpg`;
  
  downloadSlide(slide.download_url || slide.url, filename);
}

// ==================== INITIALIZE ====================
function initialize() {
  // Initialize dark mode
  applyDarkMode();
  
  // Initialize sidebar
  updateSidebarState();

  document.getElementById('ide-to-carousel-view').classList.add('hidden');
  document.getElementById('skrip-to-carousel-view').classList.add('hidden');
  document.getElementById('history-view').classList.add('hidden');
  document.getElementById('results-view').classList.add('hidden');
  // Show home view
  showHome();
  
  initializeEditFeatures();
}

function applyDarkMode() {
  if (appState.darkMode) {
    document.documentElement.classList.add('dark');
    document.getElementById('sun-icon').classList.remove('hidden');
    document.getElementById('moon-icon').classList.add('hidden');
  } else {
    document.documentElement.classList.remove('dark');
    document.getElementById('sun-icon').classList.add('hidden');
    document.getElementById('moon-icon').classList.remove('hidden');
  }
}

function updateSidebarState() {
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.getElementById('main-content');
  const sidebarTexts = document.querySelectorAll('.sidebar-text');
  
  if (appState.sidebarOpen) {
    sidebar.classList.remove('sidebar-collapsed');
    sidebar.classList.add('sidebar-expanded');
    mainContent.style.marginLeft = '240px';
    sidebarTexts.forEach(text => text.style.display = 'block');
  } else {
    sidebar.classList.remove('sidebar-expanded');
    sidebar.classList.add('sidebar-collapsed');
    mainContent.style.marginLeft = '70px';
    sidebarTexts.forEach(text => text.style.display = 'none');
  }
}

// ==================== UI FUNCTIONS ====================
function toggleSidebar() {
  appState.sidebarOpen = !appState.sidebarOpen;
  updateSidebarState();
}

function toggleDarkMode() {
  appState.darkMode = !appState.darkMode;
  localStorage.setItem('darkMode', appState.darkMode);
  applyDarkMode();

  const toggleBtn = document.querySelector('.dark-mode-toggle');
  toggleBtn.style.transform = 'rotate(180deg)';
  
  setTimeout(() => {
      toggleBtn.style.transform = 'rotate(0deg';
  }, 300);
}

function toggleSettings() {
  const dropdown = document.getElementById('settings-dropdown');
  dropdown.classList.toggle('show');
}

// ==================== VIEW FUNCTIONS ====================
function showIdeToCarousel() {
  appState.previousView = appState.currentView;
  appState.currentView = 'ide-to-carousel';
  appState.setMode('ide');
  
  document.getElementById('home-view').classList.add('hidden');
  document.getElementById('ide-to-carousel-view').classList.remove('hidden');
  document.getElementById('skrip-to-carousel-view').classList.add('hidden');
  document.getElementById('history-view').classList.add('hidden');
  document.getElementById('results-view').classList.add('hidden');

  clearIdeResults();

  // Update sidebar active state
  document.querySelectorAll('.sidebar-item').forEach((item, index) => {
    if (index === 1) item.classList.add('active');
    else item.classList.remove('active');
  });
}

function showSkripToCarousel() {
  appState.previousView = appState.currentView;
  appState.currentView = 'skrip-to-carousel';
  appState.setMode('skrip');
  
  document.getElementById('home-view').classList.add('hidden');
  document.getElementById('ide-to-carousel-view').classList.add('hidden');
  document.getElementById('skrip-to-carousel-view').classList.remove('hidden');
  document.getElementById('history-view').classList.add('hidden');
  document.getElementById('results-view').classList.add('hidden');
  
  clearSkripResults();

  // Update sidebar active state
  document.querySelectorAll('.sidebar-item').forEach((item, index) => {
    if (index === 2) item.classList.add('active');
    else item.classList.remove('active');
  });
}

function showHome() {
  appState.previousView = appState.currentView;
  appState.currentView = 'home';
  document.getElementById('home-view').classList.remove('hidden');
  document.getElementById('ide-to-carousel-view').classList.add('hidden');
  document.getElementById('skrip-to-carousel-view').classList.add('hidden');
  document.getElementById('history-view').classList.add('hidden');
  document.getElementById('results-view').classList.add('hidden');
  
  clearIdeResults();
  clearSkripResults();

  // Update sidebar active state
  document.querySelectorAll('.sidebar-item').forEach((item, index) => {
    if (index === 0) item.classList.add('active');
    else item.classList.remove('active');
  });
}

function showHistory() {
  appState.previousView = appState.currentView;
  appState.currentView = 'history';
  document.getElementById('home-view').classList.add('hidden');
  document.getElementById('ide-to-carousel-view').classList.add('hidden');
  document.getElementById('skrip-to-carousel-view').classList.add('hidden');
  document.getElementById('history-view').classList.remove('hidden');
  document.getElementById('results-view').classList.add('hidden');
  
  renderHistory();
  
  // Update sidebar active state
  document.querySelectorAll('.sidebar-item').forEach((item, index) => {
    if (index === 3) item.classList.add('active');
    else item.classList.remove('active');
  });
}

function showResults() {
  appState.previousView = appState.currentView;
  appState.currentView = 'results';
  document.getElementById('home-view').classList.add('hidden');
  document.getElementById('ide-to-carousel-view').classList.add('hidden');
  document.getElementById('skrip-to-carousel-view').classList.add('hidden');
  document.getElementById('history-view').classList.add('hidden');
  document.getElementById('results-view').classList.remove('hidden');
  
  // Remove active state from sidebar
  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.classList.remove('active');
  });
}

// ==================== FIXED: goBack function ====================
function goBack() {
  switch(appState.previousView) {
    case 'home':
      showHome();
      break;
    case 'ide-to-carousel':
      showIdeToCarousel();
      break;
    case 'skrip-to-carousel':
      showSkripToCarousel();
      break;
    case 'history':
      showHistory();
      break;
    case 'results':
      showResults();
      break;
    default:
      showHome();
  }
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  
  // Hapus semua timeout yang ada
  if (window.toastTimeout) {
    clearTimeout(window.toastTimeout);
    window.toastTimeout = null;
  }
  
  // Reset toast state
  toast.className = 'toast hidden';
  
  const icons = {
    success: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>',
    error: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>',
    warning: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>',
    info: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
  };
  
  // Buat HTML toast baru
  toast.innerHTML = `
    <div class="flex items-center gap-3">
      ${icons[type]}
      <span class="flex-1">${message}</span>
      <button id="toast-close-btn" class="toast-close-btn flex-shrink-0 ml-2 p-1 rounded-full hover:bg-white hover:bg-opacity-20 transition-colors duration-200">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    </div>
  `;
  
  // Tambahkan class type dan show
  toast.classList.add(type);
  toast.classList.remove('hidden');
  
  // Setup event listener untuk tombol close
  const closeBtn = document.getElementById('toast-close-btn');
  if (closeBtn) {
    closeBtn.onclick = hideToast;
  }
  
  // Auto hide setelah 5 detik
  window.toastTimeout = setTimeout(hideToast, 5000);
}

function hideToast() {
  const toast = document.getElementById('toast');
  
  // Clear timeout
  if (window.toastTimeout) {
    clearTimeout(window.toastTimeout);
    window.toastTimeout = null;
  }
  
  // Sembunyikan toast dengan animation
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(-10px)';
  
  setTimeout(() => {
    toast.classList.add('hidden');
    toast.style.opacity = '';
    toast.style.transform = '';
  }, 300);
}

// ==================== FIXED: syncUIWithState function ====================
function syncUIWithState(mode) {
  const sendBtn = document.getElementById(`${mode}-send-btn`);
  const sendIcon = document.getElementById(`${mode}-send-icon`);
  const loaderIcon = document.getElementById(`${mode}-loader-icon`);
  const progressContainer = document.getElementById(`${mode}-progress-container`);
  const progressBar = document.getElementById(`${mode}-progress-bar`);
  const progressPercent = document.getElementById(`${mode}-progress-percent`);
  
  if (appState.isGenerating) {
    sendBtn.disabled = true;
    sendBtn.style.opacity = '0.5';
    sendBtn.style.cursor = 'not-allowed';
    sendIcon.classList.add('hidden');
    loaderIcon.classList.remove('hidden');
    progressContainer.classList.remove('hidden');
  } else {
    sendBtn.disabled = false;
    sendBtn.style.opacity = '1';
    sendBtn.style.cursor = 'pointer';
    sendIcon.classList.remove('hidden');
    loaderIcon.classList.add('hidden');
    progressContainer.classList.add('hidden');
    progressBar.style.width = '0%';
    progressPercent.textContent = '0%';
  }
}

// ==================== UTILITY FUNCTIONS ====================
async function retryFetch(url, options = {}, maxRetries = MAX_RETRIES) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        return response;
      }
      if (i === maxRetries - 1) {
        throw new Error(`Request failed with status ${response.status}`);
      }
    } catch (error) {
      if (error instanceof TypeError && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000;
        console.warn(`[Retry ${i + 1}/${maxRetries}] Failed to fetch ${url}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Failed after multiple retries');
}

function parseJobResponse(data) {
  let jobData = null;
  
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return null;
    }
    jobData = data[0];
  } else if (data && typeof data === 'object') {
    jobData = data;
  } else {
    throw new Error('Invalid response format: ' + JSON.stringify(data));
  }
  
  if (!jobData.status) {
    throw new Error('Missing status field in response');
  }
  
  const validStatuses = ['PENDING', 'PROCESSING', 'COMPLETED', 'Failed', 'FAILED'];
  if (!validStatuses.includes(jobData.status)) {
    console.warn('Unknown status:', jobData.status);
  }
  
  return jobData;
}

function handleKeyPress(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    handleGenerate();
  }
}

// ==================== GENERATION FUNCTIONS ====================
async function handleIdeGenerate() {
  const ide = document.getElementById('ide-input').value.trim();
  
  if (!ide) {
    showToast('Please enter your idea', 'warning');
    return;
  }
  
  if (appState.isGenerating) {
    showToast('Please wait for current generation to complete', 'warning');
    return;
  }
  
  showToast('Mengembangkan ide menjadi carousel...', 'info');

  const payload = {
    pesan: ide,
    creator_name: document.getElementById('ide-creator-name').value.trim() || 'none',
    template_style: document.getElementById('ide-template').value,
    tone_of_voice: document.getElementById('ide-voice-tone').value
  };
  
  await handleGenerate(payload, IDE_SUBMIT_WEBHOOK, IDE_STATUS_WEBHOOK, 'ide');
}

async function handleSkripGenerate() {
  const skrip = document.getElementById('skrip-input').value.trim();
  
  if (!skrip) {
    showToast('Please enter your script', 'warning');
    return;
  }
  
  if (appState.isGenerating) {
    showToast('Please wait for current generation to complete', 'warning');
    return;
  }
  
  showToast('Mengonversi skrip menjadi carousel...', 'info');

  const payload = {
    pesan: skrip,
    creator_name: document.getElementById('skrip-creator-name').value.trim() || 'none',
    template_style: document.getElementById('skrip-template').value
  };
  
  await handleGenerate(payload, SKRIP_SUBMIT_WEBHOOK, SKRIP_STATUS_WEBHOOK, 'skrip');
}

async function handleGenerate(payload, submitWebhook, statusWebhook, mode) {
  console.log('Sending payload:', payload);

  try {
    const response = await retryFetch(submitWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    let data;
    try {
      data = await response.json();
    } catch (e) {
      throw new Error(`Failed to parse response. Status: ${response.status}`);
    }

    if (!response.ok) {
      let errorDetails = data.message || JSON.stringify(data) || `Status: ${response.status}`;
      throw new Error(`HTTP Error: ${errorDetails}`);
    }
    
    const jobId = data.jobId || data.job_id;
    
    if (!jobId) {
      console.error('Invalid response:', data);
      throw new Error('No job ID received. Response: ' + JSON.stringify(data));
    }

    appState.startGeneration(jobId);
    syncUIWithState(mode);
    
    showToast('Generation started!', 'info');
    
    await checkJobStatus(jobId, payload.pesan, statusWebhook, mode);
    appState.pollingInterval = setInterval(() => checkJobStatus(jobId, payload.pesan, statusWebhook, mode), INITIAL_POLL_INTERVAL);

  } catch (error) {
    console.error('Generation error:', error);
    appState.stopGeneration();
    syncUIWithState(mode);
    
    if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
      showToast('Network error. Check connection and CORS settings.', 'error');
    } else {
      showToast('Error: ' + error.message, 'error');
    }
  }
}

// ==================== FIXED: checkJobStatus with proper cleanup ====================
async function checkJobStatus(jobId, content, statusWebhook, mode) {
  try {
    appState.pollAttempts++;
    
    const elapsedTime = Date.now() - appState.pollingStartTime;
    const maxPollTime = MAX_POLL_ATTEMPTS * INITIAL_POLL_INTERVAL;
    
    if (appState.pollAttempts > MAX_POLL_ATTEMPTS || elapsedTime > maxPollTime) {
      appState.stopGeneration();
      syncUIWithState(mode);
      showToast('Generation timeout. The process took too long. Please try again.', 'error');
      return;
    }
    
    console.log(`Polling attempt ${appState.pollAttempts}/${MAX_POLL_ATTEMPTS} for job: ${jobId}`);
    
    const response = await retryFetch(`${statusWebhook}?jobId=${encodeURIComponent(jobId)}`);
    const data = await response.json();
    
    const jobData = parseJobResponse(data);
    
    if (!jobData) {
      console.log('Job not available yet, waiting...');
      appState.consecutiveErrors = 0;
      return;
    }

    if (!jobData.status) {
      throw new Error('Invalid polling response: missing status field');
    }

    // Check for OUT_OF_LIMIT status
    if (jobData.status === 'OUT_OF_LIMIT') {
      appState.stopGeneration();
      syncUIWithState(mode);

      // Reset progress bar
      document.getElementById(`${mode}-progress-container`).classList.add('hidden');
      document.getElementById(`${mode}-progress-bar`).style.width = '0%';
      document.getElementById(`${mode}-progress-percent`).textContent = '0%';

      // Clean up polling interval
      if (appState.pollingInterval) {
        clearInterval(appState.pollingInterval);
        appState.pollingInterval = null;
      }
      
      showOutOfLimitModal();
      return;
    }

    if (jobData.status === 'EMPTY OUTPUT') {
      appState.stopGeneration();
      syncUIWithState(mode);

      // Reset progress bar
      document.getElementById(`${mode}-progress-container`).classList.add('hidden');
      document.getElementById(`${mode}-progress-bar`).style.width = '0%';
      document.getElementById(`${mode}-progress-percent`).textContent = '0%';

      // Clean up polling interval
      if (appState.pollingInterval) {
        clearInterval(appState.pollingInterval);
        appState.pollingInterval = null;
      }
      
      showToast('Generate gagal mohon coba lagi dalam beberapa saat', 'error');
      return;
    }

    if (jobData.status === 'FAILED' || jobData.status === 'Failed') {
      appState.stopGeneration();
      syncUIWithState(mode);

      // Reset progress bar
      document.getElementById(`${mode}-progress-container`).classList.add('hidden');
      document.getElementById(`${mode}-progress-bar`).style.width = '0%';
      document.getElementById(`${mode}-progress-percent`).textContent = '0%';

      // Clean up polling interval
      if (appState.pollingInterval) {
        clearInterval(appState.pollingInterval);
        appState.pollingInterval = null;
      }

      const errorMsg = jobData.error || jobData.message || 'Terjadi kesalahan';
      showToast(`Generate gagal: ${errorMsg}. Mohon coba lagi dalam beberapa saat`, 'error');
      return;
    }

    appState.consecutiveErrors = 0;

    if (jobData.status === 'COMPLETED' && jobData.slides && Array.isArray(jobData.slides) && jobData.slides.length > 0) {
      appState.stopGeneration();
      syncUIWithState(mode);

      // Reset progress bar
      document.getElementById(`${mode}-progress-container`).classList.add('hidden');
      document.getElementById(`${mode}-progress-bar`).style.width = '0%';
      document.getElementById(`${mode}-progress-percent`).textContent = '0%';

      // Clean up polling interval
      if (appState.pollingInterval) {
        clearInterval(appState.pollingInterval);
        appState.pollingInterval = null;
      }

      const newItem = {
        id: Date.now(),
        script: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
        slides: jobData.slides || [],
        creatorName: document.getElementById(`${mode}-creator-name`).value,
        template: document.getElementById(`${mode}-template`).value,
        timestamp: new Date().toISOString(),
        jobId,
        mode: mode
      };
      
      appState.addToHistory(newItem);
      appState.currentSlides = jobData.slides;
      
      if (mode === 'skrip') {
        displaySkripResults(jobData.slides);
      } else if (mode === 'ide') {
        displayIdeResults(jobData.slides);
      }
      
      showToast(`Successfully generated ${jobData.slides.length} slides!`, 'success');
      
      // Clear input
      document.getElementById(`${mode}-input`).value = '';
      
      console.log('Generation completed successfully');
      
    } else {
      console.log('Job still processing, status:', jobData.status);
      
      if (jobData.progress !== undefined) {
        const progress = Math.min(Math.max(parseInt(jobData.progress), 0), 100);
        document.getElementById(`${mode}-progress-percent`).textContent = progress + '%';
        document.getElementById(`${mode}-progress-bar`).style.width = progress + '%';
      } else {
        const estimatedProgress = Math.min((appState.pollAttempts / MAX_POLL_ATTEMPTS) * 90, 90);
        document.getElementById(`${mode}-progress-percent`).textContent = Math.round(estimatedProgress) + '%';
        document.getElementById(`${mode}-progress-bar`).style.width = estimatedProgress + '%';
      }
    }
  } catch (error) {
    console.error('Polling error:', error);
    appState.consecutiveErrors++;
    
    if (appState.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      appState.stopGeneration();
      syncUIWithState(mode);
      
      // Reset progress bar
      document.getElementById(`${mode}-progress-container`).classList.add('hidden');
      document.getElementById(`${mode}-progress-bar`).style.width = '0%';
      document.getElementById(`${mode}-progress-percent`).textContent = '0%';
      
      // Clean up polling interval
      if (appState.pollingInterval) {
        clearInterval(appState.pollingInterval);
        appState.pollingInterval = null;
      }
      
      showToast('Multiple polling failures. Please check your connection and try again.', 'error');
      return;
    }
    
    if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
      console.log('Network error during polling, will retry... (' + appState.consecutiveErrors + '/' + MAX_CONSECUTIVE_ERRORS + ')');
    } else {
      console.warn('Polling error (continuing):', error.message);
    }
  }
}

// Out of Limit Modal Functions
function showOutOfLimitModal() {
  const modal = document.getElementById('out-of-limit-modal');
  modal.classList.remove('hidden');
  
  // Add keyboard event listener
  document.addEventListener('keydown', handleOutOfLimitModalKeyboard);
}

function closeOutOfLimitModal() {
  const modal = document.getElementById('out-of-limit-modal');
  modal.classList.add('hidden');
  
  // Remove event listener
  document.removeEventListener('keydown', handleOutOfLimitModalKeyboard);
}

function handleOutOfLimitModalKeyboard(event) {
  if (event.key === 'Escape') {
    closeOutOfLimitModal();
  }
}

// ==================== DISPLAY FOR GENERATED FUNCTION ====================
// Fungsi untuk menampilkan hasil di Ide
function displayIdeResults(slides) {
  const resultsContainer = document.getElementById('ide-results-container');
  const slidesContainer = document.getElementById('ide-slides-container');
  
  if (!slides || slides.length === 0) {
    slidesContainer.innerHTML = `<div class="col-span-full text-center py-4"><p class="text-gray-500 dark:text-gray-400">No slides generated</p></div>`;
    return;
  }
  
  slidesContainer.innerHTML = '';
  
  slides.forEach((slide, index) => {
    const slideWrapper = document.createElement('div');
    slideWrapper.className = 'content-card rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-xl';
    
    const img = document.createElement('img');
    img.src = slide.download_url || slide.url;
    img.alt = `Slide ${index + 1}`;
    img.className = 'w-full h-40 object-cover cursor-pointer';
    img.addEventListener('click', function() {
      openPreview(slides, index);
    });
    
    const infoDiv = document.createElement('div');
    infoDiv.className = 'p-3';
    infoDiv.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <p class="font-medium text-sm">Slide ${index + 1}</p>
          <p class="text-xs" style="color: var(--text-secondary)">${slide.filename || 'generated-slide'}</p>
        </div>
        <div class="flex gap-1">
          <button onclick="openPreview(${JSON.stringify(slides).replace(/"/g, '&quot;')}, ${index})" 
                  class="btn-icon p-1 rounded" style="color: var(--cyan-primary)"
                  title="Preview">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
            </svg>
          </button>
          <button onclick="downloadSlide('${slide.download_url || slide.url}', 'slide-${index + 1}.jpg')" 
                  class="btn-icon p-1 rounded" style="color: var(--cyan-primary)"
                  title="Download">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
    
    slideWrapper.appendChild(img);
    slideWrapper.appendChild(infoDiv);
    slidesContainer.appendChild(slideWrapper);
  });
  
  resultsContainer.classList.remove('hidden');
}

// Fungsi untuk menampilkan hasil di Skrip
function displaySkripResults(slides) {
  const resultsContainer = document.getElementById('skrip-results-container');
  const slidesContainer = document.getElementById('skrip-slides-container');
  
  if (!slides || slides.length === 0) {
    slidesContainer.innerHTML = `<div class="col-span-full text-center py-4"><p class="text-gray-500 dark:text-gray-400">No slides generated</p></div>`;
    return;
  }
  
  slidesContainer.innerHTML = '';
  
  slides.forEach((slide, index) => {
    const slideWrapper = document.createElement('div');
    slideWrapper.className = 'content-card rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-xl';
    
    const img = document.createElement('img');
    img.src = slide.download_url || slide.url;
    img.alt = `Slide ${index + 1}`;
    img.className = 'w-full h-40 object-cover cursor-pointer';
    img.addEventListener('click', function() {
      openPreview(slides, index);
    });
    
    const infoDiv = document.createElement('div');
    infoDiv.className = 'p-3';
    infoDiv.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <p class="font-medium text-sm">Slide ${index + 1}</p>
          <p class="text-xs" style="color: var(--text-secondary)">${slide.filename || 'generated-slide'}</p>
        </div>
        <div class="flex gap-1">
          <button onclick="openPreview(${JSON.stringify(slides).replace(/"/g, '&quot;')}, ${index})" 
                  class="btn-icon p-1 rounded" style="color: var(--cyan-primary)"
                  title="Preview">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
            </svg>
          </button>
          <button onclick="downloadSlide('${slide.download_url || slide.url}', 'slide-${index + 1}.jpg')" 
                  class="btn-icon p-1 rounded" style="color: var(--cyan-primary)"
                  title="Download">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
    
    slideWrapper.appendChild(img);
    slideWrapper.appendChild(infoDiv);
    slidesContainer.appendChild(slideWrapper);
  });
  
  resultsContainer.classList.remove('hidden');
}

// Fungsi clear results
function clearIdeResults() {
  const resultsContainer = document.getElementById('ide-results-container');
  const slidesContainer = document.getElementById('ide-slides-container');
  slidesContainer.innerHTML = '';
  resultsContainer.classList.add('hidden');
}

function clearSkripResults() {
  const resultsContainer = document.getElementById('skrip-results-container');
  const slidesContainer = document.getElementById('skrip-slides-container');
  slidesContainer.innerHTML = '';
  resultsContainer.classList.add('hidden');
}

// ==================== DISPLAY FUNCTION ====================
function displaySlides(slides) {
  const slidesContainer = document.getElementById('slides-container');
  
  if (!slides || slides.length === 0) {
    slidesContainer.innerHTML = `
      <div class="col-span-full text-center py-8">
        <p class="text-gray-500 dark:text-gray-400">No slides generated yet</p>
      </div>
    `;
    return;
  }
  
  slidesContainer.innerHTML = '';
  
  slides.forEach((slide, index) => {
    const slideWrapper = document.createElement('div');
    slideWrapper.className = 'content-card rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-xl';
    
    const placeholderImgUrl = `https://placehold.co/600x400/00BCD4/ffffff?text=Slide+${index + 1}`;
    
    const img = document.createElement('img');
    img.src = placeholderImgUrl;
    img.alt = `Slide ${index + 1}`;
    img.className = 'w-full h-48 object-cover cursor-pointer';
    
    // Add click event for preview
    img.addEventListener('click', function() {
      openPreview(slides, index);
    });
    
    // Try to load actual image
    const actualImage = new Image();
    actualImage.onload = () => {
      img.src = slide.download_url || slide.url;
    };
    actualImage.onerror = () => {
      img.src = `https://placehold.co/600x400/EF4444/ffffff?text=Error+Loading`;
    };
    actualImage.src = slide.download_url || slide.url;
    
    const infoDiv = document.createElement('div');
    infoDiv.className = 'p-4';
    infoDiv.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <p class="font-medium">Slide ${index + 1}</p>
          <p class="text-sm" style="color: var(--text-secondary)">${slide.filename || 'generated-slide'}</p>
        </div>
        <div class="flex gap-1">
          <button onclick="openPreview(${JSON.stringify(slides).replace(/"/g, '&quot;')}, ${index})" 
                  class="btn-icon p-2 rounded-lg" style="color: var(--cyan-primary)"
                  title="Preview">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
            </svg>
          </button>
          <button onclick="downloadSlide('${slide.download_url || slide.url}', 'slide-${index + 1}.jpg')" 
                  class="btn-icon p-2 rounded-lg" style="color: var(--cyan-primary)"
                  title="Download">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
    
    slideWrapper.appendChild(img);
    slideWrapper.appendChild(infoDiv);
    slidesContainer.appendChild(slideWrapper);
  });
}

async function downloadSlide(url, filename) {
  try {
    showToast('Downloading slide...', 'info');
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}`);
    }
    
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(blobUrl);
    showToast('Slide downloaded successfully!', 'success');
  } catch (error) {
    console.error('Download error:', error);
    showToast('Download failed: ' + error.message, 'error');
  }
}

// ==================== HISTORY FUNCTIONS ====================
function renderHistory() {
  const container = document.getElementById('history-container');
  
  if (appState.history.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12">
        <svg class="w-16 h-16 mx-auto mb-4" style="color: var(--text-secondary)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <p style="color: var(--text-secondary)">No history yet</p>
      </div>
    `;
    return;
  }

  const grouped = groupHistoryByDate(appState.history);
  let html = '';

  for (const [period, items] of Object.entries(grouped)) {
    if (items.length > 0) {
      html += `
        <div class="mb-6">
          <h3 class="text-sm font-semibold mb-3" style="color: var(--text-secondary)">${period}</h3>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            ${items.map(item => `
              <div onclick="loadHistoryItem(${item.id})" class="history-card rounded-xl p-4 aspect-square flex flex-col items-center justify-center text-center">
                <svg class="w-8 h-8 mb-2" style="color: var(--text-secondary)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
                </svg>
                <p class="text-xs font-medium truncate w-full">${item.slides?.length || 0} slides</p>
                <p class="text-xs mt-1" style="color: var(--text-secondary)">${new Date(item.timestamp).toLocaleDateString()}</p>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
  }

  container.innerHTML = html;
}

function loadHistoryItem(historyId) {
  const historyItem = appState.history.find(item => item.id === historyId);
  if (historyItem && historyItem.slides) {
    appState.currentSlides = historyItem.slides;
    displaySlides(historyItem.slides);
    showResults();
  }
}

function groupHistoryByDate(items) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups = {
    'Baru saat': [],
    'Kemarin': [],
    'Minggu ini': [],
    'Bulan ini': []
  };

  items.forEach(item => {
    const itemDate = new Date(item.timestamp);
    const hoursDiff = (now - itemDate) / (1000 * 60 * 60);
    
    if (hoursDiff < 24 && itemDate.getDate() === now.getDate()) {
      groups['Baru saat'].push(item);
    } else if (itemDate >= yesterday && itemDate < today) {
      groups['Kemarin'].push(item);
    } else if (hoursDiff < 168) {
      groups['Minggu ini'].push(item);
    } else {
      groups['Bulan ini'].push(item);
    }
  });

  return groups;
}

// ==================== EDIT FUNCTIONS WITH FABRIC.JS ====================
let fabricCanvas = null;
let currentEditSlide = null;
let currentEditIndex = 0;
let currentEditSlides = [];
let originalSlideUrl = '';

// Initialize fabric canvas
function initializeFabricCanvas() {
  const canvasElement = document.getElementById('edit-canvas');
  fabricCanvas = new fabric.Canvas(canvasElement, {
    backgroundColor: '#ffffff',
    preserveObjectStacking: true
  });
  
  // Set canvas size
  updateCanvasSize();
  
  // Add event listeners for object selection
  fabricCanvas.on('selection:created', updateObjectsList);
  fabricCanvas.on('selection:updated', updateObjectsList);
  fabricCanvas.on('selection:cleared', updateObjectsList);
  fabricCanvas.on('object:modified', updateObjectsList);
  
  window.addEventListener('resize', updateCanvasSize);
}

// Update canvas size based on container
function updateCanvasSize() {
  const container = document.querySelector('#edit-modal .flex-1');
  if (container && fabricCanvas) {
    const width = container.clientWidth - 32; // minus padding
    const height = container.clientHeight - 32;
    fabricCanvas.setDimensions({ width, height });
    fabricCanvas.renderAll();
  }
}

// Open edit modal
function openEditSlide(slide, index, slides) {
  currentEditSlide = slide;
  currentEditIndex = index;
  currentEditSlides = slides;
  originalSlideUrl = slide.download_url || slide.url;
  
  // Show modal
  const modal = document.getElementById('edit-modal');
  modal.classList.remove('hidden');
  
  // Initialize canvas if not already
  if (!fabricCanvas) {
    initializeFabricCanvas();
  }
  
  // Load image to canvas
  loadImageToCanvas(originalSlideUrl);
  
  // Add text elements from slide data if available
  if (slide.texts && Array.isArray(slide.texts)) {
    slide.texts.forEach(text => {
      addTextToCanvas(text.content, text.x, text.y, text.style);
    });
  }
}

// Load image to canvas
function loadImageToCanvas(imageUrl) {
  fabric.Image.fromURL(imageUrl, function(img) {
    // Clear canvas
    fabricCanvas.clear();
    
    // Scale image to fit canvas
    const scale = Math.min(
      fabricCanvas.width / img.width,
      fabricCanvas.height / img.height
    );
    
    img.scale(scale);
    img.set({
      left: (fabricCanvas.width - img.width * scale) / 2,
      top: (fabricCanvas.height - img.height * scale) / 2,
      selectable: false,
      evented: false
    });
    
    fabricCanvas.add(img);
    fabricCanvas.sendToBack(img);
    fabricCanvas.renderAll();
    
    updateObjectsList();
  });
}

// Close edit modal
function closeEditModal() {
  const modal = document.getElementById('edit-modal');
  modal.classList.add('hidden');
  
  // Reset canvas
  if (fabricCanvas) {
    fabricCanvas.clear();
  }
  
  currentEditSlide = null;
  currentEditIndex = 0;
  currentEditSlides = [];
  originalSlideUrl = '';
}

// Save edited slide
async function saveEditedSlide() {
  if (!fabricCanvas) return;
  
  try {
    showToast('Menyimpan perubahan...', 'info');
    
    // Get canvas data URL
    const dataURL = fabricCanvas.toDataURL({
      format: 'jpeg',
      quality: 0.9
    });
    
    // Create a blob from data URL
    const blob = await dataURLToBlob(dataURL);
    const filename = `edited-slide-${currentEditIndex + 1}.jpg`;
    
    // Update current slides
    if (currentEditSlides && currentEditSlides[currentEditIndex]) {
      // Create new slide object with edited version
      const editedSlide = {
        ...currentEditSlides[currentEditIndex],
        edited: true,
        edited_url: dataURL,
        edited_at: new Date().toISOString()
      };
      
      // Update in current slides
      currentEditSlides[currentEditIndex] = editedSlide;
      
      // Update in app state if it's the current slides
      if (appState.currentSlides === currentEditSlides) {
        appState.currentSlides = currentEditSlides;
      }
      
      // Update in history
      updateHistoryWithEditedSlide(editedSlide);
      
      // Update UI
      updateSlideInUI(editedSlide, currentEditIndex);
      
      showToast('Slide berhasil disimpan!', 'success');
    }
    
    closeEditModal();
    
  } catch (error) {
    console.error('Error saving edited slide:', error);
    showToast('Gagal menyimpan slide: ' + error.message, 'error');
  }
}

// Convert data URL to blob
function dataURLToBlob(dataURL) {
  return new Promise((resolve, reject) => {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    
    resolve(new Blob([u8arr], { type: mime }));
  });
}

// Update history with edited slide
function updateHistoryWithEditedSlide(editedSlide) {
  // Find and update in history
  appState.history = appState.history.map(historyItem => {
    if (historyItem.slides && Array.isArray(historyItem.slides)) {
      const updatedSlides = historyItem.slides.map(slide => {
        if (slide.download_url === editedSlide.download_url || 
            slide.url === editedSlide.url) {
          return editedSlide;
        }
        return slide;
      });
      return { ...historyItem, slides: updatedSlides };
    }
    return historyItem;
  });
  
  appState.saveHistory();
}

// Update slide in UI
function updateSlideInUI(slide, index) {
  // Update in results view if currently viewing
  const currentView = appState.currentView;
  
  if (currentView === 'ide-to-carousel' || currentView === 'skrip-to-carousel') {
    const mode = currentView === 'ide-to-carousel' ? 'ide' : 'skrip';
    const slidesContainer = document.getElementById(`${mode}-slides-container`);
    const slideElements = slidesContainer.querySelectorAll('.content-card');
    
    if (slideElements[index]) {
      const img = slideElements[index].querySelector('img');
      if (img && slide.edited_url) {
        img.src = slide.edited_url;
      }
    }
  }
  
  // Update in results view
  const resultsSlidesContainer = document.getElementById('slides-container');
  if (resultsSlidesContainer) {
    const slideElements = resultsSlidesContainer.querySelectorAll('.content-card');
    if (slideElements[index]) {
      const img = slideElements[index].querySelector('img');
      if (img && slide.edited_url) {
        img.src = slide.edited_url;
      }
    }
  }
}

// Add text element to canvas
function addTextElement() {
  const text = new fabric.Textbox('Edit teks disini', {
    left: 100,
    top: 100,
    width: 200,
    fontSize: 24,
    fontFamily: 'Arial',
    fill: '#000000',
    textAlign: 'center'
  });
  
  fabricCanvas.add(text);
  fabricCanvas.setActiveObject(text);
  fabricCanvas.renderAll();
  updateObjectsList();
}

// Add text with specific properties
function addTextToCanvas(content, x, y, style = {}) {
  const text = new fabric.Textbox(content, {
    left: x || 100,
    top: y || 100,
    width: 200,
    fontSize: style.fontSize || 24,
    fontFamily: style.fontFamily || 'Arial',
    fill: style.color || '#000000',
    textAlign: style.align || 'center',
    ...style
  });
  
  fabricCanvas.add(text);
}

// Add image element
function addImageElement() {
  // Create file input for image upload
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  
  input.onchange = function(e) {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function(event) {
        fabric.Image.fromURL(event.target.result, function(img) {
          img.scale(0.5);
          img.set({
            left: fabricCanvas.width / 2 - img.width * 0.25,
            top: fabricCanvas.height / 2 - img.height * 0.25
          });
          
          fabricCanvas.add(img);
          fabricCanvas.renderAll();
          updateObjectsList();
        });
      };
      reader.readAsDataURL(file);
    }
  };
  
  input.click();
}

// Add shape
function addShape(shapeType) {
  let shape;
  const centerX = fabricCanvas.width / 2;
  const centerY = fabricCanvas.height / 2;
  
  switch(shapeType) {
    case 'rect':
      shape = new fabric.Rect({
        left: centerX - 50,
        top: centerY - 50,
        width: 100,
        height: 100,
        fill: '#3498db',
        strokeWidth: 2,
        stroke: '#2980b9'
      });
      break;
    case 'circle':
      shape = new fabric.Circle({
        left: centerX - 50,
        top: centerY - 50,
        radius: 50,
        fill: '#e74c3c',
        strokeWidth: 2,
        stroke: '#c0392b'
      });
      break;
  }
  
  if (shape) {
    fabricCanvas.add(shape);
    fabricCanvas.setActiveObject(shape);
    fabricCanvas.renderAll();
    updateObjectsList();
  }
}

// Update text property
function updateTextProperty(property, value) {
  const activeObject = fabricCanvas.getActiveObject();
  if (activeObject && activeObject.type === 'textbox') {
    activeObject.set(property, property === 'fontSize' ? parseInt(value) : value);
    
    // Update display value for font size
    if (property === 'fontSize') {
      document.getElementById('font-size-value').textContent = value;
    }
    
    fabricCanvas.renderAll();
  }
}

// Update canvas background
function updateCanvasBackground(color) {
  fabricCanvas.backgroundColor = color;
  fabricCanvas.renderAll();
}

// Apply layout template
function applyLayout(layoutType) {
  // Clear existing objects except background image
  const objects = fabricCanvas.getObjects();
  objects.forEach(obj => {
    if (obj.type !== 'image') {
      fabricCanvas.remove(obj);
    }
  });
  
  const width = fabricCanvas.width;
  const height = fabricCanvas.height;
  
  switch(layoutType) {
    case 'title-center':
      addTextToCanvas('Judul Presentasi', width / 2, 100, {
        fontSize: 48,
        textAlign: 'center',
        fontWeight: 'bold'
      });
      break;
      
    case 'title-left':
      addTextToCanvas('Judul Presentasi', 100, 100, {
        fontSize: 48,
        textAlign: 'left',
        fontWeight: 'bold'
      });
      break;
      
    case 'two-column':
      addTextToCanvas('Kolom 1', width * 0.25, 200, {
        fontSize: 24,
        textAlign: 'center',
        width: width * 0.4
      });
      addTextToCanvas('Kolom 2', width * 0.75, 200, {
        fontSize: 24,
        textAlign: 'center',
        width: width * 0.4
      });
      break;
      
    case 'image-text':
      // Add placeholder for image
      const rect = new fabric.Rect({
        left: 50,
        top: 100,
        width: width * 0.4,
        height: height * 0.6,
        fill: '#ecf0f1',
        stroke: '#bdc3c7',
        strokeWidth: 2
      });
      fabricCanvas.add(rect);
      
      // Add text area
      addTextToCanvas('Deskripsi gambar disini', width * 0.55, 200, {
        fontSize: 20,
        textAlign: 'left',
        width: width * 0.4
      });
      break;
  }
  
  fabricCanvas.renderAll();
  updateObjectsList();
}

// Update objects list in sidebar
function updateObjectsList() {
  const objectsList = document.getElementById('objects-list');
  const objects = fabricCanvas.getObjects();
  
  // Filter out background image
  const editableObjects = objects.filter(obj => obj.type !== 'image' || obj.selectable !== false);
  
  let html = '';
  
  editableObjects.forEach((obj, index) => {
    const type = obj.type.charAt(0).toUpperCase() + obj.type.slice(1);
    const name = obj.type === 'textbox' ? (obj.text || 'Text') : type;
    
    html += `
      <div class="flex items-center justify-between p-2 border rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${obj === fabricCanvas.getActiveObject() ? 'border-blue-500 bg-blue-50 dark:bg-blue-900' : ''}"
           onclick="selectObject(${index})">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            ${getObjectIcon(obj.type)}
          </svg>
          <span class="text-xs truncate">${name.substring(0, 15)}${name.length > 15 ? '...' : ''}</span>
        </div>
        <span class="text-xs text-gray-500">${type}</span>
      </div>
    `;
  });
  
  if (html === '') {
    html = '<p class="text-xs text-gray-500 text-center py-2">No objects added</p>';
  }
  
  objectsList.innerHTML = html;
}

// Get icon for object type
function getObjectIcon(type) {
  switch(type) {
    case 'textbox':
      return '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v6m-6 4h12m-6 6h6"/>';
    case 'image':
      return '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>';
    case 'rect':
      return '<rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke-width="2"/>';
    case 'circle':
      return '<circle cx="12" cy="12" r="9" stroke-width="2"/>';
    default:
      return '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>';
  }
}

// Select object by index
function selectObject(index) {
  const objects = fabricCanvas.getObjects();
  const editableObjects = objects.filter(obj => obj.type !== 'image' || obj.selectable !== false);
  
  if (editableObjects[index]) {
    fabricCanvas.setActiveObject(editableObjects[index]);
    fabricCanvas.renderAll();
    updateObjectsList();
  }
}

// Delete selected object
function deleteSelectedObject() {
  const activeObject = fabricCanvas.getActiveObject();
  if (activeObject) {
    fabricCanvas.remove(activeObject);
    fabricCanvas.discardActiveObject();
    fabricCanvas.renderAll();
    updateObjectsList();
  }
}

// Add edit button to slide display functions
function addEditButtonToSlide(slide, index, slides, mode = null) {
  const editButton = document.createElement('button');
  editButton.innerHTML = `
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
    </svg>
  `;
  editButton.className = 'btn-icon p-1 rounded';
  editButton.style.color = 'var(--cyan-primary)';
  editButton.title = 'Edit';
  editButton.onclick = function(e) {
    e.stopPropagation();
    openEditSlide(slide, index, slides);
  };
  
  return editButton;
}

// Update display functions to include edit button
function updateDisplayFunctions() {
  // Update displayIdeResults function
  const originalDisplayIdeResults = displayIdeResults;
  displayIdeResults = function(slides) {
    originalDisplayIdeResults.call(this, slides);
    
    // Add edit button to each slide
    const slidesContainer = document.getElementById('ide-slides-container');
    const slideWrappers = slidesContainer.querySelectorAll('.content-card');
    
    slideWrappers.forEach((wrapper, index) => {
      const buttonContainer = wrapper.querySelector('.flex.gap-1');
      if (buttonContainer) {
        const editButton = addEditButtonToSlide(slides[index], index, slides, 'ide');
        buttonContainer.appendChild(editButton);
      }
    });
  };
  
  // Update displaySkripResults function
  const originalDisplaySkripResults = displaySkripResults;
  displaySkripResults = function(slides) {
    originalDisplaySkripResults.call(this, slides);
    
    // Add edit button to each slide
    const slidesContainer = document.getElementById('skrip-slides-container');
    const slideWrappers = slidesContainer.querySelectorAll('.content-card');
    
    slideWrappers.forEach((wrapper, index) => {
      const buttonContainer = wrapper.querySelector('.flex.gap-1');
      if (buttonContainer) {
        const editButton = addEditButtonToSlide(slides[index], index, slides, 'skrip');
        buttonContainer.appendChild(editButton);
      }
    });
  };
  
  // Update displaySlides function for history
  const originalDisplaySlides = displaySlides;
  displaySlides = function(slides) {
    originalDisplaySlides.call(this, slides);
    
    // Add edit button to each slide
    const slidesContainer = document.getElementById('slides-container');
    const slideWrappers = slidesContainer.querySelectorAll('.content-card');
    
    slideWrappers.forEach((wrapper, index) => {
      const buttonContainer = wrapper.querySelector('.flex.gap-1');
      if (buttonContainer) {
        const editButton = addEditButtonToSlide(slides[index], index, slides);
        buttonContainer.appendChild(editButton);
      }
    });
  };
}

// Update history items to include edit option
function updateHistoryItemDisplay() {
  // When loading history item, add edit button
  const originalLoadHistoryItem = loadHistoryItem;
  loadHistoryItem = function(historyId) {
    originalLoadHistoryItem.call(this, historyId);
    
    // Add edit buttons after slides are displayed
    setTimeout(() => {
      const slidesContainer = document.getElementById('slides-container');
      if (slidesContainer) {
        const slideWrappers = slidesContainer.querySelectorAll('.content-card');
        slideWrappers.forEach((wrapper, index) => {
          const buttonContainer = wrapper.querySelector('.flex.gap-1');
          if (buttonContainer && appState.currentSlides[index]) {
            const editButton = addEditButtonToSlide(
              appState.currentSlides[index], 
              index, 
              appState.currentSlides
            );
            buttonContainer.appendChild(editButton);
          }
        });
      }
    }, 100);
  };
}

// Initialize edit features
function initializeEditFeatures() {
  updateDisplayFunctions();
  updateHistoryItemDisplay();
  
  // Add event listener for ESC key to close modal
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && !document.getElementById('edit-modal').classList.contains('hidden')) {
      closeEditModal();
    }
  });
}

// Call this in initialize function
// Add to existing initialize() function:
// function initialize() {
//   // ... existing code ...
  
//   // Initialize edit features
//   initializeEditFeatures();
// }
// ==================== INITIALIZE APP ====================
initialize();