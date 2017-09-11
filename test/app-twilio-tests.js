/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Twilio app integration/acceptance tests                                                        */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const supertest   = require('supertest');   // SuperAgent driven library for testing HTTP servers
const expect      = require('chai').expect; // BDD/TDD assertion library
const JsDom       = require('jsdom').JSDOM; // JavaScript implementation of DOM and HTML standards

const app = require('../app.js');

const testuser = process.env.TESTUSER;
const testpass = process.env.TESTPASS;


const request = supertest.agent(app.listen());

describe('Twilio app'+' ('+app.env+')', function() {
    this.timeout(5e3); // 5 sec

    let messageId = null;
    let accountId = null;

    describe('receive message (spoofing message delivered by Twilio webhook)', function() {
        const headers = { Host: 'twilio.localhost:3000' }; // set host header

        it('receives message', async function() {
            messageId = 'SM' + randomId();
            accountId = 'AC' + randomId();
            const values = {
                SmsMessageSid: messageId,
                SmsSid:        messageId,
                MessageSid:    messageId,
                AccountSid:    accountId,
                From:          '+447973559336',
                NumSegments:   '1',
                NumMedia:      '0',
                To:            '+441702683045',
                ToCountry:     'GB',
                ToState:       'Southend-on-Sea',
                ToCity:        '',
                ToZip:         '',
                FromCountry:   'GB',
                FromState:     '',
                FromCity:      '',
                FromZip:       '',
                Body:          'Twilio test',
                SmsStatus:     'received',
                ApiVersion:    '2010-04-01',
            };
            const response = await request.post('/messages').set(headers).send(values);
            expect(response.status).to.equal(200);
        });
    });

    describe('view message', function() {
        const headers = { Host: 'admin.localhost:3000' }; // set host header

        it('logs in', async function() {
            const values = { username: testuser, password: testpass };
            const response = await request.post('/login').set(headers).send(values);
            expect(response.status).to.equal(302);
        });

        it('views messages list page', async function() {
            const response = await request.get('/messages').set(headers);
            expect(response.status).to.equal(200);
            const htmlDom = new JsDom(response.text);
            expect(htmlDom.window.document.querySelector('title').textContent.slice(0, 8)).to.equal('Messages');
            expect(htmlDom.window.document.getElementById(messageId).querySelector('a').textContent).to.equal('07973 559336');
        });

        it('logs out', async function() {
            const response = await request.get('/logout').set(headers);
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/');
        });
    });

});

function randomId() {
    const chars = '0123456789abcdef';
    let id = '';
    for (let i=0; i<32; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
    return id;
}
