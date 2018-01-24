/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Weather utility to fetch weather conditions for given location on given date.                  */
/*                                                                            C.Veness 2017-2018  */
/*                                                                                                */
/* Weather conditions are obtained from Weather Underground www.wunderground.com.                 */
/* Current API key is free tier, giving 500 calls per day, 10 calls per minutes.                  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import fetch      from 'node-fetch'; // window.fetch in node.js
import dateFormat from 'dateformat'; // Steven Levithan's dateFormat()
import dotenv from 'dotenv'; // load environment variables from a .env file into process.env

dotenv.config();


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
        if (!parseFloat(latitude) || !parseFloat(longitude)) return null;
        if (!(date instanceof Date) || isNaN(date) || date.getTime()>Date.now()) return null;

        const apiKey = process.env.WUNDERGROUND_API_KEY;
        if (!apiKey) throw new Error('Weather Underground API key missing');

        // retrieve location data for given latitude and longitude
        const urlLocn = `http://api.wunderground.com/api/${apiKey}/geolookup/q/${latitude},${longitude}.json`;
        //const urlLocn = `http://api.wunderground.com/api/${apiKey}//geolookup/q/${country}/${city}.json`
        const responseLocn = await fetch(urlLocn);
        if (!responseLocn.ok) return null;
        const locationData = await responseLocn.json();
        if (!locationData.location) return null;

        const zmwLocn = locationData.location.l; // zmw = zip code + magic + wmo id!

        // retrieve weather data for specified day @ given location
        const yyyymmdd = dateFormat(date, 'yyyymmdd');
        const urlData = `http://api.wunderground.com/api/${apiKey}/history_${yyyymmdd}${zmwLocn}.json`;
        const responseData = await fetch(urlData);
        if (!responseData.ok) return null; // any way to report details? (& perhaps retry later?)

        // sometimes wunderground API seems to error out for no obvious reason (the same URL returns
        // malformed JSON with HTML in place of the "history" element (saying 'Your browser sent a
        // request that this server could not understand. Additionally, a 400 Bad Request error was
        // encountered while trying to use an ErrorDocument to handle the request.'). Unfortunately,
        // it is still sending a 2xx Success code (or the responseData.ok test would trap it).
        // Therefore, enclose the JSON parsing within a try block and return null if it throws.
        // This shouldn't be necessary if the wunderground API was behaving!
        const weatherText = await responseData.text();
        let weatherData = null;
        try {
            weatherData = JSON.parse(weatherText);
        } catch (e) {
            console.error('Wundeground ERROR', e.message);
            console.error('Wundeground urlData:', responseData.status, urlData);
            return null;
        }

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
    }
}

export default Weather;
