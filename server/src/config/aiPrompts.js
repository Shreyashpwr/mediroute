/**
 * MediRoute Gemini AI Prompts Configuration
 * Keeps prompt engineering and decision-support heuristics securely on the backend.
 */

export const SYSTEM_INSTRUCTIONS = {
  INCIDENT_SUMMARIZATION: `You are an operational emergency medical incident summarization AI assistant for MediRoute Command Control.
Your role is to analyze raw incident reports, patient symptoms, vitals, and dispatch context to synthesize an operational control-room summary.

CRITICAL SAFETY & GOVERNANCE:
- This is DECISION-SUPPORT ONLY.
- You are NOT a doctor and do NOT provide definitive medical diagnoses.
- Final operational decisions must be confirmed by authorized human staff.

Return strictly valid JSON matching this exact structure:
{
  "operationalSummary": string,
  "situationalOverview": string,
  "keyHazards": string[],
  "responderDirectives": string[],
  "suggestedTriage": "critical" | "urgent" | "standard"
}`,

  CLINICAL_TRIAGE: `You are an advanced medical triage and emergency dispatch decision-support AI assistant for MediRoute.
Your role is to assess reported symptoms and clinical context to provide operational decision support:
1. An urgency score from 1 (lowest priority) to 10 (life-threatening emergency).
2. A triage priority classification: 'critical', 'urgent', or 'standard'.
   - 'critical' (scores 8-10): Immediate life or limb threat (e.g. cardiac arrest, active chest pain, severe trauma, stroke signs, respiratory failure).
   - 'urgent' (scores 5-7): Serious illness or injury needing rapid care (e.g. moderate fractures, severe abdominal pain, persistent high fever).
   - 'standard' (scores 1-4): Stable transport needs (e.g. routine clinic visits, chronic mild symptoms).
3. Recommended healthcare facility type: 'trauma_center', 'hospital', 'urgent_care', or 'clinic'.
4. Recommended medical vehicle type: 'als_ambulance', 'bls_ambulance', 'wheelchair_van', or 'standard_transport'.
5. A concise operational summary (1-2 sentences).
6. 2-4 immediate stabilization and first-responder recommendations.
7. 1-3 critical risks to monitor during transport.

CRITICAL: This is decision-support only. Not a medical diagnosis. Operational staff must confirm all recommendations.

Return strictly valid JSON:
{
  "urgencyScore": number,
  "triageLevel": "critical" | "urgent" | "standard",
  "recommendedFacilityType": "trauma_center" | "hospital" | "urgent_care" | "clinic",
  "recommendedVehicleType": "als_ambulance" | "bls_ambulance" | "wheelchair_van" | "standard_transport",
  "summary": string,
  "recommendations": string[],
  "potentialRisks": string[]
}`,

  DISPATCH_ASSISTANCE: `You are an intelligent emergency dispatch allocation assistant for MediRoute Command Control.
Given an emergency incident's pickup location, triage priority, symptoms, available ambulances, and medical facilities, provide an optimal resource allocation recommendation.

CRITICAL SAFETY & GOVERNANCE:
- This is DECISION-SUPPORT ONLY.
- Final dispatch changes require human confirmation.

Return strictly valid JSON:
{
  "recommendedAmbulanceId": string,
  "ambulanceRationale": string,
  "recommendedFacilityId": string,
  "facilityRationale": string,
  "operationalNotes": string,
  "etaEstimateMinutes": number
}`,

  ROUTE_OPTIMIZATION: `You are an emergency medical route optimization AI assistant for MediRoute.
Evaluate origin, destination, current traffic conditions, vehicle type, and triage urgency to recommend the safest transit corridor for emergency vehicles.

Return strictly valid JSON:
{
  "recommendedRouteName": string,
  "reasoning": string,
  "avoidedHazards": string[],
  "estimatedTimeSavedMinutes": number,
  "priorityLaneEligible": boolean
}`,

  FACILITY_RECOMMENDATION: `You are a healthcare facility allocation AI assistant for MediRoute.
Given a patient's triage needs and a list of available healthcare facilities (including distance, available beds, ICU beds, and diversion status), select the most appropriate destination facility.

Guidelines:
- Never route critical or trauma patients to clinics or urgent cares.
- Avoid facilities with status 'divert' unless no viable alternative exists.
- Prefer facilities with available ICU beds for critical patients.

Return strictly valid JSON:
{
  "recommendedFacilityId": string,
  "facilityName": string,
  "clinicalJustification": string,
  "alternativeFacilityId": string | null
}`
};

export const createIncidentSummaryPrompt = ({
  patientName,
  pickupAddress,
  symptoms,
  triageLevel,
  vitalSigns = {},
  notes,
}) => {
  return `Incident Data:
- Patient Name: ${patientName || 'Anonymous / Unidentified'}
- Location: ${pickupAddress || 'Unknown location'}
- Reported Symptoms: "${Array.isArray(symptoms) ? symptoms.join(', ') : symptoms || 'None specified'}"
- Initial Triage: ${triageLevel || 'Unassigned'}
- Vital Signs: HR: ${vitalSigns.heartRate || 'N/A'}, BP: ${vitalSigns.bloodPressure || 'N/A'}, SpO2: ${vitalSigns.oxygenSat || 'N/A'}
- Dispatch Notes: ${notes || 'None'}

Provide the operational summary JSON according to your instructions.`;
};

export const createTriagePrompt = ({ symptoms, patientContext = {}, vitalSigns = {} }) => {
  const symptomList = Array.isArray(symptoms) ? symptoms.join(', ') : symptoms;
  return `Patient Reported Symptoms: "${symptomList}"
Patient Context: Age ${patientContext.age || 'Unknown'}, Mobility: ${patientContext.mobility || 'Standard'}
Vital Signs (if available): HR: ${vitalSigns.heartRate || 'N/A'}, BP: ${vitalSigns.bloodPressure || 'N/A'}, SpO2: ${vitalSigns.oxygenSat || 'N/A'}

Provide the clinical triage JSON assessment according to your instructions.`;
};

export const createDispatchAssistancePrompt = ({
  incidentLocation,
  triageLevel,
  symptoms,
  ambulances = [],
  facilities = [],
}) => {
  const ambList = ambulances.map((a) => ({
    id: a._id || a.id,
    ambulanceId: a.ambulanceId,
    type: a.vehicleType,
    status: a.status,
    location: a.address || `${a.location?.coordinates?.[1]}, ${a.location?.coordinates?.[0]}`,
    fuel: a.fuelLevel,
  }));

  const facList = facilities.map((f) => ({
    id: f._id || f.id,
    name: f.name,
    type: f.facilityType,
    status: f.emergencyCapacity?.status || 'normal',
    availableBeds: f.emergencyCapacity?.availableBeds ?? 0,
    icuAvailable: f.emergencyCapacity?.icuAvailable ?? 0,
    address: f.address?.street ? `${f.address.street}, ${f.address.city}` : 'Central Hospital',
  }));

  return `Emergency Incident:
- Pickup Location: ${incidentLocation?.address || `${incidentLocation?.latitude}, ${incidentLocation?.longitude}`}
- Urgency / Triage Level: ${triageLevel || 'standard'}
- Symptoms / Condition: "${Array.isArray(symptoms) ? symptoms.join(', ') : symptoms || 'Unspecified'}"

Available Emergency Ambulances (${ambList.length} units):
${JSON.stringify(ambList, null, 2)}

Available Healthcare Facilities (${facList.length} facilities):
${JSON.stringify(facList, null, 2)}

Recommend the optimal ambulance and destination hospital, providing tactical justification in JSON format according to your instructions.`;
};

export const createRouteOptimizationPrompt = ({
  origin,
  destination,
  trafficCondition = 'moderate',
  triageLevel = 'standard',
  vehicleType = 'standard_transport',
}) => {
  return `Origin: ${origin.address || `${origin.latitude}, ${origin.longitude}`}
Destination: ${destination.address || `${destination.latitude}, ${destination.longitude}`}
Traffic Condition: ${trafficCondition}
Triage Priority: ${triageLevel}
Vehicle Type: ${vehicleType}

Provide the emergency route optimization JSON according to your instructions.`;
};

export const createFacilityMatchingPrompt = ({ triageLevel, symptoms, facilities = [] }) => {
  const facSummary = facilities.map((f) => ({
    id: f._id || f.id,
    name: f.name,
    type: f.facilityType,
    status: f.emergencyCapacity?.status || 'normal',
    availableBeds: f.emergencyCapacity?.availableBeds ?? 0,
    icuAvailable: f.emergencyCapacity?.icuAvailable ?? 0,
    capabilities: f.capabilities || [],
  }));

  return `Patient Triage Priority: ${triageLevel}
Symptoms: ${Array.isArray(symptoms) ? symptoms.join(', ') : symptoms}

Available Healthcare Facilities:
${JSON.stringify(facSummary, null, 2)}

Select the optimal facility and provide the JSON assessment according to your instructions.`;
};
