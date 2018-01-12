/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Submission model unit tests.                                                    C.Veness 2018  */
/*                                                                                                */
/* Note these tests do not mock out database components, but operate on the live 'test-cam' db.   */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import chai   from 'chai';   // BDD/TDD assertion library
import dotenv from 'dotenv'; // load environment variables from a .env file into process.env
const expect = chai.expect;

dotenv.config();

import Submission from '../../models/submission.js';

const db = 'test-cam';

import './before.js'; // set up database connections

describe('Submission model', function() {
    this.timeout(2e3); // 2 sec

    let submissionId = null;

    it('creates submission', async function() {
        const uaChrome = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36';
        submissionId = await Submission.insert(db, 'test-project', uaChrome);
        console.info(submissionId);
    });

    it('gets submission', async function() {
        const submissions = await Submission.getAll(db);
        expect(submissions).to.be.an('array');
        const [ submission ] = submissions.filter(s => s._id.toString() == submissionId);
        expect(submission).to.be.an('object');
        expect(submission.ua.family).to.equal('Chrome');
    });

    it('records progress', async function() {
        await Submission.progress(db, submissionId, 0);
        await Submission.progress(db, submissionId, 1);
        const [ submission ] = (await Submission.getAll(db)).filter(s => s._id.toString() == submissionId);
        expect(Object.keys(submission.progress).length).to.equal(2);
    });

    it('records completion', async function() {
        const reportId = '507f191e810c19729de860ea';
        await Submission.complete(db, submissionId, 0, reportId);
        await Submission.progress(db, submissionId, 1);
        const [ submission ] = (await Submission.getAll(db)).filter(s => s._id.toString() == submissionId);
        expect(Object.keys(submission.progress).length).to.equal(3);
        expect(submission.progress).to.have.property('complete');
        expect(submission).to.have.property('reportId');
    });

});
