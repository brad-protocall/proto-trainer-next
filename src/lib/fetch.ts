/**
 * Authenticated fetch wrapper that includes x-user-id header
 */

export type AuthFetchFn = (url: string, options?: RequestInit) => Promise<Response>;

export interface AuthFetchOptions extends RequestInit {
  userId?: string;
}

/**
 * Fetch wrapper that automatically includes authentication headers
 * @param url - The URL to fetch
 * @param options - Fetch options including optional userId
 * @returns Promise<Response>
 */
export async function authFetch(
  url: string,
  options: AuthFetchOptions = {}
): Promise<Response> {
  const { userId, headers: customHeaders, ...rest } = options;

  const headers = new Headers(customHeaders);

  if (userId) {
    headers.set("x-user-id", userId);
  }

  return fetch(url, {
    ...rest,
    headers,
  });
}

/**
 * Create an authenticated fetch function bound to a specific user
 * @param userId - The user ID to include in all requests
 * @returns Fetch function with auth headers pre-configured
 */
export function createAuthFetch(userId: string) {
  return (url: string, options: RequestInit = {}): Promise<Response> => {
    return authFetch(url, { ...options, userId });
  };
}
