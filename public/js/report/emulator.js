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
    var p = document.createElement('p');
    if (sent) {
        p.classList.add('sent');
    } else {
        p.classList.add('received');
    }
    var t = document.createTextNode(message);
    var messages = document.getElementById('messages');
    p.appendChild(t);
    messages.appendChild(p);
    window.scrollTo(0, document.body.scrollHeight);
}


/**
 * Sends a post request as if the user had sent an SMS.
 * 
 * @param {string} message - Text of the message the user is sending.
 */
function postSms(message) {
    var request = new XMLHttpRequest();
    request.open('POST', '/sms-post');
    request.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
    var settings = '<form id="settings"> \
    <div style="white-space:nowrap"><label for="To">To:</label><input type="text" name="To" value="+441727260269" id="To" class="settings-input"></div> \
    <div style="white-space:nowrap"><label for="ToCountry">To Country:</label><input type="text" name="ToCountry" value="GB" id="ToCountry" class="settings-input"></div> \
    <div style="white-space:nowrap"><label for="ToState">To State:</label><input type="text" name="ToState" value="St Albans" id="ToState" class="settings-input"></div> \
    <div style="white-space:nowrap"><label for="ToCity">To City:</label><input type="text" name="ToCity" value="" id="ToCity" class="settings-input"></div> \
    <div style="white-space:nowrap"><label for="ToZip">To Zip:</label><input type="text" name="ToZip" value="" id="ToZip" class="settings-input"></div> \
    <div style="white-space:nowrap"><label for="From">From:</label><input type="text" name="From" value="+447716364079" id="From" class="settings-input"></div> \
    <div style="white-space:nowrap"><label for="FromCountry">From Country:</label><input type="text" name="FromCountry" value="GB" id="FromCountry" class="settings-input"></div> \
    <div style="white-space:nowrap"><label for="FromState">From State:</label><input type="text" name="FromState" value="" id="FromState" class="settings-input"></div> \
    <div style="white-space:nowrap"><label for="FromCity">From City:</label><input type="text" name="FromCity" value="" id="FromCity" class="settings-input"></div> \
    <div style="white-space:nowrap"><label for="FromZip">From Zip:</label><input type="text" name="FromZip" value="" id="FromZip" class="settings-input"></div> \
    <div style="white-space:nowrap"><label for="SmsMessageSid">Message ID:</label><input type="text" name="SmsMessageSid" value="SMb2e0e20fdf02480a7a9fd5324cc1e307" id="SmsMessageSid" class="settings-input"></div> \
    <div style="white-space:nowrap"><label for="NumMedia">No of Media:</label><input type="text" name="NumMedia" value="0" id="NumMedia" class="settings-input"></div> \
    <div style="white-space:nowrap"><label for="SmsSid">SMS ID:</label><input type="text" name="SmsSid" value="SMb2e0e20fdf02480a7a9fd5324cc1e307" id="SmsSid" class="settings-input"></div> \
    <div style="white-space:nowrap"><label for="SmsStatus">SMS Status:</label><input type="text" name="SmsStatus" value="received" id="SmsStatus" class="settings-input"></div> \
    <div style="white-space:nowrap"><label for="NumSegments">No of Segments:</label><input type="text" name="NumSegments" value="1" id="NumSegments" class="settings-input"></div> \
    <div style="white-space:nowrap"><label for="MessageSid">Message ID:</label><input type="text" name="MessageSid" value="SMb2e0e20fdf02480a7a9fd5324cc1e307" id="MessageSid" class="settings-input"></div> \
    <div style="white-space:nowrap"><label for="AccountSid">Account ID:</label><input type="text" name="AccountSid" value="AC5da0166da2047a8e4d3b3709982ebaae" id="AccountSid" class="settings-input"></div> \
    <div style="white-space:nowrap"><label for="ApiVersion">API Version:</label><input type="text" name="ApiVersion" value="2010-04-01" id="ApiVersion" class="settings-input"></div> \
    </form>';
    var body = new FormData(settings);
    body.append('Body', message);
    var params = '';
    var entries = body.entries();
    for (var pair=0; pair<entries.length; pair++) {
        var param = encodeURIComponent(entries[pair][0]) + '=' + encodeURIComponent(entries[pair][1]);
        params = params === '' ? param : params + '&' + param;
    }
    request.onreadystatechange = function() {
        if (request.readyState == 4) {
            if (request.status == 200) {
                //When the POST request receives a response
                var response = request.responseText;
                var parser = new DOMParser();
                var xml = parser.parseFromString(response, 'text/xml');
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
    var txt = document.getElementById('txt').value;
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
