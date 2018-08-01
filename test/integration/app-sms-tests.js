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
    throw new Error('No existing session');
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
            const responseMessage = await getResponseMessage('help');
            expect(responseMessage).to.equal('By completing this form, you consent to xxxxx.\nPlease reply with the keywords SKIP or HELP at any point.\nHave you used this reporting service before?');
        });
        it('Get help before starting report', async function() {
            let responseMessage = await getResponseMessage('help');
            expect(responseMessage).to.equal('If you would like to speak to someone, please call XXXXX. Reply \'START\' to start submitting a report');
            responseMessage = await getResponseMessage('START');
            expect(responseMessage).to.equal('By completing this form, you consent to xxxxx.\nPlease reply with the keywords SKIP or HELP at any point.\nHave you used this reporting service before?');
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
        it('Get help during report', async function() {
            const responseMessage = await getResponseMessage('HELP');
            expect(responseMessage).to.equal('If you would like to speak to someone, please call XXXXX. Would you like to continue with this report?');
        });
        it('Input invalid for continue response', async function() {
            const responseMessage = await getResponseMessage('!"£"£$');
            expect(responseMessage).to.equal('Sorry, we didn\'t understand your response. Would you like to continue with this report?');
        });
        it('Continue with report after help', async function() {
            const responseMessage = await getResponseMessage('yeee');
            expect(responseMessage).to.equal('Question 2: Name of person filling out form\n');
        });
        it('Don\'t continue with report', async function() {
            let responseMessage = await getResponseMessage('Me');
            expect(responseMessage).to.equal('Question 3: Organisation\n');
            responseMessage = await getResponseMessage(' Help! ');
            expect(responseMessage).to.equal('If you would like to speak to someone, please call XXXXX. Would you like to continue with this report?');
            responseMessage = await getResponseMessage('No');
            expect(responseMessage).to.equal('Would you like to store your report? Please note that if you have amendments to your responses, you can give them after the last question.');

        });
        it('Input invalid for store response', async function() {
            const responseMessage = await getResponseMessage('123');
            expect(responseMessage).to.equal('Sorry, we didn\'t understand your response. Would you like to store your report? Please note that if you have amendments to your responses, you can give them after the last question.');
        });
        it('Stop and store report', async function() {
            const responseMessage = await getResponseMessage('Yep');
            expect(responseMessage).to.equal('Your responses have been stored. Thank you for using this reporting service. If you want to submit a new report, please send another text to this number. If you have any questions, please call XXXXXX');
        });
        it('Start report after stopping', async function() {
            const responseMessage = await getResponseMessage('sTart ');
            expect(responseMessage).to.equal('By completing this form, you consent to xxxxx.\nPlease reply with the keywords SKIP or HELP at any point.\nHave you used this reporting service before?');
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
        it('Provide supplimentary information', async function() {
            let responseMessage = '';
            for (let i = 0; i < 20; i++) {
                responseMessage = await getResponseMessage('no');
            }
            responseMessage = await getResponseMessage('Extra info 1');
            expect(responseMessage).to.equal('Thank you for this extra information. You can send more if you wish. To start a new report, reply \'RESTART\'');
            responseMessage = await getResponseMessage('Extra info 2');
            expect(responseMessage).to.equal('Thank you for this extra information. You can send more if you wish. To start a new report, reply \'RESTART\'');

        });
        it('Restart report', async function() {
            const responseMessage = await getResponseMessage('ReStart ');
            expect(responseMessage).to.equal('By completing this form, you consent to xxxxx.\nPlease reply with the keywords SKIP or HELP at any point.\nHave you used this reporting service before?');
        });
        it('Input used before', async function() {
            const responseMessage = await getResponseMessage('Ye.');
            expect(responseMessage).to.equal('Please enter your anonymous alias. To use a new alias, please reply \'NEW\'');
        });
        it('Input invalid alias', async function() {
            const responseMessage = await getResponseMessage('invalid alias');
            expect(responseMessage).to.equal('Sorry, that alias hasn\'t been used before. Please enter your anonymous alias. To use a new alias, please reply \'NEW\'');
        });
        it('Input valid alias', async function() {
            const messageAndId = await getResponseMessageAndReportId(aliasOne.toUpperCase());
            let responseMessage = messageAndId.message;
            reportIdThree = messageAndId.id;
            expect(responseMessage).to.equal('Question 1: Please ask the interviewee if they consent to audio recording the interview, was consent given?\n');
            responseMessage = await getResponseMessage('100%');
            expect(responseMessage).to.equal('Question 2: Name of person filling out form\n');
        });
        it('Do not store report', async function() {
            await getResponseMessage('help');
            await getResponseMessage('no');
            const responseMessage = await getResponseMessage('no');
            expect(responseMessage).to.equal('Your responses have been deleted. Thank you for using this reporting service. If you want to submit a new report, please send another text to this number. If you have any questions, please call XXXXXX');
        });
    });
    describe('Database checks', function() {
        
        it('First report', async function() {
            const reportOne = await Report.get(org, reportIdOne);
            const expected = {
                'Alias':                           aliasOne,
                'First Text':                      'I do not know',
                'Consent to record?':              'it was',
                'Name of person filling out form': 'Me',
            };
            expect(reportOne.submitted).to.deep.equal(expected);
            await Report.delete(org, reportIdOne);
        });
        it('Second report', async function() {
            const reportOne = await Report.get(org, reportIdTwo);
            const expected = {
                'Alias':                                            aliasTwo,
                'First Text':                                       'sTart ',
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
                'Supplimentary information':                        'Extra info 1 | Extra info 2',
            };
            expect(reportOne.submitted).to.deep.equal(expected);
            await Report.delete(org, reportIdTwo);
        });
        it('Third report deleted', async function() {
            const reportThree = await Report.get(org, reportIdThree);
            expect(reportThree).to.equal(null);

        });
    });
});