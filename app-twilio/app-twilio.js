import Koa            from 'koa';
import Router         from 'koa-router';
import serve          from 'koa-static';
import SmsApp         from '../app-twilio/sms.js';


const app = new Koa();
const router = new Router();

app.use(serve('public', { maxage: 1000*60*60*24 }));

const routes = {};

router.post('/:org/:project', async function (ctx) {
    //TODO: Surround with try catch in case project/org doesn't exist
    if (!routes[ctx.url]) {
        routes[ctx.url] = new SmsApp(ctx.params.org, ctx.params.project);
        await routes[ctx.url].parseSpecifications();
        await routes[ctx.url].setupDatabase();
    }

    await routes[ctx.url].receiveText(ctx);
});

app
    .use(router.routes())
    .use(router.allowedMethods());


export default app;