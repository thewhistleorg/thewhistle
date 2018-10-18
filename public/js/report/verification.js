'use strict';


document.addEventListener('DOMContentLoaded', function() {
    if (document.querySelector('div.cam-email-verification')) {
        const nextBtns = document.getElementsByName('nav-next');
        for (let i = 0; i < nextBtns.length; i++) {
            nextBtns[i].disabled = true;
        }
        document.getElementById('send-code-btn').addEventListener('click', sendCodeListener);
    }
});


function validEmail(email) {
    const re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@(cam.ac.uk|cantab.net)$/;
    return re.test(String(email).toLowerCase());
}


function sendEmailVerification(email) {
    document.getElementById('send-code-btn').disabled = true;
    const request = new XMLHttpRequest();
    const database = window.location.pathname.split('/')[1];
    request.open('POST', `/verify-cam-email?database=${encodeURIComponent(database)}&email=${encodeURIComponent(email)}`);
    request.onreadystatechange = function() {
        if (request.readyState == 4) {
            document.getElementById('send-code-btn').disabled = false;
            if (request.status == 200) {
                //When the POST request receives a response
                document.getElementById('email-err').classList.add('hide');
                document.getElementById('verification-code-block').classList.remove('hide');
                document.getElementById('send-code-btn').value = "Resend Verification Code";
                const nextBtns = document.getElementsByName('nav-next');
                for (let i = 0; i < nextBtns.length; i++) {
                    nextBtns[i].disabled = false;
                }
            } else {
                alert('Error: Could not send verification email.');
            }
        }
    };
    request.send();
}


function sendCodeListener() {
    const email = document.getElementById('cam-email').value;
    if (validEmail(email)) {
        sendEmailVerification(email);
    } else {
        document.getElementById('email-err').classList.remove('hide');
    }
}
