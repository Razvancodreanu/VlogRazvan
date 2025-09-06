// ===== Firebase – importuri ESM din CDN
import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";

import {
    getFirestore, collection, query, orderBy, getDocs, addDoc, updateDoc, deleteDoc,
    doc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

import {
    getAuth, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup,
    signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

import {
    getStorage, ref as sRef, uploadBytesResumable, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js";

// ===== Configul tău (exact cum ți-l dă Firebase)
const firebaseConfig = {
    apiKey: "AIzaSyBzEv4T0DJOs4uAGqQHqnSxYS3Z-vVgc8Y",
    authDomain: "vlog-razvan.firebaseapp.com",
    projectId: "vlog-razvan",
    storageBucket: "vlog-razvan.firebasestorage.app",
    messagingSenderId: "706536997376",
    appId: "1:706536997376:web:6a79c94db29ed903628ee5",
    measurementId: "G-PVMVHWM9JT"
};

// ===== Init
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

// ===== DOM refs
const grid = document.getElementById("grid");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const tagFilterBtn = document.getElementById("tagFilter");
const tagMenu = document.getElementById("tagMenu");

const btnAdd = document.getElementById("btnAdd");
const btnExport = document.getElementById("btnExport");
const btnImport = document.getElementById("btnImport");
const importInput = document.getElementById("importInput");
const authBtn = document.getElementById("authBtn");
const loadMoreBtn = document.getElementById("loadMore");
const errorBox = document.getElementById("errorBox");

const dlg = document.getElementById("addDialog");
const tabs = [...document.querySelectorAll(".tab")];
const panels = [...document.querySelectorAll(".tabPanel")];

const titleInput = document.getElementById("titleInput");
const urlInput = document.getElementById("urlInput");
const dateInput = document.getElementById("dateInput");
const tagsInput = document.getElementById("tagsInput");
const descInput = document.getElementById("descInput");

const dropZone = document.getElementById("dropZone");
const pickFileBtn = document.getElementById("pickFile");
const fileInput = document.getElementById("fileInput");
const localTitleInput = document.getElementById("localTitleInput");
const localDateInput = document.getElementById("localDateInput");
const localTagsInput = document.getElementById("localTagsInput");
const uploadProgress = document.getElementById("uploadProgress");
const saveBtn = document.getElementById("saveBtn");

// ===== Setări
const PAGE_SIZE = 12;
const ADMIN_EMAIL = "razvan.codreanu90@gmail.com";

// ===== State
let currentUser = null;
let isOwner = false;
let allVideos = [];         // tot ce vine din Firestore
let filtered = [];          // după căutare/filtru/sort
let renderedCount = 0;      // paginare
let editId = null;

// ===== Utils
function fmtDate(s) { try { return new Date(s).toLocaleDateString("ro-RO") } catch { return s } }
function uniqTags(list) {
    const set = new Set();
    list.forEach(v => (v.tags || []).forEach(t => set.add(t)));
    return [...set].sort((a, b) => a.localeCompare(b));
}
function isYouTube(u) {
    try {
        const url = new URL(u);
        return /(^|\.)youtube\.com$/i.test(url.hostname) || /(^|\.)youtu\.be$/i.test(url.hostname);
    } catch { return false }
}
function toYouTubeEmbed(u) {
    try {
        const url = new URL(u);
        if (/youtu\.be$/i.test(url.hostname)) {
            const id = url.pathname.split("/").filter(Boolean)[0];
            return `https://www.youtube.com/embed/${id}`;
        }
        if (/youtube\.com$/i.test(url.hostname)) {
            const id = url.searchParams.get("v");
            if (id) return `https://www.youtube.com/embed/${id}`;
        }
    } catch { }
    return null;
}

// ===== Auth
authBtn.addEventListener("click", async () => {
    if (currentUser) {
        await signOut(auth);
        return;
    }
    // încearcă Google, dacă e blocat, cere Email/Parolă
    try {
        await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
        try {
            const email = prompt("Email (Firebase Auth):", "");
            if (!email) return;
            const pwd = prompt("Parolă:", "");
            if (!pwd) return;
            await signInWithEmailAndPassword(auth, email, pwd);
        } catch (err) {
            alert("Autentificare eșuată.");
            console.error(err);
        }
    }
});

onAuthStateChanged(auth, (u) => {
    currentUser = u;
    isOwner = !!(u && u.email && u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
    authBtn.textContent = u ? "Ieșire" : "Autentificare";
    // doar ownerul vede acțiunile de administrare
    btnAdd.hidden = btnExport.hidden = btnImport.hidden = !isOwner;
});

// ===== Load videos din Firestore
async function loadVideos() {
    try {
        errorBox.hidden = true;
        const q = query(collection(db, "videos"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        allVideos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        buildTagMenu();
        applyFilters();
    } catch (e) {
        errorBox.textContent = "Eroare la încărcarea listei. Verifică Firestore.";
        errorBox.hidden = false;
        console.error(e);
    }
}
function buildTagMenu() {
    const tags = uniqTags(allVideos);
    tagMenu.innerHTML = "";
    const allItem = document.createElement("li");
    allItem.textContent = "Toate tag-urile";
    allItem.dataset.tag = "";
    tagMenu.appendChild(allItem);
    tags.forEach(t => {
        const li = document.createElement("li");
        li.textContent = t;
        li.dataset.tag = t;
        tagMenu.appendChild(li);
    });
}
let activeTag = "";
tagFilterBtn.addEventListener("click", () => {
    tagMenu.hidden = !tagMenu.hidden;
});
tagMenu.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    activeTag = li.dataset.tag || "";
    tagFilterBtn.textContent = activeTag ? `Tag: ${activeTag}` : "— Filtrează după tag —";
    tagMenu.hidden = true;
    applyFilters();
});

// ===== Filtrare/Sortare/Paginare
function applyFilters() {
    const q = (searchInput.value || "").toLowerCase().trim();
    const tag = (activeTag || "").toLowerCase();

    filtered = allVideos.filter(v => {
        const inText = (v.title || "").toLowerCase().includes(q) ||
            (v.desc || "").toLowerCase().includes(q) ||
            (v.tags || []).some(t => t.toLowerCase().includes(q));
        const tagOk = !tag || (v.tags || []).map(t => t.toLowerCase()).includes(tag);
        return inText && tagOk;
    });

    const s = sortSelect.value;
    if (s === "newest") filtered.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    else if (s === "oldest") filtered.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    else if (s === "title") filtered.sort((a, b) => (a.title || "").localeCompare(b.title || ""));

    renderedCount = 0;
    grid.innerHTML = "";
    renderMore();
}
function renderMore() {
    const slice = filtered.slice(renderedCount, renderedCount + PAGE_SIZE);
    slice.forEach(renderCard);
    renderedCount += slice.length;
    loadMoreBtn.hidden = renderedCount >= filtered.length;
}

searchInput.addEventListener("input", applyFilters);
sortSelect.addEventListener("change", applyFilters);
loadMoreBtn.addEventListener("click", renderMore);

// ===== Render card
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
            media.textContent = "Link YouTube invalid.";
        }
    } else if (v.url && /\.mp4(\?.*)?$/i.test(v.url)) {
        const vid = document.createElement("video");
        vid.controls = true; vid.src = v.url;
        media.appendChild(vid);
    } else {
        media.textContent = "Niciun media.";
    }

    title.textContent = v.title || "Fără titlu";
    date.textContent = v.date ? `Data: ${fmtDate(v.date)}` : "";
    desc.textContent = v.desc || "";
    (v.tags || []).forEach(t => {
        const span = document.createElement("span");
        span.className = "tag"; span.textContent = t;
        tagsEl.appendChild(span);
    });

    const canEdit = isOwner;
    node.querySelector('[data-action="edit"]').hidden = !canEdit;
    node.querySelector('[data-action="delete"]').hidden = !canEdit;

    node.querySelector('[data-action="edit"]').addEventListener("click", () => openEdit(v.id));
    node.querySelector('[data-action="delete"]').addEventListener("click", () => delVideo(v.id));
    grid.appendChild(node);
}

// ===== Add / Edit / Delete
btnAdd.addEventListener("click", openAdd);

function openAdd() {
    if (!isOwner) return;
    editId = null;
    activateTab("youtube");
    titleInput.value = ""; urlInput.value = ""; descInput.value = "";
    tagsInput.value = "";
    dateInput.valueAsDate = new Date();
    fileInput.value = ""; localTitleInput.value = ""; localTagsInput.value = "";
    localDateInput.valueAsDate = new Date();
    uploadProgress.hidden = true; uploadProgress.value = 0;
    dlg.showModal();
}
function openEdit(id) {
    if (!isOwner) return;
    const v = allVideos.find(x => x.id === id);
    if (!v) return;
    editId = id;
    if (v.url && /\.mp4(\?.*)?$/i.test(v.url) && !isYouTube(v.url)) {
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

async function delVideo(id) {
    if (!isOwner) return;
    if (!confirm("Ștergi acest clip?")) return;
    try {
        await deleteDoc(doc(db, "videos", id));
        await loadVideos();
    } catch (e) { alert("Eroare la ștergere."); console.error(e) }
}

// Tabs
function activateTab(name) {
    tabs.forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    panels.forEach(p => p.style.display = (p.dataset.panel === name) ? "block" : "none");
}
tabs.forEach(b => b.addEventListener("click", () => activateTab(b.dataset.tab)));

// Save
saveBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!isOwner) return;

    const active = tabs.find(t => t.classList.contains("active"))?.dataset.tab;

    try {
        if (active === "youtube") {
            // VALIDARE minimă
            const title = titleInput.value.trim() || "Fără titlu";
            const url = urlInput.value.trim();
            if (!url) { alert("Te rog adaugă un URL (YouTube sau .mp4)"); return; }
            const date = dateInput.value || new Date().toISOString().slice(0, 10);
            const tags = tagsInput.value.split(",").map(s => s.trim()).filter(Boolean);
            const desc = (descInput.value || "").trim();

            const payload = { title, url, date, tags, desc, createdAt: serverTimestamp() };
            if (editId) {
                await updateDoc(doc(db, "videos", editId), payload);
            } else {
                await addDoc(collection(db, "videos"), payload);
            }
            dlg.close();
            await loadVideos();
        } else {
            // Upload .mp4 în Firebase Storage (drag/drop sau file picker)
            const file = fileInput.files?.[0];
            if (!file) { alert("Alege un fișier .mp4"); return; }
            if (file.type !== "video/mp4") { alert("Doar .mp4"); return; }

            const title = (localTitleInput.value.trim() || file.name.replace(/\.[^.]+$/, ""));
            const date = (localDateInput.value || new Date().toISOString().slice(0, 10));
            const tags = localTagsInput.value.split(",").map(s => s.trim()).filter(Boolean);

            // cale stocare
            const uid = currentUser?.uid || "anon";
            const path = `videos/${uid}/${Date.now()}-${file.name}`;
            const storageRef = sRef(storage, path);
            const task = uploadBytesResumable(storageRef, file, { contentType: "video/mp4" });

            uploadProgress.hidden = false; uploadProgress.value = 0;

            await new Promise((resolve, reject) => {
                task.on("state_changed", (snap) => {
                    const pct = Math.round(100 * snap.bytesTransferred / snap.totalBytes);
                    uploadProgress.value = pct;
                }, reject, resolve);
            });

            const downloadURL = await getDownloadURL(task.snapshot.ref);
            const payload = { title, url: downloadURL, date, tags, desc: "", createdAt: serverTimestamp() };
            if (editId) {
                await updateDoc(doc(db, "videos", editId), payload);
            } else {
                await addDoc(collection(db, "videos"), payload);
            }
            uploadProgress.hidden = true; uploadProgress.value = 0;
            dlg.close();
            await loadVideos();
        }
    } catch (err) {
        alert("Eroare la salvare.");
        console.error(err);
    }
});

// Drag & drop + picker
["dragenter", "dragover"].forEach(ev => {
    dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add("drag"); });
});
["dragleave", "drop"].forEach(ev => {
    dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.remove("drag"); });
});
dropZone.addEventListener("drop", (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (f && f.type === "video/mp4") {
        fileInput.files = e.dataTransfer.files;
        if (!localTitleInput.value) localTitleInput.value = f.name.replace(/\.[^.]+$/, "");
    }
});
dropZone.addEventListener("click", () => pickFileBtn.click());
pickFileBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    if (f && !localTitleInput.value) localTitleInput.value = f.name.replace(/\.[^.]+$/, "");
});

// Export / Import (doar admin)
btnExport.addEventListener("click", () => {
    const data = JSON.stringify(allVideos, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "vlog-videos.json"; a.click();
    URL.revokeObjectURL(url);
});
btnImport.addEventListener("click", () => importInput.click());
importInput.addEventListener("change", () => {
    const file = importInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const arr = JSON.parse(reader.result);
            if (!Array.isArray(arr)) throw new Error("Format invalid");
            // import simplu – adaugă ca documente noi
            for (const x of arr) {
                const payload = {
                    title: x.title || "Fără titlu",
                    url: x.url || "",
                    date: x.date || new Date().toISOString().slice(0, 10),
                    desc: x.desc || "",
                    tags: Array.isArray(x.tags) ? x.tags.filter(Boolean) : [],
                    createdAt: serverTimestamp()
                };
                await addDoc(collection(db, "videos"), payload);
            }
            await loadVideos();
            alert("Import realizat.");
        } catch (e) {
            alert("Eroare la import.");
            console.error(e);
        } finally {
            importInput.value = "";
        }
    };
    reader.readAsText(file);
});

// Start
loadVideos();
