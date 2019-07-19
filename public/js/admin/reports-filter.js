/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* JavaScript for managing filtering functions in reports-list.html                               */
/*                                                                                                */
/*                                  © 2017-2018 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


'use strict';


/* global Qs, Slider, slider, dateFormat */


document.addEventListener('DOMContentLoaded', function() { // filtering

    // convert query string filters to filter spans in #search-display
    const qs = Qs.parse(location.search.slice(1));
    for (const q in qs) {
        if (Array.isArray(qs[q])) {
            // if filter given multiple times eg tag=a&tag=b;
            for (const filter of qs[q]) addFilter(q, filter);
        } else {
            if (q == 'description') {
                // the description filter goes directly in the description filter field
                document.querySelector('input[name=description]').value = qs.description;
                document.querySelector('a.remove-desc-srch').classList.toggle('hide');
            } else {
                // any other filter goes in the general filters field
                addFilter(q, qs[q]);
            }
        }
    }

    // use range slider for filtering submitted/updated dates
    const submittedSlider = new Slider('input.submitted', {
        min:       new Date(slider.oldest).valueOf(),
        max:       new Date(slider.latest).valueOf(),
        range:     true,
        step:      1000 * 60 * 60 * 24,
        formatter: function(t) {
            if (Array.isArray(t)) return dateFormat(t[0], 'd mmm yyyy') + ' – ' + dateFormat(t[1], 'd mmm yyyy');
            return dateFormat(t, 'd mmm yyyy');
        },
    });
    submittedSlider.on('slideStop', function(value) {
        const [ from, to ] = value;
        addFilter('submitted', dateFormat(from, 'd-mmm-yyyy') + '–' + dateFormat(to, 'd-mmm-yyyy'));
        applyFilter();
    });

    // toggle search filter list container
    document.getElementById('filter-toggle-button').onclick = toggleContainer;
    function toggleContainer() {
        const el = document.getElementById('filter-toggle-button');
        const div = document.getElementById('filter-container');
        if (div.style.display === 'none') {
            div.style.display = 'block';
            el.innerHTML = 'Hide filters';
        } else {
            div.style.display = 'none';
            el.innerHTML = 'Show filters';
        }
    }

    // auto-submit form on any change of filter selection
    document.querySelectorAll('#search .pure-menu-item li a').forEach(el => el.onclick = function filterAdd(event) {
        event.preventDefault(); // don't follow link
        if (this.parentElement.dataset.key.slice(0, 6) == 'field:') {
            // add filter span for user to fill in search (don't apply it yet)
            addFieldFilter(this.parentElement.dataset.key.slice(6));
        } else {
            // add filter span and apply filter
            addFilter(this.parentElement.dataset.key, this.parentElement.dataset.value);
            applyFilter();
        }
    });

    // auto-submit form on click on 'assigned to' in list
    document.querySelectorAll('td.assigned span').forEach(el => el.onclick = function filterAdd(event) {
        // add filter span and apply filter
        addFilter('assigned', this.textContent.slice(1)); // strip off '@'
        applyFilter();
        event.stopPropagation(); // don't allow this event to be caught by the 'tr' open report details event
    });

    // auto-submit form on click on 'tag' in list
    document.querySelectorAll('span.tag').forEach(el => el.onclick = function filterAdd(event) {
        // add filter span and apply filter
        addFilter('tag', this.textContent);
        applyFilter();
        event.stopPropagation(); // don't allow this event to be caught by the 'tr' open report details event
    });

    // when description input entered, apply filter
    document.querySelector('#search input[name="description"]').onchange = function filterAddInput() {
        // note no need to 'addFilter'
        applyFilter();
    };

    // remove description search
    document.querySelector('#search-display a.remove-desc-srch').onclick = function descSrchRemove(event) {
        event.preventDefault(); // don't follow link
        document.querySelector('input.description-filter').value = '';
        applyFilter();
    };

    // remove filter span
    document.querySelectorAll('#search-display a.remove-filter').forEach(el => el.onclick = function filterRemove(event) {
        event.preventDefault(); // don't follow link
        this.parentElement.remove();
        applyFilter();
    });

    // add filter span (either from user interaction or from query string)
    function addFilter(key, value) {
        // keep sort and archive properties on #search, as they don't get displayed as <span>s
        if (key == 'sort') { document.querySelector('#search').dataset.sort = value; return; }
        if (key == 'active') { document.querySelector('#search').dataset.active = value; return; }

        if ([ 'project', 'assigned', 'status', 'submitted' ].includes(key) || key.slice(0, 6)=='field:') {
            // only makes sense to have one project / assigned / status / submitted filter, so remove current one
            const current = document.querySelector(`#search-display span[data-key="${key}"]`);
            if (current) current.remove();
        }
        //Necessary to display group name instead of group id
        const displayValue = key === 'group' ?
            document.getElementById(`group-filter-${value}`).firstElementChild.innerHTML
            : value;
        const displayText = key.slice(0, 6)=='field:' ? `field <i>${key.slice(6)}</i>: ${displayValue}` : `${key}: ${displayValue}`;
        const removeLink = '<a href="#" class="remove-filter">×</a>';
        const filterSpan = `<span data-key="${key}" data-value="${value}"  class="selected-filter">${displayText} ${removeLink}</span>`;
        document.querySelector('#filter-container').insertAdjacentHTML('beforeend', filterSpan);
    }

    // add filter span for searching within report fields, into which user can enter text to be searched for
    function addFieldFilter(field) {
        const current = document.querySelector(`#search-display span[data-key="field:${field}"]`);
        if (current) current.remove();
        const label = `field <i>${field}</i>`;
        const removeLink = '<a href="#" class="remove-filter">×</a>';
        const filterSpan = `<span data-key="field:${field}">${label}: <span contenteditable></span> ${removeLink}</span>`;
        document.querySelector('#search-display').insertAdjacentHTML('beforeend', filterSpan);
        document.querySelector('#search-display').querySelector(`span[data-key="field:${field}"] span[contenteditable]`).focus();
        document.querySelectorAll('#search-display span[contenteditable]').forEach(el => el.onblur = function() {
            this.parentElement.dataset.value = this.textContent; // once value entered, record it in <span> data-value
            applyFilter();
        });
    }

    // convert filter spans to query string and refresh page to that location
    function applyFilter() {
        // description filter stands on on its own, create a separate filter for that if it's filled in
        const description = document.querySelector('input[name=description]').value;
        const filterDescription = description ? [ { key: 'description', value: description } ] : [];
        // other filters come from the spans within the search-display input
        const filterSpans = Array.from(document.querySelectorAll('#search-display span[data-key]')); // note don't include contenteditable spans
        const filters = filterDescription.concat(filterSpans.map(span => span.dataset));
        // add sort & archive into filters
        if (document.querySelector('#search').dataset.sort) filters.push({ key: 'sort', value: document.querySelector('#search').dataset.sort });
        if (document.querySelector('#search').dataset.active) filters.push({ key: 'active', value: document.querySelector('#search').dataset.active });
        // and convert to a query string
        const query = filters.map(f => f.key.replace('%20', '+')+'='+ encodeURIComponent(f.value).replace('%20', '+').replace('%2C', ',')).join('&');
        if (Object.keys(qs).length == 0) {
            // no current query string: move to filtered page, leaving unfiltered list in history as normal
            window.location = '?'+query;
        } else {
            // existing query string: replace current filter with new filter, without creating new history
            window.location.replace(window.location.pathname + (query ? '?' + query : ''));
        }
    }
});
