/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Weather data unit tests                                                                        */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const expect  = require('chai').expect; // BDD/TDD assertion library
const weather = require('../../lib/weather.js');

describe('Weather data extraction tests', function() {
    return; // TODO investigate why wunderground is returning 400 Bad Request
    this.timeout(4e3); // 4 sec

    const abuja = { lat: 9.06, lon: 7.49 };
    const country = 'Nigeria';
    const city = 'Abuja';
    const date = new Date(Date.UTC(2016, 3, 4));

    it('Check empty latitude', async function() {
        const data = await weather.fetchWeatherConditions('', abuja.lon, date);
        expect(data).to.be.null;
    });

    it('Check null longitude', async function() {
        const data = await weather.fetchWeatherConditions(abuja.lat, null, date);
        expect(data).to.be.null;
    });

    it('Check invalid date', async function() {
        const data = await weather.fetchWeatherConditions(abuja.lat, abuja.lon, 'xxx');
        expect(data).to.be.null;
    });

    it('Check malformed date', async function() {
        const data = await weather.fetchWeatherConditions(abuja.lat, abuja.lon, 123);
        expect(data).to.be.null;
    });

    it('Check future date', async function() {
        const tomorrow = new Date(new Date().getTime() + 1000*60*60*24);
        const data = await weather.fetchWeatherConditions(abuja.lat, abuja.lon, tomorrow);
        expect(data).to.be.null;
    });

    it('Check Abuja on 4-Apr-2016 was mostly cloudy', async function() {
        const data = await weather.fetchWeatherConditions(abuja.lat, abuja.lon, date);
        expect(data).to.not.be.null;
        expect(data.observations[0].conds).to.equal('Mostly Cloudy');
        expect(data.observations[0].icon).to.equal('mostlycloudy');
        expect(data.observations[0].tempm).to.equal('28.0');
        expect(data.observations[0].timestamp.toUTCString()).to.equal('Tue, 04 Apr 2006 07:00:00 GMT');
    });
});
