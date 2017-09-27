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

const Koa         = require('koa');            // koa framework
const handlebars  = require('koa-handlebars'); // handlebars templating

const HandlebarsHelpers = require('../../../lib/handlebars-helpers.js');
const ReportMiddleware  = require('../../middleware.js');

const app = new Koa(); // report app

app.use(ReportMiddleware.mongoConnect()); // get db connection to ctx.params.database if not already available

// handlebars templating (templates specific to this database/project)
app.use(handlebars({
    extension:     [ 'html' ],
    root:          __dirname,
    viewsDir:      './templates/pages',
    layoutsDir:    './templates',
    defaultLayout: 'layout',
    partialsDir:   './templates/partials',
    helpers:       { selected: HandlebarsHelpers.selected, checked: HandlebarsHelpers.checked },
}));

app.use(require('./routes.js')); // routes/handlers are specific to this database/project)

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = app;
