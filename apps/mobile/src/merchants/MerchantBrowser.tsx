import type { PageSnapshot } from "@morydeals/capture-contracts/snapshot";
import { Modal, View, Linking } from "react-native";
import {
  AssistantDock,
  Button,
  Copy,
  colors,
  type ChatMessage,
  type DockActivity,
} from "@morydeals/ui";
import type { ReactNode } from "react";
import type { BrowserTarget } from "./MerchantPicker";
import type { MobileProduct } from "../products-api";
export type MerchantBrowserProps = {
  target: BrowserTarget;
  visible: boolean;
  busy: boolean;
  onClose: () => void;
  /** Leaves the store for Cart, keeping its session for the way back. */
  onOpenCart?: () => void;
  /** Opens the product found on the page (the strip's View control). */
  onViewProduct?: (product: MobileProduct) => void;
  /** Why the latest capture failed, once it has finished (undefined while running or after success). */
  failure?: string;
  /** The product the latest capture found, once it has finished successfully. */
  captured?: MobileProduct;
  /**
   * Returns why the capture was refused, or undefined once it is submitted: the page itself when uploads are on, else
   * only its link.
   */
  onCapture: (page: PageSnapshot | { url: string }) => string | undefined;
  /** Whether the server accepts uploaded pages (GET /merchants pageUploads); off, only links are sent. */
  pageUploads?: boolean;
  messages: ChatMessage[];
  onSend: (text: string) => boolean | void;
  leadingAction?: ReactNode;
  leadingActionWidth?: number;
  activity?: DockActivity;
  onDetent?: () => void;
};
// Browsers cannot inspect cross-origin merchant navigation. Native uses WebView.
export function MerchantBrowser({
  target,
  visible,
  onClose,
  messages,
  onSend,
  leadingAction,
  leadingActionWidth,
  activity,
  onDetent,
}: MerchantBrowserProps) {
  return (
    <Modal visible={visible} transparent onRequestClose={onClose}>
      <View style={webStyles.root}>
        <View style={webStyles.content}>
          <Copy weight="extra">Browse {target.name}</Copy>
          <Copy>
            In-app browsing is available on iOS and Android. On web, open the
            store and paste your product link into Mory.
          </Copy>
        </View>
        <AssistantDock
          messages={messages}
          onSend={onSend}
          placeholder="Ask Mory…"
          bottomInset={0}
          leadingAction={leadingAction}
          leadingActionWidth={leadingActionWidth}
          activity={activity}
          onDetent={onDetent}
          actionLine={
            <View style={webStyles.actions}>
              <Button secondary onPress={onClose}>
                Back
              </Button>
              <Button onPress={() => void Linking.openURL(target.url)}>
                Open store
              </Button>
            </View>
          }
        />
      </View>
    </Modal>
  );
}
const webStyles = {
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    padding: 24,
    gap: 20,
  },
  actions: {
    flexDirection: "row" as const,
    gap: 8,
  },
};
