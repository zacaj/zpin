import * as fs from 'fs';
import * as path from 'path';
const scp = require('scp2').scp;

if (!process.argv[2]) {
	throw 'remote path required';
}
const remotePath = process.argv[2];
const address = '192.168.2.4' || process.argv[3];
const username = 'pi' || process.argv[4];
const password = 'raspberry' || process.argv[5];
/*console.log("starting...");
copyFile('./**').then(() =>*/ {
	console.log("watching, waiting");
	fs.watch('./', {
		recursive: true,
	}, async (eventType, filename) => {
		if (filename && filename.startsWith('.')) return;

		console.log(eventType, filename);
		try {
			if (filename) {
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
	return new Promise((resolve, reject) => {
		scp(filename, `${username}:${password}@${address}:${remotePath}`, (err: Error) => {
			if (err) reject(err);
			else resolve();
		});
	});
}