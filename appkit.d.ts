import type { JSX as ReactJSX } from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "appkit-button": ReactJSX.IntrinsicElements["div"];
    }
  }
}

export {};
