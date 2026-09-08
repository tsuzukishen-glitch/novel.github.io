/* ========================================================================
   夜讀書閣 · Night Read — multi-book reader
   ======================================================================== */

/* ------------------------------------------------------------------ *
 * 小說資料夾 — 每本小說一個 .js 檔,放在 books/ 資料夾裡
 * 每個檔案呼叫 registerBook({...}) 來註冊自己,
 * books/manifest.js 只需列出檔名陣列即可。
 * ------------------------------------------------------------------ */
window.NightReadBooks = [];
window.registerBook = function (book) {
    if (!book || !book.id) {
        console.warn('registerBook: 缺少 id,已略過', book);
        return;
    }
    window.NightReadBooks.push(Object.assign({ builtin: true, addedAt: 0 }, book));
};

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('無法載入 ' + src));
        document.body.appendChild(s);
    });
}

async function loadFolderBooks() {
    window.NIGHTREAD_BOOK_FILES = null;
    try {
        await loadScript('books/manifest.js');
    } catch (err) {
        console.warn('找不到 books/manifest.js,略過資料夾小說。', err);
        return;
    }
    const files = Array.isArray(window.NIGHTREAD_BOOK_FILES) ? window.NIGHTREAD_BOOK_FILES : [];
    for (const file of files) {
        try {
            await loadScript('books/' + file);
        } catch (err) {
            console.warn(err.message);
        }
    }
}

const viewport = document.getElementById('viewport');
const sideBody = document.getElementById('sideBody');
const crumbEl = document.getElementById('crumb');
const topbarRight = document.getElementById('topbarRight');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');

let fontScale = 1;
const FONT_MIN = 0.8, FONT_MAX = 1.4, FONT_STEP = 0.1;

function allBooks() {
    return window.NightReadBooks || [];
}
function getBook(id) {
    return allBooks().find(b => b.id === id);
}
function flatChaptersOf(book) {
    const out = [];
    book.volumes.forEach(v => v.chapters.forEach(c => out.push({ ...c, volName: v.name })));
    return out;
}

/* ------------------------------------------------------------------ *
 * localStorage — progress & bookmarks & font size
 * ------------------------------------------------------------------ */
function getProgress() { try { return JSON.parse(localStorage.getItem('nr_progress') || '{}'); } catch (e) { return {}; } }
function setProgress(bookId, chapterId) {
    const p = getProgress();
    p[bookId] = { chapterId, updatedAt: Date.now() };
    localStorage.setItem('nr_progress', JSON.stringify(p));
}
function getBookmarks() { try { return JSON.parse(localStorage.getItem('nr_bookmarks') || '[]'); } catch (e) { return []; } }
function setBookmarksRaw(arr) { localStorage.setItem('nr_bookmarks', JSON.stringify(arr)); }
function isBookmarked(bookId, chapterId) {
    return getBookmarks().some(b => b.bookId === bookId && b.chapterId === chapterId);
}
function toggleBookmark(bookId, chapterId, bookTitle, chapterTitle) {
    let bms = getBookmarks();
    const idx = bms.findIndex(b => b.bookId === bookId && b.chapterId === chapterId);
    if (idx >= 0) { bms.splice(idx, 1); }
    else { bms.unshift({ bookId, chapterId, bookTitle, chapterTitle, addedAt: Date.now() }); }
    setBookmarksRaw(bms);
    return idx < 0;
}
function removeBookmarkAt(index) {
    const bms = getBookmarks();
    bms.splice(index, 1);
    setBookmarksRaw(bms);
}
function loadFontScale() {
    const v = parseFloat(localStorage.getItem('nr_font_scale'));
    fontScale = isNaN(v) ? 1 : v;
}
function saveFontScale() { localStorage.setItem('nr_font_scale', String(fontScale)); }

function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return '剛剛';
    const m = Math.floor(s / 60); if (m < 60) return m + ' 分鐘前';
    const h = Math.floor(m / 60); if (h < 24) return h + ' 小時前';
    const d = Math.floor(h / 24); if (d < 30) return d + ' 天前';
    const mo = Math.floor(d / 30); if (mo < 12) return mo + ' 個月前';
    return Math.floor(mo / 12) + ' 年前';
}

function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ------------------------------------------------------------------ *
 * Router
 * ------------------------------------------------------------------ */
function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    if (!h) return { view: 'library' };
    if (h === 'bookmarks') return { view: 'bookmarks' };
    const m = h.match(/^book\/([^/]+)(?:\/(.+))?$/);
    if (m) return { view: m[2] ? 'chapter' : 'bookhome', bookId: decodeURIComponent(m[1]), chapterId: m[2] ? decodeURIComponent(m[2]) : null };
    return { view: 'library' };
}
function currentHashRaw() { return location.hash.replace(/^#\/?/, ''); }
function navTo(hash) {
    if (currentHashRaw() === hash) {
        route();
    } else {
        location.hash = hash;
    }
}

window.addEventListener('hashchange', route);

/* ------------------------------------------------------------------ *
 * Sidebar rendering
 * ------------------------------------------------------------------ */
function renderGlobalNav(activeView) {
    const bmkCount = getBookmarks().length;
    const navLinkBase = 'flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-inkDim text-sm cursor-pointer mb-0.5 hover:bg-panelHover';
    let html = `
    <div class="${navLinkBase} ${activeView === 'library' ? 'bg-panelHover text-gold' : ''}" data-nav="library">
      <i class="ph ph-books w-4 text-center opacity-85"></i><span>書架</span>
      <span class="ml-auto text-[10.5px] text-inkFaint bg-void border border-line rounded-full px-2 py-0.5">${allBooks().length}</span>
    </div>
    <div class="${navLinkBase} ${activeView === 'bookmarks' ? 'bg-panelHover text-gold' : ''}" data-nav="bookmarks">
      <i class="ph ph-bookmark-simple w-4 text-center opacity-85"></i><span>書籤</span>
      ${bmkCount ? `<span class="ml-auto text-[10.5px] text-inkFaint bg-void border border-line rounded-full px-2 py-0.5">${bmkCount}</span>` : ''}
    </div>
    <div class="text-[10.5px] tracking-widest text-inkFaint px-3.5 pt-5 pb-2">我的書櫃</div>
  `;
    allBooks().forEach(b => {
        html += `<div class="flex items-center gap-2.5 px-3.5 py-2 rounded-lg cursor-pointer text-inkFaint text-[13px] hover:bg-panelHover hover:text-inkDim" data-book="${b.id}">
      <span class="w-1.5 h-1.5 rounded-full bg-violetSoft shrink-0"></span>
      <span class="overflow-hidden text-ellipsis whitespace-nowrap">${escapeHtml(b.title)}</span>
    </div>`;
    });
    sideBody.innerHTML = html;
    sideBody.querySelectorAll('[data-nav]').forEach(el => {
        el.addEventListener('click', () => { navTo(el.dataset.nav === 'library' ? '' : el.dataset.nav); closeSidebarMobile(); });
    });
    sideBody.querySelectorAll('[data-book]').forEach(el => {
        el.addEventListener('click', () => { navTo('book/' + encodeURIComponent(el.dataset.book)); closeSidebarMobile(); });
    });
}

function renderBookSidebar(book, activeChapterId) {
    let html = `
    <div class="flex items-center gap-2 px-3.5 py-3 mx-1.5 mt-1.5 mb-1 text-inkFaint text-[12.5px] cursor-pointer rounded-lg hover:bg-panelHover hover:text-inkDim" id="backToShelf">
      <i class="ph ph-arrow-left"></i><span>返回書架</span>
    </div>
    <div class="px-3.5 pt-1.5 pb-3.5 font-serif text-[15.5px] font-semibold text-ink leading-snug border-b border-lineSoft mb-2">${escapeHtml(book.title)}</div>
  `;
    book.volumes.forEach((vol, vi) => {
        const isOpen = activeChapterId ? vol.chapters.some(c => c.id === activeChapterId) : vi === 0;
        html += `<div class="mb-1" data-vi="${vi}">
      <div class="vol-head flex items-center gap-2.5 px-3 pt-3 pb-1.5 cursor-pointer select-none" data-vi="${vi}">
        <div class="font-serif text-[11px] text-violet border border-violetSoft rounded-full w-5 h-5 flex items-center justify-center shrink-0">${vi + 1}</div>
        <h2 class="font-serif text-[13.5px] font-semibold m-0 text-inkDim tracking-wide flex-1">${escapeHtml(vol.name)}</h2>
        <span class="vol-chev text-inkFaint text-xs transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}" data-chev="${vi}">
          <i class="ph ph-caret-right"></i>
        </span>
      </div>
      <div class="chap-list ${isOpen ? '' : 'hidden'}">`;
        vol.chapters.forEach(ch => {
            const label = ch.num === -1 ? '序' : String(ch.num).padStart(2, '0');
            const short = ch.title.includes('・') ? ch.title.split('・').slice(1).join('・') : ch.title;
            const isActive = ch.id === activeChapterId;
            const bmk = isBookmarked(book.id, ch.id) ? '<i class="bmk ml-auto text-gold text-[11px] opacity-85 ph-fill ph-star"></i>' : '';
            html += `<div class="chap-item flex items-baseline gap-2.5 py-2 pl-[42px] pr-3.5 cursor-pointer border-l-2 ${isActive ? 'border-gold bg-panelHover text-gold' : 'border-transparent text-inkFaint hover:bg-panelHover hover:text-inkDim'} text-[13.5px] leading-snug" data-chid="${ch.id}">
        <span class="font-serif opacity-60 shrink-0 min-w-[20px]">${label}</span><span class="overflow-hidden text-ellipsis whitespace-nowrap">${escapeHtml(short)}</span>${bmk}
      </div>`;
        });
        html += `</div></div>`;
    });
    sideBody.innerHTML = html;

    document.getElementById('backToShelf').addEventListener('click', () => { navTo(''); closeSidebarMobile(); });

    sideBody.querySelectorAll('.vol-head').forEach(vh => {
        const vi = +vh.dataset.vi;
        const vol = book.volumes[vi];
        const chapList = vh.nextElementSibling;
        const chev = vh.querySelector('.vol-chev');
        // chevron: only toggles expand/collapse, does not navigate
        chev.addEventListener('click', (e) => {
            e.stopPropagation();
            chapList.classList.toggle('hidden');
            chev.classList.toggle('rotate-90');
        });
        // clicking the rest of the header navigates straight to that volume's first chapter
        vh.addEventListener('click', () => {
            if (!vol.chapters.length) return;
            navTo('book/' + encodeURIComponent(book.id) + '/' + encodeURIComponent(vol.chapters[0].id));
            closeSidebarMobile();
        });
    });

    sideBody.querySelectorAll('.chap-item').forEach(ci => {
        ci.addEventListener('click', () => { navTo('book/' + encodeURIComponent(book.id) + '/' + encodeURIComponent(ci.dataset.chid)); closeSidebarMobile(); });
    });
}

/* ------------------------------------------------------------------ *
 * Topbar right controls
 * ------------------------------------------------------------------ */
function renderTopbarRight({ showBookmarkStar, bookId, chapterId, bookTitle, chapterTitle } = {}) {
    let html = '';
    const iconBtnBase = 'w-[34px] h-[34px] flex items-center justify-center bg-panel border border-line rounded-lg text-[14.5px] cursor-pointer hover:border-violetSoft hover:text-ink';
    if (showBookmarkStar) {
        const on = isBookmarked(bookId, chapterId);
        html += `<button class="${iconBtnBase} ${on ? 'text-gold border-goldSoft' : 'text-inkDim'}" id="bmkStarBtn" aria-label="加入書籤">
      <i class="${on ? 'ph-fill' : 'ph'} ph-star"></i>
    </button>`;
    }
    html += `
    <div class="flex items-center gap-0.5 bg-panel border border-line rounded-lg p-[3px]">
      <button id="fontDown" class="w-7 h-7 bg-transparent border-none text-inkDim font-serif text-[11px] cursor-pointer rounded-md hover:bg-panelHover hover:text-gold" aria-label="縮小字體">A</button>
      <button id="fontReset" class="w-7 h-7 bg-transparent border-none text-inkDim text-[10px] cursor-pointer rounded-md hover:bg-panelHover hover:text-gold" aria-label="重設字體">重設</button>
      <button id="fontUp" class="w-7 h-7 bg-transparent border-none text-inkDim font-serif text-base cursor-pointer rounded-md hover:bg-panelHover hover:text-gold" aria-label="放大字體">A</button>
    </div>
  `;
    topbarRight.innerHTML = html;

    if (showBookmarkStar) {
        document.getElementById('bmkStarBtn').addEventListener('click', () => {
            const nowOn = toggleBookmark(bookId, chapterId, bookTitle, chapterTitle);
            const btn = document.getElementById('bmkStarBtn');
            btn.innerHTML = `<i class="${nowOn ? 'ph-fill' : 'ph'} ph-star"></i>`;
            btn.classList.toggle('text-gold', nowOn);
            btn.classList.toggle('border-goldSoft', nowOn);
            btn.classList.toggle('text-inkDim', !nowOn);
            // refresh sidebar star markers
            document.querySelectorAll(`.chap-item[data-chid="${chapterId}"] .bmk`).forEach(e => e.remove());
            if (nowOn) {
                const item = document.querySelector(`.chap-item[data-chid="${chapterId}"]`);
                if (item) {
                    const s = document.createElement('i');
                    s.className = 'bmk ml-auto text-gold text-[11px] opacity-85 ph-fill ph-star';
                    item.appendChild(s);
                }
            }
        });
    }
    document.getElementById('fontUp').addEventListener('click', () => { fontScale = Math.min(FONT_MAX, +(fontScale + FONT_STEP).toFixed(2)); saveFontScale(); applyFontScale(); });
    document.getElementById('fontDown').addEventListener('click', () => { fontScale = Math.max(FONT_MIN, +(fontScale - FONT_STEP).toFixed(2)); saveFontScale(); applyFontScale(); });
    document.getElementById('fontReset').addEventListener('click', () => { fontScale = 1; saveFontScale(); applyFontScale(); });
}
function applyFontScale() {
    document.querySelectorAll('.chapter-prose').forEach(el => { el.style.fontSize = (17 * fontScale).toFixed(1) + 'px'; });
}

/* ------------------------------------------------------------------ *
 * Theme / 配色設定
 * ------------------------------------------------------------------ */
const THEME_STORAGE_KEY = 'nr_theme_vars';
const THEME_PRESET_KEY = 'nr_theme_preset';
const THEME_VAR_NAMES = ['--bg-void', '--bg-panel', '--bg-panel-hover', '--bg-card',
    '--line', '--line-soft', '--ink', '--ink-dim', '--ink-faint',
    '--gold', '--gold-soft', '--violet', '--violet-soft', '--danger'];

const THEME_PRESETS = [
    {
        id: 'vesper', name: '夜幕紫金', vars: {
            '--bg-void': '#0e0c15', '--bg-panel': '#161320', '--bg-panel-hover': '#1e1a2c', '--bg-card': '#191625',
            '--line': '#2c2740', '--line-soft': '#221e33', '--ink': '#e9e3d8', '--ink-dim': '#a89fc4', '--ink-faint': '#6f6789',
            '--gold': '#dfb35c', '--gold-soft': '#a8894a', '--violet': '#8770c9', '--violet-soft': '#5c4f8a', '--danger': '#c96a5b'
        }
    },
    {
        id: 'ink', name: '墨黑赤金', vars: {
            '--bg-void': '#0a0a0a', '--bg-panel': '#141414', '--bg-panel-hover': '#1c1c1c', '--bg-card': '#161616',
            '--line': '#2e2a2a', '--line-soft': '#221f1f', '--ink': '#ece6df', '--ink-dim': '#b8a89a', '--ink-faint': '#786a5f',
            '--gold': '#d98c4a', '--gold-soft': '#a8663a', '--violet': '#c9605c', '--violet-soft': '#8a4643', '--danger': '#d9534f'
        }
    },
    {
        id: 'abyss', name: '深海靛藍', vars: {
            '--bg-void': '#0a0f1a', '--bg-panel': '#111a2b', '--bg-panel-hover': '#182437', '--bg-card': '#131e30',
            '--line': '#233047', '--line-soft': '#1a2437', '--ink': '#dfe6ef', '--ink-dim': '#94a8c4', '--ink-faint': '#5f7089',
            '--gold': '#5cc2df', '--gold-soft': '#4a95a8', '--violet': '#7089d6', '--violet-soft': '#4f5c8a', '--danger': '#c9705b'
        }
    },
    {
        id: 'forest', name: '森林墨綠', vars: {
            '--bg-void': '#0b1210', '--bg-panel': '#121c19', '--bg-panel-hover': '#1a2723', '--bg-card': '#14201c',
            '--line': '#28382f', '--line-soft': '#1d2b24', '--ink': '#e2e9de', '--ink-dim': '#a3bfa0', '--ink-faint': '#69826a',
            '--gold': '#c9b25c', '--gold-soft': '#a8934a', '--violet': '#5ca887', '--violet-soft': '#4a7a5c', '--danger': '#c9705b'
        }
    },
    {
        id: 'rouge', name: '胭脂酒紅', vars: {
            '--bg-void': '#130b0e', '--bg-panel': '#1e1216', '--bg-panel-hover': '#291a1f', '--bg-card': '#20141a',
            '--line': '#3a2530', '--line-soft': '#2b1c24', '--ink': '#f0e3e2', '--ink-dim': '#c69fa8', '--ink-faint': '#89676f',
            '--gold': '#dfa85c', '--gold-soft': '#a87c4a', '--violet': '#c96a8a', '--violet-soft': '#8a4f63', '--danger': '#d9534f'
        }
    }
];

function getPresetById(id) { return THEME_PRESETS.find(p => p.id === id) || THEME_PRESETS[0]; }

function applyThemeVars(vars) {
    const root = document.documentElement.style;
    THEME_VAR_NAMES.forEach(name => {
        if (vars[name]) root.setProperty(name, vars[name]);
    });
}

function currentThemeVars() {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored) {
        try { return JSON.parse(stored); } catch (e) { /* fall through */ }
    }
    const presetId = localStorage.getItem(THEME_PRESET_KEY) || 'vesper';
    return Object.assign({}, getPresetById(presetId).vars);
}

function saveThemeVars(vars) {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(vars));
}

function loadTheme() {
    applyThemeVars(currentThemeVars());
}

// 簡易十六進位顏色明暗調整,用來從主色推算「柔和版」顏色
function shadeColor(hex, percent) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const num = parseInt(hex, 16);
    let r = (num >> 16) + Math.round(255 * percent);
    let g = (num >> 8 & 0x00FF) + Math.round(255 * percent);
    let b = (num & 0x0000FF) + Math.round(255 * percent);
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
}

function initThemePanel() {
    const paletteBtn = document.getElementById('paletteBtn');
    const backdrop = document.getElementById('themeBackdrop');
    const closeBtn = document.getElementById('closeThemeBtn');
    const grid = document.getElementById('themeGrid');
    const goldInput = document.getElementById('themeGoldInput');
    const violetInput = document.getElementById('themeVioletInput');
    const resetBtn = document.getElementById('themeResetBtn');
    if (!paletteBtn || !backdrop) return;

    function openBackdrop() { backdrop.classList.remove('hidden'); backdrop.classList.add('flex'); }
    function closeBackdrop() { backdrop.classList.add('hidden'); backdrop.classList.remove('flex'); }

    function renderSwatches() {
        const active = currentThemeVars();
        grid.innerHTML = THEME_PRESETS.map(p => {
            const isActive = active['--bg-void'] === p.vars['--bg-void'] && active['--gold'] === p.vars['--gold'] && active['--violet'] === p.vars['--violet'];
            return `
        <button type="button" class="flex flex-col items-center gap-2 py-3 px-1.5 bg-void border ${isActive ? 'border-goldSoft' : 'border-line'} rounded-[10px] cursor-pointer hover:border-violetSoft" data-preset="${p.id}" aria-label="${p.name}">
          <span class="w-11 h-[30px] rounded-md border border-lineSoft flex items-end justify-center gap-1 pb-1.5" style="background:${p.vars['--bg-void']}">
            <span class="w-2.5 h-2.5 rounded-full inline-block" style="background:${p.vars['--gold']}"></span>
            <span class="w-2.5 h-2.5 rounded-full inline-block" style="background:${p.vars['--violet']}"></span>
          </span>
          <span class="text-[11px] text-inkDim text-center">${p.name}</span>
        </button>
      `;
        }).join('');
        grid.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                const preset = getPresetById(btn.dataset.preset);
                const vars = Object.assign({}, preset.vars);
                applyThemeVars(vars);
                saveThemeVars(vars);
                localStorage.setItem(THEME_PRESET_KEY, preset.id);
                goldInput.value = vars['--gold'];
                violetInput.value = vars['--violet'];
                renderSwatches();
            });
        });
    }

    function syncColorInputs() {
        const active = currentThemeVars();
        goldInput.value = active['--gold'];
        violetInput.value = active['--violet'];
    }

    renderSwatches();
    syncColorInputs();

    paletteBtn.addEventListener('click', () => {
        renderSwatches();
        syncColorInputs();
        openBackdrop();
    });
    closeBtn.addEventListener('click', closeBackdrop);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeBackdrop(); });

    goldInput.addEventListener('input', () => {
        const vars = currentThemeVars();
        vars['--gold'] = goldInput.value;
        vars['--gold-soft'] = shadeColor(goldInput.value, -0.18);
        applyThemeVars(vars);
        saveThemeVars(vars);
        renderSwatches();
    });
    violetInput.addEventListener('input', () => {
        const vars = currentThemeVars();
        vars['--violet'] = violetInput.value;
        vars['--violet-soft'] = shadeColor(violetInput.value, -0.18);
        applyThemeVars(vars);
        saveThemeVars(vars);
        renderSwatches();
    });
    resetBtn.addEventListener('click', () => {
        const vars = Object.assign({}, THEME_PRESETS[0].vars);
        applyThemeVars(vars);
        saveThemeVars(vars);
        localStorage.setItem(THEME_PRESET_KEY, THEME_PRESETS[0].id);
        syncColorInputs();
        renderSwatches();
    });
}

/* ------------------------------------------------------------------ *
 * Views
 * ------------------------------------------------------------------ */
function renderLibrary() {
    crumbEl.textContent = '書架';
    renderGlobalNav('library');
    topbarRight.innerHTML = '';
    const progress = getProgress();

    let cards = allBooks().map(b => {
        const chCount = flatChaptersOf(b).length;
        const prog = progress[b.id];
        let progHtml = '';
        if (prog) {
            const ch = flatChaptersOf(b).find(c => c.id === prog.chapterId);
            if (ch) {
                const short = ch.title.includes('・') ? ch.title.split('・').slice(1).join('・') : ch.title;
                progHtml = `<div class="text-[11px] text-gold bg-[color-mix(in_srgb,var(--gold)_10%,transparent)] border border-goldSoft rounded-full px-2.5 py-1 inline-flex items-center gap-1.5 self-start"><i class="ph-fill ph-play text-[9px]"></i>讀到「${escapeHtml(short)}」</div>`;
            }
        }
        return `
      <div class="bg-card border border-line rounded-2xl p-5 cursor-pointer flex flex-col gap-3.5 min-h-[190px] relative transition hover:border-violetSoft hover:-translate-y-0.5" data-book="${b.id}">
        <div class="w-11 h-11 rounded-[10px] flex items-center justify-center font-serif text-[19px] text-[#1b1508] shrink-0 bg-[linear-gradient(135deg,var(--gold),var(--violet))]">${escapeHtml(b.title.slice(0, 1))}</div>
        <h3 class="font-serif text-[16.5px] font-semibold m-0 text-ink leading-snug">${escapeHtml(b.title)}</h3>
        <div class="text-xs text-inkFaint leading-relaxed flex-1 overflow-hidden line-clamp-3">${escapeHtml(b.tagline || '尚無簡介')}</div>
        ${progHtml}
        <div class="flex items-center justify-between text-[11.5px] text-inkFaint"><span>${chCount} 章節</span><span>內建</span></div>
      </div>
    `;
    }).join('');

    viewport.innerHTML = `
    <div class="flex-1 px-8 pt-14 pb-[100px] max-[860px]:px-[18px] max-[860px]:pt-8 max-[860px]:pb-20">
      <div class="max-w-[1040px] mx-auto">
        <div class="mb-9">
          <div class="text-xs tracking-[0.14em] text-violet mb-2.5">MY LIBRARY</div>
          <h1 class="font-serif text-[28px] font-bold m-0 mb-2.5">書架</h1>
          <p class="text-[13.5px] text-inkFaint leading-relaxed max-w-[560px]">收藏你的原創小說,隨時隨地繼續閱讀。</p>
        </div>
        <div class="grid gap-5 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
          ${cards}
        </div>
      </div>
    </div>
  `;

    viewport.querySelectorAll('[data-book]').forEach(card => {
        card.addEventListener('click', () => {
            navTo('book/' + encodeURIComponent(card.dataset.book));
        });
    });
}

function renderBookmarksPage() {
    crumbEl.textContent = '書籤';
    renderGlobalNav('bookmarks');
    topbarRight.innerHTML = '';
    const bms = getBookmarks();

    if (!bms.length) {
        viewport.innerHTML = `
      <div class="flex-1 px-8 pt-14 pb-[100px] max-[860px]:px-[18px] max-[860px]:pt-8 max-[860px]:pb-20">
        <div class="max-w-[1040px] mx-auto">
          <div class="mb-9">
            <div class="text-xs tracking-[0.14em] text-violet mb-2.5">SAVED</div>
            <h1 class="font-serif text-[28px] font-bold m-0 mb-2.5">書籤</h1>
          </div>
          <div class="text-center py-16 px-5 text-inkFaint">
            <div class="text-[34px] mb-4 opacity-60 flex justify-center"><i class="ph ph-bookmark-simple"></i></div>
            <p class="text-[13.5px] leading-loose">還沒有任何書籤。<br>閱讀時點擊右上角的星號即可收藏該章節。</p>
          </div>
        </div>
      </div>
    `;
        return;
    }

    const rows = bms.map((b, i) => `
    <div class="flex items-center gap-4 px-[18px] py-4 bg-card border border-line rounded-[10px] mb-2.5 cursor-pointer hover:border-violetSoft" data-idx="${i}">
      <i class="ph-fill ph-star text-gold text-base shrink-0"></i>
      <div class="flex-1 min-w-0">
        <div class="text-[11.5px] text-inkFaint mb-1">${escapeHtml(b.bookTitle)}</div>
        <div class="font-serif text-[15px] text-ink whitespace-nowrap overflow-hidden text-ellipsis">${escapeHtml(b.chapterTitle)}</div>
      </div>
      <div class="text-[11px] text-inkFaint shrink-0">${timeAgo(b.addedAt)}</div>
      <button class="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center bg-transparent border border-line text-inkFaint cursor-pointer hover:text-danger hover:border-danger" data-remove="${i}" aria-label="移除書籤">
        <i class="ph ph-x"></i>
      </button>
    </div>
  `).join('');

    viewport.innerHTML = `
    <div class="flex-1 px-8 pt-14 pb-[100px] max-[860px]:px-[18px] max-[860px]:pt-8 max-[860px]:pb-20">
      <div class="max-w-[1040px] mx-auto">
        <div class="mb-9">
          <div class="text-xs tracking-[0.14em] text-violet mb-2.5">SAVED</div>
          <h1 class="font-serif text-[28px] font-bold m-0 mb-2.5">書籤</h1>
          <p class="text-[13.5px] text-inkFaint leading-relaxed max-w-[560px]">共 ${bms.length} 個收藏章節</p>
        </div>
        <div class="flex flex-col gap-0.5">${rows}</div>
      </div>
    </div>
  `;

    viewport.querySelectorAll('[data-idx]').forEach(row => {
        row.addEventListener('click', (e) => {
            if (e.target.closest('[data-remove]')) return;
            const b = bms[+row.dataset.idx];
            navTo('book/' + encodeURIComponent(b.bookId) + '/' + encodeURIComponent(b.chapterId));
        });
    });
    viewport.querySelectorAll('[data-remove]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeBookmarkAt(+btn.dataset.remove);
            renderBookmarksPage();
        });
    });
}

function renderBookHome(book) {
    crumbEl.textContent = book.title;
    renderBookSidebar(book, null);
    topbarRight.innerHTML = '';
    const chapters = flatChaptersOf(book);
    const prog = getProgress()[book.id];
    const progCh = prog && chapters.find(c => c.id === prog.chapterId);

    viewport.innerHTML = `
    <div class="flex-1 flex items-center justify-center px-6 py-16 min-h-[calc(100vh-63px)]">
      <div class="max-w-[520px] text-center">
        <div class="relative w-16 h-16 mx-auto mb-7 border border-goldSoft rounded-full flex items-center justify-center">
          <span class="absolute -inset-2 rounded-full border border-violetSoft opacity-50"></span>
          <span class="font-serif text-gold text-[22px]">${escapeHtml(book.title.slice(0, 1))}</span>
        </div>
        ${book.author ? `<div class="font-serif text-sm text-inkDim tracking-wide mb-2">${escapeHtml(book.author)}</div>` : ''}
        <h1 class="font-serif text-[38px] font-bold m-0 mb-4 leading-tight max-[860px]:text-[30px] bg-[linear-gradient(135deg,var(--ink)_20%,var(--gold)_60%,var(--violet)_100%)] bg-clip-text text-transparent">${escapeHtml(book.title)}</h1>
        <p class="text-[13px] text-inkFaint mb-10 leading-[1.9]">${escapeHtml(book.tagline || '')}</p>
        <div>
          <button class="inline-flex items-center gap-2.5 px-8 py-3.5 bg-gold text-[#1b1508] border-none rounded-full font-sans text-[14.5px] font-semibold cursor-pointer tracking-wide hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(223,179,92,.25)] transition" id="startBtn">
            <i class="${progCh ? 'ph-fill ph-play' : 'ph ph-book-open-text'}"></i>${progCh ? '繼續閱讀' : '開始閱讀'}
          </button>
          ${progCh ? `<button class="inline-flex items-center gap-2.5 px-8 py-3.5 bg-transparent border border-line text-inkDim rounded-full font-sans text-[14.5px] font-semibold cursor-pointer tracking-wide ml-2.5 hover:-translate-y-0.5 transition" id="restartBtn"><i class="ph ph-arrow-counter-clockwise"></i>從頭開始</button>` : ''}
        </div>
        <div class="mt-12 flex justify-center gap-7 text-xs text-inkFaint max-[860px]:gap-[18px]">
          <div><b class="block font-serif text-[19px] text-inkDim font-semibold mb-1">${book.volumes.length}</b>卷</div>
          <div><b class="block font-serif text-[19px] text-inkDim font-semibold mb-1">${chapters.length}</b>章節</div>
          <div><b class="block font-serif text-[19px] text-inkDim font-semibold mb-1">精選</b>收藏</div>
        </div>
      </div>
    </div>
  `;
    document.getElementById('startBtn').addEventListener('click', () => {
        const target = progCh ? progCh.id : chapters[0].id;
        navTo('book/' + encodeURIComponent(book.id) + '/' + encodeURIComponent(target));
    });
    const restartBtn = document.getElementById('restartBtn');
    if (restartBtn) restartBtn.addEventListener('click', () => navTo('book/' + encodeURIComponent(book.id) + '/' + encodeURIComponent(chapters[0].id)));
}

function renderChapter(book, chapterId) {
    const chapters = flatChaptersOf(book);
    const idx = chapters.findIndex(c => c.id === chapterId);
    if (idx === -1) { navTo('book/' + encodeURIComponent(book.id)); return; }
    const ch = chapters[idx];
    const prev = chapters[idx - 1];
    const next = chapters[idx + 1];

    crumbEl.innerHTML = `${escapeHtml(book.title)} <b>›</b> ${escapeHtml(ch.title)}`;
    renderBookSidebar(book, ch.id);
    renderTopbarRight({ showBookmarkStar: true, bookId: book.id, chapterId: ch.id, bookTitle: book.title, chapterTitle: ch.title });

    const navBtnBase = 'flex-1 flex flex-col gap-1.5 px-4.5 py-4 bg-panel border border-line rounded-[10px] cursor-pointer text-inkDim min-w-0 hover:border-violetSoft hover:bg-panelHover';

    viewport.innerHTML = `
    <div class="flex-1 flex justify-center px-6 pb-[100px]">
      <div class="w-full max-w-[640px] pt-14 max-[860px]:pt-8">
        <div class="text-xs tracking-[0.14em] text-violet mb-3.5">${escapeHtml(ch.volName)}</div>
        <h1 class="font-serif text-[30px] font-bold text-ink leading-snug m-0 mb-10 pb-7 border-b border-lineSoft max-[860px]:text-2xl max-[860px]:mb-7 max-[860px]:pb-5">${escapeHtml(ch.title)}</h1>
        <div class="chapter-prose">${ch.html}</div>
        <div class="flex justify-between gap-4 mt-16 pt-7 border-t border-lineSoft max-[860px]:flex-col">
          ${prev
            ? `<div class="${navBtnBase}" id="prevBtn"><span class="text-[11px] text-inkFaint tracking-wide flex items-center gap-1"><i class="ph ph-arrow-left"></i>上一章</span><span class="font-serif text-[14.5px] text-ink whitespace-nowrap overflow-hidden text-ellipsis w-full">${escapeHtml(prev.title)}</span></div>`
            : `<div class="${navBtnBase} opacity-35 pointer-events-none"><span class="text-[11px] text-inkFaint tracking-wide flex items-center gap-1"><i class="ph ph-arrow-left"></i>上一章</span><span class="font-serif text-[14.5px] text-ink whitespace-nowrap overflow-hidden text-ellipsis w-full">已是首章</span></div>`}
          ${next
            ? `<div class="${navBtnBase} text-right items-end max-[860px]:items-start max-[860px]:text-left" id="nextBtn"><span class="text-[11px] text-inkFaint tracking-wide flex items-center gap-1">下一章<i class="ph ph-arrow-right"></i></span><span class="font-serif text-[14.5px] text-ink whitespace-nowrap overflow-hidden text-ellipsis w-full">${escapeHtml(next.title)}</span></div>`
            : `<div class="${navBtnBase} text-right items-end max-[860px]:items-start max-[860px]:text-left opacity-35 pointer-events-none"><span class="text-[11px] text-inkFaint tracking-wide flex items-center gap-1">下一章<i class="ph ph-arrow-right"></i></span><span class="font-serif text-[14.5px] text-ink whitespace-nowrap overflow-hidden text-ellipsis w-full">全文完</span></div>`}
        </div>
      </div>
    </div>
  `;
    applyFontScale();
    if (prev) document.getElementById('prevBtn').addEventListener('click', () => navTo('book/' + encodeURIComponent(book.id) + '/' + encodeURIComponent(prev.id)));
    if (next) document.getElementById('nextBtn').addEventListener('click', () => navTo('book/' + encodeURIComponent(book.id) + '/' + encodeURIComponent(next.id)));
    window.scrollTo({ top: 0, behavior: 'instant' });

    setProgress(book.id, ch.id);
}

/* ------------------------------------------------------------------ *
 * Route dispatch
 * ------------------------------------------------------------------ */
function route() {
    const r = parseHash();
    if (r.view === 'library') { renderLibrary(); return; }
    if (r.view === 'bookmarks') { renderBookmarksPage(); return; }
    const book = getBook(r.bookId);
    if (!book) { navTo(''); return; }
    if (r.view === 'bookhome') { renderBookHome(book); return; }
    if (r.view === 'chapter') { renderChapter(book, r.chapterId); return; }
    renderLibrary();
}

/* ------------------------------------------------------------------ *
 * Sidebar mobile toggle
 * ------------------------------------------------------------------ */
document.getElementById('menuBtn').addEventListener('click', () => {
    sidebar.classList.add('show');
    overlay.classList.remove('hidden');
});
overlay.addEventListener('click', closeSidebarMobile);
function closeSidebarMobile() {
    sidebar.classList.remove('show');
    overlay.classList.add('hidden');
}
document.getElementById('brandHome').addEventListener('click', () => { navTo(''); closeSidebarMobile(); });

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */
(async function boot() {
    loadTheme();
    initThemePanel();
    loadFontScale();
    await loadFolderBooks();
    route();
})();