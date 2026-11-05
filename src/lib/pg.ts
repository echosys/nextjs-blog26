import { Pool } from 'pg';
let pool: Pool | null = null;
function getPool(): Pool {
    if (!pool) {
        if (!process.env.POSTGRES_URL) {
            throw new Error('POSTGRES_URL environment variable is missing.');
        }
        // Default connect timeout is unlimited; fail fast so status checks surface outages.
        pool = new Pool({ connectionString: process.env.POSTGRES_URL, connectionTimeoutMillis: 5000 });
        pool.on('error', (err) => console.error('Unexpected PG error', err));
    }
    return pool;
}
export const pgDb = {
    query: async (text: string, params?: any[]) => {
        return getPool().query(text, params);
    },
};
