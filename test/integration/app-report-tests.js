/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Report app integration/acceptance tests.                                   C.Veness 2017-2018  */
/*                                                                                                */
/* These tests require report.localhost to be set in /etc/hosts.                                  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import supertest  from 'supertest';  // SuperAgent driven library for testing HTTP servers
import chai       from 'chai';       // BDD/TDD assertion library
import jsdom      from 'jsdom';      // JavaScript implementation of DOM and HTML standards
import dateFormat from 'dateformat'; // Steven Levithan's dateFormat()
const expect = chai.expect;

import app from '../../app.js';

const testuser = process.env.TESTUSER; // note testuser must have access to test-grn only
const testpass = process.env.TESTPASS; // (for successful login & sexual-assault report submission)


const request = supertest.agent(app.listen()).host('report.localhost');

describe(`Report app (test-grn/${app.env})`, function() {
    this.timeout(10e3); // 10 sec

    let reportId = null;

    describe('report app home page', function() {
        it('sees home page', async function() {
            const response = await request.get('/');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('title').textContent).to.equal('The Whistle Eyewitness Report');
        });
    });

    describe('404s', function() {
        it('fails on bad org’n', async function() {
            const response = await request.get('/no-such-organisation');
            expect(response.status).to.equal(404);
        });

        it('fails on bad org’n/project', async function() {
            const response = await request.get('/no-such-organisation/no-such-project');
            expect(response.status).to.equal(404);
        });

        it('fails on bad org’n/project/page', async function() {
            const response = await request.get('/no-such-organisation/no-such-project/1');
            expect(response.status).to.equal(404);
        });

        it('fails on bad project', async function() {
            const response = await request.get('/test-grn/no-such-project');
            expect(response.status).to.equal(404);
        });

        it('ajax: returns 404 for unrecognised project', async function() {
            const response = await request.get('/ajax/no-such-project');
            expect(response.status).to.equal(404);
        });

        it('ajax: returns 404 for unrecognised function', async function() {
            const response = await request.get('/ajax/test-grn/no-such-function');
            expect(response.status).to.equal(404);
        });
    });

    describe('test-grn/sexual-assault inaccessible pages', function() {
        it('request for page 2 gets redirected to home page', async function() {
            const response = await request.get('/test-grn/sexual-assault/2');
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/test-grn/sexual-assault');
        });

        it('submit with no session gets redirected to home page', async function() {
            const response = await request.post('/test-grn/sexual-assault/submit').send({});
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/test-grn/sexual-assault');
        });
    });

    describe('test-grn/sexual-assault', function() {
        it('checks previous test report is not left undeleted', async function() {
            const response = await request.get('/ajax/test-grn/aliases/testy+terrain');
            expect(response.status).to.equal(404);
        });

        it('sees home page', async function() {
            const responseGet = await request.get('/test-grn/sexual-assault');
            expect(responseGet.status).to.equal(200);
            const document = new jsdom.JSDOM(responseGet.text).window.document;
            expect(document.querySelector('title').textContent).to.equal('The Whistle / Global Rights Nigeria Incident Report');
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Get started');

            const values = { 'nav-next': 'next' };
            const responsePost = await request.post('/test-grn/sexual-assault').send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal('/test-grn/sexual-assault/1');
        });

        it('sees/submits page 1 (on-behalf-of)', async function() {
            const responseGet = await request.get('/test-grn/sexual-assault/1');
            expect(responseGet.status).to.equal(200);
            const document = new jsdom.JSDOM(responseGet.text).window.document;
            expect( [ ...document.querySelectorAll('table.progress td') ].map(td => td.textContent.trim()).join()).to.equal('1,2,3,4,5,6,7');
            expect(document.querySelectorAll('table.progress td')[0].classList.contains('current')).to.be.true;
            expect(document.querySelectorAll('input')).to.have.lengthOf(2);
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Submit and continue');

            const values = {
                'on-behalf-of': 'myself',
                'nav-next':     'next',
            };
            const responsePost = await request.post('/test-grn/sexual-assault/1').send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal('/test-grn/sexual-assault/2');
        });

        it('returns to index page on back button', async function() {
            const values = {
                'nav-prev': 'prev',
            };
            const responsePost = await request.post('/test-grn/sexual-assault/1').send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal('/test-grn/sexual-assault/');
        });

        it('doesn’t allow access beyond next page', async function() {
            const response = await request.get('/test-grn/sexual-assault/3');
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/test-grn/sexual-assault/2');
        });

        it('doesn’t allow post beyond next page', async function() {
            const response = await request.post('/test-grn/sexual-assault/3').send({});
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/test-grn/sexual-assault/2');
        });

        it('sees/submits page 2 (when)', async function() {
            const responseGet = await request.get('/test-grn/sexual-assault/2');
            expect(responseGet.status).to.equal(200);
            const document = new jsdom.JSDOM(responseGet.text).window.document;
            expect([ ...document.querySelectorAll('table.progress td') ].map(td => td.textContent.trim()).join()).to.equal('1,2,3,4,5,6,7');
            expect(document.querySelectorAll('table.progress td')[1].classList.contains('current')).to.be.true;
            expect(document.querySelectorAll('input')).to.have.lengthOf(5);
            expect(document.querySelectorAll('select')).to.have.lengthOf(5);
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Submit and continue');

            const values = {
                'when':            'date',
                'date':            { day: dateFormat('d'), month: dateFormat('mmm'), year: dateFormat('yyyy'), hour: '', minute: '' },
                'within-options':  '',
                'still-happening': 'n',
                'nav-next':        'next',
            };
            const responsePost = await request.post('/test-grn/sexual-assault/2').send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal('/test-grn/sexual-assault/3');
        });

        it('sees/submits page 3 (where)', async function() {
            const responseGet = await request.get('/test-grn/sexual-assault/3');
            expect(responseGet.status).to.equal(200);
            const document = new jsdom.JSDOM(responseGet.text).window.document;
            expect([ ...document.querySelectorAll('table.progress td') ].map(td => td.textContent.trim()).join()).to.equal('1,2,3,4,5,6,7');
            expect(document.querySelectorAll('table.progress td')[2].classList.contains('current')).to.be.true;
            expect(document.querySelectorAll('input')).to.have.lengthOf(3);
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Submit and continue');

            const values = {
                where:        'at',
                'at-address': 'University of Lagos',
                'nav-next':   'next',
            };
            const responsePost = await request.post('/test-grn/sexual-assault/3').send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal('/test-grn/sexual-assault/4');
        });

        it('sees/submits page 4 (description)', async function() {
            const responseGet = await request.get('/test-grn/sexual-assault/4');
            expect(responseGet.status).to.equal(200);
            const document = new jsdom.JSDOM(responseGet.text).window.document;
            expect([ ...document.querySelectorAll('table.progress td') ].map(td => td.textContent.trim()).join()).to.equal('1,2,3,4,5,6,7');
            expect(document.querySelectorAll('table.progress td')[3].classList.contains('current')).to.be.true;
            expect(document.querySelectorAll('input')).to.have.lengthOf(1);
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Submit and continue');

            const values = {
                'description': 'erroneous description',
                'nav-next':    'next',
            };
            const responsePost = await request.post('/test-grn/sexual-assault/4').send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal('/test-grn/sexual-assault/5');
        });

        it('sees/submits page 5 (who)', async function() {
            const responseGet = await request.get('/test-grn/sexual-assault/5');
            expect(responseGet.status).to.equal(200);
            const document = new jsdom.JSDOM(responseGet.text).window.document;
            expect([ ...document.querySelectorAll('table.progress td') ].map(td => td.textContent.trim()).join()).to.equal('1,2,3,4,5,6,7');
            expect(document.querySelectorAll('table.progress td')[4].classList.contains('current')).to.be.true;
            expect(document.querySelectorAll('input')).to.have.lengthOf(3);
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Submit and continue');

            const values = {
                'who-relationship': '',
                'who':              'n',
                'who-description':  'A death eater',
                'nav-next':         'next',
            };
            const responsePost = await request.post('/test-grn/sexual-assault/5').send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal('/test-grn/sexual-assault/6');
        });

        it('sees/submits page 6 (action-taken)', async function() {
            const responseGet = await request.get('/test-grn/sexual-assault/6');
            expect(responseGet.status).to.equal(200);
            const document = new jsdom.JSDOM(responseGet.text).window.document;
            expect([ ...document.querySelectorAll('table.progress td') ].map(td => td.textContent.trim()).join()).to.equal('1,2,3,4,5,6,7');
            expect(document.querySelectorAll('table.progress td')[5].classList.contains('current')).to.be.true;
            expect(document.querySelectorAll('input')).to.have.lengthOf(5);
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Submit and continue');

            const values = {
                'action-taken-other-details': '',
                'nav-next':                   'next',
            };
            const responsePost = await request.post('/test-grn/sexual-assault/6').send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal('/test-grn/sexual-assault/7');
        });

        it('sees page 7 & goes back to page 6', async function() {
            const responseGet = await request.get('/test-grn/sexual-assault/7');
            expect(responseGet.status).to.equal(200);
            const document = new jsdom.JSDOM(responseGet.text).window.document;
            expect([ ...document.querySelectorAll('table.progress td') ].map(td => td.textContent.trim()).join()).to.equal('1,2,3,4,5,6,7');
            expect(document.querySelectorAll('table.progress td')[6].classList.contains('current')).to.be.true;
            expect(document.querySelectorAll('input')).to.have.lengthOf(4);
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Submit and continue');

            const values = {
                'nav-prev': 'prev',
            };
            const responsePost = await request.post('/test-grn/sexual-assault/7').send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal('/test-grn/sexual-assault/6');
        });

        it('sees page 4 & submits corrected description with file', async function() {
            const responseGet = await request.get('/test-grn/sexual-assault/4');
            expect(responseGet.status).to.equal(200);
            const document = new jsdom.JSDOM(responseGet.text).window.document;
            expect([ ...document.querySelectorAll('table.progress td') ].map(td => td.textContent.trim()).join()).to.equal('1,2,3,4,5,6,7');
            expect(document.querySelectorAll('table.progress td')[3].classList.contains('current')).to.be.true;
            expect(document.querySelectorAll('textarea')).to.have.lengthOf(1);
            expect(document.querySelectorAll('input')).to.have.lengthOf(1);
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Submit and continue');

            expect(document.querySelector('textarea').textContent).to.equal('erroneous description');

            const values = {
                'description': 'Test',
                'nav-next':    'next',
            };
            const imgFldr = 'test/img/';
            const imgFile = 's_gps.jpg';
            // superagent doesn't allow request.attach() to be used with request.send(), so instead use request.field()
            const responsePost = await request.post('/test-grn/sexual-assault/6')
                .field('description', values['description'])
                .field('nav-next', values['nav-next'])
                .attach('documents', imgFldr+imgFile);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal('/test-grn/sexual-assault/7');
        });

        it('sees/submits page 7', async function() {
            const responseGet = await request.get('/test-grn/sexual-assault/7');
            expect(responseGet.status).to.equal(200);
            const document = new jsdom.JSDOM(responseGet.text).window.document;
            expect([ ...document.querySelectorAll('table.progress td') ].map(td => td.textContent.trim()).join()).to.equal('1,2,3,4,5,6,7');
            expect(document.querySelectorAll('table.progress td')[6].classList.contains('current')).to.be.true;
            expect(document.querySelectorAll('input')).to.have.lengthOf(4);
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Submit and continue');

            const values = {
                'existing-alias':  '',
                'used-before':     'n',
                'generated-alias': 'testy terrain',
                'nav-next':        'next',
            };
            const responsePost = await request.post('/test-grn/sexual-assault/7').send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal('/test-grn/sexual-assault/submit');
        });

        it('ajax: gets a new random alias', async function() {
            const response = await request.get('/ajax/test-grn/aliases/new');
            expect(response.status).to.equal(200);
            expect(response.body.alias.split(' ')).to.have.lengthOf(2);
        });

        it('ajax: checks ‘testy terrain’ is not already used', async function() {
            const response = await request.get('/ajax/test-grn/aliases/testy+terrain');
            expect(response.status).to.equal(404);
        });

        it('sees review/submit page', async function() {
            const response = await request.get('/test-grn/sexual-assault/submit');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal('Check before you send the report');
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Send the report');

            const reportInfo = document.querySelector('table.js-obj-to-html');
            const ths = reportInfo.querySelectorAll('th');
            const tds = reportInfo.querySelectorAll('td');
            expect(ths[0].textContent).to.equal('On behalf of');
            expect(tds[0].textContent).to.equal('Myself');
            expect(ths[1].textContent).to.equal('Date');
            expect(tds[1].textContent).to.equal(dateFormat('d mmm yyyy'));
            expect(ths[2].textContent).to.equal('Still happening?');
            expect(tds[2].textContent).to.equal('no');
            expect(ths[3].textContent).to.equal('Where');
            expect(tds[3].textContent).to.equal('University of Lagos');
            expect(ths[4].textContent).to.equal('Who');
            expect(tds[4].textContent).to.equal('Not known: A death eater');
            expect(ths[5].textContent).to.equal('Spoken to anybody?');
            expect(tds[5].textContent).to.equal('—');
            expect(ths[6].textContent).to.equal('Description');
            expect(tds[6].textContent).to.equal('Test');
            expect(ths[7].textContent).to.equal('Alias');
            expect(tds[7].textContent).to.equal('testy terrain');
        });

        it('submits report', async function() {
            const values = { 'submit': 'submit' };
            const response = await request.post('/test-grn/sexual-assault/submit').send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/test-grn/sexual-assault/whatnext');
            reportId = response.headers['x-insert-id'];
            console.info('report id', reportId);
        });

        it('sees whatnext page', async function() {
            const response = await request.get('/test-grn/sexual-assault/whatnext');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent.trim()).to.equal('✔ We’ve received your report');
            expect(document.querySelectorAll('tr')).to.have.lengthOf(0); // local resources
        });

        it('ajax: fails to geocode bad address', async function() {
            const response = await request.get('/ajax/geocode?address=this+address+doesnt+have+a+location');
            expect(response.status).to.equal(404);
        });

        it('ajax: geocodes address', async function() {
            const response = await request.get('/ajax/geocode?address=university+of+lagos,+nigeria');
            expect(response.status).to.equal(200);
            expect(response.body.formattedAddress).to.equal('University Road 101017 Akoka,, Yaba,, Lagos State., Nigeria');
        });

        it('ajax: geocodes address using CORS', async function() {
            const response = await request.get('/ajax/geocode?address=university+of+lagos,+nigeria').set('Origin', 'http://rapeisacrime.org');
            expect(response.status).to.equal(200);
            expect(response.body.formattedAddress).to.equal('University Road 101017 Akoka,, Yaba,, Lagos State., Nigeria');
            expect(response.headers['access-control-allow-origin']).to.equal('http://rapeisacrime.org');
        });

        it('sees whatnext resources', async function() {
            const response = await request.get('/test-grn/sexual-assault/whatnext?address=university+of+lagos,+nigeria');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent.trim()).to.equal('✔ We’ve received your report');
            expect(document.querySelectorAll('tr')).to.have.lengthOf(39); // local resources
        });

        it('submits whatnext "back to start"', async function() {
            const values = { 'submit': 'end' };
            const response = await request.post('/test-grn/sexual-assault/submit').send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/test-grn/sexual-assault');
        });
    });

    describe('submitted report in admin app', function() {
        it('redirects to /reports on login', async function() {
            const values = { username: testuser, password: testpass };
            const response = await request.host('admin.localhost').post('/login/reports').send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/reports');
        });

        it('sees new report with nicely formatted information', async function() {
            const response = await request.host('admin.localhost').get(`/reports/${reportId}`);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            const reportInfo = document.querySelector('table.js-obj-to-html');
            const ths = reportInfo.querySelectorAll('th');
            expect(ths[0].textContent).to.equal('On behalf of');
            expect(ths[0].nextSibling.textContent).to.equal('Myself');
            expect(ths[1].textContent).to.equal('Date');
            expect(ths[1].nextSibling.textContent).to.equal(dateFormat('d mmm yyyy'));
            expect(ths[2].textContent).to.equal('Still happening?');
            expect(ths[2].nextSibling.textContent).to.equal('no');
            expect(ths[3].textContent).to.equal('Where');
            expect(ths[3].nextSibling.textContent).to.equal('University of Lagos');
            expect(ths[4].textContent).to.equal('Who');
            expect(ths[4].nextSibling.textContent).to.equal('Not known: A death eater');
            expect(ths[5].textContent).to.equal('Spoken to anybody?');
            expect(ths[5].nextSibling.textContent).to.equal('—');
            expect(ths[6].textContent).to.equal('Description');
            expect(ths[6].nextSibling.textContent).to.equal('Test');
            expect(ths[7].textContent).to.equal('Alias');
            expect(ths[7].nextSibling.textContent).to.equal('testy terrain');
        });

        it('sees report in submissions page', async function() {
            const response = await request.get('/dev/submissions');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.getElementById(reportId).textContent).to.equal(reportId);
        });

        it('deletes submitted incident report', async function() {
            const response = await request.host('admin.localhost').post(`/reports/${reportId}/delete`).send();
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/reports');
        });

        it('logs out', async function() {
            const response = await request.host('report.localhost').get('/logout');
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/');
        });
    });

    describe('single page report submission', function() {
        const report = '/test-grn/sexual-assault/internal';
        it('redirects to login page when not logged-in', async function() {
            const response = await request.get(report);
            expect(response.status).to.equal(302);
            // note redirect has full url as it is changing subdomains
            expect(response.headers.location.slice(-report.length-8)).to.equal('/login/-'+report);
        });

        it('logs in', async function() {
            request.host('admin.localhost');
            const values = { username: testuser, password: testpass };
            const response = await request.post('/login/-'+report).send(values);
            expect(response.status).to.equal(302);
            // note redirect has full url as it is changing subdomains
            expect(response.headers.location.slice(-report.length)).to.equal(report);
        });
        it('shows logged in user on login page when logged-in', async function() {
            const response = await request.get('/login');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('#name').textContent).to.equal('tester');
            expect(document.querySelector('#db').textContent).to.equal('test-grn');
        });

        it('sees report submission page', async function() {
            request.host('report.localhost');
            const response = await request.get(report);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('title').textContent).to.equal('The Whistle / Global Rights Nigeria Incident Report');
        });

        it('posts report details', async function() {
            const values = {
                'on-behalf-of':               'myself',
                'when':                       'date',
                'date.day':                   dateFormat('d'),
                'date.month':                 dateFormat('mmm'),
                'date.year':                  dateFormat('yyyy'),
                'date.hour':                  '',
                'date.minute':                '',
                'within-options':             '',
                'still-happening':            'n',
                'description':                'Single-page submission test',
                'where':                      'at',
                'at-address':                 'University of Lagos',
                'who-relationship':           '',
                'who':                        'n',
                'who-description':            'A death eater',
                'action-taken-other-details': '',
                'existing-alias':             '',
                'used-before':                'n',
                'generated-alias':            'testy terrain',
                'nav-next':                   'next',
            };
            const response = await request.post(report).send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/test-grn/sexual-assault/submit');
        });

        it('sees report confirmation page', async function() {
            const response = await request.get('/test-grn/sexual-assault/submit'); // note no 'internal'
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent).to.equal('Check before you send the report');
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Send the report');

            const reportInfo = document.querySelector('table.js-obj-to-html');
            const ths = reportInfo.querySelectorAll('th');
            const tds = reportInfo.querySelectorAll('td');
            expect(ths[0].textContent).to.equal('On behalf of');
            expect(tds[0].textContent).to.equal('Myself');
            expect(ths[1].textContent).to.equal('Date');
            expect(tds[1].textContent).to.equal(dateFormat('d mmm yyyy'));
            expect(ths[2].textContent).to.equal('Still happening?');
            expect(tds[2].textContent).to.equal('no');
            expect(ths[3].textContent).to.equal('Where');
            expect(tds[3].textContent).to.equal('University of Lagos');
            expect(ths[4].textContent).to.equal('Who');
            expect(tds[4].textContent).to.equal('Not known: A death eater');
            expect(ths[5].textContent).to.equal('Spoken to anybody?');
            expect(tds[5].textContent).to.equal('—');
            expect(ths[6].textContent).to.equal('Description');
            expect(tds[6].textContent).to.equal('Single-page submission test');
            expect(ths[7].textContent).to.equal('Alias');
            expect(tds[7].textContent).to.equal('testy terrain');
        });


        it('submits report', async function() {
            const values = { 'submit': 'submit' };
            const response = await request.post('/test-grn/sexual-assault/submit').send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/test-grn/sexual-assault/whatnext');
            reportId = response.headers['x-insert-id'];
            console.info('report id', reportId);
        });

        it('sees whatnext page', async function() {
            const response = await request.get('/test-grn/sexual-assault/whatnext');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent.trim()).to.equal('✔ We’ve received your report');
            expect(document.querySelectorAll('tr')).to.have.lengthOf(0); // local resources
        });

        it('sees whatnext resources', async function() {
            const response = await request.get('/test-grn/sexual-assault/whatnext?address=university+of+lagos');
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent.trim()).to.equal('✔ We’ve received your report');
            expect(document.querySelectorAll('tr')).to.have.lengthOf(39); // local resources
        });

    });

    describe('single page report in admin app', function() {
        it('sees new report with nicely formatted information', async function() {
            const response = await request.host('admin.localhost').get(`/reports/${reportId}`);
            expect(response.status).to.equal(200);
            const document = new jsdom.JSDOM(response.text).window.document;
            const reportInfo = document.querySelector('table.js-obj-to-html');
            const ths = reportInfo.querySelectorAll('th');
            expect(ths[0].textContent).to.equal('On behalf of');
            expect(ths[0].nextSibling.textContent).to.equal('Myself');
            expect(ths[1].textContent).to.equal('Date');
            expect(ths[1].nextSibling.textContent).to.equal(dateFormat('d mmm yyyy'));
            expect(ths[2].textContent).to.equal('Still happening?');
            expect(ths[2].nextSibling.textContent).to.equal('no');
            expect(ths[3].textContent).to.equal('Where');
            expect(ths[3].nextSibling.textContent).to.equal('University of Lagos');
            expect(ths[4].textContent).to.equal('Who');
            expect(ths[4].nextSibling.textContent).to.equal('Not known: A death eater');
            expect(ths[5].textContent).to.equal('Spoken to anybody?');
            expect(ths[5].nextSibling.textContent).to.equal('—');
            expect(ths[6].textContent).to.equal('Description');
            expect(ths[6].nextSibling.textContent).to.equal('Single-page submission test');
            expect(ths[7].textContent).to.equal('Alias');
            expect(ths[7].nextSibling.textContent).to.equal('testy terrain');
        });


        it('deletes submitted incident report', async function() {
            const response = await request.host('admin.localhost').post(`/reports/${reportId}/delete`).send();
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/reports');
        });

        it('logs out', async function() {
            const response = await request.host('report.localhost').get('/logout');
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/');
        });
    });
});
