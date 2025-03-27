const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { User, OTP } = require('../models');
const { sendOTPEmail } = require('../utils/emailService');
const { Op } = require('sequelize');

// Generate and send OTP
router.post('/send-otp',
  [
    body('email').isEmail().withMessage('Please enter a valid email')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email } = req.body;

      // Check if user exists
      const user = await User.findOne({ where: { email } });
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Check if user has exceeded verification attempts
      if (user.emailVerificationAttempts >= 3) {
        return res.status(429).json({ 
          message: 'Too many verification attempts. Please try again later.' 
        });
      }

      // Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 60000); // 1 minute from now

      // Delete any existing unverified OTPs for this email
      await OTP.destroy({
        where: {
          email,
          isVerified: false
        }
      });

      // Create new OTP
      await OTP.create({
        email,
        otp,
        expiresAt
      });

      // Send OTP via email
      const emailSent = await sendOTPEmail(email, otp);
      if (!emailSent) {
        return res.status(500).json({ message: 'Failed to send OTP email' });
      }

      res.json({ message: 'OTP sent successfully' });
    } catch (error) {
      console.error('Error sending OTP:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Verify OTP
router.post('/verify-otp',
  [
    body('email').isEmail().withMessage('Please enter a valid email'),
    body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, otp } = req.body;

      // Find the latest unverified OTP for this email
      const otpRecord = await OTP.findOne({
        where: {
          email,
          isVerified: false,
          expiresAt: {
            [Op.gt]: new Date()
          }
        },
        order: [['createdAt', 'DESC']]
      });

      if (!otpRecord) {
        return res.status(400).json({ 
          message: 'Invalid or expired OTP. Please request a new one.' 
        });
      }

      // Check if OTP matches
      const isMatch = await otpRecord.compareOTP(otp);
      if (!isMatch) {
        // Increment attempts
        await otpRecord.increment('attempts');
        
        // If max attempts reached, mark user's verification attempts
        if (otpRecord.attempts >= 3) {
          await User.increment('emailVerificationAttempts', {
            where: { email }
          });
        }

        return res.status(400).json({ message: 'Invalid OTP' });
      }

      // Mark OTP as verified
      await otpRecord.update({ isVerified: true });

      // Update user's email verification status
      await User.update(
        { 
          isEmailVerified: true,
          emailVerificationAttempts: 0 // Reset attempts on successful verification
        },
        { where: { email } }
      );

      res.json({ message: 'Email verified successfully' });
    } catch (error) {
      console.error('Error verifying OTP:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

module.exports = router; 