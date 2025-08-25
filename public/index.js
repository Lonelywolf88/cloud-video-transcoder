const API = "/api/v1";
const token = localStorage.getItem("token");
if (!token) { location.href = "/login"; }
const headers = { "Authorization": `Bearer ${token}` };

const videosEl = document.getElementById("videos");
const tpl = document.getElementById("videoTpl");
const player = document.getElementById("player");
const logoutBtn = document.getElementById("logoutBtn");

logoutBtn?.addEventListener("click", () => {
  localStorage.removeItem("token");
  location.href = "/login";
});

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { ...headers, ...(opts.headers||{}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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
  if (!t) return `Video ${v.id}`;
  return t.length > 60 ? t.slice(0,57) + "…" : t;
}

function renderVideos(items) {
  videosEl.innerHTML = "";
  for (const v of items) {
    const node = tpl.content.cloneNode(true);
    node.querySelector(".title").textContent = shortLabel(v);
    const statusEl = node.querySelector(".status");
    statusEl.textContent = v.status;
    statusEl.className = `status text-xs px-2 py-1 rounded ${badgeClass(v.status)}`;

  const img = node.querySelector(".thumb");
  img.src = `${API}/videos/${v.id}/thumb?token=${encodeURIComponent(token)}`;
    img.alt = v.title || `Video ${v.id}`;
    img.onerror = () => { img.classList.add("opacity-30"); };

    if (v.status !== "completed") {
      node.querySelector(".playBtn").disabled = true;
    }

    const maybeDisable = (sel) => {
      const btn = node.querySelector(sel);
      if (v.status !== "completed") { btn.disabled = true; btn.classList.add("opacity-50","cursor-not-allowed"); }
      return btn;
    };

    node.querySelector(".playBtn").addEventListener("click", () => {
      player.classList.remove("hidden");
      const url = `${API}/videos/${v.id}/stream?res=720&token=${encodeURIComponent(token)}`;
      player.src = url;
      player.play();
    });
    maybeDisable(".dl1080").addEventListener("click", () => window.open(`${API}/videos/${v.id}/download?res=1080&token=${encodeURIComponent(token)}`));
    maybeDisable(".dl720").addEventListener("click", () => window.open(`${API}/videos/${v.id}/download?res=720&token=${encodeURIComponent(token)}`));
    maybeDisable(".dl480").addEventListener("click", () => window.open(`${API}/videos/${v.id}/download?res=480&token=${encodeURIComponent(token)}`));

    // failed error message + delete button
    // Delete button for all statuses
    const del = document.createElement("button");
    del.textContent = "Delete";
    del.className = "mt-2 px-3 py-2 rounded bg-rose-500/20 text-rose-300 border border-rose-400/20 hover:bg-rose-500/30";
    del.addEventListener("click", async () => {
      if (!confirm("Delete this video?")) return;
      const res = await fetch(`${API}/videos/${v.id}`, { method: "DELETE", headers });
      if (!res.ok && res.status !== 204) return alert("Delete failed");
      await listVideos();
    });
    node.querySelector(".video-card").appendChild(del);

    videosEl.appendChild(node);
  }
}

async function listVideos() {
  try {
    const data = await fetchJSON(`${API}/videos`);
    renderVideos(data.items || data.results || []);
  } catch (e) {
    console.error(e);
  }
}

// upload
const uploadBtn = document.getElementById("uploadBtn");
const fileInput = document.getElementById("fileInput");
const titleInput = document.getElementById("title");
uploadBtn?.addEventListener("click", async () => {
  const f = fileInput.files?.[0];
  if (!f) return alert("Pick a file first");
  const fd = new FormData();
  fd.append("file", f);
  if (titleInput.value) fd.append("title", titleInput.value);
  const res = await fetch(`${API}/videos`, { method: "POST", headers, body: fd });
  if (!res.ok) return alert("Upload failed");
  titleInput.value = ""; fileInput.value = "";
  await listVideos();
});

// import
const ytBtn = document.getElementById("ytBtn");
const ytUrl = document.getElementById("ytUrl");
ytBtn?.addEventListener("click", async () => {
  const url = ytUrl.value.trim();
  if (!url) return alert("Enter a YouTube URL");
  const body = { youtube_url: url };
  if (titleInput.value) body.title = titleInput.value;
  const res = await fetch(`${API}/videos`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) return alert("Import failed");
  titleInput.value = ""; ytUrl.value = "";
  await listVideos();
});

// poll for status while there are non-completed videos
setInterval(async () => {
  try {
    await listVideos();
  } catch {}
}, 5000);

listVideos();
