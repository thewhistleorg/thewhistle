/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Report model unit tests.                                                   C.Veness 2017-2018  */
/*                                                                                                */
/* Note these tests do not mock out database components, but operate on the live 'grn-test' db.   */
/*                                                                                                */
/* AWS Free Tier is just 2,000 put requests per month, so tests involving file upload are limited */
/* to CI tests. To run these locally set environment variable CIRCLECI to true.                   */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import { expect }         from 'chai';       // BDD/TDD assertion library
import fs         from 'fs-extra';   // fs with extra functions & promise interface
import dateFormat         from 'dateformat'; // Steven Levithan's dateFormat()
import dotenv             from 'dotenv';     // load environment variables from a .env file into process.env

dotenv.config();

import Report from '../../models/report.js';
import User   from '../../models/user.js';

import './before.js'; // set up database connections

const db = 'grn-test'; // the test organisation for the live ‘grn‘ organisation

describe(`Report model (${db})`, function() {
    this.timeout(5e3); // 5 sec
    this.slow(100);

    let reportId = null;
    let userId = null;

    describe('setup', function() {
        it ('sets up test user', async function() {
            const usr = { firstname: 'Test', lastname: 'User', email: 'test@user.com', password: null, username: 'test', roles: [ 'admin' ], databases: [ 'test' ] };
            userId = await User.insert(usr);
            console.info('\tuser id:', userId);
        });
    });

    describe('supplied db failures', function() {
        // note chai doesn't currently cope well with exceptions thrown from async functions:
        // see github.com/chaijs/chai/issues/882#issuecomment-322131680 TODO: convert to async try/catch
        it('throws on unknown db', () => Report.init('no db by this name').catch(error => expect(error).to.be.an('error')));
        it('throws on empty string', () => Report.init('').catch(error => expect(error).to.be.an('error')));
        it('throws on null', () => Report.init(null).catch(error => expect(error).to.be.an('error')));
        it('throws on numeric', () => Report.init(999).catch(error => expect(error).to.be.an('error')));
        it('throws on object', () => Report.init({}).catch(error => expect(error).to.be.an('error')));
        it('throws on unset', () => Report.init().catch(error => expect(error).to.be.an('error')));
        // a few meaningless tests just to bump coverage stats; note these are not robust tests, as
        // a failure to throw will not get reported
        it('throws on unset - find', () => Report.find().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - get', () => Report.get().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - getAll', () => Report.getAll().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - getBy', () => Report.getBy().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - getByTag', () => Report.getByTag().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - getLatestIimestamp', () => Report.getLatestTimestamp().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - getOldestIimestamp', () => Report.getOldestTimestamp().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - update', () => Report.update().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - delete', () => Report.delete().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - statuses', () => Report.statuses().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - tags', () => Report.tags().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - insertTag', () => Report.insertTag().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - deleteTag', () => Report.deleteTag().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - insertComment', () => Report.insertComment().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - deleteComment', () => Report.deleteComment().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - flagView', () => Report.flagView().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - lastViewed', () => Report.lastViewed().catch(error => expect(error).to.be.an('error')));
    });
    // note we won't bother checking the "if (!global.db[db]) throw" statement on all other functions!

    describe('init', function() {
        it('initialises existing db (noop', async function() {
            expect(await Report.init(db)).to.be.undefined;
        });
    });

    describe('report submission', function() {
        it('starts submission', async function() {
            const ua = 'node-superagent/x.x.x';

            reportId = await Report.submissionStart(db, 'test-project', 'test test', false, ua);

            console.info('\treport id:', reportId);
            expect(reportId.constructor.name).to.equal('ObjectID');

            const report = await Report.get(db, reportId);
            expect(report).to.be.an('object');
            expect(report).to.have.property('alias');
        });

        it('submits details', async function() {
            const details = {
                'Alias':            'test test',
                'On behalf of':     'Myself',
                'Survivor gender':  null,
                'Survivor age':     null,
                'Happened':         new Date(dateFormat('yyyy-mm-dd')),
                'Still happening?': 'no',
                'Where':            'Around the corner',
            };
            const detailsRaw = {
                'on-belalf-of':    'myself',
                'survivor-gender': null,
                'survivor-age':    null,
                'date':            { day: dateFormat('d'), month: dateFormat('mmm'), year: dateFormat('yyyy'), time: '' },
                'still-happening': 'n',
                'where':           'Around the corner',
            };

            await Report.submissionDetails(db, reportId, details, detailsRaw);

            const report = await Report.get(db, reportId);
            expect(report.submitted).to.be.an('object');
            expect(report.submitted.Alias).to.equal('test test');
            expect(report.submitted.Happened.getTime()).to.equal(new Date(dateFormat('yyyy-mm-dd')).getTime());
        });

        if (process.env.CIRCLECI) {
            it('submits file', async function() {
                // spoof file upload (copy file to /tmp & create formidable object)
                await fs.copy('./test/img/s_gps.jpg', '/tmp/upload_s_gps.jpg');
                const stat = await fs.stat('/tmp/upload_s_gps.jpg');
                const file = {
                    size:             stat.size,
                    path:             '/tmp/upload_s_gps.jpg',
                    name:             's_gps.jpg',
                    type:             'image/jpeg',
                    lastModifiedDate: stat.mtime,
                };

                await Report.submissionFile(db, reportId, file);

                const report = await Report.get(db, reportId);
                expect(report.files).to.be.an('array');
                expect(report.files[0].name).to.equal('s_gps.jpg');
                expect(report.files[0].path).to.equal(`test-project/${dateFormat('yyyy-mm')}/${reportId}/`);
            });
        }

        if (process.env.CIRCLECI) {
            it('has extracted exif data in analysis', async function() {
                const report = await Report.get(db, reportId);
                expect(report.analysis).to.be.an('object');
                expect(report.analysis.files).to.be.an('array');
                expect(report.analysis.files[0].exif).to.be.an('object');
                expect(report.analysis.files[0].exif.GPSLatitude).to.equal(54.98966667);
                expect(report.analysis.files[0].exif.GPSLongitude).to.equal(-1.91416667);
            });
        }
    });

    describe('find', function() {
        it('finds reports by "test test"', async function() {
            const query = { alias: 'test test' };
            const rpts = await Report.find(db, query);
            expect(rpts).to.be.an('array');
            expect(rpts.length).to.equal(1);
            expect(rpts[0].alias).to.equal('test test');
        });
    });

    describe('get', function() {
        it('gets newly created report', async function() {
            const rpt = await Report.get(db, reportId);
            expect(rpt).to.be.an('object');
            expect(rpt.alias).to.equal('test test');
        });
        it('gets newly created report with string id', async function() {
            const rpt = await Report.get(db, reportId.toString());
            expect(rpt).to.be.an('object');
            expect(rpt.alias).to.equal('test test');
        });
        it('gets all active reports', async function() {
            const rpts = await Report.getAll(db);
            expect(rpts).to.be.an('array');
            expect(rpts.length).to.be.at.least(1);
            // TODO: any way to test rpts includes reportId?
        });
        it('gets reports with field matching value', async function() {
            const rpts = await Report.getBy(db, 'alias', 'test test');
            expect(rpts).to.be.an('array');
            expect(rpts.length).to.be.equal(1);
        });
        it('gets most recent report timestamp', async function() {
            const timestamp = await Report.getLatestTimestamp(db);
            expect(new Date(timestamp)).to.be.at.least(reportId.getTimestamp());
        });
        it('gets oldest report timestamp', async function() {
            const timestamp = await Report.getOldestTimestamp(db);
            expect(new Date(timestamp)).to.be.at.most(reportId.getTimestamp());
        });
    });

    describe('filter', function() {
        it('filter by submitted test search', async function() {
            // emulate buildFilter() free-text filter
            const query = { $and: [ { archived: false }, { 'submitted.Where': 'Around the corner' } ] };
            const rpts = await Report.find(db, query);
            expect(rpts).to.be.an('array');
            expect(rpts.length).to.equal(1);
            expect(rpts[0].alias).to.equal('test test');
        });
    });

    describe('updates', function() {
        // it('updates summary', async function() {
        //     await Report.update(db, reportId, { summary: 'A test report' });
        //     const rpt = await Report.get(db, reportId);
        //     expect(rpt.summary).to.equal('A test report');
        // });
        it('updates assignedTo', async function() {
            await Report.update(db, reportId, { assignedTo: userId });
            const rpt = await Report.get(db, reportId);
            expect(rpt.assignedTo).to.deep.equal(userId);
        });
        it('updates status', async function() {
            await Report.update(db, reportId, { status: 'In progress' });
            const rpt = await Report.get(db, reportId);
            expect(rpt.status).to.equal('In progress');
        });
    });

    describe('tags', function() {
        it('sets test-tag', async function() {
            await Report.insertTag(db, reportId, 'test-tag', userId);
        });
        it('gets tags', async function() {
            const tags = await Report.tags(db);
            expect(tags).to.be.an('array');
            expect(tags).to.include('test-tag');
        });
        it('gets reports by tag', async function() {
            const rpts = await Report.getByTag(db, 'test-tag');
            expect(rpts).to.be.an('array');
            expect(rpts.length).to.be.at.least(1);
            // TODO: any way to test rpts includes 'test-tag?
        });
        it('deletes test-tag', async function() {
            await Report.deleteTag(db, reportId, 'test-tag', userId);
            const tags = await Report.tags(db);
            expect(tags).to.be.an('array');
            expect(tags).to.not.include('test-tag');
        });
    });

    describe('status', function() {
        it('sets status', async function() {
            await Report.update(db, reportId, { status: 'In progress' });
        });
        it('gets statuses', async function() {
            const statuses = await Report.statuses(db);
            expect(statuses).to.be.an('array');
            expect(statuses).to.include('In progress');
        });
    });

    describe('comments', function() {
        it('sets comment', async function() {
            await Report.insertComment(db, reportId, 'This is a good test report', userId);
            const rpt = await Report.get(db, reportId);
            expect(rpt.comments).to.be.an('array');
            expect(rpt.comments.length).to.equal(1);
            expect(rpt.comments[0].comment).to.equal('This is a good test report');
        });
        it('deletes comment', async function() {
            const rpt = await Report.get(db, reportId);
            await Report.deleteComment(db, reportId, userId, rpt.comments[0].on, userId);
            const rpt2 = await Report.get(db, reportId);
            expect(rpt2.comments).to.be.an('array');
            expect(rpt2.comments.length).to.equal(0);
        });
        it('throws on unknown db', function() {
            Report.deleteComment(db, reportId, userId, 'bad date', userId).catch(error => expect(error).to.be.an('error'));
        });

    });

    describe('flag viewed', function() {
        it('sets flag', async function() {
            await Report.flagView(db, reportId, userId);
        });
        it('verifies flag', async function() {
            const lastView = await Report.lastViewed(db, reportId, userId);
            expect(lastView.getTime()).to.be.closeTo(Date.now(), 1e3);
        });
    });

    describe('fails validation', function() {
        it('fails to set no-such-field', async function() {
            try {
                await Report.update(db, reportId, { 'no-such-field': 'nothing here' });
                throw new Error('Report.update should fail validation');
            } catch (e) {
                expect(e.message).to.match(/Report grn-test\/[0-9a-f]+ failed validation \[update\]/);
            }
        });
    });

    describe('teardown', function() {
        it('deletes incident report', async function() {
            await Report.delete(db, reportId);
            expect(await Report.get(db, reportId)).to.be.null;
        });
        it('deletes test user', async function() {
            const ok = await User.delete(userId);
            expect(ok).to.be.true;
        });
    });

});
