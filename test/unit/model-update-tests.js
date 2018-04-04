/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Update model unit tests.                                                   C.Veness 2017-2018  */
/*                                                                                                */
/* Note these tests do not mock out database components, but operate on the live 'grn' test db.   */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import chai   from 'chai';   // BDD/TDD assertion library
import dotenv from 'dotenv'; // load environment variables from a .env file into process.env

const expect = chai.expect;

dotenv.config();

import Update from '../../models/update.js';
import User from '../../models/user.js';

const testuser = process.env.TESTUSER;

const db = 'grn'; // the test organisation for the live ‘test-grn‘ organisation

// fake ObjectId: stackoverflow.com/questions/10593337
const ObjectId = (rnd = r16 => Math.floor(r16).toString(16)) =>
    rnd(Date.now()/1000) + ' '.repeat(16).replace(/./g, () => rnd(Math.random()*16));

import './before.js';

describe(`Update model (${db})`, function() {
    this.timeout(5e3); // 5 sec
    this.slow(100);

    const reportId = ObjectId();
    let updateId = null;
    let userId = null;

    it('gets test user id', async function() {
        const [ user ] = await User.getBy('email', testuser);
        userId = user._id;
        console.info('\tuser id', userId);
    });

    it('creates update record', async function() {
        updateId = await Update.insert(db, reportId, userId, { set: { status: 'update test' } });
        console.info('\tupdate id', updateId);
    });

    it('gets update', async function() {
        const update = await Update.get(db, updateId);
        expect(update).to.be.an('object');
        expect(update.update.set.status).to.equal('update test');
    });

    it('gets updates for report', async function() {
        const updates = await Update.getByReport(db, reportId);
        expect(updates).to.be.an('array');
        expect(updates.length).to.equal(1);
    });

    it('gets most recent update for report', async function() {
        const update = await Update.lastForReport(db, reportId);
        expect(update).to.be.an('object');
        expect(update._id.toString()).to.equal(updateId.toString());
        expect(update.reportId.toString()).to.equal(reportId.toString());
        expect(update.userId.toString()).to.equal(userId.toString());
        expect(update.description).to.equal('Set status to ‘update test’');
    });

    it('gets updates for user', async function() {
        const updates = await Update.getByUser(db, userId);
        expect(updates).to.be.an('array');
        expect(updates.length).to.be.at.least(1);
    });

    it('gets all updates', async function() {
        const updates = await Update.getAll(db);
        expect(updates).to.be.an('array');
        expect(updates.length).to.be.at.least(1);
    });

    it('gets updates using flexible query', async function() {
        const updates = await Update.find(db, { userId: userId });
        expect(updates).to.be.an('array');
        expect(updates.length).to.be.at.least(1);
    });

});
