/** Soft product limits for public MVP. */
export const QUOTA = {
  maxGraphsPerUser: 50,
  maxNodesPerGraph: 500,
  maxEdgesPerGraph: 1_000,
  maxBodyChars: 32_768,
  maxTitleChars: 200,
  maxExportsPerHour: 30,
  maxTokenNameChars: 80,
  maxApiTokensPerUser: 10,
  /** Keep this many manual export objects per graph in R2. */
  maxExportsKeptPerGraph: 5,
  /** Keep this many nightly backups per graph in R2. */
  maxAutoBackupsKeptPerGraph: 7,
  /** Soft-deleted notes, cards and links are purged after this many days. */
  trashRetentionDays: 30,
  /** Trashed notes kept per user; older ones are purged early when exceeded. */
  maxTrashedGraphsPerUser: 50,
  /** Largest number of cards or links one batch request may create. */
  maxBatchItems: 200,
  /** Largest accepted JSON body for a batch: every item at the body limit, plus slack. */
  maxBatchBytes: 200 * 32_768 + 1024 * 1024,
  /** Results returned by one search request. */
  maxSearchHits: 50,
  /** Largest accepted JSON body for regular API calls. */
  maxRequestBytes: 128 * 1024,
  /**
   * Largest accepted JSON body for graph import. Must fit a maximal export
   * (maxNodesPerGraph × maxBodyChars plus JSON overhead) so a user's own
   * backup can always be restored.
   */
  maxImportBytes: 32 * 1024 * 1024,
} as const;

export const RATE_LIMIT = {
  /** Auth-ish routes per IP per minute. */
  authPerMinute: 30,
  /**
   * Any /api request per IP per minute, counted before authentication.
   * Deliberately above readPerMinute so one office NAT with several
   * legitimate users does not trip it before per-user limits apply.
   */
  requestsPerIpPerMinute: 1_800,
  /** Authenticated read requests per user per minute. */
  readPerMinute: 600,
  /** Full-text searches per user per minute; each one scans every card. */
  searchPerMinute: 60,
  /** Mutating API calls per user per minute. */
  writePerMinute: 120,
} as const;
