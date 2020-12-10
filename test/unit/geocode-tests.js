/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Geocoder unit tests.                                                       C.Veness 2017-2018  */
/*                                                                                                */
/*                                  © 2017-2018 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import { expect } from 'chai';   // BDD/TDD assertion library
import dotenv     from 'dotenv'; // load environment variables from a .env file into process.env
dotenv.config();

import Geocoder from '../../lib/geocode.js';

import './before.js'; // set up database connections

describe('Geocode', function() {

    it('geocodes Free School Lane', async function() {
        const result = await Geocoder.geocode('Department of Sociology, Free School Lane, Cambridge', 'uk');
        expect(result).to.be.an('object');
        // expect(result.latitude).to.equal(52.2033924); // google knows the sociology dept has moved,
        // expect(result.longitude).to.equal(0.1189126); // even though the request is Free School Lane!
        expect(result.latitude).to.equal(52.2042666);
        expect(result.longitude).to.equal(0.1149085);
        expect(result.country).to.equal('United Kingdom');
        expect(result.city).to.equal('Cambridge');
        expect(result.streetName).to.equal('Trinity Ln');
        expect(result.formattedAddress).to.equal('The Old Schools, Trinity Ln, Cambridge CB2 1TN, UK');
    });

    it('reverse geocodes Free School Lane', async function() {
        const result = await Geocoder.reverse(52.2033924, 0.1189126);
        expect(result).to.be.an('object');
        expect(result.latitude).to.equal(52.2035043);            // !!
        expect(result.longitude).to.equal(0.1187817);            // !!
        expect(result.country).to.equal('United Kingdom');
        expect(result.administrativeLevels.level1long).to.equal('England');
        expect(result.administrativeLevels.level2long).to.equal('Cambridgeshire');
        expect(result.city).to.equal('Cambridge');
        expect(result.streetName).to.equal('Free School Lane');
        expect(result.formattedAddress).to.equal('The Large Examination Hall, Free School Ln, Cambridge CB2 3RF, UK'); // !!
    });


    it('geocodes University of Lagos', async function() {
        const result = await Geocoder.geocode('University of Lagos', 'ng');
        expect(result).to.be.an('object');
        expect(result.latitude).to.equal(6.512809499999999);
        expect(result.longitude).to.equal(3.3912026);
        expect(result.country).to.equal('Nigeria');
        expect(result.extra.neighborhood).to.equal('Yaba');
        expect(result.city).to.equal('Lagos');
        expect(result.streetName).to.equal('Akoka Road');
    });

    /* remove University of Abuja test as google keeps coming back with different results! */
    //it('geocodes University of Abuja', async function() {
    //    const result = await Geocoder.geocode('University of Abuja', 'ng');
    //    expect(result).to.be.an('object');
    //    expect(result.latitude).to.be.closeTo(9.0009689, 0.1); // occasionally turns up other values e.g. 9.0049455, 9.0291295!
    //    expect(result.longitude).to.be.closeTo(7.42207, 0.1);  // should actually be more like 8.9812,7.1808!
    //    expect(result.country).to.equal('Nigeria');
    //    expect(result.administrativeLevels.level1long).to.equal('FCT');
    //    expect(result.administrativeLevels.level2long).to.equal('Municipal Area Coun');
    //    expect(result.extra.neighborhood).to.equal('Galadimawa'); // sometimes comes out 'Area 3, Garki'!
    //    expect(result.city).to.equal('Abuja F.C.T');
    //    expect(result.streetName).to.equal('Km 10 Airport Road');
    //    expect(result.formattedAddress).to.equal('Km 10 Airport Road, Galadimawa, Abuja F.C.T, Nigeria');
    //});

    it('fails to geocode unrecognised address', async function() {
        const result = await Geocoder.geocode('this is a place which I’ve certainly never come across', 'uk');
        expect(result).to.be.null;
    });
});
