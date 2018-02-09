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
           for(var i = 0; i < fields.length; i++) {
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

        // set focus to hour/day field if any 'when' radio button clicked
        var fields = document.querySelectorAll('input[name=when]');
        for(var i = 0; i < fields.length; i++) {
            fields[i].onchange = function() {
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
        }

        if (document.querySelector('#when-date').checked == true) {
            document.querySelector('input[name=when]').parentElement.querySelector('.when-form').style.display='block';
        }

        // check when-today if any today fields receive focus
        var nameToday = document.querySelectorAll('input[name^=today]');
        for ( var i = 0; i < nameToday.length; i++) {
            nameToday[i].onfocus = function() {
                document.querySelector('#when-today').checked = true;
            };
        }


        // check when-yesterday if any yesterday fields receive focus
        var nameYesterday = document.querySelectorAll('input[name^=yesterday]');
        for ( var i = 0; i < nameYesterday.length; i++) {
            nameYesterday[i].onfocus = function() {
                document.querySelector('#when-yesterday').checked = true;
            };
        }


        // check when-date if any date fields receive focus
        var nameDate = document.querySelectorAll('input[name^=date], select[name^=date]');
        for ( var i = 0; i < nameDate.length; i++) {
            nameDate[i].onfocus = function() {
                document.querySelector('#when-date').checked = true;
            };
        }

        // check when-within if within-options is changed, clear it if no value set
        // (note not on focus, as tabbing to it from date would auto-select it)
        document.querySelector('#within-options').onchange = function() {
            document.querySelector('#when-within').checked = this.value!='';
        };

        // auto-advance day field when completed
        document.querySelector('select[name="date.day"]').onkeypress = function(event) {
            if (!event.key.match(/\d/)) { event.preventDefault(); return; }
            var newValue = this.value + event.key;
            if (newValue.length==2 || newValue>3) {
                document.querySelector('select[name="date.month"]').focus();
                document.querySelector('select[name="date.month"]').select();
            }
        };

        // auto-advance month field when completed
        document.querySelector('select[name="date.month"]').onkeypress = function(event) {
            //if (this.value.length == 3) { event.preventDefault(); return; }
            var newValue = this.value + event.key;
            if (months.indexOf(newValue.toLowerCase()) >= 0) {
                document.querySelector('select[name="date.year"]').focus();
                document.querySelector('select[name="date.year"]').select();
            }
        };

        // month field validation
        document.querySelector('select[name="date.month"]').onchange = function() {
            if (this.setCustomValidity == undefined) return;
            var err = 'Please enter a valid three-letter abbreviation of a month';
            var ok = months.indexOf(this.value.toLowerCase()) >= 0;
            this.setCustomValidity(ok ? '' : err);
        };

        // on/within validation
        var nameWhen = document.querySelectorAll('input[name=when]');
        for ( var i = 0; i < nameWhen.length; i++) {
            var input = nameWhen[i];
            input.onchange = function() {
                if (this.setCustomValidity == undefined) return;
                document.querySelector('#within-options').required = false;
                var nameDate = document.querySelectorAll('input[name^=date]');
                for ( var i = 0; i < nameDate.length; i++) {
                    var el = nameDate[i];
                    el.required = false;
                }
                // document.querySelectorAll('input[name^=date]').forEach(function(el) { el.required = false; });
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
        }


        // don't tab out of empty date field (in case tab typed after auto-advance)
        var nameDate = document.querySelectorAll('input[name^=date]');
        for ( var i = 0; i < nameDate.length; i++) {
            input = nameDate[i];
            // if (input.name=='date.hour' || input.name=='date.minute') return; // hour/min can be left blank
            if (input.name=='date.time') return; // hour/min can be left blank

            input.onkeydown = function (event) {
                if (event.key == 'Tab' && this.value == '') event.preventDefault();
            };

        }

    }


    /*
     * 'where' page
     */

    if (document.querySelector('#where')) {
        var where = document.querySelector('#where');

        // show/hide at-address according to selected option
        var nameWhere = document.querySelectorAll('input[name=where]');
        for ( var i = 0; i < nameWhere.length; i++) {
            var input = nameWhere[i];
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
        }


        // defaults for previously answered questions
        var nameWhere = document.querySelectorAll('input[name=where]');
        for ( var i = 0; i < nameWhere.length; i++) {
          var input = nameWhere[i];
          if (input.checked) input.onclick();
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
        // display/hide supplementary information fields on radio-box selection
        var nameWho1 = document.querySelectorAll('input[name=who]');
        for ( var i = 0; i < nameWho1.length; i++) {
            var input = nameWho1[i];
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
        }

        // defaults for previously answered questions
        var nameWho2 = document.querySelectorAll('input[name=who]');
        for ( var i = 0; i < nameWho2.length; i++) {
            var input = nameWho2[i];
            if (input.checked) input.onclick();
        }
    }


    /*
     * 'action-taken' page
     */

    if (document.querySelector('input[name="action-taken"]')) {
        // defaults for previously answered questions

        var nameActionTaken = document.querySelectorAll('input[name=action-taken]');
        for ( var i = 0; i < nameActionTaken.length; i++) {
            var el = nameActionTaken[i];
            if (el.checked) {
                var extra = el.parentElement.querySelector('input[type=text]');
                extra.classList.remove('hide');
            }
        }


        var nameActionTaken2 = document.querySelectorAll('input[name=action-taken]');
        for ( var i = 0; i < nameActionTaken2.length; i++) {
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
