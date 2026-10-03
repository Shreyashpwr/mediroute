import mongoose from 'mongoose';

// GeoJSON Point schema for geospatial queries
const pointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
      required: true,
    },
    // [longitude, latitude]
    coordinates: {
      type: [Number],
      required: true,
    },
  },
  { _id: false }
);

const ambulanceSchema = new mongoose.Schema(
  {
    ambulanceId: {
      type: String,
      required: [true, 'Ambulance registration ID is required'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    vehicleType: {
      type: String,
      enum: {
        values: ['als_ambulance', 'bls_ambulance', 'patient_transport', 'mobile_icu'],
        message: '{VALUE} is not a valid vehicle type',
      },
      default: 'als_ambulance',
    },
    status: {
      type: String,
      enum: {
        values: ['available', 'en_route', 'at_scene', 'transporting', 'offline'],
        message: '{VALUE} is not a valid ambulance status',
      },
      default: 'available',
      index: true,
    },
    location: {
      type: pointSchema,
      required: [true, 'Ambulance location coordinates are required'],
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    currentDispatch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dispatch',
      default: null,
    },
    destinationFacility: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Facility',
      default: null,
    },
    assignedDriver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    driverName: {
      type: String,
      trim: true,
      default: '',
    },
    contactPhone: {
      type: String,
      trim: true,
      default: '',
    },
    fuelLevel: {
      type: Number,
      min: 0,
      max: 100,
      default: 85,
    },
    equipment: [{ type: String, trim: true }],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

ambulanceSchema.index({ location: '2dsphere' });
ambulanceSchema.index({ status: 1, vehicleType: 1 });

export const Ambulance = mongoose.model('Ambulance', ambulanceSchema);
export default Ambulance;
