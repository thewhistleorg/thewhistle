/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Report app integration/acceptance tests.                                   C.Veness 2017-2018  */
/*                                                                                                */
/* These tests require report.localhost to be set in /etc/hosts.                                  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import supertest    from 'supertest';  // SuperAgent driven library for testing HTTP servers
import { expect }   from 'chai';       // BDD/TDD assertion library
import { JSDOM }    from 'jsdom';      // JavaScript implementation of DOM and HTML standards
import { ObjectId } from 'mongodb';    // MongoDB driver for Node.js
import dateFormat   from 'dateformat'; // Steven Levithan's dateFormat()

import app from '../../app.js';

const testuser = process.env.TESTUSER; // note testuser must have access to ‘grn‘ organisation only
const testpass = process.env.TESTPASS; // (for successful login & ‘rape-is-a-crime‘ report submission)

const org = 'grn';              // the test organisation for the live ‘test-grn‘ organisation
const proj = 'rape-is-a-crime'; // the test project for the live ‘sexual-assault‘ project


const appAdmin = supertest.agent(app.listen()).host('admin.localhost');
const appReport = supertest.agent(app.listen()).host('report.localhost');

describe(`Report app (${org}/${app.env})`, function() {
    return;
    this.timeout(10e3); // 10 sec
    this.slow(250);

    let reportId = null;
    const imgFldr = 'test/img/';
    const imgFile = 's_gps.jpg';
    let notificationId = null;

    before(async function() {
        // check testuser 'tester' exists and has access to ‘grn’ org (only)
        const responseUsr = await appAdmin.get(`/ajax/login/databases?user=${testuser}`);
        if (responseUsr.body.databases.length != 1) throw new Error(`${testuser} must have access to ‘${org}’ org (only)`);
        if (responseUsr.body.databases[0] != org) throw new Error(`${testuser} must have access to ‘${org}’ org (only)`);

        // force db connection to ‘grn‘ db (ajax calls don't)
        const responseGrnRpt = await appReport.get(`/${org}/${proj}`);
        if (responseGrnRpt.status != 200) throw new Error(`${org}/${proj} not found`);

        // check previous test report deleted
        const responseTestRpt = await appReport.get(`/ajax/${org}/aliases/testy+terrain`);
        if (responseTestRpt.status != 404) throw new Error('Previous test report was not deleted');
    });

    describe('report app home page redirects to /test-grn/sexual-assault', function() {
        it('sees home page', async function() {
            const response = await appReport.get('/');
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/test-grn/sexual-assault');
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
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Get started');

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
            expect([ ...document.querySelectorAll('table.progress td') ].map(td => td.textContent.trim()).join()).to.equal('1,2,3,4,5,6,7,8');
            expect(document.querySelectorAll('table.progress td')[0].classList.contains('current')).to.be.true;
            expect(document.querySelectorAll('input')).to.have.lengthOf(4);
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Submit and continue');

            const values = {
                'existing-alias':  '',
                'used-before':     'n',
                'generated-alias': 'testy terrain',
                'nav-next':        'next',
            };
            const responsePost = await appReport.post(`/${org}/${proj}/1`).send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal(`/${org}/${proj}/2`);
            reportId = responsePost.headers['x-insert-id'];
            console.info('\treport id', reportId);
        });

        it('sees/submits page 2 (on-behalf-of)', async function() {
            const responseGet = await appReport.get(`/${org}/${proj}/2`);
            expect(responseGet.status).to.equal(200);
            const document = new JSDOM(responseGet.text).window.document;
            expect([ ...document.querySelectorAll('table.progress td') ].map(td => td.textContent.trim()).join()).to.equal('1,2,3,4,5,6,7,8');
            expect(document.querySelectorAll('table.progress td')[1].classList.contains('current')).to.be.true;
            expect(document.querySelectorAll('input')).to.have.lengthOf(6);
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Submit and continue');

            const values = {
                'on-behalf-of':    'myself',
                'survivor-gender': 'f',
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
            expect([ ...document.querySelectorAll('table.progress td') ].map(td => td.textContent.trim()).join()).to.equal('1,2,3,4,5,6,7,8');
            expect(document.querySelectorAll('table.progress td')[2].classList.contains('current')).to.be.true;
            expect(document.querySelectorAll('input')).to.have.lengthOf(7);
            expect(document.querySelectorAll('select')).to.have.lengthOf(5);
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Submit and continue');

            const values = {
                'when':            'date',
                'date':            { day: dateFormat('d'), month: dateFormat('mmm'), year: dateFormat('yyyy'), hour: '', minute: '' },
                'within-options':  '',
                'still-happening': 'n',
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
            expect([ ...document.querySelectorAll('table.progress td') ].map(td => td.textContent.trim()).join()).to.equal('1,2,3,4,5,6,7,8');
            expect(document.querySelectorAll('table.progress td')[3].classList.contains('current')).to.be.true;
            expect(document.querySelectorAll('input')).to.have.lengthOf(3);
            expect(document.querySelectorAll('textarea')).to.have.lengthOf(1);
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Submit and continue');

            const values = {
                where:        'at',
                'at-address': 'University of Lagos',
                'nav-next':   'next',
            };
            const responsePost = await appReport.post(`/${org}/${proj}/4`).send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal(`/${org}/${proj}/5`);
        });

        it('sees/submits page 5 (who)', async function() {
            const responseGet = await appReport.get(`/${org}/${proj}/5`);
            expect(responseGet.status).to.equal(200);
            const document = new JSDOM(responseGet.text).window.document;
            expect([ ...document.querySelectorAll('table.progress td') ].map(td => td.textContent.trim()).join()).to.equal('1,2,3,4,5,6,7,8');
            expect(document.querySelectorAll('table.progress td')[4].classList.contains('current')).to.be.true;
            expect(document.querySelectorAll('input')).to.have.lengthOf(3);
            expect(document.querySelectorAll('textarea')).to.have.lengthOf(2);
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Submit and continue');

            const values = {
                'who-relationship': '',
                'who':              'n',
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
            expect([ ...document.querySelectorAll('table.progress td') ].map(td => td.textContent.trim()).join()).to.equal('1,2,3,4,5,6,7,8');
            expect(document.querySelectorAll('table.progress td')[5].classList.contains('current')).to.be.true;
            expect(document.querySelectorAll('textarea')).to.have.lengthOf(1);
            expect(document.querySelectorAll('input')).to.have.lengthOf(2); // desc, file selector
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Submit and continue');

            const values = {
                'description': 'erroneous description',
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
            expect([ ...document.querySelectorAll('table.progress td') ].map(td => td.textContent.trim()).join()).to.equal('1,2,3,4,5,6,7,8');
            expect(document.querySelectorAll('table.progress td')[6].classList.contains('current')).to.be.true;
            expect(document.querySelectorAll('input')).to.have.lengthOf(11);
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Submit and continue');

            const values = {
                'action-taken-other-details': '',
                'nav-next':                   'next',
            };
            const responsePost = await appReport.post(`/${org}/${proj}/7`).send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal(`/${org}/${proj}/8`);
        });

        it('sees page 8 & goes back to page 7', async function() {
            const responseGet = await appReport.get(`/${org}/${proj}/8`);
            expect(responseGet.status).to.equal(200);
            const document = new JSDOM(responseGet.text).window.document;
            expect([ ...document.querySelectorAll('table.progress td') ].map(td => td.textContent.trim()).join()).to.equal('1,2,3,4,5,6,7,8');
            expect(document.querySelectorAll('table.progress td')[7].classList.contains('current')).to.be.true;
            expect(document.querySelectorAll('textarea')).to.have.lengthOf(1);
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Submit and continue to Resources');

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
            expect([ ...document.querySelectorAll('table.progress td') ].map(td => td.textContent.trim()).join()).to.equal('1,2,3,4,5,6,7,8');
            expect(document.querySelectorAll('table.progress td')[5].classList.contains('current')).to.be.true;
            expect(document.querySelectorAll('textarea')).to.have.lengthOf(1);
            expect(document.querySelectorAll('input')).to.have.lengthOf(2); // file selector
            expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Submit and continue');
            expect(document.querySelector('textarea').textContent).to.equal('erroneous description');
            const values = {
                'description': 'Test',
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
            expect(response.body.formattedAddress).to.equal('Akoka, Yaba, Nigeria');
        });

        it('ajax: geocodes address using CORS', async function() {
            const response = await appReport.get('/ajax/geocode?address=university+of+lagos,+nigeria').set('Origin', 'http://rapeisacrime.org');
            expect(response.status).to.equal(200);
            expect(response.body.formattedAddress).to.equal('Akoka, Yaba, Nigeria');
            expect(response.headers['access-control-allow-origin']).to.equal('http://rapeisacrime.org');
        });

        it('sees whatnext resources', async function() {
            const response = await appReport.get(`/${org}/${proj}/whatnext?address=university+of+lagos,+nigeria`);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('h1').textContent.trim()).to.equal('✔ We’ve received your report');
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
            const values = { username: testuser, password: testpass };
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
        });

        it('dismisses notification', async function() {
            const response = await appAdmin.delete(`/ajax/notifications/${notificationId}`);
            expect(response.status).to.equal(200);
        });

        it('sees notification is gone', async function() {
            const response = await appAdmin.get('/ajax/notifications');
            expect(response.status).to.equal(200);
            expect(response.body.events['new report submitted']).to.be.undefined;
            // hopefully no other new submission lurking in test db!
        });

        it('sees new report with nicely formatted information', async function() {
            const response = await appAdmin.get(`/reports/${reportId}`);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            const reportInfo = document.querySelector('table.js-obj-to-html');
            const ths = reportInfo.querySelectorAll('th');
            const tds = reportInfo.querySelectorAll('td');
            expect(tds.length).to.equal(13);
            expect(ths[0].textContent).to.equal('Alias');
            expect(tds[0].textContent).to.equal('testy terrain');
            expect(ths[1].textContent).to.equal('On behalf of');
            expect(tds[1].textContent).to.equal('Myself');
            expect(ths[2].textContent).to.equal('Survivor gender');
            expect(tds[2].textContent).to.equal('female');
            expect(ths[3].textContent).to.equal('Survivor age');
            expect(tds[3].textContent).to.equal('20–24');
            expect(ths[4].textContent).to.equal('Happened');
            expect(tds[4].textContent).to.equal(dateFormat('d mmm yyyy'));
            expect(ths[5].textContent).to.equal('Still happening?');
            expect(tds[5].textContent).to.equal('no');
            expect(ths[6].textContent).to.equal('Where');
            expect(tds[6].textContent).to.equal('University of Lagos');
            expect(ths[7].textContent).to.equal('Who');
            expect(tds[7].textContent).to.equal('Not known: Big fat guy');
            expect(ths[8].textContent).to.equal('Description');
            expect(tds[8].textContent).to.equal('Test');
            expect(ths[9].textContent).to.equal('Spoken to anybody?');
            expect(tds[9].textContent).to.equal('—');
            expect(ths[10].textContent).to.equal('Extra notes');
            expect(tds[10].textContent).to.equal('—');
            expect(ths[11].textContent).to.equal('Contact e-mail');
            expect(tds[11].textContent).to.equal('—');
            expect(ths[12].textContent).to.equal('Contact phone');
            expect(tds[12].textContent).to.equal('—');
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

        it('fetches uploaded image from AWS S3', async function() {
            const src = `/uploaded/${proj}/${dateFormat('yyyy-mm')}/${reportId}/${imgFile}`;
            const response = await appAdmin.get(src);
            expect(response.status).to.equal(200);
            expect(response.headers['content-type']).to.equal('image/jpeg');
        });

        it('sees uploaded image in report page', async function() {
            const response = await appAdmin.get(`/reports/${reportId}`);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            const src = `/uploaded/${proj}/${dateFormat('yyyy-mm')}/${reportId}/${imgFile}`;
            expect(document.getElementById(imgFile).querySelector('td a').href).to.equal(src);
            expect(document.getElementById(imgFile).querySelector('td img').src).to.equal(src);
        });

        it('gets address for Heddon-on-the-Wall (close to test photo) (ajax)', async function() {
            const response = await appAdmin.get('/ajax/geocode?address=Heddon-on-the-Wall');
            expect(response.status).to.equal(200);
            expect(response.body.formattedAddress).to.equal('Heddon-on-the-Wall, UK');
        });

        it('sets report location to Heddon-on-the-Wall (ajax)', async function() {
            const values = { address: 'Heddon-on-the-Wall' };
            const response = await appAdmin.put(`/ajax/reports/${reportId}/location`).send(values);
            expect(response.status).to.equal(200);
        });

        it('sees uploaded image exif metadata in report page', async function() {
            const response = await appAdmin.get('/reports/'+reportId);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            const distRe = new RegExp('^7.2 km W from incident location');
            expect(document.getElementById(imgFile).querySelector('td.exif div').textContent).to.match(distRe);
            // note don't bother checking time as it will change in future
        });

        it('gets timestamp of new report (ajax)', async function() {
            const response = await appAdmin.get('/ajax/reports/latest-timestamp');
            expect(response.status).to.equal(200);
            expect(response.body.latest.timestamp).to.equal(ObjectId(reportId).getTimestamp().toISOString());
        });

        it('gets reports in bounding box (ajax)', async function() {
            const response = await appAdmin.get('/ajax/reports/within/54.9,-1.9:55.1,-1.7');
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

        it('deletes submitted incident report', async function() {
            const response = await appAdmin.post(`/reports/${reportId}/delete`).send();
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/reports');
        });

        it('logs out', async function() {
            const response = await appReport.host('report.localhost').get('/logout');
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/');
        });
    });

    describe('single page report submission', function() { // TODO: check overlap with admin tests
        const report = `/${org}/${proj}/*`;

        it('logs in', async function() {
            const values = { username: testuser, password: testpass };
            const response = await appAdmin.post('/login/-'+report).send(values);
            expect(response.status).to.equal(302);
            // note redirect has full url as it is changing subdomains
            expect(response.headers.location.slice(-report.length)).to.equal(report);
        });

        it('shows logged in user on login page when logged-in', async function() {
            const response = await appAdmin.get('/login');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('#name').textContent).to.equal('tester');
            expect(document.querySelector('#db').textContent).to.equal(`${org}`);
        });

        it('sees report submission page', async function() {
            const response = await appReport.get(report);
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('title').textContent).to.equal('The Whistle / Global Rights Nigeria Incident Report');
        });

        it('posts report details', async function() {
            const values = {
                'used-before':      'n',
                'generated-alias':  'testy terrain',
                'existing-alias':   '',
                'on-behalf-of':     'myself',
                'survivor-gender':  'f',
                'survivor-age':     '20–24',
                'when':             'date',
                'date.day':         dateFormat('d'),
                'date.month':       dateFormat('mmm'),
                'date.year':        dateFormat('yyyy'),
                'date.hour':        '',
                'date.minute':      '',
                'within-options':   '',
                'still-happening':  'n',
                'where':            'at',
                'at-address':       'University of Lagos',
                'who-relationship': '',
                'who':              'n',
                'who-description':  'Big fat guy',
                'description':      'Single-page submission test',
                'action-taken':     'teacher',
                'extra-notes':      '',
                'contact-email':    'help@me.com',
                'contact-phone':    '01234 123456',
                'nav-next':         'next',
            };
            const response = await appReport.post(report).send(values);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal(`/${org}/${proj}/whatnext`);
            reportId = response.headers['x-insert-id'];
            console.info('\treport id', reportId);
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
            const ths = reportInfo.querySelectorAll('th');
            const tds = reportInfo.querySelectorAll('td');
            expect(tds.length).to.equal(13);
            expect(ths[0].textContent).to.equal('Alias');
            expect(tds[0].textContent).to.equal('testy terrain');
            expect(ths[1].textContent).to.equal('On behalf of');
            expect(tds[1].textContent).to.equal('Myself');
            expect(ths[2].textContent).to.equal('Survivor gender');
            expect(tds[2].textContent).to.equal('female');
            expect(ths[3].textContent).to.equal('Survivor age');
            expect(tds[3].textContent).to.equal('20–24');
            expect(ths[4].textContent).to.equal('Happened');
            expect(tds[4].textContent).to.equal(dateFormat('d mmm yyyy'));
            expect(ths[5].textContent).to.equal('Still happening?');
            expect(tds[5].textContent).to.equal('no');
            expect(ths[6].textContent).to.equal('Where');
            expect(tds[6].textContent).to.equal('University of Lagos');
            expect(ths[7].textContent).to.equal('Who');
            expect(tds[7].textContent).to.equal('Not known: Big fat guy');
            expect(ths[8].textContent).to.equal('Description');
            expect(tds[8].textContent).to.equal('Single-page submission test');
            expect(ths[9].textContent).to.equal('Spoken to anybody?');
            expect(tds[9].textContent).to.equal('Teacher/tutor/lecturer');
            expect(ths[10].textContent).to.equal('Extra notes');
            expect(tds[10].textContent).to.equal('—');
            expect(ths[11].textContent).to.equal('Contact e-mail');
            expect(tds[11].textContent).to.equal('help@me.com');
            expect(ths[12].textContent).to.equal('Contact phone');
            expect(tds[12].textContent).to.equal('01234 123456');
        });


        it('deletes submitted incident report', async function() {
            const response = await appAdmin.post(`/reports/${reportId}/delete`).send();
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/reports');
        });

        it('logs out', async function() {
            const response = await appReport.host('report.localhost').get('/logout');
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/');
        });
    });
});
