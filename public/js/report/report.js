'use strict';

document.addEventListener('DOMContentLoaded', function() {

    // add 'required' indicators for form labels
    document.querySelectorAll('[required]').forEach(function(input) {
        const req = '<sup class="required" title="required">*</sup>';
        let prev = input.previousSibling;
        while (prev && prev.localName != 'label' && prev.previousSibling != null) prev = prev.previousSibling;
        if (prev && prev.localName=='label' && prev.textContent!='&nbsp;') prev.insertAdjacentHTML('beforeend', req);
    });

    // remove 'required' attributes if going back to prev page
    const prevButton = document.querySelector('button.prev');
    if (prevButton) {
        prevButton.onclick = function () {
            document.querySelectorAll('input,textarea').forEach(function(i) { i.required = false; });
        };
    }

    /*
     * 'when' page
     */
    if (document.querySelector('input[name=when]')) {
        const months = [ 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'nov', 'dec' ];

        // set focus to hour/day field if any 'when' radio button clicked
        document.querySelectorAll('input[name=when]').forEach(function(input) {
            input.addEventListener('change', function() {
                switch (this.value) {
                    case 'date':
                        document.querySelector('input[name="date.day"]').focus();
                        document.querySelector('input[name="date.day"]').select();
                        break;
                    case 'within':
                        document.querySelector('select[name="within-options"]').focus();
                        break;
                }
            });
        });

        // check when-today if any today fields receive focus
        document.querySelectorAll('input[name^=today]').forEach(function(input) {
            input.addEventListener('focus', function() {
                document.querySelector('#when-today').checked = true;
            });
        });

        // check when-yesterday if any yesterday fields receive focus
        document.querySelectorAll('input[name^=yesterday]').forEach(function(input) {
            input.addEventListener('focus', function() {
                document.querySelector('#when-yesterday').checked = true;
            });
        });

        // check when-date if any date fields receive focus
        document.querySelectorAll('input[name^=date]').forEach(function(input) {
            input.addEventListener('focus', function() {
                document.querySelector('#when-date').checked = true;
            });
        });

        // check when-within if within-options is changed, clear it if no value set
        // (note not on focus, as tabbing to it from date would auto-select it)
        document.querySelector('#within-options').addEventListener('change', function() {
            document.querySelector('#when-within').checked = this.value!='';
        });

        // auto-advance day field when completed
        document.querySelector('input[name="date.day"]').addEventListener('keypress', function(event) {
            if (!event.key.match(/\d/)) { event.preventDefault(); return; }
            const newValue = this.value + event.key;
            if (newValue.length==2 || newValue>3) {
                document.querySelector('input[name="date.month"]').focus();
                document.querySelector('input[name="date.month"]').select();
            }
        });

        // auto-advance month field when completed
        document.querySelector('input[name="date.month"]').addEventListener('keypress', function(event) {
            //if (this.value.length == 3) { event.preventDefault(); return; }
            const newValue = this.value + event.key;
            if (months.indexOf(newValue.toLowerCase()) >= 0) {
                document.querySelector('input[name="date.year"]').focus();
                document.querySelector('input[name="date.year"]').select();
            }
        });

        // month field validation
        document.querySelector('input[name="date.month"]').addEventListener('change', function() {
            if (this.setCustomValidity == undefined) return;
            const err = 'Please enter a valid three-letter abbreviation of a month';
            const ok = months.indexOf(this.value.toLowerCase()) >= 0;
            this.setCustomValidity(ok ? '' : err);
        });

        // on/within validation
        document.querySelectorAll('input[name=when]').forEach(function(input) {
            input.addEventListener('change', function() {
                if (this.setCustomValidity == undefined) return;
                document.querySelector('#within-options').required = false;
                document.querySelectorAll('input[name^=date]').forEach(function(el) { el.required = false; });
                switch (input.value) {
                    case 'date':
                        document.querySelector('input[name="date.day"]').required = true;
                        document.querySelector('input[name="date.month"]').required = true;
                        document.querySelector('input[name="date.year"]').required = true;
                        document.querySelector('input[name="date.day"]').focus();
                        document.querySelector('input[name="date.day"]').select();
                        break;
                    case 'within':
                        document.querySelector('select[name="within-options"]').required = true;
                        document.querySelector('select[name="within-options"]').focus();
                        break;
                }
            });
        });

        // auto-advance hour field when completed (date)
        document.querySelector('input[name="date.hour"]').addEventListener('keypress', function(event) {
            const newValue = this.value + event.key;
            if (newValue.length==2 || newValue>2) {
                document.querySelector('input[name="date.minute"]').focus();
                document.querySelector('input[name="date.minute"]').select();
            }
        });

        // don't tab out of empty date field (in case tab typed after auto-advance)
        document.querySelectorAll('input[name^=date]').forEach(function(elem) {
            if (elem.name=='date.hour' || elem.name=='date.minute') return; // hour/min can be left blank
            elem.addEventListener('keydown', function (event) {
                if (event.key == 'Tab' && this.value == '') event.preventDefault();
            });
        });
    }

    /*
     * 'where' page
     */
    if (document.querySelector('input[name=where]')) {
        // check #where-at if at-address receives focus
        document.querySelector('#at-address').addEventListener('focus', function() {
            document.querySelector('#where-at').checked = true;
        });

        // set focus to at-address if where-at selected
        document.querySelectorAll('input[name=where]').forEach(function(input) {
            input.addEventListener('change', function() {
                if (input.value == 'at') {
                    document.querySelector('input[name="at-address"]').focus();
                    document.querySelector('input[name="at-address"]').select();
                }
            });
        });
    }

    /*
     * 'who' page
     */
    if (document.querySelector('input[name=who]')) {
        // check #who-y if who-relationship receives focus
        document.querySelector('#who-relationship').addEventListener('focus', function() {
            document.querySelector('#who-y').checked = true;
        });
        // check #who-n if who-description receives focus
        document.querySelector('#who-description').addEventListener('focus', function() {
            document.querySelector('#who-n').checked = true;
        });

        // set focus to who-relationship if who-y selected
        document.querySelectorAll('input[name=who]').forEach(function(input) {
            input.addEventListener('change', function() {
                if (input.value == 'y') {
                    document.querySelector('input[name="who-relationship"]').focus();
                    document.querySelector('input[name="who-relationship"]').select();
                }
            });
        });
        // set focus to who-description if who-n selected
        document.querySelectorAll('input[name=who]').forEach(function(input) {
            input.addEventListener('change', function() {
                if (input.value == 'n') {
                    document.querySelector('textarea[name="who-description"]').focus();
                    document.querySelector('textarea[name="who-description"]').select();
                }
            });
        });
    }

    /*
     * 'action-taken' page
     */
    if (document.querySelector('input[name="action-taken"]')) {
        // check #action-taken-other if action-taken-other-details entered
        document.querySelector('input[name="action-taken-other-details"]').addEventListener('change', function() {
            document.querySelector('#action-taken-other').checked = this.value != '';
        });

        // set focus to action-taken-other-details if action-taken-other selected
        document.querySelector('#action-taken-other').addEventListener('click', function() {
            if (this.checked) {
                document.querySelector('input[name="action-taken-other-details"]').focus();
                document.querySelector('input[name="action-taken-other-details"]').select();
            } else {
                document.querySelector('input[name="action-taken-other-details"]').value = '';
            }
        });
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
        document.querySelector('#used-before-y').addEventListener('click', function() {
            if (this.checked) {
                document.querySelector('#usegenerated').classList.add('hide');
                document.querySelector('input[name="existing-alias"]').focus();
                document.querySelector('input[name="existing-alias"]').select();
            } else {
                document.querySelector('#usegenerated').classList.remove('hide');
                document.querySelector('input[name="existing-alias"]').value = '';
            }
        });

        // listener to display usegenerated and clear existing-alias if used-before-n clicked
        document.querySelector('#used-before-n').addEventListener('click', function() {
            if (this.checked) {
                document.querySelector('#usegenerated').classList.remove('hide');
                document.querySelector('input[name="existing-alias"]').value = '';
                document.querySelector('#alias-ok').classList.add('hide');
                document.querySelector('#alias-nok').classList.add('hide');
                if (this.setCustomValidity) this.setCustomValidity('');
            } else {
                document.querySelector('#usegenerated').classList.add('hide');
                document.querySelector('input[name="existing-alias"]').focus();
                document.querySelector('input[name="existing-alias"]').select();
            }
        });

        // listener to get alternative generated alias
        document.querySelector('#get-alt-alias').addEventListener('click', function() {
            generateAlias();
        });

        // listener to check #used-before-y if existing-alias entered
        document.querySelector('input[name="existing-alias"]').addEventListener('change', function() {
            document.querySelector('#used-before-y').checked = this.value != '';
            document.querySelector('#usegenerated').classList.add('hide');
        });

        // check entered existing alias letter-by-letter
        document.querySelector('input[name="existing-alias"]').oninput = function() {
            verifyExistingAlias(this.value);
        };
    }

    function generateAlias() {
        const db = window.location.pathname.split('/')[1]; // org'n/db is first part of the url path
        const request = new XMLHttpRequest();
        request.open('GET', '/ajax/'+db+'/aliases/new');
        request.onreadystatechange = function() {
            if (request.readyState == 4) {
                if (request.status == 200) {
                    const data = JSON.parse(request.responseText);
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
        const db = window.location.pathname.split('/')[1]; // org'n/db is first part of the url path
        const request = new XMLHttpRequest();
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
                        const err = 'Alias not found';
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
     * Resources ('what next') page
     */
    if (document.querySelector('input[name=address]')) {
        document.querySelector('input[name="address"]').oninput = function() {
            const input = this;
            const button = document.querySelector('#get');
            const formatted = document.querySelector('#formatted-address');
            if (input.value == '') {
                button.disabled = true;
                button.classList.add('grey');
                return;
            }
            delay(async function() {
                const response = await fetch(`/ajax/geocode?address=${encodeURI(input.value).replace(/%20/g, '+')}`);
                switch (response.status) {
                    case 200:
                        const body = await response.json();
                        button.disabled = false;
                        button.classList.remove('grey');
                        formatted.innerHTML = `(for <i>${body.formattedAddress}</i>)`;
                        break;
                    case 404:
                        button.disabled = true;
                        button.classList.add('grey');
                        formatted.innerHTML = '';
                        break;
                }
            }, 330);
        };

        document.querySelector('form[name=get-resources]').onsubmit = function() {
            this.get.disabled = true; // prevent '&get=' appearing in the url
        };
    }

    const delay = (function() {
        let timer = null;
        return function(callback, ms) {
            clearTimeout (timer);
            timer = setTimeout(callback, ms);
        };
    })();
});


