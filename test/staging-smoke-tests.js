/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Smoke tests as sanity check on staging site before promoting to production.     C.Veness 2018  */
/*                                                                                                */
/* These tests sit above the test sub-directories, so they are not run by 'npm test' command;     */
/* they can be run manually (with 'npm run test-smoke' command) after a new Heroku staging app    */
/* has been built, to confirm the app is not totally broken before promoting it to production.    */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import supertest from 'supertest'; // SuperAgent driven library for testing HTTP servers
import chai      from 'chai';      // BDD/TDD assertion library
import jsdom     from 'jsdom';     // JavaScript implementation of DOM and HTML standards
import dotenv    from 'dotenv';    // load environment variables from a .env file into process.env
const expect = chai.expect;
dotenv.config();

const requestAdmin = supertest.agent('http://admin.staging.thewhistle.org');
const requestReport = supertest.agent('http://report.staging.thewhistle.org');

const testuser = process.env.TESTUSER; // note testuser must have access to test-grn only
const testpass = process.env.TESTPASS; // (for successful login & sexual-assault report submission)


describe('Admin app', function() {
    this.timeout(30e3); // 30 sec - app can take some time to wake

    it('has home page with login link in nav when not logged-in', async function() {
        const response = await requestAdmin.get('/');
        expect(response.status).to.equal(200);
        const document = new jsdom.JSDOM(response.text).window.document;
        expect(document.querySelector('title').textContent.slice(0, 11)).to.equal('The Whistle');
        expect(document.querySelectorAll('nav ul li').length).to.equal(2); // nav should be just '/', 'login'
    });

    it('redirects to / on login', async function() {
        const values = { username: testuser, password: testpass, 'remember-me': 'on' };
        const response = await requestAdmin.post('/login').send(values);
        expect(response.status).to.equal(302);
        expect(response.headers.location).to.equal('/');
    });

    it('sees list of reports', async function() {
        const response = await requestAdmin.get('/reports');
        expect(response.status).to.equal(200);
        const document = new jsdom.JSDOM(response.text).window.document;
        expect(document.querySelector('title').textContent).to.equal('Reports list');
        expect(document.querySelectorAll('header nav > ul > li').length).to.equal(8);
    });

    it('sees list of users', async function() {
        const response = await requestAdmin.get('/users');
        expect(response.status).to.equal(200);
        const document = new jsdom.JSDOM(response.text).window.document;
        expect(document.querySelector('h1').textContent).to.equal('Users');
    });

    it('logs out and redirects to /', async function() {
        const response = await requestAdmin.get('/logout');
        expect(response.status).to.equal(302);
        expect(response.headers.location).to.equal('/');
    });
});

describe('Report app', function() {
    this.timeout(30e3); // 30 sec - app can take some time to wake

    it('sees test-grn/sexual-assault home page', async function() {
        const responseGet = await requestReport.get('/test-grn/sexual-assault');
        expect(responseGet.status).to.equal(200);
        const document = new jsdom.JSDOM(responseGet.text).window.document;
        expect(document.querySelector('title').textContent).to.equal('The Whistle / Global Rights Nigeria Incident Report');
        expect(document.querySelector('button.nav-action-button').textContent.trim()).to.equal('Get started');
    });

    it('moves on to page 1', async function() {
        const values = { 'nav-next': 'next' };
        const responsePost = await requestReport.post('/test-grn/sexual-assault').send(values);
        expect(responsePost.status).to.equal(302);
        expect(responsePost.headers.location).to.equal('/test-grn/sexual-assault/1');
    });
});
