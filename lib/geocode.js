/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Google geocoder.                                                                C.Veness 2017  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Geocoder from 'node-geocoder'; // library for geocoding and reverse geocoding

import Error from '../models/error.js';


const googleApiKey = 'AIzaSyAZTZ78oNn4Y9sFZ1gIWfAsaqVNGav5DGw';


class Geocoding {

    /**
     * Invoke Google geocoder to geocode given address.
     *
     * @param   {string} address - address to be geocoded.
     * @param   {string} [region] - ccTLD supplied as region hint ('gb' will be accepted for 'uk').
     * @returns {Object} Google geocoding result.
     */
    static async geocode(address, region=null) {
        const options = { provider: 'google', apiKey: googleApiKey };

        if (typeof region == 'string') region = region.toLowerCase();
        if (region == 'gb') region = 'uk'; // if 'gb' was supplied, convert it to 'uk'
        if (region != null) options.region = region;

        const geocoder = Geocoder(options);

        try {
            const result = await geocoder.geocode(address);
            if (result.length == 0) return null; // unrecognised address TODO: more useful to return empty object or null?
            return result[0]; // TODO: does geocode always return array? why?
        } catch (e) {
            console.error(e.message);
            Error.insert(e.message, 'geocode');
            return null; // failed geocode TODO: more useful to return empty object or null?
        }
    }


    /**
     * Invoke Google reverse geocoder to get address for given latitude/longitude.
     *
     * @param   {string} lat - latitude address required for.
     * @param   {string} lon - longitude address required for.
     * @returns {Object} Google geocoding result.
     */
    static async reverse(lat, lon) {
        const options = { provider: 'google', apiKey: googleApiKey };

        const geocoder = Geocoder(options);

        try {
            const result = await geocoder.reverse({ lat, lon });
            if (result.length == 0) return null; // unrecognised address TODO: more useful to return empty object or null?
            return result[0]; // TODO: does geocode always return array? why?
        } catch (e) {
            console.error(e.message);
            Error.insert(e.message, 'geocode');
            return null; // failed geocode TODO: more useful to return empty object or null?
        }
    }

}

export default Geocoding;
