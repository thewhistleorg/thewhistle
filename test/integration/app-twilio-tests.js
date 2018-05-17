/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Twilio app integration/acceptance tests.                                   C.Veness 2017-2018  */
/*                                                                                                */
/* These tests require admin.localhost to be set in /etc/hosts.                                   */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import supertest  from 'supertest';  // SuperAgent driven library for testing HTTP servers
import { expect } from 'chai';       // BDD/TDD assertion library
import { JSDOM }  from 'jsdom';      // JavaScript implementation of DOM and HTML standards
import dateFormat from 'dateformat'; // Steven Levithan's dateFormat()

import app from '../../app.js';

const testuser = process.env.TESTUSER;
const testpass = process.env.TESTPASS;


const request = supertest.agent(app.listen());

describe('Twilio app'+' ('+app.env+')', function() {
    /* eslint no-unreachable: off */
    return; // suspend twilio tests for now until functionality is required

    this.timeout(5e3); // 5 sec

    let msgId = null;
    let replyId = null;

    describe('receive message (spoofing message delivered by Twilio webhook)', function() {
        const headers = { Host: 'twilio.localhost:3000' }; // set host header for subapp selection

        let messageId = null;
        let accountId = null;

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
            msgId = response.headers['x-insert-id'];
        });
    });

    describe('view message in admin app', function() {
        const requestAdmin = supertest.agent(app.listen()).host('admin.localhost');

        it('logs in', async function() {
            const values = { username: testuser, password: testpass };
            const response = await requestAdmin.post('/login').send(values);
            expect(response.status).to.equal(302);
        });

        it('views messages list page', async function() {
            const response = await requestAdmin.get('/messages');
            expect(response.status).to.equal(200);
            const document = new JSDOM(response.text).window.document;
            expect(document.querySelector('title').textContent.slice(0, 8)).to.equal('Messages');
            expect(document.getElementById(msgId).querySelector('a').textContent).to.equal('07973 559336');
        });

        it('sends reply', async function() {
            const values = { message: `Thank you for testing The Whistle (${dateFormat('d mmm yyyy HH:MM')})` };
            const response = await requestAdmin.post('/messages?number=~447973559336').send(values);
            expect(response.status).to.equal(302);
            replyId = response.headers['x-insert-id'];
            expect(response.headers.location).to.equal('/messages?number=~447973559336');
        });

        it('gets latest timestamp (ajax)', async function() {
            const response = await requestAdmin.get('/ajax/messages/latest-timestamp');
            expect(response.status).to.equal(200);
            // check timestamp?
        });

        it('deletes reply', async function() {
            const response = await requestAdmin.post('/messages/'+replyId+'/delete').send();
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/messages');
        });

        it('deletes message', async function() {
            const response = await requestAdmin.post(`/messages/${msgId}/delete`).send();
            expect(response.status).to.equal(302);
            expect(response.headers.location).to.equal('/messages');
        });

        it('logs out', async function() {
            const response = await requestAdmin.get('/logout');
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
