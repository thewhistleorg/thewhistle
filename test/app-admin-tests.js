/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Admin app integration/acceptance tests                                                         */
/*                                                                                                */
/* Note that running this test will contribute to Weather Underground API invocation limits       */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

// TODO: modularise this? How to handle login/logout if so?

'use strict';

const supertest   = require('supertest');   // SuperAgent driven library for testing HTTP servers
const expect      = require('chai').expect; // BDD/TDD assertion library
const JsDom       = require('jsdom').JSDOM; // JavaScript implementation of DOM and HTML standards
const MongoClient = require('mongodb').MongoClient;
const ObjectId    = require('mongodb').ObjectId;
const dateFormat  = require('dateformat');  // Steven Levithan's dateFormat()
const base64      = require('base-64');     // base64 encoder/decoder

const app = require('../app.js');

const testuser = process.env.TESTUSER;
const testpass = process.env.TESTPASS;


let request = null;

const headers = { Host: 'admin.localhost:3000' }; // set host header

before(function(done) {
    this.timeout(10e3); // 10 sec
    MongoClient.connect(process.env['DB_USERS'])
        .then(function(database) {
            global.db = { users: database };
            request = supertest.agent(app.listen());
            done();
        })
        .catch(function(err) {
            console.error(err.toString());
            process.exit(1);
        });
});

// note that document.querySelector() works with CSS ids which are more restrictive than HTML5 ids,
// so getElementById() has to be used to find ObjectId ids instead of querySelector()

describe('Admin app'+' ('+app.env+')', function() {
    this.timeout(10e3); // 10 sec

    describe('login', function() {
        let location = null;

        it('has home page with login link in nav when not logged-in', async function() {
            const response = await request.get('/').set(headers);
            expect(response.status).to.equal(200, response.text);
            const document = new JsDom(response.text).window.document;
            expect(document.querySelector('title').textContent.slice(0, 11)).to.equal('The Whistle');
            expect(document.querySelectorAll('nav ul li').length).to.equal(2); // nav should be just '/', 'login'
        });

        it('redirects to / on login', async function() {
            const values = { username: testuser, password: testpass };
            const response = await request.post('/login').set(headers).send(values);
            expect(response.status).to.equal(302, response.text);
            expect(response.headers.location).to.equal('/');
        });

        it('has home page with full nav links when logged-in', async function() {
            // get from location supplied by home redirecgt
            const res1 = await request.get('/').set(headers);
            expect(res1.status).to.equal(302, res1.text);
            location = res1.headers.location;
            const response = await request.get(location).set(headers);
            expect(response.status).to.equal(200, response.text);
            const document = new JsDom(response.text).window.document;
            expect(document.querySelector('title').textContent).to.match(/.*Activity.+/);
            // nav should be /, reports, analysis×2, users, resources, notes×4, logout
            expect(document.querySelectorAll('header nav ul li').length).to.equal(11);
        });
    });

    describe('incident report', function() {
        let reportId = null;
        let imgFldr = 'test/img/';
        let imgFile = 's_gps.jpg';
        it('submits incident report', async function() {
            const values = {
                'generated-name':    'testy-tiger',
                date:                dateFormat(new Date(Date.now() - 1000*60*60*24), 'yyyy-mm-dd'), // yesterday in case of early-morning run
                time:                dateFormat('HH:MM'),
                'brief-description': 'test',
                'location-address':  'Mill Lane, Cambridge',
            };
            // sadly, it seems that superagent doesn't allow request.attach() to be used with
            // request.send(), so instead we need to use request.field()
            const responseEnter = await request.post('/report/sexual-assault').set(headers)
                .field('generated-name', 'testy-tiger')
                .field('date', dateFormat('yyyy-mm-dd'))
                .field('time', dateFormat('HH:MM'))
                .field('brief-description', 'test')
                .field('location-address', 'Mill Lane, Cambridge')
                .attach('documents', imgFldr+imgFile);
            expect(responseEnter.status).to.equal(302, responseEnter.text);
            const koaSession = base64.decode(responseEnter.headers['set-cookie'][0].match(/^koa:sess=([a-zA-Z0-9=.]+);.+/)[1]);
            expect(responseEnter.headers.location).to.equal('/report/sexual-assault/submit', koaSession); // koaSession['koa-flash'] fails??

            const responseSubmit = await request.post('/report/sexual-assault/submit').set(headers).send();
            expect(responseSubmit.status).to.equal(302, responseEnter.text);
            reportId = responseSubmit.headers['x-insert-id'];
            expect(responseSubmit.headers.location).to.equal(`/report/sexual-assault/${reportId}/confirm`);
            expect(reportId.length).to.equal(24);
            // note no test junk will be left in user-agents recording as long as test host
            // IP address (localhost or CI host) is excluded from user-agents recording
        });

        it('has new report in list of reports', async function() {
            const response = await request.get('/reports').set(headers);
            expect(response.status).to.equal(200, response.text);
            const document = new JsDom(response.text).window.document;
            expect(document.getElementById(reportId).querySelector('a').href).to.equal(`/reports/${reportId}`);
        });

        it('sees weather conditions in report page', async function() {
            const response = await request.get('/reports/'+reportId).set(headers);
            expect(response.status).to.equal(200, response.text);
            const document = new JsDom(response.text).window.document;
            const iconRe = new RegExp('^/img/weather/underground/icons/black/png/32x32/[a-z]+.png$');
            expect(document.querySelector('#weather div.weather-body img').src).to.match(iconRe);
        });

        it('sees uploaded image in report page', async function() {
            const response = await request.get('/reports/'+reportId).set(headers);
            expect(response.status).to.equal(200, response.text);
            const document = new JsDom(response.text).window.document;
            const src = `/test/sexual-assault/${dateFormat('yyyy-mm')}/${reportId}/${imgFile}`;
            expect(document.getElementById(imgFile).querySelector('td a').href).to.equal(src);
            expect(document.getElementById(imgFile).querySelector('td img').src).to.equal(src);
        });

        it('sees uploaded image exif metadata in report page', async function() {
            const response = await request.get('/reports/'+reportId).set(headers);
            expect(response.status).to.equal(200, response.text);
            const document = new JsDom(response.text).window.document;
            const src = `/test/sexual-assault/${dateFormat('yyyy-mm')}/${reportId}/${imgFile}`;
            const distRe = new RegExp('^340 km NNW from incident location')
            expect(document.getElementById(imgFile).querySelector('td.exif').textContent).to.match(distRe);
        });

        it('gets timestamp of new report (ajax)', async function() {
            const response = await request.get('/ajax/dashboard/reports/latest-timestamp').set(headers);
            expect(response.status).to.equal(200, response.text);
            expect(response.body.latest.timestamp).to.equal(ObjectId(reportId).getTimestamp().toISOString());
        });

        it('gets reports in bounding box', async function() {
            const response = await request.get('/ajax/reports/within/52.2,0.11:52.3,0.12').set(headers);
            expect(response.status).to.equal(200, response.text);
            expect(response.body.reports.filter(r => r._id == reportId).length).to.equal(1);
        });

        it('sets summary', async function() {
            const values = { summary: 'test report' };
            const responsePost = await request.post(`/reports/${reportId}`).set(headers).send(values);
            expect(responsePost.status).to.equal(302, responsePost.text);
            const response = await request.get(responsePost.headers.location).set(headers);
            expect(response.status).to.equal(200, response.text);
            const document = new JsDom(response.text).window.document;
            expect(document.querySelector('#summary').value).to.equal('test report');
            const matches = document.evaluate('count(//td[text()="Set summary to ‘test report’"])', document, null, 0, null);
            expect(matches.numberValue).to.equal(1);
        });

        it('sets report tag', async function() {
            const values = { tag: 'test' };
            const response = await request.post(`/ajax/reports/${reportId}/tags`).set(headers).send(values);
            expect(response.status).to.equal(201, response.text);
        });

        it('sees report in reports list filtered by tag', async function() {
            const response = await request.get('/reports?tag=test').set(headers);
            expect(response.status).to.equal(200, response.text);
            const document = new JsDom(response.text).window.document;
            expect(document.getElementById(reportId).nodeName).to.equal('TR');
        });

        it('sees update in report page', async function() {
            const response = await request.get('/reports/'+reportId).set(headers);
            expect(response.status).to.equal(200, response.text);
            const document = new JsDom(response.text).window.document;
            const matches = document.evaluate('count(//td[text()="Add tag ‘test’"])', document, null, 0, null);
            expect(matches.numberValue).to.equal(1);
        });

        // TODO: commentary tests

        it('deletes updates (tidyup)', async function() {
            const response = await request.delete(`/ajax/reports/${reportId}/updates/`).set(headers).send();
            expect(response.status).to.equal(200, response.text);
        });

        it('deletes incident report', async function() {
            const response = await request.post('/reports/'+reportId+'/delete').set(headers).send();
            expect(response.status).to.equal(302, response.text);
            expect(response.headers.location).to.equal('/reports');
        });
    });

    describe('users', function() {
        let userId = null;

        it('adds new user', async function() {
            const values = { firstname: 'Test', lastname: 'User', email: 'test@user.com', username: 'test', roles: 'admin', databases: 'test' };
            const response = await request.post('/users/add').set(headers).send(values);
            expect(response.status).to.equal(302, response.text);
            expect(response.headers.location).to.equal('/users');
            userId = response.headers['x-insert-id'];
        });

        it('lists users including test user', async function() {
            const response = await request.get('/users').set(headers);
            expect(response.status).to.equal(200, response.text);
            const document = new JsDom(response.text).window.document;
            expect(document.getElementById(userId).querySelector('td').textContent).to.equal('Test');
        });

        it('edits test user', async function() {
            const response = await request.get('/users/'+userId+'/edit').set(headers);
            expect(response.status).to.equal(200, response.text);
            const document = new JsDom(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal('Edit User Test User');
        });

        it('deletes test user', async function() {
            const response = await request.post('/users/'+userId+'/delete').set(headers);
            expect(response.status).to.equal(302, response.text);
            expect(response.headers.location).to.equal('/users');
        });

        it('returns 404 for non-existent user', async function() {
            const response = await request.get('/users/no-one-here-by-that-name').set(headers);
            expect(response.status).to.equal(404, response.text);
            const document = new JsDom(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal(':(');
        });
    });

    describe('centres', function() {
        let centreId = null;

        it('adds new centre', async function() {
            const values = { name: 'Test', description: 'Centre', lat: '51.1', lon: '-1.1' };
            const response = await request.post('/centres/add').set(headers).send(values);
            expect(response.status).to.equal(302, response.text);
            expect(response.headers.location).to.equal('/centres');
            centreId = response.headers['x-insert-id'];
        });

        it('lists centres including test centre', async function() {
            const response = await request.get('/centres').set(headers);
            expect(response.status).to.equal(200, response.text);
            const document = new JsDom(response.text).window.document;
            expect(document.getElementById(centreId).querySelector('td').textContent).to.equal('Test');
        });

        it('edits test centre', async function() {
            const response = await request.get('/centres/'+centreId+'/edit').set(headers);
            expect(response.status).to.equal(200, response.text);
            const document = new JsDom(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal('Edit centre Test');
        });

        it('deletes test centre', async function() {
            const response = await request.post('/centres/'+centreId+'/delete').set(headers);
            expect(response.status).to.equal(302, response.text);
            expect(response.headers.location).to.equal('/centres');
        });

        it('returns 404 for non-existent centre', async function() {
            const response = await request.get('/centres/no-one-here-by-that-name').set(headers);
            expect(response.status).to.equal(404, response.text);
            const document = new JsDom(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal(':(');
        });
    });

    describe('misc', function() {
        it('returns 404 for non-existent page', async function() {
            const response = await request.get('/zzzzzz').set(headers);
            expect(response.status).to.equal(404, response.text);
            const document = new JsDom(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal(':(');
        });
    });

    describe('logout', function() {
        it('logs out and redirects to /', async function() {
            const response = await request.get('/logout').set(headers);
            expect(response.status).to.equal(302, response.text);
            expect(response.headers.location).to.equal('/');
        });
    });
});
