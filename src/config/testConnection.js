const { sequelize } = require('../models');

async function testConnection() {
  try {
    // Test the connection
    await sequelize.authenticate();
    console.log('Successfully connected to the database.');

    // Create tables
    await sequelize.sync({ force: true });
    console.log('All tables have been created successfully.');

    // Close the connection
    await sequelize.close();
    console.log('Database connection closed.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
}

testConnection(); 