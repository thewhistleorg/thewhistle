'use strict';

function reCaptchaSubmitCallback(token) { // eslint-disable-line no-unused-vars
    document.querySelector('form').submit();
}

document.addEventListener('DOMContentLoaded', function() {
    var i;

    // add 'required' indicators to labels for required fields
    document.querySelectorAll('[required]').forEach(function(input) {
        var req = '<sup class="required" title="required">*</sup>';
        var prev = input.previousSibling;
        while (prev && prev.localName != 'label' && prev.previousSibling != null) prev = prev.previousSibling;
        if (prev && prev.localName=='label' && prev.textContent!='&nbsp;') prev.insertAdjacentHTML('beforeend', req);
    });

    // remove 'required' attributes if going back to prev page
    var prevButton = document.querySelector('button.prev');
    if (prevButton) {
        prevButton.onclick = function () {
            var fields = document.querySelectorAll('input,textarea');
            for (i=0; i<fields.length; i++) {
                fields[i].required = false;
            }
            // document.querySelectorAll('input,textarea').forEach(function(i) { i.required = false; });
        };
    }

    // set up listeners to manage visibility of subsidiary details and selection of associated inputs
    var questions = document.querySelectorAll('.question');
    for (var q=0; q<questions.length; q++) {
        manageVisibility(questions[q].id.replace('question-', ''));
    }


    function manageVisibility(inputName) {
        // get list of inputs named 'inputName'
        var inputsSelector = 'input[name='+inputName+'], textarea[name='+inputName+'], select[name='+inputName+']';
        var inputs = document.querySelectorAll(inputsSelector);

        // set up listeners to show current subsidiary and hide others
        for (i=0; i<inputs.length; i++) {
            inputs[i].onchange = function() {
                var sub = this.parentElement.querySelector('.subsidiary');
                // show current input's subsidiary, if any - unless it's a checked checkbox, in
                // which case hide it
                if (sub) {
                    if (this.type != 'checkbox' || this.checked) {
                        sub.classList.remove('hide');
                        sub.querySelector('input,textarea,select').focus();
                    } else {
                        sub.classList.add('hide');
                    }
                }

                // if 'this' is a radio button, hide other subsidiary divs, and uncheck any checkbox
                // inputs of the same name (eg action-taken 'skip')
                if (this.type == 'radio') {
                    inputs.forEach(function(input) {
                        var otherSub = input.parentElement.querySelector('.subsidiary');
                        if (otherSub && otherSub!=sub) otherSub.classList.add('hide');
                        var otherCheckboxes = document.querySelectorAll('input[type=checkbox][name='+inputName+']');
                        otherCheckboxes.forEach(function(c) { c.checked = false; });
                    });
                }

                // if 'this' is a skip option, clear any selects of the same name (eg survivor-age)
                if (this.value == 'skip') {
                    var otherSelects = document.querySelectorAll('select[name='+inputName+']');
                    otherSelects.forEach(function(s) { s.value = ''; });
                }
            };

            // if a subsidiary is initially displayed, setting focus to an input within that
            // subsidiary should select the option the subsidiary belongs to (eg 'where')
            var subInputs = inputs[i].parentElement.querySelectorAll('.subsidiary input, .subsidiary textarea');
            if (subInputs) {
                for (var j=0; j<subInputs.length; j++) {
                    subInputs[j].onfocus = function() {
                        var parentInput = this.closest('.subsidiary').parentElement.querySelector('input');
                        parentInput.checked = true;
                    };
                }
            }

            // if a top-level input receives focus, any radio button of the same name should be
            // unchecked (eg 'description')
            inputs[i].onfocus = function() {
                var radios = document.querySelector('input[type=radio][name='+inputName+']');
                if (radios) radios.checked = false;
            };

        }

        // set visibility defaults for previously answered questions
        for (i=0; i<inputs.length; i++) {
            if (inputs[i].checked) inputs[i].onchange();
        }
    }


    /*
     * 'used-before' page
     */

    if (document.querySelector('input[name=used-before]')) {
        // if we have no alias on opening page (ie we're not coming back to page with filled alias),
        // fetch a random one (use ajax to initialise alias so that no special treatment is required
        // within handlers)
        if (document.querySelector('output[name=generated-alias]').textContent == '') generateAlias();

        // if existing alias is already filled in, verify it
        if (document.querySelector('input[name=existing-alias]').value.trim() != '') {
            verifyExistingAlias(document.querySelector('input[name=existing-alias]').value);
        }

        // listener to set focus to existing-alias if used-before-y selected
        document.querySelector('#used-before-y').onclick = function() {
            if (this.checked) {
                document.querySelector('#use-existing').classList.remove('hide');
                document.querySelector('#use-generated').classList.add('hide');
                document.querySelector('input[name=existing-alias]').focus();
                document.querySelector('input[name=existing-alias]').select();
            } else { // TODO: possible?
                document.querySelector('#use-existing').classList.add('hide');
                document.querySelector('#use-generated').classList.remove('hide');
                document.querySelector('input[name=existing-alias]').value = '';
            }
        };

        // listener to display use-generated and clear existing-alias if used-before-n clicked
        document.querySelector('#used-before-n').onclick = function() {
            if (this.checked) {
                document.querySelector('#use-generated').classList.remove('hide');
                document.querySelector('#use-existing').classList.add('hide');
                document.querySelector('input[name=existing-alias]').value = '';
                document.querySelector('#alias-ok').classList.add('hide');
                document.querySelector('#alias-nok').classList.add('hide');
                if (this.setCustomValidity) this.setCustomValidity('');
            } else { // TODO: possible?
                document.querySelector('#use-generated').classList.add('hide');
                document.querySelector('#use-existing').classList.remove('hide');
                document.querySelector('input[name=existing-alias]').focus();
                document.querySelector('input[name=existing-alias]').select();
            }
        };

        // listener to get alternative generated alias
        document.querySelector('#get-alt-alias').onclick = function() {
            generateAlias();
        };

        // listener to check #used-before-y if existing-alias entered
        document.querySelector('input[name=existing-alias]').onchange = function() {
            document.querySelector('#used-before-y').checked = this.value != '';
            document.querySelector('#use-generated').classList.add('hide');
        };

        // check entered existing alias letter-by-letter
        document.querySelector('input[name=existing-alias]').oninput = function() {
            verifyExistingAlias(this.value);
        };
    }

    function generateAlias() {
        var db = window.location.pathname.split('/')[1]; // org'n/db is first part of the url path
        var request = new XMLHttpRequest();
        request.open('GET', '/ajax/'+db+'/aliases/new');
        request.onreadystatechange = function() {
            if (request.readyState == 4) {
                if (request.status == 200) {
                    var data = JSON.parse(request.responseText);
                    document.querySelector('output[name=generated-alias]').textContent = data.alias;
                    document.querySelector('input[name=generated-alias]').value = data.alias;
                } // TODO: or?
            }
        };
        request.send();
    }

    function verifyExistingAlias(alias) {
        if (alias.trim() == '') {
            if (this.setCustomValidity) document.querySelector('input[name=existing-alias]').setCustomValidity('');
            document.querySelector('#alias-ok').classList.add('hide');
            document.querySelector('#alias-nok').classList.add('hide');
            document.querySelector('#generated-alias').classList.remove('hide');
            return;
        }
        var db = window.location.pathname.split('/')[1]; // org'n/db is first part of the url path
        var request = new XMLHttpRequest();
        request.open('GET', '/ajax/'+db+'/aliases/'+alias.replace(' ', '+'));
        request.setRequestHeader('Accept', 'application/json');
        request.onreadystatechange = function () {
            if (request.readyState == 4) {
                switch (request.status) {
                    case 200: // alias exists
                        if (this.setCustomValidity) document.querySelector('input[name=existing-alias]').setCustomValidity('');
                        document.querySelector('#alias-ok').classList.remove('hide');
                        document.querySelector('#alias-nok').classList.add('hide');
                        if (this.setCustomValidity) this.setCustomValidity('');
                        break;
                    case 404: // alias not found
                        var err = 'Alias not found';
                        if (this.setCustomValidity) document.querySelector('input[name=existing-alias]').setCustomValidity(err);
                        document.querySelector('#alias-ok').classList.add('hide');
                        document.querySelector('#alias-nok').classList.remove('hide');
                        if (this.setCustomValidity) this.setCustomValidity('Alias not found');
                        break;
                    default: // ?? eg 500?
                        alert(request.responseText);
                        break;
                }
            }
        };
        request.send();
    }


    /*
     * whatnext (resources) page
     */

    if (document.querySelector('input[name=address]')) {
        document.querySelector('input[name=address]').oninput = function() {
            var input = document.querySelector('input[name=address]').value;
            var button = document.querySelector('#get');
            var formatted = document.querySelector('#formatted-address');
            if (this.value == '') {
                button.disabled = true;
                button.classList.add('grey');
                return;
            }
            delay(function() {
                var request = new XMLHttpRequest();
                request.responseType = 'json';
                request.open('GET', '/ajax/geocode?address='+encodeURI(input).replace(/%20/g, '+'));
                request.setRequestHeader('Accept', 'application/json');
                request.onreadystatechange = function () {
                    if (request.readyState == 4) {
                        switch (request.status) {
                            case 200:
                                var body = request.response;
                                button.disabled = false;
                                button.classList.remove('grey');
                                formatted.innerHTML = '(for <i>'+body.formattedAddress+'</i>)';
                                break;
                            case 404:
                                button.disabled = true;
                                button.classList.add('grey');
                                formatted.innerHTML = '';
                                break;
                        }
                    }
                };
                request.send();
            }, 330);
        };

        document.querySelector('form[name=get-resources]').onsubmit = function() {
            this.get.disabled = true; // prevent '&get=' appearing in the url
        };
    }

    var delay = (function() {
        var timer = null;
        return function(callback, ms) {
            clearTimeout (timer);
            timer = setTimeout(callback, ms);
        };
    })();
});
