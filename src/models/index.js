const sequelize = require('../config/database');
const User = require('./user.model');
const { Ride, Passenger } = require('./ride.model');
const OTP = require('./otp.model');

// Define associations
// 1. Driver associations
Ride.belongsTo(User, { 
  as: 'driver', 
  foreignKey: 'driverId' 
});

User.hasMany(Ride, { 
  as: 'rides', 
  foreignKey: 'driverId' 
});

// 2. Passenger associations
Passenger.belongsTo(User, {
  foreignKey: 'UserId'
});

Passenger.belongsTo(Ride, {
  foreignKey: 'RideId'
});

Ride.hasMany(Passenger, {
  foreignKey: 'RideId',
  as: 'passengers'
});

User.hasMany(Passenger, {
  foreignKey: 'UserId',
  as: 'rideBookings'
});

module.exports = {
  sequelize,
  User,
  Ride,
  Passenger,
  OTP
}; 