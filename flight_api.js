const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

class FlightAPI {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://www.goflightlabs.com';
    this.dataFolder = path.join(__dirname, 'data');
    this.flightDataFile = path.join(this.dataFolder, 'flight_data.json');
    
    // Ensure data folder exists
    fs.ensureDirSync(this.dataFolder);
    
    // Initialize data file if it doesn't exist
    if (!fs.existsSync(this.flightDataFile)) {
      fs.writeJsonSync(this.flightDataFile, {
        airlines: [],
        flights: {},
        flightDelays: {},
        flightSchedules: {}
      });
    }
    
    // Add test flight data for demos
    const data = this._loadData();

    // Add test airlines
    if (!data.airlines || data.airlines.length === 0) {
      data.airlines = [
        { name: "Avianca", iata: "AV", icao: "AVA" },
        { name: "American Airlines", iata: "AA", icao: "AAL" },
        { name: "Delta Air Lines", iata: "DL", icao: "DAL" },
        { name: "United Airlines", iata: "UA", icao: "UAL" },
        { name: "Lufthansa", iata: "LH", icao: "DLH" }
      ];
    }

    // Add test scheduled flights
    if (!data.flightSchedules) {
      data.flightSchedules = {};
    }

    // AV43 flight schedule
    data.flightSchedules["AV43"] = {
      airline_iata: "AV",
      airline_icao: "AVA",
      flight_iata: "AV43",
      flight_icao: "AVA43",
      flight_number: "43",
      dep_iata: "JFK",
      dep_icao: "KJFK",
      dep_terminal: "4",
      dep_gate: "B41",
      dep_time: "2025-03-26 12:55",
      dep_time_utc: "2025-03-26 16:55",
      arr_iata: "BOG",
      arr_icao: "SKBO",
      arr_terminal: "1",
      arr_gate: "B11",
      arr_baggage: null,
      arr_time: "2025-03-26 16:43",
      arr_time_utc: "2025-03-26 20:43",
      status: "scheduled",
      duration: 228,
      delayed: null,
      dep_delayed: null,
      arr_delayed: null
    };

    // Add test flight delays
    if (!data.flightDelays) {
      data.flightDelays = {};
    }

    // AV43 delayed by 150 minutes (2.5 hours) - triggers insurance
    data.flightDelays["AV43"] = {
      airline_iata: "AV",
      airline_icao: "AVA",
      flight_iata: "AV43",
      flight_icao: "AVA43",
      flight_number: "43",
      dep_iata: "JFK",
      dep_icao: "KJFK",
      dep_terminal: "4",
      dep_gate: "B41",
      dep_time: "2025-03-26 12:55",
      dep_time_utc: "2025-03-26 16:55",
      dep_estimated: "2025-03-26 13:25",
      dep_estimated_utc: "2025-03-26 17:25",
      arr_iata: "BOG",
      arr_icao: "SKBO",
      arr_terminal: "1",
      arr_gate: "B11",
      arr_time: "2025-03-26 16:43",
      arr_time_utc: "2025-03-26 20:43",
      arr_estimated: "2025-03-26 19:13",
      arr_estimated_utc: "2025-03-26 23:13",
      status: "delayed",
      duration: 228,
      delayed: 150,
      dep_delayed: 30,
      arr_delayed: 150
    };

    // Save the test data
    this._saveData(data);
    console.log("✅ Test flight data added successfully!");
    
    console.log('✅ FlightAPI initialized!');
  }
  
  // Helper to load data
  _loadData() {
    try {
      return fs.readJsonSync(this.flightDataFile);
    } catch (error) {
      console.error('Error loading data:', error.message);
      return {
        airlines: [],
        flights: {},
        flightDelays: {},
        flightSchedules: {}
      };
    }
  }
  
  // Helper to save data
  _saveData(data) {
    try {
      fs.writeJsonSync(this.flightDataFile, data, { spaces: 2 });
      return true;
    } catch (error) {
      console.error('Error saving data:', error.message);
      return false;
    }
  }
  
  // Get airlines (equivalent to get_airlines in Python)
  async getAirlines() {
    const data = this._loadData();
  
    // Return cached data if available
    if (data.airlines && data.airlines.length > 0) {
      console.log('✅ Loaded airlines from cache');
      return data.airlines;
    }
  
    try {
      console.log('🔄 Fetching airlines from API...');
      const response = await axios.get(`${this.baseUrl}/airlines`, {
        params: {
          access_key: this.apiKey
        }
      });
  
      // Validate API response
      if (!response.data || !response.data.success || !Array.isArray(response.data.data)) {
        console.error('❌ Invalid API response: ', response.data);
        return [];
      }
  
      // Extract valid airline information
      const airlines = response.data.data.map(airline => ({
        name: airline.name || 'Unknown',
        country_code: airline.country_code || 'N/A',
        iata_code: airline.iata_code || 'N/A',
        icao_code: airline.icao_code || 'N/A',
        callsign: airline.callsign || 'N/A',
        website: airline.website || 'N/A',
        is_passenger: airline.is_passenger !== null ? !!airline.is_passenger : 'Unknown',
        is_cargo: airline.is_cargo !== null ? !!airline.is_cargo : 'Unknown'
      }));
  
      // Save airlines to cache
      if (airlines.length > 0) {
        data.airlines = airlines;
        this._saveData(data);
        console.log(`✅ Saved ${airlines.length} airlines to cache`);
      } else {
        console.warn('⚠️ No airlines found in API response');
      }
  
      return airlines;
    } catch (error) {
      console.error('❌ Error fetching airlines:', {
        message: error.message,
        response: error.response?.data || 'No response data',
        status: error.response?.status || 'Unknown'
      });
  
      return [];
    }
  }
  
  

  
  async verifyFlight(airlineIata, flightNumber, departureDate) {
    try {
      // Special case for test flight with specific date check
      if (airlineIata === 'AV' && (flightNumber === '43' || flightNumber === 'AV43')) {
        console.log('✅ Test flight AV43 verification with date check');
        
        // If a specific date is provided for AV43, check against our test date
        if (departureDate && departureDate !== '2025-03-26') {
          console.log(`❌ Flight AV43 exists but not on date ${departureDate}`);
          return false;
        }
        
        return true;
      }
      
      // Handle case where flight number includes airline code
      let flightNumberOnly = flightNumber;
      if (flightNumber.startsWith(airlineIata)) {
        flightNumberOnly = flightNumber.substring(airlineIata.length);
      }
      
      const flightIata = `${airlineIata}${flightNumberOnly}`;
      console.log(`🔄 Verifying flight: ${flightIata} on ${departureDate}`);
      
      // Check in cached data first
      const data = this._loadData();
      
      // Check in flight schedules with date verification
      if (data.flightSchedules && data.flightSchedules[flightIata]) {
        const scheduledFlight = data.flightSchedules[flightIata];
        const flightDate = scheduledFlight.dep_time.split(' ')[0]; // Extract YYYY-MM-DD part
        
        if (flightDate === departureDate) {
          console.log(`✅ Flight ${flightIata} found in schedules cache for date ${departureDate}`);
          return true;
        } else {
          console.log(`❌ Flight ${flightIata} exists but not on date ${departureDate}`);
          return false;
        }
      }
      
      // Check in flight delays with date verification
      if (data.flightDelays && data.flightDelays[flightIata]) {
        const delayedFlight = data.flightDelays[flightIata];
        const flightDate = delayedFlight.dep_time.split(' ')[0]; // Extract YYYY-MM-DD part
        
        if (flightDate === departureDate) {
          console.log(`✅ Flight ${flightIata} found in delays cache for date ${departureDate}`);
          return true;
        } else {
          console.log(`❌ Flight ${flightIata} exists but not on date ${departureDate}`);
          return false;
        }
      }
      
      // Try API
      try {
        console.log('🔄 Querying advanced-flights-schedules endpoint...');
        const airport = 'JFK'; // Default to JFK for testing
        
        const response = await axios.get(`${this.baseUrl}/advanced-flights-schedules`, {
          params: {
            access_key: this.apiKey,
            iataCode: airport,
            flight_date: departureDate,
            type: 'departure'
          },
          timeout: 10000 // 10 seconds timeout
        });
        
        if (response.data && response.data.success && response.data.data) {
          const flights = response.data.data;
          console.log(`📊 Found ${flights.length} flights in schedule`);
          
          // Look for matching flight
          for (const flight of flights) {
            if (flight.flight_iata === flightIata || 
               (flight.airline_iata === airlineIata && flight.flight_number === flightNumberOnly)) {
              
              // Store in cache
              if (!data.flightSchedules) {
                data.flightSchedules = {};
              }
              data.flightSchedules[flightIata] = flight;
              this._saveData(data);
              
              console.log(`✅ Flight ${flightIata} found in API`);
              return true;
            }
          }
        }
      } catch (apiError) {
        console.error(`Error querying API: ${apiError.message}`);
        // Continue to fallback
      }
      
      console.log(`❌ Flight ${flightIata} not found`);
      return false;
    } catch (error) {
      console.error(`❌ Error verifying flight: ${error.message}`);
      return false;
    }
  }

  // Check flight delay (new method for flight delay insurance)
  async checkFlightDelay(airlineIata, flightNumber, departureDate) {
    try {
      // Special case for test flight
      if (airlineIata === 'AV' && (flightNumber === '43' || flightNumber === 'AV43')) {
        console.log('✅ Test flight AV43 delay check (test data)');
        
        // Get from stored data
        const data = this._loadData();
        if (data.flightDelays && data.flightDelays["AV43"]) {
          return {
            delayed: data.flightDelays["AV43"].delayed > 0,
            delay_minutes: data.flightDelays["AV43"].delayed,
            flight_status: data.flightDelays["AV43"].status
          };
        }
        
        // Fallback test data
        return {
          delayed: true,
          delay_minutes: 150, // 2.5 hours - enough to trigger insurance
          flight_status: 'delayed'
        };
      }
      
      // Ensure correct flight IATA format
      const flightIata = `${airlineIata}${flightNumber}`;
      
      // Check in cached data first
      const data = this._loadData();
      if (data.flightDelays && data.flightDelays[flightIata]) {
        console.log(`✅ Flight ${flightIata} delay info found in cache`);
        return {
          delayed: data.flightDelays[flightIata].delayed > 0,
          delay_minutes: data.flightDelays[flightIata].delayed,
          flight_status: data.flightDelays[flightIata].status
        };
      }
      
      // Try to fetch from API
      try {
        console.log(`🔄 Fetching delay info for flight:`, {
          airlineIata,
          flightNumber,
          departureDate,
          baseUrl: this.baseUrl,
          apiKeyPresent: !!this.apiKey
        });
        
        const response = await axios.get(`${this.baseUrl}/flight_delays`, {
          params: {
            access_key: this.apiKey,
            airline_iata: airlineIata,
            flight_number: flightNumber,
            date: departureDate,
            type: 'departures',
            delay: 120  // Minimum 2-hour (120-minute) delay for insurance
          },
          timeout: 10000 // 10-second timeout
        });
        
        // Log full response details
        console.log('Full API Response:', {
          status: response.status,
          data: JSON.stringify(response.data, null, 2)
        });
        
        if (response.data && response.data.success && response.data.data && response.data.data.length > 0) {
          const flightData = response.data.data[0];
          
          // Store in cache
          if (!data.flightDelays) {
            data.flightDelays = {};
          }
          
          data.flightDelays[flightIata] = flightData;
          this._saveData(data);
          
          return {
            delayed: flightData.delayed > 0,
            delay_minutes: flightData.delayed || 0,
            flight_status: flightData.status
          };
        } else {
          console.log('No matching flight data found in API response');
        }
      } catch (apiError) {
        console.error('Detailed API Error:', {
          message: apiError.message,
          responseData: apiError.response ? JSON.stringify(apiError.response.data) : 'No response data',
          responseStatus: apiError.response ? apiError.response.status : 'No status',
          requestConfig: apiError.config ? JSON.stringify(apiError.config.params) : 'No config'
        });
        // Continue to fallback
      }
      
      // Fallback: return no delay
      return {
        delayed: false,
        delay_minutes: 0,
        flight_status: 'unknown'
      };
    } catch (error) {
      console.error(`❌ Error checking flight delay:`, {
        message: error.message,
        stack: error.stack
      });
      return {
        delayed: false,
        delay_minutes: 0,
        flight_status: 'error'
      };
    }
  }
  // Get flight information by flight number
  async getFlightInfo(flightIata) {
    try {
      console.log(`🔄 Getting info for flight: ${flightIata}`);
      
      // Special case for test flight AV43
      if (flightIata === 'AV43') {
        const data = this._loadData();
        if (data.flightSchedules && data.flightSchedules['AV43']) {
          return {
            flightIata: 'AV43',
            airlineIata: 'AV',
            flightNumber: '43',
            departure: {
              airport: 'JFK',
              iata: 'JFK',
              scheduled: data.flightSchedules['AV43'].dep_time
            },
            arrival: {
              airport: 'BOG',
              iata: 'BOG',
              scheduled: data.flightSchedules['AV43'].arr_time
            },
            status: data.flightSchedules['AV43'].status,
            verified: true
          };
        }
      }
      
      // Check in cached data first
      const data = this._loadData();
      
      // Check in flight schedules
      if (data.flightSchedules && data.flightSchedules[flightIata]) {
        const flight = data.flightSchedules[flightIata];
        return {
          flightIata: flight.flight_iata,
          airlineIata: flight.airline_iata,
          flightNumber: flight.flight_number,
          departure: {
            airport: flight.dep_iata,
            iata: flight.dep_iata,
            scheduled: flight.dep_time
          },
          arrival: {
            airport: flight.arr_iata,
            iata: flight.arr_iata,
            scheduled: flight.arr_time
          },
          status: flight.status,
          verified: true
        };
      }
      
      // Try to fetch from API
      try {
        const airlineIata = flightIata.substring(0, 2);
        const flightNumber = flightIata.substring(2);
        
        const today = new Date().toISOString().split('T')[0];
        
        return await this.verifyFlight(airlineIata, flightNumber, today);
      } catch (apiError) {
        console.error(`Error fetching from API: ${apiError.message}`);
      }
      
      return null;
    } catch (error) {
      console.error(`❌ Error getting flight info: ${error.message}`);
      return null;
    }
  }
  
    // Fetch flight schedules and store them
    async fetchFlightSchedules() {
        try {
        const airports = ['JFK', 'LAX', 'ORD', 'LHR', 'CDG'];
        const today = new Date().toISOString().split('T')[0];
        const data = this._loadData();
        
        for (const airport of airports) {
            console.log(`Fetching schedules for airport: ${airport}`);
            
            try {
            const response = await axios.get(`${this.baseUrl}/advanced-flights-schedules`, {
                params: {
                access_key: this.apiKey,
                iataCode: airport,
                flight_date: today,
                type: 'departure'
                }
            });
            
            if (response.data && response.data.success && response.data.data) {
                const flights = response.data.data;
                
                // Initialize flightSchedules if it doesn't exist
                if (!data.flightSchedules) {
                data.flightSchedules = {};
                }
                
                for (const flight of flights) {
                const flightIata = flight.flight_iata;
                if (flightIata) {
                    data.flightSchedules[flightIata] = flight;
                }
                }
            }
            } catch (error) {
            console.error(`Error fetching schedules for ${airport}: ${error.message}`);
            // Continue with next airport
            }
        }
        
        this._saveData(data);
        console.log(`✅ Saved flight schedules to cache`);
        
        return true;
        } catch (error) {
        console.error(`❌ Error fetching flight schedules: ${error.message}`);
        return false;
        }
    }
    }
    
    module.exports = FlightAPI;