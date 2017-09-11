/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* App: test/sexual-assault                                                                       */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const Koa         = require('koa');                 // koa framework
const handlebars  = require('koa-handlebars');      // handlebars templating


const app = new Koa(); // report app

const hbsCheckedHelper = function(value, options) {
    const div = document.createElement('div'); // create a container div
    div.innerHTML = options.fn(this);          // parse content into dom
    if (typeof value == 'string') {
        div.querySelectorAll('input[type=radio],input[type=checkbox]').forEach(function(input) {
            // if input value matches supplied value, check it
            if (input.value == value) input.defaultChecked = true;
        });
    }
    if (typeof value == 'object') {
        div.querySelectorAll('input[type=checkbox]').forEach(function(input) {
            // if input value is included in supplied value, check it
            if (value.includes(input.value)) input.defaultChecked = true;
        });
    }
    return div.innerHTML;
};

app.use(handlebars({
    extension:     [ 'html' ],
    root:          __dirname,
    viewsDir:      './templates/pages',
    layoutsDir:    './templates',
    defaultLayout: 'layout',
    partialsDir:   './templates/partials',
    helpers:       { checked: hbsCheckedHelper },
}));

app.use(require('./routes.js'));


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = app;
