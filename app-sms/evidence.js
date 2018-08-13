/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Code for the evidence upload page                                           Louis Slater 2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


import fs from 'fs-extra';    // File system with extra functions & promise interface


import Report from '../models/report.js';


//One instance for each report
class EvidencePage {


    /**
     * Sets up the evidence page object
     *
     * @param   {string}   report - Report object
     * @returns {Object} - Evidence page object
     */
    constructor(report) {
        this.report = report;
    }


    /**
     * Determines whether the current time is within a week of when the
     * report was submitted
     * 
     * @returns {boolean} - False if current time is within a week of
     *                      when the report was submitted. True otherwise.
     */
    evidenceTimeout() {
        const date = new Date();
        date.setDate(date.getDate() - 7);
        return date > this.report.lastUpdated;
    }


    /**
     * Responds with either the evidence page, or an appropriate error page
     * 
     * 
     * @param {Object} ctx 
     * @param {string} errorMessage - Text of error message to be displayed to user.
     *                                Null if there is no error.
     */
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


    /**
     * Stores the files provided in a POST request
     * 
     * @param {Object} ctx 
     */
    async processEvidence(ctx) {
        let files = ctx.request.files.documents;

        //If there is only one file, store it in an array (so it reflects the standard files structure)
        files = Array.isArray(files) ? files : [ files ];

        //If there are no files, files will contain 1 file object of size 0, so remove this (thus making files an empty array)
        files = files.filter(f => f.size > 0);
        if (this.evidenceTimeout()) {
            //Report last updated more than a week ago
            ctx.response.redirect(`/${this.report.project}/evidence-timeout`);
        } else if (files.length == 0) {
            //No files submitted. This is caught by front-end code, so this is defensive.
            ctx.response.redirect(`/${ctx.params.org}/evidence/${this.report.evidenceToken}?err=No%20files%20uploaded`);
        } else {
            try {
                //fileString is the HTML list of files submitted
                let fileString = '';
                
                for (const file of files) {
                    //Upload file to AWS and store reference in database
                    await Report.submissionFile(ctx.params.org, this.report._id, file);
                    fileString += `<li>${file.name}</li>`;
                }

                let body = await fs.readFile('app-sms/templates/evidence-uploaded-hfrn-en.html', 'utf8');
                
                //Make HTML replacements
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
