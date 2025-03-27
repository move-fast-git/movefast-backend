const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

require('dotenv').config();
const { sequelize } = require('./src/models');
const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.use('/api/auth', require('./src/routes/auth.routes'));
app.use('/api/rides', require('./src/routes/rides.routes'));
app.use('/api/users', require('./src/routes/users.routes'));
app.use('/api/verification', require('./src/routes/verification.routes'));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('Connected to PostgreSQL database');
    
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      console.log('Database synced (development mode)');
    } else {
      await sequelize.sync();
      console.log('Database synced (production mode)');
    }
  } catch (error) {
    console.error('Database connection error:', error);
  }
};

connectDB();

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

module.exports = app;

