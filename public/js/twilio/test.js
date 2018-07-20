/* global  Cookies */


'use strict';


window.onload = function () {
    Cookies.remove('first_text');
    Cookies.remove('session_id');
    Cookies.remove('alias');
    Cookies.remove('next_question');
    Cookies.remove('next_sms_type');
};


function addMessage(message) {
    const p = document.createElement('p');
    const t = document.createTextNode(message);
    const messages = document.getElementById('messages');
    p.appendChild(t);
    messages.appendChild(p);
}


function postSms(message) {
    const request = new XMLHttpRequest();
    request.open('POST', '/hfrn-test/hfrn-en');
    request.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
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
        'Body':          message,
        'FromCountry':   'GB',
        'To':            '+441727260269',
        'ToZip':         '',
        'NumSegments':   '1',
        'MessageSid':    'SMb2e0e20fdf02480a7a9fd5324cc1e307',
        'AccountSid':    'AC5da0166da2047a8e4d3b3709982ebaae',
        'From':          '+447716364079',
        'ApiVersion':    '2010-04-01',
    };
    let params = '';
    let param = '';
    Object.keys(body).forEach(function(key) {
        param = (key + '=' + body[key]).replace(' ', '%20');
        params = params === '' ? param : params + '&' + param;
    });
    request.onreadystatechange = function() {
        if (request.readyState == 4) {
            if (request.status == 200) {
                const response = request.responseText;
                const parser = new DOMParser();
                const xml = parser.parseFromString(response, 'text/xml');
                addMessage('HFRN: ' + xml.getElementsByTagName('Message')[0].childNodes[0].nodeValue);
            }
        }
    };
    request.withCredentials = true;
    request.send(params);
}


function sendSms() {
    const txt = document.getElementById('txt').value;
    addMessage('Me: ' + txt);
    postSms(txt);
    document.getElementById('txt').value = '';
    document.getElementById('txt').focus();
}


document.getElementById('btn').addEventListener('click', sendSms);


document.getElementById('txt').addEventListener('keyup', function(event) {
    if (event.keyCode === 13) {
        sendSms();
    }
});
