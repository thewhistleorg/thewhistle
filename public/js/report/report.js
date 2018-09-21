'use strict';

function reCaptchaSubmitCallback(token) { // eslint-disable-line no-unused-vars
    document.querySelector('form').submit();
}


function clearValues(elements) {
    for (var index = 0; index < elements.length; index++) {
        if (elements[index].type == 'radio' || elements[index].type == 'checkbox') {
            elements[index].checked = false;
        } else {
            elements[index].value = null;
        }
    }
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
    var questions = document.querySelectorAll('[class^=question], [class*=" question"]');
    for (var q=0; q<questions.length; q++) {
        const [ questionInputName ] = [ ...questions[q].classList ].filter(c => c.match(/^question/)); // TODO: convert to ES5
        manageVisibility(questionInputName.replace('question-', ''));
    }


    function manageVisibility(inputName) {
        // get list of inputs named 'inputName'
        var inputsSelector = 'input[name='+inputName+'], textarea[name='+inputName+'], select[name='+inputName+']';
        var inputs = document.querySelectorAll(inputsSelector);
        // set up listeners to show current subsidiary and hide others
        for (i=0; i<inputs.length; i++) {
            inputs[i].addEventListener('change', function() { // note cannot simply assign to .onchange due to alternate texts listener
                // 'this' is changed element
                var sub = this.parentElement.querySelector('.subsidiary'); // subsidiary within same <li>
                // show current input's subsidiary, if any - unless it's a checked checkbox, in
                // which case hide it TODO: ??
                // also disable hidden inputs, so that they will not get submitted in POST data
                if (sub) {
                    var showSubsidiary = this.type=='radio'
                        || (this.type=='checkbox' && this.checked)
                        || (this.type=='select-one' && this.value!='' && sub.classList.contains('select-any-subsidiary')) // note front-end DOM gives 'select-one' rather than 'select'
                        || (this.type=='select-one' && sub.classList.contains(`${this.value.replace(new RegExp(' ', 'g'), '_')}-subsidiary`));
                    if (showSubsidiary) {  // show && re-enable element
                        sub.classList.remove('hide');
                        sub.querySelectorAll('input,textarea,select').forEach(j => j.disabled = false);
                        sub.querySelector('input,textarea,select').focus();
                    } else {               // hide & disable element
                        sub.classList.add('hide'); // hide element
                        sub.querySelectorAll('input,textarea,select').forEach(j => j.disabled = true);
                    }
                }

                // if 'this' is a radio button, hide other subsidiary divs, and uncheck any checkbox
                // inputs of the same name (eg action-taken 'skip')
                if (this.type == 'radio') {
                    inputs.forEach(function(input) {
                        var otherSub = input.parentElement.querySelector('.subsidiary');
                        if (otherSub && otherSub!=sub) {
                            otherSub.classList.add('hide');
                            otherSub.querySelectorAll('input,textarea,select').forEach(j => j.disabled = true);
                        }
                        var otherCheckboxes = document.querySelectorAll('input[type=checkbox][name='+inputName+']');
                        otherCheckboxes.forEach(function(c) { c.checked = false; });
                    });
                }
                
                //TODO: Make it remove branch if option is unselected as a radio button
                if (this.type == 'checkbox') {
                    const className = this.id + '-branch'; 
                    const branches = document.getElementsByClassName(className);
                    if (this.checked) {
                        for (let b = 0; b < branches.length; b++) {
                            branches[b].classList.remove('hide');
                        }
                    } else {
                        for (let b = 0; b < branches.length; b++) {
                            branches[b].classList.add('hide');
                        }
                    }
                } else if (this.type == 'radio') {
                    const options = document.getElementsByName(this.name);
                    for (let o = 0; o < options.length; o++) {
                        let className = options[o].id + '-branch';
                        const branches = document.getElementsByClassName(className);
                        if (options[o].checked) {
                            for (let b = 0; b < branches.length; b++) {
                                branches[b].classList.remove('hide');
                            }
                        } else {
                            for (let b = 0; b < branches.length; b++) {
                                branches[b].classList.add('hide');
                                clearValues(branches[b].getElementsByTagName('input'));
                                clearValues(branches[b].getElementsByTagName('textarea'));
                                clearValues(branches[b].getElementsByTagName('select'));
                            }
                        }
                    }
                }

                // if 'this' is a skip option, clear any selects of the same name (eg survivor-age)
                if (this.value == 'Skip') {
                    var otherSelects = document.querySelectorAll('select[name='+inputName+']');
                    otherSelects.forEach(function(s) { s.value = ''; });
                }
            });

            // if a subsidiary is initially displayed, setting focus to an input within that
            // subsidiary should select the option the subsidiary belongs to (eg 'where')
            var subInputs = inputs[i].parentElement.querySelectorAll('.subsidiary input, .subsidiary textarea');
            if (subInputs) {
                for (var j=0; j<subInputs.length; j++) {
                    subInputs[j].onfocus = function() {
                        var parentInput = this.closest('.subsidiary').parentElement.querySelector('input');
                        if (parentInput) parentInput.checked = true;
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
            // note cannot simply invoke onchange() as listeners were set up with addEventListener()
            if (inputs[i].type=='select-one') inputs[i].dispatchEvent(new Event('change')); // show/hide select subsidiary (note 'select-one')
            if (inputs[i].checked) inputs[i].dispatchEvent(new Event('change'));            // show radio/checkbox subsidiary
        }
    }


    // handle radio buttons which might be determining alternate texts
    document.querySelectorAll('input[type=radio]').forEach(function(input) {
        input.addEventListener('change', function() { // note cannot simply assign to .onchange due to visibility listener
            const altTextsShow = document.querySelectorAll(`[data-${this.name}][data-${this.name}="${this.value}"]`);
            const altTextsHide = document.querySelectorAll(`[data-${this.name}]:not([data-${this.name}="${this.value}"])`);
            altTextsShow.forEach(function (el) { el.classList.remove('hide'); el.classList.add('show'); });
            altTextsHide.forEach(function (el) { el.classList.remove('show'); el.classList.add('hide'); });
        });
    });


    /*
     * 'used-before' page: this page requires special handling for anonymous alias
     */

    if (document.querySelector('input[name=used-before]')) {
        // if we have no alias on opening page (ie we're not coming back to page with filled alias),
        // fetch a random one (use ajax to initialise alias so that no special treatment is required
        // within handlers)
        if (document.querySelector('output[name=used-before-generated-alias]').textContent == '') generateAlias();

        // if existing alias is already filled in, verify it
        if (document.querySelector('input[name=used-before-existing-alias]').value.trim() != '') {
            verifyExistingAlias(document.querySelector('input[name=used-before-existing-alias]').value);
        }

        // listener to set focus to existing-alias if used-before-y selected
        document.querySelector('#used-before-y').onclick = function() {
            const usedBeforeY = document.querySelector('#used-before-y');
            const usedBeforeN = document.querySelector('#used-before-n');
            if (this.checked) {
                usedBeforeY.parentElement.querySelector('.subsidiary').classList.remove('hide');
                usedBeforeN.parentElement.querySelector('.subsidiary').classList.add('hide');
                document.querySelector('input[name=used-before-existing-alias]').focus();
                document.querySelector('input[name=used-before-existing-alias]').select();
            } else { // TODO: possible?
                document.querySelector('#use-existing').classList.add('hide');
                document.querySelector('#use-generated').classList.remove('hide');
                document.querySelector('input[name=used-before-existing-alias]').value = '';
            }
        };

        // listener to display use-generated and clear existing-alias if used-before-n clicked
        document.querySelector('#used-before-n').onclick = function() {
            const usedBeforeY = document.querySelector('#used-before-y');
            const usedBeforeN = document.querySelector('#used-before-n');
            if (this.checked) {
                usedBeforeN.parentElement.querySelector('.subsidiary').classList.remove('hide');
                usedBeforeY.parentElement.querySelector('.subsidiary').classList.add('hide');
                document.querySelector('input[name=used-before-existing-alias]').value = '';
                document.querySelector('#alias-ok').classList.add('hide');
                document.querySelector('#alias-nok').classList.add('hide');
                if (this.setCustomValidity) this.setCustomValidity('');
            } else { // TODO: possible?
                document.querySelector('#use-generated').classList.add('hide');
                document.querySelector('#use-existing').classList.remove('hide');
                document.querySelector('input[name=used-before-existing-alias]').focus();
                document.querySelector('input[name=used-before-existing-alias]').select();
            }
        };

        // listener to get alternative generated alias
        document.querySelector('button[name=get-alt-alias]').onclick = function() {
            generateAlias();
        };

        // listener to check #used-before-y if existing-alias entered
        document.querySelector('input[name=used-before-existing-alias]').addEventListener('change', function() {
            document.querySelector('#used-before-y').checked = this.value != '';
            document.querySelector('#use-generated').classList.add('hide');
        });

        // check entered existing alias letter-by-letter
        document.querySelector('input[name=used-before-existing-alias]').oninput = function() {
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
                    document.querySelector('output[name=used-before-generated-alias]').textContent = data.alias;
                    document.querySelector('input[name=used-before-generated-alias]').value = data.alias;
                } // TODO: or?
            }
        };
        request.send();
    }

    function verifyExistingAlias(alias) {
        if (alias.trim() == '') {
            if (this.setCustomValidity) document.querySelector('input[name=used-before-existing-alias]').setCustomValidity('');
            document.querySelector('#alias-ok').classList.add('hide');
            document.querySelector('#alias-nok').classList.add('hide');
            document.querySelector('#used-before-generated-alias').classList.remove('hide');
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
                        if (this.setCustomValidity) document.querySelector('input[name=used-before-existing-alias]').setCustomValidity('');
                        document.querySelector('#alias-ok').classList.remove('hide');
                        document.querySelector('#alias-nok').classList.add('hide');
                        if (this.setCustomValidity) this.setCustomValidity('');
                        break;
                    case 404: // alias not found
                        var err = 'Alias not found';
                        if (this.setCustomValidity) document.querySelector('input[name=used-before-existing-alias]').setCustomValidity(err);
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
                request.open('GET', '/ajax/geocode?address='+encodeURI(this.value).replace(/%20/g, '+'));
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

        document.querySelector('form').onsubmit = function() {
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
