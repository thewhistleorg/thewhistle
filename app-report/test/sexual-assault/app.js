/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* App: test/sexual-assault                                                                       */
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

const HandlebarsHelpers = require('../../../lib/handlebars-helpers.js');

const app = new Koa(); // report app


// get database connection if not already available
app.use(async function getDbConnection(ctx, next) {
    if (!global.db[ctx.params.database]) {
        try {
            const connectionString = process.env['DB_'+ctx.params.database.toUpperCase()];
            global.db[ctx.params.database] = await MongoClient.connect(connectionString);
        } catch (e) {
            app.throw(e);
        }
    }
    await next();
});


// handlebars templating
app.use(handlebars({
    extension:     [ 'html' ],
    root:          __dirname,
    viewsDir:      './templates/pages',
    layoutsDir:    './templates',
    defaultLayout: 'layout',
    partialsDir:   './templates/partials',
    helpers:       { checked: HandlebarsHelpers.checked },
}));


app.use(require('./routes.js'));


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = app;
