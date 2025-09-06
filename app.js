// Firebase CDN v12
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
    getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc,
    serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import {
    getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";

// --- Config-ul tău ---
const firebaseConfig = {
    apiKey: "AIzaSyBzEv4T0DJOs4uAGqQHqnSxYS3Z-vVgc8Y",
    authDomain: "vlog-razvan.firebaseapp.com",
    projectId: "vlog-razvan",
    storageBucket: "vlog-razvan.firebasestorage.app",
    messagingSenderId: "706536997376",
    appId: "1:706536997376:web:6a79c94db29ed903628ee5"
};

// --- Init ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const st = getStorage(app);

// --- DOM ---
const grid = document.getElementById("grid");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const tagFilter = document.getElementById("tagFilter");
const btnAdd = document.getElementById("btnAdd");
const btnExport = document.getElementById("btnExport");
const importBtn = document.getElementById("importBtn");
const importInput = document.getElementById("importInput");
const loadMoreBtn = document.getElementById("loadMore");

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const who = document.getElementById("who");

const dlg = document.getElementById("addDialog");
const tabLink = document.getElementById("tabLink");
const tabUpload = document.getElementById("tabUpload");
const panelLink = document.getElementById("panelLink");
const panelUpload = document.getElementById("panelUpload");

// link inputs
const titleInput = document.getElementById("titleInput");
const urlInput = document.getElementById("urlInput");
const dateInput = document.getElementById("dateInput");
const tagsInput = document.getElementById("tagsInput");
const descInput = document.getElementById("descInput");

// upload inputs
const fileInput = document.getElementById("fileInput");
const uTitleInput = document.getElementById("uTitleInput");
const uDateInput = document.getElementById("uDateInput");
const uTagsInput = document.getElementById("uTagsInput");
const prog = document.getElementById("uploadProgress");
const progInfo = document.getElementById("uploadInfo");

const saveBtn = document.getElementById("saveBtn");

// --- State ---
let isAdmin = false;
let allVideos = [];
let currentList = [];
let renderedCount = 0;
let editId = null;
let activeTab = "link";  // "link" | "upload"

const PAGE_SIZE = 9;
const videosCol = collection(db, "videos");

// --- Helpers ---
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
function formatDate(s) { try { return new Date(s + "T00:00:00").toLocaleDateString("ro-RO"); } catch { return s; } }
function uniqueTags(list) { const s = new Set(); list.forEach(v => (v.tags || []).forEach(t => s.add(t))); return [...s].sort((a, b) => a.localeCompare(b)); }
function refreshTagFilter() {
    const prev = tagFilter.value || "";
    const tags = uniqueTags(allVideos);
    tagFilter.innerHTML = `<option value="">— Filtrează după tag —</option>` + tags.map(t => `<option value="${t}">${t}</option>`).join("");
    if (tags.includes(prev)) tagFilter.value = prev;
}
function collectFilters() {
    const q = (searchInput.value || "").toLowerCase().trim();
    const tag = (tagFilter.value || "").toLowerCase().trim();
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
function sanitize(name) {
    return name.toLowerCase().replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(0, 80);
}

// --- Render ---
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
        } else media.textContent = "Link YouTube neacceptat.";
    } else if (v.url && /\.(mp4)(\?.*)?$/i.test(v.url)) {
        const vid = document.createElement("video");
        vid.controls = true;
        vid.src = v.url;
        media.appendChild(vid);
    } else {
        media.textContent = "Adaugă un URL YouTube sau .mp4.";
    }

    title.textContent = v.title || "Fără titlu";
    date.textContent = v.date ? `Data: ${formatDate(v.date)}` : "";
    desc.textContent = v.desc || "";
    (v.tags || []).forEach(t => { const s = document.createElement("span"); s.className = "tag"; s.textContent = t; tagsEl.appendChild(s); });

    const eb = node.querySelector('[data-action="edit"]');
    const db = node.querySelector('[data-action="delete"]');
    eb.style.display = isAdmin ? "" : "none";
    db.style.display = isAdmin ? "" : "none";

    eb.addEventListener("click", () => openEdit(v.id));
    db.addEventListener("click", async () => {
        if (!confirm("Ștergi acest clip?")) return;
        // dacă e din Storage, ștergem și fișierul
        if (v.storagePath) {
            try { await deleteObject(ref(st, v.storagePath)); } catch { }
        }
        await deleteDoc(doc(db, "videos", v.id));
        await reloadFromCloud();
    });

    grid.appendChild(node);
}

// --- Cloud I/O ---
async function reloadFromCloud() {
    const qy = query(videosCol, orderBy("date", "desc"));
    const snap = await getDocs(qy);
    allVideos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    refreshTagFilter();
    renderReset();
}

// --- Tabs dialog ---
function setTab(name) {
    activeTab = name; // "link" | "upload"
    tabLink.classList.toggle("active", name === "link");
    tabUpload.classList.toggle("active", name === "upload");
    panelLink.style.display = name === "link" ? "block" : "none";
    panelUpload.style.display = name === "upload" ? "block" : "none";
}
tabLink.addEventListener("click", () => setTab("link"));
tabUpload.addEventListener("click", () => setTab("upload"));

// --- Add/Edit ---
function openAdd() {
    if (!isAdmin) return alert("Doar adminul poate adăuga.");
    editId = null;
    setTab("link");
    // reset link
    titleInput.value = ""; urlInput.value = "";
    dateInput.value = new Date().toISOString().slice(0, 10);
    tagsInput.value = ""; descInput.value = "";
    // reset upload
    fileInput.value = ""; uTitleInput.value = "";
    uDateInput.value = new Date().toISOString().slice(0, 10);
    uTagsInput.value = ""; prog.hidden = true; prog.value = 0; progInfo.textContent = "";
    dlg.showModal();
}
function openEdit(id) {
    if (!isAdmin) return;
    const v = allVideos.find(x => x.id === id); if (!v) return;
    editId = id;
    // pentru edit, ofer în mod implicit panelul Link (poți edita textul/URL-ul)
    setTab("link");
    titleInput.value = v.title || "";
    urlInput.value = v.url || "";
    dateInput.value = v.date || new Date().toISOString().slice(0, 10);
    tagsInput.value = (v.tags || []).join(", ");
    descInput.value = v.desc || "";
    // upload panel nu reîncarcă fișierul; pentru „schimbare fișier” creezi clip nou și ștergi pe cel vechi
    dlg.showModal();
}

saveBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!isAdmin) return alert("Doar adminul poate salva.");

    if (activeTab === "link") {
        const title = titleInput.value.trim() || "Fără titlu";
        const url = urlInput.value.trim();
        if (!url) return alert("Pune URL (YouTube sau .mp4 găzduit).");
        const date = dateInput.value || new Date().toISOString().slice(0, 10);
        const tags = tagsInput.value.split(",").map(s => s.trim()).filter(Boolean);
        const desc = (descInput.value || "").trim();

        if (editId) {
            await updateDoc(doc(db, "videos", editId), { title, url, date, tags, desc });
        } else {
            await addDoc(videosCol, { title, url, date, tags, desc, createdAt: serverTimestamp() });
        }
        dlg.close();
        await reloadFromCloud();
        return;
    }

    // --- Upload .mp4 în Storage ---
    const file = fileInput.files?.[0];
    if (!file) return alert("Alege un fișier .mp4");
    if (file.type !== "video/mp4") return alert("Accept doar .mp4");
    const title = (uTitleInput.value.trim() || file.name.replace(/\.[^.]+$/, ""));
    const date = uDateInput.value || new Date().toISOString().slice(0, 10);
    const tags = uTagsInput.value.split(",").map(s => s.trim()).filter(Boolean);

    const uid = auth.currentUser?.uid || "anon";
    const path = `videos/${uid}/${Date.now()}_${sanitize(file.name)}`;
    const storageRef = ref(st, path);
    const task = uploadBytesResumable(storageRef, file, { contentType: "video/mp4" });

    prog.hidden = false; prog.value = 0; progInfo.textContent = "Se încarcă…";
    task.on("state_changed", (snap) => {
        const pct = Math.round(100 * snap.bytesTransferred / snap.totalBytes);
        prog.value = pct; progInfo.textContent = `Upload ${pct}%`;
    }, (err) => {
        alert("Eroare upload: " + err.message);
        prog.hidden = true;
    }, async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        await addDoc(videosCol, { title, url, date, tags, desc: "", storagePath: path, createdAt: serverTimestamp() });
        prog.hidden = true; progInfo.textContent = "Gata.";
        dlg.close();
        await reloadFromCloud();
    });
});

// --- Import/Export ---
if (importBtn) importBtn.addEventListener("click", () => importInput.click());
btnExport.addEventListener("click", () => {
    const data = JSON.stringify(allVideos, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "vlog-videos.json"; a.click();
    URL.revokeObjectURL(url);
});
importInput.addEventListener("change", async () => {
    if (!isAdmin) { importInput.value = ""; return alert("Doar adminul poate importa."); }
    const f = importInput.files?.[0]; if (!f) return;
    try {
        const arr = JSON.parse(await f.text());
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
    } catch (e) { alert("Eroare import: " + e.message); }
    importInput.value = "";
});

// --- Căutare/filtre/paginare ---
searchInput.addEventListener("input", renderReset);
sortSelect.addEventListener("change", renderReset);
tagFilter.addEventListener("change", renderReset);
btnAdd.addEventListener("click", openAdd);
loadMoreBtn.addEventListener("click", renderMore);

// --- Auth ---
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

    // controale admin
    btnAdd.hidden = !isAdmin;
    btnExport.hidden = !isAdmin;
    importBtn.hidden = !isAdmin;

    renderReset(); // reafișează Editează/Șterge corect
});

// --- Start ---
reloadFromCloud().catch(err => {
    console.error(err);
    grid.innerHTML = "<p>Eroare la încărcarea listei. Verifică Firestore/Rules.</p>";
});

