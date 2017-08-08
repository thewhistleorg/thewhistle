/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Routes: wwww (what-where-when-who)                                                            */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const router = require('koa-router')(); // router middleware for koa

const wwww = require('./wwww-handlers.js');


router.get( '/wwww',           ctx => ctx.render('wwww/index'));
router.get( '/wwww/warning',   wwww.getWarning);
router.post('/wwww/warning',   wwww.postWarning);
router.get( '/wwww/what',      wwww.getWhat);
router.post('/wwww/what',      wwww.postWhat);
router.get( '/wwww/where',     wwww.getWhere);
router.post('/wwww/where',     wwww.postWhere);
router.get( '/wwww/when',      wwww.getWhen);
router.post('/wwww/when',      wwww.postWhen);
router.get( '/wwww/who',       wwww.getWho);
router.post('/wwww/who',       wwww.postWho);
router.get( '/wwww/submit',    wwww.getSubmit);
router.post('/wwww/submit',    wwww.postSubmit);
router.get( '/wwww/thank-you', ctx => ctx.render('wwww/thank-you'));


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = router.middleware();
