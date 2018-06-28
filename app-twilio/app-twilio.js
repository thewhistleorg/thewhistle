const Koa = require('koa');
const MessagingResponse = require('twilio').twiml.MessagingResponse;

import Router from 'koa-router'; // router middleware for koa

const app = new Koa();
const router = new Router();

router
.get('/sms', ctx => {
    console.log('!!!')
    ctx.body = 'Yea!';
    let smsCount = ctx.session.counter || 0;
  
    let message = 'Hello, thanks for the new message.';
  
    if(smsCount > 0) {
      message = 'Hello, thanks for message number ' + (smsCount + 1);
    }
  
    ctx.session.counter = smsCount + 1;
  
    const twiml = new MessagingResponse();
    twiml.message(message);
  
    ctx.body = twiml.toString();
});

app
  .use(router.routes())
  .use(router.allowedMethods());

export default app;
