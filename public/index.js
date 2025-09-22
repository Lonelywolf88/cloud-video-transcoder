const API = "/api/v1";
const token = localStorage.getItem("token");
if (!token) {
  location.href = "/login";
}
const headers = { Authorization: `Bearer ${token}` };

const videosEl = document.getElementById("videos");
const tpl = document.getElementById("videoTpl");
const player = document.getElementById("player");
const logoutBtn = document.getElementById("logoutBtn");

logoutBtn?.addEventListener("click", () => {
  localStorage.removeItem("token");
  location.href = "/login";
});

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { ...headers, ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function badgeClass(status) {
  switch ((status || "").toLowerCase()) {
    case "completed":
      return "bg-emerald-500/20 text-emerald-300 border border-emerald-400/20";
    case "processing":
      return "bg-amber-500/20 text-amber-300 border border-amber-400/20";
    case "queued":
      return "bg-sky-500/20 text-sky-300 border border-sky-400/20";
    case "ingesting":
      return "bg-indigo-500/20 text-indigo-300 border border-indigo-400/20";
    case "failed":
      return "bg-rose-500/20 text-rose-300 border border-rose-400/20";
    default:
      return "bg-white/10 text-slate-300 border border-white/10";
  }
}

function shortLabel(v) {
  const t = v.title || v.slug || v.source_url || `Video ${v.id}`;
  if (!t) return `Video ${v.id}`;
  return t.length > 60 ? t.slice(0, 57) + "…" : t;
}

async function renderVideos(items) {
  videosEl.innerHTML = "";
  for (const v of items) {
    const node = tpl.content.cloneNode(true);
    node.querySelector(".title").textContent = shortLabel(v);

    const statusEl = node.querySelector(".status");
    statusEl.textContent = v.status;
    statusEl.className = `status text-xs px-2 py-1 rounded ${badgeClass(v.status)}`;

    // Thumbnail
    const img = node.querySelector(".thumb");
    try {
      const thumbRes = await fetchJSON(`${API}/videos/${v.id}/thumb`);
      img.src = thumbRes.url;
    } catch {
      img.classList.add("opacity-30");
    }
    img.alt = v.title || `Video ${v.id}`;

    if (v.status !== "completed") {
      node.querySelector(".playBtn").disabled = true;
    }

    const maybeDisable = (sel) => {
      const btn = node.querySelector(sel);
      if (v.status !== "completed") {
        btn.disabled = true;
        btn.classList.add("opacity-50", "cursor-not-allowed");
      }
      return btn;
    };

    // Play
    node.querySelector(".playBtn").addEventListener("click", async () => {
      player.classList.remove("hidden");
      try {
        const streamRes = await fetchJSON(`${API}/videos/${v.id}/stream?res=720`);
        player.src = streamRes.url;
        await player.play();
      } catch {
        alert("Failed to get stream URL");
      }
    });

    // Downloads
    maybeDisable(".dl1080").addEventListener("click", async () => {
      try {
        const dlRes = await fetchJSON(`${API}/videos/${v.id}/download?res=1080`);
        window.open(dlRes.url);
      } catch {
        alert("Download failed");
      }
    });
    maybeDisable(".dl720").addEventListener("click", async () => {
      try {
        const dlRes = await fetchJSON(`${API}/videos/${v.id}/download?res=720`);
        window.open(dlRes.url);
      } catch {
        alert("Download failed");
      }
    });
    maybeDisable(".dl480").addEventListener("click", async () => {
      try {
        const dlRes = await fetchJSON(`${API}/videos/${v.id}/download?res=480`);
        window.open(dlRes.url);
      } catch {
        alert("Download failed");
      }
    });

    // Tags
    const tagsWrap = node.querySelector(".tags");
    tagsWrap.innerHTML = "";
    const tags = Array.isArray(v.tags) ? v.tags : Array.isArray(v.auto_tags) ? v.auto_tags : [];
    if (tags.length) {
      for (const t of tags.slice(0, 5)) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.textContent = t;
        chip.title = `Filter by "${t}"`;
        chip.className =
          "text-xs px-2 py-1 rounded-full bg-white/10 border border-white/10 hover:bg-white/20";
        chip.addEventListener("click", () => {
          document.getElementById("tag").value = t;
          tagFilter = t;
          page = 1;
          listVideos();
        });
        tagsWrap.appendChild(chip);
      }
    }

    // Delete
    const del = document.createElement("button");
    del.textContent = "Delete";
    del.className =
      "mt-2 px-3 py-2 rounded bg-rose-500/20 text-rose-300 border border-rose-400/20 hover:bg-rose-500/30";
    del.addEventListener("click", async () => {
      if (!confirm("Delete this video?")) return;
      const res = await fetch(`${API}/videos/${v.id}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok && res.status !== 204) {
        try {
          const data = await res.json();
          alert(data.error || "Delete failed");
        } catch {
          alert("Delete failed");
        }
        return;
      }
      await listVideos();
    });
    node.querySelector(".video-card").appendChild(del);

    videosEl.appendChild(node);
  }
}

// Pagination + filters
let page = 1;
const perPage = 6;
let statusFilter = "";
let qFilter = "";
let sort = "-created_at";
let tagFilter = "";

let lastRendered = "";

async function listVideos() {
  try {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(qFilter ? { q: qFilter } : {}),
      ...(tagFilter ? { tag: tagFilter } : {}),
      ...(sort ? { sort } : {}),
    });
    const res = await fetch(`${API}/videos?${params.toString()}`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Only re-render if changed
    const snapshot = JSON.stringify(data.items || []);
    if (snapshot === lastRendered) return;
    lastRendered = snapshot;

    await renderVideos(data.items || []);
    const total = Number(res.headers.get("X-Total-Count")) || data.total || 0;
    const last = Math.max(1, Math.ceil(total / perPage));
    document.getElementById("pageInfo").textContent = `Page ${page} / ${last} (${total} total)`;
    document.getElementById("prevPage").disabled = page <= 1;
    document.getElementById("nextPage").disabled = page >= last;
  } catch (e) {
    console.error(e);
  }
}

// Upload
const uploadBtn = document.getElementById("uploadBtn");
const fileInput = document.getElementById("fileInput");
const titleInput = document.getElementById("title");
uploadBtn?.addEventListener("click", async () => {
  const f = fileInput.files?.[0];
  if (!f) return alert("Pick a file first");
  const fd = new FormData();
  fd.append("file", f);
  if (titleInput.value) fd.append("title", titleInput.value);
  const res = await fetch(`${API}/videos`, {
    method: "POST",
    headers,
    body: fd,
  });
  if (!res.ok) return alert("Upload failed");
  titleInput.value = "";
  fileInput.value = "";
  await listVideos();
});

// Filters + pagination controls
document.getElementById("applyFilters")?.addEventListener("click", () => {
  qFilter = document.getElementById("q").value.trim();
  tagFilter = document.getElementById("tag").value.trim();
  statusFilter = document.getElementById("statusFilter").value;
  sort = document.getElementById("sort").value;
  page = 1;
  listVideos();
});
document.getElementById("prevPage")?.addEventListener("click", () => {
  if (page > 1) {
    page--;
    listVideos();
  }
});
document.getElementById("nextPage")?.addEventListener("click", () => {
  page++;
  listVideos();
});

// Poll for updates (15s instead of 5s)
setInterval(async () => {
  try {
    await listVideos();
  } catch {}
}, 15000);

listVideos();
