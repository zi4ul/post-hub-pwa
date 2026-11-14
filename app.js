// PWA Post Hub: navigasi 3 tab + Pengaturan (T05) + form (T06) + alur Kirim (T08) + Daftar Job (T09).
// Form Buat Posting = Wizard 6 langkah, satu per layar (v1.15.0): Video → Platform → Produk (tab Shopee/TikTok; wajib bila katalog ada)
//   → Deskripsi + hashtag → Waktu → Ringkasan (v1.16.0, tombol "Ubah" per bagian) → Kirim. T40: pustaka video.
// Daftar Job: kartu bergambar + chip filter status dengan jumlah (v1.16.1).
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var Core = window.PostHubCore;

  function storage() { try { return window.localStorage; } catch (e) { return null; } }

  // ---------- tab ----------
  function showTab(name) {
    document.querySelectorAll('[data-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== name; });
    document.querySelectorAll('[data-tab]').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-tab') === name ? 'true' : 'false'); });    if (name === 'daftar' && typeof loadJobs === 'function' && $('jobs')) loadJobs();
  }
  document.querySelectorAll('[data-tab]').forEach(function (b) {
    b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); });
  });

  // ---------- Buat Posting (T06: form + validasi, belum mengirim) ----------
  var PLATS = ['shopee', 'tiktok', 'instagram'];
  var CHK = { shopee: $('p-shopee'), tiktok: $('p-tiktok'), instagram: $('p-instagram') };
  var CNT = { shopee: $('cnt-shopee'), tiktok: $('cnt-tiktok'), instagram: $('cnt-instagram') };
  var sel = { shopee: [], tiktok: [] };   // produk terpilih per platform
  var catalog = {};                       // {shopee:[{id,name}], tiktok:[...]} dari products.list
  var catalogMsg = '';
  var PROD = { shopee: $('prod-shopee'), tiktok: $('prod-tiktok') };
  var PNAME = { shopee: 'Shopee', tiktok: 'TikTok' };
  var video = null;   // {name,size,mime,durationSec,width,height}; file asli di videoFile

  function probe(f, cb, onThumb) { // info durasi/rasio via <video>; tidak menghalangi bila gagal. Thumbnail menyusul (info.thumb) tanpa menunda cb.
    // T65f: iOS Safari tidak menggambar frame dari <video> yang lepas dari halaman / preload=metadata -> video disematkan tersembunyi, preload=auto,
    // tunggu frame benar-benar siap, dan ada cadangan play()->pause(). URL objek baru dilepas setelah thumbnail selesai (bukan 8 dtk dari awal).
    var info = { name: f.name, size: f.size, mime: f.type || '', durationSec: 0, width: 0, height: 0 };
    var done = false, u = null, v = null, thumbDone = false, tries = 0;
    function release() {
      thumbDone = true;
      try { window.URL.revokeObjectURL(u); } catch (e) {}
      try { if (v && v.parentNode) v.parentNode.removeChild(v); } catch (e) {}
    }
    var pts = [], idx = 0, capIdx = -1, best = '', bestLum = -1;
    function lumOf(ctx, w, h) {   // rata-rata terang piksel 0..255; -1 bila tak terbaca
      try { var d = ctx.getImageData(0, 0, w, h).data, s = 0, n = 0; for (var k = 0; k < d.length; k += 64) { s += d[k] * 0.3 + d[k + 1] * 0.59 + d[k + 2] * 0.11; n++; } return n ? s / n : -1; } catch (e) { return -1; }
    }
    function accept(t) { info.thumb = t; if (onThumb) onThumb(t); release(); }
    function nextPoint() {   // frame terlalu gelap -> loncat ke titik lain di video
      if (idx + 1 < pts.length) { idx++; try { v.currentTime = pts[idx]; return true; } catch (e) {} }
      return false;
    }
    function capture() {
      if (thumbDone || capIdx === idx) return;
      capIdx = idx;
      try {
        var w = 160, h = Math.round(w * v.videoHeight / v.videoWidth) || 284, c = document.createElement('canvas'), ctx;
        c.width = w; c.height = h; ctx = c.getContext('2d'); ctx.drawImage(v, 0, 0, w, h);
        var t = c.toDataURL('image/jpeg', 0.6), lum = lumOf(ctx, w, h);
        if (t && t.length > 1500) {   // terlalu kecil = frame kosong
          if (lum < 0 || lum >= 28) { accept(t); return; }   // cukup terang (atau tak bisa diukur): pakai
          if (lum > bestLum) { bestLum = lum; best = t; }     // gelap: simpan yang paling terang sbg cadangan
          if (nextPoint()) return;
          if (best) { accept(best); return; }
        }
      } catch (e) {}
      if (best) { accept(best); return; }
      if (tries++ < 1) { capIdx = -1; forcePlay(); } else release();
    }
    function forcePlay() {   // cadangan: putar sebentar agar frame didekode
      try {
        var pr = v.play();
        var stop = function () { try { v.pause(); } catch (e) {} capture(); };
        setTimeout(stop, 400);
        if (pr && pr.catch) pr.catch(function () { release(); });
      } catch (e) { release(); }
    }
    function startThumb() {
      try {
        var dur = v.duration || 1, last = Math.max(0, dur - 0.1), raw = [Math.min(0.5, dur / 2), dur * 0.1, dur * 0.25, dur * 0.5, Math.min(2, dur * 0.8)];
        raw.forEach(function (p) { p = Math.min(Math.max(0, p), last); if (!pts.some(function (q) { return Math.abs(q - p) < 0.2; })) pts.push(p); });
        var later = function () { setTimeout(capture, 150); };
        v.onseeked = function () { if (v.requestVideoFrameCallback) { try { v.requestVideoFrameCallback(capture); setTimeout(capture, 600); return; } catch (e) {} } later(); };
        v.currentTime = pts[0];
        setTimeout(function () { if (thumbDone || info.thumb) return; if (best) { accept(best); return; } tries = 1; capIdx = -1; forcePlay(); }, 3500);   // seeked tak datang
        setTimeout(function () { if (!thumbDone && best) accept(best); else release(); }, 30000);
      } catch (e) { release(); }
    }
    function fin(ok) {
      if (done) return; done = true;
      if (ok) { info.durationSec = v.duration || 0; info.width = v.videoWidth || 0; info.height = v.videoHeight || 0; }
      cb(info, ok);
      if (ok) startThumb(); else release();
    }
    try {
      v = document.createElement('video');
      u = window.URL.createObjectURL(f);
      v.preload = 'auto'; v.muted = true;
      if (v.setAttribute) { v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); v.setAttribute('muted', ''); }
      if (v.style) v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
      try { if (document.body && document.body.appendChild) document.body.appendChild(v); } catch (e) {}
      v.onloadedmetadata = function () { fin(true); };
      v.onerror = function () { fin(false); };
      v.src = u;
      if (v.load) { try { v.load(); } catch (e) {} }
      setTimeout(function () { fin(false); }, 15000);
    } catch (e) { fin(false); }
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var lastHtml = {};   // lewati innerHTML yang sama agar gambar tidak berkedip tiap ketikan
  function setHtml(id, html) { if (lastHtml[id] === html) return; lastHtml[id] = html; $(id).innerHTML = html; }

  // pratinjau video terpilih di langkah 1
  var thumbSrc = '';
  function showThumb(src) {
    var t = $('vthumb'); thumbSrc = src || '';
    if (src) { t.className = ''; t.innerHTML = '<img class="vthumb" alt="" src="' + esc(src) + '">'; }
    else { t.className = 'vnothumb'; t.innerHTML = ''; t.textContent = '🎞'; }
  }

  // Task 3: saat video terpilih → label, preview besar, tombol "Ganti video"; pemilih disembunyikan
  function syncVsel() {
    var on = !!video;
    $('vlabel').hidden = !on; $('vchange').hidden = !on; $('vpick').hidden = on;
    $('vprev').className = on ? 'vprev big' : 'vprev';
  }
  // tab produk Shopee | TikTok: hanya platform yang dicentang; lencana jumlah; ● = masih wajib pilih produk
  var curTab = 'shopee';
  ['shopee', 'tiktok'].forEach(function (p) { $('ptab-' + p).addEventListener('change', function () { if ($('ptab-' + p).checked) curTab = p; refresh(); }); });
  function renderTabs() {
    var req = requiredProducts(), on = [];
    ['shopee', 'tiktok'].forEach(function (p) {
      var lab = $('ptlab-' + p);
      lab.hidden = !CHK[p].checked;
      lab.textContent = PNAME[p] + ' (' + sel[p].length + '/' + Core.MAX_PRODUCTS[p] + ')' + (req[p] && !sel[p].length ? ' ●' : '');
      if (CHK[p].checked) on.push(p);
    });
    if (on.length && on.indexOf(curTab) < 0) curTab = on[0];
    if (on.length) $('ptab-' + curTab).checked = true;
  }

  // indikator langkah: selesai (done) / sedang dikerjakan (on, langkah pertama yang belum lengkap)
  function renderSteps(f) {
    var done = [
      !!f.video,
      PLATS.some(function (p) { return CHK[p].checked; }),
      productsMissing().length === 0,
      !!String(f.description || '').trim(),
      !$('when-sched').checked || !Number.isNaN(Date.parse(f.scheduledAt))
    ], first = done.indexOf(false);
    done.forEach(function (d, i) { $('sg' + (i + 1)).className = d ? 'fin' : (i === first ? 'on' : ''); });
    $('sg6').className = first < 0 ? 'on' : '';   // Ringkasan: langkah berikutnya bila 1-5 sudah lengkap
  }

  // ---------- Wizard (v1.15.0): satu langkah per layar ----------
  // cur = langkah yang tampil; reach = langkah terjauh yang boleh dibuka (langkah pertama yang masih terkunci).
  var STEPS = [$('st1'), $('st2'), $('st3'), $('st4'), $('st5'), $('st6')];
  var STEP_NAMES = ['Video', 'Platform', 'Produk', 'Deskripsi dan hashtag', 'Waktu', 'Ringkasan'];
  var STEP_CODES = [['no_video'], ['no_platform'], ['products_required', 'too_many_products'], ['caption_too_long']];
  var cur = 1, reach = 1, backTo6 = false;   // backTo6: langkah dibuka lewat "Ubah" → Lanjut kembali ke ringkasan

  // alasan tiap langkah 1..5 belum boleh dilanjutkan ('' = boleh). Pesan diambil dari Core.validateForm.
  function stepBlocks(r, f) {
    var b = STEP_CODES.map(function (codes) {
      var hit = r.errors.filter(function (e) { return codes.indexOf(e.code) >= 0; })[0];
      return hit ? hit.msg : '';
    });
    var miss = productsMissing();
    if (miss.length) b[2] = 'Pilih produk untuk ' + miss.map(function (p) { return PNAME[p]; }).join(' dan ') + '.';
    b[4] = $('when-sched').checked && Number.isNaN(Date.parse(f.scheduledAt)) ? 'Isi tanggal dan jam jadwal.' : '';
    return b;
  }

  // Ringkasan akhir: tiap bagian punya tombol "Ubah" (data-edit = nomor langkah) → buka langkah itu; Lanjut kembali ke ringkasan.
  function sumSec(title, step, body) {
    return '<div class="ssec"><div class="shead"><b>' + title + '</b><button class="sec sedit" data-edit="' + step + '" aria-label="Ubah ' + esc(title) + '">Ubah</button></div>' + body + '</div>';
  }
  function renderSummary(f) {
    var vname = video ? Core.shortName(libSel ? Core.displayName(libSel) : ($('alias').value.trim() || video.name), 40) : '—';
    var html = sumSec('Video', 1, '<div class="svid">' +
      (thumbSrc ? '<img class="sthumb" alt="" src="' + esc(thumbSrc) + '">' : '<div class="snothumb">🎞</div>') +
      '<div class="stxt"><div class="sname">' + esc(vname) + '</div>' + (video ? '<div class="mut">' + esc(Core.describeVideo(video)) + '</div>' : '') + '</div></div>');

    var on = PLATS.filter(function (p) { return f.platforms[p].enabled; });
    html += sumSec('Platform tujuan', 2, on.length ? '<div class="schips">' + on.map(function (p) { return '<span class="schip">' + esc(PFULL[p]) + '</span>'; }).join('') + '</div>' : '<div class="mut">Belum ada.</div>');

    var prod = '';
    on.forEach(function (p) {
      if (p === 'instagram') { prod += '<div class="sprod"><div class="jpl">' + esc(PFULL[p]) + '</div><div class="mut">Tanpa produk</div></div>'; return; }
      var items = f.platforms[p].products || [];
      prod += '<div class="sprod"><div class="jpl">' + esc(PFULL[p]) + ' (' + items.length + '/' + Core.MAX_PRODUCTS[p] + ')</div>';
      if (!items.length) prod += '<div class="mut">Belum ada produk dipilih.</div>';
      items.forEach(function (it) {
        var img = prodImgOf(p, it.id);
        prod += '<div class="sitem">' + (img ? '<img class="jp" loading="lazy" referrerpolicy="no-referrer" alt="" src="' + esc(img) + '">' : '<div class="jpno">🛍</div>') +
          '<span>' + esc(Core.shortName(it.name || it.id, 44)) + '</span></div>';
      });
      prod += '</div>';
    });
    html += sumSec('Produk per platform', 3, prod || '<div class="mut">Pilih platform dulu.</div>');

    var d = String(f.description || '').trim(), tags = Core.parseTags(f.hashtags);
    html += sumSec('Deskripsi dan hashtag', 4,
      '<div class="sdesc">' + (d ? esc(d) : '<span class="mut">Tanpa deskripsi.</span>') + '</div>' +
      (tags.length ? '<div class="schips">' + tags.map(function (t) { return '<span class="schip tag">#' + esc(t) + '</span>'; }).join('') + '</div>' : '<div class="mut">Tanpa hashtag.</div>') +
      (on.length ? '<div class="mut scount">' + on.map(function (p) { var n = Core.captionLength(p, d, tags), lim = Core.CAPTION_LIMIT[p]; return '<span class="' + (n > lim ? 'over' : '') + '">' + esc(PFULL[p]) + ' ' + n + '/' + lim + '</span>'; }).join(' · ') + '</div>' : ''));

    html += sumSec('Waktu posting', 5, '<div>' + (f.scheduledAt ? 'Dijadwalkan ' + esc(String(f.scheduledAt).replace('T', ' ')) : 'Sekarang') + '</div>' +
      '<div class="mut">' + (f.deleteAfter ? 'Video dihapus dari Drive setelah diposting.' : 'Video disimpan di Drive agar bisa dipakai lagi.') + '</div>');
    setHtml('sumbox', html);
  }
  $('sumbox').addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-edit]') : null;
    if (!t || sending) return;
    backTo6 = true;
    goStep(Number(t.getAttribute('data-edit')));
  });
  // gambar produk di ringkasan gagal dimuat → kotak ikon
  $('sumbox').addEventListener('error', function (e) {
    var t = e && e.target;
    if (!t || t.tagName !== 'IMG' || !t.parentNode) return;
    var d = document.createElement('div'); d.className = t.className === 'sthumb' ? 'snothumb' : 'jpno'; d.textContent = t.className === 'sthumb' ? '🎞' : '🛍';
    t.parentNode.replaceChild(d, t);
  }, true);

  function renderWizard(blocks, errors, f) {
    var first = blocks.map(Boolean).indexOf(true);
    reach = first < 0 ? 6 : first + 1;
    if (cur > reach) cur = reach;                 // langkah di depan jadi tidak valid (mis. video dibuang) → mundur ke yang perlu dibenahi
    STEPS.forEach(function (el, k) { el.hidden = k + 1 !== cur; });
    $('stepper').className = 'stepper s' + cur;
    $('wzprog').textContent = 'Langkah ' + cur + ' dari 6 · ' + STEP_NAMES[cur - 1];
    var last = cur === 6, why = last ? (errors[0] || '') : blocks[cur - 1];
    $('wzback').hidden = cur === 1; $('wzback').disabled = sending;
    $('wznext').hidden = last; $('wznext').disabled = !!why;
    $('wznext').textContent = backTo6 && !last ? 'Simpan, ke ringkasan' : 'Lanjut';
    $('send').hidden = !last;
    $('wzwhy').textContent = why ? '✗ ' + why : ''; $('wzwhy').hidden = !why;   // alasan tepat di atas tombol
    if (last) renderSummary(f);
  }
  function goStep(n) {
    if (sending) return;
    n = Math.max(1, Math.min(6, n, reach));       // tidak bisa melompati langkah yang masih terkunci
    if (n === cur) return;
    cur = n;
    if (n === 6) backTo6 = false;
    sendMsg('');
    refresh();
    if (window.scrollTo) window.scrollTo(0, 0);
  }
  $('wznext').addEventListener('click', function () { goStep(backTo6 ? 6 : cur + 1); });
  $('wzback').addEventListener('click', function () { goStep(cur - 1); });
  $('stepper').addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-go]') : null;
    if (!t) return;
    if (e.preventDefault) e.preventDefault();
    goStep(Number(t.getAttribute('data-go')));
  });

  function renderProducts() {
    var msg = catalogMsg;
    ['shopee', 'tiktok'].forEach(function (p) {
      var box = PROD[p];
      if (!CHK[p].checked) { setHtml(box.id, ''); return; }
      var items = catalog[p] || [], max = Core.MAX_PRODUCTS[p];
      var html = '<strong>' + PNAME[p] + ' (' + sel[p].length + '/' + max + ')</strong>';
      if (!items.length) {
        if (!msg) msg = 'Katalog belum ada, Reafter belum sinkron. Posting tetap boleh tanpa produk.';
      } else {
        html += '<div class="pgrid">';
        items.forEach(function (it) {
          var on = sel[p].some(function (x) { return x.id === it.id; });
          html += '<div class="pcard' + (on ? ' sel' : '') + '" data-plat="' + p + '" data-pid="' + esc(it.id) + '">' +
            (it.img ? '<img class="pimg" loading="lazy" referrerpolicy="no-referrer" alt="" src="' + esc(it.img) + '">' : '<div class="noimg">🛍</div>') +
            (on ? '<div class="pchk">✓</div>' : '') + '<div class="pname">' + esc(it.name || it.id) + '</div></div>';
        });
        html += '</div>';
      }
      setHtml(box.id, html);
    });
    var miss = productsMissing();
    if (!CHK.shopee.checked && !CHK.tiktok.checked) msg = 'Produk hanya untuk Shopee dan TikTok. Instagram tanpa produk.';
    else if (!msg && miss.length) msg = '✗ Pilih produk untuk ' + miss.map(function (p) { return PNAME[p]; }).join(' dan ') + '.';
    $('prod-msg').textContent = msg;
    $('prod-msg').className = !catalogMsg && miss.length ? 'bad' : 'mut';
    renderTabs();
  }
  // gambar produk gagal dimuat → ganti kotak ikon (error tidak menggelembung, jadi pakai fase capture)
  $('prodbox').addEventListener('error', function (e) {
    var t = e && e.target;
    if (!t || t.tagName !== 'IMG' || !t.parentNode) return;
    var d = document.createElement('div'); d.className = 'noimg'; d.textContent = '🛍';
    t.parentNode.replaceChild(d, t);
  }, true);

  // T39: platform bertanda produk wajib bila katalognya ada (katalog kosong/belum sinkron → tetap boleh tanpa produk)
  function requiredProducts() {
    var r = {};
    ['shopee', 'tiktok'].forEach(function (p) { if (CHK[p].checked && (catalog[p] || []).length) r[p] = true; });
    return r;
  }
  function productsMissing() { var req = requiredProducts(); return Object.keys(req).filter(function (p) { return !sel[p].length; }); }

  $('prodbox').addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-pid]') : null;
    if (!t) return;
    var p = t.getAttribute('data-plat'), id = t.getAttribute('data-pid');
    var it = (catalog[p] || []).filter(function (x) { return x.id === id; })[0];
    var r = Core.pickProduct(sel[p], p, id, it ? it.name : '');
    sel[p] = r.selected;
    catalogMsg = r.error || '';
    refresh();
  });

  function loadCatalog() {
    var s = Core.loadSettings(storage());
    if (!s.hubUrl || !s.token) { catalogMsg = 'Isi pengaturan hub dulu untuk memuat katalog.'; refresh(); return; }
    catalogMsg = 'Memuat katalog …'; refresh();
    Core.hubCall(window.fetch.bind(window), s, 'products.list').then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'ditolak hub');
      var src = r.products && typeof r.products === 'object' ? r.products : {};
      catalog = {};
      ['shopee', 'tiktok'].forEach(function (p) {
        catalog[p] = (Array.isArray(src[p]) ? src[p] : []).filter(function (x) { return x && x.id; })
          .map(function (x) { return { id: String(x.id), name: String(x.name || ''), img: /^https?:\/\//.test(String(x.img || '')) ? String(x.img) : '' }; });
      });
      catalogMsg = '';
    }).catch(function (e) { catalogMsg = 'Gagal memuat katalog: ' + e.message; })
      .then(refresh);
  }
  $('prod-reload').addEventListener('click', loadCatalog);

  function readForm() {
    var platforms = {};
    PLATS.forEach(function (p) { platforms[p] = { enabled: CHK[p].checked, products: sel[p] || [] }; });
    return {
      video: video, description: $('desc').value, hashtags: $('tags').value, platforms: platforms,
      scheduledAt: $('when-sched').checked ? $('sched').value : null,
      requireProducts: requiredProducts(), deleteAfter: !$('keep').checked
    };
  }

  function refresh() {
    syncVsel();
    var f = readForm(), r = Core.validateForm(f), tags = Core.parseTags(f.hashtags);
    var errors = r.errors.map(function (e) { return e.msg; });
    PLATS.forEach(function (p) {
      var len = Core.captionLength(p, f.description, tags), lim = Core.CAPTION_LIMIT[p];
      CNT[p].textContent = len + '/' + lim;
      CNT[p].className = len > lim ? 'over' : 'mut';
    });
    $('sched').hidden = !$('when-sched').checked;
    if ($('when-sched').checked && Number.isNaN(Date.parse(f.scheduledAt))) errors.push('Isi tanggal dan jam jadwal.');
    $('errs').textContent = errors.map(function (m) { return '✗ ' + m; }).join('\n');
    $('warns').textContent = r.warnings.map(function (w) { return '⚠ ' + w.msg; }).join('\n');
    renderProducts();
    $('file').disabled = false;
    $('vidgate').textContent = '';
    renderSteps(f);
    renderWizard(stepBlocks(r, f), errors, f);
    renderLibrary();
    $('send').disabled = errors.length > 0 || sending;
    return { errors: errors, warnings: r.warnings };
  }

  // ---------- Pustaka video (T40): video yang masih ada di Drive hub; pilih lagi tanpa unggah ulang ----------
  var libVideos = [], libSel = null, libLoaded = false;
  function libMsg(t, cls) { $('lib-msg').textContent = t; $('lib-msg').className = cls || 'mut'; }
  function resetVideo() { libSel = null; video = null; $('vinfo').textContent = 'Belum ada video.'; $('vinfo').title = ''; $('alias').value = ''; $('aliasbox').hidden = true; showThumb(null); }
  function setVmode(m) {
    $('vtab-file').className = m === 'file' ? 'on' : '';
    $('vtab-lib').className = m === 'lib' ? 'on' : '';
    $('vpanel-file').hidden = m !== 'file';
    $('vpanel-lib').hidden = m !== 'lib';
    if (m === 'lib' && !libLoaded) loadLibrary();
  }
  function renderLibrary() {
    var html = '';
    libVideos.forEach(function (v) {
      var on = !!libSel && libSel.id === v.id;
      html += '<div class="vrow' + (on ? ' sel' : '') + '" data-vid="' + esc(v.id) + '">' +
        (v.thumb ? '<img class="vthumb" alt="" src="' + esc(v.thumb) + '">' : '<div class="vnothumb">🎬</div>') +
        '<div class="vtxt"><div class="vname" title="' + esc(v.name) + '">' + (on ? '✓ ' : '') + esc(Core.shortName(Core.displayName(v), 30)) + '</div>' +
        (v.alias ? '<div class="vmeta" title="' + esc(v.name) + '">Asli: ' + esc(Core.shortName(v.name, 26)) + '</div>' : '') +
        '<div class="vmeta">' + esc(Core.describeVideo(v)) + '</div></div>' +
        '<button class="sec" data-vren="' + esc(v.id) + '" aria-label="Ubah nama alternatif">✏️</button>' +
        '<button class="sec" data-vdel="' + esc(v.id) + '" aria-label="Hapus video">🗑</button></div>';
    });
    setHtml('lib-list', libLoaded ? (html || '<div class="mut">Belum ada video tersimpan. Video yang Anda kirim dari HP (dengan \"Simpan video di Drive\" dicentang) muncul di sini.</div>') : '');
  }
  function loadLibrary() {
    var s = Core.loadSettings(storage());
    if (!s.hubUrl || !s.token) { libMsg('Isi pengaturan hub dulu.', 'bad'); return Promise.resolve(); }
    libMsg('Memuat …');
    return Core.hubCall(window.fetch.bind(window), s, 'video.list', { limit: 50 }).then(function (r) {
      if (!r || !r.ok) throw new Error(Core.videoErrorText(r && r.error));
      libVideos = Core.mergeLibrary(r.videos, Core.loadVideoMeta(storage()));
      libLoaded = true;
      if (libSel && !libVideos.some(function (v) { return v.id === libSel.id; })) resetVideo();   // sudah dihapus dari Drive
      libMsg('');
    }).catch(function (e) { libMsg('Gagal memuat: ' + e.message, 'bad'); })
      .then(function () { renderLibrary(); refresh(); });
  }
  function selectLibVideo(id) {
    var v = libVideos.filter(function (x) { return x.id === id; })[0];
    if (!v) return;
    if (libSel && libSel.id === id) { resetVideo(); }
    else {
      libSel = v;
      video = { name: v.name, size: v.size, mime: v.mime, durationSec: v.durationSec, width: v.width, height: v.height, driveFileId: v.id };
      $('file').value = '';
      $('vinfo').textContent = '✓ Dari pustaka: ' + Core.shortName(Core.displayName(v), 30) + ' · ' + Core.describeVideo(v); $('vinfo').title = v.name; $('aliasbox').hidden = true;
      showThumb(v.thumb || null);
    }
    libMsg('');
    refresh();
  }
  function renameLibVideo(id) {   // nama alternatif disimpan di HP saja; nama asli file di Drive tidak berubah
    var v = libVideos.filter(function (x) { return x.id === id; })[0];
    if (!v) return;
    var r = window.prompt('Nama alternatif (kosongkan untuk kembali ke nama asli).\nNama asli: ' + v.name, v.alias || '');
    if (r === null) return;
    if (!Core.setVideoAlias(storage(), id, r)) { libMsg('Gagal menyimpan nama.', 'bad'); return; }
    v.alias = String(r).replace(/\s+/g, ' ').trim().slice(0, 80);
    if (libSel && libSel.id === id) { libSel = v; $('vinfo').textContent = '✓ Dari pustaka: ' + Core.shortName(Core.displayName(v), 30) + ' · ' + Core.describeVideo(v); }
    libMsg('Nama disimpan.', 'ok');
    renderLibrary();
  }
  function deleteLibVideo(id) {
    var v = libVideos.filter(function (x) { return x.id === id; })[0];
    if (!v || !window.confirm('Hapus \"' + Core.shortName(Core.displayName(v), 40) + '\" dari Drive?\nVideo masuk tempat sampah Drive (bisa dipulihkan ±30 hari).')) return;
    var s = Core.loadSettings(storage());
    libMsg('Menghapus …');
    Core.hubCall(window.fetch.bind(window), s, 'video.delete', { fileId: id }).then(function (r) {
      if (!r || !r.ok) throw new Error(Core.videoErrorText(r && r.error));
      if (libSel && libSel.id === id) resetVideo();
      return loadLibrary().then(function () { libMsg('Video dihapus.', 'ok'); });
    }).catch(function (e) { libMsg('Gagal menghapus: ' + e.message, 'bad'); });
  }
  $('lib-list').addEventListener('click', function (e) {
    var d = e.target && e.target.closest ? e.target.closest('[data-vdel]') : null;
    if (d) { deleteLibVideo(d.getAttribute('data-vdel')); return; }
    var rid = e.target && e.target.getAttribute ? e.target.getAttribute('data-vren') : null;   // tombol ✏️ tidak punya elemen anak, jadi target = tombolnya
    if (rid) { renameLibVideo(rid); return; }
    var r = e.target && e.target.closest ? e.target.closest('[data-vid]') : null;
    if (r) selectLibVideo(r.getAttribute('data-vid'));
  });
  $('lib-reload').addEventListener('click', loadLibrary);
  $('vtab-file').addEventListener('click', function () { setVmode('file'); });
  $('vchange').addEventListener('click', function () {   // Ganti video: kosongkan pilihan, tampilkan pemilih lagi
    var m = $('vpanel-lib').hidden ? 'file' : 'lib';
    resetVideo(); $('file').value = ''; setVmode(m); refresh();
  });
  $('vtab-lib').addEventListener('click', function () { setVmode('lib'); });

  // ---------- Kirim (T08): logika di Core.submitFlow; di sini hanya DOM, Wake Lock, dan ulang ----------
  var sending = false, wakeLock = null, resume = null, sentFile = null;
  function sendMsg(t, cls) { var m = $('sendmsg'); m.textContent = t; m.className = (cls || 'mut') + ' msg'; }
  function lockScreen() {
    if (!('wakeLock' in navigator)) return;
    navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }).catch(function () {});
  }
  function unlockScreen() { if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; } }
  if (document.addEventListener) document.addEventListener('visibilitychange', function () {
    if (!sending) return;
    if (document.hidden) sendMsg('⚠ Halaman masuk latar belakang; unggahan bisa terhenti di iOS. Buka lagi halaman ini.', 'bad');
    else lockScreen();
  });

  // ---------- Layar sukses (T64d): ringkasan platform + "Kirim lagi" ----------
  var PFULL = { shopee: 'Shopee Video', tiktok: 'TikTok', instagram: 'Instagram' };
  function showDone(f, message) {
    var html = '';
    PLATS.forEach(function (p) {
      var pl = f.platforms[p];
      if (!pl || !pl.enabled) return;
      var n = (pl.products || []).length;
      html += '<div><b>' + esc(PFULL[p]) + '</b><span>' + (p === 'instagram' ? 'tanpa produk' : (n + ' produk')) + '</span></div>';
    });
    html += '<div><b>Waktu</b><span>' + (f.scheduledAt ? esc(String(f.scheduledAt).replace('T', ' ')) : 'Sekarang') + '</span></div>';
    $('done-msg').textContent = message || '';
    $('done-sum').innerHTML = html;
    $('done').hidden = false;
  }
  $('done-again').addEventListener('click', function () {
    $('done').hidden = true;
    sendMsg('');
    $('desc').value = ''; $('tags').value = '';
    cur = 1; backTo6 = false;
    refresh();
    if (window.scrollTo) window.scrollTo(0, 0);
  });
  $('done-jobs').addEventListener('click', function () { $('done').hidden = true; showTab('daftar'); });

  $('send').addEventListener('click', function () {
    var file = $('file').files && $('file').files[0];
    var useLib = !!libSel;      // memilih dari pustaka mengosongkan kotak file, dan sebaliknya, jadi libSel yang terisi = pilihan terakhir
    if (sending || (!file && !useLib)) return;
    var s = Core.loadSettings(storage());
    if (!s.hubUrl || !s.token) { sendMsg('Isi pengaturan hub dulu.', 'bad'); showTab('setelan'); return; }
    if (useLib) { resume = null; sentFile = null; }
    else if (sentFile !== file) { resume = null; sentFile = file; }   // berkas lain → mulai dari awal
    var formSnap = readForm();   // ringkasan layar sukses diambil sebelum form dikosongkan
    var uploader = window.PostHubUpload.create({});
    sending = true; $('send').disabled = true; sendMsg('Memulai …'); lockScreen();
    Core.submitFlow({
      hub: function (action, body) { return Core.hubCall(window.fetch.bind(window), s, action, body); },
      upload: uploader.upload,
      origin: window.location.origin,
      onStatus: function (t) { sendMsg(t); },
      onProgress: function (p) { sendMsg('Mengunggah ' + p.pct.toFixed(0) + '% · ' + p.mbps.toFixed(1) + ' MB/dtk · sisa ±' + p.etaSec + ' dtk'); }
    }, readForm(), useLib ? null : file, useLib ? null : resume).then(function (r) {
      resume = r.resume;
      sendMsg((r.ok ? '✓ ' : '✗ ') + r.message, r.ok ? 'ok' : 'bad');
      if (r.ok) {
        if (!useLib && r.fileId && video) Core.saveVideoMeta(storage(), r.fileId, Object.assign({}, video, { alias: $('alias').value }));   // thumbnail untuk pustaka + kartu Daftar Job (T64c)
        showDone(formSnap, r.message);
        sentFile = null; $('file').value = ''; resetVideo();
        libLoaded = false; if (!$('vpanel-lib').hidden) loadLibrary();
      } else if (r.stage === 'finish' && useLib) { libLoaded = false; loadLibrary(); }
    }).catch(function (e) { sendMsg('✗ Gagal: ' + e.message, 'bad'); })
      .then(function () { sending = false; unlockScreen(); refresh(); });
  });

  $('file').addEventListener('change', function () {
    var f = $('file').files && $('file').files[0];
    libSel = null;
    if (!f) { video = null; $('vinfo').textContent = 'Belum ada video.'; showThumb(null); refresh(); return; }
    $('vinfo').textContent = 'Membaca info video …';
    showThumb(null);
    probe(f, function (info, ok) {
      video = info;
      $('vinfo').title = f.name; $('aliasbox').hidden = false;
      $('vinfo').textContent = Core.shortName(f.name, 30) + ' · ' + (f.size / 1048576).toFixed(1) + ' MB' +
        (ok ? ' · ' + info.width + '×' + info.height + ' · ' + info.durationSec.toFixed(1) + ' dtk' : ' · info tidak terbaca (mungkin HEVC/.mov)');
      refresh();
    }, function (thumb) { if (video && video.name === f.name) showThumb(thumb); });
  });
  $('desc').addEventListener('input', refresh);
  // hashtag otomatis: awal tiap kata diberi '#' saat mengetik/menempel (logika sama dengan Uploader Reafter, T62b)
  var tagsPrev = '';
  $('tags').addEventListener('input', function () {
    var t = $('tags'), r = Core.typeInto(tagsPrev, t.value, t.selectionStart);
    if (r.value !== t.value) { t.value = r.value; try { t.setSelectionRange(r.caret, r.caret); } catch (e) {} }
    tagsPrev = t.value; refresh();
  });
  [CHK.shopee, CHK.tiktok, CHK.instagram, $('when-now'), $('when-sched'), $('sched')].forEach(function (el) {
    el.addEventListener('change', refresh);
  });
  refresh();

  // ---------- Daftar Job (T09): job.list, Batal, Lanjut (job.resume) ----------
  var jobsData = [];
  // Filter status: tiap job masuk SATU kelompok (prioritas: perlu tindakan > lainnya), jadi jumlah chip bila dijumlah = Semua
  // kecuali job dibatalkan / status tak dikenal, yang hanya muncul di Semua. Sebagian berhasil dihitung Gagal agar tidak terlewat.
  var JFILTERS = [['all', 'Semua', $('jf-all')], ['run', 'Berjalan', $('jf-run')], ['done', 'Selesai', $('jf-done')], ['bad', 'Gagal', $('jf-bad')], ['need', 'Perlu tindakan', $('jf-need')]];
  var jfilter = 'all';
  function jobGroup(j, f) {
    if (f.needsAction.length || j.status === 'needsAction') return 'need';
    if (j.status === 'queued' || j.status === 'claimed' || j.status === 'running') return 'run';
    if (j.status === 'done') return 'done';
    if (j.status === 'error' || j.status === 'partial') return 'bad';
    return '';
  }
  function renderJobChips(counts) {
    JFILTERS.forEach(function (x) {
      var n = counts[x[0]] || 0, b = x[2];
      b.textContent = x[1] + ' (' + n + ')';
      b.className = 'jchip' + (x[0] === jfilter ? ' on' : '') + (n === 0 && x[0] !== jfilter ? ' zero' : '') + (x[0] === 'need' && n > 0 ? ' alert' : '');
      if (b.setAttribute) b.setAttribute('aria-pressed', x[0] === jfilter ? 'true' : 'false');
    });
  }
  $('jfilter').addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-f]') : null;
    if (!t) return;
    jfilter = t.getAttribute('data-f');
    renderJobs();
  });
  function jobsMsg(t, cls) { $('jobs-msg').textContent = t; $('jobs-msg').className = (cls || 'mut') + ' msg'; }
  function prodImgOf(p, id) { var it = (catalog[p] || []).filter(function (x) { return x.id === id; })[0]; return it && it.img ? it.img : ''; }
  function renderJobs() {
    var html = '', vm = Core.loadVideoMeta(storage()), counts = { all: jobsData.length };
    jobsData.forEach(function (j) { var g = jobGroup(j, Core.formatJob(j)); if (g) counts[g] = (counts[g] || 0) + 1; });
    renderJobChips(counts);
    jobsData.forEach(function (j) {
      var f = Core.formatJob(j);
      if (jfilter !== 'all' && jobGroup(j, f) !== jfilter) return;
      var vt = (vm[f.videoId] || {}).thumb, withProds = f.platforms.filter(function (p) { return p.products.length; });
      html += '<div class="jcard" data-job="' + esc(f.id) + '"><div class="jvis">' +
        (vt ? '<img class="jthumb" alt="" src="' + esc(vt) + '">' : '<div class="jnothumb">🎬</div>') + '<div class="jprods">';
      withProds.forEach(function (p) {
        html += '<div><div class="jpl">' + esc(p.label) + '</div><div class="jpthumbs">';
        p.products.forEach(function (pr) {
          var img = prodImgOf(p.key, pr.id);
          html += img ? '<img class="jp" loading="lazy" referrerpolicy="no-referrer" alt="" title="' + esc(pr.name || pr.id) + '" src="' + esc(img) + '">'
                      : '<div class="jpno" title="' + esc(pr.name || pr.id) + '">🛍</div>';
        });
        html += '</div></div>';
      });
      if (!withProds.length) html += '<div class="mut">Tanpa produk</div>';
      html += '</div></div><div class="jhead"><div class="jtitle" title="' + esc(f.title) + '">' + esc(Core.shortName((vm[f.videoId] || {}).alias || f.title, 34)) + '</div><span class="jbadge ' + f.cls + '">' + esc(f.statusText) + '</span></div>';
      var meta = [f.when, f.sizeText].filter(Boolean).join(' · ');
      if (meta) html += '<div class="jmeta">' + esc(meta) + '</div>';
      f.platforms.forEach(function (p) {
        html += '<div class="' + p.cls + '">' + esc(p.label) + ': ' + esc(p.text) + (p.msg ? ' · ' + esc(p.msg) : '') + '</div>';
        if (p.state === 'needsAction') {
          html += '<div class="resume" data-jid="' + esc(f.id) + '" data-plat="' + p.key + '">';
          Core.RESUME_CHOICES.forEach(function (c) {
            html += '<button class="sec" data-decision="' + c.decision + '">' + esc(c.label) + '</button>';
          });
          html += '</div>';
        }
      });
      if (f.canCancel) html += '<button class="sec" data-cancel="' + esc(f.id) + '">Batalkan</button>';
      html += '</div>';
    });
    $('jobs').innerHTML = html || '<div class="box mut">' + (jobsData.length ? 'Tidak ada job dengan status ini.' : 'Belum ada job.') + '</div>';
  }
  // gambar produk/thumbnail job gagal dimuat → kotak ikon
  $('jobs').addEventListener('error', function (e) {
    var t = e && e.target;
    if (!t || t.tagName !== 'IMG' || !t.parentNode) return;
    var d = document.createElement('div'); d.className = t.className === 'jthumb' ? 'jnothumb' : 'jpno'; d.textContent = t.className === 'jthumb' ? '🎬' : '🛍';
    t.parentNode.replaceChild(d, t);
  }, true);
  function loadJobs() {
    var s = Core.loadSettings(storage());
    if (!s.hubUrl || !s.token) { jobsMsg('Isi pengaturan hub dulu.', 'bad'); return Promise.resolve(); }
    jobsMsg('Memuat job …');
    return Core.hubCall(window.fetch.bind(window), s, 'job.list', { limit: 30 }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'ditolak hub');
      jobsData = Array.isArray(r.jobs) ? r.jobs : [];
      jobsMsg('');
      renderJobs();
    }).catch(function (e) { jobsMsg('Gagal memuat job: ' + e.message, 'bad'); });
  }
  function jobAction(action, body, okText) {
    var s = Core.loadSettings(storage());
    jobsMsg('Mengirim …');
    return Core.hubCall(window.fetch.bind(window), s, action, body).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'ditolak hub');
      return loadJobs().then(function () { jobsMsg(okText, 'ok'); });
    }).catch(function (e) { jobsMsg('Gagal: ' + e.message, 'bad'); });
  }
  $('jobs').addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!t) return;
    var cid = t.getAttribute('data-cancel');
    if (cid) { if (window.confirm('Batalkan job ini?')) jobAction('job.cancel', { jobId: cid }, 'Job dibatalkan.'); return; }
    var dec = t.getAttribute('data-decision'), box = t.closest('[data-jid]');
    if (!dec || !box) return;
    var c = Core.RESUME_CHOICES.filter(function (x) { return x.decision === dec; })[0];
    if (c && c.warning && !window.confirm(c.warning + '\n\nLanjutkan?')) return;
    jobAction('job.resume', { jobId: box.getAttribute('data-jid'), platform: box.getAttribute('data-plat'), decision: dec }, 'Keputusan dikirim.');
  });
  $('jobs-reload').addEventListener('click', loadJobs);

  // ---------- Pengaturan ----------
  function setResult(text, ok) {
    var r = $('result');
    r.textContent = text;
    r.className = ok === true ? 'ok' : ok === false ? 'bad' : 'mut';
  }
  function current() { return { hubUrl: $('hub').value.trim(), token: $('tok').value.trim() }; }

  var saved = Core.loadSettings(storage());
  $('hub').value = saved.hubUrl;
  $('tok').value = saved.token;
  if (!saved.hubUrl || !saved.token) showTab('setelan');

  $('save').addEventListener('click', function () {
    var ok = Core.saveSettings(storage(), current());
    setResult(ok ? 'Pengaturan disimpan.' : 'Gagal menyimpan (penyimpanan browser tidak tersedia).', ok);
    if (ok) loadCatalog();
  });

  $('ping').addEventListener('click', function () {
    setResult('Menghubungi hub …');
    $('ping').disabled = true;
    Core.hubCall(window.fetch.bind(window), current(), 'ping')
      .then(function (r) { setResult(r && r.ok ? 'Koneksi hub OK.' : 'Hub menjawab tetapi menolak: ' + (r && r.error), !!(r && r.ok)); })
      .catch(function (e) { setResult('Gagal menghubungi hub: ' + e.message + ' (cek URL, token, atau izin deploy).', false); })
      .then(function () { $('ping').disabled = false; });
  });
  loadCatalog();
  if (typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.register) {
    try { navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) {}
  }
})();
