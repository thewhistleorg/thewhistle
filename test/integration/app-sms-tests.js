/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* SMS app integration tests.                                                  Louis Slater 2018  */
/*                                                                                                */
/* These tests require twilio.thewhistle.local & admin.thewhistle.local to be set in /etc/hosts.  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import supertest  from 'supertest';  // SuperAgent driven library for testing HTTP servers
import { expect } from 'chai';       // BDD/TDD assertion library
import { DOMParser }                          from 'xmldom';                // DOMParser in node.js

import app            from '../../app.js';
import Report         from '../../models/report.js';

const org = 'hfrn-test';
const project = 'hfrn-en';

const appSms = supertest.agent(app.listen()).host('twilio.thewhistle.local');

const body = {
    'ToCountry':     'GB',
    'ToState':       'St Albans',
    'SmsMessageSid': 'SMb2e0e20fdf02480a7a9fd5324cc1e307',
    'NumMedia':      '0',
    'ToCity':        '',
    'FromZip':       '',
    'SmsSid':        'SMb2e0e20fdf02480a7a9fd5324cc1e307',
    'FromState':     '',
    'SmsStatus':     'received',
    'FromCity':      '',
    'FromCountry':   'GB',
    'To':            '+441727260269',
    'ToZip':         '',
    'NumSegments':   '1',
    'MessageSid':    'SMb2e0e20fdf02480a7a9fd5324cc1e307',
    'AccountSid':    'AC5da0166da2047a8e4d3b3709982ebaae',
    'From':          '+447716364079',
    'ApiVersion':    '2010-04-01',
};


async function sendAndReceiveSms(message) {
    body.Body = message;
    return await appSms.post(`/${org}/${project}`).send(body);
}


function parseResponseMessage(response) {
    expect(response.status).to.equal(200);
    const parser = new DOMParser();
    const xml = parser.parseFromString(response.text, 'text/xml');
    const responseMessage = xml.getElementsByTagName('Message')[0].childNodes[0].nodeValue;
    return responseMessage;
}


function parseReportId(response) {
    for (let i = 0; i < response.headers['set-cookie'].length; i++) {
        if (response.headers['set-cookie'][i].substring(0, response.headers['set-cookie'][i].indexOf('=')) === 'session_id') {
            return response.headers['set-cookie'][i].substr(response.headers['set-cookie'][i].indexOf('=') + 1, 24);
        }
    }
    return 'a';
    //TODO: Throw error
}


async function getResponseMessage(message) {
    const response = await sendAndReceiveSms(message);
    return parseResponseMessage(response);
}


async function getResponseMessageAndReportId(message) {
    const response = await sendAndReceiveSms(message);
    const responseMessage = parseResponseMessage(response);
    const reportId = parseReportId(response);
    return { 'message': responseMessage, 'id': reportId };
}


describe('SMS app'+' ('+app.env+')', function() {
    let aliasOne = '';
    let aliasTwo = '';
    let reportIdOne = '';
    let reportIdTwo = '';
    let reportIdThree = '';
    this.timeout(5e4); // 50 sec
    this.slow(250);
    describe('User Flow', function() {
        const re = /Your new anonymous alias is [a-z]+ [a-z]+.\nQuestion 1: Please ask the interviewee if they consent to audio recording the interview, was consent given?/;
        it('Start report', async function() {
            const responseMessage = await getResponseMessage('Hello');
            expect(responseMessage).to.equal('By completing this form, you consent to xxxxx.\nPlease reply with the keywords SKIP, HELP and STOP at any point.\nHave you used this reporting service before?');
        });
        it('Input invalid used before', async function() {
            const responseMessage = await getResponseMessage('I do not know');
            expect(responseMessage).to.equal('Sorry, we didn\'t understand that response. Have you used this service before?');
        });
        it('Input not used before', async function() {
            const messageAndId = await getResponseMessageAndReportId('Nope');
            const responseMessage = messageAndId.message;
            reportIdOne = messageAndId.id;
            expect(responseMessage).to.match(re);
            aliasOne = responseMessage.substring(28, responseMessage.indexOf('.'));
        });
        it('Output alias and first question', async function() {
            const responseMessage = await getResponseMessage('it was');
            expect(responseMessage).to.equal('Question 2: Name of person filling out form\n');
        });
        it('Respond to all questions', async function() {
            let responseMessage = '';
            for (let i = 0; i < 19; i++) {
                responseMessage = await getResponseMessage('YES');
            }
            expect(responseMessage).to.equal('Thank you for completing the questions. If you have any supplimentary information, please send it now. You can use MMS or a URL to provide picture, audio or video files. If you would like to amend any of responses, please reply explaining the changes. If you would like to start a new report, please reply \'RESTART\'');
        });
        it('Provide supplimentary information', async function() {
            const responseMessage = await getResponseMessage('Extra info 1');
            expect(responseMessage).to.equal('Thank you for this extra information. You can send more if you wish. To start a new report, reply \'RESTART\'');
        });
        it('Restart report', async function() {
            let responseMessage = await getResponseMessage('Extra info 2');
            responseMessage = await getResponseMessage('ReStart ');
            expect(responseMessage).to.equal('By completing this form, you consent to xxxxx.\nPlease reply with the keywords SKIP, HELP and STOP at any point.\nHave you used this reporting service before?');
        });
        it('Input used before', async function() {
            const responseMessage = await getResponseMessage('Ye.');
            expect(responseMessage).to.equal('Please enter your anonymous alias. To use a new alias, please reply \'NEW\'');
        });
        it('Generate new alias', async function() {
            const messageAndId = await getResponseMessageAndReportId('\'new\'');
            const responseMessage = messageAndId.message;
            reportIdTwo = messageAndId.id;
            expect(responseMessage).to.match(re);
            aliasTwo = responseMessage.substring(28, responseMessage.indexOf('.'));
        });
        it('Input invalid alias', async function() {
            let responseMessage = '';
            for (let i = 0; i < 20; i++) {
                responseMessage = await getResponseMessage('no');
            }
            await getResponseMessage('restart');
            await getResponseMessage('yes');
            responseMessage = await getResponseMessage('invalid alias');
            expect(responseMessage).to.equal('Sorry, that alias hasn\'t been used before. Please enter your anonymous alias. To use a new alias, please reply \'NEW\'');
        });
        it('Input valid alias', async function() {
            const messageAndId = await getResponseMessageAndReportId(aliasOne.toUpperCase());
            const responseMessage = messageAndId.message;
            reportIdThree = messageAndId.id;
            expect(responseMessage).to.equal('Question 1: Please ask the interviewee if they consent to audio recording the interview, was consent given?\n');
            await getResponseMessage('100%');
        });
    });
    describe('Database checks', function() {
        
        it('First report', async function() {
            const reportOne = await Report.get(org, reportIdOne);
            const expected = {
                'Alias':                                            aliasOne,
                'First Text':                                       'I do not know',
                'Consent to record?':                               'it was',
                'Name of person filling out form':                  'YES',
                'Organisation':                                     'YES',
                'Organisation reference':                           'YES',
                'Contact details':                                  'YES',
                'Name of person giving statement':                  'YES',
                'Incident date':                                    'YES',
                'Incident time':                                    'YES',
                'Location':                                         'YES',
                'Did this incident happen to you?':                 'YES',
                'Description':                                      'YES',
                'Type of incident':                                 'YES',
                'Who is the perpetrator?':                          'YES',
                'Form of violence':                                 'YES',
                'Reported?':                                        'YES',
                'Medical attention required?':                      'YES',
                'Did the incident involve an unaccompanied minor?': 'YES',
                'Consent to being contacted?':                      'YES',
                'Consent to media testimony?':                      'YES',
                'Consent to information?':                          'YES',
                'Supplimentary information':                        'Extra info 1 | Extra info 2',
            };
            expect(reportOne.submitted).to.deep.equal(expected);
        });
        it('Second report', async function() {
            const reportOne = await Report.get(org, reportIdTwo);
            const expected = {
                'Alias':                                            aliasTwo,
                'First Text':                                       'ReStart ',
                'Consent to record?':                               'no',
                'Name of person filling out form':                  'no',
                'Organisation':                                     'no',
                'Organisation reference':                           'no',
                'Contact details':                                  'no',
                'Name of person giving statement':                  'no',
                'Incident date':                                    'no',
                'Incident time':                                    'no',
                'Location':                                         'no',
                'Did this incident happen to you?':                 'no',
                'Description':                                      'no',
                'Type of incident':                                 'no',
                'Who is the perpetrator?':                          'no',
                'Form of violence':                                 'no',
                'Reported?':                                        'no',
                'Medical attention required?':                      'no',
                'Did the incident involve an unaccompanied minor?': 'no',
                'Consent to being contacted?':                      'no',
                'Consent to media testimony?':                      'no',
                'Consent to information?':                          'no',
            };
            expect(reportOne.submitted).to.deep.equal(expected);
        });
        it('Third report', async function() {
            const reportThree = await Report.get(org, reportIdThree);
            const expected = {
                'Alias':              aliasOne,
                'First Text':         'restart',
                'Consent to record?': '100%',
            };
            expect(reportThree.submitted).to.deep.equal(expected);
        });
    });
});