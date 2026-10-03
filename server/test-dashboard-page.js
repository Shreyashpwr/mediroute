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

async function runDashboardTests() {
  console.log('=== STARTING MAIN OPERATIONAL DASHBOARD (/) VERIFICATION SUITE ===\n');
  const results = [];

  function record(name, pass, details = '') {
    results.push({ name, pass, details });
    console.log(`${pass ? '✓ PASS' : '✗ FAIL'}: ${name} ${details ? '- ' + details : ''}`);
  }

  try {
    // 1. Verify / route on Frontend
    const feRes = await fetch('http://localhost:5173/');
    const feText = await feRes.text();
    record(
      'Frontend / route serves SPA successfully',
      feRes.status === 200 && feText.includes('id="root"'),
      `Status: ${feRes.status}`
    );

    // 2. Verify System Health Data
    const health = await request('/health');
    record(
      'Dashboard System Health Data from Backend',
      health.status === 200 && health.data?.data?.database === 'connected',
      `Database: ${health.data?.data?.database}, Uptime: ${Math.floor(health.data?.data?.uptime)}s`
    );

    // 3. Verify Facilities Data for Hospital Status Widgets
    const facilitiesRes = await request('/facilities');
    const facilitiesList = facilitiesRes.data?.data || [];
    record(
      'Hospital/Facility Widgets Data from Backend',
      facilitiesRes.status === 200 && facilitiesList.length >= 4,
      `Loaded ${facilitiesList.length} facilities`
    );

    // Check facility attributes
    const hasNormal = facilitiesList.some(f => f.emergencyCapacity?.status === 'normal');
    const hasBusyOrCritical = facilitiesList.some(f => f.emergencyCapacity?.status === 'busy' || f.emergencyCapacity?.status === 'critical');
    const hasBeds = facilitiesList.every(f => typeof f.emergencyCapacity?.totalBeds === 'number');
    record(
      'Hospital Widgets contain capacity meters, statuses, and ICU counts',
      hasNormal && hasBusyOrCritical && hasBeds,
      `Normal: ${hasNormal}, Busy/Critical: ${hasBusyOrCritical}`
    );

    // 4. Verify Recent Dispatches Feed Data
    const dispatchesRes = await request('/dispatches');
    const dispatchesList = dispatchesRes.data?.data || [];
    record(
      'Recent Dispatches Feed Data from Backend',
      dispatchesRes.status === 200 && dispatchesList.length > 0,
      `Loaded ${dispatchesList.length} dispatches for dashboard feed`
    );

    // 5. Test Quick Dispatch Action: "🚨 Critical ALS Ambulance"
    const quickDispatchPayload = {
      patientName: 'Quick Action Patient',
      contactPhone: '+1-555-9111',
      pickupLocation: {
        address: '888 Quick Response Way, Metro City',
        coordinates: { latitude: 40.735, longitude: -73.991 },
      },
      destinationFacility: facilitiesList[0]?._id,
      triageLevel: 'critical',
      vehicleType: 'als_ambulance',
      symptoms: ['Cardiovascular collapse', 'acute distress'],
      notes: 'Dispatched via Quick Action Preset on Dashboard',
    };

    const quickCreateRes = await request('/dispatches', {
      method: 'POST',
      body: JSON.stringify(quickDispatchPayload),
    });
    const newDispatchId = quickCreateRes.data?.data?._id;
    record(
      'Quick Dispatch Action creates real emergency dispatch in MongoDB',
      quickCreateRes.status === 201 && Boolean(newDispatchId),
      `Dispatch: ${quickCreateRes.data?.data?.dispatchNumber}, Triage: ${quickCreateRes.data?.data?.triageLevel}`
    );

    // 6. Test Inline Status Updating on Dashboard
    const statusUpdateRes = await request(`/dispatches/${newDispatchId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'en_route' }),
    });
    record(
      'Inline Status Update from Dashboard Dispatch Card to EN_ROUTE',
      statusUpdateRes.status === 200 && statusUpdateRes.data?.data?.status === 'en_route',
      `Updated Status: ${statusUpdateRes.data?.data?.status}`
    );

    // 7. Verify Data Persisted in MongoDB
    const verifyUpdatedDispatch = await request(`/dispatches/${newDispatchId}`);
    record(
      'MongoDB Persistence Verified for updated dispatch status',
      verifyUpdatedDispatch.status === 200 && verifyUpdatedDispatch.data?.data?.status === 'en_route',
      `Confirmed in DB: ${verifyUpdatedDispatch.data?.data?.status}`
    );

  } catch (err) {
    console.error('Test execution error:', err);
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${results.length}) ===`);
  process.exit(failed > 0 ? 1 : 0);
}

runDashboardTests();
