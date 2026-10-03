import mongoose from 'mongoose';
import User from '../models/User.js';
import logger from './logger.js';

/**
 * Bootstrap an initial administrator if no admin exists in the database.
 * This ensures the application always has a secure admin without allowing
 * public self-registration of administrative privileges.
 */
export const bootstrapAdmin = async () => {
  try {
    if (mongoose.connection.readyState !== 1) {
      logger.warn('Skipping administrator bootstrap: MongoDB connection is not active.');
      return;
    }

    const adminCount = await User.countDocuments({ role: 'admin' });

    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@mediroute.io').toLowerCase().trim();
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';
    const adminName = process.env.ADMIN_NAME || 'System Administrator';
    const adminPhone = process.env.ADMIN_PHONE || '+91 98200 00001';

    if (adminCount === 0) {
      // Check if user with that email already exists
      let existingUser = await User.findOne({ email: adminEmail });
      if (existingUser) {
        existingUser.role = 'admin';
        existingUser.approvalStatus = 'approved';
        existingUser.approvedAt = new Date();
        await existingUser.save();
        logger.info(`Promoted existing user (${adminEmail}) to approved administrator.`);
      } else {
        await User.create({
          name: adminName,
          email: adminEmail,
          password: adminPassword,
          role: 'admin',
          phone: adminPhone,
          approvalStatus: 'approved',
          approvedAt: new Date(),
          isActive: true,
        });
        logger.info(`Default administrator account bootstrapped successfully: ${adminEmail}`);
      }
    } else {
      // Ensure existing admin account is approved and active
      const admin = await User.findOne({ role: 'admin' });
      if (admin && admin.approvalStatus !== 'approved') {
        admin.approvalStatus = 'approved';
        admin.approvedAt = new Date();
        await admin.save();
        logger.info(`Confirmed approval status for administrator: ${admin.email}`);
      }
    }
  } catch (error) {
    logger.error('Error during administrator bootstrap check:', error.message);
  }
};

export default bootstrapAdmin;
