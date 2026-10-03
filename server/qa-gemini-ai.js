import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cleanAndParseJsonResponse } from './src/services/geminiService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:5000/api';

let authToken = null;

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (authToken && !headers.Authorization) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  const res = await fetch(url, {
    headers,
    ...options,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function runGeminiAiQA() {
  console.log('======================================================================');
  console.log('       FOCUSED QA VERIFICATION: GEMINI AI INTEGRATION');
  console.log('                 (React -> Express -> Gemini)');
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

  // Obtain operational auth token
  const authLoginRes = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@mediroute.io', password: 'Admin@123456' }),
  });
  authToken = authLoginRes.data?.data?.token;

  // --- 1. SECURITY & KEY ISOLATION ---
  console.log('\n--- 1. SECURITY & ARCHITECTURE ISOLATION ---');

  // Verify client .env and code has NO Gemini API key
  const clientEnvPath = path.resolve(__dirname, '../client/.env');
  const clientEnvExPath = path.resolve(__dirname, '../client/.env.example');
  const clientEnv = fs.existsSync(clientEnvPath) ? fs.readFileSync(clientEnvPath, 'utf8') : '';
  const clientEnvEx = fs.existsSync(clientEnvExPath) ? fs.readFileSync(clientEnvExPath, 'utf8') : '';

  const clientHasNoGemini =
    !clientEnv.includes('GEMINI') &&
    !clientEnvEx.includes('GEMINI') &&
    !clientEnv.includes('AI_KEY');

  record(
    1,
    'GEMINI_API_KEY does NOT exist in client environment or VITE variables',
    clientHasNoGemini,
    'Verified client/.env and client/.env.example have 0 references to GEMINI_API_KEY'
  );

  // Status check: /api/ai/status
  const statusRes = await request('/ai/status');
  const statusSafe =
    statusRes.status === 200 &&
    statusRes.data?.success === true &&
    typeof statusRes.data?.data?.configured === 'boolean' &&
    statusRes.data?.data?.model === 'gemini-2.5-flash' &&
    !JSON.stringify(statusRes.data).includes('AIza');

  record(
    2,
    'GET /api/ai/status returns operational readiness without exposing secrets',
    statusSafe,
    `Mode: ${statusRes.data?.data?.mode}, Configured: ${statusRes.data?.data?.configured}`
  );

  // --- 2. INPUT VALIDATION ---
  console.log('\n--- 2. INPUT VALIDATION (400 BAD REQUEST) ---');

  // Empty payload
  const emptyTriage = await request('/ai/triage', { method: 'POST', body: JSON.stringify({}) });
  record(
    3,
    'POST /api/ai/triage rejects missing symptoms with 400 Bad Request',
    emptyTriage.status === 400 && !emptyTriage.data?.success,
    `Status: ${emptyTriage.status}, Error: "${emptyTriage.data?.message}"`
  );

  // Empty string
  const whitespaceTriage = await request('/ai/triage', {
    method: 'POST',
    body: JSON.stringify({ symptoms: '    ' }),
  });
  record(
    4,
    'POST /api/ai/triage rejects whitespace-only symptoms with 400 Bad Request',
    whitespaceTriage.status === 400,
    `Status: ${whitespaceTriage.status}, Error: "${whitespaceTriage.data?.message}"`
  );

  // Empty array
  const emptyArrTriage = await request('/ai/triage', {
    method: 'POST',
    body: JSON.stringify({ symptoms: [] }),
  });
  record(
    5,
    'POST /api/ai/triage rejects empty symptoms array with 400 Bad Request',
    emptyArrTriage.status === 400,
    `Status: ${emptyArrTriage.status}, Error: "${emptyArrTriage.data?.message}"`
  );

  // Missing route endpoints
  const badRoute = await request('/ai/optimize-route', {
    method: 'POST',
    body: JSON.stringify({ origin: null, destination: null }),
  });
  record(
    6,
    'POST /api/ai/optimize-route rejects missing endpoints with 400 Bad Request',
    badRoute.status === 400,
    `Status: ${badRoute.status}, Error: "${badRoute.data?.message}"`
  );

  // --- 3. CLINICAL TRIAGE SUCCESS RESPONSES ---
  console.log('\n--- 3. CLINICAL TRIAGE ASSESSMENTS ---');

  // Critical Emergency
  const critTriage = await request('/ai/triage', {
    method: 'POST',
    body: JSON.stringify({
      symptoms: ['severe crushing chest pain', 'cardiac arrest risk', 'diaphoresis', 'dyspnea'],
      patientContext: { age: 62, mobility: 'stretcher' },
      vitalSigns: { heartRate: 145, bloodPressure: '80/50', oxygenSat: '88%' },
    }),
  });
  const critData = critTriage.data?.data;
  const critPass =
    critTriage.status === 200 &&
    critData?.triageLevel === 'critical' &&
    critData?.urgencyScore >= 8 &&
    critData?.recommendedVehicleType === 'als_ambulance' &&
    critData?.recommendedFacilityType === 'trauma_center' &&
    Array.isArray(critData?.recommendations) &&
    critData.recommendations.length > 0;

  record(
    7,
    'POST /api/ai/triage evaluates Critical cardiac emergency correctly',
    critPass,
    `Priority: ${critData?.triageLevel}, Score: ${critData?.urgencyScore}/10, Vehicle: ${critData?.recommendedVehicleType}`
  );

  // Urgent Emergency
  const urgTriage = await request('/ai/triage', {
    method: 'POST',
    body: JSON.stringify({
      symptoms: 'compound arm fracture with moderate bleeding, severe localized pain',
      patientContext: { age: 29 },
    }),
  });
  const urgData = urgTriage.data?.data;
  const urgPass =
    urgTriage.status === 200 &&
    urgData?.triageLevel === 'urgent' &&
    urgData?.urgencyScore >= 5 &&
    urgData?.urgencyScore <= 7 &&
    urgData?.recommendedVehicleType === 'bls_ambulance';

  record(
    8,
    'POST /api/ai/triage evaluates Urgent orthopedic trauma correctly',
    urgPass,
    `Priority: ${urgData?.triageLevel}, Score: ${urgData?.urgencyScore}/10, Facility: ${urgData?.recommendedFacilityType}`
  );

  // Standard Non-emergent Transfer
  const stdTriage = await request('/ai/triage', {
    method: 'POST',
    body: JSON.stringify({
      symptoms: ['scheduled rehabilitation therapy', 'mild chronic stiffness'],
      patientContext: { age: 74, mobility: 'wheelchair' },
    }),
  });
  const stdData = stdTriage.data?.data;
  const stdPass =
    stdTriage.status === 200 &&
    stdData?.triageLevel === 'standard' &&
    stdData?.urgencyScore <= 4;

  record(
    9,
    'POST /api/ai/triage evaluates Standard transfer correctly',
    stdPass,
    `Priority: ${stdData?.triageLevel}, Score: ${stdData?.urgencyScore}/10, Vehicle: ${stdData?.recommendedVehicleType}`
  );

  // --- 4. ROUTE OPTIMIZATION & HAZARDS ---
  console.log('\n--- 4. EMERGENCY ROUTE OPTIMIZATION ---');

  const routeOptRes = await request('/ai/optimize-route', {
    method: 'POST',
    body: JSON.stringify({
      origin: { address: '450 West 33rd St, New York, NY', latitude: 40.7527, longitude: -73.9996 },
      destination: { address: 'St. Jude Emergency Center, NY', latitude: 40.7484, longitude: -73.9851 },
      trafficCondition: 'heavy',
      triageLevel: 'critical',
      vehicleType: 'als_ambulance',
    }),
  });
  const routeData = routeOptRes.data?.data;
  const routePass =
    routeOptRes.status === 200 &&
    Boolean(routeData?.recommendedRouteName) &&
    Boolean(routeData?.reasoning) &&
    Array.isArray(routeData?.avoidedHazards) &&
    typeof routeData?.estimatedTimeSavedMinutes === 'number' &&
    routeData?.priorityLaneEligible === true;

  record(
    10,
    'POST /api/ai/optimize-route calculates emergency route, time saved & hazard avoidance',
    routePass,
    `Route: "${routeData?.recommendedRouteName}", Time Saved: ${routeData?.estimatedTimeSavedMinutes}m, Hazards Avoided: ${routeData?.avoidedHazards?.length}`
  );

  // --- 5. SMART FACILITY RECOMMENDATION (LIVE MONGODB INTEGRATION) ---
  console.log('\n--- 5. LIVE FACILITY RECOMMENDATION ---');

  const facRecRes = await request('/ai/recommend-facility', {
    method: 'POST',
    body: JSON.stringify({
      triageLevel: 'critical',
      symptoms: ['acute ischemic stroke', 'hemiparesis', 'slurred speech'],
    }),
  });
  const facRecData = facRecRes.data?.data;
  const facPass =
    facRecRes.status === 200 &&
    Boolean(facRecData?.recommendedFacilityId) &&
    Boolean(facRecData?.facilityName) &&
    Boolean(facRecData?.clinicalJustification);

  record(
    11,
    'POST /api/ai/recommend-facility allocates optimal healthcare facility from live MongoDB database',
    facPass,
    `Selected: "${facRecData?.facilityName}", Reason: ${facRecData?.clinicalJustification?.slice(0, 70)}...`
  );

  // --- 6. MALFORMED AI RESPONSE PARSER RECOVERY ---
  console.log('\n--- 6. MALFORMED AI RESPONSE RECOVERY ---');

  // Test 1: Markdown codeblock ```json ... ```
  const markdownSample = '```json\n{\n  "urgencyScore": 9,\n  "triageLevel": "critical"\n}\n```';
  const parsedMd = cleanAndParseJsonResponse(markdownSample);
  const mdPass = parsedMd?.urgencyScore === 9 && parsedMd?.triageLevel === 'critical';

  record(
    12,
    'cleanAndParseJsonResponse strips markdown fences (```json ... ```) safely',
    mdPass,
    `Parsed successfully: ${JSON.stringify(parsedMd)}`
  );

  // Test 2: Preceding conversational preamble and trailing notes
  const conversationalSample = 'Here is your clinical assessment for the patient:\n{"recommendedRouteName": "Fast Lane", "estimatedTimeSavedMinutes": 7}\nHope this helps!';
  const parsedConv = cleanAndParseJsonResponse(conversationalSample);
  const convPass = parsedConv?.recommendedRouteName === 'Fast Lane' && parsedConv?.estimatedTimeSavedMinutes === 7;

  record(
    13,
    'cleanAndParseJsonResponse extracts JSON bounded object from conversational text',
    convPass,
    `Extracted object: ${JSON.stringify(parsedConv)}`
  );

  // Test 3: Completely broken text throws clean error without crashing process
  let threwExpected = false;
  try {
    cleanAndParseJsonResponse('Not a json at all no braces');
  } catch {
    threwExpected = true;
  }
  record(
    14,
    'cleanAndParseJsonResponse throws structured error on completely unparseable input',
    threwExpected,
    'Handled non-JSON input gracefully'
  );

  // --- 7. CLIENT SERVICE INTEGRATION ---
  console.log('\n--- 7. FRONTEND CLIENT API INTEGRATION ---');

  const apiClientPath = path.resolve(__dirname, '../client/src/services/api.js');
  const apiClientCode = fs.readFileSync(apiClientPath, 'utf8');

  const clientHasAiMethods =
    apiClientCode.includes('assessTriage') &&
    apiClientCode.includes('optimizeRoute') &&
    apiClientCode.includes('recommendFacility') &&
    apiClientCode.includes('getAiStatus');

  const clientHasNoDirectGemini =
    !apiClientCode.includes('@google/genai') &&
    !apiClientCode.includes('@google/generative-ai') &&
    !apiClientCode.includes('generativelanguage.googleapis.com');

  record(
    15,
    'Client ApiService provides assessTriage, optimizeRoute, recommendFacility through backend',
    clientHasAiMethods && clientHasNoDirectGemini,
    'All AI calls routes through /api/ai endpoints; zero direct Gemini API calls from browser'
  );

  // --- SUMMARY ---
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log('\n======================================================================');
  console.log(`GEMINI AI QA RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${results.length})`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runGeminiAiQA().catch((err) => {
  console.error('QA Test suite execution failure:', err);
  process.exit(1);
});
