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

// Inputs (Upload local)
const fileInput = document.getElementById("fileInput");
const uTitleInput = document.getElementById("uTitleInput");
const uDateInput = document.getElementById("uDateInput");
const uTagsInput = document.getElementById("uTagsInput");
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
        return inText && tagOk;
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
async function renderReset() {
    grid.innerHTML = "";
    renderedCount = 0;
    videos = await loadForGrid();
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
    node.dataset.id = v.id;

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
    } else if (v.blobUrl) {
        const vid = document.createElement("video");
        vid.controls = true;
        vid.src = v.blobUrl;
        media.appendChild(vid);
    } else {
        media.textContent = "Adaugă un URL sau un fișier .mp4.";
    }

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
    window.editRow = v;
    dlg.showModal();
}

saveBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    // === CLOUD (Supabase) ===
    if (supa && supaUser) {
        try {
            if (activeTab === "link") {
                const title = (titleInput.value || "").trim() || "Fără titlu";
                const url = (urlInput.value || "").trim();
                if (!url) { alert("Pune URL (YouTube sau .mp4)"); return; }

                const date = dateInput.value || new Date().toISOString().slice(0, 10);
                const tags = (tagsInput.value || "").split(",").map(s => s.trim()).filter(Boolean);
                const desc = (descInput.value || "").trim();
                const isPublic = document.getElementById("chkPublicLink")?.checked ?? false;

                await supaAddLink(url, isPublic, { title, description: desc, tags, date });
            } else {
                const file = fileInput.files?.[0];
                if (!file) { alert("Alege un fișier .mp4"); return; }
                if (file.type !== "video/mp4") { alert("Accept doar .mp4"); return; }

                const title = (uTitleInput.value || file.name.replace(/\.[^.]+$/, "")).trim();
                const date = uDateInput.value || new Date().toISOString().slice(0, 10);
                const tags = (uTagsInput.value || "").split(",").map(s => s.trim()).filter(Boolean);
                const isPublic = document.getElementById("chkPublicUpload")?.checked ?? false;


                await supaUploadMp4(file, isPublic, { title, tags, date, description: "" });
            }


            dlg.close();
            if (typeof renderReset === "function") await renderReset();
            return; // oprim fluxul vechi local
        } catch (err) {
            console.error(err);
            alert(err?.message || "Eroare la încărcare în cloud");
            return;
        }
    }

    if (!isAdmin) return alert("Doar adminul poate salva.");

    if (activeTab === "link") {
        const title = titleInput.value.trim() || "Fără titlu";
        const url = urlInput.value.trim();
        if (!url) { alert("Pune URL (YouTube sau .mp4)"); return; }
        const date = dateInput.value || new Date().toISOString().slice(0, 10);
        const tags = tagsInput.value.split(",").map(s => s.trim()).filter(Boolean);
        const desc = (descInput.value || "").trim();

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

    const blobUrl = URL.createObjectURL(file);
    if (editId) {
        const idx = videos.findIndex(x => x.id === editId);
        if (idx >= 0) videos[idx] = { ...videos[idx], title, blobUrl, url: "", date, tags, desc: "" };
    } else {
        videos.unshift({ id: Date.now(), title, blobUrl, url: "", date, tags, desc: "" });
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
// ===== SUPABASE: inițializare + butoane Login/Logout =====
const SUPABASE_URL = "https://njgvdvslmshwwwttbjzi.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qZ3ZkdnNsbXNod3d3dHRianppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcyMzE4ODgsImV4cCI6MjA3MjgwNzg4OH0.C0wWEbIefO8QxTiCNesHkyglgbxlw3SEq9ZwKr3YCUo";

let supa = null;
let supaUser = null;

async function supaInit() {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    supa = createClient(SUPABASE_URL, SUPABASE_ANON);

    const { data: { session } } = await supa.auth.getSession();
    supaUser = session?.user || null;

    supa.auth.onAuthStateChange((_e, s) => {
        supaUser = s?.user || null;
        renderAuthUI();
        if (typeof renderReset === "function") renderReset();
    });
}

function renderAuthUI() {
    const inBtn = document.getElementById('btnLogin');
    const outBtn = document.getElementById('btnLogout');
    if (!inBtn || !outBtn) return;
    inBtn.style.display = supaUser ? "none" : "";
    outBtn.style.display = supaUser ? "" : "none";
}

async function supaSignIn() {
    const email = prompt("Email pentru logare (primești un link):");
    if (!email) return;
    const { error } = await supa.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.href }
    });
    if (error) alert(error.message);
    else alert("Verifică emailul și apasă pe linkul primit.");
}

async function supaSignOut() { await supa.auth.signOut(); }
// pornește după ce DOM-ul este încărcat
document.addEventListener('DOMContentLoaded', async () => {
    await supaInit();
    renderAuthUI();
    document.getElementById('btnLogin')?.addEventListener('click', supaSignIn);
    document.getElementById('btnLogout')?.addEventListener('click', supaSignOut);
});
// ====== SUPABASE: Upload MP4 + Add Link + Utilitare ======

// 1) Încarcă .mp4 în bucketul "videos" și scrie rândul în tabela public.videos
async function supaUploadMp4(file, isPublic, meta) {
    if (!supa) throw new Error("Supabase nu e inițializat.");
    if (!supaUser) throw new Error("Trebuie să fii logat.");
    if (!file || file.type !== "video/mp4") throw new Error("Alege un fișier .mp4");

    const objectName = `${supaUser.id}/${crypto.randomUUID()}.mp4`;
    const { error: upErr } = await supa.storage
        .from('videos')
        .upload(objectName, file, { contentType: 'video/mp4', upsert: false });
    if (upErr) throw upErr;

    const row = {
        owner: supaUser.id,
        title: meta.title || "Fără titlu",
        description: meta.description || "",
        tags: meta.tags || [],
        recorded_on: meta.date || new Date().toISOString().slice(0, 10),
        storage_path: `videos/${objectName}`,  // <- fișier în Storage
        source_url: null,                      // <- nu e link extern
        is_public: !!isPublic
    };
    const { error: insErr } = await supa.from('videos').insert(row);
    if (insErr) throw insErr;
}

// 2) Adaugă un clip ca LINK (YouTube sau .mp4 găzduit extern)
async function supaAddLink(url, isPublic, meta) {
    if (!supa) throw new Error("Supabase nu e inițializat.");
    if (!supaUser) throw new Error("Trebuie să fii logat.");
    if (!url) throw new Error("Lipsește URL-ul.");

    const row = {
        owner: supaUser.id,
        title: meta.title || "Fără titlu",
        description: meta.description || "",
        tags: meta.tags || [],
        recorded_on: meta.date || new Date().toISOString().slice(0, 10),
        storage_path: null,      // <- nu e fișier în Storage
        source_url: url,         // <- link extern
        is_public: !!isPublic
    };
    const { error } = await supa.from('videos').insert(row);
    if (error) throw error;
}

// 3) (vom folosi în pașii următori) – listare și URL semnat pt. redare
async function supaListVideos({ limit = 200, offset = 0 } = {}) {
    if (!supa) return [];
    if (!supaUser) {
        const { data, error } = await supa.from('videos')
            .select('*').eq('is_public', true)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
        if (error) throw error;
        return data;
    } else {
        const mine = await supa.from('videos')
            .select('*').eq('owner', supaUser.id)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
        const pub = await supa.from('videos')
            .select('*').eq('is_public', true).neq('owner', supaUser.id)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
        if (mine.error) throw mine.error;
        if (pub.error) throw pub.error;
        return [...mine.data, ...pub.data];
    }
}

async function supaGetPlayableUrl(row) {
    if (row.source_url) return row.source_url;           // YouTube / mp4 extern
    if (!row.storage_path) return null;                  // nimic de redat
    const objectName = row.storage_path.replace(/^videos\//, '');
    const { data, error } = await supa.storage
        .from('videos')
        .createSignedUrl(objectName, 60 * 60 * 12);            // 12 ore
    if (error) throw error;
    return data.signedUrl;
}
// ====== Încarcă date pentru grilă (Cloud dacă există, altfel fallback local) ======
// Încarcă datele pentru grilă DOAR din Supabase (cloud only)
async function loadForGrid() {
    if (supa) {
        const rows = await supaListVideos({ limit: 200 });
        const out = [];

        for (const r of rows) {
            let url = r.source_url || null;

            // dacă e fișier în Storage, generează URL semnat (valabil 12h)
            if (!url && r.storage_path) {
                const objectName = r.storage_path.replace(/^videos\//, '');
                const { data } = await supa.storage
                    .from('videos')
                    .createSignedUrl(objectName, 60 * 60 * 12);
                url = data?.signedUrl || null;
            }

            out.push({
                id: r.id,
                title: r.title,
                url,
                date: r.recorded_on,
                tags: r.tags,
                desc: r.description,
                is_public: r.is_public,
                storage_path: r.storage_path,
                owner: r.owner,
            });
        }

        return out;
    }

    // dacă Supabase nu e inițializat / nu ești logat, nu afișăm nimic
    return [];
}
// ===== Ștergere din Supabase (rând + fișier din Storage dacă există) =====
async function supaDeleteVideo(row) {
    if (!row?.id) throw new Error("Lipsește id-ul videoclipului.");
    // șterge fișierul din Storage, dacă există
    if (row.storage_path) {
        const objectName = row.storage_path.replace(/^videos\//, '');
        try { await supa.storage.from('videos').remove([objectName]); } catch { }
    }
    // șterge rândul din tabel
    const { error } = await supa.from('videos').delete().eq('id', row.id);
    if (error) throw error;
}


const grid = document.getElementById('grid');

grid.addEventListener('click', async (e) => {
    const card = e.target.closest('article.card');
    if (!card) return;
    const id = card.dataset.id;

    // === ȘTERGE ===
    const delBtn = e.target.closest('[data-action="delete"]');
    if (delBtn) {
        e.preventDefault();
        if (!confirm('Sigur ștergi acest clip?')) return;

        const row = videos.find(v => String(v.id) === String(id));
        if (supa && supaUser && row) {
            try {
                await supaDeleteVideo(row);   // funcția pe care ai pus-o la final
                await renderReset();          // reîncarcă grila din cloud
            } catch (err) {
                console.error(err);
                alert(err?.message || 'Eroare la ștergere');
            }
        }
        return;
    }

    // === EDIT ===
    const editBtn = e.target.closest('[data-action="edit"]');
    if (editBtn) {
        e.preventDefault();
        openEdit(id); // deschide dialogul cu datele rândului
    }
});
