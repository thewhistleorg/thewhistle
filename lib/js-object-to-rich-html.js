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
 * @param exclude
 * @param headingLevel
 */
 function jsObjectToRichHtml(object, exclude=[], headingLevel=1) { // TODO: use headingLevel for <h1> / <h2> / ...?
     const RTF = document.createElement('div');
     RTF.className +='json-to-html';
     for (const item in exclude) {
       delete object[exclude[item]];
     }
     for (const property in object) {
         if (object[property] == null) { // question was not answered: display m-dash
             RTF.insertAdjacentHTML('beforeend', `<h3>${property}</h3><p>—</p>`);
         } else {
             switch (object[property].constructor) {
                 case Object: // header for sub-question: invoke recursively
                     const html = jsObjectToHtml(object[property], headingLevel + 1);
                     RTF.insertAdjacentHTML('beforeend', `<h3>${property}</h3><p>${html}</p>`);
                     break;
                 case Array: // either checkbox with multiple values or array of files
                     if (property == 'files') {
                         const files = object[property];
                         const fileLinks = files.map(f => `<a href="../${f.path}${f.name}">${f.name}</a>`);
                         const list = fileLinks.join('<br>');
                         RTF.insertAdjacentHTML('beforeend', `<h3>${property}</h3><p>${list}</p>`);
                     } else { // array of strings from checkboxes
                         const options = object[property];
                         const list = options.map(val => val==null ? '—' : val).join(', ');
                         RTF.insertAdjacentHTML('beforeend', `<h3>${property}</h3><p>${list}</p>`);
                     }
                     break;
                 case String: // single value
                 case Number: // single value
                     RTF.insertAdjacentHTML('beforeend', `<h3>${property}</h3><p>${object[property]}</p>`);
                     break;
                 case Date: // use default data formatting
                     const d = dateFormat(object[property], 'd mmm yyyy HH:MM');
                     RTF.insertAdjacentHTML('beforeend', `<h3>${property}</h3><p>${d}</p>`);
                     break;
             }
         }
     }

     return RTF.outerHTML;
 }

module.exports = jsObjectToRichHtml;
