import SmsApp        from '../app-sms/sms.js';
import FormGenerator from '../lib/form-generator.js';
import EvidencePage  from '../app-sms/evidence.js';
import Report        from '../models/report.js';

const smsRoutes = {};
const evidenceRoutes = {};


class SmsHandlers {
    static async renderInvalidTokenPage(ctx) {
        try {
            await ctx.render(`evidence-invalid-token-${ctx.params.org}`);
        } catch (e) {
            await ctx.render('evidence-invalid-token-hfrn-en');
        }
    }


    static async setupEvidencePage(ctx, errorMessage) {
        //TODO: Try not providing token
        if (!evidenceRoutes[ctx.params.token]) {
            const reports = await Report.getBy(ctx.params.org, 'evidenceToken', ctx.params.token);
            if (reports.length > 0) {
                evidenceRoutes[ctx.params.token] = new EvidencePage(reports[0]);
                await evidenceRoutes[ctx.params.token].renderEvidencePage(ctx, errorMessage);
            } else {
                await SmsHandlers.renderInvalidTokenPage(ctx);
            }
        } else {
            await evidenceRoutes[ctx.params.token].renderEvidencePage(ctx, errorMessage);
        }
    }


    static async getEmulator(ctx) {
        if (ctx.app.env === 'production') {
            ctx.status = 404;
        } else {
            await ctx.render('emulator');
        }
    }


    static async postSms(ctx) {
        //If the organisation/project combination is valid
        if (FormGenerator.exists(ctx.params.org, ctx.params.project)) {
            //If this is the first request for the organisation/project combination (since server start)
            if (!smsRoutes[ctx.url]) {
                smsRoutes[ctx.url] = new SmsApp(ctx.params.org, ctx.params.project);
                await smsRoutes[ctx.url].parseSpecifications();
                await smsRoutes[ctx.url].setupDatabase();
            }
            await smsRoutes[ctx.url].receiveText(ctx);
        }
    }


    static deleteOutbound(ctx) {
        if (ctx.request.body.SmsStatus === 'delivered') {
            SmsApp.deleteMessage(ctx.request.body.MessageSid);
        }
        ctx.status = 200;
        ctx.headers['Content-Type'] = 'text/xml';
    }


    static async getEvidencePage(ctx) {
        const errorMessage = ctx.url.substr(30, 5) === '?err=' ? ctx.url.substring(35).replace(/%20/g, ' ') : null;
        await SmsHandlers.setupEvidencePage(ctx, errorMessage);
    }


    static async getEvidenceTimeout(ctx) {
        await ctx.render(`evidence-timeout-${ctx.params.project}`);
    }


    static async receiveEvidence(ctx) {
        //TODO: Try not providing token
        if (!evidenceRoutes[ctx.params.token]) {
            const reports = await Report.getBy(ctx.params.org, 'evidenceToken', ctx.params.token);
            if (reports.length > 0) {
                evidenceRoutes[ctx.params.token] = new EvidencePage(reports[0]);
                await evidenceRoutes[ctx.params.token].processEvidence(ctx);
            } else {
                EvidencePage.renderFailedUpload(ctx);
            }
        } else {
            await evidenceRoutes[ctx.params.token].processEvidence(ctx);
        }
    }
}


export default SmsHandlers;
