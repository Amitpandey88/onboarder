import { TeamDirectory } from '../server/intelligence/team.js';
export async function teamCommand(command, args, flags) {
    if (flags.help || !command || command === 'help') {
        console.log('Team collaboration (operator-managed)\nSet ONBOARDER_TEAM_FILE to an absolute private configuration file on the server.\n  onboarder team add <name> <repository> --role viewer|reviewer\n  onboarder team list\n  onboarder team revoke <member-id>\nGenerated credentials are shown once. Members sign in using the existing access-key form or a Bearer token. Grants cover only exact repository roots.');
        return 0;
    }
    const file = process.env.ONBOARDER_TEAM_FILE;
    if (!file || !file.startsWith('/'))
        throw new Error('Set ONBOARDER_TEAM_FILE to an absolute private file path before managing members.');
    const team = new TeamDirectory(file);
    if (command === 'list') {
        console.log(JSON.stringify((await team.read()).members.map(({ tokenHash: _hash, ...m }) => m), null, 2));
        return 0;
    }
    if (command === 'revoke') {
        if (args.length !== 1)
            throw new Error('Supply one member ID.');
        await team.revoke(args[0]);
        console.log('Member revoked. Its sessions and token no longer authorize requests.');
        return 0;
    }
    if (command === 'add') {
        if (args.length !== 2)
            throw new Error('Supply a member name and one repository folder.');
        console.log(JSON.stringify(await team.add(args[0], flags.role || 'viewer', [args[1]]), null, 2));
        return 0;
    }
    throw new Error('Use team add, list or revoke.');
}
//# sourceMappingURL=team.js.map