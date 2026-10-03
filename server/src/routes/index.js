import { Router } from 'express';
import healthRoutes from './healthRoutes.js';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import facilityRoutes from './facilityRoutes.js';
import dispatchRoutes from './dispatchRoutes.js';
import routeRoutes from './routeRoutes.js';
import aiRoutes from './aiRoutes.js';
import ambulanceRoutes from './ambulanceRoutes.js';
import mapRoutes from './mapRoutes.js';

const apiRouter = Router();

// Mount API feature routes
apiRouter.use('/health', healthRoutes);
apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/facilities', facilityRoutes);
apiRouter.use('/dispatches', dispatchRoutes);
apiRouter.use('/routes', routeRoutes);
apiRouter.use('/ai', aiRoutes);
apiRouter.use('/ambulances', ambulanceRoutes);
apiRouter.use('/map', mapRoutes);

export default apiRouter;
