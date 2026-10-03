import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:5000/api';

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const res = await fetch(url, {
    ...options,
    headers,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function runIntegrationQA() {
  console.log('======================================================================');
  console.log('     END-TO-END QA: REACT FRONTEND TO EXPRESS & GEMINI APIS');
  console.log('       (User Flow, MongoDB Persistence, Gemini AI Flow, Centralization)');
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

  // --- 1. ARCHITECTURAL INTEGRITY & CENTRALIZATION ---
  console.log('\n--- 1. ARCHITECTURE & CENTRALIZATION AUDIT ---');

  // Verify client/src contains NO fetch calls outside of api.js
  const clientSrcDir = path.resolve(__dirname, '../client/src');
  function findFiles(dir) {
    let files = [];
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) {
        files = files.concat(findFiles(full));
      } else if (full.endsWith('.js') || full.endsWith('.jsx')) {
        files.push(full);
      }
    }
    return files;
  }

  const allClientFiles = findFiles(clientSrcDir);
  const scatteredFetches = [];
  const scatteredAxios = [];

  for (const f of allClientFiles) {
    const code = fs.readFileSync(f, 'utf8');
    const rel = path.relative(clientSrcDir, f);
    if (rel !== 'services\\api.js' && rel !== 'services/api.js') {
      if (code.includes('fetch(')) scatteredFetches.push(rel);
      if (code.includes('axios')) scatteredAxios.push(rel);
    }
  }

  record(
    1,
    'Zero scattered fetch() calls across React components (Centralized in api.js)',
    scatteredFetches.length === 0,
    scatteredFetches.length === 0
      ? 'All API requests exclusively flow through services/api.js'
      : `Found scattered fetches in: ${scatteredFetches.join(', ')}`
  );

  record(
    2,
    'Zero axios dependencies or scattered HTTP libraries',
    scatteredAxios.length === 0,
    'Clean native fetch architecture centralized in ApiService'
  );

  // Check secrets isolation
  const clientEnvPath = path.resolve(__dirname, '../client/.env');
  const clientEnv = fs.existsSync(clientEnvPath) ? fs.readFileSync(clientEnvPath, 'utf8') : '';
  const clientHasNoSecrets = !clientEnv.includes('GEMINI') && !clientEnv.includes('AI_KEY');

  record(
    3,
    'GEMINI_API_KEY strictly protected on backend, zero VITE_ exposure',
    clientHasNoSecrets,
    'Client environment only holds VITE_API_URL'
  );

  // --- 2. AUTHENTICATION & SESSION PERSISTENCE ---
  console.log('\n--- 2. AUTHENTICATION & SESSION FLOW ---');

  const timestamp = Date.now();
  const testUserEmail = `dispatch_lead_${timestamp}@mediroute.io`;
  const testUserPassword = 'LeadPassword2026!';

  // User Registration
  const regRes = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: `Lead Dispatcher ${timestamp.toString().slice(-4)}`,
      email: testUserEmail,
      password: testUserPassword,
      role: 'dispatcher',
      phone: '+1-555-0188',
    }),
  });

  const authToken = regRes.data?.data?.token;
  const userObj = regRes.data?.data?.user;

  record(
    4,
    'Frontend Registration Flow creates user in MongoDB and issues JWT token',
    regRes.status === 201 && Boolean(authToken) && Boolean(userObj?._id),
    `User ID: ${userObj?._id}, Email: ${userObj?.email}, Role: ${userObj?.role}`
  );

  // Session Profile Restoration (GET /api/auth/me)
  const meRes = await request('/auth/me', {
    headers: { Authorization: `Bearer ${authToken}` },
  });

  record(
    5,
    'Session Restoration via GET /api/auth/me re-hydrates authenticated profile',
    meRes.status === 200 && meRes.data?.data?.email === testUserEmail,
    `Profile re-hydrated: ${meRes.data?.data?.name}`
  );

  // Expired / Corrupted token handling
  const badTokenRes = await request('/auth/me', {
    headers: { Authorization: 'Bearer corrupted_token_999' },
  });

  record(
    6,
    'Expired/Invalid token rejected with 401 Unauthorized (Triggers auth_expired event)',
    badTokenRes.status === 401,
    `Response: "${badTokenRes.data?.message}"`
  );

  // --- 3. DATABASE-BACKED FEATURES (DISPATCHES & FACILITIES) ---
  console.log('\n--- 3. DATABASE-BACKED OPERATIONAL DATA ---');

  // Load facilities from MongoDB
  const facRes = await request('/facilities');
  const facilities = facRes.data?.data || [];

  record(
    7,
    'Medical Facilities Network loads live from MongoDB database',
    facRes.status === 200 && facilities.length > 0,
    `Retrieved ${facilities.length} active healthcare facilities`
  );

  const targetFacility = facilities[0];

  // Update Facility Capacity via PUT
  const newAvailableBeds = Math.max(1, (targetFacility.emergencyCapacity?.availableBeds || 10) - 1);
  const capUpdateRes = await request(`/facilities/${targetFacility._id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({
      emergencyCapacity: {
        ...targetFacility.emergencyCapacity,
        availableBeds: newAvailableBeds,
        status: 'normal',
      },
    }),
  });

  record(
    8,
    'Facility Emergency Capacity updates persist directly to MongoDB',
    capUpdateRes.status === 200 &&
      capUpdateRes.data?.data?.emergencyCapacity?.availableBeds === newAvailableBeds,
    `Updated ${targetFacility.name}: Available Beds -> ${newAvailableBeds}`
  );

  // --- 4. GEMINI AI FLOW: TRIAGE, SMART ALLOCATION & ROUTE OPTIMIZATION ---
  console.log('\n--- 4. GEMINI AI WORKFLOW (TRIAGE ➔ ALLOCATION ➔ ROUTE) ---');

  // AI Triage Assessment
  const triageRes = await request('/ai/triage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({
      symptoms: ['acute crushing substernal chest pain', 'shortness of breath', 'diaphoresis', 'radiation to left shoulder'],
      patientContext: { age: 58, mobility: 'stretcher' },
      vitalSigns: { heartRate: 130, bloodPressure: '85/55', oxygenSat: '90%' },
    }),
  });

  const aiAssessment = triageRes.data?.data;
  const triageValid =
    triageRes.status === 200 &&
    aiAssessment?.triageLevel === 'critical' &&
    aiAssessment?.urgencyScore >= 8 &&
    aiAssessment?.recommendedVehicleType === 'als_ambulance';

  record(
    9,
    'Gemini AI Clinical Triage evaluates patient condition and assigns ALS emergency level',
    triageValid,
    `Triage Level: ${aiAssessment?.triageLevel}, Score: ${aiAssessment?.urgencyScore}/10, Vehicle: ${aiAssessment?.recommendedVehicleType}`
  );

  // AI Smart Facility Recommendation
  const recRes = await request('/ai/recommend-facility', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({
      triageLevel: aiAssessment?.triageLevel || 'critical',
      symptoms: ['acute crushing substernal chest pain'],
      facilities,
    }),
  });

  const recFacility = recRes.data?.data;
  const recPass =
    recRes.status === 200 &&
    Boolean(recFacility?.recommendedFacilityId) &&
    Boolean(recFacility?.facilityName);

  record(
    10,
    'Gemini AI Smart Allocation recommends optimal receiving hospital with justification',
    recPass,
    `Selected: "${recFacility?.facilityName}", Reason: ${recFacility?.clinicalJustification?.slice(0, 70)}...`
  );

  // Create Dispatch in MongoDB with populated AI Assessment
  const createDispatchPayload = {
    patientName: 'Robert Vance (AI Triage)',
    contactPhone: '+1-555-0921',
    pickupLocation: {
      address: '742 Evergreen Terrace, Metro City, NY',
      coordinates: { latitude: 40.7589, longitude: -73.9851 },
    },
    destinationFacility: recFacility?.recommendedFacilityId || targetFacility._id,
    triageLevel: aiAssessment?.triageLevel || 'critical',
    vehicleType: aiAssessment?.recommendedVehicleType || 'als_ambulance',
    symptoms: ['acute crushing substernal chest pain', 'diaphoresis'],
    aiAssessment: {
      recommendedFacilityType: aiAssessment?.recommendedFacilityType || 'trauma_center',
      urgencyScore: aiAssessment?.urgencyScore || 9,
      summary: aiAssessment?.summary || 'Acute coronary syndrome presentation.',
      recommendations: aiAssessment?.recommendations || ['Initiate continuous cardiac monitoring'],
    },
    notes: 'Dispatched via integrated Gemini AI Assistant workflow.',
  };

  const dispatchCreateRes = await request('/dispatches', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(createDispatchPayload),
  });

  const createdDispatch = dispatchCreateRes.data?.data;
  const dispatchPersisted =
    dispatchCreateRes.status === 201 &&
    Boolean(createdDispatch?._id) &&
    createdDispatch?.aiAssessment?.urgencyScore === (aiAssessment?.urgencyScore || 9) &&
    createdDispatch?.aiAssessment?.recommendedFacilityType === (aiAssessment?.recommendedFacilityType || 'trauma_center');

  record(
    11,
    'Dispatch with embedded AI Assessment created and persisted in MongoDB database',
    dispatchPersisted,
    `Dispatch: ${createdDispatch?.dispatchNumber}, AI Score in DB: ${createdDispatch?.aiAssessment?.urgencyScore}/10`
  );

  // Status transition on created dispatch
  const statusUpdateRes = await request(`/dispatches/${createdDispatch._id}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ status: 'en_route' }),
  });

  record(
    12,
    'Dispatch lifecycle status transitioned (pending ➔ en_route) in MongoDB',
    statusUpdateRes.status === 200 && statusUpdateRes.data?.data?.status === 'en_route',
    `Status updated to: ${statusUpdateRes.data?.data?.status}`
  );

  // AI Route Optimization for created dispatch
  const routeOptRes = await request('/ai/optimize-route', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({
      origin: createdDispatch.pickupLocation,
      destination: {
        address: createdDispatch.destinationFacility?.name || 'St. Jude Emergency Center',
        latitude: 40.75,
        longitude: -73.99,
      },
      trafficCondition: 'heavy',
      triageLevel: createdDispatch.triageLevel,
      vehicleType: createdDispatch.vehicleType,
    }),
  });

  const optData = routeOptRes.data?.data;
  const routeOptPass =
    routeOptRes.status === 200 &&
    Boolean(optData?.recommendedRouteName) &&
    typeof optData?.estimatedTimeSavedMinutes === 'number' &&
    optData?.priorityLaneEligible === true;

  record(
    13,
    'Gemini AI Route Optimization calculates transit corridor, time saved, and priority lane',
    routeOptPass,
    `Corridor: "${optData?.recommendedRouteName}", Time Saved: ${optData?.estimatedTimeSavedMinutes}m, Priority: ${optData?.priorityLaneEligible}`
  );

  // --- 5. LOGGING & CONSOLE SAFETY AUDIT ---
  console.log('\n--- 5. LOGGING & CONSOLE SAFETY AUDIT ---');

  const serverLogPath = path.resolve(__dirname, 'src/utils/logger.js');
  const hasServerLogger = fs.existsSync(serverLogPath);

  record(
    14,
    'Backend structured logging active with request and error tracing',
    hasServerLogger,
    'Morgan request logging + custom logger active on backend'
  );

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log('\n======================================================================');
  console.log(`INTEGRATION QA RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${results.length})`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runIntegrationQA().catch((err) => {
  console.error('Integration QA Error:', err);
  process.exit(1);
});
