/* eslint-env browser *//* global Qs, Slider, slider, dateFormat */
'use strict';
document.addEventListener('DOMContentLoaded', function() { // filtering

    // convert query string filters to filter spans in #search-display
    const qs = Qs.parse(location.search.slice(1));
    for (const q in qs) {
        if (Array.isArray(qs[q])) {
            // if filter given multiple times eg tag=a&tag=b;
            for (const filter of qs[q]) addFilter(q, filter);
        } else {
            addFilter(q, qs[q]);
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
    document.querySelectorAll('td.assigned').forEach(el => el.onclick = function filterAdd(event) {
        // add filter span and apply filter
        addFilter('assigned', this.textContent.slice(1)); // strip off '@'
        applyFilter();
    });

    // auto-submit form on click on 'tag' in list
    document.querySelectorAll('span.tag').forEach(el => el.onclick = function filterAdd(event) {
        // add filter span and apply filter
        addFilter('tag', this.textContent);
        applyFilter();
    });

    // prevent click on (summary) input propagating up to li
    document.querySelectorAll('#search .pure-menu-item li input').forEach(el => el.onclick = function filterOpenInput(event) {
        event.stopPropagation();
    });

    // when (summary) input entered, apply filter
    document.querySelectorAll('#search .pure-menu-item li input').forEach(el => el.onchange = function filterAddInput() {
        addFilter(this.name, this.value);
        applyFilter();
    });

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

        if ([ 'assigned', 'status', 'submitted' ].includes(key) || key.slice(0,6)=='field:') {
            // only makes sense to have one assigned / status / submitted filter, so remove current one
            const current = document.querySelector(`#search-display span[data-key="${key}"]`);
            if (current) current.remove();
        }
        const displayText = key.slice(0,6)=='field:' ? `field <i>${key.slice(6)}</i>: ${value}` : `${key}: ${value}`;
        const removeLink = '<a href="#" class="remove-filter">×</a>';
        const filterSpan = `<span data-key="${key}" data-value="${value}">${displayText} ${removeLink}</span>`;
        document.querySelector('#search-display').insertAdjacentHTML('beforeend', filterSpan);
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
        const filterSpans = Array.from(document.querySelectorAll('#search-display span[data-key]')); // note don't include contenteditable spans
        const filters = filterSpans.map(span => span.dataset);
        // add sort & archive into filters
        if (document.querySelector('#search').dataset.sort) filters.push({ key: 'sort', value: document.querySelector('#search').dataset.sort });
        if (document.querySelector('#search').dataset.active) filters.push({ key: 'active', value: document.querySelector('#search').dataset.active });
        // and convert to a query string
        const query = filters.map(f => f.key.replace('%20', '+')+'='+ encodeURIComponent(f.value).replace('%20', '+').replace('%2C', ',')).join('&');
        // replace location so each search doesn't create separate history
        // TODO: only when current list is already filtered, so that 'back' button returns to unfiltered list? otherwise use 'window.locaion ='?
        window.location.replace(window.location.pathname + (query ? '?' + query : ''));
    }
});
