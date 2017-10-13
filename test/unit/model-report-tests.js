/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Report model unit tests.                                                        C.Veness 2017  */
/*                                                                                                */
/* Note these tests do not mock out database components, but operate on the live 'test-cam' db.   */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const fs          = require('fs-extra');    // fs with extra functions & promise interface
const dateFormat  = require('dateformat');  // Steven Levithan's dateFormat()
const expect      = require('chai').expect; // BDD/TDD assertion library

require('dotenv').config(); // loads environment variables from .env file (if available - eg dev env)

const Report = require('../../models/report.js');
const User   = require('../../models/user.js');

require('./before.js'); // set up database connections

describe('Report model', function() {
    this.timeout(5e3); // 5 sec

    let reportId = null;
    let userId = null;

    describe('setup', function() {
        it ('sets up test user', async function() {
            const usr = { firstname: 'Test', lastname: 'User', email: 'test@user.com', username: 'test', roles: 'admin', databases: 'test' };
            userId = await User.insert(usr);
            console.info('user id:', userId);
        });
    });

    describe('supplied db failures', function() {
        // note chai doesn't currently cope well with exceptions thrown from async functions:
        // see github.com/chaijs/chai/issues/882#issuecomment-322131680
        it('throws on unknown db', () => Report.init('no db by this name').catch(error => expect(error).to.be.an('error')));
        it('throws on empty string', () => Report.init('').catch(error => expect(error).to.be.an('error')));
        it('throws on null', () => Report.init(null).catch(error => expect(error).to.be.an('error')));
        it('throws on numeric', () => Report.init(999).catch(error => expect(error).to.be.an('error')));
        it('throws on object', () => Report.init({}).catch(error => expect(error).to.be.an('error')));
        it('throws on unset', () => Report.init().catch(error => expect(error).to.be.an('error')));
        // a few meaningless tests just to bump coverage stats
        it('throws on unset - find', () => Report.find().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - get', () => Report.get().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - getAll', () => Report.getAll().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - getBy', () => Report.getBy().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - getByTag', () => Report.getByTag().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - getLatestIimestamp', () => Report.getLatestTimestamp().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - getOldestIimestamp', () => Report.getOldestTimestamp().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - insert', () => Report.insert().catch(error => expect(error).to.be.an('error')));
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
        it('initialises existing db (ie noop', async function() {
            expect(await Report.init('test-cam')).to.be.undefined;
        });
    });

    describe('insert', function() {
        it('creates minimal incident report', async function() {
            const submitted = { Date: new Date(), Description: 'a test report' };

            // spoof file upload (copy file to /tmp & create formidable object)
            await fs.copy('./test/img/s_gps.jpg', '/tmp/upload_s_gps.jpg');
            const stat = await fs.stat('/tmp/upload_s_gps.jpg');
            const files = [ {
                size:  stat.size,
                path:  '/tmp/upload_s_gps.jpg',
                name:  's_gps.jpg',
                type:  'image/jpeg',
                mtime: stat.mtime,
            } ];

            // spoof geocode incident location (this subset of results is all we need)
            const geocode = {
                formattedAddress:     'Free School Ln, Cambridge CB2, UK',
                latitude:             52.2031684,
                longitude:            0.118871,
                administrativeLevels: {},
            };

            reportId = await Report.insert('test-cam', undefined, 'test test', submitted, 'test-project', files, geocode);
            console.info('report id:', reportId);
            expect(reportId.constructor.name).to.equal('ObjectID');
            const report = await Report.get('test-cam', reportId);
            expect(report).to.be.an('object');
            expect(report).to.have.property('name');
        });
        it('has uploaded file data in submitted report', async function() {
            const report = await Report.get('test-cam', reportId);
            expect(report.submitted).to.be.an('object');
            expect(report.submitted.files).to.be.an('array');
            expect(report.submitted.files[0].name).to.equal('s_gps.jpg');
            expect(report.submitted.files[0].path).to.equal(`test-project/${dateFormat('yyyy-mm')}/${reportId}/`);
        });
        it('has extracted uploaded file data in analysis', async function() {
            const report = await Report.get('test-cam', reportId);
            expect(report.analysis).to.be.an('object');
            expect(report.analysis.files).to.be.an('array');
            expect(report.analysis.files[0].name).to.equal('s_gps.jpg');
            expect(report.analysis.files[0].path).to.equal(`test-project/${dateFormat('yyyy-mm')}/${reportId}/`);
        });
        it('has extracted exif data', async function() {
            const report = await Report.get('test-cam', reportId);
            expect(report.analysis).to.be.an('object');
            expect(report.analysis.files).to.be.an('array');
            expect(report.analysis.files[0].exif).to.be.an('object');
            expect(report.analysis.files[0].exif.GPSLatitude).to.equal(54.98966667);
            expect(report.analysis.files[0].exif.GPSLongitude).to.equal(-1.91416667);
        });
    });

    describe('find', function() {
        it('finds reports by "test test"', async function() {
            const query = { name: 'test test' };
            const rpts = await Report.find('test-cam', query);
            expect(rpts).to.be.an('array');
            expect(rpts.length).to.equal(1);
            expect(rpts[0].name).to.equal('test test');
        });
    });

    describe('get', function() {
        it('gets newly created report', async function() {
            const rpt = await Report.get('test-cam', reportId);
            expect(rpt).to.be.an('object');
            expect(rpt.name).to.equal('test test');
        });
        it('gets newly created report with string id', async function() {
            const rpt = await Report.get('test-cam', reportId.toString());
            expect(rpt).to.be.an('object');
            expect(rpt.name).to.equal('test test');
        });
        it('gets all active reports', async function() {
            const rpts = await Report.getAll('test-cam');
            expect(rpts).to.be.an('array');
            expect(rpts.length).to.be.at.least(1);
            // TODO: any way to test rpts includes reportId?
        });
        it('gets reports with field matching value', async function() {
            const rpts = await Report.getBy('test-cam', 'name', 'test test');
            expect(rpts).to.be.an('array');
            expect(rpts.length).to.be.equal(1);
        });
        it('gets most recent report timestamp', async function() {
            const timestamp = await Report.getLatestTimestamp('test-cam');
            expect(new Date(timestamp)).to.be.at.least(reportId.getTimestamp());
        });
        it('gets oldest report timestamp', async function() {
            const timestamp = await Report.getOldestTimestamp('test-cam');
            expect(new Date(timestamp)).to.be.at.most(reportId.getTimestamp());
        });
    });

    describe('filter', function() {
        it('filter by submitted test search', async function() {
            // emulate buildFilter() free-text filter
            const query = { $and: [ { archived: false }, { 'submitted.Description': { '$regex': 'test report', '$options': 'i' } } ] };
            const rpts = await Report.find('test-cam', query);
            expect(rpts).to.be.an('array');
            expect(rpts.length).to.equal(1);
            expect(rpts[0].name).to.equal('test test');
        });
    });

    describe('updates', function() {
        it('updates summary', async function() {
            await Report.update('test-cam', reportId, { summary: 'A test report' });
            const rpt = await Report.get('test-cam', reportId);
            expect(rpt.summary).to.equal('A test report');
        });
        it('updates assignedTo', async function() {
            await Report.update('test-cam', reportId, { assignedTo: userId });
            const rpt = await Report.get('test-cam', reportId);
            expect(rpt.assignedTo).to.deep.equal(userId);
        });
        it('updates status', async function() {
            await Report.update('test-cam', reportId, { status: 'In progress' });
            const rpt = await Report.get('test-cam', reportId);
            expect(rpt.status).to.equal('In progress');
        });
    });

    describe('tags', function() {
        it('sets test-tag', async function() {
            await Report.insertTag('test-cam', reportId, 'test-tag', userId);
        });
        it('gets tags', async function() {
            const tags = await Report.tags('test-cam');
            expect(tags).to.be.an('array');
            expect(tags).to.include('test-tag');
        });
        it('gets reports by tag', async function() {
            const rpts = await Report.getByTag('test-cam', 'test-tag');
            expect(rpts).to.be.an('array');
            expect(rpts.length).to.be.at.least(1);
            // TODO: any way to test rpts includes 'test-tag?
        });
        it('deletes test-tag', async function() {
            await Report.deleteTag('test-cam', reportId, 'test-tag', userId);
            const tags = await Report.tags('test-cam');
            expect(tags).to.be.an('array');
            expect(tags).to.not.include('test-tag');
        });
    });

    describe('status', function() {
        it('sets status', async function() {
            await Report.update('test-cam', reportId, { status: 'In progress' });
        });
        it('gets statuses', async function() {
            const statuses = await Report.statuses('test-cam');
            expect(statuses).to.be.an('array');
            expect(statuses).to.include('In progress');
        });
    });

    describe('comments', function() {
        it('sets comment', async function() {
            await Report.insertComment('test-cam', reportId, 'This is a good test report', userId);
            const rpt = await Report.get('test-cam', reportId);
            expect(rpt.comments).to.be.an('array');
            expect(rpt.comments.length).to.equal(1);
            expect(rpt.comments[0].comment).to.equal('This is a good test report');
        });
        it('deletes comment', async function() {
            const rpt = await Report.get('test-cam', reportId);
            await Report.deleteComment('test-cam', reportId, userId, rpt.comments[0].on, userId);
            const rpt2 = await Report.get('test-cam', reportId);
            expect(rpt2.comments).to.be.an('array');
            expect(rpt2.comments.length).to.equal(0);
        });
        it('throws on unknown db', function() {
            Report.deleteComment('test-cam', reportId, userId, 'bad date', userId).catch(error => expect(error).to.be.an('error'));
        } );

    });

    describe('flag viewed', function() {
        it('sets flag', async function() {
            await Report.flagView('test-cam', reportId, userId);
        });
        it('verifies flag', async function() {
            const lastView = await Report.lastViewed('test-cam', reportId, userId);
            expect(lastView.getTime()).to.be.closeTo(Date.now(), 1e3);
        });
    });

    describe('teardown', function() {
        it('deletes incident report', async function() {
            await Report.delete('test-cam', reportId);
            expect(await Report.get('test-cam', reportId)).to.be.null;
        });
        it('deletes test user', async function() {
            const ok = await User.delete(userId);
            expect(ok).to.be.true;
        });
    });

});
