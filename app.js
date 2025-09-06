// ====== Mic „store” în localStorage ======
const KEY = "vlogVideos";

function loadVideos() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return [];
        return JSON.parse(raw);
    } catch {
        return [];
    }
}
function saveVideos(videos) {
    localStorage.setItem(KEY, JSON.stringify(videos));
}

// Seed de exemplu (prima rulare)
let videos = loadVideos();
if (videos.length === 0) {
    videos = [
        {
            id: Date.now(),
            title: "Primul vlog – salut!",
            url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            date: new Date().toISOString().slice(0, 10),
            desc: "Test de pagină. Înlocuiește cu clipurile tale reale.",
            tags: ["daily", "intro"]
        }
    ];
    saveVideos(videos);
}

// ====== Elemente din DOM ======
const grid = document.getElementById("grid");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const tagFilter = document.getElementById("tagFilter");
const btnAdd = document.getElementById("btnAdd");
const dlg = document.getElementById("addDialog");
const btnExport = document.getElementById("btnExport");
const importInput = document.getElementById("importInput");
const loadMoreBtn = document.getElementById("loadMore");

// Add dialog controls
const tabs = [...document.querySelectorAll(".tab")];
const panels = [...document.querySelectorAll(".tabPanel")];

// Inputs (YouTube/URL)
const titleInput = document.getElementById("titleInput");
const urlInput = document.getElementById("urlInput");
const dateInput = document.getElementById("dateInput");
const tagsInput = document.getElementById("tagsInput");
const descInput = document.getElementById("descInput");

// Inputs (Local file)
const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const localTitleInput = document.getElementById("localTitleInput");
const localDateInput = document.getElementById("localDateInput");
const localTagsInput = document.getElementById("localTagsInput");

// State pentru paginare
const PAGE_SIZE = 9;
let currentList = []; // lista filtrată/ordonată
let renderedCount = 0;

// ====== Helpers ======
function isYouTube(u) {
    try {
        const url = new URL(u);
        return /(^|\.)youtube\.com$/.test(url.hostname) || /(^|\.)youtu\.be$/.test(url.hostname);
    } catch { return false; }
}
function toYouTubeEmbed(u) {
    // acceptă watch?v=... sau youtu.be/...
    try {
        const url = new URL(u);
        if (/youtu\.be$/.test(url.hostname)) {
            const id = url.pathname.split("/").filter(Boolean)[0];
            return `https://www.youtube.com/embed/${id}`;
        }
        if (/youtube\.com$/.test(url.hostname)) {
            const id = url.searchParams.get("v");
            if (id) return `https://www.youtube.com/embed/${id}`;
            // playlist sau alte forme – afișăm URL original într-un <a>
        }
    } catch { }
    return null;
}
function formatDate(s) {
    try { return new Date(s + "T00:00:00").toLocaleDateString("ro-RO"); }
    catch { return s; }
}
function uniqueTags(list) {
    const set = new Set();
    list.forEach(v => (v.tags || []).forEach(t => set.add(t)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
}
function refreshTagFilter() {
    const tags = uniqueTags(videos);
    const sel = tagFilter;
    const prev = sel.value;
    sel.innerHTML = `<option value="">— Filtrează după tag —</option>` +
        tags.map(t => `<option value="${t}">${t}</option>`).join("");
    if (tags.includes(prev)) sel.value = prev;
}
function collectFilters() {
    const q = (searchInput.value || "").trim().toLowerCase();
    const tag = (tagFilter.value || "").trim().toLowerCase();
    const sort = sortSelect.value;
    // filtrează
    let list = videos.filter(v => {
        const inText = (v.title || "").toLowerCase().includes(q) ||
            (v.desc || "").toLowerCase().includes(q) ||
            (v.tags || []).some(t => t.toLowerCase().includes(q));
        const tagOk = !tag || (v.tags || []).map(t => t.toLowerCase()).includes(tag);
        return inText && tagOk;
    });
    // sortează
    if (sort === "newest") list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    else if (sort === "oldest") list.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    else if (sort === "title") list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    return list;
}

// ====== Render ======
function renderReset() {
    grid.innerHTML = "";
    renderedCount = 0;
    currentList = collectFilters();
    loadMoreBtn.hidden = currentList.length <= PAGE_SIZE;
    renderMore();
}
function renderMore() {
    const slice = currentList.slice(renderedCount, renderedCount + PAGE_SIZE);
    slice.forEach(renderCard);
    renderedCount += slice.length;
    loadMoreBtn.hidden = renderedCount >= currentList.length;
}

function renderCard(v) {
    const tpl = document.getElementById("cardTpl");
    const node = tpl.content.firstElementChild.cloneNode(true);

    const media = node.querySelector(".media");
    const title = node.querySelector(".title");
    const date = node.querySelector(".date");
    const desc = node.querySelector(".desc");
    const tagsEl = node.querySelector(".tags");

    // Media: YouTube iframe sau <video controls>
    if (v.url && isYouTube(v.url)) {
        const em = toYouTubeEmbed(v.url);
        if (em) {
            const ifr = document.createElement("iframe");
            ifr.src = em;
            ifr.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
            ifr.allowFullscreen = true;
            media.appendChild(ifr);
        } else {
            media.textContent = "Link YouTube neacceptat. Editează cardul.";
        }
    } else if (v.url && /\.(mp4)(\?.*)?$/i.test(v.url)) {
        const vid = document.createElement("video");
        vid.controls = true;
        vid.src = v.url;
        media.appendChild(vid);
    } else if (v.blobUrl) {
        const vid = document.createElement("video");
        vid.controls = true;
        vid.src = v.blobUrl;
        media.appendChild(vid);
    } else {
        media.textContent = "Niciun media. Editează cardul pentru a adăuga URL/fișier.";
    }

    title.textContent = v.title || "Fără titlu";
    date.textContent = v.date ? `Data: ${formatDate(v.date)}` : "";
    desc.textContent = v.desc || "";
    (v.tags || []).forEach(t => {
        const span = document.createElement("span");
        span.className = "tag";
        span.textContent = t;
        tagsEl.appendChild(span);
    });

    // Actions
    node.querySelector('[data-action="edit"]').addEventListener("click", () => openEdit(v.id));
    node.querySelector('[data-action="delete"]').addEventListener("click", () => {
        if (confirm("Ștergi acest clip?")) {
            videos = videos.filter(x => x.id !== v.id);
            saveVideos(videos);
            refreshTagFilter();
            renderReset();
        }
    });

    grid.appendChild(node);
}

// ====== Add / Edit ======
let editId = null; // null = add, altfel edit

function openAdd() {
    editId = null;
    // selectează tab-ul link
    activateTab("youtube");
    // reset inputs
    titleInput.value = "";
    urlInput.value = "";
    dateInput.value = new Date().toISOString().slice(0, 10);
    tagsInput.value = "";
    descInput.value = "";
    localTitleInput.value = "";
    localDateInput.value = new Date().toISOString().slice(0, 10);
    localTagsInput.value = "";
    fileInput.value = "";
    dlg.showModal();
}
function openEdit(id) {
    const v = videos.find(x => x.id === id);
    if (!v) return;
    editId = id;
    // mergem pe tab-ul potrivit
    if (v.blobUrl || (v.url && /\.mp4/i.test(v.url) && v.url.startsWith("blob:"))) {
        activateTab("local");
        localTitleInput.value = v.title || "";
        localDateInput.value = v.date || new Date().toISOString().slice(0, 10);
        localTagsInput.value = (v.tags || []).join(", ");
    } else {
        activateTab("youtube");
        titleInput.value = v.title || "";
        urlInput.value = v.url || "";
        dateInput.value = v.date || new Date().toISOString().slice(0, 10);
        tagsInput.value = (v.tags || []).join(", ");
        descInput.value = v.desc || "";
    }
    dlg.showModal();
}

function activateTab(name) {
    tabs.forEach(b => {
        const active = b.dataset.tab === name;
        b.classList.toggle("active", active);
    });
    panels.forEach(p => {
        p.style.display = (p.dataset.panel === name) ? "block" : "none";
    });
}

tabs.forEach(b => {
    b.addEventListener("click", () => activateTab(b.dataset.tab));
});

// Save din dialog
document.getElementById("saveBtn").addEventListener("click", (e) => {
    e.preventDefault();

    const active = tabs.find(t => t.classList.contains("active"))?.dataset.tab;
    let newItem = null;

    if (active === "youtube") {
        const title = titleInput.value.trim() || "Fără titlu";
        const url = urlInput.value.trim();
        const date = (dateInput.value || new Date().toISOString().slice(0, 10));
        const tags = tagsInput.value.split(",").map(s => s.trim()).filter(Boolean);
        const desc = descInput.value.trim();

        if (!url) { alert("Te rog adaugă un URL (YouTube sau .mp4)"); return; }

        newItem = { title, url, date, tags, desc };
    } else {
        // local file
        const file = fileInput.files?.[0];
        if (!file) { alert("Alege un fișier .mp4"); return; }
        const blobUrl = URL.createObjectURL(file);
        const title = (localTitleInput.value.trim() || file.name);
        const date = (localDateInput.value || new Date().toISOString().slice(0, 10));
        const tags = localTagsInput.value.split(",").map(s => s.trim()).filter(Boolean);
        newItem = { title, blobUrl, date, tags, desc: "" };
    }

    if (editId) {
        const idx = videos.findIndex(x => x.id === editId);
        if (idx >= 0) {
            videos[idx] = { ...videos[idx], ...newItem };
        }
    } else {
        videos.unshift({ id: Date.now(), ...newItem });
    }
    saveVideos(videos);
    refreshTagFilter();
    dlg.close();
    renderReset();
});

// Drag & drop pentru fișier local
["dragenter", "dragover"].forEach(ev => {
    dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add("drag"); });
});
["dragleave", "drop"].forEach(ev => {
    dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove("drag"); });
});
dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && f.type === "video/mp4") {
        fileInput.files = e.dataTransfer.files;
        localTitleInput.value ||= f.name.replace(/\.[^.]+$/, "");
    }
});
dropZone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    if (f && !localTitleInput.value) localTitleInput.value = f.name.replace(/\.[^.]+$/, "");
});

// ====== Căutare/Filtre/Sort ======
searchInput.addEventListener("input", renderReset);
sortSelect.addEventListener("change", renderReset);
tagFilter.addEventListener("change", renderReset);
btnAdd.addEventListener("click", openAdd);
loadMoreBtn.addEventListener("click", renderMore);

// ====== Export/Import ======
btnExport.addEventListener("click", () => {
    const data = JSON.stringify(videos, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vlog-videos.json";
    a.click();
    URL.revokeObjectURL(url);
});
importInput.addEventListener("change", () => {
    const f = importInput.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const arr = JSON.parse(reader.result);
            if (!Array.isArray(arr)) throw new Error("Format invalid");
            // normalizare minimă
            const cleaned = arr.map(x => ({
                id: x.id || Date.now() + Math.random(),
                title: x.title || "Fără titlu",
                url: x.url || "",
                blobUrl: x.blobUrl || "",
                date: x.date || new Date().toISOString().slice(0, 10),
                desc: x.desc || "",
                tags: Array.isArray(x.tags) ? x.tags.filter(Boolean) : []
            }));
            videos = cleaned;
            saveVideos(videos);
            refreshTagFilter();
            renderReset();
            alert("Import realizat.");
            importInput.value = "";
        } catch (err) {
            alert("Eroare la import: " + err.message);
        }
    };
    reader.readAsText(f);
});

// ====== Inițializare ======
refreshTagFilter();
renderReset();
