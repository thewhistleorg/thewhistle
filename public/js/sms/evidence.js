/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */
/* Front-end JavaScript for the SMS evidence page          Louis Slater 2018 */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */


'use strict';

function submitEvidence() {
    var formData = new FormData(document.getElementById('evidenceForm'));
    if (document.getElementById('files').files.length == 0) {
        const p = document.createElement('p');
        const t = document.createTextNode('Please upload a file before submitting.');
        const messages = document.getElementById('errorMessage');
        p.appendChild(t);
        messages.appendChild(p);
        return false;
    }
}

//document.getElementById('submitBtn').addEventListener('click', submitEvidence);