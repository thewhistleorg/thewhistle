/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Report app integration/acceptance tests.                                        C.Veness 2017  */
/*                                                                                                */
/* Note that running this test will contribute to Weather Underground API invocation limits.      */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import supertest  from 'supertest';  // SuperAgent driven library for testing HTTP servers
import chai       from 'chai';       // BDD/TDD assertion library
import jsdom      from 'jsdom';      // JavaScript implementation of DOM and HTML standards
import dateFormat from 'dateformat'; // Steven Levithan's dateFormat()
const expect   = chai.expect;

import app from '../../app.js';

const testuser = process.env.TESTUSER; // note testuser must have access to test-grn only
const testpass = process.env.TESTPASS; // (for successful login & sexual-assault report submission)


const request = supertest.agent(app.listen());

const headers = { Host: 'report.localhost:3000' }; // set host header

describe('Report app'+' ('+app.env+')', function() {
    this.timeout(10e3); // 10 sec

    let reportId = null;

    describe('report app home page', function() {
        it('sees home page', async function() {
            const response = await request.get('/').set(headers);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('title').textContent).to.equal('The Whistle Eyewitness Report');
        });
    });

    describe('404s', function() {
        it('fails on bad org’n', async function() {
            const response = await request.get('/no-such-organisation').set(headers);
            expect(response.status).to.equal(404);
        });

        it('fails on bad org’n/project', async function() {
            const response = await request.get('/no-such-organisation/no-such-project').set(headers);
            expect(response.status).to.equal(404);
        });

        it('fails on bad org’n/project/page', async function() {
            const response = await request.get('/no-such-organisation/no-such-project/1').set(headers);
            expect(response.status).to.equal(404);
        });

        it('fails on bad project', async function() {
            const response = await request.get('/test-grn/no-such-project').set(headers);
            expect(response.status).to.equal(404);
        });

        it('ajax: returns 404 for unrecognised project', async function() {
            const response = await request.get('/ajax/no-such-project').set(headers);
            expect(response.status).to.equal(404);
        });

        it('ajax: returns 404 for unrecognised function', async function() {
            const response = await request.get('/ajax/test-grn/no-such-function').set(headers);
            expect(response.status).to.equal(404);
        });
    });

    describe('text-grn/sexual-assault inaccessible pages', function() {
        it('request for page 2 gets redirected to home page', async function() {
            const response = await request.get('/test-grn/sexual-assault/2').set(headers);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/test-grn/sexual-assault');
        });

        it('submit with no session gets redirected to home page', async function() {
            const response = await request.post('/test-grn/sexual-assault/submit').set(headers).send({});
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/test-grn/sexual-assault');
        });
    });

    describe('text-grn/sexual-assault', function() {
        it('sees home page', async function() {
            const responseGet = await request.get('/test-grn/sexual-assault').set(headers);
            expect(responseGet.status).to.equal(200);
            const document = new jsdom.JSDOM(responseGet.text).window.document;
            expect(document.querySelector('title').textContent).to.equal('The Whistle / Global Rights Nigeria Incident Report');
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Get started');

            const values = { 'nav-next': 'next' };
            const responsePost = await request.post('/test-grn/sexual-assault').set(headers).send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal('/test-grn/sexual-assault/1');
        });

        it('sees/submits page 1', async function() {
            const responseGet = await request.get('/test-grn/sexual-assault/1').set(headers);
            expect(responseGet.status).to.equal(200);
            const document = new jsdom.JSDOM(responseGet.text).window.document;
            expect(document.querySelector('#progress').textContent.trim()).to.equal('Step 1 of 7');
            expect(document.querySelectorAll('input')).to.have.lengthOf(2);
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Continue');

            const values = {
                'on-behalf-of': 'myself',
                'nav-next':     'next',
            };
            const responsePost = await request.post('/test-grn/sexual-assault/1').set(headers).send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal('/test-grn/sexual-assault/2');
        });

        it('doesn’t allow access beyond next page', async function() {
            const response = await request.get('/test-grn/sexual-assault/3').set(headers);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/test-grn/sexual-assault/2');
        });

        it('doesn’t allow post beyond next page', async function() {
            const response = await request.post('/test-grn/sexual-assault/3').set(headers).send({});
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/test-grn/sexual-assault/2');
        });

        it('sees/submits page 2', async function() {
            const responseGet = await request.get('/test-grn/sexual-assault/2').set(headers);
            expect(responseGet.status).to.equal(200);
            const document = new jsdom.JSDOM(responseGet.text).window.document;
            expect(document.querySelector('#progress').textContent.trim()).to.equal('Step 2 of 7');
            expect(document.querySelectorAll('input')).to.have.lengthOf(11);
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Continue');

            const values = {
                'when':            'date',
                'date':            { day: dateFormat('d'), month: dateFormat('mmm'), year: dateFormat('yyyy'), hour: '', minute: '' },
                'within-options':  '',
                'still-happening': 'n',
                'nav-next':        'next',
            };
            const responsePost = await request.post('/test-grn/sexual-assault/2').set(headers).send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal('/test-grn/sexual-assault/3');
        });

        it('sees/submits page 3', async function() {
            const responseGet = await request.get('/test-grn/sexual-assault/3').set(headers);
            expect(responseGet.status).to.equal(200);
            const document = new jsdom.JSDOM(responseGet.text).window.document;
            expect(document.querySelector('#progress').textContent.trim()).to.equal('Step 3 of 7');
            expect(document.querySelectorAll('input')).to.have.lengthOf(1);
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Continue');

            const values = {
                'description': 'erroneous description',
                'nav-next':    'next',
            };
            const responsePost = await request.post('/test-grn/sexual-assault/3').set(headers).send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal('/test-grn/sexual-assault/4');
        });

        it('sees page 4 & goes back to page 3', async function() {
            const responseGet = await request.get('/test-grn/sexual-assault/4').set(headers);
            expect(responseGet.status).to.equal(200);
            const document = new jsdom.JSDOM(responseGet.text).window.document;
            expect(document.querySelector('#progress').textContent.trim()).to.equal('Step 4 of 7');
            expect(document.querySelectorAll('input')).to.have.lengthOf(4);
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Continue');

            const values = {
                'nav-prev': 'prev',
            };
            const responsePost = await request.post('/test-grn/sexual-assault/4').set(headers).send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal('/test-grn/sexual-assault/3');
        });

        it('sees page 3 & submits corrected description with file', async function() {
            const responseGet = await request.get('/test-grn/sexual-assault/3').set(headers);
            expect(responseGet.status).to.equal(200);
            const document = new jsdom.JSDOM(responseGet.text).window.document;
            expect(document.querySelector('#progress').textContent.trim()).to.equal('Step 3 of 7');
            expect(document.querySelectorAll('textarea')).to.have.lengthOf(1);
            expect(document.querySelectorAll('input')).to.have.lengthOf(1);
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Continue');

            expect(document.querySelector('textarea').textContent).to.equal('erroneous description');

            const values = {
                'description': 'Test',
                'nav-next':    'next',
            };
            const imgFldr = 'test/img/';
            const imgFile = 's_gps.jpg';
            // superagent doesn't allow request.attach() to be used with request.send(), so instead use request.field()
            const responsePost = await request.post('/test-grn/sexual-assault/3').set(headers)
                .field('description', values['description'])
                .field('nav-next', values['nav-next'])
                .attach('documents', imgFldr+imgFile);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal('/test-grn/sexual-assault/4');
        });

        it('sees/submits page 4', async function() {
            const responseGet = await request.get('/test-grn/sexual-assault/4').set(headers);
            expect(responseGet.status).to.equal(200);
            const document = new jsdom.JSDOM(responseGet.text).window.document;
            expect(document.querySelector('#progress').textContent.trim()).to.equal('Step 4 of 7');
            expect(document.querySelectorAll('input')).to.have.lengthOf(4);
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Continue');

            const values = {
                where:        'at',
                'at-address': 'University of Lagos',
                'nav-next':   'next',
            };
            const responsePost = await request.post('/test-grn/sexual-assault/4').set(headers).send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal('/test-grn/sexual-assault/5');
        });

        it('sees/submits page 5', async function() {
            const responseGet = await request.get('/test-grn/sexual-assault/5').set(headers);
            expect(responseGet.status).to.equal(200);
            const document = new jsdom.JSDOM(responseGet.text).window.document;
            expect(document.querySelector('#progress').textContent.trim()).to.equal('Step 5 of 7');
            expect(document.querySelectorAll('input')).to.have.lengthOf(3);
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Continue');

            const values = {
                'who-relationship': '',
                'who':              'n',
                'who-description':  'A death eater',
                'nav-next':         'next',
            };
            const responsePost = await request.post('/test-grn/sexual-assault/5').set(headers).send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal('/test-grn/sexual-assault/6');
        });

        it('sees/submits page 6', async function() {
            const responseGet = await request.get('/test-grn/sexual-assault/6').set(headers);
            expect(responseGet.status).to.equal(200);
            const document = new jsdom.JSDOM(responseGet.text).window.document;
            expect(document.querySelector('#progress').textContent.trim()).to.equal('Step 6 of 7');
            expect(document.querySelectorAll('input')).to.have.lengthOf(6);
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Continue');

            const values = {
                'action-taken-other-details': '',
                'nav-next':                   'next',
            };
            const responsePost = await request.post('/test-grn/sexual-assault/6').set(headers).send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal('/test-grn/sexual-assault/7');
        });

        it('sees/submits page 7', async function() {
            const responseGet = await request.get('/test-grn/sexual-assault/7').set(headers);
            expect(responseGet.status).to.equal(200);
            const document = new jsdom.JSDOM(responseGet.text).window.document;
            expect(document.querySelector('#progress').textContent.trim()).to.equal('Step 7 of 7');
            expect(document.querySelectorAll('input')).to.have.lengthOf(4);
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Continue');

            const values = {
                'existing-name':  '',
                'used-before':    'n',
                'generated-name': 'testy terrain',
                'nav-next':       'next',
            };
            const responsePost = await request.post('/test-grn/sexual-assault/7').set(headers).send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal('/test-grn/sexual-assault/submit');
        });

        it('ajax: gets a new random name', async function() {
            const response = await request.get('/ajax/test-grn/names/new').set(headers);
            expect(response.status).to.equal(200);
            expect(response.body.name.split(' ')).to.have.lengthOf(2);
        });

        it('ajax: checks ‘testy terrain’ is not already used', async function() {
            const response = await request.get('/ajax/test-grn/names/testy+terrain').set(headers);
            expect(response.status).to.equal(404);
        });

        it('sees review/submit page', async function() {
            const response = await request.get('/test-grn/sexual-assault/submit').set(headers);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal('Check before you send the report');
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Send the report');

            const reportInfo = document.querySelector('table.js-obj-to-html');
            const ths = reportInfo.querySelectorAll('th');
            const tds = reportInfo.querySelectorAll('td');
            expect(ths[0].textContent).to.equal('On behalf of');
            expect(tds[0].textContent).to.equal('myself');
            expect(ths[1].textContent).to.equal('Date');
            expect(tds[1].textContent).to.equal(dateFormat('d mmm yyyy')+' 00:00');
            expect(ths[2].textContent).to.equal('Still happening');
            expect(tds[2].textContent).to.equal('no');
            expect(ths[3].textContent).to.equal('Description');
            expect(tds[3].textContent).to.equal('Test');
            expect(ths[4].textContent).to.equal('Where');
            expect(tds[4].textContent).to.equal('University of Lagos');
            expect(ths[5].textContent).to.equal('Who');
            expect(tds[5].textContent).to.equal('Not known: A death eater');
            expect(ths[6].textContent).to.equal('Action taken');
            expect(tds[6].textContent).to.equal('—');
            expect(ths[7].textContent).to.equal('Generated name');
            expect(tds[7].textContent).to.equal('testy terrain');
        });

        it('submits review/submit page', async function() {
            const values = { 'submit': 'submit' };
            const response = await request.post('/test-grn/sexual-assault/submit').set(headers).send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/test-grn/sexual-assault/whatnext');
            reportId = response.headers['x-insert-id'];
            console.info('report id', reportId);
        });

        it('sees whatnext page', async function() {
            const responseGet = await request.get('/test-grn/sexual-assault/whatnext').set(headers);
            expect(responseGet.status).to.equal(200);
            const document = new jsdom.JSDOM(responseGet.text).window.document;
            expect(document.querySelector('h1').textContent.trim()).to.equal('✔ We’ve received your report');
            expect(document.querySelectorAll('tr')).to.have.lengthOf(39); // local resources
        });
    });

    describe('submitted report in admin app', function() {
        const headersAdmin = { Host: 'admin.localhost:3000' }; // set host header

        it('redirects to /reports on login', async function() {
            const values = { username: testuser, password: testpass };
            const response = await request.post('/login/reports').set(headersAdmin).send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/reports');
        });

        it('sees new report with nicely formatted information', async function() {
            const response = await request.get(`/reports/${reportId}`).set(headersAdmin);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            const reportInfo = document.querySelector('div.js-obj-to-html');
            const h3s = reportInfo.querySelectorAll('h3');
            expect(h3s[0].textContent).to.equal('On behalf of');
            expect(h3s[0].nextSibling.textContent).to.equal('myself');
            expect(h3s[1].textContent).to.equal('Date');
            expect(h3s[1].nextSibling.textContent).to.equal(dateFormat('d mmm yyyy')+' 00:00');
            expect(h3s[2].textContent).to.equal('Still happening');
            expect(h3s[2].nextSibling.textContent).to.equal('no');
            expect(h3s[3].textContent).to.equal('Description');
            expect(h3s[3].nextSibling.textContent).to.equal('Test');
            expect(h3s[4].textContent).to.equal('Where');
            expect(h3s[4].nextSibling.textContent).to.equal('University of Lagos');
            expect(h3s[5].textContent).to.equal('Who');
            expect(h3s[5].nextSibling.textContent).to.equal('Not known: A death eater');
            expect(h3s[6].textContent).to.equal('Action taken');
            expect(h3s[6].nextSibling.textContent).to.equal('—');
            expect(h3s[7].textContent).to.equal('Generated name');
            expect(h3s[7].nextSibling.textContent).to.equal('testy terrain');
        });

        it('deletes submitted incident report', async function() {
            const response = await request.post(`/reports/${reportId}/delete`).set(headersAdmin).send();
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/reports');
        });

        it('logs out', async function() {
            const response = await request.get('/logout').set(headersAdmin);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/');
        });
    });
});
