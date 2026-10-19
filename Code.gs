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
const AKTIVITI_HEADERS = ['ID', 'Pengisi', 'Unit', 'NamaProgram', 'TarikhMula', 'TarikhTamat',
  'PerluPeruntukan', 'KodOS', 'Amaun', 'Catatan', 'DikemasKini', 'Oleh'];
const USER_HEADERS = ['Email', 'Nama', 'Role', 'Salt', 'Hash', 'Aktif'];
const SESSION_TTL = 6 * 60 * 60; // 6 jam (had maksimum CacheService)

/* ===================== Web app ===================== */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('myTakwimKKKua')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
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
 * Tambah pengguna dari editor: ubah nilai di bawah, jalankan, kemudian
 * KOSONGKAN semula nilai kata laluan supaya tak tertinggal dalam kod.
 */
function tambahPenggunaManual() {
  const email = '';      // cth: 'staf@kkkua.edu.my'
  const nama = '';
  const role = 'admin';  // 'admin' atau 'staf'
  const password = '';
  if (!email || !password) throw new Error('Isi email & password dahulu.');
  addUser_(email, nama, role, password);
  Logger.log('Pengguna %s ditambah.', email);
}

/* ===================== Keselamatan ===================== */

function hashPassword_(password, salt) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + salt, Utilities.Charset.UTF_8);
  return raw.map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}

function addUser_(email, nama, role, password) {
  const us = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
  const salt = Utilities.getUuid();
  us.appendRow([String(email).toLowerCase().trim(), sanitizeForSheet_(nama), role, salt,
    hashPassword_(password, salt), 'YA']);
}

function findUser_(email) {
  const us = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
  const rows = us.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).toLowerCase() === email) {
      return { row: i + 1, email: rows[i][0], nama: rows[i][1], role: String(rows[i][2]).toLowerCase(),
        salt: rows[i][3], hash: rows[i][4], aktif: rows[i][5] === 'YA' };
    }
  }
  return null;
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
  if (!u || !u.aktif || hashPassword_(String(password || ''), u.salt) !== u.hash) {
    throw new Error('Emel atau kata laluan salah.');
  }
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
  return validateSession_(token);
}

function apiChangePassword(token, oldPass, newPass) {
  const s = requireAuth_(token);
  if (String(newPass || '').length < 8) throw new Error('Kata laluan baharu mesti sekurang-kurangnya 8 aksara.');
  const u = findUser_(s.email);
  if (!u || hashPassword_(String(oldPass || ''), u.salt) !== u.hash) throw new Error('Kata laluan lama salah.');
  const salt = Utilities.getUuid();
  const us = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
  us.getRange(u.row, 4, 1, 2).setValues([[salt, hashPassword_(newPass, salt)]]);
  return true;
}

/* ===================== API: Aktiviti ===================== */

// Takwim aktiviti kolej bukan data peribadi — semua staf boleh lihat tanpa log masuk.
// Tambah/kemas kini/padam memerlukan sesi yang sah.
function apiGetAll() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_AKTIVITI);
  const rows = sh.getDataRange().getDisplayValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    out.push({
      id: r[0], pengisi: r[1], unit: r[2], nama: r[3], mula: r[4], tamat: r[5],
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
