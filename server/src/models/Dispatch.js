import mongoose from 'mongoose';

const locationCoordinatesSchema = new mongoose.Schema(
  {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
  },
  { _id: false }
);

const pickupLocationSchema = new mongoose.Schema(
  {
    address: { type: String, required: [true, 'Pickup address is required'], trim: true },
    coordinates: locationCoordinatesSchema,
  },
  { _id: false }
);

const aiAssessmentSchema = new mongoose.Schema(
  {
    recommendedFacilityType: { type: String, trim: true },
    urgencyScore: { type: Number, min: 1, max: 10 },
    summary: { type: String, trim: true },
    recommendations: [{ type: String, trim: true }],
    evaluatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const dispatchSchema = new mongoose.Schema(
  {
    dispatchNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    patientName: {
      type: String,
      required: [true, 'Patient name is required'],
      trim: true,
    },
    contactPhone: {
      type: String,
      trim: true,
    },
    pickupLocation: {
      type: pickupLocationSchema,
      required: true,
    },
    destinationFacility: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Facility',
      default: null,
    },
    triageLevel: {
      type: String,
      enum: {
        values: ['critical', 'urgent', 'standard'],
        message: '{VALUE} is not a valid triage level',
      },
      default: 'standard',
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'assigned', 'en_route', 'arrived', 'completed', 'cancelled'],
        message: '{VALUE} is not a valid dispatch status',
      },
      default: 'pending',
    },
    assignedDriver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    assignedAmbulance: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ambulance',
      default: null,
    },
    vehicleType: {
      type: String,
      enum: {
        values: [
          'als_ambulance',
          'bls_ambulance',
          'wheelchair_van',
          'standard_transport',
          'mobile_icu',
          'patient_transport',
        ],
        message: '{VALUE} is not a valid vehicle type',
      },
      default: 'standard_transport',
    },
    symptoms: [{ type: String, trim: true }],
    aiAssessment: aiAssessmentSchema,
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
dispatchSchema.index({ status: 1 });
dispatchSchema.index({ triageLevel: 1 });
dispatchSchema.index({ createdAt: -1 });

export const Dispatch = mongoose.model('Dispatch', dispatchSchema);
export default Dispatch;
