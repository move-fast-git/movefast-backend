const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Ride = sequelize.define('Ride', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  startLocation: {
    type: DataTypes.JSONB,
    allowNull: false,
    validate: {
      isValidLocation(value) {
        if (!value.address || !value.coordinates || !value.coordinates.lat || !value.coordinates.lng) {
          throw new Error('Invalid location format');
        }
      }
    }
  },
  endLocation: {
    type: DataTypes.JSONB,
    allowNull: false,
    validate: {
      isValidLocation(value) {
        if (!value.address || !value.coordinates || !value.coordinates.lat || !value.coordinates.lng) {
          throw new Error('Invalid location format');
        }
      }
    }
  },
  departureTime: {
    type: DataTypes.DATE,
    allowNull: false,
    validate: {
      isFutureDate(value) {
        if (new Date(value) <= new Date()) {
          throw new Error('Departure time must be in the future');
        }
      }
    }
  },
  arrivalTime: {
    type: DataTypes.DATE,
    allowNull: false,
    validate: {
      isAfterDeparture(value) {
        if (new Date(value) <= new Date(this.departureTime)) {
          throw new Error('Arrival time must be after departure time');
        }
      }
    }
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0
    }
  },
  availableSeats: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 0
    }
  },
  status: {
    type: DataTypes.ENUM('scheduled', 'in_progress', 'completed', 'cancelled'),
    defaultValue: 'scheduled'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  vehicleType: {
    type: DataTypes.ENUM('car', 'bike'),
    allowNull: false
  },
  vehicleModel: {
    type: DataTypes.STRING,
    allowNull: false
  },
  vehicleColor: {
    type: DataTypes.STRING,
    allowNull: false
  },
  licensePlate: {
    type: DataTypes.STRING,
    allowNull: false
  },
  vehicleCapacity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1
    }
  },
  driverId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  }
});

const Passenger = sequelize.define('Passenger', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  UserId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  RideId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Rides',
      key: 'id'
    }
  },
  pickupLocation: {
    type: DataTypes.JSONB,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'accepted', 'rejected', 'completed', 'cancelled'),
    defaultValue: 'pending'
  }
});

module.exports = { Ride, Passenger };