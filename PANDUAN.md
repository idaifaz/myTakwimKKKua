# myTakwimKKKua — Panduan Pemasangan

Sistem takwim aktiviti Kolej Komuniti Kuantan. Ia guna Google Apps Script sebagai backend dan Google Sheets sebagai pangkalan data.

## Fail
- `Code.gs` — kod server (Apps Script)
- `Index.html` — antara muka (Dashboard, Tambah Aktiviti, Senarai & Urus, Kalendar Tahunan, Cetak Bulanan, Laporan & Eksport)

## Langkah pasang (lebih kurang 10 minit)
1. Buka Google Sheets dan cipta spreadsheet baharu, contohnya "myTakwimKKKua DB".
2. Pergi ke menu **Extensions → Apps Script**.
3. Padam kod asal dalam `Code.gs`, kemudian tampal isi fail `Code.gs` dari folder ini.
4. Klik **+ → HTML**, namakan fail itu `Index` (huruf besar I, tanpa .html), kemudian tampal isi `index.html`.
5. Pilih fungsi `setup` di bar atas, klik **Run** dan benarkan akses bila diminta.
6. Buka **Execution log** dan salin emel serta **kata laluan sementara** admin.
7. Klik **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone within [domain kolej]** (cadangan) atau **Anyone**
8. Salin URL web app, buka, log masuk dan **tukar kata laluan segera** (klik ikon pengguna di kanan atas).

## Tambah pengguna lain
Dalam editor Apps Script, isi nilai dalam fungsi `tambahPenggunaManual()` dan jalankannya. Selepas itu, **kosongkan semula kata laluan** dalam kod.
- `admin`: boleh tambah, kemas kini dan padam
- `staf`: boleh tambah dan kemas kini sahaja

## Akses
- Semua orang yang ada URL boleh **lihat** dashboard, kalendar, cetakan dan eksport, sebab takwim bukan data peribadi.
- **Tambah, kemas kini dan padam** memerlukan log masuk.

## Keselamatan yang sudah dibina
- Kata laluan disimpan sebagai hash SHA-256 dengan salt yang berbeza bagi setiap pengguna. Tiada kata laluan teks biasa.
- Token sesi tamat selepas 6 jam dan disemak di server pada setiap tindakan tulis.
- Peranan (admin/staf) disemak di server, bukan di pelayar sahaja.
- Had log masuk ialah 8 percubaan setiap 5 minit.
- Input dibersihkan daripada formula injection (`= + - @`) sebelum ditulis ke Sheet, dan output di-escape untuk mengelak XSS.
- **Jangan** guna "Publish to Web" pada Sheet ini.

## Mod Demo
Jika `Index.html` dibuka terus dalam pelayar (bukan melalui Apps Script), ia berjalan dalam Mod Demo dengan data contoh yang disimpan dalam pelayar sahaja. Log masuk demo: `admin@demo` / `demo1234`.
