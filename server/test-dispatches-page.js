const BASE_URL = 'http://localhost:5000/api';

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function runDispatchesTests() {
  console.log('=== STARTING /dispatches FULL VERIFICATION SUITE ===\n');
  const results = [];

  function record(name, pass, details = '') {
    results.push({ name, pass, details });
    console.log(`${pass ? '✓ PASS' : '✗ FAIL'}: ${name} ${details ? '- ' + details : ''}`);
  }

  try {
    // 1. Backend Connectivity & Initial Load
    const initialList = await request('/dispatches');
    record(
      'API calls connect to backend & list loads correctly',
      initialList.status === 200 && Array.isArray(initialList.data?.data),
      `Loaded ${initialList.data?.data?.length} dispatches`
    );

    // 2. Form Validation: Missing required fields
    const invalidPayload = {
      // missing patientName and pickupLocation
      contactPhone: '+1-555-0000',
    };
    const validationRes = await request('/dispatches', {
      method: 'POST',
      body: JSON.stringify(invalidPayload),
    });
    record(
      'Form Validation rejects missing required fields (400 Bad Request)',
      validationRes.status === 400 && validationRes.data?.success === false,
      `Status: ${validationRes.status}, Error: ${validationRes.data?.message}`
    );

    // 3. Create a Facility for destination testing
    const facilityRes = await request('/facilities', {
      method: 'POST',
      body: JSON.stringify({
        name: 'St. Jude Emergency Center',
        facilityType: 'trauma_center',
        address: { street: '500 Mercy Ave', city: 'Metro City', state: 'NY', zipCode: '10002' },
        location: { type: 'Point', coordinates: [-73.99, 40.75] },
        capabilities: ['trauma_level_1', 'icu', 'burn_unit'],
        emergencyCapacity: { totalBeds: 100, availableBeds: 12, icuAvailable: 2, status: 'normal' },
        contactPhone: '+1-555-4321',
      }),
    });
    const facilityId = facilityRes.data?.data?._id;

    // 4. Dispatch Creation with Critical Triage
    const criticalDispatch = {
      patientName: 'Eleanor Vance',
      contactPhone: '+1-555-7777',
      pickupLocation: {
        address: '742 Evergreen Terrace, Springfield',
        coordinates: { latitude: 40.7128, longitude: -74.006 },
      },
      destinationFacility: facilityId,
      triageLevel: 'critical',
      vehicleType: 'als_ambulance',
      symptoms: ['acute cardiac arrest', 'unresponsive'],
      notes: 'CPR in progress by family. Expedite ALS unit.',
    };
    const createCritRes = await request('/dispatches', {
      method: 'POST',
      body: JSON.stringify(criticalDispatch),
    });
    const critId = createCritRes.data?.data?._id;
    const critNumber = createCritRes.data?.data?.dispatchNumber;
    record(
      'Dispatch creation modal / POST saves Critical dispatch to MongoDB',
      createCritRes.status === 201 && Boolean(critId) && createCritRes.data?.data?.triageLevel === 'critical',
      `ID: ${critId}, Number: ${critNumber}`
    );

    // 5. Dispatch Creation with Urgent Triage
    const urgentDispatch = {
      patientName: 'Marcus Brody',
      contactPhone: '+1-555-4444',
      pickupLocation: {
        address: '120 Broadway, New York, NY',
        coordinates: { latitude: 40.7081, longitude: -74.0113 },
      },
      destinationFacility: facilityId,
      triageLevel: 'urgent',
      vehicleType: 'bls_ambulance',
      symptoms: ['compound fracture', 'controlled bleeding'],
      notes: 'Splint applied on scene',
    };
    const createUrgRes = await request('/dispatches', {
      method: 'POST',
      body: JSON.stringify(urgentDispatch),
    });
    const urgId = createUrgRes.data?.data?._id;
    record(
      'Dispatch creation modal / POST saves Urgent dispatch to MongoDB',
      createUrgRes.status === 201 && Boolean(urgId) && createUrgRes.data?.data?.triageLevel === 'urgent'
    );

    // 6. Dispatch Creation with Standard Triage
    const stdDispatch = {
      patientName: 'Clara Oswald',
      contactPhone: '+1-555-3333',
      pickupLocation: {
        address: '221B Baker St',
        coordinates: { latitude: 40.72, longitude: -74.0 },
      },
      destinationFacility: facilityId,
      triageLevel: 'standard',
      vehicleType: 'wheelchair_van',
      symptoms: ['dialysis routine transport'],
      notes: 'Requires wheelchair ramp',
    };
    const createStdRes = await request('/dispatches', {
      method: 'POST',
      body: JSON.stringify(stdDispatch),
    });
    const stdId = createStdRes.data?.data?._id;
    record(
      'Dispatch creation modal / POST saves Standard dispatch to MongoDB',
      createStdRes.status === 201 && Boolean(stdId) && createStdRes.data?.data?.triageLevel === 'standard'
    );

    // 7. Verify Triage Badges Data
    const allDispatchesRes = await request('/dispatches');
    const allList = allDispatchesRes.data?.data || [];
    const hasCritical = allList.some((d) => d.triageLevel === 'critical');
    const hasUrgent = allList.some((d) => d.triageLevel === 'urgent');
    const hasStandard = allList.some((d) => d.triageLevel === 'standard');
    record(
      'Triage badges data correctly available (Critical, Urgent, Standard)',
      hasCritical && hasUrgent && hasStandard,
      `Critical: ${hasCritical}, Urgent: ${hasUrgent}, Standard: ${hasStandard}`
    );

    // 8. Test Dispatch Status Lifecycle Progression
    // Step a: pending -> en_route
    const enRouteRes = await request(`/dispatches/${critId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'en_route' }),
    });
    record(
      'Dispatch status update to EN_ROUTE',
      enRouteRes.status === 200 && enRouteRes.data?.data?.status === 'en_route',
      `New status: ${enRouteRes.data?.data?.status}`
    );

    // Step b: en_route -> arrived
    const arrivedRes = await request(`/dispatches/${critId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'arrived' }),
    });
    record(
      'Dispatch status update to ARRIVED',
      arrivedRes.status === 200 && arrivedRes.data?.data?.status === 'arrived',
      `New status: ${arrivedRes.data?.data?.status}`
    );

    // Step c: arrived -> completed
    const completedRes = await request(`/dispatches/${critId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'completed' }),
    });
    record(
      'Dispatch status update to COMPLETED',
      completedRes.status === 200 && completedRes.data?.data?.status === 'completed',
      `New status: ${completedRes.data?.data?.status}`
    );

    // 9. Verify Data Persistence in MongoDB
    // Directly fetch the dispatch by ID to confirm MongoDB committed the completed status
    const persistedCheck = await request(`/dispatches/${critId}`);
    record(
      'Data persisted in MongoDB verified via GET /api/dispatches/:id',
      persistedCheck.status === 200 &&
        persistedCheck.data?.data?.status === 'completed' &&
        persistedCheck.data?.data?.patientName === 'Eleanor Vance',
      `Status in DB: ${persistedCheck.data?.data?.status}`
    );

    // 10. Filter & Empty State Verification
    // Query filter for cancelled status (none cancelled yet)
    const cancelledFilterRes = await request('/dispatches?status=cancelled');
    record(
      'Empty state query returns empty array for unmatched filter',
      cancelledFilterRes.status === 200 && cancelledFilterRes.data?.data?.length === 0,
      `Count: ${cancelledFilterRes.data?.data?.length}`
    );

    // 11. Error State on Malformed Request
    const badIdRes = await request('/dispatches/invalid-id-format/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'en_route' }),
    });
    record(
      'Error state handled gracefully on invalid ID (404 Not Found)',
      badIdRes.status === 404 && badIdRes.data?.success === false,
      `Message: ${badIdRes.data?.message}`
    );

  } catch (err) {
    console.error('Test execution error:', err);
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n=== DISPATCHES VERIFICATION: ${passed} PASSED, ${failed} FAILED (TOTAL: ${results.length}) ===`);
  process.exit(failed > 0 ? 1 : 0);
}

runDispatchesTests();
