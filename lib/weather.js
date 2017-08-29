/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Weather utility to fetch weather conditions for given location on given date.                  */
/*                                                                                                */
/* Weather conditions are obtained from Weather Underground www.wunderground.com.                 */
/* Current API key is free tier, giving 500 calls per day, 10 calls per minutes.                  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const fetch      = require('node-fetch'); // window.fetch in node.js
const dateFormat = require('dateformat'); // Steven Levithan's dateFormat()

require('dotenv').config();


class Weather {

    /**
     * Fetch weather conditions from Weather Underground for given latitude/longitude on given date.
     *
     * Returns an object with an array of observations, and the city & country the observations are
     * for. Observations are wunderground history.observations objects, and include a description of
     * weather conditions ('conds'), and the name of a weather icon ('icon'). The time of the
     * observation is held in date.hour, date.min fields.
     *
     * @param   {number} latitude
     * @param   {number} longitude
     * @param   {Date}   date
     * @returns {country, city, observations[]}
     */
    static async fetchWeatherConditions(latitude, longitude, date) {
        if (!parseFloat(latitude) || !parseFloat(longitude) || !(date instanceof Date) || isNaN(date)) return null;

        var apiKey = process.env['WUNDERGROUND_API_KEY'];

        // retrieve location data for given latitude and longitude
        const urlLocn = `http://api.wunderground.com/api/${apiKey}//geolookup/q/${latitude},${longitude}.json`
        //const urlLocn = `http://api.wunderground.com/api/${apiKey}//geolookup/q/${country}/${city}.json`
        const responseLocn = await fetch(urlLocn);
        if (!responseLocn.ok) return null;
        const locationData = await responseLocn.json();
        if (!locationData.location) return null;

        const zmwLocn = locationData.location.l; // zmw = zip code + magic + wmo id!

        // retrieve weather data for specified day @ given location
        const urlData = `http://api.wunderground.com/api/${apiKey}/history_${dateFormat(date, 'yyyymmdd')}${zmwLocn}.json`;
        const responseData = await fetch(urlData);
        if (!responseData.ok) return null; // any way to report details? (& perhaps retry later?)
        const weatherData = await responseData.json();

        // limit observation to max 1 per hour, add in JavaScript Date timestamp for convenience
        // note: use array (not object) indexed with numeric hour to keep sort order, then filter
        // out undefined hour indexes
        const hourly = [];
        weatherData.history.observations.forEach(o => {
            o.timestamp = new Date(Date.UTC(o.utcdate.year, o.utcdate.mon-1, o.utcdate.mday, o.utcdate.hour, o.utcdate.min));
            hourly[Number(o.date.hour)] = hourly[Number(o.date.hour)] || o;
        });
        const observations = hourly.filter(o => o != undefined);

        return {
            country:      locationData.location.country,
            city:         locationData.location.city,
            observations: observations,
        };
    };
}

module.exports = Weather;
