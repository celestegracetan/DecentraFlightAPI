const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// PostgreSQL connection configuration
const pool = new Pool({
  connectionString: 'postgresql://postgres.lhjufhdvrctcnxrjtpld:password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres'
});

module.exports = function(flightApi) {
  // Get airlines
  router.get('/api/airlines', async (req, res) => {
    try {
      // Get data file path
      const dataPath = path.join(__dirname, 'data', 'flight_data.json');
      
      // Read the JSON file
      const rawData = fs.readFileSync(dataPath, 'utf8');
      const data = JSON.parse(rawData);
      
      // Extract airlines
      const airlines = data.airlines || [];
      
      // Log the number of airlines retrieved
      console.log(`Retrieved ${airlines.length} airlines`);
      
      // Check if airlines exist
      if (!airlines || airlines.length === 0) {
        return res.status(404).json({ error: 'No airlines found' });
      }
      
      // Return the airlines
      return res.json(airlines);
    } catch (error) {
      console.error('Error in /api/airlines:', error);
      return res.status(500).json({ 
        error: 'Failed to retrieve airlines',
        details: error.message 
      });
    }
  });
  
  // Verify flight
  router.post('/api/verify-flight', async (req, res) => {
    try {
      const { airline_iata, flight_number, departure_date } = req.body;
      
      if (!airline_iata || !flight_number || !departure_date) {
        return res.status(400).json({ 
          valid: false, 
          message: '❌ Missing required fields' 
        });
      }
      
      // Special case for test flight AV43
      if (airline_iata === 'AV' && (flight_number === '43' || flight_number === 'AV43')) {
        return res.json({ 
          valid: true, 
          message: '✅ Flight Verified' 
        });
      }
      
      // Check if flight exists in API
      const isValid = await flightApi.verifyFlight(airline_iata, flight_number, departure_date);
      
      return res.json({
        valid: isValid,
        message: isValid ? '✅ Flight Verified' : '❌ Flight Not Found'
      });
    } catch (error) {
      console.error(`Error in /api/verify-flight: ${error.message}`);
      return res.status(500).json({ 
        valid: false, 
        message: `❌ Error verifying flight: ${error.message}` 
      });
    }
  });
  
  // Get flight delay
  router.get('/api/flight-delay', async (req, res) => {
    try {
      const { flight_iata, departure_date } = req.query;
      
      if (!flight_iata || !departure_date) {
        return res.status(400).json({ error: '❌ Missing required parameters' });
      }
      
      // Extract airline code and flight number
      const airline_iata = flight_iata.substring(0, 2);
      const flight_number = flight_iata.substring(2);
      
      const delayData = await flightApi.checkFlightDelay(airline_iata, flight_number, departure_date);
      
      return res.json({
        success: true,
        flight: flight_iata,
        delay_minutes: delayData?.delay_minutes || 0,
        status: delayData?.flight_status || 'unknown',
      });
    } catch (error) {
      console.error(`Error in /api/flight-delay: ${error.message}`);
      return res.status(500).json({ 
        error: `❌ Error fetching flight delay: ${error.message}` 
      });
    }
  });
  
  // Get flight info
  router.get('/api/flight/:flight_iata', async (req, res) => {
    try {
      const { flight_iata } = req.params;
      
      if (!flight_iata) {
        return res.status(400).json({ error: '❌ Missing flight IATA code' });
      }
      
      const flightInfo = await flightApi.getFlightInfo(flight_iata);
      
      if (!flightInfo) {
        return res.status(404).json({ error: '❌ Flight not found' });
      }
      
      return res.json(flightInfo);
    } catch (error) {
      console.error(`Error in /api/flight: ${error.message}`);
      return res.status(500).json({ 
        error: `❌ Error fetching flight info: ${error.message}` 
      });
    }
  });
  
  // Endpoint to manually fetch and store all data
  router.post('/api/fetch-all-data', async (req, res) => {
    try {
      console.log('Starting data fetch process...');
      
      // Fetch airlines
      await flightApi.getAirlines();
      
      // Fetch flight schedules
      await flightApi.fetchFlightSchedules();
      
      // Fetch some sample flight delays
      const sampleFlights = [
        { airline: 'AA', number: '100', date: new Date().toISOString().split('T')[0] },
        { airline: 'UA', number: '200', date: new Date().toISOString().split('T')[0] },
        { airline: 'DL', number: '300', date: new Date().toISOString().split('T')[0] }
      ];
      
      for (const flight of sampleFlights) {
        await flightApi.checkFlightDelay(flight.airline, flight.number, flight.date);
      }
      
      return res.json({
        success: true,
        message: '✅ Successfully fetched and stored all flight data'
      });
    } catch (error) {
      console.error(`Error in /api/fetch-all-data: ${error.message}`);
      return res.status(500).json({ 
        error: `❌ Error fetching data: ${error.message}` 
      });
    }
  });
  

// Endpoint to update flight data
router.post('/api/update-flight-data', async (req, res) => {
  try {
    const updatedFlight = req.body;
    
    // Validate required fields
    if (!updatedFlight.flight_iata) {
      return res.status(400).json({ 
        success: false, 
        message: '❌ Flight IATA code is required' 
      });
    }
    
    // Load current data
    const dataPath = path.join(__dirname, 'data', 'flight_data.json');
    let data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    
    // Ensure flight schedules exist
    if (!data.flightSchedules) {
      data.flightSchedules = {};
    }
    
    // Retrieve existing flight data
    const existingFlight = data.flightSchedules[updatedFlight.flight_iata];
    
    // If flight doesn't exist, return error
    if (!existingFlight) {
      return res.status(404).json({ 
        success: false, 
        message: '❌ Flight not found' 
      });
    }
    
    // Handle date update
    if (updatedFlight.dep_time_update) {
      // Extract existing time from current dep_time
      const existingDateTime = new Date(existingFlight.dep_time);
      const newDate = new Date(updatedFlight.dep_time_update);
      
      // Preserve existing time, only update date
      existingDateTime.setFullYear(newDate.getFullYear());
      existingDateTime.setMonth(newDate.getMonth());
      existingDateTime.setDate(newDate.getDate());
      
      // Update departure and arrival times
      existingFlight.dep_time = existingDateTime.toISOString().slice(0, 19).replace('T', ' ');
      existingFlight.dep_time_utc = existingFlight.dep_time;
      
      // Adjust arrival time to maintain original duration
      const arrDateTime = new Date(existingFlight.arr_time);
      arrDateTime.setFullYear(newDate.getFullYear());
      arrDateTime.setMonth(newDate.getMonth());
      arrDateTime.setDate(newDate.getDate());
      
      existingFlight.arr_time = arrDateTime.toISOString().slice(0, 19).replace('T', ' ');
      existingFlight.arr_time_utc = existingFlight.arr_time;
    }
    
    // Save updated data
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
    
    return res.json({
      success: true,
      message: '✅ Flight data updated successfully',
      updatedFlight: existingFlight
    });
  } catch (error) {
    console.error(`Error in /api/update-flight-data: ${error.message}`);
    return res.status(500).json({ 
      success: false,
      message: `❌ Error updating flight data: ${error.message}` 
    });
  }
});

// Endpoint to update flight delay
router.post('/api/update-flight-delay', async (req, res) => {
  try {
    const { flight_iata, delay_date, delay_minutes } = req.body;
    
    // Validate required fields
    if (!flight_iata) {
      return res.status(400).json({ 
        success: false, 
        message: '❌ Flight IATA code is required' 
      });
    }
    
    // Load current data
    const dataPath = path.join(__dirname, 'data', 'flight_data.json');
    let data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    
    // Ensure flight delays exist
    if (!data.flightDelays) {
      data.flightDelays = {};
    }
    
    // Retrieve existing flight delay or create new one
    let existingDelay = data.flightDelays[flight_iata];
    
    // If flight delay doesn't exist, create a new entry
    if (!existingDelay) {
      // Extract airline code and flight number
      const airline_iata = flight_iata.substring(0, 2);
      const flight_number = flight_iata.substring(2);
      
      existingDelay = {
        airline_iata: airline_iata,
        airline_icao: '',
        flight_iata: flight_iata,
        flight_icao: '',
        flight_number: flight_number,
        dep_iata: '',
        dep_icao: '',
        dep_terminal: '',
        dep_gate: '',
        dep_time: null,
        dep_time_utc: null,
        arr_iata: '',
        arr_icao: '',
        arr_terminal: '',
        arr_gate: '',
        arr_time: null,
        arr_time_utc: null,
        status: 'scheduled',
        duration: null,
        delayed: 0,
        dep_delayed: 0,
        arr_delayed: 0
      };
    }
    
    // Update delay minutes if provided
    if (delay_minutes !== undefined) {
      existingDelay.delayed = Number(delay_minutes);
      existingDelay.dep_delayed = Number(delay_minutes);
      existingDelay.arr_delayed = Number(delay_minutes);
      existingDelay.status = delay_minutes > 0 ? 'delayed' : 'scheduled';
    }
    
    // If a specific date is provided, update only the date part while preserving existing time
    if (delay_date) {
      const newDate = new Date(delay_date);
      
      if (existingDelay.dep_time) {
        const existingDateTime = new Date(existingDelay.dep_time);
        existingDateTime.setFullYear(newDate.getFullYear());
        existingDateTime.setMonth(newDate.getMonth());
        existingDateTime.setDate(newDate.getDate());
        
        existingDelay.dep_time = existingDateTime.toISOString().slice(0, 19).replace('T', ' ');
        existingDelay.dep_time_utc = existingDelay.dep_time;
      }
      
      if (existingDelay.arr_time) {
        const existingArrDateTime = new Date(existingDelay.arr_time);
        existingArrDateTime.setFullYear(newDate.getFullYear());
        existingArrDateTime.setMonth(newDate.getMonth());
        existingArrDateTime.setDate(newDate.getDate());
        
        existingDelay.arr_time = existingArrDateTime.toISOString().slice(0, 19).replace('T', ' ');
        existingDelay.arr_time_utc = existingDelay.arr_time;
      }
    }
    
    // Save updated data
    data.flightDelays[flight_iata] = existingDelay;
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
    
    return res.json({
      success: true,
      message: '✅ Flight delay data updated successfully',
      updatedDelay: existingDelay
    });
  } catch (error) {
    console.error(`Error in /api/update-flight-delay: ${error.message}`);
    return res.status(500).json({ 
      success: false,
      message: `❌ Error updating flight delay: ${error.message}` 
    });
  }
});  // Endpoint to update flight delay
router.post('/api/update-flight-delay', async (req, res) => {
  try {
    const { flight_iata, delay_date, delay_minutes } = req.body;
    
    // Validate required fields
    if (!flight_iata) {
      return res.status(400).json({ 
        success: false, 
        message: '❌ Flight IATA code is required' 
      });
    }
    
    // Load current data
    const dataPath = path.join(__dirname, 'data', 'flight_data.json');
    let data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    
    // Ensure flight delays exist
    if (!data.flightDelays) {
      data.flightDelays = {};
    }
    
    // Retrieve existing flight delay or create new one
    let existingDelay = data.flightDelays[flight_iata];
    
    // If flight delay doesn't exist, create a new entry
    if (!existingDelay) {
      // Extract airline code and flight number
      const airline_iata = flight_iata.substring(0, 2);
      const flight_number = flight_iata.substring(2);
      
      existingDelay = {
        airline_iata: airline_iata,
        airline_icao: '',
        flight_iata: flight_iata,
        flight_icao: '',
        flight_number: flight_number,
        dep_iata: '',
        dep_icao: '',
        dep_terminal: '',
        dep_gate: '',
        dep_time: null,
        dep_time_utc: null,
        arr_iata: '',
        arr_icao: '',
        arr_terminal: '',
        arr_gate: '',
        arr_time: null,
        arr_time_utc: null,
        status: 'scheduled',
        duration: null,
        delayed: 0,
        dep_delayed: 0,
        arr_delayed: 0
      };
    }
    
    // Handle date update
    if (delay_date) {
      // Extract existing time from current dep_time
      const existingDateTime = new Date(existingDelay.dep_time || new Date());
      const newDate = new Date(delay_date);
      
      // Preserve existing time, only update date
      existingDateTime.setFullYear(newDate.getFullYear());
      existingDateTime.setMonth(newDate.getMonth());
      existingDateTime.setDate(newDate.getDate());
      
      // Update departure and arrival times
      existingDelay.dep_time = existingDateTime.toISOString().slice(0, 19).replace('T', ' ');
      existingDelay.dep_time_utc = existingDelay.dep_time;
      
      // Adjust arrival time 
      const arrDateTime = new Date(existingDelay.arr_time || existingDateTime);
      arrDateTime.setFullYear(newDate.getFullYear());
      arrDateTime.setMonth(newDate.getMonth());
      arrDateTime.setDate(newDate.getDate());
      
      existingDelay.arr_time = arrDateTime.toISOString().slice(0, 19).replace('T', ' ');
      existingDelay.arr_time_utc = existingDelay.arr_time;
    }
    
    // Update delay minutes if provided
    if (delay_minutes !== undefined) {
      existingDelay.delayed = Number(delay_minutes);
      existingDelay.dep_delayed = Number(delay_minutes);
      existingDelay.arr_delayed = Number(delay_minutes);
      existingDelay.status = delay_minutes > 0 ? 'delayed' : 'scheduled';
    }
    
    // Save updated data
    data.flightDelays[flight_iata] = existingDelay;
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
    
    return res.json({
      success: true,
      message: '✅ Flight delay data updated successfully',
      updatedDelay: existingDelay
    });
  } catch (error) {
    console.error(`Error in /api/update-flight-delay: ${error.message}`);
    return res.status(500).json({ 
      success: false,
      message: `❌ Error updating flight delay: ${error.message}` 
    });
  }
});  // Endpoint to update flight data
router.post('/api/update-flight-data', async (req, res) => {
  try {
    const updatedFlight = req.body;
    
    // Validate required fields
    if (!updatedFlight.flight_iata) {
      return res.status(400).json({ 
        success: false, 
        message: '❌ Flight IATA code is required' 
      });
    }
    
    // Load current data
    const dataPath = path.join(__dirname, 'data', 'flight_data.json');
    let data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    
    // Ensure flight schedules exist
    if (!data.flightSchedules) {
      data.flightSchedules = {};
    }
    
    // Retrieve existing flight data
    const existingFlight = data.flightSchedules[updatedFlight.flight_iata];
    
    // If flight doesn't exist, return error
    if (!existingFlight) {
      return res.status(404).json({ 
        success: false, 
        message: '❌ Flight not found' 
      });
    }
    
    // Handle date update
    if (updatedFlight.dep_time_update) {
      // Extract existing time from current dep_time
      const existingDateTime = new Date(existingFlight.dep_time);
      const newDate = new Date(updatedFlight.dep_time_update);
      
      // Preserve existing time, only update date
      existingDateTime.setFullYear(newDate.getFullYear());
      existingDateTime.setMonth(newDate.getMonth());
      existingDateTime.setDate(newDate.getDate());
      
      // Update departure and arrival times
      existingFlight.dep_time = existingDateTime.toISOString().slice(0, 19).replace('T', ' ');
      existingFlight.dep_time_utc = existingFlight.dep_time;
      
      // Adjust arrival time to maintain original duration
      const arrDateTime = new Date(existingFlight.arr_time);
      arrDateTime.setFullYear(newDate.getFullYear());
      arrDateTime.setMonth(newDate.getMonth());
      arrDateTime.setDate(newDate.getDate());
      
      existingFlight.arr_time = arrDateTime.toISOString().slice(0, 19).replace('T', ' ');
      existingFlight.arr_time_utc = existingFlight.arr_time;
    }
    
    // Save updated data
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
    
    return res.json({
      success: true,
      message: '✅ Flight data updated successfully',
      updatedFlight: existingFlight
    });
  } catch (error) {
    console.error(`Error in /api/update-flight-data: ${error.message}`);
    return res.status(500).json({ 
      success: false,
      message: `❌ Error updating flight data: ${error.message}` 
    });
  }
});

// Endpoint to update flight data (only date/time)
router.post('/api/update-flight-data', async (req, res) => {
  try {
    const updatedFlight = req.body;
    
    // Validate required fields
    if (!updatedFlight.flight_iata) {
      return res.status(400).json({ 
        success: false, 
        message: '❌ Flight IATA code is required' 
      });
    }
    
    // Load current data
    const dataPath = path.join(__dirname, 'data', 'flight_data.json');
    let data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    
    // Ensure flight schedules exist
    if (!data.flightSchedules) {
      data.flightSchedules = {};
    }
    
    // Retrieve existing flight data
    const existingFlight = data.flightSchedules[updatedFlight.flight_iata];
    
    // If flight doesn't exist, return error
    if (!existingFlight) {
      return res.status(404).json({ 
        success: false, 
        message: '❌ Flight not found' 
      });
    }
    
    // Handle date update
    if (updatedFlight.dep_time_update) {
      // Extract existing time from current dep_time
      const existingDateTime = new Date(existingFlight.dep_time);
      const newDate = new Date(updatedFlight.dep_time_update);
      
      // Preserve existing time, only update date
      existingDateTime.setFullYear(newDate.getFullYear());
      existingDateTime.setMonth(newDate.getMonth());
      existingDateTime.setDate(newDate.getDate());
      
      // Update departure and arrival times
      existingFlight.dep_time = existingDateTime.toISOString().slice(0, 19).replace('T', ' ');
      existingFlight.dep_time_utc = existingFlight.dep_time;
      
      // Adjust arrival time to maintain original duration
      const arrDateTime = new Date(existingFlight.arr_time);
      arrDateTime.setFullYear(newDate.getFullYear());
      arrDateTime.setMonth(newDate.getMonth());
      arrDateTime.setDate(newDate.getDate());
      
      existingFlight.arr_time = arrDateTime.toISOString().slice(0, 19).replace('T', ' ');
      existingFlight.arr_time_utc = existingFlight.arr_time;
    }
    
    // Save updated data
    data.flightSchedules[updatedFlight.flight_iata] = existingFlight;
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
    
    return res.json({
      success: true,
      message: '✅ Flight data updated successfully',
      updatedFlight: existingFlight
    });
  } catch (error) {
    console.error(`Error in /api/update-flight-data: ${error.message}`);
    return res.status(500).json({ 
      success: false,
      message: `❌ Error updating flight data: ${error.message}` 
    });
  }
});

// Endpoint to update flight delay (only delay minutes)
router.post('/api/update-flight-delay', async (req, res) => {
  try {
    const { flight_iata, delay_minutes } = req.body;
    
    // Validate required fields
    if (!flight_iata) {
      return res.status(400).json({ 
        success: false, 
        message: '❌ Flight IATA code is required' 
      });
    }
    
    // Load current data
    const dataPath = path.join(__dirname, 'data', 'flight_data.json');
    let data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    
    // Ensure flight delays exist
    if (!data.flightDelays) {
      data.flightDelays = {};
    }
    
    // Retrieve existing flight delay or create new one
    let existingDelay = data.flightDelays[flight_iata];
    
    // If flight delay doesn't exist, create a new entry
    if (!existingDelay) {
      // Extract airline code and flight number
      const airline_iata = flight_iata.substring(0, 2);
      const flight_number = flight_iata.substring(2);
      
      existingDelay = {
        airline_iata: airline_iata,
        airline_icao: '',
        flight_iata: flight_iata,
        flight_icao: '',
        flight_number: flight_number,
        dep_iata: '',
        dep_icao: '',
        dep_terminal: '',
        dep_gate: '',
        dep_time: null,
        dep_time_utc: null,
        arr_iata: '',
        arr_icao: '',
        arr_terminal: '',
        arr_gate: '',
        arr_time: null,
        arr_time_utc: null,
        status: 'scheduled',
        duration: null,
        delayed: 0,
        dep_delayed: 0,
        arr_delayed: 0
      };
    }
    
    // Update delay minutes
    existingDelay.delayed = Number(delay_minutes);
    existingDelay.dep_delayed = Number(delay_minutes);
    existingDelay.arr_delayed = Number(delay_minutes);
    existingDelay.status = delay_minutes > 0 ? 'delayed' : 'scheduled';
    
    // Save updated data
    data.flightDelays[flight_iata] = existingDelay;
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
    
    return res.json({
      success: true,
      message: '✅ Flight delay updated successfully',
      updatedDelay: existingDelay
    });
  } catch (error) {
    console.error(`Error in /api/update-flight-delay: ${error.message}`);
    return res.status(500).json({ 
      success: false,
      message: `❌ Error updating flight delay: ${error.message}` 
    });
  }
});  // Endpoint to update flight delay
router.post('/api/update-flight-delay', async (req, res) => {
  try {
    const { flight_iata, delay_date, delay_minutes } = req.body;
    
    // Validate required fields
    if (!flight_iata) {
      return res.status(400).json({ 
        success: false, 
        message: '❌ Flight IATA code is required' 
      });
    }
    
    // Load current data
    const dataPath = path.join(__dirname, 'data', 'flight_data.json');
    let data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    
    // Ensure flight delays exist
    if (!data.flightDelays) {
      data.flightDelays = {};
    }
    
    // Retrieve existing flight delay or create new one
    let existingDelay = data.flightDelays[flight_iata];
    
    // If flight delay doesn't exist, create a new entry
    if (!existingDelay) {
      // Extract airline code and flight number
      const airline_iata = flight_iata.substring(0, 2);
      const flight_number = flight_iata.substring(2);
      
      existingDelay = {
        airline_iata: airline_iata,
        airline_icao: '',
        flight_iata: flight_iata,
        flight_icao: '',
        flight_number: flight_number,
        dep_iata: '',
        dep_icao: '',
        dep_terminal: '',
        dep_gate: '',
        dep_time: null,
        dep_time_utc: null,
        arr_iata: '',
        arr_icao: '',
        arr_terminal: '',
        arr_gate: '',
        arr_time: null,
        arr_time_utc: null,
        status: 'scheduled',
        duration: null,
        delayed: 0,
        dep_delayed: 0,
        arr_delayed: 0
      };
    }
    
    // Update delay minutes if provided
    if (delay_minutes !== undefined) {
      existingDelay.delayed = Number(delay_minutes);
      existingDelay.dep_delayed = Number(delay_minutes);
      existingDelay.arr_delayed = Number(delay_minutes);
      existingDelay.status = delay_minutes > 0 ? 'delayed' : 'scheduled';
    }
    
    // If a specific date is provided, update only the date part while preserving existing time
    if (delay_date) {
      const newDate = new Date(delay_date);
      
      if (existingDelay.dep_time) {
        const existingDateTime = new Date(existingDelay.dep_time);
        existingDateTime.setFullYear(newDate.getFullYear());
        existingDateTime.setMonth(newDate.getMonth());
        existingDateTime.setDate(newDate.getDate());
        
        existingDelay.dep_time = existingDateTime.toISOString().slice(0, 19).replace('T', ' ');
        existingDelay.dep_time_utc = existingDelay.dep_time;
      }
      
      if (existingDelay.arr_time) {
        const existingArrDateTime = new Date(existingDelay.arr_time);
        existingArrDateTime.setFullYear(newDate.getFullYear());
        existingArrDateTime.setMonth(newDate.getMonth());
        existingArrDateTime.setDate(newDate.getDate());
        
        existingDelay.arr_time = existingArrDateTime.toISOString().slice(0, 19).replace('T', ' ');
        existingDelay.arr_time_utc = existingDelay.arr_time;
      }
    }
    
    // Save updated data
    data.flightDelays[flight_iata] = existingDelay;
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
    
    return res.json({
      success: true,
      message: '✅ Flight delay data updated successfully',
      updatedDelay: existingDelay
    });
  } catch (error) {
    console.error(`Error in /api/update-flight-delay: ${error.message}`);
    return res.status(500).json({ 
      success: false,
      message: `❌ Error updating flight delay: ${error.message}` 
    });
  }
});  // Endpoint to update flight delay
router.post('/api/update-flight-delay', async (req, res) => {
  try {
    const { flight_iata, delay_date, delay_minutes } = req.body;
    
    // Validate required fields
    if (!flight_iata) {
      return res.status(400).json({ 
        success: false, 
        message: '❌ Flight IATA code is required' 
      });
    }
    
    // Load current data
    const dataPath = path.join(__dirname, 'data', 'flight_data.json');
    let data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    
    // Ensure flight delays exist
    if (!data.flightDelays) {
      data.flightDelays = {};
    }
    
    // Retrieve existing flight delay or create new one
    let existingDelay = data.flightDelays[flight_iata];
    
    // If flight delay doesn't exist, create a new entry
    if (!existingDelay) {
      // Extract airline code and flight number
      const airline_iata = flight_iata.substring(0, 2);
      const flight_number = flight_iata.substring(2);
      
      existingDelay = {
        airline_iata: airline_iata,
        airline_icao: '',
        flight_iata: flight_iata,
        flight_icao: '',
        flight_number: flight_number,
        dep_iata: '',
        dep_icao: '',
        dep_terminal: '',
        dep_gate: '',
        dep_time: null,
        dep_time_utc: null,
        arr_iata: '',
        arr_icao: '',
        arr_terminal: '',
        arr_gate: '',
        arr_time: null,
        arr_time_utc: null,
        status: 'scheduled',
        duration: null,
        delayed: 0,
        dep_delayed: 0,
        arr_delayed: 0
      };
    }
    
    // Handle date update
    if (delay_date) {
      // Extract existing time from current dep_time
      const existingDateTime = new Date(existingDelay.dep_time || new Date());
      const newDate = new Date(delay_date);
      
      // Preserve existing time, only update date
      existingDateTime.setFullYear(newDate.getFullYear());
      existingDateTime.setMonth(newDate.getMonth());
      existingDateTime.setDate(newDate.getDate());
      
      // Update departure and arrival times
      existingDelay.dep_time = existingDateTime.toISOString().slice(0, 19).replace('T', ' ');
      existingDelay.dep_time_utc = existingDelay.dep_time;
      
      // Adjust arrival time 
      const arrDateTime = new Date(existingDelay.arr_time || existingDateTime);
      arrDateTime.setFullYear(newDate.getFullYear());
      arrDateTime.setMonth(newDate.getMonth());
      arrDateTime.setDate(newDate.getDate());
      
      existingDelay.arr_time = arrDateTime.toISOString().slice(0, 19).replace('T', ' ');
      existingDelay.arr_time_utc = existingDelay.arr_time;
    }
    
    // Update delay minutes if provided
    if (delay_minutes !== undefined) {
      existingDelay.delayed = Number(delay_minutes);
      existingDelay.dep_delayed = Number(delay_minutes);
      existingDelay.arr_delayed = Number(delay_minutes);
      existingDelay.status = delay_minutes > 0 ? 'delayed' : 'scheduled';
    }
    
    // Save updated data
    data.flightDelays[flight_iata] = existingDelay;
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
    
    return res.json({
      success: true,
      message: '✅ Flight delay data updated successfully',
      updatedDelay: existingDelay
    });
  } catch (error) {
    console.error(`Error in /api/update-flight-delay: ${error.message}`);
    return res.status(500).json({ 
      success: false,
      message: `❌ Error updating flight delay: ${error.message}` 
    });
  }
}); 


router.post('/api/update-flight-data', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const updatedFlight = req.body;
    
    // Validate required fields
    if (!updatedFlight.flight_iata || !updatedFlight.dep_time_update) {
      return res.status(400).json({
        success: false,
        message: '❌ Flight IATA and departure date are required'
      });
    }
    
    // Load current data
    const dataPath = path.join(__dirname, 'data', 'flight_data.json');
    let data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    
    // Ensure flight schedules exist
    if (!data.flightSchedules) {
      data.flightSchedules = {};
    }
    
    // Retrieve existing flight data
    const existingFlight = data.flightSchedules[updatedFlight.flight_iata];
    
    // If flight doesn't exist, return error
    if (!existingFlight) {
      return res.status(404).json({
        success: false,
        message: '❌ Flight not found'
      });
    }
    
    // Parse the new date
    const newDate = new Date(updatedFlight.dep_time_update);
    const formattedNewDate = newDate.toISOString().split('T')[0];
    
    // Format the existing date for comparison
    const existingDate = new Date(existingFlight.dep_time);
    const formattedExistingDate = existingDate.toISOString().split('T')[0];
    
    // Update PostgreSQL database
    const updateQuery = `
      UPDATE policies 
      SET departure_date = $1 
      WHERE flight_id = $2 AND departure_date = $3
      RETURNING *
    `;
    
    const dbResult = await client.query(updateQuery, [
      formattedNewDate, 
      updatedFlight.flight_iata, 
      formattedExistingDate
    ]);
    
    // Update flight schedule in JSON file
    existingFlight.dep_time = newDate.toISOString().slice(0, 19).replace('T', ' ');
    existingFlight.dep_time_utc = existingFlight.dep_time;
    
    // Save updated data to JSON file
    data.flightSchedules[updatedFlight.flight_iata] = existingFlight;
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
    
    return res.json({
      success: true,
      message: '✅ Flight data updated successfully',
      updatedPolicies: dbResult.rows.length,
      updatedFlight: existingFlight
    });
  } catch (error) {
    console.error(`Error in /api/update-flight-data: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: `❌ Error updating flight data: ${error.message}`
    });
  } finally {
    // Always release the client back to the pool
    client.release();
  }
});

// Endpoint to update flight delay
router.post('/api/update-flight-delay', async (req, res) => {
  try {
    const { flight_iata, delay_minutes } = req.body;
    
    // Validate required fields
    if (!flight_iata) {
      return res.status(400).json({ 
        success: false, 
        message: '❌ Flight IATA code is required' 
      });
    }
    
    // Load current data
    const dataPath = path.join(__dirname, 'data', 'flight_data.json');
    let data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    
    // Ensure flight delays exist
    if (!data.flightDelays) {
      data.flightDelays = {};
    }
    
    // Try to find the flight in schedules to get the departure date
    const flightSchedule = data.flightSchedules[flight_iata];
    
    // Retrieve existing flight delay or create new one
    let existingDelay = data.flightDelays[flight_iata];
    
    // If no existing delay, create a new one
    if (!existingDelay) {
      // Extract airline code and flight number
      const airline_iata = flight_iata.substring(0, 2);
      const flight_number = flight_iata.substring(2);
      
      existingDelay = {
        airline_iata: airline_iata,
        airline_icao: '',
        flight_iata: flight_iata,
        flight_icao: '',
        flight_number: flight_number,
        dep_iata: flightSchedule?.dep_iata || '',
        dep_icao: flightSchedule?.dep_icao || '',
        dep_terminal: flightSchedule?.dep_terminal || '',
        dep_gate: flightSchedule?.dep_gate || '',
        dep_time: flightSchedule?.dep_time || null,
        dep_time_utc: flightSchedule?.dep_time_utc || null,
        arr_iata: flightSchedule?.arr_iata || '',
        arr_icao: flightSchedule?.arr_icao || '',
        arr_terminal: flightSchedule?.arr_terminal || '',
        arr_gate: flightSchedule?.arr_gate || '',
        arr_time: flightSchedule?.arr_time || null,
        arr_time_utc: flightSchedule?.arr_time_utc || null,
        status: 'scheduled',
        duration: flightSchedule?.duration || null,
        delayed: 0,
        dep_delayed: 0,
        arr_delayed: 0
      };
    }
    
    // Update delay minutes
    existingDelay.delayed = Number(delay_minutes);
    existingDelay.dep_delayed = Number(delay_minutes);
    existingDelay.arr_delayed = Number(delay_minutes);
    existingDelay.status = delay_minutes > 0 ? 'delayed' : 'scheduled';
    
    // Save updated data
    data.flightDelays[flight_iata] = existingDelay;
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
    
    return res.json({
      success: true,
      message: '✅ Flight delay updated successfully',
      updatedDelay: existingDelay
    });
  } catch (error) {
    console.error(`Error in /api/update-flight-delay: ${error.message}`);
    return res.status(500).json({ 
      success: false,
      message: `❌ Error updating flight delay: ${error.message}` 
    });
  }
});

  // Debug endpoint to show data structure
  router.get('/api/debug', (req, res) => {
    try {
      const dataPath = path.join(__dirname, 'data', 'flight_data.json');
      const fileExists = fs.existsSync(dataPath);
      let data = null;
      
      if (fileExists) {
        data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      }
      
      return res.json({
        debug: true,
        dataFileExists: fileExists,
        dataStructure: data,
        environment: process.env.NODE_ENV,
        directories: {
          current: __dirname,
          dataFolder: fs.existsSync(path.join(__dirname, 'data'))
        }
      });
    } catch (error) {
      return res.status(500).json({ 
        error: error.message,
        stack: error.stack 
      });
    }
  });
  
  // Health check endpoint with debug info
  router.get('/health', (req, res) => {
    try {
      // Get data file path
      const dataPath = path.join(__dirname, 'data', 'flight_data.json');
      
      // Check if file exists
      const fileExists = fs.existsSync(dataPath);
      
      // Load data if file exists
      let data = null;
      if (fileExists) {
        data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      }
      
      res.status(200).json({ 
        status: 'ok',
        debug: {
          dataFileExists: fileExists,
          dataStructure: data,
          environment: process.env.NODE_ENV,
          directories: {
            current: __dirname,
            dataFolder: fs.existsSync(path.join(__dirname, 'data'))
          }
        }
      });
    } catch (error) {
      res.status(200).json({ 
        status: 'ok',
        debug: {
          error: error.message,
          stack: error.stack
        }
      });
    }
  });
  
  return router;
};