/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Routes for dev tools.                                                      C.Veness 2017-2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Router from 'koa-router'; // router middleware for koa

const router = new Router();


import Dev from './dev.js';


router.get('/dev', Dev.index);

router.get('/dev/nodeinfo', Dev.nodeinfo);

router.get('/dev/user-agents',         Dev.userAgentsV1);      // original user agents reporting on report submission
router.get('/dev/user-agents/admin',   Dev.userAgentsAdmin);   // user agents from admin.thewhistle.org
router.get('/dev/user-agents/report',  Dev.userAgentsReport);  // user agents from reports.thewhistle.org
router.get('/dev/user-agents/reports', Dev.userAgentsReports); // user agents from submitted reports

router.get('/dev/log-access',            Dev.logAccess);
router.get('/dev/log-error',             Dev.logError);
router.get('/dev/log-access/export-csv', Dev.logAccessCsv);

router.get('/dev/notes',        Dev.notesIndex);
router.get('/dev/notes/readme', Dev.notesReadme);
router.get('/dev/notes/form-wizard/:notes', Dev.notesFormWizard);
router.get('/dev/notes/:notes', Dev.notes);

router.get('/dev/submissions', Dev.submissions);

router.get('/dev/throw', Dev.throw);

router.get('/dev/ip-cache', function(ctx) { // for debug
    ctx.body = `countries (${global.ipsCountry.size})\n`;
    for (const [ key, val ] of global.ipsCountry) ctx.body += ` ${key} => ${val}\n`;
    ctx.body += `domains (${global.ipsDomain.size})\n`;
    for (const [ key, val ] of global.ipsDomain) ctx.body += ` ${key} => ${val}\n`;
});


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default router.middleware();
