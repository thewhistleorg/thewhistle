/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* EXIF header extraction unit tests.                                         C.Veness 2017-2018  */
/*                                                                                                */
/*                                  © 2017-2018 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import { expect }   from 'chai';              // BDD/TDD assertion library
import { exiftool } from 'exiftool-vendored'; // cross-platform Node.js access to ExifTool

describe('EXIF', function() {
    describe('extract EXIF metadata', function() {
        it('returns location & date', async function() {
            const exif = await exiftool.read('test/img/s_gps.jpg');
            expect(exif.GPSLatitude.toFixed(6)).to.equal('54.989667');
            expect(exif.GPSLongitude.toFixed(6)).to.equal('-1.914167');
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
