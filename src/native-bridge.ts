export type AuthOperation = "login" | "logout" | "restore" | "token";
export type AuthResult = { token?: string; signedIn?: boolean; error?: string; loginRequired?: boolean };
export type NativeBridge = {
  auth(operation: AuthOperation, force?: boolean): Promise<AuthResult>;
  copy(text: string): Promise<void>;
  exit(): Promise<void>;
};
