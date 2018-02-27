'use strict';

document.addEventListener('DOMContentLoaded', function() {

    // add 'required' indicators for form labels
    // document.querySelectorAll('[required]').forEach(function(input) {
    //     var req = '<sup class="required" title="required">*</sup>';
    //     var prev = input.previousSibling;
    //     while (prev && prev.localName != 'label' && prev.previousSibling != null) prev = prev.previousSibling;
    //     if (prev && prev.localName=='label' && prev.textContent!='&nbsp;') prev.insertAdjacentHTML('beforeend', req);
    // });

    // remove 'required' attributes if going back to prev page
    var prevButton = document.querySelector('button.prev');
    if (prevButton) {
        prevButton.onclick = function () {
            var fields = document.querySelectorAll('input,textarea');
            for (var i=0; i<fields.length; i++) {
                fields[i].required = false;
            }
            // document.querySelectorAll('input,textarea').forEach(function(i) { i.required = false; });
        };
    }


    /*
     * 'when' page
     */

    if (document.querySelector('input[name=when]')) {
        var months = [ 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'nov', 'dec' ];

        var whenInputs = document.querySelectorAll('input[name=when]');

        for (var i=0; i<whenInputs.length; i++) {
            whenInputs[i].onclick = function() {
                const ul = this.parentElement.parentElement;
                switch (this.value) {
                    case 'date':
                        ul.querySelector('#when-date-form').classList.remove('hide');
                        ul.querySelector('#when-within-form').classList.add('hide');
                        break;
                    case 'within':
                        ul.querySelector('#when-date-form').classList.add('hide');
                        ul.querySelector('#when-within-form').classList.remove('hide');
                        ul.querySelector('select[name="within-options"]').focus();
                        break;
                    case 'dont-remember':
                        ul.querySelector('#when-date-form').classList.add('hide');
                        ul.querySelector('#when-within-form').classList.add('hide');
                        break;
                    case 'skip':
                        ul.querySelector('#when-date-form').classList.add('hide');
                        ul.querySelector('#when-within-form').classList.add('hide');
                        break;
                }
            };
        }

        // set defaults for previously answered questions
        for (var i=0; i<whenInputs.length; i++) {
            if (whenInputs[i].checked) whenInputs[i].onclick();
        }
    }


    /*
     * 'where' page
     */

    if (document.querySelector('#where')) {
        var ul = document.querySelector('#where');

        var whereInputs = document.querySelectorAll('input[name=where]');

        // show/hide at-address according to selected option
        for (var i=0; i<whereInputs.length; i++) {
            whereInputs[i].onclick = function() {
                switch (this.value) {
                    case 'at':
                        ul.querySelector('#where-at-form').classList.remove('hide');
                        where.querySelector('textarea[name="at-address"]').focus();
                        where.querySelector('textarea[name="at-address"]').select();
                        break;
                    case 'dont-know':
                        ul.querySelector('#where-at-form').classList.add('hide');
                        break;
                    case 'skip':
                        ul.querySelector('#where-at-form').classList.add('hide');
                        break;
                }
            };
        }


        // defaults for previously answered questions
        for (var i=0; i<whereInputs.length; i++) {
            if (whereInputs[i].checked) whereInputs[i].onclick();
        }

        // check #where-at if at-address receives focus
        document.querySelector('#at-address').onfocus = function() {
            document.querySelector('#where-at').checked = true;
        };
    }


    /*
     * 'who' page
     */

    if (document.querySelector('input[name=who]')) {
        var ul = document.querySelector('#who');

        var whoInputs = document.querySelectorAll('input[name=who]');

        // display/hide supplementary information fields on radio-box selection
        for (var i=0; i<whoInputs.length; i++) {
            whoInputs[i].onclick = function() {
                switch (this.value) {
                    case 'y':
                        ul.querySelector('#who-n-form').classList.add('hide');
                        ul.querySelector('#who-y-form').classList.remove('hide');
                        ul.querySelector('textarea[name="who-relationship"]').focus();
                        ul.querySelector('textarea[name="who-relationship"]').select();
                        break;
                    case 'n':
                        ul.querySelector('#who-y-form').classList.add('hide');
                        ul.querySelector('#who-n-form').classList.remove('hide');
                        ul.querySelector('textarea[name="who-description"]').focus();
                        ul.querySelector('textarea[name="who-description"]').select();
                        break;
                    case 'skip':
                        ul.querySelector('#who-y-form').classList.add('hide');
                        ul.querySelector('#who-n-form').classList.add('hide');
                        break;
                }
            };
        }

        // set defaults for previously answered questions
        for (var i=0; i<whoInputs.length; i++) {
            if (whoInputs[i].checked) whoInputs[i].onclick();
        }
    }

    /*
    * 'description' page
    */

    if (document.getElementsByName('description').length > 0) {

        // Make radio buttons act as a toggler
        var allRadios = document.querySelectorAll('input[name="description"], input[name="survivor-age"]');
        var booRadio;
        for (var x=0; x<allRadios.length; x++) {
            allRadios[x].onclick = function() {
                if (booRadio == this) {
                    this.checked = false;
                    booRadio = null;
                } else {
                    booRadio = this;
                }
            };
        }

        // uncheck radio when description box focused
        document.querySelector('textarea[name="description"]').addEventListener('focus', function() {
            document.querySelector('input[name="description"]').checked = false;
        });

        // uncheck radio when survivor-age focused
        document.querySelector('select[name="survivor-age"]').addEventListener('change', function() {
            document.querySelector('input[name="survivor-age"]').checked = false;
        });
    }


    /*
     * 'action-taken' page
     */

    if (document.querySelector('input[name="action-taken"]')) {
        // defaults for previously answered questions

        var nameActionTaken = document.querySelectorAll('input[type=checkbox]');
        for (var i=0; i<nameActionTaken.length; i++) {
            var el = nameActionTaken[i];
            if (el.checked) {
                var extra = el.parentElement.querySelector('input[type=text]');
                extra.classList.remove('hide');
            }
        }


        var nameActionTaken2 = document.querySelectorAll('input[type=checkbox]');
        for (var i=0; i<nameActionTaken2.length; i++) {
            var el = nameActionTaken2[i];
            el.onclick = function() {
                var extra = this.parentElement.querySelector('input[type=text]');
                if (this.checked) {
                    extra.classList.remove('hide');
                    extra.focus();
                    extra.select();
                } else {
                    extra.value = '';
                    extra.classList.add('hide');
                }
            };
        }

        // uncheck radio when survivor-age focused
        document.querySelector('#action-taken-skip').addEventListener('change', function() {
            var checkboxes =   document.querySelectorAll('input[type="checkbox"]');

            // uncheck all checkboxes when skip radio is selected
            if (this.checked == true) {
                for (var i=0; i<checkboxes.length; i++) {
                    checkboxes[i].checked = false;
                }

            }

            // uncheck skip radio when any checkbox is checked
            for (var i=0; i<checkboxes.length; i++) {
                checkboxes[i].addEventListener('change', function() {
                    if (this.checked == true) {
                        document.querySelector('#action-taken-skip').checked = false;
                    }
                });
            }

        });

        // uncheck skip radio button when extra content are focused or when the input focused
        var checkboxExtra = document.querySelectorAll('input[type="text"]');
        for (var i=0; i<checkboxExtra.length; i++) {
            checkboxExtra[i].addEventListener('focus', function() {
                document.querySelector('#action-taken-skip').checked = false;
                this.parentElement.firstElementChild.checked = true;
            });
        }
    }


    /*
     * 'used-before' page
     */

    if (document.querySelector('input[name="used-before"]')) {
        // if we have no alias on opening page (ie we're not coming back to page with filled alias),
        // fetch a random one (use ajax to initialise alias so that no special treatment is required
        // within handlers)
        if (document.querySelector('output[name="generated-alias"]').textContent == '') generateAlias();

        // if existing alias is already filled in, verify it
        if (document.querySelector('input[name="existing-alias"]').value.trim() != '') {
            verifyExistingAlias(document.querySelector('input[name="existing-alias"]').value);
        }

        // listener to set focus to existing-alias if used-before-y selected
        document.querySelector('#used-before-y').onclick = function() {
            if (this.checked) {
                document.querySelector('#use-existing').classList.remove('hide');
                document.querySelector('#use-generated').classList.add('hide');
                document.querySelector('input[name="existing-alias"]').focus();
                document.querySelector('input[name="existing-alias"]').select();
            } else { // TODO: possible?
                document.querySelector('#use-existing').classList.add('hide');
                document.querySelector('#use-generated').classList.remove('hide');
                document.querySelector('input[name="existing-alias"]').value = '';
            }
        };

        // listener to display use-generated and clear existing-alias if used-before-n clicked
        document.querySelector('#used-before-n').onclick = function() {
            if (this.checked) {
                document.querySelector('#use-generated').classList.remove('hide');
                document.querySelector('#use-existing').classList.add('hide');
                document.querySelector('input[name="existing-alias"]').value = '';
                document.querySelector('#alias-ok').classList.add('hide');
                document.querySelector('#alias-nok').classList.add('hide');
                if (this.setCustomValidity) this.setCustomValidity('');
            } else { // TODO: possible?
                document.querySelector('#use-generated').classList.add('hide');
                document.querySelector('#use-existing').classList.remove('hide');
                document.querySelector('input[name="existing-alias"]').focus();
                document.querySelector('input[name="existing-alias"]').select();
            }
        };

        // listener to get alternative generated alias
        document.querySelector('#get-alt-alias').onclick = function() {
            generateAlias();
        };

        // listener to check #used-before-y if existing-alias entered
        document.querySelector('input[name="existing-alias"]').onchange = function() {
            document.querySelector('#used-before-y').checked = this.value != '';
            document.querySelector('#use-generated').classList.add('hide');
        };

        // check entered existing alias letter-by-letter
        document.querySelector('input[name="existing-alias"]').oninput = function() {
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
                    document.querySelector('output[name="generated-alias"]').textContent = data.alias;
                    document.querySelector('input[name="generated-alias"]').value = data.alias;
                } // TODO: or?
            }
        };
        request.send();
    }

    function verifyExistingAlias(alias) {
        if (alias.trim() == '') {
            if (this.setCustomValidity) document.querySelector('input[name="existing-alias"]').setCustomValidity('');
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
                        if (this.setCustomValidity) document.querySelector('input[name="existing-alias"]').setCustomValidity('');
                        document.querySelector('#alias-ok').classList.remove('hide');
                        document.querySelector('#alias-nok').classList.add('hide');
                        if (this.setCustomValidity) this.setCustomValidity('');
                        break;
                    case 404: // alias not found
                        var err = 'Alias not found';
                        if (this.setCustomValidity) document.querySelector('input[name="existing-alias"]').setCustomValidity(err);
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


    /**
     * whatnext (resources) page
     */

    if (document.querySelector('input[name=address]')) {
        document.querySelector('input[name="address"]').oninput = function() {
            var input = this;
            var button = document.querySelector('#get');
            var formatted = document.querySelector('#formatted-address');
            if (input.value == '') {
                button.disabled = true;
                button.classList.add('grey');
                return;
            }
            delay(function() {
                var request = new XMLHttpRequest();
                request.responseType = 'json';
                request.open('GET', '/ajax/geocode?address='+encodeURI(input.value).replace(/%20/g, '+'));
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
