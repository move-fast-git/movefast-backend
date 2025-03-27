const express = require('express');
const router = express.Router();
const { body, validationResult, query } = require('express-validator');
const auth = require('../middleware/auth.middleware');
const { Ride, User, Passenger } = require('../models');
const { Op } = require('sequelize');
const sequelize = require('../config/database');

// Create a new ride
router.post('/',
  auth,
  [
    body('startLocation').notEmpty().withMessage('Start location is required'),
    body('endLocation').notEmpty().withMessage('End location is required'),
    body('departureTime').isISO8601().withMessage('Valid departure time is required'),
    body('arrivalTime').isISO8601().withMessage('Valid arrival time is required'),
    body('price').isNumeric().withMessage('Price must be a number'),
    body('availableSeats').isInt({ min: 1 }).withMessage('Available seats must be at least 1'),
    // Vehicle details validation
    body('vehicleType').isIn(['car', 'bike']).withMessage('Vehicle type must be either car or bike'),
    body('vehicleModel').notEmpty().withMessage('Vehicle model is required'),
    body('vehicleColor').notEmpty().withMessage('Vehicle color is required'),
    body('licensePlate').notEmpty().withMessage('License plate is required'),
    body('vehicleCapacity').isInt({ min: 1 }).withMessage('Vehicle capacity must be at least 1')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Check if user is a driver
      const user = await User.findByPk(req.user.id);
      if (!user.isDriver) {
        return res.status(403).json({ message: 'Only drivers can create rides' });
      }

      // Validate dates
      const departureTime = new Date(req.body.departureTime);
      const arrivalTime = new Date(req.body.arrivalTime);
      const now = new Date();

      if (departureTime <= now) {
        return res.status(400).json({ message: 'Departure time must be in the future' });
      }

      if (arrivalTime <= departureTime) {
        return res.status(400).json({ message: 'Arrival time must be after departure time' });
      }

      // Validate vehicle capacity based on vehicle type
      const { vehicleType, vehicleCapacity, availableSeats } = req.body;
      const maxCapacity = vehicleType === 'bike' ? 2 : 4; // Bikes max 2, cars max 4

      if (vehicleCapacity > maxCapacity) {
        return res.status(400).json({ 
          message: `Vehicle capacity cannot exceed ${maxCapacity} for ${vehicleType}s` 
        });
      }

      if (availableSeats > vehicleCapacity) {
        return res.status(400).json({ 
          message: 'Available seats cannot exceed vehicle capacity' 
        });
      }

      const ride = await Ride.create({
        ...req.body,
        driverId: req.user.id
      });

      res.status(201).json(ride);
    } catch (error) {
      console.error('Error creating ride:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// Get all rides with date and time filters
router.get('/',
  [
    query('date').optional().isISO8601().withMessage('Invalid date format'),
    query('startTime').optional().isISO8601().withMessage('Invalid start time format'),
    query('endTime').optional().isISO8601().withMessage('Invalid end time format')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { date, startTime, endTime } = req.query;
      const where = { status: 'scheduled' };

      if (date) {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        where.departureTime = {
          [Op.between]: [startOfDay, endOfDay]
        };

        if (startTime && endTime) {
          const startDateTime = new Date(`${date}T${startTime}`);
          const endDateTime = new Date(`${date}T${endTime}`);
          where.departureTime = {
            [Op.between]: [startDateTime, endDateTime]
          };
        }
      }

      const rides = await Ride.findAll({
        where,
        include: [{
          model: User,
          as: 'driver',
          attributes: ['name', 'email', 'phone', 'rating']
        }],
        order: [['departureTime', 'ASC']]
      });

      res.json(rides);
    } catch (error) {
      console.error('Error fetching rides:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// Get ride by ID
router.get('/:id', async (req, res) => {
  try {
    const ride = await Ride.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'driver',
          attributes: ['name', 'email', 'phone', 'rating']
        },
        {
          model: Passenger,
          include: [{
            model: User,
            attributes: ['name', 'email', 'phone']
          }]
        }
      ]
    });
    
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }
    res.json(ride);
  } catch (error) {
    console.error('Error fetching ride:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Request to join a ride
router.post('/:id/join', 
  auth,
  [
    body('pickupLocation')
      .isObject()
      .withMessage('Pickup location must be an object')
      .custom((value) => {
        // Check if the value has either the coordinates format or direct lat/lng format
        const hasCoordinatesFormat = value.coordinates && 
          value.coordinates.lat && 
          value.coordinates.lng && 
          value.address;
        
        const hasDirectFormat = value.latitude && 
          value.longitude && 
          value.address;
        
        if (!hasCoordinatesFormat && !hasDirectFormat) {
          throw new Error('Pickup location must include either coordinates (lat, lng) or latitude/longitude, and address');
        }
        return true;
      })
  ],
  async (req, res) => {
    let transaction;
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Format pickup location to match model requirements
      const pickupLocation = {
        coordinates: {
          lat: req.body.pickupLocation.latitude || req.body.pickupLocation.coordinates?.lat,
          lng: req.body.pickupLocation.longitude || req.body.pickupLocation.coordinates?.lng
        },
        address: req.body.pickupLocation.address
      };

      // Validate the formatted pickup location
      if (!pickupLocation.coordinates.lat || !pickupLocation.coordinates.lng || !pickupLocation.address) {
        return res.status(400).json({ 
          message: 'Invalid pickup location format. Must include coordinates and address.' 
        });
      }

      // Start transaction
      transaction = await sequelize.transaction();

      // Find ride with lock for update
      const ride = await Ride.findByPk(req.params.id, { 
        lock: true,
        transaction
      });
      
      if (!ride) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Ride not found' });
      }

      // Prevent driver from joining their own ride
      if (ride.driverId === req.user.id) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Drivers cannot join their own rides' });
      }

      if (ride.status !== 'scheduled') {
        await transaction.rollback();
        return res.status(400).json({ message: 'This ride is no longer available' });
      }

      // Check available seats before any updates
      if (ride.availableSeats < 1) {
        await transaction.rollback();
        return res.status(400).json({ message: 'No seats available' });
      }

      // Check if user is already a passenger
      const existingPassenger = await Passenger.findOne({
        where: {
          RideId: ride.id,
          UserId: req.user.id
        },
        transaction
      });

      if (existingPassenger) {
        await transaction.rollback();
        return res.status(400).json({ message: 'You are already a passenger' });
      }

      // Create passenger first
      const passenger = await Passenger.create({
        RideId: ride.id,
        UserId: req.user.id,
        pickupLocation,
        status: 'pending'
      }, { transaction });

      // Then update available seats
      await ride.update({
        availableSeats: ride.availableSeats - 1
      }, { 
        transaction,
        validate: false
      });

      // Commit the transaction
      await transaction.commit();

      // Fetch the updated ride with all related data
      const updatedRide = await Ride.findByPk(ride.id, {
        include: [
          {
            model: User,
            as: 'driver',
            attributes: ['name', 'email', 'phone', 'rating']
          },
          {
            model: Passenger,
            as: 'passengers',
            include: [{
              model: User,
              attributes: ['name', 'email', 'phone']
            }]
          }
        ]
      });

      res.json({
        message: 'Successfully joined the ride',
        ride: updatedRide,
        passenger
      });

    } catch (error) {
      // Rollback transaction on error
      if (transaction) {
        try {
          await transaction.rollback();
        } catch (rollbackError) {
          console.error('Error rolling back transaction:', rollbackError);
        }
      }
      
      console.error('Error joining ride:', error);
      
      // Handle specific error messages
      if (error.message === 'Ride not found') {
        return res.status(404).json({ message: error.message });
      }
      
      if (['Drivers cannot join their own rides', 
           'This ride is no longer available',
           'No seats available',
           'You are already a passenger'].includes(error.message)) {
        return res.status(400).json({ message: error.message });
      }
      
      // Handle specific Sequelize errors
      if (error.name === 'SequelizeConnectionError') {
        return res.status(503).json({
          message: 'Database connection error',
          error: 'Please try again later'
        });
      }
      
      if (error.name === 'SequelizeValidationError') {
        return res.status(400).json({
          message: 'Validation error',
          error: error.message
        });
      }
      
      if (error.name === 'SequelizeTimeoutError') {
        return res.status(408).json({
          message: 'Request timeout',
          error: 'Please try again'
        });
      }

      res.status(500).json({ 
        message: 'Server error', 
        error: error.message 
      });
    }
  });

// Update ride status
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const ride = await Ride.findByPk(req.params.id);
    
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    // Only driver can update status
    if (ride.driverId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const oldStatus = ride.status;
    await ride.update({
      status: req.body.status
    });

    // If ride is completed, update completion counts
    if (req.body.status === 'completed' && oldStatus !== 'completed') {
      // Update driver's completed rides count
      await User.increment('completedRidesAsDriver', {
        where: { id: ride.driverId }
      });

      // Update all passengers' completed rides count
      const passengers = await Passenger.findAll({
        where: { rideId: ride.id }
      });

      for (const passenger of passengers) {
        await User.increment('completedRidesAsPassenger', {
          where: { id: passenger.userId }
        });
      }
    }

    res.json(ride);
  } catch (error) {
    console.error('Error updating ride status:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router; 