import axios, { AxiosRequestConfig, Method } from 'axios'

const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

const apiRequest = async <T>(
  method: Method,
  url: string,
  data?: object,
  params?: object,
  headers?: object
): Promise<T> => {
  try {
    const config: AxiosRequestConfig = {
      method,
      url,
      data,
      params,
      headers,
    }

    const response = await axiosInstance(config)
    return response.data
  } catch (error: any) {
    throw error.response?.data || { message: 'Something went wrong' }
  }
}

const pdfRequest = async <T>(
  method: Method,
  url: string,
  data?: object,
  params?: object,
  headers?: object
): Promise<T> => {
  try {
    const config: AxiosRequestConfig = {
      method,
      url,
      data,
      params,
      headers,
      responseType: 'blob', // 👈 only this is needed!
    }

    const response = await axiosInstance(config)
    return response.data
  } catch (error: any) {
    console.error(`API Error: ${error.response?.status || 'Unknown'}`, error)
    throw error.response?.data || { message: 'Something went wrong' }
  }
}

export { axiosInstance, apiRequest, pdfRequest }
