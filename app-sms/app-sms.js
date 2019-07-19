/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* SMS app - Pages and API for running and testing SMS reporting.              Louis Slater 2018  */
/*                                                                                                */
/*                                       © 2018 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


import Koa        from 'koa';
import handlebars from 'koa-handlebars';
import serve      from 'koa-static';
import flash      from 'koa-flash';
import convert    from 'koa-convert';


import Log        from '../lib/log.js';
import smsRoutes  from './sms-routes.js';
import SmsApp     from './sms.js';
import SmsError from './sms-error.js';


const app = new Koa();


//Handle thrown or uncaught exceptions anywhere down the line
app.use(async function handleErrors(ctx, next) {
    try {
        await next();
    } catch (err) {
        await Log.error(ctx, err);
        if (app.env == 'production') delete err.stack; // don't leak sensitive info!
        if ((! (err instanceof SmsError)) || err.webRequest) {
            ctx.response.status = err.status || 500;
            //Evidence page or emulator
            switch (ctx.response.status) {
                case 404: //Not Found
                    if (err.message == 'Not Found') {
                        err.message = null; //personalised 404
                    }
                    await ctx.render('404-not-found', { err });
                    break;
                case 410: //Gone
                    await ctx.render('4xx-bad-request', { err });
                    break;
                default:
                case 500: //Internal Server Error (for uncaught or programming errors)
                    await ctx.render('500-internal-server-error', { err });
                    break;
            }
        } else {
            //SMS reporting error
            if (err.twiml) {
                try {
                    const options = {
                        method: 'POST',
                        action: '/delete-outbound',
                    };
                    err.twiml.message(options, err.message);
                    //Although there is an error, status must be 200 so Twilio sends SMS
                    ctx.status = 200;
                    ctx.headers['Content-Type'] = 'text/xml';
                    ctx.body = err.twiml.toString();
                    SmsApp.deleteMessage(ctx.request.body.MessageSid);
                } catch (e) {
                    ctx.status = 500;
                }
            } else {
                ctx.status = 500;
            }
        }
    }
});


app.use(serve('public', { maxage: 1000*60*60*24 }));


//Handlebars templating
app.use(handlebars({
    extension: [ 'html' ],
    viewsDir:  'app-sms/templates',
}));


app.use(convert(flash()));


app.use(smsRoutes);


export default app;
