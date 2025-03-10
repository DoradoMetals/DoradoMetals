import axios, { AxiosRequestConfig, Method } from "axios";

const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL, // Ensure this is set correctly
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Ensures cookies (session auth) are included
});

/**
 * Generic API request function
 * @param {Method} method - HTTP method (GET, POST, PUT, DELETE, etc.)
 * @param {string} url - API endpoint (e.g., "/products")
 * @param {object} [data] - Request body (for POST/PUT)
 * @param {object} [params] - Query parameters (for GET)
 * @param {object} [headers] - Additional headers
 * @returns {Promise<any>} - Returns API response data
 */
const apiRequest = async <T>(
  method: Method,
  url: string,
  data?: object,
  params?: object,
  headers?: object
): Promise<T> => {
  console.log('here')
  try {
    const config: AxiosRequestConfig = {
      method,
      url,
      data,
      params,
      headers,
    };

    const response = await axiosInstance(config);
    return response.data;
  } catch (error: any) {
    console.error(`API Error: ${error.response?.status || "Unknown"}`, error);
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export { axiosInstance, apiRequest };
