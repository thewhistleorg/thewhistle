/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Admin app integration/acceptance tests.                                         C.Veness 2017  */
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

import app from '../../app.js';

const testuser = process.env.TESTUSER; // note testuser must have access to test-grn only
const testpass = process.env.TESTPASS; // (for successful login & sexual-assault report submission)


const request = supertest.agent(app.listen()).host('admin.localhost');

// note that document.querySelector() works with CSS ids which are more restrictive than HTML5 ids,
// so getElementById() has to be used to find ObjectId ids instead of querySelector()

describe('Admin app'+' ('+app.env+')', function() {
    this.timeout(10e3); // 10 sec

    describe('password reset', function() {
        let resetToken = null;

        it('sees password reset page', async function() {
            const response = await request.get('/password/reset-request');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('input').name).to.equal('email');
        });

        it('makes password reset request', async function() {
            const response = await request.post('/password/reset-request').send({ email: testuser });
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/password/reset-request-confirm');
            resetToken = response.headers['x-reset-token'];
            console.info('reset token', resetToken);
            // any way to test e-mail gets sent?
        });

        it('sees password reset request confirmation page', async function() {
            const response = await request.get('/password/reset-request-confirm');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('title').textContent).to.equal('Reset password request');
        });

        it('sees password reset page', async function() {
            const response = await request.get(`/password/reset/${resetToken}`);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('input').name).to.equal('password');
        });

        it('throws out invalid token', async function() {
            const response = await request.get('/password/reset/not-a-good-token');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('p').textContent).to.equal('This password reset link is either invalid, expired, or previously used.');
        });

        it('throws out expired token', async function() {
            const [ timestamp, hash ] = resetToken.split('-');
            const expiredTimestamp = (parseInt(timestamp, 36) - 60*60*24 - 1).toString(36);
            const response = await request.get(`/password/reset/${expiredTimestamp}-${hash}`);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('p').textContent).to.equal('This password reset link is either invalid, expired, or previously used.');
        });

        it('throws out token with valid timestamp but invalid hash', async function() {
            // the token is a timestamp in base36 and a hash separated by a hyphen
            const [ timestamp ] = resetToken.split('-'); // (we don't need the hash here)
            const response = await request.get(`/password/reset/${timestamp}-abcdefgh`);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('p').textContent).to.equal('This password reset link is either invalid, expired, or previously used.');
        });

        it('chokes on different passwords', async function() {
            const values = { password: testpass, passwordConfirm: 'definitely-no-the-correct-password' };
            const response = await request.post(`/password/reset/${resetToken}`).send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal(`/password/reset/${resetToken}`);
        });

        it('resets password', async function() {
            const values = { password: testpass, passwordConfirm: testpass };
            const response = await request.post(`/password/reset/${resetToken}`).send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/password/reset/confirm');
        });

        it('sees password reset confirmation page', async function() {
            const response = await request.get('/password/reset/confirm');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('title').textContent).to.equal('Reset password');
        });
    });

    describe('login', function() {
        let location = null;

        it('forbids access to reports when not logged-in', async function() {
            const response = await request.get('/reports');
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/login/reports');
        });

        it('has home page with login link in nav when not logged-in', async function() {
            const response = await request.get('/');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('title').textContent.slice(0, 11)).to.equal('The Whistle');
            expect(document.querySelectorAll('nav ul li').length).to.equal(2); // nav should be just '/', 'login'
        });

        it('has login page with login fields when not logged-in', async function() {
            const response = await request.get('/login');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelectorAll('input')).to.have.lengthOf(3);
        });

        it('login page shows org’s for user arg', async function() {
            const response = await request.get('/login?user=review@thewhistle.org');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelectorAll('input').length).to.be.at.least(4);
        });

        it('ajax: lists user databases', async function() {
            const response = await request.get(`/ajax/login/databases?user=${testuser}`);
            expect(response.status).to.equal(200);
            expect(response.body.databases).to.have.lengthOf(1);
            expect(response.body.databases[0]).to.equal('test-grn');
        });

        it('shows e-mail/password not recognised on failed login', async function() {
            const values = { username: 'no-user-by-this-name', password: 'not-the-right-password' };
            const responsePost = await request.post('/login').send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal('/login');
            const responseGet = await request.get('/login');
            expect(responseGet.status).to.equal(200);
            const document = new jsdom.JSDOM(responseGet.text).window.document;
            expect(document.querySelector('button').nextElementSibling.textContent).to.equal('E-mail / password not recognised');
        });

        it('redirects to / on login', async function() {
            const values = { username: testuser, password: testpass, 'remember-me': 'on' };
            const response = await request.post('/login').send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/');
        });

        it('shows logged in user on login page when logged-in', async function() {
            const response = await request.get('/login');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('#name').textContent).to.equal('tester');
            expect(document.querySelector('#db').textContent).to.equal('test-grn');
        });

        it('has home page with full nav links when logged-in', async function() {
            // get from location supplied by home redirecgt
            const res1 = await request.get('/');
            expect(res1.status).to.equal(302);
            location = res1.headers.location;
            const response = await request.get(location);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            //expect(document.querySelector('title').textContent).to.match(/.*Activity.+/); home page is temporarily list of reports
            expect(document.querySelector('title').textContent).to.equal('Reports list');
            // nav should be /, Reports, Users, Resources, Submit, user-name, Logout
            expect(document.querySelectorAll('header nav > ul > li').length).to.equal(8);
            // 'Submit' menu should have 'test-grn/sexual-assault (internal)' entry
            expect(document.querySelector('header nav > ul > li ul li a').textContent).to.equal('test-grn/sexual-assault (internal)');
        });
    });

    describe('incident report', function() {
        let reportId = null;
        let commentId = null;
        let testUserDetails = null;

        const imgFldr = 'test/img/';
        const imgFile = 's_gps.jpg';


        it('gets test user id from e-mail (ajax)', async function() {
            const response = await request.get(`/ajax/users?email=${testuser}`);
            expect(response.status).to.equal(200);
            testUserDetails = response.body.users[0];
        });

        it('sees new case intake page', async function() {
            const response = await request.get('/report/sexual-assault');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal('New Case Intake');
        });

        it('reports new case intake invalid project', async function() {
            const response = await request.get('/report/no-such-project');
            expect(response.status).to.equal(404);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('p').textContent).to.equal('Project ‘no-such-project’ not found.');
        });

        it('reports submit without entering details', async function() {
            const response = await request.post('/report/sexual-assault/submit');
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/report/sexual-assault');
        });

        it('enters incident report', async function() {
            const values = { // eslint-disable-line no-unused-vars
                'generated-alias':   'testy terrain',
                date:                dateFormat(new Date(Date.now() - 1000*60*60*24), 'yyyy-mm-dd'), // yesterday in case of early-morning run
                time:                dateFormat('HH:MM'),
                'brief-description': 'test',
                'location-address':  'University of Lagos',
            };
            // sadly, it seems that superagent doesn't allow request.attach() to be used with
            // request.send(), so instead we need to use request.field()
            const response = await request.post('/report/sexual-assault')
                .field('generated-alias', values['generated-alias'])
                .field('date', values['date'])
                .field('time', values['time'])
                .field('brief-description', values['brief-description'])
                .field('location-address', values['location-address'])
                .attach('documents', imgFldr+imgFile);
            expect(response.status).to.equal(302);
            const koaSession = base64.decode(response.headers['set-cookie'][0].match(/^koa:sess=([a-zA-Z0-9=.]+);.+/)[1]);
            expect(response.headers.location).to.equal('/report/sexual-assault/submit', koaSession); // koaSession['koa-flash'] fails??
        });

        it('gets new autogenerated alias (ajax)', async function() {
            const response = await request.get('/ajax/report/test-grn/aliases/new');
            expect(response.status).to.equal(200);
            expect(response.body.alias.split(' ')).to.have.lengthOf(2);
        });

        it('sees review & submit page', async function() {
            const response = await request.get('/report/sexual-assault/submit');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal('Review & Submit');
        });

        it('submits incident report', async function() {
            const response = await request.post('/report/sexual-assault/submit').send();
            expect(response.status).to.equal(302);
            reportId = response.headers['x-insert-id'];
            expect(response.headers.location).to.equal(`/report/sexual-assault/${reportId}/confirm`);
            expect(reportId.length).to.equal(24);
            // note no test junk will be left in user-agents recording as long as test host
            // IP address (localhost or CI host) is excluded from user-agents recording
        });

        it('sees confirm page', async function() {
            const response = await request.get(`/report/sexual-assault/${reportId}/confirm`);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal('Report Submitted');
        });

        it('has new report in list of reports', async function() {
            const response = await request.get('/reports');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.getElementById(reportId)).to.not.be.null;
        });

        it('has new report in report-map page', async function() {
            const response = await request.get('/reports-map');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            const script = document.querySelector('script:not([src])');
            expect(script.textContent.match(reportId)).to.not.be.null;
        });

        it('gets map marker (newly built)', async function() {
            try { fs.unlinkSync('./static/map/marker-red-80.png'); } catch (e) { /* ignore if not present */} // force regeneration of marker
            const response = await request.get('/map-marker/red/80');
            expect(response.status).to.equal(200);
            expect(response.headers['content-type']).to.equal('image/png');
        });

        it('gets map marker (prebuilt)', async function() {
            const response = await request.get('/map-marker/red/80');
            expect(response.status).to.equal(200);
            expect(response.headers['content-type']).to.equal('image/png');
        });

        it('sees report in reports list filtered by description', async function() {
            const response = await request.get('/reports?description=test');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.getElementById(reportId).nodeName).to.equal('TR');
        });

        it('sees report in reports list filtered by date range', async function() {
            const dates = encodeURI(dateFormat(Date.now()-1000*60*60*24, 'dd-mmm-yyyy')+'–'+dateFormat('dd-mmm-yyyy'));
            const response = await request.get('/reports?submitted='+dates);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.getElementById(reportId).nodeName).to.equal('TR');
        });

        it('gets report page', async function() {
            const response = await request.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            // not much obvious to search for!
        });

        it('sees weather conditions in report page', async function() {
            return; // TODO investigate why wunderground is returning 400 Bad Request
            const response = await request.get('/reports/'+reportId); // eslint-disable-line no-unreachable
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            const iconRe = new RegExp('^/img/weather/underground/icons/black/png/32x32/[a-z]+.png$');
            expect(document.querySelector('#weather div.weather-body img').src).to.match(iconRe);
        });

        it('sees uploaded image in report page', async function() {
            const response = await request.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            const src = `/uploaded/sexual-assault/${dateFormat('yyyy-mm')}/${reportId}/${imgFile}`;
            expect(document.getElementById(imgFile).querySelector('td a').href).to.equal(src);
            expect(document.getElementById(imgFile).querySelector('td img').src).to.equal(src);
        });

        it('fetches uploaded image from AWS S3', async function() {
            const response = await request.get(`/uploaded/sexual-assault/${dateFormat('yyyy-mm')}/${reportId}/s_gps.jpg`);
            expect(response.status).to.equal(200);
            expect(response.headers['content-type']).to.equal('image/jpeg');
        });

        it('sees uploaded image exif metadata in report page', async function() {
            const response = await request.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            const distRe = new RegExp('^5400 km N from incident location');
            expect(document.getElementById(imgFile).querySelector('td.exif div').textContent).to.match(distRe);
        });

        it('gets timestamp of new report (ajax)', async function() {
            const response = await request.get('/ajax/reports/latest-timestamp');
            expect(response.status).to.equal(200);
            expect(response.body.latest.timestamp).to.equal(ObjectId(reportId).getTimestamp().toISOString());
        });

        it('gets reports in bounding box (ajax)', async function() {
            const response = await request.get('/ajax/reports/within/6.5,3.3:6.6,3.4');
            expect(response.status).to.equal(200);
            expect(response.body.reports.filter(r => r._id == reportId).length).to.equal(1);
        });

        it('sees ‘testy terrain’ alias is used (ajax)', async function() {
            const response = await request.get('/ajax/report/test-grn/aliases/testy+terrain');
            expect(response.status).to.equal(200);
        });

        // TODO: can 'test-grn' element of url be inferred from header credentials?
        it('sees unused alias is not used (ajax)', async function() {
            const response = await request.get('/ajax/report/test-grn/aliases/no+way+this+should+be+a+used+alias');
            expect(response.status).to.equal(404);
        });

        // Summary function is disabled for this release
        // it('sets summary', async function() {
        //     const values = { summary: 'test report' };
        //     const responsePost = await request.post('/reports'+reportId).send(values);
        //     expect(responsePost.status).to.equal(302);
        //     const response = await request.get(responsePost.headers.location);
        //     expect(response.status).to.equal(200);
        //     const document = new jsdom.JSDOM(response.text).window.document;
        //     expect(document.querySelector('#summary').value).to.equal('test report');
        //     const matches = document.evaluate('count(//td[text()="Set summary to ‘test report’"])', document, null, 0, null);
        //     expect(matches.numberValue).to.equal(1);
        // });

        it('sets assigned-to', async function() {
            const values = { 'assigned-to': testUserDetails._id };
            const response = await request.post('/reports/'+reportId).send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/reports/'+reportId);
        });

        it('sees assigned-to in audit trail', async function() {
            const response = await request.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            const matches = document.evaluate('count(//td[text()="Set assignedTo to @tester"])', document, null, 0, null);
            expect(matches.numberValue).to.equal(1);
        });

        it('sees report in reports list filtered by assigned-to', async function() {
            const response = await request.get('/reports?assigned=tester');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.getElementById(reportId).nodeName).to.equal('TR');
        });

        it('sets status', async function() {
            const values = { 'status': 'test rpt' };
            const response = await request.post('/reports/'+reportId).send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/reports/'+reportId);
        });

        it('sees status in audit trail', async function() {
            const response = await request.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            const matches = document.evaluate('count(//td[text()="Set status to ‘test rpt’"])', document, null, 0, null);
            expect(matches.numberValue).to.equal(1);
        });

        it('sees report in reports list filtered by status', async function() {
            const response = await request.get('/reports?status=test+rpt');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.getElementById(reportId).nodeName).to.equal('TR');
        });

        it('sets report tag (ajax)', async function() {
            const values = { tag: 'test' };
            const response = await request.post(`/ajax/reports/${reportId}/tags`).send(values);
            expect(response.status).to.equal(201);
        });

        it('sees report in reports list filtered by tag', async function() {
            const response = await request.get('/reports?tag=test');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.getElementById(reportId).nodeName).to.equal('TR');
        });

        it('sees tag in report page', async function() {
            const response = await request.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelectorAll('span.tag')).to.have.lengthOf(1);
        });

        it('sees add tag in report page audit trail', async function() {
            const response = await request.get('/reports/'+reportId);
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
            const response = await request.post(`/ajax/reports/${reportId}/comments`).send(values);
            expect(response.status).to.equal(201);
            commentId = response.body.id;
        });

        it('sees comment in report page, with @mention/#tag links', async function() {
            const response = await request.get('/reports/'+reportId);
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
            const response = await request.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            const comment = `Testing testing 1-2-3 including references to [@tester](${testUserDetails._id}) and #test`;
            const matches = document.evaluate(`count(//td[text()="Add comment ‘${comment}’"])`, document, null, 0, null);
            expect(matches.numberValue).to.equal(1);
        });

        it('edits comment', async function() {
            const values = { comment: 'Updated test including references to @tester and #test' };
            const response = await request.put(`/ajax/reports/${reportId}/comments/${commentId}`).send(values);
            expect(response.status).to.equal(200);
        });

        it('sees updated comment in report page, with @mention/#tag links', async function() {
            const response = await request.get('/reports/'+reportId);
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
            const response = await request.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            const [ , onBase36 ] = commentId.split('-');
            const on = dateFormat(new Date(parseInt(onBase36, 36)), 'yyyy-mm-dd@HH:MM');
            const comment = 'Updated test including references to @tester and #test';
            const matches = document.evaluate(`count(//td[text()="Set comment-${on} to ‘${comment}’"])`, document, null, 0, null);
            expect(matches.numberValue).to.equal(1);
        });

        it('downloads reports list as CSV', async function() {
            const response = await request.get('/reports/export-csv');
            expect(response.status).to.equal(200);
            expect(response.headers['content-type']).to.equal('text/csv; charset=utf-8');
            expect(response.headers['content-disposition']).to.equal(`attachment; filename="the whistle incident reports ${dateFormat('yyyy-mm-dd HH:MM')}.csv"`);
        });

        it('downloads reports list as PDF', async function() {
            const response = await request.get('/reports/export-pdf');
            expect(response.status).to.equal(200);
            expect(response.headers['content-type']).to.equal('application/pdf');
            expect(response.headers['content-disposition']).to.equal(`attachment; filename="the whistle incident reports ${dateFormat('yyyy-mm-dd HH:MM')}.pdf"`);
        });

        it('downloads single report as PDF', async function() {
            const response = await request.get('/reports/export-pdf/'+reportId);
            expect(response.status).to.equal(200);
            expect(response.headers['content-type']).to.equal('application/pdf');
            expect(response.headers['content-disposition']).to.equal(`attachment; filename="the whistle incident report ${dateFormat('yyyy-mm-dd HH:MM')}.pdf"`);
        });

        it('deletes report tag (ajax)', async function() {
            const values = { tag: 'test' };
            const response = await request.delete(`/ajax/reports/${reportId}/tags/test`).send(values);
            expect(response.status).to.equal(200);
        });

        it('no longer sees tag in report page', async function() {
            const response = await request.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelectorAll('span.tag')).to.have.lengthOf(0);
        });

        it('sees delete tag in report page audit trail', async function() {
            const response = await request.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            const matches = document.evaluate('count(//td[text()="Delete tag ‘test’"])', document, null, 0, null);
            expect(matches.numberValue).to.equal(1);
        });

        it('deletes comment', async function() {
            const response = await request.delete(`/ajax/reports/${reportId}/comments/${commentId}`);
            expect(response.status).to.equal(200);
        });

        it('no longer sees comment in report page', async function() {
            const response = await request.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.getElementById(commentId)).to.be.null;
        });

        it('tidyup: sees full set of audit trail updates before report delete', async function() {
            const response = await request.get(`/ajax/reports/${reportId}/updates/`).send();
            expect(response.status).to.equal(200);
            expect(response.body.updates.length).to.equal(7);
        });

        it('tidyup: deletes incident report', async function() {
            const response = await request.post('/reports/'+reportId+'/delete').send();
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/reports');
        });

        it('tidyup: sees empty set of audit trail updates after report delete', async function() {
            const response = await request.get(`/ajax/reports/${reportId}/updates/`).send();
            expect(response.status).to.equal(200);
            expect(response.body.updates.length).to.equal(0);
        });
    });

    describe('users', function() {
        let userId = null;

        const values = {
            firstname: 'Test',
            lastname:  'User',
            email:     'test@user.com',
            username:  'test',
            roles:     'admin',
            databases: 'test-grn',
        };

        it('gets add new user page', async function() {
            const response = await request.get('/users/add');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('input').name).to.equal('firstname');
        });

        it('adds new user', async function() {
            const response = await request.post('/users/add').send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/users');
            userId = response.headers['x-insert-id'];
        });

        it('lists users including test user', async function() {
            const response = await request.get('/users');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.getElementById(userId).querySelector('td').textContent).to.equal('Test');
        });

        it('returns 404 for edit user page with invalid id', async function() {
            const response = await request.get('/users/xxxx/edit');
            expect(response.status).to.equal(404);
        });

        it('returns 404 for edit user page with unrecognised id', async function() {
            const response = await request.get('/users/1234567890abcdef12345678/edit');
            expect(response.status).to.equal(404);
        });

        it('gets edit user page', async function() {
            const response = await request.get('/users/'+userId+'/edit');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal('Edit User Test User');
        });

        it('edits user', async function() {
            values.firstname = 'Test-bis';
            const response = await request.post('/users/'+userId+'/edit').send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/users');
        });

        it('sees updated details', async function() {
            const response = await request.get('/users/'+userId+'/edit');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('input').value).to.equal('Test-bis');
        });

        it('gets view user page (by id)', async function() {
            const response = await request.get('/users/'+userId);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal('Test-bis User (@test)');
        });

        it('gets view user page (by username)', async function() {
            const response = await request.get('/users/test');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal('Test-bis User (@test)');
        });

        it('returns 404 for view user page with unrecognised username', async function() {
            const response = await request.get('/users/abcdef');
            expect(response.status).to.equal(404);
        });

        it('returns 404 for view user page with invalid user-id', async function() {
            const response = await request.get('/users/1234567890abcdef12345678');
            expect(response.status).to.equal(404);
        });

        it('deletes test user', async function() {
            const response = await request.post('/users/'+userId+'/delete');
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/users');
        });

        it('returns 404 for non-existent user', async function() {
            const response = await request.get('/users/no-one-here-by-that-name');
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
            services: 'testing',
        };

        it('gets adds new resource page', async function() {
            const response = await request.get('/resources/add');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelectorAll('input')).to.have.lengthOf(8);
        });

        it('adds new resource', async function() {
            const response = await request.post('/resources/add').send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/resources');
            resourceId = response.headers['x-insert-id'];
        });

        it('lists resources including test resource', async function() {
            const response = await request.get('/resources');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.getElementById(resourceId).querySelectorAll('td')[0].textContent).to.equal('Test');
            expect(document.getElementById(resourceId).querySelectorAll('td')[4].textContent).to.equal('testing');
        });

        it('edits test resource', async function() {
            const response = await request.get('/resources/'+resourceId+'/edit');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal('Edit resource Test');
            values.services = 'testing; validation';
            const responsePost = await request.post('/resources/'+resourceId+'/edit').send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal('/resources');
        });

        it('lists resources including updated test resource', async function() {
            const response = await request.get('/resources');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.getElementById(resourceId).querySelectorAll('td')[0].textContent).to.equal('Test');
            expect(document.getElementById(resourceId).querySelectorAll('td')[4].textContent).to.equal('testing; validation');
        });

        it('deletes test resource', async function() {
            const response = await request.post('/resources/'+resourceId+'/delete');
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/resources');
        });

        it('returns 404 for non-existent resource', async function() {
            const response = await request.get('/resources/no-one-here-by-that-name');
            expect(response.status).to.equal(404);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal(':(');
        });
    });

    describe('dev', function() {
        it('sees dev/notes page', async function() {
            const response = await request.get('/dev/notes');
            expect(response.status).to.equal(200);
        });

        it('sees dev/notes/readme page', async function() {
            const response = await request.get('/dev/notes/readme');
            expect(response.status).to.equal(200);
        });

        it('sees dev/notes md page', async function() {
            const response = await request.get('/dev/notes/development-workflow');
            expect(response.status).to.equal(200);
        });

        it('returns 404 for non-existent dev/notes md page', async function() {
            const response = await request.get('/dev/notes/no-such-page');
            expect(response.status).to.equal(404);
        });

        it('sees dev/nodeinfo page', async function() {
            const response = await request.get('/dev/nodeinfo');
            expect(response.status).to.equal(200);
        });

        it('sees dev/user-agents', async function() {
            const response = await request.get('/dev/user-agents');
            expect(response.status).to.equal(200);
        });
    });

    describe('misc', function() {
        it('returns 404 for non-existent page', async function() {
            const response = await request.get('/zzzzzz');
            expect(response.status).to.equal(404);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal(':(');
        });

        it('returns 404 for non-existent ajax page', async function() {
            const response = await request.get('/ajax/zzzzzz');
            expect(response.status).to.equal(404);
            expect(response.body.message).to.equal('Not Found');
        });
    });

    describe('logout', function() {
        it('logs out and redirects to /', async function() {
            const response = await request.get('/logout');
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/');
        });
    });
});
