// Gallery Portal Logic
let allVideos = [];
let customFields = [];
let activeTagFilter = 'all';
let activeProjectFilter = '';
let activeCustomFilters = {}; // Map of fieldId -> selectedValue
let currentSearchQuery = '';
let videoOrder = []; // Persisted drag-sort order (array of video IDs)
let featuredCarouselInterval = null;
let featuredVideosList = [];
let selectedThumbnailFile = null;
let currentThumbnailDataUrl = null;

// Admin variables (migrated from admin.js)
let projectsList = [];
let selectedVideoFile = null;
let currentTags = [];
let editingVideoId = null;
let currentSubtitles = []; // Holds { languageCode, languageLabel, file, existingFile, name }
let selectedSubtitleFile = null;
let currentAudioTracks = []; // Holds { languageCode, languageLabel, file, existingFile, name }
let selectedAudioFile = null;

const LANG_MAP = {
  en: 'English',
  te: 'Telugu',
  hi: 'Hindi',
  ta: 'Tamil',
  es: 'Spanish',
  fr: 'French'
};

// Custom Video Player Variables
let videoPlayer = null;
let playPauseBtn = null;
let playIcon = null;
let skipBackBtn = null;
let skipForwardBtn = null;
let muteBtn = null;
let volumeIcon = null;
let volumeSlider = null;
let timelineSlider = null;
let timelineProgress = null;
let currentTimeSpan = null;
let durationTimeSpan = null;
let speedBtn = null;
let fullscreenBtn = null;
let videoPlayerContainer = null;

let currentSpeedIndex = 0;
const speedOptions = [1.0, 1.25, 1.5, 2.0, 0.5];
let activeSubtitleUrls = [];
let activeAudioElement = null;
let activeAudioUrls = [];

// Initialize Page
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Lucide Icons
  lucide.createIcons();

  // Load Data
  try {
    allVideos = await getVideos();
    customFields = await getCustomFields();
    videoOrder = await getVideoOrder();

    // Apply saved order, then fall back to newest-first for unsorted videos
    applyVideoOrder();

    // Setup Custom Dynamic Filters and Tag Chips
    await populateProjectFilterDropdown();
    renderDynamicFilters();
    renderTagChips();

    // Render Gallery
    filterAndRenderVideos();

    // Handle URL parameters for direct linking
    handleUrlParams();
  } catch (err) {
    console.error(err);
    showToast('Error loading video assets', 'error');
  }

  // Setup Event Listeners
  setupGalleryListeners();
  setupPlayerControls();
  setupAdminListeners();

  // Update UI based on initial admin login state
  updateAdminUi();
});

// Setup General Gallery Event Listeners
function setupGalleryListeners() {
  // Support both the old in-page search and the new header search input
  const searchInput = document.getElementById('searchInput');
  const projectFilterSelect = document.getElementById('projectFilterSelect');
  const btnCopyProjectLink = document.getElementById('btnCopyProjectLink');

  // Search Input Listener – works for any element with id="searchInput"
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value.toLowerCase().trim();
      filterAndRenderVideos();
    });
  }

  // Project Filter Listener
  if (projectFilterSelect) {
    projectFilterSelect.addEventListener('change', (e) => {
      activeProjectFilter = e.target.value;
      if (activeProjectFilter) {
        btnCopyProjectLink.removeAttribute('disabled');
      } else {
        btnCopyProjectLink.setAttribute('disabled', 'true');
      }
      filterAndRenderVideos();
    });
  }

  // Copy Project Link click listener
  if (btnCopyProjectLink) {
    btnCopyProjectLink.addEventListener('click', () => {
      if (!activeProjectFilter) return;
      const projectUrl = `${window.location.origin}${window.location.pathname}?project=${encodeURIComponent(activeProjectFilter)}`;
      navigator.clipboard.writeText(projectUrl)
        .then(() => showToast(`Link copied for project: ${activeProjectFilter}`, 'success'))
        .catch(() => showToast('Failed to copy link', 'error'));
    });
  }

  // Scroll Featured Showcase Left/Right
  const btnScrollLeft = document.getElementById('btnFeaturedScrollLeft');
  const btnScrollRight = document.getElementById('btnFeaturedScrollRight');
  const scrollContainer = document.getElementById('featuredScrollContainer');

  if (btnScrollLeft && btnScrollRight && scrollContainer) {
    btnScrollLeft.addEventListener('click', () => scrollCarousel('prev'));
    btnScrollRight.addEventListener('click', () => scrollCarousel('next'));
  }

  // Hover play pause for Autoplay
  const featuredShowcase = document.getElementById('featuredShowcase');
  if (featuredShowcase) {
    featuredShowcase.addEventListener('mouseenter', () => {
      stopFeaturedCarouselAutoplay();
    });
    featuredShowcase.addEventListener('mouseleave', () => {
      startFeaturedCarouselAutoplay(featuredVideosList);
    });
  }

  // Back to Gallery Button
  document.getElementById('btnBackToGallery').addEventListener('click', () => {
    // Stop video playback and revoke URL
    if (videoPlayer) {
      videoPlayer.pause();
      if (videoPlayer.src) {
        URL.revokeObjectURL(videoPlayer.src);
        videoPlayer.removeAttribute('src');
        videoPlayer.load();
      }

      // Clean up subtitle tracks and revoke object URLs
      const tracks = videoPlayer.querySelectorAll('track');
      tracks.forEach(track => track.remove());
      activeSubtitleUrls.forEach(url => URL.revokeObjectURL(url));
      activeSubtitleUrls = [];

      // Clean up translation audio voiceovers
      if (activeAudioElement) {
        activeAudioElement.pause();
        activeAudioElement.remove();
        activeAudioElement = null;
      }
      activeAudioUrls.forEach(url => URL.revokeObjectURL(url));
      activeAudioUrls = [];
    }

    // Switch views
    document.getElementById('detailsView').style.display = 'none';
    document.getElementById('galleryView').style.display = 'block';

    // Reset query parameters in browser URL when back is pressed
    window.history.pushState({}, document.title, window.location.pathname);

    // Refresh video catalog in case database was updated
    refreshVideoData();
  });
}

// Populate the Project Selection Filter Dropdown
async function populateProjectFilterDropdown() {
  const select = document.getElementById('projectFilterSelect');
  const btnCopyProjectLink = document.getElementById('btnCopyProjectLink');
  if (!select) return;

  const currentSelection = select.value;
  select.innerHTML = '<option value="">All Projects</option>';

  // Gather created projects from DB
  let projectsFromDb = [];
  try {
    projectsFromDb = await getProjects();
  } catch (e) {
    console.error(e);
  }

  // Gather unique project names from uploaded videos
  const uniqueVideoProjects = allVideos
    .map(v => v.projectName)
    .filter(proj => proj !== undefined && proj !== '');

  // Combine both sets
  const allProjects = [...new Set([...projectsFromDb, ...uniqueVideoProjects])];

  allProjects.forEach(proj => {
    const opt = document.createElement('option');
    opt.value = proj;
    opt.textContent = proj;
    select.appendChild(opt);
  });

  // Restore selection if it still exists
  if (allProjects.includes(currentSelection)) {
    select.value = currentSelection;
    if (btnCopyProjectLink) btnCopyProjectLink.removeAttribute('disabled');
  } else {
    activeProjectFilter = '';
    if (btnCopyProjectLink) btnCopyProjectLink.setAttribute('disabled', 'true');
  }
}

// Direct linking via URL search queries
function handleUrlParams() {
  const params = new URLSearchParams(window.location.search);

  // 1. Direct project filter link
  if (params.has('project')) {
    const projectVal = params.get('project');
    const select = document.getElementById('projectFilterSelect');
    const btnCopyProjectLink = document.getElementById('btnCopyProjectLink');
    if (select) {
      // Check if option exists in dropdown
      let optionExists = false;
      for (let i = 0; i < select.options.length; i++) {
        if (select.options[i].value === projectVal) {
          optionExists = true;
          break;
        }
      }

      // If it doesn't exist, append it temporarily (handles dynamic values)
      if (!optionExists) {
        const opt = document.createElement('option');
        opt.value = projectVal;
        opt.textContent = projectVal;
        select.appendChild(opt);
      }

      select.value = projectVal;
      activeProjectFilter = projectVal;
      if (btnCopyProjectLink) btnCopyProjectLink.removeAttribute('disabled');
      filterAndRenderVideos();
    }
  }

  // 2. Direct Video play link (takes visual priority)
  if (params.has('video')) {
    const videoId = params.get('video');
    const video = allVideos.find(v => v.id === videoId);
    if (video) {
      openVideoDetails(video);
    }
  }

  // 3. Admin redirect link
  if (params.has('admin')) {
    const isAdmin = sessionStorage.getItem('isAdmin') === 'true';
    if (!isAdmin) {
      document.getElementById('loginModal').style.display = 'flex';
      document.getElementById('loginPassword').focus();
    }
  }
}

// Apply the persisted drag-sort order to allVideos
function applyVideoOrder() {
  if (videoOrder.length === 0) {
    // No saved order — default newest first
    allVideos.sort((a, b) => b.createdAt - a.createdAt);
    return;
  }
  allVideos.sort((a, b) => {
    const ia = videoOrder.indexOf(a.id);
    const ib = videoOrder.indexOf(b.id);
    // Items not in order array go to end, sorted newest first
    if (ia === -1 && ib === -1) return b.createdAt - a.createdAt;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

// Reload fresh database data
async function refreshVideoData() {
  try {
    allVideos = await getVideos();
    customFields = await getCustomFields();
    videoOrder = await getVideoOrder();
    applyVideoOrder();

    await populateProjectFilterDropdown();
    renderDynamicFilters();
    renderTagChips();
    filterAndRenderVideos();
  } catch (err) {
    console.error(err);
  }
}

// Generate dropdown selects for custom columns
function renderDynamicFilters() {
  const container = document.getElementById('dynamicFiltersContainer');
  if (!container) return;
  container.innerHTML = '';

  if (customFields.length === 0) return;

  customFields.forEach(field => {
    // Find unique values for this custom field across all uploaded videos
    const uniqueValues = [...new Set(
      allVideos
        .map(v => v.customData[field.id])
        .filter(val => val !== undefined && val !== '')
    )];

    if (uniqueValues.length === 0) return; // Skip filter if no videos have data for it

    const select = document.createElement('select');
    select.className = 'filter-select';
    select.id = `filter_${field.id}`;

    // Default "All" option
    const allOpt = document.createElement('option');
    allOpt.value = '';
    allOpt.textContent = `All ${field.name}s`;
    select.appendChild(allOpt);

    uniqueValues.forEach(val => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      select.appendChild(opt);
    });

    // Add change event listener
    select.addEventListener('change', (e) => {
      const selectedValue = e.target.value;
      if (selectedValue === '') {
        delete activeCustomFilters[field.id];
      } else {
        activeCustomFilters[field.id] = selectedValue;
      }
      filterAndRenderVideos();
    });

    container.appendChild(select);
  });
}

// Compile all tags and render as quick-filters
function renderTagChips() {
  const container = document.getElementById('tagChipsContainer');
  if (!container) return;

  // Collect all unique tags
  const tagsSet = new Set();
  allVideos.forEach(v => {
    if (v.tags) {
      v.tags.forEach(t => tagsSet.add(t));
    }
  });

  // Clear all except the first "All Videos" chip
  container.innerHTML = `<button class="chip active" data-tag="all">All Videos</button>`;

  tagsSet.forEach(tag => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.setAttribute('data-tag', tag);
    btn.textContent = tag;
    container.appendChild(btn);
  });

  // Add click listeners to tags
  container.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeTagFilter = chip.getAttribute('data-tag');
      filterAndRenderVideos();
    });
  });
}

// Main query search & filter routing
function filterAndRenderVideos() {
  const grid = document.getElementById('videoGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const isAdmin = sessionStorage.getItem('isAdmin') === 'true';

  const filtered = allVideos.filter(video => {
    // 1. Search Query filter (matches title or tags)
    const matchesSearch = currentSearchQuery === '' ||
      video.name.toLowerCase().includes(currentSearchQuery) ||
      video.tags.some(tag => tag.toLowerCase().includes(currentSearchQuery));

    // 2. Tag Chip filter
    const matchesTag = activeTagFilter === 'all' ||
      video.tags.includes(activeTagFilter);

    // 3. Project Filter
    const matchesProject = activeProjectFilter === '' ||
      video.projectName === activeProjectFilter;

    // 4. Custom Metadata dropdown filters
    let matchesCustom = true;
    for (const [fieldId, selectedVal] of Object.entries(activeCustomFilters)) {
      if (video.customData[fieldId] !== selectedVal) {
        matchesCustom = false;
        break;
      }
    }

    return matchesSearch && matchesTag && matchesProject && matchesCustom;
  });

  if (filtered.length === 0) {
    const featuredShowcase = document.getElementById('featuredShowcase');
    if (featuredShowcase) featuredShowcase.style.display = 'none';
    grid.innerHTML = `
      <div class="empty-state">
        <i data-lucide="video-off"></i>
        <h3>No matching videos found</h3>
        <p>Try clearing your search filters or unlock Admin console to upload a new video.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  // Render featured carousel at the top
  renderFeaturedCarousel(filtered);

  // Render cards
  filtered.forEach(video => {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.setAttribute('data-id', video.id);

    const thumbSrc = video.thumbnail || getVideoFallbackThumbnail(video.name, video.projectName);

    // Tag badges
    const tagBadges = video.tags.map(tag => `<span class="tag-badge">${tag}</span>`).slice(0, 3).join('');
    const projName = video.projectName || 'General';

    // Dynamically render custom metadata attributes
    let metadataHtml = '';
    let count = 0;
    for (const field of customFields) {
      if (count >= 2) break; // Display only first 2 metadata fields on card to avoid clutter
      const val = video.customData[field.id];
      if (val) {
        metadataHtml += `
          <div class="meta-item">
            <span class="meta-label">${field.name}</span>
            <span class="meta-value" title="${val}">${val}</span>
          </div>
        `;
        count++;
      }
    }

    card.innerHTML = `
      <div class="thumbnail-container">
        <img class="video-thumbnail" src="${thumbSrc}" alt="video thumbnail">
        <video class="hover-preview-video" muted loop playsinline></video>
        <div class="play-overlay">
          <div class="play-button-circle">
            <i data-lucide="play"></i>
          </div>
        </div>
        ${isAdmin ? `
          <div class="card-admin-actions" style="position: absolute; top: 0.75rem; right: 0.75rem; display: flex; gap: 0.5rem; z-index: 5;">
            <button class="btn-edit-card" data-id="${video.id}" title="Edit Video">
              <i data-lucide="edit-3" style="width: 15px; height: 15px;"></i>
            </button>
            <button class="btn-delete-card" data-id="${video.id}" title="Delete Video">
              <i data-lucide="trash-2" style="width: 15px; height: 15px;"></i>
            </button>
          </div>
        ` : ''}
      </div>
      <div class="card-content">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
          <span class="tag-badge" style="background: rgba(6, 182, 212, 0.1); color: #22d3ee; border-color: rgba(6, 182, 212, 0.2); font-size: 0.7rem; font-weight: 700;">${projName}</span>
        </div>
        <h3 class="card-title" title="${video.name}" style="margin-top: 0.25rem;">${video.name}</h3>
        <div class="card-tags">
          ${tagBadges}
        </div>
        ${metadataHtml ? `<div class="card-metadata">${metadataHtml}</div>` : ''}
      </div>
    `;

    // Hover Preview Logic
    let hoverTimeout = null;
    let previewObjectUrl = null;
    const previewVideoElement = card.querySelector('.hover-preview-video');
    const thumbnailImg = card.querySelector('.video-thumbnail');

    card.addEventListener('mouseenter', () => {
      hoverTimeout = setTimeout(() => {
        if (!video.videoFile) return;
        if (video.videoFile instanceof Blob || video.videoFile instanceof File) {
          previewObjectUrl = URL.createObjectURL(video.videoFile);
          previewVideoElement.src = previewObjectUrl;
        } else {
          previewVideoElement.src = video.videoFile;
        }
        previewVideoElement.style.display = 'block';
        if (thumbnailImg) thumbnailImg.style.opacity = '0';
        
        previewVideoElement.addEventListener('loadedmetadata', () => {
          // Seek to 15% of video duration (max 2s) to skip initial black intros
          let seekTime = 1.5;
          if (previewVideoElement.duration && isFinite(previewVideoElement.duration) && previewVideoElement.duration > 0) {
            seekTime = Math.min(2.0, previewVideoElement.duration * 0.15);
          }
          previewVideoElement.currentTime = seekTime;
        }, { once: true });

        previewVideoElement.play().catch(err => console.log('Preview block: ', err));
      }, 400); // 400ms delay to prevent play spamming on fast sweeps
    });

    card.addEventListener('mouseleave', () => {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        hoverTimeout = null;
      }
      previewVideoElement.pause();
      previewVideoElement.src = '';
      previewVideoElement.load();
      previewVideoElement.style.display = 'none';
      if (thumbnailImg) thumbnailImg.style.opacity = '1';
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = null;
      }
    });

    // Click handler to launch media details screen
    card.addEventListener('click', (e) => {
      // Don't open if clicked an admin action button
      if (e.target.closest('.card-admin-actions')) {
        return;
      }
      openVideoDetails(video);
    });

    // Wire edit/delete triggers
    if (isAdmin) {
      const editBtn = card.querySelector('.btn-edit-card');
      const deleteBtn = card.querySelector('.btn-delete-card');

      editBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        startEditVideo(video);
      });

      deleteBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        if (confirm(`Are you sure you want to delete "${video.name}"?`)) {
          try {
            await deleteVideo(video.id);
            showToast('Video deleted successfully', 'success');
            await refreshVideoData();
          } catch (err) {
            console.error(err);
            showToast('Failed to delete video', 'error');
          }
        }
      });
    }

    grid.appendChild(card);
  });

  lucide.createIcons();

  // Enable drag-and-drop reordering for admin
  if (isAdmin) {
    setupDragAndDrop(grid, filtered);
  }
}

// Drag-and-drop reorder logic (admin only)
function setupDragAndDrop(grid, visibleVideos) {
  let dragSrcId = null;
  let dragSrcEl = null;

  const cards = Array.from(grid.querySelectorAll('.video-card'));

  cards.forEach(card => {
    card.setAttribute('draggable', 'true');

    card.addEventListener('dragstart', (e) => {
      dragSrcId = card.getAttribute('data-id');
      dragSrcEl = card;
      card.classList.add('card-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragSrcId);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('card-dragging');
      grid.querySelectorAll('.video-card').forEach(c => c.classList.remove('card-drag-over'));
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      // Only highlight if this is a different card
      if (card !== dragSrcEl) {
        grid.querySelectorAll('.video-card').forEach(c => c.classList.remove('card-drag-over'));
        card.classList.add('card-drag-over');
      }
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('card-drag-over');
    });

    card.addEventListener('drop', async (e) => {
      e.preventDefault();
      card.classList.remove('card-drag-over');

      const targetId = card.getAttribute('data-id');
      if (!dragSrcId || dragSrcId === targetId) return;

      // Reorder allVideos in memory
      const srcIdx = allVideos.findIndex(v => v.id === dragSrcId);
      const tgtIdx = allVideos.findIndex(v => v.id === targetId);
      if (srcIdx === -1 || tgtIdx === -1) return;

      // Splice src out and insert before/after target
      const [moved] = allVideos.splice(srcIdx, 1);
      const newTgtIdx = allVideos.findIndex(v => v.id === targetId);
      allVideos.splice(newTgtIdx, 0, moved);

      // Persist new order
      videoOrder = allVideos.map(v => v.id);
      try {
        await saveVideoOrder(videoOrder);
      } catch (err) {
        console.error('Failed to save order', err);
      }

      // Re-render gallery without changing filters
      filterAndRenderVideos();
      showToast('Video order updated!', 'success');
    });
  });
}

// Render the Netflix-style Featured Carousel at the top
function renderFeaturedCarousel(videos) {
  const container = document.getElementById('featuredShowcase');
  const scrollContainer = document.getElementById('featuredScrollContainer');
  if (!container || !scrollContainer) return;

  if (videos.length === 0) {
    container.style.display = 'none';
    return;
  }

  // Show the container
  container.style.display = 'block';

  // We keep track of the selected active card. By default, it's the first video.
  // If we rebuild the carousel, we preserve which video is active.
  // Let's make sure the active video actually exists in the current filtered list.
  let activeId = scrollContainer.getAttribute('data-active-id') || (videos[0] ? videos[0].id : null);
  if (!videos.some(v => v.id === activeId)) {
    activeId = videos[0] ? videos[0].id : null;
  }

  function handleTransitionToFirst() {
    stopFeaturedCarouselAutoplay();
    const cloneCard = scrollContainer.querySelector('.featured-card[data-clone="true"]');
    if (cloneCard) {
      scrollContainer.scrollTo({
        left: cloneCard.offsetLeft - scrollContainer.offsetLeft - 10,
        behavior: 'smooth'
      });
    }
    setTimeout(() => {
      activeId = videos[0].id;
      scrollContainer.style.scrollBehavior = 'auto';
      rebuildCarousel(activeId);
      scrollContainer.scrollLeft = 0;
      scrollContainer.style.scrollBehavior = '';
      startFeaturedCarouselAutoplay(videos);
    }, 600);
  }

  function rebuildCarousel(activeVideoId) {
    if (!activeVideoId) {
      container.style.display = 'none';
      return;
    }
    scrollContainer.setAttribute('data-active-id', activeVideoId);
    scrollContainer.innerHTML = '';
    
    videos.forEach((video) => {
      const card = document.createElement('div');
      const isExpanded = video.id === activeVideoId;
      card.className = `featured-card ${isExpanded ? 'expanded' : 'vertical'}`;
      card.setAttribute('data-id', video.id);

      const thumbSrc = video.thumbnail || getVideoFallbackThumbnail(video.name, video.projectName);
      const projName = video.projectName || 'General';

      // Card Background Image
      const bg = document.createElement('div');
      bg.className = 'featured-card-bg';
      bg.style.backgroundImage = `url('${thumbSrc}')`;

      const previewVid = document.createElement('video');
      previewVid.className = 'hover-preview-video';
      previewVid.muted = true;
      previewVid.loop = true;
      previewVid.playsInline = true;
      previewVid.style.cssText = 'display: none; position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 1; pointer-events: none; border-radius: inherit;';
      bg.appendChild(previewVid);

      card.appendChild(bg);

      // Card Overlay Gradient
      const overlay = document.createElement('div');
      overlay.className = 'featured-card-overlay';
      card.appendChild(overlay);

      // Hover Preview Logic for Featured Card
      let hoverTimeout = null;
      let previewObjectUrl = null;

      card.addEventListener('mouseenter', () => {
        hoverTimeout = setTimeout(() => {
          if (!video.videoFile) return;
          if (video.videoFile instanceof Blob || video.videoFile instanceof File) {
            previewObjectUrl = URL.createObjectURL(video.videoFile);
            previewVid.src = previewObjectUrl;
          } else {
            previewVid.src = video.videoFile;
          }
          previewVid.style.display = 'block';
          
          previewVid.addEventListener('loadedmetadata', () => {
            // Seek to 15% of video duration (max 2s) to bypass initial black intros
            let seekTime = 1.5;
            if (previewVid.duration && isFinite(previewVid.duration) && previewVid.duration > 0) {
              seekTime = Math.min(2.0, previewVid.duration * 0.15);
            }
            previewVid.currentTime = seekTime;
          }, { once: true });

          previewVid.play().catch(err => console.log('Featured preview block: ', err));
        }, 400); // 400ms delay
      });

      card.addEventListener('mouseleave', () => {
        if (hoverTimeout) {
          clearTimeout(hoverTimeout);
          hoverTimeout = null;
        }
        previewVid.pause();
        previewVid.src = '';
        previewVid.load();
        previewVid.style.display = 'none';
        if (previewObjectUrl) {
          URL.revokeObjectURL(previewObjectUrl);
          previewObjectUrl = null;
        }
      });

      if (isExpanded) {
        // Expanded layout
        const content = document.createElement('div');
        content.className = 'featured-expanded-content';

        // Tag Badges
        const tagBadges = video.tags.map(tag => `<span class="tag-badge" style="background:rgba(255,255,255,0.06); border-color:rgba(255,255,255,0.15); color:#fff; font-size:0.68rem;">${tag}</span>`).slice(0, 3).join('');
        
        // Metadata description
        let metadataText = '';
        if (video.customData) {
          // Look for any description custom field
          let descField = Object.keys(video.customData).find(k => k.toLowerCase().includes('desc') || k.toLowerCase().includes('summary') || k.toLowerCase().includes('about'));
          if (descField && video.customData[descField]) {
            metadataText = video.customData[descField];
          }
        }
        if (!metadataText) {
          metadataText = '';
        }

        // Calculate a match percentage from the video title hash to make it look dynamic like Netflix!
        let hash = 0;
        for (let i = 0; i < video.name.length; i++) {
          hash = video.name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const matchPct = 85 + (Math.abs(hash) % 15);

        content.innerHTML = `
          <div class="featured-project-badge">${projName}</div>
          <h2 class="featured-title" title="${video.name}">${video.name}</h2>
          <div class="featured-meta-row">
            <span class="featured-match">${matchPct}% Match</span>
            <span>${new Date(video.createdAt).getFullYear()}</span>
            <span class="tag-badge" style="background: rgba(245,200,66,0.1); color: var(--color-secondary); border-color: rgba(245,200,66,0.25);">Full HD</span>
          </div>
          ${metadataText ? `<p class="featured-desc">${metadataText}</p>` : ''}
          <div class="card-tags" style="margin-bottom: 0.25rem; display: flex; gap: 0.4rem;">
            ${tagBadges}
          </div>
          <div class="featured-actions">
            <button class="btn-featured-play" id="btnHeroPlay">
              <i data-lucide="play" style="width:16px; height:16px; fill: currentColor;"></i> Play Now
            </button>
            <button class="btn-featured-info" id="btnHeroInfo">
              <i data-lucide="info" style="width:16px; height:16px;"></i> More Info
            </button>
          </div>
        `;

        // Click listeners inside expanded card
        content.querySelector('#btnHeroPlay').addEventListener('click', (e) => {
          e.stopPropagation();
          openVideoDetails(video);
        });
        content.querySelector('#btnHeroInfo').addEventListener('click', (e) => {
          e.stopPropagation();
          openVideoDetails(video);
        });

        card.appendChild(content);
      } else {
        // Vertical poster layout
        const content = document.createElement('div');
        content.className = 'featured-vertical-content';
        content.innerHTML = `
          <div class="featured-project-badge" style="font-size:0.6rem; padding: 0.15rem 0.5rem; border-radius: 99px;">${projName}</div>
          <h3 class="featured-vertical-title" title="${video.name}">${video.name}</h3>
        `;
        card.appendChild(content);

        // Click handler to select and expand this card
        card.addEventListener('click', () => {
          if (video.id === activeId) return;

          stopFeaturedCarouselAutoplay();

          // Check if we are on the last card, and clicking the first card
          const currentIndex = videos.findIndex(v => v.id === activeId);
          if (currentIndex === videos.length - 1 && video.id === videos[0].id) {
            handleTransitionToFirst();
            return;
          }

          // Normal click transition: rebuild carousel immediately, then scroll smoothly
          activeId = video.id;
          rebuildCarousel(activeId);

          setTimeout(() => {
            const activeCard = scrollContainer.querySelector(`.featured-card[data-id="${video.id}"]:not([data-clone="true"])`);
            if (activeCard) {
              scrollContainer.scrollTo({
                left: activeCard.offsetLeft - scrollContainer.offsetLeft - 10,
                behavior: 'smooth'
              });
            }
            startFeaturedCarouselAutoplay(videos);
          }, 50);
        });
      }

      scrollContainer.appendChild(card);
    });

    // Append clone of the first card at the end of the scroll container
    if (videos.length > 1) {
      const firstVideo = videos[0];
      const cloneCard = document.createElement('div');
      cloneCard.className = 'featured-card vertical';
      cloneCard.setAttribute('data-id', firstVideo.id);
      cloneCard.setAttribute('data-clone', 'true');
      
      const thumbSrc = firstVideo.thumbnail || getVideoFallbackThumbnail(firstVideo.name, firstVideo.projectName);
      const projName = firstVideo.projectName || 'General';
      
      const bg = document.createElement('div');
      bg.className = 'featured-card-bg';
      bg.style.backgroundImage = `url('${thumbSrc}')`;
      cloneCard.appendChild(bg);
      
      const overlay = document.createElement('div');
      overlay.className = 'featured-card-overlay';
      cloneCard.appendChild(overlay);
      
      const content = document.createElement('div');
      content.className = 'featured-vertical-content';
      content.innerHTML = `
        <div class="featured-project-badge" style="font-size:0.6rem; padding: 0.15rem 0.5rem; border-radius: 99px;">${projName}</div>
        <h3 class="featured-vertical-title" title="${firstVideo.name}">${firstVideo.name}</h3>
      `;
      cloneCard.appendChild(content);
      
      cloneCard.addEventListener('click', () => {
        handleTransitionToFirst();
      });
      
      scrollContainer.appendChild(cloneCard);
    }

    lucide.createIcons();
  }

  rebuildCarousel(activeId);
  featuredVideosList = videos;
  startFeaturedCarouselAutoplay(videos);
}

// Helper to scroll the carousel one-by-one
function scrollCarousel(direction) {
  const scrollContainer = document.getElementById('featuredScrollContainer');
  if (!scrollContainer) return;

  const cards = Array.from(scrollContainer.querySelectorAll('.featured-card'));
  if (cards.length === 0) return;

  const containerLeft = scrollContainer.scrollLeft;

  // Find the index of the card that is currently aligned or closest to the left side
  let currentIndex = 0;
  for (let i = 0; i < cards.length; i++) {
    // Offset relative to scrollContainer parent
    const cardOffsetLeft = cards[i].offsetLeft - scrollContainer.offsetLeft;
    if (cardOffsetLeft >= containerLeft - 20) {
      currentIndex = i;
      break;
    }
  }

  let targetIndex = currentIndex;
  if (direction === 'next') {
    targetIndex = (currentIndex + 1) % cards.length;
  } else {
    const currentCardLeft = cards[currentIndex].offsetLeft - scrollContainer.offsetLeft;
    if (containerLeft - currentCardLeft > 20) {
      targetIndex = currentIndex;
    } else {
      targetIndex = currentIndex - 1;
      if (targetIndex < 0) {
        targetIndex = cards.length - 1;
      }
    }
  }

  const targetCard = cards[targetIndex];
  if (targetCard) {
    scrollContainer.scrollTo({
      left: targetCard.offsetLeft - scrollContainer.offsetLeft - 10,
      behavior: 'smooth'
    });
  }
}

// Autoplay control functions for featured carousel
function startFeaturedCarouselAutoplay(videos) {
  stopFeaturedCarouselAutoplay();
  if (!videos || videos.length <= 1) return;

  featuredCarouselInterval = setInterval(() => {
    const scrollContainer = document.getElementById('featuredScrollContainer');
    if (!scrollContainer) return;

    const activeId = scrollContainer.getAttribute('data-active-id');
    const currentIndex = videos.findIndex(v => v.id === activeId);
    if (currentIndex === -1) return;

    const nextIndex = (currentIndex + 1) % videos.length;
    
    if (nextIndex === 0) {
      // Transition from last card to the clone card at the end
      const cloneCard = scrollContainer.querySelector('.featured-card[data-clone="true"]');
      if (cloneCard) {
        cloneCard.click();
      }
    } else {
      const nextVideo = videos[nextIndex];
      const nextCard = scrollContainer.querySelector(`.featured-card[data-id="${nextVideo.id}"]:not([data-clone="true"])`);
      if (nextCard) {
        nextCard.click();
      }
    }
  }, 5000); // Transition every 5 seconds
}

function stopFeaturedCarouselAutoplay() {
  if (featuredCarouselInterval) {
    clearInterval(featuredCarouselInterval);
    featuredCarouselInterval = null;
  }
}

// Transition & play the selected video file
function openVideoDetails(video) {
  stopFeaturedCarouselAutoplay();
  document.getElementById('galleryView').style.display = 'none';
  document.getElementById('detailsView').style.display = 'block';

  // Load title & tags in player info card
  document.getElementById('playerVideoTitle').textContent = video.name;

  const tagsContainer = document.getElementById('playerVideoTags');
  tagsContainer.innerHTML = '';
  video.tags.forEach(tag => {
    const badge = document.createElement('span');
    badge.className = 'tag-badge';
    badge.style.fontSize = '0.8rem';
    badge.textContent = tag;
    tagsContainer.appendChild(badge);
  });

  // Load custom attributes list in info panel
  const customFieldsGrid = document.getElementById('playerCustomFields');
  customFieldsGrid.innerHTML = '';

  // 1. Prepend Project Name metadata item
  const projName = video.projectName || 'General';
  const projectCard = document.createElement('div');
  projectCard.className = 'metadata-card';
  projectCard.innerHTML = `
    <span class="metadata-name">Project Name</span>
    <span class="metadata-value-large" style="color: #22d3ee;">${projName}</span>
  `;
  customFieldsGrid.appendChild(projectCard);

  customFields.forEach(field => {
    const val = video.customData[field.id];
    if (val) {
      const card = document.createElement('div');
      card.className = 'metadata-card';
      card.innerHTML = `
        <span class="metadata-name">${field.name}</span>
        <span class="metadata-value-large">${val}</span>
      `;
      customFieldsGrid.appendChild(card);
    }
  });

  // Clean up any existing subtitle tracks and revoke object URLs
  const tracks = videoPlayer.querySelectorAll('track');
  tracks.forEach(track => track.remove());
  activeSubtitleUrls.forEach(url => URL.revokeObjectURL(url));
  activeSubtitleUrls = [];

  // Clean up translation audio voiceovers
  if (activeAudioElement) {
    activeAudioElement.pause();
    activeAudioElement.remove();
    activeAudioElement = null;
  }
  activeAudioUrls.forEach(url => URL.revokeObjectURL(url));
  activeAudioUrls = [];

  // Hide CC button by default
  const ccBtn = document.getElementById('ccBtn');
  const ccMenu = document.getElementById('ccMenu');
  if (ccBtn) ccBtn.style.display = 'none';
  if (ccMenu) ccMenu.style.display = 'none';

  // Hide audio translation track button by default
  const audioTrackBtn = document.getElementById('audioTrackBtn');
  const audioTrackMenu = document.getElementById('audioTrackMenu');
  if (audioTrackBtn) audioTrackBtn.style.display = 'none';
  if (audioTrackMenu) audioTrackMenu.style.display = 'none';

  // Load subtitle tracks if available
  if (video.subtitles && video.subtitles.length > 0) {
    if (ccBtn) ccBtn.style.display = 'inline-flex';

    video.subtitles.forEach(sub => {
      if (sub.file) {
        let url;
        if (sub.file instanceof Blob || sub.file instanceof File) {
          url = URL.createObjectURL(sub.file);
          activeSubtitleUrls.push(url);
        } else {
          url = sub.file;
        }

        const trackElement = document.createElement('track');
        trackElement.kind = 'subtitles';
        trackElement.label = sub.languageLabel;
        trackElement.srclang = sub.languageCode;
        trackElement.src = url;

        videoPlayer.appendChild(trackElement);
      }
    });

    populateSubtitleMenu(video.subtitles);
  }

  // Load audio voiceover translation tracks if available
  if (video.audioTracks && video.audioTracks.length > 0) {
    if (audioTrackBtn) audioTrackBtn.style.display = 'inline-flex';
    populateAudioTrackMenu(video.audioTracks);
  }

  // Bind video blob URL to custom player
  let videoObjectUrl;
  if (video.videoFile instanceof Blob || video.videoFile instanceof File) {
    videoObjectUrl = URL.createObjectURL(video.videoFile);
  } else {
    videoObjectUrl = video.videoFile;
  }
  videoPlayer.src = videoObjectUrl;
  videoPlayer.poster = video.thumbnail || '';
  videoPlayer.load();

  // Set up copy link button listener
  const btnCopyVideoLink = document.getElementById('btnCopyVideoLink');
  if (btnCopyVideoLink) {
    // Clone and replace to reset listeners
    const newBtn = btnCopyVideoLink.cloneNode(true);
    btnCopyVideoLink.parentNode.replaceChild(newBtn, btnCopyVideoLink);

    newBtn.addEventListener('click', () => {
      const videoUrl = `${window.location.origin}${window.location.pathname}?video=${video.id}`;
      navigator.clipboard.writeText(videoUrl)
        .then(() => showToast('Video shareable link copied to clipboard!', 'success'))
        .catch(() => showToast('Failed to copy link', 'error'));
    });
  }

  // Auto-play video
  videoPlayer.play().catch(err => console.log('Autoplay blocked: ', err));

  // Reset speed
  currentSpeedIndex = 0;
  videoPlayer.playbackRate = speedOptions[currentSpeedIndex];
  speedBtn.textContent = '1.0x';
}

// Populate the custom CC subtitles menu
function populateSubtitleMenu(subtitles) {
  const ccMenu = document.getElementById('ccMenu');
  if (!ccMenu) return;

  ccMenu.innerHTML = '';

  // 1. "Off" option
  const offOption = document.createElement('button');
  offOption.textContent = 'Off';
  offOption.style.cssText = 'background: none; border: none; color: #fff; text-align: left; padding: 6px 10px; font-size: 0.8rem; cursor: pointer; border-radius: 4px; display: flex; align-items: center; justify-content: space-between; font-weight: 500; transition: background 0.2s;';
  offOption.addEventListener('click', () => {
    for (let i = 0; i < videoPlayer.textTracks.length; i++) {
      videoPlayer.textTracks[i].mode = 'disabled';
    }
    updateActiveMenuOption('off');
  });
  ccMenu.appendChild(offOption);

  // 2. Language options
  subtitles.forEach(sub => {
    const opt = document.createElement('button');
    opt.textContent = sub.languageLabel;
    opt.style.cssText = 'background: none; border: none; color: #fff; text-align: left; padding: 6px 10px; font-size: 0.8rem; cursor: pointer; border-radius: 4px; display: flex; align-items: center; justify-content: space-between; font-weight: 500; transition: background 0.2s;';
    opt.addEventListener('click', () => {
      for (let i = 0; i < videoPlayer.textTracks.length; i++) {
        if (videoPlayer.textTracks[i].language === sub.languageCode) {
          videoPlayer.textTracks[i].mode = 'showing';
        } else {
          videoPlayer.textTracks[i].mode = 'disabled';
        }
      }
      updateActiveMenuOption(sub.languageCode);
    });
    ccMenu.appendChild(opt);
  });

  // Helper to visually update active item styling
  function updateActiveMenuOption(activeLangCode) {
    const btns = ccMenu.querySelectorAll('button');
    btns.forEach((btn, idx) => {
      btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(255, 255, 255, 0.08)');
      btn.addEventListener('mouseleave', () => {
        const isCurrentActive = (idx === 0 && activeLangCode === 'off') ||
          (idx > 0 && subtitles[idx - 1].languageCode === activeLangCode);
        btn.style.background = isCurrentActive ? 'rgba(34, 211, 238, 0.2)' : 'none';
      });

      const isCurrentActive = (idx === 0 && activeLangCode === 'off') ||
        (idx > 0 && subtitles[idx - 1].languageCode === activeLangCode);
      btn.style.background = isCurrentActive ? 'rgba(34, 211, 238, 0.2)' : 'none';
      btn.style.color = isCurrentActive ? '#22d3ee' : '#fff';
    });
  }

  updateActiveMenuOption('off');
}

// Populate the custom CC subtitles menu
function populateAudioTrackMenu(audioTracks) {
  const audioTrackMenu = document.getElementById('audioTrackMenu');
  if (!audioTrackMenu) return;

  audioTrackMenu.innerHTML = '';

  // 1. "Original Audio" option
  const originalOption = document.createElement('button');
  originalOption.textContent = 'Original Audio';
  originalOption.style.cssText = 'background: none; border: none; color: #fff; text-align: left; padding: 6px 10px; font-size: 0.8rem; cursor: pointer; border-radius: 4px; display: flex; align-items: center; justify-content: space-between; font-weight: 500; transition: background 0.2s;';
  originalOption.addEventListener('click', () => {
    selectAudioVoiceover(null);
    updateActiveAudioOption('original');
  });
  audioTrackMenu.appendChild(originalOption);

  // 2. Language voiceover options
  audioTracks.forEach(track => {
    const opt = document.createElement('button');
    opt.textContent = track.languageLabel;
    opt.style.cssText = 'background: none; border: none; color: #fff; text-align: left; padding: 6px 10px; font-size: 0.8rem; cursor: pointer; border-radius: 4px; display: flex; align-items: center; justify-content: space-between; font-weight: 500; transition: background 0.2s;';
    opt.addEventListener('click', () => {
      selectAudioVoiceover(track);
      updateActiveAudioOption(track.languageCode);
    });
    audioTrackMenu.appendChild(opt);
  });

  // Helper to visually update active item styling
  function updateActiveAudioOption(activeLangCode) {
    const btns = audioTrackMenu.querySelectorAll('button');
    btns.forEach((btn, idx) => {
      btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(255, 255, 255, 0.08)');
      btn.addEventListener('mouseleave', () => {
        const isCurrentActive = (idx === 0 && activeLangCode === 'original') ||
          (idx > 0 && audioTracks[idx - 1].languageCode === activeLangCode);
        btn.style.background = isCurrentActive ? 'rgba(34, 211, 238, 0.2)' : 'none';
      });

      const isCurrentActive = (idx === 0 && activeLangCode === 'original') ||
        (idx > 0 && audioTracks[idx - 1].languageCode === activeLangCode);
      btn.style.background = isCurrentActive ? 'rgba(34, 211, 238, 0.2)' : 'none';
      btn.style.color = isCurrentActive ? '#22d3ee' : '#fff';
    });
  }

  updateActiveAudioOption('original');
}

// Instantiate or stop voiceover element
function selectAudioVoiceover(track) {
  if (activeAudioElement) {
    activeAudioElement.pause();
    activeAudioElement.remove();
    activeAudioElement = null;
  }

  if (!track) {
    videoPlayer.muted = false;
    updateVolumeIcon();
    return;
  }

  videoPlayer.muted = true;

  activeAudioElement = document.createElement('audio');
  let audioSrc;
  if (track.file instanceof Blob || track.file instanceof File) {
    audioSrc = URL.createObjectURL(track.file);
    activeAudioUrls.push(audioSrc);
  } else {
    audioSrc = track.file;
  }
  activeAudioElement.src = audioSrc;

  activeAudioElement.volume = volumeSlider.value;
  activeAudioElement.muted = false;
  activeAudioElement.playbackRate = videoPlayer.playbackRate;
  activeAudioElement.currentTime = videoPlayer.currentTime;

  activeAudioElement.load();
  if (!videoPlayer.paused) {
    activeAudioElement.play().catch(err => console.log('Audio playback blocked: ', err));
  }
}

// Setup custom controls logic for HTML5 video tag
function setupPlayerControls() {
  videoPlayer = document.getElementById('customVideoPlayer');
  playPauseBtn = document.getElementById('playPauseBtn');
  playIcon = document.querySelector('#playPauseBtn i');
  skipBackBtn = document.getElementById('skipBackBtn');
  skipForwardBtn = document.getElementById('skipForwardBtn');
  muteBtn = document.getElementById('muteBtn');
  volumeIcon = document.querySelector('#muteBtn i');
  volumeSlider = document.getElementById('volumeSlider');
  timelineSlider = document.getElementById('timelineSlider');
  timelineProgress = document.getElementById('timelineProgress');
  currentTimeSpan = document.getElementById('currentTime');
  durationTimeSpan = document.getElementById('durationTime');
  speedBtn = document.getElementById('speedBtn');
  fullscreenBtn = document.getElementById('fullscreenBtn');
  videoPlayerContainer = document.getElementById('videoPlayerContainer');

  // Play Pause Toggle
  playPauseBtn.addEventListener('click', togglePlay);
  videoPlayer.addEventListener('click', togglePlay);

  videoPlayer.addEventListener('play', () => {
    playPauseBtn.setAttribute('title', 'Pause');
    playPauseBtn.innerHTML = '<i data-lucide="pause"></i>';
    lucide.createIcons();
    if (activeAudioElement) {
      activeAudioElement.play().catch(e => console.log('Voiceover play error', e));
    }
  });

  videoPlayer.addEventListener('pause', () => {
    playPauseBtn.setAttribute('title', 'Play');
    playPauseBtn.innerHTML = '<i data-lucide="play"></i>';
    lucide.createIcons();
    if (activeAudioElement) {
      activeAudioElement.pause();
    }
  });

  // Skip buttons
  skipBackBtn.addEventListener('click', () => {
    const target = Math.max(0, videoPlayer.currentTime - 10);
    videoPlayer.currentTime = target;
    if (activeAudioElement) {
      activeAudioElement.currentTime = target;
    }
  });

  skipForwardBtn.addEventListener('click', () => {
    const target = Math.min(videoPlayer.duration || 0, videoPlayer.currentTime + 10);
    videoPlayer.currentTime = target;
    if (activeAudioElement) {
      activeAudioElement.currentTime = target;
    }
  });

  // Mute / Volume slider
  muteBtn.addEventListener('click', () => {
    if (activeAudioElement) {
      activeAudioElement.muted = !activeAudioElement.muted;
    } else {
      videoPlayer.muted = !videoPlayer.muted;
    }
    updateVolumeIcon();
  });

  volumeSlider.addEventListener('input', (e) => {
    const val = e.target.value;
    videoPlayer.volume = val;
    if (activeAudioElement) {
      activeAudioElement.volume = val;
      activeAudioElement.muted = (val == 0);
    } else {
      videoPlayer.muted = (val == 0);
    }
    updateVolumeIcon();
  });

  // Time progress seek
  videoPlayer.addEventListener('timeupdate', () => {
    if (videoPlayer.duration) {
      const pct = (videoPlayer.currentTime / videoPlayer.duration) * 100;
      timelineSlider.value = pct;
      timelineProgress.style.width = pct + '%';
      currentTimeSpan.textContent = formatTime(videoPlayer.currentTime);

      if (activeAudioElement) {
        if (Math.abs(activeAudioElement.currentTime - videoPlayer.currentTime) > 0.3) {
          activeAudioElement.currentTime = videoPlayer.currentTime;
        }
      }
    }
  });

  videoPlayer.addEventListener('loadedmetadata', () => {
    durationTimeSpan.textContent = formatTime(videoPlayer.duration);
  });

  timelineSlider.addEventListener('input', (e) => {
    if (videoPlayer.duration) {
      const targetTime = (e.target.value / 100) * videoPlayer.duration;
      videoPlayer.currentTime = targetTime;
      if (activeAudioElement) {
        activeAudioElement.currentTime = targetTime;
      }
      timelineProgress.style.width = e.target.value + '%';
    }
  });

  // Speed adjust
  speedBtn.addEventListener('click', () => {
    currentSpeedIndex = (currentSpeedIndex + 1) % speedOptions.length;
    const speed = speedOptions[currentSpeedIndex];
    videoPlayer.playbackRate = speed;
    speedBtn.textContent = speed + 'x';
  });

  videoPlayer.addEventListener('ratechange', () => {
    if (activeAudioElement) {
      activeAudioElement.playbackRate = videoPlayer.playbackRate;
    }
  });

  // Fullscreen Container Request
  fullscreenBtn.addEventListener('click', toggleFullscreen);

  // Double click on video to fullscreen
  videoPlayer.addEventListener('dblclick', toggleFullscreen);

  // CC Subtitles Menu click
  const ccBtn = document.getElementById('ccBtn');
  const ccMenu = document.getElementById('ccMenu');
  if (ccBtn && ccMenu) {
    ccBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isShowing = ccMenu.style.display === 'flex';
      ccMenu.style.display = isShowing ? 'none' : 'flex';
    });

    // Close menu on document click
    document.addEventListener('click', () => {
      ccMenu.style.display = 'none';
    });
  }

  // Audio Track Menu click
  const audioTrackBtn = document.getElementById('audioTrackBtn');
  const audioTrackMenu = document.getElementById('audioTrackMenu');
  if (audioTrackBtn && audioTrackMenu) {
    audioTrackBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isShowing = audioTrackMenu.style.display === 'flex';
      audioTrackMenu.style.display = isShowing ? 'none' : 'flex';
    });

    // Close menu on document click
    document.addEventListener('click', () => {
      audioTrackMenu.style.display = 'none';
    });
  }
}

// Utility: format seconds into MM:SS or HH:MM:SS
function formatTime(seconds) {
  if (isNaN(seconds)) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const formattedMins = mins.toString().padStart(2, '0');
  const formattedSecs = secs.toString().padStart(2, '0');

  if (hrs > 0) {
    return `${hrs}:${formattedMins}:${formattedSecs}`;
  }
  return `${formattedMins}:${formattedSecs}`;
}

// Toggle media playback state
function togglePlay() {
  if (videoPlayer.paused) {
    videoPlayer.play().catch(e => console.log(e));
  } else {
    videoPlayer.pause();
  }
}

// Handle dynamic speaker volume icons
function updateVolumeIcon() {
  let iconName = 'volume-2';
  const isMuted = activeAudioElement ? activeAudioElement.muted : videoPlayer.muted;
  const volVal = activeAudioElement ? activeAudioElement.volume : videoPlayer.volume;

  if (isMuted || volVal == 0) {
    iconName = 'volume-x';
  } else if (volVal < 0.5) {
    iconName = 'volume-1';
  }

  muteBtn.innerHTML = `<i data-lucide="${iconName}"></i>`;
  volumeSlider.value = isMuted ? 0 : volVal;
  lucide.createIcons();
}

// Immerse player into fullscreen layout
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    videoPlayerContainer.requestFullscreen()
      .catch(err => {
        showToast('Error enabling fullscreen mode', 'error');
      });
  } else {
    document.exitFullscreen();
  }
}

/* ==========================================
   ADMIN LOGIN & MANAGEMENT OPERATIONS (MIGRATED)
   ========================================== */

function setupAdminListeners() {
  const btnLoginBtn = document.getElementById('btnLoginBtn');
  const loginForm = document.getElementById('loginForm');
  const btnCloseLoginModal = document.getElementById('btnCloseLoginModal');
  const btnOpenUploadModal = document.getElementById('btnOpenUploadModal');
  const btnCloseAdminModal = document.getElementById('btnCloseAdminModal');
  const btnCreateProject = document.getElementById('btnCreateProject');
  const newProjectNameInput = document.getElementById('newProjectName');
  const uploadForm = document.getElementById('uploadVideoForm');
  const btnCancelEdit = document.getElementById('btnCancelEdit');

  // Trigger login modal or logout
  btnLoginBtn.addEventListener('click', () => {
    const isAdmin = sessionStorage.getItem('isAdmin') === 'true';
    if (isAdmin) {
      // Logout
      sessionStorage.removeItem('isAdmin');
      showToast('Logged out from admin console', 'info');
      updateAdminUi();
      filterAndRenderVideos();
    } else {
      // Open Login Modal
      document.getElementById('loginUsername').value = '';
      document.getElementById('loginPassword').value = '';
      document.getElementById('loginModal').style.display = 'flex';
      document.getElementById('loginUsername').focus();
    }
  });

  // Close Login Modal
  btnCloseLoginModal.addEventListener('click', () => {
    document.getElementById('loginModal').style.display = 'none';
  });

  // Submit Login Form
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    if (username.toUpperCase() === 'BAVYA' && (password === 'admin' || password === '12345' || password === 'admin123' || password === 'bavya123')) {
      sessionStorage.setItem('isAdmin', 'true');
      showToast('Successfully logged in!', 'success');
      document.getElementById('loginModal').style.display = 'none';
      updateAdminUi();
      filterAndRenderVideos();
    } else {
      showToast('Incorrect username or password', 'error');
    }
  });

  // Open Upload / Admin Modal
  btnOpenUploadModal.addEventListener('click', () => {
    resetUploadForm();
    document.getElementById('adminModal').style.display = 'flex';
  });

  // Close Admin Modal
  btnCloseAdminModal.addEventListener('click', () => {
    document.getElementById('adminModal').style.display = 'none';
  });

  // Create Project Click Handler
  btnCreateProject.addEventListener('click', async () => {
    const name = newProjectNameInput.value.trim();
    if (!name) {
      showToast('Please enter a project name', 'error');
      return;
    }

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
      await populateProjectFilterDropdown();
    } catch (err) {
      showToast('Failed to save project', 'error');
    }
  });

  // Drag and Drop Video Files
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

  // Save/Upload Form Submit
  uploadForm.addEventListener('submit', handleUploadSubmit);

  // Cancel Edit Button
  if (btnCancelEdit) {
    btnCancelEdit.addEventListener('click', resetUploadForm);
  }
}

// Refresh login state header buttons and lists
async function updateAdminUi() {
  const isAdmin = sessionStorage.getItem('isAdmin') === 'true';
  const btnLoginBtn = document.getElementById('btnLoginBtn');
  const btnOpenUploadModal = document.getElementById('btnOpenUploadModal');

  if (isAdmin) {
    btnLoginBtn.innerHTML = '<i data-lucide="unlock"></i> Admin Logout';
    btnLoginBtn.className = 'btn-secondary';
    btnOpenUploadModal.style.display = 'inline-flex';

    // Pre-load project manager lists quietly
    await refreshProjectsList();
    renderDynamicFormFields();
  } else {
    btnLoginBtn.innerHTML = '<i data-lucide="lock"></i> Admin Login';
    btnLoginBtn.className = 'btn-secondary';
    btnOpenUploadModal.style.display = 'none';
  }
  lucide.createIcons();
}

// Refresh project list inside the modal panel
async function refreshProjectsList() {
  try {
    projectsList = await getProjects();

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

    // Populate Right Panel Active Projects List
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
        item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background: rgba(255, 255, 255, 0.03); padding: 0.5rem 0.75rem; border-radius: 6px; border: 1px solid var(--border-color);';

        item.innerHTML = `
          <span style="color: #fff; font-size: 0.9rem; font-weight: 500;">${proj}</span>
          <button type="button" class="btn-icon btn-delete-project" data-name="${proj}" title="Delete Project" style="padding: 2px; background: none; border: none; cursor: pointer;">
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
            await populateProjectFilterDropdown();
          }
        });
      });

      lucide.createIcons();
    }
  } catch (err) {
    console.error('Failed to load projects', err);
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
  document.getElementById('selectedFileBox').style.display = 'flex';
  document.getElementById('dropZone').style.display = 'none';

  // Populate video title input as a helper if empty
  const titleInput = document.getElementById('videoTitle');
  if (!titleInput.value) {
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
    titleInput.value = nameWithoutExt.split(/[-_]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
}

// Render tag pills inside uploader tag container
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

// Render subtitle tracks inside modal
function renderSubtitles() {
  const container = document.getElementById('addedSubtitlesList');
  if (!container) return;

  container.innerHTML = '';

  currentSubtitles.forEach((sub, idx) => {
    const item = document.createElement('div');
    item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background: rgba(255, 255, 255, 0.03); padding: 0.4rem 0.6rem; border-radius: 4px; border: 1px solid var(--border-color); font-size: 0.85rem;';

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

// Render added audio voiceover tracks
function renderAudioTracks() {
  const container = document.getElementById('addedAudioList');
  if (!container) return;

  container.innerHTML = '';

  currentAudioTracks.forEach((track, idx) => {
    const item = document.createElement('div');
    item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background: rgba(255, 255, 255, 0.03); padding: 0.4rem 0.6rem; border-radius: 4px; border: 1px solid var(--border-color); font-size: 0.85rem;';

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

// Generate Video frame thumbnail
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
        console.error(err);
        URL.revokeObjectURL(objectURL);
        resolve(null);
      }
    };

    video.onerror = () => {
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

    // Reset Forms and close modal
    setTimeout(async () => {
      progressContainer.style.display = 'none';
      btnSubmit.disabled = false;
      resetUploadForm();
      document.getElementById('adminModal').style.display = 'none';
      await refreshVideoData();
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

  // Reset Action Buttons
  const btnSubmit = document.getElementById('btnSubmitVideo');
  btnSubmit.innerHTML = '<i data-lucide="upload"></i> Save Video to Portal';
  document.getElementById('btnCancelEdit').style.display = 'none';

  const modalTitle = document.getElementById('adminModalTitle');
  if (modalTitle) {
    modalTitle.innerHTML = '<i data-lucide="upload" style="color: var(--color-secondary); margin-right: 8px;"></i> Upload Video to Portal';
  }

  lucide.createIcons();
}

// Prepopulate custom dynamic fields inside uploader
function renderDynamicFormFields() {
  const container = document.getElementById('dynamicFormFields');
  if (!container) return;
  container.innerHTML = '';
  customFields.forEach(field => {
    const group = document.createElement('div');
    group.className = 'form-group';
    group.innerHTML = `
      <label class="form-label">${field.name}</label>
      <input type="text" name="${field.id}" class="form-input" placeholder="Enter ${field.name.toLowerCase()}">
    `;
    container.appendChild(group);
  });
}

// Load values into form and enter edit mode
function startEditVideo(video) {
  resetUploadForm();
  editingVideoId = video.id;

  // Show cancel button and change submit text
  document.getElementById('btnCancelEdit').style.display = 'block';
  const btnSubmit = document.getElementById('btnSubmitVideo');
  btnSubmit.innerHTML = '<i data-lucide="save"></i> Update Video Details';

  const modalTitle = document.getElementById('adminModalTitle');
  if (modalTitle) {
    modalTitle.innerHTML = '<i data-lucide="edit-3" style="color: var(--color-secondary); margin-right: 8px;"></i> Edit Video Details';
  }
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
  document.getElementById('selectedFileSize').textContent = video.videoFile && video.videoFile.size ? `Size: ${(video.videoFile.size / (1024 * 1024)).toFixed(1)} MB` : 'Size: N/A (Server File)';
  selectedFileBox.style.display = 'flex';
  dropZone.style.display = 'none';

  // Open the modal
  document.getElementById('adminModal').style.display = 'flex';
}

// Toast Notifier utility
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
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
