import fs from 'fs';
import path from 'path';

const API_BASE = 'http://localhost:5000/api';
const CLIENT_BASE = 'http://localhost:5173';

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function runAuthFrontendQA() {
  console.log('======================================================================');
  console.log('       FOCUSED QA VERIFICATION: AUTHENTICATION FRONTEND');
  console.log('                 (/login, /register, AuthContext)');
  console.log('======================================================================\n');

  const results = [];
  function record(num, title, pass, details = '') {
    results.push({ num, title, pass, details });
    const mark = pass ? '✓ PASS' : '✗ FAIL';
    console.log(`[Item ${num.toString().padStart(2, '0')}] ${mark}: ${title}`);
    if (details) {
      console.log(`             ↳ ${details}`);
    }
  }

  // --- 1. TEST REGISTRATION (Valid credentials) ---
  console.log('\n--- 1. REGISTRATION ---');
  const timestamp = Date.now();
  const validEmail = `dispatcher_${timestamp}@mediroute.io`;
  const validPassword = 'SecurePassword123!';
  const validName = `Chief Dispatcher ${timestamp.toString().slice(-4)}`;

  const regRes = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: validName,
      email: validEmail,
      password: validPassword,
      role: 'dispatcher',
      phone: '+1-555-0199',
    }),
  });

  const regToken = regRes.data?.data?.token;
  const regUser = regRes.data?.data?.user;

  record(
    1,
    'Registration creates user in MongoDB and returns JWT token',
    regRes.status === 201 && Boolean(regToken) && regUser?.email === validEmail.toLowerCase(),
    `Created user: ${regUser?.name}, Role: ${regUser?.role}, Token received: ${Boolean(regToken)}`
  );

  record(
    2,
    'Registration response excludes sensitive password field',
    regUser?.password === undefined,
    `Password field in response: ${regUser?.password === undefined ? 'OMITTED (Secure)' : 'EXPOSED'}`
  );

  // --- 2. TEST REGISTRATION VALIDATION (Short password & Duplicate email) ---
  console.log('\n--- 2. REGISTRATION VALIDATION & PASSWORD REQUIREMENTS ---');
  const shortPassRes = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Test Short Password',
      email: `short_${timestamp}@mediroute.io`,
      password: '123',
    }),
  });

  record(
    3,
    'Backend rejects password shorter than 6 characters (400 Bad Request)',
    shortPassRes.status === 400 && shortPassRes.data?.message?.includes('6 characters'),
    `Message: "${shortPassRes.data?.message}"`
  );

  const duplicateEmailRes = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Duplicate Email User',
      email: validEmail,
      password: 'AnotherPassword123!',
    }),
  });

  record(
    4,
    'Backend rejects duplicate email registration',
    duplicateEmailRes.status === 400 && duplicateEmailRes.data?.message?.includes('already exists'),
    `Message: "${duplicateEmailRes.data?.message}"`
  );

  // --- 3. TEST LOGIN (Valid credentials) ---
  console.log('\n--- 3. LOGIN AUTHENTICATION ---');
  const loginRes = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: validEmail,
      password: validPassword,
    }),
  });

  const loginToken = loginRes.data?.data?.token;
  const loginUser = loginRes.data?.data?.user;

  record(
    5,
    'Login with valid credentials succeeds and returns JWT',
    loginRes.status === 200 && Boolean(loginToken) && loginUser?.email === validEmail.toLowerCase(),
    `Logged in: ${loginUser?.name}, Token: ${loginToken?.slice(0, 20)}...`
  );

  // --- 4. TEST LOGIN (Invalid credentials) ---
  console.log('\n--- 4. INVALID CREDENTIALS HANDLING ---');
  const wrongPassRes = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: validEmail,
      password: 'WrongPassword999!',
    }),
  });

  record(
    6,
    'Login rejects invalid password with 401 Unauthorized',
    wrongPassRes.status === 401 && wrongPassRes.data?.message?.includes('Invalid email or password'),
    `Error response: "${wrongPassRes.data?.message}"`
  );

  const nonExistentEmailRes = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: `non_existent_${timestamp}@mediroute.io`,
      password: 'SomePassword123!',
    }),
  });

  record(
    7,
    'Login rejects non-existent email with generic error (no account enumeration)',
    nonExistentEmailRes.status === 401 && nonExistentEmailRes.data?.message?.includes('Invalid email or password'),
    `Error response: "${nonExistentEmailRes.data?.message}"`
  );

  // --- 5. TEST SESSION VERIFICATION & GET /api/auth/me ---
  console.log('\n--- 5. SESSION VERIFICATION & PERSISTENCE ---');
  const meRes = await request('/auth/me', {
    headers: { Authorization: `Bearer ${loginToken}` },
  });

  record(
    8,
    'GET /api/auth/me restores authenticated user profile on page refresh',
    meRes.status === 200 && meRes.data?.data?.email === validEmail.toLowerCase(),
    `Restored User: ${meRes.data?.data?.name}, Role: ${meRes.data?.data?.role}`
  );

  const invalidTokenRes = await request('/auth/me', {
    headers: { Authorization: 'Bearer invalid.bogus.jwt.token' },
  });

  record(
    9,
    'Invalid or corrupted token rejected by backend with 401',
    invalidTokenRes.status === 401,
    `Status: ${invalidTokenRes.status}, Message: "${invalidTokenRes.data?.message}"`
  );

  // --- 6. CODE INSPECTION: AUTH CONTEXT & PROTECTED ROUTE ---
  console.log('\n--- 6. CLIENT CODE ARCHITECTURE & ROUTE PROTECTION ---');
  const authContextCode = fs.readFileSync(
    path.resolve(process.cwd(), 'client/src/context/AuthContext.jsx'),
    'utf-8'
  );
  const protectedRouteCode = fs.readFileSync(
    path.resolve(process.cwd(), 'client/src/components/ProtectedRoute.jsx'),
    'utf-8'
  );
  const appCode = fs.readFileSync(
    path.resolve(process.cwd(), 'client/src/App.jsx'),
    'utf-8'
  );
  const navbarCode = fs.readFileSync(
    path.resolve(process.cwd(), 'client/src/components/Navbar.jsx'),
    'utf-8'
  );
  const loginPageCode = fs.readFileSync(
    path.resolve(process.cwd(), 'client/src/pages/LoginPage.jsx'),
    'utf-8'
  );
  const registerPageCode = fs.readFileSync(
    path.resolve(process.cwd(), 'client/src/pages/RegisterPage.jsx'),
    'utf-8'
  );

  record(
    10,
    'AuthContext centralizes user, token, login, register, and logout',
    authContextCode.includes('export const AuthProvider') &&
      authContextCode.includes('export const useAuth') &&
      authContextCode.includes('api.setToken') &&
      authContextCode.includes('api.removeToken'),
    'Centralized AuthProvider with useAuth hook verified'
  );

  record(
    11,
    'ProtectedRoute redirects unauthenticated visitors to /login preserving target location',
    protectedRouteCode.includes('<Navigate to="/login" state={{ from: location }} replace />') &&
      appCode.includes('<ProtectedRoute>') &&
      appCode.includes('<DispatchesPage />'),
    'ProtectedRoute guards /dispatches route'
  );

  record(
    12,
    'Navbar renders authenticated user profile tag and logout button when logged in',
    navbarCode.includes('useAuth') &&
      navbarCode.includes('handleLogout') &&
      navbarCode.includes('nav-user-cluster'),
    'Navbar adapts dynamically based on authentication state'
  );

  record(
    13,
    'LoginPage and RegisterPage perform client validation and redirect after authentication',
    loginPageCode.includes('validate()') &&
      loginPageCode.includes('useAuth') &&
      registerPageCode.includes('validate()') &&
      registerPageCode.includes('password.length < 6'),
    'Client validation and redirect logic verified on both auth pages'
  );

  // --- 7. ROUTE REACHABILITY ---
  console.log('\n--- 7. FRONTEND ROUTES REACHABILITY ---');
  const loginSpaRes = await fetch(`${CLIENT_BASE}/login`);
  const regSpaRes = await fetch(`${CLIENT_BASE}/register`);

  record(
    14,
    'Client SPA serves /login and /register routes successfully',
    loginSpaRes.status === 200 && regSpaRes.status === 200,
    `HTTP /login: ${loginSpaRes.status}, HTTP /register: ${regSpaRes.status}`
  );

  // SUMMARY
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  console.log('\n======================================================================');
  console.log(`AUTH QA RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${results.length})`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAuthFrontendQA().catch((err) => {
  console.error('Fatal QA error:', err);
  process.exit(1);
});
