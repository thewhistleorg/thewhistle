'use strict';


document.addEventListener('DOMContentLoaded', async function() {

    // keep updated-ago current every 10 secs
    function updateAgo() {
        document.querySelectorAll('td[data-ago]').forEach(td => {
            if (td.dataset.ago) td.textContent = ago(td.dataset.ago);
        });
    }
    setInterval(updateAgo, 10e3);

});


/**
 * Converts date to period-ago relative to now (approximates months and years).
 *
 * @param {Date|string} date - Date interval is to be given for.
 * @param {boolean}     short - Short format (just 1st letter of period).
 * @returns {string} Description of interval between date and now.
 */
function ago(date, short=false) {
    const duration = {
        year:  1000 * 60 * 60 * 24 * 365,
        month: 1000 * 60 * 60 * 24 * 30,
        week:  1000 * 60 * 60 * 24 * 7,
        day:   1000 * 60 * 60 * 24,
        hour:  1000 * 60 * 60,
        min:   1000 * 60,
        sec:   1000,
    };

    const interval = Date.now() - new Date(date).valueOf();

    for (const period in duration) {
        if (interval > duration[period]) {
            const n = Math.floor(interval / (duration[period]));
            return short ? n + period.slice(0,1) : n + ' ' + period + (n>1 ? 's' : '') + ' ago';
        }
    }

    return 'now';
}
