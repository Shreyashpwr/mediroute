import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema(
  {
    street: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    zipCode: { type: String, trim: true },
  },
  { _id: false }
);

// GeoJSON Point schema
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

const emergencyCapacitySchema = new mongoose.Schema(
  {
    totalBeds: { type: Number, default: 0, min: 0 },
    availableBeds: { type: Number, default: 0, min: 0 },
    icuAvailable: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['normal', 'busy', 'critical', 'divert'],
      default: 'normal',
    },
  },
  { _id: false }
);

const facilitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Facility name is required'],
      trim: true,
      maxlength: [150, 'Facility name cannot exceed 150 characters'],
    },
    facilityType: {
      type: String,
      enum: {
        values: ['hospital', 'trauma_center', 'urgent_care', 'clinic', 'pharmacy'],
        message: '{VALUE} is not a valid facility type',
      },
      default: 'hospital',
    },
    address: addressSchema,
    location: {
      type: pointSchema,
      required: [true, 'Geographic coordinates are required'],
    },
    capabilities: [{ type: String, trim: true }], // e.g., 'icu', 'trauma_level_1', 'cardiac', 'stroke', 'pediatrics'
    emergencyCapacity: {
      type: emergencyCapacitySchema,
      default: () => ({}),
    },
    contactPhone: {
      type: String,
      trim: true,
    },
    isOpen24Hours: {
      type: Boolean,
      default: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// 2dsphere index for geospatial queries (nearby hospitals, radius search)
facilitySchema.index({ location: '2dsphere' });
facilitySchema.index({ facilityType: 1 });
facilitySchema.index({ 'emergencyCapacity.status': 1 });

export const Facility = mongoose.model('Facility', facilitySchema);
export default Facility;
