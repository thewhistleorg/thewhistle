import Router        from 'koa-router';


import SmsHandlers   from './sms-handlers.js';


const router = new Router();


//Serve SMS test web app
router.get('/sms-emulator', SmsHandlers.getEmulator);


//On receiving a text
router.post('/:org/:project', SmsHandlers.postSms);


//Delete a message sent by the system
router.post('/delete-outbound', SmsHandlers.deleteOutbound);


//Direct user to the page allowing them to upload evidence
router.get('/:org/evidence/:token', SmsHandlers.getEvidencePage);


router.get('/:project/evidence-timeout', SmsHandlers.getEvidenceTimeout);


router.post('/:org/evidence/:token', SmsHandlers.receiveEvidence);

export default router.middleware();
