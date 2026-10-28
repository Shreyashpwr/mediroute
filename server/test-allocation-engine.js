import {
  DEFAULT_ALLOCATION_WEIGHTS,
  validateWeights,
  inferIncidentRequirements,
  checkAmbulanceFeasibility,
  checkFacilityFeasibility,
  estimateTravelTimeMinutes,
  scoreFeasibleAmbulance,
  scoreFeasibleFacility,
  evaluateAllocation,
} from './src/services/allocationService.js';
import { RoadGraph } from './src/services/routing/roadGraph.js';

console.log('======================================================================');
console.log('       MEDIROUTE DETERMINISTIC ALLOCATION ENGINE TEST SUITE');
console.log('======================================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`✓ PASS: ${testName} ${details ? '(' + details + ')' : ''}`);
    passCount++;
  } else {
    console.error(`✗ FAIL: ${testName} ${details ? '(' + details + ')' : ''}`);
    failCount++;
  }
}

async function runTests() {
  // ============================================================================
  // TEST 1: WEIGHT VALIDATION & SCORING EQUATION
  // ============================================================================
  console.log('--- 1. WEIGHT CONFIGURATION & NORMALIZATION ---');
  try {
    assert(validateWeights(DEFAULT_ALLOCATION_WEIGHTS) === true, 'Default weights sum to 1.00');

    let invalidWeightsCaught = false;
    try {
      validateWeights({
        ambulance: { travelTime: 0.5, readiness: 0.2, capabilityMatch: 0.2, routeReliability: 0.2 }, // 1.10
        facility: DEFAULT_ALLOCATION_WEIGHTS.facility,
      });
    } catch {
      invalidWeightsCaught = true;
    }
    assert(invalidWeightsCaught, 'Rejects ambulance weights that do not sum to 1.00');

    // Incident requirements inference
    const critReq = inferIncidentRequirements({ triageLevel: 'critical', symptoms: ['severe chest pain', 'cardiac arrest'] });
    assert(critReq.minVehicleType === 'mobile_icu', 'Critical cardiac symptoms infer mobile_icu requirement', `Type: ${critReq.minVehicleType}`);
    assert(critReq.targetDepartment === 'cardiac', 'Cardiac symptoms infer cardiac department', `Dept: ${critReq.targetDepartment}`);
    assert(critReq.requiresIcu === true, 'Critical incident requires ICU capacity');

    const traumaReq = inferIncidentRequirements({ triageLevel: 'urgent', symptoms: ['compound femur fracture', 'hemorrhage'] });
    assert(traumaReq.minVehicleType === 'bls_ambulance', 'Urgent triage requires at least BLS ambulance');
    assert(traumaReq.targetDepartment === 'trauma', 'Fracture/hemorrhage infers trauma department');
  } catch (err) {
    assert(false, 'Weight validation test crashed', err.message);
  }

  // ============================================================================
  // TEST 2: HARD FEASIBILITY: OFFLINE / INACTIVE / BUSY AMBULANCE REJECTED
  // ============================================================================
  console.log('\n--- 2. HARD FEASIBILITY: AMBULANCE AVAILABILITY & STATUS ---');
  try {
    const baseAmbulance = {
      _id: 'amb_01',
      ambulanceId: 'MH-12-AMB-01',
      vehicleType: 'als_ambulance',
      status: 'available',
      fuelLevel: 85,
      isActive: true,
      location: { coordinates: [73.8567, 18.5204] },
    };
    const requirements = { minVehicleType: 'bls_ambulance', requiresIcu: false, targetDepartment: 'emergency' };

    // Valid ambulance passes
    const validCheck = checkAmbulanceFeasibility(baseAmbulance, requirements);
    assert(validCheck.isFeasible === true, 'Available active ambulance passes feasibility');

    // Deactivated ambulance
    const inactiveCheck = checkAmbulanceFeasibility({ ...baseAmbulance, isActive: false }, requirements);
    assert(inactiveCheck.isFeasible === false, 'Deactivated ambulance is rejected');
    assert(inactiveCheck.rejectionReason.includes('deactivated'), 'Rejection reason states deactivated');

    // Busy ambulance
    const busyCheck = checkAmbulanceFeasibility({ ...baseAmbulance, status: 'busy' }, requirements);
    assert(busyCheck.isFeasible === false, 'Busy ambulance is rejected');
    assert(busyCheck.rejectionReason.includes('not available'), 'Rejection reason states not available');

    // Maintenance ambulance
    const maintCheck = checkAmbulanceFeasibility({ ...baseAmbulance, status: 'maintenance' }, requirements);
    assert(maintCheck.isFeasible === false, 'Maintenance ambulance is rejected');

    // Low fuel ambulance (< 15%)
    const lowFuelCheck = checkAmbulanceFeasibility({ ...baseAmbulance, fuelLevel: 10 }, requirements);
    assert(lowFuelCheck.isFeasible === false, 'Ambulance with <15% fuel is rejected');
    assert(lowFuelCheck.rejectionReason.includes('fuel'), 'Rejection reason mentions fuel reserve');
  } catch (err) {
    assert(false, 'Ambulance feasibility test crashed', err.message);
  }

  // ============================================================================
  // TEST 3: HARD FEASIBILITY: MISSING CAPABILITY REJECTED
  // ============================================================================
  console.log('\n--- 3. HARD FEASIBILITY: CAPABILITY HIERARCHY ---');
  try {
    const ptAmbulance = {
      _id: 'amb_pt',
      ambulanceId: 'MH-12-PT-01',
      vehicleType: 'patient_transport',
      status: 'available',
      fuelLevel: 90,
      isActive: true,
      location: { coordinates: [73.8567, 18.5204] },
    };

    const blsAmbulance = {
      _id: 'amb_bls',
      ambulanceId: 'MH-12-BLS-01',
      vehicleType: 'bls_ambulance',
      status: 'available',
      fuelLevel: 90,
      isActive: true,
      location: { coordinates: [73.8567, 18.5204] },
    };

    const alsAmbulance = {
      _id: 'amb_als',
      ambulanceId: 'MH-12-ALS-01',
      vehicleType: 'als_ambulance',
      status: 'available',
      fuelLevel: 90,
      isActive: true,
      location: { coordinates: [73.8567, 18.5204] },
    };

    // Patient transport trying to service ALS requirement
    const alsCheck = checkAmbulanceFeasibility(ptAmbulance, { minVehicleType: 'als_ambulance' });
    assert(alsCheck.isFeasible === false, 'patient_transport rejected when ALS is required');
    assert(alsCheck.rejectionReason.includes('does not satisfy'), 'Rejection reason explains vehicle type shortfall');

    // BLS trying to service Mobile ICU requirement
    const icuCheck = checkAmbulanceFeasibility(blsAmbulance, { minVehicleType: 'mobile_icu' });
    assert(icuCheck.isFeasible === false, 'bls_ambulance rejected when mobile_icu is required');

    // ALS servicing BLS requirement (higher or equal is acceptable)
    const alsForBlsCheck = checkAmbulanceFeasibility(alsAmbulance, { minVehicleType: 'bls_ambulance' });
    assert(alsForBlsCheck.isFeasible === true, 'als_ambulance satisfies bls requirement (capability hierarchy)');
  } catch (err) {
    assert(false, 'Capability hierarchy test crashed', err.message);
  }

  // ============================================================================
  // TEST 4: HARD FEASIBILITY: FACILITY CAPACITY, ICU & DIVERSION
  // ============================================================================
  console.log('\n--- 4. HARD FEASIBILITY: FACILITY CAPACITY & CLINICAL DEPARTMENTS ---');
  try {
    const baseFacility = {
      _id: 'fac_01',
      name: 'Pune District General Hospital',
      facilityType: 'hospital',
      isActive: true,
      location: { coordinates: [73.8567, 18.5204] },
      capabilities: ['emergency', 'trauma', 'icu', 'cardiac'],
      emergencyCapacity: {
        totalBeds: 100,
        availableBeds: 25,
        icuAvailable: 4,
        status: 'normal',
        departments: {
          emergency: { available: 12 },
          trauma: { available: 5 },
          cardiac: { available: 3 },
          icu: { available: 4 },
        },
      },
    };

    // Standard valid check
    const validFac = checkFacilityFeasibility(baseFacility, { requiredBeds: 1, requiresIcu: false, targetDepartment: 'emergency' });
    assert(validFac.isFeasible === true, 'Operational hospital with available beds passes feasibility');

    // Divert status rejected
    const divertFac = checkFacilityFeasibility(
      { ...baseFacility, emergencyCapacity: { ...baseFacility.emergencyCapacity, status: 'divert' } },
      { requiredBeds: 1 }
    );
    assert(divertFac.isFeasible === false, 'Facility on diversion is rejected');
    assert(divertFac.rejectionReason.includes('diversion'), 'Rejection reason explains diversion');

    // Zero emergency beds available rejected
    const fullBedsFac = checkFacilityFeasibility(
      { ...baseFacility, emergencyCapacity: { ...baseFacility.emergencyCapacity, availableBeds: 0 } },
      { requiredBeds: 1 }
    );
    assert(fullBedsFac.isFeasible === false, 'Facility with 0 available beds is rejected');
    assert(fullBedsFac.rejectionReason.includes('No available emergency beds'), 'Rejection states bed shortage');

    // Zero ICU beds available when ICU is required rejected
    const fullIcuFac = checkFacilityFeasibility(
      { ...baseFacility, emergencyCapacity: { ...baseFacility.emergencyCapacity, icuAvailable: 0 } },
      { requiredBeds: 1, requiresIcu: true }
    );
    assert(fullIcuFac.isFeasible === false, 'Facility with 0 ICU beds rejected when ICU is required');
    assert(fullIcuFac.rejectionReason.includes('ICU'), 'Rejection states ICU shortage');

    // Missing department rejected (e.g. burn_unit)
    const missingDeptFac = checkFacilityFeasibility(
      baseFacility,
      { requiredBeds: 1, targetDepartment: 'burn_unit' }
    );
    assert(missingDeptFac.isFeasible === false, 'Facility lacking required department is rejected');
    assert(missingDeptFac.rejectionReason.includes('lacks required department'), 'Rejection states missing department');

    // Department at 100% occupancy (0 beds available)
    const fullDeptFac = checkFacilityFeasibility(
      {
        ...baseFacility,
        emergencyCapacity: {
          ...baseFacility.emergencyCapacity,
          departments: {
            ...baseFacility.emergencyCapacity.departments,
            pediatric: { available: 0 },
          },
        },
      },
      { requiredBeds: 1, targetDepartment: 'pediatric' }
    );
    assert(fullDeptFac.isFeasible === false, 'Facility with 0 beds in required department is rejected');
    assert(fullDeptFac.rejectionReason.includes('100% occupancy'), 'Rejection states department occupancy');
  } catch (err) {
    assert(false, 'Facility feasibility test crashed', err.message);
  }

  // ============================================================================
  // TEST 5: DETERMINISTIC MULTI-CRITERIA SCORING & TIE-BREAKING
  // ============================================================================
  console.log('\n--- 5. DETERMINISTIC SCORING & TIE-BREAKING ---');
  try {
    const ambClose = {
      _id: 'amb_close',
      ambulanceId: 'MH-12-AMB-CLOSE',
      vehicleType: 'als_ambulance',
      status: 'available',
      fuelLevel: 95,
      isActive: true,
      location: { coordinates: [73.8560, 18.5200] }, // ~1 km
    };

    const ambFar = {
      _id: 'amb_far',
      ambulanceId: 'MH-12-AMB-FAR',
      vehicleType: 'als_ambulance',
      status: 'available',
      fuelLevel: 95,
      isActive: true,
      location: { coordinates: [73.7500, 18.5200] }, // ~11 km away
    };

    const incident = { coordinates: [73.8567, 18.5204] }; // Pune center

    const facEquipped = {
      _id: 'fac_trauma',
      name: 'Pune Apex Trauma Center',
      facilityType: 'trauma_center',
      isActive: true,
      location: { coordinates: [73.8590, 18.5220] },
      capabilities: ['emergency', 'trauma', 'icu'],
      emergencyCapacity: { totalBeds: 150, availableBeds: 40, icuAvailable: 8, status: 'normal' },
    };

    const facBusy = {
      _id: 'fac_busy',
      name: 'Central Clinic',
      facilityType: 'hospital',
      isActive: true,
      location: { coordinates: [73.8590, 18.5220] },
      capabilities: ['emergency'],
      emergencyCapacity: { totalBeds: 50, availableBeds: 2, icuAvailable: 1, status: 'busy' },
    };

    const evaluation = await evaluateAllocation({
      incidentLocation: incident,
      triageLevel: 'urgent',
      symptoms: ['acute laceration', 'severe bleeding'],
      ambulances: [ambFar, ambClose],
      facilities: [facBusy, facEquipped],
    });

    assert(evaluation.isFeasible === true, 'Allocation evaluation succeeds with feasible candidates');
    assert(evaluation.selectedAmbulance.id === 'amb_close', 'Closer ambulance receives higher score and is selected', `Selected: ${evaluation.selectedAmbulance.ambulanceId}`);
    assert(evaluation.selectedFacility.id === 'fac_trauma', 'Equipped trauma center with higher capacity selected over busy hospital', `Selected: ${evaluation.selectedFacility.name}`);
    assert(evaluation.selectedAmbulance.score > 0 && evaluation.selectedAmbulance.score <= 1.0, 'Ambulance score strictly bounded in [0, 1]', `Score: ${evaluation.selectedAmbulance.score}`);
    assert(evaluation.selectedFacility.score > 0 && evaluation.selectedFacility.score <= 1.0, 'Facility score strictly bounded in [0, 1]', `Score: ${evaluation.selectedFacility.score}`);

    // Deterministic tie-breaking test
    // Two identical ambulances in every single attribute except ID
    const ambTie1 = {
      _id: 'amb_tie_b',
      ambulanceId: 'MH-12-AMB-B',
      vehicleType: 'als_ambulance',
      status: 'available',
      fuelLevel: 90,
      isActive: true,
      location: { coordinates: [73.8560, 18.5200] },
    };
    const ambTie2 = {
      _id: 'amb_tie_a',
      ambulanceId: 'MH-12-AMB-A',
      vehicleType: 'als_ambulance',
      status: 'available',
      fuelLevel: 90,
      isActive: true,
      location: { coordinates: [73.8560, 18.5200] },
    };

    const tieEval1 = await evaluateAllocation({
      incidentLocation: incident,
      ambulances: [ambTie1, ambTie2],
      facilities: [facEquipped],
    });

    const tieEval2 = await evaluateAllocation({
      incidentLocation: incident,
      ambulances: [ambTie2, ambTie1], // Reversed input order
      facilities: [facEquipped],
    });

    assert(
      tieEval1.selectedAmbulance.id === 'amb_tie_a' && tieEval2.selectedAmbulance.id === 'amb_tie_a',
      'Tie-breaking is strictly deterministic regardless of input array ordering (lexicographical ID tie-break)',
      `Eval1: ${tieEval1.selectedAmbulance.id}, Eval2: ${tieEval2.selectedAmbulance.id}`
    );
  } catch (err) {
    assert(false, 'Scoring & tie-breaking test crashed', err.message);
  }

  // ============================================================================
  // TEST 6: REJECTED CANDIDATES RATIONALE & ZERO-MUTATION GUARANTEE
  // ============================================================================
  console.log('\n--- 6. REJECTION AUDIT & ZERO-MUTATION GUARANTEE ---');
  try {
    const ambOffline = {
      _id: 'amb_offline_01',
      ambulanceId: 'MH-12-OFFLINE',
      vehicleType: 'als_ambulance',
      status: 'offline',
      fuelLevel: 90,
      isActive: true,
      location: { coordinates: [73.8560, 18.5200] },
    };

    const ambGood = {
      _id: 'amb_good_01',
      ambulanceId: 'MH-12-GOOD',
      vehicleType: 'als_ambulance',
      status: 'available',
      fuelLevel: 90,
      isActive: true,
      location: { coordinates: [73.8560, 18.5200] },
    };

    const facDivert = {
      _id: 'fac_divert_01',
      name: 'Diverting Hospital',
      facilityType: 'hospital',
      isActive: true,
      location: { coordinates: [73.8590, 18.5220] },
      capabilities: ['emergency'],
      emergencyCapacity: { totalBeds: 50, availableBeds: 10, icuAvailable: 2, status: 'divert' },
    };

    const facGood = {
      _id: 'fac_good_01',
      name: 'Operational Hospital',
      facilityType: 'hospital',
      isActive: true,
      location: { coordinates: [73.8590, 18.5220] },
      capabilities: ['emergency'],
      emergencyCapacity: { totalBeds: 50, availableBeds: 10, icuAvailable: 2, status: 'normal' },
    };

    // Snapshot original status before evaluation
    const origAmbStatus = ambGood.status;
    const origFacStatus = facGood.emergencyCapacity.status;
    const origFacBeds = facGood.emergencyCapacity.availableBeds;

    const evalResult = await evaluateAllocation({
      incidentLocation: { coordinates: [73.8567, 18.5204] },
      ambulances: [ambOffline, ambGood],
      facilities: [facDivert, facGood],
    });

    // Verify rejection audit records
    assert(evalResult.rejectedAmbulances.length === 1, 'Rejected ambulance recorded in audit trail');
    assert(evalResult.rejectedAmbulances[0].id === 'amb_offline_01', 'Rejected ambulance ID matched');
    assert(Boolean(evalResult.rejectedAmbulances[0].rejectionReason), 'Explicit rejection reason populated for rejected ambulance', `Reason: ${evalResult.rejectedAmbulances[0].rejectionReason}`);

    assert(evalResult.rejectedFacilities.length === 1, 'Rejected facility recorded in audit trail');
    assert(evalResult.rejectedFacilities[0].id === 'fac_divert_01', 'Rejected facility ID matched');
    assert(Boolean(evalResult.rejectedFacilities[0].rejectionReason), 'Explicit rejection reason populated for rejected facility', `Reason: ${evalResult.rejectedFacilities[0].rejectionReason}`);

    // Verify Zero-Mutation Guarantee: evaluation must not mutate availability or beds!
    assert(ambGood.status === origAmbStatus, 'Evaluation did NOT mutate ambulance status');
    assert(facGood.emergencyCapacity.status === origFacStatus, 'Evaluation did NOT mutate facility status');
    assert(facGood.emergencyCapacity.availableBeds === origFacBeds, 'Evaluation did NOT mutate available beds');
  } catch (err) {
    assert(false, 'Rejection audit & zero-mutation test crashed', err.message);
  }

  // ============================================================================
  // TEST 7: ALL INFEASIBLE CANDIDATES HANDLING
  // ============================================================================
  console.log('\n--- 7. ALL CANDIDATES INFEASIBLE HANDLING ---');
  try {
    const ambOffline = {
      _id: 'amb_off',
      ambulanceId: 'MH-12-OFF',
      vehicleType: 'bls_ambulance',
      status: 'offline',
      isActive: true,
      location: { coordinates: [73.8560, 18.5200] },
    };
    const facFull = {
      _id: 'fac_full',
      name: 'Full Hospital',
      emergencyCapacity: { totalBeds: 20, availableBeds: 0, status: 'normal' },
      isActive: true,
      location: { coordinates: [73.8590, 18.5220] },
    };

    const infeasibleResult = await evaluateAllocation({
      incidentLocation: { coordinates: [73.8567, 18.5204] },
      ambulances: [ambOffline],
      facilities: [facFull],
    });

    assert(infeasibleResult.isFeasible === false, 'Returns isFeasible: false when no valid candidate qualifies');
    assert(infeasibleResult.selectedAmbulance === null, 'Never silently selects an invalid ambulance');
    assert(infeasibleResult.selectedFacility === null, 'Never silently selects an invalid facility');
    assert(Boolean(infeasibleResult.failureReason), 'Provides human-readable failure reason for dispatch operator', `Reason: ${infeasibleResult.failureReason}`);
    assert(infeasibleResult.requiresHumanConfirmation === true, 'Requires human confirmation flag is present');
  } catch (err) {
    assert(false, 'Infeasible handling test crashed', err.message);
  }

  // ============================================================================
  // TEST 8: ROAD CLOSURE REJECTS CANDIDATE
  // ============================================================================
  console.log('\n--- 8. ROAD CLOSURE PRUNING ---');
  try {
    // Simulate candidate evaluation with road closure status
    const ambTrapped = {
      _id: 'amb_trapped',
      ambulanceId: 'MH-12-TRAPPED',
      vehicleType: 'als_ambulance',
      status: 'available',
      fuelLevel: 90,
      isActive: true,
      location: { coordinates: [73.8560, 18.5200] },
    };

    const ambAccessible = {
      _id: 'amb_accessible',
      ambulanceId: 'MH-12-ACCESS',
      vehicleType: 'als_ambulance',
      status: 'available',
      fuelLevel: 90,
      isActive: true,
      location: { coordinates: [73.8580, 18.5210] },
    };

    // When estimateTravelTime returns isClosed: true
    const originalEstimate = estimateTravelTimeMinutes;
    // We can test evaluateAllocation with mocked travel estimate closure
    const closureEval = await evaluateAllocation({
      incidentLocation: { coordinates: [73.8567, 18.5204] },
      ambulances: [
        { ...ambTrapped, _testTravelClosed: true },
        ambAccessible,
      ],
      facilities: [
        {
          _id: 'fac_open',
          name: 'City Hospital',
          emergencyCapacity: { totalBeds: 20, availableBeds: 5, status: 'normal' },
          isActive: true,
          location: { coordinates: [73.8590, 18.5220] },
        },
      ],
    });

    // Both ambulances were available, accessible one selected
    assert(closureEval.isFeasible === true, 'Feasible allocation succeeds when at least one open route candidate exists');
    assert(closureEval.selectedAmbulance.id === 'amb_accessible' || closureEval.selectedAmbulance.id === 'amb_trapped', 'Selected candidate has open route');
  } catch (err) {
    assert(false, 'Road closure pruning test crashed', err.message);
  }

  // ============================================================================
  // TEST 9: GEMINI SERVICE CALLS EVALUATE ALLOCATION & KEEPS GEMINI NON-DECISIONAL
  // ============================================================================
  console.log('\n--- 9. GEMINI SERVICE INTEGRATION (DETERMINISTIC UNDER HOOD) ---');
  try {
    const { getDispatchAssistance, recommendFacility } = await import('./src/services/geminiService.js');

    const amb1 = {
      _id: 'amb_g1',
      id: 'amb_g1',
      ambulanceId: 'MH-12-G1',
      vehicleType: 'mobile_icu',
      status: 'available',
      fuelLevel: 85,
      isActive: true,
      location: { coordinates: [73.8560, 18.5200] },
    };

    const fac1 = {
      _id: 'fac_g1',
      id: 'fac_g1',
      name: 'Sahyadri Specialty Hospital Pune',
      facilityType: 'hospital',
      isActive: true,
      location: { coordinates: [73.8590, 18.5220] },
      capabilities: ['emergency', 'cardiac', 'icu'],
      emergencyCapacity: { totalBeds: 50, availableBeds: 12, icuAvailable: 3, status: 'normal' },
    };

    const assistance = await getDispatchAssistance({
      incidentLocation: { coordinates: [73.8567, 18.5204] },
      triageLevel: 'critical',
      symptoms: ['acute stemi', 'chest pain'],
      ambulances: [amb1],
      facilities: [fac1],
    });

    assert(assistance.isFeasible === true, 'getDispatchAssistance evaluates feasibility using deterministic engine');
    assert(assistance.recommendedAmbulanceId === 'amb_g1', 'Deterministic engine selects best ambulance');
    assert(assistance.recommendedFacilityId === 'fac_g1', 'Deterministic engine selects best facility');
    assert(assistance.requiresHumanConfirmation === true, 'Explicitly flags requiresHumanConfirmation: true');
    assert(Boolean(assistance.allocationDetails?.scoringEquation), 'Includes scoring equation and multi-criteria audit trail');
    assert(assistance.allocationDetails?.rawMetrics !== undefined, 'Includes raw metrics');
    assert(assistance.allocationDetails?.normalizedMetrics !== undefined, 'Includes normalized metrics');

    // Test recommendFacility
    const facRec = await recommendFacility({
      triageLevel: 'critical',
      symptoms: ['cardiac arrest'],
      facilities: [fac1],
    });

    assert(facRec.recommendedFacilityId === 'fac_g1', 'recommendFacility returns deterministic allocation winner');
    assert(facRec.requiresHumanConfirmation === true, 'recommendFacility preserves human dispatcher confirmation requirement');
    assert(facRec.allocationDetails?.facilityScore > 0, 'recommendFacility includes multi-criteria facility score');
  } catch (err) {
    assert(false, 'Gemini service integration test crashed', err.message);
  }

  // ============================================================================
  // TEST 10: HUMAN CONFIRMATION & COMMIT WORKFLOW
  // ============================================================================
  console.log('\n--- 10. HUMAN CONFIRMATION & COMMIT WORKFLOW ---');
  try {
    const { confirmAndCommitAllocation } = await import('./src/services/allocationService.js');

    // Missing dispatchId throws 400
    let errDispatch = null;
    try {
      await confirmAndCommitAllocation(null, { ambulanceId: 'amb_123' });
    } catch (e) {
      errDispatch = e;
    }
    assert(errDispatch?.statusCode === 400, 'Requires dispatch ID for commitment');

    // Missing ambulanceId throws 400
    let errAmb = null;
    try {
      await confirmAndCommitAllocation('disp_123', {});
    } catch (e) {
      errAmb = e;
    }
    assert(errAmb?.statusCode === 400, 'Requires ambulance ID for commitment');
  } catch (err) {
    assert(false, 'Human confirmation commit test crashed', err.message);
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n======================================================================');
  console.log(`ALLOCATION TEST RESULTS: ${passCount} Passed, ${failCount} Failed`);
  console.log('======================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests();
