/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* AWS S3 unit tests.                                                         C.Veness 2017-2018  */
/*                                                                                                */
/*                                  © 2017-2018 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import { expect } from 'chai';       // BDD/TDD assertion library
import dateFormat from 'dateformat'; // Steven Levithan's dateFormat()


import AwsS3 from '../../lib/aws-s3.js';

const test = it; // just an alias

const org = 'grn-test'; // the test organisation for the live ‘grn‘ organisation


// fake ObjectId: stackoverflow.com/questions/10593337
const ObjectId = (rnd = r16 => Math.floor(r16).toString(16)) =>
    rnd(Date.now()/1000) + ' '.repeat(16).replace(/./g, () => rnd(Math.random()*16));


describe('AWS S3', function() {
    if (!process.env.CIRCLECI) return; // AWS Free Tier is just 2,000 put requests per month, so limit to CI tests

    this.timeout(5e3); // 5 sec

    const date = dateFormat('yyyy-mm');
    const id = ObjectId();
    console.info('\treport id', id);

    test('upload file', async function() {
        const ok = await AwsS3.put(org, 'rape-is-a-crime', date, id, 's_gps.jpg', 'test/img/s_gps.jpg');
        expect(ok).to.be.true;
    });

    test('get file', async function() {
        const file = await AwsS3.getBuffer(org, 'rape-is-a-crime', date, id, 's_gps.jpg');
        expect(file).to.be.instanceof(Buffer);
        expect(file.length).to.equal(44606);
    });

    test('delete file', async function() {
        const ok = await AwsS3.deleteReportObjects(org, 'rape-is-a-crime', date, id);
        expect(ok).to.be.true;
    });

    test('file is removed', async function() {
        await AwsS3.getBuffer(org, 'rape-is-a-crime', date, id, 's_gps.jpg').catch(error => expect(error).to.be.an('error')); // (404)
    });

    // these are just to boost coverage stats
    // note chai doesn't currently cope well with exceptions thrown from async functions:
    // see github.com/chaijs/chai/issues/882#issuecomment-322131680
    test('throw on bad org (put)', () => AwsS3.put('xxxx').catch(error => expect(error).to.be.an('error')));
    test('throw on bad org (getBuffer)', () => AwsS3.getBuffer('').catch(error => expect(error).to.be.an('error')));
    //test('throw on bad org (getStream)', () => expect(() => AwsS3.getStream('').to.throw()));
    test('throw on bad org (deleteReportObjects)', () => AwsS3.deleteReportObjects('').catch(error => expect(error).to.be.an('error')));
});
