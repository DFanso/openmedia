import { en } from "./locales/en";

/** Every key the app can ask for. The English catalog is the source of truth. */
export type MessageKey = keyof typeof en;

/** A language's messages. Every key of the English catalog must be there. */
export type Messages = Record<MessageKey, string>;
