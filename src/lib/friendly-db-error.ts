/** User-facing message for common Prisma / Postgres failures (Vercel + local). */
export function friendlyDbError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('Environment variable not found') && msg.includes('DATABASE_URL')) {
    return 'DATABASE_URL is not set on the server. Add it in Vercel → Settings → Environment Variables.';
  }
  if (
    msg.includes("Can't reach database") ||
    msg.includes('Connection refused') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('timeout') ||
    msg.includes('ECONNREFUSED')
  ) {
    return 'Cannot reach the database. Use your Neon pooled connection string in DATABASE_URL (not localhost).';
  }
  if (
    msg.includes('does not exist') ||
    msg.includes('P2021') ||
    (msg.includes('relation') && msg.includes('does not exist'))
  ) {
    return 'Database tables are missing. On your PC: set DATABASE_URL to your Neon URL, then run npm run db:setup-production';
  }
  return msg;
}
