import {
	type BooleanField,
	type DBFieldInput,
	type DateFieldInput,
	type JsonField,
	type NumberField,
	type TextField,
	type collectionSchema,
	collectionsSchema,
} from './types.js';
import { z } from 'zod';

export const dbConfigSchema = z.object({
	studio: z.boolean().optional(),
	collections: collectionsSchema.optional(),
});

export type DBUserConfig = z.input<typeof dbConfigSchema>;

export const astroConfigWithDbSchema = z.object({
	db: dbConfigSchema.optional(),
});

type CollectionConfig<
	TFields extends z.input<typeof collectionSchema>['fields'],
	Writable extends boolean,
> = Writable extends true
	? {
			fields: TFields;
			// TODO: type inference based on field type. Just `any` for now.
			seed?: Writable extends false
				? never
				: () => Array<Record<keyof TFields, any> & { id?: string }>;
		}
	: {
			fields: TFields;
			// TODO: type inference based on field type. Just `any` for now.
			data?: Writable extends true
				? never
				: () => Array<Record<keyof TFields, any> & { id?: string }>;
		};

type ResolvedCollectionConfig<
	TFields extends z.input<typeof collectionSchema>['fields'],
	Writable extends boolean,
> = CollectionConfig<TFields, Writable> & {
	writable: Writable;
};

export function defineCollection<TFields extends z.input<typeof collectionSchema>['fields']>(
	userConfig: CollectionConfig<TFields, false>
): ResolvedCollectionConfig<TFields, false> {
	return {
		...userConfig,
		writable: false,
	};
}

export function defineWritableCollection<
	TFields extends z.input<typeof collectionSchema>['fields'],
>(userConfig: CollectionConfig<TFields, true>): ResolvedCollectionConfig<TFields, true> {
	return {
		...userConfig,
		writable: true,
	};
}

export type AstroConfigWithDB = z.infer<typeof astroConfigWithDbSchema>;

type FieldOpts<T extends DBFieldInput> = Omit<T, 'type'>;

const baseDefaults = {
	optional: false,
	unique: false,
	label: undefined,
	default: undefined,
};

export const field = {
	number(opts: FieldOpts<NumberField> = {}): NumberField {
		return { type: 'number', ...baseDefaults, ...opts };
	},
	boolean(opts: FieldOpts<BooleanField> = {}): BooleanField {
		return { type: 'boolean', ...baseDefaults, ...opts };
	},
	text(opts: FieldOpts<TextField> = {}): TextField {
		return { type: 'text', multiline: false, ...baseDefaults, ...opts };
	},
	date(opts: FieldOpts<DateFieldInput> = {}): DateFieldInput {
		return { type: 'date', ...baseDefaults, ...opts };
	},
	json(opts: FieldOpts<JsonField> = {}): JsonField {
		return { type: 'json', ...baseDefaults, ...opts };
	},
};