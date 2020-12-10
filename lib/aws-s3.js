/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Amazon AWS S3 persistent resources.                                        C.Veness 2017-2018  */
/*                                                                                                */
/* This manages putting, getting, and deleting AWS S3 resources.                    .             */
/*                                                                                                */
/* S3 is used for images, videos, documents etc uploaded as part of incident report submissions.  */
/*                                                                                                */
/*                                  © 2017-2018 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import AWS    from 'aws-sdk';  // AWS SDK for JavaScript
import fs     from 'fs-extra'; // fs with extra functions & promise interface
import dotenv from 'dotenv';   // load environment variables from a .env file into process.env

dotenv.config();


const accessKeys = {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};


class AwsS3 {

    /**
     * Upload resource to AWS S3.
     *
     * @param {string} org - Organisation (/database) resource is associated with.
     * @param {string} project - Project (campaign) report belongs to.
     * @param {string} date - Date (yyyy-mm) of report submission.
     * @param {string} id - Report id.
     * @param {string} filename - Name of resource.
     * @param {Buffer} path - Full path of file to be uploaded.
     */
    static async put(org, project, date, id, filename, path) {
        if (Object.values(accessKeys).join() == ',') throw new Error('AWS Access Keys missing');

        const s3 = new AWS.S3(accessKeys);

        const fileBuffer = await fs.readFile(path);

        const params = {
            Bucket: `thewhistle.${org}`,
            Key:    `${project}/${date}/${id}/${filename}`,
            Body:   fileBuffer,
        };

        try {
            await s3.putObject(params).promise();
        } catch (e) {
            if (e.code == 'NoSuchBucket') throw new Error(`No AWS/S3 bucket for ${org}/${project}`);
            // otherwise...
            console.error('AwsS3.put', e.message);
            throw e;
        }

        return true;
    }

    /**
     * Get resource from AWS S3, returning it as a Buffer.
     *
     * Usage:
     *     const org = ctx.state.user.db;
     *     const { project, date, id, filename } = ctx.params;
     *     ctx.response.body = await AwsS3.getBuffer(org, project, date, id, filename);
     *     ctx.response.type = filename.lastIndexOf('.') > 0
     *         ? filename.slice(filename.lastIndexOf('.')) // kosher extension
     *         : 'application/octet-stream';               // no extension or initial dot
     *     ctx.response.set('Cache-Control', 'public, max-age=' + (ctx.app.env=='production' ? 60*60*24 : 1));
     *
     * @param   {string} org - Organisation (/database) resource is associated with.
     * @param   {string} project - Project (campaign) report belongs to.
     * @param   {string} date - Date (yyyy-mm) of report submission.
     * @param   {string} id - Report id.
     * @param   {string} filename - Name of resource.
     * @returns {Buffer} Required resource.
     * @throws  {Error}  404 NoSuchKey: The specified key does not exist
     */
    static async getBuffer(org, project, date, id, filename) {
        if (Object.values(accessKeys).join() == ',') throw new Error('AWS Access Keys missing');

        const s3 = new AWS.S3(accessKeys);

        const params = {
            Bucket: `thewhistle.${org}`,
            Key:    `${project}/${date}/${id}/${filename}`,
        };

        try {
            const obj = await s3.getObject(params).promise();
            return obj.Body;
        } catch (e) {                                         // TODO: handle 'NoSuchBucket: The specified bucket does not exist' for new org'n
            if (e.statusCode != 404) console.error('AwsS3.getBuffer', e);
            throw e;
        }
    }


    /**
     * Get resource from AWS S3, returning it as a Stream.
     *
     * I have not yet worked out how to use an S3 resource as a stream.
     *
     * I believe the normal way to proxy to AWS S3 would be to use a stream something like:
     *     const stream = s3.getObject(params).createReadStream();
     *     ctx.response.body = stream;
     * but I cannot find any way to catch a '404 NoSuchKey: The specified key does not exist' error.
     * The getBuffer() approach is probably less efficient than using a stream, but it works!
     *
     * @param   {string} org - Organisation (/database) resource is associated with.
     * @param   {string} project - Project (campaign) report belongs to.
     * @param   {string} date - Date (yyyy-mm) of report submission.
     * @param   {string} id - Report id.
     * @param   {string} filename - Name of resource.
     * @returns {Stream} Required resource.
     */
    //static getStream(org, project, date, id, filename) {
    //    const s3 = new AWS.S3(accessKeys);
    //
    //    const params = {
    //        Bucket: `thewhistle.${org}`,
    //        Key:    `${project}/${date}/${id}/${filename}`,
    //    };
    //    const stream = s3.getObject(params).createReadStream();
    //
    //    return stream;
    //}


    /**
     * Delete resources for report from AWS S3.
     *
     * This will delete all uploaded files for given report.
     *
     * @param {string} org - Organisation (/database) resource is associated with.
     * @param {string} project - Project (campaign) report belongs to.
     * @param {string} date - Date (yyyy-mm) of report submission.
     * @param {string} id - Report id.
     */
    static async deleteReportObjects(org, project, date, id) {
        if (Object.values(accessKeys).join() == ',') throw new Error('AWS Access Keys missing');

        const s3 = new AWS.S3(accessKeys);

        const paramsList = {
            Bucket:    `thewhistle.${org}`,
            Delimiter: '/',
            Prefix:    `${project}/${date}/${id}/`,
        };

        const objects =  await s3.listObjectsV2(paramsList).promise();
        // note there is a limit of 1000 objects returned by listObjects() - shouldn't affect us!

        for (const object of objects.Contents) {
            const paramsDel = {
                Bucket: `thewhistle.${org}`,
                Key:    object.Key,
            };
            try {
                await s3.deleteObject(paramsDel).promise();
            } catch (e) {                                   // TODO: handle 'NoSuchBucket: The specified bucket does not exist' for new org'n
                throw e;
            }
        }

        return true;
    }
}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default AwsS3;
