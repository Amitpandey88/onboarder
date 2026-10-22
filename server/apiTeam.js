import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash, evidenceText } from './intelligence/workspace.js';
import { getSession } from './sessions.js';
import { sendJSON, sendError } from './http.js';
import { safeRelative } from '../cli/agent/files.js';
const queues = new Map();
export async function handleTeamComments(res, scanId, body, directory, member) {
    if (!directory)
        return sendError(res, 503, 'Configure ONBOARDER_TEAM_FILE on the server to enable team collaboration.');
    if (typeof scanId !== 'string')
        return sendError(res, 400, 'Choose a repository scan.');
    const session = getSession(scanId);
    if (!session)
        return sendError(res, 404, 'Repository session expired.');
    const folder = path.join(path.dirname(directory), 'comments');
    const file = path.join(folder, hash(session.root) + '.json');
    const read = async () => {
        try {
            const stat = await fs.lstat(file);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024)
                throw new Error('Invalid comments storage.');
            const value = JSON.parse(await fs.readFile(file, 'utf8'));
            if (!Array.isArray(value) || value.length > 500)
                throw new Error('Invalid comments storage.');
            return value;
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return [];
            throw error;
        }
    };
    try {
        if (!body)
            return sendJSON(res, 200, await read());
        if (member && member.role !== 'reviewer')
            return sendError(res, 403, 'Posting comments requires reviewer access.');
        if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 4000 || typeof body.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(body.fingerprint))
            return sendError(res, 400, 'Provide a comment under 4,000 characters and its source fingerprint.');
        if (body.file !== undefined)
            safeRelative(String(body.file));
        const comment = { id: randomUUID(), author: member?.name || 'Repository owner', authorId: member?.id || 'owner',
            fingerprint: body.fingerprint, text: evidenceText(body.text), createdAt: new Date().toISOString(), ...(body.file ? { file: String(body.file) } : {}) };
        const previous = queues.get(file) || Promise.resolve();
        const task = previous.catch(() => { }).then(async () => {
            await fs.mkdir(folder, { recursive: true, mode: 0o700 });
            if ((await fs.lstat(folder)).isSymbolicLink())
                throw new Error('Comments directory cannot be a symbolic link.');
            const values = [comment, ...await read()].slice(0, 500);
            const temporary = file + '.' + randomUUID();
            try {
                await fs.writeFile(temporary, JSON.stringify(values), { flag: 'wx', mode: 0o600 });
                await fs.rename(temporary, file);
            }
            finally {
                await fs.unlink(temporary).catch(() => { });
            }
            return values;
        });
        queues.set(file, task);
        try {
            return sendJSON(res, 200, await task);
        }
        finally {
            if (queues.get(file) === task)
                queues.delete(file);
        }
    }
    catch (error) {
        sendError(res, 400, error.message);
    }
}
//# sourceMappingURL=apiTeam.js.map