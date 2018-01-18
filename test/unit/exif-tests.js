/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* EXIF header extraction unit tests.                                              C.Veness 2017  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import chai     from 'chai';              // BDD/TDD assertion library
import exiftool from 'exiftool-vendored'; // cross-platform Node.js access to ExifTool
const expect = chai.expect;

describe('EXIF', function() {
    describe('extract EXIF metadata', function() {
        it('returns location & date', async function() {
            const exif = await exiftool.exiftool.read('test/img/s_gps.jpg');
            expect(exif.GPSLatitude).to.equal(54.98966667);
            expect(exif.GPSLongitude).to.equal(-1.91416667);
            expect(exif.CreateDate).to.deep.include({
                year:   2002,
                month:  7,
                day:    13,
                hour:   15,
                minute: 58,
                second: 28,
                //tzoffsetMinutes: undefined, [fails deep.equal!]
                millis: 0,
            });
        });
    });
});
