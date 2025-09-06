// --- IndexedDB helpers (local-only) ---
const DB_NAME = 'vlograzvan';
const STORE = 'files';

function idbOpen() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = (e) => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function idbPut(key, blob) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(blob, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function idbGet(key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

async function idbDel(key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function saveLocalBlob(file) {
    const key = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await idbPut(key, file);
    return { key, mime: file.type || 'application/octet-stream' };
}


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

// Dacă vrei seed la prima rulare, decomentează:
/*
let videos = loadVideos();
if (videos.length === 0) {
  videos = [{
    id: Date.now(),
    title: "Primul vlog – salut!",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    date: new Date().toISOString().slice(0,10),
    desc: "Exemplu. Înlocuiește cu clipurile tale.",
    tags: ["daily","intro"]
  }];
  saveVideos(videos);
}
*/
let videos = loadVideos();

// ====== Elemente din DOM ======
const grid = document.getElementById("grid");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const tagFilter = document.getElementById("tagFilter");
const btnAdd = document.getElementById("btnAdd");
const btnExport = document.getElementById("btnExport");
const importBtn = document.getElementById("importBtn");
const importInput = document.getElementById("importInput");
const loadMoreBtn = document.getElementById("loadMore");

// Auth local
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const who = document.getElementById("who");

// Dialog + taburi
const dlg = document.getElementById("addDialog");
const tabLink = document.getElementById("tabLink");
const tabUpload = document.getElementById("tabUpload");
const panelLink = document.getElementById("panelLink");
const panelUpload = document.getElementById("panelUpload");

// Inputs (Link)
const titleInput = document.getElementById("titleInput");
const urlInput = document.getElementById("urlInput");
const dateInput = document.getElementById("dateInput");
const tagsInput = document.getElementById("tagsInput");
const descInput = document.getElementById("descInput");

// Vizibilitate (Link)
const visLink = document.getElementById("visLink");

// Inputs (Upload local)
const fileInput = document.getElementById("fileInput");
const uTitleInput = document.getElementById("uTitleInput");
const uDateInput = document.getElementById("uDateInput");
const uTagsInput = document.getElementById("uTagsInput");
const visUpload = document.getElementById("visUpload");
const prog = document.getElementById("uploadProgress");
const progInfo = document.getElementById("uploadInfo");

const saveBtn = document.getElementById("saveBtn");

// ====== State ======
let isAdmin = false;
let currentList = [];
let renderedCount = 0;
let editId = null;
let activeTab = "link";
const PAGE_SIZE = 9;

// ====== Helpers ======
function isYouTube(u) {
    try {
        const url = new URL(u);
        return /(^|\.)youtube\.com$/.test(url.hostname) || /(^|\.)youtu\.be$/.test(url.hostname);
    } catch { return false; }
}
function toYouTubeEmbed(u) {
    try {
        const url = new URL(u);
        if (/youtu\.be$/.test(url.hostname)) {
            const id = url.pathname.split("/").filter(Boolean)[0];
            return `https://www.youtube.com/embed/${id}`;
        }
        if (/youtube\.com$/.test(url.hostname)) {
            const id = url.searchParams.get("v");
            if (id) return `https://www.youtube.com/embed/${id}`;
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
    const prev = tagFilter.value || "";
    const tags = uniqueTags(videos);
    tagFilter.innerHTML = `<option value="">— Filtrează după tag —</option>` +
        tags.map(t => `<option value="${t}">${t}</option>`).join("");
    if (tags.includes(prev)) tagFilter.value = prev;
}
function collectFilters() {
    const q = (searchInput.value || "").trim().toLowerCase();
    const tag = (tagFilter.value || "").trim().toLowerCase();
    const sort = (sortSelect.value || "newest");

    let list = videos.filter(v => {
        const inText = (v.title || "").toLowerCase().includes(q) ||
            (v.desc || "").toLowerCase().includes(q) ||
            (v.tags || []).some(t => t.toLowerCase().includes(q));
        const tagOk = !tag || (v.tags || []).map(t => t.toLowerCase()).includes(tag);
        const visibleOk = isAdmin || ((v.visibility || 'public') === 'public');
        return inText && tagOk && visibleOk;
    });

    if (sort === "newest") list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    else if (sort === "oldest") list.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    else if (sort === "title") list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));

    return list;
}

function sanitize(name) {
    return name.toLowerCase().replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(0, 80);
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

    // Media
    if (v.url && isYouTube(v.url)) {
        const em = toYouTubeEmbed(v.url);
        if (em) {
            const ifr = document.createElement("iframe");
            ifr.src = em;
            ifr.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
            ifr.allowFullscreen = true;
            media.appendChild(ifr);
        } else {
            media.textContent = "Link YouTube neacceptat.";
        }
    } else if (v.url && /\.(mp4)(\?.*)?$/i.test(v.url)) {
        const vid = document.createElement("video");
        vid.controls = true;
        vid.src = v.url;
        media.appendChild(vid);
    } else if (v.localKey) {
        media.textContent = "Se încarcă fișierul local...";
        idbGet(v.localKey).then(blob => {
            if (!blob) { media.textContent = "Fișier local indisponibil pe acest dispozitiv."; return; }
            const url = URL.createObjectURL(blob);
            if ((v.localMime || '').startsWith('image/')) {
                const img = document.createElement('img'); img.src = url; img.style.maxWidth = '100%'; img.style.display = 'block'; media.innerHTML = ''; media.appendChild(img);
            } else {
                const vid = document.createElement('video'); vid.controls = true; vid.src = url; media.innerHTML = ''; media.appendChild(vid);
            }
        }).catch(() => { media.textContent = 'Eroare la fișierul local.'; });
    } else {
        media.textContent = "Adaugă un URL sau un fișier .mp4.";
    }

    const badge = document.createElement("div");
    badge.className = "muted";
    badge.style.margin = ".4rem .9rem 0";
    badge.style.fontSize = ".8rem";
    badge.textContent = ((v.visibility || "public").toUpperCase());
    node.insertBefore(badge, node.querySelector(".meta"));

    title.textContent = v.title || "Fără titlu";
    date.textContent = v.date ? `Data: ${formatDate(v.date)}` : "";
    desc.textContent = v.desc || "";

    (v.tags || []).forEach(t => {
        const s = document.createElement("span");
        s.className = "tag";
        s.textContent = t;
        tagsEl.appendChild(s);
    });

    const eb = node.querySelector('[data-action="edit"]');
    const db = node.querySelector('[data-action="delete"]');
    eb.style.display = isAdmin ? "" : "none";
    db.style.display = isAdmin ? "" : "none";

    eb.addEventListener("click", () => openEdit(v.id));
    db.addEventListener("click", () => {
        if (!confirm("Ștergi acest clip?")) return;
        if (v.localKey) { try { idbDel(v.localKey); } catch (e) { } }
        videos = videos.filter(x => x.id !== v.id);
        saveVideos(videos);
        refreshTagFilter();
        renderReset();
    });

    grid.appendChild(node);
}

// ====== Tab-uri dialog ======
function setTab(name) {
    activeTab = name; // "link" | "upload"
    tabLink.classList.toggle("active", name === "link");
    tabUpload.classList.toggle("active", name === "upload");
    panelLink.style.display = (name === "link") ? "block" : "none";
    panelUpload.style.display = (name === "upload") ? "block" : "none";
}
tabLink.addEventListener("click", () => setTab("link"));
tabUpload.addEventListener("click", () => setTab("upload"));

// ====== Add / Edit ======
function openAdd() {
    if (!isAdmin) return alert("Doar adminul poate adăuga.");
    editId = null;
    setTab("link");
    // Reset Link
    titleInput.value = "";
    urlInput.value = "";
    dateInput.value = new Date().toISOString().slice(0, 10);
    tagsInput.value = "";
    descInput.value = "";
    if (visLink) visLink.checked = true;
    if (visUpload) visUpload.checked = true;
    // Reset Upload
    fileInput.value = "";
    uTitleInput.value = "";
    uDateInput.value = new Date().toISOString().slice(0, 10);
    uTagsInput.value = "";
    prog.hidden = true; prog.value = 0; progInfo.textContent = "";
    dlg.showModal();
}
function openEdit(id) {
    if (!isAdmin) return;
    const v = videos.find(x => x.id === id);
    if (!v) return;
    editId = id;
    setTab("link");
    titleInput.value = v.title || "";
    urlInput.value = v.url || "";
    dateInput.value = v.date || new Date().toISOString().slice(0, 10);
    tagsInput.value = (v.tags || []).join(", ");
    descInput.value = v.desc || "";
    if (visLink) visLink.checked = (v.visibility !== "private");
    dlg.showModal();
}

saveBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (!isAdmin) return alert("Doar adminul poate salva.");

    if (activeTab === "link") {
        const title = titleInput.value.trim() || "Fără titlu";
        const url = urlInput.value.trim();
        if (!url) { alert("Pune URL (YouTube sau .mp4)"); return; }
        const date = dateInput.value || new Date().toISOString().slice(0, 10);
        const tags = tagsInput.value.split(",").map(s => s.trim()).filter(Boolean);
        const desc = (descInput.value || "").trim();
        const visibility = visLink && visLink.checked ? "public" : "private";

        if (editId) {
            const idx = videos.findIndex(x => x.id === editId);
            if (idx >= 0) videos[idx] = { ...videos[idx], title, url, date, tags, desc, blobUrl: "" };
        } else {
            videos.unshift({ id: Date.now(), title, url, date, tags, desc, blobUrl: "" });
        }
        saveVideos(videos);
        refreshTagFilter();
        dlg.close();
        renderReset();
        return;
    }

    // Upload local .mp4 (nu cloud)
    const file = fileInput.files?.[0];
    if (!file) { alert("Alege un fișier .mp4"); return; }
    if (file.type !== "video/mp4") { alert("Accept doar .mp4"); return; }

    const title = (uTitleInput.value.trim() || file.name.replace(/\.[^.]+$/, ""));
    const date = uDateInput.value || new Date().toISOString().slice(0, 10);
    const tags = uTagsInput.value.split(",").map(s => s.trim()).filter(Boolean);

    const visibility = visUpload && visUpload.checked ? "public" : "private";

    const { key, mime } = await saveLocalBlob(file);
    if (editId) {
        const idx = videos.findIndex(x => x.id === editId);
        if (idx >= 0) videos[idx] = { ...videos[idx], title, date, tags, desc: "", url: "", localKey: key, localMime: mime, visibility };
    } else {
        videos.unshift({ id: Date.now(), title, date, tags, desc: "", url: "", localKey: key, localMime: mime, visibility });
    }
    saveVideos(videos);
    refreshTagFilter();
    dlg.close();
    renderReset();
});

// ====== Căutare/filtre/paginare ======
searchInput.addEventListener("input", renderReset);
sortSelect.addEventListener("change", renderReset);
tagFilter.addEventListener("change", renderReset);
if (btnAdd) btnAdd.addEventListener("click", openAdd);
if (loadMoreBtn) loadMoreBtn.addEventListener("click", renderMore);

// ====== Export/Import ======
if (btnExport) btnExport.addEventListener("click", () => {
    const data = JSON.stringify(videos, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "vlog-videos.json"; a.click();
    URL.revokeObjectURL(url);
});
if (importBtn) importBtn.addEventListener("click", () => importInput.click());
if (importInput) importInput.addEventListener("change", () => {
    const f = importInput.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const arr = JSON.parse(reader.result);
            if (!Array.isArray(arr)) throw new Error("Format invalid");
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

// ====== Admin local (fără Firebase) ======
const ADMIN_FLAG = "vlogAdmin"; // 1 = logat
isAdmin = localStorage.getItem(ADMIN_FLAG) === "1";

function refreshAdminUI() {
    if (btnAdd) btnAdd.hidden = !isAdmin;
    if (btnExport) btnExport.hidden = !isAdmin;
    if (importBtn) importBtn.hidden = !isAdmin;
    if (loginBtn) loginBtn.style.display = isAdmin ? "none" : "";
    if (logoutBtn) logoutBtn.style.display = isAdmin ? "" : "none";
    if (who) who.textContent = isAdmin ? "(Mod admin local)" : "";
}

if (loginBtn) {
    loginBtn.addEventListener("click", () => {
        const pass = prompt("Parola admin (local)");
        if (pass === "razvan") { // schimbă parola cum vrei
            isAdmin = true;
            localStorage.setItem(ADMIN_FLAG, "1");
            refreshAdminUI();
        } else if (pass !== null) {
            alert("Parolă greșită.");
        }
    });
}
if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        isAdmin = false;
        localStorage.removeItem(ADMIN_FLAG);
        refreshAdminUI();
    });
}

// ====== Inițializare ======
refreshAdminUI();
refreshTagFilter();
renderReset();







STYLES.CSS =

/* ===== Tema neagră (dark) — styles.css ===== */

:root {
    --bg: #0b0b0b;
    --panel: #0f0f0f;
    --panel - 2: #0c0c0c;
    --text: #e5e7eb;
    --text - muted: #b3b8c4;
    --line: #222;
    --line - 2: #333;
    --primary: #3b82f6;
    --danger: #ef4444;
    --tag: #333;
    --focus: #60a5fa;
}

* {
    box- sizing: border - box;
}

html, body {
    height: 100 %;
}

body {
    margin: 0 auto;
    max - width: 1100px;
    padding: 1.2rem;
    color: var(--text);
    background: var(--bg);
    font - family: system - ui, -apple - system, Segoe UI, Roboto, Ubuntu, "Noto Sans", sans - serif;
    line - height: 1.4;
}

/* Titlu */
h1 {
    margin: .2rem 0 1rem;
    font - size: 2.2rem;
    font - weight: 800;
}

/* Utilitare */
.muted {
    color: var(--text - muted);
}

.spacer {
    flex: 1;
}

/* Toolbar */
.toolbar {
    display: flex;
    flex - wrap: wrap;
    gap: .5rem;
    align - items: center;
    margin: 1rem 0;
}

/* Controale */
input[type = "search"],
    input[type = "text"],
    input[type = "date"],
    select {
    background: #111;
    border: 1px solid var(--line - 2);
    color: #ddd;
    padding: .55rem .75rem;
    border - radius: .55rem;
    outline: none;
}

input::placeholder {
    color: #8a90a0;
}

select {
    cursor: pointer;
}

input: focus, select: focus, textarea:focus {
    border - color: var(--focus);
    box - shadow: 0 0 0 3px #60a5fa22;
}

/* Butoane */
button {
    font: inherit;
    color: inherit;
}

.ghost {
    background: transparent;
    border: 1px solid var(--line - 2);
    color: #ddd;
    padding: .48rem .75rem;
    border - radius: .6rem;
    cursor: pointer;
}

    .ghost:hover {
    background: #141414;
}

.primary {
    background: var(--primary);
    border: 0;
    color: #fff;
    padding: .52rem .9rem;
    border - radius: .6rem;
    cursor: pointer;
}

    .primary:hover {
    filter: brightness(1.05);
}

.mini {
    padding: .35rem .6rem;
    border - radius: .45rem;
    border: 1px solid var(--line - 2);
    background: transparent;
    color: #ddd;
    cursor: pointer;
}

.danger {
    border - color: #803;
    color: #fca5a5;
}

.mini:hover {
    background: #151515;
}

/* Grid de carduri */
.grid {
    display: grid;
    grid - template - columns: repeat(auto - fill, minmax(320px, 1fr));
    gap: 1rem;
    margin - top: 1rem;
}

/* Card */
article.card {
    background: var(--panel);
    border: 1px solid var(--line);
    border - radius: 14px;
    overflow: hidden;
}

.media iframe,
.media video {
    display: block;
    width: 100 %;
    aspect - ratio: 16 / 9;
    border: 0;
    background: #000;
}

.meta {
    padding: .9rem;
}

    .meta.title {
    margin: 0 0 .15rem;
}

    .meta.date {
    margin: .15rem 0 0;
}

    .meta.desc {
    margin: .35rem 0 0;
}

.tags {
    display: flex;
    gap: .35rem;
    flex - wrap: wrap;
    margin - top: .35rem;
}

.tag {
    border: 1px solid var(--tag);
    border - radius: 999px;
    padding: .12rem .6rem;
    font - size: .8rem;
    color: #d1d5db;
}

/* Acțiuni card */
.cardActions {
    display: flex;
    gap: .5rem;
    padding: .75rem;
    border - top: 1px solid var(--line);
}

/* Dialog (add/edit) */
dialog {
    max - width: 700px;
    border: 1px solid var(--line - 2);
    background: var(--panel - 2);
    color: var(--text);
    border - radius: 14px;
    padding: 1rem 1.1rem;
}

dialog::backdrop {
    background: #000a;
}

    dialog form {
    display: grid;
    gap: .7rem;
}

.row {
    display: grid;
    grid - template - columns: 1fr 1fr;
    gap: .7rem;
}

textarea {
    background: #111;
    border: 1px solid var(--line - 2);
    color: #ddd;
    padding: .6rem;
    border - radius: .6rem;
    min - height: 90px;
    resize: vertical;
}

/* Segmented (tab-uri) */
.seg {
    display: inline - flex;
    border: 1px solid var(--line - 2);
    border - radius: .6rem;
    overflow: hidden;
}

    .seg button {
    border: 0;
    background: #0f0f0f;
    color: #ddd;
    padding: .5rem .8rem;
    cursor: pointer;
}

        .seg button.active {
    background: #1b1b1b;
    color: #fff;
}

/* Progress upload */
progress {
    width: 100 %;
    height: 10px;
    accent - color: var(--primary);
}

/* DropZone pentru upload .mp4 */
.dropZone {
    border: 2px dashed var(--line - 2);
    border - radius: 10px;
    padding: 16px;
    text - align: center;
    display: flex;
    flex - direction: column;
    gap: .4rem;
    align - items: center;
    justify - content: center;
    min - height: 110px;
    background: #0f0f0f;
}

    .dropZone.drag {
    border - color: #7dd3fc;
    background: #0b1120;
}

    .dropZone strong {
    color: #c7d2fe;
}

/* Responsive */
@media(max - width: 700px) {
    .row {
        grid - template - columns: 1fr;
    }

    h1 {
        font - size: 1.8rem;
    }

    .grid {
        grid - template - columns: 1fr;
    }
}

/* Scrollbar discret (Chromium/Edge) */
*:: -webkit - scrollbar {
    width: 10px;
    height: 10px;
}

*:: -webkit - scrollbar - thumb {
    background: #1f2937;
    border - radius: 6px;
}

    *:: -webkit - scrollbar - thumb:hover {
    background: #374151;
}