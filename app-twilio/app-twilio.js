const Koa = require('koa');
const MessagingResponse = require('twilio').twiml.MessagingResponse;

import Router     from 'koa-router';
import jsonSchema from 'jsonschema';
import $RefParser from 'json-schema-ref-parser';
import serve      from 'koa-static';
import dotProp    from 'dot-prop';

const app = new Koa();
const router = new Router();

const spec = async () => {
  return await $RefParser.dereference("http://twilio.thewhistle.local:3000/spec/grn/rape-is-a-crime.yaml");
}

app.use(serve('public', { maxage: 1000*60*60*24 }));

router
.get('/sms', async (ctx) => {

  const ref = await spec();
  ctx.response.body = ref;

  // let smsCount = ctx.session.counter || 0;
  // let message = 'Hello, thanks for the new message.';

  // ctx.session.counter = smsCount + 1;

  // const twiml = new MessagingResponse();
  // twiml.message(message);

  for (const p in ref.pages) {
    for(const i in dotProp.get(ref, `pages.${p}`)) {
      let t = dotProp.get(ref, `pages.${p}`)[i].text;
      if (t != undefined & typeof t === "string") {
        t.startsWith('#')==true & t.startsWith('##')==false && console.log(t);
      }
    }
  }

    // ctx.body = twiml.toString();
    // ctx.body = spec();
});

app
  .use(router.routes())
  .use(router.allowedMethods());

export default app;
