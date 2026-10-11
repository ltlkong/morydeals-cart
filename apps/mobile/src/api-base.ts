/** The API root including `/api`; trailing slashes are ignored. */
export const baseUrl = (
  process.env.EXPO_PUBLIC_API_URL || "http://127.0.0.1:3000/api"
).replace(/\/+$/, "");
