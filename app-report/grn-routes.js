/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Routes: grn (Global Rights Nigeria)                                                           */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const router = require('koa-router')(); // router middleware for koa

const grn = require('./grn-handlers.js');


router.get( '/grn',        grn.getIndex);
router.get( '/grn/submit', grn.getSubmit);
router.post('/grn/submit', grn.postSubmit);
router.get( '/grn/:num',   grn.getPage);
router.post('/grn/:num',   grn.postPage);


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = router.middleware();
