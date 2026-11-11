// PWA core: pengaturan (localStorage) + klien API hub. UMD: require() di Node, <script> di browser.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PostHubCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var KEY_HUB = 'ph_hub';
  var KEY_TOK = 'ph_tok';

  // Baca pengaturan; storage boleh melempar error (mode privat, dll) → nilai kosong.
  function loadSettings(storage) {
    function get(k) {
      try { return (storage && storage.getItem(k)) || ''; } catch (e) { return ''; }
    }
    return { hubUrl: get(KEY_HUB).trim(), token: get(KEY_TOK).trim() };
  }

  // Simpan pengaturan; mengembalikan true bila kedua nilai tersimpan, false bila storage gagal.
  function saveSettings(storage, s) {
    s = s || {};
    try {
      storage.setItem(KEY_HUB, String(s.hubUrl || '').trim());
      storage.setItem(KEY_TOK, String(s.token || '').trim());
      return true;
    } catch (e) {
      return false;
    }
  }

  // POST text/plain (tanpa preflight CORS) ke hub Apps Script.
  function hubCall(fetchFn, settings, action, body) {
    var url = settings && settings.hubUrl, token = settings && settings.token;
    if (!url || !token) return Promise.reject(new Error('Isi URL hub dan token dulu.'));
    var payload = JSON.stringify(Object.assign({ token: token, action: action }, body || {}));
    return Promise.resolve(fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: payload,
      redirect: 'follow'
    })).then(function (r) { return r.text(); })
      .then(function (t) {
        try { return JSON.parse(t); }
        catch (e) { throw new Error('Respons hub bukan JSON: ' + String(t).slice(0, 120)); }
      });
  }

  // ---------- caption & validasi (cermin hub/Logic.gs; hub tetap otoritas akhir) ----------
  var CAPTION_LIMIT = { shopee: 150, tiktok: 4000, instagram: 2200 };
  var MAX_PRODUCTS = { shopee: 6, tiktok: 1, instagram: 0 };
  var PLATFORMS = ['shopee', 'tiktok', 'instagram'];

  function parseTags(input) {
    var arr = Array.isArray(input) ? input : String(input == null ? '' : input).split(/[\s,]+/);
    var seen = {}, out = [];
    for (var i = 0; i < arr.length; i++) {
      var t = String(arr[i]).replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '');
      var key = t.toLowerCase();
      if (t && !seen[key]) { seen[key] = 1; out.push(t); }
    }
    return out;
  }
  function buildCaption(description, tags) {
    return String(description || '') + (tags.length ? '\n\n' + tags.map(function (t) { return '#' + t; }).join(' ') : '');
  }
  // Shopee & Instagram: deskripsi + hashtag. TikTok: hanya deskripsi.
  function captionLength(platform, description, tags) {
    return platform === 'tiktok' ? String(description || '').length : buildCaption(description, tags).length;
  }

  // form: {video:{name,mime,width,height,durationSec}, description, hashtags, platforms:{shopee:{enabled,products:[{id}]},...}}
  function validateForm(form) {
    var errors = [], warnings = [];
    var err = function (code, msg, platform) { errors.push({ code: code, msg: msg, platform: platform || null }); };
    var warn = function (code, msg, platform) { warnings.push({ code: code, msg: msg, platform: platform || null }); };
    form = form || {};
    var v = form.video;
    if (!v || typeof v !== 'object') err('no_video', 'Video belum dipilih.');
    var plats = form.platforms && typeof form.platforms === 'object' ? form.platforms : {};
    var enabled = PLATFORMS.filter(function (p) { return plats[p] && plats[p].enabled; });
    if (!enabled.length) err('no_platform', 'Pilih minimal satu platform.');

    var desc = typeof form.description === 'string' ? form.description : '';
    var tags = parseTags(form.hashtags);
    enabled.forEach(function (p) {
      var len = captionLength(p, desc, tags);
      if (len > CAPTION_LIMIT[p]) err('caption_too_long', 'Caption ' + p + ' ' + len + '/' + CAPTION_LIMIT[p] + ' karakter, terlalu panjang.', p);
      if (MAX_PRODUCTS[p] > 0) {
        var prods = Array.isArray(plats[p].products) ? plats[p].products : [];
        if (prods.length > MAX_PRODUCTS[p]) err('too_many_products', 'Maksimal ' + MAX_PRODUCTS[p] + ' produk untuk ' + p + ', dipilih ' + prods.length + '.', p);
        if (prods.length === 0) warn('no_products', 'Belum ada produk dipilih untuk ' + p + '.', p);
      }
    });

    if (v && typeof v === 'object') {
      var isMp4 = /mp4/i.test(String(v.mime || '')) || /\.mp4$/i.test(String(v.name || ''));
      if (!isMp4) warn('not_mp4', 'Video bukan .mp4. Di iPhone pilih "Paling Kompatibel" agar jadi .mp4.', 'shopee');
      if (Number(v.width) > 0 && Number(v.height) > 0 && (enabled.indexOf('shopee') >= 0 || enabled.indexOf('instagram') >= 0) &&
          Math.abs(v.width / v.height - 9 / 16) > 0.02) warn('bad_ratio', 'Rasio ' + v.width + 'x' + v.height + ', Shopee dan Instagram butuh 9:16.');
      if (Number(v.durationSec) > 0 && enabled.indexOf('shopee') >= 0 && (v.durationSec < 10 || v.durationSec > 60)) warn('bad_duration', 'Durasi ' + Math.round(v.durationSec) + ' dtk, Shopee butuh 10 sampai 60 dtk.', 'shopee');
    }
    return { errors: errors, warnings: warnings };
  }

  // ---------- pilih produk (batas MAX_PRODUCTS; fungsi murni, tidak mengubah masukan) ----------
  // selected: [{id,name}] untuk SATU platform. Ketuk produk terpilih → dilepas.
  // Batas 1 (TikTok): produk baru menggantikan. Batas > 1 (Shopee): penuh → ditolak dengan pesan.
  // Mengembalikan {selected, error|null}.
  function pickProduct(selected, platform, id, name) {
    var cur = Array.isArray(selected) ? selected.slice() : [];
    var max = MAX_PRODUCTS[platform] || 0;
    id = String(id == null ? '' : id);
    if (!max) return { selected: cur, error: 'Platform ' + platform + ' tidak memakai produk.' };
    if (!id) return { selected: cur, error: 'Produk tidak valid.' };
    for (var i = 0; i < cur.length; i++) {
      if (String(cur[i].id) === id) { cur.splice(i, 1); return { selected: cur, error: null }; }
    }
    var item = { id: id, name: name == null ? '' : String(name) };
    if (max === 1) return { selected: [item], error: null };
    if (cur.length >= max) return { selected: cur, error: 'Maksimal ' + max + ' produk untuk ' + platform + '.' };
    cur.push(item);
    return { selected: cur, error: null };
  }

  // ---------- payload job.create (SPEC 5.1; hub membuat id/status, PWA hanya mengirim input) ----------
  function normSchedule(x) {
    if (x == null || x === '') return null;
    if (x instanceof Date) return isNaN(x.getTime()) ? String(x) : x.toISOString();
    if (typeof x === 'number') return new Date(x).toISOString();
    return String(x);
  }
  // form: {description, hashtags, platforms, scheduledAt, deleteAfter, note}
  // videoInfo: {name, size, mime, durationSec, width, height}; fileId: id berkas di Drive.
  function buildJobPayload(form, videoInfo, fileId) {
    form = form || {};
    var vi = videoInfo || null;
    var video = vi ? {
      driveFileId: fileId, name: vi.name, size: Number(vi.size),
      mime: vi.mime || 'video/mp4', durationSec: Number(vi.durationSec) || 0,
      width: Number(vi.width) || 0, height: Number(vi.height) || 0
    } : null;
    var platforms = {};
    var src = form.platforms && typeof form.platforms === 'object' ? form.platforms : {};
    PLATFORMS.forEach(function (p) {
      var cfg = src[p] || {};
      var e = { enabled: !!cfg.enabled };
      if (MAX_PRODUCTS[p] > 0) {
        e.products = (Array.isArray(cfg.products) ? cfg.products : []).map(function (x) {
          return x && typeof x === 'object' ? { id: x.id, name: x.name == null ? '' : x.name } : x;
        });
      }
      platforms[p] = e;
    });
    return {
      job: {
        video: video,
        description: typeof form.description === 'string' ? form.description : '',
        hashtags: parseTags(form.hashtags),
        platforms: platforms,
        scheduledAt: normSchedule(form.scheduledAt),
        deleteAfter: form.deleteAfter === false ? false : true,
        note: typeof form.note === 'string' ? form.note : ''
      }
    };
  }

  // ---------- alur Kirim (T08): upload.init → unggah → upload.finish → job.create ----------
  // deps: {hub(action, body)→Promise<json>, upload(file, session, onProgress)→Promise<fileId>, onStatus?, onProgress?}
  // resume (opsional, dari hasil gagal sebelumnya): {session, fileId, finished} → tahap yang sudah beres dilewati.
  // Hasil: {ok, stage, message, jobId?, resume?}; berhenti di tahap pertama yang gagal.
  function errText(r, fallback) {
    if (!r) return fallback;
    return (r.error || fallback) + (r.detail ? ' — ' + r.detail : '') + (r.status ? ' (HTTP ' + r.status + ')' : '');
  }
  async function submitFlow(deps, form, file, resume) {
    var st = Object.assign({ session: null, fileId: null, finished: false }, resume || {});
    var say = deps.onStatus || function () {};
    function fail(stage, message) {
      return { ok: false, stage: stage, message: message + ' Anda bisa menekan Kirim lagi untuk mengulang.', resume: st };
    }
    var v = validateForm(form || {});
    if (v.errors.length) return { ok: false, stage: 'validate', message: v.errors[0].msg, resume: st };
    if (!file) return { ok: false, stage: 'validate', message: 'Pilih video dulu.', resume: st };

    if (!st.fileId) {
      if (!st.session) {
        say('Menyiapkan unggahan …');
        var mime = (form.video && form.video.mime) || file.type || 'video/mp4';
        var init;
        try { init = await deps.hub('upload.init', { name: file.name, size: file.size, mime: mime, origin: deps.origin || '' }); }
        catch (e) { return fail('init', 'Gagal menghubungi hub: ' + e.message + '.'); }
        if (!init || !init.ok) return fail('init', 'Hub menolak unggahan: ' + errText(init, 'tidak diketahui') + '.');
        st.session = { sessionUri: init.sessionUri, fileId: init.fileId };
      }
      say('Mengunggah video …');
      try { st.fileId = await deps.upload(file, st.session, deps.onProgress); }
      catch (e) { return fail('upload', 'Unggahan gagal: ' + e.message + '.'); }
    }
    if (!st.finished) {
      say('Memeriksa berkas di Drive …');
      var fin;
      try { fin = await deps.hub('upload.finish', { fileId: st.fileId, size: file.size }); }
      catch (e) { return fail('finish', 'Gagal memverifikasi unggahan: ' + e.message + '.'); }
      if (!fin || !fin.ok) return fail('finish', 'Verifikasi unggahan ditolak: ' + errText(fin, 'tidak diketahui') + '.');
      st.finished = true;
    }
    say('Membuat job …');
    var made;
    try { made = await deps.hub('job.create', buildJobPayload(form, form.video, st.fileId)); }
    catch (e) { return fail('job', 'Video sudah terunggah, tetapi job gagal dibuat: ' + e.message + '.'); }
    if (!made || !made.ok) return fail('job', 'Video sudah terunggah, tetapi hub menolak job: ' + errText(made, 'tidak diketahui') + '.');
    return { ok: true, stage: 'done', message: 'Terkirim. Job masuk antrean.', jobId: made.jobId || (made.job && made.job.id) || null, resume: null };
  }

  // ---------- Daftar Job (T09): status → teks Indonesia + warna (cls: ok/bad/warn/mut) ----------
  var STATUS = {
    queued: ['Menunggu giliran', 'mut'], claimed: ['Diambil Reafter', 'warn'], running: ['Sedang diposting', 'warn'],
    needsAction: ['Perlu tindakan Anda', 'bad'], done: ['Selesai', 'ok'], partial: ['Sebagian berhasil', 'warn'],
    error: ['Gagal', 'bad'], cancelled: ['Dibatalkan', 'mut'], skipped: ['Tidak dipakai', 'mut']
  };
  var PNAMES = { shopee: 'Shopee Video', tiktok: 'TikTok', instagram: 'Instagram' };
  function statusInfo(state) {
    var x = STATUS[state];
    return x ? { text: x[0], cls: x[1] } : { text: 'Status tidak dikenal (' + String(state) + ')', cls: 'mut' };
  }
  // Pilihan untuk platform needsAction (D16). retry berisiko posting ganda → peringatan wajib tampil.
  var RESUME_CHOICES = [
    { decision: 'retry', label: 'Coba lagi', warning: 'Awas: video mungkin SUDAH terposting. Coba lagi bisa membuat posting ganda. Cek akun dulu.' },
    { decision: 'markDone', label: 'Sudah terposting', warning: '' },
    { decision: 'close', label: 'Tutup tanpa coba lagi', warning: '' }
  ];
  function formatJob(job) {
    job = job || {};
    var si = statusInfo(job.status), plats = [], needs = [];
    ['shopee', 'tiktok', 'instagram'].forEach(function (p) {
      var e = job.platforms && job.platforms[p];
      if (!e || !e.enabled) return;
      var pi = statusInfo(e.state);
      plats.push({ key: p, label: PNAMES[p], state: e.state, text: pi.text, cls: pi.cls, msg: e.msg || '' });
      if (e.state === 'needsAction') needs.push(p);
    });
    var closed = job.status === 'done' || job.status === 'partial' || job.status === 'error' || job.status === 'cancelled';
    return {
      id: job.id || '', title: (job.video && job.video.name) || job.id || '(tanpa nama)',
      statusText: si.text, cls: si.cls, platforms: plats,
      canCancel: !!job.id && !closed, needsAction: needs, canResume: job.status === 'needsAction' && needs.length > 0
    };
  }

  return { pickProduct: pickProduct, submitFlow: submitFlow, statusInfo: statusInfo, formatJob: formatJob, RESUME_CHOICES: RESUME_CHOICES, buildJobPayload: buildJobPayload, parseTags: parseTags, buildCaption: buildCaption, captionLength: captionLength, validateForm: validateForm,
    CAPTION_LIMIT: CAPTION_LIMIT, MAX_PRODUCTS: MAX_PRODUCTS, loadSettings: loadSettings, saveSettings: saveSettings, hubCall: hubCall, KEY_HUB: KEY_HUB, KEY_TOK: KEY_TOK };
});
