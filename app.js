// ============ KONFIGURASI ============

const APP_LOGO = 'https://storage.tally.so/private/appp.png?id=zbeEgR&accessToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InpiZUVnUiIsImZvcm1JZCI6Im1ST0w3UCIsImlhdCI6MTc3NzE4MTk2OX0.0afYtNIs5_rHdoOsV_b9pRwFnVwXrrfCgR8imvX6P90&signature=031fab914196b40453f3160202d3e2b2fa326cb4146436480cbe13f67116a145';
const NAMA_SEKOLAH = 'ESCS';
const ALAMAT_SEKOLAH = 'Kota Kupang';

// ==================== FUNGSI HELPER QR CODE ====================
function generateQRDataURL(text, size) {
  size = size || 80;
  return new Promise(function(resolve, reject) {
    try {
      var canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      
      if (typeof QRCode === 'undefined') {
        reject(new Error('QRCode library belum dimuat'));
        return;
      }
      
      QRCode.toCanvas(canvas, text, {
        width: size,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' }
      }, function(error) {
        if (error) { reject(error); }
        else { resolve(canvas.toDataURL('image/png')); }
      });
    } catch(e) { reject(e); }
  });
}

// ============ STATE MANAGEMENT ============
let currentPage = 'login';
let sessionToken = sessionStorage.getItem('sessionToken');
let userData = JSON.parse(sessionStorage.getItem('userData') || 'null');
let currentTab = 'dashboard';
let chartInstance = null;
let selectedRole = '';

// Data cache
let siswaData = [];
let waliKelasData = [];
let absensiData = [];
let kelasData = [];
let liveAbsensiInterval = null;

// Pagination state
let pagination = { currentPage: 1, pageSize: 10, searchTerm: '', data: [] };

// QR Scanner instance
let html5QrCode = null;

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', function() {
  if (typeof AOS !== 'undefined') {
    AOS.init({ duration: 800, once: true, mirror: false });
  }
  checkSession();
});

function checkSession() {
  if (sessionToken && userData) {
    if (userData.role === 'Admin') loadPage('admin');
    else if (userData.role === 'Wali Kelas') loadPage('walikelas');
    else if (userData.role === 'Siswa') loadPage('siswa');
    else loadPage('login');
  } else {
    loadPage('login');
  }
}

// ============ PAGE LOADER ============
function loadPage(page) {
  currentPage = page;
  const app = document.getElementById('app');
  if (!app) return;
  
  app.style.opacity = '0';
  app.style.transition = 'opacity 0.3s ease';
  
  setTimeout(() => {
    try {
      switch(page) {
        case 'login': renderLogin(app); break;
        case 'admin': renderAdmin(app); break;
        case 'walikelas': renderWaliKelas(app); break;
        case 'siswa': renderSiswa(app); break;
        default: renderLogin(app);
      }
    } catch (error) {
      console.error('Error rendering:', error);
      app.innerHTML = '<div class="auth-container"><div class="auth-card"><h3>Error</h3><p>' + error.message + '</p><button class="btn btn-primary" onclick="loadPage(\'login\')">Kembali</button></div></div>';
    }
    
    app.style.opacity = '1';
    
    if (typeof AOS !== 'undefined') setTimeout(() => AOS.refresh(), 100);
  }, 300);
}

// ============ API CALL ============
async function callApi(action, params = {}) {
  try {
    if (!sessionToken && action !== 'doLogin') {
      Swal.fire({ icon: 'warning', title: 'Session Habis', text: 'Silakan login ulang' });
      loadPage('login');
      return { success: false };
    }

    const formData = new FormData();
    formData.append('action', action);
    formData.append('data', JSON.stringify(params));

    const response = await fetch(APPS_SCRIPT_URL, {
  method: 'POST',
  body: formData,
  cache: 'no-store'
});

    const result = await response.json();

    if (!result.success && result.message?.toLowerCase().includes('login')) {
      sessionStorage.clear();
      sessionToken = null;
      userData = null;
      Swal.fire('Session Habis', 'Silakan login ulang', 'warning');
      loadPage('login');
    }

    return result;
  } catch (error) {
    console.error('API Error:', error);
    Swal.fire('Error', 'Tidak bisa konek ke server', 'error');
    return { success: false };
  }
}

// ============ AUTH FUNCTIONS ============
function selectRole(role) {
  selectedRole = role;
  document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('active'));
  const btn = document.querySelector('.role-btn[data-role="' + role + '"]');
  if (btn) btn.classList.add('active');
  
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  if (!emailInput || !passwordInput) return;
  
  if (role === 'Siswa') {
    emailInput.placeholder = 'Masukkan No ID Siswa';
    emailInput.previousElementSibling.innerHTML = '<i class="bi bi-person-badge"></i> No ID';
  } else if (role === 'Wali Kelas') {
    emailInput.placeholder = 'Masukkan Username';
    emailInput.previousElementSibling.innerHTML = '<i class="bi bi-person-workspace"></i> Username';
  } else {
    emailInput.placeholder = 'Masukkan Username';
    emailInput.previousElementSibling.innerHTML = '<i class="bi bi-person-fill"></i> Username';
  }
}

async function doLogin() {
  const email = document.getElementById('email')?.value?.trim();
  const password = document.getElementById('password')?.value?.trim();
  const loginBtn = document.getElementById('loginBtn');
  
  if (!selectedRole) {
    Swal.fire({ icon: 'warning', title: 'Pilih Role', text: 'Silakan pilih role terlebih dahulu', confirmButtonColor: '#4A90E2' });
    return;
  }
  
  if (!email || !password) {
    Swal.fire({ icon: 'warning', title: 'Lengkapi Form', text: 'Username/No ID dan Password harus diisi', confirmButtonColor: '#4A90E2' });
    return;
  }
  
  if (loginBtn) {
    loginBtn.innerHTML = '<span class="loading-spinner" style="width:20px;height:20px;border-width:3px;display:inline-block;"></span> Memproses...';
    loginBtn.disabled = true;
  }
  
  const response = await callApi('doLogin', { email, password, role: selectedRole });
  
  if (loginBtn) {
    loginBtn.innerHTML = '<i class="bi bi-box-arrow-in-right"></i> Login';
    loginBtn.disabled = false;
  }
  
  if (response.success) {
    Swal.fire({ icon: 'success', title: 'Berhasil!', text: 'Login berhasil!', timer: 1500, showConfirmButton: false });
    
    sessionStorage.setItem('sessionToken', response.token);
    sessionStorage.setItem('userData', JSON.stringify(response.userData));
    sessionToken = response.token;
    userData = response.userData;
    
    setTimeout(() => {
      if (response.userData.role === 'Admin') loadPage('admin');
      else if (response.userData.role === 'Wali Kelas') loadPage('walikelas');
      else if (response.userData.role === 'Siswa') loadPage('siswa');
    }, 1500);
  } else {
    Swal.fire({ icon: 'error', title: 'Login Gagal', text: response.message, confirmButtonColor: '#4A90E2' });
  }
}

async function logout() {
  const result = await Swal.fire({
    title: 'Yakin logout?',
    text: 'Anda akan keluar dari sistem',
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#4A90E2',
    cancelButtonColor: '#FF6B6B',
    confirmButtonText: 'Ya, Logout',
    cancelButtonText: 'Batal'
  });
  
  if (result.isConfirmed) {
    await callApi('doLogout', { token: sessionToken });
    sessionStorage.clear();
    sessionToken = null;
    userData = null;
    
    if (liveAbsensiInterval) clearInterval(liveAbsensiInterval);
    if (html5QrCode) {
      html5QrCode.stop().catch(() => {});
      html5QrCode = null;
    }
    
    Swal.fire({ icon: 'success', title: 'Berhasil Logout!', timer: 1500, showConfirmButton: false });
    loadPage('login');
  }
}

// ============ RENDER LOGIN ============
function renderLogin(container) {
  selectedRole = '';
  container.innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-header">
          <img src="${APP_LOGO}" alt="Logo" onerror="this.src='https://cdn-icons-png.flaticon.com/512/2997/2997912.png';">
          <h2>Sistem Absensi Siswa</h2>
          <p>Silakan login untuk melanjutkan</p>
        </div>
        
        <div class="role-selector">
          <button class="role-btn" data-role="Admin" onclick="selectRole('Admin')">
            <i class="bi bi-shield-lock"></i> Admin
          </button>
          <button class="role-btn" data-role="Wali Kelas" onclick="selectRole('Wali Kelas')">
            <i class="bi bi-person-workspace"></i> Supervisor
          </button>
          <button class="role-btn" data-role="Siswa" onclick="selectRole('Siswa')">
            <i class="bi bi-mortarboard"></i> Student
          </button>
        </div>
        
        <form id="loginForm" onsubmit="event.preventDefault(); doLogin();">
          <div class="form-group">
            <label class="form-label"><i class="bi bi-person-fill"></i> Username / No ID</label>
            <input type="text" class="form-control" id="email" placeholder="Masukkan username atau No ID" required>
          </div>
          
          <div class="form-group">
            <label class="form-label"><i class="bi bi-lock-fill"></i> Password</label>
            <input type="password" class="form-control" id="password" placeholder="Masukkan password" required>
          </div>
          
          <button type="submit" class="btn btn-primary btn-block" id="loginBtn" style="margin-top:10px;">
            <i class="bi bi-box-arrow-in-right"></i> Login
          </button>
        </form>
      </div>
    </div>
  `;
}

// ============ RENDER ADMIN ============
function renderAdmin(container) {
  const namaUser = userData?.nama || 'Administrator';
  
  container.innerHTML = `
    <div class="dashboard-container">
      <div class="sidebar">
        <div class="sidebar-header">
          <img src="${APP_LOGO}" alt="Logo" onerror="this.src='https://cdn-icons-png.flaticon.com/512/2997/2997912.png';">
          <h5>${namaUser}<br><small>Administrator</small></h5>
        </div>
        
        <ul class="sidebar-menu">
          <li><a href="#" class="active" onclick="showTabAdmin('dashboard'); return false;"><i class="bi bi-speedometer2"></i> Dashboard</a></li>
          <li><a href="#" onclick="showTabAdmin('scanqr'); return false;"><i class="bi bi-qr-code-scan"></i> Scan QR</a></li>
          <li><a href="#" onclick="showTabAdmin('inputmanual'); return false;"><i class="bi bi-pencil-square"></i> Input Manual</a></li>
          <li><a href="#" onclick="showTabAdmin('walikelas'); return false;"><i class="bi bi-person-workspace"></i> Data Wali Kelas</a></li>
          <li><a href="#" onclick="showTabAdmin('siswa'); return false;"><i class="bi bi-people-fill"></i> Data Siswa</a></li>
          <li><a href="#" onclick="showTabAdmin('cetakqr'); return false;"><i class="bi bi-printer"></i> Cetak QR Code</a></li>
          <li><a href="#" onclick="showTabAdmin('rekap'); return false;"><i class="bi bi-file-bar-graph"></i> Rekap Absensi</a></li>
          <li><a href="#" onclick="showTabAdmin('pengaturan'); return false;"><i class="bi bi-gear"></i> Pengaturan</a></li>
          <li><a href="#" onclick="showTabAdmin('gantipassword'); return false;"><i class="bi bi-key"></i> Ganti Password</a></li>
        </ul>
      </div>
      
      <div class="main-content" id="mainAdminContent">
      </div>
      
      <div class="bottom-nav">
        <ul class="bottom-nav-menu" id="bottomNavAdmin">
          <li><a href="#" class="active" onclick="showTabMobileAdmin('dashboard'); return false;"><i class="bi bi-speedometer2"></i><span>Dashboard</span></a></li>
          <li><a href="#" onclick="showTabMobileAdmin('scanqr'); return false;"><i class="bi bi-qr-code-scan"></i><span>Scan</span></a></li>
          <li><a href="#" onclick="showTabMobileAdmin('inputmanual'); return false;"><i class="bi bi-pencil"></i><span>Input</span></a></li>
          <li><a href="#" onclick="showTabMobileAdmin('walikelas'); return false;"><i class="bi bi-person-workspace"></i><span>Wali</span></a></li>
          <li><a href="#" onclick="showTabMobileAdmin('siswa'); return false;"><i class="bi bi-people"></i><span>Siswa</span></a></li>
          <li><a href="#" onclick="showTabMobileAdmin('cetakqr'); return false;"><i class="bi bi-printer"></i><span>Cetak</span></a></li>
          <li><a href="#" onclick="showTabMobileAdmin('rekap'); return false;"><i class="bi bi-file-bar-graph"></i><span>Rekap</span></a></li>
          <li><a href="#" onclick="showTabMobileAdmin('pengaturan'); return false;"><i class="bi bi-gear"></i><span>Setting</span></a></li>
        </ul>
      </div>
    </div>
  `;

  setTimeout(() => {
    showTabAdmin('dashboard');
  }, 100);
}

// ============ ADMIN TABS ============
function showTabAdmin(tab) {
  if (event) event.preventDefault();
  
  document.querySelectorAll('.sidebar-menu a').forEach(link => link.classList.remove('active'));
  document.querySelectorAll('.bottom-nav-menu a').forEach(link => link.classList.remove('active'));
  
  const sidebarLink = document.querySelector('.sidebar-menu a[onclick*="' + tab + '"]');
  if (sidebarLink) sidebarLink.classList.add('active');
  
  const navLink = document.querySelector('#bottomNavAdmin a[onclick*="' + tab + '"]');
  if (navLink) navLink.classList.add('active');
  
  currentTab = tab;
  const mainContent = document.getElementById('mainAdminContent');
  if (!mainContent) return;
  
  if (liveAbsensiInterval) { clearInterval(liveAbsensiInterval); liveAbsensiInterval = null; }
  if (html5QrCode) { html5QrCode.stop().catch(() => {}); html5QrCode = null; }
  
  const titles = {
    'dashboard': 'Dashboard Admin',
    'scanqr': 'Scan QR Code',
    'inputmanual': 'Input Absensi Manual',
    'walikelas': 'Data Wali Kelas',
    'siswa': 'Data Siswa',
    'cetakqr': 'Cetak QR Code Siswa',
    'rekap': 'Rekap Absensi',
    'pengaturan': 'Pengaturan Sistem',
    'gantipassword': 'Ganti Password'
  };
  
  mainContent.innerHTML = `
    <div class="header-bar">
      <h4>${titles[tab] || 'Dashboard'}</h4>
      <div class="header-actions">
        <button class="btn btn-sm btn-info" onclick="toggleFullScreen()" title="Fullscreen"><i class="bi bi-arrows-fullscreen"></i></button>
        <button class="btn btn-sm btn-logout" onclick="logout()"><i class="bi bi-box-arrow-right"></i> Logout</button>
      </div>
    </div>
    <div id="tabContentArea" class="tab-content"></div>
  `;
  
  const contentArea = document.getElementById('tabContentArea');
  if (!contentArea) return;
  
  switch(tab) {
    case 'dashboard': renderDashboardAdmin(contentArea); break;
    case 'scanqr': renderScanQR(contentArea); break;
    case 'inputmanual': renderInputManual(contentArea); break;
    case 'walikelas': renderWaliKelasTab(contentArea); break;
    case 'siswa': renderSiswaTab(contentArea); break;
    case 'cetakqr': renderCetakQR(contentArea); break;
    case 'rekap': renderRekapAbsensi(contentArea); break;
    case 'pengaturan': renderPengaturan(contentArea); break;
    case 'gantipassword': renderGantiPassword(contentArea); break;
  }
}

function showTabMobileAdmin(tab) {
  showTabAdmin(tab);
}

// ============ RENDER WALI KELAS ============
function renderWaliKelas(container) {
  const namaUser = userData?.nama || 'Wali Kelas';
  
  container.innerHTML = `
    <div class="dashboard-container">
      <div class="sidebar">
        <div class="sidebar-header">
          <img src="${APP_LOGO}" alt="Logo" onerror="this.src='https://cdn-icons-png.flaticon.com/512/2997/2997912.png';">
          <h5>${namaUser}<br><small>Wali Kelas - ${userData?.kelas || ''}</small></h5>
        </div>
        
        <ul class="sidebar-menu">
          <li><a href="#" class="active" onclick="showTabWK('dashboard'); return false;"><i class="bi bi-speedometer2"></i> Dashboard</a></li>
          <li><a href="#" onclick="showTabWK('scanqr'); return false;"><i class="bi bi-qr-code-scan"></i> Scan QR</a></li>
          <li><a href="#" onclick="showTabWK('inputmanual'); return false;"><i class="bi bi-pencil-square"></i> Input Manual</a></li>
          <li><a href="#" onclick="showTabWK('siswa'); return false;"><i class="bi bi-people-fill"></i> Data Siswa</a></li>
          <li><a href="#" onclick="showTabWK('cetakqr'); return false;"><i class="bi bi-printer"></i> Cetak QR</a></li>
          <li><a href="#" onclick="showTabWK('rekap'); return false;"><i class="bi bi-file-bar-graph"></i> Rekap Absensi</a></li>
          <li><a href="#" onclick="showTabWK('gantipassword'); return false;"><i class="bi bi-key"></i> Ganti Password</a></li>
        </ul>
      </div>
      
      <div class="main-content" id="mainWKContent">
      </div>
      
      <div class="bottom-nav">
        <ul class="bottom-nav-menu" id="bottomNavWK">
          <li><a href="#" class="active" onclick="showTabMobileWK('dashboard'); return false;"><i class="bi bi-speedometer2"></i><span>Dashboard</span></a></li>
          <li><a href="#" onclick="showTabMobileWK('scanqr'); return false;"><i class="bi bi-qr-code-scan"></i><span>Scan</span></a></li>
          <li><a href="#" onclick="showTabMobileWK('inputmanual'); return false;"><i class="bi bi-pencil"></i><span>Input</span></a></li>
          <li><a href="#" onclick="showTabMobileWK('siswa'); return false;"><i class="bi bi-people"></i><span>Siswa</span></a></li>
          <li><a href="#" onclick="showTabMobileWK('cetakqr'); return false;"><i class="bi bi-printer"></i><span>Cetak</span></a></li>
          <li><a href="#" onclick="showTabMobileWK('rekap'); return false;"><i class="bi bi-file-bar-graph"></i><span>Rekap</span></a></li>
        </ul>
      </div>
    </div>
  `;

  setTimeout(() => {
    showTabWK('dashboard');
  }, 100);
}

function showTabWK(tab) {
  if (event) event.preventDefault();
  
  document.querySelectorAll('.sidebar-menu a').forEach(link => link.classList.remove('active'));
  document.querySelectorAll('.bottom-nav-menu a').forEach(link => link.classList.remove('active'));
  
  const sidebarLink = document.querySelector('.sidebar-menu a[onclick*="' + tab + '"]');
  if (sidebarLink) sidebarLink.classList.add('active');
  
  const navLink = document.querySelector('#bottomNavWK a[onclick*="' + tab + '"]');
  if (navLink) navLink.classList.add('active');
  
  currentTab = tab;
  const mainContent = document.getElementById('mainWKContent');
  if (!mainContent) return;
  
  if (liveAbsensiInterval) { clearInterval(liveAbsensiInterval); liveAbsensiInterval = null; }
  if (html5QrCode) { html5QrCode.stop().catch(() => {}); html5QrCode = null; }
  
  const titles = {
    'dashboard': 'Dashboard Wali Kelas',
    'scanqr': 'Scan QR Code',
    'inputmanual': 'Input Absensi Manual',
    'siswa': 'Data Siswa Kelas',
    'cetakqr': 'Cetak QR Code',
    'rekap': 'Rekap Absensi',
    'gantipassword': 'Ganti Password'
  };
  
  mainContent.innerHTML = `
    <div class="header-bar">
      <h4>${titles[tab] || 'Dashboard'}</h4>
      <div class="header-actions">
        <button class="btn btn-sm btn-info" onclick="toggleFullScreen()"><i class="bi bi-arrows-fullscreen"></i></button>
        <button class="btn btn-sm btn-logout" onclick="logout()"><i class="bi bi-box-arrow-right"></i> Logout</button>
      </div>
    </div>
    <div id="tabContentArea" class="tab-content"></div>
  `;
  
  const contentArea = document.getElementById('tabContentArea');
  if (!contentArea) return;
  
  const kelas = userData?.kelas || '';
  
  switch(tab) {
    case 'dashboard': renderDashboardWK(contentArea, kelas); break;
    case 'scanqr': renderScanQR(contentArea); break;
    case 'inputmanual': renderInputManual(contentArea, kelas); break;
    case 'siswa': renderSiswaTabReadOnly(contentArea, kelas); break;
    case 'cetakqr': renderCetakQR(contentArea, kelas); break;
    case 'rekap': renderRekapAbsensi(contentArea, kelas); break;
    case 'gantipassword': renderGantiPassword(contentArea); break;
  }
}

function showTabMobileWK(tab) {
  showTabWK(tab);
}

// ============ RENDER SISWA ============
function renderSiswa(container) {
  const namaUser = userData?.nama || 'Siswa';
  
  container.innerHTML = `
    <div class="dashboard-container">
      <div class="sidebar">
        <div class="sidebar-header">
          <img src="${APP_LOGO}" alt="Logo" onerror="this.src='https://cdn-icons-png.flaticon.com/512/2997/2997912.png';">
          <h5>${namaUser}<br><small>Siswa - ${userData?.kelas || ''}</small></h5>
        </div>
        
        <ul class="sidebar-menu">
          <li><a href="#" class="active" onclick="showTabSiswa('dashboard'); return false;"><i class="bi bi-speedometer2"></i> Dashboard</a></li>
         
          
        </ul>
      </div>
      
      <div class="main-content" id="mainSiswaContent">
      </div>
      
      <div class="bottom-nav">
        <ul class="bottom-nav-menu">
          <li><a href="#" class="active" onclick="showTabMobileSiswa('dashboard'); return false;"><i class="bi bi-speedometer2"></i><span>Dashboard</span></a></li>
          
        </ul>
      </div>
    </div>
  `;

  setTimeout(() => {
    showTabSiswa('dashboard');
  }, 100);
}

function showTabSiswa(tab) {
  if (event) event.preventDefault();
  
  document.querySelectorAll('.sidebar-menu a').forEach(link => link.classList.remove('active'));
  document.querySelectorAll('.bottom-nav-menu a').forEach(link => link.classList.remove('active'));
  
  const sidebarLink = document.querySelector('.sidebar-menu a[onclick*="' + tab + '"]');
  if (sidebarLink) sidebarLink.classList.add('active');
  
  const mainContent = document.getElementById('mainSiswaContent');
  if (!mainContent) return;
  
  const titles = {
    'dashboard': 'Dashboard Siswa',
    'cetakqr': 'Cetak QR Code Saya',
    'gantipassword': 'Ganti Password'
  };
  
  mainContent.innerHTML = `
    <div class="header-bar">
      <h4>${titles[tab] || 'Dashboard'}</h4>
      <div class="header-actions">
        <button class="btn btn-sm btn-logout" onclick="logout()"><i class="bi bi-box-arrow-right"></i> Logout</button>
      </div>
    </div>
    <div id="tabContentArea" class="tab-content"></div>
  `;
  
  const contentArea = document.getElementById('tabContentArea');
  if (!contentArea) return;
  
  switch(tab) {
    case 'dashboard': renderDashboardSiswa(contentArea); break;
    case 'cetakqr': renderCetakQRSiswa(contentArea); break;
   case 'gantipassword': renderGantiPassword(contentArea); break;
  }
}

function showTabMobileSiswa(tab) {
  showTabSiswa(tab);
}

// ============ DASHBOARD ADMIN CONTENT ============
async function renderDashboardAdmin(container) {
  container.innerHTML = '<div style="text-align:center;padding:40px;"><div class="loading-spinner" style="margin:auto;"></div><p style="margin-top:15px;">Memuat dashboard...</p></div>';
  
  const [response, live] = await Promise.all([
  callApi('getDashboardAdmin', { token: sessionToken }),
  callApi('getLiveAbsensi', { token: sessionToken })
]);
  
  if (!response.success) {
    container.innerHTML = '<p class="text-center text-danger">Gagal memuat: ' + response.message + '</p>';
    return;
  }
  
  container.innerHTML = `
    <h5><i class="bi bi-bar-chart"></i> Rekap Data Sekolah</h5>
    
    <div class="stats-row">
      <div class="stats-card">
        <div class="icon"><i class="bi bi-people-fill"></i></div>
        <div class="value">${response.totalSiswa}</div>
        <div class="label">Total Siswa</div>
      </div>
      <div class="stats-card green">
        <div class="icon"><i class="bi bi-door-open"></i></div>
        <div class="value">${response.totalKelas}</div>
        <div class="label">Total Kelas</div>
      </div>
      <div class="stats-card blue">
        <div class="icon"><i class="bi bi-gender-male"></i></div>
        <div class="value">${response.totalLaki}</div>
        <div class="label">Laki-laki</div>
      </div>
      <div class="stats-card purple">
        <div class="icon"><i class="bi bi-gender-female"></i></div>
        <div class="value">${response.totalPerempuan}</div>
        <div class="label">Perempuan</div>
      </div>
    </div>
    
    <div class="stats-row" style="grid-template-columns: 1fr 1fr;">
      <div>
        <h6 style="margin-bottom:15px;"><i class="bi bi-bar-chart-line"></i> Grafik Siswa per Kelas</h6>
        <div class="chart-container" style="height:300px;">
          <canvas id="chartSiswaPerKelas"></canvas>
        </div>
      </div>
      <div>
        <h6 style="margin-bottom:15px;"><i class="bi bi-broadcast"></i> Live Absensi Hari Ini</h6>
        <div class="live-absensi" id="liveAbsensiContainer">
          ${response.liveAbsensi.length === 0 ? '<p class="text-center text-muted" style="padding:20px;">Belum ada absensi hari ini</p>' : ''}
        </div>
      </div>
    </div>
  `;
  
  setTimeout(() => {
    const canvas = document.getElementById('chartSiswaPerKelas');
    if (canvas) {
      if (chartInstance) chartInstance.destroy();
      const ctx = canvas.getContext('2d');
      chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: response.chartLabels || [],
          datasets: [{
            label: 'Jumlah Siswa',
            data: response.chartData || [],
            backgroundColor: 'rgba(74,144,226,0.7)',
            borderColor: '#4A90E2',
            borderWidth: 2,
            borderRadius: 10
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1 } }
          }
        }
      });
    }
  }, 300);
  
  renderLiveAbsensi(response.liveAbsensi);
  
  if (liveAbsensiInterval) clearInterval(liveAbsensiInterval);
  liveAbsensiInterval = setInterval(async () => {
    const res = await callApi('getLiveAbsensi', { token: sessionToken });
    if (res.success) {
      renderLiveAbsensi(res.liveAbsensi);
    }
  }, 15000);
}

function renderLiveAbsensi(data) {
  const container = document.getElementById('liveAbsensiContainer');
  if (!container) return;
  
  if (!data || data.length === 0) {
    container.innerHTML = '<p class="text-center text-muted" style="padding:20px;">Belum ada absensi hari ini</p>';
    return;
  }
  
  container.innerHTML = data.map(item => `
    <div class="live-absensi-item">
      <div class="avatar">${(item.nama || '?').charAt(0).toUpperCase()}</div>
      <div class="info">
        <div class="name">${item.nama || '-'}</div>
        <div class="kelas">${item.kelas || '-'}</div>
      </div>
      <div class="time">
        <div class="jam">${item.jamMasuk || '-'}</div>
        <div class="ket">
          <span class="badge ${item.keterangan === 'Terlambat' ? 'badge-danger' : 'badge-success'}">${item.keterangan || '-'}</span>
        </div>
      </div>
    </div>
  `).join('');
}

// ============ DASHBOARD WALI KELAS ============
async function renderDashboardWK(container, kelas) {
  container.innerHTML = '<div style="text-align:center;padding:40px;"><div class="loading-spinner" style="margin:auto;"></div><p style="margin-top:15px;">Memuat dashboard...</p></div>';
  
  const response = await callApi('getDashboardWaliKelas', { token: sessionToken });
  
  console.log('Dashboard WK Response:', response); // Debug log
  
  if (!response.success) {
    container.innerHTML = '<p class="text-center text-danger">Gagal memuat: ' + response.message + '</p>';
    return;
  }
  
  container.innerHTML = `
    <h5><i class="bi bi-bar-chart"></i> Rekap Kelas ${kelas}</h5>
    
    <div class="stats-row">
      <div class="stats-card">
        <div class="icon"><i class="bi bi-people-fill"></i></div>
        <div class="value">${response.totalSiswa || 0}</div>
        <div class="label">Total Siswa</div>
      </div>
      <div class="stats-card orange">
        <div class="icon"><i class="bi bi-clock-history"></i></div>
        <div class="value">${response.terlambat || 0}</div>
        <div class="label">Terlambat Hari Ini</div>
      </div>
      <div class="stats-card green">
        <div class="icon"><i class="bi bi-check-circle"></i></div>
        <div class="value">${response.tepatWaktu || 0}</div>
        <div class="label">Tepat Waktu Hari Ini</div>
      </div>
    </div>
    
    <h6 style="margin-bottom:15px;"><i class="bi bi-broadcast"></i> Live Absensi Hari Ini</h6>
    <div class="live-absensi" id="liveAbsensiContainerWK">
      ${!response.liveAbsensi || response.liveAbsensi.length === 0 ? '<p class="text-center text-muted" style="padding:20px;">Belum ada absensi</p>' : ''}
    </div>
  `;
  
  renderLiveAbsensiWK(response.liveAbsensi || []);
  
  if (liveAbsensiInterval) clearInterval(liveAbsensiInterval);
  liveAbsensiInterval = setInterval(async () => {
    const res = await callApi('getLiveAbsensi', { token: sessionToken, kelas: kelas });
    if (res.success) renderLiveAbsensiWK(res.liveAbsensi);
  }, 15000);
}

function renderLiveAbsensiWK(data) {
  const container = document.getElementById('liveAbsensiContainerWK');
  if (!container) return;
  
  if (!data || data.length === 0) {
    container.innerHTML = '<p class="text-center text-muted" style="padding:20px;">Belum ada absensi</p>';
    return;
  }
  
  container.innerHTML = data.map(item => `
    <div class="live-absensi-item">
      <div class="avatar">${(item.nama || '?').charAt(0)}</div>
      <div class="info">
        <div class="name">${item.nama}</div>
        <div class="kelas">${item.kelas}</div>
      </div>
      <div class="time">
        <div class="jam">${item.jamMasuk || '-'}</div>
        <div class="ket">
          <span class="badge ${item.keterangan === 'Terlambat' ? 'badge-danger' : 'badge-success'}">${item.keterangan || '-'}</span>
        </div>
      </div>
    </div>
  `).join('');
}

// ============ DASHBOARD SISWA ============
async function renderDashboardSiswa(container) {
  container.innerHTML = '<div style="text-align:center;padding:40px;"><div class="loading-spinner" style="margin:auto;"></div></div>';
  
  const response = await callApi('getDashboardSiswa', { token: sessionToken });
  
  if (!response.success) {
    container.innerHTML = '<p class="text-center text-danger">Gagal memuat: ' + response.message + '</p>';
    return;
  }
  
  container.innerHTML = `
    <h5><i class="bi bi-person-badge"></i> Dashboard Saya</h5>
    
    <div class="stats-row">
      <div class="stats-card orange">
        <div class="icon"><i class="bi bi-clock-history"></i></div>
        <div class="value">${response.terlambatBulanIni}</div>
        <div class="label">Terlambat Bulan Ini</div>
      </div>
      <div class="stats-card green">
        <div class="icon"><i class="bi bi-check-circle"></i></div>
        <div class="value">${response.tepatWaktuBulanIni}</div>
        <div class="label">Tepat Waktu Bulan Ini</div>
      </div>
    </div>
    
    <h6 style="margin-bottom:15px;"><i class="bi bi-clock-history"></i> Riwayat Absensi</h6>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Jam Masuk</th>
            <th>Jam Pulang</th>
            <th>Status</th>
            <th>Keterangan</th>
          </tr>
        </thead>
        <tbody>
          ${response.riwayat.length === 0 ? '<tr><td colspan="5" class="text-center">Belum ada riwayat</td></tr>' : 
            response.riwayat.slice(0, 30).map(r => `
              <tr>
                <td>${r.tanggal}</td>
                <td>${r.jamMasuk || '-'}</td>
                <td>${r.jamPulang || '-'}</td>
                <td><span class="badge ${r.status === 'Hadir' ? 'badge-success' : r.status === 'Alpa' ? 'badge-danger' : 'badge-warning'}">${r.status}</span></td>
                <td><span class="badge ${r.keterangan === 'Terlambat' ? 'badge-danger' : 'badge-success'}">${r.keterangan || '-'}</span></td>
              </tr>
            `).join('')
          }
        </tbody>
      </table>
    </div>
  `;
}

// ============ SCAN QR ============
function renderScanQR(container) {
  container.innerHTML = `
    <h5><i class="bi bi-qr-code-scan"></i> Scan QR Code Siswa</h5>
    
    <div class="scanner-container">
      <div id="qr-reader" style="width:100%;"></div>
      <div id="scanResult" class="scan-result">
        <div class="icon" id="scanIcon"></div>
        <div class="name" id="scanName"></div>
        <div class="detail" id="scanDetail"></div>
      </div>
      <div style="text-align:center;margin-top:15px;">
        <button class="btn btn-warning" onclick="restartScanner()"><i class="bi bi-arrow-repeat"></i> Scan Ulang</button>
      </div>
    </div>
  `;
  
  setTimeout(() => initScanner(), 400);
}

function initScanner() {
  const readerElement = document.getElementById('qr-reader');
  if (!readerElement) return;
  
  if (html5QrCode) {
    html5QrCode.stop().catch(() => {});
    html5QrCode = null;
  }
  
  html5QrCode = new Html5Qrcode('qr-reader');
  
  html5QrCode.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    async (decodedText) => {
      html5QrCode.pause();
      
      const response = await callApi('scanQR', { token: sessionToken, qrData: decodedText });
      
      const resultDiv = document.getElementById('scanResult');
      if (!resultDiv) return;
      
      if (response.success) {
        resultDiv.className = 'scan-result success';
        document.getElementById('scanIcon').innerHTML = '<i class="bi bi-check-circle-fill" style="color:#27AE60;font-size:3rem;"></i>';
        document.getElementById('scanName').textContent = response.data?.nama || 'Berhasil';
        document.getElementById('scanDetail').textContent = response.message;
        
        Swal.fire({
          icon: 'success',
          title: response.type === 'masuk' ? 'Absen Masuk!' : 'Absen Pulang!',
          text: response.message,
          timer: 2000,
          showConfirmButton: false
        });
        
        setTimeout(() => {
          if (html5QrCode) html5QrCode.resume();
          resultDiv.className = 'scan-result';
        }, 2500);
      } else {
        resultDiv.className = 'scan-result error';
        document.getElementById('scanIcon').innerHTML = '<i class="bi bi-x-circle-fill" style="color:#FF6B6B;font-size:3rem;"></i>';
        document.getElementById('scanName').textContent = 'Gagal';
        document.getElementById('scanDetail').textContent = response.message;
        
        setTimeout(() => {
          if (html5QrCode) html5QrCode.resume();
          resultDiv.className = 'scan-result';
        }, 2000);
      }
    },
    (errorMessage) => {
      // Scanning in progress
    }
  ).catch(err => {
    console.error('Scanner error:', err);
    Swal.fire('Error', 'Tidak bisa mengakses kamera', 'error');
  });
}

function restartScanner() {
  if (html5QrCode) {
    html5QrCode.stop().then(() => {
      html5QrCode = null;
      initScanner();
    }).catch(() => {
      html5QrCode = null;
      initScanner();
    });
  } else {
    initScanner();
  }
}

// ============ INPUT MANUAL ============
async function renderInputManual(container, defaultKelas) {
  defaultKelas = defaultKelas || '';
  
  const response = await callApi('getSiswa', { token: sessionToken });
  siswaData = response.success ? (response.siswa || []) : [];
  
  container.innerHTML = `
    <h5><i class="bi bi-pencil-square"></i> Input Absensi Manual</h5>
    
    <form id="inputManualForm" onsubmit="event.preventDefault(); submitInputManual('${defaultKelas}');">
      <div class="stats-row" style="grid-template-columns:1fr 1fr 1fr;">
        <div class="form-group" style="position:relative;">
          <label class="form-label">Cari Nama Siswa</label>
          <input type="text" class="form-control" id="searchNamaManual" 
                 placeholder="Ketik nama siswa..." 
                 onkeyup="searchSiswaManual()" 
                 autocomplete="off">
          <div id="searchResults" style="position:absolute;background:white;border:1px solid #ddd;
                      border-radius:10px;max-height:220px;overflow-y:auto;z-index:100;width:100%;
                      display:none;box-shadow:0 10px 30px rgba(0,0,0,0.15);"></div>
        </div>
        <div class="form-group">
          <label class="form-label">Kelas</label>
          <input type="text" class="form-control" id="kelasManual" readonly value="${defaultKelas}">
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-control" id="statusManual" required>
            <option value="Hadir">Hadir</option>
            <option value="Sakit">Sakit</option>
            <option value="Izin">Izin</option>
            <option value="Alpa">Alpa</option>
            <option value="Libur">Libur</option>
          </select>
        </div>
      </div>
      <input type="hidden" id="noIdManual">
      
      <button type="submit" class="btn btn-primary"><i class="bi bi-save"></i> Simpan Absensi</button>
      <button type="button" class="btn btn-warning" onclick="resetInputManual()"><i class="bi bi-arrow-counterclockwise"></i> Reset</button>
    </form>
    
    <div class="table-container mt-4">
      <h6 style="margin-bottom:10px;"><i class="bi bi-list-check"></i> Absensi Terbaru Hari Ini</h6>
      <table>
        <thead><tr><th>Nama</th><th>Kelas</th><th>Jam</th><th>Status</th><th>Ket</th></tr></thead>
        <tbody id="absensiTerbaru"><tr><td colspan="5" class="text-center">Memuat...</td></tr></tbody>
      </table>
    </div>
  `;
  
  loadAbsensiTerbaru();
}

async function loadAbsensiTerbaru() {
  const response = await callApi('getLiveAbsensi', { token: sessionToken });
  const tbody = document.getElementById('absensiTerbaru');
  if (!tbody) return;
  
  if (response.success && response.liveAbsensi && response.liveAbsensi.length > 0) {
    tbody.innerHTML = response.liveAbsensi.map(a => `
      <tr>
        <td>${a.nama || '-'}</td>
        <td>${a.kelas || '-'}</td>
        <td>${a.jamMasuk || '-'}</td>
        <td><span class="badge ${a.status === 'Hadir' ? 'badge-success' : a.status === 'Alpa' ? 'badge-danger' : 'badge-warning'}">${a.status || '-'}</span></td>
        <td><span class="badge ${a.keterangan === 'Terlambat' ? 'badge-danger' : a.keterangan === 'Libur' ? 'badge-info' : 'badge-success'}">${a.keterangan || '-'}</span></td>
      </tr>
    `).join('');
  } else {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Belum ada absensi hari ini</td></tr>';
  }
}

function searchSiswaManual() {
  const searchTerm = document.getElementById('searchNamaManual')?.value?.toLowerCase() || '';
  const resultsDiv = document.getElementById('searchResults');
  if (!resultsDiv) return;
  
  if (searchTerm.length < 2) {
    resultsDiv.style.display = 'none';
    return;
  }
  
  const filtered = siswaData.filter(s => s.nama.toLowerCase().includes(searchTerm));
  
  if (filtered.length === 0) {
    resultsDiv.innerHTML = '<div style="padding:12px;color:#999;">Tidak ditemukan</div>';
    resultsDiv.style.display = 'block';
    return;
  }
  
  resultsDiv.innerHTML = filtered.slice(0, 8).map(s => `
    <div style="padding:12px 16px;cursor:pointer;border-bottom:1px solid #eee;transition:all 0.2s;" 
         onclick="selectSiswaManual('${s.noId}', '${s.nama.replace(/'/g, "\\'")}', '${s.kelas.replace(/'/g, "\\'")}')"
         onmouseover="this.style.background='#f0f7ff'" 
         onmouseout="this.style.background='white'">
      <strong>${s.nama}</strong> - <small>${s.kelas}</small>
    </div>
  `).join('');
  
  resultsDiv.style.display = 'block';
}

function selectSiswaManual(noId, nama, kelas) {
  document.getElementById('noIdManual').value = noId;
  document.getElementById('searchNamaManual').value = nama;
  document.getElementById('kelasManual').value = kelas;
  document.getElementById('searchResults').style.display = 'none';
}

async function submitInputManual(defaultKelas) {
  const noId = document.getElementById('noIdManual')?.value;
  const nama = document.getElementById('searchNamaManual')?.value;
  const kelas = document.getElementById('kelasManual')?.value || defaultKelas;
  const status = document.getElementById('statusManual')?.value;
  
  if (!noId || !nama || !kelas || !status) {
    Swal.fire({ icon: 'warning', title: 'Lengkapi Form', text: 'Semua field harus diisi', confirmButtonColor: '#4A90E2' });
    return;
  }
  
  Swal.fire({ title: 'Menyimpan...', allowOutsideClick: false, showConfirmButton: false, willOpen: () => Swal.showLoading() });
  
  const response = await callApi('inputManual', {
    token: sessionToken,
    absensi: { noId, nama, kelas, status, keterangan: status === 'Hadir' ? 'Tepat Waktu' : status }
  });
  
  if (response.success) {
    Swal.fire({ icon: 'success', title: 'Berhasil', text: response.message, timer: 1500, showConfirmButton: false });
    resetInputManual();
    loadAbsensiTerbaru();
  } else {
    Swal.fire({ icon: 'error', title: 'Gagal', text: response.message, confirmButtonColor: '#4A90E2' });
  }
}

function resetInputManual() {
  const form = document.getElementById('inputManualForm');
  if (form) form.reset();
  const resultsDiv = document.getElementById('searchResults');
  if (resultsDiv) resultsDiv.style.display = 'none';
  const noIdEl = document.getElementById('noIdManual');
  if (noIdEl) noIdEl.value = '';
}

// ============ WALI KELAS TAB ============
async function renderWaliKelasTab(container) {
  const kelasRes = await callApi('getKelas', { token: sessionToken });
  let kelasOptions = '<option value="">-- Pilih Kelas --</option>';
  if (kelasRes.success) {
    kelasRes.kelas.forEach(k => {
      kelasOptions += '<option value="' + k.namaKelas + '">' + k.namaKelas + '</option>';
    });
  }
  
  container.innerHTML = `
    <h5><i class="bi bi-person-workspace"></i> Data Wali Kelas</h5>
    
    <form id="waliKelasForm" onsubmit="event.preventDefault(); saveWaliKelas();">
      <input type="hidden" id="wkNoId">
      <div class="stats-row" style="grid-template-columns:repeat(3,1fr);">
        <div class="form-group"><label class="form-label">Nama *</label><input type="text" class="form-control" id="wkNama" required></div>
        <div class="form-group"><label class="form-label">Username *</label><input type="text" class="form-control" id="wkUsername" required></div>
        <div class="form-group"><label class="form-label">Password *</label><input type="text" class="form-control" id="wkPassword" required></div>
      </div>
      <div class="stats-row" style="grid-template-columns:repeat(3,1fr);">
        <div class="form-group">
          <label class="form-label">Kelas</label>
          <select class="form-control" id="wkKelas">${kelasOptions}</select>
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-control" id="wkStatus">
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </div>
      
      <button type="submit" class="btn btn-primary" id="btnSaveWK"><i class="bi bi-save"></i> Simpan</button>
      <button type="button" class="btn btn-warning" onclick="resetWKForm()"><i class="bi bi-arrow-counterclockwise"></i> Reset</button>
    </form>
    
    <div class="table-container mt-4">
      <div class="table-controls">
        <div class="search-box">
          <i class="bi bi-search"></i>
          <input type="text" id="searchWK" placeholder="Cari wali kelas..." onkeyup="loadWaliKelasData()">
        </div>
        <select class="page-size-select" id="pageSizeWK" onchange="loadWaliKelasData()">
          <option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="1000">Semua</option>
        </select>
      </div>
      <table><thead><tr><th>No ID</th><th>Nama</th><th>Username</th><th>Kelas</th><th>Status</th><th>Aksi</th></tr></thead>
      <tbody id="wkTable"></tbody></table>
      <div class="pagination" id="wkPagination"></div>
    </div>
  `;
  
  pagination.currentPage = 1;
  loadWaliKelasData();
}

async function loadWaliKelasData() {
  const response = await callApi('getWaliKelas', { token: sessionToken });
  
  if (response.success) {
    waliKelasData = response.waliKelas || [];
    displayWKTable();
  }
}

function displayWKTable() {
  const tbody = document.getElementById('wkTable');
  if (!tbody) return;
  
  let data = [...waliKelasData];
  const searchTerm = document.getElementById('searchWK')?.value?.toLowerCase() || '';
  if (searchTerm) data = data.filter(w => w.nama.toLowerCase().includes(searchTerm));
  
  const pageSize = parseInt(document.getElementById('pageSizeWK')?.value || 10);
  const totalPages = Math.ceil(data.length / pageSize);
  const start = (pagination.currentPage - 1) * pageSize;
  const pageData = data.slice(start, start + pageSize);
  
  if (pageData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Belum ada data</td></tr>';
    document.getElementById('wkPagination').innerHTML = '';
    return;
  }
  
  tbody.innerHTML = pageData.map(w => `
    <tr>
      <td>${w.noId}</td>
      <td>${w.nama}</td>
      <td>${w.username}</td>
      <td>${w.kelas || '-'}</td>
      <td><span class="badge ${w.status === 'Active' ? 'badge-success' : 'badge-danger'}">${w.status}</span></td>
      <td>
        <button class="btn btn-sm btn-warning" onclick="editWK('${w.noId}')"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-danger" onclick="deleteWK('${w.noId}')"><i class="bi bi-trash"></i></button>
      </td>
    </tr>
  `).join('');
  
  document.getElementById('wkPagination').innerHTML = totalPages > 1 ? `
    <button onclick="goToWKPage(1)" ${pagination.currentPage===1?'disabled':''}><i class="bi bi-chevron-double-left"></i></button>
    <button onclick="goToWKPage(${pagination.currentPage-1})" ${pagination.currentPage===1?'disabled':''}><i class="bi bi-chevron-left"></i></button>
    <span>Hal ${pagination.currentPage}/${totalPages}</span>
    <button onclick="goToWKPage(${pagination.currentPage+1})" ${pagination.currentPage===totalPages?'disabled':''}><i class="bi bi-chevron-right"></i></button>
    <button onclick="goToWKPage(${totalPages})" ${pagination.currentPage===totalPages?'disabled':''}><i class="bi bi-chevron-double-right"></i></button>
  ` : '';
}

function goToWKPage(page) { pagination.currentPage = page; displayWKTable(); }

async function saveWaliKelas() {
  const noId = document.getElementById('wkNoId')?.value;
  const wk = {
    noId, nama: document.getElementById('wkNama')?.value,
    username: document.getElementById('wkUsername')?.value,
    password: document.getElementById('wkPassword')?.value,
    kelas: document.getElementById('wkKelas')?.value,
    status: document.getElementById('wkStatus')?.value
  };
  
  if (!wk.nama || !wk.username || !wk.password) {
    Swal.fire({ icon: 'warning', title: 'Lengkapi Form', confirmButtonColor: '#4A90E2' });
    return;
  }
  
  Swal.fire({ title: 'Menyimpan...', allowOutsideClick: false, showConfirmButton: false, willOpen: () => Swal.showLoading() });
  
  const action = noId ? 'updateWaliKelas' : 'saveWaliKelas';
  const response = await callApi(action, { token: sessionToken, waliKelas: wk });
  
  if (response.success) {
    Swal.fire({ icon: 'success', title: 'Berhasil', text: response.message, timer: 2000, showConfirmButton: false });
    resetWKForm();
    loadWaliKelasData();
  } else {
    Swal.fire({ icon: 'error', title: 'Gagal', text: response.message, confirmButtonColor: '#4A90E2' });
  }
}

function editWK(noId) {
  const wk = waliKelasData.find(w => w.noId === noId);
  if (wk) {
    document.getElementById('wkNoId').value = wk.noId;
    document.getElementById('wkNama').value = wk.nama;
    document.getElementById('wkUsername').value = wk.username;
    document.getElementById('wkPassword').value = wk.password;
    document.getElementById('wkKelas').value = wk.kelas || '';
    document.getElementById('wkStatus').value = wk.status;
    document.getElementById('btnSaveWK').innerHTML = '<i class="bi bi-pencil"></i> Update';
  }
}

async function deleteWK(noId) {
  const result = await Swal.fire({
    title: 'Hapus Wali Kelas?', text: 'Data akan dihapus permanen', icon: 'warning',
    showCancelButton: true, confirmButtonColor: '#FF6B6B', cancelButtonColor: '#4A90E2',
    confirmButtonText: 'Ya, Hapus', cancelButtonText: 'Batal'
  });
  
  if (result.isConfirmed) {
    Swal.fire({ title: 'Menghapus...', allowOutsideClick: false, showConfirmButton: false, willOpen: () => Swal.showLoading() });
    const response = await callApi('deleteWaliKelas', { token: sessionToken, noId });
    if (response.success) {
      Swal.fire({ icon: 'success', title: 'Berhasil', text: response.message, timer: 2000, showConfirmButton: false });
      loadWaliKelasData();
    } else {
      Swal.fire({ icon: 'error', title: 'Gagal', text: response.message, confirmButtonColor: '#4A90E2' });
    }
  }
}

function resetWKForm() {
  document.getElementById('wkNoId').value = '';
  document.getElementById('waliKelasForm')?.reset();
  document.getElementById('btnSaveWK').innerHTML = '<i class="bi bi-save"></i> Simpan';
}

// ============ SISWA TAB ============
async function renderSiswaTab(container) {
  container.innerHTML = `
    <h5><i class="bi bi-people-fill"></i> Data Siswa</h5>
    
    <div style="margin-bottom:15px;display:flex;gap:10px;flex-wrap:wrap;">
      <button class="btn btn-info btn-sm" onclick="downloadTemplate()"><i class="bi bi-download"></i> Download Template</button>
      <button class="btn btn-success btn-sm" onclick="document.getElementById('uploadFile').click()"><i class="bi bi-upload"></i> Upload Data</button>
      <input type="file" id="uploadFile" accept=".xlsx,.xls" style="display:none;" onchange="handleFileUpload(event)">
    </div>
    
    <form id="siswaForm" onsubmit="event.preventDefault(); saveSiswa();">
      <input type="hidden" id="siswaNoId">
      <div class="stats-row" style="grid-template-columns:repeat(3,1fr);">
        <div class="form-group"><label class="form-label">NISN</label><input type="text" class="form-control" id="siswaNISN"></div>
        <div class="form-group"><label class="form-label">Nama *</label><input type="text" class="form-control" id="siswaNama" required></div>
        <div class="form-group"><label class="form-label">Tempat Lahir</label><input type="text" class="form-control" id="siswaTempatLahir"></div>
      </div>
      <div class="stats-row" style="grid-template-columns:repeat(3,1fr);">
        <div class="form-group"><label class="form-label">Tanggal Lahir</label><input type="date" class="form-control" id="siswaTanggalLahir"></div>
        <div class="form-group"><label class="form-label">Kelas</label><input type="text" class="form-control" id="siswaKelas" required></div>
        <div class="form-group">
          <label class="form-label">Jenis Kelamin</label>
          <select class="form-control" id="siswaJK"><option value="L">Laki-laki</option><option value="P">Perempuan</option></select>
        </div>
      </div>
      <div class="stats-row" style="grid-template-columns:1fr 1fr;">
        <div class="form-group"><label class="form-label">Keterangan</label><input type="text" class="form-control" id="siswaKeterangan" placeholder="Contoh: Berkebutuhan Khusus"></div>
        <div class="form-group"><label class="form-label">Wali Kelas</label><input type="text" class="form-control" id="siswaWaliKelas" placeholder="Nama wali kelas"></div>
      </div>
      
      <button type="submit" class="btn btn-primary" id="btnSaveSiswa"><i class="bi bi-save"></i> Simpan</button>
      <button type="button" class="btn btn-warning" onclick="resetSiswaForm()"><i class="bi bi-arrow-counterclockwise"></i> Reset</button>
      <button type="button" class="btn btn-info" onclick="showSetWaliKelas()"><i class="bi bi-gear"></i> Set Wali Kelas per Kelas</button>
    </form>
    
    <div class="table-container mt-4">
      <div class="table-controls">
        <div class="search-box">
          <i class="bi bi-search"></i>
          <input type="text" id="searchSiswa" placeholder="Cari siswa..." onkeyup="loadSiswaData()">
        </div>
        <select class="page-size-select" id="pageSizeSiswa" onchange="loadSiswaData()">
          <option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="1000">Semua</option>
        </select>
      </div>
      <table><thead><tr><th>No ID</th><th>Nama</th><th>Kelas</th><th>JK</th><th>Keterangan</th><th>Aksi</th></tr></thead>
      <tbody id="siswaTable"></tbody></table>
      <div class="pagination" id="siswaPagination"></div>
    </div>
  `;
  
  loadSiswaData();
}

async function renderSiswaTabReadOnly(container, kelas) {
  container.innerHTML = `
    <h5><i class="bi bi-people-fill"></i> Data Siswa Kelas ${kelas}</h5>
    <div class="table-container">
      <div class="table-controls">
        <div class="search-box">
          <i class="bi bi-search"></i>
          <input type="text" id="searchSiswa" placeholder="Cari siswa..." onkeyup="loadSiswaData()">
        </div>
      </div>
      <table><thead><tr><th>No ID</th><th>Nama</th><th>TTL</th><th>JK</th><th>Keterangan</th></tr></thead>
      <tbody id="siswaTable"></tbody></table>
    </div>
  `;
  
  loadSiswaData();
}

async function loadSiswaData() {
  const response = await callApi('getSiswa', { token: sessionToken });
  
  if (response.success) {
    siswaData = response.siswa || [];
    displaySiswaTable();
  }
}

function formatTanggalLahir(tempat, tanggal) {
  if (!tanggal || tanggal === '-') return (tempat || '-');
  
  let dateObj;
  if (tanggal instanceof Date) {
    dateObj = tanggal;
  } else if (typeof tanggal === 'string') {
    // Coba berbagai format
    dateObj = new Date(tanggal);
    if (isNaN(dateObj.getTime())) {
      // Coba format DD/MM/YYYY
      const parts = tanggal.split(/[/-]/);
      if (parts.length === 3) {
        dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
      }
    }
  }
  
  if (dateObj && !isNaN(dateObj.getTime())) {
    const bulanNames = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    const formatted = dateObj.getDate() + ' ' + bulanNames[dateObj.getMonth()] + ' ' + dateObj.getFullYear();
    return tempat ? tempat + ', ' + formatted : formatted;
  }
  
  return (tempat || '-') + (tanggal ? ', ' + tanggal : '');
}

function displaySiswaTable() {
  const tbody = document.getElementById('siswaTable');
  if (!tbody) return;
  
  let data = [...siswaData];
  const searchTerm = document.getElementById('searchSiswa')?.value?.toLowerCase() || '';
  if (searchTerm) data = data.filter(s => s.nama.toLowerCase().includes(searchTerm));
  
  const pageSize = parseInt(document.getElementById('pageSizeSiswa')?.value || 10);
  const totalPages = Math.ceil(data.length / pageSize);
  const start = (pagination.currentPage - 1) * pageSize;
  const pageData = data.slice(start, start + pageSize);
  
  if (pageData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Belum ada data</td></tr>';
    return;
  }
  
  const isReadOnly = userData?.role !== 'Admin';
  
  tbody.innerHTML = pageData.map(s => {
    const ttlDisplay = formatTanggalLahir(s.tempatLahir, s.tanggalLahir);
    
    return `
    <tr>
      <td>${s.noId}</td>
      <td>${s.nama}</td>
      ${isReadOnly ? '<td>' + ttlDisplay + '</td>' : '<td>' + s.kelas + '</td>'}
      <td>${s.jk === 'L' ? 'Laki-laki' : 'Perempuan'}</td>
      <td>${s.keterangan || '-'}</td>
      ${isReadOnly ? '' : `
        <td>
          <button class="btn btn-sm btn-warning" onclick="editSiswa('${s.noId}')"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-danger" onclick="deleteSiswa('${s.noId}')"><i class="bi bi-trash"></i></button>
        </td>
      `}
    </tr>
  `;
  }).join('');
}

async function saveSiswa() {
  const noId = document.getElementById('siswaNoId')?.value;
  const siswa = {
    noId, nisn: document.getElementById('siswaNISN')?.value,
    nama: document.getElementById('siswaNama')?.value,
    tempatLahir: document.getElementById('siswaTempatLahir')?.value,
    tanggalLahir: document.getElementById('siswaTanggalLahir')?.value,
    kelas: document.getElementById('siswaKelas')?.value,
    jk: document.getElementById('siswaJK')?.value,
    keterangan: document.getElementById('siswaKeterangan')?.value,
    waliKelas: document.getElementById('siswaWaliKelas')?.value
  };
  
  if (!siswa.nama || !siswa.kelas) {
    Swal.fire({ icon: 'warning', title: 'Lengkapi Form', text: 'Nama dan Kelas harus diisi', confirmButtonColor: '#4A90E2' });
    return;
  }
  
  Swal.fire({ title: 'Menyimpan...', allowOutsideClick: false, showConfirmButton: false, willOpen: () => Swal.showLoading() });
  
  const action = noId ? 'updateSiswa' : 'saveSiswa';
  const response = await callApi(action, { token: sessionToken, siswa });
  
  if (response.success) {
    Swal.fire({ icon: 'success', title: 'Berhasil', text: response.message, timer: 2000, showConfirmButton: false });
    resetSiswaForm();
    loadSiswaData();
  } else {
    Swal.fire({ icon: 'error', title: 'Gagal', text: response.message, confirmButtonColor: '#4A90E2' });
  }
}

function editSiswa(noId) {
  const s = siswaData.find(s => s.noId === noId);
  if (s) {
    document.getElementById('siswaNoId').value = s.noId;
    document.getElementById('siswaNISN').value = s.nisn || '';
    document.getElementById('siswaNama').value = s.nama;
    document.getElementById('siswaTempatLahir').value = s.tempatLahir || '';
    document.getElementById('siswaTanggalLahir').value = s.tanggalLahir || '';
    document.getElementById('siswaKelas').value = s.kelas;
    document.getElementById('siswaJK').value = s.jk || 'L';
    document.getElementById('siswaKeterangan').value = s.keterangan || '';
    document.getElementById('siswaWaliKelas').value = s.waliKelas || '';
    document.getElementById('btnSaveSiswa').innerHTML = '<i class="bi bi-pencil"></i> Update';
  }
}

async function deleteSiswa(noId) {
  const result = await Swal.fire({
    title: 'Hapus Siswa?', text: 'Data akan dihapus permanen', icon: 'warning',
    showCancelButton: true, confirmButtonColor: '#FF6B6B', cancelButtonColor: '#4A90E2',
    confirmButtonText: 'Ya, Hapus', cancelButtonText: 'Batal'
  });
  
  if (result.isConfirmed) {
    Swal.fire({ title: 'Menghapus...', allowOutsideClick: false, showConfirmButton: false, willOpen: () => Swal.showLoading() });
    const response = await callApi('deleteSiswa', { token: sessionToken, noId });
    if (response.success) {
      Swal.fire({ icon: 'success', title: 'Berhasil', text: response.message, timer: 2000, showConfirmButton: false });
      loadSiswaData();
    }
  }
}

function resetSiswaForm() {
  document.getElementById('siswaNoId').value = '';
  document.getElementById('siswaForm')?.reset();
  document.getElementById('btnSaveSiswa').innerHTML = '<i class="bi bi-save"></i> Simpan';
}

function downloadTemplate() {
  const template = [
    ['NISN', 'Nama', 'Tempat Lahir', 'Tanggal Lahir', 'Kelas', 'Jenis Kelamin (L/P)', 'Keterangan'],
    ['', 'Ahmad Fauzi', 'Jakarta', '2008-05-15', 'X-A', 'L', ''],
    ['', 'Siti Nurhaliza', 'Bandung', '2008-08-20', 'X-A', 'P', 'Berkebutuhan Khusus']
  ];
  
  const ws = XLSX.utils.aoa_to_sheet(template);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template Siswa');
  XLSX.writeFile(wb, 'template_data_siswa.xlsx');
}

async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async function(e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(sheet);
    
    const siswaList = jsonData.map(row => ({
      nisn: row['NISN']?.toString() || '',
      nama: row['Nama']?.toString() || '',
      tempatLahir: row['Tempat Lahir']?.toString() || '',
      tanggalLahir: row['Tanggal Lahir']?.toString() || '',
      kelas: row['Kelas']?.toString() || '',
      jk: row['Jenis Kelamin (L/P)']?.toString().toUpperCase() || 'L',
      keterangan: row['Keterangan']?.toString() || ''
    })).filter(s => s.nama && s.kelas);
    
    if (siswaList.length === 0) {
      Swal.fire({ icon: 'warning', title: 'Data Kosong', text: 'Tidak ada data valid dalam file', confirmButtonColor: '#4A90E2' });
      return;
    }
    
    const result = await Swal.fire({
      title: 'Upload Data?', text: siswaList.length + ' siswa akan diupload', icon: 'question',
      showCancelButton: true, confirmButtonColor: '#4A90E2', cancelButtonColor: '#FF6B6B',
      confirmButtonText: 'Upload', cancelButtonText: 'Batal'
    });
    
    if (result.isConfirmed) {
      Swal.fire({ title: 'Mengupload...', allowOutsideClick: false, showConfirmButton: false, willOpen: () => Swal.showLoading() });
      const response = await callApi('uploadSiswa', { token: sessionToken, siswaList });
      if (response.success) {
        Swal.fire({ icon: 'success', title: 'Berhasil', text: response.message, timer: 2000, showConfirmButton: false });
        loadSiswaData();
      }
    }
  };
  reader.readAsArrayBuffer(file);
}

// ============ SET WALI KELAS ============
async function showSetWaliKelas() {
  const kelasRes = await callApi('getKelas', { token: sessionToken });
  const wkRes = await callApi('getWaliKelas', { token: sessionToken });
  
  let kelasList = [];
  if (kelasRes.success && kelasRes.kelas) {
    kelasList = kelasRes.kelas.map(k => k.namaKelas);
  }
  
  const siswaRes = await callApi('getSiswa', { token: sessionToken });
  if (siswaRes.success && siswaRes.siswa) {
    siswaRes.siswa.forEach(s => {
      if (s.kelas && !kelasList.includes(s.kelas)) {
        kelasList.push(s.kelas);
      }
    });
  }
  
  const kelasOptions = kelasList.length > 0 
    ? kelasList.sort().map(k => '<option value="' + k + '">' + k + '</option>').join('')
    : '<option value="">Belum ada kelas</option>';
  
  const wkOptions = (wkRes.success && wkRes.waliKelas) 
    ? wkRes.waliKelas.map(w => '<option value="' + w.nama + '">' + w.nama + '</option>').join('')
    : '<option value="">Belum ada wali kelas</option>';
  
  const { value: formValues } = await Swal.fire({
    title: 'Set Wali Kelas',
    html: `
      <div style="text-align:left;">
        <div class="form-group">
          <label style="font-weight:600;margin-bottom:5px;display:block;">Pilih Kelas</label>
          <select id="swalKelas" style="width:100%;padding:12px;border:2px solid #e9ecef;border-radius:10px;font-size:1rem;">
            ${kelasOptions}
          </select>
        </div>
        <div class="form-group" style="margin-top:15px;">
          <label style="font-weight:600;margin-bottom:5px;display:block;">Pilih Wali Kelas</label>
          <select id="swalWK" style="width:100%;padding:12px;border:2px solid #e9ecef;border-radius:10px;font-size:1rem;">
            ${wkOptions}
          </select>
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonColor: '#4A90E2',
    cancelButtonColor: '#FF6B6B',
    confirmButtonText: 'Simpan',
    cancelButtonText: 'Batal',
    preConfirm: () => {
      const kelas = document.getElementById('swalKelas')?.value;
      const waliKelas = document.getElementById('swalWK')?.value;
      if (!kelas) {
        Swal.showValidationMessage('Pilih kelas terlebih dahulu');
        return false;
      }
      return { kelas, waliKelas };
    }
  });
  
  if (formValues) {
    Swal.fire({ title: 'Menyimpan...', allowOutsideClick: false, showConfirmButton: false, willOpen: () => Swal.showLoading() });
    const response = await callApi('setWaliKelas', { token: sessionToken, ...formValues });
    Swal.fire({ 
      icon: response.success ? 'success' : 'error', 
      title: response.message, 
      timer: 2000, 
      showConfirmButton: false 
    });
  }
}

// ============ CETAK QR CODE ============
async function renderCetakQR(container, defaultKelas) {
  defaultKelas = defaultKelas || '';
  container.innerHTML = '<p class="text-center" style="padding:20px;"><i class="bi bi-hourglass-split"></i> Memuat data...</p>';
  
  var response = await callApi('getSiswa', { token: sessionToken });
  siswaData = response.success ? (response.siswa || []) : [];
  
  var kelasSet = {};
  siswaData.forEach(function(s) { if (s.kelas) kelasSet[s.kelas] = true; });
  
  var kelasRes = await callApi('getKelas', { token: sessionToken });
  if (kelasRes.success && kelasRes.kelas) {
    kelasRes.kelas.forEach(function(k) { if (k.namaKelas) kelasSet[k.namaKelas] = true; });
  }
  
  var kelasArray = Object.keys(kelasSet).sort();
  var kelasOptions = '<option value="">Semua Kelas</option>';
  kelasArray.forEach(function(k) {
    var selected = (k === defaultKelas) ? ' selected' : '';
    kelasOptions += '<option value="' + k + '"' + selected + '>' + k + '</option>';
  });
  
  container.innerHTML = `
    <h5><i class="bi bi-printer"></i> Cetak QR Code Siswa</h5>
    <div class="stats-row" style="grid-template-columns:1fr 1fr;">
      <div class="form-group"><label class="form-label">Pilih Kelas</label><select class="form-control" id="cetakKelas" onchange="filterCetakSiswa()">${kelasOptions}</select></div>
      <div class="form-group"><label class="form-label">Cari Siswa</label><input type="text" class="form-control" id="cetakSearch" placeholder="Ketik nama..." onkeyup="filterCetakSiswa()"></div>
    </div>
    <div style="margin:15px 0;display:flex;gap:10px;flex-wrap:wrap;">
      <button class="btn btn-primary" onclick="cetakSemuaQR()"><i class="bi bi-printer"></i> Cetak Semua (A4)</button>
      <button class="btn btn-success" onclick="cetakSatuQR()"><i class="bi bi-printer"></i> Cetak Satu</button>
    </div>
    <div id="qrPreviewContainer" style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:15px;"></div>
  `;
  
  setTimeout(function() { filterCetakSiswa(); }, 300);
}

async function filterCetakSiswa() {
  var kelasEl = document.getElementById('cetakKelas');
  var searchEl = document.getElementById('cetakSearch');
  var container = document.getElementById('qrPreviewContainer');
  if (!container) return;
  
  var kelas = kelasEl ? kelasEl.value : '';
  var search = searchEl ? searchEl.value.toLowerCase() : '';
  
  var filtered = siswaData.filter(function(s) {
    if (kelas && s.kelas !== kelas) return false;
    if (search && s.nama.toLowerCase().indexOf(search) === -1) return false;
    return true;
  });
  
  filtered = filtered.slice(0, 16);
  
  if (filtered.length === 0) {
    container.innerHTML = '<p class="text-center text-muted" style="padding:20px;width:100%;">Tidak ada siswa ditemukan</p>';
    return;
  }
  
  container.innerHTML = '<p class="text-center" style="padding:20px;width:100%;"><i class="bi bi-hourglass-split"></i> Membuat QR Code...</p>';
  
  var cardsHTML = '';
  for (var i = 0; i < filtered.length; i++) {
    var s = filtered[i];
    var qrData = s.noId + ':' + s.nama + ':' + s.kelas;
    var ttlDisplay = formatTanggalLahir(s.tempatLahir, s.tanggalLahir);
    
    var qrURL;
    try {
      qrURL = await generateQRDataURL(qrData, 120);
    } catch(err) {
      qrURL = 'https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=' + encodeURIComponent(qrData) + '&margin=1';
    }
    
    cardsHTML += `
      <div class="qr-card">
        <div class="logo-container">
          <img src="${APP_LOGO}" alt="Logo" onerror="this.style.display='none'">
        </div>
        <div class="school-header">${NAMA_SEKOLAH}</div>
        <div class="school-address">${ALAMAT_SEKOLAH}</div>
        <div class="divider"></div>
        <div class="student-name">${s.nama}</div>
        <div class="student-info">${ttlDisplay}</div>
        <div class="student-info">Kelas: ${s.kelas}</div>
        <div class="qr-container">
          <img src="${qrURL}" alt="QR">
        </div>
        <div class="no-id">No ID: ${s.noId}</div>
      </div>
    `;
    
    await new Promise(function(r) { setTimeout(r, 30); });
  }
  
  container.innerHTML = cardsHTML;
}

function cetakSemuaQR() {
  var cards = document.querySelectorAll('.qr-card');
  if (cards.length === 0) {
    Swal.fire({ icon: 'warning', title: 'Tidak ada data', text: 'Silakan filter terlebih dahulu', confirmButtonColor: '#4A90E2' });
    return;
  }
  
  var printWindow = window.open('', '_blank', 'width=900,height=700');
  var cardsHTML = '';
  cards.forEach(function(card) { cardsHTML += card.cloneNode(true).outerHTML; });
  
  printWindow.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Cetak QR</title>' +
    '<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial;padding:10px}.page{display:flex;flex-wrap:wrap;justify-content:center;gap:8px}' +
    '.qr-card{width:2.3in;min-height:3.6in;border:3px solid #333;padding:15px 12px;text-align:center;font-size:10px;page-break-inside:avoid;display:inline-flex;flex-direction:column;align-items:center;margin:5px}' +
    '.qr-card .logo-container{margin-bottom:6px}.qr-card .logo-container img{width:45px;height:45px;object-fit:contain}' +
    '.qr-card .school-header{font-weight:bold;font-size:11px;text-transform:uppercase}.qr-card .school-address{font-size:8px;color:#666;margin-bottom:6px}' +
    '.qr-card .divider{border-top:2px solid #333;margin:6px 0;width:90%}.qr-card .student-name{font-weight:bold;font-size:10px}' +
    '.qr-card .student-info{font-size:8px;color:#555}.qr-card .qr-container{margin:6px 0}.qr-card .qr-container img{width:110px;height:110px;border:2px solid #ddd;border-radius:6px}' +
    '.qr-card .no-id{font-size:7px;color:#999;margin-top:4px}@page{size:A4;margin:.4cm}</style></head>' +
    '<body><div class="page">' + cardsHTML + '</div><script>window.onload=function(){setTimeout(window.print,500)}<\/script></body></html>');
  printWindow.document.close();
}

function cetakSatuQR() {
  var searchEl = document.getElementById('cetakSearch');
  var searchVal = searchEl ? searchEl.value.trim() : '';
  
  if (!searchVal) {
    Swal.fire({ icon: 'warning', title: 'Cari Siswa', text: 'Ketik nama dulu di kolom pencarian', confirmButtonColor: '#4A90E2' });
    return;
  }
  
  var siswa = null;
  for (var i = 0; i < siswaData.length; i++) {
    if (siswaData[i].nama.toLowerCase().indexOf(searchVal.toLowerCase()) !== -1) {
      siswa = siswaData[i]; break;
    }
  }
  
  if (!siswa) {
    Swal.fire({ icon: 'error', title: 'Tidak ditemukan', text: 'Siswa tidak ditemukan', confirmButtonColor: '#4A90E2' });
    return;
  }
  
  var qrData = siswa.noId + ':' + siswa.nama + ':' + siswa.kelas;
  var ttlDisplay = formatTanggalLahir(siswa.tempatLahir, siswa.tanggalLahir);
  
  generateQRDataURL(qrData, 180).then(function(qrURL) {
    var printWindow = window.open('', '_blank', 'width=400,height=600');
    
    printWindow.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>QR ' + siswa.nama + '</title>' +
      '<style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;justify-content:center;align-items:center;min-height:100vh;font-family:Arial;padding:20px;background:#fff}' +
      '.card{width:3in;min-height:4.5in;border:3px solid #333;padding:20px 18px;text-align:center;page-break-inside:avoid;display:flex;flex-direction:column;align-items:center}' +
      '.logo-container{margin-bottom:8px}.logo-container img{width:55px;height:55px;object-fit:contain}' +
      '.school-header{font-weight:bold;font-size:13px;text-transform:uppercase;margin-bottom:3px}' +
      '.school-address{font-size:9px;color:#666;margin-bottom:6px}' +
      '.divider{border-top:2px solid #000;margin:8px 0;width:90%}' +
      '.student-name{font-weight:bold;font-size:13px;margin:5px 0}' +
      '.student-info{font-size:10px;color:#555;margin:2px 0}' +
      '.qr-container{margin:10px 0}.qr-container img{width:150px;height:150px;border:2px solid #ddd;border-radius:8px}' +
      '.no-id{font-size:8px;color:#999;margin-top:5px}' +
      '@media print{body{margin:0;padding:0;background:#fff}.card{border:3px solid #333}}@page{margin:0.5cm}</style></head>' +
      '<body><div class="card">' +
      '<div class="logo-container"><img src="' + APP_LOGO + '" alt="Logo" onerror="this.style.display=\'none\'"></div>' +
      '<div class="school-header">' + NAMA_SEKOLAH + '</div>' +
      '<div class="school-address">' + ALAMAT_SEKOLAH + '</div>' +
      '<div class="divider"></div>' +
      '<div class="student-name">' + siswa.nama + '</div>' +
      '<div class="student-info">' + ttlDisplay + '</div>' +
      '<div class="student-info">Kelas: ' + siswa.kelas + '</div>' +
      '<div class="qr-container"><img src="' + qrURL + '" alt="QR Code"></div>' +
      '<div class="no-id">No ID: ' + siswa.noId + '</div>' +
      '</div><script>window.onload=function(){setTimeout(function(){window.print()},500)};<\/script></body></html>');
    
    printWindow.document.close();
  }).catch(function() {
    var qrURL = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(qrData) + '&margin=1';
    var printWindow = window.open('', '_blank', 'width=400,height=600');
    
    printWindow.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>QR ' + siswa.nama + '</title>' +
      '<style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;justify-content:center;align-items:center;min-height:100vh;font-family:Arial;padding:20px;background:#fff}' +
      '.card{width:3in;min-height:4.5in;border:3px solid #333;padding:20px 18px;text-align:center;page-break-inside:avoid;display:flex;flex-direction:column;align-items:center}' +
      '.logo-container{margin-bottom:8px}.logo-container img{width:55px;height:55px;object-fit:contain}' +
      '.school-header{font-weight:bold;font-size:13px;text-transform:uppercase;margin-bottom:3px}' +
      '.school-address{font-size:9px;color:#666;margin-bottom:6px}' +
      '.divider{border-top:2px solid #000;margin:8px 0;width:90%}' +
      '.student-name{font-weight:bold;font-size:13px;margin:5px 0}' +
      '.student-info{font-size:10px;color:#555;margin:2px 0}' +
      '.qr-container{margin:10px 0}.qr-container img{width:150px;height:150px;border:2px solid #ddd;border-radius:8px}' +
      '.no-id{font-size:8px;color:#999;margin-top:5px}' +
      '@media print{body{margin:0;padding:0;background:#fff}.card{border:3px solid #333}}@page{margin:0.5cm}</style></head>' +
      '<body><div class="card">' +
      '<div class="logo-container"><img src="' + APP_LOGO + '" alt="Logo" onerror="this.style.display=\'none\'"></div>' +
      '<div class="school-header">' + NAMA_SEKOLAH + '</div>' +
      '<div class="school-address">' + ALAMAT_SEKOLAH + '</div>' +
      '<div class="divider"></div>' +
      '<div class="student-name">' + siswa.nama + '</div>' +
      '<div class="student-info">' + ttlDisplay + '</div>' +
      '<div class="student-info">Kelas: ' + siswa.kelas + '</div>' +
      '<div class="qr-container"><img src="' + qrURL + '" alt="QR Code"></div>' +
      '<div class="no-id">No ID: ' + siswa.noId + '</div>' +
      '</div><script>window.onload=function(){setTimeout(function(){window.print()},800)};<\/script></body></html>');
    
    printWindow.document.close();
  });
}

async function renderCetakQRSiswa(container) {
  container.innerHTML = '<p class="text-center" style="padding:20px;"><i class="bi bi-hourglass-split"></i> Memuat...</p>';
  
  var siswaInfo = null;
  if (siswaData && siswaData.length > 0) {
    for (var i = 0; i < siswaData.length; i++) {
      if (siswaData[i].noId === userData.noId) { siswaInfo = siswaData[i]; break; }
    }
  }
  
  if (!siswaInfo) {
    var response = await callApi('getSiswa', { token: sessionToken });
    if (response.success) {
      siswaData = response.siswa || [];
      for (var j = 0; j < siswaData.length; j++) {
        if (siswaData[j].noId === userData.noId) { siswaInfo = siswaData[j]; break; }
      }
    }
  }
  
  var nama = siswaInfo ? siswaInfo.nama : (userData.nama || 'Siswa');
  var kelas = siswaInfo ? siswaInfo.kelas : (userData.kelas || '');
  var ttlDisplay = siswaInfo ? formatTanggalLahir(siswaInfo.tempatLahir, siswaInfo.tanggalLahir) : '-';
  var noId = userData.noId || (siswaInfo ? siswaInfo.noId : '');
  var qrData = noId + ':' + nama + ':' + kelas;
  
  var qrURL;
  try { qrURL = await generateQRDataURL(qrData, 180); } 
  catch(err) { qrURL = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(qrData) + '&margin=1'; }
  
  container.innerHTML = `
    <h5><i class="bi bi-printer"></i> Cetak QR Code Saya</h5>
    <div style="text-align:center;margin:20px auto;max-width:400px;">
      <div class="qr-card" style="width:100%;max-width:350px;margin:0 auto;display:flex;flex-direction:column;align-items:center;">
        <div class="logo-container">
          <img src="${APP_LOGO}" style="width:60px;height:60px;" alt="Logo Sekolah" onerror="this.style.display='none'">
        </div>
        <div class="school-header">${NAMA_SEKOLAH}</div>
        <div class="school-address">${ALAMAT_SEKOLAH}</div>
        <div class="divider"></div>
        <div class="student-name">${nama}</div>
        <div class="student-info">${ttlDisplay}</div>
        <div class="student-info">Kelas: ${kelas}</div>
        <div class="qr-container">
          <img src="${qrURL}" width="160" height="160" alt="QR">
        </div>
        <div class="no-id">No ID: ${noId}</div>
      </div>
      <button class="btn btn-primary mt-3" onclick="window.print()"><i class="bi bi-printer"></i> Cetak</button>
    </div>
  `;
}

// ============ REKAP ABSENSI ============
async function renderRekapAbsensi(container, defaultKelas) {
  defaultKelas = defaultKelas || '';
  
  // Jika user adalah Wali Kelas, langsung gunakan kelasnya dan sembunyikan dropdown
  const isWaliKelas = userData?.role === 'Wali Kelas';
  const forcedKelas = isWaliKelas ? (userData?.kelas || defaultKelas) : '';
  
  container.innerHTML = '<p class="text-center" style="padding:20px;"><i class="bi bi-hourglass-split"></i> Memuat...</p>';
  
  var now = new Date();
  var bulanSekarang = now.getMonth() + 1;
  var tahunSekarang = now.getFullYear();
  
  // Ambil data kelas
  var kelasRes = await callApi('getKelas', { token: sessionToken });
  var kelasList = [];
  
  if (kelasRes.success && kelasRes.kelas) {
    kelasRes.kelas.forEach(function(k) {
      if (k.namaKelas && kelasList.indexOf(k.namaKelas) === -1) {
        kelasList.push(k.namaKelas);
      }
    });
  }
  
  // Untuk wali kelas, hanya tampilkan kelasnya
  if (isWaliKelas && forcedKelas && !kelasList.includes(forcedKelas)) {
    kelasList.push(forcedKelas);
  }
  
  kelasList.sort();
  
  var kelasOptions = '';
  if (isWaliKelas) {
    // Wali kelas hanya bisa melihat kelasnya
    kelasOptions = '<option value="' + forcedKelas + '" selected>' + forcedKelas + '</option>';
  } else {
    kelasOptions = '<option value="">-- Pilih Kelas --</option>';
    kelasList.forEach(function(k) {
      var selected = (k === defaultKelas) ? ' selected' : '';
      kelasOptions += '<option value="' + k + '"' + selected + '>' + k + '</option>';
    });
  }
  
  var bulanNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 
                    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var bulanOptions = '';
  bulanNames.forEach(function(b, i) {
    var bulanValue = i + 1;
    var selected = (bulanValue === bulanSekarang) ? ' selected' : '';
    bulanOptions += '<option value="' + bulanValue + '"' + selected + '>' + b + '</option>';
  });
  
  container.innerHTML = `
    <h5><i class="bi bi-file-bar-graph"></i> Rekap Absensi</h5>
    
    <div class="stats-row" style="grid-template-columns:1fr 1fr 1fr auto;">
      <div class="form-group">
        <label class="form-label">Kelas</label>
        <select class="form-control" id="rekapKelas" ${isWaliKelas ? 'disabled' : ''}>${kelasOptions}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Bulan</label>
        <select class="form-control" id="rekapBulan">${bulanOptions}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Tahun</label>
        <input type="number" class="form-control" id="rekapTahun" value="${tahunSekarang}" min="2020" max="2030">
      </div>
      <div class="form-group" style="display:flex;align-items:flex-end;gap:5px;">
        <button class="btn btn-primary" onclick="loadRekapData()"><i class="bi bi-search"></i> Tampilkan</button>
        <button class="btn btn-success" onclick="cetakRekap()"><i class="bi bi-printer"></i> Cetak</button>
      </div>
    </div>
    
    <div id="rekapContent"></div>
  `;
  
  // Jika wali kelas, otomatis load rekap
  if (isWaliKelas && forcedKelas) {
    setTimeout(() => loadRekapData(), 300);
  }
}

async function loadRekapData() {
  var kelasEl = document.getElementById('rekapKelas');
  var bulanEl = document.getElementById('rekapBulan');
  var tahunEl = document.getElementById('rekapTahun');
  var contentEl = document.getElementById('rekapContent');
  
  if (!kelasEl || !bulanEl || !tahunEl || !contentEl) return;
  
  var kelas = kelasEl.value;
  var bulan = bulanEl.value;
  var tahun = tahunEl.value;
  
  if (!kelas) {
    Swal.fire({
      icon: 'warning',
      title: 'Pilih Kelas',
      text: 'Silakan pilih kelas terlebih dahulu',
      confirmButtonColor: '#4A90E2'
    });
    return;
  }
  
  if (!bulan || !tahun) {
    Swal.fire({
      icon: 'warning',
      title: 'Lengkapi Filter',
      text: 'Bulan dan tahun harus diisi',
      confirmButtonColor: '#4A90E2'
    });
    return;
  }
  
  contentEl.innerHTML = '<p class="text-center" style="padding:20px;"><div class="loading-spinner" style="margin:auto;"></div> Memuat data rekap...</p>';
  
  Swal.fire({
    title: 'Memuat Rekap...',
    text: 'Mohon tunggu sebentar',
    allowOutsideClick: false,
    showConfirmButton: false,
    willOpen: function() {
      Swal.showLoading();
    }
  });
  
  var response = await callApi('getRekapAbsensi', {
    token: sessionToken,
    kelas: kelas,
    bulan: parseInt(bulan),
    tahun: parseInt(tahun)
  });
  
  Swal.close();
  
  if (!response.success) {
    contentEl.innerHTML = `
      <div style="text-align:center;padding:30px;">
        <i class="bi bi-exclamation-circle" style="font-size:3rem;color:#FF6B6B;"></i>
        <h5 style="color:#FF6B6B;margin-top:10px;">Gagal Memuat</h5>
        <p style="color:#666;">${response.message || 'Terjadi kesalahan'}</p>
      </div>`;
    return;
  }
  
  var rekap = response.rekap || [];
  var tanggalEfektif = response.tanggalEfektif || [];
  var totalKelas = response.totalKelas || { hadir: 0, alpa: 0, sakit: 0, izin: 0, terlambat: 0 };
  var bulanNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 
                    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var namaBulan = bulanNames[parseInt(bulan) - 1];
  
  window._rekapData = response;
  window._rekapKelas = kelas;
  window._rekapBulan = bulan;
  window._rekapTahun = tahun;
  
  var html = `
    <div class="rekap-print" id="rekapPrintArea" style="margin-top:20px;">
      
      <!-- HEADER DENGAN LOGO RATA KIRI -->
      <div style="margin-bottom:20px;">
        <div class="header-logo">
          <img src="${APP_LOGO}" alt="Logo Sekolah">
          <div class="header-logo-text">
            <h4>${NAMA_SEKOLAH}</h4>
            <p>${ALAMAT_SEKOLAH}</p>
          </div>
        </div>
        <hr style="border:2px solid #333;margin:10px 0;">
        <h5 style="margin:8px 0;text-align:center;">REKAP ABSENSI SISWA</h5>
        <p style="margin:3px 0;text-align:center;">Bulan: <strong>${namaBulan} ${tahun}</strong> | Kelas: <strong>${kelas}</strong></p>
        <p style="margin:3px 0;color:#666;text-align:center;">Hari Efektif: <strong>${response.hariEfektif}</strong> hari</p>
      </div>
      
      <!-- TABEL REKAP -->
      <div class="table-container" style="overflow-x:auto;">
        <table style="font-size:0.75rem;min-width:800px;">
          <thead>
            <tr>
              <th style="width:30px;">No</th>
              <th style="min-width:120px;">Nama</th>`;
  
  tanggalEfektif.forEach(function(d) {
    html += '<th style="width:28px;text-align:center;">' + d + '</th>';
  });
  
  html += `
              <th style="width:30px;" title="Hadir">H</th>
              <th style="width:30px;" title="Alpa">A</th>
              <th style="width:30px;" title="Sakit">S</th>
              <th style="width:30px;" title="Izin">I</th>
              <th style="width:45px;" title="Terlambat">TL</th>
              <th style="width:50px;">%H</th>
            </tr>
          </thead>
          <tbody>`;
  
  if (rekap.length === 0) {
    html += '<tr><td colspan="' + (6 + tanggalEfektif.length) + '" style="text-align:center;padding:20px;">Tidak ada data absensi</td></tr>';
  } else {
    rekap.forEach(function(r, index) {
      html += '<tr>' +
        '<td style="text-align:center;">' + (index + 1) + '</td>' +
        '<td>' + r.nama + '</td>';
      
      tanggalEfektif.forEach(function(d) {
        var absen = r.absensi[d];
        var cell = '-';
        var style = '';
        
        if (absen) {
          if (absen.status === 'Hadir') {
            if (absen.ket === 'Terlambat') {
              cell = 'T';
              style = 'background:#fff3cd;color:#856404;';
            } else {
              cell = '✓';
              style = 'background:#d4edda;color:#155724;';
            }
          } else if (absen.status === 'Alpa') {
            cell = 'A';
            style = 'background:#f8d7da;color:#721c24;';
          } else if (absen.status === 'Sakit') {
            cell = 'S';
            style = 'background:#cce5ff;color:#004085;';
          } else if (absen.status === 'Izin') {
            cell = 'I';
            style = 'background:#fff3cd;color:#856404;';
          } else if (absen.status === 'Libur' || absen.ket === 'Libur') {
            cell = 'L';
            style = 'background:#e2e3e5;color:#383d41;';
          }
        }
        
        html += '<td style="text-align:center;' + style + '">' + cell + '</td>';
      });
      
      html += `
        <td style="text-align:center;">${r.hadir}</td>
        <td style="text-align:center;">${r.alpa}</td>
        <td style="text-align:center;">${r.sakit}</td>
        <td style="text-align:center;">${r.izin}</td>
        <td style="text-align:center;">${r.terlambat}</td>
        <td style="text-align:center;font-weight:bold;">${r.persenHadir}%</td>
        </tr>`;
    });
  }
  
  html += `
          </tbody>
          <tfoot>
            <tr style="background:#f0f0f0;font-weight:bold;">
              <td colspan="2" style="text-align:right;">TOTAL KELAS</td>`;
  
  tanggalEfektif.forEach(function() {
    html += '<td></td>';
  });
  
  html += `
              <td style="text-align:center;">${totalKelas.hadir}</td>
              <td style="text-align:center;">${totalKelas.alpa}</td>
              <td style="text-align:center;">${totalKelas.sakit}</td>
              <td style="text-align:center;">${totalKelas.izin}</td>
              <td style="text-align:center;">${totalKelas.terlambat}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      
      <!-- RINGKASAN -->
      <div class="ringkasan">
        <strong>Ringkasan Kelas ${kelas}:</strong><br>
        Total Hadir: ${totalKelas.hadir} | 
        Alpa: ${totalKelas.alpa} | 
        Sakit: ${totalKelas.sakit} | 
        Izin: ${totalKelas.izin} | 
        Terlambat: ${totalKelas.terlambat}
      </div>
      
      <!-- TANDA TANGAN -->
      <div class="signatures">
        <div class="sign-box">
          <p>Mengetahui,</p>
          <p style="font-weight:bold;">Kepala Sekolah</p>
          <div class="name">_____________________</div>
        </div>
        <div class="sign-box">
          <p>${namaBulan} ${tahun},</p>
          <p style="font-weight:bold;">Wali Kelas</p>
          <div class="name">${userData?.nama || '_____________________'}</div>
        </div>
      </div>
      
    </div>`;
  
  contentEl.innerHTML = html;
}

function cetakRekap() {
  var rekapArea = document.getElementById('rekapPrintArea');
  
  if (!rekapArea) {
    Swal.fire({
      icon: 'warning',
      title: 'Tampilkan Dulu',
      text: 'Silakan klik "Tampilkan" terlebih dahulu untuk memuat data rekap',
      confirmButtonColor: '#4A90E2'
    });
    return;
  }
  
  var printWindow = window.open('', '_blank', 'width=1000,height=700');
  
  printWindow.document.write('<!DOCTYPE html>\n' +
    '<html>\n' +
    '<head>\n' +
    '  <meta charset="UTF-8">\n' +
    '  <title>Rekap Absensi</title>\n' +
    '  <style>\n' +
    '    * { margin: 0; padding: 0; box-sizing: border-box; }\n' +
    '    body { font-family: Arial, sans-serif; padding: 20px; font-size: 11px; }\n' +
    '    table { width: 100%; border-collapse: collapse; font-size: 9px; }\n' +
    '    th, td { border: 1px solid #000; padding: 4px 6px; text-align: center; }\n' +
    '    th { background: #e0e0e0; font-weight: bold; }\n' +
    '    .header-logo{display:flex;align-items:center;gap:15px;margin-bottom:10px}' +
    '    .header-logo img{width:65px;height:65px;object-fit:contain}' +
    '    .header-logo-text{text-align:left}' +
    '    .header-logo-text h4{font-size:14px;margin:0}' +
    '    .header-logo-text p{font-size:10px;margin:2px 0;color:#555}' +
    '    .divider { border-top: 2px solid #000; margin: 10px 0; }\n' +
    '    .signatures { display: flex; justify-content: space-between; margin-top: 40px; }\n' +
    '    .sign-box { text-align: center; width: 40%; }\n' +
    '    .sign-box .name { margin-top: 50px; }\n' +
    '    .ringkasan { margin-top: 15px; padding: 10px; background: #f8f9fa; border: 1px solid #ddd; font-size: 10px; }\n' +
    '    @page { size: landscape; margin: 0.8cm; }\n' +
    '  </style>\n' +
    '</head>\n' +
    '<body>\n' +
    '  ' + rekapArea.outerHTML + '\n' +
    '  <script>\n' +
    '    window.onload = function() {\n' +
    '      setTimeout(function() { window.print(); }, 500);\n' +
    '    };\n' +
    '  <\/script>\n' +
    '</body>\n' +
    '</html>');
  
  printWindow.document.close();
}

// ============ PENGATURAN ============
async function renderPengaturan(container) {
  const response = await callApi('getPengaturan', { token: sessionToken });
  
  container.innerHTML = `
    <h5><i class="bi bi-gear"></i> Pengaturan Sistem</h5>
    
    <form id="pengaturanForm" onsubmit="event.preventDefault(); savePengaturan();">
      
      <!-- Jam Batas Telat Normal -->
      <div class="pengaturan-section">
        <h6><i class="bi bi-clock"></i> Jam Batas Telat Normal</h6>
        <p class="pengaturan-info">Berlaku untuk siswa reguler tanpa keterangan khusus.</p>
        <div class="stats-row" style="grid-template-columns:1fr 1fr;">
          <div class="form-group">
            <label class="form-label">Jam Batas Telat</label>
            <input type="time" class="form-control" id="jamTelatNormal" 
                   value="${response.success ? (response.pengaturan?.jam_telat_normal?.value || '07:30') : '07:30'}">
          </div>
        </div>
      </div>
      
      <!-- Jam Batas Telat Khusus -->
      <div class="pengaturan-section">
        <h6><i class="bi bi-clock-history"></i> Jam Batas Telat Khusus</h6>
        <p class="pengaturan-info">Berlaku untuk siswa dengan keterangan "Berkebutuhan Khusus" atau mengandung kata "Khusus".</p>
        <div class="stats-row" style="grid-template-columns:1fr 1fr;">
          <div class="form-group">
            <label class="form-label">Jam Batas Telat</label>
            <input type="time" class="form-control" id="jamTelatKhusus" 
                   value="${response.success ? (response.pengaturan?.jam_telat_khusus?.value || '08:00') : '08:00'}">
          </div>
        </div>
      </div>
      
      <!-- Jam Batas Telat Nursery -->
      <div class="pengaturan-section">
        <h6><i class="bi bi-flower1"></i> Jam Batas Telat Nursery</h6>
        <p class="pengaturan-info">Berlaku untuk siswa dengan keterangan "Nursery" (case insensitive). Cocok untuk siswa PAUD/TK.</p>
        <div class="stats-row" style="grid-template-columns:1fr 1fr;">
          <div class="form-group">
            <label class="form-label">Jam Batas Telat</label>
            <input type="time" class="form-control" id="jamTelatNursery" 
                   value="${response.success ? (response.pengaturan?.jam_telat_nursery?.value || '08:30') : '08:30'}">
          </div>
        </div>
      </div>
      
      <button type="submit" class="btn btn-primary"><i class="bi bi-save"></i> Simpan Pengaturan</button>
    </form>
    
    <hr style="margin:25px 0;">
    
    <!-- Hari Libur -->
    <h6><i class="bi bi-calendar-x"></i> Hari Libur</h6>
    <div class="stats-row" style="grid-template-columns:1fr 1fr auto;">
      <div class="form-group"><label class="form-label">Tanggal</label><input type="date" class="form-control" id="liburTanggal"></div>
      <div class="form-group"><label class="form-label">Keterangan</label><input type="text" class="form-control" id="liburKeterangan" placeholder="Contoh: Hari Raya Idul Fitri"></div>
      <div class="form-group" style="display:flex;align-items:flex-end;">
        <button class="btn btn-primary" onclick="saveHariLibur()"><i class="bi bi-plus"></i> Tambah</button>
      </div>
    </div>
    
    <div class="table-container mt-3">
      <table><thead><tr><th>Tanggal</th><th>Keterangan</th><th>Aksi</th></tr></thead>
      <tbody id="liburTable"></tbody></table>
    </div>
  `;
  
  loadHariLibur();
}

async function savePengaturan() {
  const pengaturan = {
    jam_telat_normal: document.getElementById('jamTelatNormal')?.value || '07:30',
    jam_telat_khusus: document.getElementById('jamTelatKhusus')?.value || '08:00',
    jam_telat_nursery: document.getElementById('jamTelatNursery')?.value || '08:30'
  };
  
  Swal.fire({ title: 'Menyimpan...', allowOutsideClick: false, showConfirmButton: false, willOpen: () => Swal.showLoading() });
  
  const response = await callApi('savePengaturan', { token: sessionToken, pengaturan });
  
  if (response.success) {
    Swal.fire({ icon: 'success', title: 'Berhasil', text: 'Pengaturan berhasil disimpan', timer: 2000, showConfirmButton: false });
  } else {
    Swal.fire({ icon: 'error', title: 'Gagal', text: response.message, confirmButtonColor: '#4A90E2' });
  }
}

async function loadHariLibur() {
  const response = await callApi('getHariLibur', { token: sessionToken });
  
  const tbody = document.getElementById('liburTable');
  if (!tbody) return;
  
  if (response.success && response.hariLibur.length > 0) {
    tbody.innerHTML = response.hariLibur.map(h => `
      <tr>
        <td>${h.tanggal}</td>
        <td>${h.keterangan}</td>
        <td><button class="btn btn-sm btn-danger" onclick="deleteHariLibur('${h.tanggal}')"><i class="bi bi-trash"></i></button></td>
      </tr>
    `).join('');
  } else {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center">Belum ada data hari libur</td></tr>';
  }
}

async function saveHariLibur() {
  const tanggal = document.getElementById('liburTanggal')?.value;
  const keterangan = document.getElementById('liburKeterangan')?.value;
  
  if (!tanggal) {
    Swal.fire({ icon: 'warning', title: 'Pilih Tanggal', confirmButtonColor: '#4A90E2' });
    return;
  }
  
  const response = await callApi('saveHariLibur', { token: sessionToken, hariLibur: { tanggal, keterangan } });
  
  Swal.fire({ icon: response.success ? 'success' : 'error', title: response.message, timer: 2000, showConfirmButton: false });
  
  if (response.success) {
    document.getElementById('liburTanggal').value = '';
    document.getElementById('liburKeterangan').value = '';
    loadHariLibur();
  }
}

async function deleteHariLibur(tanggal) {
  const result = await Swal.fire({
    title: 'Hapus Hari Libur?', icon: 'warning',
    showCancelButton: true, confirmButtonColor: '#FF6B6B', cancelButtonColor: '#4A90E2'
  });
  
  if (result.isConfirmed) {
    const response = await callApi('deleteHariLibur', { token: sessionToken, tanggal });
    Swal.fire({ icon: response.success ? 'success' : 'error', title: response.message, timer: 2000, showConfirmButton: false });
    if (response.success) loadHariLibur();
  }
}

// ============ GANTI PASSWORD ============
function renderGantiPassword(container) {
  container.innerHTML = `
    <h5><i class="bi bi-key"></i> Ganti Password</h5>
    
    <form onsubmit="event.preventDefault(); gantiPassword();">
      <div class="form-group"><label class="form-label">Password Lama</label><input type="password" class="form-control" id="oldPass" required></div>
      <div class="form-group"><label class="form-label">Password Baru</label><input type="password" class="form-control" id="newPass" required minlength="6"></div>
      <div class="form-group"><label class="form-label">Konfirmasi Password Baru</label><input type="password" class="form-control" id="confirmPass" required></div>
      <button type="submit" class="btn btn-primary"><i class="bi bi-check-circle"></i> Ganti Password</button>
    </form>
  `;
}

async function gantiPassword() {
  const oldPass = document.getElementById('oldPass')?.value;
  const newPass = document.getElementById('newPass')?.value;
  const confirmPass = document.getElementById('confirmPass')?.value;
  
  if (!oldPass || !newPass || !confirmPass) {
    Swal.fire({ icon: 'warning', title: 'Lengkapi Form', confirmButtonColor: '#4A90E2' });
    return;
  }
  
  if (newPass !== confirmPass) {
    Swal.fire({ icon: 'error', title: 'Tidak Cocok', text: 'Password baru tidak cocok', confirmButtonColor: '#4A90E2' });
    return;
  }
  
  if (newPass.length < 6) {
    Swal.fire({ icon: 'warning', title: 'Terlalu Pendek', text: 'Minimal 6 karakter', confirmButtonColor: '#4A90E2' });
    return;
  }
  
  Swal.fire({ title: 'Mengganti...', allowOutsideClick: false, showConfirmButton: false, willOpen: () => Swal.showLoading() });
  
  const response = await callApi('doChangePassword', { token: sessionToken, oldPassword: oldPass, newPassword: newPass });
  
  if (response.success) {
    Swal.fire({ icon: 'success', title: 'Berhasil!', text: 'Password berhasil diubah', timer: 2000, showConfirmButton: false });
  } else {
    Swal.fire({ icon: 'error', title: 'Gagal', text: response.message, confirmButtonColor: '#4A90E2' });
  }
}

// ============ UTILITY FUNCTIONS ============
function toggleFullScreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen();
  }
}

function formatRupiah(angka) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0
  }).format(angka);
}

// Handle clicks outside search results
document.addEventListener('click', function(e) {
  const searchResults = document.getElementById('searchResults');
  if (searchResults && !e.target.closest('#searchNamaManual') && !e.target.closest('#searchResults')) {
    searchResults.style.display = 'none';
  }
});
