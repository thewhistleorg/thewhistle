import Koa            from 'koa';
import Router         from 'koa-router';
import serve          from 'koa-static';
import SmsApp         from '../app-twilio/sms.js';
import FormGenerator  from '../lib/form-generator.js';


const app = new Koa();
const router = new Router();

app.use(serve('public', { maxage: 1000*60*60*24 }));

const routes = {};

router.post('/:org/:project', async function (ctx) {
    if (FormGenerator.exists(ctx.params.org, ctx.params.project)) {
        if (!routes[ctx.url]) {
            routes[ctx.url] = new SmsApp(ctx.params.org, ctx.params.project);
            await routes[ctx.url].parseSpecifications();
            await routes[ctx.url].setupDatabase();
        }
        await routes[ctx.url].receiveText(ctx);
    }

    
});


router.post('/delete-outbound', function (ctx) {
    if (ctx.request.body.SmsStatus === 'delivered') {
        SmsApp.deleteMessage(ctx.request.body.MessageSid);
    }
    ctx.status = 200;
    ctx.headers['Content-Type'] = 'text/xml';
});

app
    .use(router.routes())
    .use(router.allowedMethods());


export default app;
