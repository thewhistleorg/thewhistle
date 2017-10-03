/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* AWS S3 unit tests                                                                              */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const expect     = require('chai').expect; // BDD/TDD assertion library
const dateFormat = require('dateformat');  // Steven Levithan's dateFormat()

require('dotenv').config(); // loads environment variables from .env file (if available - eg dev env)

const AwsS3 = require('../../lib/aws-s3.js');

const test = it; // just an alias

// fake ObjectId: stackoverflow.com/questions/10593337
const ObjectId = (rnd = r16 => Math.floor(r16).toString(16)) =>
    rnd(Date.now()/1000) + ' '.repeat(16).replace(/./g, () => rnd(Math.random()*16));

global.db = { test: {} }; // fool library into thinking we have db env vars set up

describe('AWS S3', function() {
    this.timeout(5e3); // 5 sec

    const date = dateFormat('yyyy-mm');
    const id = ObjectId();
    console.info('report id', id);

    test('upload file', async function() {
        const ok = await AwsS3.put('test', 'sexual-assault', date, id, 's_gps.jpg', 'test/img/s_gps.jpg');
        expect(ok).to.be.true;
    });

    test('get file', async function() {
        const file = await AwsS3.getBuffer('test', 'sexual-assault', date, id, 's_gps.jpg');
        expect(file).to.be.instanceof(Buffer);
        expect(file.length).to.equal(44606);
    });

    test('delete file', async function() {
        const ok = await AwsS3.deleteReportObjects('test', 'sexual-assault', date, id);
        expect(ok).to.be.true;
    });

    test('file is removed', async function() {
        const file = await AwsS3.getBuffer('test', 'sexual-assault', date, id, 's_gps.jpg').catch(error => expect(error).to.be.an('error'));
    });
});
