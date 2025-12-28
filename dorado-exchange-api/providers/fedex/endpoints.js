import axios from "axios";

async function fetchOAuthToken({ clientId, clientSecret }) {
  const response = await axios.post(
    process.env.FEDEX_API_URL + "/oauth/token",
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return response.data.access_token;
}

export async function fetchAccessToken() {
  return fetchOAuthToken({
    clientId: process.env.FEDEX_CLIENT_ID,
    clientSecret: process.env.FEDEX_CLIENT_SECRET,
  });
}

export async function fetchTrackingToken() {
  return fetchOAuthToken({
    clientId: process.env.FEDEX_TRACKING_CLIENT_ID,
    clientSecret: process.env.FEDEX_TRACKING_CLIENT_SECRET,
  });
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function fedexPost({ token, path, payload }) {
  const res = await axios.post(process.env.FEDEX_API_URL + path, payload, {
    headers: authHeaders(token),
  });
  return res.data;
}

export async function fedexPut({ token, path, payload }) {
  const res = await axios.put(process.env.FEDEX_API_URL + path, payload, {
    headers: authHeaders(token),
  });
  return res.data;
}
