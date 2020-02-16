import * as fs from 'fs';
import * as path from 'path';
const scp = require('scp2').scp;

// if (!process.argv[2]) {
// 	throw 'remote path required';
// }
const remotePath = 'zpin' || process.argv[2];
const address = '192.168.2.4' || process.argv[3];
const username = 'pi' || process.argv[4];
const password = 'pass' || process.argv[5];
/*console.log("starting...");
copyFile('./**').then(() =>*/ {
	console.log("watching, waiting");
	fs.watch('./', {
		recursive: true,
	}, async (eventType, filename) => {
		if (filename && filename.startsWith('.')) { /*console.log('skip dot');*/ return;}
		if (filename && fs.statSync(path.resolve('./', filename)).isDirectory()) { console.log('skip dir'); return;}

		console.log(new Date().getHours()+':'+new Date().getMinutes(), eventType, filename);
		try {
			if (filename) {
				await new Promise(r => setTimeout(r, 10));
				await copyFile(filename);
			}
		}
		catch(e) {
			console.error(e);
		}
	})
}/*)
.catch(err => console.error('fatal error', err));*/

function copyFile(filename: string): Promise<void> {
	const remote = path.join(remotePath, filename);
	return new Promise((resolve, reject) => {
		scp(filename, `${username}:${password}@${address}:${remote}`, (err: Error) => {
			if (err) reject(err);
			else resolve();
		});
	});
}