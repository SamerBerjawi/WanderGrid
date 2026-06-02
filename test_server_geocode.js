const fs = require('fs');

// Let's extract searchLocalAirportData and STATIC_GEO_COORDS from backend_files/server.js
const serverJs = fs.readFileSync('backend_files/server.js', 'utf8');

// We have STATIC_GEO_COORDS and searchLocalAirportData in server.js
// Let's create an environment to execute them
const memoryAirports = new Map();
memoryAirports.set('BER', {
  iata: 'BER',
  city_name: 'Berlin',
  airport_name: 'Berlin Brandenburg'
});

// Let's find STATIC_GEO_COORDS block in server.js
const staticCoordsMatch = serverJs.match(/const STATIC_GEO_COORDS = \{[\s\S]*?\};/);
if (!staticCoordsMatch) {
  console.log('STATIC_GEO_COORDS not found!');
  process.exit(1);
}

// Evaluate STATIC_GEO_COORDS
let STATIC_GEO_COORDS;
eval(staticCoordsMatch[0]);

// Find searchLocalAirportData function in server.js
const functionMatch = serverJs.match(/function searchLocalAirportData\(q\) \{[\s\S]*?\n\}/);
if (!functionMatch) {
  console.log('searchLocalAirportData function not found!');
  process.exit(1);
}

let searchLocalAirportData;
eval(functionMatch[0]);

console.log('--- TEST searchLocalAirportData("ber") ---');
console.log(searchLocalAirportData('ber'));

console.log('--- TEST searchLocalAirportData("BER") ---');
console.log(searchLocalAirportData('BER'));
