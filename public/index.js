// =============================================
// Basic setup & auth
// =============================================
const API = "/api/v1";
const token = localStorage.getItem("token");
if (!token) { location.href = "/login"; }
const headers = { "Authorization": `Bearer ${token}` };

// Elements
const videosEl = document.getElementById("videos");
const tpl = document.getElementById("videoTpl");
const player = document.getElementById("player");
const logoutBtn = document.getElementById("logoutBtn");

logoutBtn?.addEventListener("click", () => {
  localStorage.removeItem("token");
  location.href = "/login";
});

// =============================================
// Helpers
// =============================================
function revokeThumb(imgEl) {
  if (imgEl && imgEl.dataset.objUrl) {
    URL.revokeObjectURL(imgEl.dataset.objUrl);
    delete imgEl.dataset.objUrl;
  }
}

async function setThumb(imgEl, id) {
  try {
    const res = await fetch(`${API}/videos/${id}/thumb`, { headers });
    if (!res.ok) throw new Error(`thumb HTTP ${res.status}`);
    const blob = await res.blob();
    revokeThumb(imgEl);
    const url = URL.createObjectURL(blob);
    imgEl.dataset.objUrl = url;
    imgEl.src = url;
    imgEl.classList.remove("opacity-30");
  } catch (e) {
    console.error("[thumb] fetch failed", id, e);
    imgEl.classList.add("opacity-30");
    try {
      const r = await fetch(`${API}/videos/${id}/thumb?mode=json`, { headers });
      if (r.ok) {
        const j = await r.json();
        if (j?.url) { imgEl.src = j.url; return; }
      }
    } catch {}
  }
}

function badgeClass(status) {
  switch ((status||"").toLowerCase()) {
    case "completed": return "bg-emerald-500/20 text-emerald-300 border border-emerald-400/20";
    case "processing": return "bg-amber-500/20 text-amber-300 border border-amber-400/20";
    case "queued": return "bg-sky-500/20 text-sky-300 border border-sky-400/20";
    case "ingesting": return "bg-indigo-500/20 text-indigo-300 border border-indigo-400/20";
    case "failed": return "bg-rose-500/20 text-rose-300 border border-rose-400/20";
    default: return "bg-white/10 text-slate-300 border border-white/10";
  }
}

function shortLabel(v) {
  const t = v.title || v.slug || v.source_url || `Video ${v.id}`;
  return t.length > 60 ? t.slice(0,57) + "…" : t;
}

// =============================================
// Rendering
// =============================================
function renderVideos(items) {
  const existing = new Map([...videosEl.querySelectorAll('.video-card')].map(c => [c.dataset.vid, c]));
  const seen = new Set();

  for (const v of items) {
    let card = existing.get(v.id);
    if (!card) {
      card = tpl.content.cloneNode(true).querySelector('.video-card');
      card.dataset.vid = v.id;
      videosEl.appendChild(card);
    }
    seen.add(v.id);

    const titleEl = card.querySelector('.title');
    const statusEl = card.querySelector('.status');
    titleEl.textContent = shortLabel(v);
    statusEl.textContent = v.status;
    statusEl.className = `status text-xs px-2 py-1 rounded ${badgeClass(v.status)}`;

    // Tags
    const tagsWrap = card.querySelector('.tags');
    if (tagsWrap) {
      const tagsArr = Array.isArray(v.tags) ? v.tags : [];
      const marker = tagsArr.join('|');
      if (tagsWrap.dataset.marker !== marker) {
        tagsWrap.dataset.marker = marker;
        tagsWrap.innerHTML = '';
        for (const t of tagsArr) {
          const span = document.createElement('span');
          span.textContent = t;
          span.className = 'text-[10px] uppercase tracking-wide px-2 py-1 rounded bg-indigo-500/20 border border-indigo-400/30 text-indigo-200';
          tagsWrap.appendChild(span);
        }
      }
    }

    // Thumbnail
    const img = card.querySelector('.thumb');
    img.alt = v.title || `Video ${v.id}`;
    if (!img.dataset.bound) {
      img.dataset.bound = '1';
      img.addEventListener('error', () => img.classList.add('opacity-30'));
    }
    setThumb(img, v.id);

    // Build a quick set of available rendition resolutions for enabling buttons
    const availableRes = new Set();
    if (Array.isArray(v.renditions)) {
      for (const r of v.renditions) {
        if (r && r.resolution) availableRes.add(String(r.resolution));
      }
    }
    // Always include original implicitly
    availableRes.add('original');

    // One-time button wiring
    if (!card.dataset.boundBtns) {
      card.dataset.boundBtns = '1';
      const playBtn = card.querySelector('.playBtn');
      playBtn.addEventListener('click', async () => {
        try {
          player.classList.remove('hidden');
          const r = await fetch(`${API}/videos/${v.id}/stream?res=720`, { headers });
          if (!r.ok) throw new Error(`stream HTTP ${r.status}`);
          const j = await r.json();
          if (!j.url) throw new Error('No url in stream response');
          player.src = j.url;
          await player.play();
        } catch (e) { console.error('[play] failed', e); alert('Unable to start playback'); }
      });

      function bindDownload(selector, resn) {
        const btn = card.querySelector(selector);
        btn.addEventListener('click', async () => {
          try {
            if (!availableRes.has(resn)) {
              alert(`Rendition ${resn} not available yet`);
              return;
            }
            const r = await fetch(`${API}/videos/${v.id}/download?res=${resn}`, { headers });
            if (r.status === 404) { alert(`Rendition ${resn} not available yet`); return; }
            if (!r.ok) throw new Error(`download HTTP ${r.status}`);
            const j = await r.json();
            if (!j?.url) throw new Error('No url in download response');
            // Try anchor (new tab) first
            let opened = false;
            try {
              const a = document.createElement('a');
              a.href = j.url;
              if (j.filename) a.download = j.filename;
              a.target = '_blank';
              a.rel = 'noopener';
              document.body.appendChild(a);
              a.click();
              setTimeout(() => a.remove(), 0);
              opened = true;
            } catch {}
            // Fallback: force navigation if popup blocked
            if (!opened) {
              window.location.href = j.url;
            }
          } catch (e) { console.error('[download] failed', e); alert('Download link unavailable'); }
        });
      }
      bindDownload('.dl1080', '1080');
      bindDownload('.dl720', '720');
      bindDownload('.dl480', '480');

      const del = document.createElement('button');
      del.textContent = 'Delete';
      del.className = 'mt-2 px-3 py-2 rounded bg-rose-500/20 text-rose-300 border border-rose-400/20 hover:bg-rose-500/30';
      del.addEventListener('click', async () => {
        if (!confirm('Delete this video?')) return;
        const r = await fetch(`${API}/videos/${v.id}`, { method: 'DELETE', headers });
        if (r.ok || r.status === 204) { revokeThumb(img); await refreshPage(); } else { alert('Delete failed'); }
      });
      card.appendChild(del);
    }

    // Enable/disable buttons
    const disabled = v.status !== 'completed';
    card.querySelectorAll('button').forEach(b => {
      if (b.textContent === 'Delete') return;
      if (b.classList.contains('playBtn')) {
        // Play enabled only when at least one rendition (or original) available & completed
        b.disabled = disabled;
      } else if (/^\d+p$/.test(b.textContent)) {
        // Resolution buttons: also check availability
        const resTxt = b.textContent.replace(/[^0-9]/g,'');
        const available = availableRes.has(resTxt);
        b.disabled = disabled || !available;
        b.classList.toggle('opacity-40', !available);
      } else {
        b.disabled = disabled;
      }
      b.classList.toggle('opacity-50', b.disabled);
      b.classList.toggle('cursor-not-allowed', b.disabled);
    });
  }

  // Remove stale cards
  for (const [vid, node] of existing.entries()) {
    if (!seen.has(vid)) {
      const img = node.querySelector('.thumb');
      revokeThumb(img);
      node.remove();
    }
  }
}

// =============================================
// Pagination + ETag
// =============================================
let currentPage = 1;
let lastListEtag = null;
let totalPages = 1;

function buildQuery(page){
  const q = document.getElementById('q')?.value.trim();
  const tag = document.getElementById('tag')?.value.trim();
  const status = document.getElementById('statusFilter')?.value;
  const sort = document.getElementById('sort')?.value;
  const params = new URLSearchParams();
  params.set('page', page);
  params.set('per_page', 6);
  if (q) params.set('q', q);
  if (tag) params.set('tag', tag);
  if (status) params.set('status', status);
  if (sort) params.set('sort', sort);
  return params.toString();
}

async function loadPage(page) {
  try {
    const query = buildQuery(page);
    const url = `${API}/videos?${query}`;
    const opts = { headers: { ...headers } };
    if (lastListEtag) opts.headers['If-None-Match'] = lastListEtag;
    const res = await fetch(url, opts);
    if (res.status === 304) { console.log('[videos] 304 Not Modified', lastListEtag); return; }
    if (!res.ok) throw new Error(`list HTTP ${res.status}`);
    const etag = res.headers.get('etag');
    if (etag) { lastListEtag = etag; console.log('[videos] ETag:', etag); }
    const data = await res.json();
    currentPage = data.page || page;
    totalPages = data.totalPages || 1;
    renderVideos(data.items || data.results || []);
    const pageInfo = document.getElementById('pageInfo');
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} / ${totalPages}`;
    // Disable buttons appropriately
    const prev = document.getElementById('prevPage');
    const next = document.getElementById('nextPage');
    if (prev) prev.disabled = currentPage <= 1;
    if (next) next.disabled = currentPage >= totalPages;
  } catch (e) { console.error(e); }
}

async function refreshPage() { return loadPage(currentPage); }

document.getElementById('prevPage')?.addEventListener('click', () => { if (currentPage > 1) loadPage(currentPage - 1); });
document.getElementById('nextPage')?.addEventListener('click', () => { if (currentPage < totalPages) loadPage(currentPage + 1); });

// Apply filters
document.getElementById('applyFilters')?.addEventListener('click', () => { currentPage = 1; lastListEtag = null; loadPage(1); });

// =============================================
// Upload & Import
// =============================================
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');
const titleInput = document.getElementById('title');

uploadBtn?.addEventListener('click', async () => {
  const f = fileInput.files?.[0];
  if (!f) return alert('Pick a file first');

  try {
    // 1. Ask backend for presigned upload URL
    const presignRes = await fetch(`${API}/videos/upload-url`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: f.type })
    });
    if (!presignRes.ok) throw new Error(`presign HTTP ${presignRes.status}`);
    const { videoId, uploadUrl } = await presignRes.json();

    // 2. Upload file directly to S3
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": f.type },
      body: f
    });
    if (!putRes.ok) throw new Error(`S3 PUT HTTP ${putRes.status}`);

    // 3. Mark upload complete
    const completeRes = await fetch(`${API}/videos/${videoId}/complete`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ title: titleInput.value || f.name })
    });
    if (!completeRes.ok) throw new Error(`complete HTTP ${completeRes.status}`);

    // 4. Reset UI + refresh
    titleInput.value = '';
    fileInput.value = '';
    await refreshPage();
    alert("✅ Uploaded with presigned URL!");
  } catch (err) {
    console.error("[upload] failed", err);
    alert("Upload failed: " + (err.message || err));
  }
});


// =============================================
// Polling
// =============================================
setInterval(async () => { try { await loadPage(currentPage); } catch {} }, 5000);

// Initial load
loadPage(1);
