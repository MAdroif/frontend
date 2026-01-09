// ==================== UI STATE & NAVIGATION ====================
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
      
      return parsed.slice(0, 50);
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
    
    if (this.history.length > 50) {
      this.history = this.history.slice(0, 50);
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

// ==================== TESTING FUNCTION ====================
// function loadTestSlides() {
//   // Data test dengan path lokal
//   const testSlides = [
//     {
//       filename: "slide1.jpg",
//       download_url: "slides/slide1.jpg",  // ⬅️ Path ke folder lokal
//       url: "slides/slide1.jpg",
//       title: "Test Slide 1"
//     },
//     {
//       filename: "slide2.jpg", 
//       download_url: "slides/slide2.jpg",
//       url: "slides/slide2.jpg",
//       title: "Test Slide 2"
//     },
//     {
//       filename: "slide3.jpg",
//       download_url: "slides/slide3.jpg",
//       url: "slides/slide3.jpg", 
//       title: "Download Test"
//     }
//   ];
  
//   // Simpan ke state
//   appState.currentSlides = testSlides;
  
//   // Display di results view
//   displaySlides(testSlides);
//   showResults();
  
//   console.log('Test slides loaded. Check Results tab.');
//   showToast('Test slides loaded! Check Results tab to edit.', 'info');
// }

// ==================== UI INITIALIZATION ====================
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
  loadTestSlides();
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

// ==================== UI CONTROLS ====================
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

// ==================== VIEW NAVIGATION ====================
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

// ==================== TOAST NOTIFICATION ====================
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

// ==================== UI STATE SYNC ====================
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

// ==================== SLIDE PREVIEW ====================
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

// ==================== MODAL MANAGEMENT ====================
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

// ==================== HISTORY MANAGEMENT ====================
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

// ==================== RESULTS DISPLAY ====================
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

// ==================== UTILITY FUNCTIONS ====================
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

function handleKeyPress(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    const currentView = appState.currentView;
    if (currentView === 'ide-to-carousel') {
      handleIdeGenerate();
    } else if (currentView === 'skrip-to-carousel') {
      handleSkripGenerate();
    }
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initialize);