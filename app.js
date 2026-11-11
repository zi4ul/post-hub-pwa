// PWA Post Hub: navigasi 3 tab + Pengaturan (T05) + form (T06) + alur Kirim (T08) + Daftar Job (T09).
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

  function probe(f, cb) { // info durasi/rasio via <video> (seperti spike); tidak menghalangi bila gagal
    var info = { name: f.name, size: f.size, mime: f.type || '', durationSec: 0, width: 0, height: 0 };
    var done = false, u = null;
    function fin(ok, v) {
      if (done) return; done = true;
      if (ok) { info.durationSec = v.duration || 0; info.width = v.videoWidth || 0; info.height = v.videoHeight || 0; }
      try { window.URL.revokeObjectURL(u); } catch (e) {}
      cb(info, ok);
    }
    try {
      var v = document.createElement('video');
      u = window.URL.createObjectURL(f);
      v.preload = 'metadata'; v.muted = true;
      v.onloadedmetadata = function () { fin(true, v); };
      v.onerror = function () { fin(false); };
      v.src = u;
      setTimeout(function () { fin(false); }, 8000);
    } catch (e) { fin(false); }
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function renderProducts() {
    var msg = catalogMsg;
    ['shopee', 'tiktok'].forEach(function (p) {
      var box = PROD[p];
      if (!CHK[p].checked) { box.innerHTML = ''; return; }
      var items = catalog[p] || [], max = Core.MAX_PRODUCTS[p];
      var html = '<strong>' + PNAME[p] + ' (' + sel[p].length + '/' + max + ')</strong>';
      if (!items.length) {
        if (!msg) msg = 'Katalog belum ada, Reafter belum sinkron. Posting tetap boleh tanpa produk.';
      } else {
        items.forEach(function (it) {
          var on = sel[p].some(function (x) { return x.id === it.id; });
          html += '<div class="prow' + (on ? ' sel' : '') + '" data-plat="' + p + '" data-pid="' + esc(it.id) + '">' + (on ? '✓ ' : '') + esc(it.name || it.id) + '</div>';
        });
      }
      box.innerHTML = html;
    });
    $('prod-msg').textContent = msg;
  }

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
          .map(function (x) { return { id: String(x.id), name: String(x.name || '') }; });
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
      scheduledAt: $('when-sched').checked ? $('sched').value : null
    };
  }

  function refresh() {
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
    $('send').disabled = errors.length > 0;
    return { errors: errors, warnings: r.warnings };
  }

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

  $('send').addEventListener('click', function () {
    var file = $('file').files && $('file').files[0];
    if (sending || !file) return;
    var s = Core.loadSettings(storage());
    if (!s.hubUrl || !s.token) { sendMsg('Isi pengaturan hub dulu.', 'bad'); showTab('setelan'); return; }
    if (sentFile !== file) { resume = null; sentFile = file; }   // berkas lain → mulai dari awal
    var uploader = window.PostHubUpload.create({});
    sending = true; $('send').disabled = true; sendMsg('Memulai …'); lockScreen();
    Core.submitFlow({
      hub: function (action, body) { return Core.hubCall(window.fetch.bind(window), s, action, body); },
      upload: uploader.upload,
      origin: window.location.origin,
      onStatus: function (t) { sendMsg(t); },
      onProgress: function (p) { sendMsg('Mengunggah ' + p.pct.toFixed(0) + '% · ' + p.mbps.toFixed(1) + ' MB/dtk · sisa ±' + p.etaSec + ' dtk'); }
    }, readForm(), file, resume).then(function (r) {
      resume = r.resume;
      sendMsg((r.ok ? '✓ ' : '✗ ') + r.message, r.ok ? 'ok' : 'bad');
      if (r.ok) { sentFile = null; $('file').value = ''; video = null; $('vinfo').textContent = 'Belum ada video.'; }
    }).catch(function (e) { sendMsg('✗ Gagal: ' + e.message, 'bad'); })
      .then(function () { sending = false; unlockScreen(); refresh(); });
  });

  $('file').addEventListener('change', function () {
    var f = $('file').files && $('file').files[0];
    if (!f) { video = null; $('vinfo').textContent = 'Belum ada video.'; refresh(); return; }
    $('vinfo').textContent = 'Membaca info video …';
    probe(f, function (info, ok) {
      video = info;
      $('vinfo').textContent = f.name + ' · ' + (f.size / 1048576).toFixed(1) + ' MB' +
        (ok ? ' · ' + info.width + '×' + info.height + ' · ' + info.durationSec.toFixed(1) + ' dtk' : ' · info tidak terbaca (mungkin HEVC/.mov)');
      refresh();
    });
  });
  ['desc', 'tags'].forEach(function (id) { $(id).addEventListener('input', refresh); });
  [CHK.shopee, CHK.tiktok, CHK.instagram, $('when-now'), $('when-sched'), $('sched')].forEach(function (el) {
    el.addEventListener('change', refresh);
  });
  refresh();

  // ---------- Daftar Job (T09): job.list, Batal, Lanjut (job.resume) ----------
  var jobsData = [];
  function jobsMsg(t, cls) { $('jobs-msg').textContent = t; $('jobs-msg').className = (cls || 'mut') + ' msg'; }
  function renderJobs() {
    var html = '';
    jobsData.forEach(function (j) {
      var f = Core.formatJob(j);
      html += '<div class="box" data-job="' + esc(f.id) + '"><strong>' + esc(f.title) + '</strong> <span class="' + f.cls + '">' + esc(f.statusText) + '</span>';
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
    $('jobs').innerHTML = html || '<div class="box mut">Belum ada job.</div>';
  }
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
