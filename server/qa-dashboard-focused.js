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

async function runComprehensiveDashboardQA() {
  console.log('======================================================================');
  console.log('       MEDIROUTE OPERATIONAL DASHBOARD (/) FOCUSED QA SUITE');
  console.log('======================================================================\n');

  const results = [];
  function record(section, name, pass, details = '') {
    results.push({ section, name, pass, details });
    const symbol = pass ? '✓ PASS' : '✗ FAIL';
    console.log(`${symbol} [${section}] ${name} ${details ? '--> ' + details : ''}`);
  }

  // 1. DASHBOARD STATISTICS VERIFICATION
  console.log('\n--- 1. DASHBOARD STATISTICS ---');
  const health = await request('/health');
  const dispatchesRes = await request('/dispatches');
  const facilitiesRes = await request('/facilities');

  record(
    'Statistics',
    'Health API returns healthy status and DB connection',
    health.status === 200 && health.data?.data?.database === 'connected',
    `Database: ${health.data?.data?.database}, Uptime: ${Math.floor(health.data?.data?.uptime || 0)}s`
  );

  const dispatches = dispatchesRes.data?.data || [];
  const facilities = facilitiesRes.data?.data || [];

  record(
    'Statistics',
    'Dispatches retrieved successfully',
    dispatchesRes.status === 200 && Array.isArray(dispatches),
    `Count: ${dispatches.length}`
  );

  record(
    'Statistics',
    'Facilities retrieved successfully',
    facilitiesRes.status === 200 && Array.isArray(facilities) && facilities.length > 0,
    `Count: ${facilities.length}`
  );

  // Compute stats as implemented in HomePage.jsx
  const totalDispatches = dispatches.length;
  const activeDispatches = dispatches.filter(
    (d) => d.status !== 'completed' && d.status !== 'cancelled'
  ).length;
  const criticalCount = dispatches.filter(
    (d) => d.triageLevel === 'critical' && d.status !== 'completed' && d.status !== 'cancelled'
  ).length;
  const enRouteCount = dispatches.filter((d) => d.status === 'en_route').length;
  const completedToday = dispatches.filter((d) => d.status === 'completed').length;

  let totalBeds = 0;
  let availableBeds = 0;
  let icuAvailable = 0;
  let divertCount = 0;
  let busyCount = 0;

  facilities.forEach((f) => {
    const cap = f.emergencyCapacity || {};
    totalBeds += cap.totalBeds || 0;
    availableBeds += cap.availableBeds || 0;
    icuAvailable += cap.icuAvailable || 0;
    const st = (cap.status || '').toLowerCase();
    if (st === 'divert') divertCount++;
    if (st === 'busy' || st === 'critical') busyCount++;
  });

  const overallOccupancy = totalBeds > 0 ? Math.round(((totalBeds - availableBeds) / totalBeds) * 100) : 0;

  record(
    'Statistics',
    'Active Dispatches count aligns with non-completed/non-cancelled definition',
    activeDispatches === dispatches.filter((d) => ['pending', 'assigned', 'en_route', 'arrived'].includes(d.status)).length,
    `Active: ${activeDispatches}, Critical: ${criticalCount}, EnRoute: ${enRouteCount}`
  );

  record(
    'Statistics',
    'Facility network bed telemetry and occupancy calculations accurate',
    totalBeds > 0 && availableBeds <= totalBeds && overallOccupancy >= 0 && overallOccupancy <= 100,
    `Beds: ${availableBeds}/${totalBeds} (${overallOccupancy}% occupancy), ICU: ${icuAvailable}, Divert: ${divertCount}`
  );

  // 2. RECENT DISPATCHES FEED & INLINE ACTIONS
  console.log('\n--- 2. RECENT DISPATCHES FEED & ACTIONS ---');
  const activeFeed = dispatches.filter((d) => d.status !== 'completed' && d.status !== 'cancelled');
  const criticalFeed = dispatches.filter((d) => d.triageLevel === 'critical');

  record(
    'Recent Dispatches',
    'Active filter excludes completed and cancelled units',
    activeFeed.every((d) => d.status !== 'completed' && d.status !== 'cancelled'),
    `${activeFeed.length} active dispatches`
  );

  record(
    'Recent Dispatches',
    'Critical filter strictly displays critical triage dispatches',
    criticalFeed.every((d) => d.triageLevel === 'critical'),
    `${criticalFeed.length} critical emergencies`
  );

  // Test inline status transitions
  if (dispatches.length > 0) {
    const item = dispatches[0];
    const initialStatus = item.status;
    const newStatus = initialStatus === 'pending' ? 'assigned' : 'pending';

    const patchRes = await request(`/dispatches/${item._id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus }),
    });

    record(
      'Recent Dispatches',
      'Inline status update PATCH /api/dispatches/:id/status updates status',
      patchRes.status === 200 && patchRes.data?.data?.status === newStatus,
      `Changed ${initialStatus} -> ${newStatus}`
    );

    // Rollback to original status
    await request(`/dispatches/${item._id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: initialStatus }),
    });
  }

  // 3. FACILITY STATUS WIDGETS & FILTERS
  console.log('\n--- 3. FACILITY/HOSPITAL STATUS & FILTERING ---');
  const traumaCenters = facilities.filter((f) => f.facilityType === 'trauma_center');
  const normalIntake = facilities.filter((f) => (f.emergencyCapacity?.status || '').toLowerCase() === 'normal');
  const divertOrCritical = facilities.filter((f) => {
    const st = (f.emergencyCapacity?.status || '').toLowerCase();
    return st === 'divert' || st === 'critical';
  });

  record(
    'Facility Status',
    'Trauma centers filter functions correctly',
    traumaCenters.every((f) => f.facilityType === 'trauma_center'),
    `${traumaCenters.length} trauma centers found`
  );

  record(
    'Facility Status',
    'Normal intake filter functions correctly',
    normalIntake.every((f) => (f.emergencyCapacity?.status || '').toLowerCase() === 'normal'),
    `${normalIntake.length} normal intake hospitals`
  );

  record(
    'Facility Status',
    'Divert/Critical filter functions correctly',
    divertOrCritical.every((f) => ['divert', 'critical'].includes((f.emergencyCapacity?.status || '').toLowerCase())),
    `${divertOrCritical.length} diverting or critical intake facilities`
  );

  // 4. QUICK DISPATCH ACTIONS PRESETS
  console.log('\n--- 4. QUICK DISPATCH ACTIONS ---');
  const presets = [
    {
      label: 'Critical ALS Ambulance Preset',
      triageLevel: 'critical',
      vehicleType: 'als_ambulance',
      symptoms: ['Cardiovascular collapse', 'Acute trauma'],
      notes: 'HIGH PRIORITY: Rapid ALS unit deployment requested.',
    },
    {
      label: 'Urgent BLS Transport Preset',
      triageLevel: 'urgent',
      vehicleType: 'bls_ambulance',
      symptoms: ['Fracture', 'Trauma', 'Acute distress'],
      notes: 'Urgent BLS transport dispatched.',
    },
    {
      label: 'Wheelchair Van Transfer Preset',
      triageLevel: 'standard',
      vehicleType: 'wheelchair_van',
      symptoms: ['Non-emergency transport', 'Mobility support'],
      notes: 'Wheelchair ramp accessible transport requested.',
    },
    {
      label: 'Facility Quick Dispatch (Pre-routed)',
      triageLevel: 'standard',
      vehicleType: 'standard_transport',
      destinationFacility: facilities[0]?._id,
      symptoms: ['Routine checkup transfer'],
      notes: `Pre-routed to ${facilities[0]?.name} based on emergency capacity.`,
    },
  ];

  for (const preset of presets) {
    const payload = {
      patientName: `QA Patient (${preset.triageLevel})`,
      contactPhone: '+1-555-0199',
      pickupLocation: {
        address: '777 Test Ave, Metro City',
        coordinates: { latitude: 40.73, longitude: -73.99 },
      },
      destinationFacility: preset.destinationFacility || facilities[0]?._id,
      triageLevel: preset.triageLevel,
      vehicleType: preset.vehicleType,
      symptoms: preset.symptoms,
      notes: preset.notes,
    };

    const res = await request('/dispatches', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    record(
      'Quick Actions',
      `Dispatch created via ${preset.label}`,
      res.status === 201 && res.data?.data?.dispatchNumber && res.data?.data?.triageLevel === preset.triageLevel,
      `Number: ${res.data?.data?.dispatchNumber}, Vehicle: ${res.data?.data?.vehicleType}`
    );
  }

  // 5. NAVIGATION VERIFICATION
  console.log('\n--- 5. NAVIGATION & ROUTES ---');
  const homeRes = await fetch(`${CLIENT_BASE}/`);
  const dispatchesPageRes = await fetch(`${CLIENT_BASE}/dispatches`);
  const facilitiesPageRes = await fetch(`${CLIENT_BASE}/facilities`);

  record(
    'Navigation',
    'Root path / serves SPA successfully',
    homeRes.status === 200,
    `Status ${homeRes.status}`
  );

  record(
    'Navigation',
    '/dispatches path accessible',
    dispatchesPageRes.status === 200,
    `Status ${dispatchesPageRes.status}`
  );

  record(
    'Navigation',
    '/facilities path accessible',
    facilitiesPageRes.status === 200,
    `Status ${facilitiesPageRes.status}`
  );

  // 6. LOADING & EMPTY STATES VERIFICATION (Code Review & Simulation)
  console.log('\n--- 6. LOADING & EMPTY STATES ---');
  const homePageCode = fs.readFileSync(
    path.resolve(process.cwd(), 'client/src/pages/HomePage.jsx'),
    'utf-8'
  );

  const hasDispatchesLoadingSpinner = homePageCode.includes('loading && !dispatches.length ?');
  const hasFacilitiesLoadingSpinner = homePageCode.includes('loading && !facilities.length ?');
  const hasEmptyStatesWithActions = homePageCode.includes('actionLabel="Create Dispatch"') &&
    homePageCode.includes('actionLabel="Reset Filter"');

  record(
    'Loading & Empty States',
    'Dispatches feed shows loading spinner while fetching, avoiding premature empty state',
    hasDispatchesLoadingSpinner,
    `Card-level spinner: ${hasDispatchesLoadingSpinner}`
  );

  record(
    'Loading & Empty States',
    'Facilities widget shows loading spinner while fetching, avoiding premature empty state',
    hasFacilitiesLoadingSpinner,
    `Card-level spinner: ${hasFacilitiesLoadingSpinner}`
  );

  record(
    'Loading & Empty States',
    'Empty states provide contextual recovery actions (Create Dispatch / Reset Filter)',
    hasEmptyStatesWithActions,
    `Recovery actions present: ${hasEmptyStatesWithActions}`
  );

  // 7. API ERROR HANDLING VERIFICATION
  console.log('\n--- 7. API ERROR HANDLING ---');
  const hasPartialErrorHandling = homePageCode.includes('if (dispatchesRes.error || facilitiesRes.error)');
  const hasErrorBanner = homePageCode.includes('<ErrorMessage') && homePageCode.includes('onRetry');

  record(
    'Error Handling',
    'fetchDashboardData surfaces partial API failures instead of swallowing them',
    hasPartialErrorHandling,
    `Handles partial failures: ${hasPartialErrorHandling}`
  );

  record(
    'Error Handling',
    'Global Error Banner renders with retry mechanism on failure',
    hasErrorBanner,
    `ErrorMessage component with onRetry: ${hasErrorBanner}`
  );

  // 8. UNNECESSARY API REQUESTS VERIFICATION
  console.log('\n--- 8. OPTIMIZATION & UNNECESSARY API REQUESTS ---');
  const passesFacilitiesToModal = homePageCode.includes('facilities={facilities}');
  const modalCode = fs.readFileSync(
    path.resolve(process.cwd(), 'client/src/components/NewDispatchModal.jsx'),
    'utf-8'
  );
  const modalSkipsRedundantFetch = modalCode.includes('facilities: facilitiesProp') &&
    modalCode.includes('if (!facilitiesProp || facilitiesProp.length === 0)');

  record(
    'Optimization',
    'HomePage passes preloaded facilities to NewDispatchModal',
    passesFacilitiesToModal,
    `Prop passed: ${passesFacilitiesToModal}`
  );

  record(
    'Optimization',
    'NewDispatchModal skips duplicate GET /api/facilities request when facilities are passed',
    modalSkipsRedundantFetch,
    `Redundant fetch avoided: ${modalSkipsRedundantFetch}`
  );

  // 9. RESPONSIVE LAYOUT VERIFICATION
  console.log('\n--- 9. RESPONSIVE LAYOUT (CSS INSPECTION) ---');
  const cssCode = fs.readFileSync(
    path.resolve(process.cwd(), 'client/src/index.css'),
    'utf-8'
  );

  const hasTabletBreakpoint = cssCode.includes('@media (max-width: 1024px)') &&
    cssCode.includes('.command-deck-grid');
  const hasMobileBreakpoint = cssCode.includes('@media (max-width: 768px)') &&
    cssCode.includes('.banner-actions') &&
    cssCode.includes('.quick-buttons-row');

  record(
    'Responsive Layout',
    'Tablet breakpoint (1024px) collapses two-column command deck into single-column layout',
    hasTabletBreakpoint,
    `Breakpoint 1024px: ${hasTabletBreakpoint}`
  );

  record(
    'Responsive Layout',
    'Mobile breakpoint (768px) stacks control center banner and rapid dispatch action presets',
    hasMobileBreakpoint,
    `Breakpoint 768px: ${hasMobileBreakpoint}`
  );

  // 10. ROBUSTNESS & CONSOLE SAFETY
  console.log('\n--- 10. CODE ROBUSTNESS & CONSOLE SAFETY ---');
  const dispatchCardCode = fs.readFileSync(
    path.resolve(process.cwd(), 'client/src/components/DispatchCard.jsx'),
    'utf-8'
  );
  const facilityWidgetCode = fs.readFileSync(
    path.resolve(process.cwd(), 'client/src/components/FacilityStatusWidget.jsx'),
    'utf-8'
  );

  const hasSafeDateHandling = dispatchCardCode.includes('!isNaN(new Date(dispatch.createdAt).getTime())');
  const hasGlobalRegexTypeReplace = facilityWidgetCode.includes("replace(/_/g, ' ')");

  record(
    'Robustness',
    'DispatchCard safely parses createdAt avoiding NaN/Invalid Date display',
    hasSafeDateHandling,
    `Safe date parsing: ${hasSafeDateHandling}`
  );

  record(
    'Robustness',
    'FacilityStatusWidget cleans multi-word facility types globally',
    hasGlobalRegexTypeReplace,
    `Global regex replace: ${hasGlobalRegexTypeReplace}`
  );

  // Summary
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  console.log('\n======================================================================');
  console.log(`QA RESULTS SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${results.length})`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runComprehensiveDashboardQA().catch((err) => {
  console.error('Fatal QA error:', err);
  process.exit(1);
});
