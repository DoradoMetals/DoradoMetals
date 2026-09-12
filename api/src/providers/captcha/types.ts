export type CaptchaProvider = {
  verify(token: string, ip: string | null): Promise<boolean>
}
