/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Convert JavaScript object to HTML.                                              C.Veness 2017  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import jsdom      from 'jsdom';      // JavaScript implementation of DOM and HTML standards
import dateFormat from 'dateformat'; // Steven Levithan's dateFormat()


class jsObjectToHtml {

    /**
     * Convert arbitrary JavaScript object to HTML representation for presenting submitted incident
     * report details, using tabular format.
     *
     * @param {Object}   object - object to be presented as HTML.
     * @param {string[]} exclude - any keys to be suppressed from the result (eg 'files').
     */
    static usingTable(object, exclude=[]) {
        return jsObjectToHtmlCommon('tbl', object, exclude);
    }

    /**
     * Convert arbitrary JavaScript object to HTML representation for presenting submitted incident
     * report details, using heading/paragraph format.
     *
     * @param {Object}      object - object to be presented as HTML.
     * @param {string[]=[]} exclude - any keys to be suppressed from the result (eg 'files').
     * @param {string=h1}   headingLevel - initial heading level to use (nested objects get higher hdng level).
     */
    static usingHeading(object, exclude=[], headingLevel='h1') {
        return jsObjectToHtmlCommon('hdg', object, exclude, headingLevel.slice(1));
    }
}

function property(type, key, val, hLevel) {
    switch (type) {
        case 'tbl': return `<tr><th>${key}</th><td>${val}</td></tr>`;
        case 'hdg': return `<h${hLevel}>${key}</h${hLevel}><p>${val}</p>`;
    }
}

function jsObjectToHtmlCommon(type, object, exclude, hLevel) {

    const wrapper = {
        tbl: 'table',
        hdg: 'div',
    };

    const document = new jsdom.JSDOM().window.document;
    const container = document.createElement(wrapper[type]);

    container.className += 'js-obj-to-html';

    for (const item in exclude) delete object[exclude[item]];

    for (const key in object) {
        let val = null;
        if (object[key] == null) { // question was not answered: display m-dash
            val = '—';
            container.insertAdjacentHTML('beforeend', property(type, key, val, hLevel));
        } else {
            switch (object[key].constructor) {
                case Object: // header for sub-question: invoke recursively
                    val = jsObjectToHtmlCommon(type, object[key], exclude, hLevel+1);
                    container.insertAdjacentHTML('beforeend', property(type, key, val, hLevel));
                    break;
                case Array: // either checkbox with multiple values or array of files
                    if (key == 'files') { // note 'files' should no longer appear in submitted details, but leave this here in case...
                        const files = object[key];
                        const fileLinks = files.map(f => `<a href="../${f.path}${f.name}">${f.name}</a>`);
                        val = fileLinks.join('<br>');
                        container.insertAdjacentHTML('beforeend', property(type, key, val, hLevel));
                    } else { // array of strings from checkboxes
                        const options = object[key];
                        val = options.map(v => v==null ? '—' : v).join(', ') || '—'; // n-dash for empty elements & empty array
                        container.insertAdjacentHTML('beforeend', property(type, key, val, hLevel));
                    }
                    break;
                case String: // single value
                case Number: // single value
                    val = object[key];
                    container.insertAdjacentHTML('beforeend', property(type, key, val, hLevel));
                    break;
                case Date: // use default data formatting (day only if time is 00:00:00)
                    const format = dateFormat(object[key], 'HH:MM:ss:l') == '00:00:00:000' ? 'd mmm yyyy' : 'd mmm yyyy HH:MM';
                    val = dateFormat(object[key], format);
                    container.insertAdjacentHTML('beforeend', property(type, key, val, hLevel));
                    break;
            }
        }
    }

    return container.outerHTML;
}

export default jsObjectToHtml;
