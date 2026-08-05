/** Soft product limits for public MVP. */
export const QUOTA = {
  maxGraphsPerUser: 50,
  maxNodesPerGraph: 500,
  maxBodyChars: 32_768,
  maxTitleChars: 200,
  maxExportsPerHour: 30,
  maxTokenNameChars: 80,
  maxApiTokensPerUser: 10,
  /** Keep this many export objects per graph in R2. */
  maxExportsKeptPerGraph: 5,
} as const;

export const RATE_LIMIT = {
  /** Auth-ish routes per IP per minute. */
  authPerMinute: 30,
  /** Authenticated read requests per user per minute. */
  readPerMinute: 600,
  /** Mutating API calls per user per minute. */
  writePerMinute: 120,
} as const;
