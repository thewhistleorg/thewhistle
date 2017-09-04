/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* App: civilian (public) incident reporting (boilerplate).                                       */
/*                                                                                                */
/* This is a composed sup-app, in order that the database and project for the MongoDB connection  */
/* and the handlebars templates can be taken from the URL.                                        */
/*                                                                                                */
/* This app.js is identical for all databases/projects - if we can work out a mechanism to invoke */
/* the routes directly from app-report.js this could be factored back there.                      */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const Koa         = require('koa');                 // koa framework
const handlebars  = require('koa-handlebars');      // handlebars templating
const MongoClient = require('mongodb').MongoClient; // official MongoDB driver for Node.js


const app = new Koa(); // report app


// get database connection if not already available
app.use(async function getDbConnection(ctx, next) {
    if (!global.db[ctx.params.database]) {
        try {
            const connectionString = process.env['DB_'+ctx.params.database.toUpperCase()];
            global.db[ctx.params] = await MongoClient.connect(connectionString);
        } catch (e) {
            app.throw(e);
        }
    }
    await next();
});


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
