/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */
/* Front-end JavaScript for the SMS evidence page          Louis Slater 2018 */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */


'use strict';


/**
 * Shows the no files error message, if the user hasn't uploaded any files.
 * Hides the no files error message, if the user has uploaded files.
 * 
 * @returns {boolean} - true if the user has uploaded files.
 *                      false otherwise.
 *                      Returning false stops the form from being submitted
 */
function changeErrorVisibility() {
    if (document.getElementById('files').files.length == 0) {
        document.getElementById('noFilesMessage').classList.remove('hide');
        return false;
    } else {
        document.getElementById('noFilesMessage').classList.add('hide');
        return true;
    }
}


/**
 * Shows the no files error message, if the user hasn't uploaded any files.
 * Hides the no files error message, if the user has uploaded files.
 * 
 * @returns {boolean} - true if the user has uploaded files.
 *                      false otherwise.
 *                      Returning false stops the form from being submitted
 */
function submitEvidence() { // eslint-disable-line no-unused-vars
    return changeErrorVisibility();
}


document.getElementById('files').onchange = changeErrorVisibility;
