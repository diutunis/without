/* without end — a book you flip through.
   Pages live in #pages in reading order; this binds them into leaves:
   two pages per leaf on wide screens (an open book), one per leaf on phones. */

(function () {
    const root = document.documentElement;
    const book = document.getElementById('book');
    const store = document.getElementById('pages');
    const pages = Array.from(store.children).filter(el => el.classList.contains('page'));
    const N = pages.length;

    const prevBtn = document.getElementById('prev');
    const nextBtn = document.getElementById('next');
    const tocBtn = document.getElementById('toc');
    const where = document.getElementById('where');
    const lightbox = document.getElementById('lightbox');
    const lbImg = lightbox.querySelector('img');

    const narrow = window.matchMedia('(max-width: 820px)');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const DUR = reduceMotion ? 20 : 900;

    let mode = null;      // 'spread' | 'single'
    let leaves = [];
    let cur = 0;          // number of leaves turned
    let z = 100;
    let settleTimer = null;
    let lastSwipe = 0;

    // Page numbers
    pages.forEach((p, i) => {
        p.dataset.index = i;
        if (!p.classList.contains('no-folio')) {
            const f = document.createElement('span');
            f.className = 'folio';
            f.textContent = i;
            p.appendChild(f);
        }
    });

    /* ---------- Sizing ---------- */

    function size() {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let pw, ph, fs;
        if (!narrow.matches) {
            const aw = vw - 72;
            const ah = vh - 30 - 120;
            ph = Math.min(ah, 900);
            pw = ph * 0.7;
            if (pw * 2 > aw) { pw = aw / 2; ph = pw / 0.7; }
            fs = pw / 31;            // type scales with the page, so layout never reflows
        } else {
            pw = Math.min(vw - 20, 560);
            ph = Math.min(vh - 26 - 84, pw / 0.6);
            fs = Math.max(14.5, Math.min(17, pw / 26));
        }
        root.style.setProperty('--pw', pw + 'px');
        root.style.setProperty('--ph', ph + 'px');
        root.style.setProperty('--fs', fs + 'px');
    }

    /* ---------- Binding ---------- */

    function readHash() {
        const m = location.hash.match(/page-(\d+)/);
        return m ? Math.max(0, Math.min(N - 1, parseInt(m[1], 10))) : 0;
    }

    function firstVisiblePage() {
        if (mode === null) return readHash();
        if (mode === 'spread') return cur === 0 ? 0 : Math.min(N - 1, 2 * cur - 1);
        return cur;
    }

    function maxCur() {
        return mode === 'spread' ? leaves.length : leaves.length - 1;
    }

    function build() {
        const page = firstVisiblePage();
        mode = narrow.matches ? 'single' : 'spread';

        pages.forEach(p => store.appendChild(p));
        leaves.forEach(l => l.remove());
        leaves = [];

        const count = mode === 'spread' ? Math.ceil(N / 2) : N;
        for (let i = 0; i < count; i++) {
            const leaf = document.createElement('div');
            leaf.className = 'leaf';
            const front = document.createElement('div');
            front.className = 'face front';
            const back = document.createElement('div');
            back.className = 'face back';

            if (mode === 'spread') {
                front.appendChild(pages[2 * i]);
                if (pages[2 * i + 1]) back.appendChild(pages[2 * i + 1]);
                const cl = document.createElement('div');
                cl.className = 'corner corner-l';
                back.appendChild(cl);
            } else {
                front.appendChild(pages[i]);
            }
            const cr = document.createElement('div');
            cr.className = 'corner';
            front.appendChild(cr);

            leaf.append(front, back);
            book.appendChild(leaf);
            leaves.push(leaf);
        }

        book.className = 'book ' + mode + ' no-anim';
        cur = mode === 'spread' ? Math.floor((page + 1) / 2) : page;
        leaves.forEach((l, i) => l.classList.toggle('flipped', i < cur));
        settle();
        chrome();
        void book.offsetWidth;
        requestAnimationFrame(() => requestAnimationFrame(() => book.classList.remove('no-anim')));
    }

    /* ---------- State ---------- */

    function visiblePages() {
        if (mode === 'single') return [pages[cur]];
        const v = [];
        if (cur > 0) v.push(pages[2 * cur - 1]);
        if (cur < leaves.length && pages[2 * cur]) v.push(pages[2 * cur]);
        return v;
    }

    // Load images on the pages around where the reader is
    function loadNearby() {
        const first = firstVisiblePage();
        const from = Math.max(0, first - 4);
        const to = Math.min(N - 1, first + (mode === 'spread' ? 7 : 4));
        for (let i = from; i <= to; i++) {
            pages[i].querySelectorAll('img[data-src]').forEach(img => {
                img.onload = () => img.removeAttribute('data-loading');
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
            });
        }
    }

    // Resting state: stacking order, hidden faces, live media
    function settle() {
        z = 100;
        const count = leaves.length;
        leaves.forEach((l, i) => {
            const f = l.classList.contains('flipped');
            l.style.zIndex = f ? i + 1 : count - i + 1;
            l.children[0].classList.toggle('off', f);
            l.children[1].classList.toggle('off', !f || mode === 'single');
            l.classList.toggle('top-r', !f && i === cur);
            l.classList.toggle('top-l', f && i === cur - 1);
        });
        const visible = visiblePages();
        visible.forEach(p => {
            p.querySelectorAll('iframe[data-src]').forEach(fr => {
                fr.src = fr.dataset.src;
                fr.removeAttribute('data-src');
            });
        });
        if (visible.some(p => p.classList.contains('draw-page'))) fitCanvas();
        loadNearby();
    }

    function chrome() {
        const count = leaves.length;
        book.classList.toggle('at-start', mode === 'spread' && cur === 0);
        book.classList.toggle('at-end', mode === 'spread' && cur === count);
        book.style.setProperty('--rs', mode === 'spread' ? (count - cur) * 0.4 : 0);
        book.style.setProperty('--ls', mode === 'spread' ? cur * 0.4 : 0);
        prevBtn.disabled = cur === 0;
        nextBtn.disabled = cur >= maxCur();

        const v = visiblePages();
        const nums = v.filter(p => !p.classList.contains('no-folio')).map(p => +p.dataset.index);
        const section = v[v.length - 1].dataset.section || '';
        let label = section;
        if (nums.length === 2) label += ' · pp. ' + nums[0] + '–' + nums[1];
        else if (nums.length === 1) label += ' · p. ' + nums[0];
        where.textContent = label;

        const first = firstVisiblePage();
        try {
            history.replaceState(null, '', first ? '#page-' + first : location.pathname + location.search);
        } catch (e) { /* ignore */ }
        loadNearby();
    }

    function pauseMedia() {
        book.querySelectorAll('iframe[src]').forEach(fr => {
            try {
                fr.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*');
            } catch (e) { /* ignore */ }
        });
    }

    /* ---------- Turning ---------- */

    function flipTo(target) {
        target = Math.max(0, Math.min(maxCur(), target));
        if (target === cur) return;
        pauseMedia();

        const fwd = target > cur;
        const list = [];
        if (fwd) for (let i = cur; i < target; i++) list.push(i);
        else for (let i = cur - 1; i >= target; i--) list.push(i);

        // Several leaves at once riffle through with a short stagger
        const stagger = list.length > 1 ? Math.max(30, Math.min(120, 900 / list.length)) : 0;

        list.forEach((i, k) => {
            const l = leaves[i];
            l.classList.remove('top-r', 'top-l');
            l.children[0].classList.remove('off');
            l.children[1].classList.remove('off');
            setTimeout(() => {
                l.style.zIndex = ++z;
                l.classList.toggle('flipped', fwd);
            }, k * stagger);
        });

        cur = target;
        chrome();
        clearTimeout(settleTimer);
        settleTimer = setTimeout(settle, DUR + (list.length - 1) * stagger + 40);
    }

    const next = () => flipTo(cur + 1);
    const prev = () => flipTo(cur - 1);

    function goPage(p) {
        flipTo(mode === 'spread' ? Math.floor((p + 1) / 2) : p);
    }

    /* ---------- Input ---------- */

    prevBtn.addEventListener('click', prev);
    nextBtn.addEventListener('click', next);
    tocBtn.addEventListener('click', () => goPage(1));

    book.addEventListener('click', e => {
        if (Date.now() - lastSwipe < 450) return;

        const goto = e.target.closest('[data-goto]');
        if (goto) { e.preventDefault(); goPage(parseInt(goto.dataset.goto, 10)); return; }

        if (e.target.closest('.corner')) {
            e.target.closest('.face').classList.contains('front') ? next() : prev();
            return;
        }

        const img = e.target.closest('img.zoom');
        if (img) { openLightbox(img); return; }

        if (e.target.closest('a, button, iframe, .video, .canvas-wrap, .tools')) return;
        if (String(window.getSelection()).length) return;

        const face = e.target.closest('.face');
        if (!face) return;
        if (mode === 'spread') {
            face.classList.contains('front') ? next() : prev();
        } else {
            const r = face.getBoundingClientRect();
            (e.clientX - r.left < r.width * 0.3) ? prev() : next();
        }
    });

    let sx = 0, sy = 0, swipeOk = true;
    book.addEventListener('touchstart', e => {
        const t = e.changedTouches[0];
        sx = t.clientX; sy = t.clientY;
        swipeOk = !e.target.closest('.canvas-wrap');
    }, { passive: true });
    book.addEventListener('touchend', e => {
        if (!swipeOk) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - sx, dy = t.clientY - sy;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) {
            lastSwipe = Date.now();
            dx < 0 ? next() : prev();
        }
    }, { passive: true });

    document.addEventListener('keydown', e => {
        if (!lightbox.hidden) {
            if (e.key === 'Escape') closeLightbox();
            return;
        }
        if (e.target.closest && e.target.closest('input, textarea')) return;
        switch (e.key) {
            case 'ArrowRight': case 'PageDown': next(); e.preventDefault(); break;
            case 'ArrowLeft': case 'PageUp': prev(); e.preventDefault(); break;
            case 'Home': flipTo(0); break;
            case 'End': flipTo(maxCur()); break;
        }
    });

    /* ---------- Lightbox: click the picture to zoom, anywhere else to close ---------- */

    function openLightbox(img) {
        lbImg.classList.remove('zoomed');
        lbImg.style.width = '';
        lightbox.classList.remove('is-zoomed');
        lbImg.src = img.currentSrc || img.src;
        lbImg.alt = img.alt;
        lightbox.hidden = false;
        lightbox.scrollTop = 0;
    }
    function closeLightbox() { lightbox.hidden = true; }

    lightbox.addEventListener('click', e => {
        if (e.target === lbImg) {
            if (lbImg.classList.contains('zoomed')) {
                lbImg.classList.remove('zoomed');
                lbImg.style.width = '';
                lightbox.classList.remove('is-zoomed');
            } else {
                lightbox.classList.add('is-zoomed');
                const fitW = lbImg.getBoundingClientRect().width;
                const r = lbImg.getBoundingClientRect();
                const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
                const w = Math.max(lbImg.naturalWidth, fitW * 2, Math.min(window.innerWidth, 1100));
                lbImg.classList.add('zoomed');
                lbImg.style.width = w + 'px';
                // keep the spot you clicked under the pointer
                requestAnimationFrame(() => {
                    const nr = lbImg.getBoundingClientRect();
                    lightbox.scrollLeft += nr.left + fx * nr.width - e.clientX;
                    lightbox.scrollTop += nr.top + fy * nr.height - e.clientY;
                });
            }
            return;
        }
        closeLightbox();
    });

    /* ---------- Create Yourself: a page you can draw on ---------- */

    const cv = document.getElementById('whiteboard');
    const ctx = cv.getContext('2d');
    let drawing = false, erasing = false, last = null;

    function fitCanvas() {
        const r = cv.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const dpr = window.devicePixelRatio || 1;
        const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
        if (cv.width === w && cv.height === h) return;
        const keep = document.createElement('canvas');
        keep.width = cv.width; keep.height = cv.height;
        if (cv.width && cv.height) keep.getContext('2d').drawImage(cv, 0, 0);
        cv.width = w; cv.height = h;
        if (keep.width && keep.height) ctx.drawImage(keep, 0, 0, w, h);
    }

    function point(e) {
        const r = cv.getBoundingClientRect();
        return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height };
    }

    function stroke(a, b) {
        const dpr = window.devicePixelRatio || 1;
        ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
        ctx.strokeStyle = '#29231e';
        ctx.lineWidth = (erasing ? 18 : 2.2) * dpr;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
    }

    cv.addEventListener('pointerdown', e => {
        if (e.button > 0) return;
        fitCanvas();
        drawing = true;
        cv.setPointerCapture(e.pointerId);
        last = point(e);
        stroke(last, { x: last.x + 0.1, y: last.y + 0.1 });
        e.preventDefault();
    });
    cv.addEventListener('pointermove', e => {
        if (!drawing) return;
        const p = point(e);
        stroke(last, p);
        last = p;
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => cv.addEventListener(t, () => { drawing = false; }));

    const penBtn = document.getElementById('penButton');
    const eraseBtn = document.getElementById('eraserButton');
    penBtn.addEventListener('click', () => { erasing = false; penBtn.classList.add('on'); eraseBtn.classList.remove('on'); });
    eraseBtn.addEventListener('click', () => { erasing = true; eraseBtn.classList.add('on'); penBtn.classList.remove('on'); });
    document.getElementById('clearButton').addEventListener('click', () => ctx.clearRect(0, 0, cv.width, cv.height));
    document.getElementById('saveButton').addEventListener('click', () => {
        const out = document.createElement('canvas');
        out.width = cv.width; out.height = cv.height;
        const o = out.getContext('2d');
        o.fillStyle = '#f2ebdd';
        o.fillRect(0, 0, out.width, out.height);
        o.drawImage(cv, 0, 0);
        const a = document.createElement('a');
        a.download = 'create-yourself.png';
        a.href = out.toDataURL('image/png');
        a.click();
    });

    // Ticker: a second copy makes the loop seamless
    const track = document.querySelector('.ticker-track');
    if (track) track.appendChild(track.firstElementChild.cloneNode(true));

    /* ---------- Random letters falling behind the book ---------- */

    const fallLayer = document.getElementById('falling');
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    function fall() {
        if (document.hidden) return;
        const t = document.createElement('span');
        t.className = 'fall';
        let s = '';
        const len = Math.floor(Math.random() * 10) + 5;
        for (let i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
        t.textContent = s;
        t.style.left = (Math.random() * 100) + 'vw';
        const d = Math.random() * 6 + 7;
        t.style.animationDuration = d + 's';
        fallLayer.appendChild(t);
        setTimeout(() => t.remove(), d * 1000 + 200);
    }
    if (!reduceMotion) setInterval(fall, 550);

    /* ---------- Start ---------- */

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            size();
            if ((narrow.matches ? 'single' : 'spread') !== mode) build();
            else if (visiblePages().some(p => p.classList.contains('draw-page'))) fitCanvas();
        }, 120);
    });

    window.addEventListener('hashchange', () => goPage(readHash()));

    size();
    build();
})();
