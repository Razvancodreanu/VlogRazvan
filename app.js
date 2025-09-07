/* ===== Local store (ca înainte) ===== */
const DB_NAME = 'vlograzvan', STORE = 'files', KEY = 'vlogVideos';
function idbOpen() { return new Promise((res, rej) => { const r = indexedDB.open(DB_NAME, 1); r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE) }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbPut(k, blob) { const db = await idbOpen(); return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(blob, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
async function idbGet(k) { const db = await idbOpen(); return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readonly'); const rq = tx.objectStore(STORE).get(k); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => rej(rq.error); }); }
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

const loginBtn = document.getElementById('loginBtn'); // admin local
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
const chkPublicLink = document.getElementById('chkPublicLink');
const chkPublicUpload = document.getElementById('chkPublicUpload');
const prog = document.getElementById('uploadProgress');
const progInfo = document.getElementById('uploadInfo');

const saveBtn = document.getElementById('saveBtn');

/* ===== State ===== */
let isAdmin = false;
let currentList = [], renderedCount = 0;
let editId = null, editRow = null;
let activeTab = 'link';
const PAGE_SIZE = 9;

/* ===== Helpers ===== */
function isYouTube(u) { try { const url = new URL(u); return /(^|\.)youtube\.com$/.test(url.hostname) || /(^|\.)youtu\.be$/.test(url.hostname); } catch { return false } }
function toYouTubeEmbed(u) { try { const url = new URL(u); if (/youtu\.be$/.test(url.hostname)) { const id = url.pathname.split('/').filter(Boolean)[0]; return `https://www.youtube.com/embed/${id}`; } if (/youtube\.com$/.test(url.hostname)) { const id = url.searchParams.get('v'); if (id) return `https://www.youtube.com/embed/${id}`; } } catch { } return null; }
function formatDate(s) { try { return new Date(s + 'T00:00:00').toLocaleDateString('ro-RO') } catch { return s } }
function uniqueTags(list) { const set = new Set(); list.forEach(v => (v.tags || []).forEach(t => set.add(t))); return [...set].sort((a, b) => a.localeCompare(b)) }
function refreshTagFilter() { const prev = tagFilter.value || ''; const tags = uniqueTags(videos); tagFilter.innerHTML = `<option value="">— Filtrează după tag —</option>` + tags.map(t => `<option value="${t}">${t}</option>`).join(''); if (tags.includes(prev)) tagFilter.value = prev; }
function collectFilters() { const q = (searchInput.value || '').trim().toLowerCase(); const tag = (tagFilter.value || '').trim().toLowerCase(); const sort = (sortSelect.value || 'newest'); let list = videos.filter(v => { const inText = (v.title || '').toLowerCase().includes(q) || (v.desc || '').toLowerCase().includes(q) || (v.tags || []).some(t => t.toLowerCase().includes(q)); const tagOk = !tag || (v.tags || []).map(t => t.toLowerCase()).includes(tag); return inText && tagOk; }); if (sort === 'newest') list.sort((a, b) => (b.date || '').localeCompare(a.date || '')); else if (sort === 'oldest') list.sort((a, b) => (a.date || '').localeCompare(b.date || '')); else if (sort === 'title') list.sort((a, b) => (a.title || '').localeCompare(b.title || '')); return list; }
function canEdit(v) { // admin local sau clip local sau clip cloud fără owner (dacă politicile permit)
    return isAdmin || !v.cloud || !v.owner || v.owner === 'anon';
}

/* ===== Supabase (fără login Supabase; doar ANON) ===== */
const SUPABASE_URL = 'https://njgvdvslmshwwwttbjzi.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qZ3ZkdnNsbXNod3d3dHRianppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcyMzE4ODgsImV4cCI6MjA3MjgwNzg4OH0.C0wWEbIefO8QxTiCNesHkyglgbxlw3SEq9ZwKr3YCUo';
let supa = null;
(async () => {
    try {
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
        supa = createClient(SUPABASE_URL, SUPABASE_ANON);
    } catch (e) { console.warn('Supabase indisponibil (offline?):', e); }
})();

async function supaSignedUrl(storage_path) {
    if (!supa || !storage_path) return null;
    const objectName = storage_path.replace(/^videos\//, '');
    const { data, error } = await supa.storage.from('videos').createSignedUrl(objectName, 60 * 60 * 12);
    if (error) throw error;
    return data.signedUrl;
}
async function supaAddLink(url, isPublic, meta) {
    if (!supa) throw new Error('Supabase indisponibil');
    const row = {
        title: meta.title || 'Fără titlu', description: meta.description || '', tags: meta.tags || [],
        recorded_on: meta.date || new Date().toISOString().slice(0, 10), storage_path: null, source_url: url, is_public: !!isPublic
    };
    const { data, error } = await supa.from('videos').insert(row).select('id').single();
    if (error) throw error;
    return { id: data.id, storage_path: null, source_url: url };
}
async function supaUploadMp4(file, isPublic, meta) {
    if (!supa) throw new Error('Supabase indisponibil');
    if (!file || file.type !== 'video/mp4') throw new Error('Alege un fișier .mp4');
    const objectName = `anon/${crypto.randomUUID()}.mp4`;
    const { error: upErr } = await supa.storage.from('videos').upload(objectName, file, { contentType: 'video/mp4', upsert: false });
    if (upErr) throw upErr;
    const row = {
        title: meta.title || 'Fără titlu', description: meta.description || '', tags: meta.tags || [],
        recorded_on: meta.date || new Date().toISOString().slice(0, 10), storage_path: `videos/${objectName}`, source_url: null, is_public: !!isPublic
    };
    const { data, error } = await supa.from('videos').insert(row).select('id,storage_path').single();
    if (error) throw error;
    return { id: data.id, storage_path: data.storage_path, source_url: null };
}
async function supaDeleteCloudByRow(row) {
    if (!supa) return;
    try {
        if (row.storage_path) {
            const objectName = row.storage_path.replace(/^videos\//, '');
            await supa.storage.from('videos').remove([objectName]);
        }
    } catch (e) { console.warn('Storage remove:', e?.message || e); }
    try {
        if (row.cloud_id) {
            await supa.from('videos').delete().eq('id', row.cloud_id);
        } else if (row.storage_path) {
            await supa.from('videos').delete().eq('storage_path', row.storage_path);
        } else if (row.source_url) {
            await supa.from('videos').delete().eq('source_url', row.source_url);
        }
    } catch (e) { console.warn('Table delete:', e?.message || e); }
}
async function supaListPublic() { // doar public (fără login supabase)
    if (!supa) return [];
    const { data, error } = await supa.from('videos').select('*').eq('is_public', true).order('created_at', { ascending: false }).limit(200);
    if (error) { console.warn('list public:', error.message); return []; }
    const out = [];
    for (const r of data) {
        let url = r.source_url || null;
        if (!url && r.storage_path) {
            try { url = await supaSignedUrl(r.storage_path); } catch { }
        }
        out.push({
            id: r.id, title: r.title, url, date: r.recorded_on, tags: r.tags || [], desc: r.description || '',
            is_public: !!r.is_public, storage_path: r.storage_path || null, source_url: r.source_url || null,
            cloud: true, cloud_id: r.id, owner: r.owner || 'anon'
        });
    }
    return out;
}

/* ===== Render ===== */
async function loadForGrid() {
    const cloud = await supaListPublic();   // publice din cloud
    const local = loadVideos();             // ce ai local (vechile tale)
    // Nu duplicăm: excludem din local pe cele care au cloud_id egal cu id-ul cloud (dacă s-a sincronizat)
    const cloudIds = new Set(cloud.map(x => String(x.cloud_id || x.id)));
    const merged = [...cloud, ...local.filter(x => !x.cloud_id || !cloudIds.has(String(x.cloud_id)))];
    return merged;
}

async function renderReset() {
    grid.innerHTML = ''; renderedCount = 0;
    videos = await loadForGrid();
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
        media.textContent = '(fără media)';
    }

    title.textContent = v.title || 'Fără titlu';
    date.textContent = v.date ? `Data: ${formatDate(v.date)}` : '';
    desc.textContent = v.desc || '';
    (v.tags || []).forEach(t => { const s = document.createElement('span'); s.className = 'tag'; s.textContent = t; tagsEl.appendChild(s); });

    const eb = node.querySelector('[data-action="edit"]');
    const db = node.querySelector('[data-action="delete"]');
    const allowed = canEdit(v);
    eb.style.display = allowed ? '' : 'none';
    db.style.display = allowed ? '' : 'none';

    eb.addEventListener('click', () => {
        if (!allowed) return;
        editId = v.id;
        editRow = v;
        // doar meta prin "Link" (fișierele cloud recomand să le înlocuiești prin ștergere + reupload)
        tabLink.click();
        titleInput.value = v.title || '';
        urlInput.value = v.source_url || v.url || '';
        dateInput.value = v.date || new Date().toISOString().slice(0, 10);
        tagsInput.value = (v.tags || []).join(', ');
        descInput.value = v.desc || '';
        dlg.showModal();
    });

    db.addEventListener('click', async () => {
        if (!allowed) return;
        if (!confirm('Ștergi acest clip?')) return;

        // 1) încearcă să ștergi din cloud (dacă are storage_path/source_url/cloud_id)
        try {
            await supaDeleteCloudByRow(v);
        } catch (e) { console.warn('cloud delete:', e?.message || e); }

        // 2) șterge local
        videos = videos.filter(x => x !== v && x.id !== v.id);
        saveVideos(videos);
        refreshTagFilter();
        renderReset();
    });

    grid.appendChild(node);
}

/* ===== Tab-uri, Add/Edit ===== */
function setTab(name) {
    activeTab = name;
    tabLink.classList.toggle('active', name === 'link');
    tabUpload.classList.toggle('active', name === 'upload');
    panelLink.style.display = (name === 'link') ? 'block' : 'none';
    panelUpload.style.display = (name === 'upload') ? 'block' : 'none';
}
tabLink.addEventListener('click', () => setTab('link'));
tabUpload.addEventListener('click', () => setTab('upload'));

function openAdd() {
    if (!isAdmin) return alert('Doar adminul poate adăuga.');
    editId = null; editRow = null;
    setTab('link');
    titleInput.value = ''; urlInput.value = ''; dateInput.value = new Date().toISOString().slice(0, 10);
    tagsInput.value = ''; descInput.value = '';
    fileInput.value = ''; uTitleInput.value = ''; uDateInput.value = new Date().toISOString().slice(0, 10); uTagsInput.value = '';
    chkPublicLink && (chkPublicLink.checked = false);
    chkPublicUpload && (chkPublicUpload.checked = false);
    prog.hidden = true; prog.value = 0; progInfo.textContent = '';
    dlg.showModal();
}
if (btnAdd) btnAdd.addEventListener('click', openAdd);

/* ===== Salvare (cu cloud + fallback local) ===== */
saveBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
        if (activeTab === 'link') {
            const title = (titleInput.value || '').trim() || 'Fără titlu';
            const url = (urlInput.value || '').trim();
            if (!url) return alert('Pune URL (YouTube sau .mp4)');
            const date = dateInput.value || new Date().toISOString().slice(0, 10);
            const tags = (tagsInput.value || '').split(',').map(s => s.trim()).filter(Boolean);
            const desc = (descInput.value || '').trim();
            const isPublic = !!chkPublicLink?.checked;

            // UPDATE local (nu duplicăm)
            if (editId) {
                const idx = videos.findIndex(x => x.id === editId);
                if (idx >= 0) videos[idx] = { ...videos[idx], title, url, date, tags, desc, source_url: url };
                saveVideos(videos);
            } else {
                const item = { id: Date.now(), title, url, date, tags, desc, source_url: url };
                videos.unshift(item);
                saveVideos(videos);
            }

            // În paralel: încearcă să scrii și în cloud
            try {
                const ins = await supaAddLink(url, isPublic, { title, description: desc, tags, date });
                // atașează identificator cloud la itemul local (pentru ștergere ulterioară)
                const idx = videos.findIndex(x => x.id === editId || (!editId && x.source_url === url && x.title === title));
                if (idx >= 0) { videos[idx].cloud_id = ins.id; videos[idx].storage_path = ins.storage_path; videos[idx].cloud = true; saveVideos(videos); }
            } catch (e) { console.warn('cloud insert link:', e?.message || e); }

        } else {
            const file = fileInput.files?.[0];
            if (!file) return alert('Alege un fișier .mp4');
            if (file.type !== 'video/mp4') return alert('Accept doar .mp4');
            const title = (uTitleInput.value || file.name.replace(/\.[^.]+$/, '')).trim();
            const date = uDateInput.value || new Date().toISOString().slice(0, 10);
            const tags = (uTagsInput.value || '').split(',').map(s => s.trim()).filter(Boolean);
            const isPublic = !!chkPublicUpload?.checked;

            // local imediat (pentru UX)
            const blobUrl = URL.createObjectURL(file);
            const item = { id: Date.now(), title, blobUrl, url: '', date, tags, desc: '', cloud: false };
            videos.unshift(item); saveVideos(videos);

            // încearcă upload în cloud și leagă înregistrarea
            try {
                prog.hidden = false; prog.value = 5; progInfo.textContent = 'Se urcă...';
                const ins = await supaUploadMp4(file, isPublic, { title, tags, date, description: '' });
                prog.hidden = true; progInfo.textContent = '';
                // obține URL semnat pentru redare
                let signed = null; try { signed = await supaSignedUrl(ins.storage_path); } catch { }
                // actualizează itemul local (primul din listă este cel adăugat)
                const idx = videos.findIndex(x => x.id === item.id);
                if (idx >= 0) {
                    videos[idx].cloud = true;
                    videos[idx].cloud_id = ins.id;
                    videos[idx].storage_path = ins.storage_path;
                    videos[idx].url = signed || videos[idx].url;
                    saveVideos(videos);
                }
            } catch (e) {
                prog.hidden = true; progInfo.textContent = '';
                console.warn('cloud upload mp4:', e?.message || e);
                // rămâne măcar local
            }
        }

        dlg.close();
        await renderReset();
    } catch (err) {
        console.error(err);
        alert(err?.message || 'Eroare la salvare');
    }
});

/* ===== Căutare/filtre/paginare ===== */
searchInput.addEventListener('input', renderReset);
sortSelect.addEventListener('change', renderReset);
tagFilter.addEventListener('change', renderReset);
if (loadMoreBtn) loadMoreBtn.addEventListener('click', renderMore);

/* ===== Export/Import ===== */
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
    const r = new FileReader();
    r.onload = () => {
        try {
            const arr = JSON.parse(r.result); if (!Array.isArray(arr)) throw new Error('Format invalid');
            videos = arr.map(x => ({ id: x.id || Date.now() + Math.random(), title: x.title || 'Fără titlu', url: x.url || '', blobUrl: x.blobUrl || '', date: x.date || new Date().toISOString().slice(0, 10), desc: x.desc || '', tags: Array.isArray(x.tags) ? x.tags.filter(Boolean) : [], cloud: !!x.cloud, cloud_id: x.cloud_id || null, storage_path: x.storage_path || null, source_url: x.source_url || null }));
            saveVideos(videos); refreshTagFilter(); renderReset(); alert('Import realizat.'); importInput.value = '';
        } catch (e) { alert('Eroare la import: ' + e.message); }
    };
    r.readAsText(f);
});

/* ===== Admin local (care la tine „mergea sigur”) ===== */
const ADMIN_FLAG = 'vlogAdmin'; // 1 = logat
isAdmin = localStorage.getItem(ADMIN_FLAG) === '1';
function refreshAdminUI() {
    if (btnAdd) btnAdd.hidden = !isAdmin;
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

/* ===== Init ===== */
refreshAdminUI();
refreshTagFilter();
renderReset();
