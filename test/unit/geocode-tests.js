/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* EXIF header extraction unit tests                                                              */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const expect      = require('chai').expect; // BDD/TDD assertion library
const MongoClient = require('mongodb').MongoClient;

require('dotenv').config(); // loads environment variables from .env file (if available - eg dev env)

const geocode = require('../../lib/geocode.js');

before(async function() {
    this.timeout(10e3); // 10 sec
    try {
        const userDb = await MongoClient.connect(process.env['DB_USERS']);
        global.db = { users: userDb };
    } catch (e) {
        console.error(e.message);
        process.exit(1);
    }
});

describe('Geocode', function() {
    it('geocodes Free School Lane', async function() {
        const result = await geocode('Free School Lane, Cambridge', 'uk');
        expect(result).to.be.an('object');
        expect(result.latitude).to.equal(52.2032016);
        expect(result.longitude).to.equal(0.1188354);
        expect(result.country).to.equal('United Kingdom');
        expect(result.administrativeLevels.level1long).to.equal('England');
        expect(result.administrativeLevels.level2long).to.equal('Cambridgeshire');
        expect(result.extra.neighborhood).to.equal('Cambridgeshire');
        expect(result.city).to.equal('Cambridge');
        expect(result.streetName).to.equal('Free School Lane');
        expect(result.formattedAddress).to.equal('Free School Ln, Cambridge CB2, UK');
    });

    it('geocodes University of Lagos', async function() {
        const result = await geocode('University of Lagos', 'ng');
        expect(result).to.be.an('object');
        expect(result.latitude).to.equal(6.515496);
        expect(result.longitude).to.equal(3.3877535);
        expect(result.country).to.equal('Nigeria');
        expect(result.administrativeLevels).to.be.empty;
        expect(result.extra.neighborhood).to.equal('Yaba');
        expect(result.city).to.equal('Lagos State.');
        expect(result.streetName).to.be.undefined;
    });

    it('geocodes University of Abuja', async function() {
        const result = await geocode('University of Abuja', 'ng');
        expect(result).to.be.an('object');
        expect(result.latitude).to.equal(9.0009689); // occasionally turns up other values e.g. 9.0049455
        expect(result.longitude).to.equal(7.422069999999999); // should be more like 8.9812,7.1808!
        expect(result.country).to.equal('Nigeria');
        expect(result.administrativeLevels.level1long).to.equal('FCT');
        expect(result.administrativeLevels.level2long).to.equal('Municipal Area Coun');
        expect(result.extra.neighborhood).to.equal('Galadimawa');
        expect(result.city).to.equal('Abuja F.C.T');
        expect(result.streetName).to.equal('Km 10 Airport Road');
        expect(result.formattedAddress).to.equal('Km 10 Airport Road, Galadimawa, Abuja F.C.T, Nigeria');
    });

    it('fails to geocode unrecognised address', async function() {
        const result = await geocode('this is a place which I’ve certainly never come across', 'uk');
        expect(result).to.be.null;
    });
});
