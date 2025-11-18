declare module "pg" {
	type SslConfig =
		| boolean
		| {
				rejectUnauthorized?: boolean;
				[key: string]: unknown;
		  };

	interface PoolConfig {
		connectionString?: string;
		ssl?: SslConfig;
		[key: string]: unknown;
	}

	export interface QueryResultRow {
		[column: string]: unknown;
	}

	export interface QueryResult<T extends QueryResultRow = QueryResultRow> {
		rows: T[];
		rowCount: number;
	}

	export interface PoolClient {
		release(): void;
		query<T extends QueryResultRow = QueryResultRow>(
			text: string,
			values?: unknown[],
		): Promise<QueryResult<T>>;
	}

	export class Pool {
		constructor(config?: PoolConfig);
		connect(): Promise<PoolClient>;
		end(): Promise<void>;
		query<T extends QueryResultRow = QueryResultRow>(
			text: string,
			values?: unknown[],
		): Promise<QueryResult<T>>;
	}
}
