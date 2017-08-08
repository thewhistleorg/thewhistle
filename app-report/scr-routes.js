/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Routes: scr (survivor-centred response)                                                       */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const router = require('koa-router')(); // router middleware for koa

const scr = require('./scr-handlers.js');


router.get( '/scr',           ctx => ctx.render('scr/index'));
router.get( '/scr/submit',    scr.getSubmit);
router.post('/scr/submit',    scr.postSubmit);
router.get( '/scr/thank-you', ctx => ctx.render('scr/thank-you'));
router.get( '/scr/:num',      scr.getPage);
router.post('/scr/:num',      scr.postPage);


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = router.middleware();
