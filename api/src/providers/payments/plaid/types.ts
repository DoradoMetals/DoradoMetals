export type PlaidLinkToken = {
  link_token: string
  expiration: string
}

export type PlaidExchange = {
  access_token: string
  item_id: string
}

export type PlaidProcessorToken = {
  processor_token: string
}

export type PlaidFeedTransaction = {
  transaction_id: string
  amount: number
  date: string
  name: string | null
  merchant_name: string | null
  pending: boolean
  account_id: string
}

export type PlaidSync = {
  added: PlaidFeedTransaction[]
  modified: PlaidFeedTransaction[]
  removed: string[]
  next_cursor: string
  has_more: boolean
}

export type PlaidVerificationKey = {
  kty: string
  crv: string
  x: string
  y: string
  kid: string
  alg: string
  use: string
}

export type PlaidData = {
  createLinkToken: (client_user_id: string) => Promise<PlaidLinkToken>
  exchangePublicToken: (public_token: string) => Promise<PlaidExchange>
  createProcessorToken: (access_token: string, account_id: string) => Promise<PlaidProcessorToken>
  syncTransactions: (access_token: string, cursor: string | null) => Promise<PlaidSync>
  verificationKey: (key_id: string) => Promise<PlaidVerificationKey>
}
