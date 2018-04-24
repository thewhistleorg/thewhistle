/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* App: civilian (public) incident reporting (boilerplate).                   C.Veness 2017-2018  */
/*                                                                                                */
/* This is a composed sup-app, in order that the database and project for the MongoDB connection  */
/* and the handlebars templates can be taken from the URL.                                        */
/*                                                                                                */
/* This app.js is identical for all databases/projects - if we can work out a mechanism to invoke */
/* the routes directly from app-report.js this could be factored back there.                      */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import path from 'path'; // nodejs.org/api/path.html

import Koa        from 'koa';            // koa framework
import handlebars from 'koa-handlebars'; // handlebars templating

import HandlebarsHelpers from '../../../lib/handlebars-helpers.js';


const app = new Koa(); // report app

// handlebars templating (templates specific to this database/project)
const handlebarsRoot = 'app-report'+path.dirname(import.meta.url.replace(/.+\/app-report/, '')); // get org/project from import.meta.url
app.use(handlebars({
    extension:     [ 'html' ],
    root:          handlebarsRoot,
    viewsDir:      './templates/pages',
    layoutsDir:    './templates',
    defaultLayout: 'layout',
    partialsDir:   './templates/partials',
    helpers:       { selected: HandlebarsHelpers.selected, checked: HandlebarsHelpers.checked },
}));

import routes         from './routes.js';

app.use(routes); // routes/handlers are specific to this database/project)

// end of the line: 404 status for any resource not found
app.use(function notFound(ctx) { // note no 'next'
    ctx.throw(404);
});


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default app;
