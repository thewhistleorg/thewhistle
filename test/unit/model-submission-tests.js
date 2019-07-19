/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Submission model unit tests.                                                    C.Veness 2018  */
/*                                                                                                */
/* Note these tests do not mock out database components, but operate on the live 'grn-test' db.   */
/*                                                                                                */
/*                                       © 2018 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import { expect } from 'chai';   // BDD/TDD assertion library
import dotenv     from 'dotenv'; // load environment variables from a .env file into process.env

dotenv.config();

import Submission from '../../models/submission.js';

const db = 'grn-test'; // the test organisation for the live ‘grn‘ organisation

// fake ObjectId: stackoverflow.com/questions/10593337
const ObjectId = (rnd = r16 => Math.floor(r16).toString(16)) =>
    rnd(Date.now()/1000) + ' '.repeat(16).replace(/./g, () => rnd(Math.random()*16));

import './before.js'; // set up database connections

describe(`Submission model (${db})`, function() {
    let submissionId = null;

    it('creates submission', async function() {
        const uaChrome = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36';
        submissionId = await Submission.insert(db, 'test-project', uaChrome);
        console.info('\tsubmission id', submissionId);
    });

    it('gets submission', async function() {
        const submission = await Submission.get(db, submissionId);
        expect(submission).to.be.an('object');
        expect(submission).to.have.property('ua');
        expect(submission.ua.family).to.equal('Chrome');
    });

    it('records progress', async function() {
        await Submission.progress(db, submissionId, 0);
        await Submission.progress(db, submissionId, 1);
        const submission = await Submission.get(db, submissionId);
        expect(Object.keys(submission.progress).length).to.equal(2);
    });

    it('records completion', async function() {
        const reportId = ObjectId();
        await Submission.progress(db, submissionId, 1); // resubmit p1
        await Submission.complete(db, submissionId, reportId);
        const submission = await Submission.get(db, submissionId);
        expect(submission.progress).to.have.property('complete');
        expect(Object.keys(submission.progress).length).to.equal(3);
        expect(submission).to.have.property('reportId');
        expect(submission.reportId.toString()).to.equal(reportId);
    });

    it('tidies up', async function() {
        await Submission.delete(db, submissionId);
        const submission = await Submission.get(db, submissionId);
        expect(submission).to.be.null;
    });

});
