/* ===== Stocare locală (fallback) ===== */
const DB_NAME = 'vlograzvan';
const STORE = 'files';
const KEY = 'vlogVideos';

function idbOpen() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function idbPut(key, blob) { const db = await idbOpen(); return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(blob, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
async function idbGet(key) { const db = await idbOpen(); return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readonly'); const r = tx.objectStore(STORE).get(key); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); }); }
async function saveLocalBlob(file) { const key = `${Date.now()}_${Math.random().toString(36).slice(2)}`; await idbPut(key, file); return { key, mime: file.type || 'application/octet-stream' }; }

function loadVideos() { try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : [] } catch { return [] } }
function saveVideos(v) { localStorage.setItem(KEY, JSON.stringify(v)) }
let videos = loadVideos();

/* ===== DOM ===== */
const grid = document.getElementById('grid');
const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const tagFilter = document.getElementById('tagFilter');
const btnAdd = document.getElementById('btnAdd');
const btnExport = document.getElementById('btnExport');
const importBtn = document.getElementById('importBtn');
const importInput = document.getElementById('importInput');
const loadMoreBtn = document.getElementById('loadMore');

const loginBtn = document.getElementById('loginBtn');      // admin local
const logoutBtn = document.getElementById('logoutBtn');
const who = document.getElementById('who');

const dlg = document.getElementById('addDialog');
const tabLink = document.getElementById('tabLink');
const tabUpload = document.getElementById('tabUpload');
const panelLink = document.getElementById('panelLink');
const panelUpload = document.getElementById('panelUpload');

const titleInput = document.getElementById('titleInput');
const urlInput = document.getElementById('urlInput');
const dateInput = document.getElementById('dateInput');
const tagsInput = document.getElementById('tagsInput');
const descInput = document.getElementById('descInput');

const fileInput = document.getElementById('fileInput');
const uTitleInput = document.getElementById('uTitleInput');
const uDateInput = document.getElementById('uDateInput');
const uTagsInput = document.getElementById('uTagsInput');
const prog = document.getElementById('uploadProgress');
const progInfo = document.getElementById('uploadInfo');

const saveBtn = document.getElementById('saveBtn');

/* ===== State ===== */
let isAdmin = false;
let currentList = [];
let renderedCount = 0;
let editId = null;
let activeTab = 'link';
let editRow = null; // reține rândul curent când editezi (cloud)
const PAGE_SIZE = 9;

/* ===== Helpers ===== */
function isYouTube(u) { try { const url = new URL(u); return /(^|\.)youtube\.com$/.test(url.hostname) || /(^|\.)youtu\.be$/.test(url.hostname); } catch { return false } }
function toYouTubeEmbed(u) { try { const url = new URL(u); if (/youtu\.be$/.test(url.hostname)) { const id = url.pathname.split('/').filter(Boolean)[0]; return `https://www.youtube.com/embed/${id}`; } if (/youtube\.com$/.test(url.hostname)) { const id = url.searchParams.get('v'); if (id) return `https://www.youtube.com/embed/${id}`; } } catch { } return null; }
function formatDate(s) { try { return new Date(s + 'T00:00:00').toLocaleDateString('ro-RO') } catch { return s } }
function uniqueTags(list) { const set = new Set(); list.forEach(v => (v.tags || []).forEach(t => set.add(t))); return [...set].sort((a, b) => a.localeCompare(b)) }
function refreshTagFilter() { const prev = tagFilter.value || ''; const tags = uniqueTags(videos); tagFilter.innerHTML = `<option value="">— Filtrează după tag —</option>` + tags.map(t => `<option value="${t}">${t}</option>`).join(''); if (tags.includes(prev)) tagFilter.value = prev; }
function collectFilters() { const q = (searchInput.value || '').trim().toLowerCase(); const tag = (tagFilter.value || '').trim().toLowerCase(); const sort = (sortSelect.value || 'newest'); let list = videos.filter(v => { const inText = (v.title || '').toLowerCase().includes(q) || (v.desc || '').toLowerCase().includes(q) || (v.tags || []).some(t => t.toLowerCase().includes(q)); const tagOk = !tag || (v.tags || []).map(t => t.toLowerCase()).includes(tag); return inText && tagOk; }); if (sort === 'newest') list.sort((a, b) => (b.date || '').localeCompare(a.date || '')); else if (sort === 'oldest') list.sort((a, b) => (a.date || '').localeCompare(b.date || '')); else if (sort === 'title') list.sort((a, b) => (a.title || '').localeCompare(b.title || '')); return list; }
function sanitize(name) { return name.toLowerCase().replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(0, 80); }
function canEdit(v) { return isAdmin || (supaUser && v.owner && v.owner === supaUser.id); }

/* ===== Render ===== */
async function renderReset() {
    grid.innerHTML = ''; renderedCount = 0;
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
    const tpl = document.getElementById('cardTpl');
    const node = tpl.content.firstElementChild.cloneNode(true);

    const media = node.querySelector('.media');
    const title = node.querySelector('.title');
    const date = node.querySelector('.date');
    const desc = node.querySelector('.desc');
    const tagsEl = node.querySelector('.tags');

    if (v.url && isYouTube(v.url)) {
        const em = toYouTubeEmbed(v.url);
        if (em) { const ifr = document.createElement('iframe'); ifr.src = em; ifr.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'; ifr.allowFullscreen = true; media.appendChild(ifr); }
        else media.textContent = 'Link YouTube neacceptat.';
    } else if (v.url && /\.(mp4)(\?.*)?$/i.test(v.url)) {
        const vid = document.createElement('video'); vid.controls = true; vid.src = v.url; media.appendChild(vid);
    } else if (v.blobUrl) {
        const vid = document.createElement('video'); vid.controls = true; vid.src = v.blobUrl; media.appendChild(vid);
    } else {
        media.textContent = 'Adaugă un URL sau un fișier .mp4.';
    }

    title.textContent = v.title || 'Fără titlu';
    date.textContent = v.date ? `Data: ${formatDate(v.date)}` : '';
    desc.textContent = v.desc || '';
    (v.tags || []).forEach(t => { const s = document.createElement('span'); s.className = 'tag'; s.textContent = t; tagsEl.appendChild(s); });

    const eb = node.querySelector('[data-action="edit"]');
    const db = node.querySelector('[data-action="delete"]');
    const allow = canEdit(v);
    eb.style.display = allow ? '' : 'none';
    db.style.display = allow ? '' : 'none';

    eb.addEventListener('click', () => {
        if (!allow) return;
        editId = v.id;
        editRow = v; // memorează rândul cloud (id, owner, storage_path etc.)
        setTab('link');
        titleInput.value = v.title || '';
        urlInput.value = v.source_url || v.url || '';
        dateInput.value = v.date || new Date().toISOString().slice(0, 10);
        tagsInput.value = (v.tags || []).join(', ');
        descInput.value = v.desc || '';
        dlg.showModal();
    });

    db.addEventListener('click', async () => {
        if (!allow) return;
        if (!confirm('Ștergi acest clip?')) return;

        // cloud: șterge din tabel + storage
        if (supa && supaUser && v.id) {
            try { await supaDeleteVideo(v); await renderReset(); return; }
            catch (e) { console.error(e); alert(e?.message || 'Eroare la ștergere'); return; }
        }
        // local fallback
        videos = videos.filter(x => x.id !== v.id);
        saveVideos(videos);
        refreshTagFilter();
        renderReset();
    });

    grid.appendChild(node);
}

/* ===== Tab-uri dialog ===== */
function setTab(name) {
    activeTab = name;
    tabLink.classList.toggle('active', name === 'link');
    tabUpload.classList.toggle('active', name === 'upload');
    panelLink.style.display = (name === 'link') ? 'block' : 'none';
    panelUpload.style.display = (name === 'upload') ? 'block' : 'none';
}
tabLink.addEventListener('click', () => setTab('link'));
tabUpload.addEventListener('click', () => setTab('upload'));

/* ===== Add / Edit (local fallback rămâne) ===== */
function openAdd() {
    if (!isAdmin && !supaUser) return alert('Doar adminul sau un utilizator logat poate adăuga.');
    editId = null; editRow = null; setTab('link');
    titleInput.value = ''; urlInput.value = ''; dateInput.value = new Date().toISOString().slice(0, 10);
    tagsInput.value = ''; descInput.value = '';
    fileInput.value = ''; uTitleInput.value = ''; uDateInput.value = new Date().toISOString().slice(0, 10); uTagsInput.value = '';
    prog.hidden = true; prog.value = 0; progInfo.textContent = '';
    dlg.showModal();
}
if (btnAdd) btnAdd.addEventListener('click', openAdd);

/* ===== Salvare ===== */
saveBtn.addEventListener('click', async (e) => {
    e.preventDefault();

    // === CLOUD (Supabase) ===
    if (supa && supaUser) {
        try {
            if (activeTab === 'link') {
                const title = (titleInput.value || '').trim() || 'Fără titlu';
                const url = (urlInput.value || '').trim();
                if (!url) { alert('Pune URL (YouTube sau .mp4)'); return; }
                const date = dateInput.value || new Date().toISOString().slice(0, 10);
                const tags = (tagsInput.value || '').split(',').map(s => s.trim()).filter(Boolean);
                const description = (descInput.value || '').trim();
                const isPublic = document.getElementById('chkPublicLink')?.checked ?? false;

                if (editId && editRow && editRow.owner === supaUser.id) {
                    await supaUpdateLink(editId, { title, description, tags, date, source_url: url, is_public: isPublic });
                } else {
                    await supaAddLink(url, isPublic, { title, description, tags, date });
                }
            } else {
                // pentru fișiere: nu „rescriem” un rând existent; recomandăm ștergere + reupload
                if (editId && editRow) { alert('Pentru fișiere: șterge clipul vechi și încarcă altul.'); return; }
                const file = fileInput.files?.[0];
                if (!file) { alert('Alege un fișier .mp4'); return; }
                if (file.type !== 'video/mp4') { alert('Accept doar .mp4'); return; }
                const title = (uTitleInput.value || file.name.replace(/\.[^.]+$/, '')).trim();
                const date = uDateInput.value || new Date().toISOString().slice(0, 10);
                const tags = (uTagsInput.value || '').split(',').map(s => s.trim()).filter(Boolean);
                const isPublic = document.getElementById('chkPublicUpload')?.checked ?? false;
                await supaUploadMp4(file, isPublic, { title, tags, date, description: '' });
            }

            dlg.close();
            await renderReset();
            return; // oprim fallback-ul local
        } catch (err) {
            console.error(err);
            alert(err?.message || 'Eroare la încărcare în cloud');
            return;
        }
    }

    // === Fallback local (admin simplu) ===
    if (!isAdmin) return alert('Doar adminul poate salva (local).');

    if (activeTab === 'link') {
        const title = titleInput.value.trim() || 'Fără titlu';
        const url = urlInput.value.trim();
        if (!url) { alert('Pune URL (YouTube sau .mp4)'); return; }
        const date = dateInput.value || new Date().toISOString().slice(0, 10);
        const tags = tagsInput.value.split(',').map(s => s.trim()).filter(Boolean);
        const desc = (descInput.value || '').trim();

        if (editId) { const idx = videos.findIndex(x => x.id === editId); if (idx >= 0) videos[idx] = { ...videos[idx], title, url, date, tags, desc, blobUrl: '' }; }
        else videos.unshift({ id: Date.now(), title, url, date, tags, desc, blobUrl: '' });

        saveVideos(videos); refreshTagFilter(); dlg.close(); renderReset(); return;
    }

    const file = fileInput.files?.[0];
    if (!file) { alert('Alege un fișier .mp4'); return; }
    if (file.type !== 'video/mp4') { alert('Accept doar .mp4'); return; }
    const title = (uTitleInput.value.trim() || file.name.replace(/\.[^.]+$/, ''));
    const date = uDateInput.value || new Date().toISOString().slice(0, 10);
    const tags = uTagsInput.value.split(',').map(s => s.trim()).filter(Boolean);
    const blobUrl = URL.createObjectURL(file);

    if (editId) { const idx = videos.findIndex(x => x.id === editId); if (idx >= 0) videos[idx] = { ...videos[idx], title, blobUrl, url: '', date, tags, desc: '' }; }
    else videos.unshift({ id: Date.now(), title, blobUrl, url: '', date, tags, desc: '' });

    saveVideos(videos); refreshTagFilter(); dlg.close(); renderReset();
});

/* ===== Căutare/filtre/paginare ===== */
searchInput.addEventListener('input', renderReset);
sortSelect.addEventListener('change', renderReset);
tagFilter.addEventListener('change', renderReset);
if (loadMoreBtn) loadMoreBtn.addEventListener('click', renderMore);

/* ===== Export/Import (local) ===== */
if (btnExport) btnExport.addEventListener('click', () => {
    const data = JSON.stringify(videos, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'vlog-videos.json'; a.click();
    URL.revokeObjectURL(url);
});
if (importBtn) importBtn.addEventListener('click', () => importInput.click());
if (importInput) importInput.addEventListener('change', () => {
    const f = importInput.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const arr = JSON.parse(reader.result); if (!Array.isArray(arr)) throw new Error('Format invalid');
            const cleaned = arr.map(x => ({ id: x.id || Date.now() + Math.random(), title: x.title || 'Fără titlu', url: x.url || '', blobUrl: x.blobUrl || '', date: x.date || new Date().toISOString().slice(0, 10), desc: x.desc || '', tags: Array.isArray(x.tags) ? x.tags.filter(Boolean) : [] }));
            videos = cleaned; saveVideos(videos); refreshTagFilter(); renderReset(); alert('Import realizat.'); importInput.value = '';
        } catch (err) { alert('Eroare la import: ' + err.message); }
    };
    reader.readAsText(f);
});

/* ===== Admin local simplu ===== */
const ADMIN_FLAG = 'vlogAdmin';
isAdmin = localStorage.getItem(ADMIN_FLAG) === '1';
function refreshAdminUI() {
    if (btnAdd) btnAdd.hidden = !isAdmin && !supaUser;
    if (btnExport) btnExport.hidden = !isAdmin;
    if (importBtn) importBtn.hidden = !isAdmin;
    if (loginBtn) loginBtn.style.display = isAdmin ? 'none' : '';
    if (logoutBtn) logoutBtn.style.display = isAdmin ? '' : 'none';
    if (who) who.textContent = isAdmin ? '(Mod admin local)' : '';
}
if (loginBtn) loginBtn.addEventListener('click', () => {
    const pass = prompt('Parola admin (local)');
    if (pass === 'razvan') { isAdmin = true; localStorage.setItem(ADMIN_FLAG, '1'); refreshAdminUI(); }
    else if (pass !== null) alert('Parolă greșită.');
});
if (logoutBtn) logoutBtn.addEventListener('click', () => {
    isAdmin = false; localStorage.removeItem(ADMIN_FLAG); refreshAdminUI();
});

/* ===== Supabase ===== */
const SUPABASE_URL = "https://njgvdvslmshwwwttbjzi.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qZ3ZkdnNsbXNod3d3dHRianppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcyMzE4ODgsImV4cCI6MjA3MjgwNzg4OH0.C0wWEbIefO8QxTiCNesHkyglgbxlw3SEq9ZwKr3YCUo";
const SITE_URL = "https://razvancodreanu.github.io/VlogRazvan/"; // IMPORTANT: folosit la redirect

let supa = null, supaUser = null;

async function supaInit() {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    supa = createClient(SUPABASE_URL, SUPABASE_ANON);

    // --- Consumă codul PKCE și curăță URL-ul (oprește bucla de login)
    try {
        const fullUrl = window.location.href;
        if (fullUrl.includes('code=')) {
            await supa.auth.exchangeCodeForSession({ currentUrl: fullUrl });
            const url = new URL(fullUrl);
            url.searchParams.delete('code'); url.searchParams.delete('state');
            history.replaceState({}, '', url.pathname + (url.search ? `?${url.searchParams.toString()}` : ''));
        }
        if (window.location.hash.includes('access_token')) {
            history.replaceState({}, '', window.location.pathname + window.location.search);
        }
    } catch (e) { console.warn('auth exchange/cleanup', e); }

    const { data: { session } } = await supa.auth.getSession();
    supaUser = session?.user || null;

    supa.auth.onAuthStateChange((_e, s) => {
        supaUser = s?.user || null;
        renderAuthUI();
        renderReset();
    });
}
function renderAuthUI() {
    const inBtn = document.getElementById('btnLogin');
    const outBtn = document.getElementById('btnLogout');
    if (!inBtn || !outBtn) return;
    inBtn.style.display = supaUser ? 'none' : '';
    outBtn.style.display = supaUser ? '' : 'none';
}
async function supaSignIn() {
    const email = prompt('Email pentru logare (primești un link):');
    if (!email) return;
    const { error } = await supa.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: SITE_URL } // URL-ul tău fix de pe GitHub Pages
    });
    if (error) alert(error.message);
    else alert('Verifică emailul și apasă pe linkul primit.');
}
async function supaSignOut() { await supa.auth.signOut(); }

document.getElementById('btnLogin')?.addEventListener('click', supaSignIn);
document.getElementById('btnLogout')?.addEventListener('click', supaSignOut);

/* Upload/link/listare */
async function supaUploadMp4(file, isPublic, meta) {
    if (!supa) throw new Error('Supabase nu e inițializat.');
    if (!supaUser) throw new Error('Trebuie să fii logat.');
    if (!file || file.type !== 'video/mp4') throw new Error('Alege un fișier .mp4');

    const objectName = `${supaUser.id}/${crypto.randomUUID()}.mp4`;
    const { error: upErr } = await supa.storage.from('videos').upload(objectName, file, { contentType: 'video/mp4', upsert: false });
    if (upErr) throw upErr;

    const row = {
        owner: supaUser.id,
        title: meta.title || 'Fără titlu',
        description: meta.description || '',
        tags: meta.tags || [],
        recorded_on: meta.date || new Date().toISOString().slice(0, 10),
        storage_path: `videos/${objectName}`,
        source_url: null,
        is_public: !!isPublic
    };
    const { error: insErr } = await supa.from('videos').insert(row);
    if (insErr) throw insErr;
}
async function supaAddLink(url, isPublic, meta) {
    const row = {
        owner: supaUser.id,
        title: meta.title || 'Fără titlu',
        description: meta.description || '',
        tags: meta.tags || [],
        recorded_on: meta.date || new Date().toISOString().slice(0, 10),
        storage_path: null,
        source_url: url,
        is_public: !!isPublic
    };
    const { error } = await supa.from('videos').insert(row);
    if (error) throw error;
}
async function supaUpdateLink(id, fields) {
    const { error } = await supa.from('videos').update(fields).eq('id', id);
    if (error) throw error;
}
async function supaDeleteVideo(row) {
    if (!row?.id) throw new Error('Lipsește id-ul videoclipului.');
    if (row.storage_path) {
        const objectName = row.storage_path.replace(/^videos\//, '');
        try { await supa.storage.from('videos').remove([objectName]); } catch { }
    }
    const { error } = await supa.from('videos').delete().eq('id', row.id);
    if (error) throw error;
}
async function supaListVideos({ limit = 200, offset = 0 } = {}) {
    if (!supa) return [];
    if (!supaUser) {
        const { data, error } = await supa.from('videos')
            .select('*').eq('is_public', true)
            .order('created_at', { ascending: false }).range(offset, offset + limit - 1);
        if (error) throw error; return data;
    } else {
        const mine = await supa.from('videos').select('*').eq('owner', supaUser.id).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
        const pub = await supa.from('videos').select('*').eq('is_public', true).neq('owner', supaUser.id).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
        if (mine.error) throw mine.error; if (pub.error) throw pub.error;
        return [...mine.data, ...pub.data];
    }
}

/* Transformă din cloud în structură pentru UI */
async function loadForGrid() {
    if (supa) {
        const rows = await supaListVideos({ limit: 200 });
        const out = [];
        for (const r of rows) {
            let url = r.source_url || null;
            if (!url && r.storage_path) {
                const objectName = r.storage_path.replace(/^videos\//, '');
                const { data, error } = await supa.storage.from('videos').createSignedUrl(objectName, 60 * 60 * 12);
                if (!error) url = data.signedUrl;
            }
            out.push({
                id: r.id, title: r.title, url,
                date: r.recorded_on, tags: r.tags, desc: r.description,
                is_public: r.is_public, storage_path: r.storage_path, owner: r.owner,
                source_url: r.source_url || null
            });
        }
        return out;
    }
    return loadVideos(); // fallback local
}

/* ===== Init ===== */
function refreshAdminUIAll() { refreshAdminUI(); renderAuthUI(); }
refreshAdminUIAll(); refreshTagFilter();
await supaInit(); refreshAdminUIAll(); await renderReset();
