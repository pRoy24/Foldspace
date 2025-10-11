export interface X402Credentials {
  apiKeyId: string;
  apiKeySecret: string;
}

export interface X402SignerConfig {
  network: string;
  privateKey: string;
}

export interface X402ServiceOptions {
  credentials?: X402Credentials;
  defaultNetwork?: string;
  signer?: Partial<X402SignerConfig>;
}
