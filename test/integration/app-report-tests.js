/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Report app integration/acceptance tests.                                   C.Veness 2017-2018  */
/*                                                                                                */
/* These tests require report.thewhistle.local & admin.thewhistle.local to be set in /etc/hosts.  */
/*                                                                                                */
/* AWS Free Tier is just 2,000 put requests per month, so tests involving file upload are limited */
/* to CI tests. To run these locally set environment variable CIRCLECI to true.                   */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import supertest    from 'supertest';  // SuperAgent driven library for testing HTTP servers
import { expect }   from 'chai';       // BDD/TDD assertion library
import { JSDOM }    from 'jsdom';      // JavaScript implementation of DOM and HTML standards
import { ObjectId } from 'mongodb';    // MongoDB driver for Node.js
import dateFormat   from 'dateformat'; // Steven Levithan's dateFormat()

import app from '../../app.js';

const testuser = process.env.TESTUSER; // note testuser ‘tester‘ must have access to ‘grn-test’ organisation
const testpass = process.env.TESTPASS; // (for admin login test)

const org = 'grn-test';         // the test organisation for the live ‘grn‘ organisation
const proj = 'rape-is-a-crime'; // GRN's only project


const appAdmin = supertest.agent(app.listen()).host('admin.thewhistle.local');
const appReport = supertest.agent(app.listen()).host('report.thewhistle.local');

describe(`Report app (${org}/${app.env})`, function() {
    this.timeout(10e3); // 10 sec
    this.slow(250);

    let reportId = null;
    let sessionId = null;
    const imgFldr = 'test/img/';
    const imgFile = 's_gps.jpg';
    let notificationId = null;
    let nNotifications = 0;

    before(async function() {
        // check testuser 'tester' exists and has access to ‘grn-test’ org (only)
        const responseUsr = await appAdmin.get(`/ajax/login/databases?user=${testuser}`);
        if (!responseUsr.body.databases.includes(org)) throw new Error(`${testuser} must have access to ‘${org}’ org`);

        // force db connection to ‘grn-test‘ db (ajax calls don't)
        const responseGrnRpt = await appReport.get(`/${org}/${proj}`);
        if (responseGrnRpt.status != 200) throw new Error(`${org}/${proj} not found`);

        // check previous test report deleted
        const responseTestRpt = await appReport.get(`/ajax/${org}/aliases/testy+terrain`);
        if (responseTestRpt.status != 404) throw new Error('Previous test report was not deleted');
    });

    describe('report app home page shows ‘The Whistle - Reports’ page', function() {
        it('sees home page', async function() {
            const response = await appReport.get('/');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('h3').textContent).to.equal('The Whistle - Reports'); // H3 !!
        });
    });

    describe('404s', function() {
        it('fails on bad org’n', async function() {
            const response = await appReport.get('/no-such-organisation');
            expect(response.status).to.equal(404);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal(':(');
        });

        it('fails on bad org’n/project', async function() {
            const response = await appReport.get('/no-such-organisation/no-such-project');
            expect(response.status).to.equal(404);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal(':(');
        });

        it('fails on bad org’n/project/page', async function() {
            const response = await appReport.get('/no-such-organisation/no-such-project/1');
            expect(response.status).to.equal(404);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal(':(');
        });

        it('fails on bad project', async function() {
            const response = await appReport.get(`/${org}/no-such-project`);
            expect(response.status).to.equal(404);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal(':(');
        });

        it('fails on bad page', async function() {
            const response = await appReport.get(`/${org}/${proj}/no-such-page`);
            expect(response.status).to.equal(404);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal(':(');
        });

        it('ajax: returns 404 for unrecognised project', async function() {
            const response = await appReport.get('/ajax/no-such-project');
            expect(response.status).to.equal(404);
        });

        it('ajax: returns 404 for unrecognised function', async function() {
            const response = await appReport.get(`/ajax/${org}/no-such-function`);
            expect(response.status).to.equal(404);
        });
    });

    describe(`${org}/${proj} inaccessible pages`, function() {
        it('request for page 2 gets redirected to page 1', async function() {
            // (note before() has already opened index page, so we go back to p1 rather than index
            const response = await appReport.get(`/${org}/${proj}/2`);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal(`/${org}/${proj}/1`);
        });
    });

    describe(`${org}/${proj}`, function() {
        it('sees home page & starts submission', async function() {
            const responseGet = await appReport.get(`/${org}/${proj}`);
            expect(responseGet.status).to.equal(200);
            const document = new JSDOM(responseGet.text).window.document;
            expect(document.querySelector('title').textContent).to.equal('The Whistle / Global Rights Nigeria Incident Report');
            expect(document.querySelector('button[name=nav-next]').textContent.trim()).to.equal('Get started');

            const values = { 'nav-next': 'next' };
            const responsePost = await appReport.post(`/${org}/${proj}`).send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal(`/${org}/${proj}/1`);
        });

        it('ajax: gets a new random alias', async function() {
            const response = await appReport.get(`/ajax/${org}/aliases/new`);
            expect(response.status).to.equal(200);
            expect(response.body.alias.split(' ')).to.have.lengthOf(2);
        });

        it('ajax: checks ‘testy terrain’ is not already used', async function() {
            const response = await appReport.get(`/ajax/${org}/aliases/testy+terrain`);
            expect(response.status).to.equal(404);
        });

        it('sees/submits page 1 (alias)', async function() {
            const responseGet = await appReport.get(`/${org}/${proj}/1`);
            expect(responseGet.status).to.equal(200);
            const document = new JSDOM(responseGet.text).window.document;
            expect(document.querySelectorAll('input')).to.have.lengthOf(4);
            expect(document.querySelector('button[name=nav-next]').textContent.trim()).to.equal('Submit and continue');

            const values = {
                'used-before-existing-alias':  '',
                'used-before':                 'No',
                'used-before-generated-alias': 'testy terrain',
                'nav-next':                    'next',
            };
            const responsePost = await appReport.post(`/${org}/${proj}/1`).send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal(`/${org}/${proj}/2`);
            reportId = responsePost.headers['x-insert-id'];
            sessionId = responsePost.headers['x-session-id'];
            console.info('\treport id', reportId, sessionId);
        });

        it('sees/submits page 2 (on-behalf-of)', async function() {
            const responseGet = await appReport.get(`/${org}/${proj}/2`);
            expect(responseGet.status).to.equal(200);
            const document = new JSDOM(responseGet.text).window.document;
            expect(document.querySelectorAll('input')).to.have.lengthOf(6);
            expect(document.querySelector('button[name=nav-next]').textContent.trim()).to.equal('Submit and continue');

            const values = {
                'on-behalf-of':    'Myself',
                'survivor-gender': 'Female',
                'survivor-age':    '20–24',
                'nav-next':        'next',
            };
            const responsePost = await appReport.post(`/${org}/${proj}/2`).send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal(`/${org}/${proj}/3`);
        });

        it('doesn’t allow access beyond next page', async function() {
            const response = await appReport.get(`/${org}/${proj}/4`);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal(`/${org}/${proj}/3`);
        });

        it('doesn’t allow post beyond next page', async function() {
            const response = await appReport.post(`/${org}/${proj}/4`).send({});
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal(`/${org}/${proj}/3`);
        });

        it('sees/submits page 3 (when)', async function() {
            const responseGet = await appReport.get(`/${org}/${proj}/3`);
            expect(responseGet.status).to.equal(200);
            const document = new JSDOM(responseGet.text).window.document;
            expect(document.querySelectorAll('input')).to.have.lengthOf(7);
            expect(document.querySelectorAll('select')).to.have.lengthOf(5);
            expect(document.querySelector('button[name=nav-next]').textContent.trim()).to.equal('Submit and continue');

            const d = new Date(Date.now() - 1000*60*60*24); // yesterday in case of early-morning run affecting weather rpts
            const values = {
                'when':            'Yes, exactly when it happened',
                'date.day':        dateFormat(d, 'd'),
                'date.month':      dateFormat(d, 'mmm'),
                'date.year':       dateFormat(d, 'yyyy'),
                'date.time':       '',
                'within-options':  '',
                'still-happening': 'No',
                'nav-next':        'next',
            };
            const responsePost = await appReport.post(`/${org}/${proj}/3`).send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal(`/${org}/${proj}/4`);
        });

        it('sees/submits page 4 (where)', async function() {
            const responseGet = await appReport.get(`/${org}/${proj}/4`);
            expect(responseGet.status).to.equal(200);
            const document = new JSDOM(responseGet.text).window.document;
            expect(document.querySelectorAll('select')).to.have.lengthOf(1);
            expect(document.querySelectorAll('textarea')).to.have.lengthOf(1); // subsidiary
            expect(document.querySelectorAll('input')).to.have.lengthOf(1);    // skip
            expect(document.querySelector('button[name=nav-next]').textContent.trim()).to.equal('Submit and continue');

            const values = {
                'where':         'Neighbourhood',
                'where-details': 'Around the corner',
                'nav-next':      'next',
            };
            const responsePost = await appReport.post(`/${org}/${proj}/4`).send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal(`/${org}/${proj}/5`);
        });

        it('sees/submits page 5 (who)', async function() {
            const responseGet = await appReport.get(`/${org}/${proj}/5`);
            expect(responseGet.status).to.equal(200);
            const document = new JSDOM(responseGet.text).window.document;
            expect(document.querySelectorAll('input')).to.have.lengthOf(3);
            expect(document.querySelectorAll('textarea')).to.have.lengthOf(2);
            expect(document.querySelector('button[name=nav-next]').textContent.trim()).to.equal('Submit and continue');

            const values = {
                'who-relationship': '',
                'who':              'Not known',
                'who-description':  'Big fat guy',
                'nav-next':         'next',
            };
            const responsePost = await appReport.post(`/${org}/${proj}/5`).send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal(`/${org}/${proj}/6`);
        });

        it('sees/submits page 6 (description)', async function() {
            const responseGet = await appReport.get(`/${org}/${proj}/6`);
            expect(responseGet.status).to.equal(200);
            const document = new JSDOM(responseGet.text).window.document;
            expect(document.querySelectorAll('textarea')).to.have.lengthOf(1); // description
            expect(document.querySelectorAll('input')).to.have.lengthOf(13);   // file selector, skip, applicable × 11
            expect(document.querySelector('button[name=nav-next]').textContent.trim()).to.equal('Submit and continue');

            const values = {
                'description': 'Submission test',
                'nav-next':    'next',
            };
            const responsePost = await appReport.post(`/${org}/${proj}/6`).send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal(`/${org}/${proj}/7`);
        });

        it('sees/submits page 7 (action-taken)', async function() {
            const responseGet = await appReport.get(`/${org}/${proj}/7`);
            expect(responseGet.status).to.equal(200);
            const document = new JSDOM(responseGet.text).window.document;
            expect(document.querySelectorAll('input')).to.have.lengthOf(11);
            expect(document.querySelector('button[name=nav-next]').textContent.trim()).to.equal('Submit and continue');

            const values = {
                'action-taken':                      [ 'Teacher/tutor/lecturer', 'Friends, family' ],
                'action-taken-police-details':       '',
                'action-taken-organisation-details': '',
                'action-taken-teacher-details':      '',
                'action-taken-friends-details':      '',
                'action-taken-others-details':       '',
                'nav-next':                          'next',
            };
            const responsePost = await appReport.post(`/${org}/${proj}/7`).send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal(`/${org}/${proj}/8`);
        });

        it('sees page 8 & goes back to page 7', async function() {
            const responseGet = await appReport.get(`/${org}/${proj}/8`);
            expect(responseGet.status).to.equal(200);
            const document = new JSDOM(responseGet.text).window.document;
            expect(document.querySelectorAll('textarea')).to.have.lengthOf(1);
            expect(document.querySelector('button[name=nav-next]').textContent.trim()).to.equal('Submit and continue to Resources');

            const values = {
                'nav-prev': 'prev',
            };
            const responsePost = await appReport.post(`/${org}/${proj}/8`).send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal(`/${org}/${proj}/7`);
        });

        it('sees page 6 (description) & submits corrected description with file', async function() {
            const responseGet = await appReport.get(`/${org}/${proj}/6`);
            expect(responseGet.status).to.equal(200);
            const document = new JSDOM(responseGet.text).window.document;
            expect(document.querySelectorAll('textarea')).to.have.lengthOf(1); // description
            expect(document.querySelectorAll('input')).to.have.lengthOf(13);   // file selector, skip, applicable × 11
            expect(document.querySelector('button[name=nav-next]').textContent.trim()).to.equal('Submit and continue');
            expect(document.querySelector('textarea').textContent).to.equal('Submission test');

            if (!process.env.CIRCLECI) return; // AWS Free Tier is just 2,000 put requests per month, so limit to CI tests

            const values = {
                'description': 'Submission test',
                'nav-next':    'next',
            };
            // superagent doesn't allow request.attach() to be used with request.send(), so instead use request.field()
            const responsePost = await appReport.post(`/${org}/${proj}/6`)
                .field('description', values['description'])
                .field('nav-next', values['nav-next'])
                .attach('documents', imgFldr+imgFile);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal(`/${org}/${proj}/7`);
        });

        it('sees whatnext page', async function() {
            const response = await appReport.get(`/${org}/${proj}/whatnext`);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent.trim()).to.equal('✔ We’ve received your report');
            expect(document.querySelectorAll('tr')).to.have.lengthOf(0); // local resources
        });

        it('ajax: fails to geocode bad address', async function() {
            const response = await appReport.get('/ajax/geocode?address=this+address+doesnt+have+a+location');
            expect(response.status).to.equal(404);
        });

        it('ajax: geocodes address', async function() {
            const response = await appReport.get('/ajax/geocode?address=university+of+lagos,+nigeria');
            expect(response.status).to.equal(200);
            //expect(response.body.formattedAddress).to.equal('Akoka, Lagos, Nigeria');
        });

        it('ajax: geocodes address using CORS (canonical)', async function() {
            const response = await appReport.get('/ajax/geocode?address=university+of+lagos,+nigeria').set('Origin', 'http://rapeisacrime.org');
            expect(response.status).to.equal(200);
            //expect(response.body.formattedAddress).to.equal('Akoka, Lagos, Nigeria');
            expect(response.headers['access-control-allow-origin']).to.equal('http://rapeisacrime.org');
        });

        it('ajax: geocodes address using CORS (www)', async function() {
            const response = await appReport.get('/ajax/geocode?address=university+of+lagos,+nigeria').set('Origin', 'http://www.rapeisacrime.org');
            expect(response.status).to.equal(200);
            expect(response.headers['access-control-allow-origin']).to.equal('http://www.rapeisacrime.org');
        });

        it('ajax: geocodes address using CORS (https)', async function() {
            const response = await appReport.get('/ajax/geocode?address=university+of+lagos,+nigeria').set('Origin', 'https://rapeisacrime.org');
            expect(response.status).to.equal(200);
            expect(response.headers['access-control-allow-origin']).to.equal('https://rapeisacrime.org');
        });

        it('ajax: fails to geocode address with invalid Origin header', async function() {
            const response = await appReport.get('/ajax/geocode?address=university+of+lagos,+nigeria').set('Origin', 'http://somerandomsite.com');
            expect(response.status).to.equal(200);
            expect(response.headers['access-control-allow-origin']).to.be.undefined;
        });

        it('ajax: fails to geocode address without Origin header', async function() {
            const response = await appReport.get('/ajax/geocode?address=university+of+lagos,+nigeria');
            expect(response.status).to.equal(200);
            expect(response.headers['access-control-allow-origin']).to.be.undefined;
        });

        it('sees whatnext resources', async function() {
            const response = await appReport.get(`/${org}/${proj}/whatnext?address=university+of+lagos,+nigeria`);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent.trim()).to.equal('✔ We’ve received your report');
        });

        it('gets PDF of report', async function() {
            const response = await appReport.get(`/${org}/${proj}/pdf/${sessionId}`);
            expect(response.status).to.equal(200);
            expect(response.headers['content-type']).to.equal('application/pdf');
            const re = /attachment; filename="the whistle incident report grn-test rape-is-a-crime \d\d\d\d-\d\d-\d\d \d\d.\d\d.pdf/;
            expect(response.headers['content-disposition']).to.match(re);
        });

        it('submits whatnext "back to start"', async function() {
            const values = { 'submit': 'end' };
            const response = await appReport.post(`/${org}/${proj}/whatnext`).send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal(`/${org}/${proj}`);
        });
    });

    describe('submitted report in admin app', function() {
        it('redirects to /reports on login', async function() {
            const values = { username: testuser, password: testpass, database: org };
            const response = await appAdmin.post('/login/reports').send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/reports');
        });

        it('sees notification details of new submission', async function() {
            const response = await appAdmin.get('/ajax/notifications');
            expect(response.status).to.equal(200);
            expect(response.body.events['new report submitted']).to.be.an('array');
            expect(response.body.events['new report submitted'].length).to.be.at.least(1);
            const notfcn = response.body.events['new report submitted'].filter(n => n.rId == reportId);
            notificationId = notfcn[0].nId;
            nNotifications = response.body.events['new report submitted'].length;
        });

        it('dismisses notification', async function() {
            const response = await appAdmin.delete(`/ajax/notifications/${notificationId}`);
            expect(response.status).to.equal(200);
            nNotifications--;
        });

        it('sees notification is gone', async function() {
            const response = await appAdmin.get('/ajax/notifications');
            expect(response.status).to.equal(200);
            if (nNotifications == 0) expect(response.body.events['new report submitted']).to.be.undefined;
            if (nNotifications != 0) expect(response.body.events['new report submitted'].length).to.equal(nNotifications);
        });

        it('sees new report with nicely formatted information', async function() {
            const response = await appAdmin.get(`/reports/${reportId}`);
            expect(response.status).to.equal(200);
        });

        it('sees report in submissions page', async function() {
            const response = await appAdmin.get('/dev/submissions');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.getElementById(reportId).textContent).to.equal(reportId);
        });

        it('gets report page', async function() {
            const response = await appAdmin.get(`/reports/${reportId}`);
            expect(response.status).to.equal(200);
            // not much obvious to search for!
        });

        it('sees weather conditions in report page', async function() {
            return; // TODO investigate why wunderground is returning 400 Bad Request
            const response = await appAdmin.get('/reports/'+reportId); // eslint-disable-line no-unreachable
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            const iconRe = new RegExp('^/img/weather/underground/icons/black/png/32x32/[a-z]+.png$');
            expect(document.querySelector('#weather div.weather-body img').src).to.match(iconRe);
        });

        if (process.env.CIRCLECI) {
            it('fetches uploaded image from AWS S3', async function() {
                const src = `/uploaded/${proj}/${dateFormat('yyyy-mm')}/${reportId}/${imgFile}`;
                const response = await appAdmin.get(src);
                expect(response.status).to.equal(200);
                expect(response.headers['content-type']).to.equal('image/jpeg');
            });
        }

        if (process.env.CIRCLECI) {
            it('sees uploaded image in report page', async function() {
                const response = await appAdmin.get(`/reports/${reportId}`);
                expect(response.status).to.equal(200);
                const document = new JSDOM(response.text).window.document;
                const src = `/uploaded/${proj}/${dateFormat('yyyy-mm')}/${reportId}/${imgFile}`;
                expect(document.getElementById(imgFile).querySelector('td a').href).to.equal(src);
                expect(document.getElementById(imgFile).querySelector('td img').src).to.equal(src);
            });
        }

        it('gets address for Heddon-on-the-Wall (close to test photo) (ajax)', async function() {
            const response = await appAdmin.get('/ajax/geocode?address=Heddon-on-the-Wall');
            expect(response.status).to.equal(200);
            expect(response.body.formattedAddress).to.equal('Heddon-on-the-Wall, UK');
        });

        /* it('sets report location to Heddon-on-the-Wall (ajax)', async function() {
            const values = { address: 'Heddon-on-the-Wall' };
            const response = await appAdmin.put(`/ajax/reports/${reportId}/location`).send(values);
            expect(response.status).to.equal(200);
        }); */

        if (process.env.CIRCLECI) {
            /* it('sees uploaded image exif metadata in report page', async function() {
                const response = await appAdmin.get('/reports/'+reportId);
                expect(response.status).to.equal(200);
                const document = new JSDOM(response.text).window.document;
                const distRe = new RegExp('^7.2 km W from incident location');
                expect(document.getElementById(imgFile).querySelector('td.exif div').textContent).to.match(distRe);
                // note don't bother checking time as it will change in future
            }); */
        }

        it('gets timestamp of new report (ajax)', async function() {
            const response = await appAdmin.get('/ajax/reports/latest-timestamp');
            expect(response.status).to.equal(200);
            expect(response.body.latest.timestamp).to.equal(ObjectId(reportId).getTimestamp().toISOString());
        });

        it('gets reports in bounding box (ajax)', async function() {
            /* const response = await appAdmin.get('/ajax/reports/within/54.9,-1.9:55.1,-1.7');
            expect(response.status).to.equal(200);
            expect(response.body.reports.filter(r => r._id == reportId).length).to.equal(1); */
        });

        it('sees ‘testy terrain’ alias is used (ajax)', async function() {
            const response = await appReport.get(`/ajax/${org}/aliases/testy+terrain`);
            expect(response.status).to.equal(200);
        });

        // TODO: can 'org' element of url be inferred from header credentials?
        it('sees unused alias is not used (ajax)', async function() {
            const response = await appReport.get(`/ajax/${org}/aliases/no+way+this+should+be+a+used+alias`);
            expect(response.status).to.equal(404);
        });

        it('deletes submitted incident report', async function() {
            const response = await appAdmin.post(`/reports/${reportId}/delete`).send();
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/reports');
        });

        if (process.env.CIRCLECI) {
            it('no longer sees submitted file in AWS S3', async function() {
                const src = `/uploaded/${proj}/${dateFormat('yyyy-mm')}/${reportId}/${imgFile}`;
                const response = await appReport.get(src);
                expect(response.status).to.equal(404);
            });
        }
    });

    describe('single page report submission', function() {
        // note app-admin-tests has same single-page report submission, but then does various admin functions
        const report = `/${org}/${proj}/*`;

        // supertest doesn't appear to be able to pass koa:jwt cookie between apps running on
        // different ports, so log in explicitly to emulate browser behaviour
        it('logs in to report app (supertest doesn’t share login)', async function() {
            const values = { username: testuser, password: testpass, database: org, 'remember-me': 'on' };
            const response = await appReport.post(`/${org}/${proj}/login`).send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal(`/${org}/${proj}`);
        });

        it('sees report submission page', async function() {
            const response = await appReport.get(report);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('title').textContent).to.equal('The Whistle / Global Rights Nigeria Incident Report');
            expect(document.querySelector('li.name').textContent).to.equal('tester');
        });

        it('posts report details', async function() {
            const d = new Date(Date.now() - 1000*60*60*24); // yesterday in case of early-morning run affecting weather rpts
            const values = {
                'used-before':                  'No',
                'used-before-existing-alias':   '',
                'used-before-generated-alias':  'testy terrain',
                'on-behalf-of':                 'Myself',
                'survivor-gender':              'Female',
                'survivor-age':                 '20–24',
                'when':                         'Yes, exactly when it happened',
                'date.day':                     dateFormat(d, 'd'),
                'date.month':                   dateFormat(d, 'mmm'),
                'date.year':                    dateFormat(d, 'yyyy'),
                'date.time':                    '',
                'within-options':               '',
                'still-happening':              'No',
                'where':                        'Neighbourhood',
                'where-details':                'Around the corner',
                'who':                          'Not known',
                'who-relationship':             '',
                'who-description':              'Big fat guy',
                'description':                  'Single-page submission test',
                'action-taken':                 [ 'Teacher/tutor/lecturer', 'Friends, family' ],
                'action-taken-teacher-details': '',
                'action-taken-friends-details': '', // skip other 'action-taken' details!
                'extra-notes':                  '',
                'contact-email':                'help@me.com',
                'contact-phone':                '01234 123456',
                'nav-next':                     'next',
            };
            const response = await appReport.post(report).send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal(`/${org}/${proj}/whatnext`);
            reportId = response.headers['x-insert-id'];
            sessionId = response.headers['x-session-id'];
            console.info('\treport id', reportId, sessionId);
        });

        it('sees whatnext page', async function() {
            const response = await appReport.get(`/${org}/${proj}/whatnext`);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent.trim()).to.equal('✔ We’ve received your report');
            expect(document.querySelectorAll('tr')).to.have.lengthOf(0); // local resources
        });

        it('sees whatnext resources', async function() {
            const response = await appReport.get(`/${org}/${proj}/whatnext?address=university+of+lagos`);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent.trim()).to.equal('✔ We’ve received your report');
        });
    });

    describe('single page report in admin app', function() {
        it('sees new report with nicely formatted information', async function() {
            const response = await appAdmin.get(`/reports/${reportId}`);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            const reportInfo = document.querySelector('table.js-obj-to-html');
            // convert NodeLists to arrays...
            const ths = Array.from(reportInfo.querySelectorAll('th'));
            const tds = Array.from(reportInfo.querySelectorAll('td'));
            // ... so we can build an easy comparison object
            const actual = {};
            for (let t=0; t<ths.length; t++) actual[ths[t].textContent] = tds[t].textContent;
            const d = new Date(Date.now() - 1000*60*60*24);
            const expected = {
                'Alias':              'testy terrain',
                'On behalf of':       'Myself',
                'Survivor gender':    'Female',
                'Survivor age':       '20–24',
                'Happened':           dateFormat(d, 'd mmm yyyy'),
                'Still happening?':   'No',
                'Where':              'Neighbourhood (Around the corner)',
                'Who':                'Not known (Big fat guy)',
                'Description':        'Single-page submission test',
                'Spoken to anybody?': 'Teacher/tutor/lecturer; Friends, family',
                'E-mail address':     'help@me.com',
                'Phone number':       '01234 123456',
            };
            expect(actual).to.deep.equal(expected);
        });

        it('deletes submitted incident report', async function() {
            const response = await appAdmin.post(`/reports/${reportId}/delete`).send();
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/reports');
        });
    });
});
