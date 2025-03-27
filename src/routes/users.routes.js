const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth.middleware');
const User = require('../models/user.model');
const Ride = require('../models/ride.model');

// Get user profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user profile
router.patch('/profile', auth,
  [
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('phone').optional().trim().notEmpty().withMessage('Phone number cannot be empty'),
    body('vehicle').optional().isObject().withMessage('Vehicle information must be an object')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const updates = Object.keys(req.body);
      const allowedUpdates = ['name', 'phone', 'vehicle'];
      const isValidOperation = updates.every(update => allowedUpdates.includes(update));

      if (!isValidOperation) {
        return res.status(400).json({ message: 'Invalid updates' });
      }

      updates.forEach(update => req.user[update] = req.body[update]);
      await req.user.save();

      res.json(req.user);
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Update user password
router.patch('/password', auth,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters long')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { currentPassword, newPassword } = req.body;

      // Check current password
      const isMatch = await req.user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(400).json({ message: 'Current password is incorrect' });
      }

      // Update password
      req.user.password = newPassword;
      await req.user.save();

      res.json({ message: 'Password updated successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Get user's rides
router.get('/rides', auth, async (req, res) => {
  try {
    const rides = await Ride.find({
      $or: [
        { driver: req.user._id },
        { 'passengers.user': req.user._id }
      ]
    })
    .populate('driver', 'name email phone rating')
    .populate('passengers.user', 'name email phone')
    .sort({ departureTime: -1 });

    res.json(rides);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 