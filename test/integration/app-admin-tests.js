/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Admin app integration/acceptance tests.                                    C.Veness 2017-2018  */
/*                                                                                                */
/* These tests require admin.thewhistle.local & report.thewhistle.local to be set in /etc/hosts.  */
/*                                                                                                */
/* Note that running this test will contribute to Weather Underground API invocation limits.      */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

// TODO: modularise this? How to handle login/logout if so?

import supertest          from 'supertest';          // SuperAgent driven library for testing HTTP servers
import { expect }         from 'chai';               // BDD/TDD assertion library
import { JSDOM }          from 'jsdom';              // JavaScript implementation of DOM and HTML standards
import { ObjectId }       from 'mongodb';            // MongoDB driver for Node.js
import dateFormat         from 'dateformat';         // Steven Levithan's dateFormat()
import base64             from 'base-64';            // base64 encoder/decoder
import fs         from 'fs';         // nodejs.org/api/fs.html
import csvParse           from 'csv-parse/lib/sync'; // full featured CSV parser

import app from '../../app.js';

const testuser = process.env.TESTUSER; // note testuser ‘tester‘ must have access to ‘grn-test’ organisation
const testpass = process.env.TESTPASS; // (for admin login test)

const org = 'grn-test';         // the test organisation for the live ‘grn‘ organisation
const proj = 'rape-is-a-crime'; // GRN's only project


const appAdmin = supertest.agent(app.listen()).host('admin.thewhistle.local');
const appReport = supertest.agent(app.listen()).host('report.thewhistle.local');

// note that document.querySelector() works with CSS ids which are more restrictive than HTML5 ids,
// so getElementById() has to be used to find ObjectId ids instead of querySelector()

describe(`Admin app (${org}/${app.env})`, function() {
    this.timeout(80e3); // 10 sec
    this.slow(250);

    before(async function() {
        // check testuser 'tester' exists and has access to ‘grn-test’ org
        const responseUsr = await appAdmin.get(`/ajax/login/databases?user=${testuser}`);
        if (!responseUsr.body.databases.includes(org)) throw new Error(`${testuser} must have access to ‘${org}’ org`);

        // check previous test user deleted
        const responseTestUsr = await appAdmin.get('/ajax/login/databases?user=test@user.com');
        if (responseTestUsr.body.databases.length != 0) throw new Error('Previous test user was not deleted');

        // login to set up db connection to ‘grn-test’ db
        const values = { username: testuser, password: testpass, 'remember-me': 'on' };
        await appAdmin.post('/login').send(values);

        // check previous test report deleted
        const responseTestRpt = await appReport.get(`/ajax/${org}/aliases/testy+terrain`);
        if (responseTestRpt.status != 404) throw new Error('Previous test report was not deleted');

        await appAdmin.get('/logout');
    });

    describe('password reset', function() {
        let resetToken = null;

        it('sees password reset page', async function() {
            const response = await appAdmin.get('/password/reset-request');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('input').name).to.equal('email');
        });

        it('makes password reset request', async function() {
            const response = await appAdmin.post('/password/reset-request').send({ email: testuser });
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/password/reset-request-confirm');
            resetToken = response.headers['x-reset-token'];
            console.info('\treset token', resetToken);
            // any way to test e-mail gets sent?
        });

        it('sees password reset request confirmation page', async function() {
            const response = await appAdmin.get('/password/reset-request-confirm');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('title').textContent).to.equal('Reset password request');
        });

        it('sees password reset page', async function() {
            const response = await appAdmin.get(`/password/reset/${resetToken}`);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('input').name).to.equal('password');
        });

        it('throws out invalid token', async function() {
            const response = await appAdmin.get('/password/reset/not-a-good-token');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('p').textContent).to.equal('This password reset link is either invalid, expired, or previously used.');
        });

        it('throws out expired token', async function() {
            const [ timestamp, hash ] = resetToken.split('-');
            const expiredTimestamp = (parseInt(timestamp, 36) - 60*60*24 - 1).toString(36);
            const response = await appAdmin.get(`/password/reset/${expiredTimestamp}-${hash}`);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('p').textContent).to.equal('This password reset link is either invalid, expired, or previously used.');
        });

        it('throws out token with valid timestamp but invalid hash', async function() {
            // the token is a timestamp in base36 and a hash separated by a hyphen
            const [ timestamp ] = resetToken.split('-'); // (we don't need the hash here)
            const response = await appAdmin.get(`/password/reset/${timestamp}-abcdefgh`);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('p').textContent).to.equal('This password reset link is either invalid, expired, or previously used.');
        });

        it('chokes on different passwords', async function() {
            const values = { password: testpass, passwordConfirm: 'definitely-no-the-correct-password' };
            const response = await appAdmin.post(`/password/reset/${resetToken}`).send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal(`/password/reset/${resetToken}`);
        });

        it('resets password', async function() {
            const values = { password: testpass, passwordConfirm: testpass };
            const response = await appAdmin.post(`/password/reset/${resetToken}`).send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/password/reset/confirm');
        });

        it('sees password reset confirmation page', async function() {
            const response = await appAdmin.get('/password/reset/confirm');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('title').textContent).to.equal('Reset password');
        });
    });

    describe('login', function() {
        let location = null;

        it('forbids access to reports when not logged-in', async function() {
            const response = await appAdmin.get('/reports');
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/login/reports');
        });

        it('redirects home page to login page when not logged in', async function() {
            const response = await appAdmin.get('/');
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/login');
        });

        it('has login page with login fields when not logged-in', async function() {
            const response = await appAdmin.get('/login');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelectorAll('input')).to.have.lengthOf(3);
        });

        it('login page shows org’s for testuser', async function() {
            const response = await appAdmin.get(`/login?user=${testuser}`);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelectorAll('input').length).to.be.at.least(4); // username, password, remember-me, db's
            expect(document.querySelector('input[name=username]').value).to.equal(testuser); // username prefilled
        });

        it('ajax: lists user databases', async function() {
            const response = await appAdmin.get(`/ajax/login/databases?user=${testuser}`);
            expect(response.status).to.equal(200);
            expect(response.body.databases.length).to.be.at.least(1);
            expect(response.body.databases).to.include(org);
        });

        it('shows e-mail/password not recognised on failed login', async function() {
            const values = { username: 'no-user-by-this-name', password: 'not-the-right-password' };
            const responsePost = await appAdmin.post('/login').send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal('/login');
            const responseGet = await appAdmin.get('/login');
            expect(responseGet.status).to.equal(200);
            const document = new JSDOM(responseGet.text).window.document;
            expect(document.querySelector('button').nextElementSibling.textContent).to.equal('E-mail / password not recognised');
        });

        it('logs in, and redirects to /', async function() {
            const values = { username: testuser, password: testpass, database: org, 'remember-me': 'on' };
            const response = await appAdmin.post('/login').send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/');
        });

        it('shows logged in user on login page when logged-in', async function() {
            const response = await appAdmin.get('/login');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('#name').textContent).to.equal('tester');
            expect(document.querySelector('#db').textContent).to.equal(org);
        });

        it('has home page with full nav links when logged-in', async function() {
            // get from location supplied by home redirecgt
            const res1 = await appAdmin.get('/');
            expect(res1.status).to.equal(302);
            location = res1.headers.location;
            const response = await appAdmin.get(location);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            //expect(document.querySelector('title').textContent).to.match(/.*Activity.+/); home page is temporarily list of reports
            expect(document.querySelector('title').textContent).to.equal('Reports list');
            // nav should be /, Reports, Form specs, Users, Resources, Submit – feedback, user-name, notifications, Logout
            expect(document.querySelectorAll('header nav > ul > li').length).to.equal(10);
            // 'Submit' menu should have entry linking to /grn-test/rape-is-a-crime
            expect(document.querySelector('header nav > ul > li ul li a').textContent).to.equal('The Whistle / Global Rights Nigeria Incident Report – Internal Form');
            const regexp = new RegExp(`${org}\\/${proj}\\/\\*$`);
            expect(document.querySelector('header nav > ul > li ul li a').href).to.match(regexp);
        });
    });

    describe('form specification', function() {
        let specId = null;

        const minimalSpec = `
title: Minimal form spec (non-functional, but will validate)

pages:
  index: { $ref: '#/index' }

index:
- text: Minimal validating form.
`;

        it('sees list form specs page', async function() {
            const response = await appAdmin.get('/form-specifications');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('.content-header').textContent).to.equal('Form Specifications');
        });

        it('sees add form spec page', async function() {
            const response = await appAdmin.get('/form-specifications/add');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal('Add Form specification');
        });

        it('adds minimal form spec', async function() {
            const values = { project: 'integration-test', page: '', specification: minimalSpec };
            const response = await appAdmin.post('/form-specifications/add').send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/form-specifications');
            specId = response.headers['x-insert-id'];
        });

        it('sees form spec in list form specs page', async function() {
            const response = await appAdmin.get('/form-specifications');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            const matches = document.evaluate('count(//td[text()="integration-test"])', document, null, 0, null);
            expect(matches.numberValue).to.equal(1);
        });

        it('deletes form spec', async function() {
            const response = await appAdmin.post(`/form-specifications/${specId}/delete`);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/form-specifications');
        });

        it('no longer sees form spec in list form specs page', async function() {
            const response = await appAdmin.get('/form-specifications');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            const matches = document.evaluate('count(//td[text()="integration-test"])', document, null, 0, null);
            expect(matches.numberValue).to.equal(0);
        });

    });

    describe('submit (internal single-page) incident report', function() {
        // note app-report-tests also does single-page submission, but this does various admin functions
        let reportId = null;
        let commentId = null;
        let notificationId = null;
        let testUserDetails = null;

        const imgFldr = 'test/img/';
        const imgFile = 's_gps.jpg';


        it('gets test user id from e-mail (ajax)', async function() {
            const response = await appAdmin.get(`/ajax/users?email=${testuser}`);
            expect(response.status).to.equal(200);
            testUserDetails = response.body.users[0];
        });

        // supertest doesn't appear to be able to pass koa:jwt cookie between apps running on
        // different ports, so log in explicitly to emulate browser behaviour
        it('logs in to report app (supertest doesn’t share login)', async function() {
            const values = { username: testuser, password: testpass, database: org, 'remember-me': 'on' };
            const response = await appReport.post(`/${org}/${proj}/login`).send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal(`/${org}/${proj}`);
        });

        it('sees new case intake page', async function() {
            const response = await appReport.get(`/${org}/${proj}/*`);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal('Have you used this anonymous reporting service before?');
        });

        it('reports new case intake invalid project', async function() {
            const response = await appReport.get(`/${org}/no-such-project/*`);
            expect(response.status).to.equal(404);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('p').textContent).to.match(/Submission form grn-test\/no-such-project not found./);
        });

        it('enters incident report', async function() {
            const d = new Date(Date.now() - 1000*60*60*24); // yesterday in case of early-morning run
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
                'description':                  'Admin submission test',
                'action-taken':                 [ 'Teacher/tutor/lecturer', 'Friends, family' ],
                'action-taken-teacher-details': '',
                'action-taken-friends-details': '', // skip other 'action-taken' details!
                'extra-notes':                  '',
                'contact-email':                'help@me.com',
                'contact-phone':                '01234 123456',
                'nav-next':                     'next',
            };
            // sadly, it seems that superagent doesn't allow request.attach() to be used with
            // request.send(), so instead we need to use request.field()
            const response = await appReport.post(`/${org}/${proj}/*`)
                .field('used-before',                  values['used-before'])
                .field('used-before-existing-alias',   values['used-before-existing-alias'])
                .field('used-before-generated-alias',  values['used-before-generated-alias'])
                .field('on-behalf-of',                 values['on-behalf-of'])
                .field('survivor-gender',              values['survivor-gender'])
                .field('survivor-age',                 values['survivor-age'])
                .field('when',                         values['when'])
                .field('date.day',                     values['date.day'])
                .field('date.month',                   values['date.month'])
                .field('date.year',                    values['date.year'])
                .field('date.time',                    values['date.time'])
                .field('within-options',               values['within-options'])
                .field('still-happening',              values['still-happening'])
                .field('where',                        values['where'])
                .field('where-details',                values['where-details'])
                .field('who',                          values['who'])
                .field('who-relationship',             values['who-relationship'])
                .field('who-description',              values['who-description'])
                .field('description',                  values['description'])
                .field('action-taken',                 values['action-taken'])
                .field('action-taken-teacher-details', values['action-taken-teacher-details'])
                .field('extra-notes',                  values['extra-notes'])
                .field('contact-email',                values['contact-email'])
                .field('contact-phone',                values['contact-phone'])
                .field('nav-next',                     values['nav-next'])
                .attach('documents', imgFldr+imgFile);
            expect(response.status).to.equal(302);
            const koaSession = base64.decode(response.headers['set-cookie'][0].match(/^koa:sess=([a-zA-Z0-9=.]+);.+/)[1]);
            const flash = JSON.parse(koaSession)['koa-flash'];
            expect(response.headers.location).to.equal(`/${org}/${proj}/whatnext`, 'Flash msg: '+flash.error);
            reportId = response.headers['x-insert-id'];
            console.info('\treport id', reportId);
        });

        it('gets new autogenerated alias (ajax)', async function() {
            const response = await appReport.get(`/ajax/${org}/aliases/new`);
            expect(response.status).to.equal(200);
            expect(response.body.alias.split(' ')).to.have.lengthOf(2);
        });

        it('sees whatnext page', async function() {
            const response = await appReport.get(`/${org}/${proj}/whatnext`);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent.trim()).to.equal('✔ We’ve received your report');
            expect(document.querySelectorAll('tr')).to.have.lengthOf(0); // local resources
        });

        it('has new report in list of reports', async function() {
            const response = await appAdmin.get('/reports');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.getElementById(reportId)).to.not.be.null;
        });

        it('sees notification details of new submission', async function() {
            const response = await appAdmin.get('/ajax/notifications');
            expect(response.status).to.equal(200);
            expect(response.headers['cache-control']).to.equal('no-cache, no-store, must-revalidate');
            expect(response.body.events['new report submitted']).to.be.an('array');
            expect(response.body.events['new report submitted'].length).to.be.at.least(1);
            const notfcn = response.body.events['new report submitted'].filter(n => n.rId == reportId);
            notificationId = notfcn[0].nId;
        });

        it('sees notification timestamp of new submission', async function() {
            // note the normal flow would be to check /ajax/notifications/last-update before
            // /ajax/notifications, but we can't validate the timestamp without having the
            // notification id
            const response = await appAdmin.get('/ajax/notifications/last-update');
            expect(response.status).to.equal(200);
            expect(response.headers['cache-control']).to.equal('no-cache, no-store, must-revalidate');
            expect(response.body.timestamp).to.equal(ObjectId(notificationId).getTimestamp().toISOString().slice(0, -5));
            // (unless someone else has slipped in a report in the test environment in the meantime!)
        });

        it('sees notification details of new submission in debug', async function() {
            // note it's hard to do robust tests using /ajax/notifications, as the  events[event]
            // array may or may not exist according to other notifications in test db, so use
            // /ajax/notifications/debug instead, which tells us abut whether notifications have
            // been recorded, even if it doesn't tell us whether they're being correctly reported
            // through the front-end
            const response = await appAdmin.get('/ajax/notifications/debug');
            const notfcnsForRpt = JSON.parse(response.text).filter(notfcns => notfcns.report == reportId);
            expect(notfcnsForRpt.length).to.equal(1);
            expect(notfcnsForRpt[0].event).to.equal('new report submitted');
        });

        it('dismisses notification', async function() {
            const response = await appAdmin.delete(`/ajax/notifications/${notificationId}`);
            expect(response.status).to.equal(200);
        });

        it('sees notification remains for other users but is gone for tester', async function() {
            // note this test expects other users than just Test Meister to have access to this db!
            const response = await appAdmin.get('/ajax/notifications/debug');
            expect(response.status).to.equal(200);
            const notfcnsForRpt = JSON.parse(response.text).filter(notfcns => notfcns.report == reportId);
            expect(notfcnsForRpt.length).to.equal(1); // remains for other users
            expect(notfcnsForRpt[0].event).to.equal('new report submitted');
            expect(notfcnsForRpt[0].users.filter(usr => usr.id == testUserDetails._id).length).to.equal(0);
        });

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
                'Description':        'Admin submission test',
                'Applicable':         '—',
                'Spoken to anybody?': 'Teacher/tutor/lecturer; Friends, family',
                'Extra notes':        '—',
                'E-mail address':     'help@me.com',
                'Phone number':       '01234 123456',
            };
            expect(actual).to.deep.equal(expected);
        });

        it('sets location by geocoding address (ajax)', async function() {
            const values = { address: 'University of Lagos' };
            const response = await appAdmin.put(`/ajax/reports/${reportId}/location`).send(values);
            expect(response.status).to.equal(200);
            expect(response.body.formattedAddress).to.equal('Akoka, Lagos, Nigeria');
        });

        it('sees location in update address field', async function() {
            const response = await appAdmin.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            const input = document.querySelector('input#address');
            expect(input.value).to.equal('University of Lagos');
        });

        it('sees location in audit trail', async function() {
            const response = await appAdmin.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            const matches = document.evaluate('count(//td[text()="Set location to ‘University of Lagos’"])', document, null, 0, null);
            expect(matches.numberValue).to.equal(1);
        });

        it('refines location by dragging marker (ajax)', async function() {
            const values = { lat: 6.51773, lon: 3.39671 };
            const response = await appAdmin.put(`/ajax/reports/${reportId}/latlon`).send(values);
            expect(response.status).to.equal(200);
        });

        it('sees refined location in update address field', async function() {
            const response = await appAdmin.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            const input = document.querySelector('input#address');
            expect(input.value).to.equal('Tafawa Balewa Way, University Of Lagos, Lagos, Nigeria');
        });

        it('sees refined location in audit trail', async function() {
            const response = await appAdmin.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            const matches = document.evaluate('count(//td[text()="Set location to ‘Tafawa Balewa Way, University Of Lagos, Lagos, Nigeria’"])', document, null, 0, null);
            expect(matches.numberValue).to.equal(1);
        });

        it('has new report in report-map page', async function() {
            const response = await appAdmin.get('/reports-map');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            const script = document.querySelector('script:not([src])');
            expect(script.textContent.match(reportId)).to.not.be.null;
        });

        it('gets map marker (newly built)', async function() {
            try { fs.unlinkSync('./static/map/marker-red-80.png'); } catch (e) { /* ignore if not present */} // force regeneration of marker
            const response = await appAdmin.get('/map-marker/red/80');
            expect(response.status).to.equal(200);
            expect(response.headers['content-type']).to.equal('image/png');
        });

        it('gets map marker (prebuilt)', async function() {
            const response = await appAdmin.get('/map-marker/red/80');
            expect(response.status).to.equal(200);
            expect(response.headers['content-type']).to.equal('image/png');
        });

        it('sees report in reports list filtered by description', async function() {
            const response = await appAdmin.get('/reports?description=test');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.getElementById(reportId).nodeName).to.equal('TR');
        });

        it('sees report in reports list filtered by date range', async function() {
            const dates = encodeURI(dateFormat(Date.now()-1000*60*60*24, 'dd-mmm-yyyy')+'–'+dateFormat('dd-mmm-yyyy'));
            const response = await appAdmin.get('/reports?submitted='+dates);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.getElementById(reportId).nodeName).to.equal('TR');
        });

        it('gets report page', async function() {
            const response = await appAdmin.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            // not much obvious to search for!
        });

        // Summary function is disabled for this release
        // it('sets summary', async function() {
        //     const values = { summary: 'test report' };
        //     const responsePost = await appAdmin.post('/reports'+reportId).send(values);
        //     expect(responsePost.status).to.equal(302);
        //     const response = await appAdmin.get(responsePost.headers.location);
        //     expect(response.status).to.equal(200);
        //     const document = new JSDOM(response.text).window.document;
        //     expect(document.querySelector('#summary').value).to.equal('test report');
        //     const matches = document.evaluate('count(//td[text()="Set summary to ‘test report’"])', document, null, 0, null);
        //     expect(matches.numberValue).to.equal(1);
        // });

        it('sets assigned-to', async function() {
            const values = { 'assigned-to': testUserDetails._id };
            const response = await appAdmin.post('/reports/'+reportId).send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/reports/'+reportId);
        });

        it('doesn’t see notification of self-assignment', async function() {
            const response = await appAdmin.get('/ajax/notifications/debug');
            expect(response.status).to.equal(200);
            const notfcnsForRpt = JSON.parse(response.text).filter(notfcns => notfcns.report == reportId);
            expect(notfcnsForRpt.length).to.equal(0);
        });

        it('sees assigned-to in audit trail', async function() {
            const response = await appAdmin.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            const matches = document.evaluate('count(//td[text()="Set assignedTo to @tester"])', document, null, 0, null);
            expect(matches.numberValue).to.equal(1);
        });

        it('sees report in reports list filtered by assigned-to', async function() {
            const response = await appAdmin.get('/reports?assigned=tester');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.getElementById(reportId).nodeName).to.equal('TR');
        });

        it('sets status', async function() {
            const values = { 'status': 'test rpt' };
            const response = await appAdmin.post('/reports/'+reportId).send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/reports/'+reportId);
        });

        it('sees status in audit trail', async function() {
            const response = await appAdmin.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            const matches = document.evaluate('count(//td[text()="Set status to ‘test rpt’"])', document, null, 0, null);
            expect(matches.numberValue).to.equal(1);
        });

        it('sees report in reports list filtered by status', async function() {
            const response = await appAdmin.get('/reports?status=test+rpt');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.getElementById(reportId).nodeName).to.equal('TR');
        });

        it('sets report tag (ajax)', async function() {
            const values = { tag: 'test' };
            const response = await appAdmin.post(`/ajax/reports/${reportId}/tags`).send(values);
            expect(response.status).to.equal(201);
        });

        it('sees report in reports list filtered by tag', async function() {
            const response = await appAdmin.get('/reports?tag=test');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.getElementById(reportId).nodeName).to.equal('TR');
        });

        it('sees tag in report page', async function() {
            return; //  TODO - we have one span.tag with textContent=='complete', need to fix test!
            const response = await appAdmin.get('/reports/'+reportId); // eslint-disable-line no-unreachable
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            const tags = [ ...document.querySelectorAll('span.tag') ];
            expect(tags.filter(span => span.textContent=='complete')).to.have.lengthOf(1);
        });

        it('sees add tag in report page audit trail', async function() {
            const response = await appAdmin.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            const matches = document.evaluate('count(//td[text()="Add tag ‘test’"])', document, null, 0, null);
            expect(matches.numberValue).to.equal(1);
        });

        it('adds a comment', async function() {
            const values = {
                comment:  'Testing testing 1-2-3 including references to @tester and #test',
                username: testUserDetails.username,
                userid:   testUserDetails._id,
            };
            const response = await appAdmin.post(`/ajax/reports/${reportId}/comments`).send(values);
            expect(response.status).to.equal(201);
            commentId = response.body.id;
        });

        it('doesn’t see notification of self-mention', async function() {
            const response = await appAdmin.get('/ajax/notifications/debug');
            expect(response.status).to.equal(200);
            const notfcnsForRpt = JSON.parse(response.text).filter(notfcns => notfcns.report == reportId);
            expect(notfcnsForRpt.length).to.equal(0);
        });

        it('sees comment in report page, with @mention/#tag links', async function() {
            const response = await appAdmin.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            const commentDivs = document.getElementById(commentId).querySelectorAll('div');
            expect(commentDivs[0].textContent.slice(0, 16)).to.equal('tester commented'); // don't bother testing time!
            expect(commentDivs[0].querySelectorAll('button')[0].classList.contains('fa-times'));  // delete button
            expect(commentDivs[0].querySelectorAll('button')[1].classList.contains('fa-pencil')); // edit button
            expect(commentDivs[1].textContent).to.equal('Testing testing 1-2-3 including references to @tester and #test\n');
            expect(commentDivs[1].querySelectorAll('a')[0].href).to.equal('/users/'+testUserDetails._id);
            expect(commentDivs[1].querySelectorAll('a')[1].href).to.equal('/reports?tag=test');
        });

        it('sees add comment in report page audit trail', async function() {
            const response = await appAdmin.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            const comment = `Testing testing 1-2-3 including references to [@tester](${testUserDetails._id}) and #test`;
            const matches = document.evaluate(`count(//td[text()="Add comment ‘${comment}’"])`, document, null, 0, null);
            expect(matches.numberValue).to.equal(1);
        });

        it('edits comment', async function() {
            const values = { comment: 'Updated test including references to @tester and #test' };
            const response = await appAdmin.put(`/ajax/reports/${reportId}/comments/${commentId}`).send(values);
            expect(response.status).to.equal(200);
        });

        it('sees updated comment in report page, with @mention/#tag links', async function() {
            const response = await appAdmin.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            const commentDivs = document.getElementById(commentId).querySelectorAll('div');
            expect(commentDivs[0].textContent.slice(0, 16)).to.equal('tester commented'); // don't bother testing time!
            expect(commentDivs[0].querySelectorAll('button')[0].classList.contains('fa-times'));  // delete button
            expect(commentDivs[0].querySelectorAll('button')[1].classList.contains('fa-pencil')); // edit button
            expect(commentDivs[1].textContent).to.equal('Updated test including references to @tester and #test\n');
            expect(commentDivs[1].querySelectorAll('a')[0].href).to.equal('/users/'+testUserDetails._id);
            expect(commentDivs[1].querySelectorAll('a')[1].href).to.equal('/reports?tag=test');
        });

        it('sees updated comment in report page audit trail', async function() {
            const response = await appAdmin.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            const [ , onBase36 ] = commentId.split('-');
            const on = dateFormat(new Date(parseInt(onBase36, 36)), 'yyyy-mm-dd@HH:MM');
            const comment = 'Updated test including references to @tester and #test';
            const matches = document.evaluate(`count(//td[text()="Set comment-${on} to ‘${comment}’"])`, document, null, 0, null);
            expect(matches.numberValue).to.equal(1);
        });

        it('downloads reports list as CSV', async function() {
            const response = await appAdmin.get('/reports/export-csv');
            expect(response.status).to.equal(200);
            expect(response.headers['content-type']).to.equal('text/csv; charset=utf-8');
            const timestamp = response.headers['x-timestamp'];
            const filename = `the whistle incident reports ${timestamp.replace(':', '.')}.csv`;
            expect(response.headers['content-disposition']).to.equal(`attachment; filename="${filename}"`);
            const csv = csvParse(response.text);
            // TODO: submitted fields test is suspended until the CSV code is revised to output
            // TODO: separate CSV files or separate worksheets in spreadsheet for each variant of
            // TODO: questions, in order to make test robustness not dependent of reports lurking in
            // TODO: test db
            // expect(csv[0].length).to.be.at.least(13); // header row should included submitted fields
            const rpt = csv.filter(row => row[1]=='testy terrain'); // 2nd col is 'alias'
            expect(rpt.length).to.equal(1, response.text); // submitted test report should be included
        });

        it('downloads reports list as PDF', async function() {
            const response = await appAdmin.get('/reports/export-pdf');
            expect(response.status).to.equal(200);
            expect(response.headers['content-type']).to.equal('application/pdf');
            const timestamp = response.headers['x-timestamp'];
            const filename = `the whistle incident reports ${timestamp.replace(':', '.')}.pdf`;
            expect(response.headers['content-disposition']).to.equal(`attachment; filename="${filename}"`);
        });

        it('downloads single report as PDF', async function() {
            const response = await appAdmin.get('/reports/export-pdf/'+reportId);
            expect(response.status).to.equal(200);
            expect(response.headers['content-type']).to.equal('application/pdf');
            const timestamp = response.headers['x-timestamp'];
            const filename = `the whistle incident report ${timestamp.replace(':', '.')}.pdf`;
            expect(response.headers['content-disposition']).to.equal(`attachment; filename="${filename}"`);
        });

        it('deletes report tag (ajax)', async function() {
            const values = { tag: 'test' };
            const response = await appAdmin.delete(`/ajax/reports/${reportId}/tags/test`).send(values);
            expect(response.status).to.equal(200);
        });

        it('no longer sees tag in report page', async function() {
            const response = await appAdmin.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect([ ...document.querySelectorAll('span.tag') ].filter(span => span.textContent=='complete')).to.have.lengthOf(0);
        });

        it('sees delete tag in report page audit trail', async function() {
            const response = await appAdmin.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            const matches = document.evaluate('count(//td[text()="Delete tag ‘test’"])', document, null, 0, null);
            expect(matches.numberValue).to.equal(1);
        });

        it('deletes comment', async function() {
            const response = await appAdmin.delete(`/ajax/reports/${reportId}/comments/${commentId}`);
            expect(response.status).to.equal(200);
        });

        it('no longer sees comment in report page', async function() {
            const response = await appAdmin.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.getElementById(commentId)).to.be.null;
        });

        it('tidyup: sees full set of audit trail updates before report delete', async function() {
            const response = await appAdmin.get(`/ajax/reports/${reportId}/updates/`).send();
            expect(response.status).to.equal(200);
            expect(response.body.updates.length).to.equal(10);
        });

        it('tidyup: deletes incident report', async function() {
            const response = await appAdmin.post('/reports/'+reportId+'/delete').send();
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/reports');
        });

        it('tidyup: sees empty set of audit trail updates after report delete', async function() {
            const response = await appAdmin.get(`/ajax/reports/${reportId}/updates/`).send();
            expect(response.status).to.equal(200);
            expect(response.body.updates.length).to.equal(0);
        });
    });

    describe('users', function() {
        let userId = null;
        let pwResetToken = null;

        const values = {
            firstname: 'Test',
            lastname:  'User',
            email:     'test@user.com',
            username:  'test',
            roles:     [ 'admin' ],
            databases: [ org ],
        };

        it('gets add new user page', async function() {
            const response = await appAdmin.get('/users/add');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('input').name).to.equal('firstname');
        });

        it('adds new user', async function() {
            const response = await appAdmin.post('/users/add').send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/users');
            userId = response.headers['x-insert-id'];
            pwResetToken = response.headers['x-pw-reset-token'];
        });

        it('fails to add new new user with bad username - redirects back to same page', async function() {
            const badValues = Object.assign({}, values);
            badValues.username = 'this is a bad username';
            const response = await appAdmin.post('/users/add').send(badValues);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/users/add');
        });

        it('fails to add new new user with bad username - reports error', async function() {
            const response = await appAdmin.get('/users/add');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('p.error-msg').textContent).to.equal('Error – “username” must match the pattern /[a-z0-9-_.]+/');
        });

        it('sees password reset page', async function() {
            const response = await appAdmin.get('/password/reset/'+pwResetToken);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal('Password Reset');
        });

        it('lists users including test user', async function() {
            const response = await appAdmin.get('/users');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.getElementById(userId).querySelector('td').textContent).to.equal('Test');
        });

        it('returns 404 for edit user page with invalid id', async function() {
            const response = await appAdmin.get('/users/xxxx/edit');
            expect(response.status).to.equal(404);
        });

        it('returns 404 for edit user page with unrecognised id', async function() {
            const response = await appAdmin.get('/users/1234567890abcdef12345678/edit');
            expect(response.status).to.equal(404);
        });

        it('gets edit user page', async function() {
            const response = await appAdmin.get('/users/'+userId+'/edit');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal('Edit User Test User');
        });

        it('edits user', async function() {
            values.firstname = 'Test-bis';
            const response = await appAdmin.post('/users/'+userId+'/edit').send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/users');
        });

        it('sees updated details', async function() {
            const response = await appAdmin.get('/users/'+userId+'/edit');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('input').value).to.equal('Test-bis');
        });

        it('gets view user page (by id)', async function() {
            const response = await appAdmin.get('/users/'+userId);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal('Test-bis User (@test)');
        });

        it('gets view user page (by username)', async function() {
            const response = await appAdmin.get('/users/test');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal('Test-bis User (@test)');
        });

        it('returns 404 for view user page with unrecognised username', async function() {
            const response = await appAdmin.get('/users/abcdef');
            expect(response.status).to.equal(404);
        });

        it('returns 404 for view user page with invalid user-id', async function() {
            const response = await appAdmin.get('/users/1234567890abcdef12345678');
            expect(response.status).to.equal(404);
        });

        it('deletes test user', async function() {
            const response = await appAdmin.post('/users/'+userId+'/delete');
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/users');
        });

        it('returns 404 for non-existent user', async function() {
            const response = await appAdmin.get('/users/no-one-here-by-that-name');
            expect(response.status).to.equal(404);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal(':(');
        });
    });

    describe('resources', function() {
        let resourceId = null;
        const values = {
            name:     'Test',
            address:  'University of Lagos',
            phone:    '01 280 2439, 01 733 9832',
            email:    'informationunit@unilag.edu.ng, dsa@unilag.edu.ng',
            website:  'https://unilag.edu.ng',
            services: 'testing',
        };

        it('gets adds new resource page', async function() {
            const response = await appAdmin.get('/resources/add');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelectorAll('input')).to.have.lengthOf(9);
        });

        it('adds new resource', async function() {
            const response = await appAdmin.post('/resources/add').send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/resources');
            resourceId = response.headers['x-insert-id'];
        });

        it('lists resources including test resource', async function() {
            const response = await appAdmin.get('/resources');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.getElementById(resourceId).querySelectorAll('td')[0].textContent).to.equal('Test');
            expect(document.getElementById(resourceId).querySelectorAll('td')[5].textContent).to.equal('testing');
        });

        it('edits test resource', async function() {
            const response = await appAdmin.get('/resources/'+resourceId+'/edit');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal('Edit resource Test');
            values.services = 'testing; validation';
            const responsePost = await appAdmin.post('/resources/'+resourceId+'/edit').send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal('/resources');
        });

        it('lists resources including updated test resource', async function() {
            const response = await appAdmin.get('/resources');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.getElementById(resourceId).querySelectorAll('td')[0].textContent).to.equal('Test');
            expect(document.getElementById(resourceId).querySelectorAll('td')[5].textContent).to.equal('testing; validation');
        });

        it('deletes test resource', async function() {
            const response = await appAdmin.post('/resources/'+resourceId+'/delete');
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/resources');
        });

        it('returns 404 for non-existent resource', async function() {
            const response = await appAdmin.get('/resources/no-one-here-by-that-name');
            expect(response.status).to.equal(404);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal(':(');
        });
    });

    describe('dev', function() {
        it('sees dev home page', async function() {
            const response = await appAdmin.get('/dev');
            expect(response.status).to.equal(200);
        });

        it('sees dev/notes page', async function() {
            const response = await appAdmin.get('/dev/notes');
            expect(response.status).to.equal(200);
            const responseReadme = await appAdmin.get('/dev/notes/readme');
            expect(responseReadme.status).to.equal(200);
            const responseWorkflow = await appAdmin.get('/dev/notes/development-workflow');
            expect(responseWorkflow.status).to.equal(200);
        });

        it('returns 404 for non-existent dev/notes md page', async function() {
            const response = await appAdmin.get('/dev/notes/no-such-page');
            expect(response.status).to.equal(404);
        });

        it('sees dev/submissions page', async function() {
            const responseReadme = await appAdmin.get('/dev/submissions');
            expect(responseReadme.status).to.equal(200);
        });

        it('sees dev/log pages', async function() {
            // NOTE: can take c. 30 sec for reverse dns lookups, so leave log-access out of regular tests
            //const responseAccess = await appAdmin.get('/dev/log-access');
            //expect(responseAccess.status).to.equal(200);
            // NOTE: log-error populates IP domain cache which causes subsequent unit tests to fail,
            // so leave out of regular tests (only helps coverage stats, really!)
            //const responseError = await appAdmin.get('/dev/log-error');
            //expect(responseError.status).to.equal(200);
            const responseIpCache = await appAdmin.get('/dev/ip-cache');
            expect(responseIpCache.status).to.equal(200);
        });

        it('sees dev/nodeinfo page', async function() {
            const response = await appAdmin.get('/dev/nodeinfo');
            expect(response.status).to.equal(200);
        });

        it('sees dev/user-agents pages', async function() {
            const responseV1 = await appAdmin.get('/dev/user-agents');
            expect(responseV1.status).to.equal(200);
            const responseAdmin = await appAdmin.get('/dev/user-agents/admin');
            expect(responseAdmin.status).to.equal(200);
            const responseReport = await appAdmin.get('/dev/user-agents/report');
            expect(responseReport.status).to.equal(200);
            const responseReports = await appAdmin.get('/dev/user-agents/reports');
            expect(responseReports.status).to.equal(200);
        });

        it('throws error', async function() {
            const response = await appAdmin.get('/dev/throw');
            expect(response.status).to.equal(500);
        });
    });
    describe('misc', function() {
        it('returns 404 for non-existent page', async function() {
            const response = await appAdmin.get('/zzzzzz');
            expect(response.status).to.equal(404);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal(':(');
        });

        it('returns 404 for non-existent ajax page', async function() {
            const response = await appAdmin.get('/ajax/zzzzzz');
            expect(response.status).to.equal(404);
            expect(response.body.message).to.equal('Not Found');
        });
    });

    describe('logout', function() {
        it('logs out and redirects to /', async function() {
            const response = await appAdmin.get('/logout');
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/');
        });
    });
});
