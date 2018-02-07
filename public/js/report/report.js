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
            input.onchange = function() {
                switch (this.value) {
                    case 'date':
                        document.querySelector('select[name="date.day"]').focus();
                        // document.querySelector('select[name="date.day"]').select();
                        this.parentElement.parentElement.querySelector('.when-form').style.display = document.querySelector('#when-date').checked ? 'block' : 'none';
                        break;
                    case 'within':
                        document.querySelector('select[name="within-options"]').focus();
                        this.parentElement.parentElement.querySelector('.when-form').style.display='none';
                        break;
                    case 'dont-remember':
                        this.parentElement.parentElement.querySelector('.when-form').style.display='none';
                        break;
                }
            };
        });

        if (document.querySelector('#when-date').checked == true) {
            document.querySelector('input[name=when]').parentElement.querySelector('.when-form').style.display='block';
        }

        // check when-today if any today fields receive focus
        document.querySelectorAll('input[name^=today]').forEach(function(input) {
            input.onfocus = function() {
                document.querySelector('#when-today').checked = true;
            };
        });

        // check when-yesterday if any yesterday fields receive focus
        document.querySelectorAll('input[name^=yesterday]').forEach(function(input) {
            input.onfocus = function() {
                document.querySelector('#when-yesterday').checked = true;
            };
        });


        // check when-date if any date fields receive focus
        document.querySelectorAll('input[name^=date], select[name^=date]').forEach(function(input) {
            input.onfocus = function() {
                document.querySelector('#when-date').checked = true;
            };
        });

        // check when-within if within-options is changed, clear it if no value set
        // (note not on focus, as tabbing to it from date would auto-select it)
        document.querySelector('#within-options').onchange = function() {
            document.querySelector('#when-within').checked = this.value!='';
        };

        // auto-advance day field when completed
        document.querySelector('select[name="date.day"]').onkeypress = function(event) {
            if (!event.key.match(/\d/)) { event.preventDefault(); return; }
            const newValue = this.value + event.key;
            if (newValue.length==2 || newValue>3) {
                document.querySelector('select[name="date.month"]').focus();
                document.querySelector('select[name="date.month"]').select();
            }
        };

        // auto-advance month field when completed
        document.querySelector('select[name="date.month"]').onkeypress = function(event) {
            //if (this.value.length == 3) { event.preventDefault(); return; }
            const newValue = this.value + event.key;
            if (months.indexOf(newValue.toLowerCase()) >= 0) {
                document.querySelector('select[name="date.year"]').focus();
                document.querySelector('select[name="date.year"]').select();
            }
        };

        // month field validation
        document.querySelector('select[name="date.month"]').onchange = function() {
            if (this.setCustomValidity == undefined) return;
            const err = 'Please enter a valid three-letter abbreviation of a month';
            const ok = months.indexOf(this.value.toLowerCase()) >= 0;
            this.setCustomValidity(ok ? '' : err);
        };

        // on/within validation
        document.querySelectorAll('input[name=when]').forEach(function(input) {
            input.onchange = function() {
                if (this.setCustomValidity == undefined) return;
                document.querySelector('#within-options').required = false;
                document.querySelectorAll('input[name^=date]').forEach(function(el) { el.required = false; });
                switch (input.value) {
                    case 'date':
                        document.querySelector('select[name="date.day"]').required = true;
                        document.querySelector('select[name="date.month"]').required = true;
                        document.querySelector('select[name="date.year"]').required = true;
                        document.querySelector('select[name="date.day"]').focus();
                        // document.querySelector('select[name="date.day"]').select();
                        break;
                    case 'within':
                        document.querySelector('select[name="within-options"]').required = true;
                        document.querySelector('select[name="within-options"]').focus();
                        break;
                }
            };
        });

        // auto-advance hour field when completed (date)
        // document.querySelector('input[name="date.hour"]').onkeypress = function(event) {
        //     var newValue = this.value + event.key;
        //     if (newValue.length==2 || newValue>2) {
        //         document.querySelector('input[name="date.minute"]').focus();
        //         document.querySelector('input[name="date.minute"]').select();
        //     }
        // });

        // don't tab out of empty date field (in case tab typed after auto-advance)
        document.querySelectorAll('input[name^=date]').forEach(function(input) {
            // if (input.name=='date.hour' || input.name=='date.minute') return; // hour/min can be left blank
            if (input.name=='date.time') return; // hour/min can be left blank

            input.onkeydown = function (event) {
                if (event.key == 'Tab' && this.value == '') event.preventDefault();
            };
        });
    }


    /*
     * 'where' page
     */

    if (document.querySelector('#where')) {
        const where = document.querySelector('#where');

        // show/hide at-address according to selected option
        document.querySelectorAll('input[name=where]').forEach(function(input) {
            input.onclick = function() {
                if (input.value == 'at') {
                    // where.querySelector('p').classList.remove('hide');
                    // where.querySelector('textarea[name="at-address"]').classList.remove('hide');
                    where.querySelector('textarea[name="at-address"]').focus();
                    where.querySelector('textarea[name="at-address"]').select();
                }
                if (input.value == 'dont-know') {
                    // where.querySelector('p').classList.add('hide');
                    // where.querySelector('textarea[name="at-address"]').classList.add('hide');
                }
            };
        });

        // defaults for previously answered questions
        document.querySelectorAll('input[name=where]').forEach(function(input) {
            if (input.checked) input.onclick();
        });

        // check #where-at if at-address receives focus
        document.querySelector('#at-address').onfocus = function() {
            document.querySelector('#where-at').checked = true;
        };
    }


    /*
     * 'who' page
     */

    if (document.querySelector('input[name=who]')) {
        // display/hide supplementary information fields on radio-box selection
        document.querySelectorAll('input[name=who]').forEach(function(input) {
            input.onclick = function() {
                if (this.value == 'y') {
                    this.parentElement.querySelector('#who-y-form').classList.remove('hide');
                    this.parentElement.parentElement.querySelector('#who-n-form').classList.add('hide');
                    document.querySelector('textarea[name="who-relationship"]').focus();
                    document.querySelector('textarea[name="who-relationship"]').select();
                }
                if (this.value == 'n') {
                    this.parentElement.querySelector('#who-n-form').classList.remove('hide');
                    this.parentElement.parentElement.querySelector('#who-y-form').classList.add('hide');
                    document.querySelector('textarea[name="who-description"]').focus();
                    document.querySelector('textarea[name="who-description"]').select();
                }
            };
        });

        // defaults for previously answered questions
        document.querySelectorAll('input[name=who]').forEach(function(input) {
            if (input.checked) input.onclick();
        });
    }


    /*
     * 'action-taken' page
     */

    if (document.querySelector('input[name="action-taken"]')) {
        // defaults for previously answered questions
        document.querySelectorAll('input[name=action-taken]').forEach(function(el) {
            if (el.checked) {
                const extra = el.parentElement.querySelector('input[type=text]');
                extra.classList.remove('hide');
            }
        });

        document.querySelectorAll('input[name=action-taken]').forEach(function(el) {
            el.onclick = function() {
                const extra = this.parentElement.querySelector('input[type=text]');
                if (this.checked) {
                    extra.classList.remove('hide');
                    extra.focus();
                    extra.select();
                } else {
                    extra.value = '';
                    extra.classList.add('hide');
                }
            };
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
        document.querySelector('#used-before-y').onclick = function() {
            if (this.checked) {
                document.querySelector('#usegenerated').classList.add('hide');
                document.querySelector('input[name="existing-alias"]').focus();
                document.querySelector('input[name="existing-alias"]').select();
            } else {
                document.querySelector('#usegenerated').classList.remove('hide');
                document.querySelector('input[name="existing-alias"]').value = '';
            }
        };

        // listener to display usegenerated and clear existing-alias if used-before-n clicked
        document.querySelector('#used-before-n').onclick = function() {
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
        };

        // listener to get alternative generated alias
        document.querySelector('#get-alt-alias').onclick = function() {
            generateAlias();
        };

        // listener to check #used-before-y if existing-alias entered
        document.querySelector('input[name="existing-alias"]').onchange = function() {
            document.querySelector('#used-before-y').checked = this.value != '';
            document.querySelector('#usegenerated').classList.add('hide');
        };

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
     * whatnext (resources) page
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
