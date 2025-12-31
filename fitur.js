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