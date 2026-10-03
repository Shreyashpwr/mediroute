import { Router } from 'express';
import * as aiController from '../controllers/aiController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = Router();

// Public status check (returns configured status, zero secret leakage)
router.get('/status', aiController.getAiStatus);

// Protected AI decision-support endpoints
router.post('/triage', protect, aiController.assessTriage);
router.post('/summarize-incident', protect, aiController.summarizeIncident);
router.post('/dispatch-assistance', protect, aiController.getDispatchAssistance);
router.post('/optimize-route', protect, aiController.optimizeRoute);
router.post('/recommend-facility', protect, aiController.recommendFacility);

export default router;
