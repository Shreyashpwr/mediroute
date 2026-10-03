import mongoose from 'mongoose';

const waypointSchema = new mongoose.Schema(
  {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const routeEndpointSchema = new mongoose.Schema(
  {
    address: { type: String, trim: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
  },
  { _id: false }
);

const aiRouteOptimizationSchema = new mongoose.Schema(
  {
    recommendedRouteName: { type: String, trim: true },
    reasoning: { type: String, trim: true },
    avoidedHazards: [{ type: String, trim: true }],
    estimatedTimeSavedMinutes: { type: Number, default: 0 },
  },
  { _id: false }
);

const routeLogSchema = new mongoose.Schema(
  {
    dispatch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dispatch',
      required: [true, 'Dispatch reference is required'],
    },
    origin: {
      type: routeEndpointSchema,
      required: true,
    },
    destination: {
      type: routeEndpointSchema,
      required: true,
    },
    estimatedDistanceKm: {
      type: Number,
      min: 0,
    },
    estimatedDurationMinutes: {
      type: Number,
      min: 0,
    },
    actualDurationMinutes: {
      type: Number,
      min: 0,
    },
    waypoints: [waypointSchema],
    trafficCondition: {
      type: String,
      enum: {
        values: ['light', 'moderate', 'heavy', 'severe'],
        message: '{VALUE} is not a valid traffic condition',
      },
      default: 'light',
    },
    aiOptimization: aiRouteOptimizationSchema,
  },
  {
    timestamps: true,
  }
);

// Indexes
routeLogSchema.index({ dispatch: 1 });

export const RouteLog = mongoose.model('RouteLog', routeLogSchema);
export default RouteLog;
