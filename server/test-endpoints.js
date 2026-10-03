const BASE_URL = 'http://localhost:5000/api';

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  
  const mergedOptions = { ...options };
  mergedOptions.headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const res = await fetch(url, mergedOptions);
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function runTests() {
  console.log('=== STARTING ENDPOINT & AUTHENTICATION TEST SUITE ===\n');
  const results = [];

  function record(name, pass, details = '') {
    results.push({ name, pass, details });
    console.log(`${pass ? '✓ PASS' : '✗ FAIL'}: ${name} ${details ? '- ' + details : ''}`);
  }

  try {
    // 1. Health check
    const health = await request('/health');
    record('GET /api/health', health.status === 200 && health.data.data.database === 'connected', `DB: ${health.data.data?.database}`);

    // --- AUTHENTICATION TESTS ---
    const authEmail = `medic_${Date.now()}@mediroute.io`;
    const authPassword = 'SecurePassword123!';

    // 2. User Registration (enters approval workflow)
    const regRes = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Sarah Connor',
        email: authEmail,
        password: authPassword,
        role: 'dispatcher',
        phone: '+1-555-8888',
      }),
    });
    const regPassed = regRes.status === 201 &&
      regRes.data.data?.user?.email === authEmail &&
      regRes.data.data?.user?.password === undefined;
    record('POST /api/auth/register', regPassed, `Registration created in pending status`);
    const registeredUserId = regRes.data.data?.user?._id;

    // Admin logs in and approves user
    const adminLoginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@mediroute.io', password: 'Admin@123456' }),
    });
    const adminToken = adminLoginRes.data?.data?.token;
    if (adminToken && registeredUserId) {
      await request(`/users/${registeredUserId}/approve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ role: 'dispatcher' }),
      });
    }

    // 3. User Login (Valid credentials for approved user)
    const loginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: authEmail,
        password: authPassword,
      }),
    });
    const loginPassed = loginRes.status === 200 &&
      Boolean(loginRes.data.data?.token) &&
      loginRes.data.data?.user?.password === undefined;
    record('POST /api/auth/login (Valid credentials)', loginPassed, `Token returned: ${Boolean(loginRes.data.data?.token)}`);
    const authToken = loginRes.data.data?.token;

    // 4. User Login (Invalid credentials - wrong password)
    const badLoginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: authEmail,
        password: 'WrongPassword999!',
      }),
    });
    const badLoginPassed = badLoginRes.status === 401 &&
      badLoginRes.data?.message === 'Invalid email or password';
    record('POST /api/auth/login (Invalid credentials)', badLoginPassed, `Status: ${badLoginRes.status}, Message: "${badLoginRes.data?.message}"`);

    // 5. User Login (Non-existent email)
    const nonExistentLoginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'nobody_exists@mediroute.io',
        password: 'Password123!',
      }),
    });
    const nonExistentPassed = nonExistentLoginRes.status === 401 &&
      nonExistentLoginRes.data?.message === 'Invalid email or password';
    record('POST /api/auth/login (Non-existent user)', nonExistentPassed, `Generic secure message: "${nonExistentLoginRes.data?.message}"`);

    // 6. Protected Route Without Token
    const noTokenRes = await request('/auth/me');
    const noTokenPassed = noTokenRes.status === 401 && !noTokenRes.data?.success;
    record('GET /api/auth/me (Without token)', noTokenPassed, `Status: ${noTokenRes.status}`);

    // 7. Protected Route With Invalid Token
    const badTokenRes = await request('/auth/me', {
      headers: { Authorization: 'Bearer this_is_an_invalid_token_string' },
    });
    const badTokenPassed = badTokenRes.status === 401 && !badTokenRes.data?.success;
    record('GET /api/auth/me (Invalid token)', badTokenPassed, `Status: ${badTokenRes.status}`);

    // 8. Protected Route With Valid Token
    const validTokenRes = await request('/auth/me', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const validTokenPassed = validTokenRes.status === 200 &&
      validTokenRes.data?.data?.email === authEmail &&
      validTokenRes.data?.data?.password === undefined;
    record('GET /api/auth/me (Valid token)', validTokenPassed, `Authenticated as: ${validTokenRes.data?.data?.name} (${validTokenRes.data?.data?.role})`);

    // --- END OF AUTH TESTS ---

    // 9. Create Patient User (Admin/User API)
    const userPayload = {
      name: 'John Doe',
      email: `johndoe_${Date.now()}@example.com`,
      phone: '+1-555-0199',
      role: 'patient',
      medicalProfile: {
        bloodType: 'O+',
        allergies: ['Penicillin'],
        mobilityNeeds: ['wheelchair'],
      },
    };
    const createUserRes = await request('/users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify(userPayload),
    });
    record('POST /api/users (Patient)', createUserRes.status === 201, `User ID: ${createUserRes.data.data?._id}`);
    const patientId = createUserRes.data.data?._id;

    // 10. Create Driver User
    const driverPayload = {
      name: 'Alex Transport',
      email: `driver_${Date.now()}@example.com`,
      phone: '+1-555-0288',
      role: 'driver',
    };
    const createDriverRes = await request('/users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify(driverPayload),
    });
    record('POST /api/users (Driver)', createDriverRes.status === 201, `Driver ID: ${createDriverRes.data.data?._id}`);
    const driverId = createDriverRes.data.data?._id;

    // 11. List Users
    const listUsers = await request('/users?role=patient', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    record('GET /api/users?role=patient', listUsers.status === 200 && Array.isArray(listUsers.data.data));

    // 12. Get User by ID
    const getUser = await request(`/users/${patientId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    record('GET /api/users/:id', getUser.status === 200 && getUser.data.data?.name === 'John Doe');

    // 13. Update User
    const updateUser = await request(`/users/${patientId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ phone: '+1-555-9999' }),
    });
    record('PUT /api/users/:id', updateUser.status === 200 && updateUser.data.data?.phone === '+1-555-9999');

    // 14. Create Facility
    const facilityPayload = {
      name: 'Metro Central General Hospital',
      facilityType: 'hospital',
      address: {
        street: '100 Medical Parkway',
        city: 'Metro City',
        state: 'NY',
        zipCode: '10001',
      },
      location: {
        type: 'Point',
        coordinates: [-73.9851, 40.7484], // [lng, lat]
      },
      capabilities: ['icu', 'trauma_center', 'stroke_unit'],
      emergencyCapacity: {
        totalBeds: 250,
        availableBeds: 18,
        icuAvailable: 3,
        status: 'normal',
      },
      contactPhone: '+1-555-0100',
    };
    const createFacilityRes = await request('/facilities', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: JSON.stringify(facilityPayload),
    });
    record('POST /api/facilities', createFacilityRes.status === 201, `Facility ID: ${createFacilityRes.data.data?._id}`);
    const facilityId = createFacilityRes.data.data?._id;

    // 15. List Facilities
    const listFacilities = await request('/facilities?facilityType=hospital', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    record('GET /api/facilities', listFacilities.status === 200 && listFacilities.data.data?.length > 0);

    // 16. Get Facility by ID
    const getFacility = await request(`/facilities/${facilityId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    record('GET /api/facilities/:id', getFacility.status === 200 && getFacility.data.data?.name === facilityPayload.name);

    // 17. Update Facility
    const updateFacility = await request(`/facilities/${facilityId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        emergencyCapacity: {
          totalBeds: 250,
          availableBeds: 15,
          icuAvailable: 2,
          status: 'busy',
        },
      }),
    });
    record('PUT /api/facilities/:id', updateFacility.status === 200 && updateFacility.data.data?.emergencyCapacity?.status === 'busy');

    // 18. Create Dispatch
    const dispatchPayload = {
      patient: patientId,
      patientName: 'John Doe',
      contactPhone: '+1-555-9999',
      pickupLocation: {
        address: '450 West 33rd St, New York, NY',
        coordinates: { latitude: 40.7527, longitude: -73.9996 },
      },
      destinationFacility: facilityId,
      triageLevel: 'urgent',
      vehicleType: 'wheelchair_van',
      symptoms: ['acute chest tightness', 'shortness of breath'],
      notes: 'Requires wheelchair ramp assistance upon pickup',
    };
    const createDispatchRes = await request('/dispatches', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: JSON.stringify(dispatchPayload),
    });
    record('POST /api/dispatches', createDispatchRes.status === 201, `Dispatch: ${createDispatchRes.data.data?.dispatchNumber}`);
    const dispatchId = createDispatchRes.data.data?._id;

    // 19. List Dispatches
    const listDispatches = await request('/dispatches?status=pending', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    record('GET /api/dispatches', listDispatches.status === 200 && listDispatches.data.data?.length > 0);

    // 20. Get Dispatch by ID
    const getDispatch = await request(`/dispatches/${dispatchId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    record('GET /api/dispatches/:id', getDispatch.status === 200 && getDispatch.data.data?.triageLevel === 'urgent');

    // 21. Assign Dispatch
    const assignRes = await request(`/dispatches/${dispatchId}/assign`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ driverId }),
    });
    record('PATCH /api/dispatches/:id/assign', assignRes.status === 200 && assignRes.data.data?.status === 'assigned');

    // 22. Update Dispatch Status
    const statusRes = await request(`/dispatches/${dispatchId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ status: 'en_route' }),
    });
    record('PATCH /api/dispatches/:id/status', statusRes.status === 200 && statusRes.data.data.status === 'en_route');

    // 23. Create Route Log
    const routePayload = {
      dispatch: dispatchId,
      origin: {
        address: '450 West 33rd St, New York, NY',
        latitude: 40.7527,
        longitude: -73.9996,
      },
      destination: {
        address: '100 Medical Parkway, Metro City, NY',
        latitude: 40.7484,
        longitude: -73.9851,
      },
      estimatedDistanceKm: 3.2,
      estimatedDurationMinutes: 12,
      trafficCondition: 'moderate',
      waypoints: [
        { latitude: 40.7527, longitude: -73.9996 },
        { latitude: 40.7505, longitude: -73.9920 },
        { latitude: 40.7484, longitude: -73.9851 },
      ],
    };
    const createRouteRes = await request('/routes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: JSON.stringify(routePayload),
    });
    record('POST /api/routes', createRouteRes.status === 201, `Route ID: ${createRouteRes.data.data?._id}`);
    const routeId = createRouteRes.data.data?._id;

    // 24. Get Route by ID
    const getRoute = await request(`/routes/${routeId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    record('GET /api/routes/:id', getRoute.status === 200 && getRoute.data.data.estimatedDistanceKm === 3.2);

    const getRoutesForDisp = await request(`/routes/dispatch/${dispatchId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    record('GET /api/routes/dispatch/:dispatchId', getRoutesForDisp.status === 200 && getRoutesForDisp.data.data.length > 0);

    const badDispatch = await request('/dispatches', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({}),
    });
    record('Validation 400 Test (Missing Fields)', badDispatch.status === 400 && !badDispatch.data.success);

    // 27. Not Found Error Test (404 Not Found)
    const notFoundRes = await request('/non-existent-endpoint');
    record('Route 404 Test', notFoundRes.status === 404 && !notFoundRes.data.success);

    // 28. Delete Facility (Cleanup test)
    const deleteFacilityRes = await request(`/facilities/${facilityId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    record('DELETE /api/facilities/:id', deleteFacilityRes.status === 200);

  } catch (err) {
    console.error('Test execution error:', err);
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${results.length}) ===`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
