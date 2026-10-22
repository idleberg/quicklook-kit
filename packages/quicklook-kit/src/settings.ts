// Validates the `settings` schema, so mistakes surface when the config loads
// rather than as a broken Settings tab.

/** The fields each setting type allows, besides `type`, `title`, `description` and `order`. */
const settingFields: Record<string, string[]> = {
	boolean: ['default'],
	string: ['default', 'enum', 'radio'],
	integer: ['default', 'enum', 'radio', 'minimum', 'maximum'],
	number: ['default', 'enum', 'radio', 'minimum', 'maximum'],
	object: ['properties'],
};
const commonFields = ['type', 'title', 'description', 'order'];
const knownFields = new Set([...commonFields, ...Object.values(settingFields).flat()]);

function isString(value: unknown): boolean {
	return typeof value === 'string';
}

/** Whether `value` is a valid value of setting type `type`. */
const valueChecks: Record<string, (value: unknown) => boolean> = {
	boolean: (value) => typeof value === 'boolean',
	string: isString,
	integer: Number.isInteger,
	number: Number.isFinite,
};

/** Optional fields with a fixed type, and the problem when it's wrong. */
const fieldChecks: [field: string, check: (value: unknown) => boolean, problem: string][] = [
	['title', isString, 'title must be a string'],
	['description', isString, 'description must be a string'],
	['order', Number.isFinite, 'order must be a number'],
	['minimum', Number.isFinite, 'minimum must be a number'],
	['maximum', Number.isFinite, 'maximum must be a number'],
	['radio', (value) => typeof value === 'boolean', 'radio must be true or false'],
];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const settingKey = /^[A-Za-z_][\w-]*$/;

/**
 * Throws on anything in a `settings` schema the app can't show, naming the key
 * path, e.g. `settings.editor.tabSize: default 0 is below minimum 1`.
 */
export function validateSettings(settings: unknown, path = 'settings'): void {
	if (!isRecord(settings)) {
		throw new Error(`${path}: expected an object of settings`);
	}
	for (const [key, entry] of Object.entries(settings)) {
		const at = `${path}.${key}`;
		// QL-Win looks each key up as an XML element name, editor.fontSize as /Settings/editor.fontSize.
		if (!settingKey.test(key)) {
			throw new Error(`${at}: keys need a letter or _ first, then letters, digits, _ or -`);
		}
		if (!isRecord(entry)) {
			throw new Error(`${at}: expected an object with a type`);
		}
		const problem = settingProblem(entry);
		if (problem) {
			throw new Error(`${at}: ${problem}`);
		}
		if (entry.type === 'object') {
			validateSettings(entry.properties, at);
		}
	}
}

/** What's wrong with one entry, without looking into `properties`. */
function settingProblem(entry: Record<string, unknown>): string | undefined {
	const type = String(entry.type);
	const allowed = typeof entry.type === 'string' && Object.hasOwn(settingFields, type);
	if (!allowed) {
		return `unknown type ${JSON.stringify(entry.type)}`;
	}
	for (const field of Object.keys(entry)) {
		if (!knownFields.has(field)) {
			return `unknown field "${field}"`;
		}
		if (!(commonFields.includes(field) || settingFields[type]?.includes(field))) {
			return `"${field}" isn't allowed on type "${type}"`;
		}
	}
	const wrong = fieldChecks.find(
		([field, check]) => !(entry[field] === undefined || check(entry[field])),
	);
	if (wrong) {
		return wrong[2];
	}
	if (type === 'object') {
		return isRecord(entry.properties) && Object.keys(entry.properties).length > 0
			? undefined
			: 'an object needs non-empty properties';
	}
	return valueProblem(entry, type);
}

/** What's wrong with the default, the range and the enum of a non-object entry. */
function valueProblem(entry: Record<string, unknown>, type: string): string | undefined {
	if (!('default' in entry)) {
		return 'default is required';
	}
	const { default: value, minimum, maximum, radio, enum: options } = entry;
	const shown = JSON.stringify(value);
	if (!valueChecks[type]?.(value)) {
		return `default ${shown} isn't of type "${type}"`;
	}
	if (typeof minimum === 'number' && typeof maximum === 'number' && minimum > maximum) {
		return `minimum ${minimum} is above maximum ${maximum}`;
	}
	if (typeof minimum === 'number' && (value as number) < minimum) {
		return `default ${shown} is below minimum ${minimum}`;
	}
	if (typeof maximum === 'number' && (value as number) > maximum) {
		return `default ${shown} is above maximum ${maximum}`;
	}
	if (radio && options === undefined) {
		return 'radio needs an enum';
	}
	return options === undefined ? undefined : enumProblem(options, value, type);
}

/** An object entry other than `{ value, description? }`. */
function malformedOption(option: Record<string, unknown>): boolean {
	return !(
		'value' in option &&
		Object.keys(option).every((field) => field === 'value' || field === 'description') &&
		(option.description === undefined || isString(option.description))
	);
}

function enumProblem(options: unknown, value: unknown, type: string): string | undefined {
	if (!Array.isArray(options) || options.length === 0) {
		return 'enum must be a non-empty array';
	}
	const values: unknown[] = [];
	for (const [index, option] of options.entries()) {
		if (isRecord(option) && malformedOption(option)) {
			return `enum[${index}] must be a value or { value, description }`;
		}
		const optionValue = isRecord(option) ? option.value : option;
		if (!valueChecks[type]?.(optionValue)) {
			return `enum[${index}] ${JSON.stringify(optionValue)} isn't of type "${type}"`;
		}
		values.push(optionValue);
	}
	return values.includes(value) ? undefined : `default ${JSON.stringify(value)} isn't in the enum`;
}
