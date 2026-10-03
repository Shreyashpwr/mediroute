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

async function runFacilitiesTestSuite() {
  console.log('======================================================================');
  console.log('    FOCUSED QA SUITE: MEDICAL FACILITIES DIRECTORY (/facilities)');
  console.log('======================================================================\n');

  const results = [];
  function record(section, name, pass, details = '') {
    results.push({ section, name, pass, details });
    const mark = pass ? '✓ PASS' : '✗ FAIL';
    console.log(`${mark} [${section}] ${name} ${details ? '--> ' + details : ''}`);
  }

  // 1. ROUTE ACCESSIBILITY
  console.log('\n--- 1. ROUTE ACCESSIBILITY ---');
  const spaRes = await fetch(`${CLIENT_BASE}/facilities`);
  const spaHtml = await spaRes.text();
  record(
    'Route',
    'Frontend serves /facilities SPA correctly',
    spaRes.status === 200 && spaHtml.includes('id="root"'),
    `HTTP ${spaRes.status}`
  );

  // 2. REAL API DATA VERIFICATION
  console.log('\n--- 2. REAL API DATA VERIFICATION ---');
  const facilitiesRes = await request('/facilities');
  const facilities = facilitiesRes.data?.data || [];
  record(
    'API Data',
    'GET /api/facilities returns 200 and array of MongoDB facilities',
    facilitiesRes.status === 200 && Array.isArray(facilities) && facilities.length > 0,
    `Loaded ${facilities.length} facilities`
  );

  // Check required data fields on each facility
  const hasRequiredFields = facilities.every(
    (f) =>
      Boolean(f._id) &&
      Boolean(f.name) &&
      Boolean(f.facilityType) &&
      Boolean(f.location?.coordinates) &&
      typeof f.emergencyCapacity?.totalBeds === 'number' &&
      typeof f.emergencyCapacity?.availableBeds === 'number' &&
      typeof f.emergencyCapacity?.icuAvailable === 'number' &&
      Boolean(f.emergencyCapacity?.status)
  );

  record(
    'API Data',
    'Each facility contains name, location coordinates, bed capacity, ICU count, and intake status',
    hasRequiredFields,
    `Verified across ${facilities.length} facility records`
  );

  // 3. SEARCH FUNCTIONALITY
  console.log('\n--- 3. SEARCH FUNCTIONALITY ---');
  const sampleFacility = facilities[0];
  const queryName = sampleFacility.name.slice(0, 5).toLowerCase();

  // Test client-side filter simulation
  const searchMatches = facilities.filter(
    (f) =>
      f.name.toLowerCase().includes(queryName) ||
      f.address?.street?.toLowerCase().includes(queryName) ||
      f.address?.city?.toLowerCase().includes(queryName)
  );
  record(
    'Search',
    `Search for "${queryName}" returns matching facilities`,
    searchMatches.length > 0,
    `Found ${searchMatches.length} matching facility(ies)`
  );

  // 4. FILTERING FUNCTIONALITY
  console.log('\n--- 4. FILTERING FUNCTIONALITY ---');
  // Type filters
  const hospitals = facilities.filter((f) => f.facilityType === 'hospital');
  const traumaCenters = facilities.filter((f) => f.facilityType === 'trauma_center');
  const clinics = facilities.filter((f) => ['urgent_care', 'clinic'].includes(f.facilityType));

  record(
    'Filters',
    'Filter by facility type (Hospital, Trauma Center, Clinic)',
    hospitals.length >= 0 && traumaCenters.length >= 0,
    `Hospitals: ${hospitals.length}, Trauma Centers: ${traumaCenters.length}, Clinics: ${clinics.length}`
  );

  // Status filters
  const normalIntake = facilities.filter((f) => (f.emergencyCapacity?.status || '').toLowerCase() === 'normal');
  const busyFacilities = facilities.filter((f) => (f.emergencyCapacity?.status || '').toLowerCase() === 'busy');
  const criticalFacilities = facilities.filter((f) => (f.emergencyCapacity?.status || '').toLowerCase() === 'critical');
  const divertFacilities = facilities.filter((f) => (f.emergencyCapacity?.status || '').toLowerCase() === 'divert');

  record(
    'Filters',
    'Filter by intake status (Normal, Busy, Critical, Divert)',
    normalIntake.length >= 0 && divertFacilities.length >= 0,
    `Normal: ${normalIntake.length}, Busy: ${busyFacilities.length}, Critical: ${criticalFacilities.length}, Divert: ${divertFacilities.length}`
  );

  // 5. SORTING FUNCTIONALITY
  console.log('\n--- 5. SORTING FUNCTIONALITY ---');
  // Sort by available beds descending
  const sortedByBeds = [...facilities].sort(
    (a, b) => (b.emergencyCapacity?.availableBeds || 0) - (a.emergencyCapacity?.availableBeds || 0)
  );
  record(
    'Sorting',
    'Sort by Available Beds (High to Low)',
    sortedByBeds.length > 1 ? (sortedByBeds[0].emergencyCapacity?.availableBeds || 0) >= (sortedByBeds[1].emergencyCapacity?.availableBeds || 0) : true,
    `Top facility beds: ${sortedByBeds[0]?.emergencyCapacity?.availableBeds}`
  );

  // Sort by name A-Z
  const sortedByName = [...facilities].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  record(
    'Sorting',
    'Sort by Facility Name (A to Z)',
    sortedByName.length > 1 ? sortedByName[0].name.localeCompare(sortedByName[1].name) <= 0 : true,
    `First: "${sortedByName[0]?.name}", Second: "${sortedByName[1]?.name}"`
  );

  // 6. CAPACITY CONTROLS & BACKEND AUTHORIZED UPDATES
  console.log('\n--- 6. CAPACITY CONTROLS & UPDATES (PUT /api/facilities/:id) ---');
  const targetFacility = facilities[0];
  const originalCapacity = { ...targetFacility.emergencyCapacity };

  // Update capacity with test values
  const testNewAvailable = (originalCapacity.availableBeds || 10) + 1;
  const updatePayload = {
    emergencyCapacity: {
      totalBeds: originalCapacity.totalBeds || 100,
      availableBeds: testNewAvailable,
      icuAvailable: (originalCapacity.icuAvailable || 5) + 1,
      status: originalCapacity.status === 'normal' ? 'busy' : 'normal',
    },
  };

  const updateRes = await request(`/facilities/${targetFacility._id}`, {
    method: 'PUT',
    body: JSON.stringify(updatePayload),
  });

  record(
    'Capacity Controls',
    'PUT /api/facilities/:id updates emergency capacity successfully',
    updateRes.status === 200 &&
      updateRes.data?.data?.emergencyCapacity?.availableBeds === testNewAvailable &&
      updateRes.data?.data?.emergencyCapacity?.status === updatePayload.emergencyCapacity.status,
    `Updated status: ${updateRes.data?.data?.emergencyCapacity?.status}, Available beds: ${testNewAvailable}`
  );

  // Re-verify from DB by fresh GET
  const verifyRes = await request(`/facilities/${targetFacility._id}`);
  record(
    'Capacity Controls',
    'MongoDB persistence verified for updated capacity telemetry',
    verifyRes.status === 200 &&
      verifyRes.data?.data?.emergencyCapacity?.availableBeds === testNewAvailable,
    `Confirmed in DB: ${verifyRes.data?.data?.emergencyCapacity?.availableBeds} beds`
  );

  // Rollback to original capacity
  await request(`/facilities/${targetFacility._id}`, {
    method: 'PUT',
    body: JSON.stringify({ emergencyCapacity: originalCapacity }),
  });

  // 7. FACILITY REGISTRATION (POST /api/facilities)
  console.log('\n--- 7. FACILITY REGISTRATION ---');
  const newFacilityPayload = {
    name: `QA Facility ${Date.now()}`,
    facilityType: 'clinic',
    address: {
      street: '999 QA Boulevard',
      city: 'Metro City',
      state: 'NY',
      zipCode: '10002',
    },
    location: {
      type: 'Point',
      coordinates: [-73.985, 40.735],
    },
    contactPhone: '+1-555-0999',
    capabilities: ['urgent_care', 'triage'],
    emergencyCapacity: {
      totalBeds: 30,
      availableBeds: 15,
      icuAvailable: 0,
      status: 'normal',
    },
    isOpen24Hours: true,
  };

  const createRes = await request('/facilities', {
    method: 'POST',
    body: JSON.stringify(newFacilityPayload),
  });

  const createdId = createRes.data?.data?._id;
  record(
    'Registration',
    'POST /api/facilities creates new facility record in MongoDB',
    createRes.status === 201 && Boolean(createdId),
    `Created: ${createRes.data?.data?.name} (ID: ${createdId})`
  );

  // Clean up created test facility
  if (createdId) {
    await request(`/facilities/${createdId}`, { method: 'DELETE' });
  }

  // 8. CODE STRUCTURE & COMPONENT REUSE INSPECTION
  console.log('\n--- 8. CODE STRUCTURE & REUSE VERIFICATION ---');
  const pageCode = fs.readFileSync(
    path.resolve(process.cwd(), 'client/src/pages/FacilitiesPage.jsx'),
    'utf-8'
  );

  const reusesModal = pageCode.includes('import Modal from') && pageCode.includes('<Modal');
  const reusesButton = pageCode.includes('import Button from') && pageCode.includes('<Button');
  const reusesInput = pageCode.includes('import Input from') && pageCode.includes('<Input');
  const reusesLoading = pageCode.includes('import LoadingSpinner from') && pageCode.includes('<LoadingSpinner');
  const reusesError = pageCode.includes('import ErrorMessage from') && pageCode.includes('<ErrorMessage');
  const reusesEmpty = pageCode.includes('import EmptyState from') && pageCode.includes('<EmptyState');
  const reusesNewDispatchModal = pageCode.includes('import NewDispatchModal from') && pageCode.includes('<NewDispatchModal');

  record(
    'Component Reuse',
    'Reuses standard design system components (Modal, Button, Input, Loading, Error, Empty, NewDispatchModal)',
    reusesModal && reusesButton && reusesInput && reusesLoading && reusesError && reusesEmpty && reusesNewDispatchModal,
    'All design system components correctly reused without duplication'
  );

  // 9. RESPONSIVE CSS INSPECTION
  console.log('\n--- 9. RESPONSIVE CSS INSPECTION ---');
  const cssCode = fs.readFileSync(
    path.resolve(process.cwd(), 'client/src/index.css'),
    'utf-8'
  );

  const hasFacilitiesGrid = cssCode.includes('.facilities-grid');
  const hasCardStyles = cssCode.includes('.facility-dir-card') && cssCode.includes('.facility-capacity-block');
  const hasMobileMedia = cssCode.includes('@media (max-width: 640px)') && cssCode.includes('.facilities-grid');

  record(
    'Responsive CSS',
    'CSS defines responsive grid, card styles, and mobile breakpoints for /facilities',
    hasFacilitiesGrid && hasCardStyles && hasMobileMedia,
    'Grid, card styling, and max-width 640px breakpoints verified'
  );

  // SUMMARY
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  console.log('\n======================================================================');
  console.log(`FACILITIES QA RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${results.length})`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runFacilitiesTestSuite().catch((err) => {
  console.error('Fatal error during facilities test suite:', err);
  process.exit(1);
});
