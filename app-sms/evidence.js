/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Code for the evidence upload page                                           Louis Slater 2018  */
/*                                                                                                */
/*                                       © 2018 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


import Report from '../models/report.js';


//One instance for each report
class EvidencePage {


    /**
     * Sets up the evidence page object
     *
     * @param   {string}   org - Organisation
     * @param   {Object}   report - Report object
     * @param   {string}   token - Evidence token
     * @returns {Object} - Evidence page object
     */
    constructor(org, report, token) {
        this.org = org;
        this.report = report;
        this.token = token;
    }


    /**
     * Determines whether the current time is within a week of when the
     * report was submitted
     *
     * @returns {boolean} - False if current time is within a week of
     *                      when the report was submitted. True otherwise.
     */
    async evidenceTimeout() {
        const date = new Date();
        date.setDate(date.getDate() - 7);
        this.report = (await Report.getBy(this.org, 'evidenceToken', this.token))[0];
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
        if (await this.evidenceTimeout()) {
            //Report last updated more than a week ago
            await ctx.render(`evidence-timeout-${this.report.project}`);
            ctx.response.status = 410; //Gone
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
        //Input name is 'documents' in HTML
        let files = ctx.request.files.documents;
        //If there is only one file, store it in an array (so it reflects the standard files structure)
        files = Array.isArray(files) ? files : [ files ];

        //If there are no files, files will contain 1 file object of size 0, so remove this (thus making files an empty array)
        files = files.filter(f => f && f.size > 0);

        if (await this.evidenceTimeout()) {
            //Report last updated more than a week ago
            ctx.response.redirect(`/${this.report.project}/evidence-timeout`);
            ctx.response.status = 410;
        } else if (files.length == 0) {
            //No files submitted. This is caught by front-end code, so this is defensive.
            ctx.response.redirect(`/${ctx.params.org}/evidence/${this.report.evidenceToken}?err=No%20files%20uploaded`);
        } else {
            try {
                //fileString is the HTML list of files submitted
                const fileList = [];
                for (const file of files) {
                    //Upload file to AWS and store reference in database
                    await Report.submissionFile(ctx.params.org, this.report._id, file);
                    fileList.push(file.name);
                }

                ctx.flash = { files: fileList, org: ctx.params.org, token: ctx.params.token };
                ctx.response.redirect(`/${this.report.project}/evidence-uploaded`);
            } catch (e) {
                ctx.response.redirect(`/${ctx.params.org}/evidence/${this.report.evidenceToken}?err=Upload%20failed`);
            }
        }
    }


}


export default EvidencePage;
