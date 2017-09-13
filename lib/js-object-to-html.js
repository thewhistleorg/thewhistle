/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Convert JavaScript object to HTML                                                             */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const dateFormat = require('dateformat'); // Steven Levithan's dateFormat()
const document   = new (require('jsdom')).JSDOM().window.document; // DOM Document interface in Node!


/**
 * TODO
 *
 * @param object
 * @param headingLevel
 */
function jsObjectToHtml(object, headingLevel=1) { // TODO: use headingLevel for <h1> / <h2> / ...?
    const table = document.createElement('table');

    for (const property in object) {
        if (object[property] == null) { // question was not answered: display m-dash
            table.insertAdjacentHTML('beforeend', `<tr><th>${property}</th><td>—</td></tr>`);
        } else {
            switch (object[property].constructor) {
                case Object: // header for sub-question: invoke recursively
                    const html = jsObjectToHtml(object[property], headingLevel + 1);
                    table.insertAdjacentHTML('beforeend', `<tr><th>${property}</th><td>${html}</td></tr>`);
                    break;
                case Array: // either checkbox with multiple values or array of files
                    if (property == 'files') {
                        const files = object[property];
                        const fileLinks = files.map(f => `<a href="../${f.path}${f.name}">${f.name}</a>`);
                        const list = fileLinks.join('<br>');
                        table.insertAdjacentHTML('beforeend', `<tr><th>${property}</th><td>${list}</td></tr>`);
                    } else { // array of strings from checkboxes
                        const options = object[property];
                        const list = options.map(val => val==null ? '—' : val).join(', ');
                        table.insertAdjacentHTML('beforeend', `<tr><th>${property}</th><td>${list}</td></tr>`);
                    }
                    break;
                case String: // single value
                case Number: // single value
                    table.insertAdjacentHTML('beforeend', `<tr><th>${property}</th><td>${object[property]}</td></tr>`);
                    break;
                case Date: // use default data formatting
                    const d = dateFormat(object[property], 'd mmm yyyy HH:MM');
                    table.insertAdjacentHTML('beforeend', `<tr><th>${property}</th><td>${d}</td></tr>`);
                    break;
            }
        }
    }

    return table.outerHTML;
}

module.exports = jsObjectToHtml;
