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

// ==================== GENERATION HANDLERS ====================
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

// ==================== JOB STATUS POLLING ====================
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