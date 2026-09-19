/**
 * Purpose: Shared API response envelope types for mock and production APIs
 */

/** API error shape — matches backend error envelope */
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
