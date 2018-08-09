import Report        from '../models/report.js';

import fs           from 'fs-extra';    // fs with extra functions & promise interface

//One instance for each project/organisation combination
class EvidencePage {


    /**
     * Sets up SMS app for a given organisation/project combination
     *
     * @param   {string}   report
     * @returns {Object}   Evidence page object
     */    
    constructor(report) {
        this.report = report;
    }

    async renderEvidencePage(ctx) {
        let date = new Date();
        date.setDate(date.getDate() - 7);
        if (date < this.report.lastUpdated) {
            //Report last updated within the last week
            await ctx.render(`upload-${this.report.project}`);
        } else {
            //Report last updated more than a week ago
            await ctx.render(`timeout-${this.report.project}`);
        }
    }


    static async renderInvalidTokenPage(ctx) {
        try {
            await ctx.render(`invalid-token-${ctx.params.org}`);
        } catch (e) {
            await ctx.render('invalid-token-hfrn-en');
        }
    }


    async processEvidence(ctx) {
        if (ctx.request.files) {
            let files = ctx.request.files.documents;
            files = Array.isArray(files) ? files : [ files ];
            try {
                let fileString = '';
                for (const file of files) {
                    await Report.submissionFile(ctx.params.org, this.report._id, file);
                    fileString += `<li>${file.name}</li>`;
                }
                let body = await fs.readFile('app-sms/templates/evidence/uploaded-hfrn-en.html', 'utf8');
                body = body.replace('{{ files }}', fileString);
                ctx.response.body = body;
                ctx.response.status = 200;
            } catch (e) {
                console.error(e);
                ctx.response.redirect(`/${ctx.params.org}/evidence/failed-upload/${this.report.evidenceToken}`);
            }
        }
    }

    static renderFailedUpload(ctx) {

    }

}
export default EvidencePage;