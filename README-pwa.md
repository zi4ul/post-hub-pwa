# Memasang PWA Post Hub (GitHub Pages + iPhone)

## 1. Taruh di GitHub Pages (sekali, ± 5 menit)
1. Buat repositori baru di GitHub (publik), misalnya `post-hub-pwa`.
2. Unggah **isi folder `pwa/`** (bukan folder `pwa` itu sendiri): `index.html`, `core.js`, `upload.js`, `app.js`, `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`. Jangan unggah `spike.html` bila tidak perlu.
3. Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)` → Save.
4. Tunggu 1–2 menit. Alamatnya: `https://NAMA-ANDA.github.io/post-hub-pwa/`.
5. Aman untuk publik: berkas ini tidak berisi token. URL hub dan token diisi di layar **Pengaturan** dan hanya tersimpan di iPhone Anda.

## 2. Tambah ke Layar Utama (iPhone)
1. Buka alamat di atas dengan **Safari** (bukan Chrome).
2. Ketuk tombol Bagikan → **Tambah ke Layar Utama** → Tambah.
3. Buka dari ikon baru. Tab **Pengaturan**: isi URL web app hub dan token klien → Simpan → Tes koneksi.

## 3. Pembaruan (setiap kali ada versi baru)
1. Unggah ulang SEMUA berkas `pwa/` ke repositori (GitHub: *Add file → Upload files*, timpa berkas lama, *Commit changes*).
2. Setiap perubahan berkas kerangka harus disertai kenaikan angka `CACHE` di `sw.js` (sekarang `post-hub-shell-v14`).
3. Tunggu 1–2 menit, lalu **tutup penuh** aplikasi di HP (geser ke atas dari app switcher) dan buka lagi. Bila tampilan lama masih muncul, tutup-buka sekali lagi.
4. Service worker hanya menyimpan kerangka halaman. Panggilan ke hub dan Google Drive selalu lewat jaringan.
5. Hub (hanya bila tab "Pernah diunggah" menampilkan "Hub belum diperbarui"): tempel ulang `hub/Api.gs` DAN `hub/Upload.gs` di Apps Script, lalu **Deploy > Kelola deployment > Edit > Versi baru** (URL tetap).
6. Thumbnail produk muncul setelah Reafter men-scrape katalog (Pengaturan > Scrape Produk).

## 4. Cara pakai (v1.16.x)
**Buat Posting** berupa Wizard 6 langkah, satu langkah per layar:
1. **Video**: dari HP atau "Pernah diunggah". Setelah dipilih tampil label "Video terpilih", preview besar, dan tombol "Ganti video".
2. **Platform**: Shopee Video, TikTok, Instagram.
3. **Produk**: tab Shopee / TikTok. Wajib memilih bila katalog platform itu ada; bila katalog kosong boleh lanjut tanpa produk.
4. **Deskripsi dan hashtag**: penghitung karakter per platform.
5. **Waktu**: Sekarang atau Jadwalkan; kotak "Simpan video di Drive".
6. **Ringkasan**: video, platform, produk per platform, deskripsi + hashtag, waktu. Tiap bagian punya tombol **Ubah**; setelah mengubah, tombol Lanjut berganti "Simpan, ke ringkasan". Tombol **Kirim** ada di langkah ini.

Tombol **Kembali** dan **Lanjut** ada di bagian bawah. Bila Lanjut nonaktif, alasannya tertulis tepat di atasnya. Langkah di depan yang masih terkunci tidak bisa dilompati lewat bilah langkah di atas.

**Daftar Job**: kartu bergambar; chip filter di atas daftar: Semua, Berjalan, Selesai, Gagal, Perlu tindakan (masing-masing dengan jumlah). Job "Sebagian berhasil" dihitung di Gagal; job dibatalkan hanya tampil di Semua.

## 5. Cek manual di iPhone (belum pernah diuji di perangkat asli)
Tes otomatis dan uji di Chromium (layar 390×844, mode terang dan gelap, hub tiruan) sudah lulus, tetapi hal berikut hanya bisa dipastikan di iPhone:
- [ ] Setelah pembaruan, app dibuka penuh-ulang dan terlihat Wizard (ada bilah 6 langkah).
- [ ] Langkah 1: pilih video dari HP, thumbnail muncul (tidak hitam), "Ganti video" bekerja.
- [ ] Tombol Kembali/Lanjut tidak tertutup bilah tab bawah atau garis home iPhone; alasan tombol nonaktif terbaca.
- [ ] Langkah 3: pilih produk Shopee (maks 6) dan TikTok (maks 1); Lanjut baru aktif setelah lengkap.
- [ ] Langkah 5: "Jadwalkan" tanpa tanggal membuat Lanjut nonaktif dengan alasan.
- [ ] Ringkasan: semua bagian benar; "Ubah" membuka langkah yang tepat dan kembali ke ringkasan.
- [ ] Kirim video ≥ 50 MB dengan layar menyala; layar sukses muncul; "Kirim lagi" kembali ke langkah 1.
- [ ] Daftar Job: chip filter menghitung dan menyaring dengan benar; Batalkan / Coba lagi masih jalan.
- [ ] Ketuk kolom Deskripsi, Hashtag, Nama alternatif, Jadwal, dan Pengaturan: halaman TIDAK membesar sendiri.
- [ ] Mode gelap dan "Kurangi Gerakan" (Aksesibilitas) tampil wajar.

## 6. Catatan
- Unggah video harus dilakukan dengan layar menyala dan halaman tetap terbuka (iOS menghentikan unggahan di latar belakang).
- Kolom ketik memakai huruf 16px agar iPhone tidak memperbesar (zoom) halaman saat mengetik. Jangan diperkecil di CSS.
- Nama alternatif video tersimpan di HP ini saja (localStorage); nama asli file di Drive tidak berubah.
