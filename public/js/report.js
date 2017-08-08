'use strict';
/* global document */

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
            document.querySelectorAll('input,textarea').forEach(i => i.required = false);
        };
    }

});


