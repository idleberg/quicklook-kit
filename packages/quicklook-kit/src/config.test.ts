import { describe, expect, it } from 'vitest';
import { validateSettings } from './config.ts';

describe('validateSettings', () => {
	it('accepts a nested schema', () => {
		expect(() =>
			validateSettings({
				theme: {
					type: 'string',
					default: 'light',
					title: 'Theme',
					enum: [{ value: 'light', description: 'Light' }, 'dark'],
					radio: true,
				},
				wrap: { type: 'boolean', default: true, description: 'Wrap **long** lines' },
				fontSize: { type: 'integer', default: 13, minimum: 9, maximum: 32, order: 1 },
				editor: {
					type: 'object',
					properties: { tabSize: { type: 'integer', default: 2, enum: [2, 4, 8] } },
				},
			}),
		).not.toThrow();
	});

	const rejected: [schema: unknown, message: string][] = [
		[[], 'settings: expected an object of settings'],
		[{ a: 1 }, 'settings.a: expected an object with a type'],
		[{ 'a.b': { type: 'boolean', default: true } }, 'settings.a.b: keys can\'t contain "."'],
		[{ a: { type: 'array', default: [] } }, 'settings.a: unknown type "array"'],
		[{ a: { type: 'color', default: '#fff' } }, 'settings.a: unknown type "color"'],
		[{ a: { type: 'toString' } }, 'settings.a: unknown type "toString"'],
		[{ a: { default: true } }, 'settings.a: unknown type undefined'],
		[
			{ a: { type: 'string', default: '', multiline: true } },
			'settings.a: unknown field "multiline"',
		],
		[
			{ a: { type: 'boolean', default: true, enum: [true] } },
			'settings.a: "enum" isn\'t allowed on type "boolean"',
		],
		[
			{ a: { type: 'string', default: '', minimum: 0 } },
			'settings.a: "minimum" isn\'t allowed on type "string"',
		],
		[
			{ a: { type: 'string', default: '', properties: {} } },
			'settings.a: "properties" isn\'t allowed on type "string"',
		],
		[
			{ a: { type: 'object', default: {}, properties: {} } },
			'settings.a: "default" isn\'t allowed on type "object"',
		],
		[{ a: { type: 'object' } }, 'settings.a: an object needs non-empty properties'],
		[{ a: { type: 'object', properties: {} } }, 'settings.a: an object needs non-empty properties'],
		[{ a: { type: 'string', default: '', title: 1 } }, 'settings.a: title must be a string'],
		[{ a: { type: 'string', default: '', order: '1' } }, 'settings.a: order must be a number'],
		[{ a: { type: 'string' } }, 'settings.a: default is required'],
		[
			{ a: { type: 'boolean', default: 'yes' } },
			'settings.a: default "yes" isn\'t of type "boolean"',
		],
		[
			{ a: { type: 'number', default: Number.NaN } },
			'settings.a: default null isn\'t of type "number"',
		],
		[{ a: { type: 'integer', default: 1.5 } }, 'settings.a: default 1.5 isn\'t of type "integer"'],
		[
			{ a: { type: 'number', default: 1, minimum: 2, maximum: 1 } },
			'settings.a: minimum 2 is above maximum 1',
		],
		[{ a: { type: 'number', default: 5, maximum: 4 } }, 'settings.a: default 5 is above maximum 4'],
		[{ a: { type: 'string', default: 'a', radio: true } }, 'settings.a: radio needs an enum'],
		[
			{ a: { type: 'string', default: 'a', enum: [] } },
			'settings.a: enum must be a non-empty array',
		],
		[
			{ a: { type: 'string', default: 'a', enum: ['a', 1] } },
			'settings.a: enum[1] 1 isn\'t of type "string"',
		],
		[
			{ a: { type: 'integer', default: 1, enum: [1, 2.5] } },
			'settings.a: enum[1] 2.5 isn\'t of type "integer"',
		],
		[
			{ a: { type: 'string', default: 'a', enum: [{ description: 'A' }] } },
			'settings.a: enum[0] must be a value or { value, description }',
		],
		[
			{ a: { type: 'string', default: 'a', enum: [{ value: 'a', label: 'A' }] } },
			'settings.a: enum[0] must be a value or { value, description }',
		],
		[
			{ a: { type: 'string', default: 'c', enum: ['a', { value: 'b' }] } },
			'settings.a: default "c" isn\'t in the enum',
		],
		[
			{
				editor: {
					type: 'object',
					properties: { tabSize: { type: 'integer', default: 0, minimum: 1 } },
				},
			},
			'settings.editor.tabSize: default 0 is below minimum 1',
		],
	];

	it.each(rejected)('rejects %j', (schema, message) => {
		expect(() => validateSettings(schema)).toThrow(new Error(message));
	});
});
