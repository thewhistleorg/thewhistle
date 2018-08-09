/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */
/* Front-end JavaScript for the SMS evidence page          Louis Slater 2018 */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */


'use strict';

function changeErrorVisibility() {
    if (document.getElementById('files').files.length == 0) {
        document.getElementById('noFilesMessage').classList.remove('hide');
        return false;
    } else {
        document.getElementById('noFilesMessage').classList.add('hide');
        return true;
    }
}

function submitEvidence() { // eslint-disable-line no-unused-vars
    return changeErrorVisibility();
}

document.getElementById('files').onchange = changeErrorVisibility;