import Report from '../models/report.js';

import fs from 'fs-extra';    // fs with extra functions & promise interface

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


    evidenceTimeout() {
        const date = new Date();
        date.setDate(date.getDate() - 7);
        return date > this.report.lastUpdated;
    }

    async renderEvidencePage(ctx, errorMessage) {
        if (this.evidenceTimeout()) {
            //Report last updated more than a week ago
            await ctx.render(`evidence-timeout-${this.report.project}`);
        } else {
            //Report last updated within the last week
            const context = {
                errorMessage: errorMessage,
                alias:        this.report.alias,
                org:          ctx.params.org,
                token:        ctx.params.token,
            };
            await ctx.render(`evidence-upload-${this.report.project}`, context);
        }
    }


    async processEvidence(ctx) {
        let files = ctx.request.files.documents;
        files = Array.isArray(files) ? files : [ files ];
        files = files.filter(f => f.size > 0);
        if (this.evidenceTimeout()) {
            ctx.response.redirect(`/${this.report.project}/evidence-timeout`);
        } else if (files.length == 0) {
            ctx.response.redirect(`/${ctx.params.org}/evidence/${this.report.evidenceToken}?err=No%20files%20uploaded`);
        } else {
            try {
                let fileString = '';
                for (const file of files) {
                    await Report.submissionFile(ctx.params.org, this.report._id, file);
                    fileString += `<li>${file.name}</li>`;
                }
                let body = await fs.readFile('app-sms/templates/evidence-uploaded-hfrn-en.html', 'utf8');
                body = body.replace('{{ files }}', fileString);
                body = body.replace('{{ org }}', ctx.params.org);
                body = body.replace('{{ token }}', ctx.params.token);
                ctx.response.body = body;
                ctx.response.status = 200;
            } catch (e) {
                console.error(e);
                ctx.response.redirect(`/${ctx.params.org}/evidence/${this.report.evidenceToken}?err=Upload%20failed`);
            }
        }
    }

}
export default EvidencePage;