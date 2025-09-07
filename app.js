/* ====== CONFIG SUPABASE ====== */
const SUPABASE_URL = "https://njgvdvslmshwwwttbjzi.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qZ3ZkdnNsbXNod3d3dHRianppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcyMzE4ODgsImV4cCI6MjA3MjgwNzg4OH0.C0wWEbIefO8QxTiCNesHkyglgbxlw3SEq9ZwKr3YCUo";

/* URL-ul site-ului pentru redirect la magic-link — se calculează corect pentru GitHub Pages */
const SITE_URL = (() => {
    const u = new URL(window.location.href);
    let p = u.pathname.replace(/index\.html?$/i, "");
    if (!p.endsWith("/")) p += "/";
    return u.origin + p;
})();

/* ====== DOM ====== */
const grid = document.getElementById("grid");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const tagFilter = document.getElementById("tagFilter");
const btnAdd = document.getElementById("btnAdd");
const btnExport = document.getElementById("btnExport");
const importBtn = document.getElementById("importBtn");
const importInput = document.getElementById("importInput");
const loadMoreBtn = document.getElementById("loadMore");

const dlg = document.getElementById("addDialog");
const tabLink = document.getElementById("tabLink");
const tabUpload = document.getElementById("tabUpload");
const panelLink = document.getElementById("panelLink");
const panelUpload = document.getElementById("panelUpload");

const titleInput = document.getElementById("titleInput");
const urlInput = document.getElementById("urlInput");
const dateInput = document.getElementById("dateInput");
const tagsInput = document.getElementById("tagsInput");
const descInput = document.getElementById("descInput");

const fileInput = document.getElementById("fileInput");
const uTitleInput = document.getElementById("uTitleInput");
const uDateInput = document.getElementById("uDateInput");
const uTagsInput = document.getElementById("uTagsInput");
const chkPublicLink = document.getElementById("chkPublicLink");
const chkPublicUpload = document.getElementById("chkPublicUpload");
const prog = document.getElementById("uploadProgress");
const progInfo = document.getElementById("uploadInfo");

const saveBtn = document.getElementById("saveBtn");

/* Suportă ORICE denumire ai în pagină pentru butoanele de login */
const btnLoginA = document.getElementById("btnLogin");
const btnLogoutA = document.getElementById("btnLogout");
const btnLoginB = document.getElementById("loginBtn");
const btnLogoutB = document.getElementById("logoutBtn");
const who = document.getElementById("who");

/* ====== STATE ====== */
let supa = null;
let supaUser = null;

let videos = [];          // doar din cloud
let currentList = [];
let renderedCount = 0;
let editId = null;        // id rând (cloud) când editezi
let activeTab = "link";   // "link" | "upload"
const PAGE_SIZE = 9;

/* ====== HELPERS ====== */
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
function canEdit(row) {
    return !!(supaUser && row.owner && row.owner === supaUser.id);
}

/* ====== SUPABASE ====== */
async function supaInit() {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    supa = createClient(SUPABASE_URL, SUPABASE_ANON);

    // 1) Consumă codul PKCE din magic link (rezolvă bucla de login) + curăță URL-ul
    try {
        const fullUrl = window.location.href;
        if (fullUrl.includes("code=")) {
            await supa.auth.exchangeCodeForSession({ currentUrl: fullUrl });
            const url = new URL(fullUrl);
            url.searchParams.delete("code");
            url.searchParams.delete("state");
            history.replaceState({}, "", url.pathname + (url.search ? `?${url.searchParams.toString()}` : ""));
        }
        if (window.location.hash.includes("access_token")) {
            history.replaceState({}, "", window.location.pathname + window.location.search);
        }
    } catch (e) {
        console.warn("auth exchange/cleanup", e);
    }

    // 2) Sesiune curentă + subscribe la schimbări
    const { data: { session } } = await supa.auth.getSession();
    supaUser = session?.user || null;

    supa.auth.onAuthStateChange((_e, sess) => {
        supaUser = sess?.user || null;
        renderAuthUI();
        renderReset();
    });

    renderAuthUI();
}

/* Butoane login (detectează ambele seturi de ID-uri posibile) */
function bindAuthButtons() {
    const loginBtns = [btnLoginA, btnLoginB].filter(Boolean);
    const logoutBtns = [btnLogoutA, btnLogoutB].filter(Boolean);

    loginBtns.forEach(b => b.addEventListener("click", supaSignIn));
    logoutBtns.forEach(b => b.addEventListener("click", supaSignOut));
}
function renderAuthUI() {
    const loginBtns = [btnLoginA, btnLoginB].filter(Boolean);
    const logoutBtns = [btnLogoutA, btnLogoutB].filter(Boolean);
    loginBtns.forEach(b => b.style.display = supaUser ? "none" : "");
    logoutBtns.forEach(b => b.style.display = supaUser ? "" : "none");
    if (btnAdd) btnAdd.hidden = !supaUser;       // doar logat poți adăuga
    if (btnExport) btnExport.hidden = true;      // export local scos în mod online-only
    if (importBtn) importBtn.hidden = true;
    if (who) who.textContent = supaUser ? `(logat: ${supaUser.email || supaUser.id.slice(0, 6)}…)` : "";
}
async function supaSignIn() {
    const email = prompt("Email pentru logare (primești un link):");
    if (!email) return;
    const { error } = await supa.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: SITE_URL }
    });
    if (error) alert(error.message);
    else alert("Verifică emailul și apasă pe linkul primit.");
}
async function supaSignOut() {
    await supa.auth.signOut();
}

/* Upload/link/listare/delete */
async function supaUploadMp4(file, isPublic, meta) {
    if (!supaUser) throw new Error("Trebuie să fii logat.");
    const objectName = `${supaUser.id}/${crypto.randomUUID()}.mp4`;
    const { error: upErr } = await supa.storage.from("videos").upload(objectName, file, {
        contentType: "video/mp4",
        upsert: false
    });
    if (upErr) throw upErr;

    const row = {
        owner: supaUser.id,
        title: meta.title || "Fără titlu",
        description: meta.description || "",
        tags: meta.tags || [],
        recorded_on: meta.date || new Date().toISOString().slice(0, 10),
        storage_path: `videos/${objectName}`,
        source_url: null,
        is_public: !!isPublic
    };
    const { error: insErr } = await supa.from("videos").insert(row);
    if (insErr) throw insErr;
}

async function supaAddLink(url, isPublic, meta) {
    if (!supaUser) throw new Error("Trebuie să fii logat.");
    const row = {
        owner: supaUser.id,
        title: meta.title || "Fără titlu",
        description: meta.description || "",
        tags: meta.tags || [],
        recorded_on: meta.date || new Date().toISOString().slice(0, 10),
        storage_path: null,
        source_url: url,
        is_public: !!isPublic
    };
    const { error } = await supa.from("videos").insert(row);
    if (error) throw error;
}

async function supaUpdateLink(id, fields) {
    const { error } = await supa.from("videos").update(fields).eq("id", id);
    if (error) throw error;
}

async function supaDeleteVideo(row) {
    if (!row?.id) throw new Error("Lipsește id-ul videoclipului.");
    if (!supaUser) throw new Error("Trebuie să fii logat.");
    if (row.owner !== supaUser.id) throw new Error("Poți șterge doar clipurile tale.");

    if (row.storage_path) {
        const objectName = row.storage_path.replace(/^videos\//, "");
        try { await supa.storage.from("videos").remove([objectName]); } catch { }
    }
    const { error } = await supa.from("videos").delete().eq("id", row.id);
    if (error) throw error;
}

async function supaListVideos({ limit = 200, offset = 0 } = {}) {
    if (!supa) return [];
    if (!supaUser) {
        // vizitator: doar publice
        const { data, error } = await supa.from("videos")
            .select("*")
            .eq("is_public", true)
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);
        if (error) throw error;
        return data;
    } else {
        // logat: ale mele + publicul altora
        const mine = await supa.from("videos")
            .select("*").eq("owner", supaUser.id)
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);
        const pub = await supa.from("videos")
            .select("*").eq("is_public", true).neq("owner", supaUser.id)
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);
        if (mine.error) throw mine.error;
        if (pub.error) throw pub.error;
        return [...mine.data, ...pub.data];
    }
}

async function supaSignedUrl(storage_path) {
    const objectName = storage_path.replace(/^videos\//, "");
    const { data, error } = await supa.storage.from("videos").createSignedUrl(objectName, 60 * 60 * 12);
    if (error) throw error;
    return data.signedUrl;
}

/* ====== RENDER ====== */
async function loadForGrid() {
    const rows = await supaListVideos({ limit: 200 });
    const out = [];
    for (const r of rows) {
        let url = r.source_url || null;
        if (!url && r.storage_path) {
            try { url = await supaSignedUrl(r.storage_path); } catch { }
        }
        out.push({
            id: r.id,
            title: r.title,
            url,
            date: r.recorded_on,
            tags: r.tags || [],
            desc: r.description || "",
            is_public: !!r.is_public,
            storage_path: r.storage_path || null,
            owner: r.owner || null,
            source_url: r.source_url || null
        });
    }
    return out;
}

async function renderReset() {
    grid.innerHTML = "";
    renderedCount = 0;
    try {
        videos = await loadForGrid();
    } catch (e) {
        console.error(e);
        alert(e?.message || "Eroare la încărcarea listei din cloud");
        videos = [];
    }
    refreshTagFilter();
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

    const allow = canEdit(v);
    eb.style.display = allow ? "" : "none";
    db.style.display = allow ? "" : "none";

    eb.addEventListener("click", () => {
        if (!allow) return;
        editId = v.id;
        setTab("link"); // editezi meta/link; pentru fișier schimbarea se face prin ștergere+reupload
        titleInput.value = v.title || "";
        urlInput.value = v.source_url || v.url || "";
        dateInput.value = v.date || new Date().toISOString().slice(0, 10);
        tagsInput.value = (v.tags || []).join(", ");
        descInput.value = v.desc || "";
        chkPublicLink && (chkPublicLink.checked = !!v.is_public);
        dlg.showModal();
    });

    db.addEventListener("click", async () => {
        if (!allow) return;
        if (!confirm("Ștergi acest clip?")) return;
        try {
            await supaDeleteVideo(v);
            await renderReset();
        } catch (e) {
            console.error(e);
            alert(e?.message || "Eroare la ștergere");
        }
    });

    grid.appendChild(node);
}

/* ====== TAB-URI ====== */
function setTab(name) {
    activeTab = name; // "link" | "upload"
    tabLink.classList.toggle("active", name === "link");
    tabUpload.classList.toggle("active", name === "upload");
    panelLink.style.display = (name === "link") ? "block" : "none";
    panelUpload.style.display = (name === "upload") ? "block" : "none";
}
tabLink.addEventListener("click", () => setTab("link"));
tabUpload.addEventListener("click", () => setTab("upload"));

/* ====== ADD / EDIT ====== */
function openAdd() {
    if (!supaUser) return alert("Trebuie să fii logat.");
    editId = null;
    setTab("link");
    // reset link
    titleInput.value = "";
    urlInput.value = "";
    dateInput.value = new Date().toISOString().slice(0, 10);
    tagsInput.value = "";
    descInput.value = "";
    chkPublicLink && (chkPublicLink.checked = false);
    // reset upload
    fileInput.value = "";
    uTitleInput.value = "";
    uDateInput.value = new Date().toISOString().slice(0, 10);
    uTagsInput.value = "";
    chkPublicUpload && (chkPublicUpload.checked = false);
    prog.hidden = true; prog.value = 0; progInfo.textContent = "";
    dlg.showModal();
}
btnAdd?.addEventListener("click", openAdd);

/* ====== SAVE (Cloud-only) ====== */
saveBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!supaUser) return alert("Trebuie să fii logat.");

    try {
        if (activeTab === "link") {
            const title = (titleInput.value || "").trim() || "Fără titlu";
            const url = (urlInput.value || "").trim();
            if (!url) return alert("Pune URL (YouTube sau .mp4)");

            const date = dateInput.value || new Date().toISOString().slice(0, 10);
            const tags = (tagsInput.value || "").split(",").map(s => s.trim()).filter(Boolean);
            const description = (descInput.value || "").trim();
            const isPublic = chkPublicLink?.checked ?? false;

            if (editId) {
                // === EDIT (doar link/meta) – nu mai inserăm rând nou => nu apar dubluri
                await supaUpdateLink(editId, {
                    title, description, tags, recorded_on: date, source_url: url, is_public: isPublic
                });
            } else {
                // === ADD NEW
                await supaAddLink(url, isPublic, { title, description, tags, date });
            }
        } else {
            // === UPLOAD FILE ===
            if (editId) {
                alert("Pentru fișiere: șterge clipul vechi și încarcă altul (nu rescriem fișierul).");
                return;
            }
            const file = fileInput.files?.[0];
            if (!file) return alert("Alege un fișier .mp4");
            if (file.type !== "video/mp4") return alert("Accept doar .mp4");

            const title = (uTitleInput.value || file.name.replace(/\.[^.]+$/, "")).trim();
            const date = uDateInput.value || new Date().toISOString().slice(0, 10);
            const tags = (uTagsInput.value || "").split(",").map(s => s.trim()).filter(Boolean);
            const isPublic = chkPublicUpload?.checked ?? false;

            prog.hidden = false; prog.value = 5; progInfo.textContent = "Se urcă...";
            await supaUploadMp4(file, isPublic, { title, tags, date, description: "" });
            prog.hidden = true; progInfo.textContent = "";
        }

        dlg.close();
        await renderReset();
    } catch (err) {
        console.error(err);
        alert(err?.message || "Eroare la salvare");
    }
});

/* ====== FILTRE ====== */
searchInput.addEventListener("input", renderReset);
sortSelect.addEventListener("change", renderReset);
tagFilter.addEventListener("change", renderReset);
loadMoreBtn?.addEventListener("click", renderMore);

/* ====== INIT ====== */
(async () => {
    bindAuthButtons();
    await supaInit();
    await renderReset();
})();
