import type { SQLiteInsertValue } from 'drizzle-orm/sqlite-core';
import type { SqliteDB, Table } from '../runtime/index.js';
import { z } from 'zod';
import { getTableName } from 'drizzle-orm';

export type MaybePromise<T> = T | Promise<T>;
export type MaybeArray<T> = T | T[];

const baseFieldSchema = z.object({
	label: z.string().optional(),
	optional: z.boolean().optional(),
	unique: z.boolean().optional(),

	// Defined when `defineCollection()` is called
	name: z.string().optional(),
	collection: z.string().optional(),
});

const booleanFieldSchema = baseFieldSchema.extend({
	type: z.literal('boolean'),
	default: z.boolean().optional(),
});

const numberFieldSchema: z.ZodType<
	{
		// ReferenceableField creates a circular type. Define ZodType to resolve.
		type: 'number';
		default?: number | undefined;
		references?: () => ReferenceableField | undefined;
		primaryKey?: boolean | undefined;
	} & z.infer<typeof baseFieldSchema>
> = baseFieldSchema.extend({
	type: z.literal('number'),
	default: z.number().optional(),
	references: z
		.function()
		.returns(z.lazy(() => referenceableFieldSchema))
		.optional(),
	primaryKey: z.boolean().optional(),
});

const textFieldSchema: z.ZodType<
	{
		// ReferenceableField creates a circular type. Define ZodType to resolve.
		type: 'text';
		multiline?: boolean | undefined;
		default?: string | undefined;
		references?: () => ReferenceableField | undefined;
		primaryKey?: boolean | undefined;
	} & z.infer<typeof baseFieldSchema>
> = baseFieldSchema.extend({
	type: z.literal('text'),
	multiline: z.boolean().optional(),
	default: z.string().optional(),
	references: z
		.function()
		.returns(z.lazy(() => referenceableFieldSchema))
		.optional(),
	primaryKey: z.boolean().optional(),
});

const dateFieldSchema = baseFieldSchema.extend({
	type: z.literal('date'),
	default: z
		.union([
			z.literal('now'),
			// allow date-like defaults in user config,
			// transform to ISO string for D1 storage
			z.coerce.date().transform((d) => d.toISOString()),
		])
		.optional(),
});

const jsonFieldSchema = baseFieldSchema.extend({
	type: z.literal('json'),
	default: z.unknown().optional(),
});

const fieldSchema = z.union([
	booleanFieldSchema,
	numberFieldSchema,
	textFieldSchema,
	dateFieldSchema,
	jsonFieldSchema,
]);
export const referenceableFieldSchema = z.union([textFieldSchema, numberFieldSchema]);
export type ReferenceableField = z.infer<typeof referenceableFieldSchema>;
const fieldsSchema = z.record(fieldSchema);

export const indexSchema = z.object({
	on: z.string().or(z.array(z.string())),
	unique: z.boolean().optional(),
});

const foreignKeysSchema: z.ZodType<{
	fields: MaybeArray<string>;
	references: () => MaybeArray<ReferenceableField>;
}> = z.object({
	fields: z.string().or(z.array(z.string())),
	references: z
		.function()
		.returns(z.lazy(() => referenceableFieldSchema.or(z.array(referenceableFieldSchema)))),
});

export type Indexes = Record<string, z.infer<typeof indexSchema>>;

const baseCollectionSchema = z.object({
	fields: fieldsSchema,
	indexes: z.record(indexSchema).optional(),
	foreignKeys: z.array(foreignKeysSchema).optional(),
	table: z.any(),
	_setMeta: z.function().optional(),
});

export const readableCollectionSchema = baseCollectionSchema.extend({
	writable: z.literal(false),
});

export const writableCollectionSchema = baseCollectionSchema.extend({
	writable: z.literal(true),
});

export const collectionSchema = z.union([readableCollectionSchema, writableCollectionSchema]);
export const collectionsSchema = z.record(collectionSchema);

export type BooleanField = z.infer<typeof booleanFieldSchema>;
export type NumberField = z.infer<typeof numberFieldSchema>;
export type TextField = z.infer<typeof textFieldSchema>;
export type DateField = z.infer<typeof dateFieldSchema>;
// Type `Date` is the config input, `string` is the output for D1 storage
export type DateFieldInput = z.input<typeof dateFieldSchema>;
export type JsonField = z.infer<typeof jsonFieldSchema>;

export type FieldType =
	| BooleanField['type']
	| NumberField['type']
	| TextField['type']
	| DateField['type']
	| JsonField['type'];

export type DBField = z.infer<typeof fieldSchema>;
export type DBFieldInput = DateFieldInput | BooleanField | NumberField | TextField | JsonField;
export type DBFields = z.infer<typeof fieldsSchema>;
export type DBCollection = z.infer<
	typeof readableCollectionSchema | typeof writableCollectionSchema
>;
export type DBCollections = Record<string, DBCollection>;
export type DBSnapshot = {
	schema: Record<string, DBCollection>;
	/**
	 * Snapshot version. Breaking changes to the snapshot format increment this number.
	 * @todo Rename to "version" once closer to release.
	 */
	experimentalVersion: number;
};
export type ReadableDBCollection = z.infer<typeof readableCollectionSchema>;
export type WritableDBCollection = z.infer<typeof writableCollectionSchema>;

export type DBDataContext = {
	db: SqliteDB;
	seed<TFields extends FieldsConfig>(
		collection: ResolvedCollectionConfig<TFields>,
		data: MaybeArray<SQLiteInsertValue<Table<string, TFields>>>
	): Promise<any> /** TODO: type output */;
	mode: 'dev' | 'build';
};

export const dbConfigSchema = z.object({
	studio: z.boolean().optional(),
	collections: collectionsSchema.optional(),
	data: z
		.function()
		.returns(z.union([z.void(), z.promise(z.void())]))
		.optional(),
});

export type DBUserConfig = Omit<z.input<typeof dbConfigSchema>, 'data'> & {
	data(params: DBDataContext): MaybePromise<void>;
};

export const astroConfigWithDbSchema = z.object({
	db: dbConfigSchema.optional(),
});

export type FieldsConfig = z.input<typeof collectionSchema>['fields'];

interface CollectionConfig<TFields extends FieldsConfig = FieldsConfig>
	// use `extends` to ensure types line up with zod,
	// only adding generics for type completions.
	extends Pick<z.input<typeof collectionSchema>, 'fields' | 'indexes' | 'foreignKeys'> {
	fields: TFields;
	foreignKeys?: Array<{
		fields: MaybeArray<Extract<keyof TFields, string>>;
		// TODO: runtime error if parent collection doesn't match for all fields. Can't put a generic here...
		references: () => MaybeArray<ReferenceableField>;
	}>;
	indexes?: Record<string, IndexConfig<TFields>>;
}

interface IndexConfig<TFields extends FieldsConfig> extends z.input<typeof indexSchema> {
	on: MaybeArray<Extract<keyof TFields, string>>;
}

export type ResolvedCollectionConfig<
	TFields extends FieldsConfig = FieldsConfig,
	Writable extends boolean = boolean,
> = CollectionConfig<TFields> & {
	writable: Writable;
	table: Table<string, TFields>;
};

function baseDefineCollection<TFields extends FieldsConfig, TWritable extends boolean>(
	userConfig: CollectionConfig<TFields>,
	writable: TWritable
): ResolvedCollectionConfig<TFields, TWritable> {
	for (const fieldName in userConfig.fields) {
		const field = userConfig.fields[fieldName];
		// Store field name within the field itself to track references
		field.name = fieldName;
	}
	const meta: { table: Table<string, TFields> } = { table: null! };
	/**
	 * We need to attach the Drizzle `table` at runtime using `_setMeta`.
	 * These cannot be determined from `defineCollection()`,
	 * since we don't know the collection name until the `db` config is resolved.
	 */
	const _setMeta = (values: { table: Table<string, TFields> }) => {
		Object.assign(meta, values);

		const tableName = getTableName(meta.table);
		for (const fieldName in userConfig.fields) {
			const field = userConfig.fields[fieldName];
			field.collection = tableName;
		}
	};

	return {
		...userConfig,
		get table() {
			return meta.table;
		},
		writable,
		// @ts-expect-error private setter
		_setMeta,
	};
}

export function defineCollection<TFields extends FieldsConfig>(
	userConfig: CollectionConfig<TFields>
): ResolvedCollectionConfig<TFields, false> {
	return baseDefineCollection(userConfig, false);
}

export function defineWritableCollection<TFields extends FieldsConfig>(
	userConfig: CollectionConfig<TFields>
): ResolvedCollectionConfig<TFields, true> {
	return baseDefineCollection(userConfig, true);
}

export type AstroConfigWithDB = z.infer<typeof astroConfigWithDbSchema>;

type FieldOpts<T extends DBFieldInput> = Omit<T, 'type'>;

export const field = {
	number: <T extends FieldOpts<NumberField>>(opts: T = {} as T) => {
		return { type: 'number', ...opts } satisfies NumberField;
	},
	boolean: <T extends FieldOpts<BooleanField>>(opts: T = {} as T) => {
		return { type: 'boolean', ...opts } satisfies BooleanField;
	},
	text: <T extends FieldOpts<TextField>>(opts: T = {} as T) => {
		return { type: 'text', ...opts } satisfies TextField;
	},
	date<T extends FieldOpts<DateFieldInput>>(opts: T) {
		return { type: 'date', ...opts } satisfies DateFieldInput;
	},
	json<T extends FieldOpts<JsonField>>(opts: T) {
		return { type: 'json', ...opts } satisfies JsonField;
	},
};
