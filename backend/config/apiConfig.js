/**
 * API configuration utilities
 */

/**
 * Get the base URL for the API
 * This handles various environment configurations and provides fallbacks
 * @returns {string} The base URL for the API
 */
function getApiBaseUrl() {
  // Try to use explicitly configured API base URL first
  if (process.env.API_BASE_URL) {
    return process.env.API_BASE_URL;
  }
  
  // Fall back to backend URL if available
  if (process.env.BACKEND_URL) {
    return process.env.BACKEND_URL;
  }
  
  // Construct URL from host and port if available
  const host = process.env.HOST || 'localhost';
  const port = process.env.PORT || 5000;
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  
  return `${protocol}://${host}:${port}`;
}

module.exports = {
  getApiBaseUrl
};
