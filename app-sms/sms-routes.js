/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Routes for the SMS sub app                                                  Louis Slater 2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


import Router        from 'koa-router';


import SmsHandlers   from './sms-handlers.js';


const router = new Router();


//Serve SMS emulator
router.get('/:org/:project/emulator', SmsHandlers.getEmulator);


//Serve the evidence upload page
router.get('/:org/evidence/:token', SmsHandlers.getEvidencePage);


//Serve the evidence token timeout page
router.get('/:project/evidence-timeout', SmsHandlers.getEvidenceTimeout);


//Serve the evidence uploaded page
router.get('/:project/evidence-uploaded', SmsHandlers.getEvidenceUploaded);


//On receiving a text
//Twilio webhook
router.post('/:org/:project', SmsHandlers.postSms);


//Delete a message sent to the user from Twilio logs
//Twilio calls this as a callback
router.post('/delete-outbound', SmsHandlers.deleteOutbound);


//On receiving evidence
router.post('/:org/evidence/:token', SmsHandlers.receiveEvidence);


export default router.middleware();
