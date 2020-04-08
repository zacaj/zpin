import * as fs from 'fs';
import * as path from 'path';
const scp = require('scp2').Client;

// if (!process.argv[2]) {
//     throw 'remote path required';
// }
const remotePath = 'zpin' || process.argv[2];
const address = '192.168.2.45' || process.argv[3];
const username = 'pi' || process.argv[4];
const password = 'pass' || process.argv[5];
const toCopy: string[] = [];
const client = new scp({
    port: 22,
    host: address,
    username,
    password,
    readyTimeout: 0,
});
/*console.log("starting...");
copyFile('./**').then(() =>*/ {
    console.log('watching, waiting');
    fs.watch('./', {
        recursive: true,
    }, async (eventType, filename) => {
        if (filename?.startsWith('.')) {
 /*console.log('skip dot');*/ return;
        }
        if (filename && fs.statSync(path.resolve('./', filename)).isDirectory()) {
            // console.log('skip dir');
            return;
        }

        console.log(new Date().getHours() + ':' + new Date().getMinutes(), eventType, filename);
        if (filename && !toCopy.includes(filename)) {
            toCopy.push(filename);
            // console.info('queue ', filename, toCopy);
        }
    });
}/*)
.catch(err => console.error('fatal error', err));*/
setTimeout(sync, 50);
async function sync() {
    while (toCopy.length) {
        const filename = toCopy.shift()!;
        try {
            // console.info('start ', filename);
            if (!toCopy.length)
                await new Promise(r => setTimeout(r, 10));
            await copyFile(filename);
            console.info('updated %s, %i remaining', filename, toCopy.length);
        } catch (e) {
            console.error('error ', filename, e);
        }
    }
    setTimeout(sync, 50);
}
function copyFile(filename: string): Promise<void> {
    const remote = path.join(remotePath, filename);
    return new Promise((resolve, reject) => {
        // scp(filename, `${username}:${password}@${address}:${remote}`, (err: Error) => {
        //     if (err) reject(err);
        //     else resolve();
        // });
        client.upload(filename, remote, (err: Error) => {
            if (err) reject(err);
            else resolve();
        });
    });
}