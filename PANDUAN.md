# myTakwimKKKua — Panduan Pemasangan

Sistem takwim aktiviti Kolej Komuniti Kuantan. Ia guna Google Apps Script sebagai backend dan Google Sheets sebagai pangkalan data. Antara muka boleh dibuka melalui GitHub Pages atau terus melalui URL Apps Script.

## Fail
- `Code.gs` — kod server (Apps Script)
- `index.html` — antara muka (Dashboard, Tambah Aktiviti, Senarai & Urus, Kalendar Tahunan, Cetak Bulanan, Laporan & Eksport)

## Bahagian A — Pasang backend di Google (lebih kurang 10 minit)
1. Buka Google Sheets dan cipta spreadsheet baharu, contohnya "myTakwimKKKua DB".
2. Pergi ke menu **Extensions → Apps Script**.
3. Padam kod asal dalam `Code.gs`, kemudian tampal isi fail `Code.gs` dari folder ini.
4. Klik **+ → HTML**, namakan fail itu `Index` (huruf besar I, tanpa .html), kemudian tampal isi `index.html`.
5. Pilih fungsi `setup` di bar atas, klik **Run** dan benarkan akses bila diminta.
6. Buka **Execution log** dan salin emel serta **kata laluan sementara** admin.
7. Klik **Deploy → New deployment**. Pada ikon gear, pilih **Web app**, kemudian tetapkan:
   - Execute as: **Me**
   - Who has access: **Anyone**. Ini wajib supaya GitHub Pages boleh berhubung dengan backend. Tindakan tambah, ubah dan padam tetap memerlukan log masuk.
8. Klik **Deploy** dan salin **Web app URL**. URL itu berakhir dengan `/exec`.

## Bahagian B — Sambungkan GitHub Pages ke backend
1. Di GitHub, buka fail `index.html` dalam repo dan klik ikon pensel (Edit).
2. Tekan **Ctrl + F** dan cari `const API_URL = '';`
3. Tampal URL dari langkah A8 di antara tanda petik:
   `const API_URL = 'https://script.google.com/macros/s/XXXX/exec';`
4. Klik **Commit changes**.
5. Tunggu 1–2 minit, kemudian buka https://idaifaz.github.io/myTakwimKKKua/. Jalur kuning "Mod Demo" sepatutnya dah hilang.
6. Log masuk dan **tukar kata laluan segera** (klik ikon pengguna di kanan atas).

## Bila kemas kini Code.gs
Selepas mengubah kod di Apps Script, pergi ke **Deploy → Manage deployments**, klik ikon pensel, pilih **Version: New version**, kemudian klik **Deploy**. Dengan cara ini URL kekal sama, jadi `index.html` tak perlu diubah.

## Pendaftaran pengguna
1. Staf klik **Log Masuk → Daftar di sini**, kemudian isi nama, emel dan kata laluan.
2. Akaun berstatus **Menunggu** dan belum boleh log masuk.
3. Admin buka tab **Pengguna**. Nombor oren pada tab itu ialah bilangan permohonan yang menunggu. Admin klik **Lulus** atau **Tolak**.
4. Dalam tab yang sama, admin boleh **tukar peranan** (staf/admin) dan **nyahaktif** atau **aktifkan semula** akaun. Perubahan berkuat kuasa serta-merta.

Peranan:
- `admin`: boleh tambah, kemas kini dan padam aktiviti, serta urus pengguna
- `staf`: boleh tambah dan kemas kini aktiviti sahaja

Admin tidak boleh menukar peranan atau menyahaktif akaun sendiri. Ini supaya sistem tidak terkunci tanpa admin.

Alternatif: admin juga boleh tambah pengguna terus dari editor Apps Script melalui fungsi `tambahPenggunaManual()`. Selepas itu, **kosongkan semula kata laluan** dalam kod.

## Notifikasi emel
Sistem hantar emel secara automatik dalam dua keadaan:
- **Kepada semua admin aktif** bila ada pendaftaran baharu, dengan pautan untuk lulus atau tolak.
- **Kepada pengguna** bila akaunnya diluluskan, dengan pautan log masuk.

Emel dihantar dari akaun Gmail pemilik Apps Script. Had Gmail biasa ialah lebih kurang 100 emel sehari, dan Google Workspace kolej biasanya 1,500 sehari.

**Kali pertama selepas kemas kini `Code.gs`:** pilih fungsi `ujiEmel`, klik **Run**, kemudian benarkan kebenaran "Send email as you". Satu emel ujian akan masuk ke peti masuk anda. Lepas tu, deploy **New version** macam biasa.

## Akses
- Sesiapa yang ada pautan boleh **lihat** dashboard, kalendar, cetakan dan eksport, sebab takwim bukan data peribadi.
- **Tambah, kemas kini dan padam** memerlukan log masuk. Semakan dibuat di server Google.

## Keselamatan yang sudah dibina
- Kata laluan disimpan sebagai hash SHA-256 dengan salt yang berbeza bagi setiap pengguna. Tiada kata laluan teks biasa.
- Token sesi tamat selepas 6 jam dan disemak di server pada setiap tindakan tulis.
- Peranan (admin/staf) disemak di server, bukan di pelayar sahaja.
- Had log masuk ialah 8 percubaan setiap 5 minit. Had pendaftaran ialah 3 setiap emel sejam, dan 30 keseluruhan sejam.
- Pendaftaran sendiri perlu diluluskan oleh admin. Status akaun disemak semula pada setiap tindakan tulis.
- Notis privasi ringkas dipaparkan pada borang daftar (PDPA).
- Input dibersihkan daripada formula injection (`= + - @`) sebelum ditulis ke Sheet, dan output di-escape untuk mengelak XSS.
- URL Web App boleh didedahkan dalam `index.html` kerana ia bukan rahsia. Keselamatan bergantung pada log masuk, bukan pada URL.
- **Jangan** guna "Publish to Web" pada Sheet ini.

## Mod Demo
Jika `API_URL` kosong dan halaman tidak dibuka melalui Apps Script, sistem berjalan dalam Mod Demo dengan data contoh yang disimpan dalam pelayar sahaja. Log masuk demo: `admin@demo` / `demo1234`.
