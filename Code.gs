/**
 * myTakwimKKKua — Sistem Takwim Aktiviti Kolej Komuniti Kuantan
 * Backend: Google Apps Script + Google Sheets
 *
 * LANGKAH PERTAMA: jalankan fungsi setup() sekali dari editor Apps Script.
 * Ia akan cipta tab yang diperlukan dan akaun admin pertama (kata laluan
 * sementara dipaparkan dalam Execution log).
 */

const SHEET_AKTIVITI = 'Aktiviti';
const SHEET_USERS = 'Users';
const SHEET_LOGEMEL = 'LogEmel'; // rekod setiap cubaan hantar emel (untuk semakan admin)
const AKTIVITI_HEADERS = ['ID', 'Pengisi', 'Unit', 'NamaProgram', 'TarikhMula', 'TarikhTamat',
  'PerluPeruntukan', 'KodOS', 'Amaun', 'Catatan', 'DikemasKini', 'Oleh'];
// Aktif: 'YA' (boleh log masuk) | 'MENUNGGU' (daftar sendiri, belum diluluskan) | 'TIDAK' (dinyahaktif)
const USER_HEADERS = ['Email', 'Nama', 'Role', 'Salt', 'Hash', 'Aktif', 'Didaftar'];
const SESSION_TTL = 6 * 60 * 60; // 6 jam (had maksimum CacheService)
const APP_URL = 'https://idaifaz.github.io/myTakwimKKKua/'; // pautan dalam emel notifikasi

/* ===================== Web app ===================== */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('myTakwimKKKua')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/**
 * API JSON untuk antara muka yang dihoskan di luar Apps Script (cth GitHub Pages).
 * Klien hantar POST (Content-Type: text/plain) dengan badan {action, args}.
 * Setiap tindakan tulis masih disemak token & peranan dalam fungsi api* masing-masing.
 */
const API_ACTIONS = {
  getAll: apiGetAll,
  login: apiLogin,
  logout: apiLogout,
  whoami: apiWhoAmI,
  changePassword: apiChangePassword,
  save: apiSave,
  delete: apiDelete,
  register: apiRegister,
  listUsers: apiListUsers,
  updateUser: apiUpdateUser,
  rejectUser: apiRejectUser,
  resetPassword: apiResetPassword
};

function doPost(e) {
  let result;
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const fn = Object.prototype.hasOwnProperty.call(API_ACTIONS, body.action) ? API_ACTIONS[body.action] : null;
    if (!fn) throw new Error('Tindakan tidak sah.');
    const args = Array.isArray(body.args) ? body.args : [];
    result = { ok: true, data: fn.apply(null, args) };
  } catch (err) {
    result = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

/* ===================== Setup ===================== */

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_AKTIVITI);
  if (!sh) sh = ss.insertSheet(SHEET_AKTIVITI);
  if (sh.getLastRow() === 0) sh.appendRow(AKTIVITI_HEADERS);
  sh.getRange('A:L').setNumberFormat('@'); // simpan semua sebagai teks (elak isu zon masa tarikh)
  sh.setFrozenRows(1);

  let us = ss.getSheetByName(SHEET_USERS);
  if (!us) us = ss.insertSheet(SHEET_USERS);
  if (us.getLastRow() > 0) us.getRange(1, 1, 1, USER_HEADERS.length).setValues([USER_HEADERS]); // tambah lajur baharu jika ada
  if (us.getLastRow() === 0) {
    us.appendRow(USER_HEADERS);
    const email = Session.getEffectiveUser().getEmail() || 'admin@kkkua.local';
    const pass = Utilities.getUuid().slice(0, 10);
    addUser_(email, 'Pentadbir', 'admin', pass);
    Logger.log('Admin pertama dicipta. Emel: %s | Kata laluan sementara: %s', email, pass);
    Logger.log('Sila log masuk dan tukar kata laluan segera.');
  }
  us.setFrozenRows(1);
}

/**
 * Tambah pengguna (atau reset kata laluan pengguna sedia ada) dari editor:
 * ubah nilai di bawah, jalankan, kemudian KOSONGKAN semula nilai kata laluan
 * supaya tak tertinggal dalam kod.
 */
function tambahPenggunaManual() {
  const email = '';      // cth: 'staf@kkkua.edu.my'
  const nama = '';
  const role = 'admin';  // 'admin' atau 'staf'
  const password = '';
  if (!email || !password) throw new Error('Isi email & password dahulu.');
  const u = findUser_(email);
  if (u) {
    // Emel sudah wujud: kemas kini baris sedia ada (bukan tambah baris baharu,
    // kerana findUser_ hanya membaca padanan pertama).
    setPassword_(u.row, password);
    Logger.log('Pengguna %s sudah wujud — kata laluan dikemas kini.', email);
    return;
  }
  addUser_(email, nama, role, password);
  Logger.log('Pengguna %s ditambah.', email);
}

/* ===================== Keselamatan ===================== */

function hashPassword_(password, salt) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + salt, Utilities.Charset.UTF_8);
  return raw.map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}

function addUser_(email, nama, role, password, status) {
  const us = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
  const salt = Utilities.getUuid();
  us.appendRow([String(email).toLowerCase().trim(), sanitizeForSheet_(nama), role, salt,
    hashPassword_(password, salt), status || 'YA', nowStr_()]);
}

// Tetapkan kata laluan baharu (salt baharu) pada baris pengguna di Sheet
function setPassword_(row, password) {
  const salt = Utilities.getUuid();
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS)
    .getRange(row, 4, 1, 2).setValues([[salt, hashPassword_(password, salt)]]);
}

// Kata laluan sementara 10 aksara (tanpa huruf/nombor yang mudah keliru: 0 O 1 l I)
function tempPassword_() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Date.now());
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[((bytes[i] + 256) % 256) % chars.length];
  return out;
}

function findUser_(email) {
  email = String(email || '').toLowerCase().trim();
  const us = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
  const rows = us.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).toLowerCase() === email) {
      return { row: i + 1, email: rows[i][0], nama: rows[i][1], role: String(rows[i][2]).toLowerCase(),
        salt: rows[i][3], hash: rows[i][4], status: String(rows[i][5]), aktif: rows[i][5] === 'YA' };
    }
  }
  return null;
}

function nowStr_() {
  return Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', 'yyyy-MM-dd HH:mm');
}

function checkLoginRateLimit_(identifier) {
  const cache = CacheService.getScriptCache();
  const key = 'login_' + identifier;
  const count = Number(cache.get(key) || 0);
  if (count >= 8) throw new Error('Terlalu banyak percubaan — cuba lagi selepas 5 minit.');
  cache.put(key, String(count + 1), 300);
}

function validateSession_(token) {
  if (!token) return null;
  const raw = CacheService.getScriptCache().get('sess_' + token);
  return raw ? JSON.parse(raw) : null;
}

function requireAuth_(token, roles) {
  const s = validateSession_(token);
  if (!s) throw new Error('Sesi tamat — sila log masuk semula.');
  // Semak semula status & peranan terkini dari Sheet supaya akaun yang dinyahaktif
  // atau ditukar peranan oleh admin berkuat kuasa serta-merta.
  const u = findUser_(s.email);
  if (!u || !u.aktif) {
    CacheService.getScriptCache().remove('sess_' + token);
    throw new Error('Sesi tamat — sila log masuk semula.');
  }
  s.role = u.role;
  if (roles && roles.indexOf(s.role) === -1) throw new Error('Anda tiada kebenaran untuk tindakan ini.');
  return s;
}

function sanitizeForSheet_(value) {
  const str = String(value == null ? '' : value).trim();
  return /^[=+\-@]/.test(str) ? "'" + str : str;
}

/* ===================== API: Auth ===================== */

function apiLogin(email, password) {
  email = String(email || '').toLowerCase().trim();
  checkLoginRateLimit_(email);
  const u = findUser_(email);
  if (!u || hashPassword_(String(password || ''), u.salt) !== u.hash) {
    throw new Error('Emel atau kata laluan salah.');
  }
  // Status hanya didedahkan selepas kata laluan betul
  if (u.status === 'MENUNGGU') throw new Error('Akaun anda masih menunggu kelulusan admin.');
  if (!u.aktif) throw new Error('Akaun anda tidak aktif. Sila hubungi admin.');
  CacheService.getScriptCache().remove('login_' + email);
  const token = Utilities.getUuid();
  const sess = { email: u.email, nama: u.nama, role: u.role };
  CacheService.getScriptCache().put('sess_' + token, JSON.stringify(sess), SESSION_TTL);
  return { token: token, user: sess };
}

function apiLogout(token) {
  if (token) CacheService.getScriptCache().remove('sess_' + token);
  return true;
}

function apiWhoAmI(token) {
  try { return requireAuth_(token); } catch (e) { return null; }
}

function apiChangePassword(token, oldPass, newPass) {
  const s = requireAuth_(token);
  if (String(newPass || '').length < 8) throw new Error('Kata laluan baharu mesti sekurang-kurangnya 8 aksara.');
  const u = findUser_(s.email);
  if (!u || hashPassword_(String(oldPass || ''), u.salt) !== u.hash) throw new Error('Kata laluan lama salah.');
  setPassword_(u.row, newPass);
  return true;
}

/* ===================== API: Daftar & urus pengguna ===================== */

// Daftar sendiri: akaun dicipta sebagai 'staf' berstatus MENUNGGU sehingga admin meluluskan.
function apiRegister(nama, email, password) {
  nama = String(nama || '').trim();
  email = String(email || '').toLowerCase().trim();
  password = String(password || '');
  if (nama.length < 3 || nama.length > 100) throw new Error('Sila isi nama penuh.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) throw new Error('Format emel tidak sah.');
  if (password.length < 8) throw new Error('Kata laluan mesti sekurang-kurangnya 8 aksara.');

  // Had pendaftaran: 3 cubaan / emel / jam, dan 30 pendaftaran baharu / jam keseluruhan (elak spam)
  const cache = CacheService.getScriptCache();
  const kE = 'reg_' + email, kAll = 'reg_all';
  const nE = Number(cache.get(kE) || 0), nAll = Number(cache.get(kAll) || 0);
  if (nE >= 3 || nAll >= 30) throw new Error('Terlalu banyak pendaftaran — cuba lagi kemudian.');
  cache.put(kE, String(nE + 1), 3600);
  cache.put(kAll, String(nAll + 1), 3600);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (findUser_(email)) throw new Error('Emel ini sudah didaftarkan.');
    addUser_(email, nama, 'staf', password, 'MENUNGGU');
  } finally {
    lock.releaseLock();
  }
  notifyAdminsNewRegistration_(nama, email);
  return true;
}

function apiListUsers(token) {
  requireAuth_(token, ['admin']);
  const rows = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS).getDataRange().getDisplayValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    // Jangan pulangkan Salt/Hash
    out.push({ email: rows[i][0], nama: rows[i][1], role: String(rows[i][2]).toLowerCase(),
      status: rows[i][5] || 'YA', didaftar: rows[i][6] || '' });
  }
  return out;
}

// changes: { role?: 'admin'|'staf', status?: 'YA'|'TIDAK' }
function apiUpdateUser(token, email, changes) {
  const s = requireAuth_(token, ['admin']);
  const u = findUser_(email);
  if (!u) throw new Error('Pengguna tidak dijumpai.');
  changes = changes || {};
  if (String(u.email).toLowerCase() === String(s.email).toLowerCase()) {
    throw new Error('Anda tidak boleh menukar peranan atau status akaun sendiri.');
  }
  const us = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
  if (changes.role !== undefined) {
    if (['admin', 'staf'].indexOf(changes.role) === -1) throw new Error('Peranan tidak sah.');
    us.getRange(u.row, 3).setValue(changes.role);
  }
  if (changes.status !== undefined) {
    if (['YA', 'TIDAK'].indexOf(changes.status) === -1) throw new Error('Status tidak sah.');
    us.getRange(u.row, 6).setValue(changes.status);
    if (changes.status === 'YA' && cellStr_(u.status).toUpperCase() === 'MENUNGGU') {
      const r = notifyUserApproved_(u.nama, u.email);
      return { emailed: r.ok, emailError: r.error };
    }
  }
  return true;
}

// Tolak permohonan yang masih MENUNGGU (padam baris). Akaun aktif perlu dinyahaktif, bukan dipadam.
function apiRejectUser(token, email) {
  requireAuth_(token, ['admin']);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const u = findUser_(email);
    if (!u) throw new Error('Pengguna tidak dijumpai.');
    if (u.status !== 'MENUNGGU') throw new Error('Hanya permohonan yang menunggu boleh ditolak.');
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS).deleteRow(u.row);
  } finally {
    lock.releaseLock();
  }
  return true;
}

// Admin reset kata laluan pengguna lain. Kata laluan sementara dihantar ke emel pengguna.
// Jika emel gagal (cth kuota habis), kata laluan sementara dipulangkan kepada admin
// supaya boleh disampaikan secara manual.
function apiResetPassword(token, email) {
  const s = requireAuth_(token, ['admin']);
  const u = findUser_(email);
  if (!u) throw new Error('Pengguna tidak dijumpai.');
  if (String(u.email).toLowerCase() === String(s.email).toLowerCase()) {
    throw new Error('Guna "Tukar Kata Laluan" untuk akaun sendiri.');
  }
  if (u.status === 'MENUNGGU') throw new Error('Luluskan permohonan dahulu sebelum reset kata laluan.');
  const temp = tempPassword_();
  setPassword_(u.row, temp);
  const emailed = sendMail_(String(u.email), '[myTakwimKKKua] Kata laluan anda telah di-reset',
    'Assalamualaikum dan salam sejahtera ' + cleanText_(u.nama) + ',\n\n' +
    'Admin sistem telah me-reset kata laluan akaun myTakwimKKKua anda.\n\n' +
    '  Kata laluan sementara: ' + temp + '\n\n' +
    'Sila log masuk dan tukar kata laluan segera (klik ikon pengguna di kanan atas):\n' +
    APP_URL + '\n\n' +
    'Jika anda tidak meminta reset ini, sila hubungi admin sistem.\n\n' +
    'Emel ini dijana secara automatik oleh sistem myTakwimKKKua.');
  return emailed.ok ? { emailed: true } : { emailed: false, temp: temp, emailError: emailed.error };
}

/* ===================== API: Aktiviti ===================== */

// Takwim aktiviti kolej boleh dilihat tanpa log masuk. Nama pegawai pengisi ialah
// data peribadi (PDPA), jadi ia hanya dipulangkan kepada pengguna yang log masuk.
// Tambah/kemas kini/padam memerlukan sesi yang sah.
function apiGetAll(token) {
  const loggedIn = !!validateSession_(token);
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_AKTIVITI);
  const rows = sh.getDataRange().getDisplayValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    out.push({
      id: r[0], pengisi: loggedIn ? r[1] : '', unit: r[2], nama: r[3], mula: r[4], tamat: r[5],
      perlu: r[6], kodOS: r[7], amaun: Number(r[8]) || 0, catatan: r[9], dikemaskini: r[10]
    });
  }
  return out;
}

function validateActivity_(a) {
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!a || !String(a.unit || '').trim()) throw new Error('Unit wajib diisi.');
  if (!String(a.nama || '').trim()) throw new Error('Nama program wajib diisi.');
  if (!dateRe.test(a.mula)) throw new Error('Tarikh mula tidak sah.');
  if (a.tamat && !dateRe.test(a.tamat)) throw new Error('Tarikh tamat tidak sah.');
  if (a.tamat && a.tamat < a.mula) throw new Error('Tarikh tamat tidak boleh sebelum tarikh mula.');
  const perlu = a.perlu === 'Ya' ? 'Ya' : 'Tidak';
  const amaun = perlu === 'Ya' ? Number(a.amaun) : 0;
  if (perlu === 'Ya' && !(amaun >= 0)) throw new Error('Amaun peruntukan tidak sah.');
  return [
    sanitizeForSheet_(a.pengisi).slice(0, 100),
    sanitizeForSheet_(String(a.unit).toUpperCase()).slice(0, 100),
    sanitizeForSheet_(String(a.nama).toUpperCase()).slice(0, 300),
    a.mula, a.tamat || '', perlu,
    perlu === 'Ya' ? sanitizeForSheet_(String(a.kodOS || '').toUpperCase()).slice(0, 30) : '',
    String(amaun), sanitizeForSheet_(a.catatan).slice(0, 1000)
  ];
}

function apiSave(token, a) {
  const s = requireAuth_(token, ['admin', 'staf']);
  const vals = validateActivity_(a);
  const now = Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', 'yyyy-MM-dd HH:mm');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_AKTIVITI);
    if (a.id) {
      const row = findRow_(sh, a.id);
      if (!row) throw new Error('Aktiviti tidak dijumpai.');
      sh.getRange(row, 2, 1, 11).setValues([vals.concat([now, s.email])]);
      return a.id;
    }
    const id = 'A' + Date.now().toString(36).toUpperCase();
    sh.appendRow([id].concat(vals, [now, s.email]));
    return id;
  } finally {
    lock.releaseLock();
  }
}

function apiDelete(token, id) {
  requireAuth_(token, ['admin']);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_AKTIVITI);
    const row = findRow_(sh, id);
    if (!row) throw new Error('Aktiviti tidak dijumpai.');
    sh.deleteRow(row);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function findRow_(sh, id) {
  const ids = sh.getRange(1, 1, sh.getLastRow(), 1).getDisplayValues();
  for (let i = 1; i < ids.length; i++) if (ids[i][0] === String(id)) return i + 1;
  return 0;
}

/* ===================== Notifikasi emel ===================== */
// Emel dihantar dari akaun Gmail pemilik skrip (Web App "Execute as: Me").
// Teks biasa sahaja — elak suntikan HTML. Kegagalan emel tidak menggagalkan tindakan utama.

function cleanText_(s) {
  return String(s == null ? '' : s).replace(/^'/, '').replace(/[\r\n]+/g, ' ').trim().slice(0, 100);
}

// Bersihkan nilai sel: buang apostrof pelindung, ruang kosong
function cellStr_(v) { return String(v == null ? '' : v).replace(/^'/, '').trim(); }
const EMAIL_RE_ = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

// Catat setiap cubaan emel dalam sheet LogEmel (dicipta automatik). Gagal mencatat tidak menjejaskan apa-apa.
function logEmail_(to, subject, status, error) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName(SHEET_LOGEMEL);
    if (!sh) { sh = ss.insertSheet(SHEET_LOGEMEL); sh.appendRow(['Masa', 'Penerima', 'Subjek', 'Status', 'Ralat']); sh.setFrozenRows(1); }
    sh.appendRow([nowStr_(), to, subject, status, String(error || '').slice(0, 300)]);
    if (sh.getLastRow() > 1001) sh.deleteRows(2, sh.getLastRow() - 1001); // simpan 1000 rekod terkini
  } catch (e) { console.error('Gagal catat LogEmel: ' + e); }
}

// Hantar SATU emel kepada SATU penerima. Pulangkan { ok, error }.
// (Dahulu semua admin dihantar dalam satu emel; satu alamat rosak menyebabkan semua gagal.)
function sendMail_(to, subject, body) {
  to = cellStr_(to).toLowerCase();
  let error = '';
  try {
    if (!EMAIL_RE_.test(to)) error = 'Alamat emel tidak sah: "' + to + '"';
    else if (MailApp.getRemainingDailyQuota() < 1) error = 'Kuota emel harian akaun pemilik skrip telah habis';
    else MailApp.sendEmail({ to: to, subject: subject, body: body, name: 'myTakwimKKKua' });
  } catch (err) {
    error = String(err && err.message || err);
  }
  if (error) console.error('Emel gagal ke ' + to + ': ' + error);
  logEmail_(to, subject, error ? 'GAGAL' : 'DIHANTAR', error);
  return { ok: !error, error: error };
}

function activeAdminEmails_() {
  const rows = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS).getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const email = cellStr_(rows[i][0]).toLowerCase();
    if (email && cellStr_(rows[i][2]).toLowerCase() === 'admin' && cellStr_(rows[i][5]).toUpperCase() === 'YA' && out.indexOf(email) === -1) out.push(email);
  }
  return out;
}

function notifyAdminsNewRegistration_(nama, email) {
  const admins = activeAdminEmails_();
  if (!admins.length) { logEmail_('(tiada admin aktif)', 'Pendaftaran baharu', 'GAGAL', 'Tiada admin berstatus YA dalam sheet Users'); return; }
  nama = cleanText_(nama);
  const subject = '[myTakwimKKKua] Pendaftaran baharu: ' + nama;
  const body = 'Assalamualaikum dan salam sejahtera,\n\n' +
    'Terdapat pendaftaran pengguna baharu yang menunggu kelulusan:\n\n' +
    '  Nama  : ' + nama + '\n' +
    '  Emel  : ' + cleanText_(email) + '\n' +
    '  Tarikh: ' + nowStr_() + '\n\n' +
    'Sila log masuk sebagai admin dan buka tab "Pengguna" untuk lulus atau tolak:\n' +
    APP_URL + '\n\n' +
    'Emel ini dijana secara automatik oleh sistem myTakwimKKKua.';
  admins.forEach(a => sendMail_(a, subject, body)); // seorang demi seorang
}

function notifyUserApproved_(nama, email) {
  return sendMail_(email, '[myTakwimKKKua] Akaun anda telah diluluskan',
    'Assalamualaikum dan salam sejahtera ' + cleanText_(nama) + ',\n\n' +
    'Akaun myTakwimKKKua anda telah diluluskan oleh admin. Anda kini boleh log masuk menggunakan emel dan kata laluan yang didaftarkan:\n\n' +
    APP_URL + '\n\n' +
    'Jika anda tidak membuat pendaftaran ini, sila abaikan emel ini atau hubungi admin sistem.\n\n' +
    'Emel ini dijana secara automatik oleh sistem myTakwimKKKua.');
}

/**
 * DIAGNOSTIK — jalankan dari editor Apps Script (pilih "semakEmel" > Run), kemudian lihat
 * Execution log. Ia menunjukkan akaun pengirim, baki kuota, senarai admin yang dikesan,
 * dan menghantar emel ujian ke akaun anda sendiri.
 */
function semakEmel() {
  const me = Session.getEffectiveUser().getEmail();
  Logger.log('Akaun pengirim (pemilik skrip): ' + me);
  Logger.log('Baki kuota emel hari ini: ' + MailApp.getRemainingDailyQuota());
  const rows = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS).getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (cellStr_(rows[i][2]).toLowerCase() !== 'admin') continue;
    const e = cellStr_(rows[i][0]), st = cellStr_(rows[i][5]);
    Logger.log('Admin baris ' + (i + 1) + ': "' + e + '" status="' + st + '" → ' +
      (!EMAIL_RE_.test(e) ? 'ALAMAT TIDAK SAH' : st.toUpperCase() !== 'YA' ? 'TIDAK AKTIF (tidak akan terima emel)' : 'OK'));
  }
  const r = sendMail_(me, '[myTakwimKKKua] Ujian notifikasi emel', 'Notifikasi emel myTakwimKKKua berfungsi.');
  Logger.log(r.ok ? 'Emel ujian dihantar ke ' + me + '. Semak peti masuk.' : 'Emel ujian GAGAL: ' + r.error);
}

/**
 * Jalankan SEKALI dari editor selepas kemas kini kod ini, untuk memberi kebenaran
 * menghantar emel. Ia menghantar satu emel ujian ke akaun anda sendiri.
 */
function ujiEmel() {
  const me = Session.getEffectiveUser().getEmail();
  const ok = sendMail_(me, '[myTakwimKKKua] Ujian notifikasi emel',
    'Notifikasi emel myTakwimKKKua berfungsi.\nBaki kuota emel hari ini: ' + MailApp.getRemainingDailyQuota());
  Logger.log(ok.ok ? 'Emel ujian dihantar ke ' + me : 'Emel ujian GAGAL: ' + ok.error);
}
