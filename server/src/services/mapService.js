import Ambulance from '../models/Ambulance.js';
import Facility from '../models/Facility.js';
import Dispatch from '../models/Dispatch.js';

export const getOperationalMapData = async () => {
  // Query live ambulances
  const ambulances = await Ambulance.find({ isActive: true })
    .populate('destinationFacility', 'name emergencyCapacity address')
    .populate('currentDispatch', 'dispatchNumber patientName triageLevel status')
    .lean();

  // Query live healthcare facilities
  const facilities = await Facility.find({ isActive: true }).lean();

  // Query active emergency dispatches / incidents (unresolved incidents only)
  const activeDispatches = await Dispatch.find({
    status: { $in: ['pending', 'assigned', 'en_route', 'arrived'] },
  })
    .populate('destinationFacility', 'name emergencyCapacity address location')
    .populate('assignedDriver', 'name phone')
    .populate('assignedAmbulance', 'ambulanceId vehicleType status')
    .sort({ createdAt: -1 })
    .lean();

  // Compute operational overview
  const availableAmbulances = ambulances.filter((a) => a.status === 'available').length;
  const enRouteAmbulances = ambulances.filter(
    (a) => a.status === 'en_route' || a.status === 'transporting'
  ).length;

  const criticalIncidents = activeDispatches.filter((d) => d.triageLevel === 'critical').length;
  const urgentIncidents = activeDispatches.filter((d) => d.triageLevel === 'urgent').length;

  let totalBeds = 0;
  let availableBeds = 0;
  let icuAvailable = 0;
  let divertingFacilities = 0;

  facilities.forEach((f) => {
    const cap = f.emergencyCapacity || {};
    totalBeds += cap.totalBeds || 0;
    availableBeds += cap.availableBeds || 0;
    icuAvailable += cap.icuAvailable || 0;
    if (cap.status === 'divert') divertingFacilities++;
  });

  return {
    ambulances: ambulances.map((amb) => ({
      id: amb._id,
      ambulanceId: amb.ambulanceId,
      vehicleType: amb.vehicleType,
      status: amb.status,
      coordinates: amb.location?.coordinates
        ? {
            latitude: amb.location.coordinates[1],
            longitude: amb.location.coordinates[0],
          }
        : null,
      address: amb.address,
      fuelLevel: amb.fuelLevel,
      currentDispatch: amb.currentDispatch
        ? {
            id: amb.currentDispatch._id,
            dispatchNumber: amb.currentDispatch.dispatchNumber,
            patientName: amb.currentDispatch.patientName,
            triageLevel: amb.currentDispatch.triageLevel,
            status: amb.currentDispatch.status,
          }
        : null,
      destinationFacility: amb.destinationFacility
        ? {
            id: amb.destinationFacility._id,
            name: amb.destinationFacility.name,
            status: amb.destinationFacility.emergencyCapacity?.status,
          }
        : null,
      driverName: amb.driverName || amb.assignedDriver?.name,
      contactPhone: amb.contactPhone || amb.assignedDriver?.phone,
      updatedAt: amb.updatedAt,
    })),

    facilities: facilities.map((fac) => ({
      id: fac._id,
      name: fac.name,
      facilityType: fac.facilityType,
      coordinates: fac.location?.coordinates
        ? {
            latitude: fac.location.coordinates[1],
            longitude: fac.location.coordinates[0],
          }
        : null,
      address: fac.address,
      emergencyCapacity: fac.emergencyCapacity,
      capabilities: fac.capabilities || [],
      contactPhone: fac.contactPhone,
      isOpen24Hours: fac.isOpen24Hours,
    })),

    incidents: activeDispatches.map((disp) => ({
      id: disp._id,
      dispatchNumber: disp.dispatchNumber,
      patientName: disp.patientName,
      triageLevel: disp.triageLevel,
      status: disp.status,
      pickupLocation: disp.pickupLocation,
      coordinates: disp.pickupLocation?.coordinates || null,
      destinationFacility: disp.destinationFacility
        ? {
            id: disp.destinationFacility._id,
            name: disp.destinationFacility.name,
          }
        : null,
      vehicleType: disp.vehicleType,
      assignedAmbulance: disp.assignedAmbulance
        ? {
            id: disp.assignedAmbulance._id,
            ambulanceId: disp.assignedAmbulance.ambulanceId,
          }
        : null,
      symptoms: disp.symptoms,
      createdAt: disp.createdAt,
    })),

    metrics: {
      totalAmbulances: ambulances.length,
      availableAmbulances,
      enRouteAmbulances,
      activeIncidents: activeDispatches.length,
      criticalIncidents,
      urgentIncidents,
      totalFacilities: facilities.length,
      totalBeds,
      availableBeds,
      icuAvailable,
      divertingFacilities,
      timestamp: new Date().toISOString(),
    },
  };
};
