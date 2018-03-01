/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Admin app integration/acceptance tests.                                    C.Veness 2017-2018  */
/*                                                                                                */
/* These tests require admin.localhost to be set in /etc/hosts.                                   */
/*                                                                                                */
/* Note that running this test will contribute to Weather Underground API invocation limits.      */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

// TODO: modularise this? How to handle login/logout if so?

import supertest  from 'supertest';  // SuperAgent driven library for testing HTTP servers
import chai       from 'chai';       // BDD/TDD assertion library
import jsdom      from 'jsdom';      // JavaScript implementation of DOM and HTML standards
import MongoDB    from 'mongodb';    // MongoDB driver for Node.js
import dateFormat from 'dateformat'; // Steven Levithan's dateFormat()
import base64     from 'base-64';    // base64 encoder/decoder
import fs         from 'fs';         // nodejs.org/api/fs.html
const expect   = chai.expect;
const ObjectId = MongoDB.ObjectId;

import app      from '../../app.js';

const testuser = process.env.TESTUSER; // note testuser ‘tester‘ must have access to ‘grn‘ organisation only
const testpass = process.env.TESTPASS; // (for successful login & ‘rape-is-a-crime‘ report submission)

const org = 'grn';              // the test organisation for the live ‘test-grn‘ organisation
const proj = 'rape-is-a-crime'; // the test project for the live ‘sexual-assault‘ project


const appAdmin = supertest.agent(app.listen()).host('admin.localhost');
const appReport = supertest.agent(app.listen()).host('report.localhost');

// note that document.querySelector() works with CSS ids which are more restrictive than HTML5 ids,
// so getElementById() has to be used to find ObjectId ids instead of querySelector()

describe(`Admin app (${org}/${app.env})`, function() {
    this.timeout(20e3); // 10 sec
    this.slow(250);

    before(async function() {
        // check testuser 'tester' exists and has access to ‘grn’ org (only)
        const responseUsr = await appAdmin.get(`/ajax/login/databases?user=${testuser}`);
        if (responseUsr.body.databases.length != 1) throw new Error(`${testuser} must have access to ‘${org}’ org (only)`);
        if (responseUsr.body.databases[0] != org) throw new Error(`${testuser} must have access to ‘${org}’ org (only)`);

        // check previous test user deleted
        const responseTestUsr = await appAdmin.get('/ajax/login/databases?user=test@user.com');
        if (responseTestUsr.body.databases.length != 0) throw new Error('Previous test user was not deleted');

        // login to set up db connection to ‘grn’ db
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
            const document = new jsdom.JSDOM(response.text).window.document;
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
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('title').textContent).to.equal('Reset password request');
        });

        it('sees password reset page', async function() {
            const response = await appAdmin.get(`/password/reset/${resetToken}`);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('input').name).to.equal('password');
        });

        it('throws out invalid token', async function() {
            const response = await appAdmin.get('/password/reset/not-a-good-token');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('p').textContent).to.equal('This password reset link is either invalid, expired, or previously used.');
        });

        it('throws out expired token', async function() {
            const [ timestamp, hash ] = resetToken.split('-');
            const expiredTimestamp = (parseInt(timestamp, 36) - 60*60*24 - 1).toString(36);
            const response = await appAdmin.get(`/password/reset/${expiredTimestamp}-${hash}`);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('p').textContent).to.equal('This password reset link is either invalid, expired, or previously used.');
        });

        it('throws out token with valid timestamp but invalid hash', async function() {
            // the token is a timestamp in base36 and a hash separated by a hyphen
            const [ timestamp ] = resetToken.split('-'); // (we don't need the hash here)
            const response = await appAdmin.get(`/password/reset/${timestamp}-abcdefgh`);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
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
            const document = new jsdom.JSDOM(response.text).window.document;
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
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelectorAll('input')).to.have.lengthOf(3);
        });

        it('login page shows no org’s for user arg ‘tester‘', async function() {
            const response = await appAdmin.get(`/login?user=${testuser}`);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelectorAll('input').length).to.equal(3); // username, password, remember-me (no db)
            expect(document.querySelector('input[name=username]').value).to.equal(testuser); // username prefilled
        });

        it('ajax: lists user databases', async function() {
            const response = await appAdmin.get(`/ajax/login/databases?user=${testuser}`);
            expect(response.status).to.equal(200);
            expect(response.body.databases).to.have.lengthOf(1);
            expect(response.body.databases[0]).to.equal(org);
        });

        it('shows e-mail/password not recognised on failed login', async function() {
            const values = { username: 'no-user-by-this-name', password: 'not-the-right-password' };
            const responsePost = await appAdmin.post('/login').send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal('/login');
            const responseGet = await appAdmin.get('/login');
            expect(responseGet.status).to.equal(200);
            const document = new jsdom.JSDOM(responseGet.text).window.document;
            expect(document.querySelector('button').nextElementSibling.textContent).to.equal('E-mail / password not recognised');
        });

        it('logs in, and redirects to /', async function() {
            const values = { username: testuser, password: testpass, 'remember-me': 'on' };
            const response = await appAdmin.post('/login').send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/');
        });

        it('shows logged in user on login page when logged-in', async function() {
            const response = await appAdmin.get('/login');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
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
            const document = new jsdom.JSDOM(response.text).window.document;
            //expect(document.querySelector('title').textContent).to.match(/.*Activity.+/); home page is temporarily list of reports
            expect(document.querySelector('title').textContent).to.equal('Reports list');
            // nav should be /, Reports, Users, Resources, Submit, user-name, Logout
            expect(document.querySelectorAll('header nav > ul > li').length).to.equal(8);
            // 'Submit' menu should have entry linking to /grn/rape-is-a-crime
            expect(document.querySelector('header nav > ul > li ul li a').textContent).to.equal('Rape Is A Crime Internal Form');
            const regexp = new RegExp(`${org}\\/${proj}\\/\\*$`);
            expect(document.querySelector('header nav > ul > li ul li a').href).to.match(regexp);
        });
    });

    describe('report self/other questions', function() {
        let questionId = null;

        it('adds question', async function() {
            const values = {
                question: '1a',
                self:     'A question I’m answering for myself',
                other:    'A question I’m answering for someone else',
            };
            const response = await appAdmin.post(`/ajax/questions/${proj}`).send(values);
            expect(response.status).to.equal(201);
            questionId = response.headers['x-insert-id'];
        });

        it('sees question in questions page', async function() {
            const response = await appAdmin.get(`/questions/${proj}`);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.getElementById(questionId)).to.not.be.null;
            expect(document.getElementById(questionId).querySelector('td').textContent).to.equal('1a');
        });

        it('updates question', async function() {
            const values = {
                question: '2b',
                self:     'A question I’m answering for myself',
                other:    'A question I’m answering for someone else',
            };
            const response = await appAdmin.put(`/ajax/questions/${questionId}`).send(values);
            expect(response.status).to.equal(200);
        });

        it('sees updated question', async function() {
            const response = await appAdmin.get(`/questions/${proj}`);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.getElementById(questionId)).to.not.be.null;
            expect(document.getElementById(questionId).querySelector('td').textContent).to.equal('2b');
        });

        it('deletes question', async function() {
            const response = await appAdmin.delete(`/ajax/questions/${questionId}`);
            expect(response.status).to.equal(200);
        });

        it('no longer sees question in questions page', async function() {
            const response = await appAdmin.get(`/questions/${proj}`);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.getElementById(questionId)).to.be.null;
        });
    });

    describe('submit (internal single-page) incident report', function() { // TODO: check overlap with report tests
        let reportId = null;
        let commentId = null;
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
            const values = { username: testuser, password: testpass, 'remember-me': 'on' };
            const response = await appReport.post(`/${org}/${proj}/login`).send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal(`/${org}/${proj}`);
        });

        it('sees new case intake page', async function() {
            const response = await appReport.get(`/${org}/${proj}/*`);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal('Have you used this anonymous reporting service before?');
        });

        it('reports new case intake invalid project', async function() {
            const response = await appReport.get(`/${org}/no-such-project/*`);
            expect(response.status).to.equal(404);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('p').textContent).to.equal('Couldn’t find that one!...');
        });

        it('enters incident report', async function() {
            const d = new Date(Date.now() - 1000*60*60*24); // yesterday in case of early-morning run
            const values = { // eslint-disable-line no-unused-vars
                'used-before':     'n',
                'generated-alias': 'testy terrain',
                'on-behalf-of':    'myself',
                'survivor-gender': 'f',
                'survivor-age':    '20–24',
                'when':            'date',
                'date':            { day: dateFormat(d, 'dd'),  month: dateFormat(d, 'mmm'), year: dateFormat(d, 'yyyy'), time: '' },
                'still-happening': 'n',
                'where':           'at',
                'at-address':      'University of Lagos',
                'who':             'n',
                'who-description': 'Big fat guy',
                'description':     'Test',
                'action-taken':    'teacher',
                'extra-notes':     '',
            };
            // sadly, it seems that superagent doesn't allow request.attach() to be used with
            // request.send(), so instead we need to use request.field()
            const response = await appReport.post(`/${org}/${proj}/*`)
                .field('used-before', values['used-before'])
                .field('generated-alias', values['generated-alias'])
                .field('on-behalf-of', values['on-behalf-of'])
                .field('survivor-gender', values['survivor-gender'])
                .field('survivor-age', values['survivor-age'])
                .field('when', values['when'])
                .field('date', JSON.stringify(values['date']))
                .field('still-happening', values['still-happening'])
                .field('where', values['where'])
                .field('at-address', values['at-address'])
                .field('who', values['who'])
                .field('who-description', values['who-description'])
                .field('description', values['description'])
                .field('action-taken', values['action-taken'])
                .field('extra-notes', values['extra-notes'])
                .attach('documents', imgFldr+imgFile);
            expect(response.status).to.equal(302);
            const koaSession = base64.decode(response.headers['set-cookie'][0].match(/^koa:sess=([a-zA-Z0-9=.]+);.+/)[1]);
            expect(response.headers.location).to.equal(`/${org}/${proj}/whatnext`, koaSession); // koaSession['koa-flash'] fails??
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
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent.trim()).to.equal('✔ We’ve received your report');
            expect(document.querySelectorAll('tr')).to.have.lengthOf(0); // local resources
        });

        it('has new report in list of reports', async function() {
            const response = await appAdmin.get('/reports');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.getElementById(reportId)).to.not.be.null;
        });

        it('sees new report with nicely formatted information', async function() {
            const response = await appAdmin.get(`/reports/${reportId}`);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            const reportInfo = document.querySelector('table.js-obj-to-html');
            const ths = reportInfo.querySelectorAll('th');
            const tds = reportInfo.querySelectorAll('td');
            expect(ths[0].textContent).to.equal('Alias');
            expect(tds[0].textContent).to.equal('testy terrain');
            expect(ths[1].textContent).to.equal('On behalf of');
            expect(tds[1].textContent).to.equal('Myself');
            expect(ths[2].textContent).to.equal('Survivor gender');
            expect(tds[2].textContent).to.equal('female');
            expect(ths[3].textContent).to.equal('Survivor age');
            expect(tds[3].textContent).to.equal('20–24');
            expect(ths[4].textContent).to.equal('Happened');
            expect(tds[4].textContent).to.equal(dateFormat(Date.now()-1000*60*60*24, 'd mmm yyyy'));
            expect(ths[5].textContent).to.equal('Still happening?');
            expect(tds[5].textContent).to.equal('no');
            expect(ths[6].textContent).to.equal('Where');
            expect(tds[6].textContent).to.equal('University of Lagos');
            expect(ths[7].textContent).to.equal('Who');
            expect(tds[7].textContent).to.equal('Not known: Big fat guy');
            expect(ths[8].textContent).to.equal('Description');
            expect(tds[8].textContent).to.equal('Test');
            expect(ths[9].textContent).to.equal('Spoken to anybody?');
            expect(tds[9].textContent).to.equal('Teacher/tutor/lecturer');
            expect(ths[10].textContent).to.equal('Extra notes');
            expect(tds[10].textContent).to.equal('—');
        });

        it('sets location by geocoding address (ajax)', async function() {
            const values = { address: 'University of Lagos' };
            const response = await appAdmin.put(`/ajax/reports/${reportId}/location`).send(values);
            expect(response.status).to.equal(200);
            expect(response.body.formattedAddress).to.equal('University Road 101017 Akoka,, Yaba,, Lagos State., Nigeria');
        });

        it('sees location in update address field', async function() {
            const response = await appAdmin.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            const input = document.querySelector('input#address');
            expect(input.value).to.equal('University of Lagos');
        });

        it('sees location in audit trail', async function() {
            const response = await appAdmin.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
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
            const document = new jsdom.JSDOM(response.text).window.document;
            const input = document.querySelector('input#address');
            expect(input.value).to.equal('Department Of Mass Communication, Tafawa Balewa Way, University Of Lagos, Lagos, Nigeria');
        });

        it('sees refined location in audit trail', async function() {
            const response = await appAdmin.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            const matches = document.evaluate('count(//td[text()="Set location to ‘Department Of Mass Communication, Tafawa Balewa Way, University Of Lagos, Lagos, Nigeria’"])', document, null, 0, null);
            expect(matches.numberValue).to.equal(1);
        });

        it('has new report in report-map page', async function() {
            const response = await appAdmin.get('/reports-map');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
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
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.getElementById(reportId).nodeName).to.equal('TR');
        });

        it('sees report in reports list filtered by date range', async function() {
            const dates = encodeURI(dateFormat(Date.now()-1000*60*60*24, 'dd-mmm-yyyy')+'–'+dateFormat('dd-mmm-yyyy'));
            const response = await appAdmin.get('/reports?submitted='+dates);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.getElementById(reportId).nodeName).to.equal('TR');
        });

        it('gets report page', async function() {
            const response = await appAdmin.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            // not much obvious to search for!
        });

        it('sees weather conditions in report page', async function() {
            return; // TODO investigate why wunderground is returning 400 Bad Request
            const response = await appAdmin.get('/reports/'+reportId); // eslint-disable-line no-unreachable
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            const iconRe = new RegExp('^/img/weather/underground/icons/black/png/32x32/[a-z]+.png$');
            expect(document.querySelector('#weather div.weather-body img').src).to.match(iconRe);
        });

        it('sees uploaded image in report page', async function() {
            const response = await appAdmin.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            const src = `/uploaded/${proj}/${dateFormat('yyyy-mm')}/${reportId}/${imgFile}`;
            expect(document.getElementById(imgFile).querySelector('td a').href).to.equal(src);
            expect(document.getElementById(imgFile).querySelector('td img').src).to.equal(src);
        });

        it('fetches uploaded image from AWS S3', async function() {
            const response = await appAdmin.get(`/uploaded/${proj}/${dateFormat('yyyy-mm')}/${reportId}/s_gps.jpg`);
            expect(response.status).to.equal(200);
            expect(response.headers['content-type']).to.equal('image/jpeg');
        });

        it('sees uploaded image exif metadata in report page', async function() {
            const response = await appAdmin.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            const distRe = new RegExp('^5400 km N from incident location');
            expect(document.getElementById(imgFile).querySelector('td.exif div').textContent).to.match(distRe);
        });

        it('gets timestamp of new report (ajax)', async function() {
            const response = await appAdmin.get('/ajax/reports/latest-timestamp');
            expect(response.status).to.equal(200);
            expect(response.body.latest.timestamp).to.equal(ObjectId(reportId).getTimestamp().toISOString());
        });

        it('gets reports in bounding box (ajax)', async function() {
            const response = await appAdmin.get('/ajax/reports/within/6.5,3.3:6.6,3.4');
            expect(response.status).to.equal(200);
            expect(response.body.reports.filter(r => r._id == reportId).length).to.equal(1);
        });

        it('sees ‘testy terrain’ alias is used (ajax)', async function() {
            const response = await appAdmin.get(`/ajax/report/${org}/aliases/testy+terrain`);
            expect(response.status).to.equal(200);
        });

        // TODO: can 'org' element of url be inferred from header credentials?
        it('sees unused alias is not used (ajax)', async function() {
            const response = await appAdmin.get(`/ajax/report/${org}/aliases/no+way+this+should+be+a+used+alias`);
            expect(response.status).to.equal(404);
        });

        // Summary function is disabled for this release
        // it('sets summary', async function() {
        //     const values = { summary: 'test report' };
        //     const responsePost = await appAdmin.post('/reports'+reportId).send(values);
        //     expect(responsePost.status).to.equal(302);
        //     const response = await appAdmin.get(responsePost.headers.location);
        //     expect(response.status).to.equal(200);
        //     const document = new jsdom.JSDOM(response.text).window.document;
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

        it('sees assigned-to in audit trail', async function() {
            const response = await appAdmin.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            const matches = document.evaluate('count(//td[text()="Set assignedTo to @tester"])', document, null, 0, null);
            expect(matches.numberValue).to.equal(1);
        });

        it('sees report in reports list filtered by assigned-to', async function() {
            const response = await appAdmin.get('/reports?assigned=tester');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
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
            const document = new jsdom.JSDOM(response.text).window.document;
            const matches = document.evaluate('count(//td[text()="Set status to ‘test rpt’"])', document, null, 0, null);
            expect(matches.numberValue).to.equal(1);
        });

        it('sees report in reports list filtered by status', async function() {
            const response = await appAdmin.get('/reports?status=test+rpt');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
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
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.getElementById(reportId).nodeName).to.equal('TR');
        });

        it('sees tag in report page', async function() {
            return; //  TODO - we have one span.tag with textContent=='complete', need to fix test!
            const response = await appAdmin.get('/reports/'+reportId); // eslint-disable-line no-unreachable
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            const tags = [ ...document.querySelectorAll('span.tag') ];
            expect(tags.filter(span => span.textContent=='complete')).to.have.lengthOf(1);
        });

        it('sees add tag in report page audit trail', async function() {
            const response = await appAdmin.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
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

        it('sees comment in report page, with @mention/#tag links', async function() {
            const response = await appAdmin.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
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
            const document = new jsdom.JSDOM(response.text).window.document;
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
            const document = new jsdom.JSDOM(response.text).window.document;
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
            const document = new jsdom.JSDOM(response.text).window.document;
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
            expect(response.headers['content-disposition']).to.equal(`attachment; filename="the whistle incident reports ${dateFormat('yyyy-mm-dd HH.MM')}.csv"`);
        });

        it('downloads reports list as PDF', async function() {
            const response = await appAdmin.get('/reports/export-pdf');
            expect(response.status).to.equal(200);
            expect(response.headers['content-type']).to.equal('application/pdf');
            // TODO: any way to reliably test for filename if timestamp ticks over minute boundary?
            expect(response.headers['content-disposition']).to.equal(`attachment; filename="the whistle incident reports ${dateFormat('yyyy-mm-dd HH.MM')}.pdf"`);
        });

        it('downloads single report as PDF', async function() {
            const response = await appAdmin.get('/reports/export-pdf/'+reportId);
            expect(response.status).to.equal(200);
            expect(response.headers['content-type']).to.equal('application/pdf');
            expect(response.headers['content-disposition']).to.equal(`attachment; filename="the whistle incident report ${dateFormat('yyyy-mm-dd HH.MM')}.pdf"`);
        });

        it('deletes report tag (ajax)', async function() {
            const values = { tag: 'test' };
            const response = await appAdmin.delete(`/ajax/reports/${reportId}/tags/test`).send(values);
            expect(response.status).to.equal(200);
        });

        it('no longer sees tag in report page', async function() {
            const response = await appAdmin.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect([ ...document.querySelectorAll('span.tag') ].filter(span => span.textContent=='complete')).to.have.lengthOf(0);
        });

        it('sees delete tag in report page audit trail', async function() {
            const response = await appAdmin.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
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
            const document = new jsdom.JSDOM(response.text).window.document;
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
            roles:     'admin',
            databases: org,
        };

        it('gets add new user page', async function() {
            const response = await appAdmin.get('/users/add');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('input').name).to.equal('firstname');
        });

        it('adds new user', async function() {
            const response = await appAdmin.post('/users/add').send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/users');
            userId = response.headers['x-insert-id'];
            pwResetToken = response.headers['x-pw-reset-token'];
        });

        it('sees password reset page', async function() {
            const response = await appAdmin.get('/password/reset/'+pwResetToken);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal('Password Reset');
        });

        it('lists users including test user', async function() {
            const response = await appAdmin.get('/users');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
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
            const document = new jsdom.JSDOM(response.text).window.document;
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
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('input').value).to.equal('Test-bis');
        });

        it('gets view user page (by id)', async function() {
            const response = await appAdmin.get('/users/'+userId);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal('Test-bis User (@test)');
        });

        it('gets view user page (by username)', async function() {
            const response = await appAdmin.get('/users/test');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
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
            const document = new jsdom.JSDOM(response.text).window.document;
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
            const document = new jsdom.JSDOM(response.text).window.document;
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
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.getElementById(resourceId).querySelectorAll('td')[0].textContent).to.equal('Test');
            expect(document.getElementById(resourceId).querySelectorAll('td')[5].textContent).to.equal('testing');
        });

        it('edits test resource', async function() {
            const response = await appAdmin.get('/resources/'+resourceId+'/edit');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal('Edit resource Test');
            values.services = 'testing; validation';
            const responsePost = await appAdmin.post('/resources/'+resourceId+'/edit').send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal('/resources');
        });

        it('lists resources including updated test resource', async function() {
            const response = await appAdmin.get('/resources');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
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
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal(':(');
        });
    });

    describe('dev', function() {
        it('sees dev/notes page', async function() {
            const response = await appAdmin.get('/dev/notes');
            expect(response.status).to.equal(200);
        });

        it('sees dev/notes/readme page', async function() {
            const response = await appAdmin.get('/dev/notes/readme');
            expect(response.status).to.equal(200);
        });

        it('sees dev/notes md page', async function() {
            const response = await appAdmin.get('/dev/notes/development-workflow');
            expect(response.status).to.equal(200);
        });

        it('returns 404 for non-existent dev/notes md page', async function() {
            const response = await appAdmin.get('/dev/notes/no-such-page');
            expect(response.status).to.equal(404);
        });

        it('sees dev/nodeinfo page', async function() {
            const response = await appAdmin.get('/dev/nodeinfo');
            expect(response.status).to.equal(200);
        });

        it('sees dev/user-agents', async function() {
            const response = await appAdmin.get('/dev/user-agents');
            expect(response.status).to.equal(200);
        });
    });

    describe('misc', function() {
        it('returns 404 for non-existent page', async function() {
            const response = await appAdmin.get('/zzzzzz');
            expect(response.status).to.equal(404);
            const document = new jsdom.JSDOM(response.text).window.document;
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
