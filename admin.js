// Admin Dashboard Logic
let customFields = [];
let projectsList = [];
let selectedVideoFile = null;
let currentTags = [];
let editingVideoId = null;
let currentSubtitles = []; // Holds { languageCode, languageLabel, file, existingFile, name }
let selectedSubtitleFile = null;
let currentAudioTracks = []; // Holds { languageCode, languageLabel, file, existingFile, name }
let selectedAudioFile = null;
let selectedThumbnailFile = null;
let currentThumbnailDataUrl = null;

const LANG_MAP = {
  en: 'English',
  te: 'Telugu',
  hi: 'Hindi',
  ta: 'Tamil',
  es: 'Spanish',
  fr: 'French'
};

// Initialize Page
document.addEventListener('DOMContentLoaded', async () => {
  // Check if authenticated
  const isAdmin = sessionStorage.getItem('isAdmin') === 'true';
  const adminToken = sessionStorage.getItem('adminToken');
  if (!isAdmin || !adminToken) {
    window.location.href = 'index.html?login=true';
    return;
  }

  // Initialize Lucide Icons
  lucide.createIcons();

  // Load custom metadata columns quietly
  try {
    customFields = await getCustomFields();
  } catch (err) {
    console.error('Failed to load custom fields', err);
  }

  // Load Projects list
  await refreshProjectsList();

  // Load Videos Catalog
  refreshVideosCatalog();

  // Setup Event Listeners
  setupEventListeners();
});

// Refresh project list dropdown and panel
async function refreshProjectsList() {
  try {
    projectsList = await getProjects();
    
    // Update metric total projects count
    const metricTotalProjects = document.getElementById('metricTotalProjects');
    if (metricTotalProjects) {
      metricTotalProjects.textContent = projectsList.length;
    }
    
    // Populate Select Dropdown
    const projectSelect = document.getElementById('projectSelect');
    if (projectSelect) {
      projectSelect.innerHTML = '<option value="" disabled selected>-- Select Project --</option>';
      projectsList.forEach(proj => {
        const opt = document.createElement('option');
        opt.value = proj;
        opt.textContent = proj;
        projectSelect.appendChild(opt);
      });
    }

    // Populate Left Panel Active Projects List
    const container = document.getElementById('activeProjectsList');
    if (container) {
      if (projectsList.length === 0) {
        container.innerHTML = `
          <p style="color: var(--text-muted); font-size: 0.9rem; text-align: center; padding: 1rem;">No custom projects created yet.</p>
        `;
        return;
      }

      container.innerHTML = '';
      projectsList.forEach(proj => {
        const item = document.createElement('div');
        item.className = 'project-item';
        
        item.innerHTML = `
          <span style="color: #fff; font-size: 0.9rem; font-weight: 500; display: flex; align-items: center; gap: 0.5rem;">
            <i data-lucide="folder" style="width: 14px; height: 14px; color: var(--text-secondary); opacity: 0.7;"></i>
            ${proj}
          </span>
          <button type="button" class="btn-icon btn-delete-project" data-name="${proj}" title="Delete Project" style="padding: 2px; background: none; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;">
            <i data-lucide="trash-2" style="width: 14px; height: 14px; color: var(--color-danger);"></i>
          </button>
        `;
        container.appendChild(item);
      });

      // Bind delete events
      container.querySelectorAll('.btn-delete-project').forEach(btn => {
        btn.addEventListener('click', async () => {
          const name = btn.getAttribute('data-name');
          if (confirm(`Are you sure you want to delete project "${name}"?`)) {
            projectsList = projectsList.filter(p => p !== name);
            await saveProjects(projectsList);
            showToast('Project deleted successfully', 'info');
            await refreshProjectsList();
          }
        });
      });

      lucide.createIcons();
    }
  } catch (err) {
    console.error('Failed to load projects', err);
    showToast('Failed to load projects', 'error');
  }
}

// Setup Form, Drag-Drop, and Interactive elements
function setupEventListeners() {
  const btnCreateProject = document.getElementById('btnCreateProject');
  const newProjectNameInput = document.getElementById('newProjectName');

  // Create Project Click Handler
  if (btnCreateProject) {
    btnCreateProject.addEventListener('click', async () => {
      const name = newProjectNameInput.value.trim();
      if (!name) {
        showToast('Please enter a project name', 'error');
        return;
      }

      // Check for duplicates
      if (projectsList.some(p => p.toLowerCase() === name.toLowerCase())) {
        showToast('A project with this name already exists', 'error');
        return;
      }

      projectsList.push(name);
      try {
        await saveProjects(projectsList);
        showToast(`Project "${name}" created successfully!`, 'success');
        newProjectNameInput.value = '';
        await refreshProjectsList();
      } catch (err) {
        showToast('Failed to save project', 'error');
      }
    });
  }

  // Drag and Drop files
  const dropZone = document.getElementById('dropZone');
  const videoFileInput = document.getElementById('videoFileInput');
  const btnRemoveFile = document.getElementById('btnRemoveFile');

  dropZone.addEventListener('click', () => videoFileInput.click());
  
  videoFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  });

  btnRemoveFile.addEventListener('click', () => {
    selectedVideoFile = null;
    document.getElementById('videoFileInput').value = '';
    document.getElementById('selectedFileBox').style.display = 'none';
    dropZone.style.display = 'flex';
  });

  // Tag inputs
  const tagTextInput = document.getElementById('tagTextInput');
  tagTextInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const value = tagTextInput.value.trim().replace(/,$/, '');
      if (value && !currentTags.includes(value)) {
        currentTags.push(value);
        renderTags();
        tagTextInput.value = '';
      }
    }
  });

  // Subtitles / Translations Add Handlers
  const btnSelectSubtitleFile = document.getElementById('btnSelectSubtitleFile');
  const subtitleFileInput = document.getElementById('subtitleFileInput');
  const btnAddSubtitleTrack = document.getElementById('btnAddSubtitleTrack');
  const subtitleLangSelect = document.getElementById('subtitleLangSelect');

  btnSelectSubtitleFile.addEventListener('click', () => subtitleFileInput.click());

  subtitleFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      selectedSubtitleFile = e.target.files[0];
      btnSelectSubtitleFile.innerHTML = `<i data-lucide="file-check" style="vertical-align: middle; margin-right: 5px; color: var(--color-success);"></i> ${selectedSubtitleFile.name}`;
      lucide.createIcons();
    }
  });

  btnAddSubtitleTrack.addEventListener('click', () => {
    if (!selectedSubtitleFile) {
      showToast('Please select a .vtt subtitle file first', 'error');
      return;
    }

    const langCode = subtitleLangSelect.value;
    const langLabel = LANG_MAP[langCode] || 'Unknown';

    // Prevent duplicate tracks for the same language
    if (currentSubtitles.some(sub => sub.languageCode === langCode)) {
      showToast(`A translation track for ${langLabel} has already been added`, 'error');
      return;
    }

    currentSubtitles.push({
      languageCode: langCode,
      languageLabel: langLabel,
      file: selectedSubtitleFile,
      name: selectedSubtitleFile.name
    });

    renderSubtitles();

    // Reset subtitle file selection fields
    selectedSubtitleFile = null;
    subtitleFileInput.value = '';
    btnSelectSubtitleFile.innerHTML = '<i data-lucide="file-text" style="vertical-align: middle; margin-right: 5px;"></i> Choose VTT File...';
    lucide.createIcons();
  });

  // Voiceover Audio Tracks Add Handlers
  const btnSelectAudioFile = document.getElementById('btnSelectAudioFile');
  const audioFileInput = document.getElementById('audioFileInput');
  const btnAddAudioTrack = document.getElementById('btnAddAudioTrack');
  const audioLangSelect = document.getElementById('audioLangSelect');

  btnSelectAudioFile.addEventListener('click', () => audioFileInput.click());

  audioFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      selectedAudioFile = e.target.files[0];
      btnSelectAudioFile.innerHTML = `<i data-lucide="file-check" style="vertical-align: middle; margin-right: 5px; color: var(--color-success);"></i> ${selectedAudioFile.name}`;
      lucide.createIcons();
    }
  });

  btnAddAudioTrack.addEventListener('click', () => {
    if (!selectedAudioFile) {
      showToast('Please select a voiceover audio file first', 'error');
      return;
    }

    const langCode = audioLangSelect.value;
    const langLabel = LANG_MAP[langCode] ? `${LANG_MAP[langCode]} Voiceover` : 'Unknown Voiceover';

    // Prevent duplicate audio tracks for the same language
    if (currentAudioTracks.some(track => track.languageCode === langCode)) {
      showToast(`An audio track for ${langLabel} has already been added`, 'error');
      return;
    }

    currentAudioTracks.push({
      languageCode: langCode,
      languageLabel: langLabel,
      file: selectedAudioFile,
      name: selectedAudioFile.name
    });

    renderAudioTracks();

    // Reset audio file selection fields
    selectedAudioFile = null;
    audioFileInput.value = '';
    btnSelectAudioFile.innerHTML = '<i data-lucide="headphones" style="vertical-align: middle; margin-right: 5px;"></i> Choose Audio File...';
    lucide.createIcons();
  });

  // Custom Thumbnail Select handlers
  const btnSelectThumbnailFile = document.getElementById('btnSelectThumbnailFile');
  const thumbnailFileInput = document.getElementById('thumbnailFileInput');
  const btnRemoveThumbnail = document.getElementById('btnRemoveThumbnail');

  if (btnSelectThumbnailFile && thumbnailFileInput && btnRemoveThumbnail) {
    btnSelectThumbnailFile.addEventListener('click', () => thumbnailFileInput.click());

    thumbnailFileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        const file = e.target.files[0];
        if (!file.type.startsWith('image/')) {
          showToast('Please select a valid image file', 'error');
          return;
        }
        selectedThumbnailFile = file;
        btnSelectThumbnailFile.innerHTML = `<i data-lucide="file-image" style="vertical-align: middle; margin-right: 5px; color: var(--color-success);"></i> ${file.name}`;
        btnRemoveThumbnail.style.display = 'flex';
        lucide.createIcons();
      }
    });

    btnRemoveThumbnail.addEventListener('click', () => {
      selectedThumbnailFile = null;
      currentThumbnailDataUrl = null;
      thumbnailFileInput.value = '';
      btnSelectThumbnailFile.innerHTML = '<i data-lucide="image" style="vertical-align: middle; margin-right: 5px;"></i> Choose Custom Thumbnail...';
      btnRemoveThumbnail.style.display = 'none';
      lucide.createIcons();
    });
  }

  // Form Submit
  const uploadForm = document.getElementById('uploadVideoForm');
  uploadForm.addEventListener('submit', handleUploadSubmit);

  // Cancel Edit Button
  const btnCancelEdit = document.getElementById('btnCancelEdit');
  if (btnCancelEdit) {
    btnCancelEdit.addEventListener('click', resetUploadForm);
  }

  // Quick Catalog Search Input Filter
  const catalogSearchInput = document.getElementById('catalogSearchInput');
  if (catalogSearchInput) {
    catalogSearchInput.addEventListener('input', () => {
      refreshVideosCatalog();
    });
  }
}

// File Selection Handler
function handleFileSelection(file) {
  if (!file.type.startsWith('video/')) {
    showToast('Please select a valid video file', 'error');
    return;
  }
  selectedVideoFile = file;
  
  // Show selected file box
  document.getElementById('selectedFileName').textContent = file.name;
  document.getElementById('selectedFileSize').textContent = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
  document.getElementById('selectedFileBox').style.display = 'block';
  document.getElementById('dropZone').style.display = 'none';
  
  // Populate video title input as a helper if empty
  const titleInput = document.getElementById('videoTitle');
  if (!titleInput.value) {
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
    titleInput.value = nameWithoutExt.split(/[-_]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
}

// Render dynamic Tag pills
function renderTags() {
  const container = document.getElementById('tagInputContainer');
  const tagInput = document.getElementById('tagTextInput');
  
  container.querySelectorAll('.tag-pill').forEach(pill => pill.remove());
  
  currentTags.forEach((tag, idx) => {
    const pill = document.createElement('div');
    pill.className = 'tag-pill';
    pill.innerHTML = `
      <span>${tag}</span>
      <button type="button" class="tag-pill-remove" data-index="${idx}">
        <i data-lucide="x" style="width: 14px; height: 14px;"></i>
      </button>
    `;
    container.insertBefore(pill, tagInput);
  });

  container.querySelectorAll('.tag-pill-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-index'));
      currentTags.splice(idx, 1);
      renderTags();
    });
  });

  lucide.createIcons();
}

// Render added subtitle tracks
function renderSubtitles() {
  const container = document.getElementById('addedSubtitlesList');
  if (!container) return;

  container.innerHTML = '';
  
  currentSubtitles.forEach((sub, idx) => {
    const item = document.createElement('div');
    item.className = 'track-list-item';
    
    const nameText = sub.file ? sub.file.name : (sub.name || '[Preserved Subtitle File]');
    
    item.innerHTML = `
      <span style="color: #fff;"><strong style="color: var(--color-secondary);">${sub.languageLabel}:</strong> ${nameText}</span>
      <button type="button" class="btn-icon btn-remove-sub" data-index="${idx}" style="padding: 2px; background: none; border: none; cursor: pointer;" title="Remove Track">
        <i data-lucide="x" style="width: 14px; height: 14px; color: var(--color-danger);"></i>
      </button>
    `;
    container.appendChild(item);
  });

  container.querySelectorAll('.btn-remove-sub').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-index'));
      currentSubtitles.splice(idx, 1);
      renderSubtitles();
    });
  });

  lucide.createIcons();
}

// Render added voiceover audio tracks
function renderAudioTracks() {
  const container = document.getElementById('addedAudioList');
  if (!container) return;

  container.innerHTML = '';
  
  currentAudioTracks.forEach((track, idx) => {
    const item = document.createElement('div');
    item.className = 'track-list-item';
    
    const nameText = track.file ? track.file.name : (track.name || '[Preserved Audio File]');
    
    item.innerHTML = `
      <span style="color: #fff;"><strong style="color: var(--color-secondary);">${track.languageLabel}:</strong> ${nameText}</span>
      <button type="button" class="btn-icon btn-remove-audio" data-index="${idx}" style="padding: 2px; background: none; border: none; cursor: pointer;" title="Remove Audio Track">
        <i data-lucide="x" style="width: 14px; height: 14px; color: var(--color-danger);"></i>
      </button>
    `;
    container.appendChild(item);
  });

  container.querySelectorAll('.btn-remove-audio').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-index'));
      currentAudioTracks.splice(idx, 1);
      renderAudioTracks();
    });
  });

  lucide.createIcons();
}

// Video Thumbnail Generation using HTML5 Canvas & Video elements
function generateThumbnail(videoBlob) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    
    const objectURL = URL.createObjectURL(videoBlob);
    video.src = objectURL;
    
    let hasSeeked = false;
    const triggerSeek = () => {
      if (hasSeeked) return;
      hasSeeked = true;
      let seekTime = 1.5;
      if (video.duration && isFinite(video.duration) && video.duration > 0) {
        // Seek to 15% of duration or 2.0s, whichever is smaller, to bypass potential black intros
        seekTime = Math.min(2.0, video.duration * 0.15);
      }
      video.currentTime = seekTime;
    };

    video.onloadedmetadata = triggerSeek;
    video.onloadeddata = triggerSeek;

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        URL.revokeObjectURL(objectURL);
        resolve(dataUrl);
      } catch (err) {
        console.error('Failed to write frame to canvas', err);
        URL.revokeObjectURL(objectURL);
        resolve(null);
      }
    };

    video.onerror = (e) => {
      console.error('Video error loading thumbnail', e);
      URL.revokeObjectURL(objectURL);
      resolve(null);
    };
  });
}

// Handle video submission & DB saving
async function handleUploadSubmit(e) {
  e.preventDefault();

  if (!selectedVideoFile && !editingVideoId) {
    showToast('Please upload a video file first', 'error');
    return;
  }

  const titleInput = document.getElementById('videoTitle');
  const title = titleInput.value.trim();

  // Retrieve Project Name
  const projectSelect = document.getElementById('projectSelect');
  const selectedProject = projectSelect.value;

  if (!selectedProject) {
    showToast('Please select a project name', 'error');
    return;
  }

  // Retrieve custom field values
  const customDataValues = {};
  customFields.forEach(field => {
    const element = document.getElementsByName(field.id)[0];
    if (element) {
      customDataValues[field.id] = element.value.trim();
    }
  });

  // Show Progress
  const progressContainer = document.getElementById('uploadProgressContainer');
  const progressFill = document.getElementById('uploadProgressBar');
  const progressText = document.getElementById('progressText');
  const btnSubmit = document.getElementById('btnSubmitVideo');

  btnSubmit.disabled = true;
  progressContainer.style.display = 'block';
  progressFill.style.width = '10%';
  progressText.textContent = '10%';

  try {
    let thumbnailDataUrl = null;
    let videoFileToSave = null;
    let originalCreatedAt = Date.now();

    if (editingVideoId) {
      const videos = await getVideos();
      const existingVideo = videos.find(v => v.id === editingVideoId);
      if (existingVideo) {
        originalCreatedAt = existingVideo.createdAt;
        thumbnailDataUrl = currentThumbnailDataUrl;
      }
    }

    // 1. If user selected a new custom thumbnail image file, read it as DataURL
    if (selectedThumbnailFile) {
      progressFill.style.width = '30%';
      progressText.textContent = 'Reading Custom Thumbnail...';
      thumbnailDataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(selectedThumbnailFile);
      });
    }

    // 2. If editing and no new video is uploaded, preserve original video file
    if (editingVideoId && !selectedVideoFile) {
      const videos = await getVideos();
      const existingVideo = videos.find(v => v.id === editingVideoId);
      if (existingVideo) {
        videoFileToSave = existingVideo.videoFile;
      }
    } else if (selectedVideoFile) {
      videoFileToSave = selectedVideoFile;
      
      // 3. If no custom thumbnail was selected (neither new nor preserved), auto-generate it
      if (!thumbnailDataUrl) {
        progressFill.style.width = '50%';
        progressText.textContent = 'Generating Thumbnail...';
        thumbnailDataUrl = await generateThumbnail(selectedVideoFile);
      }
    }

    progressFill.style.width = '70%';
    progressText.textContent = 'Saving locally to Database...';

    // Format subtitle tracks
    const finalSubtitlesList = currentSubtitles.map(sub => ({
      languageCode: sub.languageCode,
      languageLabel: sub.languageLabel,
      file: sub.file || sub.existingFile,
      name: sub.name
    }));

    // Format audio translation tracks
    const finalAudioList = currentAudioTracks.map(track => ({
      languageCode: track.languageCode,
      languageLabel: track.languageLabel,
      file: track.file || track.existingFile,
      name: track.name
    }));

    const videoRecord = {
      id: editingVideoId || ('vid_' + Date.now()),
      name: title,
      projectName: selectedProject,
      tags: [...currentTags],
      videoFile: videoFileToSave,
      thumbnail: thumbnailDataUrl,
      customData: customDataValues,
      createdAt: originalCreatedAt,
      subtitles: finalSubtitlesList,
      audioTracks: finalAudioList
    };

    await addVideo(videoRecord);
    
    progressFill.style.width = '100%';
    progressText.textContent = 'Saved!';
    
    showToast(editingVideoId ? 'Video updated successfully!' : 'Video added successfully!', 'success');

    // Reset Forms
    setTimeout(() => {
      progressContainer.style.display = 'none';
      btnSubmit.disabled = false;
      resetUploadForm();
      refreshVideosCatalog();
    }, 800);

  } catch (err) {
    console.error(err);
    showToast('Failed to save video to database', 'error');
    btnSubmit.disabled = false;
    progressContainer.style.display = 'none';
  }
}

// Reset the entire upload state
function resetUploadForm() {
  document.getElementById('uploadVideoForm').reset();
  currentTags = [];
  currentSubtitles = [];
  currentAudioTracks = [];
  selectedVideoFile = null;
  selectedSubtitleFile = null;
  selectedAudioFile = null;
  selectedThumbnailFile = null;
  currentThumbnailDataUrl = null;
  editingVideoId = null;
  renderTags();
  renderSubtitles();
  renderAudioTracks();
  
  document.getElementById('selectedFileBox').style.display = 'none';
  document.getElementById('dropZone').style.display = 'flex';

  // Reset file browse labels
  document.getElementById('btnSelectSubtitleFile').innerHTML = '<i data-lucide="file-text" style="vertical-align: middle; margin-right: 5px;"></i> Choose VTT File...';
  document.getElementById('btnSelectAudioFile').innerHTML = '<i data-lucide="headphones" style="vertical-align: middle; margin-right: 5px;"></i> Choose Audio File...';
  document.getElementById('thumbnailFileInput').value = '';
  document.getElementById('btnSelectThumbnailFile').innerHTML = '<i data-lucide="image" style="vertical-align: middle; margin-right: 5px;"></i> Choose Custom Thumbnail...';
  document.getElementById('btnRemoveThumbnail').style.display = 'none';

  // Refresh projects dropdown
  refreshProjectsList();
  
  // Reset Action Buttons
  const btnSubmit = document.getElementById('btnSubmitVideo');
  btnSubmit.innerHTML = '<i data-lucide="upload"></i> Save Video to Portal';
  document.getElementById('btnCancelEdit').style.display = 'none';
  
  lucide.createIcons();
}

// Load values into form and enter edit mode
function startEditVideo(video) {
  editingVideoId = video.id;
  
  // Show cancel button and change submit text
  document.getElementById('btnCancelEdit').style.display = 'block';
  const btnSubmit = document.getElementById('btnSubmitVideo');
  btnSubmit.innerHTML = '<i data-lucide="save"></i> Update Video Details';
  lucide.createIcons();
  
  // Populate Title
  document.getElementById('videoTitle').value = video.name;

  // Populate Project
  const projectSelect = document.getElementById('projectSelect');
  projectSelect.value = video.projectName || '';

  // Populate Tags
  currentTags = [...video.tags];
  renderTags();

  // Populate Subtitles
  currentSubtitles = video.subtitles ? video.subtitles.map(sub => ({
    languageCode: sub.languageCode,
    languageLabel: sub.languageLabel,
    existingFile: sub.file,
    name: sub.name
  })) : [];
  renderSubtitles();

  // Populate Audio Tracks
  currentAudioTracks = video.audioTracks ? video.audioTracks.map(track => ({
    languageCode: track.languageCode,
    languageLabel: track.languageLabel,
    existingFile: track.file,
    name: track.name
  })) : [];
  renderAudioTracks();

  // Populate Custom dynamic fields
  customFields.forEach(field => {
    const element = document.getElementsByName(field.id)[0];
    if (element) {
      element.value = video.customData[field.id] || '';
    }
  });

  // Populate Custom Thumbnail
  selectedThumbnailFile = null;
  if (video.thumbnail) {
    currentThumbnailDataUrl = video.thumbnail;
    document.getElementById('btnSelectThumbnailFile').innerHTML = `<i data-lucide="image" style="vertical-align: middle; margin-right: 5px; color: var(--color-secondary);"></i> [Preserving Current Thumbnail]`;
    document.getElementById('btnRemoveThumbnail').style.display = 'flex';
  } else {
    currentThumbnailDataUrl = null;
    document.getElementById('btnSelectThumbnailFile').innerHTML = '<i data-lucide="image" style="vertical-align: middle; margin-right: 5px;"></i> Choose Custom Thumbnail...';
    document.getElementById('btnRemoveThumbnail').style.display = 'none';
  }
  lucide.createIcons();

  // Display message in Dropzone
  const dropZone = document.getElementById('dropZone');
  const selectedFileBox = document.getElementById('selectedFileBox');
  
  selectedVideoFile = null;
  
  document.getElementById('selectedFileName').textContent = `[Preserving Original File]`;
  document.getElementById('selectedFileSize').textContent = `Size: ${(video.videoFile.size / (1024 * 1024)).toFixed(1)} MB`;
  selectedFileBox.style.display = 'block';
  dropZone.style.display = 'none';

  // Scroll to form
  document.getElementById('uploadVideoForm').scrollIntoView({ behavior: 'smooth' });
}

// Refresh Catalog Manager list of videos
async function refreshVideosCatalog() {
  const container = document.getElementById('manageVideosList');
  if (!container) return;
  
  try {
    const videos = await getVideos();
    
    // Calculate global stats for videos
    let totalSize = 0;
    videos.forEach(v => {
      if (v.videoFile) {
        totalSize += v.videoFile.size;
      }
    });
    
    // Update metrics cards
    const metricTotalVideos = document.getElementById('metricTotalVideos');
    if (metricTotalVideos) {
      metricTotalVideos.textContent = videos.length;
    }
    const metricTotalSize = document.getElementById('metricTotalSize');
    if (metricTotalSize) {
      metricTotalSize.textContent = (totalSize / (1024 * 1024)).toFixed(1) + ' MB';
    }

    if (videos.length === 0) {
      container.innerHTML = `
        <div style="color: var(--text-muted); text-align: center; padding: 3rem;">
          <i data-lucide="folder-open" style="width: 40px; height: 40px; stroke-width: 1.5; margin-bottom: 0.5rem;"></i>
          <p>No uploaded videos in catalog. Fill the form above to add one.</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    // Sort videos newest first
    videos.sort((a, b) => b.createdAt - a.createdAt);

    // Apply Catalog Quick Search Filter
    const searchVal = document.getElementById('catalogSearchInput') ? document.getElementById('catalogSearchInput').value.toLowerCase().trim() : '';
    let filteredVideos = videos;
    if (searchVal) {
      filteredVideos = videos.filter(v => 
        v.name.toLowerCase().includes(searchVal) || 
        (v.projectName && v.projectName.toLowerCase().includes(searchVal)) || 
        v.tags.some(t => t.toLowerCase().includes(searchVal))
      );
    }

    if (filteredVideos.length === 0) {
      container.innerHTML = `
        <div style="color: var(--text-muted); text-align: center; padding: 2rem;">
          <i data-lucide="search-code" style="width: 32px; height: 32px; stroke-width: 1.5; margin-bottom: 0.5rem;"></i>
          <p>No catalog records match your query.</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    container.innerHTML = '';
    
    filteredVideos.forEach(video => {
      const item = document.createElement('div');
      item.className = 'manage-item';
      
      const thumbSrc = video.thumbnail || getVideoFallbackThumbnail(video.name, video.projectName);
      
      const metaStrings = [];
      customFields.forEach(cf => {
        const val = video.customData[cf.id];
        if (val) {
          metaStrings.push(`<strong>${cf.name}:</strong> ${val}`);
        }
      });

      const tagsString = video.tags.length ? `• Tags: ${video.tags.join(', ')}` : '';
      const projName = video.projectName || 'General';

      // Count languages tracks
      const subCount = video.subtitles ? video.subtitles.length : 0;
      const audioCount = video.audioTracks ? video.audioTracks.length : 0;
      
      let langBadges = '';
      if (subCount > 0) {
        langBadges += `<span class="tag-badge" style="background: rgba(124, 58, 237, 0.08); color: #c4b5fd; border-color: rgba(124, 58, 237, 0.15); margin-left: 0.25rem;"><i data-lucide="subtitles" style="width: 10px; height: 10px; vertical-align: middle; margin-right: 3px;"></i>${subCount} CC</span>`;
      }
      if (audioCount > 0) {
        langBadges += `<span class="tag-badge" style="background: rgba(155, 28, 58, 0.08); color: #fda4af; border-color: rgba(155, 28, 58, 0.15); margin-left: 0.25rem;"><i data-lucide="headphones" style="width: 10px; height: 10px; vertical-align: middle; margin-right: 3px;"></i>${audioCount} Audio</span>`;
      }

      item.innerHTML = `
        <img class="manage-thumb" src="${thumbSrc}" alt="thumbnail">
        <div class="manage-details">
          <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
            <div class="manage-title" style="margin-right: 0.25rem;">${video.name}</div>
            <span class="tag-badge" style="background: rgba(6, 182, 212, 0.1); color: #22d3ee; border-color: rgba(6, 182, 212, 0.2);">${projName}</span>
            ${langBadges}
          </div>
          <div class="manage-meta">
            <span>Size: ${video.videoFile ? (video.videoFile.size / (1024 * 1024)).toFixed(1) : 0} MB</span>
            <span>${tagsString}</span>
            <span>${metaStrings.join(' | ')}</span>
          </div>
        </div>
        <div class="manage-actions">
          <button class="btn-icon btn-edit-video" data-id="${video.id}" title="Edit Video Details" style="margin-right: 0.25rem; background: none; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;">
            <i data-lucide="edit-3" style="width: 16px; height: 16px; color: var(--color-secondary);"></i>
          </button>
          <button class="btn-icon btn-delete-video" data-id="${video.id}" title="Delete Video" style="background: none; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;">
            <i data-lucide="trash-2" style="width: 16px; height: 16px; color: var(--color-danger);"></i>
          </button>
        </div>
      `;
      container.appendChild(item);
    });

    // Edit Video button actions
    container.querySelectorAll('.btn-edit-video').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const video = videos.find(v => v.id === id);
        if (video) {
          startEditVideo(video);
        }
      });
    });

    // Delete Video button actions
    container.querySelectorAll('.btn-delete-video').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm('Are you sure you want to delete this video from local storage?')) {
          try {
            await deleteVideo(id);
            showToast('Video deleted', 'info');
            refreshVideosCatalog();
            if (editingVideoId === id) {
              resetUploadForm();
            }
          } catch (err) {
            showToast('Failed to delete video', 'error');
          }
        }
      });
    });

    lucide.createIcons();

  } catch (err) {
    showToast('Failed to load videos catalog', 'error');
  }
}

// Toast Notifier utility
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle';
  if (type === 'error') iconName = 'alert-triangle';
  
  toast.innerHTML = `
    <i data-lucide="${iconName}"></i>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  lucide.createIcons();
  
  // Transition
  setTimeout(() => toast.classList.add('show'), 50);
  
  // Dismiss
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
