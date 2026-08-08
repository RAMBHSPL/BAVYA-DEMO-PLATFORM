// Server API Database Bridge (Replacing client-side IndexedDB)

function initDb() {
  // Return resolved promise for backward compatibility
  return Promise.resolve(null);
}

// Helper to inject admin token into fetch headers
function getAuthHeaders(headers = {}) {
  const token = sessionStorage.getItem('adminToken') || '';
  return {
    ...headers,
    'Authorization': `Bearer ${token}`
  };
}

// Fetch all videos from server database
async function getVideos() {
  const response = await fetch('/api/videos');
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Failed to fetch videos from server');
  }
  return await response.json();
}

// Upload a video record (multipart/form-data)
async function addVideo(video) {
  const formData = new FormData();
  formData.append('id', video.id);
  formData.append('name', video.name);
  formData.append('projectName', video.projectName);
  formData.append('tags', JSON.stringify(video.tags || []));
  formData.append('customData', JSON.stringify(video.customData || {}));
  formData.append('createdAt', video.createdAt || Date.now());

  // 1. Process Video File
  if (video.videoFile instanceof File || video.videoFile instanceof Blob) {
    formData.append('videoFile', video.videoFile, video.videoFile.name || 'video.mp4');
  } else if (typeof video.videoFile === 'string') {
    formData.append('videoFileUrl', video.videoFile);
  }

  // 2. Process Thumbnail
  if (video.thumbnail instanceof File || video.thumbnail instanceof Blob) {
    formData.append('thumbnailFile', video.thumbnail, video.thumbnail.name || 'thumbnail.jpg');
  } else if (video.thumbnail && video.thumbnail.startsWith('data:image/')) {
    formData.append('thumbnailData', video.thumbnail); // Base64 fallback thumbnail
  } else if (typeof video.thumbnail === 'string') {
    formData.append('thumbnailUrl', video.thumbnail);
  }

  // 3. Process Closed Captions (Subtitles)
  const subtitlesMetadata = [];
  if (video.subtitles && Array.isArray(video.subtitles)) {
    video.subtitles.forEach((sub, idx) => {
      if (sub.file instanceof File || sub.file instanceof Blob) {
        const fieldName = `subtitle_${idx}`;
        formData.append(fieldName, sub.file, sub.name || `subtitle_${sub.languageCode}.vtt`);
        subtitlesMetadata.push({
          languageCode: sub.languageCode,
          languageLabel: sub.languageLabel,
          fileField: fieldName,
          name: sub.name
        });
      } else {
        subtitlesMetadata.push({
          languageCode: sub.languageCode,
          languageLabel: sub.languageLabel,
          fileUrl: sub.file,
          name: sub.name
        });
      }
    });
  }
  formData.append('subtitlesMetadata', JSON.stringify(subtitlesMetadata));

  // 4. Process Voiceover Audio Tracks
  const audioTracksMetadata = [];
  if (video.audioTracks && Array.isArray(video.audioTracks)) {
    video.audioTracks.forEach((track, idx) => {
      if (track.file instanceof File || track.file instanceof Blob) {
        const fieldName = `audio_${idx}`;
        formData.append(fieldName, track.file, track.name || `audio_${track.languageCode}.mp3`);
        audioTracksMetadata.push({
          languageCode: track.languageCode,
          languageLabel: track.languageLabel,
          fileField: fieldName,
          name: track.name
        });
      } else {
        audioTracksMetadata.push({
          languageCode: track.languageCode,
          languageLabel: track.languageLabel,
          fileUrl: track.file,
          name: track.name
        });
      }
    });
  }
  formData.append('audioTracksMetadata', JSON.stringify(audioTracksMetadata));

  const response = await fetch('/api/videos', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Failed to save video asset to server');
  }

  return await response.json();
}

// Delete video from server
async function deleteVideo(id) {
  const response = await fetch(`/api/videos/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Failed to delete video from server');
  }
  return await response.json();
}

// Custom Metadata Fields API calls
async function getCustomFields() {
  const response = await fetch('/api/custom-fields');
  if (!response.ok) {
    throw new Error('Failed to load custom fields config');
  }
  return await response.json();
}

async function saveCustomFields(fields) {
  const response = await fetch('/api/custom-fields', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ fields })
  });
  if (!response.ok) {
    throw new Error('Failed to save custom fields config');
  }
  return await response.json();
}

// Projects list API calls
async function getProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) {
    throw new Error('Failed to load projects list');
  }
  return await response.json();
}

async function saveProjects(list) {
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ list })
  });
  if (!response.ok) {
    throw new Error('Failed to save projects list');
  }
  return await response.json();
}

// Sorting order API calls
async function getVideoOrder() {
  const response = await fetch('/api/video-order');
  if (!response.ok) {
    throw new Error('Failed to load video display order');
  }
  return await response.json();
}

async function saveVideoOrder(order) {
  const response = await fetch('/api/video-order', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ order })
  });
  if (!response.ok) {
    throw new Error('Failed to save video display order');
  }
  return await response.json();
}

// SVG Fallback Thumbnail Helper (remains local Client-side logic)
function getVideoFallbackThumbnail(title, projectName) {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const palettes = [
    { start: '#2a0845', end: '#6441a5' }, // Deep Violet
    { start: '#4b1220', end: '#a82c48' }, // Luxury Burgundy
    { start: '#1d0b2e', end: '#451070' }, // Dark Night Purple
    { start: '#3e0618', end: '#8d0932' }, // Rich Crimson
    { start: '#2c0c1b', end: '#5a0d33' }  // Deep Rose Gold
  ];
  
  const index = Math.abs(hash) % palettes.length;
  const palette = palettes[index];
  const displayProject = (projectName || 'General').toUpperCase();
  const displayTitle = title.length > 28 ? title.substring(0, 25) + '...' : title;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="320" height="180">
      <defs>
        <linearGradient id="bgGrad_${Math.abs(hash)}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${palette.start}" />
          <stop offset="100%" stop-color="${palette.end}" />
        </linearGradient>
        <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ffe67e" />
          <stop offset="100%" stop-color="#f5c842" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feComposite in="SourceGraphic" in2="blur" operator="over"/>
        </filter>
      </defs>
      <rect width="320" height="180" fill="url(#bgGrad_${Math.abs(hash)})" />
      
      <path d="M 0,180 L 120,60 L 220,180 Z" fill="rgba(255,255,255,0.02)" />
      <path d="M 100,180 L 250,30 L 320,180 Z" fill="rgba(255,255,255,0.03)" />
      <circle cx="280" cy="40" r="80" fill="rgba(245,200,66,0.02)" />
      
      <circle cx="160" cy="80" r="26" fill="rgba(245, 200, 66, 0.08)" stroke="url(#goldGrad)" stroke-width="1.5" filter="url(#glow)" />
      <polygon points="155,71 155,89 171,80" fill="url(#goldGrad)" />
      
      <rect x="15" y="15" width="80" height="16" rx="4" fill="rgba(0,0,0,0.2)" stroke="rgba(255,255,255,0.1)" stroke-width="1" />
      <text x="55" y="24" dominant-baseline="middle" text-anchor="middle" fill="#ffe67e" font-size="7.5" font-family="'Outfit', sans-serif" font-weight="700" letter-spacing="0.5">${displayProject}</text>
      
      <text x="50%" y="138" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-size="12" font-family="'Outfit', sans-serif" font-weight="600" letter-spacing="0.2">${displayTitle}</text>
      <text x="50%" y="156" dominant-baseline="middle" text-anchor="middle" fill="#cfaea0" font-size="8" font-family="'Inter', sans-serif" letter-spacing="1.5" opacity="0.8">BAVYA | DEMO</text>
    </svg>
  `;
  
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg.trim());
}
