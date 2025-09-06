// --- Firebase (CDN v12.2.1) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
    getAuth, onAuthStateChanged,
    signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
    getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc,
    serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// --- CONFIGUL TĂU (din Firebase) ---
const firebaseConfig = {
    apiKey: "AIzaSyBzEv4T0DJOs4uAGqQHqnSxYS3Z-vVgc8Y",
    authDomain: "vlog-razvan.firebaseapp.com",
    projectId: "vlog-razvan",
    storageBucket: "vlog-razvan.firebasestorage.app",
    messagingSenderId: "706536997376",
    appId: "1:706536997376:web:6a79c94db29ed903628ee5"
};

// --- Init Firebase ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ========================= UI & STATE =========================
const grid = document.getElementById("grid");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const tagFilter = document.getElementById("tagFilter");
const btnAdd = document.getElementById("btnAdd");
const dlg = document.getElementById("addDialog");
const btnExport = document.getElementById("btnExport");
const importInput = document.getElementById("importInput");
const loadMoreBtn = document.getElementById("loadMore");

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const who = document.getElementById("who");

// Add dialog controls
const tabs = [...document.querySelectorAll(".tab")];
const panels = [...document.querySelectorAll(".tabPanel")];

// Inputs (YouTube/URL)
const titleInput = document.getElementById("titleInput");
const urlInput = document.getElementById("urlInput");
const dateInput = document.getElementById("dateInput");
const tagsInput = document.getElementById("tagsInput");
const descInput = document.getElementById("descInput");

// Inputs (Local file) – momentan NU încărcăm fișierul; păstrăm tab-ul pentru viitor (upload în Storage)
const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const localTitleInput = document.getElementById("localTitleInput");
const localDateInput = document.getElementById("localDateInput");
const localTagsInput = document.getElementById("localTagsInput");

const PAGE_SIZE = 9;
let allVideos = [];      // lista din cloud
let currentList = [];    // lista filtrată/ordonată
let renderedCount = 0;
let isAdmin = false;     // devine true după login
let editId = null;

// ========================= HELPERS =========================
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
    return [...set].sort((a, b) => a.localeCompare(b));
}
function refreshTagFilter() {
    const tags = uniqueTags(allVideos);
    const prev = tagFilter.value || "";
    tagFilter.innerHTML = `<option value="">— Filtrează după tag —</option>` +
        tags.map(t => `<option value="${t}">${t}</option>`).join("");
    if (tags.includes(prev)) tagFilter.value = prev;
}
function collectFilters() {
    const q = (searchInput.value || "").trim().toLowerCase();
    const tag = (tagFilter.value || "").trim().toLowerCase();
    const sort = sortSelect.value;

    let list = allVideos.filter(v => {
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

// ========================= RENDER =========================
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
        media.textContent = "Adaugă un URL YouTube sau un .mp4 găzduit online.";
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

    // acțiuni vizibile doar pentru admin
    const editBtn = node.querySelector('[data-action="edit"]');
    const delBtn = node.querySelector('[data-action="delete"]');
    editBtn.style.display = isAdmin ? "" : "none";
    delBtn.style.display = isAdmin ? "" : "none";

    editBtn.addEventListener("click", () => openEdit(v.id));
    delBtn.addEventListener("click", async () => {
        if (!confirm("Ștergi acest clip?")) return;
        await deleteDoc(doc(db, "videos", v.id));
        await reloadFromCloud();
    });

    grid.appendChild(node);
}

// ========================= CLOUD I/O =========================
const videosCol = collection(db, "videos");

async function reloadFromCloud() {
    const qy = query(videosCol, orderBy("date", "desc"));
    const snap = await getDocs(qy);
    allVideos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    refreshTagFilter();
    renderReset();
}

// ========================= ADD / EDIT =========================
function activateTab(name) {
    tabs.forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    panels.forEach(p => p.style.display = (p.dataset.panel === name) ? "block" : "none");
}
tabs.forEach(b => b.addEventListener("click", () => activateTab(b.dataset.tab)));

function openAdd() {
    if (!isAdmin) { alert("Doar administratorul poate adăuga."); return; }
    editId = null;
    activateTab("youtube");
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
    if (!isAdmin) return;
    const v = allVideos.find(x => x.id === id);
    if (!v) return;
    editId = id;
    activateTab("youtube");
    titleInput.value = v.title || "";
    urlInput.value = v.url || "";
    dateInput.value = v.date || new Date().toISOString().slice(0, 10);
    tagsInput.value = (v.tags || []).join(", ");
    descInput.value = v.desc || "";
    dlg.showModal();
}

document.getElementById("saveBtn").addEventListener("click", async (e) => {
    e.preventDefault();
    if (!isAdmin) { alert("Doar administratorul poate salva."); return; }

    const active = tabs.find(t => t.classList.contains("active"))?.dataset.tab;

    if (active === "youtube") {
        const title = titleInput.value.trim() || "Fără titlu";
        const url = urlInput.value.trim();
        const date = (dateInput.value || new Date().toISOString().slice(0, 10));
        const tags = tagsInput.value.split(",").map(s => s.trim()).filter(Boolean);
        const desc = (descInput.value || "").trim();
        if (!url) { alert("Adaugă un URL (YouTube sau .mp4 găzduit)."); return; }

        if (editId) {
            await updateDoc(doc(db, "videos", editId), { title, url, date, tags, desc });
        } else {
            await addDoc(videosCol, { title, url, date, tags, desc, createdAt: serverTimestamp() });
        }
        dlg.close();
        await reloadFromCloud();
    } else {
        // Tabul „Fișier local” – ținut pentru viitor (upload în Storage).
        alert("Încărcarea fișierelor locale în cloud o activăm imediat ce vrei. Deocamdată folosește un URL YouTube sau .mp4 găzduit.");
    }
});

// Drag & drop UI – păstrat pentru viitor (upload)
["dragenter", "dragover"].forEach(ev => {
    dropZone?.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add("drag"); });
});
["dragleave", "drop"].forEach(ev => {
    dropZone?.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.remove("drag"); });
});
dropZone?.addEventListener("drop", (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) localTitleInput.value ||= f.name.replace(/\.[^.]+$/, "");
});
dropZone?.addEventListener("click", () => fileInput?.click());

// ========================= Căutare/Filtre/Paginate =========================
searchInput.addEventListener("input", renderReset);
sortSelect.addEventListener("change", renderReset);
tagFilter.addEventListener("change", renderReset);
btnAdd.addEventListener("click", openAdd);
loadMoreBtn.addEventListener("click", renderMore);

// ========================= Export/Import (admin) =========================
btnExport.addEventListener("click", () => {
    const data = JSON.stringify(allVideos, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "vlog-videos.json"; a.click();
    URL.revokeObjectURL(url);
});
importInput.addEventListener("change", async () => {
    if (!isAdmin) { alert("Doar administratorul poate importa."); importInput.value = ""; return; }
    const f = importInput.files?.[0]; if (!f) return;
    const text = await f.text();
    try {
        const arr = JSON.parse(text);
        if (!Array.isArray(arr)) throw new Error("Format invalid");
        for (const v of arr) {
            await addDoc(videosCol, {
                title: v.title || "Fără titlu",
                url: v.url || "",
                date: v.date || new Date().toISOString().slice(0, 10),
                desc: v.desc || "",
                tags: Array.isArray(v.tags) ? v.tags.filter(Boolean) : [],
                createdAt: serverTimestamp()
            });
        }
        await reloadFromCloud();
        alert("Import realizat.");
    } catch (e) { alert("Eroare la import: " + e.message); }
    importInput.value = "";
});

// ========================= Auth (Email/Password) =========================
loginBtn.addEventListener("click", async () => {
    const email = prompt("Email admin:");
    if (!email) return;
    const pass = prompt("Parola:");
    if (!pass) return;
    try { await signInWithEmailAndPassword(auth, email, pass); }
    catch (e) { alert("Autentificare eșuată: " + e.message); }
});
logoutBtn.addEventListener("click", () => signOut(auth));
onAuthStateChanged(auth, (user) => {
    isAdmin = !!user;
    loginBtn.style.display = user ? "none" : "";
    logoutBtn.style.display = user ? "" : "none";
    who.textContent = user ? `Conectat: ${user.email}` : "";
});

// ========================= START =========================
reloadFromCloud()
    .catch(err => {
        console.error(err);
        grid.innerHTML = "<p>Eroare la încărcarea listei. Verifică Firestore.</p>";
    });
