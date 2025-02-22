import React, {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { ConnectorData, useAccount } from 'wagmi';

export type AuthenticationStatus =
  | 'loading'
  | 'unauthenticated'
  | 'authenticated';

export interface AuthenticationAdapter<Message> {
  getNonce: () => Promise<string>;
  createMessage: (args: {
    nonce: string;
    address: string;
    chainId: number;
  }) => Message;
  getMessageBody: (args: { message: Message }) => string;
  verify: (args: { message: Message; signature: string }) => Promise<boolean>;
  signOut: () => Promise<void>;
}

export interface AuthenticationConfig<Message> {
  adapter: AuthenticationAdapter<Message>;
  status: AuthenticationStatus;
}

// Right now this function only serves to infer the generic Message type
export function createAuthenticationAdapter<Message>(
  adapter: AuthenticationAdapter<Message>,
) {
  return adapter;
}

const AuthenticationContext = createContext<AuthenticationConfig<any> | null>(
  null,
);

interface RainbowKitAuthenticationProviderProps<Message>
  extends AuthenticationConfig<Message> {
  enabled?: boolean;
  children: ReactNode;
}

export function RainbowKitAuthenticationProvider<Message = unknown>({
  adapter,
  children,
  enabled = true,
  status,
}: RainbowKitAuthenticationProviderProps<Message>) {
  // When the wallet is disconnected, we want to tell the auth
  // adapter that the user session is no longer active.
  const { connector } = useAccount({
    onDisconnect: () => {
      adapter.signOut();
    },
  });

  // If the user is authenticated but their wallet is disconnected
  // on page load (e.g. because they disconnected from within their
  // wallet), we immediately sign them out using the auth adapter.
  // This is because our UX is designed to present connection + auth
  // as a single state, so we need to ensure these states are in sync.
  const { isDisconnected } = useAccount();
  const onceRef = useRef(false);
  useEffect(() => {
    if (onceRef.current) return;
    onceRef.current = true;

    if (isDisconnected && status === 'authenticated') {
      adapter.signOut();
    }
  }, [status, adapter, isDisconnected]);

  const handleChangedAccount = ({ account }: ConnectorData) => {
    // Only if account is changed then signOut
    if (account) adapter.signOut();
  };

  // Wait for user authentication before listening to "change" event.
  // Avoid listening immediately after wallet connection due to potential SIWE authentication delay.
  // Ensure to turn off the "change" event listener for cleanup.
  // biome-ignore lint/nursery/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    if (connector && status === 'authenticated') {
      // Attach the event listener when status is 'authenticated'
      connector.on('change', handleChangedAccount);

      // Cleanup function to remove the event listener
      return () => {
        connector?.off('change', handleChangedAccount);
      };
    }
  }, [connector, status]);

  return (
    <AuthenticationContext.Provider
      value={useMemo(
        () => (enabled ? { adapter, status } : null),
        [enabled, adapter, status],
      )}
    >
      {children}
    </AuthenticationContext.Provider>
  );
}

export function useAuthenticationAdapter() {
  const { adapter } = useContext(AuthenticationContext) ?? {};

  if (!adapter) {
    throw new Error('No authentication adapter found');
  }

  return adapter;
}

export function useAuthenticationStatus() {
  const contextValue = useContext(AuthenticationContext);

  return contextValue?.status ?? null;
}
