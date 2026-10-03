import { connectDB, disconnectDB } from '../config/db.js';
import User from '../models/User.js';
import Facility from '../models/Facility.js';
import Ambulance from '../models/Ambulance.js';
import Dispatch from '../models/Dispatch.js';
import RouteLog from '../models/RouteLog.js';
import logger from './logger.js';

export const seedIndianData = async () => {
  logger.info('Starting MediRoute synthetic Indian demo data seeding...');

  // Clear existing collections safely
  await Promise.all([
    User.deleteMany({}),
    Facility.deleteMany({}),
    Ambulance.deleteMany({}),
    Dispatch.deleteMany({}),
    RouteLog.deleteMany({}),
  ]);

  logger.info('Existing demo collections cleared.');

  // 1. Seed Users (Admin, Dispatchers, Medical Staff, Transport Operators, Pending & Rejected)
  const defaultPassword = 'Password@123';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';

  const admin = await User.create({
    name: 'System Administrator',
    email: (process.env.ADMIN_EMAIL || 'admin@mediroute.io').toLowerCase(),
    password: adminPassword,
    phone: '+91 98200 00001',
    role: 'admin',
    approvalStatus: 'approved',
    approvedAt: new Date(),
    isActive: true,
  });

  const dispatcher1 = await User.create({
    name: 'Rajesh Deshpande',
    email: 'rajesh.dispatcher@mediroute.in',
    password: defaultPassword,
    phone: '+91 98220 11990',
    role: 'dispatcher',
    approvalStatus: 'approved',
    approvedAt: new Date(),
    approvedBy: admin._id,
    isActive: true,
  });

  const dispatcher2 = await User.create({
    name: 'Pooja Patil',
    email: 'pooja.patil@mediroute.in',
    password: defaultPassword,
    phone: '+91 98231 22334',
    role: 'dispatcher',
    approvalStatus: 'approved',
    approvedAt: new Date(),
    approvedBy: admin._id,
    isActive: true,
  });

  const doctor1 = await User.create({
    name: 'Dr. Arun Joshi',
    email: 'dr.arun.joshi@mediroute.in',
    password: defaultPassword,
    phone: '+91 94220 33445',
    role: 'medical_staff',
    approvalStatus: 'approved',
    approvedAt: new Date(),
    approvedBy: admin._id,
    isActive: true,
  });

  const doctor2 = await User.create({
    name: 'Dr. Kavita Sharma',
    email: 'dr.kavita.sharma@mediroute.in',
    password: defaultPassword,
    phone: '+91 94220 55667',
    role: 'medical_staff',
    approvalStatus: 'approved',
    approvedAt: new Date(),
    approvedBy: admin._id,
    isActive: true,
  });

  const driver1 = await User.create({
    name: 'Sachin Gaikwad',
    email: 'sachin.driver@mediroute.in',
    password: defaultPassword,
    phone: '+91 98221 66778',
    role: 'transport_operator',
    approvalStatus: 'approved',
    approvedAt: new Date(),
    approvedBy: admin._id,
    isActive: true,
  });

  const driver2 = await User.create({
    name: 'Manoj Shinde',
    email: 'manoj.shinde@mediroute.in',
    password: defaultPassword,
    phone: '+91 98221 77889',
    role: 'transport_operator',
    approvalStatus: 'approved',
    approvedAt: new Date(),
    approvedBy: admin._id,
    isActive: true,
  });

  // Pending user accounts awaiting admin review
  const pendingUser1 = await User.create({
    name: 'Kunal Bansal',
    email: 'kunal.applicant@mediroute.in',
    password: defaultPassword,
    phone: '+91 98901 33445',
    role: 'dispatcher',
    approvalStatus: 'pending',
    approvedAt: null,
    approvedBy: null,
    isActive: true,
  });

  const pendingUser2 = await User.create({
    name: 'Neha Kulkarni',
    email: 'neha.paramedic@mediroute.in',
    password: defaultPassword,
    phone: '+91 98901 44556',
    role: 'medical_staff',
    approvalStatus: 'pending',
    approvedAt: null,
    approvedBy: null,
    isActive: true,
  });

  // Rejected user account
  const rejectedUser = await User.create({
    name: 'Rahul More',
    email: 'rahul.rejected@mediroute.in',
    password: defaultPassword,
    phone: '+91 98901 55667',
    role: 'transport_operator',
    approvalStatus: 'rejected',
    approvedAt: new Date(),
    approvedBy: admin._id,
    rejectionReason: 'Unverified commercial transport license and missing background clearance certificate.',
    isActive: true,
  });

  logger.info('Synthetic Indian users seeded successfully.');

  // 2. Seed Medical Facilities (Pune, Pimpri-Chinchwad, Mumbai, Navi Mumbai)
  const facilityData = [
    {
      name: 'Pune Central Emergency Hospital',
      facilityType: 'trauma_center',
      address: {
        street: 'Ganeshkhind Road, Shivajinagar',
        city: 'Pune',
        state: 'Maharashtra',
        zipCode: '411005',
      },
      location: {
        type: 'Point',
        coordinates: [73.8478, 18.5314],
      },
      capabilities: ['trauma_level_1', 'icu', 'cardiac', 'neurosurgery', 'burn_unit'],
      emergencyCapacity: {
        totalBeds: 180,
        availableBeds: 34,
        icuAvailable: 8,
        status: 'normal',
      },
      contactPhone: '+91 20 2550 1100',
      isOpen24Hours: true,
      isActive: true,
    },
    {
      name: 'Pimpri Emergency Medical Centre',
      facilityType: 'hospital',
      address: {
        street: 'Sector 26, Pradhikaran, Nigdi',
        city: 'Pimpri-Chinchwad',
        state: 'Maharashtra',
        zipCode: '411044',
      },
      location: {
        type: 'Point',
        coordinates: [73.7997, 18.6298],
      },
      capabilities: ['icu', 'pediatrics', 'orthopedics', 'general_surgery'],
      emergencyCapacity: {
        totalBeds: 120,
        availableBeds: 18,
        icuAvailable: 4,
        status: 'normal',
      },
      contactPhone: '+91 20 2765 4321',
      isOpen24Hours: true,
      isActive: true,
    },
    {
      name: 'Sahyadri Acute Trauma Care Centre',
      facilityType: 'trauma_center',
      address: {
        street: 'Plot 30, Karve Road, Deccan Gymkhana',
        city: 'Pune',
        state: 'Maharashtra',
        zipCode: '411004',
      },
      location: {
        type: 'Point',
        coordinates: [73.8402, 18.5158],
      },
      capabilities: ['trauma_level_1', 'cardiac', 'icu', 'stroke_unit'],
      emergencyCapacity: {
        totalBeds: 95,
        availableBeds: 6,
        icuAvailable: 1,
        status: 'busy',
      },
      contactPhone: '+91 20 6721 3000',
      isOpen24Hours: true,
      isActive: true,
    },
    {
      name: 'Kothrud Municipal Emergency Unit',
      facilityType: 'urgent_care',
      address: {
        street: 'Paud Road, Ideal Colony, Kothrud',
        city: 'Pune',
        state: 'Maharashtra',
        zipCode: '411038',
      },
      location: {
        type: 'Point',
        coordinates: [73.8087, 18.5074],
      },
      capabilities: ['urgent_care', 'trauma_stabilization', 'radiology'],
      emergencyCapacity: {
        totalBeds: 50,
        availableBeds: 15,
        icuAvailable: 2,
        status: 'normal',
      },
      contactPhone: '+91 20 2544 8900',
      isOpen24Hours: true,
      isActive: true,
    },
    {
      name: 'Hinjawadi LifeLine Medical Centre',
      facilityType: 'hospital',
      address: {
        street: 'Rajiv Gandhi Infotech Park, Phase 1, Hinjawadi',
        city: 'Pune',
        state: 'Maharashtra',
        zipCode: '411057',
      },
      location: {
        type: 'Point',
        coordinates: [73.7380, 18.5913],
      },
      capabilities: ['icu', 'industrial_trauma', 'burn_unit'],
      emergencyCapacity: {
        totalBeds: 80,
        availableBeds: 2,
        icuAvailable: 0,
        status: 'divert',
      },
      contactPhone: '+91 20 6688 9900',
      isOpen24Hours: true,
      isActive: true,
    },
    {
      name: 'Mumbai City Trauma & Acute Care Centre',
      facilityType: 'trauma_center',
      address: {
        street: 'Dr. Annie Besant Road, Worli',
        city: 'Mumbai',
        state: 'Maharashtra',
        zipCode: '400018',
      },
      location: {
        type: 'Point',
        coordinates: [72.8258, 18.9986],
      },
      capabilities: ['trauma_level_1', 'cardiac', 'neurosurgery', 'icu'],
      emergencyCapacity: {
        totalBeds: 240,
        availableBeds: 28,
        icuAvailable: 6,
        status: 'normal',
      },
      contactPhone: '+91 22 2490 8000',
      isOpen24Hours: true,
      isActive: true,
    },
    {
      name: 'Navi Mumbai Regional Emergency Hospital',
      facilityType: 'hospital',
      address: {
        street: 'Sector 17, Vashi',
        city: 'Navi Mumbai',
        state: 'Maharashtra',
        zipCode: '400703',
      },
      location: {
        type: 'Point',
        coordinates: [72.9982, 19.0664],
      },
      capabilities: ['icu', 'pediatrics', 'orthopedics'],
      emergencyCapacity: {
        totalBeds: 140,
        availableBeds: 21,
        icuAvailable: 5,
        status: 'normal',
      },
      contactPhone: '+91 22 2789 5500',
      isOpen24Hours: true,
      isActive: true,
    },
  ];

  const facilities = await Facility.create(facilityData);
  logger.info(`Seeded ${facilities.length} Indian healthcare facilities.`);

  // 3. Seed Ambulances
  const ambulanceData = [
    {
      ambulanceId: 'MH-12-AMB-101',
      vehicleType: 'als_ambulance',
      status: 'available',
      location: {
        type: 'Point',
        coordinates: [73.7925, 18.5590],
      },
      address: 'Baner Road, Shivajinagar, Pune, Maharashtra 411045',
      fuelLevel: 92,
      assignedDriver: driver1._id,
      driverName: 'Sachin Gaikwad',
      contactPhone: '+91 98221 66778',
      equipment: ['Cardiac Telemetry', 'Defibrillator', 'Ventilator', 'Emergency Oxygen'],
      isActive: true,
    },
    {
      ambulanceId: 'MH-12-AMB-102',
      vehicleType: 'bls_ambulance',
      status: 'en_route',
      location: {
        type: 'Point',
        coordinates: [73.8567, 18.5018],
      },
      address: 'Near Swargate Chowk, Pune, Maharashtra 411042',
      fuelLevel: 78,
      assignedDriver: driver2._id,
      driverName: 'Manoj Shinde',
      contactPhone: '+91 98221 77889',
      destinationFacility: facilities[0]._id,
      equipment: ['BLS Kit', 'Stretcher', 'Oxygen Tank', 'Suction Unit'],
      isActive: true,
    },
    {
      ambulanceId: 'MH-14-AMB-201',
      vehicleType: 'als_ambulance',
      status: 'transporting',
      location: {
        type: 'Point',
        coordinates: [73.8150, 18.6180],
      },
      address: 'Akurdi Railway Station Road, PCMC, Maharashtra 411035',
      fuelLevel: 65,
      driverName: 'Santosh Patil',
      contactPhone: '+91 98220 99881',
      destinationFacility: facilities[1]._id,
      equipment: ['ALS Telemetry', 'Defibrillator', 'Infusion Pump'],
      isActive: true,
    },
    {
      ambulanceId: 'MH-14-AMB-202',
      vehicleType: 'mobile_icu',
      status: 'at_scene',
      location: {
        type: 'Point',
        coordinates: [73.7650, 18.5980],
      },
      address: 'Dutta Mandir Road, Wakad, Pune, Maharashtra 411057',
      fuelLevel: 84,
      driverName: 'Vikram Ghorpade',
      contactPhone: '+91 98220 88772',
      destinationFacility: facilities[4]._id,
      equipment: ['Mobile ICU Suite', 'Dual Ventilator', 'Arterial Line Monitor'],
      isActive: true,
    },
    {
      ambulanceId: 'MH-12-AMB-105',
      vehicleType: 'patient_transport',
      status: 'available',
      location: {
        type: 'Point',
        coordinates: [73.8120, 18.5080],
      },
      address: 'Paud Road, Kothrud, Pune, Maharashtra 411038',
      fuelLevel: 88,
      driverName: 'Ramesh Jadhav',
      contactPhone: '+91 98220 77663',
      equipment: ['Wheelchair Lift', 'Oxygen Delivery', 'Basic First Aid'],
      isActive: true,
    },
    {
      ambulanceId: 'MH-12-AMB-108',
      vehicleType: 'als_ambulance',
      status: 'offline',
      location: {
        type: 'Point',
        coordinates: [73.9260, 18.5089],
      },
      address: 'Magarpatta City Gate, Hadapsar, Pune, Maharashtra 411028',
      fuelLevel: 45,
      driverName: 'Unassigned',
      contactPhone: '+91 20 2680 0000',
      equipment: ['Under Scheduled Maintenance'],
      isActive: true,
    },
    {
      ambulanceId: 'MH-01-AMB-301',
      vehicleType: 'als_ambulance',
      status: 'available',
      location: {
        type: 'Point',
        coordinates: [72.8350, 19.0120],
      },
      address: 'Dr. E Moses Road, Worli, Mumbai, Maharashtra 400018',
      fuelLevel: 95,
      driverName: 'Amit Bhosle',
      contactPhone: '+91 98200 44551',
      destinationFacility: facilities[5]._id,
      equipment: ['ALS Cardiac Monitor', 'Resuscitator', 'Spinal Board'],
      isActive: true,
    },
    {
      ambulanceId: 'MH-43-AMB-401',
      vehicleType: 'bls_ambulance',
      status: 'available',
      location: {
        type: 'Point',
        coordinates: [72.9920, 19.0710],
      },
      address: 'Sector 17, Vashi, Navi Mumbai, Maharashtra 400703',
      fuelLevel: 80,
      driverName: 'Nitin Chavan',
      contactPhone: '+91 98200 66772',
      destinationFacility: facilities[6]._id,
      equipment: ['BLS Trauma Care Kit', 'O2 Resuscitator'],
      isActive: true,
    },
  ];

  const ambulances = await Ambulance.create(ambulanceData);
  logger.info(`Seeded ${ambulances.length} synthetic Indian ambulances.`);

  // 4. Seed Emergency Dispatches / Incidents
  const dispatchData = [
    {
      dispatchNumber: 'DSP-MH-2026-001',
      patientName: 'Rajesh Sharma',
      contactPhone: '+91 98220 11223',
      pickupLocation: {
        address: 'Near Balewadi High Street, Baner Road, Pune, Maharashtra 411045',
        coordinates: {
          latitude: 18.5712,
          longitude: 73.7789,
        },
      },
      destinationFacility: facilities[0]._id, // Pune Central
      triageLevel: 'critical',
      status: 'en_route',
      assignedDriver: driver2._id,
      assignedAmbulance: ambulances[1]._id,
      vehicleType: 'als_ambulance',
      symptoms: ['Acute crushing chest pain', 'Diaphoresis', 'Shortness of breath'],
      aiAssessment: {
        recommendedFacilityType: 'trauma_center',
        urgencyScore: 9,
        summary: 'Suspected acute coronary syndrome with active diaphoresis. Immediate ALS transit to cardiac catheterization lab indicated.',
        recommendations: [
          'Maintain high-flow oxygen and continuous 12-lead ECG telemetry',
          'Notify receiving ER cardiac catheterization suite immediately',
        ],
        evaluatedAt: new Date(),
      },
      notes: 'HIGH PRIORITY: Rapid ALS unit deployment requested from Baner commercial corridor.',
    },
    {
      dispatchNumber: 'DSP-MH-2026-002',
      patientName: 'Priya Deshmukh',
      contactPhone: '+91 98231 44556',
      pickupLocation: {
        address: 'Sector 26, Spine Road, Nigdi, Pimpri-Chinchwad, Maharashtra 411044',
        coordinates: {
          latitude: 18.6385,
          longitude: 73.8052,
        },
      },
      destinationFacility: facilities[1]._id, // Pimpri Emergency
      triageLevel: 'urgent',
      status: 'assigned',
      assignedDriver: driver1._id,
      assignedAmbulance: ambulances[2]._id,
      vehicleType: 'bls_ambulance',
      symptoms: ['Suspected compound fracture of right tibia', 'Severe localized pain following two-wheeler collision'],
      aiAssessment: {
        recommendedFacilityType: 'hospital',
        urgencyScore: 6,
        summary: 'Moderate extremity trauma requiring orthopedic imaging and reduction. Patient hemodynamically stable.',
        recommendations: [
          'Immobilize limb with vacuum splint',
          'Monitor distal pulses and capillary refill during transit',
        ],
        evaluatedAt: new Date(),
      },
      notes: 'Urgent BLS transport dispatched. Scene safety confirmed by local traffic unit.',
    },
    {
      dispatchNumber: 'DSP-MH-2026-003',
      patientName: 'Amit Kulkarni',
      contactPhone: '+91 94220 77889',
      pickupLocation: {
        address: 'FC Road, Opposite Fergusson College Main Gate, Shivajinagar, Pune, Maharashtra 411004',
        coordinates: {
          latitude: 18.5236,
          longitude: 73.8415,
        },
      },
      destinationFacility: facilities[2]._id, // Sahyadri
      triageLevel: 'critical',
      status: 'pending',
      assignedAmbulance: ambulances[0]._id,
      vehicleType: 'als_ambulance',
      symptoms: ['Loss of consciousness', 'Head injury with active temporal bleed', 'Decreased responsiveness'],
      aiAssessment: {
        recommendedFacilityType: 'trauma_center',
        urgencyScore: 9,
        summary: 'Severe traumatic brain injury risk. Immediate trauma center routing required with cervical spine immobilization.',
        recommendations: [
          'Immediate cervical collar application',
          'Suction airway and monitor GCS continuously',
        ],
        evaluatedAt: new Date(),
      },
      notes: 'Pedestrian impact reported. Awaiting active unit assignment.',
    },
    {
      dispatchNumber: 'DSP-MH-2026-004',
      patientName: 'Sunita Patil',
      contactPhone: '+91 98901 22334',
      pickupLocation: {
        address: 'Dutta Mandir Road, Wakad, Pune, Maharashtra 411057',
        coordinates: {
          latitude: 18.5995,
          longitude: 73.7621,
        },
      },
      destinationFacility: facilities[4]._id, // Hinjawadi
      triageLevel: 'urgent',
      status: 'arrived',
      assignedAmbulance: ambulances[3]._id,
      vehicleType: 'mobile_icu',
      symptoms: ['Severe respiratory distress', 'Asthmatic exacerbation', 'SpO2 88% on ambient air'],
      aiAssessment: {
        recommendedFacilityType: 'hospital',
        urgencyScore: 7,
        summary: 'Severe bronchospasm and hypoxia. Nebulized bronchodilators administered.',
        recommendations: [
          'Continuous oxygen saturation monitoring',
          'Prepare for non-invasive positive pressure ventilation if SpO2 remains below 90%',
        ],
        evaluatedAt: new Date(),
      },
      notes: 'Paramedic team on scene providing nebulization.',
    },
    {
      dispatchNumber: 'DSP-MH-2026-005',
      patientName: 'Sneha Shinde',
      contactPhone: '+91 99221 88776',
      pickupLocation: {
        address: 'Vashi Sector 17 Plaza, Navi Mumbai, Maharashtra 400703',
        coordinates: {
          latitude: 19.0682,
          longitude: 72.9995,
        },
      },
      destinationFacility: facilities[6]._id, // Navi Mumbai Hospital
      triageLevel: 'urgent',
      status: 'en_route',
      assignedAmbulance: ambulances[7]._id,
      vehicleType: 'bls_ambulance',
      symptoms: ['High grade fever (103.5 F) with febrile convulsions', 'Pediatric emergency'],
      aiAssessment: {
        recommendedFacilityType: 'hospital',
        urgencyScore: 7,
        summary: 'Pediatric febrile seizure; active cooling and rapid pediatric triage advised.',
        recommendations: [
          'Maintain lateral recovery position',
          'Ensure patent airway; do not insert anything orally',
        ],
        evaluatedAt: new Date(),
      },
      notes: 'BLS unit en route with pediatric stabilization kit.',
    },
    {
      dispatchNumber: 'DSP-MH-2026-006',
      patientName: 'Vikram Joshi',
      contactPhone: '+91 97654 33221',
      pickupLocation: {
        address: 'Near Swargate Bus Terminal, Pune, Maharashtra 411042',
        coordinates: {
          latitude: 18.5012,
          longitude: 73.8585,
        },
      },
      destinationFacility: facilities[0]._id,
      triageLevel: 'standard',
      status: 'completed',
      vehicleType: 'standard_transport',
      symptoms: ['Post-operative orthopaedic follow-up transfer', 'Wheelchair assistance required'],
      notes: 'Scheduled inter-facility transport successfully completed.',
    },
  ];

  const dispatches = await Dispatch.create(dispatchData);
  logger.info(`Seeded ${dispatches.length} synthetic Indian emergency dispatches.`);

  // Link ambulance currentDispatch references realistically
  await Ambulance.findByIdAndUpdate(ambulances[1]._id, { currentDispatch: dispatches[0]._id });
  await Ambulance.findByIdAndUpdate(ambulances[2]._id, { currentDispatch: dispatches[1]._id });
  await Ambulance.findByIdAndUpdate(ambulances[3]._id, { currentDispatch: dispatches[3]._id });
  await Ambulance.findByIdAndUpdate(ambulances[7]._id, { currentDispatch: dispatches[4]._id });

  logger.info('==================================================');
  logger.info('SYNTHETIC INDIAN DATA SEEDING COMPLETED SUCCESSFULLY!');
  logger.info(`- Users: ${await User.countDocuments()}`);
  logger.info(`- Facilities: ${await Facility.countDocuments()}`);
  logger.info(`- Ambulances: ${await Ambulance.countDocuments()}`);
  logger.info(`- Dispatches: ${await Dispatch.countDocuments()}`);
  logger.info('==================================================');
};

// If run directly from CLI
if (process.argv[1]?.endsWith('seedIndianData.js')) {
  (async () => {
    try {
      await connectDB();
      await seedIndianData();
      await disconnectDB();
      process.exit(0);
    } catch (err) {
      logger.error('Error seeding data:', err);
      process.exit(1);
    }
  })();
}

export default seedIndianData;
