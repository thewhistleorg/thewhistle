/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */
/* Front-end JavaScript for the SMS testing page           Louis Slater 2018 */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */


'use strict';


/* global  Cookies */


//Remove all cookies when the page loads - this means on refresh, we start a new report
window.onload = function () {
    Cookies.remove('first_text');
    Cookies.remove('session_id');
    Cookies.remove('alias');
    Cookies.remove('next_question');
    Cookies.remove('next_sms_type');
    document.getElementById('txt').focus();
};


/**
 * Displays a message being sent/received.
 * 
 * @param   {string}    message - Text of the message being sent/received.
 * @param   {boolean}   sent - True if the message is being sent by user. False otherwise.
 */
function addMessage(message, sent) {
    const p = document.createElement('p');
    if (sent) {
        p.classList.add('sent');
    } else {
        p.classList.add('received');
    }
    const t = document.createTextNode(message);
    const messages = document.getElementById('messages');
    p.appendChild(t);
    messages.appendChild(p);
    window.scrollTo(0, document.body.scrollHeight);
}


/**
 * Sends a post request as if the user had sent an SMS.
 * 
 * @param   {string}   message - Text of the message the user is sending.
 */
function postSms(message) {
    const request = new XMLHttpRequest();
    //TODO: Don't use static organisation/project
    const org = window.location.pathname.split('/')[1];
    const project = window.location.pathname.split('/')[2];
    request.open('POST', `/${org}/${project}`);
    request.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
    const body = new FormData(document.getElementById('settings'));
    body.append('Body', message);
    let params = '';
    let param = '';
    for (const pair of body.entries()) {
        param = encodeURIComponent(pair[0]) + '=' + encodeURIComponent(pair[1]);
        params = params === '' ? param : params + '&' + param;
    }
    request.onreadystatechange = function() {
        if (request.readyState == 4) {
            if (request.status == 200) {
                //When the POST request receives a response
                const response = request.responseText;
                const parser = new DOMParser();
                const xml = parser.parseFromString(response, 'text/xml');
                addMessage(xml.getElementsByTagName('Message')[0].childNodes[0].nodeValue, false);
            }
        }
    };
    //Allow cookies
    request.withCredentials = true;
    request.send(params);
}


/**
 * Sends and displays user's input
 */
function sendSms() {
    const txt = document.getElementById('txt').value;
    addMessage(txt, true);
    postSms(txt);
    document.getElementById('txt').value = '';
    document.getElementById('txt').focus();
}


//Run sendSms() on send button click
document.getElementById('btn').addEventListener('click', sendSms);


//Run sendSms() on textbox enter
document.getElementById('txt').addEventListener('keyup', function(event) {
    if (event.keyCode === 13) {
        sendSms();
    }
});
