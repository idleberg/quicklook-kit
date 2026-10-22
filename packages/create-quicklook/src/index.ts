#!/usr/bin/env node
// Creates a Quick Look preview project from one of the bundled templates.
// Usage: create-quicklook [dir] [--template <name>] [--platform macos|windows]…
//        [--release | --no-release]
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
	cancel,
	confirm,
	intro,
	isCancel,
	multiselect,
	note,
	outro,
	select,
	text,
} from '@clack/prompts';

const macosGroup = /\tmacos: \{\n[\s\S]*?\n\t\},\n/;
const windowsGroup = "\twindows: { id: 'QuickLook.Plugin.Example', extensions: ['example'] },\n";

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const templates = (await readdir(`${pkgRoot}/templates`)).toSorted();

const { values, positionals } = parseArgs({
	allowPositionals: true,
	allowNegative: true,
	options: {
		template: { type: 'string', short: 't' },
		platform: { type: 'string', short: 'p', multiple: true },
		release: { type: 'boolean' },
	},
});
const unknownPlatform = values.platform?.find(
	(platform) => !['macos', 'windows'].includes(platform),
);
if (unknownPlatform) {
	cancel(`--platform: expected "macos" or "windows", got "${unknownPlatform}"`);
	process.exit(1);
}

/** Exits quietly when a prompt is cancelled with Ctrl+C or Esc. */
function answer<T>(value: T): Exclude<T, symbol> {
	if (isCancel(value)) {
		cancel('Cancelled, nothing created.');
		process.exit(1);
	}
	return value as Exclude<T, symbol>;
}

intro('create-quicklook');
const dir = resolve(
	positionals[0] ??
		answer(
			await text({
				message: 'Project folder',
				placeholder: 'quicklook-preview',
				defaultValue: 'quicklook-preview',
			}),
		),
);
if (existsSync(dir) && (await readdir(dir)).length > 0) {
	cancel(`${dir} is not empty.`);
	process.exit(1);
}
const template =
	values.template && templates.includes(values.template)
		? values.template
		: answer(
				await select({
					message: 'Template',
					options: templates.map((value) => ({ value })),
				}),
			);
const platforms =
	values.platform ??
	answer(
		await multiselect({
			message: 'Platforms',
			options: [
				{ value: 'macos', label: 'macOS', hint: 'Quick Look' },
				{ value: 'windows', label: 'Windows', hint: 'QuickLook by QL-Win' },
			],
			initialValues: ['macos'],
		}),
	);
const release =
	values.release ??
	answer(await confirm({ message: 'Add a GitHub release workflow?', initialValue: false }));

await cp(`${pkgRoot}/templates/${template}`, dir, { recursive: true });
for (const file of ['mise.toml', 'hk.pkl']) {
	await cp(`${pkgRoot}/files/${file}`, `${dir}/${file}`);
}
// Named so Biome doesn't take it for a nested config in this repository.
await cp(`${pkgRoot}/files/biome.template.jsonc`, `${dir}/biome.jsonc`);
await cp(`${pkgRoot}/files/ci.yml`, `${dir}/.github/workflows/ci.yml`);
// npm drops .gitignore from published packages, so it ships without the dot.
await cp(`${pkgRoot}/files/gitignore`, `${dir}/.gitignore`);
if (release) {
	await cp(`${pkgRoot}/files/release.yml`, `${dir}/.github/workflows/release.yml`);
}

// The templates target macOS; the config and toolchain follow the chosen platforms.
const macos = platforms.includes('macos');
const windows = platforms.includes('windows');
async function edit(file: string, change: (content: string) => string) {
	await writeFile(file, change(await readFile(file, 'utf8')));
}
await edit(`${dir}/quicklook.config.ts`, (content) =>
	content
		.replace(macosGroup, (group) => (macos ? group : ''))
		.replace('\tframework:', (line) => (windows ? `${windowsGroup}${line}` : line)),
);
await edit(`${dir}/mise.toml`, (content) =>
	content
		.replace('xcodegen = "latest"\n', (line) => (macos ? line : ''))
		.replace('node = "24"\n', (line) => (windows ? `${line}dotnet = "10"\n` : line)),
);

const pkg = JSON.parse(await readFile(`${dir}/package.json`, 'utf8'));
pkg.name = basename(dir);
// `pnpm create` passes its own version, e.g. "pnpm/10.0.0 npm/? node/v24…"; corepack reads it from here.
const pnpm = process.env.npm_config_user_agent?.match(/^pnpm\/(\S+)/)?.[1];
if (pnpm) {
	pkg.packageManager = `pnpm@${pnpm}`;
}
await writeFile(`${dir}/package.json`, `${JSON.stringify(pkg, null, '\t')}\n`);

// mise install sets up the pre-commit hook, which needs a repository.
// Skipped inside an existing one, or without git.
function git(...args: string[]) {
	execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
}
try {
	git('rev-parse', '--is-inside-work-tree');
} catch {
	try {
		git('init', '--quiet');
	} catch {
		// No git, no hook.
	}
}

note(
	[
		`cd ${relative(process.cwd(), dir)}`,
		`mise install    # or: pnpm install, with ${new Intl.ListFormat('en').format([
			...(macos ? ['Xcode', 'XcodeGen'] : []),
			...(windows ? ['the .NET SDK'] : []),
		])} installed`,
		'pnpm dev        # drop a file on the page to preview it',
		'pnpm register   # build the app and register it with Quick Look',
	].join('\n'),
	'Next steps',
);
outro(`Created from the ${template} template.`);
