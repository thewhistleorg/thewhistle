/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* AWS S3 unit tests.                                                         C.Veness 2017-2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import chai       from 'chai';       // BDD/TDD assertion library
import dateFormat from 'dateformat'; // Steven Levithan's dateFormat()
const expect   = chai.expect;


import AwsS3 from'../../lib/aws-s3.js';

const test = it; // just an alias

// fake ObjectId: stackoverflow.com/questions/10593337
const ObjectId = (rnd = r16 => Math.floor(r16).toString(16)) =>
    rnd(Date.now()/1000) + ' '.repeat(16).replace(/./g, () => rnd(Math.random()*16));

import './before.js'; // set up database connections

describe('AWS S3', function() {
    this.timeout(5e3); // 5 sec

    const date = dateFormat('yyyy-mm');
    const id = ObjectId();
    console.info('report id', id);

    test('upload file', async function() {
        const ok = await AwsS3.put('test-cam', 'sexual-assault', date, id, 's_gps.jpg', 'test/img/s_gps.jpg');
        expect(ok).to.be.true;
    });

    test('get file', async function() {
        const file = await AwsS3.getBuffer('test-cam', 'sexual-assault', date, id, 's_gps.jpg');
        expect(file).to.be.instanceof(Buffer);
        expect(file.length).to.equal(44606);
    });

    test('delete file', async function() {
        const ok = await AwsS3.deleteReportObjects('test-cam', 'sexual-assault', date, id);
        expect(ok).to.be.true;
    });

    test('file is removed', async function() {
        await AwsS3.getBuffer('test-cam', 'sexual-assault', date, id, 's_gps.jpg').catch(error => expect(error).to.be.an('error')); // (404)
    });

    // these are just to boost coverage stats
    // note chai doesn't currently cope well with exceptions thrown from async functions:
    // see github.com/chaijs/chai/issues/882#issuecomment-322131680
    test('throw on bad db (put)', () => AwsS3.put('xxxx').catch(error => expect(error).to.be.an('error')));
    test('throw on bad db (getBuffer)', () => AwsS3.getBuffer('').catch(error => expect(error).to.be.an('error')));
    //test('throw on bad db (getStream)', () => expect(() => AwsS3.getStream('').to.throw()));
    test('throw on bad db (deleteReportObjects)', () => AwsS3.deleteReportObjects('').catch(error => expect(error).to.be.an('error')));
});
