/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Google geocoder                                                                                */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const Geocoder = require('node-geocoder'); // library for geocoding and reverse geocoding

const Error = require('../models/error.js');

// TODO: supply region option (ccTLD) dependant on organisation/database


/**
 * Invoke Google geocoder to geocode given address.
 *
 * @param   {string} address - address to be geocoded.
 * @param   {string} [region] - ccTLD supplied as region hint (note 'uk' for UK, not 'gb').
 * @returns {Object} Google geocoding result.
 */
async function geocode(address, region=null) {
    const geocoder = Geocoder({ provider: 'google', apiKey: 'AIzaSyAZTZ78oNn4Y9sFZ1gIWfAsaqVNGav5DGw' });

    const options = region==null ? {} : { region: region };

    try {
        const result = await geocoder.geocode(address, options);
        if (result.length == 0) return null; // unrecognised address TODO: more useful to return empty object or null?
        return result[0]; // TODO: does geocode always return array? why?
    } catch (e) {
        console.error(e.message);
        Error.insert(e.message, 'geocode');
        return null; // failed geocode TODO: more useful to return empty object or null?
    }
}

module.exports = geocode;
