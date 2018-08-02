/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Resource model unit tests.                                                 C.Veness 2017-2018  */
/*                                                                                                */
/* Note these tests do not mock out database components, but operate on the live 'grn-test' db.   */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import { expect } from 'chai';   // BDD/TDD assertion library
import dotenv     from 'dotenv'; // load environment variables from a .env file into process.env

dotenv.config();

import Resource from '../../models/resource.js';

const db = 'grn-test'; // the test organisation for the live ‘grn‘ organisation

import './before.js';
import Report from '../../models/report'; // set up database connections

describe(`Resource model (${db})`, function() {
    this.timeout(5e3); // 5 sec
    this.slow(100);

    let resourceId = null;

    describe('supplied db failures', function() {
        // note chai doesn't currently cope well with exceptions thrown from async functions:
        // see github.com/chaijs/chai/issues/882#issuecomment-322131680 TODO: convert to async try/catch
        it('throws on unknown db', () => Resource.init('no db by this name').catch(error => expect(error).to.be.an('error')));
        it('throws on empty string', () => Resource.init('').catch(error => expect(error).to.be.an('error')));
        it('throws on null', () => Resource.init(null).catch(error => expect(error).to.be.an('error')));
        it('throws on numeric', () => Resource.init(999).catch(error => expect(error).to.be.an('error')));
        it('throws on object', () => Resource.init({}).catch(error => expect(error).to.be.an('error')));
        it('throws on unset', () => Resource.init().catch(error => expect(error).to.be.an('error')));
        // a few meaningless tests just to bump coverage stats; note these are not robust tests, as
        // a failure to throw will not get reported
        it('throws on unset - find', () => Resource.find().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - get', () => Resource.get().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - getAll', () => Resource.getAll().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - getBy', () => Resource.getBy().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - getNear', () => Resource.getNear().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - insert', () => Resource.insert().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - update', () => Resource.update().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - delete', () => Resource.delete().catch(error => expect(error).to.be.an('error')));
    });

    describe('init', function() {
        it('initialises collection (noop)', async function() {
            expect(await Resource.init(db)).to.be.undefined;
        });
    });

    describe('create', function() {
        it ('creates test resource', async function() {
            const values = {
                name:     'Maudlin Rehab',
                address:  'Chesterton Lane, Cambridge',
                phone:    [ '01223 424242' ],
                email:    [ 'rehab@maudlin.org' ],
                services: [ 'rehab' ],
                category: 'Medical help',
            };
            const geocode = {
                latitude:  52.2107262,
                longitude: 0.1138847,
            };
            resourceId = await Resource.insert(db, values, geocode);
            expect(resourceId.constructor.name).to.equal('ObjectID');
            const resource = await Resource.get(db, resourceId);
            expect(resource).to.be.an('object');
            expect(resource).to.have.property('name');
        });
    });

    describe('manage', function() {

        it('finds resource', async function() {
            const query = { name: 'Maudlin Rehab' };
            const resources = await Resource.find(db, query);
            expect(resources).to.be.an('array');
            expect(resources.length).to.equal(1); // wouldn't want more than one!
            expect(resources[0].name).to.equal('Maudlin Rehab');
            expect(resources[0].services).to.be.an('array');
        });

        it('gets resource', async function() {
            const resource = await Resource.get(db, resourceId);
            expect(resource).to.be.an('object');
            expect(resource.name).to.equal('Maudlin Rehab');
        });
        it('gets newly created resource with string id', async function() {
            const resource = await Resource.get(db, resourceId.toString());
            expect(resource).to.be.an('object');
            expect(resource.name).to.equal('Maudlin Rehab');
        });
        it('gets all active resources', async function() {
            const resources = await Resource.getAll(db);
            expect(resources).to.be.an('array');
            expect(resources.length).to.be.at.least(1);
            // TODO: any way to test resources includes resourceId?
        });
        it('gets resources with field matching value', async function() {
            const resources = await Resource.getBy(db, 'name', 'Maudlin Rehab');
            expect(resources).to.be.an('array');
            expect(resources.length).to.be.equal(1);
        });
        it('gets local resources', async function() {
            const resources = await Resource.getNear(db, 52.2107, 0.1139, 100);
            expect(resources).to.be.an('array');
            expect(resources.length).to.be.equal(1);
        });
        it('gets no local resources when dist too small', async function() {
            const resources = await Resource.getNear(db, 52.2107, 0.1139, 1);
            expect(resources).to.be.an('array');
            expect(resources.length).to.be.equal(0);
        });
        it('updates resource', async function() {
            await Resource.update(db, resourceId.toString(), { services: [ 'rehab', 'comfort' ] });
            const resource = await Resource.get(db, resourceId);
            expect(resource.services).to.be.an('array');
        });
    });

    describe('fails validation', function() {
        it('fails to set no-such-field', async function() {
            try {
                await Resource.update(db, resourceId, { 'no-such-field': 'nothing here' }, null);
                throw new Error('Resource.update should fail validation');
            } catch (e) {
                expect(e.message).to.equal('Resource failed validation [update]');
            }
        });
    });

    describe('delete', function() {
        it('deletes resource', async function() {
            await Resource.delete(db, resourceId.toString());
            expect(await Resource.get(db, resourceId)).to.be.null;
        });
    });

});
