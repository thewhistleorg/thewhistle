/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* App: civilian (public) incident reporting (boilerplate).                        C.Veness 2017  */
/*                                                                                                */
/* This is a composed sup-app, in order that the database and project for the MongoDB connection  */
/* and the handlebars templates can be taken from the URL.                                        */
/*                                                                                                */
/* This app.js is identical for all databases/projects - if we can work out a mechanism to invoke */
/* the routes directly from app-report.js this could be factored back there.                      */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

// TODO: before ES modules, directory name of the current module was available in __dirname; moving
// forward, it is likely to be either 'import.meta' or 'import {url} from 'js:context'; see
// - github.com/tc39/proposal-import-meta
// - github.com/nodejs/node-eps/blob/master/002-es-modules.md#451-environment-variables
const importMetaScriptElement = './app-report/test-cam/wwwww';

import Koa        from 'koa';            // koa framework
import handlebars from 'koa-handlebars'; // handlebars templating

import HandlebarsHelpers from '../../../lib/handlebars-helpers.js';
import ReportMiddleware  from '../../middleware.js';

const app = new Koa(); // report app

app.use(ReportMiddleware.mongoConnect()); // get db connection to ctx.params.database if not already available

// handlebars templating (templates specific to this database/project)
app.use(handlebars({
    extension:     [ 'html' ],
    root:          importMetaScriptElement,
    viewsDir:      './templates/pages',
    layoutsDir:    './templates',
    defaultLayout: 'layout',
    partialsDir:   './templates/partials',
    helpers:       { selected: HandlebarsHelpers.selected, checked: HandlebarsHelpers.checked },
}));

import routes from './routes.js'
app.use(routes); // routes/handlers are specific to this database/project)

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default app;
