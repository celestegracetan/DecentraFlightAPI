const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs-extra');
const FlightAPI = require('./flight_api');
const routes = require('./routes');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Check for API key
const FLIGHTLAB_API_TOKEN = process.env.FLIGHTLAB_API_TOKEN;
if (!FLIGHTLAB_API_TOKEN) {
  console.error('❌ FLIGHTLAB_API_TOKEN is missing in .env');
  process.exit(1);
}

console.log('✅ FLIGHTLAB_API_TOKEN loaded successfully!');

// Initialize Flight API
const flightApi = new FlightAPI(FLIGHTLAB_API_TOKEN);


// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use(routes(flightApi));


app.get('/test.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'test.html'));
});

// Start server
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  // Create data directory if it doesn't exist
  const dataDir = path.join(__dirname, 'data');
  fs.ensureDirSync(dataDir);
  
  // Initial data fetch in background
  try {
    console.log('Starting initial data fetch...');
    
    // Fetch airlines first
    await flightApi.getAirlines();
    
    // Fetch flight schedules
    await flightApi.fetchFlightSchedules();
    
    // Fetch some sample flight delays for testing
    const sampleFlights = [
      { airline: 'AA', number: '100', date: new Date().toISOString().split('T')[0] },
      { airline: 'UA', number: '200', date: new Date().toISOString().split('T')[0] },
      { airline: 'DL', number: '300', date: new Date().toISOString().split('T')[0] },
      // Add test flight AV43 for your insurance demo
      { airline: 'AV', number: '43', date: new Date().toISOString().split('T')[0] }
    ];
    
    for (const flight of sampleFlights) {
      await flightApi.checkFlightDelay(flight.airline, flight.number, flight.date);
    }
    
    console.log('✅ Initial data fetch completed successfully!');
  } catch (error) {
    console.error(`❌ Error during initial data fetch: ${error.message}`);
  }
});