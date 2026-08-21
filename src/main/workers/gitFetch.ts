import { workerData, parentPort } from 'worker_threads';

import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import fs from 'fs-extra';

const port = parentPort;
if (!port) throw new Error('gitFetch worker has no parentPort');

const { dir, remoteName, repointUrl } = workerData as {
	dir: string;
	remoteName: string;
	repointUrl?: string;
};

const run = async () => {
	if (repointUrl) {
		await git.addRemote({
			fs,
			dir,
			remote: remoteName,
			url: repointUrl,
			force: true
		});
	}
	await git.fetch({ fs, dir, http, tags: true });
};

run()
	.then(() => port.postMessage(true))
	.catch(err => {
		throw err;
	});
