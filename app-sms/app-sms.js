/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* SMS app - Pages and API for running and testing SMS reporting.              Louis Slater 2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


import Koa           from 'koa';
import handlebars    from 'koa-handlebars'; 
import serve         from 'koa-static';


import smsRoutes     from './sms-routes.js';


const app = new Koa();


app.use(serve('public', { maxage: 1000*60*60*24 }));


// handlebars templating
app.use(handlebars({
    extension: [ 'html' ],
    viewsDir:  'app-sms/templates',
}));


app.use(smsRoutes);


export default app;
