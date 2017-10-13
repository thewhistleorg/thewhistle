/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Routes: scr (survivor-centred response).                                        C.Veness 2017  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const Koa    = require('koa');          // koa framework
const router = require('koa-router')(); // router middleware for koa

const handlers = require('./handlers.js');


const app = new Koa(); // report app


router.get( '/:database/:project',           ctx => ctx.render('index'));
router.get( '/:database/:project/submit',    handlers.getSubmit);
router.post('/:database/:project/submit',    handlers.postSubmit);
router.get( '/:database/:project/thank-you', ctx => ctx.render('thank-you'));
router.get( '/:database/:project/:num',      handlers.getPage);
router.post('/:database/:project/:num',      handlers.postPage);


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = router.middleware();
