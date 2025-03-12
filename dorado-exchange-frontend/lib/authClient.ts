import { createAuthClient } from "better-auth/react"
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_AUTH_URL // the base url of your auth server
})

export const getUser = async () => {
  const { data, error } = await authClient.getSession()
  if (data) {
    return data.user;
  } else {
    return error;
  }
}