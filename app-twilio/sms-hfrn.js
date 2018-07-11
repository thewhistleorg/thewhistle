import Koa            from 'koa';
import Router         from 'koa-router';
import serve          from 'koa-static';
import SmsApp         from '../app-twilio/sms.js';
const app = new Koa();
const router = new Router();
app.use(serve('public', { maxage: 1000*60*60*24 }));
const db = 'hfrn-test';
const yamlFile = 'public/spec/hfrn/hfrn-en.yaml';
const org = 'hfrn-test';
const project = 'hfrn';
const sms = new SmsApp(db, yamlFile, org, project);
router.post('/hfrn-sms', sms.receiveText.bind(sms));
app
    .use(router.routes())
    .use(router.allowedMethods());


export default app;