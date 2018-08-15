/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Handling functions for the SMS sub app                                      Louis Slater 2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


import SmsApp        from '../app-sms/sms.js';
import EvidencePage  from '../app-sms/evidence.js';
import FormGenerator from '../lib/form-generator.js';
import Report        from '../models/report.js';


//Indexed by URL. One element for each project/organisation combination.
//Each element is an SmsApp object.
//An element is created when a post request is first made for a valid project/organisation combination.
const smsRoutes = {};

//Indexed by evidence token. One element for each report.
//Each element is an EvidencePage object.
//An element is created when a request is first made for a valid evidence token.
const evidenceRoutes = {};


//Purely static class, using ES6 syntax to group SMS handling functions
class SmsHandlers {


    /**
     * Respond with the SMS emulator web app
     * 
     * @param {Object} ctx 
     */
    static async getEmulator(ctx) {
        if (ctx.app.env === 'production') {
            //Do not serve the emulator in production
            ctx.status = 404;
        } else {
            await ctx.render('emulator');
        }
    }


    /**
     * Processes and responds to an incoming POST request of a valid SMS
     * 
     * @param {Object} ctx 
     */
    static async postSms(ctx) {
        
        if (FormGenerator.exists(ctx.params.org, ctx.params.project)) {
            //If the organisation/project combination is valid
            if (!smsRoutes[ctx.url]) {
                //If this is the first request for the organisation/project combination (since server start)
                smsRoutes[ctx.url] = new SmsApp(ctx.params.org, ctx.params.project);
                await smsRoutes[ctx.url].parseSpecifications();
                await smsRoutes[ctx.url].setupDatabase();
            }
            await smsRoutes[ctx.url].receiveText(ctx);
        }
    }


    /**
     * Attempts to delete an outbound SMS from the Twilio message logs
     * Runs as a callback when the status of a sent message changes
     * 
     * @param {Object} ctx 
     */
    static deleteOutbound(ctx) {
        if (ctx.request.body.SmsStatus === 'delivered') {
            //Can only delete a delivered message
            SmsApp.deleteMessage(ctx.request.body.MessageSid);
        }
        ctx.status = 200;
        ctx.headers['Content-Type'] = 'text/xml';
    }


    /**
     * 
     * 
     * @param {Object} ctx 
     */
    static async renderInvalidOrgPage(ctx) {
        ctx.response.status = 404;
        await ctx.render('evidence-invalid-org');
    }


    /**
     * Responds with an invalid evidence token page
     * 
     * @param {Object} ctx 
     */
    static async renderInvalidTokenPage(ctx) {
        ctx.response.status = 404;
        try {
            await ctx.render(`evidence-invalid-token-${ctx.params.org}`);
        } catch (e) {
            //If the page cannot be rendered for the given organisation, render the hfrn-en page
            await ctx.render('evidence-invalid-token-hfrn-en');
        }
    }


    /**
     * Redirects the user to the failed upload page
     * 
     * @param {Object} ctx 
     */
    static async renderFailedUpload(ctx) {
        await ctx.response.redirect('evidence-failed-upload');
        ctx.response.status = 400;
    }


    /**
     * Responds with the relevant evidence page, if the given evidence token is valid.
     * Sets up the evidence page, if this is the first request using a particular token.
     * Responds with the relevant error page where necessary.
     * 
     * @param {Object} ctx 
     * @param {string} errorMessage - Text of error message to be displayed to user.
     *                                Null if there is no error.
     */
    static async setupEvidencePage(ctx, errorMessage) {
        if (!evidenceRoutes[ctx.params.token]) {
            //If the evidence page hasn't been setup yet
            
            try {
                //reports will either be of length 0 or 1
                const reports = await Report.getBy(ctx.params.org, 'evidenceToken', ctx.params.token);

                if (reports.length > 0) {
                    //If the token is valid
                    evidenceRoutes[ctx.params.token] = new EvidencePage(ctx.params.org, reports[0], ctx.params.token);
                    await evidenceRoutes[ctx.params.token].renderEvidencePage(ctx, errorMessage);
                } else {
                    //If the token is invalid
                    await SmsHandlers.renderInvalidTokenPage(ctx);
                }
            } catch (e) {
                await SmsHandlers.renderInvalidOrgPage(ctx);
            }
        } else {
            //If the evidence page has already been setup
            await evidenceRoutes[ctx.params.token].renderEvidencePage(ctx, errorMessage);
        }
    }


    /**
     * Parses the URL to get the error messages (if it exists)
     * and then sets up and responds with the evidence page
     * 
     * @param {Object} ctx 
     */
    static async getEvidencePage(ctx) {
        const errorMessage = ctx.url.substr(30, 5) === '?err=' ? ctx.url.substring(35).replace(/%20/g, ' ') : null;
        await SmsHandlers.setupEvidencePage(ctx, errorMessage);
    }


    /**
     * Responds with the evidence timeout page for the relevant project
     * 
     * @param {Object} ctx 
     */
    static async getEvidenceTimeout(ctx) {
        await ctx.render(`evidence-timeout-${ctx.params.project}`);
        ctx.response.status = 410;
    }


    /**
     * Processes and stores evidence in a POST request, if the given evidence token is valid.
     * Sets up the evidence page, if this is the first request using a particular token.
     * Responds with the relevant error page where necessary.
     * 
     * @param {Object} ctx 
     */
    static async receiveEvidence(ctx) {
        if (!evidenceRoutes[ctx.params.token]) {
            //If the evidence page hasn't been setup yet
            try {
                //reports will either be of length 0 or 1
                const reports = await Report.getBy(ctx.params.org, 'evidenceToken', ctx.params.token);
                if (reports.length > 0) {
                    //If the token is valid
                    evidenceRoutes[ctx.params.token] = new EvidencePage(ctx.params.org, reports[0], ctx.params.token);
                    await evidenceRoutes[ctx.params.token].processEvidence(ctx);
                } else {
                    //If the token is invalid
                    SmsHandlers.renderFailedUpload(ctx);
                }
            } catch (e) {
                SmsHandlers.renderFailedUpload(ctx);
            }
        } else {
            //If the evidence page has already been setup
            await evidenceRoutes[ctx.params.token].processEvidence(ctx);
        }
    }
}


export default SmsHandlers;
