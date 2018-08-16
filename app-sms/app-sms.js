/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* SMS app - Pages and API for running and testing SMS reporting.              Louis Slater 2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


import Koa           from 'koa';
import handlebars    from 'koa-handlebars'; 
import serve         from 'koa-static';
import flash      from 'koa-flash';
import convert    from 'koa-convert'; 


import smsRoutes     from './sms-routes.js';

//TODO: Add in error handling

const app = new Koa();


app.use(serve('public', { maxage: 1000*60*60*24 }));


// handlebars templating
app.use(handlebars({
    extension: [ 'html' ],
    viewsDir:  'app-sms/templates',
}));


app.use(convert(flash()));


app.use(smsRoutes);


export default app;
