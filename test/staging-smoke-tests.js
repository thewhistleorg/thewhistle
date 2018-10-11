/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Smoke tests as sanity check on staging site before promoting to production.     C.Veness 2018  */
/*                                                                                                */
/* These tests sit above the test sub-directories, so they are not run by 'npm test' command;     */
/* they can be run manually (with 'npm run test-smoke' command) after a new Heroku staging app    */
/* has been built, to confirm the app is not totally broken before promoting it to production.    */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import supertest  from 'supertest'; // SuperAgent driven library for testing HTTP servers
import { expect } from 'chai';      // BDD/TDD assertion library
import { JSDOM }  from 'jsdom';     // JavaScript implementation of DOM and HTML standards
import dotenv     from 'dotenv';    // load environment variables from a .env file into process.env

dotenv.config();

// note there is a heroku postbuild script which invokes this test automatically when staging is
// rebuilt: this script can also be invoked manually to check production (following promotion from
// staging to production) with the command:
//   NODE_ENV=production npm run test-smoke

const domain = process.env.NODE_ENV == 'production' ? 'thewhistle.org' : 'staging.thewhistle.org';
const protocol = process.env.NODE_ENV == 'production' ? 'https' : 'http';

// if SUBAPP is defined (for review apps), get app url from HEROKU_APP_NAME
const adminAppUrl = process.env.SUBAPP ? `http://${process.env.HEROKU_APP_NAME}` : `${protocol}://admin.${domain}`;
const reportAppUrl = process.env.SUBAPP ? `http://${process.env.HEROKU_APP_NAME}` : `${protocol}://report.${domain}`;

const adminApp = supertest.agent(adminAppUrl);
const reportApp = supertest.agent(reportAppUrl);

const testuser = process.env.TESTUSER; // note testuser must have access to ‘demo’ organisation
const testpass = process.env.TESTPASS; // (for admin login test)


describe(`Admin app (admin.${domain})`, function() {
    // if (process.env.SUBAPP && process.env.SUBAPP != 'admin') return;
    console.info('heroku app name', process.env.HEROKU_APP_NAME, process.env.HEROKU_PARENT_APP_NAME);
    if (process.env.HEROKU_APP_NAME && process.env.HEROKU_APP_NAME.startsWith('thewhistle-staging-pr')) return; // suspend review-app smoke-tests until they can be make to work!

    this.timeout(120e3); // 120 sec - (free-tier) staging app can take some time to wake

    it('has home page with login link in nav when not logged-in', async function() {
        const response = await adminApp.get('/');
        expect(response.status).to.equal(302);
        expect(response.headers.location).to.equal('/login');
    });

    it('redirects to / on login', async function() {
        const values = { username: testuser, password: testpass, database: 'demo', 'remember-me': 'on' };
        const response = await adminApp.post('/login').send(values);
        expect(response.status).to.equal(302);
        expect(response.headers.location).to.equal('/');
    });

    it('sees list of reports', async function() {
        const response = await adminApp.get('/reports');
        expect(response.status).to.equal(200);
        const document = new JSDOM(response.text).window.document;
        expect(document.querySelector('title').textContent).to.equal('Reports list');
        // nav should be /, Reports, Form specs, Users, Resources, Submit – feedback, user-name, notifications, Logout
        expect(document.querySelectorAll('header nav > ul > li').length).to.equal(10);
    });

    it('sees list of users', async function() {
        const response = await adminApp.get('/users');
        expect(response.status).to.equal(200);
        const document = new JSDOM(response.text).window.document;
        expect(document.querySelector('h1').textContent).to.equal('Users');
    });

    it('logs out and redirects to /', async function() {
        const response = await adminApp.get('/logout');
        expect(response.status).to.equal(302);
        expect(response.headers.location).to.equal('/');
    });
});

describe(`Report app (report.${domain})`, function() {
    // if (process.env.SUBAPP && process.env.SUBAPP != 'report') return;
    console.info('heroku app name', process.env.HEROKU_APP_NAME, process.env.HEROKU_PARENT_APP_NAME);
    if (process.env.HEROKU_APP_NAME && process.env.HEROKU_APP_NAME.startsWith('thewhistle-staging-pr')) return; // suspend review-app smoke-tests until they can be make to work!

    this.timeout(30e3); // 30 sec - app can take some time to wake

    // organisations/projects to be checked: this checks both that environment variables are set up,
    // and that expected projects are available
    const projects = [
        {
            org:     'demo',
            project: 'example-1',
            note:    'core example spec',
            title:   'The Whistle Example Reporting Form',
        },
        {
            org:     'everyday-racism-test',
            project: 'cambridge',
            note:    'spec held in filesys',
            title:   'The Whistle / Everyday Racism at Cambridge Incident Report',
        },
        {
            org:     'grn-test',
            project: 'rape-is-a-crime',
            note:    'spec held on filesys',
            title:   'The Whistle / Global Rights Nigeria Incident Report',
        },
        {
            org:     'grn',
            project: 'rape-is-a-crime',
            note:    'LIVE REPORT',
            title:   'The Whistle / Global Rights Nigeria Incident Report',
        },
        {
            org:     'hfrn-test',
            project: 'hfrn-en',
            note:    'spec held in db',
            title:   'The Whistle / Humans for Rights Network Incident Report',
        },
    ];

    for (const project of projects) {
        it(`${project.org}/${project.project}: sees home page (${project.note})`, async function() {
            const responseGet = await reportApp.get(`/${project.org}/${project.project}`);
            expect(responseGet.status).to.equal(200);
            const document = new JSDOM(responseGet.text).window.document;
            expect(document.querySelector('title').textContent).to.equal(project.title);
        });

        it(`${project.org}/${project.project}: fails recaptcha check`, async function() {
            const values = { 'nav-next': 'next' };
            const responsePost = await reportApp.post(`/${project.org}/${project.project}`).send(values);
            expect(responsePost.status).to.equal(302);
            expect(responsePost.headers.location).to.equal(`/${project.org}/${project.project}`);
            expect(responsePost.headers['x-redirect-reason']).to.equal('reCAPTCHA verification failed');
        });
    }
});
